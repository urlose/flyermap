import L from 'leaflet';
import Planner from '../../admin/planner.js';
import { t, I } from './i18n.js';
import { sb, store, $, esc, css, hav, fmtDist, fmtH, fmtHm, fmtN, fmtDay, fmtDT, ago, waLink, telLink, loopPath, deMobile, loc, reversePlace, placeArea, errText } from './core.js';
import { groupIcon } from './ui.js';
import { UI, ICONS, shell, setLoc, getLoc, plain, topbar, bindBack, makeMap, dot, labelIcon, fit, drawJumps, modal, confirmBox, toast, searchField, langSwitch, themeSwitch, statusPill, emptyState, avatar, every, personIcon } from './ui.js';
import { legalLinks, bindLegal } from './legalview.js';
import { adminContractHtml, bindAdminContract } from './contractview.js';
import { loadWorkerStats, okBadge, shortLine, workerStatsHtml, bindWorkerStats, isVerified, viewStats } from './stats.js';
window.addEventListener('fm-open-task', e => viewTask(e.detail, () => viewStats()));
import { makePlanEngine, setStampClient, tileStamp } from './planengine.js';
import { openMapView } from './routeview.js';
import { checkpoints, addSkips, dayProgress, makeNav } from './nav.js';
import { loadFirm, firmCardHtml, bindFirmCard, firmComplete, avvOk } from './firm.js';
import { viewMaster, poolHtml } from './master.js';
const DONE_TX = () => ({ de:{ chip:'Erledigte', tag:'erledigt' }, ru:{ chip:'Выполненные', tag:'выполнен' }, en:{ chip:'Finished', tag:'finished' } }[['ru', 'en'].includes(I.lang) ? I.lang : 'de']);

const GREEN_C = () => css('--color-map-route-completed') || '#16A34A';   // done parts: the theme's "completed" colour
const APP_LINK = 'https://urlose.github.io/flyermap/app/';
// e-mail admins: change the password (e.g. the first one they got from the master admin)
document.addEventListener('click', e => {
  if(!e.target.closest || !e.target.closest('#aPw')) return;
  const mo = modal(`<h2>${esc(t('pwChange'))}</h2><label class="f">${esc(t('pwNew'))}</label><input class="in" id="pw1" type="password" autocomplete="new-password">
    <label class="f">${esc(t('pwAgain'))}</label><input class="in" id="pw2" type="password" autocomplete="new-password">
    <button class="btn primary" id="pwOk" style="margin-top:12px">${esc(t('save'))}</button><button class="btn ghost" id="pwX">${esc(t('cancel'))}</button><div class="err" id="pwErr"></div>`);
  mo.querySelector('#pwX').onclick = () => mo.remove();
  mo.querySelector('#pwOk').onclick = async () => {
    const a = mo.querySelector('#pw1').value, b = mo.querySelector('#pw2').value, er = mo.querySelector('#pwErr');
    if(a.length < 8){ er.textContent = t('pwShort'); return; } if(a !== b){ er.textContent = t('pwDiff'); return; }
    const { error } = await sb.auth.updateUser({ password:a }); if(error){ er.textContent = error.message; return; }
    mo.remove(); toast(t('saved'));
  };
});
document.addEventListener('click', async e => { if(!e.target.closest || !e.target.closest('#invCp')) return; const v = ($('#invLink') || {}).value; try{ await navigator.clipboard.writeText(v); toast(t('copied')); }catch{ toast(v); } });
// until SMS login works: the admin creates a worker account and hands over its login link (the worker sets name, phone, cities)
document.addEventListener('click', e => {
  if(!e.target.closest || !e.target.closest('#wNewLink')) return;
  let city = null;
  const sf = searchField('nlCity', t('whoPh'), c => { city = c; }, { citiesOnly:true });
  const mo = modal(`<h2>${esc(t('newLinkAcc'))}</h2><p class="muted small">${esc(t('newLinkHint'))}</p>
    <label class="f">${esc(t('nameOpt'))}</label><input class="in" id="nlName" autocomplete="off">
    <label class="f">${esc(t('cityOpt'))}</label>${sf.html}
    <button class="btn primary" id="nlOk" style="margin-top:12px">${esc(t('createLink'))}</button><button class="btn ghost" id="nlX">${esc(t('cancel'))}</button><div class="err" id="nlErr"></div><div id="nlOut"></div>`);
  sf.bind();
  mo.querySelector('#nlX').onclick = () => { mo.remove(); if(mo.dataset.made){ loadWorkers().then(() => viewPeople()); } };
  mo.querySelector('#nlOk').onclick = async () => {
    const b = mo.querySelector('#nlOk'); b.disabled = true;
    const phone = '+490000002' + String(Date.now()).slice(-6) + Math.floor(Math.random() * 10);   // placeholder until the worker enters the real number
    const { data, error } = await sb.from('workers').insert({ name:mo.querySelector('#nlName').value.trim() || t('newWorkerName'), phone, cities:city ? [{ name:city.city || city.name, lat:city.lat, lng:city.lng }] : [], zone_minutes:60 }).select('token').single();
    if(error){ mo.querySelector('#nlErr').textContent = error.message; b.disabled = false; return; }
    mo.dataset.made = '1'; b.hidden = true; mo.querySelector('#nlX').textContent = t('close');
    const link = APP_LINK + '?konto=' + data.token;
    mo.querySelector('#nlOut').innerHTML = `<label class="f">${esc(t('loginLink'))}</label><div class="code-row"><input class="in small" readonly value="${esc(link)}" style="flex:1;min-width:0"><button class="btn ghost small" id="nlCp">${esc(t('copy'))}</button></div>
      <a class="btn ghost small" style="margin-top:8px" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(link)}">${ICONS.chat}WhatsApp</a>`;
    mo.querySelector('#nlCp').onclick = async () => { try{ await navigator.clipboard.writeText(link); toast(t('copied')); }catch{ toast(link); } };
  };
});
// all login links of the team in one place (Mitarbeiter page), loaded when the box is opened
document.addEventListener('toggle', async e => {
  if(e.target.id !== 'linkBox' || !e.target.open) return;
  const box = document.getElementById('linkList'); if(!box) return;
  const ids = (A.workers || []).map(w => w.id); if(!ids.length){ box.innerHTML = ''; return; }
  const { data } = await sb.from('workers').select('id,name,token,cities').in('id', ids).order('name');
  box.innerHTML = `<p class="small muted">${esc(t('loginLinkHint'))}</p>` + (data || []).filter(w => w.token).map(w => { const link = APP_LINK + '?konto=' + w.token, c = (w.cities || []).map(x => x.name).filter(Boolean).join(', ');
    return `<div style="padding:10px 0;border-top:1px solid var(--color-border)"><b>${esc(w.name)}</b>${c ? ` <span class="small muted">· ${esc(c)}</span>` : ''}<div class="code-row" style="margin-top:6px"><input class="in small" readonly value="${esc(link)}" style="flex:1;min-width:0"><button class="btn ghost small" data-cp="${esc(link)}">${esc(t('copy'))}</button></div></div>`; }).join('');
  box.querySelectorAll('[data-cp]').forEach(b => b.onclick = async () => { try{ await navigator.clipboard.writeText(b.dataset.cp); toast(t('copied')); }catch{ toast(b.dataset.cp); } });
}, true);
// finished map-data answers are shared through our own server (edge function 'osm'): same area = instant for every admin
const osmCache = {
  async get(queries){ const { data, error } = await sb.functions.invoke('osm', { body:{ mode:'get', queries } }); if(error || !data || !data.results) throw new Error('cache'); return data.results; },
  async put(items){ if(items.some(i => JSON.stringify(i.payload).length > 5e6)) return; await sb.functions.invoke('osm', { body:{ mode:'put', items } }); },
  async putChecked(items){ await sb.functions.invoke('osm', { body:{ mode:'put', items } }); },   // size already checked in the planner worker
};
const KM_PER_MIN_TRANSIT = 0.75;
// priority area: [[lat,lng]…] (old orders: all streets inside) or { p:[[lat,lng]…], n:flyers }
const mArea = a => Array.isArray(a) ? { p:a, n:0, name:'' } : { p:(a && a.p) || [], n:+(a && a.n) || 0, name:(a && a.name) || '', c:(a && a.c) || undefined };
// borders of the Nebenstädte of an order with their names: near ones (part of the main plan) orange, far ones (bus) teal
const townTip = (g, poly, txt, col) => { const pg = L.polygon(poly, { color:col, weight:0, fillOpacity:0, interactive:false }); L.marker(pg.getBounds().getCenter(), { icon:L.divIcon({ className:'', html:`<span class="must-tip" style="border-color:${col}">${esc(txt)}</span>`, iconSize:null }), interactive:false, keyboard:false }).addTo(g); };
function drawTowns(g, tk, w){
  (tk.must_areas || []).forEach((a0, k) => { const a = mArea(a0); if(a.p.length < 3) return; L.polygon(a.p, { color:'#EA580C', weight:w, dashArray:'8 6', fillOpacity:.08, interactive:false }).addTo(g); townTip(g, a.p, mName(a, k) + (a.n ? ' · ' + fmtN(a.n) : ''), '#EA580C'); });
  (tk.side_towns || []).forEach(x => { if(!(x.p && x.p.length > 2)) return; L.polygon(x.p, { color:'#0D9488', weight:w, dashArray:'4 6', fillOpacity:.06, interactive:false }).addTo(g); townTip(g, x.p, x.name + ' · ' + fmtN(x.flyers || 0), '#0D9488'); });
}
const mName = (a, k) => (a && a.name) || t('mustN', { n:k + 1 });
// route planning runs in a background worker (the screen never freezes); one engine for the session keeps the loaded map
let engine = null;
const planEngine = () => engine || (setStampClient(sb), tileStamp(), engine = makePlanEngine(osmCache));
export const A = { user:null, workers:[], tasks:[], live:[], demo:null, hooks:{}, filter:{ status:'open', from:'', to:'', city:'', district:'' } };

