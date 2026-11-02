// "Not needed": a dead-end road without houses is skipped – progress counts it, the rerouted rest of the day leaves it out.
// Run: node test/skip.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const P = require('../admin/planner.js');
const { rerouteDay, addSkips, checkpoints } = await import('../worker/src/nav.js');
let fail = 0; const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if(!ok) fail++; };
const M = 1 / 111320, K = 1 / (111320 * Math.cos(50 * Math.PI / 180)), at = (x, y) => [50 + y * M, 11 + x * K];
// main street east 600 m; at x=200 a 300 m dead end to the south and back; then on to the east
const path = [at(0, 0), at(200, 0), at(200, -150), at(200, -300), at(200, -150), at(200, 0), at(400, 0), at(600, 0)];
const plan = { path, steps:[], days:[{ i0:0, i1:path.length - 1 }] };
const tr = P.makeTracker(path); let lp = null;
for(let x = 0; x <= 200; x += 6){ const p = at(x, 0); if(lp) tr.markLine(lp, p); else tr.mark(p); lp = p; }
const before = tr.pct();
// what the app sends: the open samples of the dead end (out and back), 8 m apart
const S = tr.samples, pts = S.filter(q => !tr.isDone(S.indexOf(q)) && Math.abs(q[1] - at(200, 0)[1]) < 15 * K && q[0] < at(0, -20)[0]);
plan.skipped = [{ pts }];
const tr2 = addSkips(P.makeTracker(path), plan); lp = null;
for(let x = 0; x <= 200; x += 6){ const p = at(x, 0); if(lp) tr2.markLine(lp, p); else tr2.mark(p); lp = p; }
check(tr2.pct() > before + 40, `progress counts the skipped dead end (${before} % → ${tr2.pct()} %)`);
const np = rerouteDay(plan, 0, i => tr2.isDone(i), at(200, 0), 90);
const south = (np || []).some(p => p[0] < at(0, -60)[0]);
check(np && np.length > 1 && !south, `rerouted rest of the day goes east, not into the dead end (${np ? np.length : 0} points)`);
const cps = checkpoints(plan, i => tr2.isDone(i));
check(cps.length > 0, `checkpoints still computed (${cps.length})`);
process.exit(fail ? 1 : 0);
