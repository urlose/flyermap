// FlyerMap AI phase A: the server-side decision for help reports (supabase/functions/_shared/help-rules.js) with the
// FITYES rules (supabase/help-rules/fityes.v1.json). No network, no database, no Claude. Run: node test/help-rules.mjs
import { readFileSync } from 'node:fs';
import { classify, mergeClaude, pickRuleSet, validateRuleSet, cleanAmount, dedupe, berlinDay } from '../supabase/functions/_shared/help-rules.js';

const R = JSON.parse(readFileSync(new URL('../supabase/help-rules/fityes.v1.json', import.meta.url)));
let fail = 0, n = 0;
const ok = (name, c, info) => { n++; console.log((c ? 'ok   ' : 'FAIL ') + name + (info != null && !c ? '  → ' + info : '')); if(!c) fail++; };
const NOW = new Date('2026-11-16T10:00:00Z');                  // Monday, Berlin 11:00
const base = { company_id:'co-A', worker_id:'w-1', task_id:'t-1', now:NOW, deadline:'2026-11-20', lang:'de' };
const C = q => classify({ ...base, ...q }, R);
const is = (d, rule, mode, extra = true) => d.rule_id === rule && d.mode === mode && extra;
const show = d => `${d.rule_id}/${d.mode}${d.urgent ? '/urgent' : ''} why=${d.why.join(',')}`;

console.log('-- rule set itself');
ok('FITYES rule set is valid against itself', validateRuleSet(R, R).length === 0, validateRuleSet(R, R).join('; '));
ok('all 20 rows of the agreed table are covered', [...Array(20).keys()].map(i => i + 1).every(row => row === 3 || R.rules.some(r => r.row === row)) , 'row 3 is the 120/2000 example of row 2');