/* ---------- data ---------- */
async function loadWorkers(){ const { data, error } = await sb.from('workers').select('id,name,phone,cities,zone_minutes,notes,start_anywhere,last_lat,last_lng,last_seen,nav_lat,nav_lng,nav_at,active_route_id,created_at,company_id').order('name'); if(error) throw error; A.workers = data; }
async function loadTasks(){ const { data, error } = await sb.from('tasks').select('*,task_workers(worker_id)').is('merged_into', null).order('created_at', { ascending:false }); if(error) throw error; A.tasks = data; }
async function loadLive(){ const { data } = await sb.from('routes').select('id,worker_id,task_id,plan_id,paused_at,last30_m,started_at,break_s').is('ended_at', null); A.live = data || []; }
async function loadAll(){
  await Promise.all([loadWorkers(), loadTasks(), loadFirm().then(c => { A.company = c; }).catch(() => {})]);
  // master admins see every company: names for the lists
  A.companies = A.company && A.company.master ? ((await sb.from('companies').select('id,name')).data || []) : [];
}
const coName = id => { if(!A.companies || A.companies.length < 2) return ''; const c = A.companies.find(x => x.id === id); return c ? (/^\[/.test(c.name) ? '—' : c.name) : ''; };
async function fetchPoints(routeId){
  let all = [], from = 0;
  for(;;){ const { data, error } = await sb.from('route_points').select('t,lat,lng').eq('route_id', routeId).order('t').range(from, from + 999); if(error) throw error; all = all.concat(data); if(data.length < 1000) break; from += 1000; }
  return all;
}
const wById = id => A.workers.find(w => w.id === id);
const zoneKm = w => (w.zone_minutes || 60) * KM_PER_MIN_TRANSIT;
function distTo(w, lat, lng){ let best = Infinity, city = null; for(const c of (w.cities || [])){ const d = hav(c.lat, c.lng, lat, lng) / 1000; if(d < best){ best = d; city = c; } } return { km:best, city }; }
const forPoint = (lat, lng) => A.workers.map(w => ({ w, ...distTo(w, lat, lng) })).map(x => ({ ...x, inZone:x.km <= zoneKm(x.w) })).sort((a, b) => a.km - b.km);
function pace(w){
  const r = A.live.find(x => x.worker_id === w.id); if(!r) return { cls:'', label:'' };
  if(r.paused_at) return { cls:'pause', label:t('onPause') };
  const tk = A.tasks.find(x => x.id === r.task_id), quota = (tk && tk.quota_m30) || 1500; if(tk && tk.no_quota) return { cls:'', label:'' };
  const wm = (Date.now() - new Date(r.started_at) - (r.break_s || 0) * 1000) / 60000; if(wm < 8) return { cls:'', label:'' };
  const need = quota * Math.min(30, wm) / 30;
  if(r.last30_m > quota * 3) return { cls:'warn', label:t('quotaHigh') };
  if(r.last30_m < need * .7) return { cls:'bad', label:t('quotaLow') };
  return { cls:'', label:'' };
}
const isLive = w => w.active_route_id && ((w.last_seen && Date.now() - new Date(w.last_seen) < 20 * 60e3) || A.live.some(r => r.worker_id === w.id && r.paused_at));
function workerOptions(lat, lng, sel){
  return `<option value="">${esc(t('nobody'))}</option>` + forPoint(lat, lng).sort((a, b) => isVerified(b.w.id) - isVerified(a.w.id)).map(x => `<option value="${x.w.id}" ${x.w.id === sel ? 'selected' : ''}>${isVerified(x.w.id) ? '✓ ' : ''}${esc(x.w.name)}${x.city ? ' · ' + esc(x.city.name) : ''}${isFinite(x.km) ? ' · ' + Math.round(x.km) + ' km' : ''}${x.inZone ? '' : ' · ' + esc(t('outZone'))}</option>`).join('');
}

/* ---------- tabs ---------- */
async function adminLogout(){ if(await confirmBox(t('logout'), t('logoutQ'), t('logout'))){ await sb.auth.signOut(); for(const k of ['role', 'token', 'me', 'canAdmin']) await store.del(k); A.hooks.loggedOut && A.hooks.loggedOut(); } }
// merge orders that belong together (platform admins only for now): everything of the chosen orders moves into this one
function mergeDialog(tk){
  const others = A.tasks.filter(x => x.id !== tk.id && x.company_id === tk.company_id);
  const word = (tk.title || '').split(/[\s·,.-]+/).find(w => w.length > 3) || '';
  const like = x => word && (x.title || '').toLowerCase().includes(word.toLowerCase());
  const row = x => `<label class="check" style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-top:1px solid var(--color-border)"><input type="checkbox" value="${x.id}" ${like(x) ? 'checked' : ''}><span><b>${esc(x.title)}</b><br><span class="small muted">${esc(x.work_date ? fmtDay(x.work_date) : t('noDate'))} · ${fmtN(x.flyers || 0)} Flyer · ${esc(taskState(x)[1])}</span></span></label>`;
  const m = modal(`<h2>${esc(t('mergeTasks'))}</h2><p class="small muted">${esc(t('mergeHint', { title:tk.title }))}</p>
    <input class="in" id="mgQ" placeholder="${esc(t('search'))}" style="margin:8px 0">
    <div id="mgL" style="max-height:46vh;overflow:auto">${others.sort((a, b) => like(b) - like(a) || (a.title || '').localeCompare(b.title || '')).map(row).join('') || `<p class="muted">${esc(t('noTasks'))}</p>`}</div>
    <button class="btn primary" id="mgGo" style="margin-top:12px">${esc(t('mergeGo'))}</button><button class="btn ghost" id="mgNo">${esc(t('back'))}</button><div class="err" id="mgErr"></div>`);
  m.querySelector('#mgQ').oninput = e => { const q = e.target.value.toLowerCase(); m.querySelectorAll('#mgL label').forEach(l => l.style.display = l.textContent.toLowerCase().includes(q) ? '' : 'none'); };
  m.querySelector('#mgNo').onclick = () => m.remove();
  m.querySelector('#mgGo').onclick = async () => {
    const ids = [...m.querySelectorAll('#mgL input:checked')].map(i => i.value);
    if(!ids.length){ m.querySelector('#mgErr').textContent = t('mergeNone'); return; }
    if(!await confirmBox(t('mergeTasks'), t('mergeQ', { n:ids.length, title:tk.title }), t('mergeGo'))) return;
    const { data, error } = await sb.rpc('merge_tasks', { p_target:tk.id, p_sources:ids });
    if(error){ m.querySelector('#mgErr').textContent = /someone_walking/.test(error.message) ? t('replanLive') : error.message; return; }
    m.remove(); toast(t('mergeDone', { n:data.merged })); await loadTasks(); viewTask(tk.id);
  };
}
function routeFromHash(){
  const [k, id] = getLoc().split('/');
  if(k === 'task' && id && A.tasks.some(x => x.id === id)) return viewTask(id);
  if(k === 'worker' && id && A.workers.some(w => w.id === id)) return viewWorker(id);
  if(k === 'new') return viewCreate();
  adminTab(['map', 'people', 'tasks', 'settings', 'stats'].includes(k) ? k : 'tasks');
}
export function adminTab(tab){
  if(tab === 'map') return viewLive();
  if(tab === 'people') return viewPeople();
  if(tab === 'settings') return viewSettings();
  if(tab === 'stats') return viewStats();
  return viewTasks();
}

/* ---------- KARTE: who is where right now ---------- */
const MAPQ = { place:null, km:25 };
function viewLive(){
  let m = null, layer = null, fitted = false, tickFn = null, lastOk = 0;
  const sf = searchField('mapQ', t('mapSearchPh'), c => { MAPQ.place = c; refit(); tickFn && tickFn(); }, { citiesOnly:true });
  shell('map', `<div id="fullMap" class="fullmap"></div>
    <div class="map-search">${sf.html}<div class="rad-row hidden" id="radRow"></div></div>
    <div class="float-card"><div class="fc-row"><b id="liveCount">${esc(t('loadingShort'))}</b><span class="muted small" id="liveUpd" role="status"></span></div><div class="live-list" id="liveList"></div>
      <div class="fc-row" style="margin-top:8px;justify-content:flex-start"><button class="chip ${MAPQ.tasks !== false ? 'on' : ''}" id="mTasks" aria-pressed="${MAPQ.tasks !== false}">${ICONS.route}<span id="mTasksTx">${esc(t('mapOrders'))}</span></button><button class="chip ${MAPQ.done !== false ? 'on' : ''}" id="mDone" aria-pressed="${MAPQ.done !== false}">${ICONS.check}<span id="mDoneTx">${esc(DONE_TX().chip)}</span></button></div></div>`, { map:true });
  sf.bind();
  m = makeMap($('#fullMap'), MAPQ.place ? [MAPQ.place.lat, MAPQ.place.lng] : null, 12);
  // open orders: planned routes in their colours, walked parts green; tap → order
  const taskLayer = L.layerGroup(); if(MAPQ.tasks !== false) taskLayer.addTo(m);
  // what was walked (not driven) in these orders: green, under the start pins
  const walked = async (ids, lay) => {
    if(!ids.length) return; const { data } = await sb.rpc('company_tracks', { p_tasks:ids }); if(!data || !document.getElementById('mTasks')) return;
    for(const [tid, pts] of Object.entries(data)){
      const runs = []; let cur = [];
      for(const q of pts){ if(!q[0] && !q[1]){ if(cur.length > 1) runs.push(cur); cur = []; } else cur.push(q); }
      if(cur.length > 1) runs.push(cur);
      const tk = A.tasks.find(x => x.id === tid), go = () => viewTask(tid);
      runs.flatMap(splitJumps).forEach(r => L.polyline(r, { color:GREEN_C(), weight:6, opacity:.75, lineJoin:'round', lineCap:'round' }).bindTooltip(tk ? tk.title : '', { sticky:true }).on('click', go).addTo(lay));
    }
  };
  // finished orders: grey dashed routes + green check pin "… · erledigt"; tap → order
  const doneLayer = L.layerGroup(); if(MAPQ.done !== false) doneLayer.addTo(m);
  const donePins = L.layerGroup().addTo(doneLayer); let doneItems = [];
  const drawDone = () => {
    donePins.clearLayers(); const groups = [];
    for(const it of doneItems){ const pt = m.latLngToLayerPoint(it.p), g = groups.find(x => x.pt.distanceTo(pt) < 40); if(g) g.items.push(it); else groups.push({ pt, items:[it] }); }
    for(const g of groups){
      if(g.items.length === 1){ const it = g.items[0]; L.marker(it.p, { icon:labelIcon('pin-done', it.tk.title + ' · ' + DONE_TX().tag), zIndexOffset:100 }).bindTooltip(it.tip).on('click', () => viewTask(it.tk.id)).addTo(donePins); continue; }
      const bb = L.latLngBounds(g.items.map(x => x.p));
      L.marker(bb.getCenter(), { icon:L.divIcon({ className:'', iconSize:[60, 28], iconAnchor:[30, 14], html:`<div class="map-pill done">✓ ${g.items.length} ${esc(DONE_TX().tag)}</div>` }), zIndexOffset:150 })
        .on('click', () => m.fitBounds(bb.pad(.5), { maxZoom:Math.min(m.getMaxZoom(), m.getZoom() + 4) })).addTo(donePins);
    }
  };
  m.on('zoomend', drawDone);
  (async () => {
    const done = A.tasks.filter(x => x.status === 'done' && x.start_lat != null);
    $('#mDoneTx').textContent = DONE_TX().chip + ' (' + done.length + ')'; if(!done.length) return;
    const { data:plans } = await sb.from('task_plans').select('task_id,path').in('task_id', done.map(x => x.id));
    if(!document.getElementById('mDone')) return;
    for(const tk of done){
      const go = () => viewTask(tk.id), tip = tk.title + ' · ' + DONE_TX().tag + (tk.work_date ? ' · ' + fmtDay(tk.work_date) : '');
      (plans || []).filter(p => p.task_id === tk.id && p.path && p.path.length > 1).forEach(p => L.polyline(Planner.pathRuns(p.path), { color:'#94A3B8', weight:3, opacity:.45, dashArray:'6 6', lineJoin:'round' }).bindTooltip(tip, { sticky:true }).on('click', go).addTo(doneLayer));
      doneItems.push({ tk, tip, p:[tk.start_lat, tk.start_lng] });
    }
    drawDone();
    walked(done.map(x => x.id), doneLayer);
  })().catch(() => {});
  layer = L.layerGroup().addTo(m);
  const wLayer = L.layerGroup().addTo(m); let wItems = [];
  const drawWorkers = () => {
    wLayer.clearLayers(); if(!m) return;
    const R = 46, groups = [];   // px: markers closer than this on screen become one group
    for(const it of [...wItems].sort((a, c) => c.on - a.on)){
      const pt = m.latLngToLayerPoint(it.p), g = groups.find(x => x.pt.distanceTo(pt) < R);
      if(g){ g.items.push(it); } else groups.push({ pt, items:[it] });
    }
    for(const g of groups){
      if(g.items.length === 1){
        const { w, on, p, city } = g.items[0];
        if(!on && !city) L.circle(p, { radius:350, color:'#94A3B8', weight:1, fillColor:'#94A3B8', fillOpacity:.15, interactive:false }).addTo(wLayer);
        L.marker(p, { icon:personIcon(w.name, on, on ? '' : city ? city : ago(w.last_seen)), zIndexOffset:on ? 800 : 400 }).on('click', () => viewWorker(w.id, viewLive)).addTo(wLayer);
        continue;
      }
      const bb = L.latLngBounds(g.items.map(x => x.p)), c = bb.getCenter(), live = g.items.filter(x => x.on).length;
      const cities = [...new Set(g.items.map(x => x.city).filter(Boolean))], label = cities.length === 1 ? cities[0] : live ? t('liveNow', { n:live }) : '';
      const html = g.items.map(({ w, on, city }) => `<button class="link" data-wk="${w.id}" style="display:block;margin:4px 0;text-align:left">${on ? '🟢 ' : ''}${esc(w.name)}<small class="muted"> · ${esc(on ? t('stLive') : city || ago(w.last_seen))}</small></button>`).join('');
      const mk = L.marker(c, { icon:groupIcon(g.items.length, label, live), zIndexOffset:live ? 900 : 500 }).addTo(wLayer);
      // same place (e.g. home city) or already fully zoomed in: list; otherwise zoom in so the group splits
      const samePlace = bb.getNorthEast().distanceTo(bb.getSouthWest()) < 30;
      if(samePlace || m.getZoom() >= m.getMaxZoom() - 1) mk.bindPopup(html, { maxHeight:280 }).on('popupopen', e => e.popup.getElement().querySelectorAll('[data-wk]').forEach(x => x.onclick = () => viewWorker(x.dataset.wk, viewLive)));
      else mk.on('click', () => m.fitBounds(bb.pad(.4), { maxZoom:Math.min(m.getMaxZoom(), m.getZoom() + 4) }));
    }
  };
  m.on('zoomend', drawWorkers);
  let taskBounds = null, tasksLoaded = false, lastWB = null, userMoved = false;
  m.on('dragstart', () => { userMoved = true; });
  // first view: every worker and every open order; stops as soon as the admin moves the map
  const autoFit = () => {
    if(userMoved) return;
    const all = L.latLngBounds([]); if(lastWB && lastWB.isValid()) all.extend(lastWB); if(taskBounds && MAPQ.tasks !== false) all.extend(taskBounds);
    if(all.isValid()){ fit(m, all, 70); if(tasksLoaded && lastWB) fitted = true; }   // final only when workers and orders are both known
  };
  (async () => {
    const open = A.tasks.filter(x => x.status === 'open'); if(!open.length){ $('#mTasksTx').textContent = t('mapOrdersN', { n:0 }); return; }
    const { data:plans } = await sb.from('task_plans').select('id,task_id,idx,color,path').in('task_id', open.map(x => x.id));
    if(!document.getElementById('mTasks')) return;
    const b = L.latLngBounds([]);
    for(const tk of open){
      const go = () => viewTask(tk.id), tip = `${tk.title}${tk.district || tk.city_name ? ' · ' + [tk.district, tk.city_name].filter(Boolean).join(', ') : ''}`;
      (plans || []).filter(p => p.task_id === tk.id && p.path && p.path.length > 1).forEach(p => {
        const ln = L.polyline(Planner.pathRuns(p.path), { color:p.color || '#2563EB', weight:5, opacity:.85, lineJoin:'round' }).bindTooltip(tip, { sticky:true }).on('click', go).addTo(taskLayer); b.extend(ln.getBounds());
      });
      L.marker([tk.start_lat, tk.start_lng], { icon:labelIcon('pin-start', tk.title), zIndexOffset:200 }).on('click', go).addTo(taskLayer); b.extend([tk.start_lat, tk.start_lng]);
    }
    walked(open.map(x => x.id), taskLayer);
    $('#mTasksTx').textContent = t('mapOrdersN', { n:open.length });
    taskBounds = b.isValid() ? b : null; tasksLoaded = true;
    if(!userMoved && !MAPQ.place) autoFit();
  })().catch(() => {});
  $('#mDone').onclick = () => {
    MAPQ.done = MAPQ.done === false; const on = MAPQ.done !== false;
    if(on) doneLayer.addTo(m); else m.removeLayer(doneLayer);
    $('#mDone').classList.toggle('on', on); $('#mDone').setAttribute('aria-pressed', on);
  };
  $('#mTasks').onclick = () => {
    MAPQ.tasks = MAPQ.tasks === false; const on = MAPQ.tasks !== false;
    if(on) taskLayer.addTo(m); else m.removeLayer(taskLayer);
    $('#mTasks').classList.toggle('on', on); $('#mTasks').setAttribute('aria-pressed', on);
    if(on && taskBounds && !MAPQ.place) fit(m, taskBounds, 60);
  };
  const refit = () => { if(MAPQ.place){ fitted = true; m.fitBounds(L.latLng(MAPQ.place.lat, MAPQ.place.lng).toBounds(MAPQ.km * 2000), { padding:[20, 20], animate:false }); } };
  const radRow = () => {
    const r = $('#radRow'); if(!r) return; r.classList.toggle('hidden', !MAPQ.place);
    r.innerHTML = MAPQ.place ? `<b class="rad-city">${esc(MAPQ.place.name)}</b>` + [10, 25, 50, 100].map(k => `<button class="chip ${k === MAPQ.km ? 'on' : ''}" data-k="${k}">${k} km</button>`).join('') + `<button class="chip" id="radX" aria-label="clear">×</button>` : '';
    r.querySelectorAll('[data-k]').forEach(bn => bn.onclick = () => { MAPQ.km = +bn.dataset.k; refit(); tickFn(); });
    const x = $('#radX'); if(x) x.onclick = () => { MAPQ.place = null; $('#mapQ').value = ''; fitted = false; tickFn(); };
  };
  const tick = async () => {
    try{ await Promise.all([loadWorkers(), loadLive()]); lastOk = Date.now(); }
    catch{ const u = $('#liveUpd'); if(u){ u.textContent = t('staleData', { x:lastOk ? new Date(lastOk).toLocaleTimeString(loc(), { hour:'2-digit', minute:'2-digit' }) : '—' }); u.classList.add('danger-text'); } return; }
    { const u = $('#liveUpd'); if(u) u.classList.remove('danger-text'); }
    const live = A.workers.filter(isLive);
    // where to draw a worker: live = real position; otherwise the recent position (kept 12 h after work) or the home city
    // from the profile (the GPS position itself is not kept longer, see purge_old_data)
    const home = w => (w.cities || []).find(c => c && c.lat != null && c.lng != null);
    const posOf = new Map(), perCity = new Map();
    for(const w of A.workers){
      // after Feierabend everybody goes back to the home city from the profile
      if(isLive(w) && w.last_lat != null){ posOf.set(w.id, { p:[w.last_lat, w.last_lng], city:null }); continue; }
      const c = home(w);
      if(!c){ if(w.last_lat != null) posOf.set(w.id, { p:[w.last_lat, w.last_lng], city:null }); continue; }
      const k = c.lat.toFixed(2) + ',' + c.lng.toFixed(2); perCity.set(k, [...(perCity.get(k) || []), w]);
      posOf.set(w.id, { p:[c.lat, c.lng], city:c.name, key:k });
    }
    const known = A.workers.filter(w => posOf.has(w.id));
    layer.clearLayers(); const b = L.latLngBounds([]);
    const pl = MAPQ.place;
    if(pl){
      L.circle([pl.lat, pl.lng], { radius:MAPQ.km * 1000, color:'#2563EB', weight:2, fillColor:'#2563EB', fillOpacity:.06, interactive:false }).addTo(layer);
      L.circleMarker([pl.lat, pl.lng], { radius:6, color:'#fff', weight:3, fillColor:'#2563EB', fillOpacity:1, interactive:false }).addTo(layer);
    }
    // worker markers are clustered by distance on screen: zoomed out they merge into one marker with the number, zooming in splits them
    wItems = known.map(w => ({ w, on:isLive(w), ...posOf.get(w.id) }));
    for(const it of wItems){
      b.extend(it.p);
      if(it.on){ navTarget(layer, it.w, '#7C3AED', it.w.name); todayTrack(it.w.id).then(pts => { if(pts.length > 1) L.polyline(pts.map(q => [q.lat, q.lng]), { color:css('--route'), weight:4, opacity:.85 }).addTo(layer); }).catch(() => {}); }
    }
    drawWorkers();
    if(!$('#liveCount')) return;
    radRow();
    $('#liveUpd').textContent = t('updated', { x:t('justNow') });
    if(pl){
      // workers near the searched city: by last known position or by home city
      const near = A.workers.map(w => {
        const dLast = w.last_lat != null ? hav(pl.lat, pl.lng, w.last_lat, w.last_lng) / 1000 : Infinity, dh = distTo(w, pl.lat, pl.lng);
        return dLast <= dh.km ? { w, km:dLast, why:'' } : { w, km:dh.km, why:dh.city ? t('livesIn', { c:dh.city.name }) : '' };
      }).filter(x => x.km <= MAPQ.km).sort((a, c) => a.km - c.km);
      $('#liveCount').textContent = near.length ? t('nearN', { n:near.length, c:pl.name }) : t('nearNone', { k:MAPQ.km, c:pl.name });
      $('#liveList').innerHTML = near.map(({ w, km, why }) => `<button class="live-chip" data-id="${w.id}"><span class="dotc ${isLive(w) ? pace(w).cls : 'pause'}"></span>${esc(w.name)} · ${Math.round(km)} km${why ? ' · ' + esc(why) : ''}</button>`).join('');
      document.querySelectorAll('.live-chip[data-id]').forEach(c => c.onclick = () => viewWorker(c.dataset.id, viewLive));
      if($('#chipAll')) $('#chipAll').onclick = () => { MAPQ.allChips = !MAPQ.allChips; tickFn(); };
    } else {
      const off = known.length - live.length;
      $('#liveCount').textContent = (live.length ? t('liveNow', { n:live.length }) : t('nobodyLive')) + (off ? ' · ' + t('offlineN', { n:off }) : '');
      const shownW = MAPQ.allChips ? known : known.filter(isLive);
      $('#liveList').innerHTML = (shownW.length ? '' : `<span class="small muted">${esc(t('nobodyLiveHint'))}</span>`) + (known.length > shownW.length || MAPQ.allChips ? `<button class="live-chip more" id="chipAll">${esc(MAPQ.allChips ? t('chipsLess') : t('chipsAll', { n:known.length }))}</button>` : '') + shownW.map(w => { const c = posOf.get(w.id).city; return `<button class="live-chip" data-id="${w.id}"><span class="dotc ${isLive(w) ? pace(w).cls : 'pause'}"></span>${esc(w.name)}${isLive(w) ? (pace(w).label ? ' · ' + esc(pace(w).label) : '') : ' · ' + esc(c ? t('livesIn', { c }) : ago(w.last_seen))}</button>`; }).join('');
      document.querySelectorAll('.live-chip').forEach(c => c.onclick = () => viewWorker(c.dataset.id, viewLive));
    }
    lastWB = b;
    if(!fitted){ if(pl) refit(); else autoFit(); }
  };
  tickFn = tick; radRow();
  tick(); every(A.demo ? 3000 : 6000, tick);
}

/* ---------- MITARBEITER: admin profile + team ---------- */
/* ---------- working days (routes): shared by the Mitarbeiter list and the worker page ---------- */
const dayKey = r => new Date(r.started_at).toLocaleDateString('sv-SE');   // local YYYY-MM-DD
// net working time: start to end minus breaks, plus a correction by the admin (adj_s; the GPS times stay as recorded)
// a pause counts in full hours only (1:15 → 1 h, 0:40 → 0): the rest is working time
// pause of a day: under an hour it counts exactly, from an hour on in full hours (1:15 → 1 h)
const pauseFull = sec => (sec || 0) < 3600 ? Math.round((sec || 0) / 60) : Math.floor(sec / 3600) * 60;   // minutes
const rawMin = r => ((r.ended_at ? new Date(r.ended_at) : Date.now()) - new Date(r.started_at)) / 60000 + (r.adj_s || 0) / 60;
const workMin = r => r._min != null ? r._min : Math.max(0, rawMin(r) - pauseFull(r.break_s));
// several sessions of one person on one day (Feierabend + start again, app restarted …) are one working day:
// one line, one map, distances and times added up. id = first session (newest first lists stay newest first).
function mergeDays(routes){
  const groups = new Map();
  for(const r of routes || []){
    const k = r.worker_id + '|' + dayKey(r); let g = groups.get(k);
    if(!g){ g = { ...r, ids:[], _routes:[], distance_m:0, break_s:0, _min:0, _raw:0 }; groups.set(k, g); }
    g.ids.push(r.id); g._routes.push(r); g.distance_m += r.distance_m || 0; g.break_s += r.break_s || 0; g._raw += rawMin(r); g._min = Math.max(0, g._raw - pauseFull(g.break_s));
    if(new Date(r.started_at) < new Date(g.started_at)) g.started_at = r.started_at;
    if(!r.ended_at) g.ended_at = null; else if(g.ended_at && new Date(r.ended_at) > new Date(g.ended_at)) g.ended_at = r.ended_at;
    if(!g.place && r.place) g.place = r.place; if(!g.plan_id && r.plan_id) g.plan_id = r.plan_id;
    if(r.track_deleted_at == null) g.track_deleted_at = null;
  }
  const out = [...groups.values()]; (A.dayGroups = A.dayGroups || new Map()); out.forEach(g => A.dayGroups.set(g.id, g));
  return out;
}
const todayTrack = async wid => {
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const { data } = await sb.from('routes').select('id').eq('worker_id', wid).gte('started_at', d0.toISOString());
  return dayPoints({ ids:(data || []).map(r => r.id) });
};
const dayPoints = async g => { const lists = await Promise.all((g.ids || [g.id]).map(id => fetchPoints(id).catch(() => []))); return lists.flat().sort((a, b) => new Date(a.t) - new Date(b.t)); };
const placeTxt = r => [r.place, r.task_title].filter(Boolean).join(' · ');
const hhmm = d => new Date(d).toLocaleTimeString(loc(), { hour:'2-digit', minute:'2-digit' });
const dayFilter = () => A.dFilter || (A.dFilter = { from:'', to:'', place:'' });
const dayMatches = (r, f) => { const d = dayKey(r); return (!f.from || d >= f.from) && (!f.to || d <= f.to) && (!f.place || r.place === f.place); };
const filterOn = f => !!(f.from || f.to || f.place);
// pause of a working day in minutes (also a pause that is running right now)
const brkMin = r => pauseFull(r.break_s);
const brkTxt = min => min >= 1 ? ' · ' + t('pauseLbl') + ' ' + fmtHm(min) + ' ' + t('h') : '';
const dayLine = (r, cls) => `<button class="row-line rbtn ${cls || ''}" data-r="${r.id}" data-w="${r.worker_id}"><div class="rb-main"><b>${esc(new Date(r.started_at).toLocaleDateString(loc(), { weekday:'short', day:'2-digit', month:'2-digit', year:'2-digit' }))} · ${esc(hhmm(r.started_at))}–${esc(r.ended_at ? hhmm(r.ended_at) : t('active'))}</b><small data-place="${r.id}">${esc(placeTxt(r) || '…')}</small></div><span>${esc(fmtDist(r.distance_m || 0))} · ${esc(fmtHm(workMin(r)) + ' ' + t('h') + brkTxt(brkMin(r)))}</span></button>`;
const daysSum = list => list.length ? t(list.length === 1 ? 'daysSum1' : 'daysSum', { n:list.length, km:fmtDist(list.reduce((a, r) => a + (r.distance_m || 0), 0)), h:fmtHm(list.reduce((a, r) => a + workMin(r), 0)) }) : '';
// days without an order (or whose order was deleted): name the place from the first GPS point, once, and keep it
async function fillPlaces(list, done){
  let changed = false;
  for(const r of list.filter(x => !x.place).slice(0, 15)){
    try{
      const { data:p0 } = await sb.from('route_points').select('lat,lng').eq('route_id', r.id).order('t').limit(1);
      if(!p0 || !p0[0]) continue;
      const pl = await reversePlace(p0[0].lat, p0[0].lng); if(!pl) continue;
      r.place = pl; changed = true; sb.from('routes').update({ place:pl }).eq('id', r.id).then(() => {}, () => {});
      document.querySelectorAll(`[data-place="${r.id}"]`).forEach(el => { el.textContent = placeTxt(r); });
    }catch{}
  }
  if(changed && done) done();
}
// filter controls (date range, quick days, place)
function dayFilterHtml(f, places){
  const iso = d => d.toLocaleDateString('sv-SE'), today = new Date(), yest = new Date(Date.now() - 864e5), wk = new Date(Date.now() - 6 * 864e5);
  const quick = [['dToday', iso(today), iso(today)], ['dYesterday', iso(yest), iso(yest)], ['d7', iso(wk), iso(today)]];
  const isQuick = quick.some(([, a, z]) => f.from === a && f.to === z) || !filterOn(f), open = f.custom || !isQuick || !!f.place;
  return `<div class="seg-row" role="group">${quick.map(([k, a, z]) => `<button class="seg-b ${!f.custom && f.from === a && f.to === z && !f.place ? 'on' : ''}" data-q="${a}|${z}">${esc(t(k))}</button>`).join('')}<button class="seg-b ${!filterOn(f) && !f.custom ? 'on' : ''}" data-q="|">${esc(t('fAll'))}</button><button class="seg-b ${open ? 'on' : ''}" id="dfCustom">${ICONS.calendar}${esc(t('fRange'))}</button></div>
    ${open ? `<div class="dfilter"><div><label class="f">${esc(t('fFrom'))}</label><input class="in small" type="date" id="dfFrom" value="${esc(f.from)}"></div><div><label class="f">${esc(t('fTo'))}</label><input class="in small" type="date" id="dfTo" value="${esc(f.to)}"></div><div><label class="f">${esc(t('place'))}</label><select class="in small" id="dfPlace"><option value="">${esc(t('fAll'))}</option>${places.map(p => `<option ${p === f.place ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></div></div>` : ''}`;
}
function bindDayFilter(f, again){
  document.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { const [a, z] = b.dataset.q.split('|'); f.from = a; f.to = z; f.place = ''; f.custom = false; again(); });
  $('#dfCustom').onclick = () => { f.custom = !f.custom; if(!f.custom){ f.from = f.to = f.place = ''; } again(); };
  if($('#dfFrom')) $('#dfFrom').onchange = e => { f.from = e.target.value; f.custom = true; again(); };
  if($('#dfTo')) $('#dfTo').onchange = e => { f.to = e.target.value; f.custom = true; again(); };
  if($('#dfPlace')) $('#dfPlace').onchange = e => { f.place = e.target.value; f.custom = true; again(); };
}

async function viewPeople(){
  await loadWorkerStats();
  let place = null;
  const f = dayFilter();
  const sf = searchField('wCity', t('whoPh'), c => { place = c; render(); }, { citiesOnly:true });
  const nLive = A.workers.filter(isLive).length;
  shell('people', `${topbar(t('tabPeople'))}
    <div class="pad">
      <div class="kpis two"><div class="kpi k-info"><b>${A.workers.length}</b><span>${esc(t('kTotal'))}</span></div><div class="kpi k-ok"><b>${nLive}</b><span>${esc(t('stLive'))}</span></div></div>
      <div class="card filter-card">
        <div class="fc-grid">
          <div><label class="f" for="wQ">${esc(t('fWho'))}</label><div class="searchbox"><span class="sb-ic">${ICONS.search}</span><input id="wQ" class="sb-in" placeholder="${esc(t('searchNamePhone'))}"></div></div>
          <div><label class="f">${esc(t('whoCanGo'))}</label>${sf.html}</div>
        </div>
        <label class="f">${esc(t('workedWhen'))}</label>
        <div id="dFilter"></div>
      </div>
      <details class="filters" id="invBox" style="margin-top:16px"><summary>${ICONS.plus}${esc(t('invSection'))}</summary><div class="f-body">
      ${A.company && A.company.join_code ? `<div class="card" style="display:block;margin:0 0 4px"><b>${esc(t('inviteTitle'))}</b><p class="small muted" style="margin:4px 0 8px">${esc(t('inviteHint'))}</p>
        <div class="code-row"><input class="in small" readonly id="invLink" value="${esc(APP_LINK + '?neu=' + A.company.join_code)}" style="flex:1;min-width:0"><button class="btn ghost small" id="invCp">${esc(t('copy'))}</button></div>
        <a class="btn ghost small" style="margin-top:8px" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(t('inviteMsg', { link:APP_LINK + '?neu=' + A.company.join_code }))}">${ICONS.chat}WhatsApp</a></div>` : ''}
      <button class="btn ghost" id="wNewLink" style="margin-top:12px">${ICONS.plus}${esc(t('newLinkAcc'))}</button>
      <details class="filters" id="linkBox" style="margin-top:10px"><summary>${ICONS.users}${esc(t('allLinks'))}</summary><div class="f-body" id="linkList"><p class="muted small">${esc(t('loadingShort'))}</p></div></details>
      ${A.company && A.company.id ? `<details class="filters" id="poolBox"><summary>${ICONS.users}${esc(t('poolTitle'))}</summary><div class="f-body" id="poolList"><p class="muted small">${esc(t('loadingShort'))}</p></div></details>` : ''}
      </div></details>
      <div class="sec-row"><h2>${esc(t('workersN', { n:A.workers.length }))}</h2></div>
      <div id="wList"></div>
    </div>`);
  sf.bind();
  if($('#poolBox')) $('#poolBox').addEventListener('toggle', async () => { if($('#poolBox').open && !$('#poolBox').dataset.done){ $('#poolBox').dataset.done = 1; $('#poolList').innerHTML = await poolHtml(); } });
  let days = [];   // all working days (newest first), loaded below
  const render = () => {
    const places = [...new Set(days.map(r => r.place).filter(Boolean))].sort(); if(f.place && !places.includes(f.place)) f.place = '';
    $('#dFilter').innerHTML = dayFilterHtml(f, places); bindDayFilter(f, render);
    const on = filterOn(f), hit = on ? days.filter(r => dayMatches(r, f)) : [], byW = new Map();
    for(const r of hit){ if(!byW.has(r.worker_id)) byW.set(r.worker_id, []); byW.get(r.worker_id).push(r); }
    const q = $('#wQ').value.trim().toLowerCase();
    let list = A.workers.map(w => ({ w, ...(place ? distTo(w, place.lat, place.lng) : { km:null }) }));
    if(on) list = list.filter(x => byW.has(x.w.id));
    if(place) list = list.filter(x => x.km <= zoneKm(x.w)).sort((a, b) => a.km - b.km);
    if(q) list = list.filter(x => (x.w.name + ' ' + x.w.phone).toLowerCase().includes(q));
    const shown = on ? list.flatMap(x => byW.get(x.w.id)) : [];
    $('#wList').innerHTML = (on ? `<div class="hint">${esc(shown.length ? t('workedSum', { w:list.length, d:daysSum(shown) }) : t('noDaysRange'))}</div>` : '') +
      (place ? `<div class="hint">${esc(t('canReach', { n:list.length, city:place.name }))} <button class="link" id="wClr">${esc(t('reset'))}</button></div>` : '') +
      (list.length ? list.map(({ w, km }) => `<div class="card worker-card"><button class="wc-main" data-id="${w.id}">${avatar(w.name, isLive(w) ? 'live' : '')}
        <div class="grow"><b>${esc(w.name)} ${okBadge(w.id)}</b>${shortLine(w.id) ? `<span>${esc(shortLine(w.id))}</span>` : ''}<span>${coName(w.company_id) ? esc(coName(w.company_id)) + ' · ' : ''}${esc((w.cities || []).map(c => c.name).join(', '))}${km != null ? ' · ' + Math.round(km) + ' km' : ''} · ${esc(t('zoneChip', { n:w.zone_minutes }))}</span><span>${isLive(w) ? statusPill('live', t('stLive')) : esc(t('lastActive', { a:ago(w.last_seen) }))}</span></div>${ICONS.chevron}</button>
        ${on ? `<div class="wc-days">${byW.get(w.id).map(r => dayLine(r)).join('')}</div>` : ''}
        <div class="wc-act"><a class="btn ghost small" href="${telLink(w.phone)}">${ICONS.phone}${esc(t('call'))}</a><a class="btn ghost small" target="_blank" rel="noopener" href="${waLink(w.phone)}">${ICONS.chat}WhatsApp</a></div></div>`).join('')
       : on ? '' : emptyState(A.workers.length ? t('notFound') : t('noWorkers'), A.workers.length ? 'search' : 'users'));
    const clr = $('#wClr'); if(clr) clr.onclick = () => { place = null; $('#wCity').value = ''; render(); };
    document.querySelectorAll('.wc-main').forEach(b => b.onclick = () => viewWorker(b.dataset.id));
    document.querySelectorAll('.wc-days .rbtn').forEach(b => b.onclick = () => viewDayMap(b.dataset.r, viewPeople));
  };
  $('#wQ').oninput = render; render();
  sb.from('routes').select('id,worker_id,task_id,plan_id,started_at,ended_at,distance_m,break_s,adj_s,place,task_title').order('started_at', { ascending:false }).limit(2000)
    .then(({ data }) => { if(!document.getElementById('dFilter')) return; days = mergeDays(data || []); render(); fillPlaces(days, () => { if(document.getElementById('dFilter')) render(); }); });
}

/* ---------- EINSTELLUNGEN: firm, own account, language, legal ---------- */
function viewSettings(){
  shell('settings', `${topbar(t('tabSettings'))}
    <div class="pad">
      ${A.company && A.company.master ? `<button class="btn ghost small" id="tMaster" style="margin-top:8px;width:auto">${ICONS.users}${esc(t('master'))}</button>` : ''}
      ${A.company && A.company.id ? firmCardHtml(A.company) : ''}
      ${A.company && A.company.id ? adminContractHtml() : ''}
      <h2 class="sec">${esc(t('accountSettings'))}</h2>
      <div class="card" style="display:block">
        <div class="person-row" style="padding-top:0">${avatar()}<div><b>${esc(A.user?.phone ? '+' + A.user.phone.replace(/^\+/, '') : (A.user?.email || ''))}</b><span>${esc(t('admin'))}</span></div></div>
        ${A.user?.email ? `<button class="btn ghost small" id="aPw" style="margin:0 0 12px">${ICONS.edit}${esc(t('pwChange'))}</button>` : ''}
        ${themeSwitch(A.theme)}
        ${langSwitch(I.lang, true)}
        <div class="tool-row" style="margin-top:16px"><button class="btn ghost small" id="tInv">${ICONS.users}${esc(t('inviteAdmin'))}</button><button class="btn ghost small" id="tWork">${ICONS.route}${esc(t('switchToWorker'))}</button><button class="btn ghost small" id="tDemo">${esc(t('demo'))}</button></div>
        <button class="btn ghost danger-text" id="tOut" style="margin-top:8px">${esc(t('logout'))}</button>
      </div>
      ${legalLinks()}
    </div>`);
  store.get('theme').then(v => { A.theme = v; document.querySelectorAll('[data-theme-set]').forEach(b => { const on = b.dataset.themeSet === (v || 'system'); b.classList.toggle('on', on); b.setAttribute('aria-checked', on); }); });
  bindLegal(viewSettings);
  if(A.company && A.company.id) bindAdminContract();
  if(A.company && A.company.id) bindFirmCard(A.company, c => { A.company = { ...c, master:A.company.master }; viewSettings(); });
  if($('#tMaster')) $('#tMaster').onclick = () => viewMaster(viewSettings);
  if(A.focusFirm){ A.focusFirm = false; const fc = $('#firmCard'); if(fc) fc.scrollIntoView({ block:'center' }); }
  $('#tOut').onclick = adminLogout;
  $('#tWork').onclick = openAsWorker;
  $('#tInv').onclick = () => {
    const mo = modal(`<h2>${esc(t('inviteAdmin'))}</h2><label class="f">${esc(t('invitePhone'))}</label><input class="in" id="invE" type="tel" placeholder="+49 170 1234567"><button class="btn primary" id="invB" style="margin-top:12px">${esc(t('inviteAdmin'))}</button><div class="err" id="invErr"></div>`);
    mo.querySelector('#invB').onclick = async () => { const ph = deMobile(mo.querySelector('#invE').value); if(!ph){ mo.querySelector('#invErr').textContent = t('badPhone'); return; } const { error } = await sb.from('admin_phone_invites').upsert({ phone:ph }); if(error) mo.querySelector('#invErr').textContent = error.message; else { mo.remove(); toast(t('invitePhoneSent')); } };
  };
  $('#tDemo').onclick = demoSheet;
}

async function viewWorker(id, back, focusId){
  await loadWorkerStats();
  back = back || viewPeople;
  const w = wById(id); if(!w) return back();
  const { data:routes } = await sb.from('routes').select('*').eq('worker_id', id).order('started_at', { ascending:false }).limit(300);
  const all = mergeDays(routes || []), f = dayFilter();
  let useFilter = filterOn(f);
  shell('people', `${topbar(w.name, true)}
    <div class="pad">
      <div class="person-row big">${avatar(w.name, isLive(w) ? 'live' : '')}<div><b>${esc(w.name)}</b><span>${esc(w.phone)} · ${esc(t('lastActive', { a:ago(w.last_seen) }))}</span></div></div>
      <div class="tool-row"><a class="btn primary small" href="${telLink(w.phone)}">${ICONS.phone}${esc(t('call'))}</a><a class="btn ghost small" target="_blank" rel="noopener" href="${waLink(w.phone)}">${ICONS.chat}WhatsApp</a></div>
      <div class="chips">${(w.cities || []).map(c => `<span class="chip">${esc(c.name)}</span>`).join('')}</div>
      ${workerStatsHtml(w.id)}
      <h2 class="sec">${esc(t('workDays'))}</h2>
      <div id="wDaysSum" class="muted small" style="margin:0 0 2px"></div>
      <div id="wMap" class="wmap"></div>
      <div class="rinfo-row"><div id="wRouteInfo" class="muted small"></div><button class="btn ghost small" id="wBig" hidden>${ICONS.expand}${esc(t('rvBig'))}</button></div>
      <div id="wDays"></div>
      <h2 class="sec">${esc(t('settings'))}</h2>
      <div class="card set-card">
        <div class="set-grid">
          <div><label class="f" for="wzm">${esc(t('zoneLabel'))}</label><select class="in" id="wzm">${[30, 45, 60, 75, 90, 120].map(m => `<option value="${m}" ${m === w.zone_minutes ? 'selected' : ''}>${m < 60 ? m + ' ' + t('min') : (m/60).toString().replace('.', ',') + ' ' + t('h')} (~${Math.round(m * KM_PER_MIN_TRANSIT)} km)</option>`).join('')}</select></div>
          <div><label class="f" for="wnotes">${esc(t('notes'))}</label><textarea class="in" id="wnotes" rows="2">${esc(w.notes || '')}</textarea></div>
        </div>
        <label class="switch-row"><input type="checkbox" id="wany" ${w.start_anywhere ? 'checked' : ''}><span class="sw" aria-hidden="true"></span><span>${esc(t('startAnywhere'))}</span></label>
        <div class="set-actions"><button class="btn ghost danger-text" id="wdel">${esc(t('del'))}</button><button class="btn primary" id="wsave">${esc(t('save'))}</button></div>
      </div>
${/^\+490000/.test(w.phone || '') && !/^\+4900000000/.test(w.phone || '') ? `<div id="wLink" class="card" style="display:block;margin-top:16px"><label class="f" style="margin-top:0">${esc(t('loginLink'))}</label><p class="small muted">${esc(t('loadingShort'))}</p></div>` : ''}

    </div>`); setLoc('worker/' + id);
  bindBack(back); bindWorkerStats(w.id, () => viewWorker(id, back, focusId));
  const wm = makeMap($('#wMap'), (w.last_lat != null) ? [w.last_lat, w.last_lng] : null, 14), wl = L.layerGroup().addTo(wm);
  let curDay = null;
  const showRoute = async r => {
    curDay = r; const bg = $('#wBig'); if(bg){ bg.hidden = false; bg.onclick = () => viewDayMap(r.id, () => viewWorker(id, back, r.id)); }
    document.querySelectorAll('.rbtn').forEach(x => x.classList.toggle('sel', x.dataset.r === r.id));
    wl.clearLayers(); const b = L.latLngBounds([]);
    try{
      if(r.plan_id){ const { data:pl } = await sb.from('task_plans').select('path,color').eq('id', r.plan_id).maybeSingle(); if(pl && pl.path && pl.path.length > 1){ L.polyline(Planner.pathRuns(pl.path), { color:'#64748B', weight:4, opacity:.55, dashArray:'2 8', lineCap:'round' }).addTo(wl); pl.path.forEach(p => b.extend(p)); } }
      const pts = r.track_deleted_at ? [] : await dayPoints(r);
      if(pts.length > 1){
        const ll = pts.map(p => [p.lat, p.lng]), sp = Planner.walkRuns(pts); sp.walk.forEach(a => { if(a.length > 1) gpsLine(wl, a, 4); }); sp.drive.forEach(a => driveLine(wl, a, 4)); ll.forEach(p => b.extend(p));
        L.marker(ll[0], { icon:dot('start-dot', 16) }).addTo(wl);
        if(r.ended_at) L.marker(ll[ll.length - 1], { icon:dot('end-dot', 16) }).addTo(wl); else L.marker(ll[ll.length - 1], { icon:personIcon(w.name, true, '') }).addTo(wl);
      }
    }catch{}
    $('#wRouteInfo').textContent = [fmtDT(r.started_at), placeTxt(r), fmtDist(r.distance_m || 0), r.track_deleted_at ? t('trackDeleted') : ''].filter(Boolean).join(' · ');
    try{ if(b.isValid()) wm.fitBounds(b, { paddingTopLeft:[30, 70], paddingBottomRight:[30, 30], maxZoom:17, animate:false }); }catch{}
  };
  // working days: the ones of the filter chosen on the Mitarbeiter page (or all); each line says when and where
  const renderDays = () => {
    const list = useFilter ? all.filter(r => dayMatches(r, f)) : all;
    $('#wDaysSum').innerHTML = esc(daysSum(list)) + (useFilter ? ` · ${esc(t('filtered'))} <button class="link" id="wAll">${esc(t('showAllDays'))}</button>` : '');
    $('#wDays').innerHTML = list.map(r => dayLine(r)).join('') || `<p class="muted small">${esc(t(all.length ? 'noDaysRange' : 'noDays'))}</p>`;
    document.querySelectorAll('#wDays .rbtn').forEach(b => b.onclick = () => { const r = all.find(x => x.id === b.dataset.r); if(r){ showRoute(r); wm.getContainer().scrollIntoView({ behavior:'smooth', block:'center' }); } });
    const wa = $('#wAll'); if(wa) wa.onclick = () => { useFilter = false; renderDays(); };
    return list;
  };
  const list0 = renderDays(), first = (focusId && all.find(r => r.id === focusId)) || list0[0];
  if(first) showRoute(first);
  else { $('#wMap').hidden = true; const c = (w.cities || []).find(x => x.lat != null); if(c) wm.setView([c.lat, c.lng], 12); }
  fillPlaces(all, () => { if(document.getElementById('wDays')) renderDays(); });
  if($('#wLink')) sb.from('workers').select('token').eq('id', id).single().then(({ data }) => {
    const box = $('#wLink'); if(!box || !data || !data.token) return; const link = APP_LINK + '?konto=' + data.token;
    box.innerHTML = `<label class="f" style="margin-top:0">${esc(t('loginLink'))}</label><p class="small muted">${esc(t('loginLinkHint'))}</p><div class="code-row"><input class="in small" readonly value="${esc(link)}" style="flex:1;min-width:0"><button class="btn ghost small" id="wlCopy">${esc(t('copy'))}</button><a class="btn ghost small" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(link)}">${ICONS.chat}WhatsApp</a></div>`;
    $('#wlCopy').onclick = async () => { try{ await navigator.clipboard.writeText(link); toast(t('copied')); }catch{ toast(link); } };
  });
  $('#wsave').onclick = async () => { const { error } = await sb.from('workers').update({ zone_minutes:+$('#wzm').value, notes:$('#wnotes').value.trim() || null, ...($('#wany') ? { start_anywhere:$('#wany').checked } : {}) }).eq('id', id); if(!error){ await loadWorkers(); toast(t('saved')); } };
  $('#wdel').onclick = async () => { if(!await confirmBox(t('del'), t('delWorkerQ', { name:w.name }), t('del'), true)) return; await sb.from('workers').delete().eq('id', id); await loadWorkers(); back(); };
}

