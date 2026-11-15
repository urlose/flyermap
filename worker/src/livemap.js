// KARTE (admin): who is where, which orders are where – as areas you can click.
// Since 16.11.2026. Layers: order areas (stored or derived per place), planned routes, walked parts, order pins, people.
// Selecting an area, a pin or a person opens the detail panel (right on a PC, bottom sheet on a phone). Regular updates
// (every 4 s) only touch the people layer and never move the map; the selection stays.
import L from 'leaflet';
import Planner from '../../admin/planner.js';
import { t, I } from './i18n.js';
import { sb, $, esc, css, hav, fmtN, fmtDay, ago, waLink, telLink, searchPlaces } from './core.js';
import { ICONS, shell, makeMap, fit, every } from './ui.js';

// what the map shows (kept while the app is open, and in the browser for next time)
// people not on the way are off at first: their home towns all over the country only crowd the map (one tap shows them)
const LS = 'fm.mapFilter2';
const F0 = { on:true, off:false, open:true, done:false, areas:true, routes:true, walked:true };
export const LM = { f:(() => { try{ return { ...F0, ...JSON.parse(localStorage.getItem(LS) || '{}') }; }catch{ return { ...F0 }; } })(), sel:null, view:null, sheet:'half', over:true, place:null, km:25 };
const saveF = () => { try{ localStorage.setItem(LS, JSON.stringify(LM.f)); }catch{} };

const today = () => new Date().toLocaleDateString('sv-SE');
// deadline of an order as text + state (shared with the order list): done orders are never "overdue"
export function dueInfo(tk){
  if(tk.status === 'done') return { txt:t('dueDone'), cls:'ok' };
  if(!tk.deadline) return { txt:t('dueNone'), cls:'muted' };
  const dl = String(tk.deadline).slice(0, 10);
  if(dl < today()) return { txt:t('dueOver', { d:fmtDay(dl) }), cls:'bad' };
  if(dl === today()) return { txt:t('dueToday'), cls:'warn' };
  return { txt:t('dueBy', { d:fmtDay(dl) }), cls:'' };
}

// order state for the map: done · open with every route assigned · open with routes nobody has yet
const ordState = (tk, plans) => tk.status === 'done' ? 'done' : (plans.length && plans.every(p => p.worker_id && p.status !== 'declined')) ? 'assigned' : 'open';
const ORD_C = { open:'--color-warning', assigned:'--color-primary', done:'--color-success' };
const ordColor = s => css(ORD_C[s]) || ({ open:'#D97706', assigned:'#2563EB', done:'#16A34A' })[s];

