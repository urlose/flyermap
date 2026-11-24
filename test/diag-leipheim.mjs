// TEMP diag (branch diag/frankfurt): Frankfurt order of 24.11.2026 – where does the drive-time planner spend its time?
import { createPlanService } from '../worker/src/plancore.js';
const start = [50.13655, 8.59345];   // Westerbachstraße 29, 60489 Frankfurt
const h = m => Math.round(m / 6) / 10;
const t0 = Date.now(); let last = t0, lastStage = 'start'; const stages = [];
const stage = s => { const now = Date.now(); const k = typeof s === 'string' ? s : JSON.stringify(s).slice(0, 60); if(k !== lastStage){ stages.push([lastStage, Math.round((now - last) / 100) / 10]); console.log('STAGE', Math.round((now - t0) / 1000) + 's', k); lastStage = k; last = now; } };
const mem = setInterval(() => console.log('MEM', Math.round((Date.now() - t0) / 1000) + 's', Math.round(process.memoryUsage().rss / 1e6) + ' MB'), 20000);
try{
  const svc = createPlanService(null);
  const { plan } = await svc.plan({ start, flyers:1, n:2, days:3, hours:7, quota:2500, travel:'zones', split:'even', exact:true, must:[], zone:null, side:[], mainName:'Frankfurt',
    budget:{ strategy:'near-first', mode:'drive', tolerance:0, hours:32, driveMin:+(process.env.DMIN || 15), maxFlyers:100000 } }, stage, () => false);
  stage('done');
  const b = plan.budget, v = b.drive;
  console.log(JSON.stringify({ seconds:Math.round((Date.now() - t0) / 1000), stages, stop:v.stop, full_min:v.full_min, mailboxes:plan.mailboxes, total_h:h(b.actual_minutes), ride_h:h(b.travel.minutes),
    villages:(v.villages || []).length, workers:plan.routes.map(r => ({ w:r.w + 1, total_h:h(r.minutes), mb:Math.round(r.mailboxes), km:Math.round(r.length_m / 100) / 10 })) }, null, 1));
}catch(e){ console.log('ERROR', String(e && e.stack || e).slice(0, 1500)); console.log(JSON.stringify(stages)); }
clearInterval(mem); process.exit(0);
