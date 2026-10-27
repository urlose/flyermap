import L from 'leaflet';
import Planner from '../../admin/planner.js';
import { t, I } from './i18n.js';
import { sb, store, $, esc, css, hav, fmtDist, fmtH, fmtHm, fmtN, fmtDay, fmtDT, ago, waLink, telLink, loopPath, normPhone } from './core.js';
import { UI, ICONS, shell, plain, topbar, bindBack, makeMap, dot, labelIcon, fit, modal, confirmBox, toast, searchField, langSwitch, avatar, every, personIcon } from './ui.js';

const GREEN = '#16A34A';
// finished map-data answers are shared through our own server (edge function 'osm'): same area = instant for every admin
const osmCache = {
  async get(queries){ const { data, error } = await sb.functions.invoke('osm', { body:{ mode:'get', queries } }); if(error || !data || !data.results) throw new Error('cache'); return data.results; },
  async put(items){ if(items.some(i => JSON.stringify(i.payload).length > 5e6)) return; await sb.functions.invoke('osm', { body:{ mode:'put', items } }); },
};
const KM_PER_MIN_TRANSIT = 0.75;
export const A = { user:null, workers:[], tasks:[], live:[], demo:null, hooks:{}, filter:{ status:'open', from:'', to:'', city:'', district:'' } };

/* ---------- data ---------- */
async function loadWorkers(){ const { data, error } = await sb.from('workers').select('id,name,phone,cities,zone_minutes,notes,last_lat,last_lng,last_seen,active_route_id,created_at').order('name'); if(error) throw error; A.workers = data; }
async function loadTasks(){ const { data, error } = await sb.from('tasks').select('*,task_workers(worker_id)').order('created_at', { ascending:false }); if(error) throw error; A.tasks = data; }
async function loadLive(){ const { data } = await sb.from('routes').select('id,worker_id,task_id,plan_id,paused_at,last30_m,started_at,break_s').is('ended_at', null); A.live = data || []; }
async function loadAll(){ await Promise.all([loadWorkers(), loadTasks()]); }
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
  let m = null, layer = null, fitted = false, tickFn = null;
  const sf = searchField('mapQ', t('mapSearchPh'), c => { MAPQ.place = c; refit(); tickFn && tickFn(); }, { citiesOnly:true });
  shell('map', `<div id="fullMap" class="fullmap"></div>
    <div class="map-search">${sf.html}<div class="rad-row hidden" id="radRow"></div></div>
    <div class="float-card"><div class="fc-row"><b id="liveCount">…</b><span class="muted small" id="liveUpd"></span></div><div class="live-list" id="liveList"></div></div>`, { map:true });
  sf.bind();
  m = makeMap($('#fullMap'), MAPQ.place ? [MAPQ.place.lat, MAPQ.place.lng] : null, 12);
  layer = L.layerGroup().addTo(m);
  const refit = () => { if(MAPQ.place){ fitted = true; m.fitBounds(L.latLng(MAPQ.place.lat, MAPQ.place.lng).toBounds(MAPQ.km * 2000), { padding:[20, 20], animate:false }); } };
  const radRow = () => {
    const r = $('#radRow'); if(!r) return; r.classList.toggle('hidden', !MAPQ.place);
    r.innerHTML = MAPQ.place ? `<b class="rad-city">${esc(MAPQ.place.name)}</b>` + [10, 25, 50, 100].map(k => `<button class="chip ${k === MAPQ.km ? 'on' : ''}" data-k="${k}">${k} km</button>`).join('') + `<button class="chip" id="radX" aria-label="clear">×</button>` : '';
    r.querySelectorAll('[data-k]').forEach(bn => bn.onclick = () => { MAPQ.km = +bn.dataset.k; refit(); tickFn(); });
    const x = $('#radX'); if(x) x.onclick = () => { MAPQ.place = null; $('#mapQ').value = ''; fitted = false; tickFn(); };
  };
  const tick = async () => {
    try{ await Promise.all([loadWorkers(), loadLive()]); }catch{ return; }
    const live = A.workers.filter(isLive);
    // everybody with a known position is shown: live = green person, otherwise grey person + approximate area
    const known = A.workers.filter(w => w.last_lat != null && w.last_lng != null);
    layer.clearLayers(); const b = L.latLngBounds([]);
    const pl = MAPQ.place;
    if(pl){
      L.circle([pl.lat, pl.lng], { radius:MAPQ.km * 1000, color:'#2563EB', weight:2, fillColor:'#2563EB', fillOpacity:.06, interactive:false }).addTo(layer);
      L.circleMarker([pl.lat, pl.lng], { radius:6, color:'#fff', weight:3, fillColor:'#2563EB', fillOpacity:1, interactive:false }).addTo(layer);
    }
    for(const w of known){
      const on = isLive(w), p = [w.last_lat, w.last_lng];
      if(!on) L.circle(p, { radius:350, color:'#94A3B8', weight:1, fillColor:'#94A3B8', fillOpacity:.15, interactive:false }).addTo(layer);
      L.marker(p, { icon:personIcon(w.name, on, on ? '' : ago(w.last_seen)), zIndexOffset:on ? 800 : 400 }).on('click', () => viewWorker(w.id, viewLive)).addTo(layer);
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
      $('#liveList').innerHTML = known.map(w => `<button class="live-chip" data-id="${w.id}"><span class="dotc ${isLive(w) ? pace(w).cls : 'pause'}"></span>${esc(w.name)}${isLive(w) ? (pace(w).label ? ' · ' + esc(pace(w).label) : '') : ' · ' + esc(ago(w.last_seen))}</button>`).join('');
      document.querySelectorAll('.live-chip').forEach(c => c.onclick = () => viewWorker(c.dataset.id, viewLive));
    }
    if(!fitted){ if(pl) refit(); else if(known.length){ fit(m, b, 80); fitted = true; } }
  };
  tickFn = tick; radRow();
  tick(); every(A.demo ? 3000 : 6000, tick);
}

