// FlyerMap AI, phase A (16.11.2026): server-side decision for a worker's help report – AUTO / NOTIFY / ESCALATE.
// Pure functions (no network, no database, no Claude): the same file runs in the edge functions (Deno) and in the tests
// (Node, test/help-rules.mjs). The rules themselves are DATA (supabase/help-rules/*.json, stored versioned in the table
// help_rule_sets); this file only applies them.
//
// Principles
// - Mandatory thresholds, notifications and the deadline check are decided HERE, in code. Claude (later, phase C) may only
//   add information or RAISE the mode; a proposal that would lower the mode is ignored (mergeClaude).
// - Unknown or unclear → ESCALATE to the admin (today's behaviour: the report stays open for the admin).
// - A company may have its own rule set; it can raise modes and change texts, but never lower a locked rule ("lock").
//   A company never gets the rule set of another company (pickRuleSet).
// - Phase A does not send anything to anybody: callers get a decision object, nothing else happens.

export const MODES = ['AUTO', 'NOTIFY', 'ESCALATE'];
const rank = m => MODES.indexOf(m);
export const maxMode = (a, b) => (rank(b) > rank(a) ? b : a);

// --- input ---------------------------------------------------------------------------------------------------------------
// optional number from the form ("about how many"): whole number 0 … amount_max, otherwise treated as missing
export function cleanAmount(v, max = 100000){
  if(v == null || v === '') return { amount:null, invalid:false };
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[\s.,'’]/g, ''));
  if(!Number.isInteger(n) || n < 0 || n > max) return { amount:null, invalid:true };
  return { amount:n, invalid:false };
}
const norm = s => String(s || '').toLowerCase().normalize('NFC');
const reCache = new Map();
const re = src => { if(!reCache.has(src)) reCache.set(src, new RegExp(src, 'iu')); return reCache.get(src); };

// calendar day in Berlin (deadline and "today" are Berlin days)
export function berlinDay(now = new Date()){
  const p = new Intl.DateTimeFormat('en-CA', { timeZone:'Europe/Berlin', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(now);
  const g = t => p.find(x => x.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}

// --- rule sets -----------------------------------------------------------------------------------------------------------
// sets: rows like help_rule_sets { company_id (null = default), key, version, status, rules }. Returns the active set of
// this company, else the active default. Never a set of another company.
export function pickRuleSet(sets, companyId){
  const act = (sets || []).filter(s => s && s.status === 'active');
  const own = companyId ? act.filter(s => s.company_id === companyId).sort((a, b) => b.version - a.version)[0] : null;
  const def = act.filter(s => s.company_id == null).sort((a, b) => b.version - a.version)[0];
  return own || def || null;
}

// checks a company set against the base (default) set: structure, known modes, thresholds, locks.
// → list of problems (empty = ok)
export function validateRuleSet(rules, base){
  const err = [];
  if(!rules || !Array.isArray(rules.rules)) return ['rules missing'];
  const ids = new Set();
  for(const r of rules.rules){
    if(!r.id) err.push('rule without id');
    if(ids.has(r.id)) err.push('duplicate rule ' + r.id); ids.add(r.id);
    if(!MODES.includes(r.mode)) err.push(r.id + ': unknown mode ' + r.mode);
    for(const k of ['text', 'detect']) if(r.match && r.match[k]) try{ re(r.match[k]); }catch{ err.push(r.id + ': bad pattern ' + k); }
    for(const k of ['lte', 'gt']) if(r.match && r.match.amount && r.match.amount[k] != null && !(r.match.amount[k] in (rules.thresholds || {}))) err.push(r.id + ': unknown threshold ' + r.match.amount[k]);
  }
  for(const [k, v] of Object.entries(rules.thresholds || {})) if(!(typeof v === 'number' && v >= 0)) err.push('threshold ' + k + ' must be a number ≥ 0');
  if(base) for(const b of base.rules.filter(x => x.lock)){
    const r = rules.rules.find(x => x.id === b.id);
    if(!r){ err.push(b.id + ': locked rule missing'); continue; }
    if(rank(r.mode) < rank(b.lock.min_mode)) err.push(b.id + ': mode below the locked minimum ' + b.lock.min_mode);
    if(b.lock.urgent && !r.urgent) err.push(b.id + ': must stay urgent');
    if(b.lock.fixed_reply && JSON.stringify(r.reply) !== JSON.stringify(b.reply)) err.push(b.id + ': reply is fixed (legal)');
  }
  return err;
}

// --- decision ------------------------------------------------------------------------------------------------------------
const thr = (rules, name) => (rules.thresholds || {})[name];
function structuredMatch(r, q, rules){
  const m = r.match || {};
  if(!m.reasons || !m.reasons.includes(q.reason)) return false;
  if(m.detail && q.detail !== m.detail) return false;
  if(m.amount){
    if(q.amount == null) return false;
    if(m.amount.lte != null && !(q.amount <= thr(rules, m.amount.lte))) return false;
    if(m.amount.gt != null && !(q.amount > thr(rules, m.amount.gt))) return false;
  }
  if(m.text && !re(m.text).test(q.text)) return false;
  return true;
}
// the worker's language if known, otherwise German + Russian (like today's automatic answers)
function forcedMatch(r, q, rules){
  const m = r.match || {};
  if(m.detail && q.detail !== m.detail) return false;
  if(m.amount){
    if(q.amount == null) return false;
    if(m.amount.lte != null && !(q.amount <= thr(rules, m.amount.lte))) return false;
    if(m.amount.gt != null && !(q.amount > thr(rules, m.amount.gt))) return false;
  }
  return true;
}
const replyIn = (reply, lang) => !reply ? null : lang && reply[lang] ? reply[lang] : [reply.de, reply.ru].filter(Boolean).join('\n');

// q: { reason, text, amount, detail, lang, company_id, worker_id, task_id, plan_id, deadline (YYYY-MM-DD|null), now (Date) }
// rules: the picked rule set (JSON). → decision (nothing is sent or stored by this function)
export function classify(q0, rules){
  const T = rules.thresholds || {};
  const { amount, invalid } = cleanAmount(q0.amount, T.amount_max);
  const q = { ...q0, reason:String(q0.reason || '').trim(), text:norm(q0.text), amount, detail:['short', 'leftover'].includes(q0.detail) ? q0.detail : null };
  const why = []; if(invalid) why.push('amount_invalid');
  const byId = id => rules.rules.find(r => r.id === id);

  // 1. the reason chosen in the form (+ number / detail)
  // (q.force_rule: the situation was named by Claude – its number/detail conditions must still hold, the reason may differ)
  const forced = q0.force_rule ? rules.rules.find(r => r.id === q0.force_rule && forcedMatch(r, q, rules)) : null;
  const structured = forced || rules.rules.find(r => structuredMatch(r, q, rules)) || null;
  // 2. what the text says, whatever the reason (safety net: sickness, deadline, legal …)
  const detected = (rules.detect_order || []).map(byId).filter(r => r && r.match && r.match.detect && q.text && re(r.match.detect).test(q.text));
  const cands = [structured, ...detected].filter(Boolean);
  // the strictest candidate decides (a sentence about the deadline in a "no mailboxes" report still escalates)
  let rule = null; for(const c of cands) if(!rule || rank(c.mode) > rank(rule.mode) || (rank(c.mode) === rank(rule.mode) && !!c.urgent > !!rule.urgent)) rule = c;
  const source = !rule ? 'unknown' : rule === forced ? 'claude' : rule === structured ? 'reason' : 'text';
  if(!rule) rule = { ...(rules.unknown || { id:'unknown', mode:'ESCALATE', notify:'admin_needed', reply:null }) };
  if(structured) why.push('reason:' + structured.id); detected.forEach(r => why.push('text:' + r.id));

  let mode = rule.mode, urgent = !!rule.urgent, notify = rule.notify || null;
  const actions = [...(rule.actions || [])];
  // 3. deadline: moving work (tired, sick, weather, rest tomorrow) is only fine before the deadline day
  const today = berlinDay(q.now || new Date());
  const postpone = cands.some(c => c.postponable);
  let deadlineHit = false;
  if(postpone && q.deadline && today >= String(q.deadline).slice(0, 10)){
    deadlineHit = true; mode = 'ESCALATE'; urgent = true; notify = notify || 'deadline_risk'; why.push('deadline_today_or_past');
    if(!actions.includes('call_admin')) actions.push('call_admin');
    const i = actions.indexOf('tage_aendern'); if(i >= 0) actions.splice(i, 1);   // moving days past the deadline is not the answer
  }
  // 4. things the worker should add (phase C: the app or Claude asks once)
  const needs = [];
  if(q.reason === 'nobox' && q.amount == null) needs.push('amount');
  if(q.reason === 'flyers' && !q.detail) needs.push('detail');
  if(q.reason === 'flyers' && q.amount == null) needs.push('amount');

  const lang = ['de', 'ru', 'en'].includes(q.lang) ? q.lang : null;
  let reply = replyIn(rule.reply, lang);
  if(reply && deadlineHit && rules.texts && rules.texts.deadline_call) reply += '\n' + replyIn(rules.texts.deadline_call, lang);
  if(reply && needs.includes('amount') && mode === 'AUTO' && rules.texts && rules.texts.ask_amount) reply += '\n' + replyIn(rules.texts.ask_amount, lang);

  const day = today;
  const notification = mode === 'AUTO' ? null : {
    kind:notify || 'admin_needed', mode, urgent,
    dedupe_key:[q.company_id || '-', q.worker_id || '-', notify || 'admin_needed', q.task_id || '-', day].join(':'),
    admin:rule.admin ? rule.admin.de : null,
  };
  return {
    rule_id:rule.id, row:rule.row ?? null, mode, urgent, source, legal:!!rule.legal,
    ruleset:{ key:rules.key, version:rules.version },
    reply, actions, needs, notification, why,
    also:cands.filter(c => c !== rule).map(c => c.id),
  };
}

// --- Claude (phase C) ----------------------------------------------------------------------------------------------------
// proposal: { rule_id, mode, confidence, reply } from Claude. The server decision stays the floor: Claude can name the
// situation of an otherwise unknown report (if confident) and can raise the mode – never lower it.
export function mergeClaude(decision, proposal, rules, q){
  if(!proposal) return decision;
  const minConf = (rules.thresholds || {}).claude_min_confidence ?? 0.7;
  const conf = typeof proposal.confidence === 'number' ? proposal.confidence : 0;
  const known = proposal.rule_id && rules.rules.some(r => r.id === proposal.rule_id);
  let out = decision;
  if(decision.source === 'unknown' && known && conf >= minConf){
    // re-decide on the server with the situation Claude recognised (its floors, thresholds and deadline check apply)
    const r = rules.rules.find(x => x.id === proposal.rule_id);
    const d = classify({ ...q, force_rule:r.id }, rules);
    out = d.rule_id === r.id ? { ...d, source:'claude', why:[...d.why, 'claude:' + r.id] } : { ...decision, why:[...decision.why, 'claude_rule_not_applicable:' + r.id] };
  } else if(decision.source === 'unknown'){
    out = { ...decision, why:[...decision.why, 'claude_unsure'] };
  }
  const m = MODES.includes(proposal.mode) ? maxMode(out.mode, proposal.mode) : out.mode;
  if(m !== out.mode) out = { ...out, mode:m, why:[...out.why, 'claude_raised:' + m], notification:out.notification || { kind:'admin_needed', mode:m, urgent:false, dedupe_key:[q.company_id || '-', q.worker_id || '-', 'admin_needed', q.task_id || '-', berlinDay(q.now || new Date())].join(':'), admin:null } };
  if(proposal.mode && rank(proposal.mode) < rank(out.mode)) out = { ...out, why:[...out.why, 'claude_lower_ignored:' + proposal.mode] };
  return out;
}

// --- notifications -------------------------------------------------------------------------------------------------------
// one notification per (company, worker, kind, order, Berlin day) – same key as the unique index in help_events: a repeat
// counts up (and takes the stricter mode); a repeat of an already resolved one opens it again
export function dedupe(events, ev){
  const hit = (events || []).find(e => e.dedupe_key === ev.dedupe_key);
  if(hit) return { events:events.map(e => e === hit ? { ...e, repeat_count:(e.repeat_count || 1) + 1, mode:maxMode(e.mode, ev.mode), urgent:e.urgent || ev.urgent, status:e.status === 'resolved' ? 'new' : e.status } : e), created:false };
  return { events:[...(events || []), { ...ev, status:'new', repeat_count:1 }], created:true };
}
