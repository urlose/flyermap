// Source of bundle.js: plans one order the way the admin page does for "Genau N" – on foot around the start; when that is
// too little, the nearest census towns are added as ordinary Nebenstädte (nearest first), up to 3 rounds.
// Build: cd worker && npx esbuild ../tools/serverplan/entry.mjs --bundle --format=iife --outfile=../tools/serverplan/bundle.js
import { createPlanService } from '../../worker/src/plancore.js';
import { townsAround, censusSource, compare } from '../../worker/src/zensus.js';
import Planner from '../../admin/planner.js';
globalThis.FMRun = async req => {
  const start = req.start, flyers = req.flyers, svc = createPlanService(null), log = [], side = [];
  const plan = () => svc.plan({ start, flyers, n:req.n || 2, days:req.days || 2, hours:req.hours || 7, quota:req.quota || 2500, travel:req.travel || 'bus', bike:req.travel === 'bike', split:'even', exact:true, mainAll:false, mainName:req.mainName || 'Start',
    cores:!!req.cores, together:false, first:null, near:side.length > 0, must:[], zone:null, side:side.map(x => ({ name:x.name, lat:x.lat, lng:x.lng, flyers:x.flyers, zone:null, all:false })) }, () => {}, () => false);
  let res = await plan(); log.push('walk ' + res.plan.mailboxes);
  const hav = (a, b, c, d) => 111320 * Math.hypot(c - a, (d - b) * Math.cos(a * Math.PI / 180));
  for(let round = 1; round <= 3 && res.plan.mailboxes < flyers * 0.95; round++){
    const need = flyers - res.plan.mailboxes; let towns = await townsAround(start[0], start[1], 2500, 30000);
    const big = towns.filter(c => c.households >= 300); if(big.length) towns = big;
    if(req.travel === 'zones') towns = towns.filter(c => c.dist <= 25000).sort((a, b) => b.dense / (1 + b.dist / 12000) - a.dense / (1 + a.dist / 12000));   // same as the admin page
    const pick = []; let got = 0;
    for(const c of towns){ if(got >= need * 1.1 || pick.length >= 4) break; if(side.some(x => hav(x.lat, x.lng, c.lat, c.lng) < 1500)) continue; pick.push(c); got += c.households * 0.9; }
    if(!pick.length) break;
    pick.forEach(c => side.push({ name:'Ort ' + (side.length + 1), lat:c.lat, lng:c.lng, flyers:c.households, km:Math.round(c.dist / 100) / 10, auto:true }));
    res = await plan(); log.push('round ' + round + ' +' + pick.length + ' -> ' + res.plan.mailboxes);
  }
  // req.dump: all streets with mailboxes around the start and around every added town (to draw the plan over them)
  let streets = null;
  if(req.dump){
    streets = []; const census = censusSource(), sp = res.plan.split || [];
    const add = g => g.edges.forEach(e => { if(e.mb > 0 && e.coords) streets.push([Math.round(e.mb), ...e.coords.flatMap(c => [+c[0].toFixed(5), +c[1].toFixed(5)])]); });
    add(await Planner.loadForFlyers(start, flyers, { census }));
    for(const x of side){ const f = (sp.find(y => y.name === x.name) || {}).flyers; if(f > 0) add(await Planner.loadForFlyers([x.lat, x.lng], f, { census })); }
  }
  // per place: our mailboxes against the census (households in the same 100 m cells)
  let places = null;
  if(res.plan.zones){
    places = [];
    for(const name of [...new Set(res.plan.routes.map(r => r.place))]){
      const rs = res.plan.routes.filter(r => r.place === name), c = await compare(rs.flatMap(r => r.boxes || []));
      places.push({ name, routes:rs.length, mailboxes:Math.round(rs.reduce((a, r) => a + r.mailboxes, 0)), census:c && c.households, minutes:Math.round(rs.reduce((a, r) => a + r.minutes, 0)), km:Math.round(rs.reduce((a, r) => a + r.length_m, 0) / 100) / 10, reserve:rs.reduce((a, r) => a + (r.reserve || []).length, 0) });
    }
  }
  const all = await compare(res.plan.routes.flatMap(r => r.boxes || []));
  return { log, places, census:all, side, sug:res.sug, street_m:res.street_m, plan:res.plan, streets };
};
