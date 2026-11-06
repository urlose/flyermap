// Login by phone (SMS code only once), then choose admin or worker
import { t, I } from './i18n.js';
import { sb, store, errText, $, esc, PRIVACY_URL, deMobile } from './core.js';
import { legalLinks, bindLegal, legalModal } from './legalview.js';
import { UI, plain, cityPicker, langSwitch, toast, modal } from './ui.js';
import { acceptToken } from './worker.js';
import { bootAdmin, viewAdminLogin } from './admin.js';
import { firmFields, readFirm, avvCheck, bindAvvRead, normCode } from './firm.js';
import { AVV_VERSION, setLegalFirm } from './legal.js';

// invitation link of a firm (…/app/?neu=CODE): the worker creates the own account right away (no SMS); phone and towns follow in the profile
export async function viewJoinLink(code){
  let firm = null; try{ const { data } = await sb.rpc('firm_by_link', { p_code:code }); firm = data || null; }catch{}
  plain(`<div class="login"><h1 class="hero">${esc(t('joinTitle'))}</h1>
    <p class="muted">${esc(firm ? t('joinFirm', { name:firm }) : t('joinCodeBad'))}</p>
    ${firm ? `<label class="f" for="jName">${esc(t('name'))}</label><input class="in" id="jName" autocomplete="name">
    <label class="f" for="jPhone">${esc(t('joinPhone'))}</label><input class="in" id="jPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+49 170 1234567">
    <p class="small muted" style="margin:4px 0 0">${esc(t('joinPhoneHint'))}</p>
    <button class="btn primary big" id="jGo" style="margin-top:14px">${esc(t('joinGo'))}</button>` : ''}
    <div class="err" id="jErr"></div>
    <p class="small center"><button class="link" id="jBack">${esc(t('back'))}</button></p>${legalLinks()}</div>`);
  bindLegal(() => viewJoinLink(code));
  $('#jBack').onclick = async () => { if((await store.get('role')) === 'admin') location.replace(location.pathname); else viewLogin(); };   // an admin testing the link goes back to the admin
  if(!firm) return;
  $('#jGo').onclick = async () => {
    const b = $('#jGo'), name = $('#jName').value.trim(), phone = $('#jPhone').value.trim(); if(name.length < 2){ $('#jErr').textContent = t('e_name_required'); return; }
    if(phone.replace(/\D/g, '').length < 10){ $('#jErr').textContent = t('joinPhoneNeed'); return; }
    b.disabled = true;
    const { data, error } = await sb.rpc('join_by_link2', { p_code:code, p_name:name, p_phone:phone });
    if(error && /phone_taken/.test(error.message || '')){ $('#jErr').innerHTML = `${esc(t('joinPhoneTaken'))} <button class="link" id="jLogin">${esc(t('joinToLogin'))}</button>`; $('#jLogin').onclick = () => viewLogin(); b.disabled = false; return; }
    if(error || !data){ $('#jErr').textContent = error ? errText(error) : t('joinCodeBad'); b.disabled = false; return; }
    await store.set('canAdmin', false); await acceptToken(data);
  };
}
// number confirmed by WhatsApp: the person sends a code from the own WhatsApp to the firm number (the sender's number is the proof)
export async function waVerify(token, back){
  const { data:s, error } = await sb.rpc('wa_start', { p_token:token || null });
  if(error || !s || !s.enabled){ toast(error ? errText(error) : t('waOff')); back(); return null; }
  const link = 'https://wa.me/' + s.number + '?text=' + encodeURIComponent('FlyerMap Code ' + s.code);
  plain(`<div class="login"><h1 class="hero">${esc(t('waTitle'))}</h1><p class="muted">${esc(t('waHint'))}</p>
    <div class="wa-code">${esc(s.code)}</div>
    <a class="btn primary big" href="${esc(link)}" target="_blank" rel="noopener">${esc(t('waOpen'))}</a>
    <p class="small muted center" id="waSt">${esc(t('waWait'))}</p><div class="err" id="waErr"></div>
    <p class="small center"><button class="link" id="waBack">${esc(t('back'))}</button></p></div>`);
  let stop = false; $('#waBack').onclick = () => { stop = true; back(); };
  const t0 = Date.now();
  while(!stop && Date.now() - t0 < 15 * 60e3){
    await new Promise(r => setTimeout(r, 3000)); if(stop || !document.getElementById('waSt')) return null;
    const { data:c, error:e } = await sb.rpc('wa_check', { p_nonce:s.nonce });
    if(e){ const el = $('#waErr'); if(el) el.textContent = errText(e); if(/expired|taken/.test(e.message || '')) return null; continue; }
    if(c && c.state !== 'wait') return { ...c, nonce:s.nonce };
  }
  const st = $('#waSt'); if(!stop && st) st.textContent = t('waTimeout');
  return null;
}
async function waLogin(){
  const r = await waVerify(null, viewLogin); if(!r) return;
  await store.set('canAdmin', false);
  if(r.state === 'login') return acceptToken(r.token);
  if(r.state === 'new') return viewProfileForm(false, r.nonce);
}
export function viewLogin(){
  UI.role = null; UI.onTab = null;
  plain(`<div class="welcome">
      <div class="logo"><img src="icon.png" alt=""></div>
      <h1 class="hero">${esc(t('welcomeTitle'))}</h1>
      <p class="muted">${esc(t('welcomeText'))}</p>
      <button class="btn primary big hidden" id="lWa"><svg viewBox="0 0 24 24" aria-hidden="true" style="width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><path d="M3 21l1.65-3.8A9 9 0 1 1 7.8 20.3L3 21"/><path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1"/></svg>${esc(t('waLogin'))}</button>
      <p class="small muted hidden" id="lWaHint" style="margin-top:8px">${esc(t('waLoginHint'))}</p>
      <div class="note hidden" id="lNoWa" style="margin-top:0">${esc(t('noWaYet'))}</div>
      <button class="btn primary big hidden" id="lLinkBig">${esc(t('haveLink'))}</button><div class="err" id="lErr"></div>
      ${langSwitch(I.lang)}
      <p class="small center"><button class="link" id="lLink">${esc(t('haveLink'))}</button></p>
      <p class="small center"><button class="link" id="lEmail">${esc(t('emailAdmin'))}</button></p>
      ${legalLinks()}
    </div>`);
  bindLegal(viewLogin);
  // WhatsApp on: big WhatsApp button; until the firm number is set up: the login link from the admin is the way in
  const noWa = () => { if(!$('#lNoWa')) return; $('#lNoWa').classList.remove('hidden'); $('#lLinkBig').classList.remove('hidden'); $('#lLinkBig').onclick = () => $('#lLink').click(); $('#lLink').parentElement.classList.add('hidden'); };
  sb.rpc('wa_enabled').then(({ data }) => { const b = $('#lWa'); if(!b) return; if(data){ b.classList.remove('hidden'); $('#lWaHint').classList.remove('hidden'); b.onclick = waLogin; } else noWa(); }).catch(noWa);
  $('#lEmail').onclick = () => viewAdminLogin(viewLogin);
  // login link from the admin (WhatsApp etc.): in the installed app a link does not open the app, so it is pasted here
  $('#lLink').onclick = () => {
    const m = modal(`<h2>${esc(t('haveLink'))}</h2><p class="muted small">${esc(t('haveLinkHint'))}</p>
      <input class="in" id="lkIn" autocomplete="off" placeholder="https://…/app/?konto=…"><button class="btn primary" id="lkGo">${esc(t('haveLinkGo'))}</button><div class="err" id="lkErr"></div>`);
    m.querySelector('#lkGo').onclick = async () => {
      const v = m.querySelector('#lkIn').value, neu = (v.match(/[?&]neu=([A-Za-z0-9]+)/) || [])[1];
      if(neu){ m.remove(); return viewJoinLink(neu); }   // invitation link of a firm pasted in the installed app
      const id = (v.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i) || [])[0];
      if(!id){ m.querySelector('#lkErr').textContent = t('haveLinkBad'); return; }
      m.remove(); await store.set('canAdmin', false); await acceptToken(id);
    };
  };
}
// SMS sign-in removed on 06.11.2026 (no Twilio); numbers are confirmed via WhatsApp (wa_start / wa_check)
export async function afterVerified(){
  const { data:st, error } = await sb.rpc('me_status');
  if(error){ toast(error.message); return viewLogin(); }
  if(st.admin){
    await sb.rpc('become_admin'); await store.set('canAdmin', true);
    return viewRoleChoice();
  }
  await store.set('canAdmin', false);
  if(st.worker) return enterAsWorker(true);
  return viewNewUser();
}
// a new number: distributor (joins a company with its code) or a new company
function viewNewUser(){
  plain(`<h1 class="hero">${esc(t('newUserQ'))}</h1>
    <button class="btn primary big choice" id="nuW"><span>${esc(t('newUserWorker'))}</span><small>${esc(t('newUserWorkerSub'))}</small></button>
    <button class="btn ghost big choice" id="nuF"><span>${esc(t('newUserFirm'))}</span><small>${esc(t('newUserFirmSub'))}</small></button>
    ${langSwitch(I.lang)}`);
  $('#nuW').onclick = () => enterAsWorker(true);
  $('#nuF').onclick = viewFirmRegister;
}
function viewFirmRegister(){
  plain(`<button class="link back-link" id="bk">← ${esc(t('back'))}</button>
    <h1 class="hero">${esc(t('firmRegTitle'))}</h1><p class="muted small">${esc(t('firmRegHint'))}</p>
    ${firmFields({})}${avvCheck()}
    <button class="btn primary big" id="fmGo" style="margin-top:18px">${esc(t('firmRegBtn'))}</button><div class="err" id="fmErr" role="alert"></div>
    ${legalLinks()}`);
  bindLegal(viewFirmRegister); bindAvvRead(() => readFirm().p || {});
  $('#bk').onclick = viewNewUser;
  $('#fmGo').onclick = async () => {
    const r = readFirm(); if(r.err){ $('#fmErr').textContent = r.err; return; }
    if(!$('#fmAvv').checked){ $('#fmErr').textContent = t('e_avv_required'); return; }
    $('#fmGo').disabled = true;
    const { error } = await sb.rpc('register_company', { p:{ ...r.p, avv_version:AVV_VERSION } });
    if(error){ $('#fmErr').textContent = errText(error); $('#fmGo').disabled = false; return; }
    await store.set('canAdmin', true); await store.set('role', 'admin');
    if(!await bootAdmin()) viewLogin();
  };
}
function viewRoleChoice(){
  plain(`<h1 class="hero">${esc(t('asWho'))}</h1>
    <button class="btn primary big" id="rA">${esc(t('asAdmin'))}</button>
    <button class="btn ghost big" id="rW">${esc(t('asWorker'))}</button>
    ${langSwitch(I.lang)}`);
  $('#rA').onclick = async () => { await store.set('role', 'admin'); if(!await bootAdmin()) viewLogin(); };
  $('#rW').onclick = () => enterAsWorker(false);
}
export async function enterAsWorker(signOut){
  const { data:tok, error } = await sb.rpc('worker_login');
  if(error){ toast(error.message); return viewLogin(); }
  if(tok) return finishWorker(tok, signOut);
  viewProfileForm(signOut);
}
async function viewProfileForm(signOut, waNonce){
  const cp = cityPicker([]);
  const own = !waNonce && !signOut && !!(await store.get('canAdmin'));   // an admin's own distributor profile joins his company
  const code0 = normCode(await store.get('joinCode'));
  plain(`<h1 class="hero">${esc(t('yourData'))}</h1>
    ${own ? '' : `<label class="f" for="rCode">${esc(t('joinCode'))}</label><input class="in code-in" id="rCode" value="${esc(code0)}" autocomplete="off" autocapitalize="characters" maxlength="12" placeholder="ABCD2345">
    <div class="small muted" id="rCodeMsg">${esc(t('joinCodeHint'))}</div>`}
    <label class="f">${esc(t('name'))}</label><input class="in" id="rName" autocomplete="name">
    <label class="f">${esc(t('cities'))}</label>${cp.html}
    <button class="btn primary big" id="rGo" style="margin-top:18px">${esc(t('continue'))}</button><div class="err" id="rErr"></div>
    <p class="small muted">${esc(t('regAgree'))} <button class="link" id="rPriv">${esc(t('privacy'))}</button>.</p>`);
  cp.bind();
  $('#rPriv').onclick = () => legalModal('privacy');
  let firmName = null;
  const checkCode = async () => {
    const el = $('#rCode'); if(!el) return; const c = normCode(el.value), msg = $('#rCodeMsg'); firmName = null;
    if(c.length < 8){ msg.textContent = t('joinCodeHint'); msg.className = 'small muted'; return; }
    const { data } = await sb.rpc('company_by_code', { p_code:c });
    if(normCode($('#rCode')?.value) !== c) return;
    if(data && data.name){ firmName = data.name; msg.textContent = t('joinCodeOk', { name:data.name }); msg.className = 'small ok-text'; setLegalFirm(null); }
    else { msg.textContent = t('joinCodeBad'); msg.className = 'small err'; }
  };
  if($('#rCode')){ $('#rCode').oninput = checkCode; checkCode(); }
  $('#rGo').onclick = async () => {
    const name = $('#rName').value.trim(), cities = cp.get();
    const code = $('#rCode') ? normCode($('#rCode').value) : null;
    if($('#rCode') && code.length < 8){ $('#rErr').textContent = t('e_code_invalid'); return; }
    if(name.length < 2){ $('#rErr').textContent = t('e_name_required'); return; }
    if(!cities.length){ $('#rErr').textContent = t('e_city_required'); return; }
    const offers = await askOffers(); if(offers === null) return;   // own decision, nothing pre-selected (valid consent)
    $('#rGo').disabled = true;
    const { data:tok, error } = waNonce ? await sb.rpc('wa_register', { p_nonce:waNonce, p_name:name, p_cities:cities, p_code:code, p_offers:offers })
      : await sb.rpc('register_worker_v4', { p_name:name, p_cities:cities, p_code:code, p_offers:offers });
    if(error){ $('#rErr').textContent = errText(error); $('#rGo').disabled = false; return; }
    await store.del('joinCode'); finishWorker(tok, signOut);
  };
}
// last registration step: job offers from other companies – yes (prominent) or no; tapping outside = back to the form
function askOffers(){
  return new Promise(res => {
    const m = modal(`<h2>${esc(t('offersQ'))}</h2><p class="muted">${esc(t('offersQSub'))}</p>
      <button class="btn primary big" data-y>${esc(t('offersYes'))}</button><button class="link offers-no" data-n>${esc(t('offersNo'))}</button>`);
    let done = false; const fin = v => { if(done) return; done = true; m.remove(); res(v); };
    m.querySelector('[data-y]').onclick = () => fin(true);
    m.querySelector('[data-n]').onclick = () => fin(false);
    new MutationObserver((_, o) => { if(!m.isConnected){ o.disconnect(); fin(null); } }).observe(document.body, { childList:true });
  });
}
async function finishWorker(token, signOut){
  if(signOut) await sb.auth.signOut();
  await acceptToken(token);
}
// role switch for accounts that are admin and worker
export async function switchRole(to){
  if(to === 'admin'){ await store.set('role', 'admin'); if(!await bootAdmin()) viewLogin(); }
  else { await store.set('role', 'worker'); await enterAsWorker(false); }
}
