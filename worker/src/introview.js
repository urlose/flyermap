// The short "how the app works" video for distributors: once after the first login, and any time from the help page.
// The files are part of the app (assets/video → www/video), so the phone app shows them without signal.
import { t, I } from './i18n.js';
import { store, esc } from './core.js';
import { modal } from './ui.js';

const file = () => 'video/intro-' + (I.lang === 'ru' ? 'ru' : 'de') + '.mp4';   // German for every other language

export function introVideo(){
  return new Promise(resolve => {
    const m = modal(`<h2>${esc(t('introT'))}</h2><p class="muted small" style="margin:0 0 10px">${esc(t('introSub'))}</p>
      <div class="intro-video"><video src="${file()}" autoplay muted playsinline controls preload="auto"></video></div>
      <p class="err" id="ivErr" hidden>${esc(t('introErr'))}</p>
      <button class="btn primary" data-ok style="margin-top:12px">${esc(t('introOk'))}</button>`);
    const v = m.querySelector('video');
    v.onerror = () => { m.querySelector('.intro-video').hidden = true; m.querySelector('#ivErr').hidden = false; };
    m.querySelector('[data-ok]').onclick = () => m.remove();
    new MutationObserver((_, o) => { if(!m.isConnected){ o.disconnect(); try{ v.pause(); }catch{} resolve(); } }).observe(document.body, { childList:true });
  });
}
// once per phone, after the first login; `ok()` says whether now is a good moment (not while a route is running)
export async function introOnce(ok){
  if(await store.get('introSeen')) return;
  if(ok && !ok()) return;
  if(document.querySelector('.modal')) return;   // something else is asking right now: next start
  await store.set('introSeen', 1);
  introVideo();
}
