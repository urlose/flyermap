// Route planning service: loads the map data for a start point and plans the routes.
// Runs inside a Web Worker (planworker.js) so the screen never freezes; the same code is the fallback on the main thread.
// The street graph stays here between calls: changing flyers / workers / hours only re-plans, it does not reload the map.
import Planner from '../../admin/planner.js';

export function createPlanService(cache){
  let G = null, gKey = '';
  const tiles = new Map();   // map squares already loaded in this session (kept for nearby start points)
  const keyOf = s => s[0].toFixed(5) + ',' + s[1].toFixed(5);
  const info = () => G ? { radius:G.radius, usable:G.usable, mailboxes:G.mailboxes, street_m:G.street_m } : null;
  const load = async (start, flyers, radius, must, stage, stale, key) => {
    if(tiles.size > 150) tiles.clear();
    G = await Planner.loadForFlyers(start, flyers, { cache, radius, must, tiles, stale,
      progress:(done, total) => { if(stage && total > 1) stage((key || 'loadingArea') + '|' + done + '|' + total); } });
    gKey = keyOf(start);
  };
  return {
    // map data around a new start point
    async load({ start, flyers, must }, stage, stale){
      if(G && gKey === keyOf(start)) return info();
      stage('loadingArea');
      G = null; gKey = '';
      await load(start, flyers, undefined, must, stage, stale, 'loadingArea');
      return info();
    },
    // plans the routes; loads a larger square first when the plan reaches the edge of what is loaded
    async plan({ start, flyers, n, days, hours, must }, stage, stale){
      if(!G || gKey !== keyOf(start)){ stage('loadingArea'); await load(start, flyers, undefined, must, stage, stale, 'loadingArea'); }
      if(stale()) return { skipped:true };
      // a mandatory area outside the loaded square: load a larger square first
      const mr = Math.min(Planner.MUST_MAX_R, Planner.mustRadius(start, must));
      if(mr > G.radius){ stage('loadingMore'); await load(start, flyers, mr, must, stage, stale, 'loadingMore'); if(stale()) return { skipped:true }; }
      const reach = Planner.selectWithMust(G, start, flyers, must).reach_m; G.reach = reach;   // loaded square must stay clearly larger than what we walk
      if(((G.usable != null ? G.usable : G.mailboxes) < flyers * 1.05 || reach > 0.65 * G.radius) && G.radius < Planner.MAX_R){
        stage('loadingMore');
        const keep = G; try{ await load(start, flyers, Planner.nextRadius(G, flyers), must, stage, stale, 'loadingMore'); }catch(e){ G = keep; gKey = keyOf(start); /* keep the smaller area */ }
        if(stale()) return { skipped:true };
      }
      stage('calculating');
      const sel = Planner.selectWithMust(G, start, flyers, must);
      const sug = Math.min(20, Planner.suggestWorkers(Planner.routeMinutes(sel.ids.reduce((s, i) => s + G.edges[i].len, 0) * 1.35, sel.mailboxes), hours, days));
      if(stale()) return { skipped:true };
      const plan = Planner.planFlyers(G, start, flyers, n, { days, hoursPerDay:hours, must });
      plan.routes = plan.routes.map(({ part, ...r }) => r);   // street ids are only needed inside the planner
      return { plan, sug, street_m:G.street_m };
    },
  };
}
