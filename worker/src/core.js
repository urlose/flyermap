import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import { createClient } from '@supabase/supabase-js';
import { t, I } from './i18n.js';

export const NATIVE = Capacitor.isNativePlatform();
export const SB_URL = 'https://xobrvfkwqessbkdwiavu.supabase.co';
export const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhvYnJ2Zmt3cWVzc2JrZHdpYXZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2NzA4NTQsImV4cCI6MjEwODI0Njg1NH0.5AvLRyZaiqpYQV_O47o7MNO8kg7BEZdiU4-WYSPuNBM';
export const PRIVACY_URL = 'https://urlose.github.io/flyermap/privacy.html';
export const sb = createClient(SB_URL, SB_KEY, { auth:{ persistSession:true, storageKey:'fm-admin-auth' } });

/* ---------- storage ---------- */
export const store = {
  async get(k){ try{ const { value } = await Preferences.get({ key:k }); return value ? JSON.parse(value) : null; }catch{ return null; } },
  async set(k, v){ try{ await Preferences.set({ key:k, value:JSON.stringify(v) }); }catch{} },
  async del(k){ try{ await Preferences.remove({ key:k }); }catch{} },
};

/* ---------- worker API (token based) ---------- */
export class ApiError extends Error {}
export async function rpc(fn, body){
  let r;
  try{
    r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, { method:'POST', headers:{ apikey:SB_KEY, Authorization:'Bearer ' + SB_KEY, 'Content-Type':'application/json' }, body:JSON.stringify(body) });
  }catch{ throw new ApiError('net'); }
  const txt = await r.text(); let data = null; try{ data = txt ? JSON.parse(txt) : null; }catch{}
  if(!r.ok) throw new ApiError((data && data.message) || 'net');
  return data;
}
export const errText = e => { const k = 'e_' + (e && e.message); const v = t(k); return v === k ? (e && e.message && e.message !== 'net' ? e.message : t('e_net')) : v; };

