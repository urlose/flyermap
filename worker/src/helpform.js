// Help report form, AI phase A (16.11.2026): an OPTIONAL "about how many" field, only for the reasons where a number
// decides what happens (no mailboxes reachable, flyers short / left over). Every other report looks exactly as before.
// Sending: with a number → help_request2 (stores amount / detail); if the database does not have it yet (migration not
// applied) → the old help_request, with the number written into the text so the admin still sees it.
import { t } from './i18n.js';
import { esc } from './core.js';

export const AMOUNT_REASONS = ['nobox', 'flyers'];
const MAX = 100000;

export const amountFieldHtml = () => `<div id="hpAmtBox" hidden>
  <div id="hpDetailBox" hidden><label class="f" id="hpDetailL">${esc(t('haDetail'))} ${esc(t('haOptional'))}</label>
  <div id="hpDetail" class="reasons" role="radiogroup" aria-labelledby="hpDetailL">
    <button type="button" class="chip" role="radio" aria-checked="false" data-d="short">${esc(t('haShort'))}</button>
    <button type="button" class="chip" role="radio" aria-checked="false" data-d="leftover">${esc(t('haLeftover'))}</button>
  </div></div>
  <label class="f" for="hpAmt" id="hpAmtL"></label>
  <input class="in" id="hpAmt" type="number" inputmode="numeric" min="0" max="${MAX}" step="1" placeholder="${esc(t('haAmtPh'))}" style="max-width:180px">
</div>`;

// state of the extra field; reset() after sending or when the reason changes
export function bindAmount(){
  let detail = null;
  const box = document.getElementById('hpAmtBox'), det = document.getElementById('hpDetail'), inp = document.getElementById('hpAmt'), lab = document.getElementById('hpAmtL');
  const chips = () => det.querySelectorAll('[data-d]');
  chips().forEach(b => b.onclick = () => { detail = detail === b.dataset.d ? null : b.dataset.d; chips().forEach(x => { const on = x.dataset.d === detail; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); }); });
  return {
    show(reason){
      const on = AMOUNT_REASONS.includes(reason); box.hidden = !on; document.getElementById('hpDetailBox').hidden = reason !== 'flyers';
      lab.textContent = t(reason === 'flyers' ? 'haAmtFlyers' : 'haAmtBoxes') + ' ' + t('haOptional');
      if(reason !== 'flyers'){ detail = null; chips().forEach(x => { x.classList.remove('on'); x.setAttribute('aria-checked', false); }); }
      if(!on) inp.value = '';
    },
    // → { amount, detail } or { error }
    read(reason){
      if(!AMOUNT_REASONS.includes(reason)) return { amount:null, detail:null };
      const v = inp.value.trim();
      if(v === '') return { amount:null, detail:reason === 'flyers' ? detail : null };
      const n = Number(v);
      if(!Number.isInteger(n) || n < 0 || n > MAX) return { error:t('e_amount_invalid') };
      return { amount:n, detail:reason === 'flyers' ? detail : null };
    },
    reset(){ this.show(''); },
  };
}

// args: the arguments of help_request; extra: { amount, detail }
export async function sendHelp(rpc, args, extra, reason){
  if(extra.amount == null && !extra.detail) return rpc('help_request', args);
  try{
    return await rpc('help_request2', { ...args, p_amount:extra.amount, p_detail:extra.detail });
  }catch(e){
    if(!/could not find the function/i.test((e && e.message) || '')) throw e;
    // database without the phase A migration: old function, number in the text
    const note = [extra.detail ? t(extra.detail === 'short' ? 'haShort' : 'haLeftover') : '', extra.amount != null ? t(reason === 'flyers' ? 'haInTextFlyers' : 'haInTextBoxes', { n:extra.amount }) : ''].filter(Boolean).join(', ');
    return rpc('help_request', { ...args, p_text:[args.p_text, note].filter(Boolean).join(' · ') });
  }
}
