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
};

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
    </nav></div>`;
  document.querySelectorAll('.tab').forEach(b => b.onclick = () => UI.onTab && UI.onTab(b.dataset.tab));
}
export const topbar = (title, backFn) => `<header class="topbar">${backFn ? `<button class="icon-btn" id="tbBack" aria-label="${esc(t('back'))}">${ICONS.back}</button>` : ''}<h1>${esc(title)}</h1></header>`;
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
export function fit(m, b, pad = 30){ try{ if(b && b.isValid()) m.fitBounds(b, { padding:[pad, pad], maxZoom:17 }); }catch{} }

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

export function langSwitch(cur){
  return `<div class="lang">${esc(t('language'))}: ${[['de', 'Deutsch'], ['ru', 'Русский']].map(([k, n]) => `<button class="link ${k === cur ? 'on' : ''}" data-lang="${k}">${n}</button>`).join(' · ')}</div>`;
}
export const avatar = (name, cls = '') => `<div class="avatar ${cls}">${ICONS.person}</div>`;
export const colorOf = i => css('--c' + (i % 10)) || '#2563EB';
