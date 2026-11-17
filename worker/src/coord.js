// Role "Koordinator" in the admin panel (database side: supabase/2026-11-17_coordinator_role.sql).
// A coordinator sees everything of the firm, answers help reports, puts distributors on free routes and invites
// distributors with a personal link. Every other write is refused by the database; the panel hides those controls.
import { T, t } from './i18n.js';
import './i18n_en.js';   // creates T.en; must run before the lines below add to it
import { sb, esc } from './core.js';

Object.assign(T.de, {
  roleAdmin:'Admin', roleCoord:'Koordinator', invRole:'Rolle', invName:'Name', invNameHint:'Wird bei Verteilern angezeigt, die über den persönlichen Link kommen.',
  coordRoleHint:'Koordinator: sieht alles, beantwortet Hilfe-Meldungen, teilt Verteiler freien Routen zu und lädt mit eigenem Link ein. Ändert sonst nichts.',
  myLinkTitle:'Dein persönlicher Einladungslink', myLinkHint:'Wer sich über diesen Link registriert, kommt in die Firma und wird dir zugeordnet.',
  myLinkMsg:'Hallo! Melde dich über diesen Link als Verteiler an: {link}', referredBy:'Geworben von {n}',
  coordFreeOnly:'Als Koordinator kannst du nur freie oder abgelehnte Routen vergeben.', adminsTitle:'Admins und Koordinatoren',
  makeCoord:'Zum Koordinator machen', makeAdmin:'Zum Admin machen', lastAdmin:'Mindestens ein Admin muss bleiben.', youLbl:'du',
});
Object.assign(T.ru, {
  roleAdmin:'Админ', roleCoord:'Координатор', invRole:'Роль', invName:'Имя', invNameHint:'Показывается у работников, пришедших по личной ссылке.',
  coordRoleHint:'Координатор: видит всё, отвечает на обращения, назначает работников на свободные маршруты и приглашает по своей ссылке. Больше ничего не меняет.',
  myLinkTitle:'Твоя личная ссылка-приглашение', myLinkHint:'Кто зарегистрируется по этой ссылке, попадёт в фирму, и будет видно, что его пригласил ты.',
  myLinkMsg:'Привет! Зарегистрируйся раздатчиком по этой ссылке: {link}', referredBy:'Пригласил(а): {n}',
  coordFreeOnly:'Координатор может назначать только свободные или отклонённые маршруты.', adminsTitle:'Админы и координаторы',
  makeCoord:'Сделать координатором', makeAdmin:'Сделать админом', lastAdmin:'Должен остаться хотя бы один админ.', youLbl:'ты',
});
Object.assign(T.en, {
  roleAdmin:'Admin', roleCoord:'Coordinator', invRole:'Role', invName:'Name', invNameHint:'Shown with distributors who join through the personal link.',
  coordRoleHint:'Coordinator: sees everything, answers help reports, puts distributors on free routes and invites with an own link. Changes nothing else.',
  myLinkTitle:'Your personal invitation link', myLinkHint:'Whoever registers through this link joins the firm and is shown as invited by you.',
  myLinkMsg:'Hi! Register as a distributor through this link: {link}', referredBy:'Invited by {n}',
  coordFreeOnly:'As a coordinator you can only give out free or declined routes.', adminsTitle:'Admins and coordinators',
  makeCoord:'Make coordinator', makeAdmin:'Make admin', lastAdmin:'At least one admin has to stay.', youLbl:'you',
});

// controls that change something (the database refuses them for coordinators anyway), and the distributors'
// login links (a login link signs in as that distributor: acting for him, not watching)
const HIDE = ['#tNew', '#create', '#fab', '#tEdit', '#tEdit2', '#tCancel', '#tDel', '#tDone', '#tFlEdit', '#tInv', '#tDemo', '#tWork',
  '#wsave', '#wdel', '#wNewLink', '#fcEdit', '#fcNew', '#fcAvv', '#ctSave', '#ctStd', '#botCard', '#invBox .card:not(#myRefCard)', '#linkBox',
  '[data-color]', '[data-reday]', '[data-merge]', '[data-swap]', '[data-wk]', '[data-lateok]', '[data-lateno]', '[data-dates]',
  '[data-waive]', '[data-ver]', '[data-cpclose]', '[data-cpopen]', '[data-rok]', '[data-rback]'];
let ROLE = 'admin';
export const isCoord = () => ROLE === 'coordinator';
export function applyRole(role){
  ROLE = role === 'coordinator' ? 'coordinator' : 'admin';
  document.body.classList.toggle('role-coord', isCoord());
  if(!document.getElementById('roleCss')){
    const s = document.createElement('style'); s.id = 'roleCss';
    s.textContent = HIDE.map(x => 'body.role-coord ' + x).join(',') + '{display:none!important}';
    document.head.appendChild(s);
  }
}

