// Rahmenvertrag (framework contract) for distributors: acceptance before the first order, binding commitment per order,
// cancellation with reason (late = penalty per contract), admin settings + list of cancellations.
import { I } from './i18n.js';
import { sb, esc } from './core.js';
import { modal, toast } from './ui.js';
import { contractHtml, LEGAL_CTX } from './legal.js';

const L = () => (['ru', 'en'].includes(I.lang) ? I.lang : 'de');
const TX = {
  de:{ title:'Rahmenvertrag', intro:'Bevor du Aufträge annehmen kannst, lies bitte den Rahmenvertrag und bestätige ihn.', agree:'Ich habe den Rahmenvertrag gelesen und stimme zu.',
    accept:'Zustimmen', later:'Später', need:'Bitte das Kästchen anhaken.', changed:'Der Vertrag wurde gerade geändert. Bitte erneut lesen.',
    commitT:'Verbindlich zusagen?', commitX:'Mit deiner Zusage verpflichtest du dich, diese Route an den gewählten Tagen vollständig zu verteilen.',
    free:h => `Kostenlos absagen: bis ${h} Std. vor Beginn des ersten Tags (08:00).`, pen:p => `Danach ohne wichtigen Grund (z. B. Krankheit): Vertragsstrafe ${p} pro Tag.`,
    commit:'Verbindlich zusagen', back:'Zurück', read:'Rahmenvertrag lesen', close:'Schließen',
    sumT:'Das Wichtigste in Kürze', bind:'Jede Zusage zu einem Auftrag ist verbindlich: Du verteilst die Route an den gewählten Tagen vollständig.', out:'Abmelden',
    note:(h, p) => `Deine Zusage ist verbindlich. Kostenlos absagen: bis ${h} Std. vor Beginn des ersten Tags` + (p ? `, danach Vertragsstrafe ${p} pro Tag.` : '.'),
    cancel:'Absagen', cancelT:'Route absagen', reason:'Grund (Pflicht)', reasonPh:'z. B. krank, Termin …', reasonNeed:'Bitte einen Grund angeben.',
    lateW:p => `Achtung: Die kostenlose Absagefrist ist vorbei. Ohne wichtigen Grund fällt eine Vertragsstrafe von ${p} pro Tag an. Bei Krankheit bitte Nachweis an die Firma.`,
    okW:'Absage ist noch kostenlos.', done:'Abgesagt.',
    admT:'Rahmenvertrag & Absagen', admHint:'Neue Verteiler müssen den Vertrag vor dem ersten Auftrag bestätigen. Bei Änderung bestätigen sie die neue Version beim nächsten Auftrag.',
    hours:'Kostenlose Absage bis (Std. vorher)', penalty:'Vertragsstrafe pro Tag (€)', own:'Eigener Vertragstext (leer = Standardvertrag). Platzhalter: {firma} {stunden} {strafe}',
    std:'Standardtext übernehmen zum Bearbeiten', preview:'Vorschau', save:'Speichern', saved:'Gespeichert', version:'Version',
    list:'Absagen', none:'Noch keine Absagen.', late:'zu spät', inTime:'rechtzeitig', waive:'erlassen', unwaive:'wieder berechnen', h:'Std. vorher', noReason:'ohne Grund (alte App)' },
  ru:{ title:'Рамочный договор', intro:'Прежде чем брать заказы, прочитайте и подтвердите рамочный договор.', agree:'Я прочитал(а) рамочный договор и согласен(на).',
    accept:'Согласен(на)', later:'Позже', need:'Поставьте галочку.', changed:'Договор только что изменён. Прочитайте ещё раз.',
    commitT:'Подтвердить обязательно?', commitX:'Подтверждая, вы обязуетесь полностью разнести этот маршрут в выбранные дни.',
    free:h => `Бесплатная отмена: не позднее чем за ${h} ч до начала первого дня (08:00).`, pen:p => `Позже без уважительной причины (напр. болезнь): штраф ${p} за день.`,
    commit:'Подтвердить обязательно', back:'Назад', read:'Читать договор', close:'Закрыть',
    sumT:'Коротко о главном', bind:'Каждое принятое задание обязательно: вы полностью разносите маршрут в выбранные дни.', out:'Выйти',
    note:(h, p) => `Принятое задание обязательно. Бесплатная отмена — не позднее чем за ${h} ч до начала первого дня` + (p ? `, позже штраф ${p} за день.` : '.'),
    cancel:'Отказаться', cancelT:'Отказ от маршрута', reason:'Причина (обязательно)', reasonPh:'напр. болезнь, встреча …', reasonNeed:'Укажите причину.',
    lateW:p => `Внимание: срок бесплатной отмены прошёл. Без уважительной причины — штраф ${p} за день. При болезни передайте справку фирме.`,
    okW:'Отмена пока бесплатна.', done:'Отменено.',
    admT:'Рамочный договор и отказы', admHint:'Новые раздатчики подтверждают договор перед первым заказом. После изменения — подтверждают новую версию при следующем заказе.',
    hours:'Бесплатная отмена за (часов)', penalty:'Штраф за день (€)', own:'Свой текст договора (пусто = стандартный). Подстановки: {firma} {stunden} {strafe}',
    std:'Взять стандартный текст для правки', preview:'Просмотр', save:'Сохранить', saved:'Сохранено', version:'Версия',
    list:'Отказы', none:'Отказов пока нет.', late:'поздно', inTime:'вовремя', waive:'простить', unwaive:'снова начислить', h:'ч до начала', noReason:'без причины (старое приложение)' },
  en:{ title:'Framework contract', intro:'Before you can take orders, please read and accept the framework contract.', agree:'I have read and accept the framework contract.',
    accept:'Accept', later:'Later', need:'Please tick the box.', changed:'The contract has just changed. Please read it again.',
    commitT:'Commit bindingly?', commitX:'By committing you agree to distribute this route completely on the chosen days.',
    free:h => `Free cancellation: up to ${h} h before the first day starts (08:00).`, pen:p => `Later without good cause (e.g. illness): contractual penalty of ${p} per day.`,
    commit:'Commit bindingly', back:'Back', read:'Read the contract', close:'Close',
    sumT:'The essentials', bind:'Every order you accept is binding: you distribute the route completely on the chosen days.', out:'Log out',
    note:(h, p) => `Accepting is binding. Free cancellation up to ${h} h before the first day starts` + (p ? `, later a penalty of ${p} per day.` : '.'),
    cancel:'Cancel', cancelT:'Cancel route', reason:'Reason (required)', reasonPh:'e.g. ill, appointment …', reasonNeed:'Please give a reason.',
    lateW:p => `Note: the free cancellation period is over. Without good cause a penalty of ${p} per day applies. If ill, please send proof to the company.`,
    okW:'Cancelling is still free.', done:'Cancelled.',
    admT:'Framework contract & cancellations', admHint:'New distributors accept the contract before their first order. After a change they accept the new version with their next order.',
    hours:'Free cancellation until (hours before)', penalty:'Penalty per day (€)', own:'Own contract text (empty = standard). Placeholders: {firma} {stunden} {strafe}',
    std:'Copy standard text to edit', preview:'Preview', save:'Save', saved:'Saved', version:'Version',
    list:'Cancellations', none:'No cancellations yet.', late:'late', inTime:'in time', waive:'waive', unwaive:'charge again', h:'h before', noReason:'no reason (old app)' },
};
const T = k => TX[L()][k];
const eur = n => (Math.round((+n || 0) * 100) / 100).toLocaleString('de-DE', { maximumFractionDigits:2 }) + ' €';
const doc = cfg => `<div class="legal legal-in-modal" style="max-height:50vh;overflow:auto;border:1px solid var(--line);border-radius:12px;padding:0 12px;margin:8px 0">${contractHtml(LEGAL_CTX.firm, cfg, L())}</div>`;

