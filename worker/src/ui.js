import L from 'leaflet';
import { t } from './i18n.js';
import { $, esc, css, searchPlaces, bikeRoute, NATIVE } from './core.js';

export const TILES = 'https://tile.openstreetmap.de/{z}/{x}/{y}.png';
// Icons: Lucide (ISC licence, https://lucide.dev) – one family, stroke 2, 24 px grid (since 16.11.2026)
export const ICONS = {
  map:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/></svg>',
  gear:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></svg>',
  person:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5c1.2-4 4.1-6 7.5-6s6.3 2 7.5 6"/></svg>',
  flag:'<svg viewBox="0 0 24 24" aria-hidden="true" class="ia ia-flag"><path d="M5.5 21V3.5"/><path class="ia-cloth" d="M5.5 4h12l-2.6 4.2 2.6 4.3h-12"/></svg>',
  search:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
  back:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7"/></svg>',
  plus:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  chevron:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
  bell:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15z"/><path d="M10 21h4"/></svg>',
  pause:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>',
  locate:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
  pin:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>',
  expand:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
  shrink:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg>',
  phone:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>',
  chat:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>',
  check:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  logout:'<svg viewBox="0 0 24 24" aria-hidden="true" class="ia ia-out"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><g class="ia-arrow"><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></g></svg>',
  chart:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 17V9"/><path d="M18 17V5"/><path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M8 17v-3"/></svg>',
  clock:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  calendar:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/></svg>',
  route:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></svg>',
  users:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 21a8 8 0 0 0-16 0"/><circle cx="10" cy="8" r="5"/><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3"/></svg>',
  mail:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-9 5.7a2 2 0 0 1-2 0L2 7"/></svg>',
  sun:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/></svg>',
  moon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>',
  device:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/></svg>',
  wifiOff:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h.01M8.5 16.4a5 5 0 0 1 7 0M2 8.8a15 15 0 0 1 4.2-2.6M10.7 5c4-.4 8.1.9 11.3 3.8M16.9 11.3a10 10 0 0 1 2.2 1.6M5 13a10 10 0 0 1 5.2-2.8M2 2l20 20"/></svg>',
  gps:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12h3M19 12h3M12 2v3M12 19v3"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/></svg>',
  alert:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
  inbox:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/></svg>',
  edit:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.2 6.8a2.8 2.8 0 0 0-4-4L3.8 16.2a2 2 0 0 0-.5.8L2 21.4a.5.5 0 0 0 .6.6L7 20.7a2 2 0 0 0 .8-.5z"/></svg>',
  play:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>',
  close:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  clipboard:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>',
  layers:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/></svg>',
  scan:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/></svg>',
  table:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/></svg>',
  grid:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>',
  more:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>',
  sliders:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 4h-7"/><path d="M10 4H3"/><path d="M21 12h-9"/><path d="M8 12H3"/><path d="M21 20h-5"/><path d="M12 20H3"/><path d="M14 2v4"/><path d="M8 10v4"/><path d="M16 18v4"/></svg>',
  activity:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/></svg>',
  circleCheck:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
  sortAsc:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>',
  refresh:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/></svg>',
};

