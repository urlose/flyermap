// Car rides between work areas of a time-first plan (19.11.2026): road time, distance and the road itself, computed here –
// no routing service. The car roads around the order are loaded once from OpenStreetMap (Overpass, the same source as the
// streets), a shortest-time search runs from every end/start point of a work area. Without an answer from the map server:
// straight line × 1.35 at 45 km/h + 3 min, marked as estimate (known:false) so the admin can check it or type it in.
// Pure parts tested in test/carroute.mjs.
import { distanceM } from './circlearea.js';

const OVERPASS = ['https://overpass.kumi.systems/api/interpreter', 'https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.openstreetmap.fr/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const MAIN = 'motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified';
const LOCAL = 'residential|living_street';   // no service roads: lighter query, the busy public servers answer more often
const SPEED = { motorway:115, motorway_link:60, trunk:90, trunk_link:50, primary:70, primary_link:45, secondary:65, secondary_link:40,
  tertiary:55, tertiary_link:35, unclassified:45, residential:30, living_street:10, service:15 };
const FACTOR = 0.8, SNAP_M = 900, LAST_KMH = 20;   // houses → nearest car road at 20 km/h (village streets, parking)
const FILT = '["access"!~"^(private|no)$"]["motor_vehicle"!~"^(private|no)$"]["area"!="yes"]';

export function roadSpeed(tags = {}){
  const v = String(tags.maxspeed || '').trim().toLowerCase();
  let s = /^de:urban$/.test(v) ? 50 : /^de:rural$/.test(v) ? 100 : /^(none|de:motorway)$/.test(v) ? 130 : /^walk|de:living_street$/.test(v) ? 10 : parseInt(v, 10);
  if(/mph/.test(v) && s) s *= 1.609;
  const base = SPEED[tags.highway] || 30;
  return Math.max(5, Math.min(130, Number.isFinite(s) && s > 0 ? s : base)) * FACTOR;
}

export function carGraph(json){
  const id = new Map(), pts = [], adj = [];
  const node = (la, lo) => { const k = la.toFixed(6) + ',' + lo.toFixed(6); let i = id.get(k); if(i == null){ i = pts.length; id.set(k, i); pts.push([la, lo]); adj.push([]); } return i; };
  for(const w of (json && json.elements) || []){
    if(w.type !== 'way' || !w.geometry || w.geometry.length < 2) continue;
    const tg = w.tags || {}, v = roadSpeed(tg) * 1000 / 60;   // m per minute
    const ow = tg.oneway === 'yes' || tg.oneway === '1' || tg.junction === 'roundabout' || /^motorway/.test(tg.highway || '') ? 1 : tg.oneway === '-1' ? -1 : 0;
    for(let k = 1; k < w.geometry.length; k++){
      const a = node(w.geometry[k - 1].lat, w.geometry[k - 1].lon), b = node(w.geometry[k].lat, w.geometry[k].lon);
      if(a === b) continue;
      const m = distanceM(pts[a], pts[b]) / v;   // minutes
      const dm = distanceM(pts[a], pts[b]);
      if(ow >= 0) adj[a].push(b, m, dm);
      if(ow <= 0) adj[b].push(a, m, dm);
    }
  }
  return { pts, adj };
}

// minutes from the start to every road node (Dijkstra, binary heap); the start joins the nearest node at town speed
async function overpass(q, fetchImpl, timeoutMs){
  try{ return await overpass1(q, fetchImpl, timeoutMs); }catch(e){ await new Promise(r => setTimeout(r, 4000)); return overpass1(q, fetchImpl, timeoutMs); }   // busy servers: one more round
}
async function overpass1(q, fetchImpl, timeoutMs){
  let last;
  for(const url of OVERPASS){
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null, tm = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    try{
      const r = await fetchImpl(url, { method:'POST', body:'data=' + encodeURIComponent(q), headers:{ 'Content-Type':'application/x-www-form-urlencoded' }, signal:ctrl ? ctrl.signal : undefined });
      if(!r.ok) throw new Error('overpass ' + r.status + ' ' + url.split('/')[2]);
      const j = await r.json();
      if(j && j.remark && /runtime error|out of memory|timed out/i.test(j.remark)) throw new Error('overpass ' + j.remark);
      return j;
    }catch(e){ last = e; }finally{ if(tm) clearTimeout(tm); }
  }
  throw last || new Error('overpass');
}


// main roads in a ring around the start, residential streets around every point (to get from a work area to a main road)
export function carQuery(start, km, points){
  const R = Math.round(km * 1000), near = points.slice(0, 30).map(p => `way["highway"~"^(${LOCAL})$"]${FILT}(around:1500,${(+p[0]).toFixed(5)},${(+p[1]).toFixed(5)});`).join('');
  return `[out:json][timeout:120];(way["highway"~"^(${MAIN})$"]${FILT}(around:${R},${start[0]},${start[1]});${near});out tags geom qt;`;
}

// from one point: minutes/metres to every node (Dijkstra) and the node it came from; entry: the 5 nearest nodes at 20 km/h
function search(g, from){
  const n = g.pts.length, t = new Float64Array(n).fill(Infinity), m = new Float64Array(n).fill(Infinity), par = new Int32Array(n).fill(-1), heap = [];
  const push = (i, v) => { heap.push([v, i]); let c = heap.length - 1; while(c > 0){ const p = (c - 1) >> 1; if(heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if(heap.length){ heap[0] = last; let c = 0; for(;;){ const l = 2 * c + 1, r = l + 1; let k = c; if(l < heap.length && heap[l][0] < heap[k][0]) k = l; if(r < heap.length && heap[r][0] < heap[k][0]) k = r; if(k === c) break; [heap[k], heap[c]] = [heap[c], heap[k]]; c = k; } } return top; };
  for(const [dm, i] of nearest(g, from)){ const v = dm / (LAST_KMH * 1000 / 60); if(v < t[i]){ t[i] = v; m[i] = dm; par[i] = -2; push(i, v); } }
  while(heap.length){
    const [v, i] = pop(); if(v > t[i]) continue;
    const a = g.adj[i];
    for(let k = 0; k < a.length; k += 3){ const j = a[k], w = v + a[k + 1]; if(w < t[j]){ t[j] = w; m[j] = m[i] + a[k + 2]; par[j] = i; push(j, w); } }
  }
  return { t, m, par };
}
function nearest(g, p, k = 5){
  const best = [];
  for(let i = 0; i < g.pts.length; i++){ if(!g.adj[i].length) continue; const d = distanceM(g.pts[i], p); if(d > SNAP_M) continue;
    if(best.length < k){ best.push([d, i]); best.sort((a, b) => a[0] - b[0]); } else if(d < best[k - 1][0]){ best[k - 1] = [d, i]; best.sort((a, b) => a[0] - b[0]); } }
  return best;
}
const simplify = (pts, step = 40) => { const out = []; let last = null; for(const p of pts){ if(!last || distanceM(last, p) >= step){ out.push([+p[0].toFixed(5), +p[1].toFixed(5)]); last = p; } } const e = pts[pts.length - 1]; if(e && (!out.length || distanceM(out[out.length - 1], e) > 1)) out.push([+e[0].toFixed(5), +e[1].toFixed(5)]); return out; };

// rides between all given points: rides[i][j] = { min, km, geom, known }
export function rideMatrix(g, points){
  const res = points.map(() => points.map(() => null));
  points.forEach((a, i) => {
    const s = g && g.pts.length ? search(g, a) : null;
    points.forEach((b, j) => {
      if(i === j){ res[i][j] = { min:0, km:0, geom:[a, b], known:true }; return; }
      if(distanceM(a, b) < 150){ const dm = distanceM(a, b); res[i][j] = { min:Math.round(dm / (5000 / 60) * 10) / 10, km:Math.round(dm / 100) / 10, geom:[a, b], known:true, walk:true }; return; }
      let best = null;
      if(s) for(const [dm, k] of nearest(g, b)){ const v = s.t[k] + dm / (LAST_KMH * 1000 / 60); if(Number.isFinite(v) && (!best || v < best.v)) best = { v, k, dm }; }
      if(!best){ res[i][j] = estimate(a, b); return; }
      const nodes = []; for(let k = best.k; k >= 0; k = s.par[k]) nodes.push(g.pts[k]);
      nodes.reverse();
      res[i][j] = { min:Math.max(1, Math.round(best.v)), km:Math.round((s.m[best.k] + best.dm) / 100) / 10, geom:simplify([a, ...nodes, b]), known:true };
    });
  });
  return res;
}
export function estimate(a, b){
  const km = distanceM(a, b) * 1.35 / 1000;
  return { min:Math.round(km / 45 * 60 + 3), km:Math.round(km * 10) / 10, geom:[[+a[0].toFixed(5), +a[1].toFixed(5)], [+b[0].toFixed(5), +b[1].toFixed(5)]], known:false };
}

const graphs = new Map();
export let lastError = null;
// loads the car roads once per order area and returns the ride matrix; any failure -> estimates (known:false)
export async function carRides(start, km, points, { fetchImpl = (...a) => fetch(...a), timeoutMs = 90000 } = {}){
  const key = start.map(v => (+v).toFixed(3)).join(',') + ':' + Math.round(km) + ':' + points.map(p => (+p[0]).toFixed(3) + ',' + (+p[1]).toFixed(3)).sort().join(';');
  let g = graphs.get(key);
  if(g === undefined){
    try{ g = carGraph(await overpass(carQuery(start, km, points), fetchImpl, timeoutMs)); if(g.pts.length < 10){ g = null; lastError = 'no roads'; } }catch(e){ g = null; lastError = String(e && e.message || e).slice(0, 160); }
    if(g){ graphs.set(key, g); if(graphs.size > 4) graphs.delete(graphs.keys().next().value); }
  }
  return g ? rideMatrix(g, points) : points.map(a => points.map(b => a === b ? { min:0, km:0, geom:[a, b], known:true } : estimate(a, b)));
}

// best order of a worker's work areas: start at `origin` (the studio), visit all areas once, least driving.
// areas: [{ first:[lat,lng], last:[lat,lng] }], ride(i,j): minutes from the end of area i (or origin = -1) to the start of area j
export function bestOrder(n, ride){
  const idx = [...Array(n).keys()];
  if(n <= 1) return idx;
  const cost = ord => ord.reduce((s, j, k) => s + ride(k ? ord[k - 1] : -1, j), 0);
  if(n <= 7){   // every order (≤ 5 040)
    let best = idx.slice(), bc = cost(best);
    const perm = (a, l) => { if(l === a.length){ const c = cost(a); if(c < bc - 1e-9){ bc = c; best = a.slice(); } return; }
      for(let i = l; i < a.length; i++){ [a[l], a[i]] = [a[i], a[l]]; perm(a, l + 1); [a[l], a[i]] = [a[i], a[l]]; } };
    perm(idx.slice(), 0); return best;
  }
  // more areas: nearest next, then 2-opt
  const left = new Set(idx), ord = []; let at = -1;
  while(left.size){ let b = null; for(const j of left) if(b == null || ride(at, j) < ride(at, b)) b = j; ord.push(b); left.delete(b); at = b; }
  for(let imp = true, it = 0; imp && it < 50; it++){ imp = false;
    for(let i = 0; i < n - 1; i++) for(let j = i + 1; j < n; j++){ const c = ord.slice(0, i).concat(ord.slice(i, j + 1).reverse(), ord.slice(j + 1)); if(cost(c) < cost(ord) - 1e-9){ ord.splice(0, n, ...c); imp = true; } } }
  return ord;
}

// village name for the plan (Photon reverse geocoding, as the admin panel); null when offline
export async function villageName(lat, lng, fetchImpl = (...a) => fetch(...a), tries = 2){
  for(let k = 0; k < tries; k++){ const n = await villageName1(lat, lng, fetchImpl); if(n) return n; await new Promise(r => setTimeout(r, 1200)); }
  return null;
}
async function villageName1(lat, lng, fetchImpl){
  try{
    const r = await fetchImpl(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&lang=de&limit=1`); if(!r.ok) return null;
    const f = ((await r.json()).features || [])[0]; if(!f) return null;
    const p = f.properties || {}, town = p.city || p.town || p.village || (p.osm_key === 'place' ? p.name : '') || '', part = p.district || p.locality || p.suburb || '';
    return part && part !== town ? part + (town ? ' (' + town + ')' : '') : town || null;
  }catch{ return null; }
}

// names of the villages from OSM place nodes (one light query); nearest place within 2 km
export async function placeNames(start, km, fetchImpl = (...a) => fetch(...a)){
  try{
    const j = await overpass(`[out:json][timeout:60];node["place"~"^(city|town|village|hamlet|suburb|quarter)$"]["name"](around:${Math.round(km * 1000)},${start[0]},${start[1]});out qt;`, fetchImpl, 60000);
    const nodes = ((j && j.elements) || []).filter(n => n.lat && n.tags && n.tags.name).map(n => ({ p:[n.lat, n.lon], name:n.tags.name, rank:{ city:0, town:1, village:2, suburb:3, quarter:4, hamlet:5 }[n.tags.place] ?? 6 }));
    return p => { let best = null; for(const n of nodes){ const d = distanceM(n.p, p) + n.rank * 250; if(d < 2000 + n.rank * 250 && (!best || d < best.d)) best = { d, name:n.name }; } return best ? best.name : null; };
  }catch{ return () => null; }
}
