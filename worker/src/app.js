import { Capacitor, registerPlugin } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { App } from '@capacitor/app';
import L from 'leaflet';

const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');
const NATIVE = Capacitor.isNativePlatform();

const SB_URL = 'https://xobrvfkwqessbkdwiavu.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhvYnJ2Zmt3cWVzc2JrZHdpYXZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2NzA4NTQsImV4cCI6MjEwODI0Njg1NH0.5AvLRyZaiqpYQV_O47o7MNO8kg7BEZdiU4-WYSPuNBM';
const TILES = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const TILE_ATTR = '© OpenStreetMap © CARTO';
const PRIVACY_URL = 'https://urlose.github.io/flyermap/privacy.html';

/* ================= i18n ================= */
const T = {
  ru: {
    welcomeTitle:'Раздача флаеров', welcomeText:'Зарегистрируйтесь один раз — дальше приложение помнит вас. Админ увидит ваш профиль и сможет присылать задания.',
    register:'Зарегистрироваться', haveAccount:'У меня уже есть аккаунт',
    name:'Имя и фамилия', phone:'Телефон / WhatsApp', cities:'Города, где можете работать', citySearch:'Начните вводить город',
    pin:'PIN-код из 4 цифр', pinHint:'Нужен только чтобы восстановить аккаунт на новом телефоне.', create:'Создать профиль', back:'Назад',
    loginTitle:'Вход', loginText:'Введите телефон и PIN, которые указали при регистрации.', login:'Войти',
    hi:'Привет', tasks:'Ваши задания', noTasks:'Пока нет заданий. Когда админ назначит вас, задание появится здесь.', refresh:'Обновить',
    freeRoute:'Начать маршрут без задания', profile:'Профиль',
    today:'сегодня', tomorrow:'завтра', noDate:'без даты', walk:'мин пешком',
    zone:'Зона раздачи', covered:'Уже пройдено', yourRoute:'Ваш маршрут', start:'Точка старта',
    startBtn:'Старт', directions:'Как добраться до старта',
    recording:'Идёт запись', time:'Время', dist:'Пройдено', stop:'Закончить',
    stopQ:'Закончить маршрут?', stopText:'Маршрут сохранится и уйдёт админу.', stopYes:'Да, закончить', cancel:'Отмена',
    synced:'Всё отправлено', pending:'Не отправлено точек: {n}. Отправятся, когда появится интернет',
    bgTitle:'FlyerMap записывает маршрут', bgMsg:'Нажмите, чтобы открыть приложение',
    locDenied:'Нет доступа к геопозиции', locDeniedText:'Откройте Настройки → FlyerMap → Геопозиция и выберите «При использовании» или «Всегда». Без этого маршрут не записывается.', openSettings:'Открыть настройки',
    saveProfile:'Сохранить', logout:'Выйти из аккаунта', logoutQ:'Выйти? Чтобы войти снова, понадобятся телефон и PIN.', saved:'Сохранено', privacy:'Политика конфиденциальности', delAcc:'Удалить аккаунт', delAccQ:'Удалить профиль и все ваши маршруты навсегда? Это нельзя отменить.', delAccYes:'Удалить навсегда', regAgree:'Регистрируясь, вы соглашаетесь с',
    language:'Язык',
    e_name_required:'Введите имя', e_phone_required:'Введите номер телефона', e_pin_4_digits:'PIN — ровно 4 цифры', e_city_required:'Добавьте хотя бы один город',
    e_phone_exists:'Этот номер уже зарегистрирован. Нажмите «У меня уже есть аккаунт».', e_wrong:'Неверный телефон или PIN',
    e_too_many_attempts:'Слишком много попыток. Подождите 15 минут.', e_net:'Нет интернета. Попробуйте ещё раз.', e_invalid_token:'Ваш профиль удалён админом. Зарегистрируйтесь заново.',
    e_search:'Поиск городов недоступен', notFound:'Ничего не найдено',
    gpsWait:'Ищу GPS-сигнал…', onRoute:'Вы на маршруте', demoWalk:'Демо-прогулка', demoStop:'Остановить демо', demoRunning:'Демо: идём по улицам…', webNote:'Веб-версия для демонстрации. В приложении для iPhone маршрут пишется и при заблокированном экране.',
  },
  de: {
    welcomeTitle:'Flyer verteilen', welcomeText:'Einmal registrieren — danach merkt sich die App dich. Der Admin sieht dein Profil und schickt dir Aufträge.',
    register:'Registrieren', haveAccount:'Ich habe schon ein Konto',
    name:'Vor- und Nachname', phone:'Telefon / WhatsApp', cities:'Städte, in denen du arbeiten kannst', citySearch:'Stadt eingeben',
    pin:'4-stellige PIN', pinHint:'Nur nötig, um dein Konto auf einem neuen Handy wiederherzustellen.', create:'Profil erstellen', back:'Zurück',
    loginTitle:'Anmelden', loginText:'Gib Telefonnummer und PIN aus der Registrierung ein.', login:'Anmelden',
    hi:'Hallo', tasks:'Deine Aufträge', noTasks:'Noch keine Aufträge. Sobald der Admin dich einteilt, erscheint der Auftrag hier.', refresh:'Aktualisieren',
    freeRoute:'Route ohne Auftrag starten', profile:'Profil',
    today:'heute', tomorrow:'morgen', noDate:'ohne Datum', walk:'Min. zu Fuß',
    zone:'Verteilgebiet', covered:'Schon gelaufen', yourRoute:'Deine Route', start:'Startpunkt',
    startBtn:'Los geht\'s', directions:'Weg zum Startpunkt',
    recording:'Aufnahme läuft', time:'Zeit', dist:'Strecke', stop:'Feierabend',
    stopQ:'Route beenden?', stopText:'Die Route wird gespeichert und an den Admin gesendet.', stopYes:'Ja, beenden', cancel:'Abbrechen',
    synced:'Alles gesendet', pending:'{n} Punkte warten — werden gesendet, sobald Internet da ist',
    bgTitle:'FlyerMap zeichnet deine Route auf', bgMsg:'Tippen, um die App zu öffnen',
    locDenied:'Kein Zugriff auf den Standort', locDeniedText:'Öffne Einstellungen → FlyerMap → Standort und wähle „Beim Verwenden" oder „Immer". Ohne das wird keine Route aufgezeichnet.', openSettings:'Einstellungen öffnen',
    saveProfile:'Speichern', logout:'Abmelden', logoutQ:'Abmelden? Zum erneuten Anmelden brauchst du Telefon und PIN.', saved:'Gespeichert', privacy:'Datenschutzerklärung', delAcc:'Konto löschen', delAccQ:'Profil und alle deine Routen endgültig löschen? Das kann nicht rückgängig gemacht werden.', delAccYes:'Endgültig löschen', regAgree:'Mit der Registrierung akzeptierst du die',
    language:'Sprache',
    e_name_required:'Bitte Namen eingeben', e_phone_required:'Bitte Telefonnummer eingeben', e_pin_4_digits:'PIN muss genau 4 Ziffern haben', e_city_required:'Mindestens eine Stadt hinzufügen',
    e_phone_exists:'Diese Nummer ist schon registriert. Tippe auf „Ich habe schon ein Konto".', e_wrong:'Telefon oder PIN falsch',
    e_too_many_attempts:'Zu viele Versuche. Bitte 15 Minuten warten.', e_net:'Kein Internet. Bitte nochmal versuchen.', e_invalid_token:'Dein Profil wurde vom Admin gelöscht. Bitte neu registrieren.',
    e_search:'Städtesuche nicht verfügbar', notFound:'Nichts gefunden',
    gpsWait:'Suche GPS-Signal…', onRoute:'Du bist unterwegs', demoWalk:'Demo-Spaziergang', demoStop:'Demo stoppen', demoRunning:'Demo: unterwegs durch die Straßen…', webNote:'Web-Version zur Vorführung. In der iPhone-App wird die Route auch bei gesperrtem Bildschirm aufgezeichnet.',
  }
};
let LANG = 'ru';
const t = (k, v={}) => (T[LANG][k] ?? T.ru[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => v[x]);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $ = s => document.querySelector(s);

/* ================= storage ================= */
const store = {
  async get(k){ try{ const { value } = await Preferences.get({ key:k }); return value ? JSON.parse(value) : null; }catch{ return null; } },
  async set(k,v){ try{ await Preferences.set({ key:k, value:JSON.stringify(v) }); }catch{} },
  async del(k){ try{ await Preferences.remove({ key:k }); }catch{} },
};

/* ================= API ================= */
class ApiError extends Error {}
async function rpc(fn, body){
  let r;
  try{
    r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, { method:'POST',
      headers:{ apikey:SB_KEY, Authorization:'Bearer '+SB_KEY, 'Content-Type':'application/json' }, body:JSON.stringify(body) });
  }catch{ throw new ApiError('net'); }
  const txt = await r.text(); let data = null; try{ data = txt ? JSON.parse(txt) : null; }catch{}
  if(!r.ok){ throw new ApiError((data && data.message) || 'net'); }
  return data;
}
const errText = e => { const k = 'e_'+(e && e.message); return T.ru[k] ? t(k) : t('e_net'); };

