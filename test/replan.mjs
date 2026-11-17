// Unit test of worker/src/replan.js with a fake Supabase client (no network, no database).
import assert from 'node:assert/strict';
import { atomicReplan, reportLines, replanErrorKey, rpcMissing } from '../worker/src/replan.js';
import { t } from '../worker/src/i18n.js';

const fakeSb = answers => {
  const calls = [];
  return { calls, rpc: async (name, args) => { calls.push({ name, args }); return answers.shift(); } };
};
const base = { taskId:'T', task:{ title:'x' }, plans:[{ idx:0, mailboxes:5 }], t };
const okData = { task:{ id:'T' }, plans:[{ id:'P', worker_id:'W' }], report:{} };

// nothing lost: dry run, then the real call, no question to the admin
{ let asked = 0; const sb = fakeSb([{ data:{ ...okData, dry_run:true, report:{ acceptances_reset:[], routes_removed:0 } } }, { data:okData }]);
  const r = await atomicReplan(sb, { ...base, confirm: async () => { asked++; return true; } });
  assert.equal(r.status, 'ok'); assert.equal(asked, 0); assert.equal(sb.calls.length, 2);
  assert.equal(sb.calls[0].args.p_dry_run, true); assert.ok(!('p_dry_run' in sb.calls[1].args));
  assert.equal(sb.calls[1].name, 'replan_task_with_plans'); assert.equal(sb.calls[1].args.p_task_id, 'T'); }

// something would be lost: the admin is asked; "no" means no real call
{ let text = ''; const sb = fakeSb([{ data:{ ...okData, report:{ acceptances_reset:[{ worker_id:'W', name:'Anna', reason:'more_days' }], sessions_without_route:2 } } }]);
  const r = await atomicReplan(sb, { ...base, confirm: async (title, txt) => { text = txt; return false; } });
  assert.equal(r.status, 'cancelled'); assert.equal(sb.calls.length, 1);
  assert.match(text, /Anna/); assert.match(text, /2/); }

// "yes": real call
{ const sb = fakeSb([{ data:{ ...okData, report:{ acceptances_reset:[{ worker_id:'W', name:'Anna', reason:'route_removed' }] } } }, { data:okData }]);
  const r = await atomicReplan(sb, { ...base, confirm: async () => true });
  assert.equal(r.status, 'ok'); assert.equal(sb.calls.length, 2); }

// migration not applied yet -> old way
{ const sb = fakeSb([{ error:{ code:'PGRST202', message:'Could not find the function public.replan_task_with_plans(p_dry_run, p_plans, p_task, p_task_id) in the schema cache' } }]);
  const r = await atomicReplan(sb, { ...base, confirm: async () => true });
  assert.equal(r.status, 'missing'); }

// server refusals become readable texts; nothing is saved
for(const [code, key] of [['replan_live', 'replanLive'], ['replan_done_route', 'replanDone'], ['task_not_open', 'replanClosed'], ['task_not_found', 'replanNotFound'], ['mailboxes_must_be_nonnegative_integers', 'replanBad']]){
  const sb = fakeSb([{ error:{ code:'P0001', message:code } }]);
  await assert.rejects(atomicReplan(sb, { ...base, confirm: async () => true }), e => e.message === t(key));
  assert.equal(sb.calls.length, 1);
}
// a shift that starts between dry run and real call is refused by the real call too
{ const sb = fakeSb([{ data:{ ...okData, report:{} } }, { error:{ code:'P0001', message:'replan_live' } }]);
  await assert.rejects(atomicReplan(sb, { ...base, confirm: async () => true }), e => e.message === t('replanLive')); }
// unknown errors pass through unchanged
{ const err = { code:'42501', message:'new row violates row-level security policy' }; const sb = fakeSb([{ error:err }]);
  await assert.rejects(atomicReplan(sb, { ...base, confirm: async () => true }), e => e === err); }
// empty answer is an error, not a silent success
{ const sb = fakeSb([{ data:{ report:{} } }, { data:{ task:null, plans:[] } }]);
  await assert.rejects(atomicReplan(sb, { ...base, confirm: async () => true }), e => e.message === t('replanBad')); }

// report texts
assert.deepEqual(reportLines(null, t), []);
assert.deepEqual(reportLines({ acceptances_reset:[], cancellations_unlinked:null, help_reports_unlinked:0 }, t), []);
const lines = reportLines({ acceptances_reset:[{ name:'Anna', reason:'not_walked' }, { name:null, reason:'route_removed' }], declined_offered_again:1, help_reports_unlinked:3, notifications_removed:2 }, t);
assert.equal(lines.length, 5);
assert.ok(lines.every(l => !/\{\w+\}/.test(l) && !/replan/.test(l)), lines.join('\n'));
assert.match(lines[0], /^Anna: /); assert.match(lines[1], new RegExp('^' + t('replanNoName')));
assert.equal(replanErrorKey({ message:'x' }), null);
assert.equal(rpcMissing({ code:'P0001', message:'replan_live' }), false);
console.log('replan.js: dry run first, admin asked only when something is lost, refusals readable, old way when the function is missing');
