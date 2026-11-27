// Census 2022 (Zensus) households per 100 m cell, for comparing the app's own mailbox estimate with official numbers.
// Data: /flyermap/zensus/h_<X>_<Y>.bin, one file per 50 km square, built by tools/zensus/build.py (whole of Germany).
// Source: Statistische Ämter des Bundes und der Länder, Zensus 2022 (reference date 15.05.2022), dl-de/by-2-0.
const BASE = 'https://urlose.github.io/flyermap/zensus/';
const squares = new Map();   // "X_Y" -> Promise<Map<cell index in the square, households>>

// WGS84 -> ETRS89-LAEA (EPSG:3035), metres. Good to a few centimetres, far below the 100 m cells.
const A = 6378137, E2 = 0.00669438002290, E = Math.sqrt(E2), P0 = 52 * Math.PI / 180, L0 = 10 * Math.PI / 180;
const qf = s => (1 - E2) * (s / (1 - E2 * s * s) - Math.log((1 - E * s) / (1 + E * s)) / (2 * E));
const QP = qf(1), B0 = Math.asin(qf(Math.sin(P0)) / QP), RQ = A * Math.sqrt(QP / 2);
const D = A * (Math.cos(P0) / Math.sqrt(1 - E2 * Math.sin(P0) ** 2)) / (RQ * Math.cos(B0));
export function laea(lat, lng){
  const b = Math.asin(qf(Math.sin(lat * Math.PI / 180)) / QP), dl = lng * Math.PI / 180 - L0;
  const k = RQ * Math.sqrt(2 / (1 + Math.sin(B0) * Math.sin(b) + Math.cos(B0) * Math.cos(b) * Math.cos(dl)));
  return [4321000 + k * D * Math.cos(b) * Math.sin(dl), 3210000 + (k / D) * (Math.cos(B0) * Math.sin(b) - Math.sin(B0) * Math.cos(b) * Math.cos(dl))];
}
export const cellOf = (lat, lng) => { const [x, y] = laea(lat, lng); return [Math.floor(x / 100), Math.floor(y / 100)]; };

export function parseSquare(buf){
  const u = new Uint32Array(buf.slice(0, buf.byteLength - buf.byteLength % 4)), m = new Map();
  for(let i = 0; i < u.length; i++) m.set(u[i] >>> 12, u[i] & 4095);
  return m;
}
function square(key, fetcher){
  if(!squares.has(key)) squares.set(key, (fetcher || fetch)(BASE + 'h_' + key + '.bin').then(r => r.status === 404 ? new Map() : r.ok ? r.arrayBuffer().then(parseSquare) : Promise.reject(new Error('zensus ' + r.status)))
    .catch(e => { squares.delete(key); throw e; }));
  return squares.get(key);
}

// boxes = [[lat, lng, n], …] (mailbox points of the planned routes). Compares, cell by cell, the app's estimate with the census:
// { ours, households, cells, emptyOurs } – households = census households in the 100 m cells that hold at least one of our boxes,
// emptyOurs = our mailboxes in cells where the census has no household (sheds, firms, or tiny cells hidden for privacy).
export async function compare(boxes, fetcher){
  const cells = new Map();
  for(const b of boxes || []){ if(!b || b[0] == null) continue; const [cx, cy] = cellOf(b[0], b[1]), k = cx + ',' + cy; cells.set(k, (cells.get(k) || 0) + (b[2] || 1)); }
  if(!cells.size) return null;
  const need = new Set(); for(const k of cells.keys()){ const [cx, cy] = k.split(',').map(Number); need.add(Math.floor(cx / 500) + '_' + Math.floor(cy / 500)); }
  const sq = {}; await Promise.all([...need].map(async k => { sq[k] = await square(k, fetcher); }));
  let ours = 0, households = 0, emptyOurs = 0;
  for(const [k, n] of cells){
    const [cx, cy] = k.split(',').map(Number), h = sq[Math.floor(cx / 500) + '_' + Math.floor(cy / 500)].get((cy % 500) * 500 + (cx % 500)) || 0;
    ours += n; households += h; if(!h) emptyOurs += n;
  }
  return { ours, households, cells:cells.size, emptyOurs };
}
// difference of our estimate to the census in percent (+ = we count more), null without census households
export const diffPct = c => c && c.households ? Math.round((c.ours / c.households - 1) * 100) : null;

