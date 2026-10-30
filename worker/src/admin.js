import L from 'leaflet';
import Planner from '../../admin/planner.js';
import { t, I } from './i18n.js';
import { sb, store, $, esc, css, hav, fmtDist, fmtH, fmtHm, fmtN, fmtDay, fmtDT, ago, waLink, telLink, loopPath, deMobile, loc, reversePlace } from './core.js';
import { UI, ICONS, shell, plain, topbar, bindBack, makeMap, dot, labelIcon, fit, modal, confirmBox, toast, searchField, langSwitch, themeSwitch, statusPill, emptyState, avatar, every, personIcon } from './ui.js';
import { legalLinks, bindLegal } from './legalview.js';
import { makePlanEngine } from './planengine.js';
import { openMapView } from './routeview.js';
import { loadFirm, firmCardHtml, bindFirmCard, firmComplete, avvOk } from './firm.js';
import { viewMaster, poolHtml } from './master.js';

const GREEN = '#16A34A';
const APP_LINK = 'https://urlose.github.io/flyermap/app/';
// finished map-data answers are shared through our own server (edge function 'osm'): same area = instant for every admin
const osmCache = {
  async get(queries){ const { data, error } = await sb.functions.invoke('osm', { body:{ mode:'get', queries } }); if(error || !data || !data.results) throw new Error('cache'); return data.results; },
  async put(items){ if(items.some(i => JSON.stringify(i.payload).length > 5e6)) return; await sb.functions.invoke('osm', { body:{ mode:'put', items } }); },
  async putChecked(items){ await sb.functions.invoke('osm', { body:{ mode:'put', items } }); },   // size already checked in the planner worker
};
const KM_PER_MIN_TRANSIT = 0.75;
// priority area: [[lat,lng]…] (old orders: all streets inside) or { p:[[lat,lng]…], n:flyers }
const mArea = a => Array.isArray(a) ? { p:a, n:0 } : { p:(a && a.p) || [], n:+(a && a.n) || 0 };
// route planning runs in a background worker (the screen never freezes); one engine for the session keeps the loaded map
let engine = null;
const planEngine = () => engine || (engine = makePlanEngine(osmCache));
export const A = { user:null, workers:[], tasks:[], live:[], demo:null, hooks:{}, filter:{ status:'open', from:'', to:'', city:'', district:'' } };

/* ---------- data ---------- */
async function loadWorkers(){ const { data, error } = await sb.from('workers').select('id,name,phone,cities,zone_minutes,notes,last_lat,last_lng,last_seen,active_route_id,created_at,company_id').order('name'); if(error) throw error; A.workers = data; }
async function loadTasks(){ const { data, error } = await sb.from('tasks').select('*,task_workers(worker_id)').order('created_at', { ascending:false }); if(error) throw error; A.tasks = data; }
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
  const tk = A.tasks.find(x => x.id === r.task_id), quota = (tk && tk.quota_m30) || 1500;
  const wm = (Date.now() - new Date(r.started_at) - (r.break_s || 0) * 1000) / 60000; if(wm < 8) return { cls:'', label:'' };
  const need = quota * Math.min(30, wm) / 30;
  if(r.last30_m > quota * 3) return { cls:'warn', label:t('quotaHigh') };
  if(r.last30_m < need * .7) return { cls:'bad', label:t('quotaLow') };
  return { cls:'', label:'' };
}
const isLive = w => w.active_route_id && ((w.last_seen && Date.now() - new Date(w.last_seen) < 20 * 60e3) || A.live.some(r => r.worker_id === w.id && r.paused_at));
function workerOptions(lat, lng, sel){
  return `<option value="">${esc(t('nobody'))}</option>` + forPoint(lat, lng).map(x => `<option value="${x.w.id}" ${x.w.id === sel ? 'selected' : ''}>${esc(x.w.name)}${x.city ? ' · ' + esc(x.city.name) : ''}${isFinite(x.km) ? ' · ' + Math.round(x.km) + ' km' : ''}${x.inZone ? '' : ' · ' + esc(t('outZone'))}</option>`).join('');
}

