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
    const st = [k0]; let h = 0, sx = 0, sy = 0, top = null;
    while(st.length){ const k = st.pop(), b = blk.get(k); h += b.h; sx += b.sx; sy += b.sy; if(!top || b.h > top.h) top = b; const [bx, by] = k.split(',').map(Number);
      for(let dx = -1; dx <= 1; dx++) for(let dy = -1; dy <= 1; dy++){ const n = (bx + dx) + ',' + (by + dy); if(dense.has(n) && !seen.has(n)){ seen.add(n); st.push(n); } } }
    const mx = sx / h, my = sy / h, dist = Math.hypot(mx - x, my - y);
    if(h < 150 || dist < minR || dist > maxR) continue;
    // the place's point is its densest 1 km block (the town centre); the middle of a big group can lie in a neighbouring village
    const [la, lo] = unlaea(top.sx / top.h, top.sy / top.h); out.push({ lat:+la.toFixed(6), lng:+lo.toFixed(6), households:h, dist:Math.round(dist) });
  }
  return out.sort((a, b) => a.dist - b.dist);
}