console.log('-- the 20 agreed situations (spec table, in order)');
// 1 a few mailboxes not reachable (≤ 50) → AUTO
let d = C({ reason:'nobox', amount:12, text:'Briefkästen hinter Zaun' });
ok('01 few unreachable mailboxes (12) → AUTO, skip and go on', is(d, 'boxes_few', 'AUTO') && !d.notification && d.actions.includes('replace_reserve'), show(d));
// 2 more than 50 → NOTIFY
d = C({ reason:'nobox', amount:80, text:'' });
ok('02 more than 50 unreachable (80) → NOTIFY admin', is(d, 'boxes_many', 'NOTIFY') && d.notification && d.notification.kind === 'boxes_unreachable', show(d));
// 3 example 120 of 2000 → NOTIFY, go on (replacement streets), admin informed
d = C({ reason:'nobox', amount:120, text:'Neubaugebiet, Briefkästen nur innen' });
ok('03 120 of 2 000 unreachable → NOTIFY, continue with replacement streets', is(d, 'boxes_many', 'NOTIFY') && d.actions.includes('replace_reserve') && /Ersatzstraßen/.test(d.reply), show(d));
// 4 closed entrance / dog → AUTO skip address
d = C({ reason:'private', text:'Großer Hund im Hof' });
ok('04 dog in the yard (reason private) → AUTO skip address', is(d, 'entrance_blocked', 'AUTO'), show(d));
d = C({ reason:'other', text:'Подъезд закрыт, не могу зайти', lang:'ru' });
ok('04b closed entrance written as text (RU) → AUTO skip address, Russian reply', is(d, 'entrance_blocked', 'AUTO') && /Пропусти/.test(d.reply), show(d));
// 5 up to 200 flyers left → AUTO back to the gym
d = C({ reason:'flyers', detail:'leftover', amount:150 });
ok('05 150 flyers left → AUTO, bring back to the start gym', is(d, 'leftover_small', 'AUTO') && /Studio/.test(d.reply), show(d));
// 6 returning to the gym inconvenient → ESCALATE
d = C({ reason:'flyers', detail:'leftover', amount:80, text:'Das Studio ist zu weit weg von mir' });
ok('06 return to the gym too far → ESCALATE', is(d, 'leftover_gym_far', 'ESCALATE'), show(d));
// 7 more than 200 left → ESCALATE
d = C({ reason:'flyers', detail:'leftover', amount:350 });
ok('07 350 flyers left → ESCALATE', is(d, 'leftover_large', 'ESCALATE') && d.notification.kind === 'leftover_flyers', show(d));
// 8 flyers ran out → ESCALATE
d = C({ reason:'flyers', detail:'short', amount:0, text:'Flyer sind alle, noch 3 Straßen offen' });
ok('08 flyers ran out → ESCALATE', is(d, 'flyers_out', 'ESCALATE'), show(d));
// 9 tired → AUTO, finish earlier, keep the deadline
d = C({ reason:'other', text:'Ich bin sehr müde, kann ich heute früher aufhören?' });
ok('09 tired → AUTO, may stop earlier (Feierabend)', is(d, 'tired', 'AUTO') && d.actions.includes('feierabend'), show(d));
// 10 sick → NOTIFY + Tage ändern
d = C({ reason:'other', text:'Я заболел, температура 38', lang:'ru' });
ok('10 sick → NOTIFY, do not go out sick, "Изменить дни"', is(d, 'sick', 'NOTIFY') && d.actions.includes('tage_aendern') && /Изменить дни/.test(d.reply) && d.notification.kind === 'sick', show(d));
// 11 rain → NOTIFY first, move within the deadline
d = C({ reason:'other', text:'Es regnet stark, kann ich morgen weitermachen?' });
ok('11 heavy rain → NOTIFY, "Tage ändern" within the deadline', d.mode === 'NOTIFY' && d.rule_id === 'weather' && d.actions.includes('tage_aendern') && /Tage ändern/.test(d.reply), show(d));
// 12 helping a colleague → AUTO with the explanation about hours
d = C({ reason:'other', text:'Darf ich meinem Kollegen helfen?' });
ok('12 help a colleague → AUTO with "5 minutes together" explanation', is(d, 'helping_colleague', 'AUTO') && /5 Minuten/.test(d.reply), show(d));
// 13 GPS did not count hours → ESCALATE, keep working
d = C({ reason:'gps', text:'Meine Arbeitszeit wurde nicht gezählt' });
ok('13 GPS did not count the hours → ESCALATE, keep working', is(d, 'gps_hours', 'ESCALATE') && /weiter/.test(d.reply), show(d));
// 14 forgot to press Start → ESCALATE
d = C({ reason:'other', text:'Забыл нажать старт, прошёл уже час', lang:'ru' });
ok('14 forgot to press Start → ESCALATE', is(d, 'forgot_start', 'ESCALATE'), show(d));
// 15 will not make the deadline → ESCALATE urgent, call
d = C({ reason:'other', text:'Ich schaffe es nicht bis zur Frist' });
ok('15 deadline in danger → ESCALATE urgent, call the admin', is(d, 'deadline_risk', 'ESCALATE', d.urgent && d.actions.includes('call_admin') && d.notification.urgent), show(d));
// 16 gym closed → ESCALATE
d = C({ reason:'other', text:'Das Fitnessstudio ist geschlossen, ich komme nicht an die Flyer' });
ok('16 gym closed → ESCALATE', is(d, 'gym_closed', 'ESCALATE'), show(d));
// 17 two flyers in one box by mistake → AUTO
d = C({ reason:'other', text:'Habe aus Versehen zwei Flyer in einen Briefkasten geworfen' });
ok('17 two flyers by mistake → AUTO', is(d, 'double_flyer', 'AUTO'), show(d));
// 18 "Keine Werbung" → AUTO, legal, skip
d = C({ reason:'other', text:'Da steht Keine Werbung am Briefkasten' });
ok('18 "Keine Werbung" → AUTO, legal rule, skip the box', is(d, 'keine_werbung', 'AUTO') && d.legal && /keinen Flyer/.test(d.reply), show(d));
// 19 walk tomorrow's streets today → AUTO within own route
d = C({ reason:'other', text:'Kann ich heute schon die Straßen von morgen laufen?' });
ok('19 tomorrow\'s streets today → AUTO within own route', is(d, 'tomorrow_today', 'AUTO'), show(d));
// 20 part of today left → AUTO continue tomorrow if the deadline allows
d = C({ reason:'toolong', text:'' });
ok('20 part of today left (reason "Zeit reicht nicht") → AUTO, rest next day', is(d, 'part_left', 'AUTO') && d.actions.includes('tage_aendern'), show(d));

