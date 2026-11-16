// Regression: fractional estimated mailboxes must never be submitted to integer DB columns.
// Run: node test/savecounts.mjs
import assert from 'node:assert/strict';
import { savedMailboxCounts } from '../worker/src/savecounts.js';
const check = (values, expectedTotal) => {
  const result = savedMailboxCounts(values.map(mailboxes => ({ mailboxes })));
  assert.equal(result.total, expectedTotal);
  assert.equal(result.routes.reduce((a, b) => a + b, 0), result.total);
  assert.ok(result.routes.every(Number.isInteger));
  assert.ok(result.routes.every(n => n >= 0));
  return result.routes;
};
assert.deepEqual(check([1381.5], 1382), [1382]);
assert.deepEqual(check([1381.5, 1381.5], 2763), [1382, 1381]);
assert.deepEqual(check([10.2, 10.2, 10.2, 10.2, 10.2], 51), [11, 10, 10, 10, 10]);
assert.deepEqual(check([0, 15, 12.25, 0.75], 28), [0, 15, 12, 1]);
assert.deepEqual(check([], 0), []);
assert.throws(() => savedMailboxCounts([{ mailboxes:NaN }]), /Invalid mailbox estimate/);
console.log('savecounts: 6 cases passed');
