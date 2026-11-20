// Drive-time planner on real data (needs network: public map tiles, census files, OSM roads; no database).
// Leipheim start of the order of 17.11.2026. Prints a summary per scenario + the plan (gzip/base64) for the maps.
// Run in GitHub Actions (.github/workflows/diag-leipheim.yml, manual start).
import { gzipSync } from 'node:zlib';
import { createPlanService } from '../worker/src/plancore.js';
const start = [48.460716, 10.212487];
const scen = [
  { id:'A', name:'A: 2 Personen, 9 h/Tag, 3 Tage – max. 15 Min., 32 h, 10.000 Flyer', b:{ hours:32, driveMin:15, maxFlyers:10000 } },
  { id:'B', name:'B: wie A, ohne Fahrzeitgrenze', b:{ hours:32 } },
  { id:'C', name:'C: wie A, max. 5 Min. Fahrzeit', b:{ hours:32, driveMin:5, maxFlyers:10000 } }
];
const h = m => Math.round(m / 6) / 10;
for(const sc of scen){
  const t0 = Date.now();
  try{
    const svc = createPlanService(null);
    const { plan } = await svc.plan({ start, flyers:1, n:2, days:3, hours:9, quota:2500, travel:'zones', split:'even', exact:true, must:[], zone:null, side:[], mainName:'Leipheim',
      budget:{ strategy:'near-first', mode:'drive', tolerance:0, ...sc.b } }, () => {}, () => false);
    const b = plan.budget, v = b.drive;
    console.log(JSON.stringify({ scenario:sc.name, seconds:Math.round((Date.now() - t0) / 1000), stop:v.stop, full_min:v.full_min, next:v.next, rings:v.rings.slice(0, 20),
      mailboxes:plan.mailboxes, walk_h:h(b.work_minutes), ride_h:h(b.travel.minutes), total_h:h(b.actual_minutes), max_h:h(v.max_minutes), left_min:v.left_minutes, filled:v.filled,
      real_roads:v.real_roads, road_error:v.road_error, rides_known:b.travel.known, villages:v.villages, skipped_mb:v.skipped_mb,
      workers:plan.routes.map(r => ({ w:r.w + 1, walk_h:h(r.work_minutes), ride_h:h(r.ride_minutes), total_h:h(r.minutes), mailboxes:Math.round(r.mailboxes), order:r.parts.map(p => p.place + ' ' + p.part).join(' → ') })),
      places:plan.split, start_hops:plan.routes.flatMap(r => r.jumps).filter(j => j.from === 'Start').map(j => ({ walk:j.walk, km:j.km, min:j.min })),
      rides:b.travel.jumps.filter(j => !j.walk).map(j => ({ w:j.w + 1, from:j.from, to:j.to, km:j.km, min:j.min, known:j.known })) }, null, 1));
    const r5 = p => [+(+p[0]).toFixed(5), +(+p[1]).toFixed(5), ...(p[2] === 1 ? [1] : [])];
    console.log('PLAN_' + sc.id + ' ' + gzipSync(JSON.stringify({ start, drive:{ full_min:v.full_min, next:v.next }, grid:b.driveZone,
      routes:plan.routes.map(r => ({ w:r.w, path:r.path.map(r5), parts:r.parts, jumps:r.jumps.map(j => ({ ...j, geom:(j.geom || []).map(r5) })) })) })).toString('base64'));
  }catch(e){ console.log(JSON.stringify({ scenario:sc.name, error:String(e && e.stack || e).slice(0, 900) })); }
}