/* ---------- big map views (also for screenshots for clients) ---------- */
// pieces of the tracks away from every planned route (> 30 m): walked streets outside the plan, drawn green like done ones
function offRoute(tracks, plans){
  const cell = 0.0004, grid = new Map(), key = (a, b) => Math.floor(a / cell) + ':' + Math.floor(b / cell);
  for(const p of plans || []) if(p.path && p.path.length > 1) for(const q of Planner.densifyPath(p.path, 10)){ const k = key(q[0], q[1]); let l = grid.get(k); if(!l) grid.set(k, l = []); l.push(q); }
  const near = (la, lo) => { const cy = Math.floor(la / cell), cx = Math.floor(lo / cell);
    for(let dy = -1; dy <= 1; dy++) for(let dx = -1; dx <= 1; dx++){ const l = grid.get((cy + dy) + ':' + (cx + dx)); if(l && l.some(q => hav(la, lo, q[0], q[1]) <= 30)) return true; }
    return false; };
  const out = [];
  for(const ll of tracks || []){
    let cur = [];
    for(let i = 0; i < ll.length; i++){
      const off = !near(ll[i][0], ll[i][1]), jump = i && hav(ll[i - 1][0], ll[i - 1][1], ll[i][0], ll[i][1]) > 150;
      if(!off || jump){ if(cur.length > 2) out.push(cur); cur = []; }
      if(off) cur.push(ll[i]);
    }
    if(cur.length > 2) out.push(cur);
  }
  return out;
}
// mailboxes along a walked track from the own map squares – also outside the planned route (the walker left the area or did
// streets of a colleague). Houses within 25 m of the track; jumps (no GPS for > 150 m) count nothing in between.
async function boxesAlong(tracks, exclude){
  tracks = (tracks || []).filter(x => x && x.length > 1); if(!tracks.length || typeof fetch === 'undefined') return null;
  const keys = new Set(); for(const ll of tracks) for(let i = 0; i < ll.length; i += 5) for(const k of Planner.tilesFor(ll[i], 60)) keys.add(k);
  if(keys.size > 120) return null;
  setStampClient(sb); await tileStamp();
  const tiles = await Promise.all([...keys].map(k => Planner.fetchOwnTile(Planner.TILES_URL, k, fetch).catch(() => null)));
  if(tiles.some(x => !x)) return null;   // a square missing (outside Germany / offline): no number rather than a wrong one
  // exclude = mailboxes of the planned routes (they are counted there already); a house matches within ~8 m
  const ex = new Set(), key = (la, lo) => Math.round(la * 9000) + ':' + Math.round(lo * 6000);
  for(const b of exclude || []) for(let a = -1; a <= 1; a++) for(const c of [-1, 0, 1]) ex.add((Math.round(b[0] * 9000) + a) + ':' + (Math.round(b[1] * 6000) + c));
  const seen = new Map(); for(const tl of tiles) for(const b of tl.b || []) if(b[3] > 0 && !ex.has(key(b[1], b[2]))) seen.set(b[1] + ',' + b[2], [b[1], b[2], b[3]]);
  const ct = Planner.makeBoxCounter([...seen.values()], 25);
  for(const ll of tracks) for(let i = 1; i < ll.length; i++){
    const a = ll[i - 1], b = ll[i], d = hav(a[0], a[1], b[0], b[1]); if(d > 150){ ct.visit(b[0], b[1]); continue; }
    const n = Math.max(1, Math.ceil(d / 10)); for(let k = 0; k <= n; k++) ct.visit(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n);
  }
  return ct.count();
}
// pieces a distributor marked as not needed: grey, dashed (pieces the admin closed are only counted as done, not drawn)
// parts of a route the admin closed as done: their mailboxes count as delivered (worker skips – dangerous, no access – do not)
const adminDone = p => (p.skipped || []).filter(x => x && /^Admin/.test(x.by || '') && Array.isArray(x.pts)).map(x => x.pts);
const byWorker = x => x && !/^Admin/.test(x.by || '');
const workerSkips = p => ((p && p.skipped) || []).filter(byWorker);
const drawSkips = (g, plans) => (plans || []).forEach(p => workerSkips(p).forEach(x => { if(x && x.pts && x.pts.length > 1) L.polyline(x.pts, { color:'#6B7280', weight:7, opacity:.85, dashArray:'3 9', lineCap:'round' }).bindTooltip(t('rvSkipped') + (x.by ? ' · ' + x.by : '') + (x.why ? ' · „' + x.why + '“' : '') + (x.at ? ' · ' + fmtDT(x.at) : '')).addTo(g); }));
// GPS track: its own colour (yellow with a dark edge) so it never looks like a planned route
const GPS = '#FACC15';
const splitJumps = ll => { const out = []; let cur = []; for(let i = 0; i < ll.length; i++){ if(i && hav(ll[i - 1][0], ll[i - 1][1], ll[i][0], ll[i][1]) > 150){ if(cur.length > 1) out.push(cur); cur = []; } cur.push(ll[i]); } if(cur.length > 1) out.push(cur); return out; };
const DRIVE_C = () => css('--color-drive') || '#7C3AED';   // driving (> 14 km/h): violet, dashed (token)
const driveLine = (g, ll, w = 3) => ll.length > 1 ? L.polyline(ll, { color:DRIVE_C(), weight:w, opacity:.95, dashArray:'8 6', lineJoin:'round' }).bindTooltip(t('driveTip', { km:fmtDist(ll.reduce((x, q, k) => x + (k ? hav(ll[k-1][0], ll[k-1][1], q[0], q[1]) : 0), 0)) }), { sticky:true }).addTo(g) : null;
const gpsLine = (g, ll, w = 3) => { const parts = splitJumps(ll); if(!parts.length) return null; L.polyline(parts, { color:'#111827', weight:w + 3, opacity:.45, lineJoin:'round' }).addTo(g); return L.polyline(parts, { color:GPS, weight:w, opacity:1, lineJoin:'round' }).addTo(g); };
// colour of a planned working day: day 1 = route colour, day 2 = a clearly different partner colour, day 3+ = hue turned further
const DAY2 = { '#2563EB':'#06B6D4', '#C2185B':'#F97316', '#D97706':'#78350F', '#7C3AED':'#E11D48', '#059669':'#0EA5E9', '#0891B2':'#9333EA', '#DC2626':'#0D9488', '#4D7C0F':'#6D28D9', '#DB2777':'#0284C7', '#EA580C':'#4F46E5' };
function hueShift(hex, deg){
  const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let h = 0, s = 0;
  if(d){ s = d / (1 - Math.abs(2 * l - 1)); h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
  h = (h + deg + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const [a, bb, cc] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [a, bb, cc].map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}
export const dayColor = (c, k) => { c = String(c || '#2563EB').toUpperCase(); return !k ? c : k === 1 ? (DAY2[c] || hueShift(c, 150)) : ['#7C3AED', '#78350F', '#0F766E', '#BE185D'][(k - 2) % 4]; };
const nameOf = id => (wById(id) || {}).name || '—';
// one working day of one worker: walked GPS track, planned route, the planned streets covered that day
async function viewDayMap(routeId, back){
  let r = A.dayGroups && A.dayGroups.get(routeId);
  if(!r){ const { data } = await sb.from('routes').select('*').eq('id', routeId).maybeSingle(); if(!data) return back(); r = data; }
  const ids = new Set(r.ids || [r.id]);
  const [pl, pts, prev] = await Promise.all([
    r.plan_id ? sb.from('task_plans').select('*').eq('id', r.plan_id).maybeSingle().then(x => x.data) : null,
    r.track_deleted_at ? [] : dayPoints(r),
    // the days before on the same route: what was already done then (lighter green) and for the checkpoints
    r.plan_id && r.task_id ? sb.from('routes').select('id,track_deleted_at').eq('task_id', r.task_id).lt('started_at', r.ended_at || new Date().toISOString()).then(async ({ data }) =>
      Promise.all((data || []).filter(x => !ids.has(x.id) && !x.track_deleted_at).map(x => fetchPoints(x.id).then(a => Planner.walkRuns(a).walk).catch(() => []))).then(x => x.flat())) : [],
  ]);
  const ll = pts.map(p => [p.lat, p.lng]), col = (pl && pl.color) || '#2563EB', sp = Planner.walkRuns(pts), wr = sp.walk;
  let pct = null, fl = null, runs = [], runsPrev = [], cps = [], pctAll = null;
  if(pl && pl.path && pl.path.length > 1){
    const tr = Planner.makeTracker(pl.path), trAll = addSkips(Planner.makeTracker(pl.path), pl), trPrev = Planner.makeTracker(pl.path);
    if(ll.length > 1){ wr.forEach(a => { tr.addTrack(a); trAll.addTrack(a); }); runs = tr.runs(); pct = tr.pct(); }
    (prev || []).forEach(a => { if(a.length > 1){ trPrev.addTrack(a); trAll.addTrack(a); } });
    runsPrev = trPrev.runs();
    if((prev || []).some(a => a.length > 1)) pctAll = trAll.pct();
    cps = checkpoints(pl, i => trAll.isDone(i));
    if(pl.boxes && pl.boxes.length && ll.length > 1){ const ct = Planner.makeBoxCounter(pl.boxes); wr.forEach(a => ct.visitAll(a)); fl = ct.count(); }
  }
  // every house along the track counts (also outside the route); the planned boxes only when the map squares are not available
  const d0 = new Date(r.started_at);
  const dm = openMapView({
    title:nameOf(r.worker_id), anonTitle:t('rvDistributor'), hasNames:true,
    lines:[d0.toLocaleDateString(loc(), { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' }) + ' · ' + hhmm(r.started_at) + '–' + (r.ended_at ? hhmm(r.ended_at) : t('active')), placeTxt(r)],
    get stats(){ return [[t('rvDist'), fmtDist(r.distance_m || 0)], [t('rvWork'), fmtHm(workMin(r)) + ' ' + t('h')], brkMin(r) >= 1 ? [t('pauseLbl'), fmtHm(brkMin(r)) + ' ' + t('h')] : null, fl != null ? [t('rvFlyers'), '≈ ' + fmtN(fl)] : null, pct != null ? [t('rvDayShare'), pct + ' %'] : null, pctAll != null ? [t('rvDayShare2'), pctAll + ' %'] : null]; },
    note:r.track_deleted_at ? t('trackDeleted') : (ll.length < 2 ? t('rvNoTrack') : ''),
    layers:[
      { key:'plan', label:pl ? t('rvPlan') : '', on:!!pl, add:g => { if(!pl || !pl.path || pl.path.length < 2) return;
        const ds = (pl.days || []).length > 1 ? pl.days : [{ i0:0, i1:pl.path.length - 1 }];
        ds.forEach((d, k) => L.polyline(Planner.pathRuns(pl.path.slice(d.i0, d.i1 + 1)), { color:dayColor(col, k), weight:4, opacity:.6, dashArray:'6 7', lineJoin:'round' }).addTo(g)); } },
      // one layer: everything done on this route – this day, earlier days and colleagues alike
      { key:'done', label:runs.length || runsPrev.length ? t('rvDone') : '', add:g => [...runsPrev, ...runs, ...(pl ? offRoute(wr, [pl]) : [])].forEach(x => L.polyline(x, { color:GREEN_C(), weight:8, opacity:.9, lineJoin:'round', lineCap:'round' }).addTo(g)) },
      { key:'skip', label:workerSkips(pl).length ? t('rvSkipped') : '', add:g => drawSkips(g, [pl]) },
      { key:'cp', label:cps.length ? t('checkpoints') : '', add:g => cps.forEach(c => cpAdmin(c, dayColor(col, c.day), (pl.days || []).length > 1, pl, () => viewDayMap(routeId, back)).addTo(g)) },
      { key:'gps', label:ll.length > 1 ? t('rvGps') : '', add:g => {
        if(ll.length < 2) return;
        wr.forEach(a => { if(a.length > 1) gpsLine(g, a); }); sp.drive.forEach(a => driveLine(g, a));
        L.marker(ll[0], { icon:dot('start-dot', 16) }).addTo(g); L.marker(ll[ll.length - 1], { icon:dot(r.ended_at ? 'end-dot' : 'me-dot', r.ended_at ? 16 : 20) }).addTo(g);
      } },
    ],
    back,
  });
  boxesAlong(wr).then(n => { if(n != null){ fl = n; if(dm.rvRefresh) dm.rvRefresh(); } }).catch(() => {});
}
// where the guidance of a walker leads right now: dashed line from the walker to a target ring (fresh = the last 15 min)
function navTarget(g, w, color, label){
  if(!w || w.nav_lat == null || !w.nav_at || w.last_lat == null || Date.now() - new Date(w.nav_at).getTime() > 15 * 60e3) return;
  L.polyline([[w.last_lat, w.last_lng], [w.nav_lat, w.nav_lng]], { color, weight:3, opacity:.9, dashArray:'2 8', lineCap:'round', interactive:false }).addTo(g);
  L.marker([w.nav_lat, w.nav_lng], { zIndexOffset:1500, keyboard:false, title:t('navTarget') + (label ? ' · ' + label : ''),
    icon:L.divIcon({ className:'', iconSize:[22, 22], iconAnchor:[11, 11], html:`<div class="nav-tgt" style="--c:${esc(color)}"></div>` }) }).bindTooltip(t('navTarget') + (label ? ' · ' + label : '') + ' · ' + ago(w.nav_at)).addTo(g);
}
// where the people of an order are right now: a dot in their route colour with name and time of the last GPS fix.
// Pulsing = recording right now and the fix is fresh; grey = older position (they finished, paused or lost the signal).
// Refreshed every 15 s while the map is open. showNames(): false when the admin has hidden names (for screenshots).
function liveWorkers(g, tk, plans, showNames){
  const draw = () => {
    g.clearLayers();
    (plans || []).forEach(p => {
      const w = p.worker_id && wById(p.worker_id); if(!w || w.last_lat == null || !w.last_seen) return;
      const age = Date.now() - new Date(w.last_seen).getTime(); if(age > 12 * 36e5) return;
      const run = (A.live || []).find(r => r.worker_id === w.id && (r.task_id === tk.id || r.plan_id === p.id)), fresh = run && !run.paused_at && age < 3 * 60e3;
      const label = (showNames() ? w.name : t('planRoute', { n:p.idx + 1 })) + ' · ' + (run && run.paused_at ? t('onPause') : ago(w.last_seen));
      L.marker([w.last_lat, w.last_lng], { zIndexOffset:2000, keyboard:false, icon:L.divIcon({ className:'', iconSize:[22, 22], iconAnchor:[11, 11],
        html:`<div class="live-pin ${fresh ? 'on' : 'old'}" style="--c:${esc(p.color || '#2563EB')}"><i></i><span>${esc(label)}</span></div>` }) }).addTo(g);
      if(run && !run.paused_at) navTarget(g, w, p.color || '#2563EB', showNames() ? w.name : t('planRoute', { n:p.idx + 1 }));
    });
  };
  draw();
  every(15000, async () => {
    try{ await Promise.all([loadWorkers(), loadLive()]); draw(); }catch{}
  });
  return draw;
}
// checkpoint: numbered point on the route (day.section with several days), green tick when 80 % of the section is walked
export const cpMarker = (c, color, multi) => L.marker(c.at, { keyboard:false, zIndexOffset:500, title:t('cpTitle', { d:c.day + 1, n:c.n, p:c.pct }),
  icon:L.divIcon({ className:'', iconSize:[24, 24], iconAnchor:[12, 12], html:`<div class="cp ${c.done ? 'ok' : ''}" style="--c:${esc(color || '#2563EB')}">${c.done ? '✓' : (multi ? (c.day + 1) + '.' : '') + c.n}</div>` }) });
// admin: tap a checkpoint → its streets light up, and it can be closed as done (or opened again if it was closed here)
const cpTag = c => (c.day + 1) + '.' + c.n;
function densify(run){ const out = [run[0]]; for(let i = 1; i < run.length; i++){ const a = run[i - 1], b = run[i], n = Math.max(1, Math.ceil(hav(a[0], a[1], b[0], b[1]) / 8)); for(let k = 1; k <= n; k++) out.push([+(a[0] + (b[0] - a[0]) * k / n).toFixed(6), +(a[1] + (b[1] - a[1]) * k / n).toFixed(6)]); } return out; }
function cpAdmin(c, color, multi, plan, reload){
  const mk = cpMarker(c, color, multi), label = multi ? cpTag(c) : String(c.n);
  const closed = (plan.skipped || []).some(x => x && x.cp === cpTag(c));
  let hl = null;
  mk.bindPopup(`<b>${esc(t('cpWord'))} ${esc(label)}</b><br><span class="small">${esc(t('cpPct', { p:c.pct }))}</span><div style="margin-top:6px">${
    closed ? `<button class="btn ghost small" data-cpopen>${esc(t('cpReopen'))}</button>` : c.done ? '' : `<button class="btn primary small" data-cpclose>${esc(t('cpClose'))}</button>`}</div><div class="err" data-cperr></div>`, { className:'cp-pop', maxWidth:200, autoPan:false });
  mk.on('popupopen', e => {
    const m = mk._map; if(m && c.runs && c.runs.length){ hl = L.featureGroup(c.runs.map(r => L.polyline(r, { color:'#F59E0B', weight:10, opacity:.85, lineCap:'round', lineJoin:'round', interactive:false }))).addTo(m); }
    const el = e.popup.getElement(), err = el.querySelector('[data-cperr]');
    // keep the section's streets visible: the small popup sits above the point, the streets below it
    if(m){ const b = (hl ? hl.getBounds() : L.latLngBounds([c.at])).extend(c.at); m.fitBounds(b, { paddingTopLeft:[24, (el.offsetHeight || 90) + 40], paddingBottomRight:[24, 150], maxZoom:Math.max(m.getZoom(), 16), animate:true }); }
    const save = async fn => {
      const { data:fresh, error:e1 } = await sb.from('task_plans').select('skipped').eq('id', plan.id).maybeSingle(); if(e1 || !fresh){ err.textContent = errText(e1); return; }
      const { error } = await sb.from('task_plans').update({ skipped:fn(fresh.skipped || []) }).eq('id', plan.id); if(error){ err.textContent = errText(error); return; }
      mk.closePopup(); reload();
    };
    const bc = el.querySelector('[data-cpclose]'); if(bc) bc.onclick = () => { bc.disabled = true; save(sk => [...sk, ...c.runs.map(r => ({ at:new Date().toISOString(), by:'Admin', why:'Erledigt', cp:cpTag(c), pts:densify(r) }))]); };
    const bo = el.querySelector('[data-cpopen]'); if(bo) bo.onclick = () => { bo.disabled = true; save(sk => sk.filter(x => !(x && x.cp === cpTag(c)))); };
  });
  mk.on('popupclose', () => { if(hl){ hl.remove(); hl = null; } });
  return mk;
}
// a whole order: every route in its colour, what has been covered in green, the GPS tracks of all days
async function viewTaskMap(id, back){
  const tk = A.tasks.find(x => x.id === id); if(!tk) return back();
  const [{ data:plans }, { data:routes }] = await Promise.all([sb.from('task_plans').select('*').eq('task_id', id).order('idx'), sb.from('routes').select('*').eq('task_id', id)]);
  const split = (await Promise.all((routes || []).map(r => r.track_deleted_at ? [] : fetchPoints(r.id).catch(() => [])))).map(p => Planner.walkRuns(p));
  const tracks = split.flatMap(x => x.walk), drives = split.flatMap(x => x.drive);
  const byPlan = {}, trackCol = {};
  (routes || []).forEach((r, i) => {
    const pid = r.plan_id || ((plans || []).find(p => p.worker_id === r.worker_id) || {}).id; if(!pid) return;
    (byPlan[pid] = byPlan[pid] || []).push(...split[i].walk); trackCol[i] = ((plans || []).find(p => p.id === pid) || {}).color;
  });
  let doneM = 0, allM = 0, flAll = 0, hasFl = false;
  const res = (plans || []).map(p => {
    const tr = p.path && p.path.length > 1 ? addSkips(Planner.makeTracker(p.path), p) : null, ct = p.boxes && p.boxes.length ? Planner.makeBoxCounter(p.boxes) : null;
    // all tracks of the order count: streets of this route walked by somebody else are done too
    for(const pts of tracks){ if(tr) tr.addTrack(pts); if(ct) ct.visitAll(pts); }
    if(ct) adminDone(p).forEach(pts => ct.visitAll(pts));   // parts the admin closed as done (e.g. phone broken) count their mailboxes too
    const pct = tr ? tr.pct() : 0; doneM += pct * (p.length_m || 0) / 100; allM += p.length_m || 0; if(ct){ flAll += ct.count(); hasFl = true; }
    return { p, runs:tr ? tr.runs() : [], pct, fl:ct ? ct.count() : null, cps:tr ? checkpoints(p, i => tr.isDone(i)) : [] };
  });
  // houses along a route's tracks outside every planned route count for that route like planned ones
  const allBoxes = (plans || []).flatMap(p => p.boxes || []);
  const offRuns = offRoute(tracks, plans);
  const walked = (routes || []).reduce((a, r) => a + (r.distance_m || 0), 0), days = new Set((routes || []).map(dayKey)).size;
  let names = true, redrawLive = null;
  const opts = {
    title:tk.title, hasNames:true, onNames:v => { names = v; if(redrawLive) redrawLive(); },
    lines:[[tk.district, tk.city_name].filter(Boolean).join(', '), tk.work_date ? fmtDay(tk.work_date) : ''],
    get stats(){ return [tk.flyers ? [t('flyers'), fmtN(tk.flyers)] : null, hasFl ? [t('rvFlyers'), '≈ ' + fmtN(flAll)] : null, [t('rvDist'), fmtDist(walked)], allM ? [t('rvDayShare2'), Math.round(100 * doneM / allM) + ' %'] : null, days ? [t('rvDays'), String(days)] : null]; },
    get legend(){ return res.map(({ p, pct, fl }) => ({ color:p.color || '#2563EB', label:(p.worker_id ? nameOf(p.worker_id) : t('planRoute', { n:p.idx + 1 })), anonLabel:t('planRoute', { n:p.idx + 1 }), sub:pct + ' %' + (fl != null ? ' · ≈ ' + fmtN(fl) + ' ' + t('flyers') : '') })); },
    layers:[
      { key:'zone', on:false, add:g => { if(tk.zone_polygon) L.polygon(tk.zone_polygon, { color:css('--brand'), weight:2, fillOpacity:.05, interactive:false }).addTo(g); } },
      ...((tk.must_areas || []).length || (tk.side_towns || []).length ? [{ key:'must', label:t('sideTownsShort'), add:g => drawTowns(g, tk, 3) }] : []),
      ...(tk.work_area ? [{ key:'own', label:t('zoneTitle'), add:g => L.polygon(tk.work_area, { color:'#7C3AED', weight:3, dashArray:'10 6', fillOpacity:.04, interactive:false }).addTo(g) }] : []),
      // the planned routes; with several working days every day is its own layer (day 1 solid, day 2 dashed, …)
      ...(() => {
        const nd = Math.max(1, ...(plans || []).map(p => (p.days || []).length));
        const drawDay = (g, k) => (plans || []).forEach(p => { if(!p.path || p.path.length < 2) return; const d = nd > 1 ? (p.days || [])[k] : null; if(nd > 1 && !d) return;
          L.polyline(Planner.pathRuns(d ? p.path.slice(d.i0, d.i1 + 1) : p.path), { color:dayColor(p.color, k), weight:k ? 4 : 5, opacity:.8, dashArray:k ? (k % 2 ? '10 8' : '2 8') : null, lineJoin:'round', lineCap:'round' }).addTo(g); });
        const start = g => L.marker([tk.start_lat, tk.start_lng], { icon:dot('pin-start', 24) }).addTo(g);
        return nd > 1 ? [...Array.from({ length:nd }, (_, k) => ({ key:'day' + k, label:t('dayN', { n:k + 1 }) + (k ? ' ┄' : ' ━'), add:g => drawDay(g, k) })), { key:'start', add:start }]
          : [{ key:'plan', label:t('rvPlan'), add:g => { drawDay(g, 0); start(g); } }];
      })(),
      { key:'done', label:t('rvDone'), add:g => { res.forEach(x => x.runs.forEach(run => L.polyline(run, { color:GREEN_C(), weight:7, opacity:.9, lineJoin:'round', lineCap:'round' }).addTo(g))); offRuns.forEach(run => L.polyline(run, { color:GREEN_C(), weight:7, opacity:.9, lineJoin:'round', lineCap:'round' }).addTo(g)); } },
      { key:'gps', label:tracks.some(x => x.length > 1) ? t('rvGps') : '', on:false, add:g => { tracks.forEach(ll => { if(ll.length > 1) gpsLine(g, ll, 2.5); }); drives.forEach(ll => driveLine(g, ll, 2.5)); } },
      ...((plans || []).some(p => (p.path || []).some(q => q[2] === 1)) ? [{ key:'jumps', label:t({ car:'tripsCar', bike:'tripsBike', bus:'tripsBus' }[(tk.travel || (tk.bike ? 'bike' : 'bus'))]), add:g => (plans || []).forEach(p => drawJumps(g, p.path, (tk.travel || (tk.bike ? 'bike' : 'bus')))) }] : []),
      ...((plans || []).some(p => workerSkips(p).length) ? [{ key:'skip', label:t('rvSkipped'), add:g => drawSkips(g, plans) }] : []),
      { key:'cp', label:t('checkpoints'), add:g => res.forEach(({ p, cps }) => cps.forEach(c => cpAdmin(c, dayColor(p.color, c.day), (p.days || []).length > 1, p, () => viewTaskMap(id, back)).addTo(g))) },
      { key:'live', label:t('rvLive'), add:g => { redrawLive = liveWorkers(g, tk, plans, () => names); } },
    ],
    back,
  };
  const m = openMapView(opts);
  // houses along tracks outside the planned routes: counted in the background, the map is already open
  Promise.all(res.map(x => boxesAlong(byPlan[x.p.id] || [], allBoxes).catch(() => null))).then(extra => {
    let ch = false; (extra || []).forEach((n, k) => { if(n){ res[k].fl = (res[k].fl || 0) + n; flAll += n; hasFl = true; ch = true; } });
    if(ch && m.rvRefresh) m.rvRefresh();
  }).catch(() => {});
}

/* ---------- AUFTRÄGE ---------- */
function taskMatches(tk){
  const f = A.filter, d = tk.work_date ? String(tk.work_date).slice(0, 10) : '';
  if(f.status === 'open' && tk.status !== 'open') return false;
  if(f.status === 'done' && tk.status === 'open') return false;
  if(f.status === 'live' && !taskLive(tk)) return false;
  if(f.city && tk.city_name !== f.city) return false;
  if(f.district && tk.district !== f.district) return false;
  if(f.from && (!d || d < f.from)) return false;
  if(f.to && (!d || d > f.to)) return false;
  return true;
}
// an order is "unterwegs" while one of its workers records a route right now (GPS alone is not enough: the route must be running)
const taskLive = tk => tk.status === 'open' && (A.live || []).some(r => r.task_id === tk.id && !r.paused_at);
const taskState = tk => tk.status === 'cancelled' ? ['cancel', t('stCancelled')] : tk.status !== 'open' ? ['done', t('stDoneTask')] : taskLive(tk) ? ['live', t('stLive')] : (tk.task_workers || []).length ? ['info', t('stPlanned')] : ['neutral', t('stNoWorkers')];
const accOf = k => ({ done:'acc-ok', cancel:'acc-bad', ok:'acc-ok', live:'acc-ok', info:'acc-info', warn:'acc-warn', bad:'acc-bad', neutral:'acc-neutral' }[k]);
function viewTasks(){
  const opts = k => [...new Set(A.tasks.map(x => x[k]).filter(Boolean))].sort();
  const sel = (id, label, list, cur) => `<div><label class="f" for="${id}">${esc(label)}</label><select class="in small" id="${id}"><option value="">${esc(t('fAll'))}</option>${list.map(v => `<option ${v === cur ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>`;
  const card = tk => { const [k, txt] = taskState(tk); return `<button class="card acc ${accOf(k)} task-card ${k === 'done' ? 'is-done' : k === 'cancel' ? 'is-cancel' : ''}" data-id="${tk.id}"><div class="tc-main"><b>${k === 'done' ? `<span class="done-ic">${ICONS.check}</span>` : k === 'cancel' ? `<span class="done-ic">${ICONS.close}</span>` : ''}${esc(tk.title)}</b>
    <div class="tc-meta">${coName(tk.company_id) ? `<i>${ICONS.users}${esc(coName(tk.company_id))}</i>` : ''}<i>${ICONS.calendar}${esc(fmtDay(tk.work_date))}</i>${tk.district || tk.city_name ? `<i>${ICONS.pin}${esc([tk.district, tk.city_name].filter(Boolean).join(', '))}</i>` : ''}${tk.flyers ? `<i>${ICONS.mail}${esc(fmtN(tk.flyers))}</i>` : ''}<i>${ICONS.users}${(tk.task_workers || []).length}</i></div>
    ${statusPill(k, txt)}</div>${ICONS.chevron}</button>`; };
  const f = A.filter, list = A.tasks.filter(taskMatches).sort((a, b) => (a.status !== 'open') - (b.status !== 'open'));
  const nOpen = A.tasks.filter(x => x.status === 'open').length, nLive = A.tasks.filter(taskLive).length, nDone = A.tasks.length - nOpen;
  const nf = ['city', 'district', 'from', 'to'].filter(k => f[k]).length;
  const firmTodo = A.company && A.company.id && !A.company.master && (!firmComplete(A.company) || !avvOk(A.company));
  shell('tasks', `${topbar(t('tasks'), null, `<button class="btn primary small desk-only" id="tNew">${ICONS.plus}${esc(t('createTask'))}</button>`)}
    <div class="pad">
      ${firmTodo ? `<button class="warnbox firm-todo" id="firmTodo">${esc(!firmComplete(A.company) ? t('firmMissing') : t('firmAvvMissing'))} ›</button>` : ''}
      <div class="kpis">${[['open', 'k-info', nOpen, t('fOpen')], ['live', 'k-ok', nLive, t('stLive')], ['done', 'k-neutral', nDone, t('fDone')], ['all', 'k-neutral', A.tasks.length, t('fAll')]].map(([k, c, n, l]) => `<button class="kpi ${c} ${f.status === k ? 'on' : ''}" data-st="${f.status === k && k !== 'open' ? 'open' : k}" aria-pressed="${f.status === k}"><b>${n}</b><span>${esc(l)}</span></button>`).join('')}</div>
      <details class="filters" ${nf ? 'open' : ''}><summary>${ICONS.search}${esc(t('filter'))}${nf ? `<span class="cnt">${nf}</span>` : ''}</summary><div class="f-body">
        <div class="steppers">${sel('fCity', t('fCity'), opts('city_name'), f.city)}${sel('fDist', t('fDistrict'), opts('district'), f.district)}</div>
        <div class="dfilter"><div><label class="f" for="fFrom">${esc(t('fFrom'))}</label><input class="in small" type="date" id="fFrom" value="${esc(f.from)}"></div><div><label class="f" for="fTo">${esc(t('fTo'))}</label><input class="in small" type="date" id="fTo" value="${esc(f.to)}"></div></div>
        ${nf ? `<button class="link" id="fReset" style="margin-top:8px">${esc(t('reset'))}</button>` : ''}</div></details>
      ${list.length ? `<div class="task-grid">${list.map(card).join('')}</div>` : A.tasks.length ? emptyState(t('noMatch'), 'search') : `${emptyState(t('noOpenTasks'), 'flag')}<button class="btn primary" id="create" style="margin-top:12px">${ICONS.plus}${esc(t('createTask'))}</button>`}
    </div>`, { fab:t('createTask') });
  $('#fab').onclick = () => viewCreate(); if($('#tNew')) $('#tNew').onclick = () => viewCreate();
  if($('#create')) $('#create').onclick = () => viewCreate();
  if($('#firmTodo')) $('#firmTodo').onclick = () => { A.focusFirm = true; adminTab('settings'); };
  const again = () => viewTasks();
  document.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { f.status = b.dataset.st; again(); });
  $('#fCity').onchange = e => { f.city = e.target.value; again(); }; $('#fDist').onchange = e => { f.district = e.target.value; again(); };
  $('#fFrom').onchange = e => { f.from = e.target.value; again(); }; $('#fTo').onchange = e => { f.to = e.target.value; again(); };
  if($('#fReset')) $('#fReset').onclick = () => { f.city = f.district = f.from = f.to = ''; again(); };
  document.querySelectorAll('.task-card').forEach(b => b.onclick = () => viewTask(b.dataset.id));
  // live routes decide "unterwegs": refresh them once and redraw if something changed
  const before = JSON.stringify((A.live || []).map(r => r.id + r.paused_at));
  loadLive().then(() => { if(document.querySelector('.task-card, .kpis') && UI.tab === 'tasks' && !document.getElementById('cSheet') && JSON.stringify((A.live || []).map(r => r.id + r.paused_at)) !== before) viewTasks(); }).catch(() => {});
}

/* Routenerstellung: full map + search on top, sheet with flyers / workers / routes */
// a new order that is not saved yet survives a reload of the page (kept in this browser for 2 days)
const DRAFT_KEY = 'fm.newOrderDraft';
const readDraft = () => { try{ const x = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); return x && Date.now() - x.at < 2 * 864e5 ? x : null; }catch{ return null; } };
const clearDraft = () => { try{ localStorage.removeItem(DRAFT_KEY); }catch{} };
function viewCreate(edit){
  const tkE = edit && edit.tk;   // editing an existing task: same screen, prefilled, saves over the old routes
  const d = { start:null, place:null, flyers:10000, n:2, nAuto:false, hours:7, quota:1500, days:2, g:null, plan:null, assign:{}, err:null, token:0, must:[], zone:null, drawing:null, drawFor:'must' };
  if(tkE && Array.isArray(tkE.must_areas)) d.must = tkE.must_areas.map(mArea).filter(a => a.p.length > 2);
  if(tkE && Array.isArray(tkE.work_area) && tkE.work_area.length > 2) d.zone = tkE.work_area;
  if(tkE) Object.assign(d, { flyers:tkE.flyers || 5000, hours:+tkE.work_hours || 7, quota:tkE.quota_m30 || 1500, days:tkE.work_days || 2, n:Math.max(1, edit.plans.length), nAuto:false });
  d.side = tkE && Array.isArray(tkE.side_towns) ? tkE.side_towns : [];
  d.split = tkE ? (tkE.split || null) : 'even';   // new orders: total flyers shared evenly over all places; old orders keep their numbers
  d.travel = (tkE && tkE.travel) || (tkE && tkE.bike ? 'bike' : 'bus'); d.bike = d.travel !== 'bus';   // how the places of the order are reached   // far places of this order (own start, own day, reached by bus / train)
  // the start address (also typed in step 1 under "Hauptstadt"); the main town comes from it
  const pickAddr = (c, q) => { saved = keep(); d.place = c; d.mainCity = null; const txt = c.name + (c.sub ? ', ' + c.sub : ''); if(q) q.value = txt; const top = $('#cSearch'); if(top) top.value = txt; setStart(c.lat, c.lng); };
  const mainCity = () => (d.place && (d.place.city || (d.place.kind === 'city' || d.place.kind === 'town' || d.place.kind === 'village' ? d.place.name : ''))) || d.mainCity || (tkE && tkE.city_name) || '';
  const sf = searchField('cSearch', t('searchAddr'), pickAddr, { near:() => d.start ? [d.start.lat, d.start.lng] : null });
  shell('tasks', `<div id="fullMap" class="fullmap"></div>
    <div class="map-top"><button class="icon-btn" id="cBack" aria-label="${esc(t('back'))}">${ICONS.back}</button><div class="grow">${sf.html}</div></div>
    <button class="chip pick-btn" id="cPick" hidden></button>
    <div class="draw-bar" id="cDraw" hidden><b id="cDrawT">${esc(t('mustDrawHint'))}</b><span class="small" id="cDrawN"></span>
      <div class="tool-row"><button class="btn ghost small" id="cDrawUndo">${esc(t('mustUndo'))}</button><button class="btn ghost small" id="cDrawCancel">${esc(t('cancel'))}</button><button class="btn primary small" id="cDrawOk">${esc(t('mustDone'))}</button></div></div>
    <div class="sheet" id="cSheet"></div>`, { map:true }); setLoc(tkE ? 'task/' + tkE.id : 'new');
  sf.bind();
  $('#cBack').onclick = () => { d.token++; viewTasks(); };
  const m = makeMap($('#fullMap'), null, 13);
  const zoneLayer = L.layerGroup().addTo(m), planLayer = L.layerGroup().addTo(m), mustLayer = L.layerGroup().addTo(m);
  // mandatory areas: dashed orange outlines; while drawing, the corners tapped so far
  const MUST_COLOR = '#EA580C', ZONE_COLOR = '#7C3AED';
  const tip = (pg, txt, cls) => L.marker(pg.getBounds().getCenter(), { icon:L.divIcon({ className:'', html:`<span class="must-tip${cls ? ' ' + cls : ''}">${esc(txt)}</span>`, iconSize:null }), interactive:false, keyboard:false }).addTo(mustLayer);
  const drawMust = () => {
    mustLayer.clearLayers();
    if(d.zone) tip(L.polygon(d.zone, { color:ZONE_COLOR, weight:3, dashArray:'10 6', fillOpacity:.04, interactive:false }).addTo(mustLayer), t('zoneTitle'), 'zone-tip');
    d.side.forEach(x => { if(x.p && x.p.length > 2) tip(L.polygon(x.p, { color:'#0D9488', weight:3, dashArray:'4 6', fillOpacity:.08, interactive:false }).addTo(mustLayer), x.name + ' · ' + fmtN(x.flyers), 'zone-tip'); });
    d.must.forEach((a, k) => tip(L.polygon(a.p, { color:MUST_COLOR, weight:3, dashArray:'8 6', fillOpacity:.12, interactive:false }).addTo(mustLayer), mName(a, k) + (a.n ? ' · ' + fmtN(a.n) : '')));
    if(d.drawing){
      const col = d.drawFor === 'zone' ? ZONE_COLOR : MUST_COLOR;
      const pg = L.polygon(d.drawing.length > 1 ? d.drawing : [], { color:col, weight:2, dashArray:'4 4', fillOpacity:.08, interactive:false }).addTo(mustLayer);
      // every corner can be dragged; the shape follows live
      d.drawing.forEach((q, i) => {
        const mk = L.marker(q, { draggable:true, keyboard:false, zIndexOffset:1000, icon:L.divIcon({ className:'', iconSize:[22, 22], iconAnchor:[11, 11], html:`<div class="draw-pt" style="--c:${col}"></div>` }) }).addTo(mustLayer);
        mk.on('drag', e => { const ll = e.target.getLatLng(); d.drawing[i] = [ll.lat, ll.lng]; pg.setLatLngs(d.drawing); });
        mk.on('click', () => {});   // a tap on a corner does not add a new one
      });
    }
  };
  // how many flyers go into a priority area (0 = every mailbox in it); resolves null when cancelled
  const askMustN = (cur, avail) => new Promise(res => {
    const def = cur || Math.max(100, Math.round(d.flyers * 0.2 / 50) * 50);
    const mm = modal(`<h2>${esc(t('mustNTitle'))}</h2><p class="muted small">${esc(t('mustNHint'))}</p>
      <div class="stepper" style="margin:8px 0"><button data-x="-100" aria-label="−100">−</button><input id="mN" type="number" inputmode="numeric" min="50" step="50" value="${cur === 0 && avail ? avail : def}"><button data-x="100" aria-label="+100">+</button></div>
      ${avail ? `<p class="small muted" style="margin:0 0 8px">${esc(t('mustAvail', { mb:fmtN(avail) }))}</p>` : ''}
      <label class="check"><input type="checkbox" id="mAll" ${cur === 0 ? 'checked' : ''}><span>${esc(t('mustAll'))}</span></label>
      <button class="btn primary" id="mOk" style="margin-top:12px">${esc(t('mustDone'))}</button><button class="btn ghost" id="mNo">${esc(t('cancel'))}</button>`);
    const inp = mm.querySelector('#mN'), all = mm.querySelector('#mAll'), sync = () => { inp.disabled = all.checked; };
    all.onchange = sync; sync();
    mm.querySelectorAll('[data-x]').forEach(b => b.onclick = () => { inp.value = Math.max(50, (Math.round(+inp.value) || 0) + +b.dataset.x); });
    mm.querySelector('#mNo').onclick = () => { mm.remove(); res(null); };
    mm.querySelector('#mOk').onclick = () => { const v = all.checked ? 0 : Math.max(50, Math.round(+inp.value) || 0); mm.remove(); res(v); };
  });
  const drawMode = (on, kind, init, edit) => {
    d.drawing = on ? (init || []).map(q => [q[0], q[1]]) : null; if(on){ d.drawFor = kind || 'must'; d.drawEdit = edit == null ? null : edit; }
    const ht = $('#cDrawT'); if(ht) ht.textContent = t(d.drawFor === 'zone' ? 'zoneDrawHint' : 'mustDrawHint');
    $('#cDraw').hidden = !on; $('#cSheet').hidden = on; const mt = document.querySelector('.map-top'); if(mt) mt.hidden = on; const pk = $('#cPick'); if(pk && on) pk.hidden = true; else updPick();
    m.getContainer().style.cursor = on ? 'crosshair' : '';
    updDraw(); drawMust();
  };
  const updDraw = () => { const n = d.drawing ? d.drawing.length : 0; const el = $('#cDrawN'); if(el) el.textContent = t('mustCorners', { n }); const ok = $('#cDrawOk'); if(ok) ok.disabled = n < 3; };
  $('#cDrawUndo').onclick = () => { if(d.drawing && d.drawing.length){ d.drawing.pop(); updDraw(); drawMust(); } };
  $('#cDrawCancel').onclick = () => drawMode(false);
  $('#cDrawOk').onclick = async () => {
    if(!d.drawing || d.drawing.length < 3) return;
    const pts = d.drawing.map(q => [+q[0].toFixed(6), +q[1].toFixed(6)]), kind = d.drawFor;
    drawMode(false);
    if(kind === 'zone'){ d.zone = pts; drawMust(); return recompute(); }
    if(d.drawEdit != null && d.must[d.drawEdit]){ d.must[d.drawEdit] = { ...d.must[d.drawEdit], p:pts }; d.drawEdit = null; drawMust(); d.dirty = true; return recompute(); }
    const nm = t('areaN', { n:d.must.length + d.side.length + 1 });
    return addArea({ name:nm, drawn:true }, pts, true);
  };
  const SIDE_R = 3000;   // a place further away than this gets its own order with its own start point (planning stays fast, no walking between towns)
  // a Nebenstadt typed by name (its OSM borders) or drawn on the map: near the start it is part of the main plan,
  // further away it gets its own start point and goes whole to one worker (bus / train)
  const addArea = async (c, pts, exact) => {
    if(!alive()) return;
    const ctr = pts.reduce((a, q) => [a[0] + q[0] / pts.length, a[1] + q[1] / pts.length], [0, 0]), dist = hav(d.start.lat, d.start.lng, ctr[0], ctr[1]);
    if(!exact) toast(t('placeCircle'));
    try{ m.fitBounds(L.latLngBounds([[d.start.lat, d.start.lng], ...pts]), { padding:[40, 40] }); }catch{}
    const n = d.split ? 0 : await askMustN(null, 0); if(n === null || !alive()) return renderSheet();
    if(dist > SIDE_R){
      // start in the town centre (search point) – the middle of a municipality's border is often fields and hamlets; drawn areas: their middle
      const st0 = c.lat != null && !c.drawn ? [c.lat, c.lng] : ctr;
      d.side.push({ name:c.name, lat:+(+st0[0]).toFixed(6), lng:+(+st0[1]).toFixed(6), p:pts, flyers:d.split ? 0 : (n || 1000), km:Math.round(dist / 100) / 10 });
      toast(t('sideAdded', { name:c.name }));
    }else{
      const far = Math.max(...pts.map(q => hav(d.start.lat, d.start.lng, q[0], q[1])));
      if(far > Planner.MUST_MAX_R){ toast(t('placeTooFar', { km:Math.round(Planner.MUST_MAX_R / 1000) })); return renderSheet(); }
      d.must.push({ p:pts, n, name:c.name, c:c.lat != null && !c.drawn ? [+(+c.lat).toFixed(6), +(+c.lng).toFixed(6)] : undefined });
    }
    drawMust(); d.dirty = true; recompute();
  };
  const addPlaceArea = async c => {
    if(!d.start){ toast(t('tapMap')); return; }
    saved = keep(); toast(t('placeLoading'));
    const { p:pts, exact } = await placeArea(c); if(!alive()) return;
    return addArea(c, pts, exact);
  };
  drawMust();
  // once a start point exists, a tap on the map does nothing (no accidental moves while looking at the routes);
  // the start is moved only through the "change start" button (then the next tap) or a new address search
  const updPick = () => {
    const b = $('#cPick'); if(!b) return;
    b.hidden = !d.start; b.classList.toggle('on', !!d.pick);
    b.innerHTML = d.pick ? esc(t('pickStartNow')) : ICONS.pin + esc(t('changeStart'));
    m.getContainer().style.cursor = d.pick ? 'crosshair' : '';
  };
  $('#cPick').onclick = () => { d.pick = !d.pick; updPick(); };
  m.on('click', e => {
    if(d.drawing){
      // a new point goes into the side of the shape it is closest to, so the outline never crosses itself
      const q = [e.latlng.lat, e.latlng.lng], P = d.drawing;
      if(P.length < 3) P.push(q);
      else{ let bi = P.length, bc = Infinity; for(let i = 0; i < P.length; i++){ const a = P[i], b = P[(i + 1) % P.length], c = hav(a[0], a[1], q[0], q[1]) + hav(q[0], q[1], b[0], b[1]) - hav(a[0], a[1], b[0], b[1]); if(c < bc){ bc = c; bi = i + 1; } } P.splice(bi, 0, q); }
      updDraw(); drawMust(); return;
    }
    if(d.start && !d.pick) return;
    d.pick = false; d.place = null; const qi = $('#cSearch'); if(qi) qi.value = '';
    setStart(e.latlng.lat, e.latlng.lng, true);
    d.mainCity = null; reversePlace(e.latlng.lat, e.latlng.lng).then(x => { if(x && alive()){ d.mainCity = x.split(', ').pop(); renderSheet(); } }).catch(() => {});
  });
  const alive = () => !!document.getElementById('cSheet');   // false once the admin left this screen
  const sheet = html => { const el = $('#cSheet'); if(el) el.innerHTML = html; };
  // while recalculating keep the sheet where it is (no flicker) and show a small status in the corner;
  // only a brand-new start point replaces the sheet with a plain loading message. Saving waits for the new plan.
  const busy = (txt, full) => {
    if(!alive()) return;
    d.busy = true; const sv = $('#cSave'); if(sv) sv.disabled = true;
    const sh = $('#cSheet'); if(!$('#cWz')) renderSheet();
    if(full && d.step >= 2) sh.classList.add('calc');
    let b = $('#cBusy'); if(!b){ b = document.createElement('div'); b.id = 'cBusy'; b.className = 'cbusy'; b.setAttribute('role', 'status'); sh.appendChild(b); } b.textContent = txt;
    const nx = $('#cNext') || $('#cSave'); if(nx && d.step >= 2) nx.disabled = true;
  };
  // status with a running seconds counter, so a slow map server is visibly "working"; the text follows the planner's stage
  const progress = (tok, full) => {
    const t0 = Date.now(); let txt = t('calculating');
    const show = () => { if(tok !== d.token || !alive()){ clearInterval(id); return; } const s = Math.round((Date.now() - t0) / 1000); busy(s >= 1 ? txt + ' · ' + s + ' s' : txt, full); };
    const id = setInterval(show, 1000); show();
    // stage 'loadingArea|3|9' = map square 3 of 9 loaded
    return { stage:k => { const [key, a, b] = String(k).split('|'); txt = t(key) + (b ? ' ' + a + '/' + b : ''); full = full && key !== 'calculating'; show(); }, stop:() => clearInterval(id) };
  };
  const startArr = () => [d.start.lat, d.start.lng];
  const errText2 = e => /abort|overpass|fetch/i.test((e && e.message) || '') ? t('mapSlow') : ((e && e.message) || 'net');
  async function setStart(lat, lng, fromClick){
    const tok = ++d.token; d.start = { lat, lng }; d.keepView = !!fromClick;   // a tap on the map keeps the zoom the admin chose
    d.pick = false; updPick();
    d.loaded = false; d.plan = null; d.err = null; d.assign = {};
    zoneLayer.clearLayers(); planLayer.clearLayers();
    L.marker([lat, lng], { icon:dot('pin-start', 26) }).addTo(zoneLayer); if(!fromClick) m.setView([lat, lng], 15, { animate:false });
    d.loading = false;
    if(d.step < 2){ renderSheet(); return; }   // nothing is planned until the first step (towns, areas …) is filled in
    return loadArea(tok);
  }
  async function loadArea(tok){
    if(!d.start || d.loading) return; d.loading = true;
    tok = tok || ++d.token; const lat = d.start.lat, lng = d.start.lng;
    let pr = progress(tok, true); pr.stage('loadingArea');
    for(let attempt = 0; attempt < 2 && !d.loaded; attempt++){   // public map servers are sometimes busy: one automatic retry
      try{ const r = await planEngine().run('load', { start:[lat, lng], flyers:d.flyers, must:d.must, zone:d.zone }, pr.stage); if(tok !== d.token){ d.loading = false; return pr.stop(); } if(!r || !r.skipped) d.loaded = true; }
      catch(e){ pr.stop(); if(tok !== d.token){ d.loading = false; return; } d.err = errText2(e); if(attempt === 0){ pr = progress(tok, true); pr.stage('retrying'); await new Promise(r => setTimeout(r, 4000)); if(tok !== d.token){ d.loading = false; pr.stop(); return; } } }
    }
    pr.stop(); d.loading = false;
    if(tok !== d.token || !alive()) return;
    if(!d.loaded){ d.busy = false; renderSheet(); return; }
    recompute();
  }
  async function recompute(){
    if(!d.start || !alive()) return;
    if(d.step < 2){ d.dirty = true; renderSheet(); return; }   // still entering the data: plan later
    d.dirty = false;
    if(!d.loaded){ renderSheet(); return; }
    const tok = ++d.token, pr = progress(tok, false);
    let res = null;
    try{ res = await planEngine().run('plan', { start:startArr(), flyers:d.flyers, n:d.n, days:d.days, hours:d.hours, quota:Math.max(200, Math.round(+saved.quota || 1500)), bike:d.bike, travel:d.travel, split:d.split, must:d.must, zone:d.zone, side:d.side.map(x => ({ name:x.name, lat:x.lat, lng:x.lng, flyers:x.flyers, zone:x.p && x.p.length > 2 ? x.p : null })) }, pr.stage); }
    catch(e){ pr.stop(); if(tok !== d.token || !alive()) return; d.err = errText2(e); d.busy = false; toast(t('streetsFail', { e:d.err })); renderSheet(); return; }
    pr.stop();
    if(tok !== d.token || !alive() || !res || res.skipped) return;
    d.plan = res.plan; d.sug = res.sug; d.streetM = res.street_m; d.err = null; d.busy = false;
    if(tkE && !d.prefilled){ d.prefilled = true; edit.plans.forEach(p => { if(p.worker_id && p.idx < d.plan.routes.length) d.assign[p.idx] = p.worker_id; }); }
    draw(); renderSheet();
  }
  function draw(){
    zoneLayer.clearLayers(); planLayer.clearLayers();
    if(d.plan.zone.length > 2) var z = L.polygon(d.plan.zone, { color:css('--brand'), weight:2, fillOpacity:.06, interactive:false }).addTo(zoneLayer);
    L.marker(startArr(), { icon:dot('pin-start', 26) }).addTo(zoneLayer); drawMust();
    d.plan.routes.forEach((r, i) => { if(r.path.length > 1) L.polyline(Planner.pathRuns(r.path), { color:Planner.COLORS[i % 10], weight:4, opacity:.85 }).addTo(planLayer); });
    d.plan.routes.forEach(r => drawJumps(planLayer, r.path, d.travel));
    if(z && !d.keepView) { const wide = innerWidth >= 900; m.fitBounds(z.getBounds(), { paddingTopLeft:[wide ? 480 : 24, 80], paddingBottomRight:[24, wide ? 24 : Math.round(innerHeight * .5)], maxZoom:17, animate:false }); }
  }
  const num = (id, def) => { const v = parseFloat(($(id) || {}).value); return isFinite(v) ? v : def; };
  // values typed in any step survive re-renders and step changes (only fields that are on screen are read)
  function saveDraft(){
    if(tkE || !d.start) return;
    try{ localStorage.setItem(DRAFT_KEY, JSON.stringify({ at:Date.now(), saved, d:{ start:d.start, place:d.place, must:d.must, side:d.side, flyers:d.flyers, n:d.n, hours:d.hours, days:d.days, bike:d.bike, travel:d.travel, split:d.split, zone:d.zone, mainCity:d.mainCity } })); }catch{}
  }
  async function restoreDraft(){
    const x = readDraft(); if(!x || !x.d || !x.d.start) return;
    const name = (x.saved && x.saved.title) || (x.d.place && x.d.place.name) || '—';
    if(!await confirmBox(t('draftQ'), t('draftText', { name }), t('draftYes'))){ clearDraft(); return; }
    if(!alive()) return;
    Object.assign(d, x.d); if(!x.d.travel) d.travel = x.d.bike ? 'bike' : 'bus'; d.bike = d.travel !== 'bus'; saved = { ...saved, ...(x.saved || {}) };
    const qi = $('#cSearch'); if(qi && d.place) qi.value = d.place.name + (d.place.sub ? ', ' + d.place.sub : '');
    drawMust(); setStart(d.start.lat, d.start.lng);
  }
  function keep(){
    const k = { ...saved }, v = id => $(id) ? $(id).value : undefined;
    if(v('#cTitle') !== undefined) k.title = v('#cTitle');
    if(v('#cDate') !== undefined) k.date = v('#cDate');
    if(v('#cNotes') !== undefined) k.notes = v('#cNotes');
    if(v('#cQuota') !== undefined) k.quota = v('#cQuota');
    if($('#cNoQ')) k.noQuota = $('#cNoQ').checked;
    return k;
  }
  function restore(k){ if($('#cTitle')) $('#cTitle').value = k.title || ''; if($('#cDate')) $('#cDate').value = k.date || ''; if($('#cNotes')) $('#cNotes').value = k.notes || ''; if($('#cQuota')) $('#cQuota').value = k.quota; }
  let saved = tkE ? { title:tkE.title, date:tkE.work_date ? String(tkE.work_date).slice(0, 10) : '', notes:tkE.notes || '', quota:tkE.quota_m30 || 1500, noQuota:!!tkE.no_quota } : { title:'', date:'', notes:'', quota:1500 };
  // five steps on top of the live map: 1 start · 2 route · 3 time · 4 workers · 5 review. Planning keeps running underneath.
  const STEPS = ['wzStart', 'wzRoute', 'wzTime', 'wzTeam', 'wzReview'];
  d.step = tkE ? 2 : 1;
  const canReach = k => k === 1 || (!!d.start && (k === 2 || (!!d.plan && !d.busy)));
  const goStep = k => { if(!canReach(k)) return; saved = keep(); d.step = k; const sh = $('#cSheet'); if(sh){ sh.scrollTop = 0; if(k >= 2) sh.classList.add('tall'); } renderSheet();
    if(k >= 2 && d.start){ if(!d.loaded) loadArea(); else if(!d.plan || d.dirty) recompute(); } };
  function renderSheet(){
    if(!alive()) return;
    if($('#cWz')) saved = keep();
    saveDraft();
    const sc = d.step === d.lastStep ? (($('#cSheet') || {}).scrollTop || 0) : 0; d.lastStep = d.step;
    const p = d.plan, title = saved.title || (d.place ? d.place.name : '');
    if(!saved.title && title) saved.title = title;
    const cap = p ? Planner.capacity(p.routes, d.flyers, { hoursPerDay:d.hours, days:d.days }) : null;
    const totMin = p ? p.routes.reduce((s, r) => s + (r.minutes || 0), 0) : 0, oneDay = p && totMin / 60 <= d.hours && (d.n > 1 || d.days > 1);   // all of it fits into one working day of one person
    const needDays = cap ? Math.min(d.days, Math.max(1, Math.ceil(cap.slowest / d.hours - 0.05))) : d.days;
    const km = p ? fmtDist(p.routes.reduce((s, r) => s + r.length_m, 0)) : '';
    const routeRow = (r, i, withSelect) => `<div class="route-row"><span class="swatch" style="background:${Planner.COLORS[i % 10]}"></span>
        <div class="grow"><b>${esc(t('planRoute', { n:i + 1 }))} <span class="muted">· ${esc(t('daysN', { n:Math.max(1, Math.ceil(r.minutes / 60 / d.hours)) }))}</span></b><span>${esc(t('routeLine', { km:fmtDist(r.length_m), h:fmtHm(r.minutes), mb:fmtN(r.mailboxes) }))}</span>
        ${dayLines(r.days, Planner.COLORS[i % 10])}
        ${withSelect ? `<select class="in small" data-r="${i}" aria-label="${esc(t('planRoute', { n:i + 1 }))}">${workerOptions(d.start.lat, d.start.lng, d.assign[i])}</select>` : ''}</div></div>`;
    const planBlock = () => p ? `${(p.side_failed || []).length ? `<div class="warnbox">${esc(t('sideFailed', { list:p.side_failed.join(', ') }))}</div>` : ''}${(p.bus || []).length ? `<div class="hint">${esc(t('busHint', { list:p.bus.map(x => x.name + ' (' + fmtDist(x.gap) + ')').join(', ') }))}</div>` : ''}${(p.side_info || []).length ? `<p class="small muted" style="margin:8px 0 0">${esc(p.side_info.map(x => x.name + ' → ' + t('planRoute', { n:x.worker + 1 })).join(' · '))}</p>` : ''}<p class="small muted" style="margin:10px 0 0">${esc(t('planSum', { mb:fmtN(p.mailboxes), km, h:fmtHm(p.routes.reduce((s, r) => s + r.minutes, 0)) }))}</p>
        ${p.mailboxes < d.flyers * 0.95 ? `<p class="small err">${esc(t('areaSmall', { mb:fmtN(p.mailboxes) }))}</p>` : ''}
        <div class="${cap.ok ? 'hint' : 'warnbox'}">${cap.ok ? esc(needDays === 1 ? t('fitsOne') : t('fitsOk', { d:needDays })) : `${esc(t('tooBig', { h:cap.slowest.toFixed(1).replace('.', ','), lim:cap.limit, d:d.days }))} <button class="link" id="cReduce">${esc(t('reduceTo', { f:fmtN(cap.suggestedFlyers) }))}</button> ${esc(t('moreWorkers'))}`}</div>`
      : d.err ? `<p class="small err">${esc(t('streetsFail', { e:d.err }))}</p><button class="btn ghost small" id="cRetry">${ICONS.refresh}${esc(t('retryBtn'))}</button>` : `<p class="small muted" style="margin:10px 0 0">${esc(t('calculating'))}</p>`;
    let addrSf = null; const sfAddr = () => (addrSf = addrSf || searchField('cAddr', t('searchAddr'), pickAddr, { near:() => d.start ? [d.start.lat, d.start.lng] : null }));
    const towns = {}, sfTown = id => (towns[id] = towns[id] || searchField(id, t('townSearch'), c => addPlaceArea(c), { citiesOnly:true, near:() => d.start ? [d.start.lat, d.start.lng] : null }));
    let body = '';
    if(d.step === 1) body = `
      <label class="f" for="cTitle">${esc(t('title'))}</label><input class="in" id="cTitle" value="${esc(title)}" autocomplete="off">
      <label class="f" for="cAddr">${esc(t('addrMain'))}</label>${sfAddr().html}
      ${d.start && !d.place ? `<p class="small muted" style="margin:4px 0 0">${esc(t('startOnMap'))}</p>` : ''}
      <label class="f">${esc(t('mainCity'))}</label><div class="note" style="margin:0">${esc(mainCity() || t('mainCityAuto'))}</div>
      <label class="f">${esc(t('sideTowns'))}</label><p class="small muted" style="margin:-2px 0 6px">${esc(t('sideTownsHint'))}</p>
      ${d.must.length ? `<div class="chips" style="margin:0 0 8px">${d.must.map((a, k) => `<span class="chip">${d.split ? `<span>${esc(mName(a, k))}</span>` : `<button class="link" data-med="${k}">${esc(mName(a, k))} · ${esc(a.n ? fmtN(a.n) : t('mustAllShort'))}</button>`}${a.p && a.p.length > 2 ? `<button class="link" data-mpt="${k}" aria-label="${esc(t('shapeEdit'))}" title="${esc(t('shapeEdit'))}">✎</button>` : ''}<button class="link" data-mrm="${k}" aria-label="${esc(t('del'))}">✕</button></span>`).join('')}</div>` : ''}
      ${d.side.length ? `<div class="chips" style="margin:0 0 8px">${d.side.map((x, k) => `<span class="chip">${esc(x.name)} · ${esc(d.split ? t('sideOwnKm', { km:String(x.km).replace('.', ',') }) : t('sideOwn', { km:String(x.km).replace('.', ','), n:fmtN(x.flyers) }))}<button class="link" data-srm="${k}" aria-label="${esc(t('del'))}">✕</button></span>`).join('')}</div><p class="small muted" style="margin:-4px 0 8px">${esc(t('sideOwnHint'))}</p>` : ''}
      ${d.start ? sfTown('cTown1').html + `<button class="btn ghost small" id="cMustAdd" style="margin-top:8px">${ICONS.edit}${esc(t('drawOwn'))}</button>` : `<p class="small muted">${esc(t('sideNeedStart'))}</p>`}
      <label class="f" for="cQuota">${esc(t('quota'))}</label><input class="in" type="number" id="cQuota" min="200" step="100" value="${esc(saved.quota)}"><p class="small muted" style="margin:4px 0 0">${esc(t('quotaHours'))}</p><label class="check" style="margin-top:6px"><input type="checkbox" id="cNoQ" ${(saved.noQuota != null ? saved.noQuota : d.travel === 'car') ? 'checked' : ''}><span>${esc(t('noQuota'))}</span></label>
      <label class="f" for="cTravel">${esc(t('travelLbl'))}</label><select class="in" id="cTravel">${['bus', 'bike', 'car'].map(v => `<option value="${v}" ${d.travel === v ? 'selected' : ''}>${esc(t('travel_' + v))}</option>`).join('')}</select><p class="small muted" style="margin:4px 0 0">${esc(t('travelHint'))}</p>`;
    else if(d.step === 2) body = `
      <div class="steppers">
        <div><label class="f">${esc(t('flyersCount'))}</label><div class="stepper"><button data-s="f:-500" aria-label="−500">−</button><input id="cFly" type="number" inputmode="numeric" min="100" step="100" value="${d.flyers}"><button data-s="f:500" aria-label="+500">+</button></div></div>
        <div><label class="f">${esc(t('workersCount'))}</label><div class="stepper"><button data-s="n:-1" ${p ? '' : 'disabled'} aria-label="−1">−</button><b id="vN">${p ? d.n : '—'}</b><button data-s="n:1" ${p ? '' : 'disabled'} aria-label="+1">+</button></div></div>
      </div>
      ${p && oneDay ? `<div class="hint">${esc(t('oneDayHint', { h:fmtHm(totMin) }))} <button class="link" id="cOneDay">${esc(t('applySug'))}</button></div>` : p && d.sug && d.sug !== d.n ? `<div class="hint">${esc(t('sugWorkers', { n:d.sug, d:d.days }))} <button class="link" id="cSug">${esc(t('applySug'))}</button></div>` : ''}
      ${planBlock()}
      <div class="must-box zone-box"><div class="sec-row" style="margin:0"><b>${esc(t('zoneTitle'))}</b><span class="small muted">${esc(d.zone ? t('zoneOwn') + (p && p.zone_mb != null ? ' · ' + t('mustMb', { mb:fmtN(p.zone_mb) }) : '') : t('zoneAuto'))}</span></div>
        <p class="small muted" style="margin:2px 0 8px">${esc(t(d.zone ? 'zoneHintOwn' : 'zoneHint'))}</p>
        ${d.zone && p && p.zone_mb != null && p.zone_mb > (d.flyers - (d.side || []).reduce((a, x) => a + (+x.flyers || 0), 0)) * 1.05 ? `<div class="note" style="margin:0 0 8px">${esc(t('zoneBig', { mb:fmtN(p.zone_mb), f:fmtN((d.flyers - (d.side || []).reduce((a, x) => a + (+x.flyers || 0), 0))) }))} <button class="link" id="cZoneAll">${esc(t('zoneAll', { f:fmtN(p.zone_mb) }))}</button></div>` : ''}
        ${d.zone && p && p.zone_mb != null && p.zone_mb < (d.flyers - (d.side || []).reduce((a, x) => a + (+x.flyers || 0), 0)) * 0.95 ? `<div class="warnbox" style="margin:0 0 8px">${esc(t('zoneSmall', { mb:fmtN(p.zone_mb), f:fmtN((d.flyers - (d.side || []).reduce((a, x) => a + (+x.flyers || 0), 0))) }))} <button class="link" id="cZoneFit">${esc(t('reduceTo', { f:fmtN(Math.max(100, Math.floor(p.zone_mb / 50) * 50)) }))}</button></div>` : ''}
        <div class="tool-row"><button class="btn ghost small" id="cZoneDraw" ${d.start ? '' : 'disabled'}>${ICONS.edit}${esc(t(d.zone ? 'zoneRedraw' : 'zoneDraw'))}</button>${d.zone ? `<button class="btn ghost small" id="cZoneAuto">${esc(t('zoneBackAuto'))}</button>` : ''}</div></div>
      ${p && p.split ? `<div class="hint">${esc(t('splitHint', { list:p.split.map(x => (x.name || mainCity() || t('mainCity')) + ' ' + fmtN(x.flyers)).join(' · ') }))}</div>` : ''}
      ${p && !d.split && p.must_mb > d.flyers ? `<div class="warnbox" style="margin:8px 0">${esc(t('mustTooMany', { mb:fmtN(p.must_mb), f:fmtN(d.flyers) }))}</div>` : ''}
      ${p ? p.routes.map((r, i) => routeRow(r, i, false)).join('') : ''}`;
    else if(d.step === 3) body = `
      <div class="steppers"><div><label class="f" for="cDate">${esc(t('startDate'))}</label><input class="in" type="date" id="cDate"></div><div><label class="f" for="cHours">${esc(t('hoursDay'))}</label><input class="in" type="number" id="cHours" min="1" max="12" step="0.5" value="${d.hours}"></div></div>
      <label class="f" for="cQuota">${esc(t('quota'))}</label><input class="in" type="number" id="cQuota" min="200" step="100" value="${esc(saved.quota)}">
      <label class="f" for="cNotes">${esc(t('note'))}</label><textarea class="in" id="cNotes" placeholder="${esc(t('notesPh'))}"></textarea>
      ${p ? `<div class="${cap.ok ? 'hint' : 'warnbox'}">${cap.ok ? esc(needDays === 1 ? t('fitsOne') : t('fitsOk', { d:needDays })) : esc(t('tooBig', { h:cap.slowest.toFixed(1).replace('.', ','), lim:cap.limit, d:d.days }))}</div>` : ''}`;
    else if(d.step === 4) body = `<p class="small muted" style="margin:0 0 4px">${esc(t('assignHint'))}</p>${p ? p.routes.map((r, i) => routeRow(r, i, true)).join('') : ''}`;
    else {
      const assigned = p ? p.routes.filter((_, i) => d.assign[i]).length : 0;
      body = `<div class="review">
        <div><span>${esc(t('title'))}</span><b>${esc(saved.title || '—')}</b></div>
        <div><span>${esc(t('place'))}</span><b>${esc(d.place ? [d.place.district, d.place.city].filter(Boolean).join(', ') || d.place.name : (tkE ? [tkE.district, tkE.city_name].filter(Boolean).join(', ') : '—'))}</b></div>
        <div><span>${esc(t('flyersCount'))}</span><b>${esc(fmtN(d.flyers))}${p ? ' · ' + esc(t('mbApprox', { n:fmtN(p.mailboxes) })) : ''}</b></div>
        <div><span>${esc(t('workersCount'))}</span><b>${p ? p.routes.length : '—'} · ${esc(t('assignedN', { a:assigned, n:p ? p.routes.length : 0 }))}</b></div>
        <div><span>${esc(t('dist2'))}</span><b>${esc(km)} · ${esc(fmtHm(p ? p.routes.reduce((s, r) => s + r.minutes, 0) : 0))} ${esc(t('h'))}</b></div>
        <div><span>${esc(t('startDate'))}</span><b>${esc(saved.date ? fmtDay(saved.date) : t('noDate'))} · ${esc(String(d.hours).replace('.', ','))} ${esc(t('h'))}/${esc(t('dayShort'))}</b></div>
        <div><span>${esc(t('quota'))}</span><b>${esc(fmtN(+saved.quota || 1500))} m / 30 ${esc(t('min'))}</b></div>
        ${d.side.length ? `<div><span>${esc(t('sideTitle'))}</span><b>${esc(d.side.map(x => x.name + ' (' + fmtN(x.flyers) + ')').join(', '))}</b></div>` : ''}
        <div><span>${esc(t('zoneTitle'))}</span><b>${esc(d.zone ? t('zoneOwn') : t('zoneAuto'))}</b></div>
        ${d.must.length ? `<div><span>${esc(t('mustTitle'))}</span><b>${esc((d.must.some(a => a.name) ? d.must.map((a, k) => mName(a, k)).join(', ') + ' · ' : '') + t('mustSum', { n:d.must.length, mb:fmtN((p && p.must_mb) || 0) }))}</b></div>` : ''}
        ${saved.notes ? `<div><span>${esc(t('note'))}</span><b>${esc(saved.notes)}</b></div>` : ''}
      </div>
      ${p && !cap.ok ? `<div class="warnbox">${esc(t('tooBig', { h:cap.slowest.toFixed(1).replace('.', ','), lim:cap.limit, d:d.days }))}</div>` : ''}<div class="err" id="cErr"></div>`;
    }
    const last = d.step === 5, nextOk = last ? (!!p && !d.busy) : canReach(d.step + 1);
    const isMini = !!($('#cSheet') && $('#cSheet').classList.contains('mini'));
    sheet(`<button class="sheet-grip" id="grip" aria-label="${esc(t('panel'))}"></button><button class="sheet-min" id="cMin" aria-expanded="${isMini ? 'false' : 'true'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg><span>${esc(t(isMini ? 'panelShow' : 'panelHide'))}</span></button>
      <div class="wz" id="cWz">${STEPS.map((k, i) => `<button class="${i + 1 === d.step ? 'on' : i + 1 < d.step ? 'done' : ''}" data-step="${i + 1}" ${canReach(i + 1) ? '' : 'disabled'} aria-current="${i + 1 === d.step ? 'step' : 'false'}"><i></i><span>${i + 1} ${esc(t(k))}</span></button>`).join('')}</div>
      ${body}
      <div class="wz-nav">${d.step > 1 ? `<button class="btn ghost" id="cPrev">${esc(t('back'))}</button>` : ''}
        <button class="btn primary" id="${last ? 'cSave' : 'cNext'}" ${nextOk ? '' : 'disabled'}>${esc(last ? t('saveTask') : t('next'))}</button></div>`);
    restore(saved); $('#cSheet').classList.remove('calc'); $('#cSheet').scrollTop = sc;
    $('#grip').onclick = () => $('#cSheet').classList.toggle('tall');
    $('#cMin').onclick = () => { const sh = $('#cSheet'), mini = sh.classList.toggle('mini'); sh.scrollTop = 0; const bt = $('#cMin'); bt.setAttribute('aria-expanded', mini ? 'false' : 'true'); bt.querySelector('span').textContent = t(mini ? 'panelShow' : 'panelHide'); setTimeout(() => m.invalidateSize(), 250); };
    document.querySelectorAll('[data-step]').forEach(b => b.onclick = () => goStep(+b.dataset.step));
    if($('#cPrev')) $('#cPrev').onclick = () => goStep(d.step - 1);
    if($('#cNext')) $('#cNext').onclick = () => {
      if(d.step === 1){ saved = keep(); if(!(saved.title || '').trim()){ toast(t('needTitle')); $('#cTitle').focus(); return; } }
      goStep(d.step + 1);
    };
    if($('#cRetry')) $('#cRetry').onclick = () => setStart(d.start.lat, d.start.lng);
    document.querySelectorAll('[data-s]').forEach(b => b.onclick = () => {
      const [k, v] = b.dataset.s.split(':');
      const later = () => { clearTimeout(d.tm); d.tm = setTimeout(() => { saved = keep(); recompute(); }, 450); };   // several quick taps = one recalculation
      if(k === 'f'){ d.flyers = Math.max(100, num('#cFly', d.flyers) + +v); $('#cFly').value = d.flyers; d.nAuto = true; return later(); }
      d.n = Math.max(1, Math.min(20, d.n + +v)); $('#vN').textContent = d.n; d.nAuto = false; d.assign = {}; later();
    });
    if($('#cFly')) $('#cFly').onchange = () => { saved = keep(); d.flyers = Math.max(100, Math.round(num('#cFly', d.flyers))); d.nAuto = true; recompute(); };
    if($('#cQuota')) $('#cQuota').onchange = () => { saved = keep(); recompute(); };
    if($('#cTravel')) $('#cTravel').onchange = e => { saved = keep(); d.travel = e.target.value; d.bike = d.travel !== 'bus'; recompute(); };
    if($('#cHours')) $('#cHours').onchange = () => { saved = keep(); d.hours = Math.max(1, Math.min(12, num('#cHours', 7))); recompute(); };
    const od = $('#cOneDay'); if(od) od.onclick = () => { saved = keep(); d.n = 1; d.days = 1; d.assign = {}; recompute(); };
    const sg = $('#cSug'); if(sg) sg.onclick = () => { saved = keep(); d.n = d.sug; d.assign = {}; recompute(); };
    const red = $('#cReduce'); if(red) red.onclick = () => { saved = keep(); d.flyers = Math.max(100, cap.suggestedFlyers); d.nAuto = false; recompute(); };
    document.querySelectorAll('[data-r]').forEach(s => s.onchange = () => { d.assign[+s.dataset.r] = s.value || null; });
    if($('#cSave')) $('#cSave').onclick = save;
    if($('#cMustAdd')) $('#cMustAdd').onclick = () => drawMode(true, 'must');
    Object.values(towns).forEach(x => x.bind());
    if(addrSf){ addrSf.bind(); const ai = $('#cAddr'); if(ai && d.place) ai.value = d.place.name + (d.place.sub ? ', ' + d.place.sub : ''); }
    document.querySelectorAll('[data-srm]').forEach(b => b.onclick = () => { saved = keep(); d.side.splice(+b.dataset.srm, 1); recompute(); });
    if($('#cZoneDraw')) $('#cZoneDraw').onclick = () => { saved = keep(); drawMode(true, 'zone', d.zone); };
    if($('#cZoneAuto')) $('#cZoneAuto').onclick = () => { saved = keep(); d.zone = null; drawMust(); recompute(); };
    if($('#cZoneAll')) $('#cZoneAll').onclick = () => { saved = keep(); d.flyers += p.zone_mb - (d.flyers - (d.side || []).reduce((a, x) => a + (+x.flyers || 0), 0)); d.nAuto = true; recompute(); };
    if($('#cZoneFit')) $('#cZoneFit').onclick = () => { saved = keep(); d.flyers = Math.max(100, d.flyers - (d.flyers - (d.side || []).reduce((a, x) => a + (+x.flyers || 0), 0)) + Math.floor(p.zone_mb / 50) * 50); d.nAuto = true; recompute(); };
    document.querySelectorAll('[data-med]').forEach(b => b.onclick = async () => {
      const k = +b.dataset.med, inf = p && p.must_info && p.must_info[k], n = await askMustN(d.must[k].n, inf ? inf.avail : 0);
      if(n === null) return; saved = keep(); d.must[k].n = n; drawMust(); recompute();
    });
    document.querySelectorAll('[data-mpt]').forEach(b => b.onclick = () => { saved = keep(); const k = +b.dataset.mpt; drawMode(true, 'must', d.must[k].p, k); });
    document.querySelectorAll('[data-mrm]').forEach(b => b.onclick = () => { d.must.splice(+b.dataset.mrm, 1); drawMust(); recompute(); });
  }
  async function save(){
    if(d.busy || !d.plan) return;   // a recalculation is running: the plan on screen is not the final one yet
    saved = keep();
    const title = (saved.title || '').trim(); if(!title){ goStep(1); toast(t('needTitle')); return; }
    $('#cSave').disabled = true; $('#cSave').classList.add('loading');
    try{
      const pl = d.plan, quota = Math.max(200, Math.round(+saved.quota || 1500)), date = saved.date || null;
      const cityN = mainCity() || null;
      if(pl.split){ const by = new Map(pl.split.filter(x => x.name).map(x => [x.name, x.flyers])); d.must.forEach(a => { if(by.has(a.name)) a.n = by.get(a.name); }); d.side.forEach(x => { if(by.has(x.name)) x.flyers = by.get(x.name); }); }
      const row = { title:withCity(title, cityN), city_name:cityN, district:(d.place && d.place.district) || (tkE && tkE.district) || null, start_lat:d.start.lat, start_lng:d.start.lng,
        walk_minutes:15, zone_polygon:pl.zone, must_areas:d.must.length ? d.must.map(a => ({ p:a.p, n:a.n, name:a.name || undefined, c:a.c })) : null, side_towns:d.side.length ? d.side : null, bike:d.travel !== 'bus', travel:d.travel, split:d.split, work_area:d.zone || null, work_date:date, notes:(saved.notes || '').trim() || null, street_m:d.streetM || null,
        flyers:d.flyers, quota_m30:quota, no_quota:saved.noQuota != null ? !!saved.noQuota : d.travel === 'car', work_days:d.days, work_hours:d.hours, est_mailboxes:pl.mailboxes, route_m:pl.routes.reduce((s, r) => s + r.length_m, 0) };
      let tk, old = null;
      if(tkE){
        await loadLive(); if(A.live.some(r => r.task_id === tkE.id)) throw new Error(t('replanLive'));
        // order already running: keep acceptance, days, skips and the link of walked sessions to each worker's route
        const { data:oldP } = await sb.from('task_plans').select('id,worker_id,status,work_dates,accepted_at,committed_terms,skipped').eq('task_id', tkE.id);
        const { data:oldR } = await sb.from('routes').select('id,worker_id').eq('task_id', tkE.id).limit(1);
        old = oldR && oldR.length ? (oldP || []) : null;
        const u = await sb.from('tasks').update(row).eq('id', tkE.id).select().single(); if(u.error) throw u.error; tk = u.data;
        const x1 = await sb.from('task_plans').delete().eq('task_id', tkE.id); if(x1.error) throw x1.error;
        await sb.from('task_workers').delete().eq('task_id', tkE.id);
      }else{
        const ins = await sb.from('tasks').insert({ ...row, created_by:A.user.id }).select().single(); if(ins.error) throw ins.error; tk = ins.data;
      }
      const rows = pl.routes.map((r, i) => ({ task_id:tk.id, idx:i, worker_id:d.assign[i] || null, color:Planner.COLORS[i % 10], path:r.path, length_m:r.length_m, street_m:r.street_m, mailboxes:r.mailboxes, boxes:r.boxes, minutes:r.minutes, days:r.days, steps:r.steps }));
      if(old){
        const skips = old.flatMap(p => p.skipped || []);
        rows.forEach(r => {
          if(skips.length) r.skipped = skips;
          const o = old.find(p => p.worker_id && p.worker_id === r.worker_id && p.status === 'accepted'); if(!o) return;
          const need = (r.days || []).length || 1, dates = (o.work_dates || []).slice(0, need);
          if(dates.length >= need) Object.assign(r, { status:'accepted', work_dates:dates, accepted_at:o.accepted_at, committed_terms:o.committed_terms });
        });
      }
      await savePlans(tk, rows, !!old);
      await loadTasks();
      clearDraft(); viewTask(tk.id);
    }catch(e){ if($('#cErr')) $('#cErr').textContent = e.message; else toast(e.message); const sv = $('#cSave'); if(sv){ sv.disabled = false; sv.classList.remove('loading'); } }
  }
  renderSheet();
  if(tkE) setStart(tkE.start_lat, tkE.start_lng);
  else restoreDraft();
}
// saves plans, links workers and sends each assigned worker a notification
async function savePlans(tk, rows, replanned){
  let ins = [];
  if(rows.length){ const r = await sb.from('task_plans').insert(rows).select(); if(r.error) throw r.error; ins = r.data || []; }
  const ws = [...new Set(rows.map(r => r.worker_id).filter(Boolean))];
  if(ws.length) await sb.from('task_workers').upsert(ws.map(w => ({ task_id:tk.id, worker_id:w })), { onConflict:'task_id,worker_id', ignoreDuplicates:true });
  if(replanned){
    // walked sessions follow their worker to the new route (day maps, "Gelaufen", flyers along the plan)
    for(const p of ins) if(p.worker_id) await sb.from('routes').update({ plan_id:p.id }).eq('task_id', tk.id).eq('worker_id', p.worker_id);
    for(const p of ins) if(p.worker_id) await notifyReplanned(tk, p);
    return;
  }
  for(const p of ins) if(p.worker_id) await notifyAssigned(tk, p);
}
async function notifyReplanned(tk, p){
  const date = tk.work_date ? fmtDay(tk.work_date) + ' · ' : '';
  await sb.from('notifications').insert({ worker_id:p.worker_id, kind:'assigned', task_id:tk.id, plan_id:p.id, title:t('routeChangedTitle', { title:tk.title }),
    body:p.status === 'accepted' ? t('routeChangedBody', { date, mb:fmtN(p.mailboxes || 0), km:fmtDist(p.length_m || 0) }) : t('routeChangedDays') });
}
async function notifyAssigned(tk, p){
  const date = tk.work_date ? fmtDay(tk.work_date) + ' · ' : '';
  await sb.from('notifications').insert({ worker_id:p.worker_id, kind:'assigned', task_id:tk.id, plan_id:p.id, title:t('newTaskTitle', { title:tk.title }), body:t('newTaskBody', { date, mb:fmtN(p.mailboxes || 0), km:fmtDist(p.length_m || 0) }) });
}

/* edit an existing task: texts / date / pace right here; flyers, workers and routes only while nobody has walked yet */
// the city always belongs in the order's name ("Löhne · Bahnhofstraße 94")
const withCity = (title, city) => city && !title.toLowerCase().includes(String(city).toLowerCase()) ? city + ' · ' + title : title;
function editTaskSheet(tk, plans, routes){
  const day = tk.work_date ? String(tk.work_date).slice(0, 10) : '';
  const mo = modal(`<h2>${esc(t('editTask'))}</h2>
    <label class="f">${esc(t('title'))}</label><input class="in" id="eTitle" value="${esc(tk.title)}">
    <div class="steppers"><div><label class="f">${esc(t('startDate'))}</label><input class="in" type="date" id="eDate" value="${esc(day)}"></div><div><label class="f">${esc(t('hoursDay'))}</label><input class="in" type="number" id="eHours" min="1" max="12" step="0.5" value="${+tk.work_hours || 7}"></div></div>
    <label class="f">${esc(t('quota'))}</label><input class="in" type="number" id="eQuota" min="200" step="100" value="${tk.quota_m30 || 1500}">
    <label class="f" for="eTravel">${esc(t('travelLbl'))}</label><select class="in" id="eTravel">${['bus', 'bike', 'car'].map(v => `<option value="${v}" ${(tk.travel || (tk.bike ? 'bike' : 'bus')) === v ? 'selected' : ''}>${esc(t('travel_' + v))}</option>`).join('')}</select>
    <label class="f">${esc(t('note'))}</label><textarea class="in" id="eNotes">${esc(tk.notes || '')}</textarea>
    <button class="btn primary" id="eSave" style="margin-top:12px">${esc(t('save'))}</button>
    ${!routes.length ? `<button class="btn ghost" id="eReplan">${esc(t('replan'))}</button>` : A.live.some(r => r.task_id === tk.id) ? `<p class="small muted">${esc(t('replanLive'))}</p>` : `<button class="btn ghost" id="eReplan">${esc(t('replanWork'))}</button><p class="small muted">${esc(t('replanWorkHint'))}</p>`}
    <button class="btn ghost" id="eClose">${esc(t('close'))}</button><div class="err" id="eErr"></div>`);
  mo.querySelector('#eClose').onclick = () => mo.remove();
  mo.querySelector('#eSave').onclick = async () => {
    const title = mo.querySelector('#eTitle').value.trim(); if(!title){ mo.querySelector('#eErr').textContent = t('needTitle'); return; }
    const { error } = await sb.from('tasks').update({ title:withCity(title, tk.city_name), work_date:mo.querySelector('#eDate').value || null, work_hours:Math.max(1, Math.min(12, parseFloat(mo.querySelector('#eHours').value) || 7)), quota_m30:Math.max(200, Math.round(+mo.querySelector('#eQuota').value || 1500)), notes:mo.querySelector('#eNotes').value.trim() || null, bike:mo.querySelector('#eTravel').value !== 'bus', travel:mo.querySelector('#eTravel').value }).eq('id', tk.id);
    if(error){ mo.querySelector('#eErr').textContent = error.message; return; }
    // new quota → the hours of the routes follow (route length ÷ quota × 30 min), no new planning needed
    const q = Math.max(200, Math.round(+mo.querySelector('#eQuota').value || 1500));
    if(q !== (tk.quota_m30 || 1500)) for(const p of plans || []){
      const mm = (len, mb) => Math.round((len || 0) / q * 30 + (mb || 0) * 5 / 60);   // walking at the quota + 5 s per mailbox (as the planner)
      await sb.from('task_plans').update({ minutes:mm(p.length_m, p.mailboxes), days:Array.isArray(p.days) ? p.days.map(x => ({ ...x, minutes:mm(x.length_m, x.mailboxes) })) : p.days }).eq('id', p.id);
    }
    mo.remove(); await loadTasks(); toast(t('saved')); viewTask(tk.id);
  };
  const rp = mo.querySelector('#eReplan'); if(rp) rp.onclick = () => { mo.remove(); viewCreate({ tk, plans }); };
}
/* task detail: info + map + routes with status, worker assignment and progress */
const dayLines = (days, col, pid) => (days && days.length > 1) ? days.map((x, k) => `<span class="small day-line"><b><i class="dsw" style="background:${esc(dayColor(col, k))}"></i>${esc(t('dayN', { n:k + 1 }) + (x.place ? ' · ' + x.place : ''))}</b> ${esc(t('routeLine', { km:fmtDist(x.length_m), h:fmtHm(x.minutes), mb:fmtN(x.mailboxes) }))}${pid ? `<em class="day-pct" id="dp${pid}_${k}"></em>` : ''}</span>`).join('') : '';
const stText = p => p.status === 'accepted' ? t('stAccepted') : p.status === 'declined' ? t('stDeclined') : p.status === 'done' ? t('stDone') : t('stOffered');
const stCls = p => p.status === 'done' ? 'ok' : p.status === 'accepted' ? '' : p.status === 'declined' ? 'bad' : 'neutral';   // angeboten = neutral, angenommen = blau, erledigt = grün, abgelehnt = rot
// walked so far on one route (all sessions, also the running one; a session lying inside another one counts once)
const PLAN_TR = {};   // tracker of each route of the open order (all tracks): how many days are left for a successor
// earlier workers of this route: their km and hours stay theirs (shown under the route)
function prevWorkers(p, routes){
  const by = new Map(); for(const r of routes || []) if(r.plan_id === p.id && r.worker_id && r.worker_id !== p.worker_id){ if(!by.has(r.worker_id)) by.set(r.worker_id, []); by.get(r.worker_id).push(r); }
  return [...by].map(([wid, rs]) => { const w = wById(wid), dd = mergeDays(rs), m = rs.reduce((a, r) => a + (r.distance_m || 0), 0), min = dd.reduce((a, r) => a + workMin(r), 0);
    return `<span class="small muted">${esc(t('prevWorker', { n:w ? w.name : '?', km:fmtDist(m), h:fmtHm(min) }))}</span>`; }).join('');
}
function planWalked(p, routes){
  const rs = (routes || []).filter(r => (r.plan_id === p.id && (!p.worker_id || r.worker_id === p.worker_id)) || (!r.plan_id && r.worker_id && r.worker_id === p.worker_id));
  const end = r => r.ended_at ? +new Date(r.ended_at) : Date.now();
  const own = rs.filter(r => !rs.some(o => o !== r && o.worker_id === r.worker_id && +new Date(o.started_at) <= +new Date(r.started_at) && end(o) >= end(r) && (o.distance_m || 0) > (r.distance_m || 0)));
  if(!own.length) return '';
  const m = own.reduce((s, r) => s + (r.distance_m || 0), 0), dd = mergeDays(own), min = dd.reduce((s, r) => s + workMin(r), 0);
  const live = own.some(r => !r.ended_at);
  return esc(t('walkedLine', { km:fmtDist(m), h:fmtHm(min) }) + brkTxt(dd.reduce((s, r) => s + brkMin(r), 0))) + (live ? ' · <b class="live-txt">' + esc(t('walkedLive')) + '</b>' : '');
}
function taskHours(plans, routes){
  const ownR = p => { const rs = (routes || []).filter(r => r.plan_id === p.id || (!r.plan_id && r.worker_id && r.worker_id === p.worker_id)); const end = r => r.ended_at ? +new Date(r.ended_at) : Date.now();
    return rs.filter(r => !rs.some(o => o !== r && o.worker_id === r.worker_id && +new Date(o.started_at) <= +new Date(r.started_at) && end(o) >= end(r) && (o.distance_m || 0) > (r.distance_m || 0))); };
  const seen = new Set(); let done = 0, brk = 0;
  const mine = []; (plans || []).forEach(p => ownR(p).forEach(r => { if(!seen.has(r.id)){ seen.add(r.id); mine.push(r); } }));
  mergeDays(mine).forEach(r => { done += workMin(r); brk += brkMin(r); });
  const plan = (plans || []).reduce((s, p) => s + (p.minutes || 0), 0);
  PROG.h = plan ? Math.min(100, 100 * done / plan) : null; setTimeout(showProg);
  return esc(fmtHm(done)) + ' / ' + esc(fmtHm(plan)) + ' ' + esc(t('h')) + esc(brkTxt(brk));
}
// one progress figure of an order: share of the routes walked or closed (else flyers, else working time)
const PROG = { h:null, f:null, r:null };
function showProg(){
  const el = $('#tProg'); if(!el) return;
  // the walked/closed share of the routes is the real progress; working time against the plan only when no route can be measured
  const v = PROG.r != null ? PROG.r : PROG.f != null ? PROG.f : PROG.h; el.textContent = v != null ? Math.round(v) + ' %' : '—';
}
async function viewTask(id){
  PROG.h = PROG.f = PROG.r = null; PROG._d = PROG._l = 0;
  const tk = A.tasks.find(x => x.id === id); if(!tk) return viewTasks();
  A.curTask = id;
  const [{ data:plans }, { data:routes }] = await Promise.all([sb.from('task_plans').select('*').eq('task_id', id).order('idx'), sb.from('routes').select('*').eq('task_id', id)]);
  const walked = (routes || []).reduce((s, r) => s + r.distance_m, 0);
  const invite = w => t('invite', { name:w.name, title:tk.title, date:tk.work_date ? ', ' + fmtDay(tk.work_date) : '' });
  shell('tasks', `${topbar(tk.title, true)}
    <div class="pad">
      <h2 class="sec" style="margin-top:4px">${esc(t('taskInfo'))}</h2>
      <div class="info">
        <div><span>${esc(t('place'))}</span><b>${esc([tk.district, tk.city_name].filter(Boolean).join(', ') || '—')}</b></div>
        <div><span>${esc(t('date'))}</span><b>${esc(fmtDay(tk.work_date))}</b></div>
        ${tk.flyers ? `<div><span>${esc(t('flyers'))}</span><b>${esc(fmtN(tk.flyers))} · ${esc(t('mbApprox', { n:fmtN(tk.est_mailboxes || 0) }))}</b></div>` : ''}
        ${tk.route_m ? `<div><span>${esc(t('dist2'))}</span><b>${esc(fmtDist(tk.route_m))}</b></div>` : ''}
        ${tk.quota_m30 ? `<div><span>${esc(t('quotaInfo'))}</span><b>${fmtN(tk.quota_m30)} m / 30 ${esc(t('min'))}</b></div>` : ''}
        ${(tk.travel && tk.travel !== 'bus') || tk.bike ? `<div><span>${esc(t('travelLbl'))}</span><b>${esc(t('travel_' + (tk.travel || 'bike')))}</b></div>` : ''}
        ${(tk.side_towns || []).length ? `<div><span>${esc(t('sideTitle'))}</span><b>${esc(tk.side_towns.map(x => x.name + ' (' + fmtN(x.flyers) + ')').join(', '))}</b></div>` : ''}
        ${(tk.must_areas || []).length ? `<div><span>${esc(t('mustTitle'))}</span><b>${esc(tk.must_areas.map((a, k) => mName(mArea(a), k) + (mArea(a).n ? ' (' + fmtN(mArea(a).n) + ')' : '')).join(', '))}</b></div>` : ''}
        <div><span>${esc(t('walkedLbl'))}</span><b>${esc(fmtDist(walked))}</b></div>
        <div><span>${esc(t('progLbl'))}</span><b id="tProg">—</b></div>
        <div><span>${esc(t('hoursLbl'))}</span><b id="tHrs">${taskHours(plans, routes)}</b></div>
        <div id="tFlRow" ${tk.flyers_done != null ? '' : 'style="display:none"'}><span>${esc(t('handedLbl'))} <button class="link" id="tFlEdit" style="font-size:12px">${esc(t('adjust'))}</button></span><b id="tFl">${tk.flyers_done != null ? '≈ ' + fmtN(tk.flyers_done) + (tk.flyers ? ' / ' + fmtN(tk.flyers) : '') : ''}</b>${tk.flyers_done != null ? `<small class="muted">${esc(t('flDoneManual', { d:fmtDT(tk.flyers_done_at) }))}${(A.live || []).some(r => r.task_id === tk.id) ? ' · ' + esc(t('stillWorking')) : ''}</small>` : ''}</div>
        ${tk.notes ? `<div><span>${esc(t('note'))}</span><b>${esc(tk.notes)}</b></div>` : ''}
      </div>
      <div class="mapbox" id="tMap"></div>
      <div class="rinfo-row"><span>${statusPill(...taskState(tk))}</span><button class="btn ghost small" id="tBig">${ICONS.expand}${esc(t('rvBig'))}</button></div>
      <h2 class="sec">${esc(t('routesOf'))}</h2>
      ${(() => { const by = {}; (plans || []).forEach(p => { if(p.worker_id) (by[p.worker_id] = by[p.worker_id] || []).push(p); });
        return Object.entries(by).filter(([, ps]) => ps.length > 1).map(([wid, ps]) => { const w = wById(wid);
          return `<div class="hint" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="grow">${esc(t('mergeHint', { n:w ? w.name : '?', k:ps.length }))}</span><button class="btn primary small" data-merge="${wid}">${ICONS.route}${esc(t('mergeBtn'))}</button></div>`; }).join(''); })()}
      ${(plans || []).length ? plans.map(p => { const w = wById(p.worker_id); return `<div class="route-row"><span class="swatch" style="background:${esc(p.color || '#2563EB')}"></span>
        <div class="grow"><b>${esc(t('planRoute', { n:p.idx + 1 }))} <span class="muted" id="pp${p.idx}"></span></b>
        <span>${esc(t('routeLine', { km:fmtDist(p.length_m), h:fmtHm(p.minutes || 0), mb:fmtN(p.mailboxes || 0) }))}</span>
        ${dayLines(p.days, p.color, p.idx)}<span class="small" id="prest${p.idx}" style="font-weight:600"></span><button class="link small hidden" id="pred${p.idx}" data-reday="${p.id}" style="align-self:flex-start">${ICONS.calendar}${esc(t('redayBtn'))}</button>
        <div class="bar"><i id="pb${p.idx}"></i></div><span id="pf${p.idx}" style="margin-top:4px"></span><span class="small" id="pw${p.idx}">${planWalked(p, routes)}</span>${prevWorkers(p, routes)}
        ${p.worker_id ? `<div class="rr-status"><span class="pill ${(A.live || []).some(r => r.plan_id === p.id && !r.paused_at) ? 'live' : stCls(p)}">${(A.live || []).some(r => r.plan_id === p.id && !r.paused_at) ? esc(t('stLive')) + ' · ' : ''}${esc(stText(p))}${p.status === 'accepted' && (p.work_dates || []).length ? ' · ' + esc(p.work_dates.map(fmtDay).join(', ')) : ''}</span>${p.status === 'accepted' ? `<button class="link small" data-dates="${p.id}">${ICONS.edit}${esc(t('chgDates'))}</button>` : ''}</div>` : ''}
        ${w ? `<button class="rr-worker" data-wk="${w.id}">${avatar()}<span class="grow"><b>${esc(w.name)}</b><small>${esc(t('openWorker'))}</small></span><span class="rr-chev">›</span></button>
        <div class="rr-btns"><a class="btn ghost small" target="_blank" rel="noopener" href="${waLink(w.phone, invite(w))}">${ICONS.chat}${esc(t('write'))}</a><button class="btn ghost small" data-swap="${p.id}">${ICONS.users}${esc(t('swapWorker'))}</button></div>` : ''}
        <div class="rr-swap" id="sw${p.id}" ${w ? 'hidden' : ''}><select class="in small" data-plan="${p.id}">${workerOptions(tk.start_lat, tk.start_lng, p.worker_id)}</select><span class="small muted">${esc(t('replaceHint'))}</span></div></div></div>`; }).join('') : `<p class="muted small">${esc(t('noPlans'))}</p>`}
      <div class="tool-row" style="margin-top:16px"><button class="btn ghost small" id="tEdit">${ICONS.edit}${esc(t('editTask'))}</button><button class="btn ghost small" id="tDone">${ICONS.check}${esc(tk.status === 'open' ? t('finish') : t('reopen'))}</button></div>
      ${A.company && A.company.master ? `<button class="btn ghost small" id="tMerge" style="margin-top:8px;width:auto">${ICONS.plus}${esc(t('mergeTasks'))}</button>` : ''}
      <p class="danger-row">${tk.status === 'open' ? `<button class="link" id="tCancel">${esc(t('cancelTask'))}</button><span aria-hidden="true">·</span>` : ''}<button class="link danger-text" id="tDel">${esc(t('del'))}</button></p>
    </div>`); setLoc('task/' + id);
  bindBack(viewTasks);
  const m = makeMap($('#tMap'), [tk.start_lat, tk.start_lng], 14);
  let b = L.latLngBounds([[tk.start_lat, tk.start_lng]]);
  if(tk.zone_polygon){ const z = L.polygon(tk.zone_polygon, { color:css('--brand'), weight:2, fillOpacity:.06, interactive:false }).addTo(m); b = z.getBounds(); }
  drawTowns(m, tk, 2);
  if(tk.work_area) L.polygon(tk.work_area, { color:'#7C3AED', weight:2, dashArray:'10 6', fillOpacity:.03, interactive:false }).addTo(m);
  (plans || []).forEach(p => { if(!(p.path?.length > 1)) return; const ds = (p.days || []).length > 1 ? p.days : [{ i0:0, i1:p.path.length - 1 }];
    ds.forEach((d, k) => L.polyline(Planner.pathRuns(p.path.slice(d.i0, d.i1 + 1)), { color:dayColor(p.color, k), weight:4, opacity:.7, dashArray:k ? '10 8' : null }).addTo(m)); });
  drawSkips(m, plans);
  (plans || []).forEach(p => drawJumps(m, p.path, (tk.travel || (tk.bike ? 'bike' : 'bus'))));
  const doneLayer = L.layerGroup().addTo(m);
  L.marker([tk.start_lat, tk.start_lng], { icon:dot('pin-start', 24) }).addTo(m);
  liveWorkers(L.layerGroup().addTo(m), tk, plans, () => true);
  fit(m, b, 16);
  document.querySelectorAll('[data-plan]').forEach(sel => sel.onchange = async () => {
    const wid = sel.value || null, p = plans.find(x => x.id === sel.dataset.plan);
    // a new worker takes over the rest of the route: progress stays with the plan
    // the successor only picks dates for the days that are not done yet
    let left = null; const tr = PLAN_TR[p.id];
    if(tr && p.days && p.days.length > 1){ try{ left = Math.max(1, dayProgress(p, tr).filter(x => x < 95).length); }catch{} }
    const { error } = await sb.from('task_plans').update({ worker_id:wid, status:'offered', work_dates:[], accepted_at:null, days_left:left }).eq('id', p.id);
    if(error){ toast(error.message); return; }
    // the previous worker no longer sees the order (his km, hours and tracks stay saved with the route)
    if(p.worker_id && p.worker_id !== wid && !plans.some(x => x.id !== p.id && x.worker_id === p.worker_id)) await sb.from('task_workers').delete().eq('task_id', id).eq('worker_id', p.worker_id);
    if(wid){
      await sb.from('task_workers').upsert({ task_id:id, worker_id:wid }, { onConflict:'task_id,worker_id', ignoreDuplicates:true });
      await notifyAssigned(tk, { ...p, worker_id:wid });
    }
    await loadTasks(); toast(t('saved')); viewTask(id);
  });
  // one worker on several routes of the order: the routes become one (days after each other, progress and sessions stay)
  // the rest of a route on N days: same line (walked parts stay walked and are passed over), new day cuts so that
  // every day gets the same open work; for a successor who does the rest alone
  document.querySelectorAll('[data-reday]').forEach(bt => bt.onclick = async () => {
    const p = (plans || []).find(x => x.id === bt.dataset.reday), tr = p && PLAN_TR[p.id]; if(!tr) return;
    const cur = p.days && p.days.length > 1 ? dayProgress(p, tr).filter(x => x < 95).length : 1;
    const mo = modal(`<h2>${esc(t('redayBtn'))}</h2><p class="muted small">${esc(t('redayHint'))}</p><label class="f" for="rdN">${esc(t('redayN'))}</label><input class="in" id="rdN" type="number" min="1" max="14" value="${Math.max(1, p.days_left || cur)}"><button class="btn primary" id="rdGo" style="margin-top:12px">${esc(t('save'))}</button><div class="err" id="rdErr"></div>`);
    mo.querySelector('#rdGo').onclick = async () => {
      const n = Math.max(1, Math.min(14, parseInt(mo.querySelector('#rdN').value, 10) || 1));
      const nav = makeNav(p), L = p.path.length, S = new Float64Array(L), O = new Float64Array(L);
      for(let i = 1; i < tr.samples.length; i++){ const j = Math.min(L - 2, Math.max(0, Math.ceil(nav.posOf[i] - 1e-9) - 1)); S[j]++; if(!tr.isDone(i)) O[j]++; }
      const sAll = S.reduce((a, b) => a + b, 0) || 1, oAll = O.reduce((a, b) => a + b, 0);
      if(!oAll){ mo.querySelector('#rdErr').textContent = t('restNone'); return; }
      const cuts = [0]; let acc = 0, k = 1;
      for(let j = 0; j < L - 1 && k < n; j++){ acc += O[j]; if(acc >= oAll * k / n){ cuts.push(j + 1); k++; } }
      cuts.push(L - 1);
      const days = [];
      for(let d = 0; d + 1 < cuts.length; d++){
        const i0 = cuts[d], i1 = cuts[d + 1]; let s = 0; for(let j = i0; j < i1; j++) s += S[j];
        const f = s / sAll; days.push({ i0, i1, minutes:Math.round((p.minutes || 0) * f), length_m:Math.round((p.length_m || 0) * f), street_m:Math.round((p.street_m || 0) * f), mailboxes:Math.round((p.mailboxes || 0) * f) });
      }
      const { error } = await sb.from('task_plans').update({ days, days_left:null, work_dates:[], status:p.worker_id ? 'offered' : p.status, accepted_at:null }).eq('id', p.id);
      if(error){ mo.querySelector('#rdErr').textContent = error.message; return; }
      mo.remove(); if(p.worker_id) await notifyAssigned(tk, p); await loadTasks(); toast(t('saved')); viewTask(id);
    };
  });
  document.querySelectorAll('[data-merge]').forEach(bt => bt.onclick = async () => {
    const ps = (plans || []).filter(p => p.worker_id === bt.dataset.merge).sort((a, b) => a.idx - b.idx), w = wById(bt.dataset.merge);
    if(ps.length < 2 || !await confirmBox(t('mergeBtn'), t('mergeQ', { n:w ? w.name : '?', k:ps.length }), t('mergeBtn'))) return;
    bt.disabled = true;
    let left = 0, known = true;
    for(const p of ps){ const tr = PLAN_TR[p.id]; if(!tr){ known = false; break; } try{ left += p.days && p.days.length > 1 ? dayProgress(p, tr).filter(x => x < 95).length : (tr.pct() < 95 ? 1 : 0); }catch{ known = false; } }
    for(let i = 1; i < ps.length; i++){
      const { error } = await sb.rpc('merge_plans', { p_keep:ps[0].id, p_other:ps[i].id, p_days_left:i === ps.length - 1 && known ? Math.max(1, left) : null });
      if(error){ toast(error.message); bt.disabled = false; return; }
    }
    await loadTasks(); toast(t('saved')); viewTask(id);
  });
  document.querySelectorAll('[data-swap]').forEach(bt => bt.onclick = () => { const b = document.getElementById('sw' + bt.dataset.swap); if(b) b.hidden = !b.hidden; });
  document.querySelectorAll('[data-wk]').forEach(bt => bt.onclick = () => viewWorker(bt.dataset.wk, () => viewTask(id)));
  document.querySelectorAll('[data-dates]').forEach(bt => bt.onclick = () => {
    const p = plans.find(x => x.id === bt.dataset.dates), ds = (p.work_dates || []).map(d => String(d).slice(0, 10)).sort(), n = Math.max(1, ds.length, (p.days || []).length);
    const mo = modal(`<h2>${esc(t('chgDates'))}</h2><p class="muted small">${esc(t('planRoute', { n:p.idx + 1 }))}${wById(p.worker_id) ? ' · ' + esc(wById(p.worker_id).name) : ''}</p>
      <div class="dates">${Array.from({ length:n }, (_, i) => `<label><span>${esc(t('dayN', { n:i + 1 }))}</span><input class="in" type="date" data-ad="${i}" value="${esc(ds[i] || '')}"></label>`).join('')}</div>
      <button class="btn primary" id="adSave">${esc(t('save'))}</button><button class="btn ghost" id="adX">${esc(t('close'))}</button><div class="err" id="adErr"></div>`);
    mo.querySelector('#adX').onclick = () => mo.remove();
    mo.querySelector('#adSave').onclick = async () => {
      const dates = [...mo.querySelectorAll('[data-ad]')].map(i => i.value).filter(Boolean).sort();
      if(!dates.length || new Set(dates).size !== dates.length){ mo.querySelector('#adErr').textContent = t('e_date_required'); return; }
      const { error } = await sb.from('task_plans').update({ work_dates:dates }).eq('id', p.id);
      if(error){ mo.querySelector('#adErr').textContent = error.message; return; }
      await sb.from('notifications').insert({ worker_id:p.worker_id, kind:'assigned', task_id:id, plan_id:p.id, title:t('datesChangedTitle', { title:tk.title }), body:dates.map(fmtDay).join(', ') });
      mo.remove(); toast(t('saved')); viewTask(id);
    };
  });
  $('#tBig').onclick = () => viewTaskMap(id, () => viewTask(id));
  $('#tEdit').onclick = () => editTaskSheet(tk, plans || [], routes || []);
  if($("#tMerge")) $("#tMerge").onclick = () => mergeDialog(tk);
  // the admin enters how many flyers are really out (counted packs); empty = back to the GPS estimate
  if($('#tFlEdit')) $('#tFlEdit').onclick = () => {
    const m = modal(`<h2>${esc(t('handedLbl'))}</h2><p class="small muted">${esc(t('flDoneHint'))}</p>
      <input class="in" id="fdN" type="number" min="0" step="100" inputmode="numeric" value="${tk.flyers_done != null ? tk.flyers_done : ''}" placeholder="${esc(t('flDoneAuto'))}">
      <button class="btn primary" id="fdGo" style="margin-top:12px">${esc(t('save'))}</button><button class="btn ghost" id="fdNo">${esc(t('back'))}</button><div class="err" id="fdErr"></div>`);
    m.querySelector('#fdNo').onclick = () => m.remove();
    m.querySelector('#fdGo').onclick = async () => {
      const raw = m.querySelector('#fdN').value.trim(), n = raw === '' ? null : Math.max(0, Math.round(+raw));
      if(raw !== '' && !isFinite(n)){ m.querySelector('#fdErr').textContent = t('flDoneBad'); return; }
      const { error } = await sb.from('tasks').update({ flyers_done:n, flyers_done_at:n == null ? null : new Date().toISOString() }).eq('id', tk.id);
      if(error){ m.querySelector('#fdErr').textContent = error.message; return; }
      m.remove(); await loadTasks(); viewTask(tk.id);
    };
  };
  if($('#tCancel')) $('#tCancel').onclick = async () => { if(!await confirmBox(t('cancelTask'), t('cancelTaskQ'), t('cancelTask'), true)) return; const { error } = await sb.from('tasks').update({ status:'cancelled' }).eq('id', id); if(error) return toast(error.message); await loadTasks(); viewTask(id); };
  $('#tDone').onclick = async () => { const { error } = await sb.from('tasks').update({ status:tk.status === 'open' ? 'done' : 'open' }).eq('id', id); if(error) return toast(error.message); await loadTasks(); viewTask(id); };
  $('#tDel').onclick = async () => { if(!await confirmBox(t('del'), t('delTaskQ'), t('del'), true)) return; await sb.from('tasks').delete().eq('id', id); await loadTasks(); viewTasks(); };
  if((routes || []).some(r => !r.ended_at)){
    const iv = setInterval(async () => {
      if(A.curTask !== id || !$('#tMap')){ clearInterval(iv); return; }
      const { data } = await sb.from('routes').select('*').eq('task_id', id); if(!data) return;
      (plans || []).forEach(p => { const el = $('#pw' + p.idx); if(el) el.innerHTML = planWalked(p, data); });
      const th = $('#tHrs'); if(th) th.innerHTML = taskHours(plans, data);
    }, 60000);
  }
  // progress per route: all tracks recorded on that plan (also by a previous worker)
  const byPlan = {}, allTracks = [];
  for(const r of routes || []){
    const pid = r.plan_id || (plans.find(p => p.worker_id === r.worker_id) || {}).id; if(!pid) continue;
    const wr = Planner.walkRuns(await fetchPoints(r.id)).walk; (byPlan[pid] = byPlan[pid] || []).push(...wr); allTracks.push(...wr);
  }
  let flSum = 0, flHas = false;
  for(const p of plans || []){
    if((!allTracks.length && !(p.skipped || []).length) || !p.path?.length){ PROG._l = (PROG._l || 0) + (p.length_m || 0); continue; }
    byPlan[p.id] = byPlan[p.id] || [];
    const tr = addSkips(Planner.makeTracker(p.path), p), ct = p.boxes && p.boxes.length ? Planner.makeBoxCounter(p.boxes) : null;
    allTracks.forEach(pts => { tr.addTrack(pts); if(ct) ct.visitAll(pts); });
    if(ct) adminDone(p).forEach(pts => ct.visitAll(pts));
    PLAN_TR[p.id] = tr;
    { const L = p.length_m || 0; PROG._d = (PROG._d || 0) + tr.pct() * L; PROG._l = (PROG._l || 0) + L; if(PROG._l) { PROG.r = PROG._d / PROG._l; showProg(); } }
    // per day: done or how far; and what is still open (what a new worker gets)
    try{
      const ds = p.days && p.days.length > 1 ? p.days : [{ minutes:p.minutes, length_m:p.length_m }], dp = p.days && p.days.length > 1 ? dayProgress(p, tr) : [tr.pct()];
      dp.forEach((x, k) => { const el = $('#dp' + p.idx + '_' + k); if(el) el.textContent = x >= 95 ? ' · ✓ ' + t('dayDone') : ' · ' + Math.round(x) + ' % · ' + t('openH', { h:fmtHm((ds[k].minutes || 0) * (1 - x / 100)) }); });
      const restMin = ds.reduce((a, d, k) => a + (d.minutes || 0) * (dp[k] >= 95 ? 0 : 1 - (dp[k] || 0) / 100), 0), restM = ds.reduce((a, d, k) => a + (d.length_m || 0) * (dp[k] >= 95 ? 0 : 1 - (dp[k] || 0) / 100), 0);
      const re = $('#prest' + p.idx); if(re) re.textContent = restMin > 1 ? t('restLine', { km:fmtDist(restM), h:fmtHm(restMin) }) : t('restNone');
      const rb = $('#pred' + p.idx); if(rb && restMin > 1 && dp.some(x => x > 0)) rb.classList.remove('hidden');
    }catch{}   // also streets of this route walked by somebody else
    tr.runs().forEach(run => L.polyline(run, { color:GREEN_C(), weight:6, opacity:.95 }).addTo(doneLayer));
    const pct = tr.pct(); const el = $('#pp' + p.idx); if(el) el.textContent = '· ' + t('done', { p:pct }); const bar = $('#pb' + p.idx); if(bar) bar.style.width = pct + '%';
    const pf = $('#pf' + p.idx); if(pf && ct) pf.textContent = t('flyersDone', { a:fmtN(ct.count()), b:fmtN(ct.total) }) + (ct.total ? ' · ' + Math.round(ct.count() / ct.total * 100) + ' %' : '');
    if(ct){ flSum += ct.count(); flHas = true; }
  }
  const fr = $('#tFlRow'), fe = $('#tFl');
  if(tk.flyers_done != null){ if(fr){ fr.style.display = ''; PROG.f = tk.flyers ? Math.min(100, 100 * tk.flyers_done / tk.flyers) : null; showProg(); } return; }   // the admin's count wins over the estimate
  if(fr && fe && flHas){ const tot = tk.flyers || 0; fe.textContent = '≈ ' + fmtN(flSum) + (tot ? ' / ' + fmtN(tot) : ''); fr.style.display = ''; PROG.f = tot ? Math.min(100, 100 * flSum / tot) : null; showProg(); }
}

/* ---------- worker view for the admin (no SMS needed): own number, or a test worker ---------- */
async function openAsWorker(){
  const hasPhone = !!(A.user && A.user.phone);
  const { data:tw } = await sb.from('workers').select('id,name,token,phone').like('phone', DEMO_PHONE + '%').order('phone');
  const mo = modal(`<h2>${esc(t('testTitle'))}</h2><p class="muted small">${esc(t('testHint'))}</p>
    ${hasPhone ? `<button class="btn primary" id="oOwn">${esc(t('testOwn'))}</button>` : ''}
    ${(tw || []).map((w, i) => `<button class="btn ${hasPhone || i ? 'ghost' : 'primary'}" data-w="${i}">${esc(w.name)}</button>`).join('')}
    <button class="btn ghost" id="oNew">${esc(t('testCreate'))}</button><div class="err" id="oErr"></div>`);
  const enter = async token => { mo.remove(); A.hooks.openWorkerToken && await A.hooks.openWorkerToken(token); };
  if(hasPhone) mo.querySelector('#oOwn').onclick = () => { mo.remove(); A.hooks.switchRole && A.hooks.switchRole('worker'); };
  mo.querySelectorAll('[data-w]').forEach(b => b.onclick = () => enter(tw[+b.dataset.w].token));
  mo.querySelector('#oNew').onclick = async () => {
    const n = (tw || []).length + 1;
    const { data, error } = await sb.from('workers').insert({ name:t('testWorkerName') + (n > 1 ? ' ' + n : ''), phone:DEMO_PHONE + 'T' + n + Date.now().toString().slice(-4) + demoSuffix(), cities:[{ name:'Düsseldorf', lat:51.2277, lng:6.7735 }], zone_minutes:60, pin_hash:'demo', notes:'Demo' }).select('id,token').single();
    if(error){ mo.querySelector('#oErr').textContent = error.message; return; }
    await loadWorkers(); enter(data.token);
  };
}

/* ---------- DEMO (pitch) ---------- */
const DEMO_PHONE = '+4900000000';
const demoSuffix = () => (A.company && A.company.id ? '.' + A.company.id.slice(0, 6) : '');
const DEMO_WORKERS = [['Lena Becker (Demo)', 'Düsseldorf', 51.2277, 6.7735, 60], ['Murat Yılmaz (Demo)', 'Düsseldorf', 51.2277, 6.7735, 45], ['Anna Kowalski (Demo)', 'Neuss', 51.2042, 6.6879, 60], ['Jonas Weber (Demo)', 'Köln', 50.9375, 6.9603, 60], ['Sara Haddad (Demo)', 'Essen', 51.4556, 7.0116, 90], ['Tim Schulz (Demo)', 'Duisburg', 51.4344, 6.7623, 30]];
const DEMO_TASK = { title:'Düsseldorf Bilk (Demo)', city:'Düsseldorf', district:'Bilk', lat:51.20655, lng:6.77655, flyers:1500, notes:{ de:'1.500 Flyer der Pizzeria „Da Mario". Abholen am Eingang der Bilk Arcaden.', ru:'1500 флаеров пиццерии «Da Mario». Забрать у входа в Bilk Arcaden.' } };
async function demoRows(){ const { data, error } = await sb.from('workers').select('id,name,token').like('phone', DEMO_PHONE + '%').order('phone'); if(error) throw error; return data; }
async function pushBatches(token, rid, pts, t0, step){
  for(let i = 0; i < pts.length; i += 300){ const batch = pts.slice(i, i + 300).map((p, k) => ({ t:new Date(t0 + (i + k) * step).toISOString(), lat:+p[0].toFixed(6), lng:+p[1].toFixed(6), acc:5 })); const { error } = await sb.rpc('push_points', { p_token:token, p_route_id:rid, p_points:batch }); if(error) throw error; }
}
function demoSheet(){
  const mo = modal(`<h2>${esc(t('demo'))}</h2>
    <button class="btn primary" id="dC">${esc(t('demoCreate'))}</button>
    <button class="btn ghost" id="dL">${esc(A.demo ? t('demoStopLive') : t('demoLive'))}</button>
    <button class="btn ghost danger-text" id="dX">${esc(t('demoClean'))}</button>
    <p class="small" id="dMsg">${esc(A.demoMsg || '')}</p><button class="btn ghost small" id="dClose">${esc(t('close'))}</button>`);
  const msg = s => { A.demoMsg = s; const el = mo.querySelector('#dMsg'); if(el) el.textContent = s; };
  mo.querySelector('#dClose').onclick = () => mo.remove();
  mo.querySelector('#dC').onclick = async () => { mo.querySelector('#dC').disabled = true; try{ await demoCreate(msg); }catch(e){ msg(e.message); } mo.querySelector('#dC').disabled = false; };
  mo.querySelector('#dX').onclick = async () => { if(A.demo) A.demo.stop = true; try{ await sb.from('workers').delete().like('phone', DEMO_PHONE + '%'); await sb.from('tasks').delete().like('title', '%(Demo)'); await loadAll(); msg(t('demoCleaned')); }catch(e){ msg(e.message); } };
  mo.querySelector('#dL').onclick = async () => {
    if(A.demo){ A.demo.stop = true; mo.remove(); return; }
    mo.remove(); demoLive(msg).catch(e => { A.demo = null; toast(e.message); }); adminTab('map');
  };
}
async function demoCreate(msg){
  if((await demoRows()).length){ msg(t('demoExists')); return; }
  msg(t('demoWorking'));
  const { error:e1 } = await sb.from('workers').insert(DEMO_WORKERS.map((w, i) => ({ name:w[0], phone:DEMO_PHONE + (i + 1) + demoSuffix(), cities:[{ name:w[1], lat:w[2], lng:w[3] }], zone_minutes:w[4], pin_hash:'demo', notes:'Demo' })));
  if(e1) throw e1;
  const rows = await demoRows();
  const start = [DEMO_TASK.lat, DEMO_TASK.lng];
  const g = await Planner.loadForFlyers(start, DEMO_TASK.flyers, { cache:osmCache });
  const pl = Planner.planFlyers(g, start, DEMO_TASK.flyers, 3, { days:2, hoursPerDay:7 });
  const today = new Date().toISOString().slice(0, 10), tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const { data:tk, error } = await sb.from('tasks').insert({ title:DEMO_TASK.title, city_name:DEMO_TASK.city, district:DEMO_TASK.district, start_lat:DEMO_TASK.lat, start_lng:DEMO_TASK.lng, walk_minutes:15, zone_polygon:pl.zone, work_date:today,
    notes:DEMO_TASK.notes[I.lang] || DEMO_TASK.notes.de, created_by:A.user.id, street_m:g.street_m, flyers:DEMO_TASK.flyers, quota_m30:1500, work_days:2, work_hours:7, est_mailboxes:pl.mailboxes, route_m:pl.routes.reduce((x, r) => x + r.length_m, 0) }).select().single();
  if(error) throw error;
  const r = await sb.from('task_plans').insert(pl.routes.map((x, i) => ({ task_id:tk.id, idx:i, worker_id:rows[i].id, color:Planner.COLORS[i], path:x.path, length_m:x.length_m, street_m:x.street_m, mailboxes:x.mailboxes, boxes:x.boxes, minutes:x.minutes, days:x.days, steps:x.steps, status:'accepted', work_dates:[today, tomorrow] })));
  if(r.error) throw r.error;
  await sb.from('task_workers').insert([0, 1, 2].map(i => ({ task_id:tk.id, worker_id:rows[i].id })));
  // yesterday: worker 1 already walked a third of route 1
  try{
    const { data:plans } = await sb.from('task_plans').select('*').eq('task_id', tk.id).order('idx');
    const w = rows[0], path = plans && plans[0] ? Planner.densifyPath(plans[0].path, 5) : await loopPath(DEMO_TASK.lat, DEMO_TASK.lng);
    const part = path.slice(0, Math.floor(path.length / 3)); const y = new Date(); y.setDate(y.getDate() - 1); y.setHours(10, 5, 0, 0);
    const { data:rid } = await sb.rpc('start_route', { p_token:w.token, p_task_id:tk.id, p_started_at:y.toISOString(), p_plan_id:plans && plans[0] ? plans[0].id : null });
    await pushBatches(w.token, rid, part, +y, 4000);
    await sb.rpc('end_route', { p_token:w.token, p_route_id:rid, p_ended_at:new Date(+y + part.length * 4000).toISOString() });
  }catch{}
  await loadAll(); msg(t('demoCreated'));
}
async function demoLive(msg){
  const rows = await demoRows();
  const tk = A.tasks.find(x => x.title === DEMO_TASK.title);
  if(rows.length < 3 || !tk){ toast(t('demoNeed')); return; }
  const { data:plans } = await sb.from('task_plans').select('*').eq('task_id', tk.id).order('idx');
  const walkers = [];
  for(let i = 0; i < 3; i++){
    const w = rows[i], p = (plans || []).find(x => x.worker_id === w.id);
    let pts = p ? Planner.densifyPath(p.path, 5) : await loopPath(tk.start_lat, tk.start_lng, i * 2.1);
    if(i === 0) pts = pts.slice(Math.floor(pts.length / 3));       // continues yesterday's work
    pts = pts.slice(0, 900);                                         // ≈3 minutes
    const { data:rid, error } = await sb.rpc('start_route', { p_token:w.token, p_task_id:tk.id, p_started_at:new Date().toISOString(), p_plan_id:p ? p.id : null }); if(error) throw error;
    walkers.push({ w, rid, pts, i:0 });
  }
  A.demo = { stop:false };
  const per = 10;
  while(!A.demo.stop){
    let left = 0;
    for(const x of walkers){
      if(x.i >= x.pts.length) continue;
      const now = Date.now(), chunk = x.pts.slice(x.i, x.i + per).map((p, k) => ({ t:new Date(now - (per - 1 - k) * 200).toISOString(), lat:+p[0].toFixed(6), lng:+p[1].toFixed(6), acc:5 }));
      x.i += per; left += Math.max(0, x.pts.length - x.i);
      await sb.rpc('push_points', { p_token:x.w.token, p_route_id:x.rid, p_points:chunk });
    }
    const total = walkers.reduce((s, x) => s + x.pts.length, 0); msg(t('demoProgress', { p:Math.round(100 * (1 - left / total)) }));
    if(!left) break;
    await new Promise(r => setTimeout(r, 2000));
  }
  for(const x of walkers) await sb.rpc('end_route', { p_token:x.w.token, p_route_id:x.rid, p_ended_at:new Date().toISOString() });
  A.demo = null; msg(t('demoDone'));
}

/* ---------- auth ---------- */
export function viewAdminLogin(onBack){
  plain(`<button class="link back-link" id="bk">← ${esc(t('back'))}</button>
    <h1 class="hero">${esc(t('adminLogin'))}</h1>
    <label class="f">${esc(t('email'))}</label><input class="in" id="aEmail" type="email" autocomplete="username">
    <label class="f">${esc(t('password'))}</label><input class="in" id="aPass" type="password" autocomplete="current-password">
    <button class="btn primary" id="aLogin" style="margin-top:18px">${esc(t('login'))}</button>
    <div class="err" id="aErr"></div>`);
  $('#bk').onclick = onBack;
  const creds = () => ({ email:$('#aEmail').value.trim(), password:$('#aPass').value });
  $('#aLogin').onclick = async () => { $('#aErr').textContent = ''; const { error } = await sb.auth.signInWithPassword(creds()); if(error){ $('#aErr').textContent = error.message === 'Invalid login credentials' ? t('badLogin') : error.message; return; } const ok = await bootAdmin(); if(!ok) $('#aErr').textContent = t('adminNoAccess'); };
  $('#aPass').addEventListener('keydown', e => { if(e.key === 'Enter') $('#aLogin').click(); });
}
export async function bootAdmin(){
  const { data:{ session } } = await sb.auth.getSession();
  if(!session) return false;
  const { data:ok, error } = await sb.rpc('become_admin');
  if(error || !ok) return false;
  A.user = session.user; UI.role = 'admin'; UI.onTab = adminTab; UI.onLogout = adminLogout; loadWorkerStats().catch(() => {});
  await store.set('role', 'admin');
  try{ await loadAll(); }catch{}
  if(A.company && A.company.master && !A.company.id){ adminTab('people'); viewMaster(() => adminTab('people')); }
  else restoreAdmin();
  return true;
}
// after a reload: the screen the admin was on (order, worker, new order …), else the orders
function restoreAdmin(){
  UI.onRoute = routeFromHash;
  routeFromHash();
}
