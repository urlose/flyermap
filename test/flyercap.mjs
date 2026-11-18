// Smaller print run (worker/src/flyercap.js): allocation per place and which mailboxes stay. Run: node test/flyercap.mjs
import assert from 'node:assert/strict';
import { allocate, capPlan, chooseKeep, plannedBoxes } from '../worker/src/flyercap.js';
import { cellOf } from '../worker/src/zensus.js';

const sum = q => Object.values(q).reduce((a, b) => a + b, 0);
const C = { main:{ n:1000, main:true }, A:{ n:600 }, B:{ n:300 }, C:{ n:50 } };
let q = allocate(C, 1950);
assert.deepEqual(q, { main:1000, A:600, B:300, C:50 }, 'target above the plan: nothing cut');
q = allocate(C, 1700);
assert.equal(Math.round(sum(q)), 1700); assert.equal(q.main, 1000, 'main town untouched');
assert.ok(q.A < 600 && q.B === 300 && q.C === 50, 'the largest nearby place is cut first: ' + JSON.stringify(q));
q = allocate(C, 1400);
assert.equal(Math.round(sum(q)), 1400); assert.equal(q.main, 1000);
assert.ok(Math.abs(q.A - q.B) < 1e-6 && q.C === 50, 'A and B down to a common level: ' + JSON.stringify(q));
q = allocate(C, 1160);
assert.equal(q.main, 1000); assert.ok(q.A >= 90 && q.B >= 45 && q.C >= 20, 'presence kept (15 %, at least 20): ' + JSON.stringify(q));
q = allocate(C, 1050);
assert.equal(Math.round(sum(q)), 1050); assert.equal(q.main, 1000, 'presence goes before the main town is touched');
q = allocate(C, 600);
assert.equal(Math.round(sum(q)), 600); assert.ok(q.main === 600 && q.A === 0, 'only then the main town');

// boxes along a line north of the start: main town near, village A 3 km away
const start = [48.45, 10.22], at = (m, w = 1) => [start[0] + m / 111320, start[1], w];
const routes = [{ mailboxes:200, boxes:[...Array(100)].map((_, i) => at(i * 5)) }, { mailboxes:100, boxes:[...Array(100)].map((_, i) => at(3000 + i * 5)) }];
const cells = m => { const out = []; for(let i = 0; i < 6; i++){ const [a, b] = cellOf(...at(m + i * 100)); out.push(a, b); } return out; };
const places = [{ id:'M', lat:at(200)[0], lng:start[1], cells:cells(0) }, { id:'A', lat:at(3200)[0], lng:start[1], cells:cells(3000) }];
assert.equal(Math.round(plannedBoxes(routes).reduce((s, b) => s + b.w, 0)), 300, 'route mailboxes spread over the boxes');
const r = capPlan(routes, places, start, 230);
const rep = Object.fromEntries(r.report.map(x => [x.id, x]));
assert.equal(rep.M.full, 200); assert.equal(rep.M.keep, 200, 'main town keeps all');
assert.ok(rep.A.keep <= 30 && rep.A.keep >= 28, 'village cut to the rest: ' + rep.A.keep);
assert.ok([...r.keep].length && rep.M.keep + rep.A.keep <= 230, 'planned total within the target');
// inside a place the farthest go first
const keptA = routes[1].boxes.filter(b => r.keep.has((+b[0]).toFixed(6) + ',' + (+b[1]).toFixed(6)));
assert.ok(keptA.every(b => b[0] <= routes[1].boxes[keptA.length][0]), 'the nearest streets of the village stay');
// a big building that does not fit ends the place (no holes)
const keep = chooseKeep([{ k:'1', p:at(10), w:5, place:'X' }, { k:'2', p:at(20), w:50, place:'X' }, { k:'3', p:at(30), w:5, place:'X' }], { X:20 }, start);
assert.deepEqual([...keep], ['1']);
console.log('all ok');
