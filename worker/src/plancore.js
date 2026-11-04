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
    const z = c.zone && c.zone.length > 2 ? c.zone : null, k = keyOf([c.lat, c.lng]) + ':' + c.flyers + ':' + (z ? z.length + ',' + z[0].join(',') : ''); if(sideG.has(k)) return sideG.get(k);
    if(sideG.size > 6) sideG.clear();
    const g = await Planner.loadForFlyers([c.lat, c.lng], c.flyers, { cache, tiles, stale, zone:z, progress:(done, total) => { if(stage && total > 1) stage('loadingSide|' + done + '|' + total); } });
    sideG.set(k, g); return g;
  };
  // ---- far places of the order (bus / train) ----
  // Every far place goes WHOLE to one worker (nobody travels twice); the main place is cut into k equal parts and the parts and
  // far places are shared out so that everyone gets about the same hours (LPT). A worker's work is one line: main parts first,
  // then the far places (first point marked [lat,lng,1] = jump, no street). The days are then cut by time, wherever the hours
  // are full – the next day starts where the walker stopped (starting at an open part of the route is allowed).
  const TRAVEL_MIN = 30, EMPTY_GAP = 1000;   // bus ride counted for packing; > 1 km without mailboxes on the way → bus
  const segLen = (a, b) => { const k = Math.cos(a[0] * Math.PI / 180); return 111320 * Math.hypot(b[0] - a[0], (b[1] - a[1]) * k); };
  const lpt = (items, n) => {   // items: { min } → n bins, largest first into the emptiest bin
    const bins = Array.from({ length:n }, () => ({ min:0, items:[] }));
    [...items].sort((x, y) => y.min - x.min).forEach(it => { const b = bins.reduce((m, x) => x.min < m.min ? x : m, bins[0]); b.items.push(it); b.min += it.min; });
    return bins;
  };
  // one worker's line from its pieces (routes of the planner); pieces: [{ r, name|null }] in walking order
  const buildLine = (pieces, hours) => {
    const path = [], steps = [], boxes = [], segMin = [], segMb = [], segSt = [], place = [];
    let length_m = 0, street_m = 0, minutes = 0, mailboxes = 0;
    for(const { r, name } of pieces){
      const L = path.length, jump = !!name && L > 0;
      const tot = r.path.slice(1).reduce((s, q, j) => s + segLen(r.path[j], q), 0) || 1;
      r.path.forEach((q, j) => {
        path.push(j === 0 && jump ? [q[0], q[1], 1] : [q[0], q[1]]);
        const d = j ? segLen(r.path[j - 1], q) : 0;
        segMin.push(j === 0 ? (jump ? TRAVEL_MIN : 0) : r.minutes * d / tot); segMb.push(j ? (r.mailboxes || 0) * d / tot : 0); segSt.push(j ? (r.street_m || 0) * d / tot : 0); place.push(name || '');
      });
      (r.steps || []).forEach(st => steps.push([st[0] + L, st[1], st[2]])); (r.boxes || []).forEach(x => boxes.push(x));
      length_m += r.length_m || 0; street_m += r.street_m || 0; minutes += r.minutes || 0; mailboxes += r.mailboxes || 0;
    }
    // days: cut where the hours of a day are full; a last bit under 45 min goes to the day before
    const lim = hours * 60, days = []; let i0 = 0, t = 0, mb = 0, st = 0, ln = 0, pl = new Set();
    const close = i1 => { days.push({ i0, i1, minutes:Math.round(t), mailboxes:Math.round(mb), street_m:Math.round(st), length_m:Math.round(ln), place:[...pl].filter(Boolean).join(' + ') || undefined }); i0 = i1; t = 0; mb = 0; st = 0; ln = 0; pl = new Set(); };
    for(let i = 1; i < path.length; i++){
      if(t >= lim && t > 0) close(i - 1);
      t += segMin[i]; mb += segMb[i]; st += segSt[i]; ln += path[i][2] === 1 ? 0 : segLen(path[i - 1], path[i]); pl.add(place[i]);
    }
    if(t > 0 || !days.length) close(path.length - 1);
    if(days.length > 1 && days[days.length - 1].minutes < 45){ const x = days.pop(), y = days[days.length - 1]; y.i1 = x.i1; ['minutes', 'mailboxes', 'street_m', 'length_m'].forEach(k => y[k] += x[k]); if(x.place) y.place = [...new Set([...(y.place || '').split(' + '), ...x.place.split(' + ')].filter(Boolean))].join(' + '); }
    return { path, steps, boxes, days, length_m, street_m, minutes, mailboxes };
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
    async plan({ start, flyers, n, days, hours, must, zone, side, quota }, stage, stale){
      Planner.setPace(quota);   // hours from the order's quota (metres per 30 minutes)
      side = (side || []).filter(c => c && c.flyers > 0);
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
          if(gap > EMPTY_GAP){
            const ctr = a.c || a.p.reduce((x, q) => [x[0] + q[0] / a.p.length, x[1] + q[1] / a.p.length], [0, 0]);   // town centre when known
            side.push({ name:a.name, lat:ctr[0], lng:ctr[1], flyers:a.n || 1000, zone:a.p }); bus.push({ name:a.name, gap });
          }else keepMust.push(a);
        }
        must = keepMust;
      }
      if(side.length){
        const res = await this.planSide({ start, flyers, n, days, hours, must, zone, side }, stage, stale);
        if(res && res.plan) res.plan.bus = bus;
        return res;
      }
      return this.planMain({ start, flyers, n, days, hours, must, zone }, stage, stale);
    },
    async planSide({ start, flyers, n, days, hours, must, zone, side }, stage, stale){

        // each far place as one whole route (one worker)
        const far = [];
        for(const c of side){
          stage('loadingSide'); const g = await sideGraph(c, stage, stale); if(stale()) return { skipped:true };
          const p = Planner.planFlyers(g, [c.lat, c.lng], c.flyers, 1, { days:1, hoursPerDay:hours, zone:c.zone && c.zone.length > 2 ? c.zone : null });   // inside its borders (named place or drawn)
          const { part, ...r } = p.routes[0]; far.push({ c, r, min:r.minutes, mb:p.mailboxes });
        }
        const mainFlyers = Math.max(100, flyers - side.reduce((s, c) => s + c.flyers, 0));
        // main place: first with n parts; then the number of equal parts that shares the hours best together with the far places
        let res = await this.planMain({ start, flyers:mainFlyers, n, days:1, hours, must, zone }, stage, stale);
        if(!res || res.skipped) return res;
        const M = res.plan.routes.reduce((s, r) => s + r.minutes, 0);
        let bestK = n, bestMax = Infinity;
        for(let k = n; k <= 3 * n; k++){
          const mx = Math.max(...lpt([...far.map(x => ({ min:x.min })), ...Array.from({ length:k }, () => ({ min:M / k }))], n).map(b => b.min));
          if(mx < bestMax - 15){ bestMax = mx; bestK = k; }   // more parts only when it saves a quarter hour or more
        }
        if(bestK !== n){ stage('calculating'); const r2 = await this.planMain({ start, flyers:mainFlyers, n:bestK, days:1, hours, must, zone }, stage, stale); if(!r2 || r2.skipped) return r2; res = r2; }
        const items = [...far.map(x => ({ min:x.min, far:x })), ...res.plan.routes.map(r => ({ min:r.minutes, main:r }))];
        const bins = lpt(items, n);
        res.plan.routes = bins.map((b, k) => {
          const pieces = [...b.items.filter(x => x.main).map(x => ({ r:x.main, name:null })), ...b.items.filter(x => x.far).map(x => ({ r:x.far.r, name:x.far.c.name }))];
          return { idx:k, ...buildLine(pieces, hours) };
        });
        res.plan.mailboxes += far.reduce((s, x) => s + x.mb, 0);
        res.plan.side_info = far.map(x => ({ name:x.c.name, mailboxes:x.mb, worker:bins.findIndex(b => b.items.some(i => i.far === x)) }));
        res.plan.capacity = Planner.capacity(res.plan.routes, flyers);
        res.sug = Math.min(20, Planner.suggestWorkers(res.plan.routes.reduce((s, r) => s + r.minutes, 0), hours, days));
        return res;
    },
    async planMain({ start, flyers, n, days, hours, must, zone }, stage, stale){
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
      const sel = Planner.selectWithMust(G, start, flyers, must, zone);
      const sug = Math.min(20, Planner.suggestWorkers(Planner.routeMinutes(sel.ids.reduce((s, i) => s + G.edges[i].len, 0) * 1.35, sel.mailboxes), hours, days));
      if(stale()) return { skipped:true };
      const plan = Planner.planFlyers(G, start, flyers, n, { days, hoursPerDay:hours, must, zone });
      plan.routes = plan.routes.map(({ part, ...r }) => r);   // street ids are only needed inside the planner
      return { plan, sug, street_m:G.street_m };
    },
  };
}