/* ---------- MITARBEITER: admin profile + team ---------- */
function viewPeople(){
  let place = null;
  const sf = searchField('wCity', t('whoPh'), c => { place = c; render(); }, { citiesOnly:true });
  shell('people', `${topbar(t('tabPeople'))}
    <div class="pad">
      <div class="person-row big">${avatar()}<div><b>${esc(A.user?.phone ? '+' + A.user.phone.replace(/^\+/, '') : (A.user?.email || ''))}</b><span>${esc(t('admin'))}</span></div></div>
      <div class="tool-row"><button class="btn ghost small" id="tDemo">${esc(t('demo'))}</button><button class="btn ghost small" id="tInv">${esc(t('inviteAdmin'))}</button><button class="btn ghost small" id="tWork">${esc(t('switchToWorker'))}</button><button class="btn ghost small" id="tOut">${esc(t('logout'))}</button></div>
      ${langSwitch(I.lang)}
      <h2 class="sec">${esc(t('workersN', { n:A.workers.length }))}</h2>
      <label class="f">${esc(t('whoCanGo'))}</label>${sf.html}
      <div class="searchbox" style="margin-top:8px"><span class="sb-ic">${ICONS.search}</span><input id="wQ" class="sb-in" placeholder="${esc(t('searchNamePhone'))}"></div>
      <div id="wList" style="margin-top:12px"></div>
    </div>`);
  sf.bind();
  const render = () => {
    const q = $('#wQ').value.trim().toLowerCase();
    let list = A.workers.map(w => ({ w, ...(place ? distTo(w, place.lat, place.lng) : { km:null }) }));
    if(place) list = list.filter(x => x.km <= zoneKm(x.w)).sort((a, b) => a.km - b.km);
    if(q) list = list.filter(x => (x.w.name + ' ' + x.w.phone).toLowerCase().includes(q));
    $('#wList').innerHTML = (place ? `<div class="hint">${esc(t('canReach', { n:list.length, city:place.name }))} <button class="link" id="wClr">${esc(t('reset'))}</button></div>` : '') +
      (list.length ? list.map(({ w, km }) => `<div class="card worker-card"><button class="wc-main" data-id="${w.id}">${avatar(w.name, isLive(w) ? 'live' : '')}
        <div><b>${esc(w.name)}</b><span>${esc((w.cities || []).map(c => c.name).join(', '))}${km != null ? ' · ' + Math.round(km) + ' km' : ''} · ${esc(t('zoneChip', { n:w.zone_minutes }))}</span></div></button>
        <div class="wc-act"><a class="btn ghost small" href="${telLink(w.phone)}">${esc(t('call'))}</a><a class="btn ghost small" target="_blank" href="${waLink(w.phone)}">WhatsApp</a></div></div>`).join('')
       : `<div class="empty">${esc(A.workers.length ? t('notFound') : t('noWorkers'))}</div>`);
    const clr = $('#wClr'); if(clr) clr.onclick = () => { place = null; $('#wCity').value = ''; render(); };
    document.querySelectorAll('.wc-main').forEach(b => b.onclick = () => viewWorker(b.dataset.id));
  };
  $('#wQ').oninput = render; render();
  $('#tOut').onclick = async () => { if(await confirmBox(t('logout'), t('logoutQ'), t('logout'))){ await sb.auth.signOut(); for(const k of ['role', 'token', 'me', 'canAdmin']) await store.del(k); A.hooks.loggedOut && A.hooks.loggedOut(); } };
  $('#tWork').onclick = () => A.hooks.switchRole && A.hooks.switchRole('worker');
  $('#tInv').onclick = () => {
    const mo = modal(`<h2>${esc(t('inviteAdmin'))}</h2><label class="f">${esc(t('invitePhone'))}</label><input class="in" id="invE" type="tel" placeholder="+49 170 1234567"><button class="btn primary" id="invB" style="margin-top:12px">${esc(t('inviteAdmin'))}</button><div class="err" id="invErr"></div>`);
    mo.querySelector('#invB').onclick = async () => { const ph = normPhone(mo.querySelector('#invE').value); if(!ph){ mo.querySelector('#invErr').textContent = t('badPhone'); return; } const { error } = await sb.from('admin_phone_invites').upsert({ phone:ph }); if(error) mo.querySelector('#invErr').textContent = error.message; else { mo.remove(); toast(t('invitePhoneSent')); } };
  };
  $('#tDemo').onclick = demoSheet;
}

