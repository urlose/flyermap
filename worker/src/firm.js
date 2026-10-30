// Companies: every company that uses FlyerMap registers itself (its admin enters the company details and accepts the AVV),
// sees only its own distributors, and gives them a company code to join. The company details appear in the distributors'
// privacy policy as the controller.
import { t } from './i18n.js';
import { sb, $, esc } from './core.js';
import { modal, toast, ICONS } from './ui.js';
import { avvHtml, AVV_VERSION, setLegalFirm } from './legal.js';

export const APP_URL = 'https://urlose.github.io/flyermap/app/';
export const joinLink = code => APP_URL + '?firma=' + encodeURIComponent(code);
export const normCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
const isSet = v => !!v && !/^\[/.test(String(v).trim());
export const firmComplete = c => !!c && isSet(c.name) && !!c.street && !!c.zip && !!c.city && !!c.representative && !!c.email;
export const avvOk = c => !!c && c.avv_version === (c.avv_current || AVV_VERSION);

// form fields (also used in the registration screen)
export function firmFields(c = {}){
  const v = k => esc(isSet(c[k]) ? c[k] || '' : '');
  return `<label class="f" for="fmName">${esc(t('fmName'))}</label><input class="in" id="fmName" value="${v('name')}" autocomplete="organization" placeholder="${esc(t('fmNamePh'))}">
    <label class="f" for="fmStreet">${esc(t('fmStreet'))}</label><input class="in" id="fmStreet" value="${v('street')}" autocomplete="street-address">
    <div class="steppers"><div style="flex:0 0 34%"><label class="f" for="fmZip">${esc(t('fmZip'))}</label><input class="in" id="fmZip" value="${v('zip')}" inputmode="numeric" maxlength="5" autocomplete="postal-code"></div>
      <div><label class="f" for="fmCity">${esc(t('fmCity'))}</label><input class="in" id="fmCity" value="${v('city')}" autocomplete="address-level2"></div></div>
    <label class="f" for="fmRep">${esc(t('fmRep'))}</label><input class="in" id="fmRep" value="${v('representative')}" autocomplete="name" placeholder="${esc(t('fmRepPh'))}">
    <label class="f" for="fmEmail">${esc(t('fmEmail'))}</label><input class="in" id="fmEmail" type="email" value="${v('email')}" autocomplete="email">
    <label class="f" for="fmPhone">${esc(t('fmPhone'))}</label><input class="in" id="fmPhone" type="tel" value="${v('phone')}" autocomplete="tel">
    <label class="f" for="fmDpo">${esc(t('fmDpo'))}</label><input class="in" id="fmDpo" value="${v('dpo')}" placeholder="${esc(t('fmDpoPh'))}">
    <label class="check"><input type="checkbox" id="fmWc" ${c.works_council ? 'checked' : ''}><span>${esc(t('fmWorksCouncil'))}</span></label>`;
}
// returns the values or an error text
export function readFirm(root = document){
  const g = id => (root.querySelector('#' + id)?.value || '').trim();
  const p = { name:g('fmName'), street:g('fmStreet'), zip:g('fmZip'), city:g('fmCity'), representative:g('fmRep'), email:g('fmEmail'), phone:g('fmPhone'), dpo:g('fmDpo'), works_council:!!root.querySelector('#fmWc')?.checked };
  if(p.name.length < 2) return { err:t('e_company_name_required') };
  if(p.street.length < 3) return { err:t('e_company_street_required') };
  if(!/^\d{5}$/.test(p.zip)) return { err:t('e_company_zip_required') };
  if(p.city.length < 2) return { err:t('e_company_city_required') };
  if(p.representative.length < 3) return { err:t('e_company_rep_required') };
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email)) return { err:t('e_company_email_required') };
  return { p };
}
export const avvCheck = () => `<label class="check"><input type="checkbox" id="fmAvv"><span>${esc(t('fmAvvAccept'))} <button type="button" class="link" id="fmAvvRead">${esc(t('fmAvvRead'))}</button></span></label>`;
export function bindAvvRead(getFirm){
  const b = $('#fmAvvRead'); if(b) b.onclick = e => { e.preventDefault(); avvModal(getFirm()); };
}
export function avvModal(firm){
  const m = modal(`<div class="legal legal-in-modal"><h2>${esc(t('avvTitle'))}</h2>${avvHtml(firm)}</div><button class="btn primary" data-ok>${esc(t('close'))}</button>`);
  m.querySelector('[data-ok]').onclick = () => m.remove();
}

export async function loadFirm(){
  const { data, error } = await sb.rpc('my_company_info');
  if(error) throw error;
  setLegalFirm(data);
  return data;
}