// admins of the firm with name and role (names for "invited by"); empty before the database part is installed
export async function loadAdmins(){
  const r = await sb.from('admins').select('user_id,display_name,phone,email,role,created_at').order('created_at');
  return r.error ? [] : (r.data || []);
}
export const adminLabel = a => (a && (a.display_name || a.phone || a.email)) || '—';
export const adminName = (admins, uid) => adminLabel((admins || []).find(a => a.user_id === uid));

// distributors with the referrer; falls back to the old column list before the database part is installed
export async function selectWorkers(cols){
  const r = await sb.from('workers').select(cols + ',referred_by').order('name');
  return r.error && /referred_by/.test(r.error.message || '') ? sb.from('workers').select(cols).order('name') : r;
}

export function refLinkCardHtml(){
  return `<div class="card" style="display:block;margin:0 0 4px" id="myRefCard"><b>${esc(t('myLinkTitle'))}</b><p class="small muted" style="margin:4px 0 8px">${esc(t('myLinkHint'))}</p>
    <div class="code-row"><input class="in small" readonly id="myRefLink" value="…" style="flex:1;min-width:0"><button class="btn ghost small" id="myRefCp">${esc(t('copy'))}</button></div>
    <a class="btn ghost small" id="myRefWa" style="margin-top:8px" target="_blank" rel="noopener" href="#">WhatsApp</a></div>`;
}
export async function bindRefLink(appLink, toast){
  const { data, error } = await sb.rpc('my_ref_code');
  const box = document.getElementById('myRefCard'); if(!box) return;
  if(error || !data){ box.remove(); return; }
  const link = appLink + '?neu=' + data;
  document.getElementById('myRefLink').value = link;
  document.getElementById('myRefWa').href = 'https://wa.me/?text=' + encodeURIComponent(t('myLinkMsg', { link }));
  document.getElementById('myRefCp').onclick = async () => { try{ await navigator.clipboard.writeText(link); toast(t('copied')); }catch{ document.getElementById('myRefLink').select(); } };
}

// invitation: role and name
export const inviteRoleHtml = () => `<label class="f" for="invRole">${esc(t('invRole'))}</label>
  <select class="in" id="invRole"><option value="admin">${esc(t('roleAdmin'))}</option><option value="coordinator">${esc(t('roleCoord'))}</option></select>
  <p class="small muted" id="invRoleHint" hidden>${esc(t('coordRoleHint'))}</p>
  <label class="f" for="invName">${esc(t('invName'))}</label><input class="in" id="invName" maxlength="60"><p class="small muted">${esc(t('invNameHint'))}</p>`;
export function bindInviteRole(mo){
  const s = mo.querySelector('#invRole'), h = mo.querySelector('#invRoleHint'); if(s && h) s.onchange = () => { h.hidden = s.value !== 'coordinator'; };
}
export const inviteRoleValues = mo => ({ role:(mo.querySelector('#invRole') || {}).value || 'admin', display_name:((mo.querySelector('#invName') || {}).value || '').trim().slice(0, 60) || null });

// settings: list with role switch (full admins only)
export function adminsCardHtml(admins, me){
  if(isCoord() || !(admins || []).some(a => a.role)) return '';
  return `<h2 class="sec">${esc(t('adminsTitle'))}</h2><div class="card" style="display:block" id="adminsCard">${admins.map(a => `<div class="person-row" style="padding:6px 0"><div><b>${esc(adminLabel(a))}${a.user_id === me ? ' · ' + esc(t('youLbl')) : ''}</b><span>${esc(t(a.role === 'coordinator' ? 'roleCoord' : 'roleAdmin'))}${a.phone && a.display_name ? ' · ' + esc(a.phone) : ''}</span></div>
    ${a.user_id === me ? '' : `<button class="btn ghost small" data-role="${esc(a.user_id)}" data-to="${a.role === 'coordinator' ? 'admin' : 'coordinator'}" style="margin-left:auto;width:auto">${esc(t(a.role === 'coordinator' ? 'makeAdmin' : 'makeCoord'))}</button>`}</div>`).join('')}</div>`;
}
export function bindAdminsCard(done, toast, errText){
  document.querySelectorAll('[data-role]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    const { error } = await sb.rpc('set_admin_role', { p_user:b.dataset.role, p_role:b.dataset.to });
    if(error){ b.disabled = false; toast(/last_admin/.test(error.message || '') ? t('lastAdmin') : errText(error)); return; }
    toast(t('saved')); done();
  });
}
