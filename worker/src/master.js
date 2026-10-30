// Platform screen for master admins: all companies, all distributors (master data only), managing master admins.
import { t } from './i18n.js';
import { sb, $, esc, ago, waLink, telLink } from './core.js';
import { shell, topbar, bindBack, toast, confirmBox, modal, statusPill, emptyState, avatar, ICONS } from './ui.js';

const isSet = v => !!v && !/^\[/.test(String(v).trim());
export async function viewMaster(back){
  shell('people', `${topbar(t('master'), back)}<div class="pad" id="msBody"><p class="muted">${esc(t('loadingShort'))}</p></div>`);
  bindBack(back);
  const { data, error } = await sb.rpc('master_overview');
  if(!$('#msBody')) return;
  if(error){ $('#msBody').innerHTML = `<div class="warnbox">${esc(error.message)}</div>`; return; }
  const cos = data.companies || [], ws = data.workers || [], coName = id => { const c = cos.find(x => x.id === id); return c ? (isSet(c.name) ? c.name : t('msNoName')) : '—'; };
  let q = '';
  const render = () => {
    const ql = q.toLowerCase(), wl = ws.filter(w => !ql || (w.name + ' ' + w.phone + ' ' + coName(w.company_id)).toLowerCase().includes(ql));
    $('#msBody').innerHTML = `
      <div class="kpis"><div class="kpi k-info"><b>${cos.length}</b><span>${esc(t('msCompanies'))}</span></div><div class="kpi k-ok"><b>${ws.length}</b><span>${esc(t('msWorkers'))}</span></div><div class="kpi k-neutral"><b>${ws.filter(w => w.offers_ok).length}</b><span>${esc(t('msOpen'))}</span></div></div>
      <h2 class="sec">${esc(t('msCompanies'))}</h2>
      ${cos.map(c => `<div class="card" style="display:block"><div class="sec-row" style="margin:0"><b>${esc(isSet(c.name) ? c.name : t('msNoName'))}</b>${c.avv_version ? statusPill('ok', 'AVV') : statusPill('bad', t('msNoAvv'))}</div>
        <div class="muted small">${esc([c.representative, c.street, [c.zip, c.city].filter(Boolean).join(' '), c.email, c.phone].filter(Boolean).join(' · ') || t('msNoData'))}</div>
        <div class="small" style="margin-top:6px">${esc(t('msCounts', { a:c.admins, w:c.workers, o:c.tasks }))} · ${esc(t('msLast', { a:c.last_day ? ago(c.last_day) : '—' }))} · ${esc(t('firmCode'))}: <b>${esc(c.join_code)}</b>${c.works_council ? ' · Betriebsrat' : ''}</div></div>`).join('') || emptyState(t('msNone'), 'inbox')}
      <h2 class="sec">${esc(t('msWorkers'))} (${wl.length})</h2>
      <div class="searchbox"><span class="sb-ic">${ICONS.search}</span><input id="msQ" class="sb-in" placeholder="${esc(t('msSearch'))}" value="${esc(q)}"></div>
      ${wl.map(w => `<div class="card worker-card"><div class="wc-main" style="cursor:default">${avatar(w.name, w.active ? 'live' : '')}<div class="grow"><b>${esc(w.name)}</b>
        <span>${esc(coName(w.company_id))} · ${esc((w.cities || []).map(c => c.name).join(', '))}</span>
        <span>${w.active ? statusPill('live', t('stLive')) : esc(t('lastActive', { a:ago(w.last_seen) }))}${w.offers_ok ? ' · ' + esc(t('msOffersOk')) : ''}</span></div></div>
        <div class="wc-act"><a class="btn ghost small" href="${telLink(w.phone)}">${ICONS.phone}${esc(t('call'))}</a><a class="btn ghost small" target="_blank" rel="noopener" href="${waLink(w.phone)}">${ICONS.chat}WhatsApp</a></div></div>`).join('') || emptyState(t('notFound'), 'search')}
      <h2 class="sec">${esc(t('msMasters'))}</h2>
      <div class="card" style="display:block">
        ${(data.masters || []).map(m => `<div class="sec-row" style="margin:4px 0"><span>${esc(m.ident)}${m.me ? ' (' + esc(t('msYou')) + ')' : ''}</span>${m.me ? '' : `<button class="link danger-text" data-rm="${esc(m.user_id)}">${esc(t('msRemove'))}</button>`}</div>`).join('')}
        ${(data.invites || []).map(i => `<div class="sec-row" style="margin:4px 0"><span class="muted">${esc(i)} · ${esc(t('msInvited'))}</span><button class="link danger-text" data-rmi="${esc(i)}">${esc(t('msRemove'))}</button></div>`).join('')}
        <button class="btn ghost small" id="msAdd" style="margin-top:10px">${ICONS.users}${esc(t('msAdd'))}</button>
      </div>`;
    const qi = $('#msQ'); qi.oninput = () => { q = qi.value; const pos = qi.selectionStart; render(); const n = $('#msQ'); n.focus(); n.setSelectionRange(pos, pos); };
    document.querySelectorAll('[data-rm],[data-rmi]').forEach(b => b.onclick = async () => {
      if(!await confirmBox(t('msRemove'), t('msRemoveQ'), t('msRemove'), true)) return;
      const { error } = await sb.rpc('remove_master', { p_user:b.dataset.rm || null, p_ident:b.dataset.rmi || null });
      if(error) return toast(error.message); viewMaster(back);
    });
    $('#msAdd').onclick = () => {
      const m = modal(`<h2>${esc(t('msAdd'))}</h2><p class="muted small">${esc(t('msAddHint'))}</p><input class="in" id="msId" placeholder="+49 170 1234567 / name@firma.de">
        <button class="btn primary" id="msGo" style="margin-top:12px">${esc(t('msAdd'))}</button><div class="err" id="msErr"></div>`);
      m.querySelector('#msGo').onclick = async () => {
        const { data:r, error } = await sb.rpc('add_master', { p_ident:m.querySelector('#msId').value });
        if(error){ m.querySelector('#msErr').textContent = error.message === 'bad_ident' ? t('msBadIdent') : error.message; return; }
        m.remove(); toast(r && r.added ? t('msAdded') : t('msInvitedToast')); viewMaster(back);
      };
    };
  };
  render();
}

// distributors of other companies who agreed to receive job offers
export async function poolHtml(){
  const { data, error } = await sb.rpc('offer_pool');
  if(error) return `<div class="warnbox">${esc(error.message)}</div>`;
  if(!data || !data.length) return `<p class="muted small">${esc(t('poolNone'))}</p>`;
  return `<p class="muted small">${esc(t('poolHint'))}</p>` + data.map(w => `<div class="card worker-card"><div class="wc-main" style="cursor:default">${avatar(w.name)}<div class="grow"><b>${esc(w.name)}</b><span>${esc((w.cities || []).map(c => c.name).join(', '))}</span></div></div>
    <div class="wc-act"><a class="btn ghost small" href="${telLink(w.phone)}">${ICONS.phone}${esc(t('call'))}</a><a class="btn ghost small" target="_blank" rel="noopener" href="${waLink(w.phone, t('poolMsg'))}">${ICONS.chat}WhatsApp</a></div></div>`).join('');
}
