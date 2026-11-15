// Sortable tables for the admin lists (Mitarbeiter, Aufträge) – since 16.11.2026. On a PC the admin can switch between
// cards and a compact table; on a phone the cards stay (the table needs the width).
import { t } from './i18n.js';
import { esc } from './core.js';
import { ICONS } from './ui.js';

const LS = 'fm.listView';
const views = () => { try{ return JSON.parse(localStorage.getItem(LS) || '{}'); }catch{ return {}; } };
export const listView = k => (matchMedia('(min-width:900px)').matches ? (views()[k] || 'table') : 'cards');
export const setListView = (k, v) => { const o = views(); o[k] = v; try{ localStorage.setItem(LS, JSON.stringify(o)); }catch{} };
export const viewSwitch = k => `<div class="seg view-sw wide-only" role="group" aria-label="${esc(t('viewAs'))}">${[['cards', ICONS.grid, t('viewCards')], ['table', ICONS.table, t('viewTable')]].map(([v, ic, l]) =>
  `<button class="seg-b ${listView(k) === v ? 'on' : ''}" data-view="${v}" aria-pressed="${listView(k) === v}" title="${esc(l)}">${ic}<span>${esc(l)}</span></button>`).join('')}</div>`;
export const bindViewSwitch = (k, again) => document.querySelectorAll('.view-sw [data-view]').forEach(b => b.onclick = () => { setListView(k, b.dataset.view);
  b.parentElement.querySelectorAll('[data-view]').forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); }); again(); });

// cols: [{ k, label, num, sort:row => value, cell:row => html }]; state: { by, dir } kept by the caller
export function tableHtml(id, cols, rows, state){
  const c = cols.find(x => x.k === state.by), dir = state.dir === 'desc' ? -1 : 1;
  const sorted = c && c.sort ? [...rows].sort((a, b) => { const x = c.sort(a), y = c.sort(b);
    if(x == null && y == null) return 0; if(x == null) return 1; if(y == null) return -1;
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'de', { numeric:true })) * dir; }) : rows;
  return `<div class="dtable-wrap"><table class="dtable" id="${id}"><thead><tr>${cols.map(x => {
    const on = state.by === x.k, aria = on ? (state.dir === 'desc' ? 'descending' : 'ascending') : 'none';
    return `<th class="${x.num ? 'num' : ''}" aria-sort="${x.sort ? aria : 'none'}">${x.sort ? `<button class="th-b ${on ? 'on' : ''}" data-sort="${x.k}" aria-label="${esc(t('sortBy', { c:x.label }))}">${esc(x.label)}<span class="th-ic" aria-hidden="true">${on ? (state.dir === 'desc' ? '↓' : '↑') : '↕'}</span></button>` : esc(x.label)}</th>`; }).join('')}</tr></thead>
    <tbody>${sorted.map(r => `<tr data-row="${esc(r.id)}">${cols.map(x => `<td class="${x.num ? 'num' : ''}${x.cls ? ' ' + x.cls : ''}">${x.cell(r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
export function bindTable(id, state, again, onRow){
  const tb = document.getElementById(id); if(!tb) return;
  tb.querySelectorAll('[data-sort]').forEach(b => b.onclick = () => { const k = b.dataset.sort; if(state.by === k) state.dir = state.dir === 'desc' ? 'asc' : 'desc'; else { state.by = k; state.dir = 'asc'; } again(); });
  // a click on a row opens it – not when a link or button inside the row was used
  tb.querySelectorAll('tbody tr').forEach(tr => { tr.tabIndex = 0; tr.onclick = e => { if(e.target.closest('a,button')) return; onRow(tr.dataset.row); };
    tr.onkeydown = e => { if(e.key === 'Enter' && e.target === tr) onRow(tr.dataset.row); }; });
}
