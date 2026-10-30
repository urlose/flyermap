// Login by phone (SMS code only once), then choose admin or worker
import { t, I } from './i18n.js';
import { sb, store, errText, $, esc, PRIVACY_URL, deMobile } from './core.js';
import { legalLinks, bindLegal, legalModal } from './legalview.js';
import { UI, plain, cityPicker, langSwitch, toast } from './ui.js';
import { acceptToken } from './worker.js';
import { bootAdmin, viewAdminLogin } from './admin.js';
import { firmFields, readFirm, avvCheck, bindAvvRead, normCode } from './firm.js';
import { AVV_VERSION, setLegalFirm } from './legal.js';

export function viewLogin(){
  UI.role = null; UI.onTab = null;
  plain(`<div class="welcome">
      <div class="logo"><img src="icon.png" alt=""></div>
      <h1 class="hero">${esc(t('welcomeTitle'))}</h1>
      <p class="muted">${esc(t('welcomeText'))}</p>
      <label class="f">${esc(t('phoneLogin'))}</label>
      <input class="in" id="lPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+49 170 1234567">
      <p class="small muted">${esc(t('smsHint'))}</p>
      <button class="btn primary big" id="lSend">${esc(t('sendCode'))}</button><div class="err" id="lErr"></div>
      ${langSwitch(I.lang)}
      <p class="small center"><button class="link" id="lEmail">${esc(t('emailAdmin'))}</button></p>
      ${legalLinks()}
    </div>`);
  bindLegal(viewLogin);
  $('#lEmail').onclick = () => viewAdminLogin(viewLogin);
  $('#lPhone').addEventListener('keydown', e => { if(e.key === 'Enter') $('#lSend').click(); });
  $('#lSend').onclick = async () => {
    const phone = deMobile($('#lPhone').value);
    if(!phone){ $('#lErr').textContent = t('badPhone'); return; }
    await sendCode(phone, $('#lSend'), $('#lErr'));
  };
}
async function sendCode(phone, btn, errEl){
  btn.disabled = true; errEl.textContent = '';
  const { error } = await sb.auth.signInWithOtp({ phone });
  btn.disabled = false;
  if(error){
    const m = error.message || '';
    // only a missing / switched-off SMS provider is "not set up"; anything else (e.g. the SMS provider has not approved the account yet) is shown as it is
    errEl.textContent = /unsupported phone provider|phone.*(disabled|not enabled)|sms provider.*(not|missing)/i.test(m) ? t('smsNotConfigured')
      : /compliance|kyc|customer profile/i.test(m) ? t('smsPending')
      : (t('smsFail') + ' ' + m);
    return;
  }
  viewCode(phone);
}
function viewCode(phone){
  plain(`<button class="link back-link" id="bk">← ${esc(t('changeNumber'))}</button>
    <h1 class="hero">${esc(t('codeTitle'))}</h1><p class="muted">${esc(t('codeSent', { phone }))}</p>
    <input class="in pin" id="cCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••">
    <button class="btn primary big" id="cGo" style="margin-top:16px">${esc(t('verify'))}</button><div class="err" id="cErr"></div>
    <button class="btn ghost" id="cAgain" disabled></button>`);
  $('#bk').onclick = viewLogin;
  let left = 30; const again = $('#cAgain');
  const tick = () => { if(!again.isConnected) return; if(left > 0){ again.textContent = t('resendIn', { s:left-- }); setTimeout(tick, 1000); } else { again.textContent = t('resend'); again.disabled = false; } };
  tick();
  again.onclick = async () => { again.disabled = true; left = 30; tick(); const { error } = await sb.auth.signInWithOtp({ phone }); if(error) $('#cErr').textContent = t('smsFail') + ' ' + error.message; };
  const go = async () => {
    const token = $('#cCode').value.replace(/\D/g, ''); if(token.length < 4){ $('#cErr').textContent = t('wrongCode'); return; }
    $('#cGo').disabled = true; $('#cErr').textContent = '';
    const { error } = await sb.auth.verifyOtp({ phone, token, type:'sms' });
    if(error){ $('#cErr').textContent = t('wrongCode'); $('#cGo').disabled = false; return; }
    afterVerified();
  };
  $('#cGo').onclick = go; $('#cCode').addEventListener('input', () => { if($('#cCode').value.replace(/\D/g, '').length === 6) go(); });
}

// phone is verified: admin → choose role; everyone else → worker
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
async function viewProfileForm(signOut){
  const cp = cityPicker([]);
  const own = !signOut && !!(await store.get('canAdmin'));   // an admin's own distributor profile joins his company
  const code0 = normCode(await store.get('joinCode'));
  plain(`<h1 class="hero">${esc(t('yourData'))}</h1>
    ${own ? '' : `<label class="f" for="rCode">${esc(t('joinCode'))}</label><input class="in code-in" id="rCode" value="${esc(code0)}" autocomplete="off" autocapitalize="characters" maxlength="12" placeholder="ABCD2345">
    <div class="small muted" id="rCodeMsg">${esc(t('joinCodeHint'))}</div>`}
    <label class="f">${esc(t('name'))}</label><input class="in" id="rName" autocomplete="name">
    <label class="f">${esc(t('cities'))}</label>${cp.html}
    <label class="check"><input type="checkbox" id="rOffers"><span>${esc(t('offersOptIn'))}<br><small class="muted">${esc(t('offersOptInSub'))}</small></span></label>
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
    $('#rGo').disabled = true;
    const { data:tok, error } = await sb.rpc('register_worker_v4', { p_name:name, p_cities:cities, p_code:code, p_offers:!!$('#rOffers')?.checked });
    if(error){ $('#rErr').textContent = errText(error); $('#rGo').disabled = false; return; }
    await store.del('joinCode'); finishWorker(tok, signOut);
  };
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
