// Saving an order (19.11.2026, Cem's report "1381.5 in task_plans.mailboxes"): every integer column of a route row is a
// whole number and the route counts add up to the order total – also for fractional estimates. Run: node test/save-integers.mjs
import assert from 'node:assert/strict';
import { savedMailboxCounts } from '../worker/src/savecounts.js';
import { planRows } from '../worker/src/budgetplan.js';
const routes = [
  { path:[[48.4, 10.2], [48.41, 10.21]], mailboxes:1381.5, minutes:453.7, length_m:12034.6, street_m:9876.4, days:[], parts:[], boxes:[] },
  { path:[[48.4, 10.2], [48.42, 10.22]], mailboxes:1381.5, minutes:401.2, length_m:11000.5, street_m:9000.5, days:[], parts:[], boxes:[] },
  { path:[[48.4, 10.2], [48.43, 10.23]], mailboxes:700.25, minutes:120, length_m:3000, street_m:2500, days:[], parts:[], boxes:[] }
];
const pl = { routes, mailboxes:routes.reduce((s, r) => s + r.mailboxes, 0), budget:{ hours:32, tolerance:0 } };
const c = savedMailboxCounts(routes), rows = planRows(pl, { taskId:null, assign:{}, counts:c.routes, colors:['#a', '#b', '#c'] });
for(const r of rows) for(const k of ['idx', 'mailboxes', 'minutes', 'length_m', 'street_m']) assert.ok(Number.isInteger(r[k]), k + ' must be whole: ' + r[k]);
assert.deepEqual(rows.map(r => r.mailboxes), [1382, 1381, 700], 'largest remainder, no half mailboxes');
assert.equal(rows.reduce((s, r) => s + r.mailboxes, 0), c.total, 'route counts add up to the order total');
assert.equal(c.total, Math.round(pl.mailboxes));
assert.throws(() => savedMailboxCounts([{ mailboxes:-1 }]), /Invalid/);
console.log('all ok');
