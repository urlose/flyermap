// Customer-only GeoJSON: ONE approximate delivery territory for the whole order and the estimated flyers.
// No staff identities, no per-distributor borders, no walking order, durations, GPS or internal quotas.
//
// The territory follows the served streets: every estimated mailbox point of every route is widened by
// RADIUS_M and all of them are merged on a small grid, whose outline becomes the polygon. Compared with
// the former convex hull this does not fill the inside of an L-shaped area, a park, a field or the gap
// between two towns. Routes of all distributors are merged first, so the file shows one area and never
// how the order was split between people.
// Routes without mailbox points (older plans) fall back to the walked line itself, without the rides
// between places.
const RADIUS_M = 40;        // half-width of the territory around a mailbox point
const LINE_RADIUS_M = 25;   // fallback: half-width around the route line
const CELL_M = 10;          // grid resolution
const MAX_CELLS = 4e6;      // very large orders get a coarser grid instead of more memory
const MIN_HOLE_M2 = 5000;   // smaller gaps (courtyards, single plots) are closed, larger ones stay open
const M_LAT = 110540, M_LON = 111320;

const num = v => Number.isFinite(+v) ? +v : null;

function collect(plans){
  const pts = [], lines = [];
  for(const plan of plans){
    const boxes = Array.isArray(plan && plan.boxes) ? plan.boxes : [];
    const own = [];
    for(const b of boxes){
      if(!Array.isArray(b)) continue;
      const la = num(b[0]), lo = num(b[1]);
      if(la === null || lo === null || Math.abs(la) > 90 || Math.abs(lo) > 180) continue;
      if(b.length > 2 && !(+b[2] > 0)) continue;   // a point without mailboxes is not served
      own.push([la, lo]);
    }
    if(own.length){ pts.push(...own); continue; }
    let seg = [];
    for(const p of (plan && plan.path) || []){
      if(!Array.isArray(p)) continue;
      const la = num(p[0]), lo = num(p[1]);
      if(la === null || lo === null || Math.abs(la) > 90 || Math.abs(lo) > 180) continue;
      if(p[2] === 1){ if(seg.length > 1) lines.push(seg); seg = []; }   // ride to another place: not territory
      seg.push([la, lo]);
    }
    if(seg.length > 1) lines.push(seg);
  }
  return { pts, lines };
}

