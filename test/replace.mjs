// Replacement streets: the reported piece is one street, the reserve near the walker replaces about as many mailboxes,
// and the route with the streets put in keeps days, steps and the tracker consistent. Run: node test/replace.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const P = require('../admin/planner.js');
const { makeNav, pieceAt, piecesBoxes, pickReserve, insertDetour } = await import('../worker/src/nav.js');
let fail = 0; const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if(!ok) fail++; };
const M = 1 / 111320, K = 1 / (111320 * Math.cos(52 * Math.PI / 180)), at = (x, y) => [52 + y * M, 8 + x * K];
// day 1: east 300 m along y=0, then north 200 m along x=300 (a turn); day 2: on to the north 200 m
const path = [at(0, 0), at(150, 0), at(300, 0), at(300, 100), at(300, 200), at(300, 300), at(300, 400)];
const plan = { path, days:[{ i0:0, i1:4 }, { i0:4, i1:6 }], steps:[[0, 'start', ''], [2, 'L', 'Nord'], [4, 'S', ''], [6, 'end', '']],
  boxes:[[...at(50, 10), 3], [...at(120, -12), 2], [...at(250, 8), 4], [...at(310, 150), 6]] };
const tr = P.makeTracker(path), nav = makeNav(plan);
const pc = pieceAt(tr.samples, i => tr.isDone(i), i => nav.dayAt(nav.posOf[i]) === 0, ...at(100, 5));
check(pc && pc.pts.length > 10, `piece found (${pc && pc.pts.length} samples)`);
const ends = pc ? [pc.pts[0], pc.pts[pc.pts.length - 1]] : [];
check(pc && Math.abs(ends[1][1] - at(300, 0)[1]) < 30 * K && Math.abs(ends[1][0] - at(300, 0)[0]) < 20 * M, 'piece ends at the turn (one street, not around the corner)');
const need = piecesBoxes(plan.boxes, pc.pts);
check(need === 9, `mailboxes along the piece: ${need} (3 + 2 + 4, not the 6 around the corner)`);
const reserve = [
  { p:[at(0, 80), at(150, 80)], mb:5 },          // 80 m away
  { p:[at(0, 250), at(150, 250)], mb:7 },        // 250 m away
  { p:[at(2000, 0), at(2100, 0)], mb:30 },       // too far
  { p:[at(140, 2), at(160, 2)], mb:4 },          // the reported street itself
];
const take = pickReserve(reserve, pc.pts, need, at(100, 5));
check(JSON.stringify(take) === '[0,1]', `nearest reserve until enough: ${JSON.stringify(take)}`);
const nd = insertDetour(plan, 0, take.map(i => reserve[i].p));
check(nd.path.length === path.length + 5 && nd.added === 5, `4 points + the way back put in (path ${path.length} → ${nd.path.length})`);
check(nd.days[0].i1 === 9 && nd.days[1].i0 === 9 && nd.days[1].i1 === 11, `days shifted: ${JSON.stringify(nd.days.map(d => [d.i0, d.i1]))}`);
check(nd.path[9][0] === path[4][0] && nd.path[9][2] === 1 && nd.path[9][3] === 'r' && nd.path[4][0] === path[4][0] && !nd.path[4][2], 'day ends at its old last point, reached by a walk over');
check(nd.path[5][2] === 1 && nd.path[5][3] === 'r' && nd.path[7][2] === 1, 'each replacement street begins with a walk over');
check(nd.steps[1][0] === 2 && nd.steps[2][0] === 9 && nd.steps[3][0] === 11, `steps shifted: ${nd.steps.map(s => s[0])}`);
check(nd.path[nd.days[1].i1][0] === path[6][0], 'day 2 still ends where it ended');
const tr2 = P.makeTracker(nd.path), nav2 = makeNav({ ...plan, ...nd });
const len = (nv, k) => nv.cum[nv.days[k].i1] - nv.cum[nv.days[k].i0];
check(Math.abs(len(nav2, 1) - len(nav, 1)) < 1, 'day 2 length unchanged');
check(Math.abs(len(nav2, 0) - len(nav, 0) - 300) < 2, `day 1 longer by the two streets only (+${Math.round(len(nav2, 0) - len(nav, 0))} m, no walk-over metres)`);
check(tr2.samples.length > tr.samples.length, 'tracker has samples on the new streets');
process.exit(fail ? 1 : 0);
