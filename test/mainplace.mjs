// Main place of an order with a fixed print run (27.11.2026): chosen by the walking way from the flag, not by size.
// node test/mainplace.mjs
import assert from 'node:assert/strict';
import { chooseMainPlace, NEAR_M } from '../worker/src/zensus.js';
import { outwardStreetOrder } from '../worker/src/nearfirst.js';

// small helper graph: points [lat, lng], edges { a, b, mb } with real lengths
const M = 1 / 111320, at = (n, e) => [52 + n * M, 8 + e * M / Math.cos(52 * Math.PI / 180)];
const graph = (pts, es) => {
  const len = (a, b) => 111320 * Math.hypot(b[0] - a[0], (b[1] - a[1]) * Math.cos(a[0] * Math.PI / 180));
  const edges = es.map(([a, b, mb]) => ({ a, b, mb, len:len(pts[a], pts[b]), coords:[pts[a], pts[b]] })), adj = pts.map(() => []);
  edges.forEach((e, i) => { adj[e.a].push({ e:i, to:e.b }); adj[e.b].push({ e:i, to:e.a }); });
  return { pts, edges, adj };
};
const streetsOf = (g, start) => outwardStreetOrder(g, start, { isolatedGapM:Infinity }).streets.map(q => ({ distance:q.distance, mid:g.edges[q.i].coords[0].map((v, k) => (v + g.edges[q.i].coords[1][k]) / 2) }));
const area = (name, households, test) => ({ name, households, centre:[0, 0], lives:(la, lo) => test(la, lo), inside:(la, lo) => test(la, lo) });

// 1. The flag stands in a small residential area; a much bigger town begins 900 m away (Löhne: Obernbeck vs Mennighüffen–Werste).
{
  const pts = [at(0, 0), at(0, 80), at(0, 160), at(0, 900), at(0, 1000)];
  const g = graph(pts, [[0, 1, 10], [1, 2, 12], [2, 3, 0], [3, 4, 40]]);
  const small = area('Obernbeck', 800, (la, lo) => lo < at(0, 300)[1]), big = area('Mennighüffen', 20000, (la, lo) => lo > at(0, 850)[1]);
  const c = chooseMainPlace([big, small], streetsOf(g, pts[0]));   // biggest first, as placeMasks returns them
  assert.equal(c.mask.name, 'Obernbeck', 'the area at the flag, not the bigger neighbour');
  assert.equal(c.rule, 'at-start'); assert.equal(c.walkFrom, null, 'the walk begins at the flag');
}
// 2. Houses 150 m north of the flag, but a railway between and the crossing far away (2 km on foot); 600 m south on foot is
//    the other part of town. The flag stands at a warehouse: the place nearest ON FOOT is taken, from its nearest street.
{
  const pts = [at(0, 0), at(0, 1000), at(150, 1000), at(150, 0), at(150, 80), at(-600, 0), at(-680, 0)];
  // 0 flag → east along the tracks 1 km → crossing → back west 1 km on the north side → houses at 150 m north of the flag
  const g = graph(pts, [[0, 1, 0], [1, 2, 0], [2, 3, 0], [3, 4, 30], [0, 5, 0], [5, 6, 25]]);
  const north = area('Nord', 500, la => la > at(100, 0)[0]), south = area('Süd', 400, la => la < at(-500, 0)[0]);
  const c = chooseMainPlace([north, south], streetsOf(g, pts[0]));
  assert.ok(600 > NEAR_M, 'test premise: nothing within NEAR_M on foot');
  assert.equal(c.mask.name, 'Süd', 'not the houses across the tracks (150 m straight, 2 km on foot)');
  assert.equal(c.rule, 'nearest-on-foot');
  assert.ok(c.walkFrom && c.walkFrom[0] < at(-500, 0)[0], 'the walk begins at the nearest street of that place');
}
// 3. Industrial estate: a farm (20 households) 450 m away on foot, the town 900 m: the farm is no place to start an order.
{
  const pts = [at(0, 0), at(450, 0), at(480, 0), at(0, 900), at(0, 980)];
  const g = graph(pts, [[0, 1, 0], [1, 2, 3], [0, 3, 0], [3, 4, 60]]);
  const farm = area('Hof', 20, la => la > at(400, 0)[0]), town = area('Stadt', 3000, (la, lo) => lo > at(0, 850)[1]);
  const c = chooseMainPlace([town, farm], streetsOf(g, pts[0]));
  assert.equal(c.mask.name, 'Stadt'); assert.equal(c.rule, 'nearest-on-foot');
}
// 4. No street of any area reachable: the old choice (biggest) stays.
{
  const pts = [at(0, 0), at(0, 50)], g = graph(pts, [[0, 1, 0]]);
  const c = chooseMainPlace([area('A', 900, () => false), area('B', 100, () => false)], streetsOf(g, pts[0]));
  assert.equal(c.mask.name, 'A'); assert.equal(c.rule, 'biggest');
}
console.log('main place by walking way: 4 cases passed');