/* ---------- theme (system / light / dark) ---------- */
export const THEMES = ['system', 'light', 'dark'];
export function applyTheme(v){
  const r = document.documentElement;
  if(v === 'light' || v === 'dark') r.dataset.theme = v; else delete r.dataset.theme;
  const dark = v === 'dark' || (v !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name=theme-color]').forEach(m => m.setAttribute('content', dark ? '#101318' : '#F5F6F8'));
}
export function themeSwitch(cur){
  const ic = { system:'device', light:'sun', dark:'moon' };
  return `<label class="f">${esc(t('theme'))}</label><div class="seg" role="radiogroup">${THEMES.map(k => `<button role="radio" aria-checked="${k === (cur || 'system')}" class="${k === (cur || 'system') ? 'on' : ''}" data-theme-set="${k}">${esc(t('theme_' + k))}</button>`).join('')}</div>`;
}
/* status chip: kind = info | ok | live | warn | bad | neutral; text always shown (colour alone never carries the meaning) */
export const statusPill = (kind, text) => `<span class="pill ${kind === 'info' ? '' : kind}">${esc(text)}</span>`;
export const emptyState = (text, icon = 'inbox') => `<div class="empty">${ICONS[icon] || ''}${esc(text)}</div>`;
// banner while the device has no connection
export function initOffline(){
  const upd = () => {
    let el = document.getElementById('offline');
    if(navigator.onLine){ if(el) el.remove(); return; }
    if(!el){ el = document.createElement('div'); el.id = 'offline'; el.className = 'offline'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.innerHTML = ICONS.wifiOff + '<span>' + esc(t('offlineBanner')) + '</span>';
  };
  addEventListener('online', upd); addEventListener('offline', upd); upd();
}

// a map that was removed (the screen changed) may still get a late call from a timer or an awaited request:
// ignore those instead of throwing "_leaflet_pos" errors
for(const fn of ['invalidateSize', 'setView', 'fitBounds', 'panTo', 'panBy', 'flyTo', 'setZoom']){
  const orig = L.Map.prototype[fn];
  L.Map.prototype[fn] = function(...args){ return this._mapPane ? orig.apply(this, args) : this; };
}

/* ---------- screen + tabs ---------- */
export const UI = { maps:[], timers:[], role:null, tab:null, onTab:null };
export function cleanup(){
  UI.maps.forEach(m => { try{ m.remove(); }catch{} }); UI.maps = [];
  UI.timers.forEach(clearInterval); UI.timers = [];
}
export function every(ms, fn){ const id = setInterval(fn, ms); UI.timers.push(id); return id; }
// full screen without tab bar (welcome, auth)
export function plain(html){ cleanup(); $('#root').innerHTML = `<div class="plain"><div class="plain-in">${html}</div></div>`; }
// screen inside the tab shell
// where the person is (…#task/<id>): kept in the address, so a reload opens the same screen again
// admin: every screen is a history entry, so the browser's back/forward buttons work (popstate → UI.onRoute)
export function setLoc(s){ try{ const url = location.pathname + location.search + (s ? '#' + s : ''); if(UI.role === 'admin' && UI.routed && location.hash.slice(1) !== s) history.pushState(null, '', url); else history.replaceState(history.state, '', url); UI.routed = true; }catch{} }
window.addEventListener('popstate', () => { if(UI.role === 'admin' && UI.onRoute) UI.onRoute(); });
export const getLoc = () => { try{ return decodeURIComponent((location.hash || '').slice(1)); }catch{ return ''; } };
export function shell(tab, html, opts = {}){
  cleanup(); UI.tab = tab; setLoc(tab);
  const peopleLabel = UI.role === 'admin' ? t('tabPeople') : t('tabProfile');
  $('#root').innerHTML = `<div class="shell${UI.role === 'admin' && sbMini() ? ' sb-mini' : ''}">
    <main id="content" class="${opts.map ? 'content map-content' : 'content'}">${html}</main>
    <nav class="tabbar" role="tablist">
      <span class="sb-brand"><a href="./" id="sbHome" class="wm ${UI.wmShown ? '' : 'wm-in'}" aria-label="FlyerMap"><span aria-hidden="true"><i style="--i:0">F</i><i style="--i:1">l</i><i style="--i:2">y</i><i style="--i:3">e</i><i style="--i:4">r</i></span><span class="wm-b" aria-hidden="true"><i style="--i:5">M</i><i style="--i:6">a</i><i style="--i:7">p</i></span></a></span>
      ${[['map', 'map', t('tabMap')], ['people', UI.role === 'admin' ? 'users' : 'person', peopleLabel], ['tasks', 'clipboard', t('tabTasks')], ...(UI.role === 'admin' ? [['stats', 'chart', t('tabStats')], ['settings', 'gear', t('tabSettings')]] : [])].map(([k, ic, lb]) =>
        `<button role="tab" class="tab ${k === tab ? 'on' : ''}" data-tab="${k}" aria-selected="${k === tab}" title="${esc(lb)}">${ICONS[ic]}<span>${esc(lb)}</span>${badge(k)}</button>`).join('')}
      ${UI.role === 'admin' ? `<button class="tab sb-toggle" id="sbMini" aria-pressed="${sbMini()}" title="${esc(t(sbMini() ? 'sbOpen' : 'sbClose'))}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d="${sbMini() ? 'M13 10l2 2-2 2' : 'M15 10l-2 2 2 2'}"/></svg><span>${esc(t(sbMini() ? 'sbOpen' : 'sbClose'))}</span></button>` : ''}
      ${UI.role === 'admin' && UI.onLogout ? `<button class="tab tab-out" id="sbOut">${ICONS.logout}<span>${esc(t('logout'))}</span></button>` : ''}
      ${verHtml()}
    </nav>${opts.fab ? `<button class="fab" id="fab" aria-label="${esc(opts.fab)}" title="${esc(opts.fab)}">${ICONS.plus}</button>` : ''}</div>`;
  UI.wmShown = true;   // the letters rise in only on the first screen after loading
  document.querySelectorAll('.tab[data-tab]').forEach(b => b.onclick = () => UI.onTab && UI.onTab(b.dataset.tab));
  const hm = document.getElementById('sbHome'); if(hm) hm.onclick = e => { e.preventDefault(); location.href = location.pathname + location.search; };   // logo: reload, start screen
  const so = document.getElementById('sbOut'); if(so) so.onclick = () => UI.onLogout();
  bindVer();
  const mi = document.getElementById('sbMini'); if(mi) mi.onclick = () => {   // no re-render: the page (and an open order) stays
    const on = !sbMini(); try{ localStorage.setItem('fm.sbMini', on ? '1' : '0'); }catch{}
    document.querySelector('.shell').classList.toggle('sb-mini', on); mi.setAttribute('aria-pressed', on); mi.title = t(on ? 'sbOpen' : 'sbClose');
    mi.querySelector('span').textContent = t(on ? 'sbOpen' : 'sbClose'); mi.querySelector('path:last-child').setAttribute('d', on ? 'M13 10l2 2-2 2' : 'M15 10l-2 2 2 2');
    setTimeout(() => UI.maps.forEach(m => { try{ m.invalidateSize(); }catch{} }), 220); };
}
// Build label in the menu (24.11.2026): always visible – bottom of the tab bar on phones, under the sidebar on desktop.
// Source is the single label stamped into index.html at build time (worker/scripts/stamp-version.mjs), so it changes with
// every merged PR. The web app also looks for a newer release while it is open; then the label becomes a "load" button.
export const buildVer = () => { const v = typeof document !== 'undefined' && document.getElementById('flyermap-build-version'); return v ? String(v.textContent || '').trim() : ''; };
const verHtml = () => {
  const v = buildVer(); if(!v) return '';
  const [d, h] = v.split('+'), nv = UI.newVer;
  return nv ? `<button class="tab-ver new" id="tabVer" title="${esc(t('verNewTip', { v:nv }))}">${esc(t('verNew'))}</button>`
    : `<div class="tab-ver" id="tabVer" title="FlyerMap ${esc(v)}" aria-label="FlyerMap ${esc(v)}"><i>${esc(d)}</i><i>${h ? '+' + esc(h) : ''}</i></div>`;
};
const bindVer = () => { const b = document.getElementById('tabVer'); if(b && UI.newVer) b.onclick = () => location.reload(); };
export function startVersionWatch(){
  if(NATIVE || !/^https?:$/.test(location.protocol) || UI.verWatch) return;   // the phone app carries its files; a new release comes with the APK / TestFlight
  UI.verWatch = true;
  const cur = buildVer(); if(!cur) return;
  let last = 0;
  const check = async () => {
    if(UI.newVer || Date.now() - last < 60000 || !navigator.onLine) return; last = Date.now();
    try{
      const html = await (await fetch(location.pathname + '?vcheck=' + Date.now(), { cache:'no-store', credentials:'same-origin' })).text();
      const m = html.match(/id="flyermap-build-version"[^>]*>([^<]+)</), v = m && m[1].trim();
      if(v && v !== cur && /^v\d{4}\.\d{2}\.\d{2}\+[0-9a-f]{7}$/.test(v)){
        UI.newVer = v; const el = document.getElementById('tabVer');
        if(el){ el.outerHTML = verHtml(); bindVer(); }
      }
    }catch{}
  };
  setTimeout(check, 20000); setInterval(check, 10 * 60000);
  document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') check(); });
}
// desktop sidebar: narrow (icons only) or wide; kept in this browser
const sbMini = () => { try{ return localStorage.getItem('fm.sbMini') === '1'; }catch{ return false; } };
// small number on a tab: things the admin should look at (UI.badges = { tasks:{ n, tip } })
const badge = k => { const b = UI.badges && UI.badges[k]; return b && b.n ? `<span class="tab-badge" title="${esc(b.tip || '')}" aria-label="${esc(b.tip || String(b.n))}">${b.n > 99 ? '99+' : b.n}</span>` : ''; };
// section index for long pages: one chip per <h2 class="sec">, a tap scrolls there; the chip of the section on screen is marked
export function secNav(nav, root){
  const hs = [...(root || document).querySelectorAll('.content h2.sec')].filter(h => !h.closest('.no-nav'));
  if(!nav || hs.length < 3){ if(nav) nav.remove(); return; }
  nav.innerHTML = hs.map((h, i) => { h.id = h.id || 'sec-' + i; return `<a class="mchip" href="#" data-go="${h.id}">${esc(h.dataset.short || h.textContent)}</a>`; }).join('');
  const smooth = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  nav.querySelectorAll('[data-go]').forEach(a => a.onclick = e => { e.preventDefault(); document.getElementById(a.dataset.go).scrollIntoView({ behavior:smooth(), block:'start' }); });
  if(!('IntersectionObserver' in window)) return;
  const mark = id => nav.querySelectorAll('[data-go]').forEach(a => { const on = a.dataset.go === id; a.classList.toggle('on', on); if(on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
  const io = new IntersectionObserver(es => { const v = es.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if(v) mark(v.target.id); }, { rootMargin:'-80px 0px -60% 0px' });
  hs.forEach(h => io.observe(h)); mark(hs[0].id);
}
export const topbar = (title, backFn, right = '') => `<header class="topbar ${backFn ? 'sub' : ''}">${backFn ? `<button class="icon-btn" id="tbBack" aria-label="${esc(t('back'))}">${ICONS.back}</button>` : ''}<h1>${esc(title)}</h1>${right ? `<div style="margin-left:auto;display:flex;gap:8px">${right}</div>` : ''}</header>`;
export function bindBack(fn){ const b = $('#tbBack'); if(b) b.onclick = fn; }

/* ---------- map ---------- */
// map tiles are kept on the phone (Cache Storage): a map seen once (or the route area loaded in advance) shows without signal
const TILE_CACHE = 'fm-tiles-v1', TILE_MAX = 6000; let tilePuts = 0;
async function trimTiles(c){ try{ const ks = await c.keys(); for(let i = 0; i < ks.length - TILE_MAX; i++) await c.delete(ks[i]); }catch{} }
export async function tileBlob(url, onlyCache){
  if(!('caches' in window)) throw new Error('no_cache');
  const c = await caches.open(TILE_CACHE), hit = await c.match(url);
  if(hit) return hit.blob();
  if(onlyCache || !navigator.onLine) throw new Error('offline');
  const r = await fetch(url, { mode:'cors', credentials:'omit' }); if(!r.ok) throw new Error('tile ' + r.status);
  await c.put(url, r.clone()); if(++tilePuts % 200 === 0) trimTiles(c);
  return r.blob();
}
const CachedTiles = L.TileLayer.extend({
  createTile(coords, done){
    const img = document.createElement('img'), url = this.getTileUrl(coords);
    img.alt = ''; img.setAttribute('role', 'presentation');
    const direct = () => { img.onload = () => done(null, img); img.onerror = e => done(e, img); img.src = url; };
    tileBlob(url).then(b => { const u = URL.createObjectURL(b); img.onload = () => { URL.revokeObjectURL(u); done(null, img); }; img.onerror = e => { URL.revokeObjectURL(u); done(e, img); }; img.src = u; })
      .catch(e => { if(e && e.message === 'offline') done(e, img); else direct(); });
    return img;
  }
});
// load the map of a route in advance (zoom 15–17 along the path, a few hundred tiles at most), when there is signal
export async function prefetchRoute(path, key){
  if(!path || path.length < 2 || !navigator.onLine || !('caches' in window)) return;
  const done = (() => { try{ return JSON.parse(localStorage.getItem('fm.tilesDone') || '[]'); }catch{ return []; } })();
  if(key && done.includes(key)) return;
  const tiles = new Set();
  const tx = (lng, z) => Math.floor((lng + 180) / 360 * 2 ** z), ty = (lat, z) => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z); };
  for(let i = 0; i < path.length; i++){
    const a = path[i], b = path[i + 1] || a, n = Math.max(1, Math.ceil(Math.hypot((b[0] - a[0]) * 111000, (b[1] - a[1]) * 70000) / 80));
    for(let k = 0; k < n; k++){ const lat = a[0] + (b[0] - a[0]) * k / n, lng = a[1] + (b[1] - a[1]) * k / n; for(const z of [15, 16, 17]) tiles.add(z + '/' + tx(lng, z) + '/' + ty(lat, z)); }
    if(tiles.size > 700) break;
  }
  const urls = [...tiles].slice(0, 700).map(s => { const [z, x, y] = s.split('/'); return TILES.replace('{z}', z).replace('{x}', x).replace('{y}', y); });
  let ok = 0;
  for(let i = 0; i < urls.length; i += 4){
    if(!navigator.onLine) return;
    const res = await Promise.allSettled(urls.slice(i, i + 4).map(u => tileBlob(u))); ok += res.filter(r => r.status === 'fulfilled').length;
  }
  if(key && ok > urls.length * 0.9){ done.push(key); try{ localStorage.setItem('fm.tilesDone', JSON.stringify(done.slice(-50))); }catch{} }
}
export function makeMap(el, center, zoom = 15, opts = {}){
  const { zoomButtons = true, ...mo } = opts;
  const m = L.map(el, { zoomControl:false, attributionControl:true, ...mo }).setView(center || [51.2277, 6.7735], zoom);
  if(zoomButtons) addZoomButtons(m, el);
  new CachedTiles(TILES, { maxZoom:19, attribution:'© OpenStreetMap' }).addTo(m);
  UI.maps.push(m); el._map = m;
  // zoomed out (country / region): only the markers, names come back from city level on (people on the way keep theirs)
  const far = () => el.classList.toggle('map-far', m.getZoom() < 10); m.on('zoomend', far); far();
  setTimeout(() => m.invalidateSize(), 60);
  return m;
}
// + / − on every map (24.11.2026): one look on phone and desktop; where it sits depends on the screen (CSS .map-zoom)
function addZoomButtons(m, el){
  const box = document.createElement('div'); box.className = 'map-zoom'; box.setAttribute('role', 'group'); box.setAttribute('aria-label', t('lmTools'));
  box.innerHTML = `<button type="button" class="map-tool" data-z="1" title="${esc(t('lmZoomIn'))}" aria-label="${esc(t('lmZoomIn'))}">${ICONS.plus}</button>`
    + `<button type="button" class="map-tool" data-z="-1" title="${esc(t('lmZoomOut'))}" aria-label="${esc(t('lmZoomOut'))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg></button>`;
  L.DomEvent.disableClickPropagation(box); L.DomEvent.disableScrollPropagation(box);
  box.querySelectorAll('[data-z]').forEach(b => b.onclick = () => b.dataset.z === '1' ? m.zoomIn() : m.zoomOut());
  const upd = () => { const z = m.getZoom(); box.querySelector('[data-z="1"]').disabled = z >= m.getMaxZoom(); box.querySelector('[data-z="-1"]').disabled = z <= m.getMinZoom(); };
  m.on('zoomend', upd); upd();
  el.appendChild(box);
}
export const dot = (cls, size = 22) => L.divIcon({ className:'', html:`<div class="${cls}"></div>`, iconSize:[size, size], iconAnchor:[size/2, size/2] });
export const labelIcon = (cls, text) => L.divIcon({ className:'', html:`<div class="pin-wrap"><div class="${cls}"></div><span class="pin-label">${esc(text)}</span></div>`, iconSize:[24, 24], iconAnchor:[12, 12] });
// the trips between the places of an order (jump points [lat,lng,1] in a route): drawn along the roads (car, bike or bus –
// it does not matter which). Car/bike trips use the drive colour, never the green of finished streets; the exact connection for the worker comes from Google / Apple Maps
// ride time per change of place stored with a time-budget plan (days[].budget_travel_min or days[].rides[].min); null = not known
export function rideMinOf(plans){
  for(const p of plans || []) for(const d of (p && p.days) || []){
    if(+d.budget_travel_min > 0) return +d.budget_travel_min;
    for(const r of d.rides || []) if(+r.min > 0) return +r.min;
  }
  return null;
}
// rides of saved plans (days[].rides with idx + geom) or of a fresh plan (route.jumps)
export const ridesOf = plans => (plans || []).flatMap(p => [...(p.jumps || []), ...((p.days || []).flatMap(d => d.rides || []))]).filter(r => r && r.idx != null && Array.isArray(r.geom));
export function drawJumps(g, path, bike, rideMin = null, rides = null){
  const mode = typeof bike === 'string' ? bike : (bike ? 'bike' : 'bus'); bike = mode !== 'bus';   // 'car' | 'bike' | 'bus' (old callers: true = bike)
  (path || []).forEach((q, i) => {
    if(!i || q[2] !== 1 || q[3] === 'r') return;   // 'r': short walk over to a replacement street – no bus / car trip
    const a = [path[i - 1][0], path[i - 1][1]], b = [q[0], q[1]];
    const rd = mode === 'zones' && rides ? rides.find(x => x.idx === i && !x.walk && x.geom && x.geom.length > 1) : null;
    if(mode === 'zones' && rides && rides.some(x => x.idx === i && x.walk)) return;   // a few streets on foot: no ride drawn
    if(rd){   // 19.11.2026: the car ride on the road, km and minutes on the map; an estimate is dashed and says so
      L.polyline(rd.geom, { color:'#FFFFFF', weight:7, opacity:.55, lineCap:'round', interactive:false }).addTo(g);
      L.polyline(rd.geom, { color:css('--color-drive') || '#7C3AED', weight:4, opacity:.95, dashArray:rd.known ? null : '6 7', lineCap:'round', interactive:false, className:'ride-road' }).addTo(g);
      const mid = rd.geom[Math.floor(rd.geom.length / 2)], lab = t(rd.known ? 'rideRoadLabel' : 'rideRoadEst', { km:(+rd.km).toLocaleString('de-DE'), min:Math.round(+rd.min || 0) });
      L.marker(mid, { icon:L.divIcon({ className:'', html:`<span class="ride-lab${rd.known ? '' : ' est'}">🚗 ${lab}</span>`, iconSize:null, iconAnchor:[0, 10] }), keyboard:false, interactive:false }).addTo(g);
      return;
    }
    if(mode === 'zones'){   // time-budget / zone orders: how the people get from one place to the next is NOT known - no car, bike or bus is assumed, no route is requested
      // light halo under a dark dash: visible on the light and on the dark map
      L.polyline([a, b], { color:'#FFFFFF', weight:6, opacity:.45, lineCap:'round', interactive:false }).addTo(g);
      L.polyline([a, b], { color:'#334155', weight:2.5, opacity:.95, dashArray:'4 7', lineCap:'round', interactive:false }).addTo(g);
      const km = Math.round(Math.hypot(b[0] - a[0], (b[1] - a[1]) * Math.cos(a[0] * Math.PI / 180)) * 111.32 * 10) / 10;
      L.marker([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], { icon:L.divIcon({ className:'', html:'<span class="jump-ic">↔</span>', iconSize:[26, 26], iconAnchor:[13, 13] }), keyboard:false }).addTo(g).bindTooltip(t(+rideMin > 0 ? 'rideTipPlan' : 'rideTipUnknown', { km:km.toLocaleString('de-DE'), min:Math.round(+rideMin || 0) }), { direction:'top', offset:[0, -12] });
      return;
    }
    const ln = L.polyline([a, b], { color:bike ? (css('--color-drive') || '#8B5CF6') : (css('--color-map-route-pending') || '#64748B'), weight:4, opacity:.9, dashArray:bike ? '6 6' : '2 9', lineCap:'round', interactive:false }).addTo(g);
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const mk = L.marker(mid, { icon:L.divIcon({ className:'', html:`<span class="jump-ic">${mode === 'car' ? '🚗' : mode === 'bike' ? '🚲' : '🚌'}</span>`, iconSize:[26, 26], iconAnchor:[13, 13] }), keyboard:false }).addTo(g);
    // hover / tap: how long the trip takes. First the planner's estimate (straight line × 1.3), then the road from Valhalla
    const tip = (km, carMin) => {
      const min = mode === 'car' ? (carMin != null ? carMin : km / 40 * 60 + 5) : mode === 'bike' ? km / 15 * 60 + 5 : 30;   // = plancore: car 40 km/h, bike 15 km/h, + 5 min; bus 30 min
      return t(mode === 'bus' ? 'rideTipBus' : 'rideTip', { min:Math.max(1, Math.round(min)), km:(Math.round(km * 10) / 10).toLocaleString('de-DE') });
    };
    const kmLine = Math.hypot(b[0] - a[0], (b[1] - a[1]) * Math.cos(a[0] * Math.PI / 180)) * 111.32 * 1.3;
    mk.bindTooltip(tip(kmLine), { direction:'top', offset:[0, -12] });
    bikeRoute(a, b, 'auto').then(pts => { if(pts && pts.length > 1){ ln.setLatLngs(pts); mk.setLatLng(pts[Math.floor(pts.length / 2)]); if(pts.km) mk.setTooltipContent(tip(pts.km, pts.sec ? pts.sec / 60 : null)); } }).catch(() => {});
  });
}
export function fit(m, b, pad = 30){ try{ if(b && b.isValid()) m.fitBounds(b, { padding:[pad, pad], maxZoom:17, animate:false }); }catch{} }   // no zoom animation: leaving the screen mid-animation broke Leaflet

/* ---------- dialogs ---------- */
// Escape closes the topmost dialog (same as a tap outside: a confirm box answers "no")
document.addEventListener('keydown', e => { if(e.key !== 'Escape') return; const ms = document.querySelectorAll('.modal'); const top = ms[ms.length - 1]; if(top) top.dispatchEvent(new MouseEvent('click', { bubbles:true })); });
export function modal(html){
  const el = document.createElement('div'); el.className = 'modal'; el.innerHTML = `<div class="modal-box">${html}</div>`;
  el.addEventListener('click', e => { if(e.target === el) el.remove(); });
  document.body.appendChild(el); return el;
}
export function confirmBox(title, text, yes, danger){
  return new Promise(res => {
    const m = modal(`<h2>${esc(title)}</h2><p class="muted">${esc(text)}</p><button class="btn ${danger ? 'danger' : 'primary'}" data-y>${esc(yes)}</button><button class="btn ghost" data-n>${esc(t('cancel'))}</button>`);
    m.querySelector('[data-y]').onclick = () => { m.remove(); res(true); };
    m.querySelector('[data-n]').onclick = () => { m.remove(); res(false); };
    m.addEventListener('click', e => { if(e.target === m) res(false); });   // tap outside = cancel (the promise must not hang)
  });
}
// asks why: quick choices + own text; resolves the reason (string) or null on cancel
export function reasonBox(title, text, yes, choices){
  return new Promise(res => {
    const m = modal(`<h2>${esc(title)}</h2><p class="muted">${esc(text)}</p><label class="f">${esc(t('whyLbl'))}</label>
      <div class="chips">${choices.map((c, i) => `<button class="chip" data-c="${i}">${esc(c)}</button>`).join('')}</div>
      <textarea class="in" id="rbTx" maxlength="300" placeholder="${esc(t('whyPh'))}"></textarea>
      <button class="btn primary" data-y>${esc(yes)}</button><button class="btn ghost" data-n>${esc(t('cancel'))}</button><div class="err" id="rbErr"></div>`);
    const tx = m.querySelector('#rbTx');
    m.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { m.querySelectorAll('[data-c]').forEach(x => x.classList.toggle('on', x === b)); tx.value = choices[+b.dataset.c]; });
    m.querySelector('[data-y]').onclick = () => { const v = tx.value.trim(); if(v.length < 2){ m.querySelector('#rbErr').textContent = t('whyNeed'); return; } m.remove(); res(v); };
    m.querySelector('[data-n]').onclick = () => { m.remove(); res(null); };
    m.addEventListener('click', e => { if(e.target === m) res(null); });
  });
}
export function toast(text){
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = text; document.body.appendChild(el);
  setTimeout(() => el.classList.add('show'), 10); setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 2600);
}