console.log('-- thresholds and limits');
ok('50 unreachable → still AUTO (≤ 50)', C({ reason:'nobox', amount:50 }).mode === 'AUTO');
ok('51 unreachable → NOTIFY', C({ reason:'nobox', amount:51 }).mode === 'NOTIFY');
ok('0 unreachable → AUTO', C({ reason:'nobox', amount:0 }).mode === 'AUTO');
ok('200 left → AUTO (≤ 200)', C({ reason:'flyers', detail:'leftover', amount:200 }).rule_id === 'leftover_small');
ok('201 left → ESCALATE', C({ reason:'flyers', detail:'leftover', amount:201 }).mode === 'ESCALATE');
d = C({ reason:'nobox' });
ok('no number given → AUTO like today, asks for the number, needs=amount', d.mode === 'AUTO' && d.needs.includes('amount') && /wie viele/.test(d.reply), show(d));
d = C({ reason:'nobox', amount:'abc' });
ok('number not a number → treated as missing, marked amount_invalid', d.mode === 'AUTO' && d.why.includes('amount_invalid'));
ok('negative number → invalid', cleanAmount(-5).invalid && cleanAmount(-5).amount === null);
ok('1.5 → invalid (whole numbers only)', cleanAmount(1.5).invalid);
ok('"1.200" (German thousands) → 1200', cleanAmount('1.200').amount === 1200);
ok('above 100 000 → invalid', cleanAmount(100001).invalid && cleanAmount(100000).amount === 100000);
d = C({ reason:'flyers', amount:120 });
ok('flyers without "short/left over" → ESCALATE (unclear), asks for detail', is(d, 'flyers_unclear', 'ESCALATE') && d.needs.includes('detail'), show(d));
d = C({ reason:'flyers', detail:'leftover' });
ok('left over without number → ESCALATE (cannot check the 200 limit)', d.mode === 'ESCALATE' && d.needs.includes('amount'), show(d));

console.log('-- deadline check (moving work only before the deadline day)');
d = C({ reason:'other', text:'Ich bin krank', deadline:'2026-11-16' });
ok('sick on the deadline day → ESCALATE urgent, call admin, no "Tage ändern"', d.mode === 'ESCALATE' && d.urgent && d.actions.includes('call_admin') && !d.actions.includes('tage_aendern') && d.why.includes('deadline_today_or_past'), show(d));
d = C({ reason:'toolong', deadline:'2026-11-15' });
ok('rest tomorrow but deadline was yesterday → ESCALATE urgent', d.mode === 'ESCALATE' && d.urgent, show(d));
d = C({ reason:'other', text:'müde', deadline:'2026-11-17' });
ok('tired, deadline tomorrow → still AUTO', d.mode === 'AUTO', show(d));
d = C({ reason:'other', text:'müde', deadline:null });
ok('tired, no deadline → AUTO', d.mode === 'AUTO');
d = C({ reason:'other', text:'müde', now:new Date('2026-11-19T23:30:00Z'), deadline:'2026-11-20' });
ok('Berlin day is used (23:30 UTC = next day in Berlin = deadline day) → urgent', d.mode === 'ESCALATE' && berlinDay(new Date('2026-11-19T23:30:00Z')) === '2026-11-20', show(d));
d = C({ reason:'other', text:'Darf ich meinem Kollegen helfen?', deadline:'2026-11-10' });
ok('deadline check only for moving work (helping a colleague stays AUTO)', d.mode === 'AUTO', show(d));

console.log('-- the strictest wins when several things are said');
d = C({ reason:'nobox', amount:10, text:'Und ich schaffe die Frist nicht' });
ok('"no mailboxes" + "deadline" → ESCALATE urgent (text raises)', d.rule_id === 'deadline_risk' && d.urgent && d.also.includes('boxes_few'), show(d));
d = C({ reason:'other', text:'Ich bin krank und es regnet' });
ok('sick + rain → NOTIFY, sick first (detect order)', d.rule_id === 'sick' && d.mode === 'NOTIFY' && d.also.includes('weather'), show(d));
d = C({ reason:'nobox', amount:80, text:'keine Werbung auf vielen Kästen' });
ok('80 boxes + "Keine Werbung" → NOTIFY (stricter than the legal AUTO)', d.mode === 'NOTIFY', show(d));

console.log('-- unknown / unclear');
d = C({ reason:'other', text:'Hallo, eine Frage zu meinem Vertrag' });
ok('unknown text → ESCALATE to the admin, no automatic reply', d.rule_id === 'unknown' && d.mode === 'ESCALATE' && d.reply === null && d.source === 'unknown', show(d));
d = C({ reason:'app', text:'App stürzt ab' });
ok('reason "Problem mit der App" → ESCALATE (as today)', d.mode === 'ESCALATE' && d.reply === null, show(d));
d = C({ reason:'something-new', text:'' });
ok('reason the server does not know → ESCALATE', d.mode === 'ESCALATE');
d = C({ reason:'', text:'' });
ok('empty report → ESCALATE', d.mode === 'ESCALATE');
d = C({ reason:'other', text:'Guten Morgen! Wo soll ich heute anfangen?' });
ok('"Guten Morgen … heute" is not "tomorrow\'s streets today" → unknown, ESCALATE', d.rule_id === 'unknown' && d.mode === 'ESCALATE', show(d));
d = C({ reason:'other', text:'Можно сегодня пройти завтрашние улицы?', lang:'ru' });
ok('RU "завтрашние улицы сегодня" → tomorrow_today AUTO', is(d, 'tomorrow_today', 'AUTO'), show(d));
d = C({ reason:'other', text:'Осталась часть улицы, остальное завтра', lang:'ru' });
ok('"часть" is not "часы" (hours): RU rest tomorrow → part_left, not gps_hours', d.rule_id === 'part_left' && !d.why.includes('text:gps_hours'), show(d));
d = C({ reason:'other', text:'Zeit reicht nicht, Rest morgen' });
ok('"Zeit reicht nicht" is not "hours not counted"', d.rule_id === 'part_left', show(d));

