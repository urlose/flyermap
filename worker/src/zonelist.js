// Places around the start in a time-first order with a drive-time zone (17.11.2026).
// Inside the zone: planned automatically, nearest first, as far as the hours reach;
// the admin can take a place out (its census cells get no flyers) and back in. Outside: suggestions to add by hand
// (they become manual places with their own slice of time and a ride time from the zone grid).
import { T, t } from './i18n.js';
import './i18n_en.js';   // creates T.en; must run before the lines below add to it
import { minutesTo, DELIVERY_MAX_KM } from './drivezone.js';
import { cellOf, unlaea } from './zensus.js';
import { esc, fmtN } from './core.js';
import { ICONS } from './ui.js';

Object.assign(T.de, { zlTitle:'Orte in der Fahrzeit-Zone', zlHint:'Werden automatisch eingeplant – die nächsten zuerst, so weit die Stunden reichen. Mit ✕ nimmst du einen Ort heraus.',
  zlLoading:'Orte in der Zone werden gesucht …', zlNone:'Keine weiteren Orte in der Zone.', zlLine:'≈ {hh} Haushalte · {min} Min. mit dem Auto · {km} km',
  zlIn:'Im Plan: ≈ {mb} Briefkästen', zlNotYet:'Noch nicht erreicht – die Stunden reichen nicht', zlOutTag:'Herausgenommen', zlOut:'Herausnehmen', zlBack:'Wieder aufnehmen',
  zlMore:'Weitere Orte in der Nähe (außerhalb der Zone)', zlMoreHint:'Hinzufügen = eigener Ort mit eigener Zeit; die Fahrzeit wird automatisch eingetragen.', zlFar:'zu weit für die Straßenkarte (über 10 km)',
  zlAdd:'Hinzufügen', zlNoCar:'mit dem Auto nicht in {min} Min.', zlMain:'Startort', driveArea:'Nur Orte, die man mit dem Auto erreicht', driveMin:'Fahrzeit ab Start (Min.)',
  driveHint:'Berechnet aus den echten Straßen (Straßentyp und Tempolimit).', driveLoading:'Fahrzeit-Zone wird berechnet …',
  driveFallback:'Die Straßenkarte für die Fahrzeit war nicht erreichbar – ersatzweise gilt ein Kreis von {km} km. Später erneut versuchen.', driveRetry:'Erneut berechnen',
  travelAuto:'automatisch aus der Fahrzeit', legacyCircle:'Alter Auftrag: Kreis {km} km. Haken neu setzen = Fahrzeit-Zone.', zoneManualOutside:'Ein von Hand hinzugefügter Ort liegt außerhalb der Fahrzeit-Zone. Er wird trotzdem ganz eingeplant – mit eigener Zeit und Anfahrt.' });
Object.assign(T.ru, { zlTitle:'Места в зоне доезда', zlHint:'Планируются автоматически – сначала ближайшие, насколько хватит часов. ✕ убирает место.',
  zlLoading:'Ищу места в зоне …', zlNone:'Других мест в зоне нет.', zlLine:'≈ {hh} домохозяйств · {min} мин на машине · {km} км',
  zlIn:'В плане: ≈ {mb} ящиков', zlNotYet:'Пока не охвачено – часов не хватает', zlOutTag:'Убрано', zlOut:'Убрать', zlBack:'Вернуть',
  zlMore:'Другие места рядом (вне зоны)', zlMoreHint:'Добавить = отдельное место со своим временем; время поездки подставится автоматически.', zlFar:'слишком далеко для карты улиц (больше 10 км)',
  zlAdd:'Добавить', zlNoCar:'на машине не за {min} мин', zlMain:'Стартовое место', driveArea:'Только места, куда можно доехать на машине', driveMin:'Время езды от старта (мин)',
  driveHint:'Считается по реальным дорогам (тип дороги и ограничение скорости).', driveLoading:'Считаю зону доезда …',
  driveFallback:'Карта дорог для расчёта времени недоступна – временно действует круг {km} км. Попробуйте позже.', driveRetry:'Пересчитать',
  travelAuto:'автоматически по времени езды', legacyCircle:'Старый заказ: круг {km} км. Поставьте галочку заново = зона доезда.', zoneManualOutside:'Добавленное вручную место лежит вне зоны доезда. Оно всё равно планируется целиком – со своим временем и поездкой.' });
Object.assign(T.en, { zlTitle:'Places in the drive-time zone', zlHint:'Planned automatically – nearest first, as far as the hours reach. ✕ takes a place out.',
  zlLoading:'Looking for places in the zone …', zlNone:'No other places in the zone.', zlLine:'≈ {hh} households · {min} min by car · {km} km',
  zlIn:'In the plan: ≈ {mb} mailboxes', zlNotYet:'Not reached yet – the hours are not enough', zlOutTag:'Taken out', zlOut:'Take out', zlBack:'Take back in',
  zlMore:'More places nearby (outside the zone)', zlMoreHint:'Add = own place with its own time; the ride time is filled in automatically.', zlFar:'too far for the street map (over 10 km)',
  zlAdd:'Add', zlNoCar:'not within {min} min by car', zlMain:'Start place', driveArea:'Only places reachable by car', driveMin:'Drive time from start (min)',
  driveHint:'Calculated from the real roads (road type and speed limit).', driveLoading:'Calculating the drive-time zone …',
  driveFallback:'The road map for drive times could not be reached – a {km} km circle is used instead. Try again later.', driveRetry:'Calculate again',
  travelAuto:'automatically from the drive time', legacyCircle:'Older order: {km} km circle. Tick again = drive-time zone.', zoneManualOutside:'A place added by hand lies outside the drive-time zone. It is still planned whole – with its own time and ride.' });