/* ---------- search field with results ---------- */
export function searchField(id, placeholder, onPick, { citiesOnly = false, near = null } = {}){
  const html = `<div class="searchbox"><span class="sb-ic">${ICONS.search}</span><input id="${id}" class="sb-in" placeholder="${esc(placeholder)}" autocomplete="off" autocorrect="off"></div><div id="${id}R" class="results hidden"></div>`;
  const bind = () => {
    const q = $('#' + id), r = $('#' + id + 'R'); let tm;
    q.addEventListener('input', () => {
      clearTimeout(tm); const v = q.value.trim();
      if(v.length < 2){ r.classList.add('hidden'); return; }
      tm = setTimeout(async () => {
        try{
          const res = await searchPlaces(v, citiesOnly, typeof near === 'function' ? near() : near);
          r.classList.remove('hidden');
          // towns with the same name (whole municipality / one district): the size tells them apart
          const big = {}; if(citiesOnly) res.forEach(c => { if(c.km2 != null) big[c.name] = Math.max(big[c.name] || 0, c.km2); });
          const same = n => res.filter(x => x.name === n).length > 1;
          r.innerHTML = res.length ? res.map((c, i) => `<button class="res" data-i="${i}"><b>${esc(c.name)}${citiesOnly && c.km2 != null && same(c.name) ? ' · ' + esc(t(c.km2 >= big[c.name] ? 'areaWhole' : 'areaPart', { km2:c.km2 })) : ''}</b><span>${esc(c.sub)}</span></button>`).join('') : `<div class="res muted">${esc(t('notFound'))}</div>`;
          r.querySelectorAll('[data-i]').forEach(d => d.onclick = () => { r.classList.add('hidden'); q.blur(); onPick(res[+d.dataset.i], q); });
        }catch{ r.classList.remove('hidden'); r.innerHTML = `<div class="res muted">${esc(t('searchDown'))}</div>`; }
      }, 350);
    });
  };
  return { html, bind };
}