/* ================= geo ================= */
function hav(a,b,c,d){ const R=6371000,r=Math.PI/180,x=Math.sin((c-a)*r/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin((d-b)*r/2)**2; return 2*R*Math.asin(Math.sqrt(x)); }
async function searchCities(q){
  const u = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=7&lang=de&lat=51.2&lon=7.0&osm_tag=place:city&osm_tag=place:town&osm_tag=place:village&osm_tag=place:suburb`;
  const r = await fetch(u); if(!r.ok) throw new Error('search');
  const j = await r.json();
  return j.features.map(f => ({ name:f.properties.name, sub:[f.properties.state, f.properties.country].filter(Boolean).join(', '),
    lat:+f.geometry.coordinates[1].toFixed(5), lng:+f.geometry.coordinates[0].toFixed(5) }));
}
const fmtDist = m => m >= 1000 ? (m/1000).toFixed(2).replace('.', ',') + ' km' : Math.round(m) + ' m';
const fmtTime = ms => { const s=Math.max(0,Math.floor(ms/1000)); const h=Math.floor(s/3600), m=Math.floor(s%3600/60), x=s%60; return (h? h+':' : '') + String(m).padStart(h?2:1,'0') + ':' + String(x).padStart(2,'0'); };
function fmtDay(d){
  if(!d) return t('noDate');
  const day = new Date(d+'T00:00:00'), now = new Date(); now.setHours(0,0,0,0);
  const diff = Math.round((day - now)/864e5);
  if(diff === 0) return t('today'); if(diff === 1) return t('tomorrow');
  return day.toLocaleDateString(LANG==='ru'?'ru-RU':'de-DE', { weekday:'short', day:'numeric', month:'short' });
}

/* ================= state ================= */
const S = { token:null, me:null, route:null, queue:[], track:[], busy:false, watcherId:null, map:null, timer:null, view:null };
/* route = { id|null, localId, taskId|null, startedAt(ms), endedAt(ms)|null, distance } */

async function saveRoute(){ await store.set('route', S.route); await store.set('queue', S.queue); await store.set('track', S.track.slice(-6000)); }

/* ================= sync ================= */
async function flush(){
  if(S.busy || !S.token || !S.route) return;
  S.busy = true;
  try{
    const r = S.route;
    if(!r.id){
      r.id = await rpc('start_route', { p_token:S.token, p_task_id:r.taskId, p_started_at:new Date(r.startedAt).toISOString() });
      await saveRoute();
    }
    while(S.queue.length){
      const batch = S.queue.slice(0, 300);
      await rpc('push_points', { p_token:S.token, p_route_id:r.id, p_points:batch });
      S.queue.splice(0, batch.length);
      await store.set('queue', S.queue);
    }
    if(r.endedAt){
      await rpc('end_route', { p_token:S.token, p_route_id:r.id, p_ended_at:new Date(r.endedAt).toISOString() });
      S.route = null; S.queue = []; S.track = [];
      await store.del('route'); await store.del('queue'); await store.del('track');
    }
  }catch(e){
    if(e.message === 'invalid_token'){ await forceLogout(t('e_invalid_token')); }
  }finally{
    S.busy = false; updateSync();
  }
}
setInterval(flush, 20000);

/* ================= location ================= */
function onLocation(lat, lng, acc, time, sim){
  if(!S.route || S.route.endedAt) return;
  if(S.sim && !sim) return;                                    // during demo walk ignore real GPS
  if(acc != null && acc > 50) { setGpsStatus(false); return; }
  setGpsStatus(true);
  const last = S.track[S.track.length-1];
  if(last && sim === 'first'){ /* demo jumps to its own start: no distance, no jump check */ }
  else if(last){
    const d = hav(last[0], last[1], lat, lng), dt = (time - last[2]) / 1000;
    if(dt <= 0) return;
    if(d < 4) { moveMe(lat, lng); return; }                  // standing still
    if(dt < 30 && d / dt > 12) return;                         // GPS jump (>43 km/h)
    S.route.distance += d;
  }
  S.track.push([lat, lng, time]);
  S.queue.push({ t:new Date(time).toISOString(), lat:+lat.toFixed(6), lng:+lng.toFixed(6), acc: acc==null?null:Math.round(acc) });
  saveRoute();
  drawTrack(); moveMe(lat, lng, true); updateSync();
  if(S.queue.length >= 25) flush();
}

/* ================= demo walk (web prototype) ================= */
function decodePolyline6(str){
  let i = 0, lat = 0, lng = 0; const out = [];
  while(i < str.length){
    for(const k of [0,1]){
      let b, shift = 0, res = 0;
      do{ b = str.charCodeAt(i++) - 63; res |= (b & 0x1f) << shift; shift += 5; } while(b >= 0x20);
      const d = (res & 1) ? ~(res >> 1) : (res >> 1);
      if(k === 0) lat += d; else lng += d;
    }
    out.push([lat / 1e6, lng / 1e6]);
  }
  return out;
}
function densify(pts, step){
  const out = [pts[0]];
  for(let i = 1; i < pts.length; i++){
    const [a, b] = [pts[i-1], pts[i]], d = hav(a[0], a[1], b[0], b[1]), n = Math.max(1, Math.round(d / step));
    for(let k = 1; k <= n; k++) out.push([a[0] + (b[0]-a[0]) * k/n, a[1] + (b[1]-a[1]) * k/n]);
  }
  return out;
}
async function demoPath(lat, lng){
  const R = 380, rot = Math.random() * Math.PI * 2, mPerLat = 111320, mPerLng = 111320 * Math.cos(lat * Math.PI / 180);
  const wp = [0,1,2,3].map(i => { const a = rot + i * Math.PI / 2, r = R * (0.75 + Math.random() * 0.5); return { lat: lat + r * Math.cos(a) / mPerLat, lon: lng + r * Math.sin(a) / mPerLng }; });
  try{
    const q = { locations:[{ lat, lon:lng }, ...wp, { lat, lon:lng }], costing:'pedestrian' };
    const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 10000);
    const r = await fetch('https://valhalla1.openstreetmap.de/route?json=' + encodeURIComponent(JSON.stringify(q)), { signal:ctrl.signal });
    if(!r.ok) throw 0;
    const j = await r.json();
    const pts = j.trip.legs.flatMap(l => decodePolyline6(l.shape));
    if(pts.length > 2) return densify(pts, 5);
  }catch{}
  const loop = []; for(let i = 0; i <= 60; i++){ const a = i / 60 * Math.PI * 2; loop.push([lat + R * Math.cos(a) / mPerLat, lng + R * Math.sin(a) / mPerLng]); }
  return densify(loop, 5);
}
async function startDemoWalk(){
  if(S.sim) return stopDemoWalk();
  const task = S.route.task, last = S.track[S.track.length-1];
  const c = task ? [task.start_lat, task.start_lng] : last ? [last[0], last[1]] : [51.2177, 6.7737];
  S.sim = { i:0, pts:null, timer:null };
  const b = $('#demo'); if(b) b.textContent = t('demoStop');
  const g = $('#gps'); if(g) g.textContent = t('demoRunning');
  const pts = await demoPath(c[0], c[1]);
  if(!S.sim) return;
  S.sim.pts = pts; follow = true;
  S.sim.timer = setInterval(() => {
    if(!S.sim || !S.route || S.route.endedAt) return stopDemoWalk();
    const p = S.sim.pts[S.sim.i];
    if(!p) return stopDemoWalk();
    onLocation(p[0], p[1], 5, Date.now(), S.sim.i === 0 ? 'first' : true);
    S.sim.i++;
  }, 600);
}
function stopDemoWalk(){
  if(S.sim && S.sim.timer) clearInterval(S.sim.timer);
  S.sim = null;
  const b = $('#demo'); if(b) b.textContent = t('demoWalk');
  flush();
}

/* keep screen on in the web version while a route runs */
let wakeLock = null;
async function keepAwake(on){
  try{
    if(on && !NATIVE && 'wakeLock' in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request('screen');
    if(!on && wakeLock){ await wakeLock.release(); wakeLock = null; }
  }catch{}
}
document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible' && S.route && !S.route.endedAt){ wakeLock = null; keepAwake(true); } });

async function startWatching(){
  if(S.watcherId) return;
  if(NATIVE){
    S.watcherId = await BackgroundGeolocation.addWatcher({
      backgroundTitle: t('bgTitle'), backgroundMessage: t('bgMsg'),
      requestPermissions: true, stale: false, distanceFilter: 5,
    }, (loc, err) => {
      if(err){ if(err.code === 'NOT_AUTHORIZED') showLocDenied(); return; }
      if(loc) onLocation(loc.latitude, loc.longitude, loc.accuracy, loc.time || Date.now());
    });
  }else if(navigator.geolocation){
    S.watcherId = 'web:' + navigator.geolocation.watchPosition(
      p => onLocation(p.coords.latitude, p.coords.longitude, p.coords.accuracy, p.timestamp),
      e => { if(e.code === 1) showLocDenied(); }, { enableHighAccuracy:true, maximumAge:0 });
  }
}
async function stopWatching(){
  if(!S.watcherId) return;
  if(String(S.watcherId).startsWith('web:')) navigator.geolocation.clearWatch(+String(S.watcherId).slice(4));
  else { try{ await BackgroundGeolocation.removeWatcher({ id:S.watcherId }); }catch{} }
  S.watcherId = null;
}

/* ================= map helpers ================= */
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const divIcon = cls => L.divIcon({ className:'', html:`<div class="${cls}"></div>`, iconSize:[24,24], iconAnchor:[12,12] });
let trackLine = null, meMarker = null, follow = true;
function makeMap(center){
  if(S.map){ S.map.remove(); S.map = null; }
  trackLine = null; meMarker = null; follow = true;
  S.map = L.map('map', { zoomControl:false, attributionControl:true }).setView(center || [51.2277, 6.7735], 15);
  L.tileLayer(TILES, { maxZoom:19, subdomains:'abcd', attribution:TILE_ATTR }).addTo(S.map);
  S.map.on('dragstart', () => { follow = false; });
  return S.map;
}
function drawCoverage(coverage){
  const m = S.map; if(!m) return;
  (coverage || []).forEach(line => { if(line.length > 1) L.polyline(line, { color:css('--zone'), weight:14, opacity:.28, lineCap:'round', lineJoin:'round', interactive:false }).addTo(m); });
  if(trackLine) trackLine.bringToFront();
}
function drawTaskLayers(task){
  const m = S.map; if(!m || !task) return null;
  let bounds = L.latLngBounds([[task.start_lat, task.start_lng]]);
  if(task.zone_polygon){ const z = L.polygon(task.zone_polygon, { color:css('--zone'), weight:2, fillOpacity:.08 }).addTo(m); bounds = z.getBounds(); }
  L.marker([task.start_lat, task.start_lng], { icon:divIcon('start-dot') }).addTo(m);
  return bounds;
}
function drawTrack(){
  if(!S.map || S.view !== 'tracking') return;
  const pts = S.track.map(p => [p[0], p[1]]);
  if(!trackLine) trackLine = L.polyline(pts, { color:css('--route'), weight:5, opacity:.9, lineJoin:'round' }).addTo(S.map);
  else trackLine.setLatLngs(pts);
}
function moveMe(lat, lng, pan){
  if(!S.map) return;
  if(!meMarker) meMarker = L.marker([lat, lng], { icon:divIcon('me-dot'), zIndexOffset:1000 }).addTo(S.map);
  else meMarker.setLatLng([lat, lng]);
  if(pan && follow && S.view === 'tracking') S.map.panTo([lat, lng], { animate:true });
}

/* ================= UI helpers ================= */
const screen = html => { if(S.map){ S.map.remove(); S.map = null; } clearInterval(S.timer); $('#screen').innerHTML = html; };
function modal(html){
  const el = document.createElement('div'); el.className = 'modal'; el.innerHTML = `<div class="box">${html}</div>`;
  el.addEventListener('click', e => { if(e.target === el) el.remove(); });
  document.body.appendChild(el); return el;
}
function confirmBox(title, text, yes, danger){
  return new Promise(res => {
    const m = modal(`<h2>${esc(title)}</h2><p class="muted">${esc(text)}</p><button class="btn ${danger?'stop':'pri'}" data-y>${esc(yes)}</button><button class="btn" data-n>${esc(t('cancel'))}</button>`);
    m.querySelector('[data-y]').onclick = () => { m.remove(); res(true); };
    m.querySelector('[data-n]').onclick = () => { m.remove(); res(false); };
  });
}
function showLocDenied(){
  if(document.querySelector('.modal')) return;
  const m = modal(`<h2>${esc(t('locDenied'))}</h2><p class="muted">${esc(t('locDeniedText'))}</p>
    ${NATIVE ? `<button class="btn pri" data-s>${esc(t('openSettings'))}</button>` : ''}<button class="btn" data-n>OK</button>`);
  const s = m.querySelector('[data-s]'); if(s) s.onclick = () => { BackgroundGeolocation.openSettings(); m.remove(); };
  m.querySelector('[data-n]').onclick = () => m.remove();
}
function langSwitch(){
  return `<div class="row small muted" style="margin-top:24px;text-align:center">${esc(t('language'))}:
    <button class="link" data-lang="ru">Русский</button> · <button class="link" data-lang="de">Deutsch</button></div>`;
}
function bindLang(rerender){
  document.querySelectorAll('[data-lang]').forEach(b => b.onclick = async () => { LANG = b.dataset.lang; await store.set('lang', LANG); rerender(); });
}

/* city picker: returns {html, bind(getter)} */
function cityPicker(initial){
  let cities = [...(initial || [])];
  const html = `<input class="in" id="cityQ" placeholder="${esc(t('citySearch'))}" autocomplete="off" autocorrect="off">
    <div id="cityR" class="results hidden"></div><div class="chips" id="cityChips"></div>`;
  function renderChips(){
    $('#cityChips').innerHTML = cities.map((c,i) => `<span class="chip">${esc(c.name)}<button data-rm="${i}" aria-label="remove">×</button></span>`).join('');
    $('#cityChips').querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { cities.splice(+b.dataset.rm, 1); renderChips(); });
  }
  function bind(){
    renderChips();
    const q = $('#cityQ'), r = $('#cityR'); let tm;
    q.addEventListener('input', () => {
      clearTimeout(tm); const v = q.value.trim();
      if(v.length < 2){ r.classList.add('hidden'); return; }
      tm = setTimeout(async () => {
        try{
          const res = await searchCities(v);
          r.classList.remove('hidden');
          r.innerHTML = res.length ? res.map((c,i) => `<div data-i="${i}"><b>${esc(c.name)}</b> <span class="muted small">${esc(c.sub)}</span></div>`).join('') : `<div class="muted">${esc(t('notFound'))}</div>`;
          r.querySelectorAll('[data-i]').forEach(d => d.onclick = () => {
            const c = res[+d.dataset.i];
            if(!cities.some(x => x.name === c.name && Math.abs(x.lat - c.lat) < .05)) cities.push({ name:c.name, lat:c.lat, lng:c.lng });
            q.value = ''; r.classList.add('hidden'); renderChips();
          });
        }catch{ r.classList.remove('hidden'); r.innerHTML = `<div class="muted">${esc(t('e_search'))}</div>`; }
      }, 350);
    });
  }
  return { html, bind, get: () => cities };
}

/* ================= screens ================= */
function viewWelcome(){
  S.view = 'welcome';
  screen(`<div class="scroll"><div class="narrow">
    <div style="height:12vh"></div>
    <h1>${esc(t('welcomeTitle'))}</h1><p class="muted">${esc(t('welcomeText'))}</p>
    <div style="height:24px"></div>
    <button class="btn pri" id="toReg">${esc(t('register'))}</button>
    <button class="btn" id="toLogin">${esc(t('haveAccount'))}</button>
    ${langSwitch()}
    <p class="small" style="text-align:center"><a href="${PRIVACY_URL}#${LANG}" style="color:var(--muted)">${esc(t('privacy'))}</a></p>
  </div></div>`);
  $('#toReg').onclick = viewRegister; $('#toLogin').onclick = viewLogin; bindLang(viewWelcome);
}

function viewRegister(){
  S.view = 'register';
  const cp = cityPicker([]);
  screen(`<div class="scroll"><div class="narrow">
    <button class="link" id="bk">← ${esc(t('back'))}</button>
    <h1>${esc(t('register'))}</h1>
    <label class="f">${esc(t('name'))}</label><input class="in" id="rName" autocomplete="name">
    <label class="f">${esc(t('phone'))}</label><input class="in" id="rPhone" type="tel" autocomplete="tel" placeholder="+49 …">
    <label class="f">${esc(t('cities'))}</label>${cp.html}
    <label class="f">${esc(t('pin'))}</label><input class="in pin" id="rPin" inputmode="numeric" maxlength="4" autocomplete="off">
    <p class="small muted" style="margin-top:6px">${esc(t('pinHint'))}</p>
    <div style="height:10px"></div>
    <button class="btn pri" id="rGo">${esc(t('create'))}</button><div class="err" id="rErr"></div>
    <p class="small muted" style="margin-top:4px">${esc(t('regAgree'))} <a href="${PRIVACY_URL}#${LANG}" style="color:var(--live)">${esc(t('privacy'))}</a>.</p>
  </div></div>`);
  cp.bind();
  $('#bk').onclick = viewWelcome;
  $('#rGo').onclick = async () => {
    const name = $('#rName').value.trim(), phone = $('#rPhone').value.trim(), pin = $('#rPin').value.trim(), cities = cp.get();
    const err = name.length < 2 ? 'name_required' : phone.replace(/\D/g,'').length < 6 ? 'phone_required' : !cities.length ? 'city_required' : !/^\d{4}$/.test(pin) ? 'pin_4_digits' : null;
    if(err){ $('#rErr').textContent = t('e_'+err); return; }
    $('#rGo').disabled = true; $('#rErr').textContent = '';
    try{
      const token = await rpc('register_worker', { p_name:name, p_phone:phone, p_cities:cities, p_pin:pin });
      await loggedIn(token);
    }catch(e){ $('#rErr').textContent = errText(e); $('#rGo').disabled = false; }
  };
}

function viewLogin(){
  S.view = 'login';
  screen(`<div class="scroll"><div class="narrow">
    <button class="link" id="bk">← ${esc(t('back'))}</button>
    <h1>${esc(t('loginTitle'))}</h1><p class="muted">${esc(t('loginText'))}</p>
    <label class="f">${esc(t('phone'))}</label><input class="in" id="lPhone" type="tel" autocomplete="tel">
    <label class="f">PIN</label><input class="in pin" id="lPin" inputmode="numeric" maxlength="4">
    <div style="height:18px"></div><button class="btn pri" id="lGo">${esc(t('login'))}</button><div class="err" id="lErr"></div>
  </div></div>`);
  $('#bk').onclick = viewWelcome;
  $('#lGo').onclick = async () => {
    $('#lGo').disabled = true; $('#lErr').textContent = '';
    try{
      const token = await rpc('recover_worker', { p_phone:$('#lPhone').value, p_pin:$('#lPin').value.trim() });
      if(!token) throw new ApiError('wrong');
      await loggedIn(token);
    }catch(e){ $('#lErr').textContent = e.message === 'wrong_phone_or_pin' ? t('e_wrong') : errText(e); $('#lGo').disabled = false; }
  };
}

async function loggedIn(token){ S.token = token; await store.set('token', token); await loadMe(); viewHome(); }
async function loadMe(){
  try{ S.me = await rpc('worker_me', { p_token:S.token }); await store.set('me', S.me); }
  catch(e){ if(e.message === 'invalid_token') return forceLogout(t('e_invalid_token')); S.me = S.me || await store.get('me'); }
}
async function forceLogout(msg){
  await stopWatching();
  S.token = null; S.me = null; S.route = null; S.queue = []; S.track = [];
  for(const k of ['token','me','route','queue','track']) await store.del(k);
  viewWelcome(); if(msg) modal(`<h2>FlyerMap</h2><p>${esc(msg)}</p>`);
}

function viewHome(){
  S.view = 'home';
  const me = S.me || { name:'', tasks:[] };
  const first = String(me.name || '').split(' ')[0];
  screen(`<div class="scroll"><div class="narrow">
    <div class="topbar"><h1 class="grow">${esc(t('hi'))}${first ? ', '+esc(first) : ''}</h1>
      <button class="iconbtn" id="toProfile">${esc(t('profile'))}</button></div>
    <div class="topbar" style="margin-top:6px"><h2 class="grow" style="margin:12px 0">${esc(t('tasks'))}</h2><button class="iconbtn" id="rf">${esc(t('refresh'))}</button></div>
    <div id="tl">${(me.tasks || []).length ? me.tasks.map((tk,i) => `
      <div class="task" data-i="${i}"><div class="t">${esc(tk.title)}</div>
      <div class="d">${esc(fmtDay(tk.work_date))}${tk.city_name ? ' · '+esc(tk.city_name) : ''} · ${tk.walk_minutes} ${esc(t('walk'))}</div>
      ${tk.notes ? `<div class="n">${esc(tk.notes)}</div>` : ''}</div>`).join('') : `<div class="empty">${esc(t('noTasks'))}</div>`}</div>
    <div style="height:20px"></div>
    <button class="btn" id="free">${esc(t('freeRoute'))}</button>
    ${NATIVE ? '' : `<p class="small muted" style="margin-top:16px">${esc(t('webNote'))}</p>`}
  </div></div>`);
  $('#toProfile').onclick = viewProfile;
  $('#rf').onclick = async () => { $('#rf').disabled = true; await loadMe(); viewHome(); };
  $('#free').onclick = () => beginRoute(null);
  document.querySelectorAll('.task').forEach(el => el.onclick = () => viewTask(me.tasks[+el.dataset.i]));
}

async function viewTask(task){
  S.view = 'task';
  screen(`<div class="mapwrap"><div id="map"></div><button class="back" id="bk">← ${esc(t('back'))}</button></div>
    <div class="sheet"><h2>${esc(task.title)}</h2>
      <div class="muted small">${esc(fmtDay(task.work_date))}${task.city_name ? ' · '+esc(task.city_name) : ''}</div>
      ${task.notes ? `<p style="margin:8px 0 0">${esc(task.notes)}</p>` : ''}
      <div class="legend"><span><i style="background:var(--zone);opacity:.5"></i>${esc(t('zone'))}</span><span><i style="background:var(--zone);opacity:.28;height:10px"></i>${esc(t('covered'))}</span></div>
      <button class="btn go" id="go">${esc(t('startBtn'))}</button>
      <a class="btn" id="dir" href="https://maps.apple.com/?daddr=${task.start_lat},${task.start_lng}&dirflg=r">${esc(t('directions'))}</a>
    </div>`);
  $('#bk').onclick = viewHome;
  $('#go').onclick = () => beginRoute(task);
  makeMap([task.start_lat, task.start_lng]);
  const b = drawTaskLayers(task); if(b) S.map.fitBounds(b, { padding:[20,20] });
  try{
    const cov = await rpc('task_coverage', { p_token:S.token, p_task_id:task.id });
    if(S.view === 'task') drawCoverage(cov);
  }catch{}
}

async function beginRoute(task){
  S.route = { id:null, localId:Date.now(), taskId:task ? task.id : null, task:task || null, startedAt:Date.now(), endedAt:null, distance:0 };
  S.queue = []; S.track = [];
  await saveRoute();
  viewTracking();
  await startWatching();
  flush();
}

async function viewTracking(){
  S.view = 'tracking';
  const task = S.route.task;
  screen(`<div class="mapwrap"><div id="map"></div></div>
    <div class="sheet">
      <div class="topbar"><span class="rec grow">${esc(t('recording'))}</span><span class="small muted" id="gps">${esc(t('gpsWait'))}</span></div>
      ${task ? `<div style="font-weight:600;margin-top:6px">${esc(task.title)}</div>` : ''}
      <div class="stats" style="margin-top:12px"><div><span>${esc(t('time'))}</span><b id="sT">0:00</b></div><div><span>${esc(t('dist'))}</span><b id="sD">0 m</b></div></div>
      <button class="btn stop" id="stop">${esc(t('stop'))}</button>
      ${NATIVE ? '' : `<button class="btn" id="demo">${esc(t(S.sim ? 'demoStop' : 'demoWalk'))}</button>`}
      <div class="sync" id="sync"></div>
    </div>`);
  keepAwake(true);
  if(!NATIVE) $('#demo').onclick = startDemoWalk;
  const last = S.track[S.track.length-1];
  makeMap(last ? [last[0], last[1]] : task ? [task.start_lat, task.start_lng] : null);
  if(task){ drawTaskLayers(task); rpc('task_coverage', { p_token:S.token, p_task_id:task.id }).then(cov => { if(S.view === 'tracking') drawCoverage(cov); }).catch(()=>{}); }
  drawTrack(); if(last) moveMe(last[0], last[1], true);
  const tick = () => { const sT = $('#sT'); if(!sT) return; sT.textContent = fmtTime(Date.now() - S.route.startedAt); $('#sD').textContent = fmtDist(S.route.distance); };
  tick(); S.timer = setInterval(tick, 1000);
  updateSync();
  $('#stop').onclick = async () => {
    if(!await confirmBox(t('stopQ'), t('stopText'), t('stopYes'), true)) return;
    stopDemoWalk(); keepAwake(false);
    await stopWatching();
    S.route.endedAt = Date.now(); await saveRoute();
    await flush();
    await loadMe(); viewHome();
  };
}
function setGpsStatus(ok){ const g = $('#gps'); if(g) g.textContent = ok ? t('onRoute') : t('gpsWait'); }
function updateSync(){ const el = $('#sync'); if(!el) return; el.textContent = S.queue.length ? t('pending', { n:S.queue.length }) : t('synced'); }

function viewProfile(){
  S.view = 'profile';
  const me = S.me || {};
  const cp = cityPicker(me.cities || []);
  screen(`<div class="scroll"><div class="narrow">
    <button class="link" id="bk">← ${esc(t('back'))}</button>
    <h1>${esc(t('profile'))}</h1>
    <label class="f">${esc(t('name'))}</label><input class="in" id="pName" value="${esc(me.name)}">
    <label class="f">${esc(t('phone'))}</label><input class="in" value="${esc(me.phone)}" disabled>
    <label class="f">${esc(t('cities'))}</label>${cp.html}
    <div style="height:18px"></div><button class="btn pri" id="pSave">${esc(t('saveProfile'))}</button><div class="err" id="pErr"></div>
    <div style="height:28px"></div><button class="btn" id="pOut">${esc(t('logout'))}</button>
    <button class="btn" id="pDel" style="color:var(--danger)">${esc(t('delAcc'))}</button>
    ${langSwitch()}
    <p class="small" style="text-align:center"><a href="${PRIVACY_URL}#${LANG}" style="color:var(--muted)">${esc(t('privacy'))}</a></p>
  </div></div>`);
  cp.bind(); bindLang(viewProfile);
  $('#bk').onclick = viewHome;
  $('#pSave').onclick = async () => {
    if(!cp.get().length){ $('#pErr').textContent = t('e_city_required'); return; }
    $('#pSave').disabled = true;
    try{ await rpc('update_worker_profile', { p_token:S.token, p_name:$('#pName').value, p_cities:cp.get() }); await loadMe(); $('#pErr').style.color = 'var(--ok)'; $('#pErr').textContent = t('saved'); }
    catch(e){ $('#pErr').textContent = errText(e); }
    $('#pSave').disabled = false;
  };
  $('#pOut').onclick = async () => { if(await confirmBox(t('logout'), t('logoutQ'), t('logout'), false)) forceLogout(); };
  $('#pDel').onclick = async () => {
    if(!await confirmBox(t('delAcc'), t('delAccQ'), t('delAccYes'), true)) return;
    try{ await rpc('delete_my_account', { p_token:S.token }); await forceLogout(); }
    catch(e){ $('#pErr').textContent = errText(e); }
  };
}

/* ================= boot ================= */
App.addListener('appStateChange', ({ isActive }) => {
  if(!isActive) return;
  flush();
  if(S.view === 'home'){ loadMe().then(() => { if(S.view === 'home') viewHome(); }); }
});

(async function boot(){
  LANG = await store.get('lang') || ((navigator.language || '').startsWith('ru') ? 'ru' : 'de');
  S.token = await store.get('token');
  S.me = await store.get('me');
  S.route = await store.get('route');
  S.queue = await store.get('queue') || [];
  S.track = await store.get('track') || [];
  if(!S.token) return viewWelcome();
  if(S.route && !S.route.endedAt){ viewTracking(); await startWatching(); flush(); loadMe(); return; }
  viewHome(); flush(); await loadMe(); if(S.view === 'home') viewHome();
})();
