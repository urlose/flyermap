// Analytics: per-worker rating + "Geprüft" badge (automatic or set by the admin) and the company's statistics tab.
import { I } from './i18n.js';
import { sb, esc, fmtN } from './core.js';
import { shell, topbar, statusPill, toast } from './ui.js';

const L = () => (['ru', 'en'].includes(I.lang) ? I.lang : 'de');
const TX = {
  de:{ tab:'Statistik', ok:'Geprüft', orders:'Aufträge', done:'erledigt', days:'Arbeitstage', hours:'Std.', km:'km', pace:'Tempo zur Quote', cancels:'Absagen', late:'zu spät', skips:'„Nicht nötig“',
    rating:'Bewertung', auto:'Automatisch', yes:'Geprüft', no:'Nicht geprüft', autoHint:'Automatisch geprüft: ≥ 3 erledigte Aufträge, Tempo ≥ 80 % der Quote, keine späte Absage in 60 Tagen.',
    month:'Top 5 diesen Monat', tasks:'Aufträge', flyers:'Flyer', per1000:'Std. / 1.000 Flyer', people:'Pers.', none:'Noch keine Daten.', total:'Gesamt', h1000Hint:'Weniger Stunden pro 1.000 Flyer = wirtschaftlicher. ● ≤ 3 gut · ▲ 3–5 mittel · ■ > 5 teuer.', perDay:'pro Tag', last30:'letzte 30 Tage', kmh:'km pro Std.', activeDays:'Arbeitstage (30 T.)', peopleMax:'Max. Personen/Tag', weekdays:'Wochentage (Std.)', daysShort:'Tage', running:'läuft' },
  ru:{ tab:'Статистика', ok:'Проверен', orders:'Заказы', done:'выполнено', days:'Рабочие дни', hours:'ч', km:'км', pace:'Темп к квоте', cancels:'Отказы', late:'поздно', skips:'«Не нужно»',
    rating:'Оценка', auto:'Автоматически', yes:'Проверен', no:'Не проверен', autoHint:'Автоматически «проверен»: ≥ 3 выполненных заказа, темп ≥ 80 % квоты, нет поздних отказов за 60 дней.',
    month:'Топ-5 за этот месяц', tasks:'Заказы', flyers:'Флаеры', per1000:'ч / 1 000 флаеров', people:'чел.', none:'Пока нет данных.', total:'Всего', h1000Hint:'Меньше часов на 1 000 флаеров = выгоднее. ● ≤ 3 хорошо · ▲ 3–5 средне · ■ > 5 дорого.', perDay:'в день', last30:'последние 30 дней', kmh:'км в час', activeDays:'Рабочих дней (30 дн.)', peopleMax:'Макс. людей в день', weekdays:'Дни недели (ч)', daysShort:'дн.', running:'идёт' },
  en:{ tab:'Statistics', ok:'Verified', orders:'Orders', done:'finished', days:'Working days', hours:'h', km:'km', pace:'Pace vs quota', cancels:'Cancellations', late:'late', skips:'“Not needed”',
    rating:'Rating', auto:'Automatic', yes:'Verified', no:'Not verified', autoHint:'Verified automatically: ≥ 3 finished orders, pace ≥ 80 % of quota, no late cancellation in 60 days.',
    month:'Top 5 this month', tasks:'Orders', flyers:'Flyers', per1000:'h / 1,000 flyers', people:'pers.', none:'No data yet.', total:'Total', h1000Hint:'Fewer hours per 1,000 flyers = more economical. ● ≤ 3 good · ▲ 3–5 medium · ■ > 5 costly.', perDay:'per day', last30:'last 30 days', kmh:'km per hour', activeDays:'Working days (30 d)', peopleMax:'Max. people/day', weekdays:'Weekdays (h)', daysShort:'days', running:'running' },
};
export const S = k => TX[L()][k];
const n1 = x => (+x || 0).toLocaleString(I.lang === 'en' ? 'en' : 'de-DE', { maximumFractionDigits:1 });