/* ---------- helpers ---------- */
export const $ = s => document.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
export const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
export function hav(a, b, c, d){ const R = 6371000, r = Math.PI / 180, x = Math.sin((c-a)*r/2)**2 + Math.cos(a*r)*Math.cos(c*r)*Math.sin((d-b)*r/2)**2; return 2 * R * Math.asin(Math.sqrt(x)); }
const dec = () => I.lang === 'ru' ? ',' : ',';
export const fmtDist = m => m >= 1000 ? (m/1000).toFixed(1).replace('.', dec()) + ' ' + t('km') : Math.round(m) + ' ' + t('m');
export const fmtH = m => (m / 1000 / 3).toFixed(1).replace('.', dec());
export const fmtHm = min => (min / 60).toFixed(1).replace('.', ',');
export const fmtN = n => Math.round(n).toLocaleString(I.lang === 'ru' ? 'ru-RU' : I.lang === 'en' ? 'en-GB' : 'de-DE');
export const fmtTime = ms => { const s = Math.max(0, Math.floor(ms/1000)); const h = Math.floor(s/3600), m = Math.floor(s%3600/60), x = s%60; return (h ? h + ':' : '') + String(m).padStart(h ? 2 : 1, '0') + ':' + String(x).padStart(2, '0'); };
export const loc = () => I.lang === 'ru' ? 'ru-RU' : I.lang === 'en' ? 'en-GB' : 'de-DE';
export function fmtDay(d){
  if(!d) return t('noDate');
  const day = new Date(d + 'T00:00:00'), now = new Date(); now.setHours(0,0,0,0);
  const diff = Math.round((day - now) / 864e5);
  if(diff === 0) return t('today'); if(diff === 1) return t('tomorrow');
  return day.toLocaleDateString(loc(), { weekday:'short', day:'numeric', month:'short' });
}
export const fmtDT = d => d ? new Date(d).toLocaleString(loc(), { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';
export const ago = d => { if(!d) return t('noData'); const s = (Date.now() - new Date(d)) / 1000; if(s < 90) return t('justNow'); if(s < 3600) return t('minAgo', { n:Math.round(s/60) }); if(s < 86400) return t('hAgo', { n:Math.round(s/3600) }); return new Date(d).toLocaleDateString(loc()); };
export function waLink(phone, text){ let d = String(phone || '').replace(/[^0-9+]/g, ''); if(d.startsWith('+')) d = d.slice(1); else if(d.startsWith('00')) d = d.slice(2); else if(d.startsWith('0')) d = '49' + d.slice(1); return 'https://wa.me/' + d + (text ? '?text=' + encodeURIComponent(text) : ''); }
export const telLink = p => 'tel:' + String(p || '').replace(/[^0-9+]/g, '');

/* ---------- search (Photon / OpenStreetMap) ---------- */
export async function searchPlaces(q, citiesOnly, near){
  const c = near || [51.22, 6.78];
  let u = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=7&lang=de&lat=${c[0]}&lon=${c[1]}`;
  if(citiesOnly) u += '&osm_tag=place:city&osm_tag=place:town&osm_tag=place:village&osm_tag=place:suburb';
  const r = await fetch(u); if(!r.ok) throw new Error('search');
  const j = await r.json();
  return j.features.map(f => {
    const p = f.properties, street = p.street ? p.street + (p.housenumber ? ' ' + p.housenumber : '') : '';
    const title = p.name || street || p.city || '';
    const sub = [p.name && street ? street : '', p.district || p.locality, p.city && p.city !== title ? p.city : '', !citiesOnly ? '' : p.state].filter(Boolean).join(', ');
    return { name:title, city:p.city || (p.osm_key === 'place' ? p.name : '') || '', district:p.district || p.locality || (p.osm_value === 'suburb' || p.osm_value === 'quarter' ? p.name : '') || '', sub, lat:+f.geometry.coordinates[1].toFixed(6), lng:+f.geometry.coordinates[0].toFixed(6), osm_type:p.osm_type || '', osm_id:p.osm_id || null, kind:p.osm_value || '', km2:p.extent ? Math.round(Math.abs(p.extent[2] - p.extent[0]) * 111.32 * Math.cos(f.geometry.coordinates[1] * Math.PI / 180) * Math.abs(p.extent[1] - p.extent[3]) * 111.32) : null };
  });
}

// outline of a town / village / district (OSM boundary via Nominatim) as [[lat,lng]…]; exact = false → only a circle around the centre
export async function placeArea(c){
  const ring = gj => {
    if(!gj) return null; const rs = gj.type === 'Polygon' ? [gj.coordinates[0]] : gj.type === 'MultiPolygon' ? gj.coordinates.map(x => x[0]) : [];
    const area = r => Math.abs(r.reduce((s, q, i) => { const n = r[(i + 1) % r.length]; return s + q[0] * n[1] - n[0] * q[1]; }, 0));
    let r = rs.sort((a, b) => area(b) - area(a))[0]; if(!r || r.length < 4) return null;
    const k = Math.ceil(r.length / 300); r = r.filter((_, i) => i % k === 0);
    return r.map(q => [+q[1].toFixed(5), +q[0].toFixed(5)]);
  };
  const base = 'https://nominatim.openstreetmap.org/', opt = '&format=jsonv2&polygon_geojson=1&polygon_threshold=0.0002&accept-language=de';
  try{
    if(c.osm_type === 'R' && c.osm_id){ const j = await (await fetch(`${base}lookup?osm_ids=R${c.osm_id}${opt}`)).json(); const p = ring(j[0] && j[0].geojson); if(p) return { p, exact:true }; }
    const vb = [c.lng - 0.15, c.lat + 0.1, c.lng + 0.15, c.lat - 0.1].join(',');
    const j = await (await fetch(`${base}search?q=${encodeURIComponent(c.name)}&viewbox=${vb}&bounded=1&limit=6${opt}`)).json();
    for(const x of j || []){ const p = ring(x.geojson); if(p) return { p, exact:true }; }
  }catch{}
  const r = c.kind === 'city' ? 2500 : c.kind === 'town' ? 1500 : c.kind === 'village' || c.kind === 'hamlet' ? 600 : 900;
  return { p:circlePoly(c.lat, c.lng, r, 32).map(q => [+q[0].toFixed(5), +q[1].toFixed(5)]), exact:false };
}

// place name for a point: "district, town" (Photon reverse geocoding)
export async function reversePlace(lat, lng){
  const r = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&lang=de&limit=1`); if(!r.ok) return null;
  const f = ((await r.json()).features || [])[0]; if(!f) return null;
  const p = f.properties, town = p.city || p.town || p.village || (p.osm_key === 'place' ? p.name : '') || p.county || '';
  const part = p.district || p.locality || p.suburb || '';
  return [part && part !== town ? part : '', town].filter(Boolean).join(', ') || null;
}

/* ---------- walking zone (Valhalla) ---------- */
export function circlePoly(lat, lng, meters, n = 48){ const o = []; for(let i = 0; i < n; i++){ const a = i / n * 2 * Math.PI; o.push([lat + meters/111320*Math.cos(a), lng + meters/(111320*Math.cos(lat*Math.PI/180))*Math.sin(a)]); } return o; }
export async function isochrone(lat, lng, min){
  try{
    const q = { locations:[{ lat, lon:lng }], costing:'pedestrian', contours:[{ time:min }], polygons:true, denoise:0.5, generalize:30 };
    const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 12000);
    const r = await fetch('https://valhalla1.openstreetmap.de/isochrone?json=' + encodeURIComponent(JSON.stringify(q)), { signal:ctrl.signal });
    if(!r.ok) throw 0;
    const g = await r.json(); let c = g.features[0].geometry.coordinates;
    if(g.features[0].geometry.type === 'MultiPolygon') c = c[0];
    return { poly:c[0].map(([x, y]) => [y, x]), real:true };
  }catch{ return { poly:circlePoly(lat, lng, min * 83), real:false }; }
}

