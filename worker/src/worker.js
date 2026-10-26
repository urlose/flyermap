import L from 'leaflet';
import { registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import Planner from '../../admin/planner.js';
import { t, I } from './i18n.js';
import { NATIVE, PRIVACY_URL, store, rpc, errText, ApiError, $, esc, css, hav, fmtDist, fmtH, fmtTime, fmtDay, loopPath } from './core.js';
import { UI, ICONS, shell, plain, topbar, bindBack, makeMap, dot, fit, modal, confirmBox, toast, cityPicker, langSwitch, avatar, every } from './ui.js';

const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');
const GREEN = '#16A34A';

export const W = { token:null, me:null, route:null, queue:[], track:[], busy:false, watcherId:null, focus:null, tracker:null, sim:null, flushFailed:false, hooks:{} };
const tasks = () => (W.me && W.me.tasks) || [];

/* ================= sync ================= */
async function saveRoute(){ await store.set('route', W.route); await store.set('queue', W.queue); await store.set('track', W.track.slice(-6000)); }
export async function flush(){
  if(W.busy || !W.token || !W.route) return;
  W.busy = true;
  try{
    const r = W.route;
    if(!r.id){ r.id = await rpc('start_route', { p_token:W.token, p_task_id:r.taskId, p_started_at:new Date(r.startedAt).toISOString() }); await saveRoute(); }
    while(W.queue.length){
      const batch = W.queue.slice(0, 300);
      await rpc('push_points', { p_token:W.token, p_route_id:r.id, p_points:batch });
      W.queue.splice(0, batch.length); await store.set('queue', W.queue);
    }
    if(r.endedAt){
      await rpc('end_route', { p_token:W.token, p_route_id:r.id, p_ended_at:new Date(r.endedAt).toISOString() });
      W.route = null; W.queue = []; W.track = []; W.tracker = null;
      await store.del('route'); await store.del('queue'); await store.del('track');
    }
    W.flushFailed = false;
  }catch(e){
    if(e.message === 'invalid_token') await forceLogout(t('e_invalid_token')); else W.flushFailed = true;
  }finally{ W.busy = false; updateSync(); }
}
setInterval(flush, 8000);

export async function loadMe(){
  try{ W.me = await rpc('worker_me', { p_token:W.token }); await store.set('me', W.me); }
  catch(e){ if(e.message === 'invalid_token') return forceLogout(t('e_invalid_token')); W.me = W.me || await store.get('me'); }
}
export async function forceLogout(msg){
  await stopWatching(); stopDemoWalk();
  Object.assign(W, { token:null, me:null, route:null, queue:[], track:[], tracker:null });
  for(const k of ['token', 'me', 'route', 'queue', 'track', 'role']) await store.del(k);
  W.hooks.loggedOut && W.hooks.loggedOut();
  if(msg) modal(`<h2>FlyerMap</h2><p>${esc(msg)}</p>`);
}

/* ================= tracking ================= */
function routeTask(){ return W.route && W.route.task; }
function ensureTracker(){
  const p = routeTask() && routeTask().plan;
  if(p && p.path && p.path.length > 1 && !W.tracker){ W.tracker = Planner.makeTracker(p.path); W.tracker.addTrack(W.track.map(x => [x[0], x[1]])); }
}
function onLocation(lat, lng, acc, time, sim){
  if(!W.route || W.route.endedAt) return;
  if(W.sim && !sim) return;
  if(acc != null && acc > 50){ setGps(false); return; }
  setGps(true);
  const last = W.track[W.track.length - 1];
  if(last && sim === 'first'){ /* demo jumps to its own start */ }
  else if(last){
    const d = hav(last[0], last[1], lat, lng), dt = (time - last[2]) / 1000;
    if(dt <= 0) return;
    if(d < 4){ view.me && view.me(lat, lng); return; }
    if(dt < 30 && d / dt > 12) return;
    W.route.distance += d;
  }
  if(W.tracker){ if(last && sim !== 'first') W.tracker.markLine([last[0], last[1]], [lat, lng]); else W.tracker.mark([lat, lng]); }
  W.track.push([lat, lng, time]);
  W.queue.push({ t:new Date(time).toISOString(), lat:+lat.toFixed(6), lng:+lng.toFixed(6), acc: acc == null ? null : Math.round(acc) });
  saveRoute();
  view.update && view.update(lat, lng);
  if(W.queue.length >= 10) flush();
}
async function startWatching(){
  if(W.watcherId) return;
  if(NATIVE){
    W.watcherId = await BackgroundGeolocation.addWatcher({ backgroundTitle:t('bgTitle'), backgroundMessage:t('bgMsg'), requestPermissions:true, stale:false, distanceFilter:5 },
      (loc, err) => { if(err){ if(err.code === 'NOT_AUTHORIZED') showLocDenied(); return; } if(loc) onLocation(loc.latitude, loc.longitude, loc.accuracy, loc.time || Date.now()); });
  }else if(navigator.geolocation){
    W.watcherId = 'web:' + navigator.geolocation.watchPosition(p => onLocation(p.coords.latitude, p.coords.longitude, p.coords.accuracy, p.timestamp), () => {}, { enableHighAccuracy:true, maximumAge:0 });
  }
}
async function stopWatching(){
  if(!W.watcherId) return;
  if(String(W.watcherId).startsWith('web:')) navigator.geolocation.clearWatch(+String(W.watcherId).slice(4));
  else { try{ await BackgroundGeolocation.removeWatcher({ id:W.watcherId }); }catch{} }
  W.watcherId = null;
}
function showLocDenied(){
  if(document.querySelector('.modal')) return;
  const m = modal(`<h2>${esc(t('locDenied'))}</h2><p class="muted">${esc(t('locDeniedText'))}</p>${NATIVE ? `<button class="btn primary" data-s>${esc(t('openSettings'))}</button>` : ''}<button class="btn ghost" data-n>OK</button>`);
  const s = m.querySelector('[data-s]'); if(s) s.onclick = () => { BackgroundGeolocation.openSettings(); m.remove(); };
  m.querySelector('[data-n]').onclick = () => m.remove();
}
let wakeLock = null;
async function keepAwake(on){ try{ if(on && !NATIVE && 'wakeLock' in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request('screen'); if(!on && wakeLock){ await wakeLock.release(); wakeLock = null; } }catch{} }
document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible' && W.route && !W.route.endedAt){ wakeLock = null; keepAwake(true); } });

export async function beginRoute(task){
  W.route = { id:null, taskId:task ? task.id : null, task:task || null, startedAt:Date.now(), endedAt:null, distance:0 };
  W.queue = []; W.track = []; W.tracker = null;
  await saveRoute();
  workerTab('map');
  await startWatching(); flush();
}
async function finishRoute(){
  if(!await confirmBox(t('stopQ'), t('stopText'), t('stopYes'), true)) return;
  stopDemoWalk(); keepAwake(false); await stopWatching();
  W.route.endedAt = Date.now(); await saveRoute(); await flush();
  await loadMe(); workerTab('tasks');
}

/* demo walk (web prototype): follows the planned route when there is one */
async function startDemoWalk(){
  if(W.sim) return stopDemoWalk();
  const task = routeTask(), last = W.track[W.track.length - 1];
  W.sim = { i:0, pts:null, timer:null }; view.refreshDemo && view.refreshDemo();
  const g = $('#gps'); if(g) g.textContent = t('demoRunning');
  let pts;
  if(task && task.plan && task.plan.path && task.plan.path.length > 1){
    pts = Planner.densifyPath(task.plan.path, 5);
    if(W.tracker){ const ni = W.tracker.nextIndex(); if(ni > 0){ const target = W.tracker.samples[ni]; let bi = 0, bd = Infinity; pts.forEach((p, i) => { const d = hav(p[0], p[1], target[0], target[1]); if(d < bd){ bd = d; bi = i; } }); pts = pts.slice(bi); } }
  }else{
    const c = task ? [task.start_lat, task.start_lng] : last ? [last[0], last[1]] : [51.2177, 6.7737];
    pts = await loopPath(c[0], c[1]);
  }
  if(!W.sim) return;
  W.sim.pts = pts; view.follow = true;
  W.sim.timer = setInterval(() => {
    if(!W.sim || !W.route || W.route.endedAt) return stopDemoWalk();
    const p = W.sim.pts[W.sim.i]; if(!p) return stopDemoWalk();
    onLocation(p[0], p[1], 5, Date.now(), W.sim.i === 0 ? 'first' : true); W.sim.i++;
  }, 450);
}
function stopDemoWalk(){ if(W.sim && W.sim.timer) clearInterval(W.sim.timer); W.sim = null; view.refreshDemo && view.refreshDemo(); flush(); }

/* ================= views ================= */
const view = {};   // hooks of the current map screen
function setGps(ok){ const g = $('#gps'); if(g && !W.sim) g.textContent = ok ? t('onRoute') : t('gpsWait'); }
function updateSync(){ const el = $('#sync'); if(el) el.textContent = (W.queue.length && W.flushFailed) ? t('pending', { n:W.queue.length }) : t('synced'); }

export function workerTab(tab){
  for(const k of Object.keys(view)) delete view[k];
  if(tab === 'map') return viewMap();
  if(tab === 'people') return viewProfile();
  return viewTasks();
}

function planInfo(task){ return task.plan ? t('routeInfo', { km:fmtDist(task.plan.length_m), h:fmtH(task.plan.length_m) }) : '—'; }

function viewTasks(){
  const list = tasks();
  shell('tasks', `${topbar(t('myTasks'))}
    <div class="pad">
      ${list.length ? list.map((tk, i) => `<button class="card task-card" data-i="${i}">
        <div class="tc-main"><b>${esc(tk.title)}</b><span>${esc([fmtDay(tk.work_date), tk.city_name].filter(Boolean).join(' · '))}</span>
        ${tk.plan ? `<span class="pill" style="--pc:${esc(tk.plan.color || '#2563EB')}">${esc(planInfo(tk))}</span>` : ''}</div>${ICONS.chevron}</button>`).join('')
        : `<div class="empty">${esc(t('noTasks'))}</div>`}
      <button class="btn ghost" id="free" style="margin-top:14px">${esc(t('freeRoute'))}</button>
      <button class="btn ghost small" id="rf">${esc(t('refresh'))}</button>
      ${NATIVE ? '' : `<p class="note">${esc(t('webNote'))}</p>`}
    </div>`);
  document.querySelectorAll('.task-card').forEach(b => b.onclick = () => viewTaskDetail(list[+b.dataset.i]));
  $('#free').onclick = () => beginRoute(null);
  $('#rf').onclick = async () => { $('#rf').disabled = true; await loadMe(); viewTasks(); };
}

async function drawCoverage(m, task, below){
  try{
    const cov = await rpc('task_coverage', { p_token:W.token, p_task_id:task.id });
    (cov || []).forEach(line => { if(line.length > 1) L.polyline(line, { color:GREEN, weight:10, opacity:.22, lineCap:'round', interactive:false }).addTo(m); });
    below && below.forEach(l => l.bringToFront());
  }catch{}
}
function drawTaskBase(m, task){
  let b = L.latLngBounds([[task.start_lat, task.start_lng]]);
  if(task.zone_polygon){ const z = L.polygon(task.zone_polygon, { color:css('--brand'), weight:2, fillOpacity:.06, interactive:false }).addTo(m); b = z.getBounds(); }
  let planLine = null;
  if(task.plan && task.plan.path && task.plan.path.length > 1){ planLine = L.polyline(task.plan.path, { color:task.plan.color || '#2563EB', weight:5, opacity:.75, lineJoin:'round' }).addTo(m); b = planLine.getBounds(); }
  L.marker([task.start_lat, task.start_lng], { icon:dot('pin-start', 24) }).addTo(m);
  return { b, planLine };
}

function viewTaskDetail(task){
  const me = W.me || {};
  shell('tasks', `${topbar(t('yourTask'), true)}
    <div class="pad">
      <div class="person-row">${avatar(me.name)}<div><b>${esc(me.name || '')}</b><span>${esc(t('worker'))}</span></div></div>
      <h2 class="sec">${esc(t('taskInfo'))}:</h2>
      <div class="info">
        <div><span>${esc(t('route'))}</span><b>${esc(task.title)}</b></div>
        <div><span>${esc(t('place'))}</span><b>${esc(task.city_name || '—')}</b></div>
        <div><span>${esc(t('date'))}</span><b>${esc(fmtDay(task.work_date))}</b></div>
        <div><span>${esc(t('duration'))}</span><b>${esc(planInfo(task))}</b></div>
        ${task.notes ? `<div><span>${esc(t('note'))}</span><b>${esc(task.notes)}</b></div>` : ''}
      </div>
      <div class="mapbox" id="tdMap"></div>
      ${task.plan ? '' : `<p class="note">${esc(t('noPlan'))}</p>`}
      <button class="btn primary" id="go">${esc(t('startRoute'))}</button>
      <a class="btn ghost" href="https://maps.apple.com/?daddr=${task.start_lat},${task.start_lng}&dirflg=r">${esc(t('directions'))}</a>
    </div>`);
  bindBack(() => workerTab('tasks'));
  const m = makeMap($('#tdMap'), [task.start_lat, task.start_lng], 14, { dragging:true });
  const { b, planLine } = drawTaskBase(m, task); fit(m, b, 16);
  drawCoverage(m, task, planLine ? [planLine] : []);
  $('#go').onclick = () => beginRoute(task);
}

function viewMap(){
  if(W.route && !W.route.endedAt) return viewTracking();
  const task = W.focus || tasks().find(x => x.plan) || tasks()[0];
  shell('map', `<div id="fullMap" class="fullmap"></div>
    <div class="float-card">${task ? `
      <div class="fc-head"><div><b>${esc(task.title)}</b><span>${esc([fmtDay(task.work_date), planInfo(task)].join(' · '))}</span></div></div>
      <button class="btn primary" id="go">${esc(t('startRoute'))}</button>` : `
      <p class="muted" style="margin:0 0 10px">${esc(t('noActive'))}</p><button class="btn ghost" id="toTasks">${esc(t('openTasks'))}</button>`}
    </div>`, { map:true });
  const m = makeMap($('#fullMap'), task ? [task.start_lat, task.start_lng] : null, 14);
  if(task){ const { b, planLine } = drawTaskBase(m, task); fit(m, b, 40); drawCoverage(m, task, planLine ? [planLine] : []); $('#go').onclick = () => beginRoute(task); }
  else { $('#toTasks').onclick = () => workerTab('tasks'); if(navigator.geolocation) navigator.geolocation.getCurrentPosition(p => { try{ m.setView([p.coords.latitude, p.coords.longitude], 15); L.marker([p.coords.latitude, p.coords.longitude], { icon:dot('me-dot', 20) }).addTo(m); }catch{} }, () => {}); }
}

function viewTracking(){
  const task = routeTask(); ensureTracker();
  const hasPlan = !!W.tracker;
  shell('map', `<div id="fullMap" class="fullmap"></div>
    <button class="icon-btn map-btn" id="recenter" aria-label="center">${ICONS.locate}</button>
    <div class="float-card">
      <div class="fc-row"><span class="rec">${esc(t('recording'))}</span><span class="muted small" id="gps">${esc(W.sim ? t('demoRunning') : t('gpsWait'))}</span></div>
      ${task ? `<div class="fc-title">${esc(task.title)}</div>` : ''}
      <div class="stats"><div><span>${esc(t('time'))}</span><b id="sT">0:00</b></div><div><span>${esc(t('dist'))}</span><b id="sD">0 m</b></div>${hasPlan ? `<div><span>${esc(t('progress'))}</span><b id="sP">0%</b></div>` : ''}</div>
      ${hasPlan ? `<div class="bar"><i id="sBar"></i></div><p class="small muted" style="margin:6px 0 10px">${esc(t('followLine'))}</p>` : ''}
      <button class="btn danger" id="stop">${esc(t('stop'))}</button>
      ${NATIVE ? '' : `<button class="btn ghost" id="demo">${esc(W.sim ? t('demoStop') : t('demoWalk'))}</button>`}
      <div class="sync" id="sync"></div>
    </div>`, { map:true });
  keepAwake(true);
  const last = W.track[W.track.length - 1];
  const m = makeMap($('#fullMap'), last ? [last[0], last[1]] : task ? [task.start_lat, task.start_lng] : null, 16);
  let planLine = null;
  if(task){ const base = drawTaskBase(m, task); planLine = base.planLine; if(!last) fit(m, base.b, 40); drawCoverage(m, task, []); }
  const doneLayer = L.layerGroup().addTo(m);
  const trackLine = L.polyline(W.track.map(p => [p[0], p[1]]), { color:css('--route'), weight:3, opacity:.8 }).addTo(m);
  let meMarker = null; view.follow = true;
  m.on('dragstart', () => { view.follow = false; });
  $('#recenter').onclick = () => { view.follow = true; const l = W.track[W.track.length - 1]; if(l) m.setView([l[0], l[1]], 17); };
  const drawDone = () => { if(!W.tracker) return; doneLayer.clearLayers(); W.tracker.runs().forEach(r => L.polyline(r, { color:GREEN, weight:7, opacity:.95, lineJoin:'round' }).addTo(doneLayer)); const p = W.tracker.pct(); const sp = $('#sP'); if(sp) sp.textContent = p + '%'; const sb = $('#sBar'); if(sb) sb.style.width = p + '%'; };
  let lastDraw = 0;
  view.me = (lat, lng) => { if(!meMarker) meMarker = L.marker([lat, lng], { icon:dot('me-dot', 20), zIndexOffset:1000 }).addTo(m); else meMarker.setLatLng([lat, lng]); };
  view.update = (lat, lng) => {
    trackLine.addLatLng([lat, lng]); view.me(lat, lng);
    if(view.follow) m.panTo([lat, lng], { animate:true });
    if(Date.now() - lastDraw > 800){ lastDraw = Date.now(); drawDone(); }
    updateSync();
  };
  view.refreshDemo = () => { const b = $('#demo'); if(b) b.textContent = W.sim ? t('demoStop') : t('demoWalk'); };
  if(last) view.me(last[0], last[1]);
  drawDone();
  const tick = () => { const sT = $('#sT'); if(!sT || !W.route) return; sT.textContent = fmtTime(Date.now() - W.route.startedAt); $('#sD').textContent = fmtDist(W.route.distance); };
  tick(); every(1000, tick); updateSync();
  $('#stop').onclick = finishRoute;
  if(!NATIVE) $('#demo').onclick = startDemoWalk;
}

function viewProfile(){
  const me = W.me || {};
  const cp = cityPicker(me.cities || []);
  shell('people', `${topbar(t('tabProfile'))}
    <div class="pad">
      <div class="person-row big">${avatar(me.name)}<div><b>${esc(me.name || '')}</b><span>${esc(me.phone || '')}</span></div></div>
      <label class="f">${esc(t('name'))}</label><input class="in" id="pName" value="${esc(me.name)}">
      <label class="f">${esc(t('cities'))}</label>${cp.html}
      <button class="btn primary" id="pSave" style="margin-top:16px">${esc(t('save'))}</button><div class="err" id="pErr"></div>
      ${langSwitch(I.lang)}
      <button class="btn ghost" id="pOut" style="margin-top:20px">${esc(t('logout'))}</button>
      <button class="btn ghost danger-text" id="pDel">${esc(t('delAcc'))}</button>
      <p class="small center"><a href="${PRIVACY_URL}#${I.lang}" class="muted">${esc(t('privacy'))}</a></p>
    </div>`);
  cp.bind();
  $('#pSave').onclick = async () => {
    if(!cp.get().length){ $('#pErr').textContent = t('e_city_required'); return; }
    $('#pSave').disabled = true;
    try{ await rpc('update_worker_profile', { p_token:W.token, p_name:$('#pName').value, p_cities:cp.get() }); await loadMe(); toast(t('saved')); }
    catch(e){ $('#pErr').textContent = errText(e); }
    $('#pSave').disabled = false;
  };
  $('#pOut').onclick = async () => { if(await confirmBox(t('logout'), t('logoutQ'), t('logout'))) forceLogout(); };
  $('#pDel').onclick = async () => { if(!await confirmBox(t('delAcc'), t('delAccQ'), t('delAccYes'), true)) return; try{ await rpc('delete_my_account', { p_token:W.token }); await forceLogout(); }catch(e){ $('#pErr').textContent = errText(e); } };
}

/* ================= auth screens ================= */
export function viewWorkerStart(onBack){
  plain(`<button class="link back-link" id="bk">← ${esc(t('back'))}</button>
    <h1 class="hero">${esc(t('iWorker'))}</h1>
    <button class="btn primary" id="toReg">${esc(t('register'))}</button>
    <button class="btn ghost" id="toLogin">${esc(t('haveAccount'))}</button>`);
  $('#bk').onclick = onBack; $('#toReg').onclick = () => viewRegister(onBack); $('#toLogin').onclick = () => viewLogin(onBack);
}
function viewRegister(onBack){
  const cp = cityPicker([]);
  plain(`<button class="link back-link" id="bk">← ${esc(t('back'))}</button>
    <h1 class="hero">${esc(t('register'))}</h1>
    <label class="f">${esc(t('name'))}</label><input class="in" id="rName" autocomplete="name">
    <label class="f">${esc(t('phone'))}</label><input class="in" id="rPhone" type="tel" autocomplete="tel" placeholder="+49 …">
    <label class="f">${esc(t('cities'))}</label>${cp.html}
    <label class="f">${esc(t('pin'))}</label><input class="in pin" id="rPin" inputmode="numeric" maxlength="4" autocomplete="off">
    <p class="small muted">${esc(t('pinHint'))}</p>
    <button class="btn primary" id="rGo">${esc(t('create'))}</button><div class="err" id="rErr"></div>
    <p class="small muted">${esc(t('regAgree'))} <a href="${PRIVACY_URL}#${I.lang}">${esc(t('privacy'))}</a>.</p>`);
  cp.bind();
  $('#bk').onclick = () => viewWorkerStart(onBack);
  $('#rGo').onclick = async () => {
    const name = $('#rName').value.trim(), phone = $('#rPhone').value.trim(), pin = $('#rPin').value.trim(), cities = cp.get();
    const err = name.length < 2 ? 'name_required' : phone.replace(/\D/g, '').length < 6 ? 'phone_required' : !cities.length ? 'city_required' : !/^\d{4}$/.test(pin) ? 'pin_4_digits' : null;
    if(err){ $('#rErr').textContent = t('e_' + err); return; }
    $('#rGo').disabled = true; $('#rErr').textContent = '';
    try{ await loggedIn(await rpc('register_worker', { p_name:name, p_phone:phone, p_cities:cities, p_pin:pin })); }
    catch(e){ $('#rErr').textContent = errText(e); $('#rGo').disabled = false; }
  };
}
function viewLogin(onBack){
  plain(`<button class="link back-link" id="bk">← ${esc(t('back'))}</button>
    <h1 class="hero">${esc(t('loginTitle'))}</h1><p class="muted">${esc(t('loginText'))}</p>
    <label class="f">${esc(t('phone'))}</label><input class="in" id="lPhone" type="tel" autocomplete="tel">
    <label class="f">PIN</label><input class="in pin" id="lPin" inputmode="numeric" maxlength="4">
    <button class="btn primary" id="lGo" style="margin-top:18px">${esc(t('login'))}</button><div class="err" id="lErr"></div>`);
  $('#bk').onclick = () => viewWorkerStart(onBack);
  $('#lGo').onclick = async () => {
    $('#lGo').disabled = true; $('#lErr').textContent = '';
    try{ const token = await rpc('recover_worker', { p_phone:$('#lPhone').value, p_pin:$('#lPin').value.trim() }); if(!token) throw new ApiError('wrong'); await loggedIn(token); }
    catch(e){ $('#lErr').textContent = e.message === 'wrong_phone_or_pin' ? t('e_wrong') : errText(e); $('#lGo').disabled = false; }
  };
}
async function loggedIn(token){ W.token = token; await store.set('token', token); await store.set('role', 'worker'); await loadMe(); W.hooks.loggedIn && W.hooks.loggedIn(); }

/* ================= boot ================= */
export async function bootWorker(){
  W.token = await store.get('token'); W.me = await store.get('me');
  W.route = await store.get('route'); W.queue = await store.get('queue') || []; W.track = await store.get('track') || [];
  if(!W.token) return false;
  UI.role = 'worker'; UI.onTab = workerTab;
  if(W.route && !W.route.endedAt){ workerTab('map'); startWatching(); flush(); loadMe(); return true; }
  workerTab('tasks'); flush(); await loadMe(); if(UI.tab === 'tasks' && !document.querySelector('.topbar #tbBack')) workerTab('tasks');
  return true;
}
App.addListener('appStateChange', ({ isActive }) => { if(isActive && UI.role === 'worker'){ flush(); if(UI.tab === 'tasks' && !document.querySelector('#tbBack')) loadMe().then(() => workerTab('tasks')); } });
