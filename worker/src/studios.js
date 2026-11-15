// Studio picker for "Neuer Auftrag": a firm can have the list of its client's studios (for now FITYES). The admin taps
// "Studio wählen" and the studio's address becomes the start address. Typing any other address stays possible –
// the picker is only a shortcut. Firms without a list don't see the button.
// The list is refreshed by hand ("Liste aktualisieren" → edge function studios-sync), e.g. once a month.
import { t } from './i18n.js';
import { sb, esc, fmtDay } from './core.js';
import { modal, toast, ICONS } from './ui.js';

let cache = null, loading = null;
export function loadStudios(force){
  if(cache && !force) return Promise.resolve(cache);
  if(loading && !force) return loading;
  loading = sb.from('studios').select('slug,name,address,zip,city,lat,lng,status,opening_date,updated_at').neq('status', 'gone').order('name')
    .then(({ data, error }) => { loading = null; if(error) return cache || []; cache = data || []; return cache; });
  return loading;
}
export const hasStudios = () => !!(cache && cache.length);

export const studioBtnHtml = () => hasStudios() ? `<button class="btn ghost small" id="cStudio" style="margin-top:8px">${ICONS.pin}${esc(t('stPick'))}</button>` : '';

// "bald" (coming soon) first: those are the next orders
// a studio as a place for the address field (same shape as a search result)
const asPlace = s => {
  const street = s.zip ? s.address.replace(new RegExp(',\\s*' + s.zip + '.*$'), '') : s.address;
  return { name:street, sub:[s.zip, s.city].filter(Boolean).join(' '), city:s.city || '', kind:'house', lat:s.lat, lng:s.lng, studio:s.name };
};

export function openStudioPicker(onPick){
  const m = modal(`<h2>${esc(t('stTitle'))}</h2>
    <div class="searchbox"><span class="sb-ic">${ICONS.search}</span><input id="stQ" class="sb-in" placeholder="${esc(t('stSearch'))}" autocomplete="off" autocorrect="off"></div>
    <div class="results" id="stList" style="max-height:min(55vh,460px);overflow:auto"></div>
    <p class="small muted" id="stInfo" style="margin:10px 0 4px"></p>
    <button class="btn ghost small" id="stSync">${ICONS.refresh}${esc(t('stSync'))}</button>
    <button class="btn ghost" data-close style="margin-top:8px">${esc(t('close'))}</button>`);
  const q = m.querySelector('#stQ'), list = m.querySelector('#stList'), info = m.querySelector('#stInfo');
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
  const render = () => {
    const all = cache || [], v = norm(q.value.trim());
    const hit = all.filter(s => !v || norm(s.name + ' ' + s.address).includes(v))
      .sort((a, b) => (a.status === 'coming_soon' ? 0 : 1) - (b.status === 'coming_soon' ? 0 : 1) || a.name.localeCompare(b.name, 'de'));
    list.innerHTML = hit.length ? hit.map(s => `<button class="res" data-s="${esc(s.slug)}"><b>${esc(s.name)}${s.status === 'coming_soon' ? ` · <span style="color:var(--color-warning,#B45309)">${esc(t('stSoon'))}</span>` : ''}</b><span>${esc(s.address)}${s.opening_date ? ' · ' + esc(t('stOpens', { d:fmtDay(s.opening_date) })) : ''}</span></button>`).join('')
      : `<div class="res muted">${esc(t('notFound'))}</div>`;
    list.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { const s = all.find(x => x.slug === b.dataset.s); if(!s) return; m.remove(); onPick(asPlace(s), s); });
    const last = all.reduce((x, s) => s.updated_at > x ? s.updated_at : x, '');
    info.textContent = t('stInfo', { n:all.length, d:last ? fmtDay(last.slice(0, 10)) : '–' });
  };
  q.oninput = render; render(); setTimeout(() => q.focus(), 50);
  m.querySelector('[data-close]').onclick = () => m.remove();
  const sync = m.querySelector('#stSync');
  sync.onclick = async () => {
    sync.disabled = true; sync.textContent = t('stSyncing');
    try{
      const { data, error } = await sb.functions.invoke('studios-sync', { body:{} });
      if(error || !data || !data.ok) throw new Error('sync');
      await loadStudios(true); render();
      toast(data.added && data.added.length ? t('stSyncNew', { list:data.added.join(', ') }) : t('stSyncSame'));
    }catch{ toast(t('stSyncFail')); }
    sync.disabled = false; sync.innerHTML = ICONS.refresh + esc(t('stSync'));
  };
}