// inverse of laea(): lat/lng of a point in metres (Newton steps on the forward formula; converges in 3–4 steps to < 1 mm)
export function unlaea(x, y){
  let lat = 52 + (y - 3210000) / 111320, lng = 10 + (x - 4321000) / (111320 * Math.cos(lat * Math.PI / 180));
  for(let k = 0; k < 6; k++){
    const [fx, fy] = laea(lat, lng), h = 1e-5, [ax, ay] = laea(lat + h, lng), [bx, by] = laea(lat, lng + h);
    const j11 = (ax - fx) / h, j21 = (ay - fy) / h, j12 = (bx - fx) / h, j22 = (by - fy) / h, det = j11 * j22 - j12 * j21, ex = x - fx, ey = y - fy;
    lat += (j22 * ex - j12 * ey) / det; lng += (-j21 * ex + j11 * ey) / det;
    if(Math.abs(ex) + Math.abs(ey) < 0.01) break;
  }
  return [lat, lng];
}
// source for the planner (Planner.censusFill): households of all cells in a rectangle of cell numbers
export function censusSource(fetcher){
  return {
    cellOf, centre:(cx, cy) => unlaea(cx * 100 + 50, cy * 100 + 50),
    async households(x0, y0, x1, y1){
      const keys = []; for(let sx = Math.floor(x0 / 500); sx <= Math.floor(x1 / 500); sx++) for(let sy = Math.floor(y0 / 500); sy <= Math.floor(y1 / 500); sy++) keys.push([sx, sy]);
      const out = new Map();
      await Promise.all(keys.map(async ([sx, sy]) => {
        const m = await square(sx + '_' + sy, fetcher);
        for(const [i, h] of m){ const cx = sx * 500 + i % 500, cy = sy * 500 + Math.floor(i / 500); if(h && cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) out.set(cx + ',' + cy, h); }
      }));
      return out;
    },
  };
}

// Towns and villages around a point, found in the census itself (no map server needed): 1 km blocks with households,
// glued together where they touch; every group is one place with its households and its centre (household-weighted).
// Places nearer than `minR` metres (the start's own area) are left out. Sorted by distance from the start.
export async function townsAround(lat, lng, minR, maxR, fetcher){
  const src = censusSource(fetcher), [x, y] = laea(lat, lng), r = Math.ceil(maxR / 100);
  const cx = Math.floor(x / 100), cy = Math.floor(y / 100);
  const H = await src.households(cx - r, cy - r, cx + r, cy + r);
  const blk = new Map();   // "bx,by" -> { h, sx, sy }
  for(const [k, h] of H){ const [ix, iy] = k.split(',').map(Number), bk = Math.floor(ix / 10) + ',' + Math.floor(iy / 10); let b = blk.get(bk); if(!b) blk.set(bk, b = { h:0, sx:0, sy:0 }); b.h += h; b.sx += (ix * 100 + 50) * h; b.sy += (iy * 100 + 50) * h; }
  const dense = new Set([...blk].filter(([, b]) => b.h >= 25).map(([k]) => k)), seen = new Set(), out = [];
  for(const k0 of dense){
    if(seen.has(k0)) continue; seen.add(k0);
    const st = [k0]; let h = 0, sx = 0, sy = 0, top = null, nb = 0;
    while(st.length){ const k = st.pop(), b = blk.get(k); h += b.h; nb++; sx += b.sx; sy += b.sy; if(!top || b.h > top.h) top = b; const [bx, by] = k.split(',').map(Number);
      for(let dx = -1; dx <= 1; dx++) for(let dy = -1; dy <= 1; dy++){ const n = (bx + dx) + ',' + (by + dy); if(dense.has(n) && !seen.has(n)){ seen.add(n); st.push(n); } } }
    const mx = sx / h, my = sy / h, dist = Math.hypot(mx - x, my - y);
    if(h < 150 || dist < minR || dist > maxR) continue;
    // the place's point is its densest 1 km block (the town centre); the middle of a big group can lie in a neighbouring village
    const [la, lo] = unlaea(top.sx / top.h, top.sy / top.h); out.push({ lat:+la.toFixed(6), lng:+lo.toFixed(6), households:h, dist:Math.round(dist), km2:nb, dense:Math.round(h / nb) });   // dense: households per km² block
  }
  return out.sort((a, b) => a.dist - b.dist);
}

