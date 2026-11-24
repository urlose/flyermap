// Regression: street selection must not fill an access ring from one side only (Frankfurt, Westerbachstraße 29: 2 people, 10 000 flyers).
// Streets are taken nearest first until the hours / flyers are used up, so the LAST ring is only partly taken. With ties of the distance
// broken by data order the part came from one side of the start. Rings stay strictly nearer first; inside a ring the directions take turns.
// Pure test on a synthetic road grid (no network): node test/nearfirst-direction.mjs
import assert from 'node:assert/strict';
import { outwardStreetOrder, directionOrder, sectorOf, RING_M, SECTORS } from '../worker/src/nearfirst.js';

// n x n junctions, 100 m apart, start in the middle; every street 100 m with 10 mailboxes. Edges are numbered row by row (south → north,
// west → east) like data from a tile: the index correlates with the direction, which is what made the old tie-break one-sided.
function grid(n, { wall = null } = {}){
  const S = [50, 8.6], dLat = 100 / 111320, dLng = 100 / (111320 * Math.cos(S[0] * Math.PI / 180)), mid = (n - 1) / 2;
  const pts = [], id = (r, c) => r * n + c;
  for(let r = 0; r < n; r++) for(let c = 0; c < n; c++) pts.push([S[0] + (r - mid) * dLat, S[1] + (c - mid) * dLng]);
  const edges = [], adj = pts.map(() => []);
  const add = (a, b) => {
    if(wall && wall(pts[a], pts[b], S)) return;
    const e = { a, b, len:100, mb:10, coords:[pts[a], pts[b]], boxes:[[(pts[a][0] + pts[b][0]) / 2, (pts[a][1] + pts[b][1]) / 2, 10]] };
    adj[a].push({ e:edges.length, to:b }); adj[b].push({ e:edges.length, to:a }); edges.push(e);
  };
  for(let r = 0; r < n; r++) for(let c = 0; c < n; c++){ if(c + 1 < n) add(id(r, c), id(r, c + 1)); if(r + 1 < n) add(id(r, c), id(r + 1, c)); }
  return { start:S, g:{ pts, edges, adj } };
}
const ringOf = s => Math.floor(s.distance / RING_M);
const sectorsTaken = (g, S, list) => { const t = new Array(SECTORS).fill(0); for(const s of list){ const e = g.edges[s.i]; t[sectorOf(S, e.boxes[0])] += s.mailboxes; } return t; };
const ahead = list => {   // [[sector took, sector with streets left]] pairs that break the turn order, by cumulative mailboxes
  const last = ringOf(list[list.length - 1]), cum = new Array(SECTORS).fill(0), took = new Array(SECTORS).fill(false), taken = new Set(list.map(s => s.i));
  const { g, S } = list.ctx; for(const s of list){ const k = sectorOf(S, g.edges[s.i].boxes[0]); cum[k] += s.mailboxes; if(ringOf(s) === last) took[k] = true; }
  const left = new Array(SECTORS).fill(false); for(const s of list.all) if(ringOf(s) === last && !taken.has(s.i)) left[sectorOf(S, g.edges[s.i].boxes[0])] = true;
  const bad = []; for(let a = 0; a < SECTORS; a++) for(let b = 0; b < SECTORS; b++) if(took[a] && left[b] && cum[a] > cum[b] + 10) bad.push([a, b]);
  return bad;
};
const oldOrder = streets => streets.slice().sort((a, b) => a.distance - b.distance || a.i - b.i);   // what main did

