// WhatsApp Cloud API webhook: a worker sends "FlyerMap Code ABC123" from the own WhatsApp to the firm number;
// Meta tells us the sender's number, so the number is confirmed (wa_confirm). Meta calls this without a JWT
// (verify_jwt off): GET is checked with WA_VERIFY_TOKEN, POST with the signature of WA_APP_SECRET.
// Secrets: WA_VERIFY_TOKEN, WA_APP_SECRET, optional WA_TOKEN (to answer "confirmed").
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const VERIFY = Deno.env.get('WA_VERIFY_TOKEN') || '';
const SECRET = Deno.env.get('WA_APP_SECRET') || '';
const WA_TOKEN = Deno.env.get('WA_TOKEN') || '';
const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const enc = new TextEncoder();

async function hmac(raw: string){
  const key = await crypto.subtle.importKey('raw', enc.encode(SECRET), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(raw)));
  return 'sha256=' + Array.from(sig).map(b => b.toString(16).padStart(2, '0')).join('');
}
function same(a: string, b: string){ if(a.length !== b.length) return false; let d = 0; for(let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

async function reply(phoneId: string, to: string, text: string){
  if(!WA_TOKEN || !phoneId) return;
  try{
    await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, { method:'POST', headers:{ Authorization:'Bearer ' + WA_TOKEN, 'Content-Type':'application/json' },
      body:JSON.stringify({ messaging_product:'whatsapp', to, type:'text', text:{ body:text } }) });
  }catch{ /* the confirmation itself already worked */ }
}

Deno.serve(async req => {
  const url = new URL(req.url);
  if(req.method === 'GET'){
    if(VERIFY && url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === VERIFY) return new Response(url.searchParams.get('hub.challenge') || '');
    return new Response('forbidden', { status:403 });
  }
  if(req.method !== 'POST') return new Response('method', { status:405 });
  if(!SECRET) return new Response('not configured', { status:503 });
  const raw = await req.text();
  if(!same(await hmac(raw), req.headers.get('x-hub-signature-256') || '')) return new Response('bad signature', { status:401 });
  let body: any; try{ body = JSON.parse(raw); }catch{ return new Response('ok'); }
  for(const entry of body.entry || []) for(const ch of entry.changes || []){
    const v = ch.value || {}, phoneId = v.metadata && v.metadata.phone_number_id;
    for(const m of v.messages || []){
      if(m.type !== 'text' || !m.from) continue;
      const { data } = await sb.rpc('wa_confirm', { p_from:m.from, p_text:(m.text && m.text.body) || '' });
      if(data === 'ok') await reply(phoneId, m.from, '✅ FlyerMap: Nummer bestätigt. Du kannst zur App zurück.');
      else if(data === 'unknown') await reply(phoneId, m.from, 'FlyerMap: Code unbekannt oder abgelaufen. Bitte in der App einen neuen Code holen.');
    }
  }
  return new Response('ok');
});