const f1 = v => String(Math.round(v * 10) / 10).replace('.', ',');
// minutes to a place: its centre, else the best of up to 40 of its cells (a centre in a field between two parts)
function placeMinutes(grid, x){
  let best = minutesTo(grid, [x.lat, x.lng]);
  const cells = x.cells || [], step = Math.max(2, Math.floor(cells.length / 80) * 2);
  for(let k = 0; k + 1 < cells.length; k += step){ const p = unlaea(cells[k] * 100 + 50, cells[k + 1] * 100 + 50), v = minutesTo(grid, p); if(v != null && (best == null || v < best)) best = v; }
  return best;
}
// census places -> { main, inside, outside } (the start's own place is "main" and not listed)
export function splitPlaces(list, grid, start, { maxOutside = 8 } = {}){
  const [sa, sb] = cellOf(start[0], start[1]);
  const isMain = x => { for(let k = 0; k + 1 < (x.cells || []).length; k += 2) if(Math.abs(x.cells[k] - sa) <= 3 && Math.abs(x.cells[k + 1] - sb) <= 3) return true; return false; };
  let main = null; const inside = [], outside = [];
  for(const x of list || []){
    if(!main && isMain(x)){ main = x; continue; }
    const km = (x.dist != null ? x.dist : 0) / 1000, min = placeMinutes(grid, x), y = { ...x, km:Math.round(km * 10) / 10, min:min == null ? null : Math.round(min) };
    if(min != null && km <= DELIVERY_MAX_KM) inside.push(y); else outside.push({ ...y, far:min != null && km > DELIVERY_MAX_KM });
  }
  inside.sort((a, b) => a.min - b.min || a.km - b.km);
  outside.sort((a, b) => (a.min == null) - (b.min == null) || (a.min || 0) - (b.min || 0) || a.km - b.km);
  return { main, inside, outside:outside.slice(0, maxOutside) };
}

// HTML of the list; stats = plan.budget.placeStats, exclude = d.budget.exclude, side = confirmed manual places
export function zoneListHtml(zp, { stats = [], exclude = [], side = [], minLimit = 15, name = x => x.name } = {}){
  if(!zp) return `<div class="cov-sug zone-list"><h4>${ICONS.pin}${esc(t('zlTitle'))}</h4><p class="small muted">${esc(t('zlLoading'))}</p></div>`;
  const out = new Set(exclude.map(x => x.id)), mb = new Map(stats.map(s => [s.id, s.mailboxes])), added = new Set(side.filter(s => s.cid).map(s => s.cid));
  const row = (x, i, kind) => {
    const gone = out.has(x.id), m = mb.get(x.id) || 0;
    const status = kind === 'in' ? (gone ? `<span class="small muted">${esc(t('zlOutTag'))}</span>` : m > 0 ? `<span class="small ok-t">${esc(t('zlIn', { mb:fmtN(m) }))}</span>` : `<span class="small sug-not">${esc(t('zlNotYet'))}</span>`)
      : `<span class="small muted">${esc(x.far ? t('zlFar') : x.min == null ? t('zlNoCar', { min:minLimit }) : '')}</span>`;
    const line = t('zlLine', { hh:fmtN(x.households), min:x.min == null ? '–' : x.min, km:f1(x.km) });
    const btn = kind === 'in' ? (gone ? `<button class="btn ghost small" data-zin="${esc(x.id)}">↺ <span>${esc(t('zlBack'))}</span></button>` : `<button class="btn ghost small" data-zout="${esc(x.id)}" aria-label="${esc(t('zlOut') + ': ' + name(x))}">✕ <span>${esc(t('zlOut'))}</span></button>`)
      : added.has(x.id) ? '' : `<button class="btn ghost small" data-zadd="${i}">${ICONS.plus}<span>${esc(t('zlAdd'))}</span></button>`;
    return `<div class="sug-row zl-row${gone ? ' zl-gone' : ''}" data-zrow="${esc(x.id)}"><div class="grow"><b>${esc(name(x))}</b><span class="small muted">${esc(line)}</span>${status}</div>${btn}</div>`;
  };
  return `<div class="cov-sug zone-list" id="zoneList"><h4>${ICONS.pin}${esc(t('zlTitle'))} (≤ ${minLimit} ${esc('Min.')})</h4><p class="small muted" style="margin:0 0 6px">${esc(t('zlHint'))}</p>
    ${zp.inside.length ? zp.inside.map((x, i) => row(x, i, 'in')).join('') : `<p class="small muted">${esc(t('zlNone'))}</p>`}
    ${zp.outside.length ? `<h4 style="margin-top:10px">${esc(t('zlMore'))}</h4><p class="small muted" style="margin:0 0 6px">${esc(t('zlMoreHint'))}</p>${zp.outside.map((x, i) => row(x, i, 'out')).join('')}` : ''}</div>`;
}
