// Full-screen map view for looking at work that was done (a worker's day, a whole order) and for screenshots:
// no tab bar, a compact info card, layers that can be switched on and off, names can be hidden (for sending to clients),
// and "Nur Karte" hides everything except the map.
import L from 'leaflet';
import { t } from './i18n.js';
import { $, esc } from './core.js';
import { cleanup, makeMap, ICONS } from './ui.js';

const VS = { names:true };   // remembered while the app is open

// opts: { title, anonTitle, lines:[text], stats:[[label, value]], legend:[{ color, label, anonLabel, sub }], note,
//         layers:[{ key, label, on, add(group, L) }], back }
export function openMapView(opts){
  cleanup();
  $('#root').innerHTML = `<div class="rv" id="rv">
    <div id="rvMap" class="fullmap"></div>
    <button class="icon-btn rv-back" id="rvBack" aria-label="${esc(t('back'))}">${ICONS.back}</button>
    <div class="rv-card" id="rvCard"></div>
    <div class="rv-tools" id="rvTools"></div>
  </div>`;
  const m = makeMap($('#rvMap'), null, 13, { zoomControl:false, zoomSnap:0.25 });   // finer zoom: the route fills the screen
  const groups = {}, bounds = L.latLngBounds([]);
  for(const ly of opts.layers || []){
    const g = L.featureGroup(); ly.add(g, L);
    try{ const b = g.getBounds(); if(b.isValid()) bounds.extend(b); }catch{}
    groups[ly.key] = g; if(ly.on !== false) g.addTo(m);
  }
  const card = () => {
    const n = VS.names;
    $('#rvCard').innerHTML = `<b class="rv-title">${esc(n ? opts.title : (opts.anonTitle || opts.title))}</b>
      ${(opts.lines || []).filter(Boolean).map(l => `<div class="rv-line">${esc(l)}</div>`).join('')}
      ${(opts.stats || []).length ? `<div class="rv-stats">${opts.stats.filter(s => s && s[1] != null && s[1] !== '').map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>` : ''}
      ${(opts.legend || []).length ? `<div class="rv-legend">${opts.legend.map(x => `<div class="lg"><i style="background:${esc(x.color)}"></i><b>${esc(n ? x.label : (x.anonLabel || x.label))}</b>${x.sub ? `<span>${esc(x.sub)}</span>` : ''}</div>`).join('')}</div>` : ''}
      ${opts.note ? `<div class="rv-note">${esc(opts.note)}</div>` : ''}`;
  };
  const fitAll = () => {
    if(!bounds.isValid()) return;
    const top = Math.min(innerHeight * .45, ($('#rvCard').offsetHeight || 120) + 24);
    m.fitBounds(bounds, { paddingTopLeft:[24, top + 12], paddingBottomRight:[24, 70], maxZoom:17, animate:false });
  };
  const tools = () => {
    $('#rvTools').innerHTML = (opts.layers || []).filter(l => l.label).map(l => `<button class="chip ${m.hasLayer(groups[l.key]) ? 'on' : ''}" data-ly="${l.key}">${esc(l.label)}</button>`).join('')
      + (opts.hasNames ? `<button class="chip ${VS.names ? 'on' : ''}" id="rvNames">${esc(t('rvNames'))}</button>` : '')
      + `<button class="chip" id="rvFit">${esc(t('rvFit'))}</button><button class="chip" id="rvClean">${esc(t('rvOnlyMap'))}</button>`;
    document.querySelectorAll('[data-ly]').forEach(b => b.onclick = () => { const g = groups[b.dataset.ly]; if(m.hasLayer(g)) m.removeLayer(g); else g.addTo(m); tools(); });
    const nb = $('#rvNames'); if(nb) nb.onclick = () => { VS.names = !VS.names; card(); tools(); };
    $('#rvFit').onclick = fitAll;
    $('#rvClean').onclick = () => { const r = $('#rv'); r.classList.toggle('clean'); $('#rvClean').textContent = r.classList.contains('clean') ? t('rvShowInfo') : t('rvOnlyMap'); setTimeout(() => m.invalidateSize(), 50); };
  };
  card(); tools();
  $('#rvBack').onclick = opts.back;
  setTimeout(fitAll, 80);
  return m;
}
