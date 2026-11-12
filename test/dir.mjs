// Direction rule of the progress tracker (new days): a crossing passed straight leaves the side streets open, the end of a
// street is done only when the walker gets there, a turn leaves no hole, noisy GPS beside the street still counts.
// Run: node test/dir.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const P = require('../admin/planner.js');
let fail = 0; const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if(!ok) fail++; };
const M = 1 / 111320, K = 1 / (111320 * Math.cos(52 * Math.PI / 180)), at = (x, y) => [52 + y * M, 8 + x * K];
const T0 = P.DIR_FROM + 3600e3; let clock = T0;
// A: west→east 300 m along y=0 with a crossing at x=150: side street north 100 m (out and back), then south 100 m (out and back)
const path = [at(0, 0), at(150, 0), at(150, 100), at(150, 0), at(150, -100), at(150, 0), at(300, 0)];
const S = P.densifyPath(path, 8), xy = q => [(q[1] - 8) / K, (q[0] - 52) / M];
const share = (tr, f) => { let n = 0, d = 0; S.forEach((q, i) => { const [x, y] = xy(q); if(f(x, y)){ n++; if(tr.isDone(i)) d++; } }); return n ? d / n : 1; };
const walk = (tr, pts, step = 5, noise = 0, old = false) => {
  let last = null, k = 0;
  for(let s = 1; s < pts.length; s++){
    const [x0, y0] = pts[s - 1], [x1, y1] = pts[s], n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step);
    for(let i = s === 1 ? 0 : 1; i <= n; i++){
      const nx = noise ? Math.sin(++k * 1.7) * noise : 0, ny = noise ? Math.cos(k * 2.3) * noise : 0;
      const p = at(x0 + (x1 - x0) * i / n + nx, y0 + (y1 - y0) * i / n + ny); clock += 4000; if(!old) p.push(clock);
      if(last) tr.markLine(last, p); else tr.addTrack([p]); last = p;
    }
  }
};
// 1) straight over the crossing
let tr = P.makeTracker(path); walk(tr, [[0, 0], [300, 0]]);
check(share(tr, (x, y) => Math.abs(y) < 1) === 1, 'street A is done after walking it straight');
check(share(tr, (x, y) => Math.abs(y) >= 8) === 0, `side streets stay open (${Math.round(100 * share(tr, (x, y) => Math.abs(y) >= 8))} % marked)`);
check(tr.runs().every(r => r.every(q => Math.abs(xy(q)[1]) < 5)), 'no green stub is drawn into the side streets');
// old days keep the old counting (25 m around the walker)
let tro = P.makeTracker(path); walk(tro, [[0, 0], [300, 0]], 5, 0, true);
check(share(tro, (x, y) => Math.abs(y) >= 8 && Math.abs(y) <= 20) === 1, 'points of old days: counted as before (first 20 m of the side streets marked)');
// 2) the end of a street: turned around 30 m before the end
tr = P.makeTracker(path); walk(tr, [[0, 0], [150, 0], [150, 70], [150, 0]]);
check(share(tr, (x, y) => x > 149 && y >= 82) === 0 && share(tr, (x, y) => x > 149 && y >= 70) < 0.5, 'turned around 30 m before the end: the end stays open');
check(share(tr, (x, y) => x > 149 && y > 1 && y <= 70) === 1, 'the walked part of the side street is done (both directions of the line)');
walk(tr, [[150, 0], [150, 100]]);
check(share(tr, (x, y) => x > 149 && y > 0) === 1, 'walked to the end: all done');
// 3) a turn leaves no hole at the corner
tr = P.makeTracker(path); walk(tr, [[0, 0], [150, 0], [150, 100]]);
check(share(tr, (x, y) => (Math.abs(y) < 1 && x <= 150) || (Math.abs(x - 150) < 1 && y >= 0)) === 1, 'turning at the crossing: no hole at the corner');
check(share(tr, (x, y) => x > 160 || y < -8) === 0, 'the streets not walked stay open');
// 4) GPS beside the street (sidewalk 12 m off) and noisy (± 6 m)
tr = P.makeTracker(path); walk(tr, [[0, 12], [300, 12]], 5, 6);
check(share(tr, (x, y) => Math.abs(y) < 1 && x > 10 && x < 290) >= 0.97, `noisy GPS 12 m beside the street still counts (${Math.round(100 * share(tr, (x, y) => Math.abs(y) < 1 && x > 10 && x < 290))} %)`);
check(share(tr, (x, y) => Math.abs(y) >= 30) === 0, 'and the side streets stay open');
// 5) points every 40 m (phone in the pocket)
tr = P.makeTracker(path); walk(tr, [[0, 0], [300, 0]], 40);
check(share(tr, (x, y) => Math.abs(y) < 1) === 1, 'sparse points (every 40 m) fill the street');
// 6) rebuilding from a stored track gives the same result as live marking
const pts = []; let c2 = T0; for(let x = 0; x <= 150; x += 5) pts.push([...at(x, 0), c2 += 4000]); for(let y = 5; y <= 100; y += 5) pts.push([...at(150, y), c2 += 4000]);
const a = P.makeTracker(path), b = P.makeTracker(path); a.addTrack(pts); for(let i = 0; i < pts.length; i++){ if(i) b.markLine(pts[i - 1], pts[i]); else b.addTrack([pts[0]]); }
check(a.pct() === b.pct() && a.pct() > 0, `stored track = live marking (${a.pct()} %)`);
// 7) the street not walked to its end is noticed (and nothing else)
const { openStraight, routePieces, rerouteDay } = await import('../worker/src/nav.js');
tr = P.makeTracker(path); walk(tr, [[0, 0], [150, 0], [150, 70]]);
const os = (x, y) => { const p = at(x, y); return openStraight(tr.samples, i => tr.isDone(i), () => true, p[0], p[1]); };
let c = os(150, 70);
check(c && c.d < 16 && c.len >= 24 && c.dir[1] > 0.9, `at 70 m of the 100 m side street: the open end lies straight ahead (${c && Math.round(c.d)} m away, ${c && c.len} m long)`);
c = os(150, 40); check(c && c.d > 30 && c.d < 50 && c.dir[1] > 0.9, `after turning around, 30 m back: still seen (${c && Math.round(c.d)} m behind)`);
walk(tr, [[150, 70], [150, 100]]); c = os(150, 100);
check(!c || c.d > 90, 'walked to the end: nothing open on this street any more');
c = os(150, 5); check(c && c.dir[1] < -0.9, 'back at the crossing: straight on over the crossing lies the south street');
// 8) the map pieces: every street once, missed piece orange
tr = P.makeTracker(path); walk(tr, [[0, 0], [150, 0], [150, 60], [150, 0], [300, 0]]);
let pp = routePieces({ path, days:[{ i0:0, i1:path.length - 1 }] }, tr, 0);
const lenOf = ls => Math.round(ls.reduce((a, l) => a + l.reduce((x, q, k) => x + (k ? P.dist(l[k - 1], q) : 0), 0), 0));
check(Math.abs(lenOf(pp.done) - 360) <= 20, `done: A (300 m) + 60 m of the north street, drawn once (${lenOf(pp.done)} m)`);
check(Math.abs(lenOf(pp.missed) - 132) <= 14 && lenOf(pp.today) === 0, `left out, each drawn once: the end of the north street and the south street the walker passed (${lenOf(pp.missed)} m of 132)`);
tr = P.makeTracker(path); walk(tr, [[0, 0], [150, 0], [150, 100]]); pp = routePieces({ path, days:[{ i0:0, i1:path.length - 1 }] }, tr, 0);
check(lenOf(pp.missed) === 0 && Math.abs(lenOf(pp.today) - 250) <= 12, `stopped in the middle of the route: the rest is "still to do", nothing is "left out" (${lenOf(pp.today)} m)`);
// 9) re-routing takes the end of a long street that was not walked (40 m of 100 m are less than half)
tr = P.makeTracker(path); walk(tr, [[0, 0], [150, 0], [150, 60], [150, 0], [300, 0]]);
const np = rerouteDay({ path, days:[{ i0:0, i1:path.length - 1 }] }, 0, i => tr.isDone(i), at(300, 0), null);
check(np && np.some(q => Math.abs(xy(q)[0] - 150) < 1 && xy(q)[1] > 95), 'the new order of the open streets leads to the end of the north street');
process.exit(fail ? 1 : 0);