/* ---------- worker rating ---------- */
export const STATS = { byId:new Map(), at:0 };
export async function loadWorkerStats(force){
  if(!force && Date.now() - STATS.at < 60e3) return STATS.byId;
  const { data, error } = await sb.rpc('worker_stats'); if(error) return STATS.byId;
  STATS.byId = new Map((data || []).map(x => [x.id, x])); STATS.at = Date.now(); return STATS.byId;
}
export const isVerified = id => !!(STATS.byId.get(id) || {}).verified;
export const okBadge = id => isVerified(id) ? `<span class="pill ok-badge" title="${esc(S('ok'))}" style="display:inline-flex;align-items:center;gap:3px;padding:1px 8px;border-radius:999px;font-size:12px;font-weight:600;background:color-mix(in srgb, var(--color-success,#16A34A) 18%, transparent);color:var(--color-success,#16A34A)">✓ ${esc(S('ok'))}</span>` : '';
export const shortLine = id => { const s = STATS.byId.get(id); if(!s || !s.days) return ''; return `${s.done} ${S('orders').toLowerCase()} ${S('done')} · ${n1(s.hours)} ${S('hours')}${s.pace != null ? ' · ' + s.pace + ' %' : ''}`; };

export function workerStatsHtml(id){
  const s = STATS.byId.get(id); if(!s) return '';
  const row = (k, v) => `<div><span>${esc(k)}</span><b>${v}</b></div>`;
  const mode = s.manual == null ? 'auto' : s.manual ? 'yes' : 'no';
  return `<h2 class="sec">${esc(S('rating'))} ${okBadge(id)}</h2><div class="card kv" style="display:block">
    ${row(S('orders'), `${s.orders} · ${s.done} ${esc(S('done'))}`)}${row(S('days'), s.days)}${row(S('hours'), n1(s.hours))}${row(S('km'), n1(s.km))}
    ${s.pace != null ? row(S('pace'), s.pace + ' %') : ''}${row(S('cancels'), `${s.cancels}${s.late ? ' · ' + s.late + ' ' + esc(S('late')) : ''}`)}${row(S('skips'), s.skips)}
    <div class="seg" role="radiogroup" style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap">${['auto', 'yes', 'no'].map(m => `<button class="chip ${m === mode ? 'on' : ''}" data-ver="${m}">${esc(S(m))}</button>`).join('')}</div>
    <p class="small muted" style="margin-bottom:0">${esc(S('autoHint'))}</p></div>`;
}
export function bindWorkerStats(id, reload){
  document.querySelectorAll('[data-ver]').forEach(b => b.onclick = async () => {
    const v = b.dataset.ver === 'auto' ? null : b.dataset.ver === 'yes';
    const { error } = await sb.rpc('set_verified', { p_worker:id, p_v:v }); if(error) return toast(error.message);
    await loadWorkerStats(true); reload && reload();
  });
}