function territory(plans){
  const { pts, lines } = collect(plans);
  const all = pts.concat(...lines);
  if(!all.length) return [];
  let la0 = Infinity, la1 = -Infinity, lo0 = Infinity, lo1 = -Infinity;
  for(const [la, lo] of all){ if(la < la0) la0 = la; if(la > la1) la1 = la; if(lo < lo0) lo0 = lo; if(lo > lo1) lo1 = lo; }
  const kx = M_LON * Math.cos((la0 + la1) / 2 * Math.PI / 180), ky = M_LAT;
  const pad = RADIUS_M + 2 * CELL_M;
  const wM = (lo1 - lo0) * kx + 2 * pad, hM = (la1 - la0) * ky + 2 * pad;
  const cell = Math.max(CELL_M, Math.sqrt(wM * hM / MAX_CELLS));
  const W = Math.ceil(wM / cell) + 1, H = Math.ceil(hM / cell) + 1;
  const grid = new Uint8Array(W * H);
  const X = lo => ((lo - lo0) * kx + pad) / cell, Y = la => ((la - la0) * ky + pad) / cell;
  const disc = (cx, cy, rM) => {
    const r = rM / cell, x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
    for(let y = y0; y <= y1; y++) for(let x = x0; x <= x1; x++){
      const dx = x + .5 - cx, dy = y + .5 - cy;
      if(dx * dx + dy * dy <= r * r) grid[y * W + x] = 1;
    }
  };
  for(const [la, lo] of pts) disc(X(lo), Y(la), RADIUS_M);
  for(const seg of lines) for(let i = 0; i < seg.length; i++){
    const ax = X(seg[i][1]), ay = Y(seg[i][0]);
    disc(ax, ay, LINE_RADIUS_M);
    if(i + 1 < seg.length){
      const bx = X(seg[i + 1][1]), by = Y(seg[i + 1][0]), n = Math.ceil(Math.hypot(bx - ax, by - ay) * 2);
      for(let k = 1; k < n; k++) disc(ax + (bx - ax) * k / n, ay + (by - ay) * k / n, LINE_RADIUS_M);
    }
  }

  // Outline of the filled cells: one directed edge per cell side that borders an empty cell, with the
  // filled cell on its left. Outer rings come out counter-clockwise, holes clockwise.
  const full = (x, y) => x >= 0 && y >= 0 && x < W && y < H && grid[y * W + x] === 1;
  const V = W + 1, out = new Map();
  const add = (ax, ay, bx, by) => { const k = ay * V + ax; const e = [ax, ay, bx, by, false]; const l = out.get(k); if(l) l.push(e); else out.set(k, [e]); };
  for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){
    if(!grid[y * W + x]) continue;
    if(!full(x, y - 1)) add(x, y, x + 1, y);
    if(!full(x + 1, y)) add(x + 1, y, x + 1, y + 1);
    if(!full(x, y + 1)) add(x + 1, y + 1, x, y + 1);
    if(!full(x - 1, y)) add(x, y + 1, x, y);
  }
  const rings = [];
  for(const list of out.values()) for(const first of list){
    if(first[4]) continue;
    const ring = []; let e = first;
    for(;;){
      e[4] = true; ring.push([e[0], e[1]]);
      const next = (out.get(e[3] * V + e[2]) || []).filter(c => !c[4]);
      if(!next.length) break;
      // where two cells touch only at a corner, turn left: they stay two separate areas
      const dx = e[2] - e[0], dy = e[3] - e[1];
      let best = next[0], bc = -Infinity;
      for(const c of next){ const cr = dx * (c[3] - c[1]) - dy * (c[2] - c[0]); if(cr > bc){ bc = cr; best = c; } }
      e = best;
    }
    if(ring.length >= 4) rings.push(ring);
  }

  const area = r => { let a = 0; for(let i = 0; i < r.length; i++){ const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
  const inside = (pt, r) => { let c = false; for(let i = 0, j = r.length - 1; i < r.length; j = i++){
    const a = r[i], b = r[j]; if((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  const outers = [], holes = [];
  for(const r of rings){ const a = area(r); if(a > 0) outers.push({ r, a, holes:[] }); else if(-a * cell * cell >= MIN_HOLE_M2) holes.push(r); }
  outers.sort((p, q) => p.a - q.a);
  for(const h of holes){
    // a point inside the hole: the middle of the empty cell to the right of its first edge
    const a = h[0], b = h[1], pt = [(a[0] + b[0]) / 2 + (b[1] - a[1]) / 2, (a[1] + b[1]) / 2 - (b[0] - a[0]) / 2];
    const o = outers.find(o => inside(pt, o.r)); if(o) o.holes.push(h);
  }

  // stair-steps of the grid become straight edges (Douglas-Peucker, below one cell)
  const simplify = r => {
    const tol = .8, keep = new Uint8Array(r.length);
    let far = 0, fd = -1; for(let i = 1; i < r.length; i++){ const d = (r[i][0] - r[0][0]) ** 2 + (r[i][1] - r[0][1]) ** 2; if(d > fd){ fd = d; far = i; } }
    keep[0] = keep[far] = 1;
    const dp = (i, j) => {
      const stack = [[i, j]];
      while(stack.length){
        const [s, t] = stack.pop(); if(t - s < 2) continue;
        const a = r[s], b = r[t % r.length], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
        let m = -1, md = tol;
        for(let k = s + 1; k < t; k++){ const d = Math.abs(dx * (r[k][1] - a[1]) - dy * (r[k][0] - a[0])) / len; if(d > md){ md = d; m = k; } }
        if(m >= 0){ keep[m] = 1; stack.push([s, m], [m, t]); }
      }
    };
    dp(0, far); dp(far, r.length);
    const o = r.filter((_, i) => keep[i]);
    return o.length >= 3 ? o : r;
  };
  const toLonLat = r => {
    const o = simplify(r).map(([x, y]) => [+(lo0 + (x * cell - pad) / kx).toFixed(6), +(la0 + (y * cell - pad) / ky).toFixed(6)]);
    o.push(o[0].slice()); return o;
  };
  // stable order (west to east, then south to north): the file never reflects the order of the routes
  return outers.map(o => [toLonLat(o.r), ...o.holes.map(toLonLat)])
    .sort((p, q) => p[0][0][0] - q[0][0][0] || p[0][0][1] - q[0][0][1]);
}

export function customerGeoJSON(task, plans = []){
  plans = Array.isArray(plans) ? plans : [];
  const n = plans.length ? plans.reduce((s, p) => s + Math.round(Number(p && p.mailboxes) || 0), 0)
    : Math.round(Number(task && task.est_mailboxes) || 0);
  return { type:'FeatureCollection', features:[{
    type:'Feature',
    properties:{
      title:String((task && task.title) || 'Verteilgebiet'),
      estimatedFlyers:Math.max(0, n),
      approximateArea:true
    },
    geometry:{ type:'MultiPolygon', coordinates:territory(plans) }
  }] };
}
