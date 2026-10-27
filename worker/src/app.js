import { t, I } from './i18n.js';
import './i18n2.js';
import './i18n3.js';
import { store } from './core.js';
import { UI } from './ui.js';
import { W, bootWorker, workerTab, acceptToken } from './worker.js';
import { A, bootAdmin, adminTab } from './admin.js';
import { viewLogin, switchRole } from './auth.js';

// language switch anywhere
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-lang]'); if(!b) return;
  I.lang = b.dataset.lang; document.documentElement.lang = I.lang; await store.set('lang', I.lang);
  if(UI.role === 'worker') workerTab(UI.tab || 'tasks');
  else if(UI.role === 'admin') adminTab(UI.tab || 'tasks');
  else viewLogin();
});

W.hooks.loggedIn = () => bootWorker();
W.hooks.loggedOut = viewLogin;
W.hooks.switchRole = switchRole;
A.hooks.loggedOut = viewLogin;
A.hooks.switchRole = switchRole;
// admin opens the worker view of a test worker without any SMS login (the admin session stays, so "switch to admin" works)
A.hooks.openWorkerToken = async token => { await store.set('canAdmin', true); await acceptToken(token); };

(async function boot(){
  I.lang = await store.get('lang') || 'de';          // German by default
  document.documentElement.lang = I.lang;
  const role = await store.get('role');
  if(role === 'admin' && await bootAdmin()) return;
  if(role !== 'admin' && await bootWorker()) return;
  viewLogin();
})();