// card on the admin's Mitarbeiter page
export function firmCardHtml(c){
  if(!c) return '';
  const ok = firmComplete(c), avv = avvOk(c);
  return `<h2 class="sec">${esc(t('firm'))}</h2>
    <div class="card" style="display:block" id="firmCard">
      ${!ok || !avv ? `<div class="warnbox" style="margin-top:0">${esc(!ok ? t('firmMissing') : t('firmAvvMissing'))}</div>` : ''}
      ${ok ? `<b>${esc(c.name)}</b><div class="muted small">${esc([c.representative, c.street, [c.zip, c.city].filter(Boolean).join(' '), c.email].filter(Boolean).join(' · '))}</div>` : ''}
      <label class="f">${esc(t('firmCode'))}</label>
      <div class="code-row"><b class="code" id="fcCode">${esc(c.join_code)}</b>
        <button class="btn ghost small" id="fcCopy">${esc(t('copy'))}</button>
        <a class="btn ghost small" id="fcShare" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(t('firmInviteText', { firm:isSet(c.name) ? c.name : 'FlyerMap', link:joinLink(c.join_code), code:c.join_code }))}">${ICONS.chat}WhatsApp</a></div>
      <p class="small muted" style="margin:6px 0 0">${esc(t('firmCodeHint'))}</p>
      <p class="small" style="margin:12px 0 0">${avv ? esc(t('avvAccepted', { d:new Date(c.avv_accepted_at).toLocaleDateString(), v:c.avv_version })) : esc(t('avvNotAccepted'))} · <button class="link" id="fcAvv">${esc(t('fmAvvRead'))}</button></p>
      <div class="tool-row" style="margin-top:12px"><button class="btn ${ok && avv ? 'ghost' : 'primary'} small" id="fcEdit">${ICONS.edit}${esc(t('firmEdit'))}</button><button class="btn ghost small" id="fcNew">${ICONS.refresh}${esc(t('firmNewCode'))}</button></div>
    </div>`;
}
export function bindFirmCard(c, onChange){
  if(!$('#firmCard')) return;
  $('#fcCopy').onclick = async () => { try{ await navigator.clipboard.writeText(t('firmInviteText', { firm:isSet(c.name) ? c.name : 'FlyerMap', link:joinLink(c.join_code), code:c.join_code })); toast(t('copied')); }catch{ toast(c.join_code); } };
  $('#fcAvv').onclick = () => avvModal(c);
  $('#fcNew').onclick = async () => {
    const m = modal(`<h2>${esc(t('firmNewCode'))}</h2><p class="muted">${esc(t('firmNewCodeQ'))}</p><button class="btn primary" data-y>${esc(t('firmNewCode'))}</button><button class="btn ghost" data-n>${esc(t('cancel'))}</button>`);
    m.querySelector('[data-n]').onclick = () => m.remove();
    m.querySelector('[data-y]').onclick = async () => { const { data, error } = await sb.rpc('new_join_code'); m.remove(); if(error) return toast(error.message); c.join_code = data; onChange(c); };
  };
  $('#fcEdit').onclick = () => editFirm(c, onChange);
}
export function editFirm(c, onChange){
  const needAvv = !avvOk(c);
  const m = modal(`<h2>${esc(t('firmEdit'))}</h2>${firmFields(c)}${needAvv ? avvCheck() : ''}
    <button class="btn primary" id="fmSave" style="margin-top:14px">${esc(t('save'))}</button><button class="btn ghost" id="fmCancel">${esc(t('cancel'))}</button><div class="err" id="fmErr" role="alert"></div>`);
  if(needAvv) bindAvvRead(() => readFirm(m).p || c);
  m.querySelector('#fmCancel').onclick = () => m.remove();
  m.querySelector('#fmSave').onclick = async () => {
    const r = readFirm(m); if(r.err){ m.querySelector('#fmErr').textContent = r.err; return; }
    if(needAvv && !m.querySelector('#fmAvv').checked){ m.querySelector('#fmErr').textContent = t('e_avv_required'); return; }
    m.querySelector('#fmSave').disabled = true;
    const { data, error } = await sb.rpc('update_company', { p:{ ...r.p, avv_version:needAvv ? AVV_VERSION : undefined } });
    if(error){ m.querySelector('#fmErr').textContent = t('e_' + error.message) !== 'e_' + error.message ? t('e_' + error.message) : error.message; m.querySelector('#fmSave').disabled = false; return; }
    m.remove(); setLegalFirm(data); toast(t('saved')); onChange(data);
  };
}
