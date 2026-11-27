// Leipheim snapshot (offline): per worker and day – flyers, hours, km on foot, places; rides; compactness of the workers' areas.
// node test/drive-layout-report.mjs [--json]   (same scenario as test/leipheim-drive-snapshot.mjs)
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const file = new URL('./fixtures/leipheim-drive-2026-11-20.json.gz', import.meta.url).pathname;
const keyOf = (url, init) => (init && init.method || 'GET') + ' ' + url + ' ' + createHash('sha1').update(String(init && init.body || '')).digest('hex').slice(0, 16);
const snap = JSON.parse(gunzipSync(readFileSync(file)).toString());
globalThis.fetch = async (url, init) => { const x = snap.requests[keyOf(String(url), init)]; if(!x) throw new Error('not in the snapshot: ' + String(url).slice(0, 80)); if(x.err) throw new Error(x.err);
  return new Response(Buffer.from(x.b, 'base64'), { status:x.s, headers:{ 'content-type':x.t } }); };
const { createPlanService } = await import('../worker/src/plancore.js');
const start = [48.460716, 10.212487], h = m => Math.round(m / 6) / 10;
const { plan } = await createPlanService(null).plan({ start, flyers:1, n:2, days:+(process.env.DAYS || 3), hours:+(process.env.HPD || 9), quota:+(process.env.QUOTA || 2500), travel:'zones', split:'even', exact:true, must:[], zone:null, side:[], mainName:'Leipheim',
  budget:{ strategy:'near-first', mode:'drive', tolerance:0, hours:+(process.env.TEAM_H || 32), driveMin:15, maxFlyers:10000 } }, () => {}, () => false);
const seg = (a, b) => 111320 * Math.hypot(b[0] - a[0], (b[1] - a[1]) * Math.cos(a[0] * Math.PI / 180));
export function layoutStats(plan){
  const workers = plan.routes.map(r => {
    const days = (r.days || []).map((d, k) => { let walk = 0; for(let i = d.i0 + 1; i <= d.i1; i++) if(r.path[i][2] !== 1) walk += seg(r.path[i - 1], r.path[i]);
      const places = [...new Set(r.parts.filter(p => p.i1 > d.i0 && p.i0 < d.i1).map(p => p.place + ' ' + p.part))];
      return { day:k + 1, flyers:d.mailboxes, minutes:d.minutes, hours:h(d.minutes), km_walk:Math.round(walk / 100) / 10, places }; });
    // spread: mean distance of the worker's delivery points (boxes) to their centre, and the convex hull area (km²)
    const bx = r.boxes || []; const c = bx.reduce((s, b) => [s[0] + b[0] / bx.length, s[1] + b[1] / bx.length], [0, 0]);
    const spread = bx.length ? Math.round(bx.reduce((s, b) => s + seg(c, b), 0) / bx.length) : 0;
    return { w:r.w + 1, flyers:Math.round(r.mailboxes), hours:h(r.minutes), minutes:r.minutes, work_minutes:r.work_minutes, ride_minutes:r.ride_minutes, walk_h:h(r.work_minutes), ride_h:h(r.ride_minutes), rides:r.jumps.filter(j => !j.walk).length,
      spread_m:spread, parts:r.parts.map(p => p.place + ' ' + p.part), days };
  });
  // boxes given twice (same point in two routes)
  const seen = new Map(); let dup = 0; plan.routes.forEach((r, w) => (r.boxes || []).forEach(b => { const k = (+b[0]).toFixed(6) + ',' + (+b[1]).toFixed(6); if(seen.has(k) && seen.get(k) !== w) dup++; seen.set(k, w); }));
  // overlap: share of worker A's boxes closer than 120 m to a box of worker B
  const near = (A, B) => { if(!A.length || !B.length) return 0; const g = new Map(), cell = 0.0012, key = (a, b) => Math.floor(a / cell) + ':' + Math.floor(b / cell);
    B.forEach(b => { const k = key(b[0], b[1]); if(!g.has(k)) g.set(k, []); g.get(k).push(b); });
    let n = 0; for(const a of A){ const cy = Math.floor(a[0] / cell), cx = Math.floor(a[1] / cell); let f = false;
      for(let dy = -1; dy <= 1 && !f; dy++) for(let dx = -1; dx <= 1 && !f; dx++) for(const b of g.get((cy + dy) + ':' + (cx + dx)) || []) if(seg(a, b) < 120){ f = true; break; } if(f) n++; }
    return n / A.length; };
  const ov = plan.routes.length > 1 ? Math.round(near(plan.routes[0].boxes || [], plan.routes[1].boxes || []) * 100) : 0;
  return { flyers:plan.mailboxes, team_limit_minutes:plan.budget.max_minutes, total_h:h(plan.budget.actual_minutes), total_minutes:plan.budget.actual_minutes, rides:plan.budget.travel.moves, dup_boxes:dup, overlap_pct:ov, workers };
}
const s = layoutStats(plan);
if(process.argv.includes('--json')) console.log(JSON.stringify(s));
else { console.log(`Flyer ${s.flyers} · ${s.total_h} h · Autofahrten ${s.rides} · doppelte Adressen ${s.dup_boxes} · Überlappung P1/P2 ${s.overlap_pct} %`);
  for(const w of s.workers){ console.log(`Person ${w.w}: ${w.flyers} Flyer · ${w.hours} h (zu Fuß ${w.walk_h}, Auto ${w.ride_h}, ${w.rides} Fahrten) · Streuung ${w.spread_m} m`);
    for(const d of w.days) console.log(`   Tag ${d.day}: ${d.flyers} Flyer · ${d.hours} h · ${d.km_walk} km zu Fuß · ${d.places.join(', ')}`); } }