async function viewWorker(id, back){
  back = back || viewPeople;
  const w = wById(id); if(!w) return back();
  const { data:routes } = await sb.from('routes').select('*').eq('worker_id', id).order('started_at', { ascending:false }).limit(30);
  shell('people', `${topbar(w.name, true)}
    <div class="pad">
      <div class="person-row big">${avatar(w.name, isLive(w) ? 'live' : '')}<div><b>${esc(w.name)}</b><span>${esc(w.phone)} · ${esc(t('lastActive', { a:ago(w.last_seen) }))}</span></div></div>
      <div class="tool-row"><a class="btn primary small" href="${telLink(w.phone)}">${esc(t('call'))}</a><a class="btn ghost small" target="_blank" href="${waLink(w.phone)}">WhatsApp</a></div>
      <div class="chips">${(w.cities || []).map(c => `<span class="chip">${esc(c.name)}</span>`).join('')}</div>
      <h2 class="sec">${esc(t('route'))}</h2>
      <div id="wMap" class="wmap"></div>
      <div id="wRouteInfo" class="muted small" style="margin-bottom:6px"></div>
      ${(routes || []).map(r => `<button class="row-line rbtn" data-r="${r.id}"><b>${esc(fmtDT(r.started_at))}</b><span>${esc(fmtDist(r.distance_m))} · ${esc(fmtHm(Math.max(0, ((r.ended_at ? new Date(r.ended_at) : Date.now()) - new Date(r.started_at)) / 60000 - (r.break_s || 0) / 60)) + ' ' + t('h'))}${r.ended_at ? '' : ' · ' + t('active')}</span></button>`).join('') || `<p class="muted small">—</p>`}
      <h2 class="sec">${esc(t('settings'))}</h2>
      <label class="f">${esc(t('zoneLabel'))}</label>
      <select class="in" id="wzm">${[30, 45, 60, 75, 90, 120].map(m => `<option value="${m}" ${m === w.zone_minutes ? 'selected' : ''}>${m < 60 ? m + ' ' + t('min') : (m/60).toString().replace('.', ',') + ' ' + t('h')} (~${Math.round(m * KM_PER_MIN_TRANSIT)} km)</option>`).join('')}</select>
      <label class="f">${esc(t('notes'))}</label><textarea class="in" id="wnotes">${esc(w.notes || '')}</textarea>
      <button class="btn primary" id="wsave" style="margin-top:12px">${esc(t('save'))}</button>
      <button class="btn ghost danger-text" id="wdel" style="margin-top:20px">${esc(t('del'))}</button>
    </div>`);
  bindBack(back);
  const wm = makeMap($('#wMap'), (w.last_lat != null) ? [w.last_lat, w.last_lng] : null, 14), wl = L.layerGroup().addTo(wm);
  const showRoute = async r => {
    document.querySelectorAll('.rbtn').forEach(x => x.classList.toggle('sel', x.dataset.r === r.id));
    wl.clearLayers(); const b = L.latLngBounds([]);
    try{
      if(r.plan_id){ const { data:pl } = await sb.from('task_plans').select('path,color').eq('id', r.plan_id).maybeSingle(); if(pl && pl.path && pl.path.length > 1){ L.polyline(pl.path, { color:'#64748B', weight:4, opacity:.55, dashArray:'2 8', lineCap:'round' }).addTo(wl); pl.path.forEach(p => b.extend(p)); } }
      const pts = await fetchPoints(r.id);
      if(pts.length > 1){
        const ll = pts.map(p => [p.lat, p.lng]); L.polyline(ll, { color:css('--route'), weight:5, opacity:.95 }).addTo(wl); ll.forEach(p => b.extend(p));
        L.marker(ll[0], { icon:dot('start-dot', 16) }).addTo(wl);
        if(r.ended_at) L.marker(ll[ll.length - 1], { icon:dot('end-dot', 16) }).addTo(wl); else L.marker(ll[ll.length - 1], { icon:personIcon(w.name, true, '') }).addTo(wl);
      }
    }catch{}
    $('#wRouteInfo').textContent = fmtDT(r.started_at) + ' · ' + fmtDist(r.distance_m);
    try{ if(b.isValid()) wm.fitBounds(b, { paddingTopLeft:[30, 70], paddingBottomRight:[30, 30], maxZoom:17, animate:false }); }catch{}
  };
  document.querySelectorAll('.rbtn').forEach(b => b.onclick = () => { const r = (routes || []).find(x => x.id === b.dataset.r); if(r){ showRoute(r); wm.getContainer().scrollIntoView({ behavior:'smooth', block:'center' }); } });
  if(routes && routes[0]) showRoute(routes[0]);
  $('#wsave').onclick = async () => { const { error } = await sb.from('workers').update({ zone_minutes:+$('#wzm').value, notes:$('#wnotes').value.trim() || null }).eq('id', id); if(!error){ await loadWorkers(); toast(t('saved')); } };
  $('#wdel').onclick = async () => { if(!await confirmBox(t('del'), t('delWorkerQ', { name:w.name }), t('del'), true)) return; await sb.from('workers').delete().eq('id', id); await loadWorkers(); back(); };
}

