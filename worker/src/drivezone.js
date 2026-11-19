// Drive-time zone (17.11.2026): where a car gets from the start point within N minutes, computed here – no routing service.
// The walking map of the planner has no fast roads and no road classes, so the car roads around the start are loaded once
// from OpenStreetMap (Overpass, the same source as the streets) and a shortest-time search runs over them.
// Result: a grid of 200 m cells with the minutes needed to reach each cell (main roads + the last bit at town speed).
// The grid is the delivery boundary (saved with the order, so a re-plan uses the same area), gives the ride time to every
// nearby place and the ride time between places. Pure functions are tested in test/drivezone.mjs.
import { distanceM, circlePolygon } from './circlearea.js';
import { carGraph, overpass, carQuery, rideMatrix } from './carroute.js';

export const DEFAULT_DRIVE_MIN = 15, MIN_DRIVE_MIN = 5, MAX_DRIVE_MIN = 30;
export const DELIVERY_MAX_KM = 25;            // no km setting: only the street-map limit of the planner (MUST_MAX_R)
const CELL_M = 200, LAST_KMH = 20;            // grid size; from the nearest car road to a house: 20 km/h (village streets, parking)
const SNAP_M = 900;                           // houses farther than this from any loaded car road are not reached by car
export function driveMin(value){
  const n = Math.round(Number(value));
  if(!Number.isFinite(n) || n < MIN_DRIVE_MIN || n > MAX_DRIVE_MIN) throw new Error('Fahrzeit muss zwischen 5 und 30 Minuten liegen');
  return n;
}
export const searchKm = min => Math.min(30, 3 + min * 1.4);   // fast roads: 15 min ≈ 24 km at most

