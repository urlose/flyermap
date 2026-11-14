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
