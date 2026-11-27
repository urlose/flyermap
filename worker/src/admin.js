import L from 'leaflet';
import Planner from '../../admin/planner.js';
import { gridRectsUpTo } from './drivezone.js';
import { DEFAULT_RADIUS_KM, MIN_RADIUS_KM, MAX_RADIUS_KM, radiusFromPlans, manualOutsideCircle } from './circlearea.js';
import { applyRole, isCoord, loadAdmins, adminName, selectWorkers, refLinkCardHtml, bindRefLink, inviteRoleHtml, bindInviteRole, inviteRoleValues, adminsCardHtml, bindAdminsCard } from './coord.js';
import { savedMailboxCounts } from './savecounts.js';
import { t, I } from './i18n.js';
import { sb, store, $, esc, css, hav, fmtDist, fmtH, fmtHm, fmtN, fmtDay, fmtDT, ago, waLink, telLink, loopPath, deMobile, loc, reversePlace, placeArea, errText } from './core.js';
import { groupIcon } from './ui.js';
import { UI, ICONS, shell, setLoc, getLoc, plain, topbar, bindBack, makeMap, dot, labelIcon, fit, drawJumps, rideMinOf, ridesOf, modal, confirmBox, toast, searchField, langSwitch, themeSwitch, statusPill, emptyState, avatar, every, personIcon, secNav } from './ui.js';
import { legalLinks, bindLegal } from './legalview.js';
import { adminContractHtml, bindAdminContract } from './contractview.js';
import { loadWorkerStats, okBadge, shortLine, workerStatsHtml, bindWorkerStats, isVerified, viewStats } from './stats.js';
window.addEventListener('fm-open-task', e => viewTask(e.detail, () => viewStats()));
import { makePlanEngine, setStampClient, tileStamp } from './planengine.js';
import { openMapView } from './routeview.js';
import { checkpoints, addSkips, dayProgress, makeNav, removedOf, keptBoxes, effPct, removedLen } from './nav.js';
import { compare as zensusCompare, diffPct as zensusDiff, censusPlaces, MIN_HH } from './zensus.js';
// census line: official households next to our mailbox estimate; more than 25 % apart is marked
const zensusHtml = c => { const d = zensusDiff(c); return d == null ? '' : `${esc(t('zLine', { hh:fmtN(c.households) }))} · <i class="zd ${Math.abs(d) > 25 ? 'err' : ''}" >${esc(t('zDiff', { d:(d > 0 ? '+' : d < 0 ? '−' : '±') + Math.abs(d) }))}</i>`; };
const zensusOfPlan = new WeakMap();
import { loadFirm, firmCardHtml, bindFirmCard, firmComplete, avvOk } from './firm.js';
import { viewMaster, poolHtml } from './master.js';
import { loadStudios, studioBtnHtml, openStudioPicker } from './studios.js';
import { viewLiveMap, dueInfo, LM } from './livemap.js';
import { listView, viewSwitch, bindViewSwitch, tableHtml, bindTable } from './tables.js';
import { STATS } from './stats.js';
import { createHighlighter, keyOf, nameShown as nameShownOf } from './sugmap.js';
import { planRows } from './budgetplan.js';
import { atomicReplan } from './replan.js';
import { customerGeoJSON } from './customerexport.js';
import './i18n_cap.js';
import { coverage, addSuggestion, chooseNearbyPlaces, placesApart, suggestionFlow, sugKey as sugKeyOf, MAX_KM, PAGE } from './expand.js';
// a save button while the database works: disabled, "Speichert …"; back to normal afterwards (also after an error)
async function busy(btn, fn){ if(!btn || btn.disabled) return; const html = btn.innerHTML; btn.disabled = true; btn.setAttribute('aria-busy', 'true'); btn.textContent = t('saving');
  try{ await fn(); }catch(e){ toast(errText(e)); } finally{ if(btn.isConnected){ btn.disabled = false; btn.removeAttribute('aria-busy'); btn.innerHTML = html; } } }
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
  mo.querySelector('#pwOk').onclick = () => busy(mo.querySelector('#pwOk'), async () => {
    const a = mo.querySelector('#pw1').value, b = mo.querySelector('#pw2').value, er = mo.querySelector('#pwErr');
    if(a.length < 8){ er.textContent = t('pwShort'); return; } if(a !== b){ er.textContent = t('pwDiff'); return; }
    const { error } = await sb.auth.updateUser({ password:a }); if(error){ er.textContent = error.message; return; }
    mo.remove(); toast(t('saved'));
  });
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
async function loadWorkers(){ const { data, error } = await selectWorkers('id,name,phone,cities,zone_minutes,notes,start_anywhere,last_lat,last_lng,last_seen,nav_lat,nav_lng,nav_at,active_route_id,created_at,company_id'); if(error) throw error; A.workers = data; }
async function loadTasks(){ const { data, error } = await sb.from('tasks').select('*,task_workers(worker_id)').is('merged_into', null).order('created_at', { ascending:false }); if(error) throw error; A.tasks = data;
  // orders where a worker picked dates after the deadline and the admin has not decided yet (badge on the card)
  try{ const { data:lp } = await sb.from('task_plans').select('task_id').eq('status', 'accepted').eq('late_dates', true).eq('late_ok', false); A.lateTasks = new Set((lp || []).map(x => x.task_id)); }catch{ A.lateTasks = new Set(); }
  // routes of every order: how many, how many done, how many without a distributor (order table)
  try{ const { data:ps } = await sb.from('task_plans').select('task_id,status,worker_id,skipped'); A.planStat = new Map(); A.repTasks = new Map(); (ps || []).forEach(p => { const x = A.planStat.get(p.task_id) || { n:0, done:0, free:0 }; x.n++; if(p.status === 'done') x.done++; if(!p.worker_id || p.status === 'declined') x.free++; A.planStat.set(p.task_id, x);
    // pieces a worker reported as not walkable that the admin has not decided yet
    const r = (p.skipped || []).filter(y => y && y.rep && !y.ok && !/^Admin/.test(y.by || '')).length; if(r) A.repTasks.set(p.task_id, (A.repTasks.get(p.task_id) || 0) + r); }); }catch{ A.planStat = new Map(); A.repTasks = new Map(); }
  // number on the "Aufträge" tab: open help requests + dates after the deadline to approve + reported pieces to decide
  try{ const { count } = await sb.from('help_requests').select('id', { count:'exact', head:true }).eq('status', 'open'); A.helpOpen = count || 0; }catch{ A.helpOpen = 0; }
  setBadges(); }
