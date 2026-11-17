import assert from 'node:assert/strict';
import { customerGeoJSON } from '../worker/src/customerexport.js';

// synthetic coordinates only: metres east/north of an invented origin
const LA0 = 50, LO0 = 8, KX = 111320 * Math.cos(LA0 * Math.PI / 180), KY = 110540;
const P = (x, y) => [LA0 + y / KY, LO0 + x / KX];                       // [lat, lng] like the app
const box = (x, y, n = 2) => [...P(x, y), n];
const street = (x0, y0, x1, y1, step = 20) => { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step), o = [];
  for(let i = 0; i <= n; i++) o.push(box(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n)); return o; };
const polys = g => g.features[0].geometry.coordinates;
const inRing = ([lo, la], r) => { let c = false; for(let i = 0, j = r.length - 1; i < r.length; j = i++){
  const a = r[i], b = r[j]; if((a[1] > la) !== (b[1] > la) && lo < (b[0] - a[0]) * (la - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const covers = (g, x, y) => { const [la, lo] = P(x, y); return polys(g).some(p => inRing([lo, la], p[0]) && !p.slice(1).some(h => inRing([lo, la], h))); };
const ringArea = r => { let a = 0; for(let i = 0; i < r.length - 1; i++) a += (r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]); return a / 2 * KX * KY; };
const totalArea = g => polys(g).reduce((s, p) => s + ringArea(p[0]) - p.slice(1).reduce((t, h) => t + Math.abs(ringArea(h)), 0), 0);
const valid = g => { for(const p of polys(g)) p.forEach((r, i) => {
  assert.ok(r.length >= 4, 'ring has at least 4 points');
  assert.deepEqual(r[0], r.at(-1), 'ring is closed');
  assert.ok(r.every(c => c.length === 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])), 'finite [lng, lat]');
  assert.ok(i === 0 ? ringArea(r) > 0 : ringArea(r) < 0, 'outer ring counter-clockwise, holes clockwise');
}); };
const task = { title:'Beispielauftrag', est_mailboxes:40, work_hours:7, created_by:'private', company_id:'firm-secret' };

// 1. nothing internal leaves the app
{
  const routes = [
    { id:'plan-secret-1', mailboxes:20.5, worker_id:'worker-secret', minutes:540, status:'accepted', work_dates:['2026-11-20'], committed_terms:'terms-secret',
      days:[{ minutes:540, budget_h:32 }], steps:[[0, 'start', 'Geheimstraße']], skipped:['skip-secret'], boxes:street(0, 0, 300, 0) },
    { id:'plan-secret-2', mailboxes:15, worker_id:'other-secret', minutes:470, boxes:street(0, 60, 300, 60) }
  ];
  const data = customerGeoJSON(task, routes);
  assert.equal(data.type, 'FeatureCollection');
  assert.equal(data.features.length, 1);
  assert.deepEqual(Object.keys(data.features[0]).sort(), ['geometry', 'properties', 'type']);
  assert.deepEqual(Object.keys(data.features[0].properties).sort(), ['approximateArea', 'estimatedFlyers', 'title']);
  assert.equal(data.features[0].properties.estimatedFlyers, 36);
  assert.equal(data.features[0].geometry.type, 'MultiPolygon');
  const json = JSON.stringify(data);
  for(const secret of ['worker-secret', 'other-secret', 'plan-secret', 'firm-secret', 'terms-secret', 'skip-secret', 'Geheimstraße', 'created_by', 'work_hours', 'minutes', 'budget', '540', '470', '2026-11-20'])
    assert.ok(!json.includes(secret), secret);
  valid(data);
  assert.equal(customerGeoJSON(task, []).features[0].properties.estimatedFlyers, 40);
  assert.deepEqual(polys(customerGeoJSON(task, [])), []);
  assert.deepEqual(polys(customerGeoJSON(task, [{ mailboxes:5 }, null, { boxes:'x', path:[[1, 2]] }])), []);
}

// 2. L-shaped area: the empty inside of the L is not part of the territory (a convex hull would fill it)
{
  const g = customerGeoJSON(task, [{ mailboxes:200, boxes:[...street(0, 0, 1000, 0), ...street(0, 0, 0, 1000)] }]);
  valid(g);
  assert.equal(polys(g).length, 1);
  assert.ok(covers(g, 500, 0) && covers(g, 0, 500) && covers(g, 990, 10) && covers(g, 10, 990), 'both streets are covered');
  assert.ok(!covers(g, 400, 400) && !covers(g, 250, 250) && !covers(g, 150, 150), 'inside of the L stays empty');
  assert.ok(!covers(g, 500, 70) && !covers(g, 500, -70), 'not wider than about 50 m beside the street');
  assert.ok(covers(g, 500, 25) && covers(g, 500, -25), 'houses on both sides of the street are inside');
  const a = totalArea(g);
  assert.ok(a > 120000 && a < 220000, 'area follows the streets: ' + Math.round(a) + ' m², hull would be 500000');
}

// 3. streets around a large empty block: the block stays open; a small courtyard is closed
{
  const loop = s => [...street(0, 0, s, 0), ...street(s, 0, s, s), ...street(s, s, 0, s), ...street(0, s, 0, 0)];
  const big = customerGeoJSON(task, [{ mailboxes:300, boxes:loop(400) }]);
  valid(big);
  assert.equal(polys(big).length, 1);
  assert.equal(polys(big)[0].length, 2, 'one hole');
  assert.ok(!covers(big, 200, 200), 'middle of the large block is not territory');
  assert.ok(covers(big, 200, 0) && covers(big, 400, 200));
  const small = customerGeoJSON(task, [{ mailboxes:60, boxes:loop(120) }]);
  valid(small);
  assert.equal(polys(small)[0].length, 1, 'no hole for a courtyard');
  assert.ok(covers(small, 60, 60));
}

// 4. two separate quarters: two areas, nothing in between
{
  const g = customerGeoJSON(task, [{ mailboxes:100, boxes:[...street(0, 0, 300, 0), ...street(2000, 0, 2300, 0)] }]);
  valid(g);
  assert.equal(polys(g).length, 2);
  assert.ok(covers(g, 150, 0) && covers(g, 2150, 0) && !covers(g, 1100, 0));
  assert.ok(polys(g)[0][0][0][0] < polys(g)[1][0][0][0], 'areas sorted west to east');
}

// 5. ride between two towns is not territory (with mailbox points and with the route line only)
{
  const townA = street(0, 0, 400, 0), townB = street(9000, 3000, 9400, 3000);
  const path = [...townA.map(b => [b[0], b[1]]), [...P(9000, 3000), 1], ...townB.slice(1).map(b => [b[0], b[1]])];
  for(const plan of [{ mailboxes:80, boxes:[...townA, ...townB], path }, { mailboxes:80, path }]){
    const g = customerGeoJSON(task, [plan]);
    valid(g);
    assert.equal(polys(g).length, 2);
    assert.ok(covers(g, 200, 0) && covers(g, 9200, 3000), 'both towns');
    for(const k of [.1, .3, .5, .7, .9]) assert.ok(!covers(g, 400 + 8600 * k, 3000 * k), 'ride is not covered at ' + k);
  }
  // mailbox points win over the line: a walk without delivery is not territory
  const g = customerGeoJSON(task, [{ mailboxes:10, boxes:street(0, 0, 100, 0), path:[P(0, 0), P(100, 0), P(100, 800)] }]);
  assert.ok(covers(g, 50, 0) && !covers(g, 100, 500));
  // a point without mailboxes is not served
  assert.ok(!covers(customerGeoJSON(task, [{ boxes:[box(0, 0, 3), box(600, 0, 0)] }]), 600, 0));
}

// 6. the split between distributors is invisible: 1, 2 or 5 routes over the same streets give the same file
{
  const all = [...street(0, 0, 800, 0), ...street(0, 100, 800, 100), ...street(0, 200, 800, 200), ...street(1500, 0, 1500, 600)];
  const split = n => Array.from({ length:n }, (_, w) => ({ worker_id:'w' + w, mailboxes:w ? 0 : 500, boxes:all.filter((_, i) => i % n === w) }));
  const one = JSON.stringify(customerGeoJSON(task, split(1)));
  assert.equal(JSON.stringify(customerGeoJSON(task, split(2))), one);
  assert.equal(JSON.stringify(customerGeoJSON(task, split(5))), one);
  assert.equal(JSON.stringify(customerGeoJSON(task, split(5).reverse())), one, 'order of the routes does not matter');
  // neighbouring streets of different distributors merge into one area without an inner border
  const byStreet = [{ boxes:street(0, 0, 800, 0) }, { boxes:street(0, 60, 800, 60) }];
  assert.equal(polys(customerGeoJSON(task, byStreet)).length, 1);
}

// 7. size of a real order: 3 000 mailbox points over 10 km
{
  const boxes = []; for(let i = 0; i < 3000; i++) boxes.push(box((i * 37) % 10000, Math.floor(i / 60) * 160 + (i % 7) * 9));
  const t0 = Date.now(), g = customerGeoJSON(task, [{ mailboxes:6000, boxes }]);
  valid(g);
  assert.ok(Date.now() - t0 < 5000, 'fast enough: ' + (Date.now() - t0) + ' ms');
  assert.ok(JSON.stringify(g).length < 2e6, 'file stays small');
}
console.log('Customer export: one territory along the served streets, no hull, no staff split, no private data');
