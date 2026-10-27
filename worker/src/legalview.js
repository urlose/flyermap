// In-app legal screens (Datenschutz, Impressum) and the one-time note on location recording.
import { I, t } from './i18n.js';
import { $, esc } from './core.js';
import { plain, modal } from './ui.js';
import { legalHtml, LEGAL_TITLES, LOCATION_NOTE, PRIVACY_VERSION, PRIVACY_DATE } from './legal.js';

const lang = () => (I.lang === 'ru' ? 'ru' : 'de');
// full screen with a back button; `back` re-renders the screen we came from
export function viewLegal(kind, back){
  const l = lang();
  plain(`<div class="legal">
    <button class="btn ghost small" id="lgBack">‹ ${esc(t('back'))}</button>
    <h1>${esc(LEGAL_TITLES[kind][l])}</h1>
    ${kind === 'privacy' ? `<p class="muted small">${esc(t('legalAsOf'))} ${esc(PRIVACY_DATE[l])}</p>` : ''}
    ${legalHtml(kind, l)}
    <p class="small"><button class="link" data-legal="${kind === 'privacy' ? 'imprint' : 'privacy'}">${esc(LEGAL_TITLES[kind === 'privacy' ? 'imprint' : 'privacy'][l])}</button></p>
  </div>`);
  $('#lgBack').onclick = back;
  bindLegal(back);
  const r = document.querySelector('.plain'); if(r) r.scrollTop = 0;
}
// the text in a pop-up (keeps what was typed on the screen underneath)
export function legalModal(kind){
  const l = lang(), m = modal(`<div class="legal legal-in-modal"><h2>${esc(LEGAL_TITLES[kind][l])}</h2>${legalHtml(kind, l)}</div><button class="btn primary" data-ok>${esc(t('close'))}</button>`);
  m.querySelector('[data-ok]').onclick = () => m.remove();
}
// small links "Datenschutz · Impressum" for any screen
export const legalLinks = () => `<p class="small center legal-links"><button class="link muted" data-legal="privacy">${esc(t('privacy'))}</button> · <button class="link muted" data-legal="imprint">${esc(t('imprint'))}</button></p>`;
export function bindLegal(back){ document.querySelectorAll('[data-legal]').forEach(b => b.onclick = () => viewLegal(b.dataset.legal, back)); }

// before the first working day (and after a substantial change of the policy): what is recorded, who sees it, how long
export function locationNote(me, onAck){
  if(me && me.privacy_version === PRIVACY_VERSION) return Promise.resolve(true);
  const n = LOCATION_NOTE[lang()];
  return new Promise(resolve => {
    const m = modal(`<h2>${esc(n.title)}</h2><ul class="note-list">${n.items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      <p class="small"><button class="link" data-full>${esc(t('privacy'))}</button></p>
      <button class="btn primary" data-ok>${esc(n.ok)}</button><button class="btn ghost" data-no>${esc(t('cancel'))}</button><div class="err" data-err></div>`);
    m.querySelector('[data-no]').onclick = () => { m.remove(); resolve(false); };
    m.querySelector('[data-full]').onclick = () => {
      const box = document.createElement('div'); box.className = 'legal legal-in-modal'; box.innerHTML = legalHtml('privacy', lang());
      m.querySelector('[data-full]').replaceWith(box);
    };
    m.querySelector('[data-ok]').onclick = async () => {
      try{ await onAck(PRIVACY_VERSION); m.remove(); resolve(true); }
      catch(e){ m.querySelector('[data-err]').textContent = (e && e.message) || 'error'; }
    };
  });
}
