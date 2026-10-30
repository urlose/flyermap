// Login by phone (SMS code only once), then choose admin or worker
import { t, I } from './i18n.js';
import { sb, store, errText, $, esc, PRIVACY_URL, deMobile } from './core.js';
import { legalLinks, bindLegal, legalModal } from './legalview.js';
import { UI, plain, cityPicker, langSwitch, toast } from './ui.js';
import { acceptToken } from './worker.js';
import { bootAdmin, viewAdminLogin } from './admin.js';

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
  return enterAsWorker(true);
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
function viewProfileForm(signOut){
  const cp = cityPicker([]);
  plain(`<h1 class="hero">${esc(t('yourData'))}</h1>
    <label class="f">${esc(t('name'))}</label><input class="in" id="rName" autocomplete="name">
    <label class="f">${esc(t('cities'))}</label>${cp.html}
    <button class="btn primary big" id="rGo" style="margin-top:18px">${esc(t('continue'))}</button><div class="err" id="rErr"></div>
    <p class="small muted">${esc(t('regAgree'))} <button class="link" id="rPriv">${esc(t('privacy'))}</button>.</p>`);
  cp.bind();
  $('#rPriv').onclick = () => legalModal('privacy');
  $('#rGo').onclick = async () => {
    const name = $('#rName').value.trim(), cities = cp.get();
    if(name.length < 2){ $('#rErr').textContent = t('e_name_required'); return; }
    if(!cities.length){ $('#rErr').textContent = t('e_city_required'); return; }
    $('#rGo').disabled = true;
    const { data:tok, error } = await sb.rpc('register_worker_v2', { p_name:name, p_cities:cities });
    if(error){ $('#rErr').textContent = errText(error); $('#rGo').disabled = false; return; }
    finishWorker(tok, signOut);
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
