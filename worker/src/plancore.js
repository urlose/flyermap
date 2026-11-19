// Route planning service: loads the map data for a start point and plans the routes.
// Runs inside a Web Worker (planworker.js) so the screen never freezes; the same code is the fallback on the main thread.
// The street graph stays here between calls: changing flyers / workers / hours only re-plans, it does not reload the map.
import Planner from '../../admin/planner.js';
import { outwardStreetOrder, streetGeometryKey } from './nearfirst.js';
import { radiusKm, insideCircle, circlePolygon, clipDeliveryGraph } from './circlearea.js';
import { capPlan, clipToKeep, droppedStreets, plannedBoxes, boxKey } from './flyercap.js';
import { censusSource, placeMask, censusPlaces, cellOf } from './zensus.js';
import { carRides, estimate, bestOrder, villageName, placeNames } from './carroute.js';
import * as carroute from './carroute.js';
const census = censusSource();   // Zensus 2022 lifts the mailbox estimate where our own rules count too few (old town centres)

export function createPlanService(cache){
  let G = null, gKey = '';
  const tiles = new Map();   // map squares already loaded in this session (kept for nearby start points)
  const keyOf = s => s[0].toFixed(5) + ',' + s[1].toFixed(5);
  const info = () => G ? { radius:G.radius, usable:G.usable, mailboxes:G.mailboxes, street_m:G.street_m } : null;
  const load = async (start, flyers, radius, must, stage, stale, key, zone) => {
    if(tiles.size > 150) tiles.clear();
    G = await Planner.loadForFlyers(start, flyers, { cache, radius, must, zone, tiles, stale, census,
      progress:(done, total) => { if(stage && total > 1) stage((key || 'loadingArea') + '|' + done + '|' + total); } });
    gKey = keyOf(start);
  };
  // far places of the order (bus / train): own street graph around their centre, planned with the same workers as extra days
  const sideG = new Map();
  const sideGraph = async (c, stage, stale) => {
    const z = c.zone && c.zone.length > 2 ? c.zone : null, k = keyOf([c.lat, c.lng]) + ':' + (z ? 'z' + z.length + ',' + z[0].join(',') : c.loadFor || c.flyers); if(sideG.has(k)) return sideG.get(k);
    if(sideG.size > 6) sideG.clear();
    const g = await Planner.loadForFlyers([c.lat, c.lng], c.loadFor || c.flyers, { cache, tiles, stale, zone:z, census, progress:(done, total) => { if(stage && total > 1) stage('loadingSide|' + done + '|' + total); } });
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
  const EMPTY_CELL = 0.3;   // zones: share of our mailbox estimate kept in 100 m cells without census households
  const SEQ_MIN = 150;   // nearest-first sharing: a town is not visited for fewer flyers than this (places the APP picks; unchanged)
  const CHOSEN_MIN = 30;   // a place the admin confirmed himself (side.cid, from the census suggestions): planned from this many flyers on
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
  // origin (optional): the order's start point – the line begins there and the first piece is reached by a ride
  // hoursToo: the breaks are extra day starts (a town that does not fit into the rest of the day); inside a town the days are
  // still cut where the hours are full – but not when less than an hour of it is left (no trip back for a few streets)
  const buildLine = (pieces, hours, rideMin, breaks, origin, hoursToo) => {
    const path = [], steps = [], boxes = [], segMin = [], segMb = [], segSt = [], place = [], cutAt = new Set();
    if(origin && pieces.length && segLen(origin, pieces[0].r.path[0]) > 30){ path.push([origin[0], origin[1]]); segMin.push(0); segMb.push(0); segSt.push(0); place.push(''); }
    let length_m = 0, street_m = 0, minutes = 0, mailboxes = 0; const reserve = [], resSeen = new Set();
    for(const [pi, { r, name }] of pieces.entries()){
      const L = path.length, jump = (!!name || pi === 0) && L > 0;
      if(breaks && breaks.has(pi) && L > 0) cutAt.add(L);
      const tot = r.path.slice(1).reduce((s, q, j) => s + segLen(r.path[j], q), 0) || 1;
      r.path.forEach((q, j) => {   // a jump costs the ride: bike ≈ 15 km/h + 5 min, bus 30 min
        path.push(j === 0 && jump ? [q[0], q[1], 1] : [q[0], q[1]]);
        const d = j ? segLen(r.path[j - 1], q) : 0;
        segMin.push(j === 0 ? (jump ? (rideMin ? rideMin(path[L - 1], q) : TRAVEL_MIN) : 0) : r.minutes * d / tot); segMb.push(j ? (r.mailboxes || 0) * d / tot : 0); segSt.push(j ? (r.street_m || 0) * d / tot : 0); place.push(name || '');
      });
      (r.steps || []).forEach(st => steps.push([st[0] + L, st[1], st[2]])); (r.boxes || []).forEach(x => boxes.push(x));
      for(const x of r.reserve || []){ const k = x.p && x.p[0] ? x.p[0].join(',') : ''; if(k && !resSeen.has(k)){ resSeen.add(k); reserve.push(x); } }   // replacement streets of every piece
      length_m += r.length_m || 0; street_m += r.street_m || 0; minutes += r.minutes || 0; mailboxes += r.mailboxes || 0;
    }
    // days: cut where the hours of a day are full; a last bit under 45 min goes to the day before
    const lim = hours * 60, days = []; let i0 = 0, t = 0, mb = 0, st = 0, ln = 0, pl = new Set();
    const close = i1 => { days.push({ i0, i1, minutes:Math.round(t), mailboxes:Math.round(mb), street_m:Math.round(st), length_m:Math.round(ln), place:[...pl].filter(Boolean).join(' + ') || undefined }); i0 = i1; t = 0; mb = 0; st = 0; ln = 0; pl = new Set(); };
    const left = new Float64Array(path.length + 1);   // minutes from a point to the next forced day start (or the end)
    if(hoursToo) for(let i = path.length - 1; i >= 1; i--) left[i] = segMin[i] + (cutAt.has(i + 1) ? 0 : left[i + 1]);
    for(let i = 1; i < path.length; i++){
      if((hoursToo ? cutAt.has(i) || (t >= lim && left[i] >= 60) : breaks ? cutAt.has(i) : t >= lim) && t > 0) close(i - 1);
      t += segMin[i]; mb += segMb[i]; st += segSt[i]; ln += path[i][2] === 1 ? 0 : segLen(path[i - 1], path[i]); pl.add(place[i]);
    }
    if(t > 0 || !days.length) close(path.length - 1);
    if(!breaks && days.length > 1 && days[days.length - 1].minutes < 45){ const x = days.pop(), y = days[days.length - 1]; y.i1 = x.i1; ['minutes', 'mailboxes', 'street_m', 'length_m'].forEach(k => y[k] += x[k]); if(x.place) y.place = [...new Set([...(y.place || '').split(' + '), ...x.place.split(' + ')].filter(Boolean))].join(' + '); }
    return { path, steps, boxes, days, length_m, street_m, minutes, mailboxes, reserve:reserve.slice(0, 400) };
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
    async plan({ start, flyers, n, days, hours, must, zone, side, quota, bike, travel, split, exact, mainAll, cores, together, first, near, mainName, budget }, stage, stale){
      const eco = !exact && !mainAll;
      const zones = travel === 'zones';   // every place its own zone(s), no rides between places (orders since 15.11.2026)
      if(cores && !zones) return this.planCores({ start, flyers, n, hours, must, zone, side, travel, together, exact, first }, stage, stale);
      if(!zones){ travel = travel === 'bike' || travel === 'car' ? travel : (bike ? 'bike' : 'bus'); bike = travel !== 'bus'; }
      Planner.setPace(quota);   // hours from the order's quota (metres per 30 minutes)
      side = (side || []).filter(c => c && (c.flyers > 0 || split === 'even'));   // even split: a place added without a number gets its share below
      if(zones && budget?.strategy === 'near-first' && !mainAll){
        return this.planNearFirst({ start, n, days, hours, budget, side, must, zone, mainName }, stage, stale);
      }
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
      if(zones){
        // time-budget mode ("maximum flyers for the working time"): same zones, but the team's hours are the limit, one route per worker
        const res = budget && budget.hours > 0 && !mainAll && !(zone && zone.length > 2)
          ? await this.planBudget({ start, flyers, n, days, hours, must, side, mainName, budget }, stage, stale)
          : await this.planZones({ start, flyers, n, days, hours, must, zone, side, mainAll, cores, mainName }, stage, stale);
        if(res && res.plan) res.plan.bus = bus;
        return res;
      }
      // Towns the app added itself ("exactly N", too few mailboxes around the start): no even sharing. The main town gets every
      // street worth walking, the nearest town what is still missing, the next one the rest of that – a town is done whole
      // before the next one is touched, and only the last one is cut (a compact area on its side towards the main town).
      const seq = split === 'even' && !!near && side.length > 0 && !mainAll && !(must || []).some(a => a && a.name) && !side.some(c => c.all || (c.zone && c.zone.length > 2));
      if(seq){
        if(!G || gKey !== keyOf(start)){ stage('loadingArea'); await load(start, flyers, undefined, must, stage, stale, 'loadingArea', zone); }
        if(stale()) return { skipped:true };
        // A town's map is a square around its centre: it can hold streets of the main town or of a town taken before (places
        // next to each other). Those streets are switched off in the town's map (no mailboxes), so nothing is counted or walked twice.
        const seen = new Set(), keyE = (g, i) => { const e = g.edges[i]; return ((g.pts[e.a][0] + g.pts[e.b][0]) / 2).toFixed(5) + ',' + ((g.pts[e.a][1] + g.pts[e.b][1]) / 2).toFixed(5); };
        const mainSel = Planner.selectWithMust(G, start, flyers, must, zone), mainMb = Math.min(flyers, Math.round(mainSel.mailboxes));
        mainSel.ids.forEach(i => seen.add(keyE(G, i)));
        let rest = flyers - mainMb; const info = new Map();
        for(const c of side.slice().sort((x, y) => segLen(start, [x.lat, x.lng]) - segLen(start, [y.lat, y.lng]))){
          const hh = c.flyers || 0;   // households of the place (census)
          if(rest < SEQ_MIN){ c.flyers = 0; info.set(c, { name:c.name, flyers:0 }); continue; }   // not worth the trip for a handful of flyers
          // the map is loaded for the size of the place, not for everything that is still missing (a village would get a 6 km square)
          stage('loadingSide'); c.loadFor = Math.min(rest, Math.max(600, Math.round(hh * 1.3))); const g0 = await sideGraph(c, stage, stale); if(stale()) return { skipped:true };
          const g = { ...g0, edges:g0.edges.map((e, i) => e.mb && seen.has(keyE(g0, i)) ? { ...e, mb:0, boxes:[] } : e) };
          const st = Planner.denseEntry(g, start, null, Math.min(300, Math.max(100, rest * 0.2))) || [c.lat, c.lng];
          const cap = Math.round(Planner.selectForFlyers(g, st, 1e9).mailboxes || 0);
          c.flyers = Math.min(cap, rest); if(c.flyers < SEQ_MIN) c.flyers = 0;
          if(c.flyers){ c.g = g; c.st = st; Planner.selectWithMust(g, st, c.flyers).ids.forEach(i => seen.add(keyE(g, i))); }
          rest -= c.flyers; info.set(c, { name:c.name, flyers:c.flyers, cap });
        }
        splitInfo = [{ name:null, flyers:mainMb, cap:mainMb }, ...side.map(c => info.get(c))];
        side = side.filter(c => c.flyers > 0);
      }else if(split === 'even' && ((must || []).some(a => a && a.name) || side.length)){
        if(!G || gKey !== keyOf(start)){ stage('loadingArea'); await load(start, flyers, undefined, must, stage, stale, 'loadingArea', zone); }
        if(stale()) return { skipped:true };
        const nearM = (must || []).filter(a => a && a.name && a.p && a.p.length > 2);
        const capNear = nearM.map(a => Planner.mustPick(G, start, [{ p:a.p, n:0 }]).info[0].avail);
        const capFar = [];
        for(const c of side){
          stage('loadingSide'); c.flyers = c.flyers || flyers; const g = await sideGraph(c, stage, stale); if(stale()) return { skipped:true };
          capFar.push(c.zone && c.zone.length > 2 ? Planner.mustPick(g, [c.lat, c.lng], [{ p:c.zone, n:0 }]).info[0].avail : (g.usable != null ? g.usable : g.mailboxes) || 0);
        }
        const capMain = Math.max(0, (G.usable != null ? G.usable : G.mailboxes) - capNear.reduce((a, b) => a + b, 0));
        const caps = [capMain, ...capNear, ...capFar], share = new Array(caps.length).fill(0);
        // a place marked "all mailboxes" gets exactly what it has; the rest of the flyers is shared out over the others
        const fixed = new Set([mainAll ? 0 : -1, ...nearM.map((a, i) => a.all ? 1 + i : -1), ...side.map((c, i) => c.all ? 1 + nearM.length + i : -1)].filter(i => i >= 0));
        let rest = flyers; fixed.forEach(i => { share[i] = caps[i]; rest -= caps[i]; }); rest = Math.max(0, rest);
        let open = caps.map((_, i) => i).filter(i => !fixed.has(i));
        while(rest > 0 && open.length){   // water filling: equal shares, capped by what a place has
          const each = rest / open.length, full = open.filter(i => caps[i] - share[i] <= each);
          if(!full.length){ open.forEach(i => { share[i] += each; }); rest = 0; break; }
          full.forEach(i => { rest -= caps[i] - share[i]; share[i] = caps[i]; }); open = open.filter(i => !full.includes(i));
        }
        const r50 = x => Math.max(0, Math.round(x / 50) * 50);
        const shr = i => fixed.has(i) ? Math.round(share[i]) : r50(share[i]);
        nearM.forEach((a, i) => { a.n = a.all ? 0 : Math.max(50, shr(1 + i)); });   // 0 = every mailbox in the area
        side.forEach((c, i) => { c.flyers = shr(1 + nearM.length + i); });
        splitInfo = [{ name:null, flyers:r50(share[0]), cap:Math.round(capMain) }, ...nearM.map((a, i) => ({ name:a.name, flyers:shr(1 + i), cap:Math.round(capNear[i]), all:!!a.all })), ...side.map((c, i) => ({ name:c.name, flyers:c.flyers, cap:Math.round(capFar[i]), all:!!c.all }))];
        side = side.filter(c => c.flyers > 0);
      }
      if(side.length){
        const res = await this.planSide({ start, flyers, n, days, hours, must, zone, side, bike, travel, eco, mainAll, mainShare:splitInfo ? splitInfo[0].flyers : null, near:seq }, stage, stale);
        if(res && res.plan){ res.plan.bus = bus; res.plan.split = splitInfo; if(seq) res.plan.near = true; }
        return res;
      }
      const resM = await this.planMain({ start, flyers, n, days, hours, must, zone, eco, mainAll }, stage, stale);
      if(resM && resM.plan){ resM.plan.split = splitInfo; if(seq) resM.plan.near = true; }
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
      }else if(exact){
        // "exactly N": the main town is walked completely like a normal order (every street worth walking, up to N);
        // only what is still missing comes from the dense cores of the other places
        const ids = Planner.selectForFlyers(G, start, flyers).ids;
        const mb = ids.reduce((a, i) => a + G.edges[i].mb, 0), len = ids.reduce((a, i) => a + G.edges[i].len, 0);
        all = ids.length ? [{ area:null, g:G, ids, mb, len, park:start, forced:true }] : [];
      }else all = denseCores(G, null);
      for(const c of (side || [])){
        stage('loadingSide'); const g = await sideGraph({ ...c, flyers:c.flyers || 3000 }, stage, stale); if(stale()) return { skipped:true };
        const z = c.zone && c.zone.length > 2 ? c.zone : null;
        all = all.concat(denseCores(z ? Planner.zoneView(g, z) : g, c.name));
      }
      // places next to each other are loaded as overlapping squares: the same streets would come twice (counted and walked
      // twice). A street (by its middle point, ~1 m) belongs to the first core that has it; a core left with almost nothing is dropped.
      { const seenE = new Set(), keyE = (g, i) => { const e = g.edges[i]; return ((g.pts[e.a][0] + g.pts[e.b][0]) / 2).toFixed(5) + ',' + ((g.pts[e.a][1] + g.pts[e.b][1]) / 2).toFixed(5); };
        all = all.filter(c => { const ids = c.ids.filter(i => !seenE.has(keyE(c.g, i)));
          if(!c.forced && ids.length < c.ids.length * 0.5) return false;
          ids.forEach(i => seenE.add(keyE(c.g, i))); c.ids = ids; c.mb = ids.reduce((a, i) => a + c.g.edges[i].mb, 0); c.len = ids.reduce((a, i) => a + c.g.edges[i].len, 0); return c.mb >= 10; }); }
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
      // nearer cores first when they are about as good: the score is lowered by the distance from the start (−1/3 at 10 km)
      const near = c => c.score / (1 + segLen(start, c.park) / 20000);
      all.sort((a, b) => (b.forced ? 1 : 0) - (a.forced ? 1 : 0) || near(b) - near(a));
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
      // replacement streets (Ersatzstraßen): the cores were planned on cut-out maps, so their reserve is taken from the full map
      // of their place – streets near the core that no chosen core walks (also not under another place's map)
      { const kE = (g, i) => { const e = g.edges[i]; return ((g.pts[e.a][0] + g.pts[e.b][0]) / 2).toFixed(5) + ',' + ((g.pts[e.a][1] + g.pts[e.b][1]) / 2).toFixed(5); };
        const taken = new Set(); chosen.forEach(c => c.ids.forEach(i => taken.add(kE(c.g, i))));
        for(const g of new Set(chosen.map(c => c.g))){ const cs = chosen.filter(c => c.g === g), used = new Set(cs.flatMap(c => c.ids));
          Planner.reserveFor(g, used, cs.flatMap(c => c.routes), { skip:i => taken.has(kE(g, i)) }); }
        if(stale()) return { skipped:true }; }
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
        routes = Array.from({ length:n }, (_, w) => buildLine(tour.filter(c => c.routes[w]).map(c => ({ r:c.routes[w], name:c.name })), hours, (a, b) => ride(a, b), new Set([...breaks].map(k => tour.slice(0, k).filter(c => c.routes[w]).length)), start)).map((r, i) => ({ idx:i, ...r }));
        // a small core done by one person only: the other waits – the days still end at the same core for everybody
      }else{
        const vill = []; { let prev = start; tour.forEach(x => { vill.push({ min:x.work + ride(prev, x.park), x }); prev = x.park; }); }
        const P2 = [0]; vill.forEach(v => P2.push(P2[P2.length - 1] + v.min)); const parts = []; let from = 0;
        for(let w = 0; w < n; w++){ const goal = P2[P2.length - 1] * (w + 1) / n; let to = from; while(to < vill.length && (w === n - 1 || P2[to + 1] - vill[to].min / 2 <= goal)) to++; parts.push(vill.slice(from, to)); from = to; }
        routes = parts.filter(p => p.length).map((p, i) => ({ idx:i, ...buildLine(p.map(v => ({ r:v.x.routes[0], name:v.x.name })), hours, (a, b) => ride(a, b), null, start) }));
      }
      const plan = { routes, mailboxes:Math.round(sum), zone:[], cores:tour.map(c => ({ name:c.name, mb:Math.round(c.mb), c:c.park, min:Math.round(c.span) })), road_km:!!mat, side_info:[], side_failed:[], must_mb:0, must_info:[] };
      plan.capacity = Planner.capacity(routes, flyers);
      if(!exact && sum < flyers) plan.eco = { asked:flyers, used:Math.round(sum) };
      return { plan, sug:n, street_m:Math.round(chosen.reduce((a, c) => a + c.len, 0)) };
    },
    async planSide({ start, flyers, n, days, hours, must, zone, side, bike, travel, eco, mainAll, mainShare, near }, stage, stale){
        // towns added by the app: nobody gets a town alone – every town, like the main town, is shared out among all workers
        // (each gets his own zone of it), and everybody moves on to the next town together
        const team = !!near && n > 1;

        // each far place as one whole route (one worker)
        const far = [], failed = [];
        for(const c of side){
          stage('loadingSide'); const g = c.g || await sideGraph(c, stage, stale); if(stale()) return { skipped:true };   // c.g: the town's map without the streets taken already (nearest-first sharing)
          // begin on the side towards the main town where there are enough mailboxes (not in the middle of the place)
          const z = c.zone && c.zone.length > 2 ? c.zone : null, st = c.st || Planner.denseEntry(g, start, z, Math.min(300, Math.max(100, c.flyers * 0.2))) || [c.lat, c.lng];
          const p = Planner.planFlyers(g, st, c.flyers, team ? n : 1, { days:1, hoursPerDay:hours, zone:z });   // inside its borders (named place or drawn)
          const rs = ((p && p.routes) || []).filter(r => r.path && r.path.length > 1).map(({ part, ...r }) => r);
          if(!rs.length){ failed.push(c.name); continue; }   // no street with mailboxes inside its border: skip, tell the admin
          far.push({ c, r:rs[0], rs, min:Math.max(...rs.map(r => r.minutes)), mb:p.mailboxes });   // min: until the slowest has finished
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
        // days: a town that fits into one working day but not into the rest of this one starts a new day (nobody travels to a
        // town for the last hour and comes back the next morning); a town larger than a day is begun right away and cut by the hours
        const lim = hours * 60, after = m => { if(m <= lim + 60) return m; const r = m % lim; return r < 60 ? lim : r; };   // minutes worked on the last day of a block
        const dayStarts = (t0, mins) => { const out = new Set(); let t = t0; mins.forEach((m, k) => { if(t > 0 && t + m > lim + 20 && m <= lim + 20){ out.add(k); t = m; } else t = after(t + m); }); return out; };
        if(team){
          const mains = res.plan.routes, starts = dayStarts(after(Math.max(0, ...mains.map(r => r.minutes))), vill.map(v => v.min));
          const lines = [];
          for(let w = 0; w < n; w++){
            const pieces = mains[w] ? [{ r:mains[w], name:null }] : [], br = new Set();
            tour.forEach((x, k) => { if(!x.rs[w]) return; if(starts.has(k)) br.add(pieces.length); pieces.push({ r:x.rs[w], name:x.c.name }); });
            if(pieces.length) lines.push(buildLine(pieces, hours, ride, br, null, true));
          }
          if(mainEco) res.plan.eco = mainEco;
          res.plan.routes = lines.map((r, k) => ({ idx:k, ...r }));
          res.plan.road_km = mat ? true : false;
          res.plan.mailboxes += far.reduce((s, x) => s + x.mb, 0);
          res.plan.side_failed = failed; res.plan.side_info = []; res.plan.team = far.map(x => x.c.name);
          res.plan.capacity = Planner.capacity(res.plan.routes, flyers);
          res.sug = Math.min(20, Planner.suggestWorkers(res.plan.routes.reduce((s, r) => s + r.minutes, 0), hours, days));
          return res;
        }
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
        res.plan.routes = bins.map((b, k) => { const br = dayStarts(after(b.mains.reduce((s, r) => s + r.minutes, 0)), b.vill.map(x => x.min));
          return { idx:k, ...buildLine([...b.mains.map(r => ({ r, name:null })), ...b.vill.map(x => ({ r:x.far.r, name:x.far.c.name }))], hours, ride, new Set([...br].map(i => i + b.mains.length)), null, true) }; });
        res.plan.road_km = mat ? true : false;
        res.plan.mailboxes += far.reduce((s, x) => s + x.mb, 0);
        res.plan.side_failed = failed;
        res.plan.side_info = far.map(x => ({ name:x.c.name, mailboxes:x.mb, worker:bins.findIndex(b => b.items.some(i => i.far === x)) }));
        res.plan.capacity = Planner.capacity(res.plan.routes, flyers);
        res.sug = Math.min(20, Planner.suggestWorkers(res.plan.routes.reduce((s, r) => s + r.minutes, 0), hours, days));
        return res;
    },
    // Zones (new orders): every place is planned on its own, on foot, and shared out among all workers – everyone gets a zone
    // in every place (a small place: one person). Nothing is drawn or counted between the places: people drive there themselves,
    // like the hand-made Weidenberg order (one order per town, joined). Each route = one place × one person: r.place, r.w.
    // cores: in every place only its dense streets (Ortskerne), thin outskirts and the roads between hamlets are left out.
    async planZones({ start, flyers, n, days, hours, must, zone, side, mainAll, cores, mainName }, stage, stale){
      const maxDays = Math.max(1, Math.min(14, days || 1)), routes = [], failed = [], split = [];
      let mb = 0, rest = flyers;
      // a place = its built-up area from the census (100 m cells with households, gaps up to 200 m): streets outside it – the
      // roads to the next village, hamlets, farms, industrial estates – are not walked, and no mailbox is counted where nobody lives
      const view = (g, mask) => {
        const cv = cores ? new Set(denseCores(g, null).flatMap(c => c.ids)) : null;
        // inside the place everything is walked, like an area the admin drew (zoned): no street is skipped as too thin
        return { ...g, zoned:g.zoned || !!mask, edges:g.edges.map((e, i) => { if(!e.mb) return e; const m = e.coords && e.coords[Math.floor(e.coords.length / 2)], mid = m || g.pts[e.a];
          if((mask && !mask.inside(mid[0], mid[1])) || (cv && !cv.has(i))) return { ...e, mb:0, boxes:[] };
          // next to the houses but in a cell where the census has nobody (sheds, firms, garages – or a cell with 1–2 households
          // hidden for privacy): only a third of our estimate counts, so the order is not planned for mailboxes that are not there
          if(mask && !mask.lives(mid[0], mid[1])) return { ...e, mb:e.mb * EMPTY_CELL, boxes:(e.boxes || []).map(b => [b[0], b[1], (b[2] || 1) * EMPTY_CELL]) };
          return e; }) };
      };
      // pick: radius (m) in which a place's cell must lie. Default 1500 (a start in an industrial estate still gets its town); a confirmed census
      // place passes 150 – its point is a cell of its own built-up area, so a bigger neighbour within 1.5 km can no longer replace it
      const maskOf = async (lat, lng, pick) => { try{ return await placeMask(lat, lng, pick ? { pick } : {}); }catch{ return null; } };
      const load0 = k => routes.filter(x => x.w === k).reduce((a, x) => a + x.minutes, 0);
      const people = m => Math.max(1, Math.min(n, Math.floor(m / 150)));   // a small place: fewer people (the ones with least work so far)
      const whom = k => Array.from({ length:n }, (_, i) => i).sort((a, b) => load0(a) - load0(b)).slice(0, k).sort((a, b) => a - b);
      const seen = new Set(), keyE = (g, i) => { const e = g.edges[i]; return ((g.pts[e.a][0] + g.pts[e.b][0]) / 2).toFixed(5) + ',' + ((g.pts[e.a][1] + g.pts[e.b][1]) / 2).toFixed(5); };
      const planPlace = async (g0, st, name, ask, zn, isMain, mask, minWant = SEQ_MIN) => {
        stage('calculating');
        const g = { ...g0, edges:g0.edges.map((e, i) => e.mb && seen.has(keyE(g0, i)) ? { ...e, mb:0, boxes:[] } : e) };   // streets of a place planned before
        const cap = Math.round(Planner.selectWithMust(g, st, 1e9, isMain ? must : [], zn).mailboxes || 0);
        const want = Math.min(cap, ask != null ? ask : rest, rest);
        split.push({ name, flyers:want, cap, hh:mask ? mask.households : null });
        if(want < minWant && !(isMain && want > 0)) return;
        const p = Planner.planFlyers(g, st, want, people(want), { days:maxDays, hoursPerDay:hours, must:isMain ? must : undefined, zone:zn });
        const rs = ((p && p.routes) || []).filter(r => r.path && r.path.length > 1).map(({ part, ...r }) => r);
        if(!rs.length){ failed.push(name); return; }
        const ws = whom(rs.length);
        rs.forEach((r, k) => { r.place = name || ''; r.w = ws[k]; (r.days || []).forEach(d => { d.place = name || undefined; }); routes.push(r); });
        Planner.selectWithMust(g, st, want, isMain ? must : [], zn).ids.forEach(i => seen.add(keyE(g, i)));
        mb += p.mailboxes || 0; rest -= Math.round(p.mailboxes || 0);
      };
      // main place: its own built-up area around the start (a drawn area or "whole town" keep their borders)
      if(!G || gKey !== keyOf(start)){ stage('loadingArea'); await load(start, Math.max(flyers, 2000), undefined, must, stage, stale, 'loadingArea', zone); }
      if(stale()) return { skipped:true };
      const hasZone = !!(zone && zone.length > 2);
      const mMask = hasZone ? null : await maskOf(start[0], start[1]);
      const gm = view(G, mMask);
      // where the walking starts: at the start when the town is all around it, else in the town's centre (a start in an industrial
      // estate or at the edge would only reach the few streets next to it)
      let st0 = start;
      if(mMask){ const at = s0 => Planner.selectWithMust(gm, s0, 1e9, must, null).mailboxes || 0, a = at(start);
        const c0 = Planner.denseEntry(gm, mMask.centre, null, 150) || mMask.centre; if(at(c0) > a * 1.3) st0 = c0; }
      // When the admin manually changes a chosen village's flyer count, reserve that many
      // from the order before planning the main town. Automatic choices keep the old distribution.
      const reserved = (side || []).filter(c => c.cid && c.auto === false && !c.all)
        .reduce((sum, c) => sum + Math.max(0, Math.round(+c.flyers || 0)), 0);
      const mainAsk = !mainAll && reserved > 0 ? Math.max(0, flyers - reserved) : null;
      await planPlace(gm, st0, mainName || '', mainAll ? 1e9 : mainAsk, hasZone ? zone : null, true, mMask);
      if(stale()) return { skipped:true };
      // Respect explicit flyer allocations before automatic places can consume the remainder.
      const sideInPlanOrder = [...(side || [])].sort((a, b) => Number(a.auto !== false) - Number(b.auto !== false));
      for(const c of sideInPlanOrder){
        const chosen = !!c.cid;   // confirmed by the admin from a census suggestion
        if(rest < (chosen ? CHOSEN_MIN : SEQ_MIN)){ split.push({ name:c.name, flyers:0, cap:null }); continue; }
        const zn = c.zone && c.zone.length > 2 ? c.zone : null;
        stage('loadingSide'); c.loadFor = Math.max(600, Math.round(Math.min(rest, (c.flyers || rest)) * 1.3)); const g0 = await sideGraph({ ...c, flyers:c.loadFor }, stage, stale); if(stale()) return { skipped:true };
        const mask = zn ? null : await maskOf(c.lat, c.lng, chosen ? 150 : 0);
        const g = view(g0, mask); let st = Planner.denseEntry(g, start, zn, Math.min(300, Math.max(100, rest * 0.2))) || [c.lat, c.lng];
        if(mask){ const at = s0 => Planner.selectWithMust(g, s0, 1e9, [], zn).mailboxes || 0, c0 = Planner.denseEntry(g, mask.centre, zn, 150) || mask.centre; if(at(c0) > at(st) * 1.3) st = c0; }
        await planPlace(g, st, c.name, c.all ? 1e9 : (c.auto ? null : c.flyers || null), zn, false, mask, chosen ? CHOSEN_MIN : SEQ_MIN);
        if(stale()) return { skipped:true };
      }
      routes.forEach((r, i) => { r.idx = i; });
      const perW = Array.from({ length:n }, (_, k) => load0(k));
      const plan = { routes, mailboxes:Math.round(mb), zone:[], zones:true, split, side_failed:failed, side_info:[], must_mb:0, must_info:[], per_worker:perW };
      plan.capacity = Planner.capacity(perW.map((m, k) => ({ idx:k, minutes:m })), flyers, { hoursPerDay:hours, days });
      const sug = Math.min(20, Planner.suggestWorkers(perW.reduce((a, b) => a + b, 0), hours, days));
      return { plan, sug, street_m:G.street_m };
    },

    // Opt-in new time-first planner. The flyer count is calculated AFTER walking-time
    // selection, never supplied as a target. For now only the main continuous area is
    // supported; side towns, drawn areas and road travel require separate budgeting.
    // Time-first, street-network expansion. Unlike planBudget this mode never
    // allocates by mailbox density and never takes the flyer limit as a target.
    // Smaller print run (18.11.2026, flyercap.js): full plan first; when the admin wants fewer flyers, the mailboxes to keep
    // are chosen place by place and the routes are planned again for them only (same circle, no wider map).
    async planNearFirst(args, stage, stale){
      const cap = args.budget && args.budget.cap, target = cap && Math.round(+cap.target);
      if(!(target > 0) || args.budget._capKeep) return this.nearFirstCore(args, stage, stale);
      const full = await this.nearFirstCore({ ...args, budget:{ ...args.budget, cap:null } }, stage, stale);
      if(!full || full.skipped || !full.plan) return full;
      const fp = full.plan, fb = fp.budget || {};
      const info = { target, full_planned:fp.mailboxes, full_minutes:fb.actual_minutes };
      if(fp.mailboxes <= target){ fb.cap = { ...info, cut:false, planned:fp.mailboxes, places:[] }; return full; }
      const res = capPlan(fp.routes, cap.places || [], args.start, target);
      const again = await this.nearFirstCore({ ...args, budget:{ ...args.budget, cap:null, _capKeep:res.keep, _expanded:true, _villages:(fb.villages || []).length ? fb.villages : undefined } }, stage, stale);
      if(!again || again.skipped || !again.plan) return again;
      const ap = again.plan, kept = new Map();
      for(const b of plannedBoxes(ap.routes)){ const id = res.place.get(b.k) ?? '_main'; kept.set(id, (kept.get(id) || 0) + b.w); }
      ap.budget.cap = { ...info, cut:true, planned:ap.mailboxes,
        places:res.report.map(x => ({ id:x.id, main:x.main, full:x.full, keep:x.keep, planned:Math.round(kept.get(x.id) || 0) })) };
      ap.dropped = droppedStreets(G, res.keep, new Set(plannedBoxes(fp.routes).map(b => b.k)));
      return again;
    },
    async nearFirstCore({ start, n, days, hours, budget, side = [], must = [], zone = null, mainName = '' }, stage, stale){
      if(budget && budget._diag){ budget._diag.runs=(budget._diag.runs||0)+1; budget._diag.places=[]; }
      const circleKm = radiusKm(budget.radiusKm);
      const circle = circleKm == null ? [] : circlePolygon(start, circleKm);
      // Only automatic places are constrained; manual selections are exceptions.
      side = side.filter(c => !c.auto || circleKm == null || insideCircle([c.lat, c.lng], start, circleKm));
      const shapes = (must || []).filter(x => x?.p?.length > 2).map((x,i) => ({
        name:x.name||'Zusatzgebiet '+(i+1), zone:x.p, flyers:1500,
        lat:(x.c&&x.c[0])||x.p.reduce((a,p)=>a+p[0],0)/x.p.length,
        lng:(x.c&&x.c[1])||x.p.reduce((a,p)=>a+p[1],0)/x.p.length
      }));
      if(zone?.length>2)shapes.push({name:'Gezeichnetes Gebiet',zone,flyers:1500,
        lat:zone.reduce((a,p)=>a+p[0],0)/zone.length,
        lng:zone.reduce((a,p)=>a+p[1],0)/zone.length});
      side=[...side,...shapes];
      // Preserve the existing estimate proportionally when only some delivery
      // points remain. No new mailboxes or road connections are introduced.
      const retainBoxes=(e,keep,fallback)=>{
        if(!(e.mb>0))return e;
        const boxes=e.boxes||[],total=boxes.reduce((s,b)=>s+(b[2]||1),0);
        if(!(total>0))return fallback()?e:{...e,mb:0,boxes:[]};
        const remaining=boxes.filter(keep);
        if(remaining.length===boxes.length)return e;
        const kept=remaining.reduce((s,b)=>s+(b[2]||1),0);
        return {...e,mb:e.mb*kept/total,boxes:remaining};
      };
      const N=Math.max(1,Math.round(n||1)), H=hours||7, maxDays=Math.max(1,Math.min(14,days||1));
      const B=Math.min(Math.max(60,+budget.hours*60),N*H*60*maxDays);
      const tol=Number.isFinite(+budget.tolerance)?Math.max(0,Math.min(.25,+budget.tolerance)):.05;
      const travelMin=budget.travelMin==null?null:+budget.travelMin;
      // rides are computed by car on real roads (carroute.js); a typed-in ride time overrides every ride
      const manualRide=Number.isFinite(travelMin)&&travelMin>0?travelMin:null;
      const reservedTravel=side.reduce((a,c)=>a+(manualRide??estimate(start,[c.lat,c.lng]).min),0);
      if(reservedTravel>=B)throw new Error('Die Anfahrten brauchen das gesamte Zeitbudget. Mehr Stunden eintragen.');
      if(!G||gKey!==keyOf(start)){
        stage('loadingArea'); await load(start,12000,undefined,[],stage,stale,'loadingArea');
      }
      if(stale())return {skipped:true};
      const Bwalk=B-reservedTravel, shareSide=side.length ? .4 : 0;
      // A manually selected place receives a slice of the time, not a fixed
      // number of flyers. The main start area gets the remainder (at least 60%).
      const sideWork=Bwalk*shareSide, mainWork=Bwalk-sideWork;
      const places=[{name:mainName||'',st:start,g:clipDeliveryGraph(G,start,circleKm),time:mainWork,workers:N,isMain:true}];
      for(const c of side){
        stage('loadingSide');
        const g0=await sideGraph({ ...c, loadFor:Math.max(1500,Math.round(+c.flyers||1500)) },stage,stale);
        if(stale())return {skipped:true};
        const zone=c.zone&&c.zone.length>2?c.zone:null;
        const mask=zone?null:await placeMask(c.lat,c.lng,{pick:c.cid?150:0}).catch(()=>null);
        const filtered={...g0,zoned:!!(zone||mask)||g0.zoned,edges:g0.edges.map(e=>{
          if(!zone&&!mask)return e;
          const inside=p=>(!zone||Planner.inPoly(p,zone))&&(!mask||mask.inside(p[0],p[1]));
          const mid=e.coords?.[Math.floor(e.coords.length/2)]||g0.pts[e.a];
          return retainBoxes(e,inside,()=>inside(mid));
        })};
        places.push({name:c.name||'',st:[c.lat,c.lng],g:c.auto?clipDeliveryGraph(filtered,start,circleKm):filtered,time:sideWork/side.length,workers:1,isMain:false,manual:!c.auto});
      }
      if(budget._capKeep) places.forEach(p => { p.g = clipToKeep(p.g, budget._capKeep); });   // smaller print run: only the kept mailboxes
      stage('calculating');
      // Adjacent maps can split a street differently or snap the same building
      // to different edges. Deduplicate actual delivery points, preserving any
      // unserved buildings on an overlapping street. Geometry is the fallback
      // for older graphs without per-building delivery points.
      const seen=new Set(), seenBoxes=new Set(), edgeKey=streetGeometryKey;
      const boxKey=b=>b[0].toFixed(6)+','+b[1].toFixed(6);
      const planned=[];
      // Reserve manually selected areas FIRST. The main place then grows around
      // the start without re-using their streets, so additions shrink its radius.
      // 19.11.2026: the main town gets ALL the time the manual places leave (not a fixed 60 %), and when its streets run
      // out, the villages inside the circle are added (own street maps, nearest first) until the asked hours are reached.
      const planPlace=pl=>{
        const g={...pl.g,edges:pl.g.edges.map((e,i)=>retainBoxes(e,
          b=>!seenBoxes.has(boxKey(b)),()=>!seen.has(edgeKey(pl.g,i))))};
        const order=outwardStreetOrder(g,pl.st,budget._capKeep?{isolatedGapM:Infinity}:undefined), eligible=order.streets;
        if(budget._diag){ const mbOf=ids=>Math.round(ids.reduce((a,i)=>a+(+g.edges[i].mb||0),0));
          budget._diag.places=(budget._diag.places||[]).concat([{ name:pl.name, main:!!pl.isMain, time_min:Math.round(pl.time), workers:pl.workers,
            graph_radius_m:pl.g.radius??null, graph_mb:Math.round(g.edges.reduce((a,e)=>a+(+e.mb||0),0)), eligible:eligible.length, eligible_mb:Math.round(eligible.reduce((a,e)=>a+e.mailboxes,0)),
            skipped_mb:mbOf(order.skipped), unreachable_mb:mbOf(order.unreachable) }]); }   // smaller print run: the kept houses were chosen on purpose, no 'isolated dead end' filter
        const evalPrefix=count=>{
          if(!count)return null;
          const ids=new Set(eligible.slice(0,count).map(q=>q.i));
          const region={...g,zoned:true,edges:g.edges.map((e,i)=>ids.has(i)?e:{...e,mb:0,boxes:[]})};
          const max=eligible.slice(0,count).reduce((a,e)=>a+e.mailboxes,0);
          if(max<=0)return null;
          const p=Planner.planFlyers(region,pl.st,max+1,pl.workers,{days:maxDays,hoursPerDay:H,selectedEdgeIds:[...ids]});
          const minutes=p.routes.reduce((a,r)=>a+(r.minutes||0),0);
          return {p,minutes,count};
        };
        let lo=1,hi=eligible.length,best=null;
        for(let iteration=0;lo<=hi&&iteration<16;iteration++){
          const mid=(lo+hi)>>1,trial=evalPrefix(mid);
          if(trial&&trial.minutes<=pl.time*(1+tol)+.01){
            if(!best||trial.count>best.count)best=trial;
            lo=mid+1;
          }else hi=mid-1;
        }
        // If the first street alone exceeds budget, do not silently exceed it.
        const routes=(best?.p.routes||[]).filter(r=>r.path?.length>1);
        // Planner returns the actual edges used for each route; only those
        // are excluded from later towns.
        routes.forEach(r=>{
          (r.part||[]).forEach(i=>seen.add(edgeKey(g,i)));
          (r.boxes||[]).forEach(b=>seenBoxes.add(boxKey(b)));
        });
        const entry={...pl,routes,mailboxes:routes.reduce((a,r)=>a+(r.mailboxes||0),0),
          minutes:routes.reduce((a,r)=>a+(r.minutes||0),0),exhausted:eligible.length===0||best?.count===eligible.length,
          left_mb:Math.round(eligible.reduce((a,e)=>a+e.mailboxes,0)-routes.reduce((a,r)=>a+(r.mailboxes||0),0))};
        planned.push(entry); return entry;
      };
      for(const pl of places.slice(1)){ if(stale())return {skipped:true}; planPlace(pl); }
      if(stale())return {skipped:true};
      // the main town: everything the manual places did not use (their rides are reserved in Bwalk)
      places[0].time=Math.max(30,Bwalk-planned.reduce((a,p)=>a+p.minutes,0));
      planPlace(places[0]);
      // A time target must not be arbitrarily capped by the first loaded map
      // square. If we exhausted every nearby street but still have plenty of
      // time, load a wider region once and recalculate from scratch.
      const mainResult=planned.find(p=>p.isMain);
      if(budget._diag){ const D=budget._diag; D.B_min=Math.round(B); D.team_cap_min=N*H*60*maxDays; D.asked_min=Math.round(+budget.hours*60); D.N=N; D.H=H; D.days=maxDays;
        D.reserved_travel_min=reservedTravel; D.main_work_min=Math.round(mainWork); D.side_work_min=Math.round(sideWork); D.circle_km=circleKm; D.G_radius_m=G.radius; D.expanded=!!budget._expanded;
        D.results=planned.map(p=>({ name:p.name, main:!!p.isMain, time_min:Math.round(p.time||0), used_min:Math.round(p.minutes||0), exhausted:!!p.exhausted, mailboxes:Math.round((p.routes||[]).reduce((a,r)=>a+(r.mailboxes||0),0)) })); }
      if(!budget._expanded && mainResult?.exhausted && mainResult.minutes<mainWork*.8 &&
         G.radius<(circleKm == null ? Planner.MAX_R : circleKm*1000)){
        const oldRadius=G.radius,next=circleKm == null ? Planner.nextRadius(G,Math.max(12000,(G.usable||0)*1.5)) : circleKm*1000;
        if(next>oldRadius){
          stage('loadingMore');
          await load(start,12000,next,[],stage,stale,'loadingMore',circle.length?circle:undefined);
          if(stale())return {skipped:true};
          if(G.radius>oldRadius)return this.planNearFirst({
            start,n,days,hours,budget:{...budget,_expanded:true},
            side:side.filter(c=>!c._areaFromShape),must:[],zone:null,mainName
          },stage,stale);
        }
      }
      // villages inside the circle (19.11.2026): the walking map of the main town ends where only country roads without
      // footpath lead on, so the villages are separate. When the town's streets are used up and hours are left, they are
      // added one by one, nearest first, each with its own street map; the car ride to it is reserved.
      const villages=[], failedVillages=[]; let rideRes=0, candidatesLeft=0;
      const walkUsed=()=>planned.reduce((a,p)=>a+p.minutes,0), want=B*(1-tol);
      if(circleKm!=null && (budget._villages || walkUsed()+reservedTravel<want)){
        stage('loadingVillages');
        let cands=budget._villages||null;
        if(!cands){
          const list=await censusPlaces(start[0],start[1],circleKm*1000,{minH:40}).catch(()=>[]);
          const own=new Set();
          for(const e of G.edges)for(const b of e.boxes||[]){const [a,c]=cellOf(b[0],b[1]);own.add(a+','+c);}
          for(const pl of planned)for(const r of pl.routes)for(const b of r.boxes||[]){const [a,c]=cellOf(b[0],b[1]);own.add(a+','+c);}
          const covered=x=>{let n=0,k2=0;for(let k=0;k+1<(x.cells||[]).length;k+=2){k2++;if(own.has(x.cells[k]+','+x.cells[k+1]))n++;}return k2>0&&n/k2>.3;};
          cands=list.filter(x=>insideCircle([x.lat,x.lng],start,circleKm)&&!covered(x))
            .map(x=>({lat:x.lat,lng:x.lng,cid:x.id,households:x.households,d:segLen(start,[x.lat,x.lng])})).sort((a,b)=>a.d-b.d).slice(0,25);
        }
        const osmName=cands.length&&!budget._villages?await placeNames(start,circleKm+1):()=>null;
        for(const [ci,c] of cands.entries()){
          if(stale())return {skipped:true};
          const est=manualRide??estimate(start,[c.lat,c.lng]).min, left=B-walkUsed()-reservedTravel-rideRes;
          if(!budget._villages&&left-est<Math.max(30,B*tol)){candidatesLeft=cands.length-ci;break;}
          try{
            const g0=await sideGraph({lat:c.lat,lng:c.lng,loadFor:Math.max(1500,Math.round((c.households||500)*1.3))},stage,stale);
            if(stale())return {skipped:true};
            const mask=await placeMask(c.lat,c.lng,{pick:150}).catch(()=>null);
            const inside=p=>!mask||mask.inside(p[0],p[1]);
            let g1=clipDeliveryGraph({...g0,zoned:true,edges:g0.edges.map(e=>retainBoxes(e,inside,()=>inside(e.coords?.[Math.floor(e.coords.length/2)]||g0.pts[e.a])))},start,circleKm);
            if(budget._capKeep)g1=clipToKeep(g1,budget._capKeep);
            const name=c.name||osmName([c.lat,c.lng])||await villageName(c.lat,c.lng)||('Ort '+(Math.round(segLen(start,[c.lat,c.lng])/100)/10).toString().replace('.',',')+' km');
            const time=budget._villages?Math.max(30,B):left-est;
            const res=planPlace({name,st:[c.lat,c.lng],g:g1,time,workers:Math.max(1,Math.min(N,Math.ceil(time/(H*60*.75)))),isMain:false,village:true});   // a big village is shared by several people
            if(res.mailboxes>0){rideRes+=est;villages.push({name,lat:c.lat,lng:c.lng,cid:c.cid,households:c.households});}
            else planned.splice(planned.indexOf(res),1);
          }catch(e){failedVillages.push({lat:c.lat,lng:c.lng,error:String(e&&e.message||e).slice(0,120)});}
        }
      }
      planned.sort((a,b)=>Number(b.isMain)-Number(a.isMain));
      const bins=Array.from({length:N},(_,w)=>({w,items:[],minutes:0}));
      planned[0].routes.forEach((r,i)=>{
        const b=bins[i%N];b.items.push({r,name:planned[0].name,part:i+1,isMain:true});b.minutes+=r.minutes||0;
      });
      for(const pl of planned.slice(1))for(const [i,r] of pl.routes.entries()){
        const b=bins.reduce((a,c)=>c.minutes<a.minutes?c:a,bins[0]);
        b.items.push({r,name:pl.name,part:i+1,isMain:false});b.minutes+=(r.minutes||0)+(manualRide??estimate(start,r.path[0]).min);
      }
      // 19.11.2026: rides by car on real roads – one matrix over the studio and the first/last point of every work area;
      // every worker drives his areas in the order with the least driving (A → C → B → D if that is faster)
      const ends=[[start[0],start[1]]],ix=new Map();
      const P=p=>{const k=(+p[0]).toFixed(5)+','+(+p[1]).toFixed(5);if(!ix.has(k)){ix.set(k,ends.length);ends.push([+p[0],+p[1]]);}return ix.get(k);};
      for(const bin of bins)for(const it of bin.items){it.a=P(it.r.path[0]);it.b=P(it.r.path.at(-1));}
      const needRides=bins.some(b=>b.items.length>1||(b.items[0]&&segLen(start,b.items[0].r.path[0])>150));
      if(needRides)stage('rides');
      const M=needRides?await carRides(start,Math.max(3,Math.max(...ends.map(p=>segLen(start,p)))/1000+3),ends):null;
      if(stale())return {skipped:true};
      if(budget._diag)budget._diag.car_error=M&&M.length>1&&!M[0][1]?.known?carroute.lastError:null;
      const rideOf=(i,j)=>{
        if(i===j)return {min:0,km:0,known:true,geom:[]};
        const dw=segLen(ends[i],ends[j]);
        if(dw<400)return {min:Math.round(dw/(5000/60)*10)/10,km:Math.round(dw/100)/10,known:true,walk:true,geom:[ends[i],ends[j]]};   // a few streets on: walked, not driven
        const x=M&&M[i]&&M[i][j]?M[i][j]:estimate(ends[i],ends[j]);
        return manualRide!=null&&!x.walk?{...x,min:manualRide,known:true,manual:true}:x;
      };
      const routes=[],jumpsAll=[];
      for(const bin of bins){
        if(!bin.items.length)continue;
        const ord=bestOrder(bin.items.length,(i,j)=>rideOf(i<0?0:bin.items[i].b,bin.items[j].a).min);
        const its=ord.map(k=>bin.items[k]);
        const line=buildLine(its.map(x=>({r:x.r,name:x.name||'·'})),H,(a,b)=>rideOf(P(a),P(b)).min,undefined,start,false);
        const hasOrigin=segLen(start,its[0].r.path[0])>30;
        let off=hasOrigin?1:0;
        const parts=its.map(x=>{
          const part={place:x.name,part:x.part,i0:off,i1:off+x.r.path.length-1,
            mailboxes:Math.round(x.r.mailboxes||0),minutes:Math.round(x.r.minutes||0)};
          off+=x.r.path.length;return part;
        });
        const jumps=[];
        const jump=(i,j,from,to,idx)=>{const x=rideOf(i,j);jumps.push({w:bin.w,from,to,idx,km:x.km,min:x.min,known:!!x.known,manual:!!x.manual,
          geom:x.walk?[]:x.geom||[],walk:!!x.walk,far:x.km>3,same:false});};
        if(hasOrigin)jump(0,its[0].a,planned[0].name||'Start',its[0].name,1);
        for(let i=1;i<its.length;i++)if(segLen(its[i-1].r.path.at(-1),its[i].r.path[0])>30)jump(its[i-1].b,its[i].a,its[i-1].name,its[i].name,parts[i].i0);
        const rideMinutes=jumps.reduce((a,j)=>a+(j.min||0),0);   // every ride once
        routes.push({...line,w:bin.w,idx:routes.length,place:[...new Set(its.map(x=>x.name))].join(' + '),
          parts,jumps,work_minutes:Math.round(line.minutes),ride_minutes:Math.round(rideMinutes),minutes:Math.round(line.minutes+rideMinutes)});
        jumpsAll.push(...jumps);
      }
      const per_worker=Array.from({length:N},(_,w)=>routes.filter(r=>r.w===w).reduce((a,r)=>a+r.minutes,0));
      const mailboxes=Math.round(routes.reduce((a,r)=>a+(r.mailboxes||0),0));
      const walking=routes.reduce((a,r)=>a+(r.work_minutes||0),0);
      const travelMinutes=jumpsAll.reduce((a,j)=>a+(j.min||0),0),actual=walking+travelMinutes;
      const manualOutside = circleKm != null && places.some(p=>p.manual && p.g.edges.some(e=>e.mb>0 && (e.boxes?.length ? e.boxes : (e.coords||[])).some(b=>!insideCircle(b,start,circleKm))));
      const plan={routes,mailboxes,zone:circle,zones:true,merged:true,per_worker,
        split:planned.map(p=>({name:p.name,flyers:Math.round(p.mailboxes),cap:null})),
        side_failed:[],side_dropped:[],side_info:[],must_mb:0,must_info:[],
        budget:{strategy:'near-first',hours:budget.hours,tolerance:tol,car:!!budget.car,
          ...(circleKm != null ? { radiusKm:circleKm,manualOutside } : {}),
          minutes:Math.round(B),effective_minutes:Math.round(B),
          target_minutes:Math.round(B),max_minutes:Math.round(B*(1+tol)),
          actual_minutes:Math.round(actual),work_minutes:Math.round(walking),
          planned:mailboxes,flyers_max:mailboxes,uncovered:0,
          over_target:actual>B+1,over:actual>B*(1+tol)+1,
          fits_all:planned.every(p=>p.exhausted),limit:planned.every(p=>p.exhausted)?'capacity':'time',
          estimate:true,unplanned:planned.filter(p=>!p.routes.length).map(p=>p.name),
          main:{reserved:Math.round(planned[0].mailboxes),empty:!planned[0].routes.length,short:false},
          length_m:Math.round(routes.reduce((a,r)=>a+(r.length_m||0),0)),
          workers:routes.map(r=>({w:r.w,minutes:r.minutes,walk:r.work_minutes,ride:r.ride_minutes||0,mailboxes:Math.round(r.mailboxes||0),
            km:Math.round((r.length_m||0)/100)/10})),
          villages, failed_villages:failedVillages,
          shortfall:(()=>{ if(budget._capKeep||actual>=want-1)return null;
            const left=Math.round(want-actual), teamCap=N*H*60*maxDays, asked=Math.max(60,+budget.hours*60);
            const reason=teamCap<asked?'team_cap':failedVillages.length?'villages_failed':planned.every(p=>p.exhausted)&&!candidatesLeft?'all_planned':'time_left';
            return { reason, left_min:left, team_cap_min:teamCap, asked_min:Math.round(asked) }; })(),
          travel:{known:jumpsAll.every(j=>j.known),manual:manualRide!=null,moves:jumpsAll.length,minutes:travelMinutes,
            far:jumpsAll.filter(j=>j.far).length,far_km:3,jumps:jumpsAll}}
      };
      plan.capacity=Planner.capacity(per_worker.map((m,i)=>({idx:i,minutes:m})),mailboxes,
        {hoursPerDay:H,days:maxDays});
      return {plan,sug:N,street_m:G.street_m};
    },

    // ---- Time-budget optimizer (Phase "Zeitbudget") --------------------------------------------------------------------------
    // "The team has B hours – how many flyers can it hand out?" Every place (main town, villages) is still planned on its own, on foot,
    // inside its own census area; nothing is walked between places. The hours are spent where they give the most mailboxes:
    //  1. per place a curve "minutes → mailboxes" from the planner's own street selection (dense, compact streets first),
    //     calibrated once with a real route plan of that place
    //  2. all curve pieces of all places are taken best mailboxes-per-hour first, until the budget (or the flyers of the order) is used up
    //     – a place with a number set by the admin (not auto) is fixed first, the rest competes for the remaining hours
    //  3. the real routes are planned (streets taken by an earlier place are switched off: no street or mailbox twice) and the budget is
    //     checked against the real minutes; the plan is shrunk/grown a few times until it fits
    //  4. the pieces (zones) of the places are shared out among the workers so that everybody gets about the same hours, and each
    //     worker's pieces become ONE route (buildLine): pieces joined by a jump marker [lat, lng, 1] – no walking line between places
    // Ride times between places are not known (no car assumed): they are NOT counted as zero silently – plan.travel lists every change
    // of place with the straight-line distance, and `budget.travel_known` says whether the admin entered a ride time (travelMin).
    async planBudget({ start, flyers, n, days, hours, must, side, mainName, budget }, stage, stale){
      const B0 = Math.max(60, Math.round(budget.hours * 60)), N = Math.max(1, Math.round(n || 1)), H = hours || 7, maxDays = Math.max(1, Math.min(14, days || 1));
      const dayCap = N * H * 60 * maxDays, B = Math.min(B0, dayCap), share = B / N;   // the shifts (hours per day × days) can limit the budget too
      const travelMin = budget.travelMin != null && isFinite(+budget.travelMin) && +budget.travelMin >= 0 ? +budget.travelMin : null;
      const farKm = budget.farKm > 0 ? +budget.farKm : 3;
      // the hours are a TARGET: a good route that needs a little more is kept. Real minutes up to target × (1 + tolerance) are accepted (default +5 %,
      // 32 h → 33,6 h); beyond the target the plan says so (budget.over_target), beyond the tolerance it is shown as over (budget.over).
      const tol = budget.tolerance != null && isFinite(+budget.tolerance) ? Math.max(0, Math.min(0.25, +budget.tolerance)) : 0.05;
      const maskOf = async (lat, lng, pick) => { try{ return await placeMask(lat, lng, pick ? { pick } : {}); }catch{ return null; } };
      const view = (g, mask) => ({ ...g, zoned:g.zoned || !!mask, edges:g.edges.map(e => { if(!e.mb) return e; const m = e.coords && e.coords[Math.floor(e.coords.length / 2)], mid = m || g.pts[e.a];
        if(mask && !mask.inside(mid[0], mid[1])) return { ...e, mb:0, boxes:[] };
        if(mask && !mask.lives(mid[0], mid[1])) return { ...e, mb:e.mb * EMPTY_CELL, boxes:(e.boxes || []).map(b => [b[0], b[1], (b[2] || 1) * EMPTY_CELL]) };
        return e; }) });
      const keyE = (g, i) => { const e = g.edges[i]; return ((g.pts[e.a][0] + g.pts[e.b][0]) / 2).toFixed(5) + ',' + ((g.pts[e.a][1] + g.pts[e.b][1]) / 2).toFixed(5); };
      const places = [], failed = [], dropped = [];
      // ---- places: map, own census area, entry point, capacity ----
      if(!G || gKey !== keyOf(start)){ stage('loadingArea'); await load(start, Math.max(flyers, 2000), undefined, must, stage, stale, 'loadingArea', null); }
      if(stale()) return { skipped:true };
      const addPlace = (o) => { places.push(o); return o; };
      { const mask = await maskOf(start[0], start[1]), g = view(G, mask); let st = start;
        if(mask){ const at = s0 => Planner.selectWithMust(g, s0, 1e9, must, null).mailboxes || 0, a = at(start), c0 = Planner.denseEntry(g, mask.centre, null, 150) || mask.centre; if(at(c0) > a * 1.3) st = c0; }
        addPlace({ name:mainName || '', g, st, mask, isMain:true, must, fixed:null }); }
      for(const c of side || []){
        stage('loadingSide'); const want0 = c.all ? flyers : (+c.flyers || 0);
        const g0 = await sideGraph({ ...c, flyers:Math.max(600, Math.round(Math.min(flyers, want0 || flyers) * 1.3)) }, stage, stale); if(stale()) return { skipped:true };
        const chosen = !!c.cid, mask = await maskOf(c.lat, c.lng, chosen ? 150 : 0), g = view(g0, mask);
        if(mask && places.some(q => q.mask && Math.abs(q.mask.centre[0] - mask.centre[0]) < 1e-6 && Math.abs(q.mask.centre[1] - mask.centre[1]) < 1e-6 && q.mask.households === mask.households)){ dropped.push(c.name); continue; }   // the same built-up area as an earlier place: never twice
        let st = Planner.denseEntry(g, start, null, 150) || [c.lat, c.lng];
        if(mask){ const at = s0 => Planner.selectWithMust(g, s0, 1e9, [], null).mailboxes || 0, c0 = Planner.denseEntry(g, mask.centre, null, 150) || mask.centre; if(at(c0) > at(st) * 1.3) st = c0; }
        addPlace({ name:c.name, g, st, mask, isMain:false, must:[], fixed:(c.all ? 1e9 : (!c.auto && want0 > 0 ? want0 : null)), cid:c.cid || null });
      }
      if(stale()) return { skipped:true };
      stage('calculating');
      // ---- curves: minutes → mailboxes per place ----
      const K = 8, lenOf = (g, ids) => ids.reduce((s, i) => s + g.edges[i].len, 0);
      for(const pl of places){
        pl.cap = Math.round(Planner.selectWithMust(pl.g, pl.st, 1e9, pl.must, null).mailboxes || 0);
        const pts = [{ mb:0, min:0 }];
        for(let k = 1; k <= K && pl.cap > 0; k++){ const sel = Planner.selectWithMust(pl.g, pl.st, pl.cap * k / K, pl.must, null), mb = sel.mailboxes || 0; if(mb > pts[pts.length - 1].mb) pts.push({ mb, min:Planner.routeMinutes(lenOf(pl.g, sel.ids) * 1.35, mb) }); }
        // one real plan at the middle of the curve tells how far the estimate is from the real walk (repeated streets, dead ends)
        pl.f = 1; const mid = pts[Math.min(pts.length - 1, Math.ceil(pts.length / 2))];
        if(mid && mid.mb >= 20){ const rp = Planner.planFlyers(pl.g, pl.st, mid.mb, 1, { days:1, hoursPerDay:24, must:pl.must }), real = ((rp && rp.routes) || []).reduce((a, r) => a + (r.minutes || 0), 0); if(real > 0 && mid.min > 0) pl.f = Math.max(0.6, Math.min(3, real / mid.min)); }
        pl.pts = pts.map(q => ({ mb:q.mb, min:q.min * pl.f }));
        // concave: a street piece never gets better than the one before it (merge pieces whose slope rises)
        const seg = []; for(let i = 1; i < pl.pts.length; i++) seg.push({ dmb:pl.pts[i].mb - pl.pts[i - 1].mb, dmin:Math.max(0.01, pl.pts[i].min - pl.pts[i - 1].min) });
        for(let i = 0; i + 1 < seg.length;){ if(seg[i + 1].dmb / seg[i + 1].dmin > seg[i].dmb / seg[i].dmin + 1e-9){ seg[i] = { dmb:seg[i].dmb + seg[i + 1].dmb, dmin:seg[i].dmin + seg[i + 1].dmin }; seg.splice(i + 1, 1); i = Math.max(0, i - 1); } else i++; }
        pl.seg = seg.map(x => ({ ...x, slope:x.dmb / x.dmin }));
        pl.minAt = mb => { let m = 0, left = mb; for(const x of pl.seg){ if(left <= 0) break; const t = Math.min(1, left / x.dmb); m += x.dmin * t; left -= x.dmb; } return m; };
      }
      // ---- allocation: best mailboxes per hour first ----
      // A place the admin selected is always part of the plan: it gets at least `floor` mailboxes (its best streets), the rest of the hours
      // goes where the mailboxes per hour are highest. (budget.minShare, default 10 % of its capacity, at least 60; 0 switches it off.)
      const minShare = budget.minShare != null ? Math.max(0, Math.min(1, +budget.minShare)) : 0.1;
      // The minimums must never eat the budget (ten selected villages × 60 mailboxes can be most of a short budget): together they get at most
      // FLOOR_SHARE of the target hours, best mailboxes-per-hour first; places left without a minimum still compete by efficiency and, when they get
      // nothing, are named in budget.unplanned (the admin decides – nothing is dropped silently, nothing is added by itself).
      // The MAIN place (Hauptstadt) is never dropped: it is reserved first – a share of the target hours (default 25 %, budget.mainShare) and at
      // least 100 mailboxes – and only the rest of the hours is shared by efficiency. A denser neighbour is no reason to leave the main place out.
      // If the main place really has no mailboxes, or the reserve is too short for a worthwhile piece, the plan says so (budget.main_*): no invented route.
      const mbAtMin = (p, m) => { let mb = 0, left = m; for(const x of p.seg){ if(left <= 0) break; const t = Math.min(1, left / x.dmin); mb += x.dmb * t; left -= x.dmin; } return mb; };
      const mainShare = budget.mainShare != null && isFinite(+budget.mainShare) ? Math.max(0, Math.min(0.9, +budget.mainShare)) : 0.25;
      const mainP = places.find(q => q.isMain), warn = { main_empty:false, main_short:false };
      if(mainP){
        if(mainP.cap <= 0){ warn.main_empty = true; mainP.floor = 0; }
        else { const mMin = Math.min(mainP.minAt(mainP.cap), mainShare * B), mb = Math.min(mainP.cap, Math.max(Math.min(mainP.cap, 100), mbAtMin(mainP, mMin))); mainP.floor = Math.round(mb); if(mainP.floor < CHOSEN_MIN) warn.main_short = true; }
      }
      const FLOOR_SHARE = 0.35; let floorMul = 1;
      for(const p of places) if(!p.isMain) p.floor = p.fixed != null || !minShare ? 0 : Math.min(p.cap, Math.max(60, Math.round(p.cap * minShare)));
      { let used = 0; for(const p of places.filter(q => q.floor > 0 && !q.isMain).sort((a, b) => (b.floor / Math.max(1, b.minAt(b.floor))) - (a.floor / Math.max(1, a.minAt(a.floor))))){ const m = p.minAt(p.floor); if(used + m <= FLOOR_SHARE * B){ used += m; } else p.floor = 0; } }
      const afterFloor = (p) => { let skip = p.floor; const out = []; for(const x of p.seg){ if(skip >= x.dmb){ skip -= x.dmb; continue; } const f = skip > 0 ? (x.dmb - skip) / x.dmb : 1; skip = 0; out.push({ dmb:x.dmb * f, dmin:x.dmin * f, slope:x.slope }); } return out; };
      const allocate = (Bm) => {
        const want = new Map(places.map(p => [p, 0])); let usedMin = 0, usedMb = 0;
        for(const p of places){ if(p.fixed != null){ const w = Math.min(p.cap, p.fixed); want.set(p, w); usedMin += p.minAt(w); usedMb += w; } else if(p.floor && (floorMul || p.isMain)){ want.set(p, p.floor); usedMin += p.minAt(p.floor); usedMb += p.floor; } }
        const segs = []; for(const p of places) if(p.fixed == null) (p.floor && (floorMul || p.isMain) ? afterFloor(p) : p.seg).forEach(x => segs.push({ p, ...x }));
        segs.sort((a, b) => b.slope - a.slope);
        let limit = 'none';
        for(const x of segs){
          const roomMin = Bm - usedMin, roomMb = flyers - usedMb; if(roomMin <= 0){ limit = 'time'; break; } if(roomMb <= 0){ limit = 'flyers'; break; }
          const t = Math.min(1, roomMin / x.dmin, roomMb / x.dmb);
          want.set(x.p, want.get(x.p) + x.dmb * t); usedMin += x.dmin * t; usedMb += x.dmb * t;
          if(t < 1){ limit = roomMin / x.dmin < roomMb / x.dmb ? 'time' : 'flyers'; break; }
        }
        return { want, usedMin, usedMb, limit };
      };
      const peopleFor = (p, w) => Math.max(1, Math.min(N, Math.ceil(p.minAt(w) / (0.75 * share))));
      // ---- real routes (streets of an earlier place are off in the next one) ----
      const realPass = (alloc, ko) => {
        const seen = new Set(), out = [];
        for(const p of places){
          const w = Math.round(alloc.want.get(p) || 0); if(w < CHOSEN_MIN && !(p.isMain && w > 0)){ out.push({ p, want:w, parts:[], minutes:0, mailboxes:0 }); continue; }
          const g = { ...p.g, edges:p.g.edges.map((e, i) => e.mb && seen.has(keyE(p.g, i)) ? { ...e, mb:0, boxes:[] } : e) };
          const k = (ko && ko.get(p)) || peopleFor(p, w), pf = Planner.planFlyers(g, p.st, w, k, { days:1, hoursPerDay:24, must:p.isMain ? p.must : undefined });
          const rs = ((pf && pf.routes) || []).filter(r => r.path && r.path.length > 1).map(({ part, ...r }) => r);
          ((pf && pf.routes) || []).forEach(r => (r.part || []).forEach(i => seen.add(keyE(g, i))));   // the streets really walked (not only the planned selection): never again in a later place
          out.push({ p, want:w, parts:rs, minutes:rs.reduce((a, r) => a + (r.minutes || 0), 0), mailboxes:rs.reduce((a, r) => a + (r.mailboxes || 0), 0) });
        }
        return out;
      };
      const total = r => r.reduce((a, x) => a + x.minutes, 0);
      const solve = (Bwork) => {
      let Bm = Bwork, alloc = allocate(Bm), real = realPass(alloc), best = null;
      for(let it = 0; it < 5; it++){
        const T = total(real);
        if(T <= Bwork * (1 + tol) + 0.01){ if(!best || total(real) > total(best.real)) best = { alloc, real }; if(T >= Bwork * 0.96 || alloc.limit !== 'time') break; }
        const nb = Bm * (Bwork * (T <= Bwork ? 0.995 : 0.985)) / Math.max(1, T);   // estimate too high/low: rescale the budget given to the estimate
        if(Math.abs(nb - Bm) < 1) break; Bm = nb; alloc = allocate(Bm); real = realPass(alloc);
      }
      if(!best && floorMul){ floorMul = 0; return solve(Bwork); }   // still over: without the minimums of the selected places (they are then named in budget.unplanned)
      if(!best) best = { alloc, real };   // even the smallest plan is over: shown as over budget below
      ({ alloc, real } = best);
      // ---- share the pieces out among the workers, about equal hours; a big piece is cut in more parts when that evens out the load ----
      let bins = null;
      const assign = (rl) => {
        const items = []; rl.forEach((x, pi) => x.parts.forEach((r, k) => items.push({ r, pi, k, min:r.minutes || 0, name:x.p.name || mainName || '·' })));
        items.sort((a, b) => b.min - a.min);
        const bs = Array.from({ length:N }, () => ({ min:0, items:[] }));
        for(const it of items){ const ok = bs.filter(b => !b.items.some(z => z.pi === it.pi)), among = ok.length ? ok : bs; const b = among.reduce((m, q) => q.min < m.min ? q : m, among[0]); b.items.push(it); b.min += it.min; }   // zones of one place to different workers when possible
        return bs;
      };
      bins = assign(real);
      const ko = new Map();
      for(let it = 0; it < 4 && N > 1; it++){   // uneven (one big piece): cut the biggest single-part place in two and plan it again
        const mins = bins.map(b => b.min), spread = (Math.max(...mins) - Math.min(...mins)) / share; if(spread <= 0.15) break;
        const cand = real.filter(x => x.parts.length === 1 && x.parts.length < N && x.minutes >= 90).sort((a, b) => b.minutes - a.minutes)[0]; if(!cand) break;
        const k = Math.min(N, cand.parts.length + 1), ko2 = new Map(ko); ko2.set(cand.p, k);
        const trial = realPass(alloc, ko2);   // all places again from the same state (streets taken by an earlier place stay taken), this one in more parts
        if(!trial.find(x => x.p === cand.p) || trial.find(x => x.p === cand.p).parts.length < 2) break;
        const tb = assign(trial), tmins = tb.map(b => b.min);
        if(Math.max(...tmins) - Math.min(...tmins) < Math.max(...mins) - Math.min(...mins) && total(trial) <= Bwork * (1 + tol) + 0.01){ real = trial; bins = tb; ko.set(cand.p, k); } else break;
      }
      return { alloc, real, bins };
      };
      // ride times between places that the admin knows are part of the budget: plan again with the hours left after the rides
      let { alloc, real, bins } = solve(B);
      const movesOf = bs => bs.reduce((a, bn) => { const pis = bn.items.slice().sort((x, y) => x.pi - y.pi || x.k - y.k); let m = 0; for(let i = 1; i < pis.length; i++) if(pis[i].name !== pis[i - 1].name) m++; return a + m; }, 0);
      if(travelMin != null) for(let it = 0; it < 3; it++){ const rides = movesOf(bins) * travelMin; if(total(real) + rides <= B * (1 + tol) + 0.01 && (it > 0 || rides === 0)) break; const r2 = solve(Math.max(60, B - rides)); alloc = r2.alloc; real = r2.real; bins = r2.bins; if(total(real) + movesOf(bins) * travelMin <= B * (1 + tol) + 0.01) break; }
      if(stale()) return { skipped:true };
      // ---- one route per worker with work ----
      const order = new Map(real.map((x, i) => [x, i])); const routes = [], jumpsAll = [];
      bins.forEach((b, w) => {
        if(!b.items.length) return;   // no empty routes just to reach a number
        const its = b.items.slice().sort((a, c) => a.pi - c.pi || a.k - c.k);
        const line = buildLine(its.map(x => ({ r:x.r, name:x.name })), H, travelMin != null ? () => travelMin : () => 0, undefined, undefined, false);
        let off = 0; const parts = its.map(x => { const o = { place:x.name, part:x.k + 1, i0:off, i1:off + x.r.path.length - 1, mailboxes:Math.round(x.r.mailboxes || 0), minutes:Math.round(x.r.minutes || 0) }; off += x.r.path.length; return o; });
        const jumps = []; for(let i = 1; i < its.length; i++){ const a = its[i - 1].r.path[its[i - 1].r.path.length - 1], c = its[i].r.path[0], km = Math.round(segLen(a, c) / 100) / 10;
          jumps.push({ w, from:its[i - 1].name, to:its[i].name, idx:parts[i].i0, km, min:travelMin, known:travelMin != null, same:its[i - 1].name === its[i].name, far:km > farKm }); }
        const rideMin = travelMin != null ? jumps.filter(j => !j.same).length * travelMin : 0, r = { ...line, w, idx:routes.length, place:[...new Set(its.map(x => x.name))].join(' + '), parts, jumps, work_minutes:Math.round(line.minutes), minutes:Math.round(line.minutes + rideMin) };
        routes.push(r); jumpsAll.push(...jumps);
      });
      routes.forEach((r, i) => { r.idx = i; });
      const perW = Array.from({ length:N }, (_, k) => routes.filter(r => r.w === k).reduce((a, r) => a + r.minutes, 0));
      const mailboxes = Math.round(routes.reduce((a, r) => a + r.mailboxes, 0)), workMin = routes.reduce((a, r) => a + (r.work_minutes != null ? r.work_minutes : r.minutes), 0);
      const moves = jumpsAll.filter(j => !j.same), knownMin = travelMin != null ? moves.length * travelMin : 0;
      const split = real.map(x => ({ name:x.p.name || mainName || '', flyers:Math.round(x.mailboxes || x.want || 0), cap:x.p.cap, hh:x.p.mask ? x.p.mask.households : null, want:Math.round(alloc.want.get(x.p) || 0) }));
      const limit = mailboxes >= flyers * 0.99 ? 'none' : (alloc.limit === 'time' ? 'time' : 'capacity');
      const plan = { routes, mailboxes, zone:[], zones:true, merged:true, split, side_failed:failed, side_dropped:dropped, side_info:[], must_mb:0, must_info:[], per_worker:perW,
        budget:{ hours:budget.hours, minutes:B0, effective_minutes:Math.round(B), flyers_max:flyers, planned:mailboxes, uncovered:Math.max(0, Math.round(flyers - mailboxes)), work_minutes:Math.round(workMin),
          main:{ reserved:mainP ? mainP.floor : 0, empty:warn.main_empty, short:warn.main_short, share:mainShare }, limit, unplanned:real.filter(x => !x.p.isMain && x.parts.length === 0).map(x => x.p.name), fits_all:limit === 'none', target_minutes:B0, tolerance:tol, max_minutes:Math.round(B0 * (1 + tol)), actual_minutes:Math.round(workMin + knownMin),
          over_target:workMin + knownMin > B0 + 1, over:workMin + knownMin > B0 * (1 + tol) + 1, estimate:true,
          workers:perW.map((m, w) => ({ w, minutes:Math.round(m), mailboxes:Math.round(routes.filter(r => r.w === w).reduce((a, r) => a + r.mailboxes, 0)), km:Math.round(routes.filter(r => r.w === w).reduce((a, r) => a + (r.length_m || 0), 0) / 100) / 10 })),
          length_m:Math.round(routes.reduce((a, r) => a + (r.length_m || 0), 0)),
          travel:{ known:travelMin != null, moves:moves.length, minutes:travelMin != null ? knownMin : null, far:moves.filter(j => j.far).length, far_km:farKm, jumps:jumpsAll } } };
      plan.capacity = Planner.capacity(perW.map((m, k) => ({ idx:k, minutes:m })), mailboxes, { hoursPerDay:H, days:maxDays });
      return { plan, sug:Math.min(20, Planner.suggestWorkers(workMin + knownMin, H, maxDays)), street_m:G.street_m };
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