/* ---------- AUFTRÄGE ---------- */
function taskMatches(tk){
  const f = A.filter, d = tk.work_date ? String(tk.work_date).slice(0, 10) : '';
  if(f.status === 'open' && tk.status !== 'open') return false;
  if(f.status === 'done' && tk.status === 'open') return false;
  if(f.city && tk.city_name !== f.city) return false;
  if(f.district && tk.district !== f.district) return false;
  if(f.from && (!d || d < f.from)) return false;
  if(f.to && (!d || d > f.to)) return false;
  return true;
}
function viewTasks(){
  const live = new Set(A.workers.filter(isLive).map(w => w.id));
  const opts = k => [...new Set(A.tasks.map(x => x[k]).filter(Boolean))].sort();
  const sel = (id, label, list, cur) => `<div><label class="f">${esc(label)}</label><select class="in small" id="${id}"><option value="">${esc(t('fAll'))}</option>${list.map(v => `<option ${v === cur ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>`;
  const card = tk => `<button class="card task-card" data-id="${tk.id}"><div class="tc-main"><b>${esc(tk.title)}</b>
    <span>${esc([fmtDay(tk.work_date), tk.district || tk.city_name, tk.flyers ? fmtN(tk.flyers) + ' ' + t('flyers') : '', tk.task_workers.length + ' ' + t('tabPeople')].filter(Boolean).join(' · '))}</span>
    ${tk.task_workers.some(x => live.has(x.worker_id)) ? `<span class="pill live">${esc(t('active'))}</span>` : ''}</div>${ICONS.chevron}</button>`;
  const f = A.filter, list = A.tasks.filter(taskMatches);
  shell('tasks', `${topbar(t('tasks'))}
    <div class="pad">
      <button class="card create-card" id="create"><span class="cc-ic">${ICONS.plus}</span><div><b>${esc(t('createTask'))}</b><span>${esc(t('createTaskSub'))}</span></div></button>
      <div class="chips" style="margin:0 0 10px">${[['open', t('fOpen')], ['done', t('fDone')], ['all', t('fAll')]].map(([k, l]) => `<button class="chip ${f.status === k ? 'on' : ''}" data-st="${k}" style="padding:7px 14px">${esc(l)}</button>`).join('')}</div>
      <div class="steppers">${sel('fCity', t('fCity'), opts('city_name'), f.city)}${sel('fDist', t('fDistrict'), opts('district'), f.district)}</div>
      <div class="steppers"><div><label class="f">${esc(t('fFrom'))}</label><input class="in small" type="date" id="fFrom" value="${esc(f.from)}"></div><div><label class="f">${esc(t('fTo'))}</label><input class="in small" type="date" id="fTo" value="${esc(f.to)}"></div></div>
      <div style="height:14px"></div>
      ${list.length ? list.map(card).join('') : `<div class="empty">${esc(A.tasks.length ? t('noMatch') : t('noOpenTasks'))}</div>`}
    </div>`);
  $('#create').onclick = viewCreate;
  const again = () => viewTasks();
  document.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { f.status = b.dataset.st; again(); });
  $('#fCity').onchange = e => { f.city = e.target.value; again(); }; $('#fDist').onchange = e => { f.district = e.target.value; again(); };
  $('#fFrom').onchange = e => { f.from = e.target.value; again(); }; $('#fTo').onchange = e => { f.to = e.target.value; again(); };
  document.querySelectorAll('.task-card').forEach(b => b.onclick = () => viewTask(b.dataset.id));
}

/* Routenerstellung: full map + search on top, sheet with flyers / workers / routes */
function viewCreate(){
  const d = { start:null, place:null, flyers:5000, n:1, nAuto:true, hours:7, quota:1500, days:2, g:null, plan:null, assign:{}, err:null, token:0 };
  const sf = searchField('cSearch', t('searchAddr'), (c, q) => { d.place = c; if(q) q.value = c.name + (c.sub ? ', ' + c.sub : ''); setStart(c.lat, c.lng); }, { near:() => d.start ? [d.start.lat, d.start.lng] : null });
  shell('tasks', `<div id="fullMap" class="fullmap"></div>
    <div class="map-top"><button class="icon-btn" id="cBack" aria-label="${esc(t('back'))}">${ICONS.back}</button><div class="grow">${sf.html}</div></div>
    <div class="sheet" id="cSheet"><p class="muted small" style="margin:0">${esc(t('tapMap'))}</p></div>`, { map:true });
  sf.bind();
  $('#cBack').onclick = viewTasks;
  const m = makeMap($('#fullMap'), null, 13);
  const zoneLayer = L.layerGroup().addTo(m), planLayer = L.layerGroup().addTo(m);
  m.on('click', e => { d.place = null; const qi = $('#cSearch'); if(qi) qi.value = ''; setStart(e.latlng.lat, e.latlng.lng, true); });
  const sheet = html => { $('#cSheet').innerHTML = html; };
  // while recalculating keep the sheet where it is (no flicker) and show a small status in the corner;
  // only a brand-new start point replaces the sheet with a plain loading message
  const busy = (txt, full) => {
    if(!full && $('#cFly')){ const sh = $('#cSheet'); sh.classList.add('calc'); let b = $('#cBusy'); if(!b){ b = document.createElement('div'); b.id = 'cBusy'; b.className = 'cbusy'; sh.appendChild(b); } b.textContent = '⏳ ' + txt; }
    else sheet(`<p class="muted small" style="margin:0">${esc(txt)}</p>`);
  };
  // loading message with a running seconds counter, so a slow map server is visibly "working"
  const withSecs = (txt, full, tok) => { const t0 = Date.now(); busy(txt, full); const id = setInterval(() => { if(tok !== d.token){ clearInterval(id); return; } const s = Math.round((Date.now() - t0) / 1000); busy(txt + ' · ' + s + ' s', full); }, 1000); return () => clearInterval(id); };   // a superseded request must never paint over the newer one
  const startArr = () => [d.start.lat, d.start.lng];
  async function setStart(lat, lng, fromClick){
    const tok = ++d.token; d.start = { lat, lng }; d.keepView = !!fromClick;   // a tap on the map keeps the zoom the admin chose
    d.g = null; d.plan = null; d.err = null; d.assign = {};
    zoneLayer.clearLayers(); planLayer.clearLayers();
    L.marker([lat, lng], { icon:dot('pin-start', 26) }).addTo(zoneLayer); if(!fromClick) m.setView([lat, lng], 15, { animate:false });
    let stop = withSecs(t('loadingArea'), true, tok), got = null;
    for(let attempt = 0; attempt < 2 && !got; attempt++){   // public map servers are sometimes busy: one automatic retry
      try{ got = await Planner.loadForFlyers([lat, lng], d.flyers, { cache:osmCache }); if(tok === d.token){ d.g = got; d.err = null; } }
      catch(e){ stop(); if(tok !== d.token) return; d.err = /abort/i.test(e.message || '') ? t('mapSlow') : (e.message || 'net'); if(attempt === 0){ stop = withSecs(t('retrying'), true, tok); await new Promise(r => setTimeout(r, 4000)); if(tok !== d.token){ stop(); return; } } }
    }
    stop();
    if(tok !== d.token) return;
    recompute();
  }
  async function recompute(){
    if(!d.start) return;
    if(!d.g){ renderSheet(); return; }
    const tok = ++d.token;
    const reachNow = Planner.selectForFlyers(d.g, startArr(), d.flyers).reach_m; d.g.reach = reachNow;   // loaded square must stay clearly larger than what we walk
    if(((d.g.usable != null ? d.g.usable : d.g.mailboxes) < d.flyers * 1.05 || reachNow > 0.65 * d.g.radius) && d.g.radius < Planner.MAX_R){
      const stop = withSecs(t('loadingMore'), false, tok);
      try{ const more = await Planner.loadForFlyers(startArr(), d.flyers, { cache:osmCache, radius:Planner.nextRadius(d.g, d.flyers) }); if(tok === d.token) d.g = more; }catch{}
      stop();
      if(tok !== d.token) return;
    }
    busy(t('calculating')); await new Promise(r => setTimeout(r, 30));
    if(tok !== d.token) return;
    if(d.nAuto){
      const sel = Planner.selectForFlyers(d.g, startArr(), d.flyers);
      d.n = Math.min(20, Planner.suggestWorkers(Planner.routeMinutes(sel.ids.reduce((s, i) => s + d.g.edges[i].len, 0) * 1.35, sel.mailboxes), d.hours, d.days));
    }
    d.plan = Planner.planFlyers(d.g, startArr(), d.flyers, d.n);
    draw(); renderSheet();
  }
  function draw(){
    zoneLayer.clearLayers(); planLayer.clearLayers();
    if(d.plan.zone.length > 2) var z = L.polygon(d.plan.zone, { color:css('--brand'), weight:2, fillOpacity:.06, interactive:false }).addTo(zoneLayer);
    L.marker(startArr(), { icon:dot('pin-start', 26) }).addTo(zoneLayer);
    d.plan.routes.forEach((r, i) => { if(r.path.length > 1) L.polyline(r.path, { color:Planner.COLORS[i % 10], weight:4, opacity:.85 }).addTo(planLayer); });
    if(z && !d.keepView) m.fitBounds(z.getBounds(), { paddingTopLeft:[24, 80], paddingBottomRight:[24, Math.round(innerHeight * .5)], maxZoom:17, animate:false });
  }
  const num = (id, def) => { const v = parseFloat(($(id) || {}).value); return isFinite(v) ? v : def; };
  function keep(){ return { title:$('#cTitle') ? $('#cTitle').value : '', date:$('#cDate') ? $('#cDate').value : '', notes:$('#cNotes') ? $('#cNotes').value : '', quota:$('#cQuota') ? $('#cQuota').value : d.quota }; }
  function restore(k){ if($('#cTitle') && k.title) $('#cTitle').value = k.title; if($('#cDate')) $('#cDate').value = k.date; if($('#cNotes')) $('#cNotes').value = k.notes; if($('#cQuota')) $('#cQuota').value = k.quota; }
  let saved = { title:'', date:'', notes:'', quota:1500 };
  function renderSheet(){
    const sc = ($('#cSheet') || {}).scrollTop || 0;
    const p = d.plan, title = saved.title || (d.place ? d.place.name : '');
    const cap = p ? Planner.capacity(p.routes, d.flyers, { hoursPerDay:d.hours, days:d.days }) : null;
    const km = p ? fmtDist(p.routes.reduce((s, r) => s + r.length_m, 0)) : '';
    sheet(`<button class="sheet-grip" id="grip" aria-label="Panel"></button>
      <label class="f">${esc(t('title'))}</label><input class="in" id="cTitle" value="${esc(title)}">
      <div class="steppers">
        <div><label class="f">${esc(t('flyersCount'))}</label><div class="stepper"><button data-s="f:-500">−</button><input id="cFly" type="number" inputmode="numeric" min="100" step="100" value="${d.flyers}"><button data-s="f:500">+</button></div></div>
        <div><label class="f">${esc(t('workersCount'))}</label><div class="stepper"><button data-s="n:-1" ${p ? '' : 'disabled'}>−</button><b id="vN">${p ? d.n : '—'}</b><button data-s="n:1" ${p ? '' : 'disabled'}>+</button></div></div>
      </div>
      ${p ? `<p class="small muted" style="margin:8px 0 0">${esc(t('planSum', { mb:fmtN(p.mailboxes), km, h:fmtHm(p.routes.reduce((s, r) => s + r.minutes, 0)) }))}</p>
        ${p.mailboxes < d.flyers * 0.95 ? `<p class="small err">${esc(t('areaSmall', { mb:fmtN(p.mailboxes) }))}</p>` : ''}
        <div class="${cap.ok ? 'hint' : 'warnbox'}">${cap.ok ? esc(t('fitsOk', { d:d.days })) : `${esc(t('tooBig', { h:cap.slowest.toFixed(1).replace('.', ','), lim:cap.limit, d:d.days }))} <button class="link" id="cReduce">${esc(t('reduceTo', { f:fmtN(cap.suggestedFlyers) }))}</button> ${esc(t('moreWorkers'))}`}</div>`
        : `<p class="small err">${esc(t('streetsFail', { e:d.err || '' }))}</p><button class="btn ghost small" id="cRetry">${esc(t('retryBtn'))}</button>`}
      ${p ? p.routes.map((r, i) => `<div class="route-row"><span class="swatch" style="background:${Planner.COLORS[i % 10]}"></span>
        <div class="grow"><b>${esc(t('planRoute', { n:i + 1 }))} <span class="muted">· ${esc(t('daysN', { n:Math.max(1, Math.ceil(r.minutes / 60 / d.hours)) }))}</span></b><span>${esc(t('routeLine', { km:fmtDist(r.length_m), h:fmtHm(r.minutes), mb:fmtN(r.mailboxes) }))}</span>
        <select class="in small" data-r="${i}">${workerOptions(d.start.lat, d.start.lng, d.assign[i])}</select></div></div>`).join('') : ''}
      <div class="steppers"><div><label class="f">${esc(t('startDate'))}</label><input class="in" type="date" id="cDate"></div><div><label class="f">${esc(t('hoursDay'))}</label><input class="in" type="number" id="cHours" min="1" max="12" step="0.5" value="${d.hours}"></div></div>
      <label class="f">${esc(t('quota'))}</label><input class="in" type="number" id="cQuota" min="200" step="100" value="${esc(saved.quota)}">
      <label class="f">${esc(t('note'))}</label><textarea class="in" id="cNotes" placeholder="${esc(t('notesPh'))}"></textarea>
      <button class="btn primary" id="cSave" style="margin-top:12px" ${p ? '' : 'disabled'}>${esc(t('saveTask'))}</button><div class="err" id="cErr"></div>`);
    if($('#cRetry')) $('#cRetry').onclick = () => setStart(d.start.lat, d.start.lng);
    restore(saved); $('#cSheet').classList.remove('calc'); $('#cSheet').scrollTop = sc;
    $('#grip').onclick = () => $('#cSheet').classList.toggle('tall');
    document.querySelectorAll('[data-s]').forEach(b => b.onclick = () => {
      const [k, v] = b.dataset.s.split(':');
      const later = () => { clearTimeout(d.tm); d.tm = setTimeout(() => { saved = keep(); recompute(); }, 450); };   // several quick taps = one recalculation
      if(k === 'f'){ d.flyers = Math.max(100, num('#cFly', d.flyers) + +v); $('#cFly').value = d.flyers; d.nAuto = true; return later(); }
      d.n = Math.max(1, Math.min(20, d.n + +v)); $('#vN').textContent = d.n; d.nAuto = false; d.assign = {}; later();
    });
    $('#cFly').onchange = () => { saved = keep(); d.flyers = Math.max(100, Math.round(num('#cFly', d.flyers))); d.nAuto = true; recompute(); };
    $('#cHours').onchange = () => { saved = keep(); d.hours = Math.max(1, Math.min(12, num('#cHours', 7))); if(d.nAuto) recompute(); else renderSheet(); };
    const red = $('#cReduce'); if(red) red.onclick = () => { saved = keep(); d.flyers = Math.max(100, cap.suggestedFlyers); d.nAuto = false; recompute(); };
    document.querySelectorAll('[data-r]').forEach(s => s.onchange = () => { d.assign[+s.dataset.r] = s.value || null; });
    $('#cSave').onclick = save;
  }
  async function save(){
    const title = $('#cTitle').value.trim(); if(!title){ $('#cErr').textContent = t('needTitle'); return; }
    $('#cSave').disabled = true;
    try{
      const pl = d.plan, quota = Math.max(200, Math.round(num('#cQuota', 1500))), date = $('#cDate').value || null;
      const { data:tk, error } = await sb.from('tasks').insert({ title, city_name:(d.place && d.place.city) || null, district:(d.place && d.place.district) || null, start_lat:d.start.lat, start_lng:d.start.lng,
        walk_minutes:15, zone_polygon:pl.zone, work_date:date, notes:$('#cNotes').value.trim() || null, created_by:A.user.id, street_m:d.g ? d.g.street_m : null,
        flyers:d.flyers, quota_m30:quota, work_days:d.days, work_hours:d.hours, est_mailboxes:pl.mailboxes, route_m:pl.routes.reduce((s, r) => s + r.length_m, 0) }).select().single();
      if(error) throw error;
      await savePlans(tk, pl.routes.map((r, i) => ({ task_id:tk.id, idx:i, worker_id:d.assign[i] || null, color:Planner.COLORS[i % 10], path:r.path, length_m:r.length_m, street_m:r.street_m, mailboxes:r.mailboxes, boxes:r.boxes, minutes:r.minutes })));
      await loadTasks(); viewTask(tk.id);
    }catch(e){ $('#cErr').textContent = e.message; $('#cSave').disabled = false; }
  }
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

/* task detail: info + map + routes with status, worker assignment and progress */
const stText = p => p.status === 'accepted' ? t('stAccepted') : p.status === 'declined' ? t('stDeclined') : p.status === 'done' ? t('stDone') : t('stOffered');
const stCls = p => p.status === 'accepted' || p.status === 'done' ? 'live' : p.status === 'declined' ? 'bad' : 'warn';
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
      <h2 class="sec">${esc(t('routesOf'))}</h2>
      ${(plans || []).length ? plans.map(p => { const w = wById(p.worker_id); return `<div class="route-row"><span class="swatch" style="background:${esc(p.color || '#2563EB')}"></span>
        <div class="grow"><b>${esc(t('planRoute', { n:p.idx + 1 }))} <span class="muted" id="pp${p.idx}"></span></b>
        <span>${esc(t('routeLine', { km:fmtDist(p.length_m), h:fmtHm(p.minutes || 0), mb:fmtN(p.mailboxes || 0) }))}</span>
        <div class="bar"><i id="pb${p.idx}"></i></div><span id="pf${p.idx}" style="margin-top:4px"></span>
        ${p.worker_id ? `<span class="pill ${stCls(p)}">${esc(stText(p))}${p.status === 'accepted' && (p.work_dates || []).length ? ' · ' + esc(p.work_dates.map(fmtDay).join(', ')) : ''}</span>` : ''}
        <div class="rr-act"><select class="in small" data-plan="${p.id}">${workerOptions(tk.start_lat, tk.start_lng, p.worker_id)}</select>${w ? `<a class="btn ghost small" target="_blank" href="${waLink(w.phone, invite(w))}">${esc(t('write'))}</a>` : ''}</div>
        <span class="small">${esc(t('replaceHint'))}</span></div></div>`; }).join('') : `<p class="muted small">${esc(t('noPlans'))}</p>`}
      <div class="tool-row" style="margin-top:16px"><button class="btn ghost small" id="tDone">${esc(tk.status === 'open' ? t('finish') : t('reopen'))}</button><button class="btn ghost small danger-text" id="tDel">${esc(t('del'))}</button></div>
      <p class="small muted">${esc(t('desktop'))}</p>
    </div>`);
  bindBack(viewTasks);
  const m = makeMap($('#tMap'), [tk.start_lat, tk.start_lng], 14);
  let b = L.latLngBounds([[tk.start_lat, tk.start_lng]]);
  if(tk.zone_polygon){ const z = L.polygon(tk.zone_polygon, { color:css('--brand'), weight:2, fillOpacity:.06, interactive:false }).addTo(m); b = z.getBounds(); }
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

/* ---------- DEMO (pitch) ---------- */
const DEMO_PHONE = '+4900000000';
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
  const { error:e1 } = await sb.from('workers').insert(DEMO_WORKERS.map((w, i) => ({ name:w[0], phone:DEMO_PHONE + (i + 1), cities:[{ name:w[1], lat:w[2], lng:w[3] }], zone_minutes:w[4], pin_hash:'demo', notes:'Demo' })));
  if(e1) throw e1;
  const rows = await demoRows();
  const start = [DEMO_TASK.lat, DEMO_TASK.lng];
  const g = await Planner.loadForFlyers(start, DEMO_TASK.flyers, { cache:osmCache });
  const pl = Planner.planFlyers(g, start, DEMO_TASK.flyers, 3);
  const today = new Date().toISOString().slice(0, 10), tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const { data:tk, error } = await sb.from('tasks').insert({ title:DEMO_TASK.title, city_name:DEMO_TASK.city, district:DEMO_TASK.district, start_lat:DEMO_TASK.lat, start_lng:DEMO_TASK.lng, walk_minutes:15, zone_polygon:pl.zone, work_date:today,
    notes:DEMO_TASK.notes[I.lang] || DEMO_TASK.notes.de, created_by:A.user.id, street_m:g.street_m, flyers:DEMO_TASK.flyers, quota_m30:1500, work_days:2, work_hours:7, est_mailboxes:pl.mailboxes, route_m:pl.routes.reduce((x, r) => x + r.length_m, 0) }).select().single();
  if(error) throw error;
  const r = await sb.from('task_plans').insert(pl.routes.map((x, i) => ({ task_id:tk.id, idx:i, worker_id:rows[i].id, color:Planner.COLORS[i], path:x.path, length_m:x.length_m, street_m:x.street_m, mailboxes:x.mailboxes, boxes:x.boxes, minutes:x.minutes, status:'accepted', work_dates:[today, tomorrow] })));
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
  adminTab('tasks');
  return true;
}