console.log('-- same answers as the automatic answers in production today (no change of behaviour)');
const PROD_SKIP = 'Verstanden. Lass dieses Stück aus und geh auf der Route weiter. Der Admin prüft die Stelle später.\nПонял. Пропусти этот участок и иди дальше по маршруту. Админ проверит место позже.';
const PROD_GPS = 'Bitte prüfen: Standort «Immer erlauben» und «Genauer Standort» an, Energiesparmodus aus, App offen lassen. Wird es nicht besser, meldet sich der Admin.\nПроверь: геолокация «Разрешать всегда» и «Точное местоположение» включены, режим экономии батареи выключен, приложение не закрывай. Если не поможет, админ напишет тебе.';
d = C({ reason:'closed', lang:null });
ok('reason "closed", language unknown → AUTO, exactly today\'s text (DE + RU)', d.mode === 'AUTO' && d.reply === PROD_SKIP, d.reply);
d = C({ reason:'gps', lang:null });
ok('reason "gps" → today\'s GPS advice, report stays with the admin (ESCALATE)', d.rule_id === 'gps_settings' && d.reply === PROD_GPS && d.mode === 'ESCALATE', d.reply);
d = C({ reason:'private', lang:null });
ok('reason "private" → AUTO (today: same skip answer)', d.mode === 'AUTO');

console.log('-- companies');
const sets = [
  { company_id:null, key:'fityes', version:1, status:'active', rules:R },
  { company_id:'co-B', key:'b', version:1, status:'archived', rules:R },
  { company_id:'co-B', key:'b', version:2, status:'active', rules:{ ...R, key:'b', version:2, thresholds:{ ...R.thresholds, unreachable_boxes_auto_max:20 } } },
  { company_id:'co-C', key:'c', version:1, status:'draft', rules:R },
];
ok('company without own set → default (FITYES)', pickRuleSet(sets, 'co-A').rules.key === 'fityes');
ok('company B → its own active set (version 2, not the archived one)', pickRuleSet(sets, 'co-B').version === 2);
ok('company C with only a draft → default', pickRuleSet(sets, 'co-C').rules.key === 'fityes');
ok('never another company\'s set (A does not get B\'s)', pickRuleSet(sets.filter(s => s.company_id !== null), 'co-A') === null);
const RB = pickRuleSet(sets, 'co-B').rules;
ok('company B threshold 20: 30 unreachable → NOTIFY for B, AUTO for A', classify({ ...base, company_id:'co-B', reason:'nobox', amount:30 }, RB).mode === 'NOTIFY' && C({ reason:'nobox', amount:30 }).mode === 'AUTO');
ok('decision carries the rule set version (for the log)', classify({ ...base, reason:'nobox', amount:30 }, RB).ruleset.version === 2);
const ev1 = C({ company_id:'co-A', reason:'other', text:'krank' }).notification, ev2 = C({ company_id:'co-B', reason:'other', text:'krank' }).notification;
ok('notification keys differ per company (no mixing)', ev1.dedupe_key !== ev2.dedupe_key && ev1.dedupe_key.startsWith('co-A:'));

