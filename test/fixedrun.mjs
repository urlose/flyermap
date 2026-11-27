// Fixed print run (27.11.2026): the plan is always compared with the ordered number – "Geplant X von Y · offen Z" – with the reason
// when it is known: the hours are used up, there are no more addresses, or the next street would have exceeded the print run.
// Synthetic street grid, no network.   node test/fixedrun.mjs
import assert from 'node:assert/strict';
import Planner from '../admin/planner.js';
import { createPlanService } from '../worker/src/plancore.js';
import { outwardStreetOrder } from '../worker/src/nearfirst.js';
import { T, t, I } from '../worker/src/i18n.js';
import '../worker/src/i18n_en.js';
import '../worker/src/i18n6.js';
I.lang = 'de';
globalThis.fetch = async () => { throw new Error('network disabled'); };

const start = [48.46, 10.21], pts = [], edges = [], adj = [], latM = 1 / 111320, lngM = 1 / (111320 * Math.cos(start[0] * Math.PI / 180));
for(let y = 0; y <= 6; y++) for(let x = 0; x <= 6; x++){ pts.push([start[0] + y * 90 * latM, start[1] + x * 90 * lngM]); adj.push([]); }
const id = (x, y) => y * 7 + x;
for(let y = 0; y <= 6; y++) for(let x = 0; x <= 6; x++) for(const [xx, yy] of [[x + 1, y], [x, y + 1]]){
  if(xx > 6 || yy > 6) continue;
  const a = id(x, y), b = id(xx, yy), mb = 12 + ((x * 7 + y * 3) % 5) * 4;   // 12–28 mailboxes per street piece
  const e = { a, b, len:90, coords:[pts[a], pts[b]], mb, boxes:[[(pts[a][0] + pts[b][0]) / 2, (pts[a][1] + pts[b][1]) / 2, mb]], name:'R' };
  const k = edges.push(e) - 1; adj[a].push({ e:k, to:b }); adj[b].push({ e:k, to:a });
}
const total = edges.reduce((a, e) => a + e.mb, 0);
const graph = { pts, edges, adj, radius:Planner.MAX_R, mailboxes:total, usable:total, street_m:edges.length * 90 };
Planner.loadForFlyers = async () => graph;
const plan = async (flyers, hours) => (await createPlanService(null).plan({ fixedNear:true, start, flyers, n:2, days:1, hours, must:[], zone:null, side:[], quota:2500,
  bike:false, travel:'zones', split:'even', exact:true, mainAll:false, cores:false, mainName:'Ort', budget:null }, () => {}, () => false)).plan;

// 1. Shortfall under 2 %: the next street has more mailboxes than what is left of the order
{
  const order = outwardStreetOrder(graph, start).streets; let sum = 0, k = 0;
  while(sum < total * 0.6){ sum += order[k].mailboxes; k++; }
  const ordered = Math.round(sum) + 3;   // 3 more than the prefix; every street has ≥ 12
  const f = (await plan(ordered, 40)).budget.fixed;
  assert.equal(f.ordered, ordered); assert.equal(f.planned, Math.round(sum), 'planned = streets that fit: ' + JSON.stringify(f));
  assert.equal(f.missing, 3); assert.ok(f.missing_pct < 2, 'under 2 %: ' + f.missing_pct);
  assert.equal(f.reason, 'street'); assert.equal(f.short, false, 'a few mailboxes short is no warning');
  assert.equal(t('fixLine', { p:'6.100', o:'6.155', m:'55' }), 'Geplant 6.100 von 6.155 · offen 55');
}
// 2. Not enough addresses although the time is enough: everything reachable is planned
{
  const f = (await plan(total * 2, 80)).budget.fixed;
  assert.equal(f.reason, 'addresses', JSON.stringify(f)); assert.ok(f.short);
  assert.equal(f.ordered, total * 2); assert.ok(f.planned > total * 0.9 && f.planned <= total, 'all reachable mailboxes: ' + f.planned + ' of ' + total);
  assert.equal(f.missing, f.ordered - f.planned);
}
// 3. The hours are used up
{
  const f = (await plan(total, 1)).budget.fixed;
  assert.equal(f.reason, 'hours', JSON.stringify(f)); assert.ok(f.short && f.missing > 0 && f.planned < total);
}
// 4. Everything planned: no missing, no reason
{
  const order = outwardStreetOrder(graph, start).streets; let sum = 0; for(let k = 0; k < 10; k++) sum += order[k].mailboxes;
  const f = (await plan(Math.round(sum), 40)).budget.fixed;
  assert.equal(f.missing, 0, JSON.stringify(f)); assert.equal(f.reason, null); assert.equal(t('fixFull', { o:'6.155' }), 'Geplant 6.155 von 6.155');
}
for(const lang of ['de', 'ru', 'en']) for(const k of ['fixLine', 'fixFull', 'fixWhy_hours', 'fixWhy_addresses', 'fixWhy_street']) assert.ok(T[lang][k], lang + ' ' + k);
console.log('fixed print run: planned vs ordered with reason – 4 cases OK');
