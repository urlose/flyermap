// Full-screen map view for looking at work that was done (a worker's day, a whole order) and for screenshots:
// no tab bar, a compact info card, layers that can be switched on and off, names can be hidden (for sending to clients),
// and "Nur Karte" hides everything except the map.
import L from 'leaflet';
import { t } from './i18n.js';
import { $, esc } from './core.js';
import { cleanup, makeMap, ICONS } from './ui.js';

const VS = { names:true };   // remembered while the app is open

// opts: { title, anonTitle, lines:[text], stats:[[label, value]], legend:[{ color, label, anonLabel, sub }], note, action:{ label, run },
//         layers:[{ key, label, on, add(group, L), focus(map) }], back,
//         view:{ center, zoom, on:{ key:bool } } – open exactly as it was (after a change that draws the map again) }
// A layer with focus(): a tap on its button moves the map there (e.g. to where the people are right now); a second tap
// right after that switches the layer off. The map is returned with rvFill(key) (draw a layer again when its data came
// later), rvRefresh() (info card), rvTools() and rvState() (the view to hand over as opts.view).
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
    groups[ly.key] = g; const keep = opts.view && opts.view.on && ly.key in opts.view.on ? opts.view.on[ly.key] : null;
    if(keep == null ? ly.on !== false : keep) g.addTo(m);
  }
  const focusAt = {};
  const card = () => {
    const n = VS.names;
    $('#rvCard').innerHTML = `<b class="rv-title">${esc(n ? opts.title : (opts.anonTitle || opts.title))}</b>
      ${(opts.lines || []).filter(Boolean).map(l => `<div class="rv-line">${esc(l)}</div>`).join('')}
      ${(opts.stats || []).length ? `<div class="rv-stats">${opts.stats.filter(s => s && s[1] != null && s[1] !== '').map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>` : ''}
      ${(opts.legend || []).length ? `<div class="rv-legend">${opts.legend.map(x => `<div class="lg"><i style="background:${esc(x.color)}"></i><b>${esc(n ? x.label : (x.anonLabel || x.label))}</b>${x.sub ? `<span>${esc(x.sub)}</span>` : ''}</div>`).join('')}</div>` : ''}
      ${opts.note ? `<div class="rv-note">${esc(opts.note)}</div>` : ''}
      ${opts.action ? `<button class="btn ghost small rv-act" id="rvAct">${esc(opts.action.label)}</button>` : ''}`;
    if(opts.action) $('#rvAct').onclick = () => opts.action.run();
  };
  const fitAll = () => {
    if(!bounds.isValid() || !$('#rvCard')) return;   // the view may already be closed
    const top = Math.min(innerHeight * .45, ($('#rvCard').offsetHeight || 120) + 24);
    m.fitBounds(bounds, { paddingTopLeft:[24, top + 12], paddingBottomRight:[24, 70], maxZoom:17, animate:false });
  };
  const tools = () => {
    $('#rvTools').innerHTML = (opts.layers || []).filter(l => l.label).map(l => `<button class="chip ${m.hasLayer(groups[l.key]) ? 'on' : ''}" data-ly="${l.key}">${esc(l.label)}</button>`).join('')
      + (opts.hasNames ? `<button class="chip ${VS.names ? 'on' : ''}" id="rvNames">${esc(t('rvNames'))}</button>` : '')
      + `<button class="chip" id="rvFit">${esc(t('rvFit'))}</button><button class="chip" id="rvClean">${esc(t('rvOnlyMap'))}</button>`;
    document.querySelectorAll('[data-ly]').forEach(b => b.onclick = () => {
      const k = b.dataset.ly, g = groups[k], ly = (opts.layers || []).find(l => l.key === k), on = m.hasLayer(g);
      if(ly && ly.focus && !(on && Date.now() - (focusAt[k] || 0) < 4000)){ if(!on) g.addTo(m); if(ly.focus(m)){ focusAt[k] = Date.now(); tools(); return; } if(!on){ tools(); return; } }
      if(on) m.removeLayer(g); else g.addTo(m); tools();
    });
    const nb = $('#rvNames'); if(nb) nb.onclick = () => { VS.names = !VS.names; card(); tools(); opts.onNames && opts.onNames(VS.names); };
    $('#rvFit').onclick = fitAll;
    $('#rvClean').onclick = () => { const r = $('#rv'); r.classList.toggle('clean'); $('#rvClean').textContent = r.classList.contains('clean') ? t('rvShowInfo') : t('rvOnlyMap'); setTimeout(() => m.invalidateSize(), 50); };
  };
  card(); tools(); opts.onNames && opts.onNames(VS.names);
  m.rvRefresh = () => { if($('#rvCard')) card(); };   // values computed later (in the background) refresh the info card
  m.rvTools = () => { if($('#rvTools')) tools(); };
  m.rvFill = key => { const g = groups[key], ly = (opts.layers || []).find(l => l.key === key); if(!g || !ly || !$('#rvMap')) return; g.clearLayers(); ly.add(g, L); };
  m.rvState = () => ({ center:m.getCenter(), zoom:m.getZoom(), on:Object.fromEntries(Object.keys(groups).map(k => [k, m.hasLayer(groups[k])])) });
  $('#rvBack').onclick = opts.back;
  if(opts.view && opts.view.center) m.setView(opts.view.center, opts.view.zoom, { animate:false }); else setTimeout(fitAll, 80);
  return m;
}