// 1. open grid: the cut falls inside a ring
{
  const { start, g } = grid(41);
  const { streets } = outwardStreetOrder(g, start);
  const old = oldOrder(streets);
  assert.equal(streets.length, old.length, 'same streets');
  assert.deepEqual(new Set(streets.map(s => s.i)), new Set(old.map(s => s.i)), 'a permutation: nothing added or dropped');
  for(let k = 1; k < streets.length; k++) assert.ok(ringOf(streets[k]) >= ringOf(streets[k - 1]), 'rings stay nearer first');
  const total = streets.reduce((a, s) => a + s.mailboxes, 0);
  for(const share of [.3, .45, .6]){
    let acc = 0, cut = 0; while(cut < streets.length && acc < total * share) acc += streets[cut++].mailboxes;
    const take = streets.slice(0, cut), takeOld = old.slice(0, cut), last = ringOf(take[take.length - 1]);
    for(const l of [take, takeOld]) l.ctx = { g, S:start }, l.all = streets;
    // every street of a nearer ring is in (priority of the near rings), identical in both orders
    const nearer = s => ringOf(s) < last;
    assert.deepEqual(new Set(take.filter(nearer).map(s => s.i)), new Set(takeOld.filter(nearer).map(s => s.i)), 'near rings unchanged at ' + share);
    assert.equal(take.filter(nearer).length, streets.filter(nearer).length, 'all nearer rings complete at ' + share);
    // invariant of the interleave: a direction that took a street of the last ring was not ahead of any direction that still has streets
    // left in that ring (by more than that one street) – directions that are used up are simply out
    assert.equal(ahead(take).length, 0, 'last ring: directions take turns (' + ahead(take) + ') at ' + share);
    console.log(`share ${share}: directions that got ahead of one with streets left   new ${ahead(take).length}   old ${ahead(takeOld).length}`);
  }
  // the old order really is one-sided on this data, otherwise the test above would prove nothing
  const total1 = total * .45; let a = 0, c = 0; while(a < total1) a += old[c++].mailboxes;
  const lastR = ringOf(old[c - 1]), oldLast = sectorsTaken(g, start, old.slice(0, c).filter(s => ringOf(s) === lastR));
  const takeOld = old.slice(0, c); takeOld.ctx = { g, S:start }; takeOld.all = streets;
  assert.ok(ahead(takeOld).length > 0, 'the old tie-break filled the last ring from one side: ' + oldLast);
}

// 2. a barrier (river / motorway) on the east: no street crosses x > start + 300 m, so the east has nothing near; the other
//    directions must not be starved and the selection must still reach everything the roads allow
{
  const { start, g } = grid(41, { wall:(p, q, S) => { const x = ((p[1] + q[1]) / 2 - S[1]) * Math.cos(S[0] * Math.PI / 180) * 111320; return x > 300 && x < 400; } });
  const { streets } = outwardStreetOrder(g, start);
  const total = streets.reduce((a, s) => a + s.mailboxes, 0);
  let acc = 0, cut = 0; while(acc < total * .4) acc += streets[cut++].mailboxes;
  const t = sectorsTaken(g, start, streets.slice(0, cut));
  assert.ok(t.every(v => v > 0), 'every direction that has streets gets some: ' + t);
  assert.ok(Math.max(...t) <= 2.2 * (t.reduce((x, y) => x + y, 0) / SECTORS), 'no direction takes over: ' + t);
  const eastFar = streets.filter(s => g.edges[s.i].boxes[0][1] > start[1] + 0.0045);   // beyond the wall (unreachable: the wall cuts the grid)
  assert.equal(eastFar.length, 0, 'the walled-off east is not reachable and not planned');
  console.log('barrier: taken per sector ' + t);
}

// 3. directionOrder on its own: rings first, interleave inside, deterministic, no street lost, empty input
{
  const items = [{ r:0, s:0, w:5 }, { r:0, s:0, w:5 }, { r:0, s:1, w:5 }, { r:1, s:2, w:5 }, { r:1, s:2, w:5 }, { r:1, s:3, w:5 }];
  const o = directionOrder(items, { ring:x => x.r, sector:x => x.s, weight:x => x.w, sectors:4 });
  assert.equal(o.length, items.length);
  assert.deepEqual(o.map(x => x.r), [0, 0, 0, 1, 1, 1]);
  assert.deepEqual(o.slice(0, 3).map(x => x.s), [0, 1, 0], 'sector 1 takes its turn before sector 0 takes a second street');
  assert.deepEqual(o.slice(3).map(x => x.s), [2, 3, 2], 'sectors that got nothing so far go first in the next ring (lowest number on a tie), then the rest');
  assert.deepEqual(directionOrder(items, { ring:x => x.r, sector:x => x.s, weight:x => x.w, sectors:4 }), o, 'deterministic');
  assert.deepEqual(directionOrder([], { ring:x => x, sector:x => 0, weight:x => 1 }), []);
}
console.log('all ok');
