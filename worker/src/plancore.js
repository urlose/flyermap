// Route planning service: loads the map data for a start point and plans the routes.
// Runs inside a Web Worker (planworker.js) so the screen never freezes; the same code is the fallback on the main thread.
// The street graph stays here between calls: changing flyers / workers / hours only re-plans, it does not reload the map.
import Planner from '../../admin/planner.js';

export function createPlanService(cache){
  let G = null, gKey = '';
  const tiles = new Map();   // map squares already loaded in this session (kept for nearby start points)
  const keyOf = s => s[0].toFixed(5) + ',' + s[1].toFixed(5);
  const info = () => G ? { radius:G.radius, usable:G.usable, mailboxes:G.mailboxes, street_m:G.street_m } : null;
  const load = async (start, flyers, radius, must, stage, stale, key, zone) => {
    if(tiles.size > 150) tiles.clear();
    G = await Planner.loadForFlyers(start, flyers, { cache, radius, must, zone, tiles, stale,
      progress:(done, total) => { if(stage && total > 1) stage((key || 'loadingArea') + '|' + done + '|' + total); } });
    gKey = keyOf(start);
  };
  // far places of the order (bus / train): own street graph around their centre, planned with the same workers as extra days
  const sideG = new Map();
  const sideGraph = async (c, stage, stale) => {
    const z = c.zone && c.zone.length > 2 ? c.zone : null, k = keyOf([c.lat, c.lng]) + ':' + (z ? 'z' + z.length + ',' + z[0].join(',') : c.flyers); if(sideG.has(k)) return sideG.get(k);
    if(sideG.size > 6) sideG.clear();
    const g = await Planner.loadForFlyers([c.lat, c.lng], c.flyers, { cache, tiles, stale, zone:z, progress:(done, total) => { if(stage && total > 1) stage('loadingSide|' + done + '|' + total); } });
    sideG.set(k, g); return g;
  };
  // ---- far places of the order (bus / train) ----
  // Every far place goes WHOLE to one worker (nobody travels twice); the main place is cut into k equal parts and the parts and
  // far places are shared out so that everyone gets about the same hours (LPT). A worker's work is one line: main parts first,
  // then the far places (first point marked [lat,lng,1] = jump, no street). The days are then cut by time, wherever the hours
  // are full – the next day starts where the walker stopped (starting at an open part of the route is allowed).
  // real road length between the places (one Valhalla matrix request); without answer: straight line × 1.3
  const roadMatrix = async (pts, costing) => {
    try{
      const q = { sources:pts.map(p => ({ lat:p[0], lon:p[1] })), targets:pts.map(p => ({ lat:p[0], lon:p[1] })), costing, units:'kilometers' };
      const ctrl = new AbortController(), tm = setTimeout(() => ctrl.abort(), 9000);
      const r = await fetch('https://valhalla1.openstreetmap.de/sources_to_targets?json=' + encodeURIComponent(JSON.stringify(q)), { signal:ctrl.signal }); clearTimeout(tm);
      if(!r.ok) return null; const j = await r.json(); const m = j.sources_to_targets; if(!Array.isArray(m)) return null;
      return m.map(row => row.map(c => c && c.distance != null ? c.distance * 1000 : null));
    }catch{ return null; }
  };
  const SPEED = { bike:250, car:667 };   // metres per minute: bike ≈ 15 km/h, car ≈ 40 km/h (villages, parking) – plus 5 min per trip
  const TRAVEL_MIN = 30, EMPTY_GAP = 1000, EMPTY_GAP_BIKE = 600;   // with a bike, a shorter empty road is already worth riding   // bus ride counted for packing; > 1 km without mailboxes on the way → bus
  const segLen = (a, b) => { const k = Math.cos(a[0] * Math.PI / 180); return 111320 * Math.hypot(b[0] - a[0], (b[1] - a[1]) * k); };
  // items: { min, far? } → n bins. Far places first, each to a DIFFERENT worker while there are workers left (fair: everybody
  // travels at most once); then the rest largest first into the emptiest bin
  const lpt = (items, n) => {
    const bins = Array.from({ length:n }, () => ({ min:0, items:[], far:0 }));
    const fars = items.filter(x => x.isFar).sort((x, y) => y.min - x.min), rest = items.filter(x => !x.isFar).sort((x, y) => y.min - x.min);
    const put = (it, among) => { const b = among.reduce((m, x) => x.min < m.min ? x : m, among[0]); b.items.push(it); b.min += it.min; if(it.isFar) b.far++; };
    fars.forEach(it => { const free = bins.filter(b => !b.far); put(it, free.length ? free : bins); });
    rest.forEach(it => put(it, bins));
    return bins;
  };
  // one worker's line from its pieces (routes of the planner); pieces: [{ r, name|null }] in walking order
  // breaks (optional): indices of the pieces that start a new day (workers travelling together cut their days at the same place)
  const buildLine = (pieces, hours, rideMin, breaks) => {
    const path = [], steps = [], boxes = [], segMin = [], segMb = [], segSt = [], place = [], cutAt = new Set();
    let length_m = 0, street_m = 0, minutes = 0, mailboxes = 0;
    for(const [pi, { r, name }] of pieces.entries()){
      const L = path.length, jump = !!name && L > 0;
      if(breaks && breaks.has(pi) && L > 0) cutAt.add(L);
      const tot = r.path.slice(1).reduce((s, q, j) => s + segLen(r.path[j], q), 0) || 1;
      r.path.forEach((q, j) => {   // a jump costs the ride: bike ≈ 15 km/h + 5 min, bus 30 min
        path.push(j === 0 && jump ? [q[0], q[1], 1] : [q[0], q[1]]);
        const d = j ? segLen(r.path[j - 1], q) : 0;
        segMin.push(j === 0 ? (jump ? (rideMin ? rideMin(path[L - 1], q) : TRAVEL_MIN) : 0) : r.minutes * d / tot); segMb.push(j ? (r.mailboxes || 0) * d / tot : 0); segSt.push(j ? (r.street_m || 0) * d / tot : 0); place.push(name || '');
      });
      (r.steps || []).forEach(st => steps.push([st[0] + L, st[1], st[2]])); (r.boxes || []).forEach(x => boxes.push(x));
      length_m += r.length_m || 0; street_m += r.street_m || 0; minutes += r.minutes || 0; mailboxes += r.mailboxes || 0;
    }
    // days: cut where the hours of a day are full; a last bit under 45 min goes to the day before
    const lim = hours * 60, days = []; let i0 = 0, t = 0, mb = 0, st = 0, ln = 0, pl = new Set();
    const close = i1 => { days.push({ i0, i1, minutes:Math.round(t), mailboxes:Math.round(mb), street_m:Math.round(st), length_m:Math.round(ln), place:[...pl].filter(Boolean).join(' + ') || undefined }); i0 = i1; t = 0; mb = 0; st = 0; ln = 0; pl = new Set(); };
    for(let i = 1; i < path.length; i++){
      if(breaks ? cutAt.has(i) && t > 0 : t >= lim && t > 0) close(i - 1);
      t += segMin[i]; mb += segMb[i]; st += segSt[i]; ln += path[i][2] === 1 ? 0 : segLen(path[i - 1], path[i]); pl.add(place[i]);
    }
    if(t > 0 || !days.length) close(path.length - 1);
    if(!breaks && days.length > 1 && days[days.length - 1].minutes < 45){ const x = days.pop(), y = days[days.length - 1]; y.i1 = x.i1; ['minutes', 'mailboxes', 'street_m', 'length_m'].forEach(k => y[k] += x[k]); if(x.place) y.place = [...new Set([...(y.place || '').split(' + '), ...x.place.split(' + ')].filter(Boolean))].join(' + '); }
    return { path, steps, boxes, days, length_m, street_m, minutes, mailboxes };
  };
  // ---- dense cores (Ortskerne) ----
  // Streets with many mailboxes per km, joined by short links, form a core; hamlets, scattered houses and the roads between
  // villages drop out. Each core is walked on foot from one parking point, between cores everybody drives.
  const CORE_T = 25, CORE_MIN = 40, CORE_PARK = 8;   // mailboxes per km of street, smallest core, minutes to park per core
  const denseCores = (g, area) => {
    const n = g.pts.length, uf = Int32Array.from({ length:n }, (_, i) => i), f = x => { while(uf[x] !== x){ uf[x] = uf[uf[x]]; x = uf[x]; } return x; };
    const dense = e => e.mb > 0 && (e.len <= 80 || e.mb * 1000 / e.len >= CORE_T), dn = new Uint8Array(n);
    g.edges.forEach(e => { if(dense(e)){ uf[f(e.a)] = f(e.b); dn[e.a] = 1; dn[e.b] = 1; } });
    const link = e => !dense(e) && e.len <= 60 && dn[e.a] && dn[e.b];   // a short piece between two dense streets joins them
    g.edges.forEach(e => { if(link(e)) uf[f(e.a)] = f(e.b); });
    const cl = new Map();
    g.edges.forEach((e, i) => { if(!dense(e) && !link(e)) return; const k = f(e.a); let c = cl.get(k); if(!c) cl.set(k, c = { area, ids:[], mb:0, len:0 }); c.ids.push(i); c.mb += e.mb; c.len += e.len; });
    return [...cl.values()].filter(c => c.mb >= CORE_MIN).map(c => {
      let la = 0, lo = 0, w = 0; for(const i of c.ids){ const e = g.edges[i]; la += (g.pts[e.a][0] + g.pts[e.b][0]) / 2 * e.len; lo += (g.pts[e.a][1] + g.pts[e.b][1]) / 2 * e.len; w += e.len; }
      const ctr = [la / w, lo / w]; let best = -1, bd = Infinity;   // parking point: the junction of the core nearest to its middle
      for(const i of c.ids) for(const v of [g.edges[i].a, g.edges[i].b]){ const d = segLen(ctr, g.pts[v]); if(d < bd){ bd = d; best = v; } }
      return { ...c, g, park:[g.pts[best][0], g.pts[best][1]] };
    });
  };
  const subGraph = (g, ids) => {
    const edges = ids.map(i => g.edges[i]), adj = g.pts.map(() => []);
    edges.forEach((e, i) => { adj[e.a].push({ e:i, to:e.b }); if(e.a !== e.b) adj[e.b].push({ e:i, to:e.a }); });
    return { pts:g.pts, edges, adj, zoned:true };
  };
  // economical amount: the area is grown in steps from 80 % to 100 % of the flyers. The largest step is kept whose extra streets
  // (counted together from 80 %) cost at most ECO_K times the minutes per mailbox of the dense core – far, thin streets at the end
  // are left out, so the plan may hand out fewer flyers (e.g. 9 000 of 10 000) for clearly fewer hours. "Exactly N" switches it off.
  const ECO_K = 1.35;
  const ecoFlyers = (start, F, must, zone) => {
    const pts = [0.8, 0.85, 0.9, 0.95, 1].map(f => {
      const sel = Planner.selectWithMust(G, start, Math.round(F * f), must, zone);
      const len = sel.ids.reduce((a, i) => a + G.edges[i].len, 0);
      return { mb:sel.mailboxes, min:Planner.routeMinutes(len * 1.35, sel.mailboxes) };
    });
    const base = pts[0].min / Math.max(1, pts[0].mb); let best = pts[0];
    for(let i = 1; i < pts.length; i++){ const dm = pts[i].mb - pts[0].mb; if(dm <= 0 || (pts[i].min - pts[0].min) / dm <= ECO_K * base) best = pts[i]; }
    return best.mb >= 0.97 * F ? F : Math.max(100, Math.round(best.mb / 50) * 50);   // nearly all: keep the exact number
  };
  return {
    // map data around a new start point
    async load({ start, flyers, must, zone }, stage, stale){
      if(G && gKey === keyOf(start)) return info();
      stage('loadingArea');
      G = null; gKey = '';
      await load(start, flyers, undefined, must, stage, stale, 'loadingArea', zone);
      return info();
    },
    // plans the routes; loads a larger square first when the plan reaches the edge of what is loaded
    async plan({ start, flyers, n, days, hours, must, zone, side, quota, bike, travel, split, exact, mainAll, cores, together, first }, stage, stale){
      const eco = !exact && !mainAll;
      if(cores) return this.planCores({ start, flyers, n, hours, must, zone, side, travel, together, exact, first }, stage, stale);
      travel = travel === 'bike' || travel === 'car' ? travel : (bike ? 'bike' : 'bus'); bike = travel !== 'bus';
      Planner.setPace(quota);   // hours from the order's quota (metres per 30 minutes)
      side = (side || []).filter(c => c && (c.flyers > 0 || split === 'even'));   // even split: a place added without a number gets its share below
      // a near Nebenstadt is walked only when there are mailboxes on the way; an empty road to it (> EMPTY_GAP) → bus, like a far place
      const bus = [];
      if((must || []).some(a => a && a.name && a.p && a.p.length > 2)){
        if(!G || gKey !== keyOf(start)){ stage('loadingArea'); await load(start, flyers, undefined, must, stage, stale, 'loadingArea', zone); }
        if(stale()) return { skipped:true };
        const mr = Math.min(Planner.MUST_MAX_R, Planner.mustRadius(start, must));
        if(mr > G.radius){ stage('loadingMore'); await load(start, flyers, mr, must, stage, stale, 'loadingMore', zone); if(stale()) return { skipped:true }; }
        const keepMust = [];
        for(const a of must){
          const gap = a && a.name && a.p && a.p.length > 2 ? Planner.emptyGap(G, start, a.p) : 0;
          if(gap > (bike ? EMPTY_GAP_BIKE : EMPTY_GAP)){
            const ctr = a.c || a.p.reduce((x, q) => [x[0] + q[0] / a.p.length, x[1] + q[1] / a.p.length], [0, 0]);   // town centre when known
            side.push({ name:a.name, lat:ctr[0], lng:ctr[1], flyers:a.n || 1000, zone:a.p, all:!!a.all }); bus.push({ name:a.name, gap });
          }else keepMust.push(a);
        }
        must = keepMust;
      }
      // new orders (split 'even'): the flyers of the order are shared out evenly over the main town and all Nebenstädte;
      // a place with fewer mailboxes than its share gets what it has, the rest goes to the others. Old orders: unchanged.
      let splitInfo = null;
      if(split === 'even' && ((must || []).some(a => a && a.name) || side.length)){
        if(!G || gKey !== keyOf(start)){ stage('loadingArea'); await load(start, flyers, undefined, must, stage, stale, 'loadingArea', zone); }
        if(stale()) return { skipped:true };
        const near = (must || []).filter(a => a && a.name && a.p && a.p.length > 2);
        const capNear = near.map(a => Planner.mustPick(G, start, [{ p:a.p, n:0 }]).info[0].avail);
        const capFar = [];
        for(const c of side){
          stage('loadingSide'); c.flyers = c.flyers || flyers; const g = await sideGraph(c, stage, stale); if(stale()) return { skipped:true };
          capFar.push(c.zone && c.zone.length > 2 ? Planner.mustPick(g, [c.lat, c.lng], [{ p:c.zone, n:0 }]).info[0].avail : (g.usable != null ? g.usable : g.mailboxes) || 0);
        }
        const capMain = Math.max(0, (G.usable != null ? G.usable : G.mailboxes) - capNear.reduce((a, b) => a + b, 0));
        const caps = [capMain, ...capNear, ...capFar], share = new Array(caps.length).fill(0);
        // a place marked "all mailboxes" gets exactly what it has; the rest of the flyers is shared out over the others
        const fixed = new Set([mainAll ? 0 : -1, ...near.map((a, i) => a.all ? 1 + i : -1), ...side.map((c, i) => c.all ? 1 + near.length + i : -1)].filter(i => i >= 0));
        let rest = flyers; fixed.forEach(i => { share[i] = caps[i]; rest -= caps[i]; }); rest = Math.max(0, rest);
        let open = caps.map((_, i) => i).filter(i => !fixed.has(i));
        while(rest > 0 && open.length){   // water filling: equal shares, capped by what a place has
          const each = rest / open.length, full = open.filter(i => caps[i] - share[i] <= each);
          if(!full.length){ open.forEach(i => { share[i] += each; }); rest = 0; break; }
          full.forEach(i => { rest -= caps[i] - share[i]; share[i] = caps[i]; }); open = open.filter(i => !full.includes(i));
        }
        const r50 = x => Math.max(0, Math.round(x / 50) * 50);
        const shr = i => fixed.has(i) ? Math.round(share[i]) : r50(share[i]);
        near.forEach((a, i) => { a.n = a.all ? 0 : Math.max(50, shr(1 + i)); });   // 0 = every mailbox in the area
        side.forEach((c, i) => { c.flyers = shr(1 + near.length + i); });
        splitInfo = [{ name:null, flyers:r50(share[0]), cap:Math.round(capMain) }, ...near.map((a, i) => ({ name:a.name, flyers:shr(1 + i), cap:Math.round(capNear[i]), all:!!a.all })), ...side.map((c, i) => ({ name:c.name, flyers:c.flyers, cap:Math.round(capFar[i]), all:!!c.all }))];
        side = side.filter(c => c.flyers > 0);
      }
      if(side.length){
        const res = await this.planSide({ start, flyers, n, days, hours, must, zone, side, bike, travel, eco, mainAll, mainShare:splitInfo ? splitInfo[0].flyers : null }, stage, stale);
        if(res && res.plan){ res.plan.bus = bus; res.plan.split = splitInfo; }
        return res;
      }
      const resM = await this.planMain({ start, flyers, n, days, hours, must, zone, eco, mainAll }, stage, stale);
      if(resM && resM.plan) resM.plan.split = splitInfo;
      return resM;
    },
    // only the dense cores of the main area and of every place; cores are taken best first (mailboxes per hour incl. parking)
    // until the flyers are reached; one tour by car through all of them. together: everybody in one car – every core is shared
    // out among the workers, everybody visits the cores in the same order and the days end at the same core for all.
    async planCores({ start, flyers, n, hours, must, zone, side, travel, together, exact, first }, stage, stale){
      if(!G || gKey !== keyOf(start)){ stage('loadingArea'); await load(start, flyers, undefined, must, stage, stale, 'loadingArea', zone); }
      if(stale()) return { skipped:true };
      const hasZone = !!(zone && zone.length > 2);
      // the main town (own drawn area): every street with mailboxes is walked – it is the order's main place; only the rest
      // of the flyers goes to the best cores of the other places
      let all;
      if(hasZone){
        const gz = Planner.zoneView(G, zone), ids = Planner.selectWithMust(G, start, 1e9, must, zone).ids;
        const mb = ids.reduce((a, i) => a + gz.edges[i].mb, 0), len = ids.reduce((a, i) => a + gz.edges[i].len, 0);
        all = ids.length ? [{ area:null, g:gz, ids, mb, len, park:start, forced:true }] : [];
      }else all = denseCores(G, null);
      for(const c of (side || [])){
        stage('loadingSide'); const g = await sideGraph({ ...c, flyers:c.flyers || 3000 }, stage, stale); if(stale()) return { skipped:true };
        const z = c.zone && c.zone.length > 2 ? c.zone : null;
        all = all.concat(denseCores(z ? Planner.zoneView(g, z) : g, c.name));
      }
      if(!all.length) return { plan:{ routes:[], mailboxes:0, zone:[], cores:[] }, sug:n };
      stage('calculating');
      const K = together ? n : 1;
      // a big core (a whole town) is cut into pieces of at most ~1.5 hours per person, each with its own parking point,
      // so nobody walks a long way out from one car park; pieces of the same town stay neighbours in the tour
      const MAXSPAN = Math.min(90, hours * 60 * 0.25), parkOf = (g, ids) => {
        let la = 0, lo = 0, w = 0; for(const i of ids){ const e = g.edges[i]; la += (g.pts[e.a][0] + g.pts[e.b][0]) / 2 * e.len; lo += (g.pts[e.a][1] + g.pts[e.b][1]) / 2 * e.len; w += e.len; }
        const ctr = [la / w, lo / w]; let best = -1, bd = Infinity; for(const i of ids) for(const v of [g.edges[i].a, g.edges[i].b]){ const d = segLen(ctr, g.pts[v]); if(d < bd){ bd = d; best = v; } }
        return [g.pts[best][0], g.pts[best][1]];
      };
      const pieces = [];
      for(const c of all){
        const m = Math.ceil(Planner.routeMinutes(c.len * 1.35, c.mb) / K / MAXSPAN);
        if(m <= 1){ if(c.forced) c.park = parkOf(c.g, c.ids); pieces.push(c); continue; }
        const pp = Planner.planFlyers(subGraph(c.g, c.ids), c.park, 1e9, m, { days:1, hoursPerDay:99 });
        for(const r of pp.routes){ const ids = (r.part || []).map(i => c.ids[i]); if(!ids.length) continue; const mb = ids.reduce((a, i) => a + c.g.edges[i].mb, 0); if(mb < 10) continue;
          pieces.push({ area:c.area, g:c.g, ids, mb, len:ids.reduce((a, i) => a + c.g.edges[i].len, 0), park:parkOf(c.g, ids), forced:c.forced }); }
        if(stale()) return { skipped:true };
      }
      all = pieces;
      for(const c of all){
        const p = Planner.planFlyers(subGraph(c.g, c.ids), c.park, 1e9, Math.max(1, Math.min(K, Math.floor(c.mb / 30))), { days:1, hoursPerDay:99 });
        c.routes = p.routes.map(({ part, ...r }) => r); c.mb = p.mailboxes;
        c.work = c.routes.reduce((a, r) => a + r.minutes, 0); c.span = Math.max(...c.routes.map(r => r.minutes));
        c.score = c.mb / (c.work + CORE_PARK * c.routes.length);
        if(stale()) return { skipped:true };
      }
      // best first until the flyers are reached (exact: also the next best ones until the number is covered)
      all.sort((a, b) => (b.forced ? 1 : 0) - (a.forced ? 1 : 0) || b.score - a.score);
      const chosen = all.filter(c => c.forced); let sum = chosen.reduce((a, c) => a + c.mb, 0);
      // places that already carry a number of flyers (a saved order) get at most that many; the main town the rest
      const capOf = {}; let capSum = 0;
      for(const c of (side || [])) if(c.flyers > 0){ capOf[c.name] = c.flyers; capSum += c.flyers; }
      if(capSum && capSum < flyers) capOf[''] = flyers - capSum;
      const got = {}; chosen.forEach(c => { const k = c.area || ''; got[k] = (got[k] || 0) + c.mb; });
      for(const c of all){ if(c.forced) continue; if(sum >= flyers) break;
        const k = c.area || ''; if(capSum && capOf[k] != null && (got[k] || 0) + c.mb > capOf[k] * 1.1 + 30) continue;
        got[k] = (got[k] || 0) + c.mb; if(!exact && sum >= 0.8 * flyers && c.score < 0.55 * sum / chosen.reduce((a, x) => a + x.work + CORE_PARK * x.routes.length, 0)) break; chosen.push(c); sum += c.mb; }
      // names: "Speichersdorf 2" when a place has several cores; the main area keeps its streets' name
      const cnt = {}; chosen.forEach(c => { const k = c.area || ''; cnt[k] = (cnt[k] || 0) + 1; }); const seen = {};
      chosen.forEach(c => { const k = c.area || ''; seen[k] = (seen[k] || 0) + 1; c.name = (c.area || t0(c)) + (cnt[k] > 1 ? ' ' + seen[k] : ''); });
      function t0(c){ const r = c.routes[0], st = (r.steps || []).find(x => x[2]); return st ? st[2] : 'Kern'; }
      // tour by car from the start: nearest next, then untangled (2-opt)
      // first: the tour begins in this place (its core nearest to the start), the rest follows from there
      let tour = [], left = chosen.slice(), at = start, origin = start;
      const firstCores = first ? left.filter(c => (c.area || '') === first) : [];
      if(firstCores.length){ const f0 = firstCores.reduce((b, c) => segLen(start, c.park) < segLen(start, b.park) ? c : b); left.splice(left.indexOf(f0), 1); tour.push(f0); at = f0.park; }
      while(left.length){ let bi = 0; left.forEach((x, i) => { if(segLen(at, x.park) < segLen(at, left[bi].park)) bi = i; }); const x = left.splice(bi, 1)[0]; tour.push(x); at = x.park; }
      const tl = tr => tr.reduce((a, x, i) => a + segLen(i ? tr[i - 1].park : origin, x.park), 0), i0 = firstCores.length ? 1 : 0;
      for(let improved = true, guard = 0; improved && guard < 60; guard++){ improved = false;
        for(let i = i0; i < tour.length - 1; i++) for(let j = i + 1; j < tour.length; j++){ const c2 = [...tour.slice(0, i), ...tour.slice(i, j + 1).reverse(), ...tour.slice(j + 1)]; if(tl(c2) < tl(tour) - 1){ tour = c2; improved = true; } } }
      let mat = null; const mPts = [start, ...tour.map(x => x.park)];
      if(travel !== 'bus' && mPts.length <= 50){ stage('loadingSide'); mat = await roadMatrix(mPts, travel === 'car' ? 'auto' : 'bicycle'); if(stale()) return { skipped:true }; }
      const ride = (a, b) => { if(travel === 'bus') return TRAVEL_MIN; const i = mPts.findIndex(q => q === a || (q[0] === a[0] && q[1] === a[1])), j = mPts.findIndex(q => q === b || (q[0] === b[0] && q[1] === b[1])); const road = mat && i >= 0 && j >= 0 && mat[i][j] != null ? mat[i][j] : segLen(a, b) * 1.3; return 5 + road / SPEED[travel === 'car' ? 'car' : 'bike']; };
      let routes;
      if(together){
        // the car leaves a core when the slowest has finished; a new day starts before the core that does not fit any more
        const breaks = new Set(); let tday = 0;
        tour.forEach((c, k) => { const add = (k ? ride(tour[k - 1].park, c.park) : 0) + c.span; if(k && tday + add > hours * 60 + 20){ breaks.add(k); tday = c.span; } else tday += add; });
        routes = Array.from({ length:n }, (_, w) => buildLine(tour.filter(c => c.routes[w]).map(c => ({ r:c.routes[w], name:c.name })), hours, (a, b) => ride(a, b), new Set([...breaks].map(k => tour.slice(0, k).filter(c => c.routes[w]).length)))).map((r, i) => ({ idx:i, ...r }));
        // a small core done by one person only: the other waits – the days still end at the same core for everybody
      }else{
        const vill = []; { let prev = start; tour.forEach(x => { vill.push({ min:x.work + ride(prev, x.park), x }); prev = x.park; }); }
        const P2 = [0]; vill.forEach(v => P2.push(P2[P2.length - 1] + v.min)); const parts = []; let from = 0;
        for(let w = 0; w < n; w++){ const goal = P2[P2.length - 1] * (w + 1) / n; let to = from; while(to < vill.length && (w === n - 1 || P2[to + 1] - vill[to].min / 2 <= goal)) to++; parts.push(vill.slice(from, to)); from = to; }
        routes = parts.filter(p => p.length).map((p, i) => ({ idx:i, ...buildLine(p.map(v => ({ r:v.x.routes[0], name:v.x.name })), hours, (a, b) => ride(a, b)) }));
      }
      const plan = { routes, mailboxes:Math.round(sum), zone:[], cores:tour.map(c => ({ name:c.name, mb:Math.round(c.mb), c:c.park, min:Math.round(c.span) })), road_km:!!mat, side_info:[], side_failed:[], must_mb:0, must_info:[] };
      plan.capacity = Planner.capacity(routes, flyers);
      if(!exact && sum < flyers) plan.eco = { asked:flyers, used:Math.round(sum) };
      return { plan, sug:n, street_m:Math.round(chosen.reduce((a, c) => a + c.len, 0)) };
    },
    async planSide({ start, flyers, n, days, hours, must, zone, side, bike, travel, eco, mainAll, mainShare }, stage, stale){

        // each far place as one whole route (one worker)
        const far = [], failed = [];
        for(const c of side){
          stage('loadingSide'); const g = await sideGraph(c, stage, stale); if(stale()) return { skipped:true };
          // begin on the side towards the main town where there are enough mailboxes (not in the middle of the place)
          const z = c.zone && c.zone.length > 2 ? c.zone : null, st = Planner.denseEntry(g, start, z, Math.min(300, Math.max(100, c.flyers * 0.2))) || [c.lat, c.lng];
          const p = Planner.planFlyers(g, st, c.flyers, 1, { days:1, hoursPerDay:hours, zone:z });   // inside its borders (named place or drawn)
          const r0 = p && p.routes && p.routes[0];
          if(!r0 || !r0.path || r0.path.length < 2){ failed.push(c.name); continue; }   // no street with mailboxes inside its border: skip, tell the admin
          const { part, ...r } = r0; far.push({ c, r, min:r.minutes, mb:p.mailboxes });
        }
        let mainFlyers = Math.max(100, flyers - far.reduce((s, x) => s + x.c.flyers, 0));
        if(!far.length){ const r1 = await this.planMain({ start, flyers, n, days, hours, must, zone, eco, mainAll }, stage, stale); if(r1 && r1.plan) r1.plan.side_failed = failed; return r1; }
        // economical: the main town's share is cut to what is worth walking (once, then fixed for the variants below)
        let mainEco = null;
        if(eco && !(zone && zone.length > 2)){ if(!G || gKey !== keyOf(start)){ stage('loadingArea'); await load(start, mainFlyers, undefined, must, stage, stale, 'loadingArea', zone); } const ef = ecoFlyers(start, mainFlyers, must, zone); if(ef < mainFlyers){ mainEco = { asked:mainFlyers, used:ef }; mainFlyers = ef; } }
        // main place: first with n parts; then the number of equal parts that shares the hours best together with the far places
        let res = await this.planMain({ start, flyers:mainFlyers, n, days:1, hours, must, zone, mainAll }, stage, stale);
        if(!res || res.skipped) return res;
        const M = res.plan.routes.reduce((s, r) => s + r.minutes, 0);
        // 1) one tour through all far places from the start (like a navigation app): nearest next, then untangled (2-opt)
        const ent = x => x.r.path[0], ext = x => x.r.path[x.r.path.length - 1];
        let tour = [], left = [...far], at = start;
        while(left.length){ let bi = 0; left.forEach((x, i) => { if(segLen(at, ent(x)) < segLen(at, ent(left[bi]))) bi = i; }); const x = left.splice(bi, 1)[0]; tour.push(x); at = ext(x); }
        const tourLen = tr => tr.reduce((s, x, i) => s + segLen(i ? ext(tr[i - 1]) : start, ent(x)), 0);
        for(let improved = true, guard = 0; improved && guard < 50; guard++){
          improved = false;
          for(let i = 0; i < tour.length - 1; i++) for(let j = i + 1; j < tour.length; j++){
            const cand = [...tour.slice(0, i), ...tour.slice(i, j + 1).reverse(), ...tour.slice(j + 1)];
            if(tourLen(cand) < tourLen(tour) - 1){ tour = cand; improved = true; }
          }
        }
        // 2) the line [main parts …, far places in tour order] is cut into n pieces that follow each other (every worker gets
        //    neighbouring places, no crossing), as even in hours as possible (minimise the longest); the ride to a place counts
        // ride time: bus 30 min per trip; bike / car: road length (matrix) at their speed + 5 min
        let mat = null; const mPts = [start, ...far.map(x => ent(x))], idx = p => mPts.findIndex(q => Math.abs(q[0] - p[0]) < 1e-7 && Math.abs(q[1] - p[1]) < 1e-7);
        if(travel !== 'bus' && far.length){ stage('loadingSide'); mat = await roadMatrix(mPts, travel === 'car' ? 'auto' : 'bicycle'); if(stale()) return { skipped:true }; }
        const ride = (a, b) => { if(travel === 'bus') return TRAVEL_MIN; const i = idx(a), j = idx(b), road = mat && i >= 0 && j >= 0 && mat[i][j] != null ? mat[i][j] : segLen(a, b) * 1.3; return 5 + road / SPEED[travel]; };
        const vill = []; { let prev = start; tour.forEach(x => { vill.push({ min:x.min + ride(prev, ent(x)), far:x }); prev = ext(x); }); }
        const cut = (items, n) => {   // contiguous partition minimising the largest sum (small n · m², fine here)
          const m = items.length, P = [0]; items.forEach(x => P.push(P[P.length - 1] + x.min));
          const k = Math.min(n, m); if(!k) return Array.from({ length:n }, () => []);
          const dp = Array.from({ length:k + 1 }, () => new Array(m + 1).fill(Infinity)), at2 = Array.from({ length:k + 1 }, () => new Array(m + 1).fill(0));
          dp[0][0] = 0;
          for(let j = 1; j <= k; j++) for(let i = j; i <= m; i++) for(let p = j - 1; p < i; p++){ const v = Math.max(dp[j - 1][p], P[i] - P[p]); if(v < dp[j][i]){ dp[j][i] = v; at2[j][i] = p; } }
          const parts = []; let i = m; for(let j = k; j >= 1; j--){ const p = at2[j][i]; parts.unshift(items.slice(p, i)); i = p; }
          while(parts.length < n) parts.push([]);
          return parts;
        };
        // villages: neighbouring ones together; the main town is then shared out so that everyone gets about the same hours
        const vparts = cut(vill, n);
        const share = mains => { const bins = vparts.map(p => ({ min:p.reduce((s, x) => s + x.min, 0), mains:[], vill:p })); [...mains].sort((x, y) => y.minutes - x.minutes).forEach(r => { const b = bins.reduce((m, x) => x.min < m.min ? x : m, bins[0]); b.mains.push(r); b.min += r.minutes; }); return bins; };
        let bestK = n, bestMax = Infinity;
        for(let k = n; k <= 3 * n; k++){ const mx = Math.max(...share(Array.from({ length:k }, () => ({ minutes:M / k }))).map(b => b.min)); if(mx < bestMax - 15){ bestMax = mx; bestK = k; } }
        if(bestK !== n){ stage('calculating'); const r2 = await this.planMain({ start, flyers:mainFlyers, n:bestK, days:1, hours, must, zone, mainAll }, stage, stale); if(!r2 || r2.skipped) return r2; res = r2; }
        if(mainEco) res.plan.eco = mainEco;
        const bins = share(res.plan.routes).filter(b => b.mains.length || b.vill.length).map(b => ({ ...b, items:b.vill }));
        res.plan.routes = bins.map((b, k) => ({ idx:k, ...buildLine([...b.mains.map(r => ({ r, name:null })), ...b.vill.map(x => ({ r:x.far.r, name:x.far.c.name }))], hours, ride) }));
        res.plan.road_km = mat ? true : false;
        res.plan.mailboxes += far.reduce((s, x) => s + x.mb, 0);
        res.plan.side_failed = failed;
        res.plan.side_info = far.map(x => ({ name:x.c.name, mailboxes:x.mb, worker:bins.findIndex(b => b.items.some(i => i.far === x)) }));
        res.plan.capacity = Planner.capacity(res.plan.routes, flyers);
        res.sug = Math.min(20, Planner.suggestWorkers(res.plan.routes.reduce((s, r) => s + r.minutes, 0), hours, days));
        return res;
    },
    async planMain({ start, flyers, n, days, hours, must, zone, eco, mainAll }, stage, stale){
      if(!G || gKey !== keyOf(start)){ stage('loadingArea'); await load(start, flyers, undefined, must, stage, stale, 'loadingArea', zone); }
      if(stale()) return { skipped:true };
      // a mandatory area outside the loaded square: load a larger square first
      const hasZone = !!(zone && zone.length > 2);
      const mr = Math.min(Planner.MUST_MAX_R, Math.max(Planner.mustRadius(start, must), hasZone ? Planner.mustRadius(start, [zone]) : 0));
      if(mr > G.radius){ stage('loadingMore'); await load(start, flyers, mr, must, stage, stale, 'loadingMore', zone); if(stale()) return { skipped:true }; }
      const reach = Planner.selectWithMust(G, start, flyers, must, zone).reach_m; G.reach = reach;   // loaded square must stay clearly larger than what we walk
      if(!hasZone && ((G.usable != null ? G.usable : G.mailboxes) < flyers * 1.05 || reach > 0.65 * G.radius) && G.radius < Planner.MAX_R){
        stage('loadingMore');
        const keep = G; try{ await load(start, flyers, Planner.nextRadius(G, flyers), must, stage, stale, 'loadingMore', zone); }catch(e){ G = keep; gKey = keyOf(start); /* keep the smaller area */ }
        if(stale()) return { skipped:true };
      }
      stage('calculating');
      // whole town: every mailbox inside its border; economical: only what is worth walking (see ecoFlyers)
      let ecoInfo = null;
      if(mainAll && hasZone) flyers = Math.max(100, Planner.selectWithMust(G, start, 1e9, must, zone).mailboxes);
      else if(eco && !hasZone){ const ef = ecoFlyers(start, flyers, must, zone); if(ef < flyers){ ecoInfo = { asked:flyers, used:ef }; flyers = ef; } }
      const sel = Planner.selectWithMust(G, start, flyers, must, zone);
      const sug = Math.min(20, Planner.suggestWorkers(Planner.routeMinutes(sel.ids.reduce((s, i) => s + G.edges[i].len, 0) * 1.35, sel.mailboxes), hours, days));
      if(stale()) return { skipped:true };
      const plan = Planner.planFlyers(G, start, flyers, n, { days, hoursPerDay:hours, must, zone });
      plan.routes = plan.routes.map(({ part, ...r }) => r);   // street ids are only needed inside the planner
      if(ecoInfo) plan.eco = ecoInfo;
      return { plan, sug, street_m:G.street_m };
    },
  };
}