// minutes from the start to every road node (Dijkstra, binary heap); the start joins the nearest node at town speed
export function driveTimes(g, start, limit){
  const n = g.pts.length, t = new Float64Array(n).fill(Infinity);
  if(!n) return t;
  const heap = [], push = (i, v) => { heap.push([v, i]); let c = heap.length - 1; while(c > 0){ const p = (c - 1) >> 1; if(heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if(heap.length){ heap[0] = last; let c = 0; for(;;){ const l = 2 * c + 1, r = l + 1; let m = c; if(l < heap.length && heap[l][0] < heap[m][0]) m = l; if(r < heap.length && heap[r][0] < heap[m][0]) m = r; if(m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
  // up to 5 nearest nodes as entry points (a start between two roads)
  const near = g.pts.map((p, i) => [distanceM(p, start), i]).sort((a, b) => a[0] - b[0]).slice(0, 5);
  for(const [dm, i] of near) if(dm <= SNAP_M){ const v = dm / (LAST_KMH * 1000 / 60); if(v < t[i]){ t[i] = v; push(i, v); } }
  while(heap.length){
    const [v, i] = pop(); if(v > t[i] || v > limit) continue;
    const a = g.adj[i];
    for(let k = 0; k < a.length; k += 3){ const j = a[k], w = v + a[k + 1]; if(w < t[j]){ t[j] = w; push(j, w); } }
  }
  return t;
}

// grid of cells around the start: minutes to the cell = best road node within SNAP_M + the rest at 20 km/h
export function buildGrid(g, times, start, limit){
  const dLat = CELL_M / 111320, dLng = CELL_M / (111320 * Math.cos(start[0] * Math.PI / 180));
  const R = Math.ceil(searchKm(limit) * 1000 / CELL_M) + 3, o = [start[0] - R * dLat, start[1] - R * dLng], size = 2 * R + 1;
  const best = new Float32Array(size * size).fill(Infinity), slow = LAST_KMH * 1000 / 60, reach = Math.ceil(SNAP_M / CELL_M);
  const put = (row, col, v) => { if(row >= 0 && col >= 0 && row < size && col < size){ const k = row * size + col; if(v < best[k]) best[k] = v; } };
  for(let i = 0; i < g.pts.length; i++){
    const v = times[i]; if(!(v <= limit)) continue;
    const [la, lo] = g.pts[i], r0 = Math.floor((la - o[0]) / dLat), c0 = Math.floor((lo - o[1]) / dLng);
    for(let dr = -reach; dr <= reach; dr++) for(let dc = -reach; dc <= reach; dc++){
      const cla = o[0] + (r0 + dr + .5) * dLat, clo = o[1] + (c0 + dc + .5) * dLng, dm = distanceM([la, lo], [cla, clo]);
      if(dm <= SNAP_M) put(r0 + dr, c0 + dc, v + dm / slow);
    }
  }
  // the start's own surroundings are always reachable (no road loaded right at the start)
  put(R, R, 0);
  const runs = [], mins = [];
  for(let row = 0; row < size; row++){
    let c = 0;
    while(c < size){
      if(best[row * size + c] <= limit){ const c0 = c; while(c < size && best[row * size + c] <= limit) c++; runs.push(row, c0, c - 1); }
      else c++;
    }
  }
  // minutes per reachable cell, rounded, in run order (for ride times to places)
  for(let k = 0; k < runs.length; k += 3) for(let c = runs[k + 1]; c <= runs[k + 2]; c++) mins.push(Math.round(best[runs[k] * size + c] * 10) / 10);
  return { v:1, min:limit, o:[+o[0].toFixed(6), +o[1].toFixed(6)], s:[+dLat.toFixed(8), +dLng.toFixed(8)], n:size, runs, mins, real:true };
}

// ---- reading a grid (planner, map, list) ----
const rowsOf = grid => { if(grid._rows) return grid._rows; const m = new Map(); let at = 0;
  for(let k = 0; k < grid.runs.length; k += 3){ const r = grid.runs[k]; if(!m.has(r)) m.set(r, []); m.get(r).push([grid.runs[k + 1], grid.runs[k + 2], at]); at += grid.runs[k + 2] - grid.runs[k + 1] + 1; }
  Object.defineProperty(grid, '_rows', { value:m, enumerable:false }); return m; };
const cellAt = (grid, p) => [Math.floor((p[0] - grid.o[0]) / grid.s[0]), Math.floor((p[1] - grid.o[1]) / grid.s[1])];
// minutes by car to a point, or null when outside the zone
export function minutesTo(grid, p){
  if(!grid || !grid.runs) return null;
  const [r, c] = cellAt(grid, p), row = rowsOf(grid).get(r); if(!row) return null;
  for(const [c0, c1, at] of row) if(c >= c0 && c <= c1) return grid.mins ? grid.mins[at + c - c0] : 0;
  return null;
}
export const inGrid = (grid, p) => minutesTo(grid, p) != null;
// delivery boundary: inside the drive-time zone (the only setting is the minutes)
export const insideZone = (grid, start, p) => inGrid(grid, p) && distanceM(p, start) <= DELIVERY_MAX_KM * 1000 + 0.001;
// how far the street map must be loaded for this zone (as far as the zone reaches)
export function zoneLoadM(grid, start){
  let far = 0; const rows = rowsOf(grid);
  for(const [r, list] of rows) for(const [c0, c1] of list) for(const c of [c0, c1 + 1]){ const p = [grid.o[0] + r * grid.s[0], grid.o[1] + c * grid.s[1]]; far = Math.max(far, distanceM(p, start)); }
  return Math.min(DELIVERY_MAX_KM * 1000, Math.max(1500, Math.ceil(far)));
}
// rectangles for the map (one per run), [[lat,lng] x4]
export function gridRects(grid){
  const out = [];
  for(let k = 0; k < grid.runs.length; k += 3){ const r = grid.runs[k], a = grid.o[0] + r * grid.s[0], b = a + grid.s[0], l = grid.o[1] + grid.runs[k + 1] * grid.s[1], rr = grid.o[1] + (grid.runs[k + 2] + 1) * grid.s[1];
    out.push([[a, l], [a, rr], [b, rr], [b, l]]); }
  return out;
}
// the saved form (days[0].delivery_zone): no derived caches
export const gridForSave = grid => grid && ({ v:grid.v, min:grid.min, o:grid.o, s:grid.s, n:grid.n, runs:grid.runs, mins:grid.mins, real:grid.real !== false });
export function zoneFromPlans(plans){
  const z = (plans || []).map(p => p.days && p.days[0] && p.days[0].delivery_zone).find(x => x && Array.isArray(x.runs));
  return z ? { ...z } : null;
}

// ---- loading ----
const cache = new Map();
// drive-time zone around the start; without an answer from the map server: a circle (0.6 km per minute, at most 10 km), real:false
export async function driveZone(start, min, { fetchImpl = (...a) => fetch(...a), timeoutMs = 90000 } = {}){
  const lim = driveMin(min), key = start[0].toFixed(4) + ',' + start[1].toFixed(4) + ':' + lim;
  if(cache.has(key)) return cache.get(key);
  const job = (async () => {
    try{
      const km = searchKm(lim), d = km * 1000 / 111320, e = d / Math.cos(start[0] * Math.PI / 180);
      const g = carGraph(await overpass(carQuery(start, 0, [[start[0] - d, start[1] - e], [start[0] + d, start[1] + e], start]), fetchImpl, timeoutMs));
      if(g.pts.length < 10) throw new Error('no roads');
      const grid = buildGrid(g, driveTimes(g, start, lim), start, lim);
      Object.defineProperty(grid, '_g', { value:g, enumerable:false });   // the same roads give the rides between work areas
      return grid;
    }catch(err){
      const fb = fallbackGrid(start, lim); fb.error = String(err && err.message || err).slice(0, 120); return fb;
    }
  })();
  cache.set(key, job); if(cache.size > 8) cache.delete(cache.keys().next().value);
  const res = await job; if(!res.real) cache.delete(key);   // try again next time
  return res;
}
// rides between points on the roads of a zone (or estimates without roads)
export const zoneRides = (grid, points) => rideMatrix(grid && grid._g || null, points);
// a circle on the same grid, minutes estimated from the distance (40 km/h)
export function fallbackGrid(start, lim){
  const km = Math.min(DELIVERY_MAX_KM, lim * 0.6), dLat = CELL_M / 111320, dLng = CELL_M / (111320 * Math.cos(start[0] * Math.PI / 180));
  const R = Math.ceil(km * 1000 / CELL_M) + 1, o = [start[0] - R * dLat, start[1] - R * dLng], size = 2 * R + 1, runs = [], mins = [];
  for(let row = 0; row < size; row++){ let c0 = -1;
    for(let c = 0; c <= size; c++){
      const inside = c < size && distanceM([o[0] + (row + .5) * dLat, o[1] + (c + .5) * dLng], start) <= km * 1000;
      if(inside && c0 < 0) c0 = c;
      if(!inside && c0 >= 0){ runs.push(row, c0, c - 1); for(let k = c0; k < c; k++) mins.push(Math.round(distanceM([o[0] + (row + .5) * dLat, o[1] + (k + .5) * dLng], start) / (40000 / 60) * 10) / 10); c0 = -1; }
    } }
  return { v:1, min:lim, o:[+o[0].toFixed(6), +o[1].toFixed(6)], s:[+dLat.toFixed(8), +dLng.toFixed(8)], n:size, runs, mins, real:false, km };
}
export { circlePolygon };
// a ring around the start of any radius (circlePolygon only allows the 0.5–10 km of the old circle setting)
export function ringPolygon(start, km, n = 128){
  const R = 6371000, d = km * 1000 / R, la = start[0] * Math.PI / 180, lo = start[1] * Math.PI / 180, out = [];
  for(let i = 0; i < n; i++){ const b = 2 * Math.PI * i / n, a = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
    out.push([a * 180 / Math.PI, (lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(a))) * 180 / Math.PI]); }
  return out;
}
// rectangles of the cells reached within `maxMin` minutes (covered area on the map)
export function gridRectsUpTo(grid, maxMin){
  const out = []; let at = 0;
  for(let k = 0; k < grid.runs.length; k += 3){
    const r = grid.runs[k], c0 = grid.runs[k + 1], c1 = grid.runs[k + 2], a = grid.o[0] + r * grid.s[0], b = a + grid.s[0];
    let s = -1;
    for(let c = c0; c <= c1 + 1; c++){
      const ok = c <= c1 && (grid.mins ? grid.mins[at + c - c0] : 0) <= maxMin;
      if(ok && s < 0) s = c;
      if(!ok && s >= 0){ const l = grid.o[1] + s * grid.s[1], rr = grid.o[1] + c * grid.s[1]; out.push([[a, l], [a, rr], [b, rr], [b, l]]); s = -1; }
    }
    at += c1 - c0 + 1;
  }
  return out;
}