/* ---------- worker ---------- */
let cache = null;
export async function workerContract(rpc, token, fresh){
  if(!cache || fresh) cache = await rpc('worker_contract', { p_token:token });
  return cache;
}
const needsAck = c => c && c.required && c.acked !== c.version;

const terms = c => ({ h:c && c.cancel_hours != null ? c.cancel_hours : 48, p:c && c.penalty_eur != null ? +c.penalty_eur : 50 });
// the rules of a binding commitment (free cancellation, penalty) in three lines: shown with the contract, so nobody has to
// search the text for them – they are agreed once here, not asked again with every order
const summary = c => { const { h, p } = terms(c); return `<div class="note" style="margin:8px 0"><b>${esc(T('sumT'))}</b><ul class="note-list" style="margin:6px 0 0"><li>${esc(T('bind'))}</li><li>${esc(T('free')(h))}</li>${p ? `<li>${esc(T('pen')(eur(p)))}</li>` : ''}</ul></div>`; };

// returns true when accepted (or not needed).
// opts.must: the first acceptance right after the registration – no "later", a tap outside does not close it
// (opts.logout: the way out for somebody who does not agree). A new version for somebody who accepted before can wait.
export async function contractGate(rpc, token, opts = {}){
  let c; try{ c = await workerContract(rpc, token, true); }catch{ return true; }   // offline: the server checks again on accept
  if(!needsAck(c)) return true;
  const must = !!opts.must && !c.acked;
  return new Promise(resolve => {
    let m = modal(`<h2>${esc(T('title'))}</h2><p class="muted">${esc(T('intro'))}</p>${summary(c)}${doc(c)}
      <label class="check"><input type="checkbox" id="ctOk"><span>${esc(T('agree'))}</span></label>
      <button class="btn primary" id="ctYes" style="margin-top:12px">${esc(T('accept'))}</button>${must ? (opts.logout ? `<p class="small center" style="margin:12px 0 0"><button class="link" id="ctOut">${esc(T('out'))}</button></p>` : '') : `<button class="btn ghost" id="ctNo">${esc(T('later'))}</button>`}<div class="err" id="ctErr"></div>`);
    if(must){ const n = m.cloneNode(true); m.replaceWith(n); m = n; }   // the copy has no "tap outside closes" handler
    else new MutationObserver((_, o) => { if(!m.isConnected){ o.disconnect(); resolve(false); } }).observe(document.body, { childList:true });   // closed by a tap outside
    const no = m.querySelector('#ctNo'); if(no) no.onclick = () => { m.remove(); resolve(false); };
    const out = m.querySelector('#ctOut'); if(out) out.onclick = () => { m.remove(); resolve(false); opts.logout(); };
    m.querySelector('#ctYes').onclick = async () => {
      if(!m.querySelector('#ctOk').checked){ m.querySelector('#ctErr').textContent = T('need'); return; }
      try{ await rpc('ack_contract', { p_token:token, p_version:c.version }); c.acked = c.version; m.remove(); resolve(true); }
      catch(e){ m.querySelector('#ctErr').textContent = /contract_changed/.test(e.message || '') ? T('changed') : (e.message || 'error'); if(/contract_changed/.test(e.message || '')){ m.remove(); resolve(contractGate(rpc, token, opts)); } }
    };
  });
}

