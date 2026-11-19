// Time-first check on real data (needs network: public map tiles, census files, OSM car roads; no database):
// Leipheim start of the order of 17.11.2026. Prints a summary per scenario and writes the plans to diag-out/.
// Run in GitHub Actions (.github/workflows/diag-leipheim.yml) or locally with network: node test/diag-leipheim.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { createPlanService } from '../worker/src/plancore.js';
const start = [48.460716, 10.212487];
const scen = [
  { id:'A', name:'A: 2 Personen, 9 h/Tag, 3 Tage, 32 h, Kreis 10 km', n:2, H:9, days:3, hours:32, km:10 },
  { id:'B', name:'B: 2 Personen, 9 h/Tag, 3 Tage, 32 h, Kreis 2 km', n:2, H:9, days:3, hours:32, km:2 }
];
mkdirSync('diag-out', { recursive:true });
const h = m => Math.round(m / 6) / 10;
for(const sc of scen){
  const diag = {}, t0 = Date.now();
  try{
    const { plan } = await createPlanService(null).plan({ start, flyers:1, n:sc.n, days:sc.days, hours:sc.H, quota:2500, travel:'zones', split:'even', exact:true,
      must:[], zone:null, side:[], mainName:'Leipheim', budget:{ hours:sc.hours, strategy:'near-first', tolerance:.05, radiusKm:sc.km, _diag:diag } }, () => {}, () => false);
    const b = plan.budget;
    const out = { scenario:sc.name, seconds:Math.round((Date.now() - t0) / 1000), target_h:h(b.target_minutes), range_h:[h(b.target_minutes * .95), h(b.target_minutes * 1.05)],
      mailboxes:plan.mailboxes, walk_h:h(b.work_minutes), ride_h:h(b.travel.minutes), total_h:h(b.actual_minutes), rides_known:b.travel.known,
      workers:plan.routes.map(r => ({ w:r.w + 1, walk_h:h(r.work_minutes), ride_h:h(r.ride_minutes), total_h:h(r.minutes), mailboxes:Math.round(r.mailboxes), order:r.parts.map(p => p.place + ' ' + p.part).join(' → ') })),
      places:plan.split, villages:b.villages.map(v => v.name), failed_villages:b.failed_villages,
      rides:b.travel.jumps.map(j => ({ w:j.w + 1, from:j.from, to:j.to, km:j.km, min:j.min, known:j.known, points:j.geom.length })), shortfall:b.shortfall, team_cap_h:h(diag.team_cap_min), main_exhausted:(diag.results || []).find(r => r.main)?.exhausted };
    console.log(JSON.stringify(out, null, 1));
    writeFileSync('diag-out/plan-' + sc.id + '.json', JSON.stringify({ start, km:sc.km, summary:out, routes:plan.routes.map(r => ({ w:r.w, path:r.path, parts:r.parts, jumps:r.jumps })) }));
  }catch(e){ console.log(JSON.stringify({ scenario:sc.name, error:String(e && e.stack || e).slice(0, 900), diag })); }
}
