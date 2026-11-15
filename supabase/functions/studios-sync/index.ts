// Refreshes the studio list of the caller's firm from the chain's website (FITYES). Called by hand from the studio picker
// in "Neuer Auftrag" (button "Liste aktualisieren"), e.g. once a month – no automatic schedule.
// Only firms that already have a studio list can refresh it (the list is a helper for one client, not for every firm).
// New studios are added, changed ones updated, studios no longer on the website get status "gone" (hidden in the picker).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const URL_ = Deno.env.get('SUPABASE_URL')!, SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const sb = createClient(URL_, SERVICE);
const CORS = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods':'POST, OPTIONS' };
const out = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers:{ ...CORS, 'Content-Type':'application/json' } });
const API = 'https://backend.fityes.club/api/studios?pagination[pageSize]=500&fields[0]=name&fields[1]=slug&fields[2]=studioStatus'
  + '&populate[contact][fields][0]=address&populate[location]=true&populate[keyFacts][fields][0]=openingDate';

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const inDE = (lat: number | null, lng: number | null) => lat != null && lng != null && lat > 47 && lat < 55.2 && lng > 5.8 && lng < 15.1;

function parse(s: any){
  const a = s.attributes || s;   // Strapi v4 / v5
  const slug = String(a.slug || '').trim().toLowerCase(); const name = String(a.name || '').trim();
  const raw = String(a.contact?.address || '').replace(/\s*\n\s*/g, ', ').replace(/\s+,/g, ',').replace(/\s+/g, ' ').trim();
  // "Straße 1, 12345 Ort" – the website once had a 7-digit postcode, take the last 5 digits
  const m = raw.match(/^(.*?),?\s*\d*?(\d{5})\s+([^,]+)$/);
  const street = m ? m[1].replace(/,\s*$/, '').trim() : raw, zip = m ? m[2] : null, city = m ? m[3].trim() : null;
  // two coordinate fields on the website; they sometimes disagree (copy errors) – prefer the one that lies in Germany
  // and, if both do, the "coordinates" field (it was right in every known conflict)
  const loc = a.location || {}, c = loc.coordinates || {};
  let lat = num(c.lat), lng = num(c.lng);
  if(!inDE(lat, lng)){ lat = num(loc.lat); lng = num(loc.lng); }
  if(!slug || !name || !street || !inDE(lat, lng)) return null;
  const status = a.studioStatus === 'coming_soon' ? 'coming_soon' : 'opened';
  const od = a.keyFacts?.openingDate; const opening_date = typeof od === 'string' && /^\d{4}-\d{2}-\d{2}/.test(od) ? od.slice(0, 10) : null;
  return { slug, name, address:zip ? `${street}, ${zip} ${city}` : street, zip, city, lat, lng, status, opening_date };
}

Deno.serve(async req => {
  if(req.method === 'OPTIONS') return new Response('ok', { headers:CORS });
  if(req.method !== 'POST') return out({ error:'method' }, 405);
  const auth = req.headers.get('authorization') || '';
  const user = createClient(URL_, ANON, { global:{ headers:{ Authorization:auth } } });
  const { data:co } = await user.rpc('my_company');
  if(!co) return out({ error:'not_admin' }, 403);
  const { count } = await sb.from('studios').select('id', { count:'exact', head:true }).eq('company_id', co).eq('source', 'fityes');
  if(!count) return out({ error:'no_list' }, 403);

  let rows: any[];
  try{
    const r = await fetch(API, { headers:{ accept:'application/json' } });
    if(!r.ok) throw new Error('http ' + r.status);
    const j = await r.json(); rows = (j.data || []).map(parse).filter(Boolean);
  }catch(e){ return out({ error:'fetch', detail:String(e) }, 502); }
  if(rows.length < 5) return out({ error:'too_few', n:rows.length }, 502);   // website changed – keep the old list

  const now = new Date().toISOString();
  const { data:old } = await sb.from('studios').select('slug').eq('company_id', co).eq('source', 'fityes');
  const had = new Set((old || []).map(x => x.slug)), seen = new Set(rows.map(x => x.slug));
  const { error } = await sb.from('studios').upsert(rows.map(x => ({ ...x, company_id:co, source:'fityes', updated_at:now })), { onConflict:'company_id,source,slug' });
  if(error) return out({ error:'db', detail:error.message }, 500);
  const goneSlugs = [...had].filter(s => !seen.has(s));
  if(goneSlugs.length) await sb.from('studios').update({ status:'gone', updated_at:now }).eq('company_id', co).eq('source', 'fityes').in('slug', goneSlugs);
  return out({ ok:true, total:rows.length, added:rows.filter(x => !had.has(x.slug)).map(x => x.name), gone:goneSlugs.length });
});
