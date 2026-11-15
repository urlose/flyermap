// Source of bundle.js: plans one order the way the admin page does for "Genau N" – on foot around the start; when that is
// too little, the nearest census towns are added as ordinary Nebenstädte (nearest first), up to 3 rounds.
// Build: cd worker && npx esbuild ../tools/serverplan/entry.mjs --bundle --format=iife --outfile=../tools/serverplan/bundle.js
import { createPlanService } from '../../worker/src/plancore.js';
import { townsAround } from '../../worker/src/zensus.js';
globalThis.FMRun = async req => {
  const start = req.start, flyers = req.flyers, svc = createPlanService(null), log = [], side = [];
  const plan = () => svc.plan({ start, flyers, n:req.n || 2, days:req.days || 2, hours:req.hours || 7, quota:req.quota || 2500, travel:req.travel || 'bus', bike:req.travel === 'bike', split:'even', exact:true, mainAll:false,
    cores:false, together:false, first:null, near:side.length > 0, must:[], zone:null, side:side.map(x => ({ name:x.name, lat:x.lat, lng:x.lng, flyers:x.flyers, zone:null, all:false })) }, () => {}, () => false);
  let res = await plan(); log.push('walk ' + res.plan.mailboxes);
  const hav = (a, b, c, d) => 111320 * Math.hypot(c - a, (d - b) * Math.cos(a * Math.PI / 180));
  for(let round = 1; round <= 3 && res.plan.mailboxes < flyers * 0.95; round++){
    const need = flyers - res.plan.mailboxes; let towns = await townsAround(start[0], start[1], 2500, 30000);
    const big = towns.filter(c => c.households >= 300); if(big.length) towns = big;
    const pick = []; let got = 0;
    for(const c of towns){ if(got >= need * 1.1 || pick.length >= 4) break; if(side.some(x => hav(x.lat, x.lng, c.lat, c.lng) < 1500)) continue; pick.push(c); got += c.households * 0.9; }
    if(!pick.length) break;
    pick.forEach(c => side.push({ name:'Ort ' + (side.length + 1), lat:c.lat, lng:c.lng, flyers:c.households, km:Math.round(c.dist / 100) / 10, auto:true }));
    res = await plan(); log.push('round ' + round + ' +' + pick.length + ' -> ' + res.plan.mailboxes);
  }
  return { log, side, sug:res.sug, street_m:res.street_m, plan:res.plan };
};