console.log('-- locks: a company cannot lower what must stay');
const lower = (id, patch) => ({ ...R, rules:R.rules.map(r => r.id === id ? { ...r, ...patch } : r) });
ok('company lowers "sick" to AUTO → rejected', validateRuleSet(lower('sick', { mode:'AUTO' }), R).some(e => /sick: mode below/.test(e)));
ok('company makes "deadline" non-urgent → rejected', validateRuleSet(lower('deadline_risk', { urgent:false }), R).some(e => /must stay urgent/.test(e)));
ok('company changes the "Keine Werbung" answer → rejected (legal)', validateRuleSet(lower('keine_werbung', { reply:{ de:'Trotzdem einwerfen.' } }), R).some(e => /fixed \(legal\)/.test(e)));
ok('company removes a locked rule → rejected', validateRuleSet({ ...R, rules:R.rules.filter(r => r.id !== 'sick') }, R).some(e => /locked rule missing/.test(e)));
ok('company RAISES "tired" to NOTIFY → allowed', validateRuleSet(lower('tired', { mode:'NOTIFY' }), R).length === 0);
ok('unknown mode / bad pattern / unknown threshold → rejected', validateRuleSet(lower('tired', { mode:'LATER', match:{ detect:'(' } }), R).length >= 2 && validateRuleSet(lower('boxes_few', { match:{ reasons:['nobox'], amount:{ lte:'nope' } } }), R).some(e => /unknown threshold/.test(e)));

console.log('-- Claude can only add or raise (phase C)');
const q = { ...base, reason:'other', text:'Hallo, eine Frage zu meinem Vertrag' };
d = C({ reason:'nobox', amount:80 });
let m = mergeClaude(d, { rule_id:'boxes_few', mode:'AUTO', confidence:0.99 }, R, { ...base, reason:'nobox', amount:80 });
ok('server NOTIFY (80 boxes), Claude says AUTO → stays NOTIFY', m.mode === 'NOTIFY' && m.why.some(w => w.startsWith('claude_lower_ignored')), m.mode);
d = C({ reason:'nobox', amount:10 });
m = mergeClaude(d, { rule_id:'boxes_few', mode:'NOTIFY', confidence:0.9 }, R, { ...base, reason:'nobox', amount:10 });
ok('server AUTO, Claude says NOTIFY → raised to NOTIFY with a notification', m.mode === 'NOTIFY' && m.notification, m.mode);
d = C(q); m = mergeClaude(d, { rule_id:'sick', mode:'AUTO', confidence:0.9 }, R, q);
ok('unknown text, Claude confident it is "sick" but says AUTO → server floor NOTIFY', m.rule_id === 'sick' && m.mode === 'NOTIFY' && m.source === 'claude', `${m.rule_id}/${m.mode}`);
m = mergeClaude(d, { rule_id:'sick', mode:'AUTO', confidence:0.4 }, R, q);
ok('unknown text, Claude unsure (0.4) → stays ESCALATE to admin', m.rule_id === 'unknown' && m.mode === 'ESCALATE' && m.why.includes('claude_unsure'));
m = mergeClaude(d, { rule_id:'make_money_fast', mode:'AUTO', confidence:1 }, R, q);
ok('Claude names a rule that does not exist → ignored, ESCALATE', m.mode === 'ESCALATE' && m.rule_id === 'unknown');
m = mergeClaude(d, { rule_id:'tired', mode:'AUTO', confidence:0.95 }, R, { ...q, deadline:'2026-11-16' });
ok('Claude says "tired" on the deadline day → server deadline check → ESCALATE urgent', m.mode === 'ESCALATE' && m.urgent, `${m.rule_id}/${m.mode}`);
m = mergeClaude(d, { rule_id:'boxes_many', mode:'NOTIFY', confidence:0.95 }, R, q);
ok('Claude names a rule that needs a number the worker did not give → not applied, stays unknown/ESCALATE', m.mode === 'ESCALATE' && m.rule_id === 'unknown', `${m.rule_id}/${m.mode}`);
ok('no proposal → decision unchanged', mergeClaude(d, null, R, q) === d);

console.log('-- notifications without duplicates');
let evs = []; const e = C({ reason:'other', text:'krank' }).notification;
let r1 = dedupe(evs, e); let r2 = dedupe(r1.events, e);
ok('same worker, kind, order, day twice → one notification, counted 2×', r1.created && !r2.created && r2.events.length === 1 && r2.events[0].repeat_count === 2);
const eOther = C({ reason:'other', text:'krank', now:new Date('2026-11-17T10:00:00Z'), deadline:'2026-11-30' }).notification;
ok('next day → new notification', dedupe(r2.events, eOther).created);
const res = { ...r2.events[0], status:'resolved' }; const r3 = dedupe([res], e);
ok('repeat of a resolved one → opened again (status new), no second row', !r3.created && r3.events[0].status === 'new' && r3.events.length === 1);
ok('AUTO decisions create no notification', C({ reason:'nobox', amount:3 }).notification === null);

console.log(fail ? `\n${fail} of ${n} FAILED` : `\nall ${n} ok`); process.exit(fail ? 1 : 0);
