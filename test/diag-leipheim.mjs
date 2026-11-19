// Diagnosis (needs network, read-only public map tiles + census files, no database): why does a time-first plan
// end below the asked hours? Leipheim start of the order of 17.11.2026, circle 10 km. Prints one JSON per scenario.
// Run in GitHub Actions (.github/workflows/diag-leipheim.yml) or locally with network: node test/diag-leipheim.mjs
import Planner from '../admin/planner.js';
import { createPlanService } from '../worker/src/plancore.js';
const start = [48.460716, 10.212487];
const scen = [
  { name:'2 Personen, 9 h/Tag, 2 Tage, 32 h, Kreis 10 km', n:2, H:9, days:2, hours:32 },
  { name:'2 Personen, 9 h/Tag, 3 Tage, 32 h, Kreis 10 km', n:2, H:9, days:3, hours:32 },
  { name:'2 Personen, 9 h/Tag, 3 Tage, 32 h, Kreis 5 km', n:2, H:9, days:3, hours:32, km:5 }
];
for(const sc of scen){
  const diag = {}, t0 = Date.now(), stages = new Set();
  try{
    const { plan } = await createPlanService(null).plan({ start, flyers:1, n:sc.n, days:sc.days, hours:sc.H, quota:2500, travel:'zones', split:'even', exact:true,
      must:[], zone:null, side:[], mainName:'Leipheim', budget:{ hours:sc.hours, strategy:'near-first', tolerance:.05, radiusKm:sc.km || 10, _diag:diag } }, s => stages.add(String(s).split('|')[0]), () => false);
    console.log(JSON.stringify({ scenario:sc.name, seconds:Math.round((Date.now() - t0) / 1000), mailboxes:plan.mailboxes, actual_min:plan.budget.actual_minutes,
      per_worker:plan.per_worker, limit:plan.budget.limit, fits_all:plan.budget.fits_all, route_km:Math.round(plan.routes.reduce((a, r) => a + (r.length_m || 0), 0) / 100) / 10, stages:[...stages], diag }, null, 1));
  }catch(e){ console.log(JSON.stringify({ scenario:sc.name, error:String(e && e.stack || e).slice(0, 800), diag })); }
}