/* ---------- demo paths ---------- */
export function decodePolyline6(str){
  let i = 0, lat = 0, lng = 0; const out = [];
  while(i < str.length){
    for(const k of [0, 1]){ let b, sh = 0, res = 0; do{ b = str.charCodeAt(i++) - 63; res |= (b & 0x1f) << sh; sh += 5; }while(b >= 0x20); const d = (res & 1) ? ~(res >> 1) : (res >> 1); if(k === 0) lat += d; else lng += d; }
    out.push([lat / 1e6, lng / 1e6]);
  }
  return out;
}
export function densify(pts, step){
  const out = [pts[0]];
  for(let i = 1; i < pts.length; i++){ const a = pts[i-1], b = pts[i], n = Math.max(1, Math.round(hav(a[0], a[1], b[0], b[1]) / step)); for(let k = 1; k <= n; k++) out.push([a[0] + (b[0]-a[0])*k/n, a[1] + (b[1]-a[1])*k/n]); }
  return out;
}
export async function loopPath(lat, lng, rot = Math.random() * 6.28, R = 380){
  const mLat = 111320, mLng = 111320 * Math.cos(lat * Math.PI / 180);
  const wp = [0, 1, 2, 3].map(i => { const a = rot + i * Math.PI / 2, r = R * (0.75 + Math.random() * 0.5); return { lat:lat + r*Math.cos(a)/mLat, lon:lng + r*Math.sin(a)/mLng }; });
  try{
    const q = { locations:[{ lat, lon:lng }, ...wp, { lat, lon:lng }], costing:'pedestrian' };
    const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 10000);
    const r = await fetch('https://valhalla1.openstreetmap.de/route?json=' + encodeURIComponent(JSON.stringify(q)), { signal:ctrl.signal });
    if(!r.ok) throw 0;
    const pts = (await r.json()).trip.legs.flatMap(l => decodePolyline6(l.shape));
    if(pts.length > 2) return densify(pts, 5);
  }catch{}
  const loop = []; for(let i = 0; i <= 60; i++){ const a = rot + i/60*Math.PI*2; loop.push([lat + R*Math.cos(a)/mLat, lng + R*Math.sin(a)/mLng]); }
  return densify(loop, 5);
}

