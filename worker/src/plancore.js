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
    const k = keyOf([c.lat, c.lng]) + ':' + c.flyers; if(sideG.has(k)) return sideG.get(k);
    if(sideG.size > 6) sideG.clear();
    const g = await Planner.loadForFlyers([c.lat, c.lng], c.flyers, { cache, tiles, stale, progress:(done, total) => { if(stage && total > 1) stage('loadingSide|' + done + '|' + total); } });
    sideG.set(k, g); return g;
  };
  // route k of the main place + route k of each far place = one route. The planner's loops (each returns to its start) are the
  // pieces; they are packed into working days by time, so a day can finish the main place and go on in a far place after a bus
  // ride (TRAVEL_MIN counted for packing). The first point of a far place is marked [lat,lng,1]: a jump, no street before it.
  const TRAVEL_MIN = 30;
  const loops = r => r.days && r.days.length ? r.days : [{ i0:0, i1:r.path.length - 1, length_m:r.length_m, street_m:r.street_m, minutes:r.minutes, mailboxes:r.mailboxes }];
  const joinRoutes = (a, sides, hours) => {
    const path = [...a.path], steps = [...(a.steps || [])], boxes = [...(a.boxes || [])], pieces = loops(a).map(d => ({ ...d }));
    for(const { r, name } of sides){
      if(!r) continue; const L = path.length;
      r.path.forEach((q, j) => path.push(j ? q : [q[0], q[1], 1]));
      (r.steps || []).forEach(st => steps.push([st[0] + L, st[1], st[2]])); (r.boxes || []).forEach(x => boxes.push(x));
      loops(r).forEach((d, j) => pieces.push({ ...d, i0:d.i0 + L, i1:d.i1 + L, place:name, jump:j === 0 }));
    }
    const lim = hours * 60 * 1.1, days = []; let cur = null, t = 0;
    for(const p of pieces){
      const need = p.minutes + (p.jump ? TRAVEL_MIN : 0);
      if(cur && t + need > lim){ days.push(cur); cur = null; t = 0; }
      if(!cur){ cur = { i0:p.i0, i1:p.i1, length_m:0, street_m:0, minutes:0, mailboxes:0, places:[] }; }
      cur.i1 = p.i1; cur.length_m += p.length_m || 0; cur.street_m += p.street_m || 0; cur.minutes += p.minutes || 0; cur.mailboxes += p.mailboxes || 0;
      if(p.place && !cur.places.includes(p.place)) cur.places.push(p.place);
      t += need;
    }
    if(cur) days.push(cur);
    days.forEach(d => { if(d.places.length) d.place = d.places.join(' + '); delete d.places; });
    const sum = k => pieces.reduce((s, p) => s + (p[k] || 0), 0);
    return { ...a, path, steps, boxes, days, length_m:sum('length_m'), street_m:sum('street_m'), minutes:sum('minutes'), mailboxes:sum('mailboxes') };
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
    async plan({ start, flyers, n, days, hours, must, zone, side }, stage, stale){
      side = (side || []).filter(c => c && c.flyers > 0);
      if(side.length){
        // far places: own street graph and own loops with the same number of workers; the days are packed afterwards
        const parts = [];
        for(const c of side){
          stage('loadingSide'); const g = await sideGraph(c, stage, stale); if(stale()) return { skipped:true };
          const p = Planner.planFlyers(g, [c.lat, c.lng], c.flyers, n, { days, hoursPerDay:hours });
          p.routes = p.routes.map(({ part, ...r }) => r); parts.push({ c, p });
        }
        const mainFlyers = Math.max(100, flyers - side.reduce((s, c) => s + c.flyers, 0));
        const res = await this.plan({ start, flyers:mainFlyers, n, days:days * 2, hours:hours / 2, must, zone }, stage, stale);   // half-day loops pack into fuller days
        if(!res || res.skipped) return res;
        res.plan.routes = res.plan.routes.map((r, k) => joinRoutes(r, parts.map(({ c, p }) => ({ r:p.routes[k], name:c.name })), hours));
        res.plan.mailboxes += parts.reduce((s, x) => s + x.p.mailboxes, 0);
        res.plan.side_info = parts.map(({ c, p }) => ({ name:c.name, mailboxes:p.mailboxes }));
        res.plan.capacity = Planner.capacity(res.plan.routes, flyers);
        return res;
      }
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
