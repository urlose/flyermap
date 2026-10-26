import { t, I } from './i18n.js';
import { store, $, esc, PRIVACY_URL } from './core.js';
import { UI, plain, langSwitch } from './ui.js';
import { W, bootWorker, viewWorkerStart, workerTab } from './worker.js';
import { A, bootAdmin, viewAdminLogin, adminTab } from './admin.js';

function viewWelcome(){
  UI.role = null; UI.onTab = null;
  plain(`<div class="welcome">
      <div class="logo"><img src="icon.png" alt=""></div>
      <h1 class="hero">${esc(t('welcomeTitle'))}</h1>
      <p class="muted">${esc(t('welcomeText'))}</p>
      <button class="btn primary big" id="wW">${esc(t('iWorker'))}</button>
      <button class="btn ghost big" id="wA">${esc(t('iAdmin'))}</button>
      ${langSwitch(I.lang)}
      <p class="small center"><a href="${PRIVACY_URL}#${I.lang}" class="muted">${esc(t('privacy'))}</a></p>
    </div>`);
  $('#wW').onclick = () => viewWorkerStart(viewWelcome);
  $('#wA').onclick = () => viewAdminLogin(viewWelcome);
}

// language switch anywhere
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-lang]'); if(!b) return;
  I.lang = b.dataset.lang; document.documentElement.lang = I.lang; await store.set('lang', I.lang);
  if(UI.role === 'worker') workerTab(UI.tab || 'tasks');
  else if(UI.role === 'admin') adminTab(UI.tab || 'tasks');
  else viewWelcome();
});

W.hooks.loggedIn = () => bootWorker();
W.hooks.loggedOut = viewWelcome;
A.hooks.loggedOut = viewWelcome;

(async function boot(){
  I.lang = await store.get('lang') || 'de';          // German by default
  document.documentElement.lang = I.lang;
  const role = await store.get('role');
  if(role === 'admin' && await bootAdmin()) return;
  if(role !== 'admin' && await bootWorker()) return;
  viewWelcome();
})();
