import L from 'leaflet';
import { t } from './i18n.js';
import { $, esc, css, searchPlaces } from './core.js';

export const TILES = 'https://tile.openstreetmap.de/{z}/{x}/{y}.png';
export const ICONS = {
  map:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4 3 6.2v13.6L9 18l6 2 6-2.2V4.2L15 6 9 4z"/><path d="M9 4v14M15 6v14"/></svg>',
  person:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5c1.2-4 4.1-6 7.5-6s6.3 2 7.5 6"/></svg>',
  flag:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 21V3.5"/><path d="M5.5 4h12l-2.6 4.2 2.6 4.3h-12"/></svg>',
  search:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>',
  back:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7"/></svg>',
  plus:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  chevron:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
  bell:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15z"/><path d="M10 21h4"/></svg>',
  pause:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>',
  locate:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
  pin:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-5.5 10.2-7.4 11.8a1 1 0 0 1-1.2 0C9.5 20.2 4 15 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>',
  expand:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
  phone:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>',
  chat:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/></svg>',
  check:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  clock:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  calendar:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  route:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></svg>',
  users:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg>',
  mail:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-9 5.7a2 2 0 0 1-2 0L2 7"/></svg>',
  sun:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/></svg>',
  moon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>',
  device:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/></svg>',
  wifiOff:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h.01M8.5 16.4a5 5 0 0 1 7 0M2 8.8a15 15 0 0 1 4.2-2.6M10.7 5c4-.4 8.1.9 11.3 3.8M16.9 11.3a10 10 0 0 1 2.2 1.6M5 13a10 10 0 0 1 5.2-2.8M2 2l20 20"/></svg>',
  gps:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12h3M19 12h3M12 2v3M12 19v3"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/></svg>',
  alert:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21.7 18-8-14a2 2 0 0 0-3.5 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3"/><path d="M12 9v4M12 17h.01"/></svg>',
  inbox:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/></svg>',
  edit:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.2 6.8a2.8 2.8 0 0 0-4-4L3.8 16.2a2 2 0 0 0-.5.8L2 21.4a.5.5 0 0 0 .6.6L7 20.7a2 2 0 0 0 .8-.5z"/></svg>',
  play:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>',
  close:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  refresh:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/></svg>',
};

/* ---------- theme (system / light / dark) ---------- */
export const THEMES = ['system', 'light', 'dark'];
export function applyTheme(v){
  const r = document.documentElement;
  if(v === 'light' || v === 'dark') r.dataset.theme = v; else delete r.dataset.theme;
  const dark = v === 'dark' || (v !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name=theme-color]').forEach(m => m.setAttribute('content', dark ? '#0B1220' : '#F8FAFC'));
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
export function shell(tab, html, opts = {}){
  cleanup(); UI.tab = tab;
  const peopleLabel = UI.role === 'admin' ? t('tabPeople') : t('tabProfile');
  $('#root').innerHTML = `<div class="shell">
    <main id="content" class="${opts.map ? 'content map-content' : 'content'}">${html}</main>
    <nav class="tabbar" role="tablist">
      ${[['map', 'map', t('tabMap')], ['people', 'person', peopleLabel], ['tasks', 'flag', t('tabTasks')]].map(([k, ic, lb]) =>
        `<button role="tab" class="tab ${k === tab ? 'on' : ''}" data-tab="${k}" aria-selected="${k === tab}">${ICONS[ic]}<span>${esc(lb)}</span></button>`).join('')}
    </nav>${opts.fab ? `<button class="fab" id="fab" aria-label="${esc(opts.fab)}" title="${esc(opts.fab)}">${ICONS.plus}</button>` : ''}</div>`;
  document.querySelectorAll('.tab').forEach(b => b.onclick = () => UI.onTab && UI.onTab(b.dataset.tab));
}
export const topbar = (title, backFn, right = '') => `<header class="topbar ${backFn ? 'sub' : ''}">${backFn ? `<button class="icon-btn" id="tbBack" aria-label="${esc(t('back'))}">${ICONS.back}</button>` : ''}<h1>${esc(title)}</h1>${right ? `<div style="margin-left:auto;display:flex;gap:8px">${right}</div>` : ''}</header>`;
export function bindBack(fn){ const b = $('#tbBack'); if(b) b.onclick = fn; }

/* ---------- map ---------- */
export function makeMap(el, center, zoom = 15, opts = {}){
  const m = L.map(el, { zoomControl:false, attributionControl:true, ...opts }).setView(center || [51.2277, 6.7735], zoom);
  L.tileLayer(TILES, { maxZoom:19, attribution:'© OpenStreetMap' }).addTo(m);
  UI.maps.push(m); el._map = m;
  setTimeout(() => m.invalidateSize(), 60);
  return m;
}
export const dot = (cls, size = 22) => L.divIcon({ className:'', html:`<div class="${cls}"></div>`, iconSize:[size, size], iconAnchor:[size/2, size/2] });
export const labelIcon = (cls, text) => L.divIcon({ className:'', html:`<div class="pin-wrap"><div class="${cls}"></div><span class="pin-label">${esc(text)}</span></div>`, iconSize:[24, 24], iconAnchor:[12, 12] });
export function fit(m, b, pad = 30){ try{ if(b && b.isValid()) m.fitBounds(b, { padding:[pad, pad], maxZoom:17, animate:false }); }catch{} }   // no zoom animation: leaving the screen mid-animation broke Leaflet

/* ---------- dialogs ---------- */
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
          r.innerHTML = res.length ? res.map((c, i) => `<button class="res" data-i="${i}"><b>${esc(c.name)}</b><span>${esc(c.sub)}</span></button>`).join('') : `<div class="res muted">${esc(t('notFound'))}</div>`;
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
  if(asSetting) return `<label class="f">${esc(t('language'))}</label><div class="seg" role="radiogroup">${[['de', 'Deutsch'], ['ru', 'Русский']].map(([k, n]) => `<button role="radio" aria-checked="${k === cur}" class="${k === cur ? 'on' : ''}" data-lang="${k}">${n}</button>`).join('')}</div>`;
  return `<div class="lang">${esc(t('language'))}: ${[['de', 'Deutsch'], ['ru', 'Русский']].map(([k, n]) => `<button class="link ${k === cur ? 'on' : ''}" data-lang="${k}">${n}</button>`).join(' · ')}</div>`;
}
export const avatar = (name, cls = '') => `<div class="avatar ${cls}">${ICONS.person}</div>`;
export const colorOf = i => css('--c' + (i % 10)) || '#2563EB';

export const personIcon = (name, on, sub) => L.divIcon({ className:'', iconSize:[40, 40], iconAnchor:[20, 20],
  html:`<div class="pin-wrap"><div class="person ${on ? 'on' : 'off'}"><svg viewBox="0 0 24 24" width="22" height="22" fill="#fff"><circle cx="12" cy="7.5" r="4"/><path d="M4 21c0-4.6 3.6-8 8-8s8 3.4 8 8z"/></svg></div><span class="pin-label">${esc(name)}${sub ? '<br><small>' + esc(sub) + '</small>' : ''}</span></div>` });
