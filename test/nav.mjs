// Navigation position: a small gap left behind must not pull the guidance back, and a street walked earlier that runs
// close by must not catch the walker. Run: node test/nav.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const P = require('../admin/planner.js');
const { makeNav } = await import('../worker/src/nav.js');
let fail = 0; const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if(!ok) fail++; };
const M = 1 / 111320, K = 1 / (111320 * Math.cos(52 * Math.PI / 180)), at = (x, y) => [52 + y * M, 8 + x * K];   // metres → lat/lng
// A: east 400 m along y=0, B: north 45 m, C: west 400 m along y=45 (parallel to A), D: north 300 m along x=0
const path = [at(0, 0), at(100, 0), at(200, 0), at(300, 0), at(400, 0), at(400, 45), at(300, 45), at(200, 45), at(100, 45), at(0, 45), at(0, 150), at(0, 345)];
const plan = { path, steps:[], days:[{ i0:0, i1:path.length - 1 }] };
const tr = P.makeTracker(path), nav = makeNav(plan); nav.setDoneCheck(i => tr.isDone(i));
let last = null;
const walk = (x0, y0, x1, y1, step = 6, gapFrom = null, gapTo = null) => {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step);
  for(let k = 1; k <= n; k++){
    const x = x0 + (x1 - x0) * k / n, y = y0 + (y1 - y0) * k / n + (gapFrom != null && x >= gapFrom && x <= gapTo ? -60 : 0);   // a piece not recorded on the street (detour / bad GPS)
    const p = at(x, y); if(last) tr.markLine(last, p); else tr.mark(p); last = p; nav.locate(p[0], p[1]);
  }
};
walk(0, 0, 400, 0, 6, 150, 230);           // street A, 80 m of it not recorded
walk(400, 0, 400, 45);                      // B
walk(400, 45, 250, 45);                     // first part of C (parallel to A, 45 m away)
const posC = nav.pos;
check(posC > 5.4 && posC < 7.2, `on street C after walking part of it (pos ${posC.toFixed(2)}, C = 5…9)`);
// the app is reopened: old way started at the first gap (street A); now the last fix decides
const nav2 = makeNav(plan); nav2.setDoneCheck(i => tr.isDone(i)); nav2.setPosFromSample(tr.nextIndex());
const oldPos = nav2.pos; nav2.locate(last[0], last[1], true); nav2.locate(last[0], last[1]);
check(oldPos < 3, `old behaviour: first gap is on street A (pos ${oldPos.toFixed(2)})`);
check(nav2.pos > 5.4 && nav2.pos < 7.2, `after reopening the guidance stays on C (pos ${nav2.pos.toFixed(2)})`);
walk(250, 45, 0, 45); walk(0, 45, 0, 200);
check(nav.pos > 9.4, `continues onto D, not back to the gap on A (pos ${nav.pos.toFixed(2)})`);
// off the route: distance reported, position kept
const before = nav.pos, r = nav.locate(...at(200, 150)); check(r.off > 50 && nav.pos === before, `off the route: ${r.off} m, position kept`);
// the end of the day runs back along the street walked first: walking that street must not jump to the end ("day done")
{
  const pth = [at(0, 0), at(0, 300), at(300, 300), at(300, 350), at(0, 350), at(0, 0)], pl = { path:pth, steps:[], days:[{ i0:0, i1:pth.length - 1 }] };
  const t2 = P.makeTracker(pth), n2 = makeNav(pl); n2.setDoneCheck(i => t2.isDone(i)); let lp = null;
  for(let y = 6; y <= 200; y += 6){ const p = at(0, y); if(lp) t2.markLine(lp, p); else t2.mark(p); lp = p; n2.locate(p[0], p[1]); }
  check(n2.pos < 1, `walking the first street: still at the beginning of the day (pos ${n2.pos.toFixed(2)}), not at its end`);
  check(!n2.next(0).lastOfDay, 'no "day done" there');
}
process.exit(fail ? 1 : 0);