// before "accept" / "take free route": only the contract, if it is not accepted yet. The rules of a commitment are part of the
// contract (agreed at the registration) and stand as one line under the button (commitNote) – no extra window per order.
export async function commitDialog(rpc, token){
  return contractGate(rpc, token);
}
// the line under "accept": binding, free cancellation until …, penalty; with the contract to read
export async function commitNote(rpc, token, el){
  if(!el) return;
  let c = cache; if(!c){ try{ c = await workerContract(rpc, token); }catch{ c = null; } }
  if(!el.isConnected) return;
  const { h, p } = terms(c);
  el.innerHTML = `${esc(T('note')(h, p ? eur(p) : ''))} <button class="link" type="button" style="font-size:inherit">${esc(T('read'))}</button>`;
  el.querySelector('button').onclick = () => { const m = modal(`<h2>${esc(T('title'))}</h2>${summary(c)}${doc(c || {})}<button class="btn primary" data-ok>${esc(T('close'))}</button>`); m.querySelector('[data-ok]').onclick = () => m.remove(); };
}

// accepted route → cancel with reason; firstDate 'YYYY-MM-DD'
export async function cancelDialog(rpc, token, planId, firstDate){
  let c = {}; try{ c = await workerContract(rpc, token); }catch{}
  const hrs = c.cancel_hours != null ? c.cancel_hours : 48;
  let late = false;
  if(firstDate){ const st = new Date(firstDate + 'T08:00:00'); late = (st - Date.now()) / 36e5 < hrs; }
  return new Promise(resolve => {
    const m = modal(`<h2>${esc(T('cancelT'))}</h2>
      <div class="${late ? 'warnbox' : 'note'}" style="margin-top:0">${esc(late && +c.penalty_eur ? T('lateW')(eur(c.penalty_eur)) : T('okW'))}</div>
      <label class="f" for="cnR">${esc(T('reason'))}</label><textarea class="in" id="cnR" rows="3" maxlength="500" placeholder="${esc(T('reasonPh'))}"></textarea>
      <button class="btn primary danger" id="cnYes" style="margin-top:12px">${esc(T('cancel'))}</button><button class="btn ghost" id="cnNo">${esc(T('back'))}</button><div class="err" id="cnErr"></div>`);
    m.querySelector('#cnNo').onclick = () => { m.remove(); resolve(false); };
    m.querySelector('#cnYes').onclick = async () => {
      const r = m.querySelector('#cnR').value.trim();
      if(r.length < 3){ m.querySelector('#cnErr').textContent = T('reasonNeed'); return; }
      m.querySelector('#cnYes').disabled = true;
      try{ await rpc('cancel_plan', { p_token:token, p_plan_id:planId, p_reason:r }); m.remove(); toast(T('done')); resolve(true); }
      catch(e){ m.querySelector('#cnErr').textContent = e.message || 'error'; m.querySelector('#cnYes').disabled = false; }
    };
  });
}
export const cancelLabel = () => T('cancel');