/* ---------- tabs ---------- */
export function adminTab(tab){
  if(tab === 'map') return viewLive();
  if(tab === 'people') return viewPeople();
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
      <div class="fc-row" style="margin-top:8px;justify-content:flex-start"><button class="chip ${MAPQ.tasks !== false ? 'on' : ''}" id="mTasks" aria-pressed="${MAPQ.tasks !== false}">${ICONS.route}<span id="mTasksTx">${esc(t('mapOrders'))}</span></button></div></div>`, { map:true });
  sf.bind();
  m = makeMap($('#fullMap'), MAPQ.place ? [MAPQ.place.lat, MAPQ.place.lng] : null, 12);
  // open orders: planned routes in their colours, walked parts green; tap → order
  const taskLayer = L.layerGroup(); if(MAPQ.tasks !== false) taskLayer.addTo(m);
  layer = L.layerGroup().addTo(m);
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
        const ln = L.polyline(p.path, { color:p.color || '#2563EB', weight:4, opacity:.55, lineJoin:'round' }).bindTooltip(tip, { sticky:true }).on('click', go).addTo(taskLayer); b.extend(ln.getBounds());
      });
      L.marker([tk.start_lat, tk.start_lng], { icon:labelIcon('pin-start', tk.title), zIndexOffset:200 }).on('click', go).addTo(taskLayer); b.extend([tk.start_lat, tk.start_lng]);
    }
    $('#mTasksTx').textContent = t('mapOrdersN', { n:open.length });
    taskBounds = b.isValid() ? b : null; tasksLoaded = true;
    if(!userMoved && !MAPQ.place) autoFit();
  })().catch(() => {});
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
      if(isLive(w) || (w.last_lat != null && w.last_lng != null)){ posOf.set(w.id, { p:[w.last_lat, w.last_lng], city:null }); continue; }
      const c = home(w); if(!c) continue;
      const k = c.lat.toFixed(3) + ',' + c.lng.toFixed(3), i = perCity.get(k) || 0; perCity.set(k, i + 1);
      // several workers from the same city: small ring around the centre so the markers do not cover each other
      const a = i * 2.4, r = i ? 0.004 + 0.0012 * i : 0;
      posOf.set(w.id, { p:[c.lat + r * Math.sin(a), c.lng + r * Math.cos(a) / Math.cos(c.lat * Math.PI / 180)], city:c.name });
    }
    const known = A.workers.filter(w => posOf.has(w.id));
    layer.clearLayers(); const b = L.latLngBounds([]);
    const pl = MAPQ.place;
    if(pl){
      L.circle([pl.lat, pl.lng], { radius:MAPQ.km * 1000, color:'#2563EB', weight:2, fillColor:'#2563EB', fillOpacity:.06, interactive:false }).addTo(layer);
      L.circleMarker([pl.lat, pl.lng], { radius:6, color:'#fff', weight:3, fillColor:'#2563EB', fillOpacity:1, interactive:false }).addTo(layer);
    }
    for(const w of known){
      const on = isLive(w), { p, city } = posOf.get(w.id);
      if(!on && !city) L.circle(p, { radius:350, color:'#94A3B8', weight:1, fillColor:'#94A3B8', fillOpacity:.15, interactive:false }).addTo(layer);
      L.marker(p, { icon:personIcon(w.name, on, on ? '' : city ? city : ago(w.last_seen)), zIndexOffset:on ? 800 : city ? 300 : 400 }).on('click', () => viewWorker(w.id, viewLive)).addTo(layer);
      b.extend(p);
      if(on) fetchPoints(w.active_route_id).then(pts => { if(pts.length > 1) L.polyline(pts.map(q => [q.lat, q.lng]), { color:css('--route'), weight:4, opacity:.85 }).addTo(layer); }).catch(() => {});
    }
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
      document.querySelectorAll('.live-chip').forEach(c => c.onclick = () => viewWorker(c.dataset.id, viewLive));
    } else {
      const off = known.length - live.length;
      $('#liveCount').textContent = (live.length ? t('liveNow', { n:live.length }) : t('nobodyLive')) + (off ? ' · ' + t('offlineN', { n:off }) : '');
      $('#liveList').innerHTML = known.map(w => { const c = posOf.get(w.id).city; return `<button class="live-chip" data-id="${w.id}"><span class="dotc ${isLive(w) ? pace(w).cls : 'pause'}"></span>${esc(w.name)}${isLive(w) ? (pace(w).label ? ' · ' + esc(pace(w).label) : '') : ' · ' + esc(c ? t('livesIn', { c }) : ago(w.last_seen))}</button>`; }).join('');
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
const workMin = r => Math.max(0, ((r.ended_at ? new Date(r.ended_at) : Date.now()) - new Date(r.started_at)) / 60000 - (r.break_s || 0) / 60);
const placeTxt = r => [r.place, r.task_title].filter(Boolean).join(' · ');
const hhmm = d => new Date(d).toLocaleTimeString(loc(), { hour:'2-digit', minute:'2-digit' });
const dayFilter = () => A.dFilter || (A.dFilter = { from:'', to:'', place:'' });
const dayMatches = (r, f) => { const d = dayKey(r); return (!f.from || d >= f.from) && (!f.to || d <= f.to) && (!f.place || r.place === f.place); };
const filterOn = f => !!(f.from || f.to || f.place);
const dayLine = (r, cls) => `<button class="row-line rbtn ${cls || ''}" data-r="${r.id}" data-w="${r.worker_id}"><div class="rb-main"><b>${esc(new Date(r.started_at).toLocaleDateString(loc(), { weekday:'short', day:'2-digit', month:'2-digit', year:'2-digit' }))} · ${esc(hhmm(r.started_at))}–${esc(r.ended_at ? hhmm(r.ended_at) : t('active'))}</b><small data-place="${r.id}">${esc(placeTxt(r) || '…')}</small></div><span>${esc(fmtDist(r.distance_m || 0))} · ${esc(fmtHm(workMin(r)) + ' ' + t('h'))}</span></button>`;
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
  return `<div class="chips" style="margin:0 0 8px">${quick.map(([k, a, b]) => `<button class="chip ${f.from === a && f.to === b ? 'on' : ''}" data-q="${a}|${b}" style="padding:7px 14px">${esc(t(k))}</button>`).join('')}<button class="chip ${filterOn(f) ? '' : 'on'}" data-q="|" style="padding:7px 14px">${esc(t('fAll'))}</button></div>
    <div class="steppers"><div><label class="f">${esc(t('fFrom'))}</label><input class="in small" type="date" id="dfFrom" value="${esc(f.from)}"></div><div><label class="f">${esc(t('fTo'))}</label><input class="in small" type="date" id="dfTo" value="${esc(f.to)}"></div><div><label class="f">${esc(t('place'))}</label><select class="in small" id="dfPlace"><option value="">${esc(t('fAll'))}</option>${places.map(p => `<option ${p === f.place ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></div></div>`;
}
function bindDayFilter(f, again){
  document.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { const [a, z] = b.dataset.q.split('|'); f.from = a; f.to = z; if(!a) f.place = ''; again(); });
  $('#dfFrom').onchange = e => { f.from = e.target.value; again(); };
  $('#dfTo').onchange = e => { f.to = e.target.value; again(); };
  $('#dfPlace').onchange = e => { f.place = e.target.value; again(); };
}

async function viewPeople(){
  let place = null;
  const f = dayFilter();
  const sf = searchField('wCity', t('whoPh'), c => { place = c; render(); }, { citiesOnly:true });
  const nLive = A.workers.filter(isLive).length;
  shell('people', `${topbar(t('tabPeople'))}
    <div class="pad">
      <div class="kpis two"><div class="kpi k-info"><b>${A.workers.length}</b><span>${esc(t('kTotal'))}</span></div><div class="kpi k-ok"><b>${nLive}</b><span>${esc(t('stLive'))}</span></div></div>
      <div class="searchbox"><span class="sb-ic">${ICONS.search}</span><input id="wQ" class="sb-in" placeholder="${esc(t('searchNamePhone'))}" aria-label="${esc(t('searchNamePhone'))}"></div>
      <label class="f">${esc(t('whoCanGo'))}</label>${sf.html}
      <label class="f">${esc(t('workedWhen'))}</label>
      <div id="dFilter"></div>
      <div class="sec-row"><h2>${esc(t('workersN', { n:A.workers.length }))}</h2></div>
      <div id="wList"></div>
      ${A.company && A.company.id ? `<details class="filters" id="poolBox"><summary>${ICONS.users}${esc(t('poolTitle'))}</summary><div class="f-body" id="poolList"><p class="muted small">${esc(t('loadingShort'))}</p></div></details>` : ''}
      ${A.company && A.company.master ? `<button class="btn primary" id="tMaster" style="margin-top:16px">${ICONS.users}${esc(t('master'))}</button>` : ''}
      ${A.company && A.company.id ? firmCardHtml(A.company) : ''}
      <h2 class="sec">${esc(t('accountSettings'))}</h2>
      <div class="card" style="display:block">
        <div class="person-row" style="padding-top:0">${avatar()}<div><b>${esc(A.user?.phone ? '+' + A.user.phone.replace(/^\+/, '') : (A.user?.email || ''))}</b><span>${esc(t('admin'))}</span></div></div>
        ${themeSwitch(A.theme)}
        ${langSwitch(I.lang, true)}
        <div class="tool-row" style="margin-top:16px"><button class="btn ghost small" id="tInv">${ICONS.users}${esc(t('inviteAdmin'))}</button><button class="btn ghost small" id="tWork">${ICONS.route}${esc(t('switchToWorker'))}</button><button class="btn ghost small" id="tDemo">${esc(t('demo'))}</button></div>
        <button class="btn ghost danger-text" id="tOut" style="margin-top:8px">${esc(t('logout'))}</button>
      </div>
      ${legalLinks()}
    </div>`);
  store.get('theme').then(v => { A.theme = v; document.querySelectorAll('[data-theme-set]').forEach(b => { const on = b.dataset.themeSet === (v || 'system'); b.classList.toggle('on', on); b.setAttribute('aria-checked', on); }); });
  sf.bind(); bindLegal(viewPeople);
  if(A.company && A.company.id) bindFirmCard(A.company, c => { A.company = { ...c, master:A.company.master }; viewPeople(); });
  if($('#tMaster')) $('#tMaster').onclick = () => viewMaster(viewPeople);
  if($('#poolBox')) $('#poolBox').addEventListener('toggle', async () => { if($('#poolBox').open && !$('#poolBox').dataset.done){ $('#poolBox').dataset.done = 1; $('#poolList').innerHTML = await poolHtml(); } });
  if(A.focusFirm){ A.focusFirm = false; const fc = $('#firmCard'); if(fc) fc.scrollIntoView({ block:'center' }); }
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
        <div class="grow"><b>${esc(w.name)}</b><span>${coName(w.company_id) ? esc(coName(w.company_id)) + ' · ' : ''}${esc((w.cities || []).map(c => c.name).join(', '))}${km != null ? ' · ' + Math.round(km) + ' km' : ''} · ${esc(t('zoneChip', { n:w.zone_minutes }))}</span><span>${isLive(w) ? statusPill('live', t('stLive')) : esc(t('lastActive', { a:ago(w.last_seen) }))}</span></div>${ICONS.chevron}</button>
        ${on ? `<div class="wc-days">${byW.get(w.id).map(r => dayLine(r)).join('')}</div>` : ''}
        <div class="wc-act"><a class="btn ghost small" href="${telLink(w.phone)}">${ICONS.phone}${esc(t('call'))}</a><a class="btn ghost small" target="_blank" rel="noopener" href="${waLink(w.phone)}">${ICONS.chat}WhatsApp</a></div></div>`).join('')
       : on ? '' : emptyState(A.workers.length ? t('notFound') : t('noWorkers'), A.workers.length ? 'search' : 'users'));
    const clr = $('#wClr'); if(clr) clr.onclick = () => { place = null; $('#wCity').value = ''; render(); };
    document.querySelectorAll('.wc-main').forEach(b => b.onclick = () => viewWorker(b.dataset.id));
    document.querySelectorAll('.wc-days .rbtn').forEach(b => b.onclick = () => viewDayMap(b.dataset.r, viewPeople));
  };
  $('#wQ').oninput = render; render();
  sb.from('routes').select('id,worker_id,task_id,plan_id,started_at,ended_at,distance_m,break_s,place,task_title').order('started_at', { ascending:false }).limit(2000)
    .then(({ data }) => { if(!document.getElementById('dFilter')) return; days = data || []; render(); fillPlaces(days, () => { if(document.getElementById('dFilter')) render(); }); });
  $('#tOut').onclick = async () => { if(await confirmBox(t('logout'), t('logoutQ'), t('logout'))){ await sb.auth.signOut(); for(const k of ['role', 'token', 'me', 'canAdmin']) await store.del(k); A.hooks.loggedOut && A.hooks.loggedOut(); } };
  $('#tWork').onclick = openAsWorker;
  $('#tInv').onclick = () => {
    const mo = modal(`<h2>${esc(t('inviteAdmin'))}</h2><label class="f">${esc(t('invitePhone'))}</label><input class="in" id="invE" type="tel" placeholder="+49 170 1234567"><button class="btn primary" id="invB" style="margin-top:12px">${esc(t('inviteAdmin'))}</button><div class="err" id="invErr"></div>`);
    mo.querySelector('#invB').onclick = async () => { const ph = deMobile(mo.querySelector('#invE').value); if(!ph){ mo.querySelector('#invErr').textContent = t('badPhone'); return; } const { error } = await sb.from('admin_phone_invites').upsert({ phone:ph }); if(error) mo.querySelector('#invErr').textContent = error.message; else { mo.remove(); toast(t('invitePhoneSent')); } };
  };
  $('#tDemo').onclick = demoSheet;
}

async function viewWorker(id, back, focusId){
  back = back || viewPeople;
  const w = wById(id); if(!w) return back();
  const { data:routes } = await sb.from('routes').select('*').eq('worker_id', id).order('started_at', { ascending:false }).limit(300);
  const all = routes || [], f = dayFilter();
  let useFilter = filterOn(f);
  shell('people', `${topbar(w.name, true)}
    <div class="pad">
      <div class="person-row big">${avatar(w.name, isLive(w) ? 'live' : '')}<div><b>${esc(w.name)}</b><span>${esc(w.phone)} · ${esc(t('lastActive', { a:ago(w.last_seen) }))}</span></div></div>
      <div class="tool-row"><a class="btn primary small" href="${telLink(w.phone)}">${ICONS.phone}${esc(t('call'))}</a><a class="btn ghost small" target="_blank" rel="noopener" href="${waLink(w.phone)}">${ICONS.chat}WhatsApp</a></div>
      <div class="chips">${(w.cities || []).map(c => `<span class="chip">${esc(c.name)}</span>`).join('')}</div>
      <h2 class="sec">${esc(t('workDays'))}</h2>
      <div id="wDaysSum" class="muted small" style="margin:0 0 2px"></div>
      <div id="wMap" class="wmap"></div>
      <div class="rinfo-row"><div id="wRouteInfo" class="muted small"></div><button class="btn ghost small" id="wBig" hidden>${ICONS.expand}${esc(t('rvBig'))}</button></div>
      <div id="wDays"></div>
      <h2 class="sec">${esc(t('settings'))}</h2>
      <label class="f">${esc(t('zoneLabel'))}</label>
      <select class="in" id="wzm">${[30, 45, 60, 75, 90, 120].map(m => `<option value="${m}" ${m === w.zone_minutes ? 'selected' : ''}>${m < 60 ? m + ' ' + t('min') : (m/60).toString().replace('.', ',') + ' ' + t('h')} (~${Math.round(m * KM_PER_MIN_TRANSIT)} km)</option>`).join('')}</select>
      <label class="f">${esc(t('notes'))}</label><textarea class="in" id="wnotes">${esc(w.notes || '')}</textarea>
      <button class="btn primary" id="wsave" style="margin-top:12px">${esc(t('save'))}</button>
      ${/^\+490000/.test(w.phone || '') && !/^\+4900000000/.test(w.phone || '') ? `<div id="wLink" class="card" style="display:block;margin-top:16px"><label class="f" style="margin-top:0">${esc(t('loginLink'))}</label><p class="small muted">${esc(t('loadingShort'))}</p></div>` : ''}
      <button class="btn ghost danger-text" id="wdel" style="margin-top:20px">${esc(t('del'))}</button>
    </div>`);
  bindBack(back);
  const wm = makeMap($('#wMap'), (w.last_lat != null) ? [w.last_lat, w.last_lng] : null, 14), wl = L.layerGroup().addTo(wm);
  let curDay = null;
  const showRoute = async r => {
    curDay = r; const bg = $('#wBig'); if(bg){ bg.hidden = false; bg.onclick = () => viewDayMap(r.id, () => viewWorker(id, back, r.id)); }
    document.querySelectorAll('.rbtn').forEach(x => x.classList.toggle('sel', x.dataset.r === r.id));
    wl.clearLayers(); const b = L.latLngBounds([]);
    try{
      if(r.plan_id){ const { data:pl } = await sb.from('task_plans').select('path,color').eq('id', r.plan_id).maybeSingle(); if(pl && pl.path && pl.path.length > 1){ L.polyline(pl.path, { color:'#64748B', weight:4, opacity:.55, dashArray:'2 8', lineCap:'round' }).addTo(wl); pl.path.forEach(p => b.extend(p)); } }
      const pts = r.track_deleted_at ? [] : await fetchPoints(r.id);
      if(pts.length > 1){
        const ll = pts.map(p => [p.lat, p.lng]); L.polyline(ll, { color:css('--route'), weight:5, opacity:.95 }).addTo(wl); ll.forEach(p => b.extend(p));
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
  $('#wsave').onclick = async () => { const { error } = await sb.from('workers').update({ zone_minutes:+$('#wzm').value, notes:$('#wnotes').value.trim() || null }).eq('id', id); if(!error){ await loadWorkers(); toast(t('saved')); } };
  $('#wdel').onclick = async () => { if(!await confirmBox(t('del'), t('delWorkerQ', { name:w.name }), t('del'), true)) return; await sb.from('workers').delete().eq('id', id); await loadWorkers(); back(); };
}

/* ---------- big map views (also for screenshots for clients) ---------- */
const nameOf = id => (wById(id) || {}).name || '—';
// one working day of one worker: walked GPS track, planned route, the planned streets covered that day
async function viewDayMap(routeId, back){
  const { data:r } = await sb.from('routes').select('*').eq('id', routeId).maybeSingle(); if(!r) return back();
  const [pl, pts] = await Promise.all([
    r.plan_id ? sb.from('task_plans').select('path,color,boxes,idx').eq('id', r.plan_id).maybeSingle().then(x => x.data) : null,
    r.track_deleted_at ? [] : fetchPoints(r.id).catch(() => []),
  ]);
  const ll = pts.map(p => [p.lat, p.lng]), col = (pl && pl.color) || '#2563EB';
  let pct = null, fl = null, runs = [];
  if(pl && pl.path && pl.path.length > 1 && ll.length > 1){
    const tr = Planner.makeTracker(pl.path); tr.addTrack(ll); runs = tr.runs(); pct = tr.pct();
    if(pl.boxes && pl.boxes.length){ const ct = Planner.makeBoxCounter(pl.boxes); ct.visitAll(ll); fl = ct.count(); }
  }
  const d0 = new Date(r.started_at);
  openMapView({
    title:nameOf(r.worker_id), anonTitle:t('rvDistributor'), hasNames:true,
    lines:[d0.toLocaleDateString(loc(), { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' }) + ' · ' + hhmm(r.started_at) + '–' + (r.ended_at ? hhmm(r.ended_at) : t('active')), placeTxt(r)],
    stats:[[t('rvDist'), fmtDist(r.distance_m || 0)], [t('rvWork'), fmtHm(workMin(r)) + ' ' + t('h')], fl != null ? [t('rvFlyers'), '≈ ' + fmtN(fl)] : null, pct != null ? [t('rvDayShare'), pct + ' %'] : null],
    note:r.track_deleted_at ? t('trackDeleted') : (ll.length < 2 ? t('rvNoTrack') : ''),
    layers:[
      { key:'plan', label:pl ? t('rvPlan') : '', on:!!pl, add:g => { if(pl && pl.path && pl.path.length > 1) L.polyline(pl.path, { color:col, weight:4, opacity:.45, dashArray:'6 7', lineJoin:'round' }).addTo(g); } },
      { key:'done', label:runs.length ? t('rvDone') : '', add:g => runs.forEach(x => L.polyline(x, { color:GREEN, weight:8, opacity:.9, lineJoin:'round', lineCap:'round' }).addTo(g)) },
      { key:'gps', label:ll.length > 1 ? t('rvGps') : '', add:g => {
        if(ll.length < 2) return;
        L.polyline(ll, { color:'#1D4ED8', weight:3, opacity:.95, lineJoin:'round' }).addTo(g);
        L.marker(ll[0], { icon:dot('start-dot', 16) }).addTo(g); L.marker(ll[ll.length - 1], { icon:dot(r.ended_at ? 'end-dot' : 'me-dot', r.ended_at ? 16 : 20) }).addTo(g);
      } },
    ],
    back,
  });
}
// a whole order: every route in its colour, what has been covered in green, the GPS tracks of all days
async function viewTaskMap(id, back){
  const tk = A.tasks.find(x => x.id === id); if(!tk) return back();
  const [{ data:plans }, { data:routes }] = await Promise.all([sb.from('task_plans').select('*').eq('task_id', id).order('idx'), sb.from('routes').select('*').eq('task_id', id)]);
  const tracks = await Promise.all((routes || []).map(r => r.track_deleted_at ? [] : fetchPoints(r.id).then(p => p.map(q => [q.lat, q.lng])).catch(() => [])));
  const byPlan = {}, trackCol = {};
  (routes || []).forEach((r, i) => {
    const pid = r.plan_id || ((plans || []).find(p => p.worker_id === r.worker_id) || {}).id; if(!pid) return;
    (byPlan[pid] = byPlan[pid] || []).push(tracks[i]); trackCol[i] = ((plans || []).find(p => p.id === pid) || {}).color;
  });
  let doneM = 0, allM = 0, flAll = 0, hasFl = false;
  const res = (plans || []).map(p => {
    const tr = p.path && p.path.length > 1 ? Planner.makeTracker(p.path) : null, ct = p.boxes && p.boxes.length ? Planner.makeBoxCounter(p.boxes) : null;
    for(const pts of byPlan[p.id] || []){ if(tr) tr.addTrack(pts); if(ct) ct.visitAll(pts); }
    const pct = tr ? tr.pct() : 0; doneM += pct * (p.length_m || 0) / 100; allM += p.length_m || 0; if(ct){ flAll += ct.count(); hasFl = true; }
    return { p, runs:tr ? tr.runs() : [], pct, fl:ct ? ct.count() : null };
  });
  const walked = (routes || []).reduce((a, r) => a + (r.distance_m || 0), 0), days = new Set((routes || []).map(dayKey)).size;
  openMapView({
    title:tk.title, hasNames:true,
    lines:[[tk.district, tk.city_name].filter(Boolean).join(', '), tk.work_date ? fmtDay(tk.work_date) : ''],
    stats:[tk.flyers ? [t('flyers'), fmtN(tk.flyers)] : null, hasFl ? [t('rvFlyers'), '≈ ' + fmtN(flAll)] : null, [t('rvDist'), fmtDist(walked)], allM ? [t('rvDayShare2'), Math.round(100 * doneM / allM) + ' %'] : null, days ? [t('rvDays'), String(days)] : null],
    legend:res.map(({ p, pct, fl }) => ({ color:p.color || '#2563EB', label:(p.worker_id ? nameOf(p.worker_id) : t('planRoute', { n:p.idx + 1 })), anonLabel:t('planRoute', { n:p.idx + 1 }), sub:pct + ' %' + (fl != null ? ' · ≈ ' + fmtN(fl) + ' ' + t('flyers') : '') })),
    layers:[
      { key:'zone', on:false, add:g => { if(tk.zone_polygon) L.polygon(tk.zone_polygon, { color:css('--brand'), weight:2, fillOpacity:.05, interactive:false }).addTo(g); } },
      ...((tk.must_areas || []).length ? [{ key:'must', label:t('mustTitle'), add:g => tk.must_areas.forEach(a => L.polygon(mArea(a).p, { color:'#EA580C', weight:3, dashArray:'8 6', fillOpacity:.1, interactive:false }).addTo(g)) }] : []),
      ...(tk.work_area ? [{ key:'own', label:t('zoneTitle'), add:g => L.polygon(tk.work_area, { color:'#7C3AED', weight:3, dashArray:'10 6', fillOpacity:.04, interactive:false }).addTo(g) }] : []),
      { key:'plan', label:t('rvPlan'), add:g => { (plans || []).forEach(p => { if(p.path && p.path.length > 1) L.polyline(p.path, { color:p.color || '#2563EB', weight:4, opacity:.5, lineJoin:'round' }).addTo(g); }); L.marker([tk.start_lat, tk.start_lng], { icon:dot('pin-start', 24) }).addTo(g); } },
      { key:'done', label:t('rvDone'), add:g => res.forEach(x => x.runs.forEach(run => L.polyline(run, { color:GREEN, weight:7, opacity:.9, lineJoin:'round', lineCap:'round' }).addTo(g))) },
      { key:'gps', label:tracks.some(x => x.length > 1) ? t('rvGps') : '', on:false, add:g => tracks.forEach((ll, i) => { if(ll.length > 1) L.polyline(ll, { color:trackCol[i] || '#1D4ED8', weight:2.5, opacity:.95 }).addTo(g); }) },
    ],
    back,
  });
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
const taskState = tk => tk.status !== 'open' ? ['ok', t('stDoneTask')] : taskLive(tk) ? ['live', t('stLive')] : (tk.task_workers || []).length ? ['info', t('stPlanned')] : ['neutral', t('stNoWorkers')];
const accOf = k => ({ ok:'acc-ok', live:'acc-ok', info:'acc-info', warn:'acc-warn', bad:'acc-bad', neutral:'acc-neutral' }[k]);
function viewTasks(){
  const opts = k => [...new Set(A.tasks.map(x => x[k]).filter(Boolean))].sort();
  const sel = (id, label, list, cur) => `<div><label class="f" for="${id}">${esc(label)}</label><select class="in small" id="${id}"><option value="">${esc(t('fAll'))}</option>${list.map(v => `<option ${v === cur ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>`;
  const card = tk => { const [k, txt] = taskState(tk); return `<button class="card acc ${accOf(k)} task-card" data-id="${tk.id}"><div class="tc-main"><b>${esc(tk.title)}</b>
    <div class="tc-meta">${coName(tk.company_id) ? `<i>${ICONS.users}${esc(coName(tk.company_id))}</i>` : ''}<i>${ICONS.calendar}${esc(fmtDay(tk.work_date))}</i>${tk.district || tk.city_name ? `<i>${ICONS.pin}${esc([tk.district, tk.city_name].filter(Boolean).join(', '))}</i>` : ''}${tk.flyers ? `<i>${ICONS.mail}${esc(fmtN(tk.flyers))}</i>` : ''}<i>${ICONS.users}${(tk.task_workers || []).length}</i></div>
    ${statusPill(k, txt)}</div>${ICONS.chevron}</button>`; };
  const f = A.filter, list = A.tasks.filter(taskMatches);
  const nOpen = A.tasks.filter(x => x.status === 'open').length, nLive = A.tasks.filter(taskLive).length, nDone = A.tasks.length - nOpen;
  const nf = ['city', 'district', 'from', 'to'].filter(k => f[k]).length;
  const firmTodo = A.company && A.company.id && !A.company.master && (!firmComplete(A.company) || !avvOk(A.company));
  shell('tasks', `${topbar(t('tasks'))}
    <div class="pad">
      ${firmTodo ? `<button class="warnbox firm-todo" id="firmTodo">${esc(!firmComplete(A.company) ? t('firmMissing') : t('firmAvvMissing'))} ›</button>` : ''}
      <div class="kpis"><div class="kpi k-info"><b>${nOpen}</b><span>${esc(t('fOpen'))}</span></div><div class="kpi k-ok"><b>${nLive}</b><span>${esc(t('stLive'))}</span></div><div class="kpi k-neutral"><b>${nDone}</b><span>${esc(t('fDone'))}</span></div></div>
      <div class="chips" style="margin:0 0 10px">${[['open', t('fOpen')], ['live', t('stLive')], ['done', t('fDone')], ['all', t('fAll')]].map(([k, l]) => `<button class="chip ${f.status === k ? 'on' : ''}" data-st="${k}" aria-pressed="${f.status === k}">${esc(l)}</button>`).join('')}</div>
      <details class="filters" ${nf ? 'open' : ''}><summary>${ICONS.search}${esc(t('filter'))}${nf ? `<span class="cnt">${nf}</span>` : ''}</summary><div class="f-body">
        <div class="steppers">${sel('fCity', t('fCity'), opts('city_name'), f.city)}${sel('fDist', t('fDistrict'), opts('district'), f.district)}</div>
        <div class="steppers"><div><label class="f" for="fFrom">${esc(t('fFrom'))}</label><input class="in small" type="date" id="fFrom" value="${esc(f.from)}"></div><div><label class="f" for="fTo">${esc(t('fTo'))}</label><input class="in small" type="date" id="fTo" value="${esc(f.to)}"></div></div>
        ${nf ? `<button class="link" id="fReset" style="margin-top:8px">${esc(t('reset'))}</button>` : ''}</div></details>
      ${list.length ? list.map(card).join('') : A.tasks.length ? emptyState(t('noMatch'), 'search') : `${emptyState(t('noOpenTasks'), 'flag')}<button class="btn primary" id="create" style="margin-top:12px">${ICONS.plus}${esc(t('createTask'))}</button>`}
    </div>`, { fab:t('createTask') });
  $('#fab').onclick = () => viewCreate();
  if($('#create')) $('#create').onclick = () => viewCreate();
  if($('#firmTodo')) $('#firmTodo').onclick = () => { A.focusFirm = true; adminTab('people'); };
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
function viewCreate(edit){
  const tkE = edit && edit.tk;   // editing an existing task: same screen, prefilled, saves over the old routes
  const d = { start:null, place:null, flyers:10000, n:2, nAuto:false, hours:7, quota:1500, days:2, g:null, plan:null, assign:{}, err:null, token:0, must:[], zone:null, drawing:null, drawFor:'must' };
  if(tkE && Array.isArray(tkE.must_areas)) d.must = tkE.must_areas.map(mArea).filter(a => a.p.length > 2);
  if(tkE && Array.isArray(tkE.work_area) && tkE.work_area.length > 2) d.zone = tkE.work_area;
  if(tkE) Object.assign(d, { flyers:tkE.flyers || 5000, hours:+tkE.work_hours || 7, quota:tkE.quota_m30 || 1500, days:tkE.work_days || 2, n:Math.max(1, edit.plans.length), nAuto:false });
  const sf = searchField('cSearch', t('searchAddr'), (c, q) => { d.place = c; if(q) q.value = c.name + (c.sub ? ', ' + c.sub : ''); setStart(c.lat, c.lng); }, { near:() => d.start ? [d.start.lat, d.start.lng] : null });
  shell('tasks', `<div id="fullMap" class="fullmap"></div>
    <div class="map-top"><button class="icon-btn" id="cBack" aria-label="${esc(t('back'))}">${ICONS.back}</button><div class="grow">${sf.html}</div></div>
    <button class="chip pick-btn" id="cPick" hidden></button>
    <div class="draw-bar" id="cDraw" hidden><b id="cDrawT">${esc(t('mustDrawHint'))}</b><span class="small" id="cDrawN"></span>
      <div class="tool-row"><button class="btn ghost small" id="cDrawUndo">${esc(t('mustUndo'))}</button><button class="btn ghost small" id="cDrawCancel">${esc(t('cancel'))}</button><button class="btn primary small" id="cDrawOk">${esc(t('mustDone'))}</button></div></div>
    <div class="sheet" id="cSheet"></div>`, { map:true });
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
    d.must.forEach((a, k) => tip(L.polygon(a.p, { color:MUST_COLOR, weight:3, dashArray:'8 6', fillOpacity:.12, interactive:false }).addTo(mustLayer), t('mustN', { n:k + 1 }) + (a.n ? ' · ' + fmtN(a.n) : '')));
    if(d.drawing){
      const col = d.drawFor === 'zone' ? ZONE_COLOR : MUST_COLOR;
      if(d.drawing.length > 1) L.polygon(d.drawing, { color:col, weight:2, dashArray:'4 4', fillOpacity:.08, interactive:false }).addTo(mustLayer);
      d.drawing.forEach(q => L.circleMarker(q, { radius:6, color:'#fff', weight:2, fillColor:col, fillOpacity:1, interactive:false }).addTo(mustLayer));
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
  const drawMode = (on, kind) => {
    d.drawing = on ? [] : null; if(on) d.drawFor = kind || 'must';
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
    d.must.push({ p:pts, n:0 }); drawMust();
    const n = await askMustN(null, 0);
    if(n === null){ d.must.pop(); drawMust(); return; }
    d.must[d.must.length - 1].n = n; drawMust(); recompute();
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
    if(d.drawing){ d.drawing.push([e.latlng.lat, e.latlng.lng]); updDraw(); drawMust(); return; }
    if(d.start && !d.pick) return;
    d.pick = false; d.place = null; const qi = $('#cSearch'); if(qi) qi.value = '';
    setStart(e.latlng.lat, e.latlng.lng, true);
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
    let pr = progress(tok, true); pr.stage('loadingArea');
    for(let attempt = 0; attempt < 2 && !d.loaded; attempt++){   // public map servers are sometimes busy: one automatic retry
      try{ const r = await planEngine().run('load', { start:[lat, lng], flyers:d.flyers, must:d.must, zone:d.zone }, pr.stage); if(tok !== d.token) return pr.stop(); if(!r || !r.skipped) d.loaded = true; }
      catch(e){ pr.stop(); if(tok !== d.token) return; d.err = errText2(e); if(attempt === 0){ pr = progress(tok, true); pr.stage('retrying'); await new Promise(r => setTimeout(r, 4000)); if(tok !== d.token){ pr.stop(); return; } } }
    }
    pr.stop();
    if(tok !== d.token || !alive()) return;
    if(!d.loaded){ d.busy = false; renderSheet(); return; }
    recompute();
  }
  async function recompute(){
    if(!d.start || !alive()) return;
    if(!d.loaded){ renderSheet(); return; }
    const tok = ++d.token, pr = progress(tok, false);
    let res = null;
    try{ res = await planEngine().run('plan', { start:startArr(), flyers:d.flyers, n:d.n, days:d.days, hours:d.hours, must:d.must, zone:d.zone }, pr.stage); }
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
    d.plan.routes.forEach((r, i) => { if(r.path.length > 1) L.polyline(r.path, { color:Planner.COLORS[i % 10], weight:4, opacity:.85 }).addTo(planLayer); });
    if(z && !d.keepView) m.fitBounds(z.getBounds(), { paddingTopLeft:[24, 80], paddingBottomRight:[24, Math.round(innerHeight * .5)], maxZoom:17, animate:false });
  }
  const num = (id, def) => { const v = parseFloat(($(id) || {}).value); return isFinite(v) ? v : def; };
  // values typed in any step survive re-renders and step changes (only fields that are on screen are read)
  function keep(){
    const k = { ...saved }, v = id => $(id) ? $(id).value : undefined;
    if(v('#cTitle') !== undefined) k.title = v('#cTitle');
    if(v('#cDate') !== undefined) k.date = v('#cDate');
    if(v('#cNotes') !== undefined) k.notes = v('#cNotes');
    if(v('#cQuota') !== undefined) k.quota = v('#cQuota');
    return k;
  }
  function restore(k){ if($('#cTitle')) $('#cTitle').value = k.title || ''; if($('#cDate')) $('#cDate').value = k.date || ''; if($('#cNotes')) $('#cNotes').value = k.notes || ''; if($('#cQuota')) $('#cQuota').value = k.quota; }
  let saved = tkE ? { title:tkE.title, date:tkE.work_date ? String(tkE.work_date).slice(0, 10) : '', notes:tkE.notes || '', quota:tkE.quota_m30 || 1500 } : { title:'', date:'', notes:'', quota:1500 };
  // five steps on top of the live map: 1 start · 2 route · 3 time · 4 workers · 5 review. Planning keeps running underneath.
  const STEPS = ['wzStart', 'wzRoute', 'wzTime', 'wzTeam', 'wzReview'];
  d.step = tkE ? 2 : 1;
  const canReach = k => k === 1 || (!!d.start && (k === 2 || (!!d.plan && !d.busy)));
  const goStep = k => { if(!canReach(k)) return; saved = keep(); d.step = k; const sh = $('#cSheet'); if(sh){ sh.scrollTop = 0; if(k >= 2) sh.classList.add('tall'); } renderSheet(); };
  function renderSheet(){
    if(!alive()) return;
    if($('#cWz')) saved = keep();
    const sc = d.step === d.lastStep ? (($('#cSheet') || {}).scrollTop || 0) : 0; d.lastStep = d.step;
    const p = d.plan, title = saved.title || (d.place ? d.place.name : '');
    if(!saved.title && title) saved.title = title;
    const cap = p ? Planner.capacity(p.routes, d.flyers, { hoursPerDay:d.hours, days:d.days }) : null;
    const km = p ? fmtDist(p.routes.reduce((s, r) => s + r.length_m, 0)) : '';
    const routeRow = (r, i, withSelect) => `<div class="route-row"><span class="swatch" style="background:${Planner.COLORS[i % 10]}"></span>
        <div class="grow"><b>${esc(t('planRoute', { n:i + 1 }))} <span class="muted">· ${esc(t('daysN', { n:Math.max(1, Math.ceil(r.minutes / 60 / d.hours)) }))}</span></b><span>${esc(t('routeLine', { km:fmtDist(r.length_m), h:fmtHm(r.minutes), mb:fmtN(r.mailboxes) }))}</span>
        ${dayLines(r.days)}
        ${withSelect ? `<select class="in small" data-r="${i}" aria-label="${esc(t('planRoute', { n:i + 1 }))}">${workerOptions(d.start.lat, d.start.lng, d.assign[i])}</select>` : ''}</div></div>`;
    const planBlock = () => p ? `<p class="small muted" style="margin:10px 0 0">${esc(t('planSum', { mb:fmtN(p.mailboxes), km, h:fmtHm(p.routes.reduce((s, r) => s + r.minutes, 0)) }))}</p>
        ${p.mailboxes < d.flyers * 0.95 ? `<p class="small err">${esc(t('areaSmall', { mb:fmtN(p.mailboxes) }))}</p>` : ''}
        <div class="${cap.ok ? 'hint' : 'warnbox'}">${cap.ok ? esc(t('fitsOk', { d:d.days })) : `${esc(t('tooBig', { h:cap.slowest.toFixed(1).replace('.', ','), lim:cap.limit, d:d.days }))} <button class="link" id="cReduce">${esc(t('reduceTo', { f:fmtN(cap.suggestedFlyers) }))}</button> ${esc(t('moreWorkers'))}`}</div>`
      : d.err ? `<p class="small err">${esc(t('streetsFail', { e:d.err }))}</p><button class="btn ghost small" id="cRetry">${ICONS.refresh}${esc(t('retryBtn'))}</button>` : `<p class="small muted" style="margin:10px 0 0">${esc(t('calculating'))}</p>`;
    let body = '';
    if(d.step === 1) body = `
      <label class="f" for="cTitle">${esc(t('title'))}</label><input class="in" id="cTitle" value="${esc(title)}" autocomplete="off">
      <label class="f">${esc(t('startPoint'))}</label>
      <div class="note" style="margin:0;display:flex;gap:10px;align-items:flex-start">${ICONS.pin.replace('<svg', '<svg width="20" height="20" style="fill:none;stroke:currentColor;stroke-width:2;flex:none;margin-top:1px"')}<span>${d.start ? esc(d.place ? [d.place.name, d.place.sub].filter(Boolean).join(', ') : d.start.lat.toFixed(5) + ', ' + d.start.lng.toFixed(5)) : esc(t('tapMap'))}</span></div>`;
    else if(d.step === 2) body = `
      <div class="steppers">
        <div><label class="f">${esc(t('flyersCount'))}</label><div class="stepper"><button data-s="f:-500" aria-label="−500">−</button><input id="cFly" type="number" inputmode="numeric" min="100" step="100" value="${d.flyers}"><button data-s="f:500" aria-label="+500">+</button></div></div>
        <div><label class="f">${esc(t('workersCount'))}</label><div class="stepper"><button data-s="n:-1" ${p ? '' : 'disabled'} aria-label="−1">−</button><b id="vN">${p ? d.n : '—'}</b><button data-s="n:1" ${p ? '' : 'disabled'} aria-label="+1">+</button></div></div>
      </div>
      ${p && d.sug && d.sug !== d.n ? `<div class="hint">${esc(t('sugWorkers', { n:d.sug, d:d.days }))} <button class="link" id="cSug">${esc(t('applySug'))}</button></div>` : ''}
      ${planBlock()}
      <div class="must-box zone-box"><div class="sec-row" style="margin:0"><b>${esc(t('zoneTitle'))}</b><span class="small muted">${esc(d.zone ? t('zoneOwn') + (p && p.zone_mb != null ? ' · ' + t('mustMb', { mb:fmtN(p.zone_mb) }) : '') : t('zoneAuto'))}</span></div>
        <p class="small muted" style="margin:2px 0 8px">${esc(t(d.zone ? 'zoneHintOwn' : 'zoneHint'))}</p>
        ${d.zone && p && p.zone_mb != null && p.zone_mb < d.flyers * 0.95 ? `<div class="warnbox" style="margin:0 0 8px">${esc(t('zoneSmall', { mb:fmtN(p.zone_mb), f:fmtN(d.flyers) }))} <button class="link" id="cZoneFit">${esc(t('reduceTo', { f:fmtN(Math.max(100, Math.floor(p.zone_mb / 50) * 50)) }))}</button></div>` : ''}
        <div class="tool-row"><button class="btn ghost small" id="cZoneDraw" ${d.start ? '' : 'disabled'}>${ICONS.edit}${esc(t(d.zone ? 'zoneRedraw' : 'zoneDraw'))}</button>${d.zone ? `<button class="btn ghost small" id="cZoneAuto">${esc(t('zoneBackAuto'))}</button>` : ''}</div></div>
      <div class="must-box"><div class="sec-row" style="margin:0"><b>${esc(t('mustTitle'))}</b>${p && p.must_mb ? `<span class="small muted">${esc(t('mustMb', { mb:fmtN(p.must_mb) }))}</span>` : ''}</div>
        <p class="small muted" style="margin:2px 0 8px">${esc(t('mustHint'))}</p>
        ${p && p.must_mb > d.flyers ? `<div class="warnbox" style="margin:0 0 8px">${esc(t('mustTooMany', { mb:fmtN(p.must_mb), f:fmtN(d.flyers) }))}</div>` : ''}
        ${d.must.map((a, k) => { const inf = p && p.must_info && p.must_info[k];
          return `<div class="sec-row" style="margin:4px 0;align-items:flex-start"><span><i class="must-dot"></i>${esc(t('mustN', { n:k + 1 }))} · <b>${esc(a.n ? t('mustNFly', { n:fmtN(a.n) }) : t('mustAllShort'))}</b>
            ${inf ? `<br><span class="small muted">${esc(t('mustAvail', { mb:fmtN(inf.avail) }))}${a.n && inf.avail < a.n ? ' – ' + esc(t('mustFewer')) : ''}</span>` : ''}</span>
            <span style="white-space:nowrap"><button class="link" data-med="${k}">${esc(t('change'))}</button> · <button class="link danger-text" data-mrm="${k}">${esc(t('del'))}</button></span></div>`; }).join('')}
        <button class="btn ghost small" id="cMustAdd" ${d.start ? '' : 'disabled'}>${ICONS.plus}${esc(t('mustAdd'))}</button></div>
      ${p ? p.routes.map((r, i) => routeRow(r, i, false)).join('') : ''}`;
    else if(d.step === 3) body = `
      <div class="steppers"><div><label class="f" for="cDate">${esc(t('startDate'))}</label><input class="in" type="date" id="cDate"></div><div><label class="f" for="cHours">${esc(t('hoursDay'))}</label><input class="in" type="number" id="cHours" min="1" max="12" step="0.5" value="${d.hours}"></div></div>
      <label class="f" for="cQuota">${esc(t('quota'))}</label><input class="in" type="number" id="cQuota" min="200" step="100" value="${esc(saved.quota)}">
      <label class="f" for="cNotes">${esc(t('note'))}</label><textarea class="in" id="cNotes" placeholder="${esc(t('notesPh'))}"></textarea>
      ${p ? `<div class="${cap.ok ? 'hint' : 'warnbox'}">${cap.ok ? esc(t('fitsOk', { d:d.days })) : esc(t('tooBig', { h:cap.slowest.toFixed(1).replace('.', ','), lim:cap.limit, d:d.days }))}</div>` : ''}`;
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
        <div><span>${esc(t('zoneTitle'))}</span><b>${esc(d.zone ? t('zoneOwn') : t('zoneAuto'))}</b></div>
        ${d.must.length ? `<div><span>${esc(t('mustTitle'))}</span><b>${esc(t('mustSum', { n:d.must.length, mb:fmtN((p && p.must_mb) || 0) }))}</b></div>` : ''}
        ${saved.notes ? `<div><span>${esc(t('note'))}</span><b>${esc(saved.notes)}</b></div>` : ''}
      </div>
      ${p && !cap.ok ? `<div class="warnbox">${esc(t('tooBig', { h:cap.slowest.toFixed(1).replace('.', ','), lim:cap.limit, d:d.days }))}</div>` : ''}<div class="err" id="cErr"></div>`;
    }
    const last = d.step === 5, nextOk = last ? (!!p && !d.busy) : canReach(d.step + 1);
    sheet(`<button class="sheet-grip" id="grip" aria-label="${esc(t('panel'))}"></button>
      <div class="wz" id="cWz">${STEPS.map((k, i) => `<button class="${i + 1 === d.step ? 'on' : i + 1 < d.step ? 'done' : ''}" data-step="${i + 1}" ${canReach(i + 1) ? '' : 'disabled'} aria-current="${i + 1 === d.step ? 'step' : 'false'}"><i></i><span>${i + 1} ${esc(t(k))}</span></button>`).join('')}</div>
      ${body}
      <div class="wz-nav">${d.step > 1 ? `<button class="btn ghost" id="cPrev">${esc(t('back'))}</button>` : ''}
        <button class="btn primary" id="${last ? 'cSave' : 'cNext'}" ${nextOk ? '' : 'disabled'}>${esc(last ? t('saveTask') : t('next'))}</button></div>`);
    restore(saved); $('#cSheet').classList.remove('calc'); $('#cSheet').scrollTop = sc;
    $('#grip').onclick = () => $('#cSheet').classList.toggle('tall');
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
    if($('#cHours')) $('#cHours').onchange = () => { saved = keep(); d.hours = Math.max(1, Math.min(12, num('#cHours', 7))); recompute(); };
    const sg = $('#cSug'); if(sg) sg.onclick = () => { saved = keep(); d.n = d.sug; d.assign = {}; recompute(); };
    const red = $('#cReduce'); if(red) red.onclick = () => { saved = keep(); d.flyers = Math.max(100, cap.suggestedFlyers); d.nAuto = false; recompute(); };
    document.querySelectorAll('[data-r]').forEach(s => s.onchange = () => { d.assign[+s.dataset.r] = s.value || null; });
    if($('#cSave')) $('#cSave').onclick = save;
    if($('#cMustAdd')) $('#cMustAdd').onclick = () => drawMode(true, 'must');
    if($('#cZoneDraw')) $('#cZoneDraw').onclick = () => { saved = keep(); drawMode(true, 'zone'); };
    if($('#cZoneAuto')) $('#cZoneAuto').onclick = () => { saved = keep(); d.zone = null; drawMust(); recompute(); };
    if($('#cZoneFit')) $('#cZoneFit').onclick = () => { saved = keep(); d.flyers = Math.max(100, Math.floor(p.zone_mb / 50) * 50); d.nAuto = true; recompute(); };
    document.querySelectorAll('[data-med]').forEach(b => b.onclick = async () => {
      const k = +b.dataset.med, inf = p && p.must_info && p.must_info[k], n = await askMustN(d.must[k].n, inf ? inf.avail : 0);
      if(n === null) return; saved = keep(); d.must[k].n = n; drawMust(); recompute();
    });
    document.querySelectorAll('[data-mrm]').forEach(b => b.onclick = () => { d.must.splice(+b.dataset.mrm, 1); drawMust(); recompute(); });
  }
  async function save(){
    if(d.busy || !d.plan) return;   // a recalculation is running: the plan on screen is not the final one yet
    saved = keep();
    const title = (saved.title || '').trim(); if(!title){ goStep(1); toast(t('needTitle')); return; }
    $('#cSave').disabled = true; $('#cSave').classList.add('loading');
    try{
      const pl = d.plan, quota = Math.max(200, Math.round(+saved.quota || 1500)), date = saved.date || null;
      const row = { title, city_name:(d.place && d.place.city) || (tkE && tkE.city_name) || null, district:(d.place && d.place.district) || (tkE && tkE.district) || null, start_lat:d.start.lat, start_lng:d.start.lng,
        walk_minutes:15, zone_polygon:pl.zone, must_areas:d.must.length ? d.must.map(a => ({ p:a.p, n:a.n })) : null, work_area:d.zone || null, work_date:date, notes:(saved.notes || '').trim() || null, street_m:d.streetM || null,
        flyers:d.flyers, quota_m30:quota, work_days:d.days, work_hours:d.hours, est_mailboxes:pl.mailboxes, route_m:pl.routes.reduce((s, r) => s + r.length_m, 0) };
      let tk;
      if(tkE){
        const u = await sb.from('tasks').update(row).eq('id', tkE.id).select().single(); if(u.error) throw u.error; tk = u.data;
        const x1 = await sb.from('task_plans').delete().eq('task_id', tkE.id); if(x1.error) throw x1.error;
        await sb.from('task_workers').delete().eq('task_id', tkE.id);
      }else{
        const ins = await sb.from('tasks').insert({ ...row, created_by:A.user.id }).select().single(); if(ins.error) throw ins.error; tk = ins.data;
      }
      await savePlans(tk, pl.routes.map((r, i) => ({ task_id:tk.id, idx:i, worker_id:d.assign[i] || null, color:Planner.COLORS[i % 10], path:r.path, length_m:r.length_m, street_m:r.street_m, mailboxes:r.mailboxes, boxes:r.boxes, minutes:r.minutes, days:r.days, steps:r.steps })));
      await loadTasks(); viewTask(tk.id);
    }catch(e){ if($('#cErr')) $('#cErr').textContent = e.message; else toast(e.message); const sv = $('#cSave'); if(sv){ sv.disabled = false; sv.classList.remove('loading'); } }
  }
  renderSheet();
  if(tkE) setStart(tkE.start_lat, tkE.start_lng);
}
// saves plans, links workers and sends each assigned worker a notification
async function savePlans(tk, rows){
  let ins = [];
  if(rows.length){ const r = await sb.from('task_plans').insert(rows).select(); if(r.error) throw r.error; ins = r.data || []; }
  const ws = [...new Set(rows.map(r => r.worker_id).filter(Boolean))];
  if(ws.length) await sb.from('task_workers').upsert(ws.map(w => ({ task_id:tk.id, worker_id:w })), { onConflict:'task_id,worker_id', ignoreDuplicates:true });
  for(const p of ins) if(p.worker_id) await notifyAssigned(tk, p);
}
async function notifyAssigned(tk, p){
  const date = tk.work_date ? fmtDay(tk.work_date) + ' · ' : '';
  await sb.from('notifications').insert({ worker_id:p.worker_id, kind:'assigned', task_id:tk.id, plan_id:p.id, title:t('newTaskTitle', { title:tk.title }), body:t('newTaskBody', { date, mb:fmtN(p.mailboxes || 0), km:fmtDist(p.length_m || 0) }) });
}

/* edit an existing task: texts / date / pace right here; flyers, workers and routes only while nobody has walked yet */
function editTaskSheet(tk, plans, routes){
  const day = tk.work_date ? String(tk.work_date).slice(0, 10) : '';
  const mo = modal(`<h2>${esc(t('editTask'))}</h2>
    <label class="f">${esc(t('title'))}</label><input class="in" id="eTitle" value="${esc(tk.title)}">
    <div class="steppers"><div><label class="f">${esc(t('startDate'))}</label><input class="in" type="date" id="eDate" value="${esc(day)}"></div><div><label class="f">${esc(t('hoursDay'))}</label><input class="in" type="number" id="eHours" min="1" max="12" step="0.5" value="${+tk.work_hours || 7}"></div></div>
    <label class="f">${esc(t('quota'))}</label><input class="in" type="number" id="eQuota" min="200" step="100" value="${tk.quota_m30 || 1500}">
    <label class="f">${esc(t('note'))}</label><textarea class="in" id="eNotes">${esc(tk.notes || '')}</textarea>
    <button class="btn primary" id="eSave" style="margin-top:12px">${esc(t('save'))}</button>
    ${routes.length ? `<p class="small muted">${esc(t('editNoReplan'))}</p>` : `<button class="btn ghost" id="eReplan">${esc(t('replan'))}</button>`}
    <button class="btn ghost small" id="eClose">${esc(t('close'))}</button><div class="err" id="eErr"></div>`);
  mo.querySelector('#eClose').onclick = () => mo.remove();
  mo.querySelector('#eSave').onclick = async () => {
    const title = mo.querySelector('#eTitle').value.trim(); if(!title){ mo.querySelector('#eErr').textContent = t('needTitle'); return; }
    const { error } = await sb.from('tasks').update({ title, work_date:mo.querySelector('#eDate').value || null, work_hours:Math.max(1, Math.min(12, parseFloat(mo.querySelector('#eHours').value) || 7)), quota_m30:Math.max(200, Math.round(+mo.querySelector('#eQuota').value || 1500)), notes:mo.querySelector('#eNotes').value.trim() || null }).eq('id', tk.id);
    if(error){ mo.querySelector('#eErr').textContent = error.message; return; }
    mo.remove(); await loadTasks(); toast(t('saved')); viewTask(tk.id);
  };
  const rp = mo.querySelector('#eReplan'); if(rp) rp.onclick = () => { mo.remove(); viewCreate({ tk, plans }); };
}
/* task detail: info + map + routes with status, worker assignment and progress */
const dayLines = days => (days && days.length > 1) ? days.map((x, k) => `<span class="small day-line"><b>${esc(t('dayN', { n:k + 1 }))}:</b> ${esc(t('routeLine', { km:fmtDist(x.length_m), h:fmtHm(x.minutes), mb:fmtN(x.mailboxes) }))}</span>`).join('') : '';
const stText = p => p.status === 'accepted' ? t('stAccepted') : p.status === 'declined' ? t('stDeclined') : p.status === 'done' ? t('stDone') : t('stOffered');
const stCls = p => p.status === 'done' ? 'ok' : p.status === 'accepted' ? '' : p.status === 'declined' ? 'bad' : 'neutral';   // angeboten = neutral, angenommen = blau, erledigt = grün, abgelehnt = rot
async function viewTask(id){
  const tk = A.tasks.find(x => x.id === id); if(!tk) return viewTasks();
  const [{ data:plans }, { data:routes }] = await Promise.all([sb.from('task_plans').select('*').eq('task_id', id).order('idx'), sb.from('routes').select('*').eq('task_id', id)]);
  const walked = (routes || []).reduce((s, r) => s + r.distance_m, 0);
  const invite = w => t('invite', { name:w.name, title:tk.title, date:tk.work_date ? ', ' + fmtDay(tk.work_date) : '' });
  shell('tasks', `${topbar(tk.title, true)}
    <div class="pad">
      <h2 class="sec" style="margin-top:4px">${esc(t('taskInfo'))}:</h2>
      <div class="info">
        <div><span>${esc(t('place'))}</span><b>${esc([tk.district, tk.city_name].filter(Boolean).join(', ') || '—')}</b></div>
        <div><span>${esc(t('date'))}</span><b>${esc(fmtDay(tk.work_date))}</b></div>
        ${tk.flyers ? `<div><span>${esc(t('flyers'))}</span><b>${esc(fmtN(tk.flyers))} · ${esc(t('mbApprox', { n:fmtN(tk.est_mailboxes || 0) }))}</b></div>` : ''}
        ${tk.route_m ? `<div><span>${esc(t('dist2'))}</span><b>${esc(fmtDist(tk.route_m))}</b></div>` : ''}
        ${tk.quota_m30 ? `<div><span>${esc(t('quotaInfo'))}</span><b>${fmtN(tk.quota_m30)} m / 30 ${esc(t('min'))}</b></div>` : ''}
        <div><span>${esc(t('walkedLbl'))}</span><b>${esc(fmtDist(walked))}</b></div>
        ${tk.notes ? `<div><span>${esc(t('note'))}</span><b>${esc(tk.notes)}</b></div>` : ''}
      </div>
      <div class="mapbox" id="tMap"></div>
      <div class="rinfo-row"><span>${statusPill(...taskState(tk))}</span><button class="btn ghost small" id="tBig">${ICONS.expand}${esc(t('rvBig'))}</button></div>
      <h2 class="sec">${esc(t('routesOf'))}</h2>
      ${(plans || []).length ? plans.map(p => { const w = wById(p.worker_id); return `<div class="route-row"><span class="swatch" style="background:${esc(p.color || '#2563EB')}"></span>
        <div class="grow"><b>${esc(t('planRoute', { n:p.idx + 1 }))} <span class="muted" id="pp${p.idx}"></span></b>
        <span>${esc(t('routeLine', { km:fmtDist(p.length_m), h:fmtHm(p.minutes || 0), mb:fmtN(p.mailboxes || 0) }))}</span>
        ${dayLines(p.days)}
        <div class="bar"><i id="pb${p.idx}"></i></div><span id="pf${p.idx}" style="margin-top:4px"></span>
        ${p.worker_id ? `<span class="pill ${(A.live || []).some(r => r.plan_id === p.id && !r.paused_at) ? 'live' : stCls(p)}">${(A.live || []).some(r => r.plan_id === p.id && !r.paused_at) ? esc(t('stLive')) + ' · ' : ''}${esc(stText(p))}${p.status === 'accepted' && (p.work_dates || []).length ? ' · ' + esc(p.work_dates.map(fmtDay).join(', ')) : ''}</span>` : ''}
        <div class="rr-act"><select class="in small" data-plan="${p.id}">${workerOptions(tk.start_lat, tk.start_lng, p.worker_id)}</select>${w ? `<a class="btn ghost small" target="_blank" rel="noopener" href="${waLink(w.phone, invite(w))}">${ICONS.chat}${esc(t('write'))}</a>` : ''}</div>
        <span class="small">${esc(t('replaceHint'))}</span></div></div>`; }).join('') : `<p class="muted small">${esc(t('noPlans'))}</p>`}
      <div class="tool-row" style="margin-top:16px"><button class="btn ghost small" id="tEdit">${ICONS.edit}${esc(t('editTask'))}</button><button class="btn ghost small" id="tDone">${ICONS.check}${esc(tk.status === 'open' ? t('finish') : t('reopen'))}</button><button class="btn ghost small danger-text" id="tDel">${esc(t('del'))}</button></div>
      <p class="small muted">${esc(t('desktop'))}</p>
    </div>`);
  bindBack(viewTasks);
  const m = makeMap($('#tMap'), [tk.start_lat, tk.start_lng], 14);
  let b = L.latLngBounds([[tk.start_lat, tk.start_lng]]);
  if(tk.zone_polygon){ const z = L.polygon(tk.zone_polygon, { color:css('--brand'), weight:2, fillOpacity:.06, interactive:false }).addTo(m); b = z.getBounds(); }
  (tk.must_areas || []).forEach(a => L.polygon(mArea(a).p, { color:'#EA580C', weight:2, dashArray:'8 6', fillOpacity:.1, interactive:false }).addTo(m));
  if(tk.work_area) L.polygon(tk.work_area, { color:'#7C3AED', weight:2, dashArray:'10 6', fillOpacity:.03, interactive:false }).addTo(m);
  (plans || []).forEach(p => { if(p.path?.length > 1) L.polyline(p.path, { color:p.color || '#2563EB', weight:4, opacity:.6 }).addTo(m); });
  const doneLayer = L.layerGroup().addTo(m);
  L.marker([tk.start_lat, tk.start_lng], { icon:dot('pin-start', 24) }).addTo(m);
  fit(m, b, 16);
  document.querySelectorAll('[data-plan]').forEach(sel => sel.onchange = async () => {
    const wid = sel.value || null, p = plans.find(x => x.id === sel.dataset.plan);
    // a new worker takes over the rest of the route: progress stays with the plan
    const { error } = await sb.from('task_plans').update({ worker_id:wid, status:'offered', work_dates:[], accepted_at:null }).eq('id', p.id);
    if(error){ toast(error.message); return; }
    if(wid){
      await sb.from('task_workers').upsert({ task_id:id, worker_id:wid }, { onConflict:'task_id,worker_id', ignoreDuplicates:true });
      await notifyAssigned(tk, { ...p, worker_id:wid });
    }
    await loadTasks(); toast(t('saved')); viewTask(id);
  });
  $('#tBig').onclick = () => viewTaskMap(id, () => viewTask(id));
  $('#tEdit').onclick = () => editTaskSheet(tk, plans || [], routes || []);
  $('#tDone').onclick = async () => { await sb.from('tasks').update({ status:tk.status === 'open' ? 'done' : 'open' }).eq('id', id); await loadTasks(); viewTask(id); };
  $('#tDel').onclick = async () => { if(!await confirmBox(t('del'), t('delTaskQ'), t('del'), true)) return; await sb.from('tasks').delete().eq('id', id); await loadTasks(); viewTasks(); };
  // progress per route: all tracks recorded on that plan (also by a previous worker)
  const byPlan = {};
  for(const r of routes || []){
    const pid = r.plan_id || (plans.find(p => p.worker_id === r.worker_id) || {}).id; if(!pid) continue;
    const pts = await fetchPoints(r.id); (byPlan[pid] = byPlan[pid] || []).push(pts.map(p => [p.lat, p.lng]));
  }
  for(const p of plans || []){
    if(!byPlan[p.id] || !p.path?.length) continue;
    const tr = Planner.makeTracker(p.path), ct = p.boxes && p.boxes.length ? Planner.makeBoxCounter(p.boxes) : null;
    byPlan[p.id].forEach(pts => { tr.addTrack(pts); if(ct) ct.visitAll(pts); });
    tr.runs().forEach(run => L.polyline(run, { color:GREEN, weight:6, opacity:.95 }).addTo(doneLayer));
    const pct = tr.pct(); const el = $('#pp' + p.idx); if(el) el.textContent = '· ' + t('done', { p:pct }); const bar = $('#pb' + p.idx); if(bar) bar.style.width = pct + '%';
    const pf = $('#pf' + p.idx); if(pf && ct) pf.textContent = t('flyersDone', { a:fmtN(ct.count()), b:fmtN(ct.total) });
  }
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
  A.user = session.user; UI.role = 'admin'; UI.onTab = adminTab;
  await store.set('role', 'admin');
  try{ await loadAll(); }catch{}
  if(A.company && A.company.master && !A.company.id){ adminTab('people'); viewMaster(() => adminTab('people')); }
  else adminTab('tasks');
  return true;
}
