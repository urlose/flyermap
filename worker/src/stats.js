// Analytics: per-worker rating + "Geprüft" badge (automatic or set by the admin) and the company's statistics tab.
import { I } from './i18n.js';
import { sb, esc, fmtN } from './core.js';
import { shell, topbar, statusPill, toast } from './ui.js';

const L = () => (['ru', 'en'].includes(I.lang) ? I.lang : 'de');
const TX = {
  de:{ tab:'Statistik', ok:'Geprüft', orders:'Aufträge', done:'erledigt', days:'Arbeitstage', hours:'Std.', km:'km', pace:'Tempo zur Quote', cancels:'Absagen', late:'zu spät', skips:'„Nicht nötig“',
    rating:'Bewertung', auto:'Automatisch', yes:'Geprüft', no:'Nicht geprüft', autoHint:'Automatisch geprüft: ≥ 3 erledigte Aufträge, Tempo ≥ 80 % der Quote, keine späte Absage in 60 Tagen.',
    month:'Top 5 diesen Monat', tasks:'Aufträge', flyers:'Flyer', per1000:'Std. / 1.000 Flyer', people:'Pers.', none:'Noch keine Daten.', total:'Gesamt', h1000Hint:'Weniger Stunden pro 1.000 Flyer = wirtschaftlicher.' },
  ru:{ tab:'Статистика', ok:'Проверен', orders:'Заказы', done:'выполнено', days:'Рабочие дни', hours:'ч', km:'км', pace:'Темп к квоте', cancels:'Отказы', late:'поздно', skips:'«Не нужно»',
    rating:'Оценка', auto:'Автоматически', yes:'Проверен', no:'Не проверен', autoHint:'Автоматически «проверен»: ≥ 3 выполненных заказа, темп ≥ 80 % квоты, нет поздних отказов за 60 дней.',
    month:'Топ-5 за этот месяц', tasks:'Заказы', flyers:'Флаеры', per1000:'ч / 1 000 флаеров', people:'чел.', none:'Пока нет данных.', total:'Всего', h1000Hint:'Меньше часов на 1 000 флаеров = выгоднее.' },
  en:{ tab:'Statistics', ok:'Verified', orders:'Orders', done:'finished', days:'Working days', hours:'h', km:'km', pace:'Pace vs quota', cancels:'Cancellations', late:'late', skips:'“Not needed”',
    rating:'Rating', auto:'Automatic', yes:'Verified', no:'Not verified', autoHint:'Verified automatically: ≥ 3 finished orders, pace ≥ 80 % of quota, no late cancellation in 60 days.',
    month:'Top 5 this month', tasks:'Orders', flyers:'Flyers', per1000:'h / 1,000 flyers', people:'pers.', none:'No data yet.', total:'Total', h1000Hint:'Fewer hours per 1,000 flyers = more economical.' },
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
export async function viewStats(){
  shell('stats', `${topbar(S('tab'))}<div id="stBody"><p class="muted">…</p></div>`);
  const { data, error } = await sb.rpc('company_stats'); const box = document.getElementById('stBody'); if(!box) return;
  if(error){ box.innerHTML = `<p class="err">${esc(error.message)}</p>`; return; }
  const tasks = data.tasks || [], top = data.top || [];
  if(!tasks.length){ box.innerHTML = `<p class="muted">${esc(S('none'))}</p>`; return; }
  // months: by the first working day of each order
  const months = new Map();
  for(const x of tasks){ const k = String(x.first).slice(0, 7), m = months.get(k) || { orders:0, flyers:0, hours:0, km:0 }; m.orders++; m.flyers += +x.flyers || 0; m.hours += +x.hours || 0; m.km += +x.km || 0; months.set(k, m); }
  const mName = k => new Date(k + '-01T12:00:00').toLocaleDateString(I.lang === 'en' ? 'en' : I.lang === 'ru' ? 'ru' : 'de-DE', { month:'long', year:'numeric' });
  const h1000 = (h, f) => f ? n1(h / f * 1000) : '–';
  const tot = [...months.values()].reduce((a, m) => ({ orders:a.orders + m.orders, flyers:a.flyers + m.flyers, hours:a.hours + m.hours, km:a.km + m.km }), { orders:0, flyers:0, hours:0, km:0 });
  const th = a => `<tr>${a.map((x, i) => `<th style="text-align:${i ? 'right' : 'left'};padding:6px 8px;font-weight:600;color:var(--color-text-muted);white-space:nowrap">${esc(x)}</th>`).join('')}</tr>`;
  const td = a => `<tr style="border-top:1px solid var(--color-border)">${a.map((x, i) => `<td style="text-align:${i ? 'right' : 'left'};padding:8px;white-space:${i ? 'nowrap' : 'normal'}">${x}</td>`).join('')}</tr>`;
  const table = (head, rows) => `<div class="card" style="display:block;overflow-x:auto;padding:4px 8px"><table style="width:100%;border-collapse:collapse;font-size:14px">${th(head)}${rows.join('')}</table></div>`;
  box.innerHTML = `
    <div class="kpis" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:8px 0 4px">
      ${[[S('tasks'), fmtN(tot.orders)], [S('flyers'), fmtN(tot.flyers)], [S('hours'), n1(tot.hours)], [S('per1000'), h1000(tot.hours, tot.flyers)]].map(([k, v]) => `<div class="card" style="display:block;padding:12px 14px"><div class="small muted">${esc(k)}</div><b style="font-size:22px">${v}</b></div>`).join('')}
    </div>
    ${top.length ? `<h2 class="sec">${esc(S('month'))}</h2>` + table(['', S('hours'), S('days'), S('orders')], top.map((x, i) => td([`${i + 1}. ${esc(x.name)} ${okBadge(x.id)}`, n1(x.hours), x.days, x.orders]))) : ''}
    <h2 class="sec">${esc(S('total'))}</h2>
    ${table(['', S('tasks'), S('flyers'), S('hours'), S('km'), S('per1000')], [...months.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([k, m]) => td([esc(mName(k)), m.orders, fmtN(m.flyers), n1(m.hours), n1(m.km), h1000(m.hours, m.flyers)])))}
    <h2 class="sec">${esc(S('tasks'))}</h2><p class="small muted" style="margin-top:-4px">${esc(S('h1000Hint'))}</p>
    ${table(['', S('flyers'), S('hours'), S('people'), S('per1000')], tasks.map(x => td([`<button class="link" data-task="${esc(x.id)}" style="text-align:left">${esc(x.title)}</button>${x.status === 'open' ? ' ' + statusPill('info', '…') : ''}`, fmtN(+x.flyers || 0), n1(x.hours), x.people, h1000(+x.hours, +x.flyers)])))}`;
  box.querySelectorAll('[data-task]').forEach(b => b.onclick = () => window.dispatchEvent(new CustomEvent('fm-open-task', { detail:b.dataset.task })));
}