/* ---------- admin (Einstellungen) ---------- */
export const adminContractHtml = () => `<h2 class="sec">${esc(T('admT'))}</h2><div class="card" style="display:block" id="ctCard"><p class="muted small" style="margin:0">…</p></div>`;
export async function bindAdminContract(){
  const box = document.getElementById('ctCard'); if(!box) return;
  const { data:c, error } = await sb.rpc('company_contract');
  if(error){ box.innerHTML = `<p class="err">${esc(error.message)}</p>`; return; }
  const fmtD = s => s ? new Date(s).toLocaleDateString() : '–';
  box.innerHTML = `<p class="small muted" style="margin-top:0">${esc(T('admHint'))}</p>
    <div class="steppers"><div><label class="f" for="ctH">${esc(T('hours'))}</label><input class="in" id="ctH" type="number" min="0" max="336" value="${+c.cancel_hours}"></div>
      <div><label class="f" for="ctP">${esc(T('penalty'))}</label><input class="in" id="ctP" type="number" min="0" max="500" step="5" value="${+c.penalty_eur}"></div></div>
    <label class="f" for="ctT">${esc(T('own'))}</label><textarea class="in" id="ctT" rows="5">${esc(c.text || '')}</textarea>
    <div class="tool-row" style="margin-top:8px"><button class="btn ghost small" id="ctStd">${esc(T('std'))}</button><button class="btn ghost small" id="ctPrev">${esc(T('preview'))}</button><button class="btn primary small" id="ctSave">${esc(T('save'))}</button></div>
    <p class="small muted">${esc(T('version'))}: ${esc(c.version)}</p><div class="err" id="ctErr"></div>
    <h3 style="margin:16px 0 6px">${esc(T('list'))}</h3>
    ${(c.cancellations || []).length ? (c.cancellations).map(x => `<div class="person-row" style="display:block;border-top:1px solid var(--line);padding:8px 0">
      <b>${esc(x.worker || '–')}</b> · ${esc(x.task || '–')}<div class="small muted">${esc(fmtD(x.at))} → ${esc(x.first_date ? fmtD(x.first_date) : '–')} · ${x.hours_before != null ? esc(String(x.hours_before).replace('.', ',') + ' ' + T('h')) : ''} · <b style="color:${x.late ? 'var(--danger,#DC2626)' : 'inherit'}">${esc(x.late ? T('late') : T('inTime'))}</b>${x.late && +x.penalty_eur ? ` · <span style="${x.waived ? 'text-decoration:line-through' : ''}">${esc(eur(x.penalty_eur))}</span> <button class="link" data-waive="${esc(x.id)}" data-w="${x.waived ? 0 : 1}">${esc(x.waived ? T('unwaive') : T('waive'))}</button>` : ''}</div>
      <div class="small">${esc(x.reason || T('noReason'))}</div></div>`).join('') : `<p class="small muted">${esc(T('none'))}</p>`}`;
  const cfg = () => ({ text:box.querySelector('#ctT').value, cancel_hours:+box.querySelector('#ctH').value, penalty_eur:+box.querySelector('#ctP').value });
  box.querySelector('#ctStd').onclick = () => {
    const tmp = document.createElement('div'); tmp.innerHTML = contractHtml(null, { cancel_hours:'{stunden}', penalty_eur:0 }, 'de');
    box.querySelector('#ctT').value = [...tmp.querySelectorAll('p,h3')].map(n => n.textContent).join('\n\n').replace(/\b0 €/g, '{strafe}').replace('[Unternehmen, Anschrift]', '{firma}');
  };
  box.querySelector('#ctPrev').onclick = () => { const m = modal(doc(cfg()) + `<button class="btn primary" data-ok>${esc(T('close'))}</button>`); m.querySelector('[data-ok]').onclick = () => m.remove(); };
  box.querySelector('#ctSave').onclick = async () => {
    box.querySelector('#ctSave').disabled = true;
    const { error:e2 } = await sb.rpc('update_contract', { p:cfg() });
    if(e2){ box.querySelector('#ctErr').textContent = e2.message; box.querySelector('#ctSave').disabled = false; return; }
    toast(T('saved')); bindAdminContract();
  };
  box.querySelectorAll('[data-waive]').forEach(b => b.onclick = async () => { await sb.rpc('waive_cancellation', { p_id:b.dataset.waive, p_waived:b.dataset.w === '1' }); bindAdminContract(); });
}