// The built-up place around a point, from the census: 100 m cells with households, joined where they are at most 200 m apart
// (a park or a wide road does not cut a town; open fields between a town and its hamlets do). Of the places with a cell within
// `pick` metres of the point the one with the most households is taken (a start in an industrial area still gets its town).
// Returns { households, cells, inside(lat, lng) } – inside: in one of the place's cells or right next to one (100 m) – or null.
// All built-up areas (100 m cells with households, gaps up to 200 m) whose nearest cell lies within `pick` metres of the point,
// biggest first. Each: { households, cells, cellKeys, centre, near (m), lives(lat, lng), inside(lat, lng) }.
export async function placeMasks(lat, lng, { maxR = 7000, pick = 1500, fetcher } = {}){
  const src = censusSource(fetcher), [x, y] = laea(lat, lng), r = Math.ceil(maxR / 100), cx = Math.floor(x / 100), cy = Math.floor(y / 100);
  const H = await src.households(cx - r, cy - r, cx + r, cy + r);
  if(!H.size) return [];
  const comp = new Map(); let nc = 0; const info = [];
  for(const k0 of H.keys()){
    if(comp.has(k0)) continue;
    const id = nc++, st = [k0]; comp.set(k0, id); let h = 0, near = Infinity; const cells = [];
    while(st.length){ const k = st.pop(); cells.push(k); h += H.get(k); const [ix, iy] = k.split(',').map(Number);
      near = Math.min(near, Math.hypot(ix - cx, iy - cy) * 100);
      for(let dx = -2; dx <= 2; dx++) for(let dy = -2; dy <= 2; dy++){ const n = (ix + dx) + ',' + (iy + dy); if(H.has(n) && !comp.has(n)){ comp.set(n, id); st.push(n); } } }
    info.push({ id, h, near, cells });
  }
  return info.filter(c => c.near <= pick).sort((a, b) => b.h - a.h).map(best => {
    const own = new Set(); for(const k of best.cells){ const [ix, iy] = k.split(',').map(Number); for(let dx = -1; dx <= 1; dx++) for(let dy = -1; dy <= 1; dy++) own.add((ix + dx) + ',' + (iy + dy)); }
    // centre: the cell nearest to the household-weighted middle (a town's centre, not a hole between two parts)
    let sx = 0, sy = 0; for(const k of best.cells){ const [ix, iy] = k.split(',').map(Number), h = H.get(k); sx += ix * h; sy += iy * h; }
    const mx = sx / best.h, my = sy / best.h, ck = best.cells.reduce((a, k) => { const [ix, iy] = k.split(',').map(Number), d = Math.hypot(ix - mx, iy - my); return d < a.d ? { k, d } : a; }, { k:null, d:Infinity }).k.split(',').map(Number);
    const centre = unlaea(ck[0] * 100 + 50, ck[1] * 100 + 50);
    const lived = new Set(best.cells);
    return { households:best.h, cells:best.cells.length, cellKeys:best.cells, centre, near:best.near, lives:(la, lo) => { const [a, b] = cellOf(la, lo); return lived.has(a + ',' + b); }, inside:(la, lo) => { const [a, b] = cellOf(la, lo); return own.has(a + ',' + b); } };
  });
}
// the biggest built-up area near the point (side places; the main place is chosen by walking distance in plancore.js)
export async function placeMask(lat, lng, opt = {}){
  const all = await placeMasks(lat, lng, opt);
  return all.length ? all[0] : null;
}

// Main place of an order (27.11.2026). Before, the biggest built-up area within 1.5 km was taken: in Löhne the flag stands in
// Obernbeck, but Mennighüffen–Werste–Bad Oeynhausen (20,798 households) is bigger, so no street around the flag was planned.
// Now by the real walking way (streets: [{ distance (m) from the start, mid:[lat, lng] }] of the streets with mailboxes):
//  - the start is in or next to a built-up area (a street of it within NEAR_M on foot): that area, and the walk starts at the flag;
//  - else (warehouse, industrial estate, a railway between the flag and the next houses): the area that is nearest ON FOOT
//    among the real places (at least MIN_HH households), and the walk starts at its nearest street.
export const NEAR_M = 400, MAIN_MIN_HH = 150;
export function chooseMainPlace(masks, streets){
  if(!masks || !masks.length) return null;
  const best = masks.map(() => ({ d:Infinity, at:null }));
  for(const s of streets) masks.forEach((m, k) => { if(s.distance < best[k].d && m.lives(s.mid[0], s.mid[1])) best[k] = { d:s.distance, at:s.mid }; });
  const order = masks.map((m, k) => k).filter(k => Number.isFinite(best[k].d)).sort((a, b) => best[a].d - best[b].d);
  if(!order.length) return { mask:masks[0], walkFrom:null, walk_m:null, rule:'biggest' };
  if(best[order[0]].d <= NEAR_M) return { mask:masks[order[0]], walkFrom:null, walk_m:Math.round(best[order[0]].d), rule:'at-start' };
  const real = order.filter(k => masks[k].households >= MAIN_MIN_HH), k = real.length ? real[0] : order[0];
  return { mask:masks[k], walkFrom:best[k].at, walk_m:Math.round(best[k].d), rule:'nearest-on-foot' };
}