// convex hull (monotone chain) of [lat, lng] points
function hull(pts){
  const p = pts.map(q => [q[1], q[0]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]); if(p.length < 3) return null;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for(const q of p){ while(lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for(let i = p.length - 1; i >= 0; i--){ const q = p[i]; while(up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  const h = lo.slice(0, -1).concat(up.slice(0, -1)); return h.length >= 3 ? h.map(q => [q[1], q[0]]) : null;
}
const inPoly = (pt, poly) => { let c = false; for(let i = 0, j = poly.length - 1; i < poly.length; j = i++){ const a = poly[i], b = poly[j];
  if(((a[0] > pt[0]) !== (b[0] > pt[0])) && (pt[1] < (b[1] - a[1]) * (pt[0] - a[0]) / (b[0] - a[0]) + a[1])) c = !c; } return c; };
const validPoly = p => Array.isArray(p) && p.length > 2 && p.every(q => Array.isArray(q) && isFinite(q[0]) && isFinite(q[1]));
const placeOf = p => (Array.isArray(p.days) && p.days[0] && p.days[0].place) || '';

// The areas of an order. Stored geometry first: an area the admin drew (work_area) or the planned area (zone_polygon).
// Orders with several places (zones) have none stored: one outline per place is derived from that place's planned routes
// (hull of the route points) – only when the routes of the place lie close together (≤ 12 km across), never one area
// joining places far apart. Derived areas are drawn dashed and named as such.
function areasOf(tk, plans){
  if(validPoly(tk.work_area)) return [{ poly:tk.work_area, kind:'drawn', name:'' }];
  if(validPoly(tk.zone_polygon)) return [{ poly:tk.zone_polygon, kind:'planned', name:'' }];
  const by = new Map(); plans.forEach(p => { if(!p.path || p.path.length < 2) return; const k = placeOf(p); by.set(k, (by.get(k) || []).concat(p.path)); });
  const out = [];
  for(const [name, pts] of by){
    const ll = pts.filter(q => q && isFinite(q[0]) && isFinite(q[1])), h = hull(ll.length > 4000 ? ll.filter((_, i) => i % Math.ceil(ll.length / 4000) === 0) : ll); if(!h) continue;
    const b = L.latLngBounds(h); if(b.getNorthEast().distanceTo(b.getSouthWest()) > 12000) continue;
    out.push({ poly:h, kind:'derived', name });
  }
  return out;
}

const personSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>';
const homeSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/></svg>';

export function viewLiveMap(H){
  const { A, isLive, pace, loadWorkers, loadLive, viewTask, viewWorker, viewTaskMap, navTarget, todayTrack, GREEN_C, splitJumps, viewLive } = H;
  let m = null, plans = [], tracks = {}, lastOk = 0, fittedOnce = !!LM.view, userMoved = false;
  const wById = id => A.workers.find(w => w.id === id), tById = id => A.tasks.find(x => x.id === id);
  const shown = () => A.tasks.filter(x => x.status === 'open' || x.status === 'done');
  const plansOf = id => plans.filter(p => p.task_id === id);
  const desk = () => matchMedia('(min-width:900px)').matches;
  const chip = (k, icon, label, n) => `<button class="mchip ${LM.f[k] ? 'on' : ''}" data-f="${k}" aria-pressed="${!!LM.f[k]}">${icon}<span>${esc(label)}</span>${n != null ? `<b>${n}</b>` : ''}</button>`;
  shell('map', `<div id="fullMap" class="fullmap lm"></div>
    <div class="lm-top">
      <div class="lm-search"><div class="searchbox"><span class="sb-ic">${ICONS.search}</span><input id="lmQ" class="sb-in" placeholder="${esc(t('lmSearch'))}" autocomplete="off" autocorrect="off" aria-label="${esc(t('lmSearch'))}"><button class="icon-btn sm hidden" id="lmQx" aria-label="${esc(t('close'))}">${ICONS.close}</button></div><div id="lmR" class="results hidden" role="listbox"></div></div>
      <div class="lm-bar" id="lmF" role="toolbar" aria-label="${esc(t('lmFilters'))}"></div>
    </div>
    <div class="lm-tools" role="toolbar" aria-label="${esc(t('lmTools'))}">
      <button class="map-tool" id="lmZin" title="${esc(t('lmZoomIn'))}" aria-label="${esc(t('lmZoomIn'))}">${ICONS.plus}</button>
      <button class="map-tool" id="lmZout" title="${esc(t('lmZoomOut'))}" aria-label="${esc(t('lmZoomOut'))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg></button>
      <span class="sep"></span>
      <button class="map-tool" id="lmAllW" title="${esc(t('lmFitWorkers'))}" aria-label="${esc(t('lmFitWorkers'))}">${ICONS.users}</button>
      <button class="map-tool" id="lmAllT" title="${esc(t('lmFitOrders'))}" aria-label="${esc(t('lmFitOrders'))}">${ICONS.flag}</button>
      <button class="map-tool" id="lmFocus" title="${esc(t('lmFocusSel'))}" aria-label="${esc(t('lmFocusSel'))}" disabled>${ICONS.locate}</button>
      <button class="map-tool" id="lmReset" title="${esc(t('lmReset'))}" aria-label="${esc(t('lmReset'))}" disabled>${ICONS.close}</button>
    </div>
    <div class="lm-over ${LM.over ? '' : 'mini'}" id="lmOver" role="status" aria-live="polite"></div>
    <aside class="lm-panel hidden" id="lmP" aria-label="${esc(t('lmDetails'))}"><button class="lm-grip" id="lmGrip" aria-label="${esc(t('lmSheetToggle'))}"></button><div class="lm-pbody" id="lmPB"></div></aside>`, { map:true });
  m = makeMap($('#fullMap'), LM.view ? LM.view.c : (LM.place ? [LM.place.lat, LM.place.lng] : null), LM.view ? LM.view.z : 12);
  m.on('moveend', () => { LM.view = { c:[m.getCenter().lat, m.getCenter().lng], z:m.getZoom() }; });
  m.on('dragstart zoomstart', e => { if(e.type === 'dragstart' || e.originalEvent) userMoved = true; });
  // panes: areas under routes under walked parts under pins under people
  [['lmArea', 410], ['lmRoute', 420], ['lmWalk', 430]].forEach(([n, z]) => { m.createPane(n).style.zIndex = z; });
  const areaL = L.layerGroup().addTo(m), routeL = L.layerGroup().addTo(m), walkL = L.layerGroup().addTo(m), pinL = L.layerGroup().addTo(m), placeL = L.layerGroup().addTo(m), wL = L.layerGroup().addTo(m), selL = L.layerGroup().addTo(m);
  const areaItems = [];   // { tk, a, layer }

  /* ---------- orders ---------- */
  const drawOrders = () => {
    areaL.clearLayers(); routeL.clearLayers(); pinL.clearLayers(); walkL.clearLayers(); areaItems.length = 0;
    const sel = LM.sel && LM.sel.kind === 'task' ? LM.sel.id : null;
    for(const tk of shown()){
      const ps = plansOf(tk.id), st = ordState(tk, ps);
      if(st === 'done' ? !LM.f.done : !LM.f.open) continue;
      const c = ordColor(st), on = sel === tk.id, dim = sel && !on;
      if(LM.f.areas) for(const a of areasOf(tk, ps)){
        const base = { pane:'lmArea', color:c, weight:on ? 3 : 1.5, opacity:dim ? .35 : .9, fillColor:c, fillOpacity:on ? .2 : dim ? .03 : .08, dashArray:a.kind === 'derived' ? '6 5' : null };
        const lay = L.polygon(a.poly, base).addTo(areaL);
        const tip = tk.title + (a.name ? ' · ' + a.name : '') + (a.kind === 'derived' ? ' · ' + t('lmDerived') : '');
        if(desk()) lay.bindTooltip(esc(tip), { sticky:true, direction:'top', className:'lm-tip' });
        lay.on('mouseover', () => { if(LM.sel && LM.sel.id === tk.id) return; lay.setStyle({ weight:base.weight + 1, fillOpacity:base.fillOpacity + .07, opacity:1 }); });
        lay.on('mouseout', () => lay.setStyle(base));
        lay.on('click', e => { L.DomEvent.stopPropagation(e); pickAt(e.latlng); });
        areaItems.push({ tk, a, layer:lay });
      }
      if(LM.f.routes || on) ps.forEach(p => { if(!p.path || p.path.length < 2) return;
        L.polyline(Planner.pathRuns(p.path), { pane:'lmRoute', color:p.color || c, weight:on ? 4 : 2.5, opacity:dim ? .2 : on ? .95 : .55, lineJoin:'round', interactive:false }).addTo(routeL); });
      if(LM.f.walked && tracks[tk.id]) for(const r of tracks[tk.id]) L.polyline(r, { pane:'lmWalk', color:GREEN_C(), weight:on ? 6 : 4, opacity:dim ? .25 : .8, lineJoin:'round', lineCap:'round', interactive:false }).addTo(walkL);
      if(tk.start_lat != null) L.marker([tk.start_lat, tk.start_lng], { icon:L.divIcon({ className:'', iconSize:[30, 38], iconAnchor:[15, 36],
        html:`<div class="lm-pin ${st}${on ? ' sel' : ''}${dim ? ' dim' : ''}" style="--c:${c}"><svg viewBox="0 0 24 30" aria-hidden="true"><path d="M12 29s9-9.3 9-16.2A9 9 0 0 0 3 12.8C3 19.7 12 29 12 29z"/></svg><i>${st === 'done' ? '✓' : st === 'open' ? '!' : ''}</i></div>` }),
        zIndexOffset:on ? 1700 : 1100, title:tk.title, keyboard:true, alt:tk.title }).on('click', () => select({ kind:'task', id:tk.id }, true)).addTo(pinL);
    }
  };
  // a click on overlapping areas: one of them is chosen in a small list
  const pickAt = ll => {
    const hits = areaItems.filter(x => inPoly([ll.lat, ll.lng], x.a.poly)), ids = [...new Set(hits.map(x => x.tk.id))];
    if(ids.length <= 1){ if(ids[0]) select({ kind:'task', id:ids[0] }, true); return; }
    L.popup({ className:'lm-pick', maxWidth:260 }).setLatLng(ll).setContent(`<b>${esc(t('lmPickOne'))}</b>${ids.map(id => { const tk = tById(id), st = ordState(tk, plansOf(id)); return `<button class="lm-pick-b" data-t="${id}"><span class="dotc" style="background:${ordColor(st)}"></span>${esc(tk.title)}</button>`; }).join('')}`).openOn(m);
    setTimeout(() => document.querySelectorAll('.lm-pick-b').forEach(b => b.onclick = () => { m.closePopup(); select({ kind:'task', id:b.dataset.t }, true); }), 0);
  };

  /* ---------- people ---------- */
  // position of a person: live GPS during a shift; the last GPS fix (kept 12 h after work); else the home city of the profile
  const home = w => (w.cities || []).find(c => c && c.lat != null && c.lng != null);
  const posOf = w => {
    if(isLive(w) && w.last_lat != null) return { p:[w.last_lat, w.last_lng], kind:'live' };
    if(w.last_lat != null && w.last_seen && Date.now() - new Date(w.last_seen) < 12 * 36e5) return { p:[w.last_lat, w.last_lng], kind:'gps' };
    const c = home(w); if(c) return { p:[c.lat, c.lng], kind:'home', city:c.name };
    return null;
  };
  const wState = w => { if(!isLive(w)) return 'off'; const r = A.live.find(x => x.worker_id === w.id); return r && r.paused_at ? 'pause' : 'on'; };
  let wSig = '';
  const drawWorkers = force => {
    const items = A.workers.map(w => ({ w, st:wState(w), pos:posOf(w) })).filter(x => x.pos && (x.st === 'off' ? LM.f.off : LM.f.on));
    const sel = LM.sel && LM.sel.kind === 'worker' ? LM.sel.id : null, taskSel = LM.sel && LM.sel.kind === 'task' ? LM.sel.id : null;
    const team = taskSel ? new Set(plansOf(taskSel).map(p => p.worker_id).filter(Boolean)) : null;
    const R = 44, groups = [];
    for(const it of items.sort((a, b) => (b.st !== 'off') - (a.st !== 'off'))){
      const pt = m.latLngToLayerPoint(it.pos.p), g = groups.find(x => x.pt.distanceTo(pt) < R && !(sel && (x.items.some(y => y.w.id === sel) || it.w.id === sel)));
      if(g) g.items.push(it); else groups.push({ pt, items:[it] });
    }
    const sig = m.getZoom() + '|' + (sel || '') + '|' + (taskSel || '') + '|' + groups.map(g => g.items.map(x => x.w.id + x.st + x.pos.kind + x.pos.p.map(v => v.toFixed(4)).join(',')).join(';')).join('/');
    if(!force && sig === wSig) return; wSig = sig;
    wL.clearLayers();
    const names = m.getZoom() >= 12;
    for(const g of groups){
      if(g.items.length === 1){
        const { w, st, pos } = g.items[0], on = w.id === sel, dim = (sel && !on) || (team && !team.has(w.id));
        const sub = st === 'pause' ? t('onPause') : pos.kind === 'home' ? pos.city : pos.kind === 'gps' ? ago(w.last_seen) : '';
        L.marker(pos.p, { zIndexOffset:on ? 1600 : st !== 'off' ? 900 : 500, keyboard:true, title:w.name, alt:w.name,
          icon:L.divIcon({ className:'', iconSize:[36, 36], iconAnchor:[18, 18], html:`<div class="lm-w ${st} ${pos.kind}${on ? ' sel' : ''}${dim ? ' dim' : ''}">${pos.kind === 'home' && st === 'off' ? homeSvg : personSvg}${st === 'pause' ? '<em>II</em>' : ''}</div>${names || on ? `<span class="lm-wl">${esc(w.name.split(' ')[0])}${sub ? `<small>${esc(sub)}</small>` : ''}</span>` : ''}` }) })
          .on('click', () => select({ kind:'worker', id:w.id }, true)).addTo(wL);
        if(st !== 'off') navTarget(wL, w, '#7C3AED', w.name);
        continue;
      }
      const bb = L.latLngBounds(g.items.map(x => x.pos.p)), n = g.items.length, live = g.items.filter(x => x.st !== 'off').length, deg = Math.round(live / n * 360);
      const mk = L.marker(bb.getCenter(), { zIndexOffset:live ? 1000 : 600, keyboard:true, title:t('lmGroup', { n, live }),
        icon:L.divIcon({ className:'', iconSize:[44, 44], iconAnchor:[22, 22], html:`<div class="lm-cl" style="--deg:${deg}deg" aria-label="${esc(t('lmGroup', { n, live }))}"><b>${n}</b></div>` }) }).addTo(wL);
      const same = bb.getNorthEast().distanceTo(bb.getSouthWest()) < 40;
      if(same || m.getZoom() >= m.getMaxZoom() - 1){
        mk.bindPopup(`<div class="lm-list">${g.items.map(({ w, st, pos }) => `<button class="lm-pick-b" data-w="${w.id}"><span class="dotc ${st === 'off' ? 'pause' : ''}" style="${st === 'off' ? '' : 'background:var(--color-success)'}"></span>${esc(w.name)}<small> · ${esc(st === 'on' ? t('stLive') : st === 'pause' ? t('onPause') : pos.kind === 'home' ? pos.city : ago(w.last_seen))}</small></button>`).join('')}</div>`, { maxHeight:300, className:'lm-pick' })
          .on('popupopen', e => e.popup.getElement().querySelectorAll('[data-w]').forEach(x => x.onclick = () => { m.closePopup(); select({ kind:'worker', id:x.dataset.w }, true); }));
      } else mk.on('click', () => m.fitBounds(bb.pad(.5), { maxZoom:Math.min(m.getMaxZoom(), m.getZoom() + 4) }));
    }
  };
  m.on('zoomend', () => drawWorkers(true));
  // today's track of the people on the way (refreshed every 30 s, not on every tick)
  const liveTrackL = L.layerGroup().addTo(m); let trackAt = 0;
  const liveTracks = async () => {
    if(Date.now() - trackAt < 30e3) return; trackAt = Date.now();
    const lw = A.workers.filter(w => wState(w) !== 'off'), res = await Promise.all(lw.map(w => todayTrack(w.id).catch(() => [])));
    liveTrackL.clearLayers(); if(!LM.f.walked || !LM.f.on) return;
    res.forEach(pts => { if(pts.length > 1) L.polyline(pts.map(q => [q.lat, q.lng]), { pane:'lmWalk', color:css('--route') || '#2563EB', weight:4, opacity:.8, interactive:false }).addTo(liveTrackL); });
  };

  /* ---------- selection and detail panel ---------- */
  const P = $('#lmP'), PB = $('#lmPB');
  const setSheet = s => { LM.sheet = s; P.dataset.s = s; $('#lmGrip').setAttribute('aria-expanded', s !== 'min'); };
  const close = () => { LM.sel = null; P.classList.add('hidden'); selL.clearLayers(); drawOrders(); drawWorkers(true); tools(); };
  const select = (s, focus) => {
    LM.sel = s; m.closePopup(); drawOrders(); drawWorkers(true); renderPanel(); tools();
    if(focus) focusSel();
  };
  const selBounds = () => {
    if(!LM.sel) return null;
    if(LM.sel.kind === 'task'){ const tk = tById(LM.sel.id); if(!tk) return null; const b = L.latLngBounds([]);
      areasOf(tk, plansOf(tk.id)).forEach(a => b.extend(L.latLngBounds(a.poly))); plansOf(tk.id).forEach(p => (p.path || []).forEach(q => b.extend([q[0], q[1]])));
      if(tk.start_lat != null) b.extend([tk.start_lat, tk.start_lng]); return b.isValid() ? b : null; }
    if(LM.sel.kind === 'worker'){ const w = wById(LM.sel.id), ps = w && posOf(w); return ps ? L.latLngBounds([ps.p, ps.p]) : null; }
    if(LM.sel.kind === 'place' && LM.place) return L.latLng(LM.place.lat, LM.place.lng).toBounds(LM.km * 2000);
    return null;
  };
  // the panel must not hide what was selected: on a PC the map is padded on the right, on a phone at the bottom
  const focusSel = () => { const b = selBounds(); if(!b) return; const d = desk();
    const pad = d ? { paddingTopLeft:[40, 120], paddingBottomRight:[420, 40] } : { paddingTopLeft:[20, 150], paddingBottomRight:[20, Math.round(innerHeight * .5)] };
    try{ m.fitBounds(b, { ...pad, maxZoom:LM.sel.kind === 'worker' ? 15 : 16, animate:false }); }catch{} };
  const tools = () => { const on = !!LM.sel; $('#lmFocus').disabled = !on; $('#lmReset').disabled = !on; };
  const act = (id, icon, label, primary) => `<button class="btn ${primary ? 'primary' : 'ghost'} small" data-a="${id}">${icon}<span>${esc(label)}</span></button>`;
  const fact = (k, v, cls) => `<div class="lm-fact"><span>${esc(k)}</span><b class="${cls || ''}">${v}</b></div>`;
  const renderPanel = () => {
    if(!LM.sel){ P.classList.add('hidden'); return; }
    P.classList.remove('hidden'); if(!P.dataset.s) setSheet(LM.sheet === 'min' ? 'half' : LM.sheet);
    const head = (kicker, title, sub) => `<div class="lm-ph"><div class="grow"><div class="lm-kick">${kicker}</div><h2>${esc(title)}</h2>${sub ? `<p class="muted small">${sub}</p>` : ''}</div><button class="icon-btn" id="lmPx" aria-label="${esc(t('close'))}">${ICONS.close}</button></div>`;
    if(LM.sel.kind === 'task'){
      const tk = tById(LM.sel.id); if(!tk){ close(); return; }
      const ps = plansOf(tk.id), st = ordState(tk, ps), du = dueInfo(tk), ar = areasOf(tk, ps);
      const team = [...new Set(ps.map(p => p.worker_id).filter(Boolean))].map(wById).filter(Boolean);
      const doneN = ps.filter(p => p.status === 'done').length, open = ps.filter(p => !p.worker_id || p.status === 'declined').length;
      const stTx = { open:t('lmStOpen'), assigned:t('lmStAssigned'), done:t('lmStDone') }[st];
      const areaTx = ar.length ? (ar[0].kind === 'drawn' ? t('lmAreaDrawn') : ar[0].kind === 'planned' ? t('lmAreaPlanned') : t('lmAreaDerived', { n:ar.length })) : t('lmAreaNone');
      PB.innerHTML = head(`<span class="lm-st" style="--c:${ordColor(st)}">${st === 'done' ? ICONS.check : st === 'open' ? ICONS.alert : ICONS.users}${esc(stTx)}</span>`, tk.title, esc([tk.district, tk.city_name].filter(Boolean).join(', ')))
        + `<div class="lm-facts">${fact(t('deadline'), esc(du.txt), du.cls)}${fact(t('flyersCount'), fmtN(tk.flyers || 0))}${fact(t('lmRoutes'), ps.length ? t('lmRoutesDone', { d:doneN, n:ps.length }) : '–')}${fact(t('lmUnassigned'), String(open), open ? 'warn' : '')}${tk.flyers_done ? fact(t('lmFlyersDone'), fmtN(tk.flyers_done)) : ''}${fact(t('lmArea'), esc(areaTx))}</div>`
        + `<h3 class="lm-h">${esc(t('lmTeam'))} <span class="muted">${team.length}</span></h3>`
        + (team.length ? `<div class="lm-team">${team.map(w => `<button class="lm-tw" data-w="${w.id}"><span class="dotc ${wState(w) === 'off' ? 'pause' : ''}" style="${wState(w) === 'off' ? '' : 'background:var(--color-success)'}"></span>${esc(w.name)}<small>${esc(wState(w) === 'on' ? t('stLive') : wState(w) === 'pause' ? t('onPause') : t('lmNotOnWay'))}</small></button>`).join('')}</div>` : `<p class="small muted">${esc(t('lmNoTeam'))}</p>`)
        + (tk.notes ? `<h3 class="lm-h">${esc(t('note'))}</h3><p class="small">${esc(tk.notes)}</p>` : '')
        + `<div class="lm-acts">${act('open', ICONS.chevron, t('lmOpenOrder'), true)}${act('routes', ICONS.route, t('lmShowRoutes'))}${act('team', ICONS.users, t('lmShowTeam'))}${act('focus', ICONS.locate, t('lmFocusArea'))}</div>`;
      PB.querySelector('[data-a="open"]').onclick = () => viewTask(tk.id);
      PB.querySelector('[data-a="routes"]').onclick = () => viewTaskMap(tk.id, () => viewLive());
      PB.querySelector('[data-a="team"]').onclick = () => { const b = L.latLngBounds([]); team.forEach(w => { const p = posOf(w); if(p) b.extend(p.p); }); if(b.isValid()) fit(m, b, 80); };
      PB.querySelector('[data-a="focus"]').onclick = focusSel;
      PB.querySelectorAll('[data-w]').forEach(b => b.onclick = () => select({ kind:'worker', id:b.dataset.w }, true));
    } else if(LM.sel.kind === 'worker'){
      const w = wById(LM.sel.id); if(!w){ close(); return; }
      const st = wState(w), ps = posOf(w), run = A.live.find(r => r.worker_id === w.id), cur = run && tById(run.task_id), pc = st === 'on' ? pace(w) : null;
      const stTx = st === 'on' ? t('stLive') : st === 'pause' ? t('onPause') : t('lmNotOnWay');
      const posTx = !ps ? t('lmPosNone') : ps.kind === 'live' ? t('lmPosLive', { a:ago(w.last_seen) }) : ps.kind === 'gps' ? t('lmPosGps', { a:ago(w.last_seen) }) : t('lmPosHome', { c:ps.city });
      const mine = A.tasks.filter(x => x.status === 'open' && plansOf(x.id).some(p => p.worker_id === w.id && p.status !== 'declined'));
      PB.innerHTML = head(`<span class="lm-st" style="--c:${st === 'off' ? 'var(--color-text-secondary)' : 'var(--color-success)'}">${st === 'off' ? ICONS.person : ICONS.gps}${esc(stTx)}</span>`, w.name, (w.cities || []).map(c => esc(c.name)).join(', '))
        + `<div class="lm-facts">${fact(t('lmPosition'), esc(posTx), ps && ps.kind !== 'live' ? 'muted' : '')}${fact(t('lmLastSeen'), esc(w.last_seen ? ago(w.last_seen) : t('noData')))}${cur ? fact(t('lmCurOrder'), `<button class="link" data-t="${cur.id}">${esc(cur.title)}</button>`) : ''}${pc && pc.label ? fact(t('lmPace'), esc(pc.label), pc.cls === 'bad' ? 'bad' : 'warn') : ''}</div>`
        + (ps && ps.kind === 'home' ? `<p class="small muted">${esc(t('lmHomeHint'))}</p>` : ps && ps.kind === 'gps' ? `<p class="small muted">${esc(t('lmGpsHint'))}</p>` : '')
        + `<h3 class="lm-h">${esc(t('lmOrdersOf'))} <span class="muted">${mine.length}</span></h3>`
        + (mine.length ? `<div class="lm-team">${mine.map(x => `<button class="lm-tw" data-t="${x.id}"><span class="dotc" style="background:${ordColor(ordState(x, plansOf(x.id)))}"></span>${esc(x.title)}<small>${esc(dueInfo(x).txt)}</small></button>`).join('')}</div>` : `<p class="small muted">${esc(t('lmNoOrders'))}</p>`)
        + `<div class="lm-acts">${act('open', ICONS.chevron, t('lmOpenProfile'), true)}${ps ? act('focus', ICONS.locate, t('lmFocusPos')) : ''}${w.phone ? `<a class="btn ghost small" href="${esc(telLink(w.phone))}">${ICONS.phone}<span>${esc(t('call'))}</span></a><a class="btn ghost small" href="${esc(waLink(w.phone))}" target="_blank" rel="noopener">${ICONS.chat}<span>WhatsApp</span></a>` : ''}</div>`;
      PB.querySelector('[data-a="open"]').onclick = () => viewWorker(w.id, () => viewLive());
      const fb = PB.querySelector('[data-a="focus"]'); if(fb) fb.onclick = focusSel;
      PB.querySelectorAll('[data-t]').forEach(b => b.onclick = () => select({ kind:'task', id:b.dataset.t }, true));
    } else if(LM.sel.kind === 'place'){
      const pl = LM.place; if(!pl){ close(); return; }
      const near = A.workers.map(w => { const ps = posOf(w); if(!ps) return null; const km = hav(pl.lat, pl.lng, ps.p[0], ps.p[1]) / 1000; return { w, km, ps }; })
        .filter(x => x && x.km <= LM.km).sort((a, b) => a.km - b.km);
      PB.innerHTML = head(`<span class="lm-st" style="--c:var(--color-primary)">${ICONS.pin}${esc(t('lmPlace'))}</span>`, pl.name, esc(t('lmRadius', { k:LM.km })))
        + `<div class="lm-radius">${[10, 25, 50, 100].map(k => `<button class="mchip ${k === LM.km ? 'on' : ''}" data-k="${k}" aria-pressed="${k === LM.km}">${k} km</button>`).join('')}</div>`
        + `<h3 class="lm-h">${esc(near.length ? t('nearN', { n:near.length, c:pl.name }) : t('nearNone', { k:LM.km, c:pl.name }))}</h3>`
        + `<div class="lm-team">${near.map(({ w, km, ps }) => `<button class="lm-tw" data-w="${w.id}"><span class="dotc ${wState(w) === 'off' ? 'pause' : ''}" style="${wState(w) === 'off' ? '' : 'background:var(--color-success)'}"></span>${esc(w.name)}<small>${Math.round(km)} km · ${esc(ps.kind === 'home' ? t('livesIn', { c:ps.city }) : ps.kind === 'live' ? t('stLive') : ago(w.last_seen))}</small></button>`).join('')}</div>`;
      PB.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { LM.km = +b.dataset.k; drawPlace(); renderPanel(); focusSel(); });
      PB.querySelectorAll('[data-w]').forEach(b => b.onclick = () => select({ kind:'worker', id:b.dataset.w }, true));
    }
    const px = $('#lmPx'); if(px) px.onclick = () => { if(LM.sel && LM.sel.kind === 'place'){ LM.place = null; placeL.clearLayers(); } close(); };
  };
  const drawPlace = () => { placeL.clearLayers(); const pl = LM.place; if(!pl) return;
    L.circle([pl.lat, pl.lng], { radius:LM.km * 1000, color:css('--color-primary') || '#2563EB', weight:2, fillOpacity:.05, interactive:false }).addTo(placeL);
    L.circleMarker([pl.lat, pl.lng], { radius:6, color:'#fff', weight:3, fillColor:css('--color-primary') || '#2563EB', fillOpacity:1, interactive:false }).addTo(placeL); };
  // bottom sheet on a phone: tap the handle to switch half ↔ full, drag it down to make it small, up to make it big
  { const g = $('#lmGrip'); let y0 = null, h0 = 0;
    g.onclick = () => { if(desk()) return; setSheet(LM.sheet === 'full' ? 'half' : LM.sheet === 'half' ? 'full' : 'half'); };
    g.addEventListener('pointerdown', e => { if(desk()) return; y0 = e.clientY; h0 = P.getBoundingClientRect().height; g.setPointerCapture(e.pointerId); });
    g.addEventListener('pointermove', e => { if(y0 == null) return; P.style.height = Math.max(64, Math.min(innerHeight * .9, h0 - (e.clientY - y0))) + 'px'; P.classList.add('drag'); });
    const up = e => { if(y0 == null) return; const dy = e.clientY - y0; y0 = null; P.style.height = ''; P.classList.remove('drag');
      if(Math.abs(dy) < 8) return; const order = ['min', 'half', 'full'], i = order.indexOf(LM.sheet); setSheet(order[Math.max(0, Math.min(2, i + (dy < 0 ? 1 : -1) * (Math.abs(dy) > 160 ? 2 : 1)))]); };
    g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up); }
  const onKey = e => { if(e.key === 'Escape' && LM.sel && !document.querySelector('.modal')) close(); };
  document.addEventListener('keydown', onKey);

  /* ---------- filters, tools, overview ---------- */
  // What the map shows: one big button "Anzeigen" (with how many things are on), a panel with three sections in plain words –
  // people, orders, what is drawn – each line with its colour, its number and one sentence what it means.
  let fHtml = '', layOpen = false;
  const drawFilters = () => {
    const ws = A.workers.filter(w => posOf(w)), on = ws.filter(w => wState(w) !== 'off').length, ts = shown().map(tk => ordState(tk, plansOf(tk.id)));
    const nOpen = ts.filter(x => x !== 'done').length, nDone = ts.filter(x => x === 'done').length;
    const row = (k, mark, label, hint, n) => `<label class="lm-frow"><input type="checkbox" data-f="${k}" ${LM.f[k] ? 'checked' : ''}><span class="lm-fmark">${mark}</span><span class="lm-ftx"><b>${esc(label)}</b><small>${esc(hint)}</small></span>${n != null ? `<span class="lm-fn">${n}</span>` : ''}</label>`;
    const nOn = ['on', 'off', 'open', 'done', 'areas', 'routes', 'walked'].filter(k => LM.f[k]).length;
    const summary = [LM.f.on && t('lmOnWay'), LM.f.off && t('lmNotOnWay'), LM.f.open && t('lmOpenShort'), LM.f.done && t('lmDoneOrders')].filter(Boolean).join(' · ') || t('lmNothing');
    const html = `<button class="lm-fbtn ${layOpen ? 'open' : ''}" id="lmLay" aria-haspopup="true" aria-expanded="${layOpen}">${ICONS.sliders}<span class="lm-fb-t"><b>${esc(t('lmShow'))}</b><small>${esc(summary)}</small></span><span class="lm-fb-n">${nOn}</span></button>
      <div class="lm-pop ${layOpen ? '' : 'hidden'}" id="lmPop" role="dialog" aria-label="${esc(t('lmShow'))}">
        <h4>${esc(t('lmWorkers'))}</h4>
        ${row('on', '<span class="fdot on"></span>', t('lmOnWay'), t('lmOnWayHint'), on)}${row('off', '<span class="fdot off"></span>', t('lmNotOnWay'), t('lmNotOnWayHint'), ws.length - on)}
        <h4>${esc(t('lmOrdersG'))}</h4>
        ${row('open', '<span class="fdot open"></span>', t('lmOpenShort'), t('lmOpenHint'), nOpen)}${row('done', '<span class="fdot done"></span>', t('lmDoneOrders'), t('lmDoneHint'), nDone)}
        <h4>${esc(t('lmOnMap'))}</h4>
        ${row('areas', ICONS.layers, t('lmAreas'), t('lmAreasHint'))}${row('routes', ICONS.route, t('lmPlanned'), t('lmPlannedHint'))}${row('walked', ICONS.activity, t('lmWalked'), t('lmWalkedHint'))}
        <button class="btn primary small lm-fdone" id="lmFok">${esc(t('lmFok'))}</button>
      </div>`;
    if(html === fHtml) return; fHtml = html;
    $('#lmF').innerHTML = html;
    const apply = k => { saveF(); drawFilters(); drawOrders(); drawWorkers(true); if(k === 'walked' || k === 'on'){ trackAt = 0; liveTracks(); } };
    $('#lmF').querySelectorAll('input[data-f]').forEach(b => b.onchange = () => { const k = b.dataset.f; LM.f[k] = b.checked; apply(k); });
    $('#lmLay').onclick = e => { e.stopPropagation(); layOpen = !layOpen; fHtml = ''; drawFilters(); };
    $('#lmFok').onclick = e => { e.stopPropagation(); layOpen = false; fHtml = ''; drawFilters(); };
  };
  document.addEventListener('click', e => { if(layOpen && !e.target.closest('#lmF')){ layOpen = false; fHtml = ''; if($('#lmF')) drawFilters(); } });
  const drawOver = () => {
    const ws = A.workers.length, on = A.workers.filter(w => wState(w) !== 'off').length, open = shown().filter(x => x.status === 'open').length;
    const upd = lastOk ? new Date(lastOk).toLocaleTimeString(I.lang === 'en' ? 'en-GB' : I.lang === 'ru' ? 'ru-RU' : 'de-DE', { hour:'2-digit', minute:'2-digit', second:'2-digit' }) : '–';
    const stale = lastOk && Date.now() - lastOk > 20e3;
    $('#lmOver').innerHTML = `<button class="lm-ov-t" id="lmOvT" aria-expanded="${LM.over}" aria-label="${esc(t('lmOverview'))}">${ICONS.chart}</button>
      <div class="lm-ov-b"><div><b>${ws}</b><span>${esc(t('lmWorkers'))}</span></div><div><b class="ok">${on}</b><span>${esc(t('lmOnWay'))}</span></div><div><b>${ws - on}</b><span>${esc(t('lmNotOnWay'))}</span></div><div><b>${open}</b><span>${esc(t('lmOpenOrders'))}</span></div></div>
      <span class="lm-ov-u ${stale ? 'danger-text' : ''}">${esc(stale ? t('staleData', { x:upd }) : t('lmUpdated', { x:upd }))}</span>`;
    $('#lmOvT').onclick = () => { LM.over = !LM.over; $('#lmOver').classList.toggle('mini', !LM.over); $('#lmOvT').setAttribute('aria-expanded', LM.over); };
  };
  const fitWorkers = () => { const b = L.latLngBounds([]); A.workers.forEach(w => { const p = posOf(w); if(p) b.extend(p.p); }); fit(m, b, 70); };
  const fitOrders = () => { const b = L.latLngBounds([]); shown().filter(x => x.status === 'open').forEach(tk => { areasOf(tk, plansOf(tk.id)).forEach(a => b.extend(L.latLngBounds(a.poly))); if(tk.start_lat != null) b.extend([tk.start_lat, tk.start_lng]); }); fit(m, b, 70); };
  $('#lmZin').onclick = () => m.zoomIn(); $('#lmZout').onclick = () => m.zoomOut();
  $('#lmAllW').onclick = fitWorkers; $('#lmAllT').onclick = fitOrders; $('#lmFocus').onclick = focusSel;
  $('#lmReset').onclick = () => { LM.place = null; placeL.clearLayers(); close(); };

  /* ---------- search: people, orders, places of orders, then towns ---------- */
  { const q = $('#lmQ'), r = $('#lmR'), x = $('#lmQx'); let tm, seq = 0;
    const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
    const hide = () => r.classList.add('hidden');
    const show = async () => {
      const v = norm(q.value.trim()); x.classList.toggle('hidden', !q.value); if(v.length < 2){ hide(); return; }
      const ws = A.workers.filter(w => norm(w.name).includes(v) || String(w.phone || '').replace(/\D/g, '').includes(v.replace(/\D/g, '') || '§') || (w.cities || []).some(c => norm(c.name).includes(v))).slice(0, 5);
      const ts = shown().filter(tk => norm(tk.title + ' ' + (tk.city_name || '') + ' ' + (tk.district || '') + ' ' + plansOf(tk.id).map(placeOf).join(' ')).includes(v)).slice(0, 5);
      const row = (k, id, ic, a, b) => `<button class="res" data-k="${k}" data-id="${esc(id)}" role="option"><b>${ic}${esc(a)}</b><span>${esc(b)}</span></button>`;
      const local = ws.map(w => row('w', w.id, '', w.name, (wState(w) !== 'off' ? t('stLive') : t('lmNotOnWay')) + ((w.cities || []).length ? ' · ' + w.cities.map(c => c.name).join(', ') : ''))).join('')
        + ts.map(tk => row('t', tk.id, '', tk.title, [tk.district, tk.city_name].filter(Boolean).join(', ') + ' · ' + dueInfo(tk).txt)).join('');
      r.innerHTML = (local ? `<div class="res-h">${esc(t('lmInData'))}</div>${local}` : '') + `<div class="res-h">${esc(t('lmTowns'))}</div><div class="res muted" id="lmRt">…</div>`; r.classList.remove('hidden'); bindRes();
      const my = ++seq; clearTimeout(tm);
      tm = setTimeout(async () => { let res = []; try{ res = await searchPlaces(q.value.trim(), true, null); }catch{} if(my !== seq) return;
        const el = $('#lmRt'); if(!el) return; RES = res;
        el.outerHTML = res.length ? res.slice(0, 5).map((c, i) => row('c', String(i), '', c.name, c.sub || '')).join('') : `<div class="res muted">${esc(t('notFound'))}</div>`; bindRes(); }, 350);
    };
    let RES = [];
    const bindRes = () => r.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
      hide(); q.blur();
      if(b.dataset.k === 'w') select({ kind:'worker', id:b.dataset.id }, true);
      else if(b.dataset.k === 't'){ const tk = tById(b.dataset.id); if(tk && (tk.status === 'done' ? !LM.f.done : !LM.f.open)){ LM.f[tk.status === 'done' ? 'done' : 'open'] = true; saveF(); drawFilters(); } select({ kind:'task', id:b.dataset.id }, true); }
      else { const c = RES[+b.dataset.id]; if(!c) return; LM.place = { name:c.name, lat:c.lat, lng:c.lng }; drawPlace(); select({ kind:'place' }, true); }
    });
    q.addEventListener('input', show); q.addEventListener('focus', show);
    q.addEventListener('keydown', e => { if(e.key === 'Escape'){ hide(); q.blur(); } if(e.key === 'Enter'){ const f = r.querySelector('[data-k]'); if(f) f.click(); } });
    x.onclick = () => { q.value = ''; x.classList.add('hidden'); hide(); };
    document.addEventListener('click', e => { if(!e.target.closest('.lm-search')) hide(); });
  }

  /* ---------- data ---------- */
  const loadOrders = async () => {
    const ids = shown().map(x => x.id); if(!ids.length){ plans = []; return; }
    const { data } = await sb.from('task_plans').select('id,task_id,idx,color,path,worker_id,status,days,mailboxes').in('task_id', ids);
    plans = data || [];
    // walked parts of these orders (green): GPS points without the drives
    const { data:tr } = await sb.rpc('company_tracks', { p_tasks:ids }); tracks = {};
    for(const [tid, pts] of Object.entries(tr || {})){ const runs = []; let cur = [];
      for(const q of pts){ if(!q[0] && !q[1]){ if(cur.length > 1) runs.push(cur); cur = []; } else cur.push(q); } if(cur.length > 1) runs.push(cur);
      tracks[tid] = runs.flatMap(splitJumps); }
  };
  const firstFit = () => {
    if(fittedOnce || userMoved) return; fittedOnce = true;
    if(LM.place){ focusSel(); return; }
    // first view: the work – open orders and the people on the way; only when there is none, everybody
    const b = L.latLngBounds([]); A.workers.forEach(w => { const p = posOf(w); if(p && wState(w) !== 'off') b.extend(p.p); });
    shown().filter(x => x.status === 'open').forEach(tk => { areasOf(tk, plansOf(tk.id)).forEach(a => b.extend(L.latLngBounds(a.poly))); if(tk.start_lat != null) b.extend([tk.start_lat, tk.start_lng]); });
    if(!b.isValid()) A.workers.forEach(w => { const p = posOf(w); if(p) b.extend(p.p); });
    if(!b.isValid()) return;
    const d = desk(); try{ m.fitBounds(b, { paddingTopLeft:d ? [40, 90] : [20, 140], paddingBottomRight:d ? [80, 90] : [70, 120], maxZoom:15, animate:false }); }catch{}
  };
  const tick = async () => {
    try{ await Promise.all([loadWorkers(), loadLive()]); lastOk = Date.now(); }catch{ drawOver(); return; }
    if(!$('#lmF')) return;
    drawWorkers(); drawFilters(); drawOver(); liveTracks().catch(() => {});
    if(LM.sel && !P.classList.contains('hidden') && !P.contains(document.activeElement)) renderPanel();
  };
  drawPlace(); drawFilters(); drawOver(); tools();
  (async () => {
    try{ await loadOrders(); }catch{}
    if(!$('#lmF')) return;
    drawOrders(); drawFilters(); await tick();
    if(LM.sel && LM.focus){ LM.focus = false; fittedOnce = true; drawOrders(); renderPanel(); focusSel(); } else { firstFit(); if(LM.sel) renderPanel(); }
  })();
  every(A.demo ? 3000 : 4000, tick);
  // leaving the map: the key listener goes too
  const obs = new MutationObserver(() => { if(!document.getElementById('lmF')){ document.removeEventListener('keydown', onKey); obs.disconnect(); } });
  obs.observe(document.getElementById('root') || document.body, { childList:true });
}