// the road between two places of an order (Valhalla; any vehicle – car, bike or bus use the roads) – [[lat,lng]…]; null when not available
const rideCache = new Map();
// road between two points (car trips between places, bike, bus). The public Valhalla server answers only a few requests at
// a time: requests are queued (2 at once) and retried, and a failure is not remembered – the next draw asks again.
let rideBusy = 0; const rideQueue = [];
const rideSlot = () => new Promise(res => { if(rideBusy < 2){ rideBusy++; res(); } else rideQueue.push(res); });
const rideFree = () => { const n = rideQueue.shift(); if(n) n(); else rideBusy--; };
// Valhalla first (car, bike); when it does not answer (the public server is down now and then), the OSRM demo server draws
// the road for the car. A server that failed is skipped for 5 minutes, so a map with many trips does not wait for each one.
let valhallaDownUntil = 0;
async function fetchJson(url, ms){ const ctrl = new AbortController(), tm = setTimeout(() => ctrl.abort(), ms); try{ const r = await fetch(url, { signal:ctrl.signal }); return { status:r.status, j:r.ok ? await r.json() : null }; }finally{ clearTimeout(tm); } }
async function viaValhalla(a, b, costing){
  const q = { locations:[{ lat:a[0], lon:a[1] }, { lat:b[0], lon:b[1] }], costing };
  const { status, j } = await fetchJson('https://valhalla1.openstreetmap.de/route?json=' + encodeURIComponent(JSON.stringify(q)), 7000);
  if(!j){ if(status === 429 || status >= 500) throw new Error('busy'); return null; }
  const tr = j.trip, pts = tr.legs.flatMap(l => decodePolyline6(l.shape)); if(pts.length < 2) return null;
  pts.sec = tr.summary && tr.summary.time; pts.km = tr.summary && tr.summary.length; return pts;
}
async function viaOsrm(a, b){
  const { j } = await fetchJson(`https://router.project-osrm.org/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=polyline6`, 9000);
  const rt = j && j.code === 'Ok' && j.routes && j.routes[0]; if(!rt) return null;
  const pts = decodePolyline6(rt.geometry); if(pts.length < 2) return null;
  pts.sec = rt.duration; pts.km = rt.distance / 1000; return pts;
}
export async function bikeRoute(a, b, costing = 'auto'){
  const k = costing + ':' + a.map(x => (+x).toFixed(5)).join(',') + '>' + b.map(x => (+x).toFixed(5)).join(',');
  if(rideCache.has(k)) return rideCache.get(k);
  const p = (async () => {
    for(let attempt = 0; attempt < 3; attempt++){
      await rideSlot();
      try{
        if(Date.now() > valhallaDownUntil){ try{ return await viaValhalla(a, b, costing); }catch{ valhallaDownUntil = Date.now() + 5 * 60000; } }
        const o = await viaOsrm(a, b); if(o) return o;
      }catch{}finally{ rideFree(); }
      await new Promise(res => setTimeout(res, 1200 * (attempt + 1)));   // both busy: wait and try again
    }
    return undefined;
  })();
  rideCache.set(k, p);   // both workers of a car share the same trips: one request for both
  const out = await p; if(out === undefined) rideCache.delete(k);
  return out || null;
}

export function normPhone(raw){
  let s = String(raw || '').replace(/[^\d+]/g, '');
  if(s.startsWith('00')) s = '+' + s.slice(2);
  else if(s.startsWith('0')) s = '+49' + s.slice(1);
  else if(!s.startsWith('+')) s = '+' + (s.startsWith('49') ? s : '49' + s);
  const digits = s.replace(/\D/g, '');
  return digits.length >= 9 && digits.length <= 15 ? '+' + digits : null;
}
// login / admin invite: SMS codes go only to German mobile numbers (+49 15x/16x/17x), so nobody can make us pay for SMS abroad
export function deMobile(raw){ const p = normPhone(raw); return p && /^\+491[5-7]\d{8,9}$/.test(p) ? p : null; }