/* city picker with chips (registration, profile) */
export function cityPicker(initial){
  let cities = [...(initial || [])];
  const sf = searchField('cityQ', t('citySearch'), c => { if(!cities.some(x => x.name === c.name && Math.abs(x.lat - c.lat) < .05)) cities.push({ name:c.name, lat:c.lat, lng:c.lng }); $('#cityQ').value = ''; render(); }, { citiesOnly:true });
  const render = () => {
    $('#cityChips').innerHTML = cities.map((c, i) => `<span class="chip">${esc(c.name)}<button data-rm="${i}" aria-label="remove">×</button></span>`).join('');
    $('#cityChips').querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { cities.splice(+b.dataset.rm, 1); render(); });
  };
  return { html:sf.html + '<div class="chips" id="cityChips"></div>', bind:() => { sf.bind(); render(); }, get:() => cities };
}

export function langSwitch(cur, asSetting){
  if(asSetting) return `<label class="f">${esc(t('language'))}</label><div class="seg" role="radiogroup">${[['de', 'Deutsch'], ['en', 'English'], ['ru', 'Русский']].map(([k, n]) => `<button role="radio" aria-checked="${k === cur}" class="${k === cur ? 'on' : ''}" data-lang="${k}">${n}</button>`).join('')}</div>`;
  return `<div class="lang">${esc(t('language'))}: ${[['de', 'Deutsch'], ['en', 'English'], ['ru', 'Русский']].map(([k, n]) => `<button class="link ${k === cur ? 'on' : ''}" data-lang="${k}">${n}</button>`).join(' · ')}</div>`;
}
export const avatar = (name, cls = '') => `<div class="avatar ${cls}">${ICONS.person}</div>`;
export const colorOf = i => css('--c' + (i % 10)) || '#2563EB';

// several workers at one place (home city): one marker with the number
// several workers close together on screen: one pill with the number
export const groupIcon = (n, label, live) => L.divIcon({ className:'', iconSize:[64, 30], iconAnchor:[32, 15],
  html:`<div class="pin-wrap"><div class="map-pill ${live ? 'live' : ''}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg>${n}</div>${label ? `<span class="pin-label">${esc(label)}</span>` : ''}</div>` });
export const personIcon = (name, on, sub) => L.divIcon({ className:'', iconSize:[40, 40], iconAnchor:[20, 20],
  html:`<div class="pin-wrap"><div class="person ${on ? 'on' : 'off'}"><svg viewBox="0 0 24 24" width="22" height="22" fill="#fff"><circle cx="12" cy="7.5" r="4"/><path d="M4 21c0-4.6 3.6-8 8-8s8 3.4 8 8z"/></svg></div><span class="pin-label">${esc(name)}${sub ? '<br><small>' + esc(sub) + '</small>' : ''}</span></div>` });