function setBadges(){
  const late = A.lateTasks ? A.lateTasks.size : 0, rep = A.repTasks ? [...A.repTasks.values()].reduce((a, v) => a + v, 0) : 0, help = A.helpOpen || 0;
  const tip = [help ? t('bdHelp', { n:help }) : '', late ? t('bdLate', { n:late }) : '', rep ? t('bdRep', { n:rep }) : ''].filter(Boolean).join(' · ');
  UI.badges = { tasks:{ n:help + late + rep, tip } };
  const tab = document.querySelector('.tab[data-tab="tasks"]'); if(tab){ const old = tab.querySelector('.tab-badge'); if(old) old.remove(); if(help + late + rep) tab.insertAdjacentHTML('beforeend', `<span class="tab-badge" title="${esc(tip)}" aria-label="${esc(tip)}">${Math.min(99, help + late + rep)}</span>`); }
}
// open an order or a person on the map (selected, panel open)
const showOnMap = sel => { LM.sel = sel; LM.focus = true; if(sel.kind === 'task'){ const tk = A.tasks.find(x => x.id === sel.id); if(tk) LM.f[tk.status === 'done' ? 'done' : 'open'] = true; } adminTab('map'); };
async function loadLive(){ const { data } = await sb.from('routes').select('id,worker_id,task_id,plan_id,paused_at,last30_m,started_at,break_s').is('ended_at', null); A.live = data || []; }
async function loadAll(){
  await Promise.all([loadWorkers(), loadTasks(), loadFirm().then(c => { A.company = c; }).catch(() => {}), loadAdmins().then(a => { A.admins = a; })]);
  applyRole(A.company && A.company.role);   // coordinator: read-only panel (the database enforces it)
  // master admins see every company: names for the lists
  A.companies = A.company && A.company.master ? ((await sb.from('companies').select('id,name')).data || []) : [];
}
const coName = id => { if(!A.companies || A.companies.length < 2) return ''; const c = A.companies.find(x => x.id === id); return c ? (/^\[/.test(c.name) ? '—' : c.name) : ''; };
// the GPS points of a finished route do not change any more: kept while the app is open, so a map opens at once the second time
const PTS = new Map();
async function routePoints(r){
  if(r.ended_at && PTS.has(r.id)) return PTS.get(r.id);
  const p = await fetchPoints(r.id); if(r.ended_at){ PTS.set(r.id, p); if(PTS.size > 80) PTS.delete(PTS.keys().next().value); } return p;
}
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
  const tk = A.tasks.find(x => x.id === r.task_id), quota = (tk && tk.quota_m30) || 2000; if(tk && tk.no_quota) return { cls:'', label:'' };
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

/* ---------- KARTE: who is where right now (livemap.js since 16.11.2026) ---------- */
function viewLive(){
  viewLiveMap({ A, isLive, pace, loadWorkers, loadLive, viewTask, viewWorker, viewTaskMap, navTarget, todayTrack, GREEN_C, splitJumps, viewLive });
}

/* ---------- MITARBEITER: admin profile + team ---------- */
/* ---------- working days (routes): shared by the Mitarbeiter list and the worker page ---------- */
const dayKey = r => new Date(r.started_at).toLocaleDateString('sv-SE');   // local YYYY-MM-DD
// net working time: start to end minus breaks, plus a correction by the admin (adj_s; the GPS times stay as recorded)
// a pause counts in full hours only (1:15 → 1 h, 0:40 → 0): the rest is working time
// pause of a day: under an hour it counts exactly, from an hour on in full hours (1:15 → 1 h)
const pauseFull = sec => (sec || 0) < 3600 ? Math.round((sec || 0) / 60) : Math.floor(sec / 3600) * 60;   // minutes
// minus the time walked together with a colleague on the colleague's route (together_s, counted there)
const rawMin = r => ((r.ended_at ? new Date(r.ended_at) : Date.now()) - new Date(r.started_at)) / 60000 + (r.adj_s || 0) / 60 - (r.together_s || 0) / 60;
const workMin = r => r._min != null ? r._min : Math.max(0, rawMin(r) - pauseFull(r.break_s));
// several sessions of one person on one day (Feierabend + start again, app restarted …) are one working day:
// one line, one map, distances and times added up. id = first session (newest first lists stay newest first).
function mergeDays(routes){
  const groups = new Map();
  for(const r of routes || []){
    const k = r.worker_id + '|' + dayKey(r); let g = groups.get(k);
    if(!g){ g = { ...r, ids:[], _routes:[], distance_m:0, break_s:0, together_s:0, _min:0, _raw:0 }; groups.set(k, g); }
    g.ids.push(r.id); g._routes.push(r); g.distance_m += r.distance_m || 0; g.break_s += r.break_s || 0; g.together_s += r.together_s || 0; g._raw += rawMin(r); g._min = Math.max(0, g._raw - pauseFull(g.break_s));
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
// place of a working day + order name, without repeats: "Rosenhammer, Weidenberg · Weidenberg 1" instead of
// "Rosenhammer, Weidenberg · Weidenberg 1 · Weidenberg (Tag 1)" (the "(Tag 1)" of a merged order was wrong on every other day)
const placeTxt = r => { const pl = String(r.place || ''), low = pl.toLowerCase(), seen = new Set();
  const parts = String(r.task_title || '').split(' · ').map(x => x.replace(/\s*\(Tag \d+\)\s*$/i, '').trim()).filter(x => { const k = x.toLowerCase(); if(!x || seen.has(k) || low.split(/,\s*/).includes(k)) return false; seen.add(k); return true; });
  return [pl, ...parts].filter(Boolean).join(' · '); };
const hhmm = d => new Date(d).toLocaleTimeString(loc(), { hour:'2-digit', minute:'2-digit' });
const dayFilter = () => A.dFilter || (A.dFilter = { from:'', to:'', place:'' });
const dayMatches = (r, f) => { const d = dayKey(r); return (!f.from || d >= f.from) && (!f.to || d <= f.to) && (!f.place || r.place === f.place); };
const filterOn = f => !!(f.from || f.to || f.place);
// pause of a working day in minutes (also a pause that is running right now)
const brkMin = r => pauseFull(r.break_s);
const brkTxt = min => min >= 1 ? ' · ' + t('pauseLbl') + ' ' + fmtHm(min) + ' ' + t('h') : '';
const dayLine = (r, cls) => `<button class="row-line rbtn ${cls || ''}" data-r="${r.id}" data-w="${r.worker_id}"><div class="rb-main"><b>${esc(new Date(r.started_at).toLocaleDateString(loc(), { weekday:'short', day:'2-digit', month:'2-digit', year:'2-digit' }))} · ${esc(hhmm(r.started_at))}–${esc(r.ended_at ? hhmm(r.ended_at) : t('active'))}</b><small data-place="${r.id}">${esc(placeTxt(r) || '…')}</small></div><span>${esc(fmtDist(r.distance_m || 0))} · ${esc(fmtHm(workMin(r)) + ' ' + t('h') + brkTxt(brkMin(r)))}${r.together_s >= 60 ? `<em class="tg-badge">${esc(t('togetherBadge', { m:Math.round(r.together_s / 60) }))}</em>` : ''}</span></button>`;
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
      <div class="kpis two"><button class="kpi k-info on" id="kAll" aria-pressed="true"><b>${A.workers.length}</b><span>${esc(t('kTotal'))}</span></button><button class="kpi k-ok" id="kLive" aria-pressed="false"><b>${nLive}</b><span>${esc(t('stLive'))}</span></button></div>
      <div class="card filter-card">
        <div class="fc-grid">
          <div><label class="f" for="wQ">${esc(t('fWho'))}</label><div class="searchbox"><span class="sb-ic">${ICONS.search}</span><input id="wQ" class="sb-in" placeholder="${esc(t('searchNamePhone'))}"></div></div>
          <div><label class="f">${esc(t('whoCanGo'))}</label>${sf.html}</div>
        </div>
        <label class="f">${esc(t('workedWhen'))}</label>
        <div id="dFilter"></div>
      </div>
      <details class="filters" id="invBox" style="margin-top:16px"><summary>${ICONS.plus}${esc(t('invSection'))}</summary><div class="f-body">
      ${isCoord() ? refLinkCardHtml() : ''}
      ${A.company && A.company.join_code ? `<div class="card" style="display:block;margin:0 0 4px"><b>${esc(t('inviteTitle'))}</b><p class="small muted" style="margin:4px 0 8px">${esc(t('inviteHint'))}</p>
        <div class="code-row"><input class="in small" readonly id="invLink" value="${esc(APP_LINK + '?neu=' + A.company.join_code)}" style="flex:1;min-width:0"><button class="btn ghost small" id="invCp">${esc(t('copy'))}</button></div>
        <a class="btn ghost small" style="margin-top:8px" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(t('inviteMsg', { link:APP_LINK + '?neu=' + A.company.join_code }))}">${ICONS.chat}WhatsApp</a></div>` : ''}
      <button class="btn ghost" id="wNewLink" style="margin-top:12px">${ICONS.plus}${esc(t('newLinkAcc'))}</button>
      <details class="filters" id="linkBox" style="margin-top:10px"><summary>${ICONS.users}${esc(t('allLinks'))}</summary><div class="f-body" id="linkList"><p class="muted small">${esc(t('loadingShort'))}</p></div></details>
      ${A.company && A.company.id ? `<details class="filters" id="poolBox"><summary>${ICONS.users}${esc(t('poolTitle'))}</summary><div class="f-body" id="poolList"><p class="muted small">${esc(t('loadingShort'))}</p></div></details>` : ''}
      </div></details>
      <div class="sec-row"><h2>${esc(t('workersN', { n:A.workers.length }))}</h2>${viewSwitch('people')}</div>
      <div id="wList"></div>
    </div>`);
  sf.bind();
  if($('#poolBox')) $('#poolBox').addEventListener('toggle', async () => { if($('#poolBox').open && !$('#poolBox').dataset.done){ $('#poolBox').dataset.done = 1; $('#poolList').innerHTML = await poolHtml(); } });
  let days = [];   // all working days (newest first), loaded below
  let liveOnly = false;   // tile "Unterwegs": only the people recording a route right now
  const setLive = v => { liveOnly = v; $('#kAll').classList.toggle('on', !v); $('#kLive').classList.toggle('on', v); $('#kAll').setAttribute('aria-pressed', String(!v)); $('#kLive').setAttribute('aria-pressed', String(v)); render(); if(v) $('#wList').scrollIntoView({ behavior:'smooth', block:'nearest' }); };
  $('#kAll').onclick = () => setLive(false); $('#kLive').onclick = () => setLive(!liveOnly);
  A.wSort = A.wSort || { by:'name', dir:'asc' };
  const st = id => STATS.byId.get(id) || {};
  const peopleTable = rows => tableHtml('wTable', [
    { k:'name', label:t('colName'), sort:x => x.w.name.toLowerCase(), cell:x => `<span class="tname"><span class="dotc ${isLive(x.w) ? '' : 'pause'}" title="${esc(isLive(x.w) ? t('stLive') : t('lmNotOnWay'))}"></span><b>${esc(x.w.name)}</b></span>${coName(x.w.company_id) ? `<small class="muted"> · ${esc(coName(x.w.company_id))}</small>` : ''}` },
    { k:'cities', label:t('colCities'), sort:x => x.km != null ? x.km : (x.w.cities || []).map(c => c.name).join(', '), cell:x => esc((x.w.cities || []).map(c => c.name).join(', ') || '–') + (x.km != null ? ` <small class="muted">· ${Math.round(x.km)} km</small>` : '') },
    { k:'active', label:t('colActive'), sort:x => isLive(x.w) ? 'A' : x.w.last_seen ? 'B' + (9e15 - new Date(x.w.last_seen).getTime()) : 'C', cell:x => isLive(x.w) ? statusPill('live', t('stLive')) : esc(x.w.last_seen ? ago(x.w.last_seen) : t('noData')) },
    { k:'ver', label:t('colVerified'), sort:x => st(x.w.id).verified ? 0 : 1, cell:x => st(x.w.id).verified ? `<span class="due-ok">✓ ${esc(t('yes'))}</span>` : `<span class="muted">${esc(t('no'))}</span>` },
    { k:'done', label:t('colDone'), num:true, sort:x => +st(x.w.id).done || 0, cell:x => String(+st(x.w.id).done || 0) },
    { k:'hours', label:t('colHours'), num:true, sort:x => +st(x.w.id).hours || 0, cell:x => st(x.w.id).hours ? String(st(x.w.id).hours).replace('.', ',') : '–' },
    { k:'pace', label:t('colPace'), num:true, sort:x => st(x.w.id).pace != null ? +st(x.w.id).pace : null, cell:x => st(x.w.id).pace != null ? st(x.w.id).pace + ' %' : '–' },
    { k:'act', label:t('colActions'), cls:'act', cell:x => `<a class="icon-btn sm" href="${telLink(x.w.phone)}" title="${esc(t('call'))}" aria-label="${esc(t('call') + ': ' + x.w.name)}">${ICONS.phone}</a><a class="icon-btn sm" target="_blank" rel="noopener" href="${waLink(x.w.phone)}" title="WhatsApp" aria-label="${esc('WhatsApp: ' + x.w.name)}">${ICONS.chat}</a><button class="icon-btn sm" data-wmap="${x.w.id}" title="${esc(t('showOnMap'))}" aria-label="${esc(t('showOnMap') + ': ' + x.w.name)}">${ICONS.map}</button>` },
  ], rows.map(x => ({ ...x, id:x.w.id })), A.wSort);
  A.dSort = A.dSort || { by:'hours', dir:'desc' }; const openRows = new Set();
  const sumMin = rs => rs.reduce((a, r) => a + workMin(r), 0), sumKm = rs => rs.reduce((a, r) => a + (r.distance_m || 0), 0);
  const daysTable = (rows, byW) => tableHtml('dTable', [
    { k:'name', label:t('colName'), sort:x => x.w.name.toLowerCase(), cell:x => `<span class="tname"><button class="icon-btn sm tx" data-unf="${x.w.id}" aria-expanded="${openRows.has(x.w.id)}" aria-label="${esc(t('colDays'))}">${ICONS.chevron}</button><span class="dotc ${isLive(x.w) ? '' : 'pause'}"></span><b>${esc(x.w.name)}</b></span>` },
    { k:'days', label:t('colDays'), num:true, sort:x => byW.get(x.w.id).length, cell:x => String(byW.get(x.w.id).length) },
    { k:'hours', label:t('colHours'), num:true, sort:x => sumMin(byW.get(x.w.id)), cell:x => esc(fmtHm(sumMin(byW.get(x.w.id)))) },
    { k:'km', label:'km', num:true, sort:x => sumKm(byW.get(x.w.id)), cell:x => esc(fmtDist(sumKm(byW.get(x.w.id)))) },
    { k:'places', label:t('colPlaces'), sort:x => [...new Set(byW.get(x.w.id).map(r => r.place).filter(Boolean))].join(', '), cell:x => `<small>${esc([...new Set(byW.get(x.w.id).map(r => (r.place || '').split(',').pop().trim()).filter(Boolean))].join(', ') || '–')}</small>` },
    { k:'last', label:t('colLastDay'), sort:x => -Math.max(...byW.get(x.w.id).map(r => new Date(r.started_at).getTime())), cell:x => esc(fmtDay(byW.get(x.w.id).map(dayKey).sort().pop())) },
    { k:'act', label:t('colActions'), cls:'act', cell:x => `<a class="icon-btn sm" href="${telLink(x.w.phone)}" title="${esc(t('call'))}" aria-label="${esc(t('call') + ': ' + x.w.name)}">${ICONS.phone}</a><a class="icon-btn sm" target="_blank" rel="noopener" href="${waLink(x.w.phone)}" title="WhatsApp" aria-label="WhatsApp">${ICONS.chat}</a>` },
  ], rows.map(x => ({ ...x, id:x.w.id })), A.dSort);
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
    if(liveOnly) list = list.filter(x => isLive(x.w));
    const shown = on ? list.flatMap(x => byW.get(x.w.id)) : [];
    $('#wList').innerHTML = (on ? `<div class="hint">${esc(shown.length ? t('workedSum', { w:list.length, d:daysSum(shown) }) : t('noDaysRange'))}</div>` : '') +
      (place ? `<div class="hint">${esc(t('canReach', { n:list.length, city:place.name }))} <button class="link" id="wClr">${esc(t('reset'))}</button></div>` : '') +
      (list.length && listView('people') === 'table' ? (on ? daysTable(list.filter(x => byW.has(x.w.id)), byW) : peopleTable(list)) : list.length ? list.map(({ w, km }) => `<div class="card worker-card"><button class="wc-main" data-id="${w.id}">${avatar(w.name, isLive(w) ? 'live' : '')}
        <div class="grow"><b>${esc(w.name)} ${okBadge(w.id)}</b>${shortLine(w.id) ? `<span>${esc(shortLine(w.id))}</span>` : ''}<span>${coName(w.company_id) ? esc(coName(w.company_id)) + ' · ' : ''}${esc((w.cities || []).map(c => c.name).join(', '))}${km != null ? ' · ' + Math.round(km) + ' km' : ''} · ${esc(t('zoneChip', { n:w.zone_minutes }))}</span><span>${isLive(w) ? statusPill('live', t('stLive')) : esc(t('lastActive', { a:ago(w.last_seen) }))}</span></div>${ICONS.chevron}</button>
        ${on ? `<div class="wc-days">${byW.get(w.id).map(r => dayLine(r)).join('')}</div>` : ''}
        <div class="wc-act"><a class="btn ghost small" href="${telLink(w.phone)}">${ICONS.phone}${esc(t('call'))}</a><a class="btn ghost small" target="_blank" rel="noopener" href="${waLink(w.phone)}">${ICONS.chat}WhatsApp</a></div></div>`).join('')
       : on ? '' : emptyState(liveOnly ? t('nobodyLiveHint') : A.workers.length ? t('notFound') : t('noWorkers'), A.workers.length ? 'search' : 'users'));
    const clr = $('#wClr'); if(clr) clr.onclick = () => { place = null; $('#wCity').value = ''; render(); };
    bindTable('wTable', A.wSort, render, id => viewWorker(id));
    bindTable('dTable', A.dSort, render, id => viewWorker(id));
    // the working days of a person unfold under the row (each day opens its map)
    { const tb = document.getElementById('dTable');
      if(tb) tb.querySelectorAll('tbody tr[data-row]').forEach(tr => { const id = tr.dataset.row; if(!openRows.has(id)) return; const rs = byW.get(id) || [];
        tr.classList.add('unf'); tr.insertAdjacentHTML('afterend', `<tr class="sub"><td colspan="7"><div class="sub-days">${rs.map(r => dayLine(r)).join('')}</div></td></tr>`); });
      document.querySelectorAll('[data-unf]').forEach(b => b.onclick = e => { e.stopPropagation(); const id = b.dataset.unf; if(openRows.has(id)) openRows.delete(id); else openRows.add(id); render(); });
      document.querySelectorAll('.sub-days .rbtn').forEach(b => b.onclick = e => { e.stopPropagation(); viewDayMap(b.dataset.r, viewPeople); }); }
    document.querySelectorAll('[data-wmap]').forEach(b => b.onclick = e => { e.stopPropagation(); showOnMap({ kind:'worker', id:b.dataset.wmap }); });
    document.querySelectorAll('.wc-main').forEach(b => b.onclick = () => viewWorker(b.dataset.id));
    document.querySelectorAll('.wc-days .rbtn').forEach(b => b.onclick = () => viewDayMap(b.dataset.r, viewPeople));
  };
  $('#wQ').oninput = render; render();
  bindViewSwitch('people', () => render());
  if(isCoord()) bindRefLink(APP_LINK, toast);
  sb.from('routes').select('id,worker_id,task_id,plan_id,started_at,ended_at,distance_m,break_s,adj_s,together_s,place,task_title').order('started_at', { ascending:false }).limit(2000)
    .then(({ data }) => { if(!document.getElementById('dFilter')) return; days = mergeDays(data || []); render(); fillPlaces(days, () => { if(document.getElementById('dFilter')) render(); }); });
}

/* ---------- EINSTELLUNGEN: firm, own account, language, legal ---------- */
function viewSettings(){
  shell('settings', `${topbar(t('tabSettings'))}
    <div class="pad">
      <nav class="set-nav sec-nav" id="setNav" aria-label="${esc(t('tabSettings'))}"></nav>
      ${A.company && A.company.master ? `<button class="btn ghost small" id="tMaster" style="margin-top:8px;width:auto">${ICONS.users}${esc(t('master'))}</button>` : ''}
      ${A.company && A.company.id ? firmCardHtml(A.company) : ''}
      ${A.company && A.company.id ? adminContractHtml() : ''}
      ${A.company && A.company.id ? `<h2 class="sec">${esc(t('botTitleSet'))}</h2>
      <div class="card" style="display:block" id="botCard">
        <label class="check"><input type="checkbox" id="botOn"><span><b>${esc(t('botOn'))}</b></span></label>
        <p class="small muted" style="margin:6px 0 12px">${esc(t('botHint'))}</p>
        <label class="f" for="botRules">${esc(t('botRules'))}</label>
        <textarea class="in" id="botRules" rows="5" maxlength="4000" placeholder="${esc(t('botRulesPh'))}"></textarea>
        <button class="btn primary small" id="botSave" style="margin-top:10px;width:auto">${esc(t('save'))}</button>
      </div>` : ''}
      ${adminsCardHtml(A.admins, A.user && A.user.id)}
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
  // section index on top: one chip per section, a tap scrolls there (no section is hidden)
  secNav($('#setNav'));
  bindAdminsCard(async () => { A.admins = await loadAdmins(); viewSettings(); }, toast, errText);
  store.get('theme').then(v => { A.theme = v; document.querySelectorAll('[data-theme-set]').forEach(b => { const on = b.dataset.themeSet === (v || 'system'); b.classList.toggle('on', on); b.setAttribute('aria-checked', on); }); });
  bindLegal(viewSettings);
  if($('#botCard')){
    sb.rpc('get_bot').then(({ data }) => { if(!data || !$('#botOn')) return; $('#botOn').checked = !!data.enabled; $('#botRules').value = data.rules || ''; });
    $('#botSave').onclick = () => busy($('#botSave'), async () => { const { error } = await sb.rpc('set_bot', { p_enabled:$('#botOn').checked, p_rules:$('#botRules').value }); if(error){ toast(errText(error)); return; } A.bot = $('#botOn').checked; toast(t('saved')); });
  }
  if(A.company && A.company.id) bindAdminContract();
  if(A.company && A.company.id) bindFirmCard(A.company, c => { A.company = { ...c, master:A.company.master }; viewSettings(); });
  if($('#tMaster')) $('#tMaster').onclick = () => viewMaster(viewSettings);
  if(A.focusFirm){ A.focusFirm = false; const fc = $('#firmCard'); if(fc) fc.scrollIntoView({ block:'center' }); }
  $('#tOut').onclick = adminLogout;
  $('#tWork').onclick = openAsWorker;
  $('#tInv').onclick = () => {
    const mo = modal(`<h2>${esc(t('inviteAdmin'))}</h2><label class="f">${esc(t('invitePhone'))}</label><input class="in" id="invE" type="tel" placeholder="+49 170 1234567">${inviteRoleHtml()}<button class="btn primary" id="invB" style="margin-top:12px">${esc(t('inviteAdmin'))}</button><div class="err" id="invErr"></div>`);
    bindInviteRole(mo);
    mo.querySelector('#invB').onclick = async () => { const ph = deMobile(mo.querySelector('#invE').value); if(!ph){ mo.querySelector('#invErr').textContent = t('badPhone'); return; } const rv = inviteRoleValues(mo); const { error } = await sb.from('admin_phone_invites').upsert(rv.role === 'admin' && !rv.display_name ? { phone:ph } : { phone:ph, ...rv }); if(error) mo.querySelector('#invErr').textContent = error.message; else { mo.remove(); toast(t('invitePhoneSent')); } };
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
      <div class="tool-row"><a class="btn primary small" href="${telLink(w.phone)}">${ICONS.phone}${esc(t('call'))}</a><a class="btn ghost small" target="_blank" rel="noopener" href="${waLink(w.phone)}">${ICONS.chat}WhatsApp</a><button class="btn ghost small" id="wOnMap">${ICONS.map}${esc(t('showOnMap'))}</button></div>
      <div class="chips">${(w.cities || []).map(c => `<span class="chip">${esc(c.name)}</span>`).join('')}</div>
      ${w.referred_by ? `<p class="small muted" style="margin:2px 0 8px">${esc(t('referredBy', { n:adminName(A.admins, w.referred_by) }))}</p>` : ''}
      <nav class="set-nav sec-nav" id="wNav" aria-label="${esc(t('secIndex'))}"></nav>
      ${workerStatsHtml(w.id)}
      <h2 class="sec">${esc(t('secOrders'))}</h2>
      <div id="wOrders"><p class="muted small">${esc(t('loadingShort'))}</p></div>
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
  $('#wOnMap').onclick = () => showOnMap({ kind:'worker', id });
  secNav($('#wNav'));
  // the orders of this person (routes given to them): open ones first, a tap opens the order
  sb.from('task_plans').select('id,task_id,idx,status,work_dates,color').eq('worker_id', id).then(({ data, error }) => {
    const box = $('#wOrders'); if(!box) return; if(error){ box.innerHTML = `<p class="err small">${esc(errText(error))}</p>`; return; }
    const rows = (data || []).map(p => ({ p, tk:A.tasks.find(x => x.id === p.task_id) })).filter(x => x.tk).sort((a, b) => (a.tk.status !== 'open') - (b.tk.status !== 'open') || String(b.tk.created_at).localeCompare(String(a.tk.created_at)));
    box.innerHTML = rows.length ? `<div class="list-card">${rows.slice(0, 30).map(({ p, tk }) => { const [k, txt] = taskState(tk);
      return `<button class="lc-row" data-wtask="${tk.id}"><span class="swatch" style="background:${esc(p.color || '#2563EB')}"></span><span class="grow"><b>${esc(tk.title)}</b><small class="muted">${esc([t('planRoute', { n:p.idx + 1 }), stText(p), (p.work_dates || []).map(fmtDay).join(', ')].filter(Boolean).join(' · '))}</small></span>${statusPill(k, txt)}${ICONS.chevron}</button>`; }).join('')}</div>` : `<p class="muted small">${esc(t('wOrdersNone'))}</p>`;
    box.querySelectorAll('[data-wtask]').forEach(b => b.onclick = () => viewTask(b.dataset.wtask));
  });
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
    // the days are grouped by order (newest order first): which order, which days, and the sum of each order
    const grp = new Map();
    for(const r of list){ const k = r.task_id || ''; if(!grp.has(k)) grp.set(k, []); grp.get(k).push(r); }
    const ordName = (k, rs) => { if(!k) return t('daysNoOrder'); const tk = (A.tasks || []).find(x => x.id === k); return (tk && tk.title) || (rs.find(x => x.task_title) || {}).task_title || t('daysNoOrder'); };
    $('#wDays').innerHTML = [...grp].map(([k, rs]) => `<section class="wd-grp"><div class="wd-head"><b>${ICONS.flag}<span>${esc(ordName(k, rs))}</span></b><small>${esc(daysSum(rs))}</small></div>${rs.map(r => dayLine(r)).join('')}</section>`).join('') || `<p class="muted small">${esc(t(all.length ? 'noDaysRange' : 'noDays'))}</p>`;
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
  // "Gespeichert" only when the database returned the changed row (no row = not allowed / not found)
  $('#wsave').onclick = () => busy($('#wsave'), async () => { const { data, error } = await sb.from('workers').update({ zone_minutes:+$('#wzm').value, notes:$('#wnotes').value.trim() || null, ...($('#wany') ? { start_anywhere:$('#wany').checked } : {}) }).eq('id', id).select('id');
    if(error || !(data || []).length){ toast(error ? errText(error) : t('notSaved')); return; } await loadWorkers(); toast(t('saved')); });
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
const adminDone = p => (p.skipped || []).filter(x => x && !x.removed && /^Admin/.test(x.by || '') && Array.isArray(x.pts)).map(x => x.pts);   // removed sections are not "distributed"
const byWorker = x => x && !/^Admin/.test(x.by || '');
const workerSkips = p => ((p && p.skipped) || []).filter(byWorker);
// pieces a worker reported as not walkable (orange): the admin decides – "Bestätigt" (stays out, drawn faded) or
// "Zurück in die Route" (the report is removed, the piece is open again for the worker). Grey ones (old "Nicht nötig") only show.
const skipKey = x => (x.at || '') + '|' + (x.pts && x.pts[0] ? x.pts[0].join(',') : '');
const skipTip = x => t(x.rep ? (x.ok ? 'rvRepOk' : 'rvReported') : 'rvSkipped') + (x.rep && x.why ? ' · ' + (t('hr_' + x.why) === 'hr_' + x.why ? x.why : t('hr_' + x.why)) : '') + (x.by ? ' · ' + x.by : '') + (x.why && !x.rep ? ' · „' + x.why + '“' : '') + (x.at ? ' · ' + fmtDT(x.at) : '');
const drawSkips = (g, plans, reload) => (plans || []).forEach(p => workerSkips(p).forEach(x => {
  if(!x || !x.pts || x.pts.length < 2) return;
  const ln = L.polyline(x.pts, x.rep ? { color:'#F97316', weight:7, opacity:x.ok ? .45 : .9, dashArray:'10 6', lineCap:'round' } : { color:'#6B7280', weight:7, opacity:.85, dashArray:'3 9', lineCap:'round' }).addTo(g);
  if(!x.rep || !reload){ ln.bindTooltip(skipTip(x)); return; }
  ln.bindPopup(`<b>${esc(skipTip(x))}</b><div style="margin-top:8px;display:flex;flex-direction:column;gap:6px">${x.ok ? '' : `<button class="btn primary small" data-rok>${esc(t('repAccept'))}</button>`}<button class="btn ghost small" data-rback>${esc(t('repBack'))}</button></div><div class="err" data-rerr></div>`, { className:'cp-pop', maxWidth:240 });
  ln.on('popupopen', e => {
    const el = e.popup.getElement(), err = el.querySelector('[data-rerr]'), key = skipKey(x);
    const save = async fn => {
      const { data:fresh, error:e1 } = await sb.from('task_plans').select('skipped').eq('id', p.id).maybeSingle(); if(e1 || !fresh){ err.textContent = errText(e1); return; }
      const { error } = await sb.from('task_plans').update({ skipped:fn(fresh.skipped || []) }).eq('id', p.id); if(error){ err.textContent = errText(error); return; }
      ln.closePopup(); loadTasks().catch(() => {}); reload();   // the number on the tab follows
    };
    const ok = el.querySelector('[data-rok]'); if(ok) ok.onclick = () => { ok.disabled = true; save(sk => sk.map(y => y && y.rep && skipKey(y) === key ? { ...y, ok:true, ok_at:new Date().toISOString() } : y)); };
    const bk = el.querySelector('[data-rback]'); bk.onclick = () => { bk.disabled = true; save(sk => sk.filter(y => !(y && y.rep && skipKey(y) === key))); };
  });
}));
// GPS track: its own colour (yellow with a dark edge) so it never looks like a planned route
const GPS = '#FACC15';
const splitJumps = ll => { const out = []; let cur = []; for(let i = 0; i < ll.length; i++){ if(i && hav(ll[i - 1][0], ll[i - 1][1], ll[i][0], ll[i][1]) > 150){ if(cur.length > 1) out.push(cur); cur = []; } cur.push(ll[i]); } if(cur.length > 1) out.push(cur); return out; };
const NEW_QUOTA = 2500;
// deadline of an order ("fertig bis"): working days from tomorrow up to and including it, Sundays not counted
const isoDay = dt => new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const plusDays = (iso, n) => { const x = new Date(iso + 'T12:00:00'); x.setDate(x.getDate() + n); return isoDay(x); };
const workDaysTo = dl => { if(!dl) return null; let n = 0; for(let x = plusDays(isoDay(new Date()), 1); x <= dl && n < 60; x = plusDays(x, 1)) if(new Date(x + 'T12:00:00').getDay() !== 0) n++; return Math.max(1, n); };   // quota of a new order: metres per 30 minutes (orders saved earlier keep theirs)
const DRIVE_C = () => css('--color-drive') || '#7C3AED';   // driving (> 14 km/h): violet, dashed (token)
const driveLine = (g, ll, w = 3) => ll.length > 1 ? L.polyline(ll, { color:DRIVE_C(), weight:w, opacity:.95, dashArray:'8 6', lineJoin:'round' }).bindTooltip(t('driveTip', { km:fmtDist(ll.reduce((x, q, k) => x + (k ? hav(ll[k-1][0], ll[k-1][1], q[0], q[1]) : 0), 0)) }), { sticky:true }).addTo(g) : null;
const gpsLine = (g, ll, w = 3) => { const parts = splitJumps(ll); if(!parts.length) return null; L.polyline(parts, { color:'#111827', weight:w + 3, opacity:.45, lineJoin:'round' }).addTo(g); return L.polyline(parts, { color:GPS, weight:w, opacity:1, lineJoin:'round' }).addTo(g); };
// Keep the same route colour across days. Patterns distinguish the day layers.
const routeColor = color => color || '#2563EB';
const dayPatterns = [
  { dash:null, symbol:'━' }, { dash:'10 8', symbol:'╍' }, { dash:'2 8', symbol:'┈' },
  { dash:'10 5 2 5', symbol:'╍┈' }
];
const dayPattern = day => dayPatterns[day === 0 ? 0 : 1 + (day - 1) % (dayPatterns.length - 1)];
const nameOf = id => (wById(id) || {}).name || '—';
// one working day of one worker: walked GPS track, planned route, the planned streets covered that day
async function viewDayMap(routeId, back, keep){
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
  // walked together with a colleague on the colleague's route: that time is not counted here (the admin can count it anyway)
  const { data:tg } = await sb.from('route_together').select('route_id,other_route_id,from_t,to_t,seconds,undone').in('route_id', [...ids]);
  let tgNote = '', tgAction = null;
  if((tg || []).length){
    const { data:orr } = await sb.from('routes').select('id,worker_id').in('id', [...new Set(tg.map(x => x.other_route_id))]);
    const who = [...new Set(tg.map(x => nameOf(((orr || []).find(o => o.id === x.other_route_id) || {}).worker_id)).filter(Boolean))].join(', ');
    const undone = tg.every(x => x.undone), sec = tg.reduce((a, x) => a + x.seconds, 0);
    tgNote = t(undone ? 'togetherNoteUndone' : 'togetherNote', { n:who, m:Math.round(sec / 60), t:tg.map(x => hhmm(x.from_t) + '–' + hhmm(x.to_t)).join(', ') });
    if(!isCoord()) tgAction = { label:t(undone ? 'togetherRedo' : 'togetherUndo'), run:async () => {
      for(const id of ids){ const { error } = await sb.rpc('together_undo', { p_route:id, p_undo:!undone }); if(error){ toast(errText(error)); return; } }
      const nv = undone ? sec : 0, delta = nv - (r.together_s || 0);
      r.together_s = nv; (r._routes || []).forEach(x => { x.together_s = tg.filter(y => y.route_id === x.id).reduce((a, y) => a + (undone ? y.seconds : 0), 0); });
      if(r._min != null){ r._raw -= delta / 60; r._min = Math.max(0, r._raw - pauseFull(r.break_s)); }
      viewDayMap(routeId, back);
    } };
  }
  // every house along the track counts (also outside the route); the planned boxes only when the map squares are not available
  const d0 = new Date(r.started_at);
  const dm = openMapView({ view:keep, action:tgAction,
    title:nameOf(r.worker_id), anonTitle:t('rvDistributor'), hasNames:true,
    lines:[d0.toLocaleDateString(loc(), { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' }) + ' · ' + hhmm(r.started_at) + '–' + (r.ended_at ? hhmm(r.ended_at) : t('active')), placeTxt(r)],
    get stats(){ return [[t('rvDist'), fmtDist(r.distance_m || 0)], [t('rvWork'), fmtHm(workMin(r)) + ' ' + t('h')], brkMin(r) >= 1 ? [t('pauseLbl'), fmtHm(brkMin(r)) + ' ' + t('h')] : null, fl != null ? [t('rvFlyers'), '≈ ' + fmtN(fl)] : null, pct != null ? [t('rvDayShare'), pct + ' %'] : null, pctAll != null ? [t('rvDayShare2'), pctAll + ' %'] : null]; },
    note:[r.track_deleted_at ? t('trackDeleted') : (ll.length < 2 ? t('rvNoTrack') : ''), tgNote].filter(Boolean).join(' '),
    layers:[
      { key:'plan', label:pl ? t('rvPlan') : '', on:!!pl, add:g => { if(!pl || !pl.path || pl.path.length < 2) return;
        const ds = (pl.days || []).length > 1 ? pl.days : [{ i0:0, i1:pl.path.length - 1 }];
        ds.forEach((d, k) => L.polyline(Planner.pathRuns(pl.path.slice(d.i0, d.i1 + 1)), { color:routeColor(col), weight:4, opacity:.6, dashArray:dayPattern(k).dash, lineJoin:'round' }).addTo(g)); } },
      // one layer: everything done on this route – this day, earlier days and colleagues alike
      { key:'done', label:runs.length || runsPrev.length || ll.length > 1 ? t('rvDone') : '', add:g => { [...runsPrev, ...runs, ...(pl ? offRoute(wr, [pl]) : [])].forEach(x => L.polyline(x, { color:GREEN_C(), weight:8, opacity:.9, lineJoin:'round', lineCap:'round' }).addTo(g));
        // the GPS track belongs to it (one switch)
        if(ll.length < 2) return;
        wr.forEach(a => { if(a.length > 1) gpsLine(g, a); }); sp.drive.forEach(a => driveLine(g, a));
        L.marker(ll[0], { icon:dot('start-dot', 16) }).addTo(g); L.marker(ll[ll.length - 1], { icon:dot(r.ended_at ? 'end-dot' : 'me-dot', r.ended_at ? 16 : 20) }).addTo(g); } },
      { key:'skip', label:workerSkips(pl).length ? t('rvSkipped') : '', add:g => drawSkips(g, [pl], pl ? () => viewDayMap(routeId, back, dm.rvState()) : null) },
      { key:'cp', label:cps.length ? t('checkpoints') : '', on:false, add:g => cps.forEach(c => cpAdmin(c, routeColor(col), (pl.days || []).length > 1, pl, () => viewDayMap(routeId, back, dm.rvState())).addTo(g)) },
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
    g.clearLayers(); draw.pts = [];
    (plans || []).forEach(p => {
      const w = p.worker_id && wById(p.worker_id); if(!w || w.last_lat == null || !w.last_seen) return;
      const age = Date.now() - new Date(w.last_seen).getTime(); if(age > 12 * 36e5) return;
      const run = (A.live || []).find(r => r.worker_id === w.id && (r.task_id === tk.id || r.plan_id === p.id)), fresh = run && !run.paused_at && age < 3 * 60e3;
      const label = (showNames() ? w.name : t('planRoute', { n:p.idx + 1 })) + ' · ' + (run && run.paused_at ? t('onPause') : ago(w.last_seen));
      draw.pts.push({ at:[w.last_lat, w.last_lng], live:!!run });
      L.marker([w.last_lat, w.last_lng], { zIndexOffset:2000, keyboard:false, icon:L.divIcon({ className:'', iconSize:[22, 22], iconAnchor:[11, 11],
        html:`<div class="live-pin ${fresh ? 'on' : 'old'}" style="--c:${esc(p.color || '#2563EB')}"><i></i><span>${esc(label)}</span></div>` }) }).addTo(g);
      if(run && !run.paused_at) navTarget(g, w, p.color || '#2563EB', showNames() ? w.name : t('planRoute', { n:p.idx + 1 }));
    });
  };
  draw();
  every(4000, async () => {
    try{ await Promise.all([loadWorkers(), loadLive()]); draw(); }catch{}
  });
  return draw;
}
// checkpoint: numbered point on the route (day.section with several days), green tick when 80 % of the section is walked
export const cpMarker = (c, color, multi) => L.marker(c.at, { keyboard:false, zIndexOffset:500, title:t('cpTitle', { d:c.day + 1, n:c.n, p:c.pct }),
  icon:L.divIcon({ className:'', iconSize:[24, 24], iconAnchor:[12, 12], html:`<div class="cp ${c.removed ? 'rm' : c.done ? 'ok' : ''}" style="--c:${esc(color || '#2563EB')}">${c.removed ? '×' : c.done ? '✓' : (multi ? (c.day + 1) + '.' : '') + c.n}</div>` }) });
// admin: tap a checkpoint → its streets light up, and it can be closed as done (or opened again if it was closed here)
const cpTag = c => (c.day + 1) + '.' + c.n;
function densify(run){ const out = [run[0]]; for(let i = 1; i < run.length; i++){ const a = run[i - 1], b = run[i], n = Math.max(1, Math.ceil(hav(a[0], a[1], b[0], b[1]) / 8)); for(let k = 1; k <= n; k++) out.push([+(a[0] + (b[0] - a[0]) * k / n).toFixed(6), +(a[1] + (b[1] - a[1]) * k / n).toFixed(6)]); } return out; }
function cpAdmin(c, color, multi, plan, reload){
  const mine = (plan.skipped || []).filter(x => x && x.cp === cpTag(c)), closed = mine.length > 0, removed = mine.some(x => x.removed);
  if(removed) c = { ...c, removed:true };
  const mk = cpMarker(c, color, multi), label = multi ? cpTag(c) : String(c.n);
  let hl = null;
  mk.bindPopup(`<b>${esc(t('cpWord'))} ${esc(label)}</b><br><span class="small">${esc(t('cpPct', { p:c.pct }))}</span><div style="margin-top:6px">${
    closed ? `${removed ? `<span class="small muted">${esc(t('cpRemovedInfo'))}</span><br>` : ''}<button class="btn ghost small" data-cpopen>${esc(t(removed ? 'cpRestore' : 'cpReopen'))}</button>` : c.done ? '' : `<button class="btn primary small" data-cpclose>${esc(t('cpClose'))}</button><button class="btn ghost small" data-cprm style="margin-top:6px">${esc(t('cpRemove'))}</button>`}</div><div class="err" data-cperr></div>`, { className:'cp-pop', maxWidth:220, autoPan:false });
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
    // remove / restore: the section's mailboxes and its share of the walking time leave the route and the order (and come back)
    const saveRm = async (add) => {
      const { data:fr, error:e1 } = await sb.from('task_plans').select('skipped,mailboxes,minutes,length_m,boxes,task_id').eq('id', plan.id).maybeSingle(); if(e1 || !fr){ err.textContent = errText(e1); return; }
      const sk = fr.skipped || [], tag = cpTag(c); let next, dmb, dmin;
      if(add){
        const ent = c.runs.map(r => ({ at:new Date().toISOString(), by:'Admin', why:'Entfernt', removed:true, cp:tag, pts:densify(r) }));
        const base = { ...fr, skipped:sk.filter(x => !(x && x.cp === tag)) }, sum = b => b.reduce((s, x) => s + (x[2] || 1), 0);
        dmb = Math.max(0, Math.round(sum(keptBoxes(base)) - sum(keptBoxes(base, ent))));
        dmin = fr.length_m ? Math.max(0, Math.round((fr.minutes || 0) * removedLen({ skipped:ent }) / fr.length_m)) : 0;
        ent[0].mb = dmb; ent[0].min = dmin; next = [...base.skipped, ...ent];
      } else {
        const own = sk.filter(x => x && x.cp === tag && x.removed); dmb = -own.reduce((s, x) => s + (+x.mb || 0), 0); dmin = -own.reduce((s, x) => s + (+x.min || 0), 0);
        next = sk.filter(x => !(x && x.cp === tag));
      }
      const { error } = await sb.from('task_plans').update({ skipped:next, mailboxes:Math.max(0, Math.round((fr.mailboxes || 0) - dmb)), minutes:Math.max(0, Math.round((fr.minutes || 0) - dmin)) }).eq('id', plan.id);
      if(error){ err.textContent = errText(error); return; }
      if(dmb){ const { data:tk } = await sb.from('tasks').select('flyers,est_mailboxes').eq('id', fr.task_id).maybeSingle();
        if(tk){ const upd = {}; if(tk.flyers != null) upd.flyers = Math.max(0, Math.round(tk.flyers - dmb)); if(tk.est_mailboxes != null) upd.est_mailboxes = Math.max(0, Math.round(tk.est_mailboxes - dmb)); if(Object.keys(upd).length) await sb.from('tasks').update(upd).eq('id', fr.task_id); } }
      mk.closePopup(); try{ await loadTasks(); }catch{} reload();
    };
    const br = el.querySelector('[data-cprm]'); if(br) br.onclick = () => { br.disabled = true; saveRm(true); };
    const bo = el.querySelector('[data-cpopen]'); if(bo) bo.onclick = () => { bo.disabled = true; if(removed) saveRm(false); else save(sk => sk.filter(x => !(x && x.cp === cpTag(c)))); };
  });
  mk.on('popupclose', () => { if(hl){ hl.remove(); hl = null; } });
  return mk;
}
// a whole order: every route in its colour, what has been covered in green, the GPS tracks of all days
async function viewTaskMap(id, back, keep){
  const tk = A.tasks.find(x => x.id === id); if(!tk) return back();
  const [{ data:plans }, { data:routes }] = await Promise.all([sb.from('task_plans').select('*').eq('task_id', id).order('idx'), sb.from('routes').select('*').eq('task_id', id)]);
  // The map opens at once with the plan and where the people are; the GPS points (many, for every day of the order) are
  // loaded behind it – then what is done, the tracks and the checkpoints are filled in.
  let tracks = [], drives = [], byPlan = {}, res = [], offRuns = [], doneM = 0, allM = 0, flAll = 0, hasFl = false, loading = true;
  const allBoxes = (plans || []).flatMap(p => p.boxes || []);
  const compute = split => {
    tracks = split.flatMap(x => x.walk); drives = split.flatMap(x => x.drive); byPlan = {}; doneM = 0; allM = 0; flAll = 0; hasFl = false;
    (routes || []).forEach((r, i) => {
      const pid = r.plan_id || ((plans || []).find(p => p.worker_id === r.worker_id) || {}).id; if(!pid || !split[i]) return;
      (byPlan[pid] = byPlan[pid] || []).push(...split[i].walk);
    });
    res = (plans || []).map(p => {
      const tr = p.path && p.path.length > 1 ? addSkips(Planner.makeTracker(p.path), p) : null, kb = keptBoxes(p), ct = kb.length ? Planner.makeBoxCounter(kb) : null;
      // all tracks of the order count: streets of this route walked by somebody else are done too
      for(const pts of tracks){ if(tr) tr.addTrack(pts); if(ct) ct.visitAll(pts); }
      if(ct) adminDone(p).forEach(pts => ct.visitAll(pts));   // parts the admin closed as done (e.g. phone broken) count their mailboxes too
      const pct = tr ? effPct(tr, p) : 0, Lp = Math.max(0, (p.length_m || 0) - removedLen(p)); doneM += pct * Lp / 100; allM += Lp; if(ct){ flAll += ct.count(); hasFl = true; }
      return { p, runs:tr ? tr.runs() : [], pct, fl:ct ? ct.count() : null, cps:tr ? checkpoints(p, i => tr.isDone(i)) : [] };
    });
    // houses along a route's tracks outside every planned route count for that route like planned ones
    offRuns = offRoute(tracks, plans);
  };
  const cached = (routes || []).every(r => r.track_deleted_at || (r.ended_at && PTS.has(r.id)));
  const loadSplit = async () => (await Promise.all((routes || []).map(r => r.track_deleted_at ? [] : routePoints(r).catch(() => [])))).map(p => Planner.walkRuns(p));
  if(cached){ compute(await loadSplit()); loading = false; } else compute([]);
  const walked = (routes || []).reduce((a, r) => a + (r.distance_m || 0), 0), days = new Set((routes || []).map(dayKey)).size;
  const manFl = tk.flyers_done != null, WCOLS = ['#2563EB', '#DB2777', '#059669', '#D97706', '#7C3AED', '#0891B2', '#DC2626', '#65A30D'];
  const byWorker = (() => { const m = {}; (routes || []).forEach(r => { if(!r.worker_id) return; (m[r.worker_id] = m[r.worker_id] || { id:r.worker_id, m:0 }).m += r.distance_m || 0; });
    const arr = Object.values(m).sort((a, b) => b.m - a.m), tot = arr.reduce((a, x) => a + x.m, 0);
    let left = tk.flyers_done || 0; arr.forEach((x, i) => { x.fl = i === arr.length - 1 ? left : Math.round((tk.flyers_done || 0) * (tot ? x.m / tot : 1 / arr.length)); left -= x.fl;
      const p = (plans || []).find(q => q.worker_id === x.id); x.color = p && p.color; });
    return arr; })();
  // working time of today per person, live: today's closed sessions + the running one (a running pause stops the clock),
  // the pause of the day counted like everywhere else (pauseFull); refreshed every 30 s while the map is open
  const todayKey = () => new Date().toLocaleDateString('sv-SE');
  let today = (routes || []).filter(r => dayKey(r) === todayKey());
  const liveMin = r => Math.max(0, ((r.ended_at ? new Date(r.ended_at) : r.paused_at ? new Date(r.paused_at) : Date.now()) - new Date(r.started_at)) / 60000 + (r.adj_s || 0) / 60 - (r.together_s || 0) / 60);
  const hhmm = min => { const n = Math.max(0, Math.round(min)); return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0'); };
  const paceCls = pc => pc < 80 ? ['bad', t('paceSlow')] : pc <= 130 ? ['ok', t('paceOk')] : pc <= 300 ? ['ok', t('paceFast')] : ['warn', t('paceTooFast')];
  // second line under a person in the legend: running / break / finished · hours today · break today · pace against the quota
  const todayMeta = wid => {
    const rs = wid ? today.filter(r => r.worker_id === wid) : []; if(!rs.length) return null;
    const raw = rs.reduce((a, r) => a + liveMin(r), 0), brk = rs.reduce((a, r) => a + (r.break_s || 0), 0), net = Math.max(0, raw - pauseFull(brk));
    const run = rs.find(r => !r.ended_at), paused = !!(run && run.paused_at);
    const brkNow = brk / 60 + (paused ? (Date.now() - new Date(run.paused_at)) / 60000 : 0);
    const out = [run ? (paused ? { c:'warn', s:t('onPause') } : { c:'ok live', s:t('lgLiveNow') }) : { c:'', s:t('lgDoneToday') }, { c:'', s:t('lgToday', { h:hhmm(net) }) }];
    if(brkNow >= 1) out.push({ c:'', s:t('lgPause', { h:hhmm(brkNow) }) });
    const quota = tk.quota_m30, dist = rs.reduce((a, r) => a + (r.distance_m || 0), 0);
    if(quota && !tk.no_quota && net >= 10){ const pc = Math.round(100 * dist / (net / 30 * quota)), [c, s] = paceCls(pc); out.push({ c, s:t('lgPace', { p:pc }) + ' · ' + s }); }
    // the last half hour of a running session (only while walking)
    if(run && !paused && quota && !tk.no_quota && run.last30_m != null){
      const wm = (Date.now() - new Date(run.started_at) - (run.break_s || 0) * 1000) / 60000;
      if(wm >= 8){ const pc = Math.round(100 * run.last30_m / (quota * Math.min(30, wm) / 30)), [c, s] = paceCls(pc); out.push({ c, s:t('lgNow30', { s }) }); }
    }
    return out;
  };
  let names = true, redrawLive = null, m = null;
  const opts = {
    view:keep, get note(){ return loading ? t('rvLoading') : ''; },
    title:tk.title, hasNames:true, onNames:v => { names = v; if(redrawLive) redrawLive(); },
    lines:[[tk.district, tk.city_name].filter(Boolean).join(', '), tk.work_date ? fmtDay(tk.work_date) : ''],
    get stats(){ return [tk.flyers ? [t('flyers'), fmtN(tk.flyers)] : null, manFl ? [t('rvFlyers'), '≈ ' + fmtN(tk.flyers_done)] : hasFl ? [t('rvFlyers'), '≈ ' + fmtN(flAll)] : null, [t('rvDist'), fmtDist(walked)], allM ? [t('rvDayShare2'), Math.round(100 * doneM / allM) + ' %'] : null, days ? [t('rvDays'), String(days)] : null]; },
    // the admin entered the handed-out flyers: split them over everybody who walked, by kilometres
    get legend(){ if(manFl) return byWorker.map((x, i) => ({ color:x.color || WCOLS[i % WCOLS.length], label:nameOf(x.id), anonLabel:t('planRoute', { n:i + 1 }), sub:fmtDist(x.m) + ' · ≈ ' + fmtN(x.fl) + ' ' + t('flyers'), meta:todayMeta(x.id) }));
      return res.map(({ p, pct, fl }) => ({ color:p.color || '#2563EB', label:(p.worker_id ? nameOf(p.worker_id) : t('planRoute', { n:p.idx + 1 })), anonLabel:t('planRoute', { n:p.idx + 1 }), sub:pct + ' %' + (fl != null ? ' · ≈ ' + fmtN(fl) + ' ' + t('flyers') : ''), meta:todayMeta(p.worker_id) })); },
    layers:[
      { key:'zone', on:radiusFromPlans(plans) != null, add:g => { if(tk.zone_polygon) L.polygon(tk.zone_polygon, { color:css('--brand'), weight:2, fillOpacity:.05, interactive:false }).addTo(g); } },
      ...((tk.must_areas || []).length || (tk.side_towns || []).length ? [{ key:'must', label:t('sideTownsShort'), on:false, add:g => drawTowns(g, tk, 3) }] : []),
      ...(tk.work_area ? [{ key:'own', label:t('zoneTitle'), add:g => L.polygon(tk.work_area, { color:'#7C3AED', weight:3, dashArray:'10 6', fillOpacity:.04, interactive:false }).addTo(g) }] : []),
      // the planned routes; with several working days every day is its own layer (day 1 solid, day 2 dashed, …)
      ...(() => {
        const nd = Math.max(1, ...(plans || []).map(p => (p.days || []).length));
        const drawDay = (g, k) => (plans || []).forEach(p => { if(!p.path || p.path.length < 2) return; const d = nd > 1 ? (p.days || [])[k] : null; if(nd > 1 && !d) return;
          L.polyline(Planner.pathRuns(d ? p.path.slice(d.i0, d.i1 + 1) : p.path), { color:routeColor(p.color), weight:5, opacity:.85, dashArray:dayPattern(k).dash, className:'order-day-route', lineJoin:'round', lineCap:'round' }).addTo(g); });
        const start = g => L.marker([tk.start_lat, tk.start_lng], { icon:dot('pin-start', 24) }).addTo(g);
        return nd > 1 ? [...Array.from({ length:nd }, (_, k) => ({ key:'day' + k, label:t('dayN', { n:k + 1 }) + ' ' + dayPattern(k).symbol, add:g => drawDay(g, k) })), { key:'start', add:start }]
          : [{ key:'plan', label:t('rvPlan'), add:g => { drawDay(g, 0); start(g); } }];
      })(),
      // one switch: what is done (green) together with the GPS tracks it comes from
      { key:'done', label:t('rvDone'), add:g => { res.forEach(x => x.runs.forEach(run => L.polyline(run, { color:GREEN_C(), weight:7, opacity:.9, lineJoin:'round', lineCap:'round' }).addTo(g))); res.forEach(x => removedOf(x.p).forEach(x => L.polyline(x.pts, { color:'#94A3B8', weight:8, opacity:.95, dashArray:'4 8', lineCap:'round', interactive:false }).addTo(g))); offRuns.forEach(run => L.polyline(run, { color:GREEN_C(), weight:7, opacity:.9, lineJoin:'round', lineCap:'round' }).addTo(g));
        tracks.forEach(ll => { if(ll.length > 1) gpsLine(g, ll, 2.5); }); drives.forEach(ll => driveLine(g, ll, 2.5)); } },
      ...((plans || []).some(p => (p.path || []).some(q => q[2] === 1)) ? [{ key:'jumps', label:(tk.travel === 'zones' && rideMinOf(plans)) ? t('tripsPlan', { min:rideMinOf(plans) }) : t({ car:'tripsCar', bike:'tripsBike', bus:'tripsBus', zones:'tripsUnknown' }[(tk.travel || (tk.bike ? 'bike' : 'bus'))]), add:g => (plans || []).forEach(p => drawJumps(g, p.path, (tk.travel || (tk.bike ? 'bike' : 'bus')), rideMinOf(plans), ridesOf([p]))) }] : []),
      ...((plans || []).some(p => workerSkips(p).length) ? [{ key:'skip', label:t('rvSkipped'), add:g => drawSkips(g, plans, () => viewTaskMap(id, back, m && m.rvState())) }] : []),
      { key:'cp', label:t('checkpoints'), on:false, add:g => res.forEach(({ p, cps }) => cps.forEach(c => cpAdmin(c, routeColor(p.color), (p.days || []).length > 1, p, () => viewTaskMap(id, back, m && m.rvState())).addTo(g))) },
      // a tap on "Wo gerade" moves the map to the people: the ones walking right now, else the last known positions
      { key:'live', label:t('rvLive'), add:g => { redrawLive = liveWorkers(g, tk, plans, () => names); },
        focus:mp => { const all = (redrawLive && redrawLive.pts) || [], pts = (all.some(x => x.live) ? all.filter(x => x.live) : all).map(x => x.at); if(!pts.length) return false;
          if(pts.length === 1) mp.setView(pts[0], Math.max(mp.getZoom(), 17), { animate:true }); else mp.fitBounds(L.latLngBounds(pts), { padding:[70, 70], maxZoom:17, animate:true }); return true; } },
    ],
    back,
  };
  m = openMapView(opts);
  // after openMapView (it clears the timers of the previous screen)
  every(30000, async () => {
    const d0 = new Date(); d0.setHours(0, 0, 0, 0);
    try{ const { data } = await sb.from('routes').select('id,worker_id,started_at,ended_at,break_s,adj_s,together_s,paused_at,distance_m,last30_m').eq('task_id', id).gte('started_at', d0.toISOString()); if(data) today = data.filter(r => dayKey(r) === todayKey()); }catch{}
    if(m && m.rvRefresh) m.rvRefresh();
  });
  if(loading){
    const mine = m; try{ compute(await loadSplit()); }catch{}
    loading = false; if(!$('#rvMap') || mine !== m) return;
    ['done', 'cp', 'skip'].forEach(k => m.rvFill(k)); m.rvRefresh(); m.rvTools();
  }
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
/* ================= reports of the walkers: problem with a route ================= */
// the table may be missing on an older database: then there is simply no box
async function loadHelp(){ try{ const { data, error } = await sb.from('help_requests').select('*').order('created_at', { ascending:false }).limit(60); return error ? [] : (data || []); }catch{ return []; } }
// Claude writes a suggested answer (edge function help-bot); nothing reaches the worker until the admin sends it
async function botDraft(id, force){ try{ await sb.functions.invoke('help-bot', { body:{ id, force:!!force } }); }catch{} }
function botDraftHtml(h){
  if(!h.bot_at) return `<div class="bot-draft wait"><b>${ICONS.chat}${esc(t('botTitle'))}</b><span class="muted small">${esc(t('botWriting'))}</span></div>`;
  if(h.bot_action === 'error') return `<div class="bot-draft"><b>${ICONS.chat}${esc(t('botTitle'))}</b><span class="muted small">${esc(t('botFailed'))}${h.bot_note ? ' · ' + esc(h.bot_note) : ''}</span><div class="hi-acts"><button class="btn ghost small" data-redo="${h.id}">${esc(t('botRedo'))}</button></div></div>`;
  return `<div class="bot-draft ${h.bot_action === 'admin' ? 'esc' : ''}"><b>${ICONS.chat}${esc(t('botTitle'))}${h.bot_action === 'admin' ? ` <span class="pill warn">${esc(t('botForAdmin'))}</span>` : ''}</b>
    <p>${esc(h.bot_draft || '')}</p>${h.bot_note ? `<span class="muted small">${esc(t('botNote'))}: ${esc(h.bot_note)}</span>` : ''}
    <div class="hi-acts"><button class="btn ghost small" data-take="${h.id}">${ICONS.edit}${esc(t('botTake'))}</button><button class="btn ghost small" data-redo="${h.id}">${esc(t('botRedo'))}</button></div></div>`;
}
async function viewHelpInbox(showDone){
  if(A.bot == null){ try{ const { data } = await sb.rpc('get_bot'); A.bot = !!(data && data.enabled); }catch{ A.bot = false; } }
  const all = await loadHelp(), list = all.filter(h => showDone || h.status === 'open'), nDone = all.length - all.filter(h => h.status === 'open').length;
  A.helpOpen = all.filter(h => h.status === 'open').length; setBadges();
  const when = d => new Date(d).toLocaleString(I.lang, { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
  const rs = r => t('hr_' + r) === 'hr_' + r ? r : t('hr_' + r);
  // besides the help requests: pieces of a route a worker reported (decided on the route map) and dates after the deadline
  let reps = [], lates = [];
  try{ const ids = [...new Set([...(A.repTasks ? A.repTasks.keys() : []), ...(A.lateTasks || [])])];
    if(ids.length){ const { data } = await sb.from('task_plans').select('task_id,idx,worker_id,skipped,status,late_dates,late_ok').in('task_id', ids);
      (data || []).forEach(p => { workerSkips(p).filter(x => x.rep && !x.ok).forEach(x => reps.push({ ...x, p }));
        if(p.worker_id && p.status === 'accepted' && p.late_dates && !p.late_ok) lates.push(p); }); } }catch{}
  reps.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  const tTitle = tid => { const tk = A.tasks.find(x => x.id === tid); return tk ? tk.title : ''; };
  const decide = reps.length || lates.length ? `<h2 class="sec" style="margin-top:4px">${esc(t('inbDecide'))}</h2><div class="list-card">
      ${reps.map(x => `<div class="lc-row static inb-row"><span class="rep-dot" aria-hidden="true"></span><span class="grow"><b>${esc(t('rvReported'))}${x.why ? ' · ' + esc(rs(x.why)) : ''}</b><small class="muted">${esc([tTitle(x.p.task_id), t('planRoute', { n:x.p.idx + 1 }), x.by, x.at ? when(x.at) : ''].filter(Boolean).join(' · '))}</small></span><button class="btn ghost small" data-rmap="${x.p.task_id}">${ICONS.route}${esc(t('repDecide'))}</button></div>`).join('')}
      ${lates.map(p => `<div class="lc-row static inb-row"><span class="rep-dot" aria-hidden="true"></span><span class="grow"><b>${esc(t('lateBadge'))}</b><small class="muted">${esc([tTitle(p.task_id), t('planRoute', { n:p.idx + 1 }), nameOf(p.worker_id)].filter(Boolean).join(' · '))}</small></span><button class="btn ghost small" data-task="${p.task_id}">${ICONS.flag}${esc(t('helpOpenTask'))}</button></div>`).join('')}
    </div>${list.length ? `<h2 class="sec">${esc(t('inbHelp'))}</h2>` : ''}` : '';
  shell('tasks', `${topbar(t('helpInbox'), true)}
    <div class="pad">
      ${decide}
      ${list.length ? list.map(h => { const tk = A.tasks.find(x => x.id === h.task_id); return `<div class="help-item ${h.status === 'open' ? '' : 'done'}" data-id="${h.id}">
        <div class="hi-head"><b>${esc(rs(h.reason))}</b>${statusPill(h.status === 'open' ? 'warn' : 'ok', t(h.status === 'open' ? 'helpOpen' : 'helpDone'))}</div>
        <span class="muted small">${esc([t('helpFrom', { n:nameOf(h.worker_id) || '?' }), tk ? tk.title : '', when(h.created_at)].filter(Boolean).join(' · '))}</span>
        ${h.body ? `<p style="margin:8px 0 0">${esc(h.body)}</p>` : ''}
        ${h.answer ? `<p class="help-answer"><b>${esc(t(h.auto ? 'helpAutoAnswer' : 'helpAnswer'))}:</b> ${esc(h.answer)}</p>` : ''}
        <div class="hi-acts">${tk ? `<button class="btn ghost small" data-task="${tk.id}">${ICONS.flag}${esc(t('helpOpenTask'))}</button>` : ''}${h.lat != null ? `<a class="btn ghost small" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${(+h.lat).toFixed(6)},${(+h.lng).toFixed(6)}">${ICONS.pin}${esc(t('helpWhere'))}</a>` : ''}</div>
        ${h.status === 'open' && A.bot ? botDraftHtml(h) : ''}
        ${h.status === 'open' ? `<textarea class="in" rows="2" maxlength="1000" placeholder="${esc(t('helpAnswerPh'))}"></textarea><div class="hi-acts"><button class="btn primary small" data-close="${h.id}">${ICONS.check}${esc(t('helpClose'))}</button></div>` : ''}
      </div>`; }).join('') : decide ? '' : emptyState(t('helpInboxNone'), 'inbox')}
      ${!showDone && nDone ? `<button class="link" id="hiDone">${esc(t('helpShowDone'))} (${nDone})</button>` : ''}
    </div>`); setLoc('help');
  bindBack(() => adminTab('tasks'));
  if($('#hiDone')) $('#hiDone').onclick = () => viewHelpInbox(true);
  document.querySelectorAll('[data-task]').forEach(b => b.onclick = () => viewTask(b.dataset.task));
  document.querySelectorAll('[data-rmap]').forEach(b => b.onclick = () => viewTaskMap(b.dataset.rmap, () => viewHelpInbox(showDone)));
  // Claude's draft: take it over into the answer box (the admin still sends it), or have it written again
  document.querySelectorAll('[data-take]').forEach(b => b.onclick = () => { const box = b.closest('.help-item'), h = all.find(x => x.id === b.dataset.take); if(h){ box.querySelector('textarea').value = h.bot_draft || ''; box.querySelector('textarea').focus(); } });
  document.querySelectorAll('[data-redo]').forEach(b => b.onclick = async () => { b.disabled = true; await botDraft(b.dataset.redo, true); viewHelpInbox(showDone); });
  if(A.bot){ const miss = list.filter(h => h.status === 'open' && !h.bot_at).slice(0, 5); if(miss.length) Promise.all(miss.map(h => botDraft(h.id, false))).then(() => { if(location.hash === '#help') viewHelpInbox(showDone); }); }
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = async () => {
    const box = b.closest('.help-item'), ans = box.querySelector('textarea').value.trim(); b.disabled = true;
    const { error } = await sb.rpc('help_resolve', { p_id:b.dataset.close, p_answer:ans, p_title:t('helpAnswerTitle') });
    if(error){ b.disabled = false; toast(errText(error)); return; }
    toast(t('saved')); viewHelpInbox(showDone);
  });
}
function viewTasks(){
  const opts = k => [...new Set(A.tasks.map(x => x[k]).filter(Boolean))].sort();
  const sel = (id, label, list, cur) => `<div><label class="f" for="${id}">${esc(label)}</label><select class="in small" id="${id}"><option value="">${esc(t('fAll'))}</option>${list.map(v => `<option ${v === cur ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>`;
  const card = tk => { const [k, txt] = taskState(tk); return `<button class="card acc ${accOf(k)} task-card ${k === 'done' ? 'is-done' : k === 'cancel' ? 'is-cancel' : ''}" data-id="${tk.id}"><div class="tc-main"><b>${k === 'done' ? `<span class="done-ic">${ICONS.check}</span>` : k === 'cancel' ? `<span class="done-ic">${ICONS.close}</span>` : ''}${esc(tk.title)}</b>
    <div class="tc-meta">${coName(tk.company_id) ? `<i>${ICONS.users}${esc(coName(tk.company_id))}</i>` : ''}<i class="due-${dueInfo(tk).cls}">${ICONS.calendar}${esc(tk.deadline || tk.status === 'done' ? dueInfo(tk).txt : tk.work_date ? fmtDay(tk.work_date) : dueInfo(tk).txt)}</i>${A.lateTasks && A.lateTasks.has(tk.id) ? `<i class="err">${esc(t('lateBadge'))}</i>` : ''}${tk.district || tk.city_name ? `<i>${ICONS.pin}${esc([tk.district, tk.city_name].filter(Boolean).join(', '))}</i>` : ''}${tk.flyers ? `<i>${ICONS.mail}${esc(fmtN(tk.flyers))}</i>` : ''}<i>${ICONS.users}${(tk.task_workers || []).length}</i></div>
    ${statusPill(k, txt)}</div>${ICONS.chevron}</button>`; };
  const f = A.filter, qn = String(f.q || '').toLowerCase().trim(), list = A.tasks.filter(taskMatches).filter(tk => !qn || (tk.title + ' ' + (tk.city_name || '') + ' ' + (tk.district || '')).toLowerCase().includes(qn)).sort((a, b) => (a.status !== 'open') - (b.status !== 'open'));
  A.tSort = A.tSort || { by:'deadline', dir:'asc' };
  const ps = id => (A.planStat && A.planStat.get(id)) || { n:0, done:0, free:0 };
  const taskTable = rows => tableHtml('tTable', [
    { k:'title', label:t('colOrder'), cls:'tmain', sort:x => x.title.toLowerCase(), cell:x => `<b>${esc(x.title)}</b>${coName(x.company_id) ? `<small class="muted"> · ${esc(coName(x.company_id))}</small>` : ''}<br><small class="muted">${esc([x.district, x.city_name].filter(Boolean).join(', ') || '–')}</small>` },
    { k:'deadline', label:t('colDeadline'), cls:'nowrap', sort:x => x.status === 'done' ? 'z' + (x.deadline || '') : x.deadline || 'y', cell:x => { const d = dueInfo(x); return `<span class="due-${d.cls}">${esc(d.txt)}</span>${A.lateTasks && A.lateTasks.has(x.id) ? `<br><small class="err">${esc(t('lateBadge'))}</small>` : ''}`; } },
    { k:'flyers', label:t('colFlyers'), num:true, sort:x => +x.flyers || 0, cell:x => x.flyers ? fmtN(x.flyers) : '–' },
    { k:'team', label:t('colTeam'), num:true, sort:x => (x.task_workers || []).length, cell:x => String((x.task_workers || []).length) + (ps(x.id).free ? `<br><small class="due-warn">${esc(t('freeN', { n:ps(x.id).free }))}</small>` : '') },
    { k:'progress', label:t('colProgress'), num:true, sort:x => ps(x.id).n ? ps(x.id).done / ps(x.id).n : -1, cell:x => ps(x.id).n ? `${ps(x.id).done} / ${ps(x.id).n}` : '–' },
    { k:'status', label:t('colStatus'), sort:x => taskState(x)[1], cell:x => { const [k, txt] = taskState(x); return statusPill(k, txt); } },
    { k:'act', label:t('colActions'), cls:'act', cell:x => `<button class="icon-btn sm" data-map="${x.id}" title="${esc(t('showOnMap'))}" aria-label="${esc(t('showOnMap') + ': ' + x.title)}">${ICONS.map}</button>` },
  ], rows, A.tSort);
  const nOpen = A.tasks.filter(x => x.status === 'open').length, nLive = A.tasks.filter(taskLive).length, nDone = A.tasks.length - nOpen;
  const nf = ['city', 'district', 'from', 'to'].filter(k => f[k]).length;
  const firmTodo = A.company && A.company.id && !A.company.master && (!firmComplete(A.company) || !avvOk(A.company));
  shell('tasks', `${topbar(t('tasks'), null, `<button class="btn primary small desk-only" id="tNew">${ICONS.plus}${esc(t('createTask'))}</button>`)}
    <div class="pad">
      <div id="helpBox"></div>
      ${firmTodo ? `<button class="warnbox firm-todo" id="firmTodo">${esc(!firmComplete(A.company) ? t('firmMissing') : t('firmAvvMissing'))} ›</button>` : ''}
      <div class="kpis">${[['open', 'k-info', nOpen, t('fOpen')], ['live', 'k-ok', nLive, t('stLive')], ['done', 'k-neutral', nDone, t('fDone')], ['all', 'k-neutral', A.tasks.length, t('fAll')]].map(([k, c, n, l]) => `<button class="kpi ${c} ${f.status === k ? 'on' : ''}" data-st="${f.status === k && k !== 'open' ? 'open' : k}" aria-pressed="${f.status === k}"><b>${n}</b><span>${esc(l)}</span></button>`).join('')}</div>
      <div class="list-bar"><div class="searchbox grow"><span class="sb-ic">${ICONS.search}</span><input id="tQ" class="sb-in" placeholder="${esc(t('tSearchPh'))}" value="${esc(f.q || '')}" aria-label="${esc(t('tSearchPh'))}"></div>${viewSwitch('tasks')}</div>
      <details class="filters" ${nf ? 'open' : ''}><summary>${ICONS.sliders}${esc(t('filter'))}${nf ? `<span class="cnt">${nf}</span>` : ''}</summary><div class="f-body">
        <div class="steppers">${sel('fCity', t('fCity'), opts('city_name'), f.city)}${sel('fDist', t('fDistrict'), opts('district'), f.district)}</div>
        <div class="dfilter"><div><label class="f" for="fFrom">${esc(t('fFrom'))}</label><input class="in small" type="date" id="fFrom" value="${esc(f.from)}"></div><div><label class="f" for="fTo">${esc(t('fTo'))}</label><input class="in small" type="date" id="fTo" value="${esc(f.to)}"></div></div>
        ${nf ? `<button class="link" id="fReset" style="margin-top:8px">${esc(t('reset'))}</button>` : ''}</div></details>
      ${list.length ? (listView('tasks') === 'table' ? taskTable(list) : `<div class="task-grid">${list.map(card).join('')}</div>`) : A.tasks.length ? emptyState(t('noMatch'), 'search') : `${emptyState(t('noOpenTasks'), 'flag')}<button class="btn primary" id="create" style="margin-top:12px">${ICONS.plus}${esc(t('createTask'))}</button>`}
    </div>`, { fab:t('createTask') });
  $('#fab').onclick = () => viewCreate(); if($('#tNew')) $('#tNew').onclick = () => viewCreate();
  if($('#create')) $('#create').onclick = () => viewCreate();
  if($('#firmTodo')) $('#firmTodo').onclick = () => { A.focusFirm = true; adminTab('settings'); };
  // reports of the walkers ("need help"): a box on top while there are any
  loadHelp().then(list => { const box = $('#helpBox'); const n = list.filter(h => h.status === 'open').length + (A.lateTasks ? A.lateTasks.size : 0) + (A.repTasks ? [...A.repTasks.values()].reduce((a, v) => a + v, 0) : 0); if(!box || (!list.length && !n)) return;
    box.innerHTML = `<button class="help-box" id="helpOpen">${ICONS.chat}<span>${esc(t('helpInbox'))}</span>${n ? `<span class="cnt">${esc(t('helpInboxN', { n }))}</span>` : ''}</button>`; $('#helpOpen').onclick = () => viewHelpInbox(); });
  const again = () => viewTasks();
  document.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { f.status = b.dataset.st; again(); });
  $('#fCity').onchange = e => { f.city = e.target.value; again(); }; $('#fDist').onchange = e => { f.district = e.target.value; again(); };
  $('#fFrom').onchange = e => { f.from = e.target.value; again(); }; $('#fTo').onchange = e => { f.to = e.target.value; again(); };
  if($('#fReset')) $('#fReset').onclick = () => { f.city = f.district = f.from = f.to = ''; again(); };
  document.querySelectorAll('.task-card').forEach(b => b.onclick = () => viewTask(b.dataset.id));
  bindViewSwitch('tasks', again); bindTable('tTable', A.tSort, again, id => viewTask(id));
  document.querySelectorAll('[data-map]').forEach(b => b.onclick = e => { e.stopPropagation(); showOnMap({ kind:'task', id:b.dataset.map }); });
  { const q = $('#tQ'); let tm; q.oninput = () => { clearTimeout(tm); tm = setTimeout(() => { f.q = q.value; const pos = q.selectionStart; again(); const q2 = $('#tQ'); if(q2){ q2.focus(); q2.setSelectionRange(pos, pos); } }, 250); }; }
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
  const d = { start:null, place:null, flyers:10000, n:2, nAuto:false, hours:7, quota:2500, days:2, g:null, plan:null, assign:{}, err:null, token:0, must:[], zone:null, drawing:null, drawFor:'must' };
  if(tkE && Array.isArray(tkE.must_areas)) d.must = tkE.must_areas.map(mArea).filter(a => a.p.length > 2);
  if(tkE && Array.isArray(tkE.work_area) && tkE.work_area.length > 2) d.zone = tkE.work_area;
  if(tkE) Object.assign(d, { flyers:tkE.flyers || 5000, hours:+tkE.work_hours || 7, quota:tkE.quota_m30 || 2000, days:tkE.work_days || 2, n:Math.max(1, edit.plans.length), nAuto:false });
  d.side = tkE && Array.isArray(tkE.side_towns) ? tkE.side_towns : [];
  d.autoPicked = !!tkE; // one automatic initial proposal; never override subsequent admin edits
  // time-budget mode ("Maximum Flyer für die Arbeitszeit"): the order remembers it in days[0].budget_h of its plans (no database column)
  { const bh = tkE && (edit.plans || []).map(p => p.days && p.days[0] && +p.days[0].budget_h).find(x => x > 0); const bt = tkE && (edit.plans || []).map(p => p.days && p.days[0] && p.days[0].budget_tol).find(x => x != null); const strategy = tkE && (edit.plans || []).map(p => p.days && p.days[0] && p.days[0].budget_strategy).find(Boolean); const travelMin = tkE && (edit.plans || []).map(p => p.days && p.days[0] && +p.days[0].budget_travel_min).find(x => x > 0); const car=!!(tkE && (edit.plans || []).some(p => p.days && p.days[0] && p.days[0].budget_car)); d.budget = { on:tkE ? !!bh : true, hours:bh || 32, tol:bt != null ? Math.round(+bt * 100) : 5, travelMin:travelMin || null, car, strategy:strategy || (tkE ? 'density' : 'near-first') }; }
  d.budget.radiusKm = tkE ? radiusFromPlans(edit.plans) : DEFAULT_RADIUS_KM;
  // smaller print run (18.11.2026): saved with the order, null = as many as the hours allow
  d.budget.cap = tkE ? ((edit.plans || []).map(p => p.days && p.days[0] && +p.days[0].flyer_cap).find(v => v > 0) || null) : null;
  // The order keeps its transport mode and limits when reopened.
  { const d0 = tkE ? (edit.plans || []).map(p => p.days && p.days[0]).find(x => x && ['drive', 'walk', 'auto'].includes(x.budget_mode)) : null;
    d.budget.mode = tkE ? (d0?.budget_mode ?? null) : 'auto';
    d.budget.driveMin = d0 && d0.budget_mode !== 'walk' ? (d0.drive_min ?? null) : 15;
    if(d0?.budget_mode === 'auto') d.budget.travelMin = d0.auto_travel_min ?? null;
    d.budget.maxFlyers = d0 ? (d0.max_flyers ?? null) : null;
    d.budget.outlierM = d0 && d0.outlier_m != null ? d0.outlier_m : 850; d.budget.outlierPerKm = d0 && d0.outlier_per_km != null ? d0.outlier_per_km : 3;
    d.budget.grid = d0 && d0.delivery_zone && Array.isArray(d0.delivery_zone.runs) ? d0.delivery_zone : null; d.budget.gridFor = d.budget.grid ? 'saved' : null;
    if(!tkE) d.budget.radiusKm = null; }
  // time-first: places picked automatically by an older version but never reached by the saved routes are not part of the
  // order (they were saved without a ride time and blocked re-planning); manual places and places with routes stay
  if(tkE && d.budget.on && d.budget.strategy === 'near-first'){
    const used = new Set((edit.plans || []).flatMap(p => (p.days || []).flatMap(x => (x.parts || []).map(z => z.place))));
    d.side = d.side.filter(c => !c.auto || used.has(c.name));
  }
  d.split = tkE ? (tkE.split || null) : 'even';
  d.exact = true; d.mainAll = false; d.cores = !!(tkE && tkE.cores); d.together = !!(tkE && tkE.together); d.first = (tkE && tkE.first_place) || null;   // the number of flyers the admin typed is what gets planned; the economical amount is only offered ("Effizienter planen"); whole main town on request   // new orders: total flyers shared evenly over all places; old orders keep their numbers
  d.travel = tkE ? (tkE.travel || (tkE.bike ? 'bike' : 'bus')) : 'zones'; d.bike = d.travel !== 'bus';   // new orders: every place its own zone, no rides between places   // how the places of the order are reached   // far places of this order (own start, own day, reached by bus / train)
  // the start address (also typed in step 1 under "Hauptstadt"); the main town comes from it
  const pickAddr = (c, q) => { saved = keep(); d.place = c; d.mainCity = null; const txt = c.name + (c.sub ? ', ' + c.sub : ''); if(q) q.value = txt; const top = $('#cSearch'); if(top) top.value = txt; setStart(c.lat, c.lng); };
  const mainCity = () => (d.place && (d.place.city || (d.place.kind === 'city' || d.place.kind === 'town' || d.place.kind === 'village' ? d.place.name : ''))) || d.mainCity || (tkE && tkE.city_name) || '';
  const sf = searchField('cSearch', t('searchAddr'), pickAddr, { near:() => d.start ? [d.start.lat, d.start.lng] : null });
  // studio of the client as start address (only firms with a studio list see the button); the order title is filled if empty
  const bindStudio = () => { const b = $('#cStudio'); if(b) b.onclick = () => openStudioPicker((c, s) => {
    const ti = $('#cTitle'); if(ti && !ti.value.trim()) ti.value = 'FITYES ' + s.name;
    pickAddr(c, $('#cAddr'));
  }); };
  loadStudios().then(() => { const sl = $('#cStudioSlot'); if(sl && !sl.firstChild){ sl.innerHTML = studioBtnHtml(); bindStudio(); } });
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
  // highlight of a suggested place (list <-> map): own pane BELOW the routes (zIndex 395 < overlayPane 400), no pointer events, so it
  // neither covers a route nor takes a click/drag from the map. It is only a picture; d.side is never touched by it.
  m.createPane('sugPane'); m.getPane('sugPane').style.zIndex = 395; m.getPane('sugPane').style.pointerEvents = 'none';
  const sugLayer = L.layerGroup().addTo(m), sugRender = L.canvas({ pane:'sugPane' }), HL = { color:'#D946EF', weight:2.5, fillColor:'#D946EF', fillOpacity:.3, interactive:false, pane:'sugPane', renderer:sugRender };
  const mapPad = () => { const wide = innerWidth >= 900; return { paddingTopLeft:[wide ? 480 : 24, 80], paddingBottomRight:[24, wide ? 24 : Math.round(innerHeight * .5)] }; };
  const sugHl = createHighlighter({
    show:(sh, it) => { sugLayer.clearLayers();
      if(sh.kind === 'cells') sh.rects.forEach(r => L.polygon(r, HL).addTo(sugLayer));   // census cells of the area: approximate, not an administrative border
      else L.circleMarker([sh.lat, sh.lng], { ...HL, radius:12, fillOpacity:.45 }).addTo(sugLayer); },
    hide:() => sugLayer.clearLayers(),
    focus:(sh, it) => { try{ if(sh.kind === 'cells'){ const b = L.latLngBounds(sh.rects.flat()); m.flyToBounds(b.pad(.5), { ...mapPad(), maxZoom:15, duration:.8 }); } else m.flyTo([sh.lat, sh.lng], Math.max(m.getZoom(), 14), { duration:.8 }); }catch{} },
  });
  // mandatory areas: dashed orange outlines; while drawing, the corners tapped so far
  const MUST_COLOR = '#EA580C', ZONE_COLOR = '#7C3AED';
  const tip = (pg, txt, cls) => L.marker(pg.getBounds().getCenter(), { icon:L.divIcon({ className:'', html:`<span class="must-tip${cls ? ' ' + cls : ''}">${esc(txt)}</span>`, iconSize:null }), interactive:false, keyboard:false }).addTo(mustLayer);
  const drawMust = () => {
    mustLayer.clearLayers();
    if(d.zone) tip(L.polygon(d.zone, { color:ZONE_COLOR, weight:3, dashArray:'10 6', fillOpacity:.04, interactive:false }).addTo(mustLayer), t('zoneTitle'), 'zone-tip');
    // even split: the numbers come from the last plan (d.side / d.must keep 0 until the order is saved)
    const share = (name, v) => { const x = name && d.plan && d.plan.split && d.plan.split.find(y => y.name === name); return x ? x.flyers : v; };
    d.side.forEach(x => { if(x.p && x.p.length > 2){ const n = share(x.name, x.flyers); tip(L.polygon(x.p, { color:'#0D9488', weight:3, dashArray:'4 6', fillOpacity:.08, interactive:false }).addTo(mustLayer), x.name + (n ? ' · ' + fmtN(n) : ''), 'zone-tip'); } });
    d.must.forEach((a, k) => { const n = share(a.name, a.n); tip(L.polygon(a.p, { color:MUST_COLOR, weight:3, dashArray:'8 6', fillOpacity:.12, interactive:false }).addTo(mustLayer), mName(a, k) + (n ? ' · ' + fmtN(n) : '')); });
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
    const ht = $('#cDrawT'); if(ht) ht.textContent = t(d.drawFor === 'zone' ? 'zoneDrawHint' : d.drawFor === 'side' ? 'sideDrawHint' : 'mustDrawHint');
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
    const nm = t('sideDrawnName', { n:d.must.length + d.side.length + 1 });
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
  const createSheet = $('#cSheet');
  const alive = () => createSheet.isConnected;
  const sheet = html => { const el = $('#cSheet'); if(el) el.innerHTML = html; };
  function progress(tok, mode = ''){
    const started = Date.now();
    let stage = 'calculating';
    let count = '';
    const show = () => {
      if(tok !== d.token || !alive()){ clearInterval(timer); return; }
      d.busy = true;
      d.status = [t(stage), count, mode, t('planElapsed', { n:Math.floor((Date.now() - started) / 1000) })].filter(Boolean).join(' · ');
      const status = $('#cBusy');
      if(status){ status.hidden = false; status.textContent = d.status; }
      const total = $('#cPlanHours');
      if(total && !total.hidden) total.hidden = true;
      const next = $('#cNext') || $('#cSave');
      if(next && d.step >= 3) next.disabled = true;
    };
    const timer = setInterval(show, 1000);
    show();
    return {
      stage(value){
        const [key, done, total] = value.split('|');
        stage = key;
        count = total ? done + '/' + total : '';
        show();
      },
      stop(){ clearInterval(timer); },
    };
  }
  const startArr = () => [d.start.lat, d.start.lng];
  const capOn = () => d.budget.on && d.budget.strategy === 'near-first' && d.budget.cap > 0;
  // census places around the start: which village each mailbox belongs to (for cutting place by place); named for the table
  function loadCapPlaces(){
    if(!d.start) return Promise.resolve([]); const key = startArr().join(',') + ':' + d.budget.radiusKm;
    if(d.capFor === key) return d.capJob;
    d.capFor = key; d.capPlaces = null;
    d.capJob = censusPlaces(d.start.lat, d.start.lng, ((d.budget.radiusKm || 10) + 3) * 1000, { minH:MIN_HH }).then(list => { if(d.capFor === key) d.capPlaces = list; nameCapPlaces(key); return list; }).catch(() => { d.capPlaces = []; return []; });
    return d.capJob;
  }
  async function nameCapPlaces(key){
    for(const x of d.capPlaces || []){ if(d.capFor !== key || !alive()) return; if(d.sugNames.has(x.id)) continue;
      try{ const r = await reversePlace(x.lat, x.lng), ps = r ? r.split(', ') : []; const n = ps.length > 1 && x.households < 5000 ? ps[0] + ' (' + ps[1] + ')' : ps[ps.length - 1]; if(n){ d.sugNames.set(x.id, n); if(d.plan?.budget?.cap?.cut) renderSheet(); } }catch{} }
  }
  const driveOn = () => d.budget.on && d.budget.strategy === 'near-first' && d.budget.mode === 'drive';
  const autoOn = () => d.budget.on && d.budget.strategy === 'near-first' && d.budget.mode === 'auto';
  const roadModeOn = () => driveOn() || autoOn();
  const walkOn = () => d.budget.on && d.budget.strategy === 'near-first' && d.budget.mode === 'walk';
  const circleKm = () => d.budget.on && d.budget.strategy === 'near-first' && d.travel === 'zones' && !d.mainAll && !roadModeOn() && !walkOn() ? d.budget.radiusKm : null;
  const drawCircle = () => circleKm() != null && d.start ? L.circle(startArr(), { radius:circleKm()*1000, color:css('--brand'), weight:2, fillOpacity:.04, interactive:false }).addTo(zoneLayer) : null;
  const outsideManual = () => d.start && (manualOutsideCircle(startArr(), circleKm(), d.side, d.must, d.zone) || !!d.plan?.budget?.manualOutside);
  const errText2 = e => /abort|overpass|fetch/i.test((e && e.message) || '') ? t('mapSlow') : ((e && e.message) || 'net');
  async function setStart(lat, lng, fromClick){
    const tok = ++d.token; d.start = { lat, lng }; d.sugT = null; sugFlow.reset(); sugHl.clear(); d.keepView = !!fromClick && circleKm() == null;
    if(d.budget.gridFor === 'saved') d.budget.gridFor = d.start ? d.start.lat.toFixed(5) + ',' + d.start.lng.toFixed(5) : null;   // reopened order: the saved area belongs to its start   // circular mode initially frames its whole boundary
    d.pick = false; updPick();
    d.loaded = false; d.busy = false; d.plan = null; d.err = null; d.assign = {};
    zoneLayer.clearLayers(); planLayer.clearLayers();
    L.marker([lat, lng], { icon:dot('pin-start', 26) }).addTo(zoneLayer); const boundary = drawCircle(); if(!d.keepView){ if(boundary) m.fitBounds(boundary.getBounds(), { ...mapPad(), animate:false }); else m.setView([lat, lng], 15, { animate:false }); }
    d.loading = false;
    if(d.step < 2){ renderSheet(); return; }   // nothing is planned until the first step (towns, areas …) is filled in
    return loadArea(tok);
  }
  async function loadArea(tok){
    if(!d.start || d.loading) return; d.loading = true;
    tok = tok || ++d.token; const lat = d.start.lat, lng = d.start.lng;
    const pr = progress(tok); pr.stage('loadingArea');
    for(let attempt = 0; attempt < 2 && !d.loaded; attempt++){   // public map servers are sometimes busy: one automatic retry
      try{ const r = await planEngine().run('load', { start:[lat, lng], flyers:d.flyers, must:d.must, zone:d.zone }, pr.stage); if(tok !== d.token){ d.loading = false; return pr.stop(); } if(!r || !r.skipped) d.loaded = true; }
      catch(e){ if(tok !== d.token){ d.loading = false; return pr.stop(); } d.err = errText2(e); if(attempt === 0){ pr.stage('retrying'); await new Promise(r => setTimeout(r, 4000)); if(tok !== d.token){ d.loading = false; pr.stop(); return; } } }
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
    if(capOn() && !d.capPlaces) await loadCapPlaces();
    const mode = autoOn() ? t('budgetModeAuto') : walkOn() ? t('budgetModeWalk') : driveOn() ? t('budgetModeCar') : '';
    const tok = ++d.token, pr = progress(tok, mode);
    let res = null;
    try{ res = await planEngine().run('plan', { start:startArr(), flyers:d.flyers, n:d.n, days:d.days, hours:d.hours, quota:Math.max(200, Math.round(+saved.quota || NEW_QUOTA)), bike:d.bike, travel:d.travel, split:d.split, exact:d.exact, mainAll:d.mainAll, cores:d.cores && (d.travel === 'car' || d.travel === 'zones'), mainName:mainCity() || '', together:d.cores && d.travel === 'car' && d.together, first:d.cores && d.travel === 'car' ? d.first : null, near:d.side.length > 0 && d.side.every(x => x.auto), budget:d.budget && d.budget.on && d.travel === 'zones' ? { hours:+d.budget.hours || 32, tolerance:(+d.budget.tol >= 0 ? +d.budget.tol : 5) / 100, strategy:d.budget.strategy, travelMin:d.budget.travelMin, car:d.budget.car, radiusKm:circleKm(), ...(walkOn() ? { mode:'walk', maxFlyers:d.budget.maxFlyers } : {}), ...(roadModeOn() ? { mode:d.budget.mode, placeLabel:t('sugUnnamed', { km:'{km}' }), driveMin:d.budget.driveMin, maxFlyers:d.budget.maxFlyers, outlierM:d.budget.outlierM, outlierPerKm:d.budget.outlierPerKm, ...(d.budget.grid && d.budget.gridFor === (d.start ? d.start.lat.toFixed(5) + ',' + d.start.lng.toFixed(5) : '') ? { _grid:d.budget.grid } : {}) } : {}), ...(capOn() ? { cap:{ target:d.budget.cap, places:(d.capPlaces || []).map(x => ({ id:x.id, lat:x.lat, lng:x.lng, cells:x.cells })) } } : {}) } : null, must:d.must, zone:d.zone, side:d.side.map(x => ({ name:x.name, lat:x.lat, lng:x.lng, flyers:x.flyers, zone:x.p && x.p.length > 2 ? x.p : null, all:!!x.all, ...(x.cid ? { cid:x.cid } : {}), auto:!!x.auto })) }, pr.stage); }
    catch(e){ pr.stop(); if(tok !== d.token || !alive()) return; d.err = errText2(e); d.busy = false; toast(t('streetsFail', { e:d.err })); renderSheet(); return; }
    pr.stop();
    if(tok !== d.token || !alive() || !res || res.skipped) return;
    d.plan = res.plan; d.sug = res.sug; d.streetM = res.street_m; d.err = null; d.busy = false;
    if(res.plan && res.plan.budget && res.plan.budget.driveZone && d.start){ d.budget.grid = res.plan.budget.driveZone; d.budget.gridFor = d.start.lat.toFixed(5) + ',' + d.start.lng.toFixed(5); }   // same area on the next recalculation
    if(d.plan.cores) d.days = Math.max(1, ...d.plan.routes.map(r => (r.days || []).length));   // village cores: the days follow from the tour
    if(tkE && !d.prefilled){ d.prefilled = true; edit.plans.forEach(p => { if(p.worker_id && p.idx < d.plan.routes.length) d.assign[p.idx] = p.worker_id; }); }
    draw(); renderSheet();
    resolveDriveNames(d.plan, tok).catch(() => {});
    // Phase 1 (16.11.2026): never add places by itself – too few mailboxes only leads to suggestions the admin may add
    if(!tkE && !d.zone && !d.mainAll) findSuggestions(); // browse nearby towns even when the flyer target is covered
  }
  // Suggestions for more places (census, Phase 2A) – shown in step "Route", added only by the admin ("Ort hinzufügen").
  // Kept apart from d.side (the confirmed places) in d.sugT. The census window around the ORIGINAL start is loaded once per
  // (start, max distance); adding or removing a place only ranks the same list anew (expand.js: suggestionFlow). Results of an
  // older start / set of places / radius are dropped there. Names come one by one from the geocoder and are remembered.
  d.maxKm = d.maxKm || MAX_KM; d.sugNames = d.sugNames || new Map();
  const sugCtx = () => ({ start:d.start, side:d.side, maxKm:circleKm() == null ? d.maxKm : Math.min(d.maxKm, circleKm()), missing:d.plan ? coverage(d.flyers, d.plan.mailboxes).missing : 0 });
  const sugKey = () => sugKeyOf(sugCtx());
  const nameKey = x => x.id || x.lat + ',' + x.lng;
  const sugFlow = suggestionFlow({
    load:(st, km) => censusPlaces(st.lat, st.lng, (km + 3) * 1000, { minH:MIN_HH }),   // +3 km margin: places at the edge are whole
    onUpdate:st => {
      if(!alive()) return;
      d.sugT = st;
      if(st.list) st.list.forEach(x => { if(!x.name && d.sugNames.has(nameKey(x))) x.name = d.sugNames.get(nameKey(x)); });
      // time-first plans by hours, not by a flyer target: nothing to top up with nearby places (the admin adds them himself)
      if(!st.loading && !st.failed && !d.autoPicked && !tkE && !d.side.length && !d.zone && d.plan && !(d.budget.on && d.budget.strategy === 'near-first')){
        d.autoPicked = true; // do not put removed places back; the admin controls the selection from here on
        const picks = chooseNearbyPlaces(st.list, coverage(d.flyers, d.plan.mailboxes).missing, { maxPlaces:8, maxKm:sugCtx().maxKm });
        for(const x of picks) d.side = addSuggestion(d.side, x, x.name || t('sugUnnamed', { km:String(x.km).replace('.', ',') }));
        if(picks.length){ sugFlow.invalidate(); d.sugT = null; d.dirty = true; Promise.resolve().then(() => { if(alive()){ recompute(); renamePicked(picks); } }); }
      }
      renderSheet(); nameShown(st);
    },
  });
  // "Lehen (Weidenberg)": a district of a town is named as such; a city (≥ 5.000 households) as the city. One request at a time
  // (the free geocoder refuses many at once); the list is usable before the names arrive; stops when the list is replaced.
  d.sugTries = d.sugTries || new Map();   // lookups per place (max 2 in total, see sugmap.js nameShown): an empty geocoder answer cannot loop
  const geoName = async sg => { const r = await reversePlace(sg.lat, sg.lng), ps = r ? r.split(', ') : []; return ps.length > 1 && sg.households < 5000 ? ps[0] + ' (' + ps[1] + ')' : ps[ps.length - 1] || null; };
  const driveNameRequests = new Map();
  async function resolveDriveNames(plan, token){
    const villages = plan.budget?.drive?.villages;
    if(!villages?.length) return;
    const sheetAtLookup = $('#cSheet');
    const names = new Map();
    const used = new Set(plan.split.map(x => x.name));
    for(const village of villages){
      if(!sheetAtLookup?.isConnected || token !== d.token) return;
      const key = village.cid || nameKey(village);
      const cached = d.sugNames.get(key);
      if(!cached && !driveNameRequests.has(key)){
        driveNameRequests.set(key, geoName(village).catch(() => null).then(name => {
          if(name) d.sugNames.set(key, name);
          driveNameRequests.delete(key);
          return name;
        }));
      }
      const name = cached || await driveNameRequests.get(key);
      if(!name) continue;
      let unique = name;
      for(let i = 2; used.has(unique); i++) unique = name + ' (' + i + ')';
      used.add(unique);
      names.set(village.name, unique);
    }
    if(!names.size || !sheetAtLookup?.isConnected || token !== d.token || d.plan !== plan) return;
    const rename = name => names.get(name) || name;
    const renameList = name => name?.split(' + ').map(rename).join(' + ');
    for(const route of plan.routes){
      route.place = renameList(route.place);
      for(const part of route.parts) part.place = rename(part.place);
      for(const day of route.days) day.place = renameList(day.place);
    }
    for(const jump of plan.budget.travel.jumps){
      jump.from = rename(jump.from);
      jump.to = rename(jump.to);
    }
    for(const item of [...villages, ...plan.split]) item.name = rename(item.name);
    draw();
    renderSheet();
  }
  async function renamePicked(picks){
    // Geocoding is cosmetic; the routes keep working if the free service is offline.
    let changed = false;
    for(const sg of picks){
      const x = d.side.find(z => z.cid === sg.id && z.auto); if(!x || !alive()) continue;
      let name = d.sugNames.get(sg.id);
      if(!name){ try{ name = await geoName(sg); }catch{} }
      if(!alive()) return;
      const current = d.side.find(z => z.cid === sg.id && z.auto);
      if(current && name){ d.sugNames.set(sg.id, name); const used = new Set(d.side.filter(z => z !== current).map(z => z.name));
        let unique = name; for(let j = 2; used.has(unique); j++) unique = name + ' (' + j + ')';
        if(current.name !== unique){ current.name = unique; changed = true; renderSheet(); }
      }
    }
    if(changed && alive()) recompute();
  }
  const nameShown = st => nameShownOf(st, { resolve:geoName, cache:d.sugNames, tries:d.sugTries, isCurrent:s => alive() && d.sugT === s, onName:() => {
    let changed = false;
    d.side.forEach(x => { const name = x.cid && d.sugNames.get(x.cid); if(x.auto && name && x.name !== name){ x.name = name; changed = true; } });
    renderSheet();
    if(changed){ clearTimeout(d.nameTimer); d.nameTimer = setTimeout(() => { if(alive()) recompute(); }, 1000); }
  } });
  function findSuggestions(){ if(!d.start || !d.plan) return; sugFlow.refresh(sugCtx()).catch(() => {}); }
  function draw(){
    zoneLayer.clearLayers(); planLayer.clearLayers();
    var z = drawCircle();
    if(!z && d.plan.zone.length > 2) z = L.polygon(d.plan.zone, { color:css('--brand'), weight:2, fillOpacity:.06, interactive:false }).addTo(zoneLayer);
    L.marker(startArr(), { icon:dot('pin-start', 26) }).addTo(zoneLayer); drawMust();
    (d.plan.dropped || []).forEach(l => L.polyline(l, { color:'#94A3B8', weight:4, opacity:.9, dashArray:'4 6', interactive:false, className:'dropped-street' }).addTo(planLayer));   // taken out for the smaller print run
    d.plan.routes.forEach((r, i) => { if(r.path.length > 1) L.polyline(Planner.pathRuns(r.path), { color:Planner.COLORS[(r.w != null ? r.w : i) % 10], weight:4, opacity:.85 }).addTo(planLayer); });
    if(d.plan.budget && d.plan.budget.driveZone && d.plan.budget.drive){   // reached area: fully covered rings darker, the next ring lighter
      const g = d.plan.budget.driveZone, v = d.plan.budget.drive;
      L.polygon(gridRectsUpTo(g, v.next ? v.next.min : v.full_min), { stroke:false, fillColor:css('--brand'), fillOpacity:.06, interactive:false, className:'drive-next' }).addTo(planLayer);
      L.polygon(gridRectsUpTo(g, v.full_min), { stroke:false, fillColor:css('--brand'), fillOpacity:.1, interactive:false, className:'drive-full' }).addTo(planLayer);
    }
    d.plan.routes.forEach(r => drawJumps(planLayer, r.path, d.travel, d.budget && d.budget.on && +d.budget.travelMin > 0 ? +d.budget.travelMin : rideMinOf([r]), r.jumps || null));
    (d.plan.cores || []).forEach(c => L.marker(c.c, { icon:L.divIcon({ className:'', html:`<span class="must-tip zone-tip">${esc(c.name + ' · ' + fmtN(c.mb))}</span>`, iconSize:null }), interactive:false, keyboard:false }).addTo(planLayer));
    if(z && !d.keepView) { const bounds = z.getBounds(); d.plan.routes.forEach(r => r.path.forEach(p => bounds.extend([p[0],p[1]]))); const wide = innerWidth >= 900; m.fitBounds(bounds, { paddingTopLeft:[wide ? 480 : 24, 80], paddingBottomRight:[24, wide ? 24 : Math.round(innerHeight * .5)], maxZoom:17, animate:false }); }
  }
  const num = (id, def) => { const v = parseFloat(($(id) || {}).value); return isFinite(v) ? v : def; };
  // values typed in any step survive re-renders and step changes (only fields that are on screen are read)
  function saveDraft(){
    if(tkE || !d.start) return;
    try{ localStorage.setItem(DRAFT_KEY, JSON.stringify({ at:Date.now(), saved, d:{ start:d.start, place:d.place, must:d.must, side:d.side, flyers:d.flyers, n:d.n, hours:d.hours, days:d.days, bike:d.bike, travel:d.travel, split:d.split, zone:d.zone, autoPicked:d.autoPicked, mainCity:d.mainCity, exact:d.exact, mainAll:d.mainAll, cores:d.cores, together:d.together, first:d.first, budget:d.budget } })); }catch{}
  }
  async function restoreDraft(){
    const x = readDraft(); if(!x || !x.d || !x.d.start) return;
    const name = (x.saved && x.saved.title) || (x.d.place && x.d.place.name) || '—';
    if(!await confirmBox(t('draftQ'), t('draftText', { name }), t('draftYes'))){ clearDraft(); return; }
    if(!alive()) return;
    Object.assign(d, x.d); d.autoPicked = true; if(!x.d.travel) d.travel = x.d.bike ? 'bike' : 'bus'; d.bike = d.travel !== 'bus'; saved = { ...saved, ...(x.saved || {}) };
    const qi = $('#cSearch'); if(qi && d.place) qi.value = d.place.name + (d.place.sub ? ', ' + d.place.sub : '');
    drawMust(); setStart(d.start.lat, d.start.lng);
  }
  function keep(){
    const k = { ...saved }, v = id => $(id) ? $(id).value : undefined;
    if(v('#cTitle') !== undefined) k.title = v('#cTitle');
    if(v('#cDate') !== undefined) k.date = v('#cDate');
    if(v('#cDeadline') !== undefined) k.deadline = v('#cDeadline');
    if(v('#cNotes') !== undefined) k.notes = v('#cNotes');
    if(v('#cQuota') !== undefined) k.quota = v('#cQuota');
    if($('#cNoQ')) k.noQuota = $('#cNoQ').checked;
    return k;
  }
  function restore(k){ if($('#cTitle')) $('#cTitle').value = k.title || ''; if($('#cDate')) $('#cDate').value = k.date || ''; if($('#cDeadline')) $('#cDeadline').value = k.deadline || ''; if($('#cNotes')) $('#cNotes').value = k.notes || ''; if($('#cQuota')) $('#cQuota').value = k.quota; }
  let saved = tkE ? { title:tkE.title, date:tkE.work_date ? String(tkE.work_date).slice(0, 10) : '', deadline:tkE.deadline ? String(tkE.deadline).slice(0, 10) : '', notes:tkE.notes || '', quota:tkE.quota_m30 || 2000, noQuota:!!tkE.no_quota } : { title:'', date:'', deadline:plusDays(isoDay(new Date()), 3), notes:'', quota:2500 };
  // five steps on top of the live map: 1 start · 2 route · 3 time · 4 workers · 5 review. Planning keeps running underneath.
  const STEPS = ['wzStart', 'wzTime', 'wzRoute', 'wzTeam', 'wzReview'];   // the time comes before the route: the deadline decides how many days the plan has
  d.step = tkE ? 3 : 1;
  if(saved.deadline) d.days = workDaysTo(saved.deadline);
  const canReach = k => k === 1 || (!!d.start && (k <= 3 || (!!d.plan && !d.busy)));
  const goStep = k => { if(!canReach(k)) return; saved = keep(); d.step = k; const sh = $('#cSheet'); if(sh && k >= 2) sh.classList.add('tall'); renderSheet();
    if(k >= 2 && d.start){ if(!d.loaded) loadArea(); else if(!d.busy && (!d.plan || d.dirty)) recompute(); } };
  function renderSheet(){
    if(!alive()) return;
    if($('#cWz')) saved = keep();
    saveDraft();
    const sc = d.step === d.lastStep ? (($('#cSheetContent') || {}).scrollTop || 0) : 0; d.lastStep = d.step;
    const p = d.plan, title = saved.title || (d.place ? d.place.name : '');
    // a place's share of the flyers and how many mailboxes it has (from the last plan); button: take all of them
    const spOf = name => name && p && p.split && p.split.find(y => y.name === name);
    const fixedMb = p && p.split ? p.split.filter(x => x.all).reduce((a, x) => a + (x.cap || 0), 0) : 0;
    const spText = name => { const x = spOf(name); return x ? ' · ' + esc(x.cap != null ? t('shareOfMb', { n:fmtN(x.flyers), mb:fmtN(x.cap) }) : fmtN(x.flyers)) : ''; };
    // chosen by hand only; before the first calculation without the number
    const allBtn = (name, on, kind, k) => { const x = spOf(name); if(d.cores && d.travel === 'car') return ''; if(!on && x && x.cap && x.flyers >= x.cap) return '';   // already gets all of them: no button
      return `<button class="all-btn${on ? ' on' : ''}" data-all="${kind}:${k}" title="${esc(t(on ? 'allMbOffHint' : 'allMbHint'))}">${on ? '✓ ' + esc(t('allMbOn')) : esc(x && x.cap ? t('allMbBtn', { n:fmtN(x.cap) }) : t('allMbPlain'))}</button>`; };
    // flyers this plan really hands out: whole town or economical amount = the mailboxes of the plan, otherwise the number typed
    const effFlyers = p && (p.budget || d.mainAll || (p.eco && !d.exact) || (p.cores && p.mailboxes < d.flyers)) ? Math.round(p.mailboxes) : d.flyers;
    if(!saved.title && title) saved.title = title;
    const cap = p ? Planner.capacity(p.zones ? (p.per_worker || []).map((m, k) => ({ idx:k, minutes:m })) : p.routes, effFlyers, { hoursPerDay:d.hours, days:d.days }) : null;   // suggestion from what is really handed out (not 8 450 of an area with 3 348)
    const totMin = p ? p.routes.reduce((s, r) => s + (r.minutes || 0), 0) : 0, oneDay = p && totMin / 60 <= d.hours && (d.n > 1 || d.days > 1);   // all of it fits into one working day of one person
    const needDays = p && p.cores ? d.days : cap ? Math.min(d.days, Math.max(1, Math.ceil(cap.slowest / d.hours - 0.05))) : d.days;   // tour: the days follow from the tour itself
    const km = p ? fmtDist(p.routes.reduce((s, r) => s + r.length_m, 0)) : '';
    const rc = (r, i) => Planner.COLORS[(r && r.w != null ? r.w : i) % 10];   // zones: one colour per person
    // zones (one route per place and person): one row per person – the places, the hours, one choice of who walks all of them
    const personRows = withSelect => p ? (p.per_worker || []).map((min, w) => { const rs = p.routes.filter(r => r.w === w); if(!rs.length) return '';
      const mb = rs.reduce((a, r) => a + (r.mailboxes || 0), 0), ln = rs.reduce((a, r) => a + (r.length_m || 0), 0), i0 = p.routes.indexOf(rs[0]);
      return `<div class="route-row"><span class="swatch" style="background:${Planner.COLORS[w % 10]}"></span><div class="grow"><b>${esc(t('personN', { n:w + 1 }))} <span class="muted">· ${esc(t('daysN', { n:Math.max(1, Math.ceil(min / 60 / d.hours - 0.05)) }))}</span></b><span>${esc(t('routeLine', { km:fmtDist(ln), h:fmtHm(min), mb:fmtN(mb) }))}</span>
        <span class="small muted">${esc(rs.flatMap(r => r.parts ? r.parts.map(x => (x.place || mainCity() || t('mainCityShort')) + (x.part > 1 || r.parts.filter(z => z.place === x.place).length > 1 ? ' ' + x.part : '') + ' ' + fmtN(x.mailboxes)) : [(r.place || mainCity() || t('mainCityShort')) + ' ' + fmtN(r.mailboxes)]).join(' · '))}</span>
        ${withSelect ? `<select class="in small" data-wsel="${w}" aria-label="${esc(t('personN', { n:w + 1 }))}">${workerOptions(d.start.lat, d.start.lng, d.assign[i0])}</select>` : ''}</div></div>`; }).join('') : '';
    const routeRow = (r, i, withSelect) => `<div class="route-row"><span class="swatch" style="background:${rc(r, i)}"></span>
        <div class="grow"><b>${esc(r.place != null && r.w != null ? (r.place || mainCity()) + ' · ' + t('personN', { n:r.w + 1 }) : t('planRoute', { n:i + 1 }))} <span class="muted">· ${esc(t('daysN', { n:r.days && r.days.length > 1 ? r.days.length : Math.max(1, Math.ceil(r.minutes / 60 / d.hours)) }))}</span></b><span>${esc(t('routeLine', { km:fmtDist(r.length_m), h:fmtHm(r.minutes), mb:fmtN(r.mailboxes) }))}</span>
        ${dayLines(r.days, rc(r, i))}
        ${withSelect ? `<select class="in small" data-r="${i}" aria-label="${esc(t('planRoute', { n:i + 1 }))}">${workerOptions(d.start.lat, d.start.lng, d.assign[i])}</select>` : ''}</div></div>`;
    if(p && !zensusOfPlan.has(p)){ zensusOfPlan.set(p, ''); zensusCompare(p.routes.flatMap(r => r.boxes || [])).then(c => { const h = zensusHtml(c); if(!h) return; zensusOfPlan.set(p, esc(t('zLabel')) + ': ' + h); const el = $('#cZen'); if(el && d.plan === p) el.innerHTML = zensusOfPlan.get(p); }).catch(() => {}); }
    // what the plan covers: wanted flyers, estimated mailboxes, what is missing; confirmed places; suggestions to add
    const covShown = () => p && !d.mainAll && !(p.eco && !d.exact) && !p.cores;
    // Uniform selected-place rows for both the start and route steps (fixed right-hand remove control).
    // Counts shown are estimated; changing one fixes its target and replans the remaining flyers.
    const chosenRows = (noRoute = () => false) => d.side.length ? `<div class="chosen-places">${d.side.map((x,k) => {
      const assigned = p && p.split && p.split.find(z => z.name === x.name);
      const count = Math.round(x.auto && assigned ? assigned.flyers : (+x.flyers || 0));
      const dist = t('covKm', { km:String(x.km != null ? x.km : '–').replace('.', ',') });
      return `<div class="chosen-row${noRoute(x) ? ' no-route' : ''}" title="${esc(x.name)}">
        <div class="chosen-info"><b>${esc(x.name)}</b><span>${esc(dist)}${noRoute(x) ? ' ⚠' : ''}</span></div>
        <label class="chosen-qty"><span>${esc(t('flyersCount'))}</span><input type="number" min="30" max="100000" step="10" data-scnt="${k}" value="${Math.max(30, count)}" aria-label="${esc(t('flyersCount') + ': ' + x.name)}"></label>
        <button class="chosen-remove" type="button" data-srm="${k}" title="${esc(t('del') + ': ' + x.name)}" aria-label="${esc(t('del') + ': ' + x.name)}">✕</button>
      </div>`; }).join('')}</div>` : '';
    const covBlock = () => {
      if(!covShown()) return '';
      const c = coverage(d.flyers, p.mailboxes), apart = placesApart(d.start, d.side);
      const noRoute = x => !!(p.zones && p.split && p.split.some(sp => sp.name === x.name) && !(p.routes || []).some(r => r.place === x.name || (r.parts || []).some(z => z.place === x.name)));   // the planner skips a place with < 150 flyers ("not worth the trip"): no route, no change of the numbers
      const sideList = d.side.length ? `<div class="cov-side"><b>${esc(t('covChosen'))}</b>${chosenRows(noRoute)}${d.side.some(noRoute) ? `<p class="small warn cov-noroute">${esc(t('sideNoRoute'))}</p>` : ''}</div>` : '';
      const sg = d.sugT && d.sugT.key === sugKey() ? d.sugT : null;
      const f1 = v => String(v).replace('.', ',');
      const sugRow = (x, i) => `<div class="sug-row" data-srow="${i}"><div class="grow"><button class="sug-name" data-sfocus="${i}" title="${esc(t('sugFocusT'))}" aria-label="${esc(t('sugFocusT') + ': ' + (x.name || t('sugUnnamed', { km:f1(x.km) })))}"><b>${esc(x.name || t('sugUnnamed', { km:f1(x.km) }))}</b></button>
            <span class="small muted">${esc(t('sugLine', { hh:fmtN(x.households), km:f1(x.km) }))}</span>
            <span class="small muted">${esc(t(x.adjacent ? 'sugGapAdj' : 'sugGap', { km:f1(x.gapKm), to:x.gapTo || t('sugGapStart') }))}</span>
            <span class="small sug-not">${esc(t('sugNotYet'))}${x.small ? ' · ' + esc(t('sugSmall')) : ''}</span></div><button class="btn ghost small" data-sadd="${i}">${ICONS.plus}<span>${esc(t('sugAdd'))}</span></button></div>`;
      const sugList = !tkE && !d.zone ? `<div class="cov-sug"><h4>${ICONS.pin}${esc(t('sugTitle'))}</h4>
          <label class="small muted sug-km">${esc(t('sugMaxKm'))} <select id="sugKm" aria-label="${esc(t('sugMaxKm'))}">${[5, 10, 15, 20, 30].map(k => `<option value="${k}"${k === d.maxKm ? ' selected' : ''}>${k} km</option>`).join('')}</select></label>
          ${!sg || sg.loading ? `<p class="small muted">${esc(t('sugLoading'))}</p>` : sg.failed ? `<p class="small err">${esc(t('sugFailed'))}</p>` : !sg.list.length ? `<p class="small muted">${esc(t('sugNone', { km:d.maxKm }))}</p>`
          : sg.list.slice(0, sg.shown).map(sugRow).join('') + (sg.shown < sg.list.length ? `<button class="btn ghost small" id="sugMore">${esc(t('sugMore', { n:sg.list.length - sg.shown }))}</button>` : '')
            + (sg.hh < c.missing ? `<p class="small warn">${esc(t('sugShort', { n:sg.list.length, km:d.maxKm, hh:fmtN(sg.hh), miss:fmtN(c.missing) }))}</p>` : '')}
          <p class="small muted" style="margin:6px 0 0">${esc(t('sugHint'))}</p><p class="small muted" style="margin:4px 0 0">${esc(t('sugHh'))} ${esc(t('sugHlNote'))}</p></div>` : '';
      return `<div class="cov ${c.ok ? 'ok' : 'short'}" role="status">
        <div class="cov-h">${c.ok ? ICONS.circleCheck : ICONS.alert}<b>${esc(c.ok ? t('covOk') : t('covShort'))}</b></div>
        <div class="cov-n"><div><span>${esc(t('covWant'))}</span><b>${fmtN(c.want)}</b></div><div><span>${esc(t('covHave'))}</span><b>≈ ${fmtN(c.have)}</b></div><div><span>${esc(t('covMissing'))}</span><b>${c.missing ? '≈ ' + fmtN(c.missing) : '0'}</b></div></div>
        ${c.ok ? '' : `<p class="small">${esc(t(d.zone ? 'covShortZone' : 'covShortText', { have:fmtN(c.have) }))}</p>`}
        <p class="small muted" style="margin:4px 0 0">${esc(t('covEstimate'))}</p>
        ${sideList}${apart ? `<p class="small cov-apart">${ICONS.alert}${esc(t('covApart'))}</p>` : ''}${sugList}</div>`;
    };
    // result of the time-budget optimizer: what the hours can buy, per person, the distance, what is left over, the rides between places
    // print run below the maximum: input, table per place (full → planned), totals and working time
    const capHtml = b => {
      const c = b.cap, max = c ? c.full_planned : b.planned, hh = m => fmtHm(Math.round(m || 0));
      const nameOf = x => { const pl = (d.capPlaces || []).find(y => y.id === x.id); return x.main ? (d.mainName || t('capMain')) + (pl && d.sugNames.get(pl.id) ? ' – ' + d.sugNames.get(pl.id) : '') : d.sugNames.get(x.id) || (pl ? t('sugUnnamed', { km:String(Math.round(hav(d.start.lat, d.start.lng, pl.lat, pl.lng) / 100) / 10).replace('.', ',') }) : t('capOther')); };
      const rows = c && c.cut ? [...c.places].sort((a, z) => (z.main - a.main) || z.full - a.full) : [];
      return `<div class="cap-box" id="capBox"><label class="f" for="cCap">${esc(t('capLabel', { max:fmtN(max) }))}</label>
        <div class="cap-in"><input class="in" type="number" id="cCap" min="1" max="${max}" step="10" inputmode="numeric" value="${d.budget.cap > 0 ? d.budget.cap : ''}" placeholder="${esc(fmtN(max))}">${d.budget.cap > 0 ? `<button class="btn ghost small" id="cCapAll">${esc(t('capAll'))}</button>` : ''}</div>
        <p class="small muted" style="margin:4px 0 0">${esc(t('capHint'))}</p>
        ${c && !c.cut ? `<div class="hint">${esc(t('capNoCut', { f:fmtN(c.target), max:fmtN(max) }))}</div>` : ''}
        ${c && c.cut ? `<table class="cap-table" id="capTable"><thead><tr><th>${esc(t('capPlace'))}</th><th>${esc(t('capFull'))}</th><th>${esc(t('capPlanned'))}</th></tr></thead><tbody>
          ${rows.map(x => `<tr data-cap="${esc(x.id)}" data-keep="${x.keep ?? ''}"><td>${esc(nameOf(x))}</td><td>${fmtN(x.full)}</td><td><b>${fmtN(x.planned)}</b>${x.planned < x.full ? ` <span class="small muted">(−${fmtN(x.full - x.planned)})</span>` : ''}</td></tr>`).join('')}
          </tbody><tfoot><tr><td>${esc(t('capTotal'))}</td><td>${fmtN(c.full_planned)}</td><td><b id="capSum">${fmtN(c.planned)}</b></td></tr><tr><td>${esc(t('capTime'))}</td><td>${hh(c.full_minutes)}</td><td><b>${hh(b.actual_minutes)}</b></td></tr></tfoot></table>
          <p class="small muted" style="margin:4px 0 0">${esc(t('capDropped'))}</p>` : ''}</div>`;
    };
    // 19.11.2026: hours of the plan – handing out incl. walking, car rides, total per person and team; why the target is not reached
    const driveHtml = b => { const v = b.drive, f1 = x => String(x).replace('.', ',');
      const why = t('dfStop_' + v.stop, { min:v.limit_min ?? '', f:fmtN(v.max_flyers || 0), h:fmtHm(v.max_minutes), cap:fmtHm(v.team_cap_minutes), left:fmtHm(v.left_minutes) });
      return `<div class="hint" id="dfBox"><b>${esc(t('dfFull', { min:v.full_min }))}</b>${v.next ? ' · ' + esc(t('dfNext', { min:v.next.min, pct:v.next.pct })) : ''}<br>${esc(why)}${(v.villages || []).length ? '<br>' + esc(t('hrsVillages', { list:v.villages.map(x => x.name + ' (' + x.min + ' Min.)').join(', ') })) : ''}
        ${v.real_roads ? '' : '<br>' + esc(t('dfNoRoads'))}${v.skipped_mb ? '<br>' + esc(t('dfSkipped', { mb:fmtN(v.skipped_mb), m:v.outlier.m, k:f1(v.outlier.perKm) })) : ''}</div>`; };
    const hoursHtml = b => {
      const hh = m => fmtHm(Math.round(m || 0)), ws = b.workers || [], tw = ws.reduce((a, w) => a + (w.walk || 0), 0), tr = ws.reduce((a, w) => a + (w.ride || 0), 0);
      const sf = b.shortfall, lo = b.target_minutes * (1 - b.tolerance), hi = b.target_minutes * (1 + b.tolerance);
      const why = sf ? t('hrsWhy_' + sf.reason, { left:hh(sf.left_min), cap:hh(sf.team_cap_min), asked:hh(sf.asked_min) }) : '';
      return `<table class="cap-table" id="hrsTable"><thead><tr><th></th><th>${esc(t('hrsWalk'))}</th>${b.walk ? '' : `<th>${esc(t('hrsRide'))}</th>`}<th>${esc(t('hrsTotal'))}</th></tr></thead><tbody>
        ${ws.map(w => `<tr><td>${esc(t('personN', { n:w.w + 1 }))}</td><td>${hh(w.walk)}</td>${b.walk ? '' : `<td>${hh(w.ride)}</td>`}<td><b>${hh(w.minutes)}</b></td></tr>`).join('')}</tbody>
        <tfoot><tr><td>${esc(t('hrsTeam'))}</td><td>${hh(tw)}</td>${b.walk ? '' : `<td>${hh(tr)}</td>`}<td><b id="hrsSum">${hh(b.actual_minutes)}</b></td></tr></tfoot></table>
        <p class="small muted" style="margin:4px 0 0">${esc(b.walk ? t('walkMax', { h:hh(b.max_minutes) }) : b.drive ? t('dfMax', { h:hh(b.max_minutes) }) : t('hrsTarget', { lo:hh(lo), hi:hh(hi) }))}${(b.villages || []).length ? ' ' + esc(t('hrsVillages', { list:b.villages.map(v => v.name).join(', ') })) : ''}</p>
        ${sf ? `<div class="warnbox" id="hrsShort">${esc(why)}</div>` : ''}
        ${b.travel && b.travel.moves && (!b.travel.known || b.travel.manual) ? `<div class="${b.travel.manual ? 'hint' : 'warnbox'}" id="hrsRideBox">${esc(t(b.travel.manual ? 'hrsRideManual' : 'hrsRideEst'))}
          <div class="cap-in" style="margin-top:6px"><input class="in" type="number" id="cRideMan" min="1" max="240" step="1" placeholder="${esc(t('hrsRidePh'))}" value="${+d.budget.travelMin > 0 ? +d.budget.travelMin : ''}">${+d.budget.travelMin > 0 ? `<button class="btn ghost small" id="cRideAuto">${esc(t('hrsRideAuto'))}</button>` : ''}</div></div>` : ''}`;
    };
    const budgetPanel = pl => { const b = pl.budget, hh = m => fmtHm(Math.round(m)), f1 = v => String(v).replace('.', ',');
      // the shifts until the deadline (days × hours per day × people) can cap the hours the admin entered: all texts use the capped target
      const effMin = +b.effective_minutes || +b.target_minutes || b.hours * 60, capped = b.strategy === 'near-first' && effMin < b.hours * 60 - 1, effH = capped ? hh(effMin) : b.hours;
      return `<div class="budget-box" role="status"><h4>${esc(t('budTitle'))}</h4>
        <div class="cov-n"><div><span>${esc(t('budPlanned'))}</span><b>≈ ${fmtN(b.planned)}</b></div><div><span>${esc(t('budHoursNeeded'))}</span><b>${hh(b.actual_minutes)}</b></div>${b.strategy === 'near-first' ? '' : `<div><span>${esc(t('budUncovered'))}</span><b>${b.uncovered ? '≈ ' + fmtN(b.uncovered) : '0'}</b></div>`}</div>
        ${b.strategy === 'near-first' ? capHtml(b) : ''}
        <p class="small">${b.strategy === 'near-first' ? esc(t('budNearFirstResult', { h:effH, mb:fmtN(b.planned) })) : esc(t(b.fits_all ? 'budFitsAll' : b.limit === 'time' ? 'budLimitTime' : 'budLimitCap', { h:b.hours, mb:fmtN(b.planned), f:fmtN(b.flyers_max) }))}</p>${capped ? `<p class="small warn">${esc(t('budCappedDays', { h:b.hours, eff:effH, days:d.days, hpd:d.hours, n:d.n }))}</p>` : ''}
        ${b.workers.map(w => `<div class="route-row"><span class="swatch" style="background:${Planner.COLORS[w.w % 10]}"></span><div class="grow"><b>${esc(t('personN', { n:w.w + 1 }))}</b><span class="small muted">${esc(hh(w.minutes))} · ≈ ${fmtN(w.mailboxes)} · ${esc(f1(w.km))} km</span></div></div>`).join('')}
        <p class="small muted" style="margin:6px 0 0">${esc(t('budDist', { km:f1(Math.round(b.length_m / 100) / 10) }))}</p>
        ${b.auto ? `<p class="small" id="cAutoResult">${esc(t(b.travel.moves ? 'budgetAutoMixed' : 'budgetAutoWalk', { n:b.travel.moves }))}</p>` : ''}
        ${b.drive ? driveHtml(b) : ''}
        ${b.walk ? `<p class="small" id="cWalkResult">${esc(t('walkStop_' + b.walk.stop, { f:fmtN(b.walk.max_flyers || 0), left:hh(b.walk.left_minutes) }))}</p>` : ''}
        ${b.strategy === 'near-first' ? hoursHtml(b) : ''}
        ${b.travel.moves ? `<div class="${b.travel.known && !b.travel.far ? 'hint' : 'warnbox'}">${esc(b.travel.known ? t('budTravelKnown', { n:b.travel.moves, min:b.travel.minutes }) : t('budTravelUnknown', { n:b.travel.moves }))}${b.travel.far ? ' ' + esc(t('budTravelFar', { n:b.travel.far, km:b.travel.far_km })) : ''}</div>` : ''}
        ${b.main && b.main.empty ? `<div class="warnbox">${esc(t('budMainEmpty'))}</div>` : b.main && b.main.short ? `<div class="warnbox">${esc(t('budMainShort'))}</div>` : ''}
        ${(b.unplanned || []).length ? `<div class="warnbox">${esc(t('budUnplanned', { list:b.unplanned.join(', ') }))}</div>` : ''}
        ${b.over_target ? `<div class="warnbox">${esc(t(b.over ? 'budOver' : 'budOverTarget', { h:effH, act:hh(b.actual_minutes), max:hh(b.max_minutes), pct:Math.round(b.tolerance * 100) }))}</div>` : ''}
        <p class="small muted" style="margin:6px 0 0">${esc(t('budEstimate'))}</p></div>`; };
    const planBlock = () => p ? `${(p.side_failed || []).length ? `<div class="warnbox">${esc(t('sideFailed', { list:p.side_failed.join(', ') }))}</div>` : ''}${(p.bus || []).length ? `<div class="hint">${esc(t('busHint', { list:p.bus.map(x => x.name + ' (' + fmtDist(x.gap) + ')').join(', ') }))}</div>` : ''}${(p.side_info || []).length ? `<p class="small muted" style="margin:8px 0 0">${esc(p.side_info.map(x => x.name + ' → ' + t('planRoute', { n:x.worker + 1 })).join(' · '))}</p>` : ''}<p class="small muted" style="margin:10px 0 0">${esc(t('planSum', { mb:fmtN(p.mailboxes), km }))}</p><p class="small muted" id="cZen" style="margin:4px 0 0">${zensusOfPlan.get(p) || ''}</p>
        ${p.budget ? budgetPanel(p) : ''}
        ${p.mailboxes < d.flyers * 0.95 && !d.mainAll && !(p.eco && !d.exact) && !p.budget ? `<p class="small err">${esc(t(p.cores ? 'coresSmall' : 'areaSmall', { mb:fmtN(p.mailboxes) }))}</p>` : ''}
        <div class="${cap.ok ? 'hint' : 'warnbox'}">${cap.ok ? esc(needDays === 1 ? t('fitsOne') : t('fitsOk', { d:needDays })) : `${esc(t('tooBig', { h:cap.slowest.toFixed(1).replace('.', ','), lim:cap.limit, d:d.days }))} <button class="link" id="cReduce">${esc(t('reduceTo', { f:fmtN(cap.suggestedFlyers) }))}</button> ${esc(t('moreWorkers'))}`}</div>`
      : d.err ? `<p class="small err">${esc(t('streetsFail', { e:d.err }))}</p><button class="btn ghost small" id="cRetry">${ICONS.refresh}${esc(t('retryBtn'))}</button>` : `<p class="small muted" style="margin:10px 0 0">${esc(t('calculating'))}</p>`;
    let addrSf = null; const sfAddr = () => (addrSf = addrSf || searchField('cAddr', t('searchAddr'), pickAddr, { near:() => d.start ? [d.start.lat, d.start.lng] : null }));
    const towns = {}, sfTown = id => (towns[id] = towns[id] || searchField(id, t('townSearch'), c => addPlaceArea(c), { citiesOnly:true, near:() => d.start ? [d.start.lat, d.start.lng] : null }));
    let body = '';
    if(d.step === 1) body = `
      <label class="f" for="cTitle">${esc(t('title'))}</label><input class="in" id="cTitle" value="${esc(title)}" autocomplete="off">
      <label class="f" for="cAddr">${esc(t('addrMain'))}</label>${sfAddr().html}<div id="cStudioSlot">${studioBtnHtml()}</div>
      ${d.start && !d.place ? `<p class="small muted" style="margin:4px 0 0">${esc(t('startOnMap'))}</p>` : ''}
      <label class="f">${esc(t('mainCity'))}</label><div class="note" style="margin:0;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="grow">${esc(mainCity() || t('mainCityAuto'))}</span>${d.start && mainCity() && !(d.budget.on && d.budget.strategy === 'near-first') ? `<button class="all-btn${d.mainAll ? ' on' : ''}" id="cMainAll" title="${esc(t('mainAllHint'))}">${d.mainAll ? '✓ ' + esc(t('mainAllOn', { mb:p && d.mainAll ? fmtN(Math.round(p.mailboxes)) : '…' })) : esc(t('mainAllBtn'))}</button>` : ''}</div>
${d.budget.on && d.budget.strategy === 'near-first' ? '' : `      <label class="f" for="cQuota">${esc(t('quota'))}</label><input class="in" type="number" id="cQuota" min="200" step="100" value="${esc(saved.quota)}"><p class="small muted" style="margin:4px 0 0">${esc(t('quotaHours'))}</p><label class="check" style="margin-top:6px"><input type="checkbox" id="cNoQ" ${(saved.noQuota != null ? saved.noQuota : d.travel === 'car') ? 'checked' : ''}><span>${esc(t('noQuota'))}</span></label>`}
      ${d.travel === 'zones' && !(d.budget.on && d.budget.strategy === 'near-first') ? `<label class="check" style="margin-top:10px"><input type="checkbox" id="cCores" ${d.cores ? 'checked' : ''}><span><b>${esc(t('coresLbl'))}</b><br><span class="small muted">${esc(t('coresZonesHint'))}</span></span></label><p class="small muted" style="margin:8px 0 0">${esc(t('zonesHint'))}</p>` : ''}
      ${d.travel === 'zones' ? '' : `<label class="f">${esc(t('travelLbl'))}</label><div class="opt3" role="radiogroup">${[['car', '🚗'], ['bus', '🚌'], ['bike', '🚲']].map(([v, ic]) => `<button role="radio" aria-checked="${d.travel === v}" class="${d.travel === v ? 'on' : ''}" data-travel="${v}"><i>${d.travel === v ? '✓' : ''}</i><span>${ic} ${esc(t('travel_' + v))}</span></button>`).join('')}</div><p class="small muted" style="margin:4px 0 0">${esc(t('travelHint'))}</p>`}
      ${d.travel === 'car' ? `<label class="check" style="margin-top:10px"><input type="checkbox" id="cCores" ${d.cores ? 'checked' : ''}><span><b>${esc(t('coresLbl'))}</b><br><span class="small muted">${esc(t('coresHint'))}</span></span></label>
        ${d.cores ? `<label class="check" style="margin-top:6px"><input type="checkbox" id="cTogether" ${d.together ? 'checked' : ''}><span><b>${esc(t('togetherLbl'))}</b><br><span class="small muted">${esc(t('togetherHint'))}</span></span></label>` : ''}` : ''}`;
    else if(d.step === 3) body = `
      ${d.budget.on && d.budget.strategy === 'near-first' ? `<div class="hint">Zeit zuerst: Die Flyerzahl wird aus dem geplanten Gebiet berechnet. Nächste Straßen zuerst, nicht die höchste Briefkastendichte.</div>` : ''}
      <div class="steppers">
        ${d.budget.on && d.budget.strategy === 'near-first' ? '' : `<div><label class="f">${esc(t(d.budget.on ? 'budMaxFly' : 'flyersCount'))}</label><div class="stepper"><button data-s="f:-500" aria-label="−500">−</button><input id="cFly" type="number" inputmode="numeric" min="100" step="100" value="${d.flyers}"><button data-s="f:500" aria-label="+500">+</button></div></div>`}

      </div>

      ${p && d.mainAll ? `<div class="hint">${esc(t('mainAllNote', { city:mainCity(), mb:fmtN(Math.round(p.mailboxes)) }))}</div>`
        : p && p.eco && !d.exact ? `<div class="hint">${esc(t('ecoNote', { used:fmtN(Math.round(p.mailboxes)), asked:fmtN(d.flyers) }))} <button class="link" id="cExact">${esc(t('exactBtn', { f:fmtN(d.flyers) }))}</button></div>`
        : p && d.exact && !tkE && !p.budget ? `<p class="small muted" style="margin:6px 0 0">${esc(t('exactOn', { f:fmtN(d.flyers) }))}</p>` : ''}
      ${d.budget.on && d.budget.strategy === 'near-first' ? '' : covBlock()}
      ${p && oneDay ? `<div class="hint">${esc(t('oneDayHint', { h:fmtHm(totMin) }))} <button class="link" id="cOneDay">${esc(t('applySug'))}</button></div>` : p && d.sug && d.sug !== d.n ? `<div class="hint">${esc(t('sugWorkers', { n:d.sug, d:d.days }))} <button class="link" id="cSug">${esc(t('applySug'))}</button></div>` : ''}
      ${p && p.cores && p.cores.length ? `<div class="hint">${esc(t('coresSum', { n:p.cores.length, mb:fmtN(p.mailboxes) }))}<br><span class="small">${esc(p.cores.map(c => c.name + ' ' + fmtN(c.mb)).join(' · '))}</span></div>` : ''}
      ${planBlock()}
      <label class="f">${esc(t('sideTowns'))}</label><p class="small muted" style="margin:-2px 0 6px">${esc(t('sideTownsHint'))}</p>
      ${d.must.length ? `<div class="chips" style="margin:0 0 8px">${d.must.map((a, k) => `<span class="chip">${d.split ? `<span>${esc(mName(a, k))}${spText(a.name)}</span>${allBtn(a.name, a.all, 'm', k)}` : `<button class="link" data-med="${k}">${esc(mName(a, k))} · ${esc(a.n ? fmtN(a.n) : t('mustAllShort'))}</button>`}${a.p && a.p.length > 2 ? `<button class="link" data-mpt="${k}" aria-label="${esc(t('shapeEdit'))}" title="${esc(t('shapeEdit'))}">✎</button>` : ''}<button class="link" data-mrm="${k}" aria-label="${esc(t('del'))}">✕</button></span>`).join('')}</div>` : ''}
      ${d.side.length ? `<label class="f">${esc(t('covChosen'))}</label>${chosenRows()}<p class="small muted">${esc(t('sideOwnHint'))}</p>` : ''}
      ${!(d.budget.on && d.budget.strategy === 'near-first') && fixedMb > d.flyers ? `<div class="warnbox" style="margin:0 0 8px">${esc(t('allMbTooMany', { mb:fmtN(fixedMb), f:fmtN(d.flyers) }))} <button class="link" id="cAllFit">${esc(t('allMbRaise', { f:fmtN(Math.ceil(fixedMb / 50) * 50) }))}</button></div>` : ''}
      ${d.start ? sfTown('cTown1').html : `<p class="small muted">${esc(t('sideNeedStart'))}</p>`}
      <div class="must-box zone-box">
        <b>${esc(t('sideDrawTitle'))}</b>
        <p class="small muted" style="margin:4px 0 8px">${esc(t('sideDrawDescription'))}</p>
        <button class="btn ghost small" id="cSideDraw" ${d.start ? '' : 'disabled'}>${ICONS.edit}${esc(t('sideDrawBtn'))}</button>
        ${d.zone ? `<button class="btn ghost small" id="cZoneAuto">${esc(t('zoneBackAuto'))}</button>` : ''}
      </div>
      ${p && p.split ? `<div class="hint">${esc(t(p.near ? (p.team ? 'nearTeamHint' : 'nearHint') : 'splitHint', { list:p.split.map(x => (x.name || mainCity() || t('mainCity')) + ' ' + fmtN(x.flyers)).join(' · ') }))}</div>` : ''}
      ${p && !d.split && p.must_mb > d.flyers ? `<div class="warnbox" style="margin:8px 0">${esc(t('mustTooMany', { mb:fmtN(p.must_mb), f:fmtN(d.flyers) }))}</div>` : ''}
      ${p ? (p.zones ? personRows(false) : p.routes.map((r, i) => routeRow(r, i, false)).join('')) : ''}`;
    else if(d.step === 2) body = `
      <div class="steppers"><div><label class="f" for="cDeadline">${esc(t('deadline'))}</label><input class="in" type="date" id="cDeadline" min="${plusDays(isoDay(new Date()), 1)}"></div><div><label class="f" for="cHours">${esc(t('hoursDay'))}</label><input class="in" type="text" id="cHours" inputmode="decimal" value="${d.hours}"></div></div>
      <label class="f" for="cQuota">${esc(t('quota'))}</label><input class="in" type="number" id="cQuota" min="200" step="100" value="${esc(saved.quota)}">
      <div class="steppers"><div><label class="f">${esc(t('workersCount'))}</label><div class="stepper"><button data-s="n:-1" aria-label="−1">−</button><b id="vN">${d.n}</b><button data-s="n:1" aria-label="+1">+</button></div></div></div>
      ${d.travel === 'zones' && !d.cores && !d.mainAll ? `<label class="check" style="margin-top:8px"><input type="checkbox" id="cBudget" ${d.budget.on ? 'checked' : ''}><span><b>${esc(t('budTitle'))}</b></span></label>
        ${d.budget.on ? `<label class="f" for="cBudH">${esc(t('budHours'))}</label><input class="in" type="number" id="cBudH" min="1" max="2000" step="1" value="${esc(d.budget.hours)}"><p class="small muted">${esc(t('budHoursHint', { n:d.n, each:fmtHm(Math.round(d.budget.hours * 60 / Math.max(1, d.n))) }))}</p>
          <label class="f" for="cBudgetStrategy">${esc(t('budStrategyLabel'))}</label><select class="in" id="cBudgetStrategy"><option value="near-first" ${d.budget.strategy === 'near-first' ? 'selected' : ''}>${esc(t('budNearFirst'))}</option><option value="density" ${d.budget.strategy !== 'near-first' ? 'selected' : ''}>${esc(t('budDensity'))}</option></select>
          ${d.budget.strategy === 'near-first' ? `<label class="f" for="cBudgetMode">${esc(t('budgetModeLabel'))}</label><select class="in" id="cBudgetMode">
            ${d.budget.mode == null ? `<option value="" selected>${esc(t('budgetModeLegacy'))}</option>` : ''}
            <option value="walk" ${walkOn() ? 'selected' : ''}>${esc(t('budgetModeWalk'))}</option>
            <option value="drive" ${driveOn() ? 'selected' : ''}>${esc(t('budgetModeCar'))}</option>
            <option value="auto" ${autoOn() ? 'selected' : ''}>${esc(t('budgetModeAuto'))}</option>
          </select>` : ''}
          ${walkOn() || roadModeOn() ? `<label class="f" for="cMaxFly">${esc(t('dfFly'))}</label><input class="in" type="number" id="cMaxFly" min="1" step="100" inputmode="numeric" placeholder="${esc(t('dfNone'))}" value="${d.budget.maxFlyers ?? ''}">` : ''}
          ${roadModeOn() ? `<label class="f" for="cDriveMin">${esc(t('dfMin'))}</label><input class="in" type="number" id="cDriveMin" min="5" max="30" step="1" inputmode="numeric" placeholder="${esc(t('dfNone'))}" value="${d.budget.driveMin ?? ''}">
            <p class="small muted">${esc(t(autoOn() ? 'budgetAutoHint' : 'dfHint'))}</p>
            <details class="small" id="cOutl"><summary>${esc(t('dfOutl'))}</summary><div class="cap-in" style="margin-top:6px"><label class="small" for="cOutM">${esc(t('dfOutM'))}</label><input class="in" type="number" id="cOutM" min="100" max="20000" step="50" value="${d.budget.outlierM}"></div>
              <div class="cap-in" style="margin-top:6px"><label class="small" for="cOutK">${esc(t('dfOutK'))}</label><input class="in" type="number" id="cOutK" min="0" max="50" step="0.5" value="${d.budget.outlierPerKm}"></div></details>` : ''}
          ${d.budget.strategy === 'near-first' && !roadModeOn() && !walkOn() ? `<label class="check"><input id="cCircle" type="checkbox" ${d.budget.radiusKm != null ? 'checked' : ''}><span>${esc(t('circleArea'))}</span></label>${d.budget.radiusKm != null ? `<label class="f" for="cRadiusKm">${esc(t('circleRadius'))}</label><input class="in" type="number" id="cRadiusKm" min="${MIN_RADIUS_KM}" max="${MAX_RADIUS_KM}" step="0.5" value="${esc(d.budget.radiusKm)}"><p class="small muted">${esc(t('circleHint'))}</p>` : ''}` : ''}
          ${roadModeOn() || walkOn() ? '' : `<label class="check" style="margin-top:8px"><input id="cBudgetCar" type="checkbox" ${d.budget.car ? 'checked' : ''}><span>${esc(t('budCar'))}</span></label>
          <label class="f" for="cBudT">${esc(t('budTol'))}</label><input class="in" type="number" id="cBudT" min="0" max="25" step="1" value="${esc(d.budget.tol)}">`}
          ${(d.side.length || d.must.some(a => a.p?.length > 2) || d.zone?.length > 2) && d.budget.strategy === 'near-first' && !walkOn() ? roadModeOn() ? `<details class="small" id="cRideOpt" ${+d.budget.travelMin > 0 ? 'open' : ''}><summary>${esc(t('dfRideOpt'))}</summary><input class="in" type="number" id="cBudTravel" min="1" max="480" step="1" inputmode="numeric" value="${esc(d.budget.travelMin || '')}" placeholder="${esc(t('dfRideAuto'))}" style="margin-top:6px"><p class="small muted">${esc(t('dfRideHint'))}</p></details>` : `<label class="f" for="cBudTravel">${esc(t('budTravelInput'))}</label><input class="in" type="number" id="cBudTravel" min="1" max="480" step="1" value="${esc(d.budget.travelMin || '')}" placeholder="z. B. 20"><p class="small muted">${esc(t('budTravelInputHint'))}</p>` : ''}` : ''}` : ''}
      <label class="f" for="cNotes">${esc(t('note'))}</label><textarea class="in" id="cNotes" placeholder="${esc(t('notesPh'))}"></textarea>
      <p class="small muted" style="margin:6px 0 0">${esc(saved.deadline ? t('deadlineDays', { d:d.days }) : t('deadlineNone'))}</p>
      ${p ? `<div class="${cap.ok ? 'hint' : 'warnbox'}">${cap.ok ? esc(needDays === 1 ? t('fitsOne') : t('fitsOk', { d:needDays })) : esc(t('tooBig', { h:cap.slowest.toFixed(1).replace('.', ','), lim:cap.limit, d:d.days }))}</div>` : ''}`;
    else if(d.step === 4) body = `<p class="small muted" style="margin:0 0 4px">${esc(t('assignHint'))}</p>${p ? (p.zones ? personRows(true) : p.routes.map((r, i) => routeRow(r, i, true)).join('')) : ''}`;
    else {
      const assigned = p ? p.routes.filter((_, i) => d.assign[i]).length : 0;
      body = `<p class="small muted" style="margin:0 0 8px">${esc(t('rvIntro'))}</p><div class="review">
        <div class="rv-h"><b>${esc(t('wzStart'))}</b><button class="link small" data-step="1">${ICONS.edit}${esc(t('rvChange'))}</button></div>
        <div><span>${esc(t('title'))}</span><b>${esc(saved.title || '—')}</b></div>
        <div><span>${esc(t('place'))}</span><b>${esc(d.place ? [d.place.district, d.place.city].filter(Boolean).join(', ') || d.place.name : (tkE ? [tkE.district, tkE.city_name].filter(Boolean).join(', ') : '—'))}</b></div>
        ${saved.notes ? `<div><span>${esc(t('note'))}</span><b>${esc(saved.notes)}</b></div>` : ''}
        <div class="rv-h"><b>${esc(t('wzTime'))}</b><button class="link small" data-step="2">${ICONS.edit}${esc(t('rvChange'))}</button></div>
        <div><span>${esc(t('deadline'))}</span><b>${esc(saved.deadline ? fmtDay(saved.deadline) + ' · ' + t('daysN', { n:d.days }) : t('noDate'))} · ${esc(String(d.hours).replace('.', ','))} ${esc(t('h'))}/${esc(t('dayShort'))}</b></div>
        <div><span>${esc(t('quota'))}</span><b>${esc(fmtN(+saved.quota || NEW_QUOTA))} m / 30 ${esc(t('min'))}</b></div>
        <div class="rv-h"><b>${esc(t('wzRoute'))}</b><button class="link small" data-step="3">${ICONS.edit}${esc(t('rvChange'))}</button></div>
        <div><span>${esc(t('flyersCount'))}</span><b>${esc(fmtN(effFlyers))}${p ? ' · ' + esc(t('mbApprox', { n:fmtN(p.mailboxes) })) : ''}</b></div>
        ${!p.budget && covShown() && !coverage(d.flyers, p.mailboxes).ok ? `<div class="rv-short"><span>${esc(t('covMissing'))}</span><b>${ICONS.alert}≈ ${esc(fmtN(coverage(d.flyers, p.mailboxes).missing))} · ${esc(t('covReviewNote'))}</b></div>` : ''}
        <div><span>${esc(t('dist2'))}</span><b>${esc(km)} · ${esc(fmtHm(p ? p.routes.reduce((s, r) => s + r.minutes, 0) : 0))} ${esc(t('h'))}</b></div>
        ${d.side.length ? `<div><span>${esc(t('sideTitle'))}</span><b>${esc(d.side.map(x => x.name + ' (' + fmtN(x.flyers) + ')').join(', '))}</b></div>` : ''}
        <div><span>${esc(t('zoneTitle'))}</span><b>${esc(d.zone ? t('zoneOwn') : t('zoneAuto'))}</b></div>
        ${d.must.length ? `<div><span>${esc(t('mustTitle'))}</span><b>${esc((d.must.some(a => a.name) ? d.must.map((a, k) => mName(a, k)).join(', ') + ' · ' : '') + t('mustSum', { n:d.must.length, mb:fmtN((p && p.must_mb) || 0) }))}</b></div>` : ''}
        <div class="rv-h"><b>${esc(t('wzTeam'))}</b><button class="link small" data-step="4">${ICONS.edit}${esc(t('rvChange'))}</button></div>
        <div><span>${esc(t('workersCount'))}</span><b>${p ? p.routes.length : '—'} · ${esc(t('assignedN', { a:assigned, n:p ? p.routes.length : 0 }))}</b></div>
      </div>
      ${p && !cap.ok ? `<div class="warnbox">${esc(t('tooBig', { h:cap.slowest.toFixed(1).replace('.', ','), lim:cap.limit, d:d.days }))}</div>` : ''}<div class="err" id="cErr"></div>`;
    }
    const last = d.step === 5, nextOk = last ? (!!p && !d.busy) : canReach(d.step + 1);
    const isMini = !!($('#cSheet') && $('#cSheet').classList.contains('mini'));
    sheet(`<div class="sheet-header"><button class="sheet-grip" id="grip" aria-label="${esc(t('panel'))}"></button><button class="sheet-min" id="cMin" aria-expanded="${isMini ? 'false' : 'true'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg><span>${esc(t(isMini ? 'panelShow' : 'panelHide'))}</span></button>
      <div class="cbusy" id="cBusy" role="status" ${d.busy ? '' : 'hidden'}>${d.busy ? esc(d.status || '') : ''}</div></div>
      <div class="wz" id="cWz">${STEPS.map((k, i) => `<button class="${i + 1 === d.step ? 'on' : i + 1 < d.step ? 'done' : ''}" data-step="${i + 1}" ${canReach(i + 1) ? '' : 'disabled'} aria-current="${i + 1 === d.step ? 'step' : 'false'}"><i></i><span>${i + 1} ${esc(t(k))}</span></button>`).join('')}</div>
      ${p && (d.step === 3 || d.step === 4) ? `<p class="wz-total" id="cPlanHours" ${d.busy || d.err ? 'hidden' : ''}><span>${esc(t('planTeamHours'))}</span><b>≈ ${esc(fmtHm(p.budget?.actual_minutes ?? totMin))} ${esc(t('h'))}</b></p>` : ''}
      <div class="sheet-content" id="cSheetContent"><div class="wz-head"><small>${esc(t('wzStepOf', { n:d.step, of:STEPS.length }))} · <b>${esc(t(STEPS[d.step - 1]))}</b></small><p>${esc(t('wzDesc' + d.step))}</p></div>
      ${outsideManual() ? `<div class="warnbox" id="cCircleWarning">${esc(t('circleManualOutside'))}</div>` : ''}
      ${body}
      ${!nextOk ? `<p class="wz-why" role="status">${ICONS.alert}<span>${esc(!d.start ? t('wzNeedStart') : d.busy || !p ? t('wzCalc') : t('wzFix'))}</span></p>` : ''}
      </div><div class="wz-nav">${d.step > 1 ? `<button class="btn ghost" id="cPrev">${esc(t('back'))}</button>` : ''}
        <button class="btn primary" id="${last ? 'cSave' : 'cNext'}" ${nextOk ? '' : 'disabled'}>${esc(last ? t('saveTask') : t('next'))}</button></div>`);
    restore(saved); $('#cSheetContent').scrollTop = sc;
    $('#grip').onclick = () => $('#cSheet').classList.toggle('tall');
    $('#cMin').onclick = () => { const sh = $('#cSheet'), mini = sh.classList.toggle('mini'); $('#cSheetContent').scrollTop = 0; const bt = $('#cMin'); bt.setAttribute('aria-expanded', mini ? 'false' : 'true'); bt.querySelector('span').textContent = t(mini ? 'panelShow' : 'panelHide'); setTimeout(() => m.invalidateSize(), 250); };
    document.querySelectorAll('[data-step]').forEach(b => b.onclick = () => goStep(+b.dataset.step));
    if($('#cPrev')) $('#cPrev').onclick = () => goStep(d.step - 1);
    if($('#cNext')) $('#cNext').onclick = () => {
      if(d.step === 1){ saved = keep(); if(!(saved.title || '').trim()){ const ti = $('#cTitle'); ti.setAttribute('aria-invalid', 'true'); ti.setAttribute('aria-describedby', 'cTitleErr');
        if(!$('#cTitleErr')) ti.insertAdjacentHTML('afterend', `<p class="err small" id="cTitleErr" style="margin:4px 0 0">${esc(t('needTitle'))}</p>`); ti.oninput = () => { ti.removeAttribute('aria-invalid'); const e = $('#cTitleErr'); if(e) e.remove(); }; ti.focus(); return; } }
      goStep(d.step + 1);
    };
    if($('#cRetry')) $('#cRetry').onclick = () => setStart(d.start.lat, d.start.lng);
    document.querySelectorAll('[data-s]').forEach(b => b.onclick = () => {
      const [k, v] = b.dataset.s.split(':');
      const later = () => { clearTimeout(d.tm); d.tm = setTimeout(() => { saved = keep(); recompute(); }, 450); };   // several quick taps = one recalculation
      if(k === 'f'){ d.flyers = Math.max(100, num('#cFly', d.flyers) + +v); $('#cFly').value = d.flyers; d.nAuto = true; return later(); }
      d.n = Math.max(1, Math.min(20, d.n + +v)); $('#vN').textContent = d.n; d.nAuto = false; d.assign = {}; later();
    });
    if($('#cBudget')) $('#cBudget').onchange = e => { saved = keep(); d.budget.on = e.target.checked; d.assign = {}; recompute(); };
    if($('#cBudT')) $('#cBudT').onchange = e => { saved = keep(); d.budget.tol = Math.max(0, Math.min(25, Math.round(+e.target.value || 0))); d.assign = {}; recompute(); };
    if($('#cBudH')) $('#cBudH').onchange = e => { saved = keep(); d.budget.hours = Math.max(1, Math.min(2000, Math.round(+e.target.value || 32))); d.assign = {}; recompute(); };
    if($('#cCircle')) $('#cCircle').onchange = e => { saved = keep(); d.budget.radiusKm = e.target.checked ? DEFAULT_RADIUS_KM : null; d.assign = {}; sugFlow.reset(); d.sugT = null; if(d.plan) draw(); recompute(); };
    if($('#cRadiusKm')) $('#cRadiusKm').onchange = e => { saved = keep(); const value = Number(e.target.value); if(!Number.isFinite(value) || value < MIN_RADIUS_KM || value > MAX_RADIUS_KM){ e.target.reportValidity(); e.target.value = d.budget.radiusKm; return; } d.budget.radiusKm = value; d.assign = {}; sugFlow.reset(); d.sugT = null; if(d.plan) draw(); recompute(); };
    if($('#cBudgetStrategy')) $('#cBudgetStrategy').onchange = e => { saved = keep(); d.budget.strategy = e.target.value; d.assign = {}; recompute(); };
    if($('#cRideMan')) $('#cRideMan').onchange = e => { saved = keep(); const v = Math.round(Number(e.target.value)); d.budget.travelMin = v > 0 ? v : null; d.assign = {}; recompute(); };
    if($('#cRideAuto')) $('#cRideAuto').onclick = () => { saved = keep(); d.budget.travelMin = null; d.assign = {}; recompute(); };
    const boundedNumber = (v, lo, hi) => { const x = Number(v); return v === '' || v == null || !Number.isFinite(x) ? null : Math.min(hi, Math.max(lo, x)); };
    if($('#cBudgetMode')) $('#cBudgetMode').onchange = e => {
      saved = keep(); d.budget.mode = e.target.value || null; d.assign = {}; d.plan = null; d.err = null;
      planLayer.clearLayers(); zoneLayer.clearLayers();
      L.marker(startArr(), { icon:dot('pin-start', 26) }).addTo(zoneLayer);
      renderSheet(); recompute();
    };
    if($('#cDriveMin')) $('#cDriveMin').onchange = e => { saved = keep(); const v = boundedNumber(e.target.value, 5, 30); d.budget.driveMin = v == null ? null : Math.round(v); d.budget.grid = null; d.assign = {}; recompute(); };
    if($('#cMaxFly')) $('#cMaxFly').onchange = e => { saved = keep(); const v = boundedNumber(e.target.value, 1, 1e7); d.budget.maxFlyers = v == null ? null : Math.round(v); d.assign = {}; recompute(); };
    if($('#cOutM')) $('#cOutM').onchange = e => { saved = keep(); d.budget.outlierM = boundedNumber(e.target.value, 100, 20000) ?? 850; d.assign = {}; recompute(); };
    if($('#cOutK')) $('#cOutK').onchange = e => { saved = keep(); d.budget.outlierPerKm = boundedNumber(e.target.value, 0, 50) ?? 3; d.assign = {}; recompute(); };
    if($('#cCap')) $('#cCap').onchange = e => { saved = keep(); const v = Math.round(Number(e.target.value)), max = +e.target.max;
      d.budget.cap = v > 0 && !(max > 0 && v >= max) ? v : null; d.assign = {}; recompute(); };
    if($('#cCapAll')) $('#cCapAll').onclick = () => { saved = keep(); d.budget.cap = null; d.assign = {}; recompute(); };
    if($('#cBudTravel')) $('#cBudTravel').onchange = e => { saved = keep(); d.budget.travelMin = Math.max(0, Math.min(480, Math.round(+e.target.value || 0))) || null; d.assign = {}; recompute(); };
    if($('#cBudgetCar')) $('#cBudgetCar').onchange = e => { saved = keep(); d.budget.car = e.target.checked; recompute(); };
    if($('#cFly')) $('#cFly').onchange = () => { saved = keep(); d.flyers = Math.max(100, Math.round(num('#cFly', d.flyers))); d.nAuto = true; recompute(); };
    if($('#cQuota')) $('#cQuota').onchange = () => { saved = keep(); recompute(); };
    document.querySelectorAll('[data-travel]').forEach(b => b.onclick = () => { if(d.travel === b.dataset.travel) return; saved = keep(); d.travel = b.dataset.travel; d.bike = d.travel !== 'bus'; recompute(); });
    document.querySelectorAll('[data-first]').forEach(b => b.onclick = () => { saved = keep(); const x = d.side[+b.dataset.first]; if(!x) return; d.first = d.first === x.name ? null : x.name; recompute(); });
    if($('#cCores')) $('#cCores').onchange = e => { saved = keep(); d.cores = e.target.checked; recompute(); };
    if($('#cTogether')) $('#cTogether').onchange = e => { saved = keep(); d.together = e.target.checked; recompute(); };
    if($('#cExact')) $('#cExact').onclick = () => { saved = keep(); d.exact = true; recompute(); };
    // "Effizienter planen" removed (24.11.2026): for a fixed number of flyers the planner ignores it – the same plan again, ~30 s for nothing
    // whole main town: its border becomes the distribution area and every mailbox in it gets a flyer
    if($('#cMainAll')) $('#cMainAll').onclick = async () => {
      saved = keep();
      if(d.mainAll){ d.mainAll = false; d.zone = d.zoneBeforeAll || null; d.zoneBeforeAll = null; drawMust(); return recompute(); }
      const b = $('#cMainAll'); b.disabled = true; toast(t('placeLoading'));
      const { p:pts } = await placeArea({ name:mainCity(), lat:d.start.lat, lng:d.start.lng, kind:'town' }); if(!alive()) return;
      d.zoneBeforeAll = d.zone; d.zone = pts; d.mainAll = true; drawMust(); recompute();
    };
    if($('#cDeadline')) $('#cDeadline').onchange = () => { saved = keep(); const nd = workDaysTo(saved.deadline) || 2; if(nd !== d.days){ d.days = nd; recompute(); } else renderSheet(); };
    if($('#cHours')) $('#cHours').onchange = e => {
      const hours = boundedNumber(e.target.value.trim().replace(',', '.'), 1, 12);
      e.target.value = hours ?? d.hours;
      if(hours == null || hours === d.hours) return;
      saved = keep();
      d.hours = hours;
      recompute();
    };
    const od = $('#cOneDay'); if(od) od.onclick = () => { saved = keep(); d.n = 1; d.days = 1; d.assign = {}; recompute(); };
    const sg = $('#cSug'); if(sg) sg.onclick = () => { saved = keep(); d.n = d.sug; d.assign = {}; recompute(); };
    const red = $('#cReduce'); if(red) red.onclick = () => { saved = keep(); d.flyers = Math.max(100, cap.suggestedFlyers); d.nAuto = false; recompute(); };
    document.querySelectorAll('[data-r]').forEach(s => s.onchange = () => { d.assign[+s.dataset.r] = s.value || null; });
    document.querySelectorAll('[data-wsel]').forEach(s => s.onchange = () => { const w = +s.dataset.wsel; p.routes.forEach((r, i) => { if(r.w === w) d.assign[i] = s.value || null; }); });
    if($('#cSave')) $('#cSave').onclick = save;
    if($('#cSideDraw')) $('#cSideDraw').onclick = () => { saved = keep(); drawMode(true, 'side'); };
    Object.values(towns).forEach(x => x.bind());
    if(addrSf){ addrSf.bind(); const ai = $('#cAddr'); if(ai && d.place) ai.value = d.place.name + (d.place.sub ? ', ' + d.place.sub : ''); }
    bindStudio();
    document.querySelectorAll('[data-srm]').forEach(b => b.onclick = () => { saved = keep(); d.side.splice(+b.dataset.srm, 1); sugHl.clear(); d.autoPicked = true; recompute(); });
    document.querySelectorAll('[data-scnt]').forEach(input => input.onchange = () => {
      const x = d.side[+input.dataset.scnt], n = Math.round(+input.value);
      if(!x || !Number.isFinite(n) || n < 30 || n > 100000){ renderSheet(); return; }
      saved = keep(); x.flyers = n; x.auto = false; x.all = false;
      d.autoPicked = true; d.dirty = true; recompute();
    });
    // the admin adds a suggested place: only now it becomes part of the order (a second click does nothing). Older searches are dropped.
    document.querySelectorAll('[data-sadd]').forEach(b => b.onclick = () => {
      const sg = d.sugT && d.sugT.key === sugKey() ? d.sugT.list[+b.dataset.sadd] : null; if(!sg || b.disabled || d.adding) return; b.disabled = true; d.adding = true;
      saved = keep(); const before = d.side.length;
      d.side = addSuggestion(d.side, sg, sg.name || t('sugUnnamed', { km:String(sg.km).replace('.', ',') }));
      // Explicitly added towns must receive real flyer allocation even after coverage is full.
      const added = d.side[d.side.length - 1]; if(added && added.cid === sg.id){ added.auto = false; added.flyers = Math.max(30, Math.min(d.flyers, Math.round(sg.households))); }
      d.adding = false; if(d.side.length === before) return;
      sugHl.clear(); sugFlow.invalidate(); d.sugT = null; d.dirty = true; recompute();
    });
    if($('#sugMore')) $('#sugMore').onclick = () => sugFlow.more();
    // list <-> map: hover (or keyboard focus) lights the area up, leaving removes it, a tap/click on the NAME moves the map there and keeps it lit.
    // None of this adds the place; only the "Ort hinzufügen" button does. After each redraw the highlight is checked against the rows that exist.
    { const vis = d.sugT && d.sugT.key === sugKey() && d.sugT.list ? d.sugT.list.slice(0, d.sugT.shown) : [], at = el => vis[+el.dataset.srow];
      document.querySelectorAll('.sug-row[data-srow]').forEach(r => { r.onmouseenter = () => sugHl.enter(at(r)); r.onmouseleave = () => sugHl.leave(at(r)); });
      document.querySelectorAll('[data-sfocus]').forEach(b => { b.onfocus = () => sugHl.enter(vis[+b.dataset.sfocus]); b.onblur = () => sugHl.leave(vis[+b.dataset.sfocus]); b.onclick = () => sugHl.pin(vis[+b.dataset.sfocus]); });
      sugHl.refresh(vis); }
    // max distance from the ORIGINAL start (straight line); a new value is a new search (the loaded census squares are reused)
    if($('#sugKm')) $('#sugKm').onchange = e => { const km = +e.target.value; if(!km || km === d.maxKm) return; d.maxKm = km; sugFlow.invalidate(); d.sugT = null; findSuggestions(); renderSheet(); };
    // "all mailboxes" of a place: it gets exactly what it has, the other places share the rest
    document.querySelectorAll('[data-all]').forEach(b => b.onclick = () => { saved = keep(); const [kind, k] = b.dataset.all.split(':'), x = (kind === 's' ? d.side : d.must)[+k]; if(!x) return; x.all = !x.all; d.dirty = true; drawMust(); recompute(); });
    if($('#cAllFit')) $('#cAllFit').onclick = () => { saved = keep(); d.flyers = Math.ceil(p.split.filter(x => x.all).reduce((a, x) => a + (x.cap || 0), 0) / 50) * 50; d.nAuto = true; recompute(); };
    if($('#cZoneAuto')) $('#cZoneAuto').onclick = () => { saved = keep(); d.zone = null; d.mainAll = false; drawMust(); recompute(); };
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
    // fewer mailboxes than flyers: saving is fine, but only when the admin says so (the ordered number stays as typed)
    { const c = coverage(d.flyers, d.plan.mailboxes);
      const pl0 = d.plan, shown = !d.mainAll && !(pl0.eco && !d.exact) && !pl0.cores && !pl0.budget;   // time-budget mode: fewer mailboxes than the maximum is the point (shown in the budget panel), no extra question
      if(shown && !c.ok && !await confirmBox(t('covSaveT'), t('covSaveQ', { want:fmtN(c.want), have:fmtN(c.have), miss:fmtN(c.missing) }), t('covSaveYes'))) return; }
    $('#cSave').disabled = true; $('#cSave').classList.add('loading');
    let createdTaskId = null; // only a freshly created order may be rolled back
    try{
      const pl = d.plan, quota = Math.max(200, Math.round(+saved.quota || NEW_QUOTA)), date = saved.date || null, deadline = saved.deadline || null;
      const cityN = mainCity() || null;
      const dbBoxes = savedMailboxCounts(pl.routes);
      if(pl.split){ const by = new Map(pl.split.filter(x => x.name).map(x => [x.name, x.flyers])); d.must.forEach(a => { if(by.has(a.name)) a.n = by.get(a.name); }); d.side.forEach(x => { if(by.has(x.name)) x.flyers = by.get(x.name); }); }
      const row = { title:withCity(title, cityN), city_name:cityN, district:(d.place && d.place.district) || (tkE && tkE.district) || null, start_lat:d.start.lat, start_lng:d.start.lng,
        walk_minutes:15, zone_polygon:pl.zone, must_areas:d.must.length ? d.must.map(a => ({ p:a.p, n:a.n, name:a.name || undefined, c:a.c })) : null, side_towns:d.side.length ? d.side : null, bike:d.travel !== 'bus', travel:d.travel, split:d.split, cores:!!(d.cores && (d.travel === 'car' || d.travel === 'zones')), together:!!(d.cores && d.travel === 'car' && d.together), first_place:d.cores && d.travel === 'car' && d.first && d.side.some(x => x.name === d.first) ? d.first : null, work_area:d.zone || null, work_date:date, deadline, notes:(saved.notes || '').trim() || null, street_m:d.streetM ? Math.round(d.streetM) : null,
        flyers:pl && (d.mainAll || (pl.eco && !d.exact) || (pl.cores && pl.mailboxes < d.flyers) || pl.budget) ? dbBoxes.total : d.flyers, quota_m30:quota, no_quota:saved.noQuota != null ? !!saved.noQuota : d.travel === 'car', work_days:d.days, work_hours:d.hours, est_mailboxes:dbBoxes.total, route_m:Math.round(pl.routes.reduce((s, r) => s + (r.length_m || 0), 0)) };
      let tk, old = null, savedAtomically = false;
      if(tkE){
        await loadLive(); if(A.live.some(r => r.task_id === tkE.id)) throw new Error(t('replanLive'));
        // one server transaction (replan_task_with_plans): the server checks open shifts again, keeps acceptance,
        // days, skips and links; a dry run first shows the admin anything that would be lost
        const res = await atomicReplan(sb, { taskId:tkE.id, task:row, plans:planRows(pl, { taskId:null, assign:d.assign, counts:dbBoxes.routes, colors:Planner.COLORS }), confirm:confirmBox, t });
        if(res.status === 'cancelled'){ const sv = $('#cSave'); if(sv){ sv.disabled = false; sv.classList.remove('loading'); } return; }
        if(res.status === 'ok'){
          tk = res.task; savedAtomically = true;
          for(const p of res.plans) if(p.worker_id) try{ await notifyReplanned(tk, p); }catch(err){ console.warn('notification_failed', err); }
        }else{
          // server function not installed yet: previous way (separate requests)
          // order already running: keep acceptance, days, skips and the link of walked sessions to each worker's route
          const { data:oldP } = await sb.from('task_plans').select('id,worker_id,status,work_dates,accepted_at,committed_terms,skipped').eq('task_id', tkE.id);
          const { data:oldR } = await sb.from('routes').select('id,worker_id').eq('task_id', tkE.id).limit(1);
          old = oldR && oldR.length ? (oldP || []) : null;
          const u = await sb.from('tasks').update(row).eq('id', tkE.id).select().single(); if(u.error) throw u.error; tk = u.data;
          const x1 = await sb.from('task_plans').delete().eq('task_id', tkE.id); if(x1.error) throw x1.error;
          const x2 = await sb.from('task_workers').delete().eq('task_id', tkE.id); if(x2.error) throw x2.error;
        }
      }else{
        // RPC is one PostgreSQL transaction: a route insert failure rolls back the task.
        const draftRows = planRows(pl, { taskId:null, assign:d.assign, counts:dbBoxes.routes, colors:Planner.COLORS });
        const { data, error } = await sb.rpc('create_task_with_plans', { p_task:row, p_plans:draftRows });
        if(error) throw error;
        tk = data && data.task;
        if(!tk || !(data.plans || []).length) throw new Error('Auftrag ohne Routen gespeichert: bitte Support kontaktieren');
        savedAtomically = true;
        // Notifications are best effort: a notification failure must never trigger
        // a retry of an order that already exists.
        for(const p of data.plans) if(p.worker_id) try{ await notifyAssigned(tk, p); }catch(err){ console.warn('notification_failed', err); }
      }
      const rows = savedAtomically ? [] : planRows(pl, { taskId:tk.id, assign:d.assign, counts:dbBoxes.routes, colors:Planner.COLORS });
      if(old){
        const skips = [...new Map(old.flatMap(p => p.skipped || []).map(x => [JSON.stringify(x), x])).values()];   // without duplicates: repeated re-plans must not multiply skips
        rows.forEach(r => {
          if(skips.length) r.skipped = skips;
          const o = old.find(p => p.worker_id && p.worker_id === r.worker_id && p.status === 'accepted'); if(!o) return;
          const need = (r.days || []).length || 1, dates = (o.work_dates || []).slice(0, need);
          if(dates.length >= need) Object.assign(r, { status:'accepted', work_dates:dates, accepted_at:o.accepted_at, committed_terms:o.committed_terms });
        });
      }
      if(!savedAtomically) await savePlans(tk, rows, !!old, () => { createdTaskId = null; });
      await loadTasks();
      clearDraft(); viewTask(tk.id);
    }catch(e){
      let message = e.message || String(e);
      if(createdTaskId){
        // Two independent REST inserts are not atomic. Best-effort cleanup prevents an empty new task after a failed plan insert.
        // An actual transaction requires a server-side RPC (tracked separately).
        const cleanup = [];
        try{ const { error } = await sb.from('task_plans').delete().eq('task_id', createdTaskId); if(error) cleanup.push(error.message); }catch(err){ cleanup.push(err.message); }
        try{ const { error } = await sb.from('task_workers').delete().eq('task_id', createdTaskId); if(error) cleanup.push(error.message); }catch(err){ cleanup.push(err.message); }
        try{ const { error } = await sb.from('tasks').delete().eq('id', createdTaskId); if(error) cleanup.push(error.message); }catch(err){ cleanup.push(err.message); }
        if(cleanup.length) message += ' — Cleanup fehlgeschlagen: ' + cleanup.join('; ');
      }
      if($('#cErr')) $('#cErr').textContent = message; else toast(message);
      const sv = $('#cSave'); if(sv){ sv.disabled = false; sv.classList.remove('loading'); }
    }
  }
  renderSheet();
  if(tkE) setStart(tkE.start_lat, tkE.start_lng);
  else restoreDraft();
}
// saves plans, links workers and sends each assigned worker a notification
async function savePlans(tk, rows, replanned, onPersisted = () => {}){
  if(!rows.length) throw new Error('Keine Routen zum Speichern vorhanden');
  const r = await sb.from('task_plans').insert(rows).select(); if(r.error) throw r.error;
  const ins = r.data || [];
  onPersisted(); // no rollback once the routes exist, even if links/notifications later fail
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
    <div class="steppers"><div><label class="f">${esc(t('deadline'))}</label><input class="in" type="date" id="eDeadline" value="${esc(tk.deadline ? String(tk.deadline).slice(0, 10) : '')}"></div><div><label class="f">${esc(t('hoursDay'))}</label><input class="in" type="number" id="eHours" min="1" max="12" step="0.5" value="${+tk.work_hours || 7}"></div></div>
    <label class="f">${esc(t('quota'))}</label><input class="in" type="number" id="eQuota" min="200" step="100" value="${tk.quota_m30 || 2000}">
    ${tk.travel === 'zones' ? '' : `<label class="f" for="eTravel">${esc(t('travelLbl'))}</label><select class="in" id="eTravel">${['bus', 'bike', 'car'].map(v => `<option value="${v}" ${(tk.travel || (tk.bike ? 'bike' : 'bus')) === v ? 'selected' : ''}>${esc(t('travel_' + v))}</option>`).join('')}</select>`}
    <label class="f">${esc(t('note'))}</label><textarea class="in" id="eNotes">${esc(tk.notes || '')}</textarea>
    <button class="btn primary" id="eSave" style="margin-top:12px">${esc(t('save'))}</button>
    ${!routes.length ? `<button class="btn ghost" id="eReplan">${esc(t('replan'))}</button>` : A.live.some(r => r.task_id === tk.id) ? `<p class="small muted">${esc(t('replanLive'))}</p>` : `<button class="btn ghost" id="eReplan">${esc(t('replanWork'))}</button><p class="small muted">${esc(t('replanWorkHint'))}</p>`}
    <button class="btn ghost" id="eClose">${esc(t('close'))}</button><div class="err" id="eErr"></div>`);
  mo.querySelector('#eClose').onclick = () => mo.remove();
  mo.querySelector('#eSave').onclick = async () => {
    const title = mo.querySelector('#eTitle').value.trim(); if(!title){ mo.querySelector('#eErr').textContent = t('needTitle'); return; }
    const { error } = await sb.from('tasks').update({ title:withCity(title, tk.city_name), deadline:mo.querySelector('#eDeadline').value || null, work_hours:Math.max(1, Math.min(12, parseFloat(mo.querySelector('#eHours').value) || 7)), quota_m30:Math.max(200, Math.round(+mo.querySelector('#eQuota').value || 2000)), notes:mo.querySelector('#eNotes').value.trim() || null, bike:mo.querySelector('#eTravel') ? mo.querySelector('#eTravel').value !== 'bus' : tk.bike, travel:mo.querySelector('#eTravel') ? mo.querySelector('#eTravel').value : tk.travel }).eq('id', tk.id);
    if(error){ mo.querySelector('#eErr').textContent = error.message; return; }
    // new quota → the hours of the routes follow (route length ÷ quota × 30 min), no new planning needed
    const q = Math.max(200, Math.round(+mo.querySelector('#eQuota').value || 2000));
    if(q !== (tk.quota_m30 || 2000)) for(const p of plans || []){
      const mm = (len, mb) => Math.round((len || 0) / q * 30 + (mb || 0) * 5 / 60);   // walking at the quota + 5 s per mailbox (as the planner)
      await sb.from('task_plans').update({ minutes:mm(p.length_m, p.mailboxes), days:Array.isArray(p.days) ? p.days.map(x => ({ ...x, minutes:mm(x.length_m, x.mailboxes) })) : p.days }).eq('id', p.id);
    }
    mo.remove(); await loadTasks(); toast(t('saved')); viewTask(tk.id);
  };
  const rp = mo.querySelector('#eReplan'); if(rp) rp.onclick = () => { mo.remove(); viewCreate({ tk, plans }); };
}
/* task detail: info + map + routes with status, worker assignment and progress */
const dayLines = (days, col, pid) => (days && days.length > 1) ? days.map((x, k) => `<span class="small day-line"><b><i class="dsw" style="background:${esc(routeColor(col))}"></i>${esc(t('dayN', { n:k + 1 }) + (x.place ? ' · ' + x.place : ''))}</b> ${esc(t('routeLine', { km:fmtDist(x.length_m), h:fmtHm(x.minutes), mb:fmtN(x.mailboxes) }))}${pid ? `<em class="day-pct" id="dp${pid}_${k}"></em>` : ''}</span>`).join('') : '';
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
  // mailboxes and distance of the whole order = all its routes (joined orders: every place, not only the first one)
  const livePl = (plans || []).filter(p => p.status !== 'declined');
  const estMb = livePl.length ? livePl.reduce((s, p) => s + (p.mailboxes || 0), 0) : tk.est_mailboxes, routeM = livePl.length ? livePl.reduce((s, p) => s + (p.length_m || 0), 0) : tk.route_m;
  const invite = w => t('invite', { name:w.name, title:tk.title, date:tk.work_date ? ', ' + fmtDay(tk.work_date) : '' });
  { const zb = livePl.flatMap(p => p.boxes || []); if(zb.length) setTimeout(() => zensusCompare(zb).then(c => { const el = $('#tZen'), h = zensusHtml(c); if(el && h){ $('#tZenB').innerHTML = h; el.style.display = ''; } }).catch(() => {}), 0); }
  // overview on top (16.11.2026 redesign): the state of the order at a glance, then the sections with an index
  const ps0 = (plans || []).filter(p => p.status !== 'declined'), due = dueInfo(tk), nAssigned = ps0.filter(p => p.worker_id).length;
  const reps = (plans || []).flatMap(p => workerSkips(p).filter(x => x.rep).map(x => ({ ...x, p })));
  const repOpen = reps.filter(x => !x.ok).length, lateN = (plans || []).filter(p => p.worker_id && p.status === 'accepted' && p.late_dates && !p.late_ok).length;
  const team = [...new Set((plans || []).filter(p => p.worker_id && p.status !== 'declined').map(p => p.worker_id))];
  const ov = (k, v, sub, cls) => `<div class="ov-t ${cls || ''}"><span>${esc(k)}</span><b>${v}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  shell('tasks', `${topbar(tk.title, true)}
    <div class="pad">
      <nav class="set-nav sec-nav" id="tNav" aria-label="${esc(t('secIndex'))}"></nav>
      <h2 class="sec" style="margin-top:4px" data-short="${esc(t('secOverview'))}">${esc(t('secOverview'))}</h2>
      <div class="ov-grid ov4">
        ${ov(t('colStatus'), statusPill(...taskState(tk)), '')}
        ${ov(t('deadline'), `<span class="due-${due.cls}">${esc(due.txt)}</span>`, '')}
        ${ov(t('colTeam'), `${team.length}`, ps0.length - nAssigned > 0 ? `<span class="due-warn">${esc(t('freeN', { n:ps0.length - nAssigned }))}</span>` : esc(t('ovAllAssigned')), '')}
        <button type="button" class="ov-t ov-btn ${repOpen + lateN ? 'warn' : ''}" id="tRepCard"><span>${esc(t('secReports'))}</span><b>${repOpen + lateN}</b><small>${repOpen + lateN ? `<span class="due-warn">${esc(t('ovToDecide'))}</span>` : esc(t('ovNothing'))}</small></button>
        <div class="ov-t"><span>${esc(t('progLbl'))}</span><b id="tProg">—</b><small>${esc(t('colProgress'))}: ${ps0.length ? `${ps0.filter(p => p.status === 'done').length} / ${ps0.length}` : '–'}</small></div>
        <div class="ov-t" id="tFlRow" ${tk.flyers_done != null ? '' : 'style="display:none"'}><span>${esc(t('handedLbl'))} <button class="link" id="tFlEdit" style="font-size:12px">${esc(t('adjust'))}</button></span><b id="tFl">${tk.flyers_done != null ? '≈ ' + fmtN(tk.flyers_done) + (tk.flyers ? ' / ' + fmtN(tk.flyers) : '') : ''}</b>${tk.flyers_done != null ? `<small>${esc(t('flDoneManual', { d:fmtDT(tk.flyers_done_at) }))}${(A.live || []).some(r => r.task_id === tk.id) ? ' · ' + esc(t('stillWorking')) : ''}</small>` : ''}</div>
        <div class="ov-t"><span>${esc(t('hoursLbl'))}</span><b id="tHrs">${taskHours(plans, routes)}</b></div>
        ${ov(t('walkedLbl'), esc(fmtDist(walked)), '')}
        ${ov(t('place'), esc([tk.district, tk.city_name].filter(Boolean).join(', ') || '—'), esc(fmtDay(tk.work_date)))}
        ${ov(t('flyers'), tk.flyers ? esc(fmtN(tk.flyers)) : '–', estMb ? esc(t('mbApprox', { n:fmtN(estMb) })) : '')}
        ${routeM ? ov(t('dist2'), esc(fmtDist(routeM)), '') : ''}
        ${tk.quota_m30 ? ov(t('quotaInfo'), `${fmtN(tk.quota_m30)} m / 30 ${esc(t('min'))}`, '') : ''}
        ${((tk.travel && tk.travel !== 'bus') || tk.bike) && tk.travel !== 'zones' ? ov(t('travelLbl'), esc(t('travel_' + (tk.travel || 'bike'))), '') : ''}
        ${(tk.side_towns || []).length ? ov(t('sideTitle'), esc(tk.side_towns.map(x => x.name + ' (' + fmtN(x.flyers) + ')').join(', ')), '', 'ov-wide') : ''}
        ${(tk.must_areas || []).length ? ov(t('mustTitle'), esc(tk.must_areas.map((a, k) => mName(mArea(a), k) + (mArea(a).n ? ' (' + fmtN(mArea(a).n) + ')' : '')).join(', ')), '', 'ov-wide') : ''}
        <div class="ov-t ov-wide" id="tZen" style="display:none"><span>${esc(t('zLabel'))}</span><b id="tZenB"></b><small>${esc(t('zHint'))}</small></div>
        ${tk.notes ? ov(t('note'), esc(tk.notes), '', 'ov-wide ov-text') : ''}
      </div>
      <div class="tool-row ov-acts"><button class="btn ghost small" id="tOnMap">${ICONS.map}${esc(t('showOnMap'))}</button><button class="btn ghost small" id="tRMap">${ICONS.route}${esc(t('rvBig'))}</button><button class="btn ghost small" id="tEdit2">${ICONS.edit}${esc(t('editTask'))}</button><button class="btn ghost small" id="tCustomerExport">${ICONS.map}${esc(t('customerGeoJSON'))}</button></div>
      <h2 class="sec" data-short="${esc(t('secMap'))}">${esc(t('secMapLong'))}</h2>
      <div class="mapbox" id="tMap" style="margin-top:0"></div>
      <div class="rinfo-row"><span>${statusPill(...taskState(tk))}</span><button class="btn ghost small" id="tBig">${ICONS.expand}${esc(t('rvBig'))}</button></div>
      <h2 class="sec" data-short="${esc(t('secRoutes'))}">${esc(t('routesOf'))}</h2>
      ${(plans || []).length > 1 ? `<p class="wz-total"><span>${esc(t('planTeamHours'))}</span><b>≈ ${esc(fmtHm((plans || []).reduce((a, p) => a + (p.minutes || 0), 0)))} ${esc(t('h'))} · ${esc(t('routesN', { n:plans.length }))}</b></p>` : ''}
      ${(() => { // joined orders: every colour appears several times – one person for all routes of a colour
        const cols = []; (plans || []).forEach(p => { if(p.color && !cols.includes(p.color)) cols.push(p.color); });
        if(!plans || cols.length === plans.length) return '';
        return `<div class="card colorassign"><b>${esc(t('byColorTitle'))}</b><p class="small muted" style="margin:2px 0 8px">${esc(t('byColorHint'))}</p>${cols.map(c => {
          const ps = plans.filter(p => p.color === c), ws = [...new Set(ps.map(p => p.worker_id || ''))], cur = ws.length === 1 ? ws[0] : null;
          return `<div class="ca-row"><span class="ca-dot" style="background:${c}"></span><span class="small">${esc(t('byColorN', { n:ps.length }))}</span><select class="in small" data-color="${c}">${cur == null ? `<option value="__" selected>${esc(t('byColorMixed'))}</option>` : ''}${workerOptions(tk.start_lat, tk.start_lng, cur)}</select></div>`; }).join('')}</div>`; })()}
      ${(() => { const by = {}; (plans || []).forEach(p => { if(p.worker_id) (by[p.worker_id] = by[p.worker_id] || []).push(p); });
        return Object.entries(by).filter(([, ps]) => ps.length > 1).map(([wid, ps]) => { const w = wById(wid);
          return `<div class="hint" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="grow">${esc(t('mergeHint', { n:w ? w.name : '?', k:ps.length }))}</span><button class="btn primary small" data-merge="${wid}">${ICONS.route}${esc(t('mergeBtn'))}</button></div>`; }).join(''); })()}
      ${(plans || []).length ? (() => {
        // routes being walked right now come first (newest start on top), the rest keeps the route order
        const liveAt = p => Math.max(0, ...(routes || []).filter(r => r.plan_id === p.id && !r.ended_at).map(r => +new Date(r.started_at)));
        return plans.slice().sort((a, b) => (liveAt(b) > 0) - (liveAt(a) > 0) || liveAt(b) - liveAt(a) || a.idx - b.idx);
      })().map(p => { const w = wById(p.worker_id); return `<div class="route-row"><span class="swatch" style="background:${esc(p.color || '#2563EB')}"></span>
        <div class="grow"><b>${esc(t('planRoute', { n:p.idx + 1 }))} <span class="muted" id="pp${p.idx}"></span></b>
        <span>${esc(t('routeLine', { km:fmtDist(p.length_m), h:fmtHm(p.minutes || 0), mb:fmtN(p.mailboxes || 0) }))}${(() => { const fl = (p.boxes || []).reduce((a, b) => a + (+b[2] || 0), 0); return fl && fl !== (p.mailboxes || 0) ? ' · <b>' + esc(t('routeFlyers', { n:fmtN(fl) })) + '</b>' : ''; })()}</span>
        ${dayLines(p.days, p.color, p.idx)}<span class="small" id="prest${p.idx}" style="font-weight:600"></span><button class="link small hidden" id="pred${p.idx}" data-reday="${p.id}" style="align-self:flex-start">${ICONS.calendar}${esc(t('redayBtn'))}</button>
        <div class="bar"><i id="pb${p.idx}"></i></div><span id="pf${p.idx}" style="margin-top:4px"></span><span class="small" id="pw${p.idx}">${planWalked(p, routes)}</span>${prevWorkers(p, routes)}
        ${p.worker_id ? `<div class="rr-status"><span class="pill ${(A.live || []).some(r => r.plan_id === p.id && !r.paused_at) ? 'live' : stCls(p)}">${(A.live || []).some(r => r.plan_id === p.id && !r.paused_at) ? esc(t('stLive')) + ' · ' : ''}${esc(stText(p))}${p.status === 'accepted' && (p.work_dates || []).length ? ' · ' + esc(p.work_dates.map(fmtDay).join(', ')) : ''}</span>${p.status === 'accepted' ? `<button class="link small" data-dates="${p.id}">${ICONS.edit}${esc(t('chgDates'))}</button>` : ''}</div>` : ''}
        ${p.worker_id && p.status === 'accepted' && p.late_dates && !p.late_ok ? `<div class="warnbox" style="margin:6px 0 0">${esc(t('lateAsk', { dl:fmtDay(tk.deadline), dates:(p.work_dates || []).map(fmtDay).join(', ') }))}<div class="tool-row" style="margin-top:6px"><button class="btn primary small" data-lateok="${p.id}">${esc(t('lateOk'))}</button><button class="btn ghost small" data-lateno="${p.id}">${esc(t('lateNo'))}</button></div></div>` : ''}
        ${w ? `<button class="rr-worker" data-wk="${w.id}">${avatar()}<span class="grow"><b>${esc(w.name)}</b><small>${esc(t('openWorker'))}</small></span><span class="rr-chev">›</span></button>
        <div class="rr-btns"><a class="btn ghost small" target="_blank" rel="noopener" href="${waLink(w.phone, invite(w))}">${ICONS.chat}${esc(t('write'))}</a><button class="btn ghost small" data-swap="${p.id}">${ICONS.users}${esc(t('swapWorker'))}</button></div>` : ''}
        <div class="rr-swap" id="sw${p.id}" ${w && !(isCoord() && p.status === 'declined') ? 'hidden' : ''}><select class="in small" data-plan="${p.id}">${workerOptions(tk.start_lat, tk.start_lng, p.worker_id)}</select><span class="small muted">${esc(t('replaceHint'))}</span></div></div></div>`; }).join('') : `<p class="muted small">${esc(t('noPlans'))}</p>`}
      <h2 class="sec">${esc(t('secTeam'))}</h2>
      ${team.length ? `<div class="list-card">${team.map(wid => { const w = wById(wid), mine = (plans || []).filter(p => p.worker_id === wid && p.status !== 'declined'), live = (A.live || []).some(r => r.worker_id === wid && r.task_id === id && !r.paused_at);
        return `<button class="lc-row" data-wk="${wid}">${avatar(w ? w.name : '?', live ? 'live' : '')}<span class="grow"><b>${esc(w ? w.name : '?')}</b><small class="muted">${esc(mine.map(p => t('planRoute', { n:p.idx + 1 }) + ' · ' + stText(p)).join(' · '))}${live ? ' · ' + esc(t('stLive')) : ''}</small></span>${ICONS.chevron}</button>`; }).join('')}</div>` : `<p class="muted small">${esc(t('teamNone'))}</p>`}
      <h2 class="sec">${esc(t('secDates'))}</h2>
      <div class="list-card">
        <div class="lc-row static"><span class="grow"><b>${esc(t('deadline'))}</b><small class="due-${due.cls}">${esc(due.txt)}</small></span></div>
        ${ps0.map(p => { const w = wById(p.worker_id), ds = p.work_dates || [], late = p.late_dates && !p.late_ok;
          return `<div class="lc-row static"><span class="swatch" style="background:${esc(p.color || '#2563EB')}"></span><span class="grow"><b>${esc(t('planRoute', { n:p.idx + 1 }))}${w ? ' · ' + esc(w.name) : ''}</b><small class="${late ? 'err' : 'muted'}">${esc(ds.length ? ds.map(fmtDay).join(', ') : p.worker_id ? t('datesOpen') : t('datesNoWorker'))}${late ? ' · ' + esc(t('lateBadge')) : ''}</small></span></div>`; }).join('')}
      </div>
      <h2 class="sec">${esc(t('secReports'))}</h2>
      <div id="tReports">${reps.length || lateN ? `<div class="list-card">${reps.map(x => `<div class="lc-row static"><span class="rep-dot ${x.ok ? 'ok' : ''}" aria-hidden="true"></span><span class="grow"><b>${esc(t(x.ok ? 'rvRepOk' : 'rvReported'))}</b><small class="muted">${esc([t('planRoute', { n:x.p.idx + 1 }), x.why ? (t('hr_' + x.why) === 'hr_' + x.why ? x.why : t('hr_' + x.why)) : '', x.by, x.at ? fmtDT(x.at) : ''].filter(Boolean).join(' · '))}</small></span></div>`).join('')}
        ${lateN ? `<div class="lc-row static"><span class="rep-dot" aria-hidden="true"></span><span class="grow"><b>${esc(t('lateBadge'))}</b><small class="muted">${esc(t('repLateHint', { n:lateN }))}</small></span></div>` : ''}</div>
        ${repOpen ? `<button class="btn ghost small" id="tRepGo" style="margin-top:8px">${ICONS.route}${esc(t('repDecide'))}</button>` : ''}` : `<p class="muted small">${esc(t('repNone'))}</p>`}<div id="tHelp"></div></div>
      <div class="tool-row" style="margin-top:20px"><button class="btn ghost small" id="tEdit">${ICONS.edit}${esc(t('editTask'))}</button><button class="btn ghost small" id="tDone">${ICONS.check}${esc(tk.status === 'open' ? t('finish') : t('reopen'))}</button></div>
      ${A.company && A.company.master ? `<button class="btn ghost small" id="tMerge" style="margin-top:8px;width:auto">${ICONS.plus}${esc(t('mergeTasks'))}</button>` : ''}
      <p class="danger-row">${tk.status === 'open' ? `<button class="link" id="tCancel">${esc(t('cancelTask'))}</button><span aria-hidden="true">·</span>` : ''}<button class="link danger-text" id="tDel">${esc(t('del'))}</button></p>
    </div>`); setLoc('task/' + id);
  bindBack(viewTasks);
  $('#tCustomerExport').onclick = () => {
    const geo = customerGeoJSON(tk, livePl);
    const blob = new Blob([JSON.stringify(geo, null, 2)], { type:'application/geo+json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'FlyerMap-Kundengebiet.geojson'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const m = makeMap($('#tMap'), [tk.start_lat, tk.start_lng], 14);
  let b = L.latLngBounds([[tk.start_lat, tk.start_lng]]);
  if(tk.zone_polygon){ const z = L.polygon(tk.zone_polygon, { color:css('--brand'), weight:2, fillOpacity:.06, interactive:false }).addTo(m); b = z.getBounds(); }
  drawTowns(m, tk, 2);
  if(tk.work_area) L.polygon(tk.work_area, { color:'#7C3AED', weight:2, dashArray:'10 6', fillOpacity:.03, interactive:false }).addTo(m);
  (plans || []).forEach(p => { if(!(p.path?.length > 1)) return; const ds = (p.days || []).length > 1 ? p.days : [{ i0:0, i1:p.path.length - 1 }];
    ds.forEach((d, k) => L.polyline(Planner.pathRuns(p.path.slice(d.i0, d.i1 + 1)), { color:routeColor(p.color), weight:4, opacity:.7, dashArray:dayPattern(k).dash }).addTo(m)); });
  drawSkips(m, plans);
  (plans || []).forEach(p => drawJumps(m, p.path, (tk.travel || (tk.bike ? 'bike' : 'bus')), rideMinOf(plans), ridesOf([p])));
  const doneLayer = L.layerGroup().addTo(m);
  L.marker([tk.start_lat, tk.start_lng], { icon:dot('pin-start', 24) }).addTo(m);
  liveWorkers(L.layerGroup().addTo(m), tk, plans, () => true);
  fit(m, b, 16);
  const assignPlan = async (p, wid) => {
    if(isCoord()){
      if(!wid || (p.worker_id && p.status !== 'declined')){ toast(t('coordFreeOnly')); return false; }
      let left = null; const tr = PLAN_TR[p.id];
      if(tr && p.days && p.days.length > 1){ try{ left = Math.max(1, dayProgress(p, tr).filter(x => x < 95).length); }catch{} }
      const { error } = await sb.rpc('coord_assign_plan', { p_plan:p.id, p_worker:wid, p_days_left:left, p_title:t('newTaskTitle', { title:tk.title }),
        p_body:t('newTaskBody', { date:tk.work_date ? fmtDay(tk.work_date) + ' · ' : '', mb:fmtN(p.mailboxes || 0), km:fmtDist(p.length_m || 0) }) });
      if(error){ toast(/plan_not_free/.test(error.message || '') ? t('coordFreeOnly') : errText(error)); return false; }
      p.worker_id = wid; p.status = 'offered'; return true;
    }
    // a new worker takes over the rest of the route: progress stays with the plan
    // the successor only picks dates for the days that are not done yet
    let left = null; const tr = PLAN_TR[p.id];
    if(tr && p.days && p.days.length > 1){ try{ left = Math.max(1, dayProgress(p, tr).filter(x => x < 95).length); }catch{} }
    const { error } = await sb.from('task_plans').update({ worker_id:wid, status:'offered', work_dates:[], accepted_at:null, days_left:left }).eq('id', p.id);
    if(error){ toast(error.message); return false; }
    // the previous worker no longer sees the order (his km, hours and tracks stay saved with the route)
    if(p.worker_id && p.worker_id !== wid && !plans.some(x => x.id !== p.id && x.worker_id === p.worker_id)) await sb.from('task_workers').delete().eq('task_id', id).eq('worker_id', p.worker_id);
    if(wid){
      await sb.from('task_workers').upsert({ task_id:id, worker_id:wid }, { onConflict:'task_id,worker_id', ignoreDuplicates:true });
      await notifyAssigned(tk, { ...p, worker_id:wid });
    }
    p.worker_id = wid; return true;
  };
  document.querySelectorAll('[data-plan]').forEach(sel => sel.onchange = async () => {
    const p = plans.find(x => x.id === sel.dataset.plan); if(!p) return;
    if(await assignPlan(p, sel.value || null)){ await loadTasks(); toast(t('saved')); viewTask(id); }
  });
  // one person for all routes of a colour (orders that were joined)
  document.querySelectorAll('[data-color]').forEach(sel => sel.onchange = async () => {
    if(sel.value === '__') return; const wid = sel.value || null; sel.disabled = true;
    let ok = true; for(const p of plans.filter(x => x.color === sel.dataset.color)) if((p.worker_id || null) !== wid && !await assignPlan(p, wid)){ ok = false; break; }
    await loadTasks(); if(ok) toast(t('saved')); viewTask(id);
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
  // dates after the deadline: the admin approves them or sends the route back to the worker to pick other dates
  document.querySelectorAll('[data-lateok]').forEach(bt => bt.onclick = async () => { bt.disabled = true; const { error } = await sb.from('task_plans').update({ late_ok:true }).eq('id', bt.dataset.lateok); if(error){ toast(errText(error)); bt.disabled = false; return; } toast(t('saved')); viewTask(id); });
  document.querySelectorAll('[data-lateno]').forEach(bt => bt.onclick = async () => {
    const p = plans.find(x => x.id === bt.dataset.lateno); if(!p || !await confirmBox(t('lateNo'), t('lateNoQ', { dl:fmtDay(tk.deadline) }), t('lateNo'))) return;
    const { error } = await sb.from('task_plans').update({ status:'offered', work_dates:[], accepted_at:null }).eq('id', p.id); if(error){ toast(errText(error)); return; }
    await sb.from('notifications').insert({ worker_id:p.worker_id, kind:'assigned', task_id:id, plan_id:p.id, title:t('lateNoTitle', { title:tk.title }), body:t('lateNoBody', { dl:fmtDay(tk.deadline) }) });
    toast(t('saved')); viewTask(id);
  });
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
      await sb.from('task_plans').update({ late_ok:true }).eq('id', p.id);   // dates the admin sets himself need no approval
      await sb.from('notifications').insert({ worker_id:p.worker_id, kind:'assigned', task_id:id, plan_id:p.id, title:t('datesChangedTitle', { title:tk.title }), body:dates.map(fmtDay).join(', ') });
      mo.remove(); toast(t('saved')); viewTask(id);
    };
  });
  $('#tBig').onclick = () => viewTaskMap(id, () => viewTask(id));
  $('#tRMap').onclick = () => viewTaskMap(id, () => viewTask(id)); if($('#tRepGo')) $('#tRepGo').onclick = () => viewTaskMap(id, () => viewTask(id));
  // the "Meldungen" tile: reported pieces → straight to the route map where they are decided, otherwise to the section
  $('#tRepCard').onclick = () => { if(repOpen && !lateN) return viewTaskMap(id, () => viewTask(id)); const el = $('#tReports'); if(el) el.scrollIntoView({ behavior:'smooth', block:'start' }); };
  $('#tOnMap').onclick = () => showOnMap({ kind:'task', id }); $('#tEdit2').onclick = () => $('#tEdit').click();
  secNav($('#tNav'));
  // help requests that belong to this order
  loadHelp().then(list => { const box = $('#tHelp'), mine = list.filter(h => h.task_id === id && h.status === 'open'); if(!box || !mine.length) return;
    box.innerHTML = `<button class="help-box" id="tHelpGo" style="margin-top:8px">${ICONS.chat}<span>${esc(t('helpInbox'))}</span><span class="cnt">${esc(t('helpInboxN', { n:mine.length }))}</span></button>`; $('#tHelpGo').onclick = () => viewHelpInbox(); });
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
    const tr = addSkips(Planner.makeTracker(p.path), p), kb = keptBoxes(p), ct = kb.length ? Planner.makeBoxCounter(kb) : null;
    allTracks.forEach(pts => { tr.addTrack(pts); if(ct) ct.visitAll(pts); });
    if(ct) adminDone(p).forEach(pts => ct.visitAll(pts));
    PLAN_TR[p.id] = tr;
    { const L = Math.max(0, (p.length_m || 0) - removedLen(p)); PROG._d = (PROG._d || 0) + effPct(tr, p) * L; PROG._l = (PROG._l || 0) + L; if(PROG._l) { PROG.r = PROG._d / PROG._l; showProg(); } }
    // per day: done or how far; and what is still open (what a new worker gets)
    try{
      const ds = p.days && p.days.length > 1 ? p.days : [{ minutes:p.minutes, length_m:p.length_m }], dp = p.days && p.days.length > 1 ? dayProgress(p, tr) : [tr.pct()];
      dp.forEach((x, k) => { const el = $('#dp' + p.idx + '_' + k); if(el) el.textContent = x >= 95 ? ' · ✓ ' + t('dayDone') : ' · ' + Math.round(x) + ' % · ' + t('openH', { h:fmtHm((ds[k].minutes || 0) * (1 - x / 100)) }); });
      const restMin = ds.reduce((a, d, k) => a + (d.minutes || 0) * (dp[k] >= 95 ? 0 : 1 - (dp[k] || 0) / 100), 0), restM = ds.reduce((a, d, k) => a + (d.length_m || 0) * (dp[k] >= 95 ? 0 : 1 - (dp[k] || 0) / 100), 0);
      const re = $('#prest' + p.idx); if(re) re.textContent = restMin > 1 ? t('restLine', { km:fmtDist(restM), h:fmtHm(restMin) }) : t('restNone');
      const rb = $('#pred' + p.idx); if(rb && restMin > 1 && dp.some(x => x > 0)) rb.classList.remove('hidden');
    }catch{}   // also streets of this route walked by somebody else
    tr.runs().forEach(run => L.polyline(run, { color:GREEN_C(), weight:6, opacity:.95 }).addTo(doneLayer));
    removedOf(p).forEach(x => L.polyline(x.pts, { color:'#94A3B8', weight:8, opacity:.95, dashArray:'4 8', lineCap:'round', interactive:false }).addTo(doneLayer));   // removed sections: grey, not green
    const pct = effPct(tr, p); const el = $('#pp' + p.idx); if(el) el.textContent = '· ' + t('done', { p:pct }); const bar = $('#pb' + p.idx); if(bar) bar.style.width = pct + '%';
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
  const demoBoxes = savedMailboxCounts(pl.routes);
  const { data:tk, error } = await sb.from('tasks').insert({ title:DEMO_TASK.title, city_name:DEMO_TASK.city, district:DEMO_TASK.district, start_lat:DEMO_TASK.lat, start_lng:DEMO_TASK.lng, walk_minutes:15, zone_polygon:pl.zone, work_date:today,
    notes:DEMO_TASK.notes[I.lang] || DEMO_TASK.notes.de, created_by:A.user.id, street_m:g.street_m, flyers:DEMO_TASK.flyers, quota_m30:2000, work_days:2, work_hours:7, est_mailboxes:demoBoxes.total, route_m:pl.routes.reduce((x, r) => x + r.length_m, 0) }).select().single();
  if(error) throw error;
  const r = await sb.from('task_plans').insert(pl.routes.map((x, i) => ({ task_id:tk.id, idx:i, worker_id:rows[i].id, color:Planner.COLORS[i], path:x.path, length_m:x.length_m, street_m:x.street_m, mailboxes:demoBoxes.routes[i], boxes:x.boxes, minutes:x.minutes, days:x.days, steps:x.steps, status:'accepted', work_dates:[today, tomorrow] })));
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

