// Re-plan of an existing order through the server function replan_task_with_plans
// (supabase/2026-11-17_atomic_replan.sql): one transaction, server-side check for an open shift.
// First a dry run: whatever would be lost (acceptances, links of sessions / help reports / cancellations)
// is shown to the admin before anything is saved. Nothing is reset silently.
import { T } from './i18n.js';
import './i18n_en.js';   // creates T.en; must run before the lines below add to it

Object.assign(T.de, {
  replanConfirmT:'Neu planen – bitte prüfen', replanConfirmYes:'Trotzdem neu planen',
  replanDone:'Eine Route dieses Auftrags ist schon erledigt. Neu planen ist nicht möglich – für weitere Gebiete einen neuen Auftrag anlegen.',
  replanClosed:'Der Auftrag ist abgeschlossen oder archiviert und kann nicht neu geplant werden.',
  replanNotFound:'Auftrag nicht gefunden oder keine Berechtigung.',
  replanBad:'Die neuen Routen sind ungültig und wurden nicht gespeichert. Bitte neu berechnen.',
  replanAccReset:'{name}: Annahme wird zurückgesetzt – {why}',
  replanWhy_more_days:'die neue Route hat mehr Tage als gewählte Termine',
  replanWhy_route_removed:'bekommt keine Route mehr',
  replanWhy_not_walked:'Auftrag noch nicht begonnen, die Route wird neu angeboten',
  replanDeclined:'{n} Mitarbeiter, die abgelehnt hatten, bekommen die Route erneut angeboten',
  replanSessions:'{n} gelaufene Schicht(en) verlieren die Zuordnung zu einer Route (bleiben im Auftrag gespeichert)',
  replanHelp:'{n} Hilfe-Meldung(en) verlieren die Zuordnung zu einer Route',
  replanCancel:'{n} Absage(n) verlieren die Zuordnung zu einer Route',
  replanNotif:'{n} Benachrichtigung(en) zu entfernten Routen werden gelöscht',
  replanNoName:'Mitarbeiter',
});
Object.assign(T.ru, {
  replanConfirmT:'Пересчёт — проверьте', replanConfirmYes:'Всё равно пересчитать',
  replanDone:'Один маршрут этого заказа уже выполнен. Пересчитать нельзя — для новой территории создайте новый заказ.',
  replanClosed:'Заказ завершён или в архиве, пересчитать нельзя.',
  replanNotFound:'Заказ не найден или нет прав.',
  replanBad:'Новые маршруты некорректны и не сохранены. Пересчитайте ещё раз.',
  replanAccReset:'{name}: принятие будет снято — {why}',
  replanWhy_more_days:'в новом маршруте больше дней, чем выбранных дат',
  replanWhy_route_removed:'маршрута больше нет',
  replanWhy_not_walked:'заказ ещё не начат, маршрут будет предложен заново',
  replanDeclined:'{n} работник(ов), отказавшихся раньше, снова получат предложение',
  replanSessions:'{n} пройденных смен потеряют привязку к маршруту (останутся в заказе)',
  replanHelp:'{n} обращений в помощь потеряют привязку к маршруту',
  replanCancel:'{n} отказов потеряют привязку к маршруту',
  replanNotif:'{n} уведомлений по удалённым маршрутам будут удалены',
  replanNoName:'Работник',
});
Object.assign(T.en, {
  replanConfirmT:'Re-plan – please check', replanConfirmYes:'Re-plan anyway',
  replanDone:'A route of this order is already done. It cannot be re-planned – create a new order for more area.',
  replanClosed:'The order is closed or archived and cannot be re-planned.',
  replanNotFound:'Order not found or no permission.',
  replanBad:'The new routes are invalid and were not saved. Please recalculate.',
  replanAccReset:'{name}: acceptance will be reset – {why}',
  replanWhy_more_days:'the new route has more days than chosen dates',
  replanWhy_route_removed:'no route any more',
  replanWhy_not_walked:'order not started yet, the route is offered again',
  replanDeclined:'{n} worker(s) who declined get the route offered again',
  replanSessions:'{n} walked shift(s) lose their link to a route (kept in the order)',
  replanHelp:'{n} help report(s) lose their link to a route',
  replanCancel:'{n} cancellation(s) lose their link to a route',
  replanNotif:'{n} notification(s) of removed routes are deleted',
  replanNoName:'Worker',
});

const ERRORS = {
  replan_live:'replanLive', replan_done_route:'replanDone', task_not_open:'replanClosed', task_not_found:'replanNotFound',
  invalid_order_payload:'replanBad', invalid_route_index:'replanBad', mailboxes_must_be_nonnegative_integers:'replanBad', not_all_plans_saved:'replanBad',
};
export function replanErrorKey(error){
  const msg = String((error && error.message) || '');
  for(const code of Object.keys(ERRORS)) if(msg.includes(code)) return ERRORS[code];
  return null;
}
// the migration is not applied yet: PostgREST does not know the function
export function rpcMissing(error){
  if(!error) return false;
  const msg = String(error.message || '') + ' ' + String(error.hint || '');
  return error.code === 'PGRST202' || error.code === '42883' || (/replan_task_with_plans/.test(msg) && /(could not find|does not exist|schema cache)/i.test(msg));
}
// everything the re-plan would lose, as lines for the admin; empty = nothing is lost
export function reportLines(rep, t){
  if(!rep) return [];
  const out = [];
  for(const a of rep.acceptances_reset || []) out.push(t('replanAccReset', { name:a.name || t('replanNoName'), why:t('replanWhy_' + a.reason) }));
  const add = (key, n) => { if(Number(n) > 0) out.push(t(key, { n })); };
  add('replanDeclined', rep.declined_offered_again);
  add('replanSessions', rep.sessions_without_route);
  add('replanHelp', rep.help_reports_unlinked);
  add('replanCancel', rep.cancellations_unlinked);
  add('replanNotif', rep.notifications_removed);
  return out;
}
const fail = (error, t) => { const k = replanErrorKey(error); return k ? new Error(t(k)) : error; };

// -> { status:'ok', task, plans, report } | { status:'cancelled' } | { status:'missing' } (old way needed); throws on errors
export async function atomicReplan(sb, { taskId, task, plans, confirm, t }){
  const args = { p_task_id:taskId, p_task:task, p_plans:plans };
  const dry = await sb.rpc('replan_task_with_plans', { ...args, p_dry_run:true });
  if(dry.error){ if(rpcMissing(dry.error)) return { status:'missing' }; throw fail(dry.error, t); }
  const lines = reportLines(dry.data && dry.data.report, t);
  if(lines.length && !await confirm(t('replanConfirmT'), lines.join(' • '), t('replanConfirmYes'))) return { status:'cancelled' };
  const { data, error } = await sb.rpc('replan_task_with_plans', args);
  if(error) throw fail(error, t);
  if(!data || !data.task || !(data.plans || []).length) throw new Error(t('replanBad'));
  return { status:'ok', task:data.task, plans:data.plans, report:data.report || {} };
}
