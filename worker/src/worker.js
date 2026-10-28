import L from 'leaflet';
import { registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import Planner from '../../admin/planner.js';
import { makeNav, dayProgress } from './nav.js';
import { locationNote, legalLinks, bindLegal } from './legalview.js';
import { t, I } from './i18n.js';
import { NATIVE, PRIVACY_URL, store, rpc, errText, $, esc, css, hav, fmtDist, fmtHm, fmtN, fmtTime, fmtDay, loopPath } from './core.js';
import { UI, ICONS, shell, plain, topbar, bindBack, makeMap, dot, fit, modal, confirmBox, toast, cityPicker, langSwitch, themeSwitch, statusPill, emptyState, avatar, every } from './ui.js';

const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');
const GREEN = '#16A34A';

export const W = { gps:{ state:'wait', acc:null, at:0 }, canAdmin:false, token:null, me:null, route:null, queue:[], track:[], busy:false, watcherId:null, focus:null, tracker:null, counter:null, prev:null, sim:null, flushFailed:false, hooks:{} };
const tasks = () => (W.me && W.me.tasks) || [];

/* ================= sync ================= */
async function saveRoute(){ await store.set('route', W.route); await store.set('queue', W.queue); await store.set('track', W.track.slice(-6000)); }
export async function flush(){
  if(W.busy || !W.token || !W.route) return;
  W.busy = true;
  try{
    const r = W.route;
    if(!r.id){ r.id = await rpc('start_route', { p_token:W.token, p_task_id:r.taskId, p_started_at:new Date(r.startedAt).toISOString(), p_plan_id:r.planId || null }); await saveRoute(); }
    const pushUpTo = async limit => {
      while(W.queue.length && (limit == null || Date.parse(W.queue[0].t) < limit)){
        const batch = []; for(const p of W.queue){ if(batch.length >= 300 || (limit != null && Date.parse(p.t) >= limit)) break; batch.push(p); }
        await rpc('push_points', { p_token:W.token, p_route_id:r.id, p_points:batch });
        W.queue.splice(0, batch.length); await store.set('queue', W.queue);
      }
    };
    while(r.ops && r.ops.length){
      const op = r.ops[0]; await pushUpTo(op.t);
      await rpc(op.k === 'pause' ? 'pause_route' : 'resume_route', { p_token:W.token, p_route_id:r.id, p_at:new Date(op.t).toISOString() });
      r.ops.shift(); await saveRoute();
    }
    await pushUpTo(null);
    if(r.endedAt){
      await rpc('end_route', { p_token:W.token, p_route_id:r.id, p_ended_at:new Date(r.endedAt).toISOString() });
      W.route = null; W.queue = []; W.track = []; W.tracker = null; W.counter = null; W.prev = null;
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
  Object.assign(W, { token:null, me:null, route:null, queue:[], track:[], tracker:null, counter:null, prev:null });
  for(const k of ['token', 'me', 'route', 'queue', 'track', 'role', 'canAdmin']) await store.del(k);
  W.hooks.loggedOut && W.hooks.loggedOut();
  if(msg) modal(`<h2>FlyerMap</h2><p>${esc(msg)}</p>`);
}

/* ================= tracking ================= */
function routeTask(){ return W.route && W.route.task; }
function ensureTracker(){
  const p = routeTask() && routeTask().plan;
  if(p && p.path && p.path.length > 1 && !W.tracker){
    W.tracker = Planner.makeTracker(p.path); if(W.prev) W.tracker.addTrack(W.prev); W.tracker.addTrack(W.track.map(x => [x[0], x[1]]));
  }
  if(p && p.boxes && p.boxes.length && !W.counter){
    W.counter = Planner.makeBoxCounter(p.boxes); if(W.prev) W.counter.visitAll(W.prev); W.counter.visitAll(W.track.map(x => [x[0], x[1]]));
  }
}
function onLocation(lat, lng, acc, time, sim){
  if(!W.route || W.route.endedAt || W.route.paused) return;
  if(W.sim && !sim) return;
  W.gps.at = Date.now(); W.gps.acc = acc == null ? null : Math.round(acc);
  if(acc != null && acc > 50){ setGps('weak'); return; }
  setGps('ok');
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
  if(W.counter){ if(last && sim !== 'first') W.counter.visitLine([last[0], last[1]], [lat, lng]); else W.counter.visit(lat, lng); }
  W.track.push([lat, lng, time]);
  W.queue.push({ t:new Date(time).toISOString(), lat:+lat.toFixed(6), lng:+lng.toFixed(6), acc: acc == null ? null : Math.round(acc) });
  saveRoute();
  view.update && view.update(lat, lng);
  if(W.queue.length >= 10) flush();
}
async function startWatching(){
  if(W.watcherId) return;
  W.gps = { state:'wait', acc:null, at:0 };
  if(NATIVE){
    W.watcherId = await BackgroundGeolocation.addWatcher({ backgroundTitle:t('bgTitle'), backgroundMessage:t('bgMsg'), requestPermissions:true, stale:false, distanceFilter:5 },
      (loc, err) => { if(err){ if(err.code === 'NOT_AUTHORIZED'){ setGps('denied'); showLocDenied(); } else setGps('off'); return; } if(loc) onLocation(loc.latitude, loc.longitude, loc.accuracy, loc.time || Date.now()); });
  }else if(navigator.geolocation){
    W.watcherId = 'web:' + navigator.geolocation.watchPosition(p => onLocation(p.coords.latitude, p.coords.longitude, p.coords.accuracy, p.timestamp), e => setGps(e && e.code === 1 ? 'denied' : e && e.code === 2 ? 'off' : 'wait'), { enableHighAccuracy:true, maximumAge:0 });
  }else setGps('off');
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

// one position fix (native: through the background plugin, which also asks for permission)
function hereOnce(ms){
  return new Promise(resolve => {
    let done = false, id = null; const fin = v => { if(done) return; done = true; if(id != null){ if(String(id).startsWith('web:')) navigator.geolocation.clearWatch(+String(id).slice(4)); else BackgroundGeolocation.removeWatcher({ id }).catch(() => {}); } resolve(v); };
    setTimeout(() => fin(null), ms || 20000);
    if(NATIVE){
      BackgroundGeolocation.addWatcher({ requestPermissions:true, stale:false }, (loc, err) => { if(err){ if(err.code === 'NOT_AUTHORIZED') showLocDenied(); fin(null); return; } if(loc && loc.accuracy <= 100) fin({ lat:loc.latitude, lng:loc.longitude, acc:loc.accuracy }); }).then(x => { id = x; if(done) BackgroundGeolocation.removeWatcher({ id:x }).catch(() => {}); }, () => fin(null));
    }else if(navigator.geolocation){
      id = 'web:' + navigator.geolocation.watchPosition(p => { if(p.coords.accuracy <= 100) fin({ lat:p.coords.latitude, lng:p.coords.longitude, acc:p.coords.accuracy }); }, () => fin(null), { enableHighAccuracy:true, maximumAge:15000 });
    }else fin(null);
  });
}
const START_RADIUS = 150;   // metres from the start point within which the working day can begin
const AHEAD_M = 400;        // bright stretch of the route in front of the walker
// the working day starts only at the start point: checks the position first; a test worker / admin may override
async function atStartOrAsk(task){
  if(!task || task.start_lat == null) return true;
  const mo = modal(`<h2>${esc(t('startCheck'))}</h2><p class="muted">${esc(t('startLocating'))}</p>`);
  const here = await hereOnce(20000); mo.remove();
  const tester = W.canAdmin || String((W.me && W.me.phone) || '').startsWith('+4900000000');
  const d = here ? hav(here.lat, here.lng, task.start_lat, task.start_lng) : null;
  if(d != null && d - Math.min(here.acc || 0, 50) <= START_RADIUS) return true;
  return new Promise(resolve => {
    const m2 = modal(`<h2>${esc(t('notAtStart'))}</h2>
      <p>${esc(d == null ? t('startNoGps') : t('startTooFar', { d:fmtDist(d), r:START_RADIUS + ' ' + t('m') }))}</p>
      <a class="btn primary" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${task.start_lat},${task.start_lng}&travelmode=walking">${esc(t('toStart'))}</a>
      <button class="btn ghost" data-again>${esc(t('checkAgain'))}</button>
      ${tester ? `<button class="btn ghost" data-force>${esc(t('startAnyway'))}</button>` : ''}
      <button class="btn ghost" data-n>${esc(t('cancel'))}</button>`);
    m2.querySelector('[data-n]').onclick = () => { m2.remove(); resolve(false); };
    m2.querySelector('[data-again]').onclick = async () => { m2.remove(); resolve(await atStartOrAsk(task)); };
    const f = m2.querySelector('[data-force]'); if(f) f.onclick = () => { m2.remove(); resolve(true); };
  });
}
export async function beginRoute(task){
  if(!await locationNote(W.me, async v => { await rpc('ack_privacy', { p_token:W.token, p_version:v }); if(W.me){ W.me.privacy_version = v; await store.set('me', W.me); } })) return;
  if(!await atStartOrAsk(task)) return;
  const plan = task && task.plan;
  W.route = { id:null, taskId:task ? task.id : null, planId:plan ? plan.id : null, task:task || null, startedAt:Date.now(), endedAt:null, distance:0, paused:false, pausedAt:null, breakMs:0, ops:[] };
  W.queue = []; W.track = []; W.tracker = null; W.counter = null; W.prev = null;
  await saveRoute();
  if(plan && plan.id){ try{ W.prev = await rpc('plan_progress', { p_token:W.token, p_plan_id:plan.id }); }catch{} }
  workerTab('map');
  await startWatching(); flush();
}
const workMs = () => { const r = W.route; return Math.max(0, (r.paused ? r.pausedAt : Date.now()) - r.startedAt - (r.breakMs || 0)); };
function pace30(){ const now = Date.now(); let s = 0; for(let i = W.track.length - 1; i > 0; i--){ const a = W.track[i-1], b = W.track[i]; if(now - b[2] > 30 * 60e3) break; if(b[2] - a[2] > 90e3) continue; s += hav(a[0], a[1], b[0], b[1]); } return s; }
async function pauseRoute(){
  const r = W.route; if(!r || r.paused) return;
  stopDemoWalk(); r.paused = true; r.pausedAt = Date.now(); (r.ops = r.ops || []).push({ k:'pause', t:r.pausedAt });
  await stopWatching(); keepAwake(false); await saveRoute(); flush(); viewTracking();
}
async function resumeRoute(){
  const r = W.route; if(!r || !r.paused) return;
  const now = Date.now(); r.breakMs = (r.breakMs || 0) + (now - r.pausedAt); r.paused = false; r.pausedAt = null; (r.ops = r.ops || []).push({ k:'resume', t:now });
  await saveRoute(); await startWatching(); flush(); viewTracking();
}
async function finishRoute(){
  if(!await confirmBox(t('stopQ'), t('stopText'), t('stopYes'), true)) return;
  const r = W.route, task = routeTask(), net = workMs(), dist = r.distance, fl = W.counter ? W.counter.count() : null;
  stopDemoWalk(); keepAwake(false); await stopWatching();
  if(r.paused){ r.breakMs = (r.breakMs || 0) + (Date.now() - r.pausedAt); r.paused = false; r.pausedAt = null; (r.ops = r.ops || []).push({ k:'resume', t:Date.now() }); }
  r.endedAt = Date.now(); await saveRoute(); await flush();
  await loadMe(); workerTab('tasks');
  const plan = task && ((tasks().find(x => x.id === task.id) || {}).plan);
  const next = plan && (plan.work_dates || []).map(d => String(d).slice(0, 10)).filter(d => d > new Date().toISOString().slice(0, 10)).sort()[0];
  const hh = Math.floor(net / 3600000), mm = Math.floor(net % 3600000 / 60000);
  const mo = modal(`<h2>${esc(t('summaryTitle'))}</h2><p>${esc(t('summaryBody', { h:hh + ':' + String(mm).padStart(2, '0') + ' ' + t('h'), d:fmtDist(dist), f: fl == null ? '—' : fmtN(fl) }))}</p>
    <p class="muted">${esc(next ? t('nextDay', { date:fmtDay(next) }) : t('noNext'))}</p><button class="btn primary" data-n>${esc(t('ok'))}</button>`);
  mo.querySelector('[data-n]').onclick = () => mo.remove();
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
// GPS indicator — only about the position signal, never about the route (a route can run while GPS is still searching)
// states: wait (searching) · ok (fix, ±m) · weak (inaccurate) · stale (no fix for 60 s) · denied (no permission) · off (location services off)
function setGps(state){ if(state) W.gps.state = state; renderGps(); }
function renderGps(){
  const g = $('#gps'); if(!g) return;
  if(W.sim){ g.className = 'gps ok'; g.innerHTML = ICONS.gps + esc(t('demoRunning')); return; }
  let st = W.gps.state;
  if((st === 'ok' || st === 'weak') && Date.now() - W.gps.at > 60e3) st = 'stale';
  const cls = { ok:'ok', weak:'warn', stale:'warn', wait:'', denied:'bad', off:'bad' }[st] || '';
  const txt = st === 'ok' ? t('gps_ok', { m:W.gps.acc != null ? W.gps.acc : '?' }) : st === 'weak' ? t('gps_weak', { m:W.gps.acc }) : t('gps_' + st);
  g.className = 'gps ' + cls; g.innerHTML = ICONS.gps + esc(txt);
}
// sending is a third, separate state: points are queued while there is no connection and sent later
function updateSync(){
  const el = $('#sync'); if(!el) return;
  const fail = W.queue.length && (W.flushFailed || !navigator.onLine);
  el.className = 'sync' + (fail ? ' danger-text' : '');
  el.textContent = fail ? t('pending', { n:W.queue.length }) : t('synced');
}

export function workerTab(tab){
  for(const k of Object.keys(view)) delete view[k];
  if(tab === 'map') return viewMap();
  if(tab === 'people') return viewProfile();
  return viewTasks();
}

function planInfo(task){ return task.plan ? t('routeInfo', { km:fmtDist(task.plan.length_m), h:fmtHm(task.plan.minutes || 0) }) : '—'; }

const dayList = pl => (pl && pl.work_dates || []).map(d => String(d).slice(0, 10)).sort();
const stClass = p => !p ? '' : p.status === 'accepted' ? '' : p.status === 'declined' ? 'bad' : p.status === 'done' ? 'ok' : 'warn';
const accClass = p => ({ '':'acc-info', bad:'acc-bad', ok:'acc-ok', warn:'acc-warn' }[stClass(p)] || 'acc-neutral');
const stLabel = p => !p ? '' : p.status === 'accepted' ? t('stAccepted') : p.status === 'declined' ? t('stDeclined') : p.status === 'done' ? t('stDone') : t('stNew');
function taskDates(tk){ const d = dayList(tk.plan); return d.length ? d.map(fmtDay).join(', ') : fmtDay(tk.work_date); }
function viewTasks(){
  const list = tasks(), unread = ((W.me && W.me.inbox) || []).filter(n => !n.read).length;
  const nNew = list.filter(x => x.plan && x.plan.status === 'offered').length, nAcc = list.filter(x => x.plan && x.plan.status === 'accepted').length;
  shell('tasks', `${topbar(t('myTasks'), null, `<button class="icon-btn" id="rf" aria-label="${esc(t('refresh'))}">${ICONS.refresh}</button><button class="icon-btn" id="bell" aria-label="${esc(t('inbox'))}" style="position:relative">${ICONS.bell}${unread ? `<span class="badge">${unread}</span>` : ''}</button>`)}
    <div class="pad">
      ${list.length ? `<div class="kpis two"><div class="kpi k-warn"><b>${nNew}</b><span>${esc(t('kNew'))}</span></div><div class="kpi k-info"><b>${nAcc}</b><span>${esc(t('stAccepted'))}</span></div></div>` : ''}
      ${list.length ? list.map((tk, i) => `<button class="card acc ${accClass(tk.plan)} task-card" data-i="${i}">
        <div class="tc-main"><b>${esc(tk.title)}</b>
        <div class="tc-meta"><i>${ICONS.calendar}${esc(taskDates(tk))}</i>${tk.district || tk.city_name ? `<i>${ICONS.pin}${esc([tk.district, tk.city_name].filter(Boolean).join(', '))}</i>` : ''}${tk.plan ? `<i>${ICONS.route}${esc(fmtDist(tk.plan.length_m))} · ${esc(fmtHm(tk.plan.minutes || 0))} ${esc(t('h'))}</i><i>${ICONS.mail}${esc(fmtN(tk.plan.mailboxes || 0))}</i>` : ''}</div>
        ${tk.plan ? statusPill(stClass(tk.plan) || 'info', stLabel(tk.plan)) : ''}</div>${ICONS.chevron}</button>`).join('')
        : emptyState(t('noTasks'), 'flag')}
      <button class="btn ghost" id="free" style="margin-top:16px">${ICONS.route}${esc(t('freeRoute'))}</button>
      ${NATIVE ? '' : `<p class="note">${esc(t('webNote'))}</p>`}
    </div>`);
  document.querySelectorAll('.task-card').forEach(b => b.onclick = () => viewTaskDetail(list[+b.dataset.i]));
  $('#bell').onclick = viewInbox;
  $('#free').onclick = () => beginRoute(null);
  $('#rf').onclick = async () => { const b = $('#rf'); b.disabled = true; b.style.opacity = .5; try{ await loadMe(); }catch{ toast(t('netErr')); } viewTasks(); };
}
function viewInbox(){
  const items = (W.me && W.me.inbox) || [];
  shell('tasks', `${topbar(t('inbox'), true)}<div class="pad">${items.length ? items.map((n, i) => `<button class="notif ${n.read ? '' : 'new'}" data-i="${i}"><b>${esc(n.title)}</b><span>${esc(n.body || '')}</span></button>`).join('') : emptyState(t('noInbox'), 'bell')}</div>`);
  bindBack(viewTasks);
  document.querySelectorAll('.notif').forEach(b => b.onclick = () => { const n = items[+b.dataset.i]; const tk = tasks().find(x => x.id === n.task_id); if(tk) viewTaskDetail(tk); });
  if(items.some(n => !n.read)){ rpc('mark_notifications_read', { p_token:W.token }).then(() => { items.forEach(n => { n.read = true; }); store.set('me', W.me); }).catch(() => {}); }
}

async function drawCoverage(m, task, below){
  try{
    const cov = await rpc('task_coverage', { p_token:W.token, p_task_id:task.id });
    (cov || []).forEach(line => { if(line.length > 1) L.polyline(line, { color:GREEN, weight:10, opacity:.22, lineCap:'round', interactive:false }).addTo(m); });
    below && below.forEach(l => l.bringToFront());
  }catch{}
}
function drawTaskBase(m, task, dayIdx, dim){
  let b = L.latLngBounds([[task.start_lat, task.start_lng]]);
  if(task.zone_polygon){ const z = L.polygon(task.zone_polygon, { color:css('--brand'), weight:2, fillOpacity:.06, interactive:false }).addTo(m); b = z.getBounds(); }
  let planLine = null; const pl = task.plan;
  if(pl && pl.path && pl.path.length > 1){
    const col = pl.color || '#2563EB', days = pl.days && pl.days.length > 1 ? pl.days : null;
    if(days){   // several working days: today's loop is drawn strong, the other days faded (alternating dashes tell them apart)
      planLine = L.featureGroup(days.map((d, k) => { const on = dayIdx == null || dayIdx === k; return L.polyline(pl.path.slice(d.i0, d.i1 + 1), { color:col, weight:on ? (dim ? 4 : 5) : 3, opacity:on ? (dim ? .35 : .8) : (dim ? .15 : .3), dashArray:k % 2 ? '9 7' : null, lineJoin:'round' }).addTo(m); }));
    }else planLine = L.polyline(pl.path, { color:col, weight:dim ? 4 : 5, opacity:dim ? .35 : .75, lineJoin:'round' }).addTo(m);
    b = planLine.getBounds();
  }
  L.marker([task.start_lat, task.start_lng], { icon:dot('pin-start', 24) }).addTo(m);
  return { b, planLine };
}

function viewTaskDetail(task){
  const me = W.me || {}, plan = task.plan, hrs = task.work_hours || 7;
  const need = plan ? Math.max(1, Math.ceil((plan.minutes || 0) / 60 / hrs)) : 1;
  const today = new Date().toISOString().slice(0, 10), addDays = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const first = (task.work_date && String(task.work_date).slice(0, 10) >= today) ? String(task.work_date).slice(0, 10) : addDays(today, 1);
  const st = plan ? plan.status : null;
  shell('tasks', `${topbar(t('yourTask'), true)}
    <div class="pad">
      <div class="sec-row" style="margin-top:4px"><h2>${esc(task.title)}</h2>${plan ? statusPill(stClass(plan) || 'info', stLabel(plan)) : ''}</div>
      <div class="info">
        <div><span>${esc(t('route'))}</span><b>${esc(task.title)}</b></div>
        <div><span>${esc(t('place'))}</span><b>${esc([task.district, task.city_name].filter(Boolean).join(', ') || '—')}</b></div>
        <div><span>${esc(t('dates'))}</span><b>${esc(taskDates(task))}</b></div>
        ${plan ? `<div><span>${esc(t('mailboxes'))}</span><b>${esc(t('mbApprox', { n:fmtN(plan.mailboxes || 0) }))}</b></div>
        <div><span>${esc(t('duration'))}</span><b>${esc(planInfo(task))}</b></div>` : ''}
        ${task.quota_m30 ? `<div><span>${esc(t('quotaInfo'))}</span><b>${fmtN(task.quota_m30)} m / 30 ${esc(t('min'))}</b></div>` : ''}
        ${task.notes ? `<div><span>${esc(t('note'))}</span><b>${esc(task.notes)}</b></div>` : ''}
      </div>
      ${plan && plan.days && plan.days.length > 1 ? `<h2 class="sec">${esc(t('route'))}:</h2><div class="info">${plan.days.map((d, k) => `<div><span>${esc(t('dayN', { n:k + 1 }))}${dayList(plan)[k] ? ' · ' + esc(fmtDay(dayList(plan)[k])) : ''}</span><b>${esc(t('routeLine', { km:fmtDist(d.length_m), h:fmtHm(d.minutes || 0), mb:fmtN(d.mailboxes || 0) }))} <i id="dp${k}"></i></b></div>`).join('')}</div>` : ''}
      <div class="mapbox" id="tdMap"></div>
      ${plan ? '' : `<p class="note">${esc(t('noPlan'))}</p>`}
      ${plan && st === 'offered' ? `<h2 class="sec">${esc(t('pickDays'))}</h2><p class="small muted" style="margin-top:-6px">${esc(t('dayHint', { h:(plan.minutes / 60).toFixed(1).replace('.', ','), n:need }))}</p>
        <div class="dates">${Array.from({ length:need }, (_, i) => `<label><span>${esc(t('dayN', { n:i + 1 }))}</span><input class="in" type="date" data-day="${i}" min="${today}" value="${addDays(first, i)}"></label>`).join('')}</div>
        <button class="btn primary" id="acc">${esc(t('accept'))}</button><button class="btn ghost" id="dec">${esc(t('decline'))}</button><div class="err" id="accErr"></div>` : ''}
      ${plan && st === 'accepted' ? `<p class="hint">${esc(t('yourDates'))}: <b>${esc(dayList(plan).map(fmtDay).join(', '))}</b></p>` : ''}
      ${plan && st === 'declined' ? `<p class="note">${esc(t('stDeclined'))}</p>` : ''}
      ${(!plan || st === 'accepted') ? `<button class="btn primary big" id="go">${ICONS.play}<span>${esc(t('startRoute'))}</span></button>` : ''}
      <a class="btn ghost" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${task.start_lat},${task.start_lng}&travelmode=transit">${ICONS.pin}${esc(t('directions'))}</a>
    </div>`);
  bindBack(() => workerTab('tasks'));
  const m = makeMap($('#tdMap'), [task.start_lat, task.start_lng], 14, { dragging:true });
  const { b, planLine } = drawTaskBase(m, task); fit(m, b, 16);
  drawCoverage(m, task, planLine ? [planLine] : []);
  if($('#go')) $('#go').onclick = () => beginRoute(task);
  if(plan && plan.days && plan.days.length > 1 && st === 'accepted'){   // how much of each day is already walked → which day comes next
    rpc('plan_progress', { p_token:W.token, p_plan_id:plan.id }).then(prev => {
      const tr = Planner.makeTracker(plan.path); tr.addTrack(prev || []);
      const pc = dayProgress(plan, tr); pc.forEach((p, k) => { const el = $('#dp' + k); if(el) el.innerHTML = p >= 95 ? statusPill('ok', t('stDone')) : p ? '· ' + p + '%' : ''; });
      const next = pc.findIndex(p => p < 95), go = $('#go'); if(go && next >= 0) go.querySelector('span').textContent = t('startDayN', { n:next + 1 });
    }).catch(() => {});
  }
  if($('#acc')) $('#acc').onclick = async () => {
    const dates = [...document.querySelectorAll('[data-day]')].map(i => i.value).filter(Boolean);
    if(dates.length < need || new Set(dates).size !== dates.length){ $('#accErr').textContent = t('e_date_required'); return; }
    $('#acc').disabled = true;
    try{ await rpc('respond_plan', { p_token:W.token, p_plan_id:plan.id, p_accept:true, p_dates:dates.sort() }); await loadMe(); toast(t('stAccepted')); viewTaskDetail(tasks().find(x => x.id === task.id) || task); }
    catch(e){ $('#accErr').textContent = errText(e); $('#acc').disabled = false; }
  };
  if($('#dec')) $('#dec').onclick = async () => {
    if(!await confirmBox(t('declineQ'), t('declineText'), t('decline'), true)) return;
    try{ await rpc('respond_plan', { p_token:W.token, p_plan_id:plan.id, p_accept:false, p_dates:[] }); await loadMe(); workerTab('tasks'); }catch(e){ $('#accErr').textContent = errText(e); }
  };
}

function viewMap(){
  if(W.route && !W.route.endedAt) return viewTracking();
  const task = W.focus || tasks().find(x => x.plan && x.plan.status === 'accepted') || tasks().find(x => !x.plan) || null;
  shell('map', `<div id="fullMap" class="fullmap"></div>
    <div class="float-card">${task ? `
      <div class="fc-head"><div><b>${esc(task.title)}</b><span>${esc([fmtDay(task.work_date), planInfo(task)].join(' · '))}</span></div></div>
      <button class="btn primary big" id="go">${ICONS.play}${esc(t('startRoute'))}</button>` : `
      <p class="muted" style="margin:0 0 10px">${esc(t('noActive'))}</p><button class="btn ghost" id="toTasks">${ICONS.flag}${esc(t('openTasks'))}</button>`}
    </div>`, { map:true });
  const m = makeMap($('#fullMap'), task ? [task.start_lat, task.start_lng] : null, 14);
  if(task){ const { b, planLine } = drawTaskBase(m, task); fit(m, b, 40); drawCoverage(m, task, planLine ? [planLine] : []); $('#go').onclick = () => beginRoute(task); }
  else { $('#toTasks').onclick = () => workerTab('tasks'); if(navigator.geolocation) navigator.geolocation.getCurrentPosition(p => { try{ m.setView([p.coords.latitude, p.coords.longitude], 15); L.marker([p.coords.latitude, p.coords.longitude], { icon:dot('me-dot', 20) }).addTo(m); }catch{} }, () => {}); }
}

function viewTracking(){
  const task = routeTask(); ensureTracker();
  const hasPlan = !!W.tracker, paused = !!W.route.paused, quota = task && task.quota_m30;
  shell('map', `<div id="fullMap" class="fullmap"></div>
    <button class="icon-btn map-btn" id="recenter" aria-label="center">${ICONS.locate}</button>
    ${hasPlan ? `<div class="nav" id="nav"><div class="nav-ic" id="navIc"></div><div class="nav-tx"><b id="navMain"></b><span id="navSub"></span></div><a class="nav-ext" id="navExt" target="_blank" rel="noopener" aria-label="${esc(t('navExt'))}">${ICONS.map}</a></div>` : ''}
    <div class="float-card">
      <div class="fc-row">${paused ? `<span class="rec paused">${esc(t('pauseRunning'))}</span><b id="sPause">0:00</b>` : `<span class="rec">${esc(t('recording'))}</span><span class="gps" id="gps" role="status"></span>`}</div>
      ${task ? `<div class="fc-title">${esc(task.title)}</div>` : ''}
      <div class="stats"><div><span>${esc(t('netTime'))}</span><b id="sT">0:00</b></div><div><span>${esc(t('dist'))}</span><b id="sD">0 m</b></div>${W.counter ? `<div><span>${esc(t('flyersEst'))}</span><b id="sF">0</b></div>` : hasPlan ? `<div><span>${esc(t('progress'))}</span><b id="sP">0%</b></div>` : ''}</div>
      ${hasPlan ? `<div class="bar"><i id="sBar"></i></div>${W.counter ? `<p class="small muted" style="margin:6px 0 0" id="sFl"></p>` : ''}` : ''}
      ${quota && !paused ? `<div class="quota" id="quota"><i></i><span id="quotaTxt"></span></div>` : ''}
      ${hasPlan && !paused ? `<p class="small muted" style="margin:6px 0 10px">${esc(t('followLine'))}</p>` : '<div style="height:8px"></div>'}
      ${paused ? `<button class="btn primary" id="resume">${esc(t('resumeBtn'))}</button>` : `<button class="btn ghost" id="pause">${esc(t('pause'))}</button>`}
      <button class="btn danger" id="stop">${esc(t('stop'))}</button>
      ${NATIVE || paused ? '' : `<button class="btn ghost" id="demo">${esc(W.sim ? t('demoStop') : t('demoWalk'))}</button>`}
      <div class="sync" id="sync"></div>
    </div>`, { map:true });
  if(!paused) keepAwake(true);
  const last = W.track[W.track.length - 1];
  const m = makeMap($('#fullMap'), last ? [last[0], last[1]] : task ? [task.start_lat, task.start_lng] : null, 16);
  // navigation along the planned line: which working day we are on, and the next turn
  const plan = task && task.plan, nav = hasPlan && plan && plan.path && plan.path.length > 1 ? makeNav(plan) : null;
  if(nav){ nav.setPosFromSample(W.tracker.nextIndex()); if(W.route.dayIdx == null){ W.route.dayIdx = nav.dayAt(); saveRoute(); } }
  const dayIdx = nav ? W.route.dayIdx : null;
  if(task){ const base = drawTaskBase(m, task, dayIdx, !!nav); if(!last) fit(m, base.b, 40); drawCoverage(m, task, []); }
  const doneLayer = L.layerGroup().addTo(m);
  // the next ~400 m of the route bright and thick, the rest of the day faded: the walker sees where to go now
  const aheadLayer = L.layerGroup().addTo(m), aheadCol = (plan && plan.color) || '#2563EB';
  const drawAhead = () => {
    if(!nav) return; aheadLayer.clearLayers();
    const pts = nav.ahead(dayIdx, AHEAD_M); if(pts.length < 2) return;
    L.polyline(pts, { color:'#fff', weight:11, opacity:.9, lineJoin:'round', lineCap:'round', interactive:false }).addTo(aheadLayer);
    L.polyline(pts, { color:aheadCol, weight:7, opacity:1, lineJoin:'round', lineCap:'round', interactive:false }).addTo(aheadLayer);
    L.marker(pts[pts.length - 1], { icon:dot('ahead-dot', 12), interactive:false }).addTo(aheadLayer);
  };
  const trackLine = L.polyline(W.track.map(p => [p[0], p[1]]), { color:css('--route'), weight:3, opacity:.8 }).addTo(m);
  let meMarker = null; view.follow = true;
  m.on('dragstart', () => { view.follow = false; });
  $('#recenter').onclick = () => { view.follow = true; const l = W.track[W.track.length - 1]; if(l) m.setView([l[0], l[1]], 17); };
  const drawDone = () => {
    if(!W.tracker) return; doneLayer.clearLayers();
    W.tracker.runs().forEach(r => L.polyline(r, { color:GREEN, weight:7, opacity:.95, lineJoin:'round' }).addTo(doneLayer));
    const p = W.tracker.pct(), sp = $('#sP'); if(sp) sp.textContent = p + '%'; const bar = $('#sBar'); if(bar) bar.style.width = p + '%';
  };
  const stats = () => {
    if(!W.route) return;
    const sT = $('#sT'); if(sT) sT.textContent = fmtTime(workMs()); const sD = $('#sD'); if(sD) sD.textContent = fmtDist(W.route.distance);
    if(W.counter){ const f = $('#sF'); if(f) f.textContent = fmtN(W.counter.count()); const fl = $('#sFl'); if(fl) fl.textContent = t('flyersOf', { a:fmtN(W.counter.count()), b:fmtN(W.counter.total) }); }
    const sp = $('#sPause'); if(sp && W.route.paused) sp.textContent = fmtTime(Date.now() - W.route.pausedAt);
    const q = $('#quota'); if(q && quota){
      const wm = workMs() / 60000, got = pace30(), need = quota * Math.min(30, wm) / 30;
      q.className = 'quota ' + (wm < 5 ? '' : got >= need * .95 ? '' : got >= need * .7 ? 'warn' : 'bad');
      $('#quotaTxt').textContent = t('quotaLine', { a:fmtN(got), b:fmtN(quota) });
    }
  };
  let lastDraw = 0, lastOff = 0;
  const ARROW = { start:0, S:0, SL:-45, SR:45, L:-90, R:90, U:180 };
  const updateNav = () => {
    if(!nav || !$('#nav')) return;
    const n = nav.next(dayIdx), s = n.step[1], multi = nav.days.length > 1;
    let main, sub = '', icon;
    if(lastOff > 60){ main = t('navOff', { d:fmtDist(lastOff) }); icon = `<svg viewBox="0 0 24 24" style="transform:rotate(180deg)"><path d="M12 3v16M6 9l6-6 6 6"/></svg>`; }
    else if(n.lastOfDay){ main = t('navIn', { d:fmtDist(n.dist) }) + ' · ' + (multi && dayIdx < nav.days.length - 1 ? t('dayDone', { n:dayIdx + 1 }) : t('navEnd')); icon = ICONS.flag; if(n.dist < 25) main = multi && dayIdx < nav.days.length - 1 ? t('dayDone', { n:dayIdx + 1 }) : t('navEnd'); }
    else {
      const nm = n.step[2]; main = t('navIn', { d:fmtDist(n.dist) }) + ' · ' + t('nav' + s); sub = nm ? t('navOnto', { name:nm }) : '';
      icon = `<svg viewBox="0 0 24 24" style="transform:rotate(${ARROW[s] || 0}deg)"><path d="M12 3v16M6 9l6-6 6 6"/></svg>`;
      if(n.then) sub += (sub ? ' · ' : '') + t('navThen', { s:t('nav' + n.then.step[1]) + ' (' + fmtDist(Math.max(0, n.then.dist - n.dist)) + ')' });
    }
    $('#navIc').innerHTML = icon; $('#navMain').textContent = main; $('#navSub').textContent = sub;
    const at = n.at || nav.path[nav.path.length - 1]; $('#navExt').href = 'https://www.google.com/maps/dir/?api=1&destination=' + at[0] + ',' + at[1] + '&travelmode=walking';
  };
  view.me = (lat, lng) => { if(!meMarker) meMarker = L.marker([lat, lng], { icon:dot('me-dot', 20), zIndexOffset:1000 }).addTo(m); else meMarker.setLatLng([lat, lng]); };
  view.update = (lat, lng) => {
    trackLine.addLatLng([lat, lng]); view.me(lat, lng);
    if(nav){ lastOff = nav.locate(lat, lng).off; updateNav(); drawAhead(); }
    if(view.follow) m.panTo([lat, lng], { animate:true });
    if(Date.now() - lastDraw > 800){ lastDraw = Date.now(); drawDone(); stats(); }
    updateSync();
  };
  view.refreshDemo = () => { const b = $('#demo'); if(b) b.textContent = W.sim ? t('demoStop') : t('demoWalk'); };
  if(last) view.me(last[0], last[1]);
  if(nav && last) lastOff = nav.locate(last[0], last[1]).off;
  updateNav(); drawAhead(); drawDone(); stats(); renderGps(); every(1000, () => { stats(); renderGps(); updateSync(); }); updateSync();
  $('#stop').onclick = finishRoute;
  if($('#pause')) $('#pause').onclick = pauseRoute;
  if($('#resume')) $('#resume').onclick = resumeRoute;
  if(!NATIVE && $('#demo')) $('#demo').onclick = startDemoWalk;
}

function viewProfile(){
  const me = W.me || {};
  const cp = cityPicker(me.cities || []);
  shell('people', `${topbar(t('tabProfile'))}
    <div class="pad">
      <div class="person-row big">${avatar(me.name)}<div><b>${esc(me.name || '')}</b><span>${esc(me.phone || '')}</span></div></div>
      <div class="card" style="display:block;margin-top:16px">
        <label class="f" for="pName" style="margin-top:0">${esc(t('name'))}</label><input class="in" id="pName" value="${esc(me.name)}" autocomplete="name">
        <label class="f">${esc(t('cities'))}</label>${cp.html}
        <button class="btn primary" id="pSave" style="margin-top:16px">${esc(t('save'))}</button><div class="err" id="pErr" role="alert"></div>
      </div>
      <h2 class="sec">${esc(t('settings'))}</h2>
      <div class="card" style="display:block">${themeSwitch(W.theme)}${langSwitch(I.lang, true)}</div>
      ${W.canAdmin ? `<button class="btn ghost" id="pAdmin">${ICONS.users}${esc(t('switchToAdmin'))}</button>` : ''}
      <h2 class="sec">${esc(t('account'))}</h2>
      <button class="btn ghost" id="pOut">${esc(t('logout'))}</button>
      <button class="btn ghost danger-text" id="pDel">${esc(t('delAcc'))}</button>
      ${legalLinks()}
    </div>`);
  cp.bind(); bindLegal(viewProfile);
  store.get('theme').then(v => { W.theme = v; document.querySelectorAll('[data-theme-set]').forEach(b => { const on = b.dataset.themeSet === (v || 'system'); b.classList.toggle('on', on); b.setAttribute('aria-checked', on); }); });
  $('#pSave').onclick = async () => {
    if(!cp.get().length){ $('#pErr').textContent = t('e_city_required'); return; }
    $('#pSave').disabled = true; $('#pSave').classList.add('loading'); $('#pErr').textContent = '';
    try{ await rpc('update_worker_profile', { p_token:W.token, p_name:$('#pName').value, p_cities:cp.get() }); await loadMe(); toast(t('saved')); }
    catch(e){ $('#pErr').textContent = errText(e); }
    $('#pSave').disabled = false; $('#pSave').classList.remove('loading');
  };
  if($('#pAdmin')) $('#pAdmin').onclick = () => W.hooks.switchRole && W.hooks.switchRole('admin');
  $('#pOut').onclick = async () => { if(await confirmBox(t('logout'), t('logoutQ'), t('logout'))) forceLogout(); };
  $('#pDel').onclick = async () => { if(!await confirmBox(t('delAcc'), t('delAccQ'), t('delAccYes'), true)) return; try{ await rpc('delete_my_account', { p_token:W.token }); await forceLogout(); }catch(e){ $('#pErr').textContent = errText(e); } };
}

/* ================= login result (phone verified in auth.js) ================= */
export async function acceptToken(token){ W.token = token; await store.set('token', token); await store.set('role', 'worker'); await loadMe(); W.canAdmin = !!(await store.get('canAdmin')); W.hooks.loggedIn && W.hooks.loggedIn(); }

/* ================= boot ================= */
export async function bootWorker(){
  W.token = await store.get('token'); W.me = await store.get('me'); W.canAdmin = !!(await store.get('canAdmin'));
  W.route = await store.get('route'); W.queue = await store.get('queue') || []; W.track = await store.get('track') || [];
  if(!W.token) return false;
  UI.role = 'worker'; UI.onTab = workerTab;
  if(W.route && !W.route.endedAt){
    const pid = W.route.planId; if(pid && !W.prev){ try{ W.prev = await rpc('plan_progress', { p_token:W.token, p_plan_id:pid }); }catch{} }
    workerTab('map'); if(!W.route.paused) startWatching(); flush(); loadMe(); return true;
  }
  workerTab('tasks'); flush(); await loadMe(); if(UI.tab === 'tasks' && !document.querySelector('.topbar #tbBack')) workerTab('tasks');
  return true;
}
// poll for new assignments while the app is open (real push notifications need the Apple/Google push setup)
const unreadN = () => ((W.me && W.me.inbox) || []).filter(n => !n.read).length;
setInterval(async () => {
  if(UI.role !== 'worker' || !W.token || (W.route && !W.route.endedAt) || document.hidden) return;
  const before = unreadN(); await loadMe();
  if(unreadN() > before){ toast(t('newNotif')); if(UI.tab === 'tasks' && !document.querySelector('#tbBack')) workerTab('tasks'); }
}, 60000);
App.addListener('appStateChange', ({ isActive }) => { if(isActive && UI.role === 'worker'){ flush(); if(UI.tab === 'tasks' && !document.querySelector('#tbBack')) loadMe().then(() => workerTab('tasks')); } });