/* ---------- company statistics tab ---------- */
const DAY = 864e5, iso = d => new Date(d).toLocaleDateString('sv-SE');
const locale = () => I.lang === 'en' ? 'en' : I.lang === 'ru' ? 'ru' : 'de-DE';
// last n days, missing days = 0
function series(daily, key, n){ const by = new Map(daily.map(x => [String(x.d).slice(0, 10), +x[key] || 0])), out = []; for(let k = n - 1; k >= 0; k--){ const d = iso(Date.now() - k * DAY); out.push({ d, v:by.get(d) || 0 }); } return out; }
function spark(pts, w = 220, h = 46){
  const max = Math.max(1, ...pts.map(p => p.v)), dx = w / Math.max(1, pts.length - 1), y = v => h - 4 - (v / max) * (h - 10);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${(i * dx).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:${h}px;display:block;margin-top:10px" aria-hidden="true"><path d="${d}L${w},${h}L0,${h}Z" fill="rgba(255,255,255,.18)"/><path class="fm-draw" pathLength="2000" d="${d}" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
}
// one series, one axis: hours per day as an area, dashed average; hover = native tooltip per day
function areaChart(pts, unit){
  const W = 900, H = 260, pl = 40, pr = 12, pt = 14, pb = 28, max = Math.max(1, ...pts.map(p => p.v)) * 1.15, n = pts.length;
  const x = i => pl + i * (W - pl - pr) / Math.max(1, n - 1), y = v => pt + (1 - v / max) * (H - pt - pb);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const worked = pts.filter(p => p.v > 0), avg = worked.length ? worked.reduce((a, p) => a + p.v, 0) / worked.length : 0;
  const ticks = [0, .5, 1].map(f => Math.round(max / 1.15 * f));
  const fmtD = d => new Date(d + 'T12:00:00').toLocaleDateString(locale(), { day:'2-digit', month:'2-digit' });
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" role="img" aria-label="${esc(unit)}">
    ${ticks.map(v => `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--color-border)" stroke-width="1"/><text x="${pl - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--color-text-secondary)">${v}</text>`).join('')}
    ${pts.map((p, i) => i % Math.ceil(n / 7) === 0 ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--color-text-secondary)">${fmtD(p.d)}</text>` : '').join('')}
    <path d="${line}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z" fill="var(--color-primary)" opacity=".16"/>
    <path class="fm-draw" pathLength="2000" d="${line}" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linejoin="round"/>
    ${avg ? `<line x1="${pl}" x2="${W - pr}" y1="${y(avg)}" y2="${y(avg)}" stroke="var(--color-text-secondary)" stroke-width="1.5" stroke-dasharray="6 5"/><text x="${W - pr}" y="${y(avg) - 6}" text-anchor="end" font-size="11" fill="var(--color-text-secondary)">Ø ${n1(avg)} ${esc(unit)}</text>` : ''}
    ${pts.map((p, i) => `${p.v ? `<circle cx="${x(i)}" cy="${y(p.v)}" r="4" fill="var(--color-primary)" stroke="var(--color-surface)" stroke-width="2"/>` : ''}<rect x="${x(i) - (W - pl - pr) / n / 2}" y="${pt}" width="${(W - pl - pr) / n}" height="${H - pt - pb}" fill="transparent"><title>${fmtD(p.d)}: ${n1(p.v)} ${esc(unit)}</title></rect>`).join('')}
  </svg>`;
}
const bar = (pct, label, value) => `<div style="margin:10px 0"><div style="display:flex;justify-content:space-between;gap:8px;font-size:14px"><span>${label}</span><b>${value}</b></div>
  <div style="height:6px;border-radius:99px;background:var(--color-surface-subtle);margin-top:6px;overflow:hidden"><i class="fm-grow" style="display:block;height:100%;width:${Math.max(2, Math.min(100, pct))}%;background:var(--color-primary);border-radius:99px"></i></div></div>`;
const effPill = v => { if(v == null || !isFinite(v)) return '–'; const [c, k] = v <= 3 ? ['#16A34A', '●'] : v <= 5 ? ['#D97706', '▲'] : ['#DC2626', '■']; return `<span style="white-space:nowrap"><span style="color:${c}" aria-hidden="true">${k}</span> ${n1(v)}</span>`; };

export async function viewStats(){
  shell('stats', `${topbar(S('tab'))}<div id="stBody"><p class="muted">…</p></div>`);
  const { data, error } = await sb.rpc('company_stats'); const box = document.getElementById('stBody'); if(!box) return;
  if(error){ box.innerHTML = `<p class="err">${esc(error.message)}</p>`; return; }
  const tasks = data.tasks || [], top = data.top || [], daily = data.daily || [];
  if(!tasks.length){ box.innerHTML = `<p class="muted">${esc(S('none'))}</p>`; return; }
  const tot = tasks.reduce((a, x) => ({ orders:a.orders + 1, flyers:a.flyers + (+x.flyers || 0), hours:a.hours + (+x.hours || 0), km:a.km + (+x.km || 0) }), { orders:0, flyers:0, hours:0, km:0 });
  const flyDaily = tasks.map(x => ({ d:String(x.first).slice(0, 10), flyers:+x.flyers || 0 })).reduce((m, x) => { m[x.d] = (m[x.d] || 0) + x.flyers; return m; }, {});
  const n = 30, sH = series(daily, 'hours', n), sK = series(daily, 'km', n), sO = series(daily, 'orders', n), sP = series(daily, 'people', n);
  const sF = series(Object.entries(flyDaily).map(([d, v]) => ({ d, f:v })), 'f', n);
  const card = (bg, val, lbl, pts) => `<div class="kpi-card" style="border-radius:var(--radius-lg,14px);padding:16px 18px 10px;background:${bg};color:#fff;min-width:0"><b style="font-size:26px;line-height:1.1">${val}</b><div style="opacity:.92;margin-top:2px">${esc(lbl)}</div>${spark(pts)}</div>`;
  // weekdays: hours worked per weekday (all days of the last 60)
  const wd = [0, 0, 0, 0, 0, 0, 0]; daily.forEach(x => { wd[(new Date(String(x.d).slice(0, 10) + 'T12:00:00').getDay() + 6) % 7] += +x.hours || 0; });
  const wdMax = Math.max(1, ...wd), wdName = i => new Date(2026, 10, 2 + i).toLocaleDateString(locale(), { weekday:'long' });
  const topMax = Math.max(1, ...top.map(x => +x.hours || 0));
  box.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin:8px 0 18px">
      ${card('linear-gradient(135deg,#6D5BD0,#5B4BC4)', fmtN(tot.orders), S('tasks'), sO)}
      ${card('linear-gradient(135deg,#3B82F6,#2563EB)', fmtN(tot.flyers), S('flyers'), sF)}
      ${card('linear-gradient(135deg,#D97706,#B45309)', n1(tot.hours), S('hours'), sH)}
      ${card('linear-gradient(135deg,#DC4C4C,#C03838)', n1(tot.km), S('km'), sK)}
    </div>
    <div class="card" style="display:block;padding:16px 18px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap"><b style="font-size:17px">${esc(S('hours'))} · ${esc(S('perDay'))}</b><span class="small muted">${esc(S('last30'))}</span></div>
      ${areaChart(sH, S('hours'))}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;border-top:1px solid var(--color-border);margin-top:8px;padding-top:12px">
        ${[[S('per1000'), effPill(tot.flyers ? tot.hours / tot.flyers * 1000 : null)], [S('kmh'), tot.hours ? n1(tot.km / tot.hours) : '–'], [S('activeDays'), sH.filter(p => p.v).length], [S('peopleMax'), Math.max(0, ...sP.map(p => p.v))]].map(([k, v]) => `<div><div class="small muted">${esc(k)}</div><b style="font-size:18px">${v}</b></div>`).join('')}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px;margin-top:14px">
      <div class="card" style="display:block;padding:16px 18px"><b style="font-size:17px">${esc(S('month'))}</b>
        ${top.length ? top.map((x, i) => bar(x.hours / topMax * 100, `${i + 1}. ${esc(x.name)} ${okBadge(x.id)}`, `${n1(x.hours)} ${esc(S('hours'))} · ${x.days} ${esc(S('daysShort'))}`)).join('') : `<p class="small muted">${esc(S('none'))}</p>`}</div>
      <div class="card" style="display:block;padding:16px 18px"><b style="font-size:17px">${esc(S('weekdays'))}</b>
        ${wd.map((h, i) => bar(h / wdMax * 100, esc(wdName(i)), `${n1(h)} ${esc(S('hours'))}`)).join('')}</div>
    </div>
    <h2 class="sec">${esc(S('tasks'))}</h2><p class="small muted" style="margin-top:-4px">${esc(S('h1000Hint'))}</p>
    <div class="card" style="display:block;overflow-x:auto;padding:4px 8px"><table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr>${['', S('flyers'), S('hours'), S('km'), S('people'), S('per1000')].map((x, i) => `<th style="text-align:${i ? 'right' : 'left'};padding:8px;font-weight:600;color:var(--color-text-secondary);white-space:nowrap">${esc(x)}</th>`).join('')}</tr>
      ${tasks.map(x => `<tr style="border-top:1px solid var(--color-border)"><td style="padding:10px 8px"><button class="link" data-task="${esc(x.id)}" style="text-align:left">${esc(x.title)}</button>${x.status === 'open' ? ` ${statusPill('info', esc(S('running')))}` : ''}</td>
        ${[fmtN(+x.flyers || 0), n1(x.hours), n1(x.km), x.people, effPill(+x.flyers ? x.hours / x.flyers * 1000 : null)].map(v => `<td style="text-align:right;padding:10px 8px;white-space:nowrap">${v}</td>`).join('')}</tr>`).join('')}
    </table></div>`;
  box.querySelectorAll('[data-task]').forEach(b => b.onclick = () => window.dispatchEvent(new CustomEvent('fm-open-task', { detail:b.dataset.task })));
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches) box.querySelectorAll('.kpi-card > b').forEach(el => {
    const txt = el.textContent, num = parseFloat(txt.replace(/\./g, '').replace(',', '.')); if(!isFinite(num) || !num) return;
    const dec = txt.includes(',') ? 1 : 0, t0 = performance.now();
    const step = now => { const k = Math.min(1, (now - t0) / 700), v = num * (1 - Math.pow(1 - k, 3)); el.textContent = v.toLocaleString('de-DE', { minimumFractionDigits:dec, maximumFractionDigits:dec }); if(k < 1) requestAnimationFrame(step); else el.textContent = txt; };
    requestAnimationFrame(step);
  });
}