// ---- Phase 2A (16.11.2026): small villages and districts ------------------------------------------------------------------
// townsAround() above glues 1 km blocks (>= 25 households each) and drops groups under 150 households: neighbouring villages
// become one "place" and scattered hamlets vanish. censusPlaces() instead joins the 100 m cells themselves, exactly like
// placeMask(): cells at most MAX_GAP cells (= 200 m) apart belong to one built-up area; open fields between two villages split
// them. Every area is a candidate from MIN_HH households up (a census cell with < 3 households is hidden for privacy, so very
// small hamlets are partly missing in the data – that is a limit of the source, not of this code).
export const MIN_HH = 50;     // smallest place that is worth a suggestion (30 gave ~25 % more places, mostly 3–5 farms; see test/places-real.mjs)
export const MAX_GAP = 2;     // cells (= 200 m) of open ground that still count as the same built-up area

// H: Map "cx,cy" -> households (as censusSource.households returns it). Pure. Returns ALL areas (also the small ones; the caller
// filters by `minH`): { id, x, y, households, n, cells (flat [cx, cy, …]) } with x, y = the centre in metres (EPSG:3035).
// id = the smallest cell of the area ("cx,cy"): the same area found from two search centres has the same id.
export function clusterCells(H, gap = MAX_GAP){
  const seen = new Set(), out = [];
  for(const k0 of H.keys()){
    if(seen.has(k0)) continue; seen.add(k0);
    const st = [k0], cells = []; let h = 0;
    while(st.length){ const k = st.pop(), [ix, iy] = k.split(',').map(Number); cells.push(ix, iy); h += H.get(k);
      for(let dx = -gap; dx <= gap; dx++) for(let dy = -gap; dy <= gap; dy++){ const q = (ix + dx) + ',' + (iy + dy); if(H.has(q) && !seen.has(q)){ seen.add(q); st.push(q); } } }
    out.push({ ...describe(H, cells, h), households:h, n:cells.length / 2, cells:Int32Array.from(cells) });
  }
  return out;
}
// the place's point: a small area -> household-weighted middle; a big one -> the middle of its densest ~1.4 km (the town centre,
// not a hole between two districts). Always snapped to a populated cell.
function describe(H, cells, h){
  const n = cells.length / 2; let px, py;
  const wmid = (pred) => { let sx = 0, sy = 0, sh = 0; for(let i = 0; i < cells.length; i += 2){ if(pred && !pred(cells[i], cells[i + 1])) continue; const v = H.get(cells[i] + ',' + cells[i + 1]); sx += cells[i] * v; sy += cells[i + 1] * v; sh += v; } return [sx / sh, sy / sh]; };
  if(n <= 60) [px, py] = wmid();
  else {
    let best = -1, bx = 0, by = 0;
    for(let i = 0; i < cells.length; i += 2){ let s = 0; for(let dx = -2; dx <= 2; dx++) for(let dy = -2; dy <= 2; dy++) s += H.get((cells[i] + dx) + ',' + (cells[i + 1] + dy)) || 0; if(s > best){ best = s; bx = cells[i]; by = cells[i + 1]; } }
    [px, py] = wmid((cx, cy) => Math.hypot(cx - bx, cy - by) <= 7);
  }
  let d = Infinity, sx = 0, sy = 0, id = null;
  for(let i = 0; i < cells.length; i += 2){ const dd = Math.hypot(cells[i] - px, cells[i + 1] - py); if(dd < d){ d = dd; sx = cells[i]; sy = cells[i + 1]; }
    if(id == null || cells[i] < id[0] || (cells[i] === id[0] && cells[i + 1] < id[1])) id = [cells[i], cells[i + 1]]; }
  return { id:id[0] + ',' + id[1], x:sx * 100 + 50, y:sy * 100 + 50 };
}

// All places (>= minH households) in the census within maxR metres of a point. One window, loaded once; the squares are cached
// (square()), so a second call with another radius costs no download. Result: [{ id, lat, lng, households, n, dense, dist, x, y, cells }].
// dist = metres from the given point, dense = households per populated 100 m cell × 100 (households per km² of built-up ground).
export async function censusPlaces(lat, lng, maxR, { minH = MIN_HH, gap = MAX_GAP, fetcher } = {}){
  const src = censusSource(fetcher), [x, y] = laea(lat, lng), r = Math.ceil(maxR / 100), cx = Math.floor(x / 100), cy = Math.floor(y / 100);
  const H = await src.households(cx - r, cy - r, cx + r, cy + r);
  return clusterCells(H, gap).filter(c => c.households >= minH).map(c => {
    const [la, lo] = unlaea(c.x, c.y);
    return { id:c.id, lat:+la.toFixed(6), lng:+lo.toFixed(6), households:c.households, n:c.n, dense:Math.round(c.households / c.n * 100), dist:Math.round(Math.hypot(c.x - x, c.y - y)), x:c.x, y:c.y, cells:c.cells };
  }).sort((a, b) => a.dist - b.dist);
}
