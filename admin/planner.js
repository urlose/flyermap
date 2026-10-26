/* FlyerMap route planner
 * 1) streets inside a zone polygon from OpenStreetMap (Overpass)
 * 2) street graph (junction-to-junction edges)
 * 3) zone split into N parts (sectors around the start point, equal street length)
 * 4) per part: shortest walk covering every street once (Chinese-postman heuristic),
 *    starting and ending near the start point.
 * Works in the browser (window.Planner) and in Node (module.exports) for tests.
 */
(function(root){
  'use strict';
  const R = 6371000, RAD = Math.PI / 180;
  const HIGHWAYS = 'primary|secondary|tertiary|unclassified|residential|living_street|pedestrian|road';
  const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
  const WORKER_KM_PER_SHIFT = 8;   // street km one person covers in a shift (both sides, mailboxes)
  const WALK_KMH = 3;              // effective speed while distributing

  function dist(a, b){
    const x = Math.sin((b[0]-a[0])*RAD/2)**2 + Math.cos(a[0]*RAD)*Math.cos(b[0]*RAD)*Math.sin((b[1]-a[1])*RAD/2)**2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  function inPoly(p, poly){
    let inside = false;
    for(let i = 0, j = poly.length - 1; i < poly.length; j = i++){
      const [yi, xi] = poly[i], [yj, xj] = poly[j];
      if(((yi > p[0]) !== (yj > p[0])) && (p[1] < (xj - xi) * (p[0] - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function lineLen(c){ let s = 0; for(let i = 1; i < c.length; i++) s += dist(c[i-1], c[i]); return s; }

  /* ---------- 1. Overpass ---------- */
  async function fetchStreets(poly, fetchImpl){
    const f = fetchImpl || fetch;
    const ps = poly.map(p => p[0].toFixed(6) + ' ' + p[1].toFixed(6)).join(' ');
    const q = `[out:json][timeout:90];way["highway"~"^(${HIGHWAYS})$"]["access"!~"^(private|no)$"](poly:"${ps}");out body;>;out skel qt;`;
    let lastErr;
    for(const url of OVERPASS){
      try{
        const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const tm = ctrl ? setTimeout(() => ctrl.abort(), 60000) : null;
        const r = await f(url, { method:'POST', headers:{ 'Content-Type':'application/x-www-form-urlencoded' }, body:'data=' + encodeURIComponent(q), signal: ctrl && ctrl.signal });
        if(tm) clearTimeout(tm);
        if(!r.ok) throw new Error('overpass ' + r.status);
        return await r.json();
      }catch(e){ lastErr = e; }
    }
    throw lastErr || new Error('overpass');
  }

  /* ---------- 2. graph ---------- */
  function buildGraph(osm, poly){
    const nodes = new Map();
    for(const e of osm.elements) if(e.type === 'node') nodes.set(e.id, [e.lat, e.lon]);
    // node-level segments inside the zone
    const segs = [], deg = new Map(), adjSeg = new Map();
    const addAdj = (n, i) => { if(!adjSeg.has(n)) adjSeg.set(n, []); adjSeg.get(n).push(i); deg.set(n, (deg.get(n) || 0) + 1); };
    for(const w of osm.elements){
      if(w.type !== 'way' || !w.nodes) continue;
      const name = (w.tags && (w.tags.name || w.tags.ref)) || '';
      for(let i = 1; i < w.nodes.length; i++){
        const u = w.nodes[i-1], v = w.nodes[i], a = nodes.get(u), b = nodes.get(v);
        if(!a || !b || u === v) continue;
        if(poly && !inPoly([(a[0]+b[0])/2, (a[1]+b[1])/2], poly)) continue;
        const id = segs.length; segs.push({ u, v, name, used:false });
        addAdj(u, id); addAdj(v, id);
      }
    }
    // compress chains of degree-2 nodes into junction-to-junction edges
    const jIndex = new Map(), pts = [];
    const jid = n => { if(!jIndex.has(n)){ jIndex.set(n, pts.length); pts.push(nodes.get(n)); } return jIndex.get(n); };
    const edges = [];
    const walk = (start, firstSeg) => {
      const coords = [nodes.get(start)]; let cur = start, sid = firstSeg, name = segs[firstSeg].name;
      while(true){
        const s = segs[sid]; s.used = true;
        const nxt = s.u === cur ? s.v : s.u;
        coords.push(nodes.get(nxt)); if(!name && s.name) name = s.name;
        cur = nxt;
        if(deg.get(cur) !== 2 || cur === start) break;
        const ns = adjSeg.get(cur).find(i => !segs[i].used);
        if(ns === undefined) break;
        sid = ns;
      }
      if(cur === start && coords.length < 3) return;  // degenerate loop
      edges.push({ a:jid(start), b:jid(cur), coords, len:lineLen(coords), name });
    };
    for(const [n, d] of deg) if(d !== 2) for(const sid of adjSeg.get(n)) if(!segs[sid].used) walk(n, sid);
    for(let i = 0; i < segs.length; i++) if(!segs[i].used) walk(segs[i].u, i);   // isolated loops
    return finishGraph(pts, edges);
  }
  function finishGraph(pts, edges){
    const adj = pts.map(() => []);
    edges.forEach((e, i) => { adj[e.a].push({ e:i, to:e.b }); if(e.a !== e.b) adj[e.b].push({ e:i, to:e.a }); });
    return { pts, edges, adj };
  }
  // keep only the largest connected part (by street length) so every part is reachable on foot
  function largestComponent(g){
    const comp = new Array(g.pts.length).fill(-1); let c = 0; const len = [];
    for(let s = 0; s < g.pts.length; s++){
      if(comp[s] !== -1 || !g.adj[s].length) continue;
      const st = [s]; comp[s] = c; len[c] = 0;
      while(st.length){ const v = st.pop(); for(const { e, to } of g.adj[v]){ if(comp[to] === -1){ comp[to] = c; st.push(to); } } }
      c++;
    }
    g.edges.forEach(e => { len[comp[e.a]] += e.len; });
    let best = 0; for(let i = 1; i < c; i++) if(len[i] > len[best]) best = i;
    const map = new Map(), pts = [], edges = [];
    const nid = v => { if(!map.has(v)){ map.set(v, pts.length); pts.push(g.pts[v]); } return map.get(v); };
    let dropped = 0;
    for(const e of g.edges){ if(comp[e.a] === best) edges.push({ ...e, a:nid(e.a), b:nid(e.b) }); else dropped += e.len; }
    const out = finishGraph(pts, edges); out.dropped_m = dropped; return out;
  }

  /* ---------- shortest paths ---------- */
  class Heap {
    constructor(){ this.a = []; }
    push(k, v){ const a = this.a; a.push([k, v]); let i = a.length - 1; while(i){ const p = (i-1) >> 1; if(a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
    pop(){ const a = this.a, top = a[0], last = a.pop(); if(a.length){ a[0] = last; let i = 0; for(;;){ const l = 2*i+1, r = l+1; let m = i; if(l < a.length && a[l][0] < a[m][0]) m = l; if(r < a.length && a[r][0] < a[m][0]) m = r; if(m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
    get size(){ return this.a.length; }
  }
  // from any source until isTarget(v) → list of edge ids along the path (source → target)
  function shortestTo(g, sources, isTarget){
    const d = new Float64Array(g.pts.length).fill(Infinity), pe = new Int32Array(g.pts.length).fill(-1), pv = new Int32Array(g.pts.length).fill(-1);
    const h = new Heap();
    for(const s of sources){ d[s] = 0; h.push(0, s); }
    while(h.size){
      const [k, v] = h.pop(); if(k > d[v]) continue;
      if(isTarget(v)){
        const path = []; let x = v; while(pe[x] !== -1){ path.push(pe[x]); x = pv[x]; } return { target:v, edges:path.reverse() };
      }
      for(const { e, to } of g.adj[v]){ const nd = k + g.edges[e].len; if(nd < d[to]){ d[to] = nd; pe[to] = e; pv[to] = v; h.push(nd, to); } }
    }
    return null;
  }

  function sssp(g, src){
    const d = new Float64Array(g.pts.length).fill(Infinity), pe = new Int32Array(g.pts.length).fill(-1), pv = new Int32Array(g.pts.length).fill(-1);
    const h = new Heap(); d[src] = 0; h.push(0, src);
    while(h.size){ const [k, v] = h.pop(); if(k > d[v]) continue; for(const { e, to } of g.adj[v]){ const nd = k + g.edges[e].len; if(nd < d[to]){ d[to] = nd; pe[to] = e; pv[to] = v; h.push(nd, to); } } }
    return { d, pe, pv };
  }
  function pathFrom(tree, target){ const out = []; let x = target; while(tree.pe[x] !== -1){ out.push(tree.pe[x]); x = tree.pv[x]; } return out.reverse(); }

  /* ---------- 3. split ---------- */
  function partition(g, start, n){
    const cosLat = Math.cos(start[0] * RAD);
    const items = g.edges.map((e, i) => {
      const m = e.coords[Math.floor(e.coords.length / 2)];
      return { i, len:e.len, ang:Math.atan2(m[0] - start[0], (m[1] - start[1]) * cosLat) };
    }).sort((x, y) => x.ang - y.ang);
    if(n <= 1 || !items.length) return [items.map(x => x.i)];
    // rotate so the first cut falls into the widest empty angle
    let gapAt = 0, gap = -1;
    for(let k = 0; k < items.length; k++){
      const a = items[k].ang, b = k + 1 < items.length ? items[k+1].ang : items[0].ang + 2 * Math.PI;
      if(b - a > gap){ gap = b - a; gapAt = k + 1; }
    }
    const rot = items.slice(gapAt).concat(items.slice(0, gapAt));
    const total = rot.reduce((s, x) => s + x.len, 0), parts = Array.from({ length:n }, () => []);
    let cum = 0;
    for(const x of rot){ const p = Math.min(n - 1, Math.floor((cum + x.len / 2) / total * n)); parts[p].push(x.i); cum += x.len; }
    return parts;
  }

  /* ---------- 4. route per part ---------- */
  function nearestNode(g, p, among){
    let best = -1, bd = Infinity;
    for(const v of among){ const d = dist(g.pts[v], p); if(d < bd){ bd = d; best = v; } }
    return best;
  }
  function planPart(g, req, start){
    if(!req.length) return { path:[], length_m:0, street_m:0, edges:0 };
    const inst = req.map(e => ({ e, dead:false }));
    const touched = new Set(); for(const e of req){ touched.add(g.edges[e].a); touched.add(g.edges[e].b); }
    const root = nearestNode(g, start, touched);
    // union-find to connect separated pieces of the part
    const par = new Map(); const find = x => { while(par.get(x) !== x){ par.set(x, par.get(par.get(x))); x = par.get(x); } return x; };
    const uni = (a, b) => { if(!par.has(a)) par.set(a, a); if(!par.has(b)) par.set(b, b); par.set(find(a), find(b)); };
    for(const v of touched) par.set(v, v);
    for(const e of req) uni(g.edges[e].a, g.edges[e].b);
    for(let guard = 0; guard < 5000; guard++){
      const rr = find(root), comp = [...touched].filter(v => find(v) === rr);
      if(comp.length === touched.size) break;
      const r = shortestTo(g, comp, v => touched.has(v) && find(v) !== rr);
      if(!r) break;
      for(const e of r.edges){ inst.push({ e, dead:true }); const { a, b } = g.edges[e]; touched.add(a); touched.add(b); uni(a, b); }
    }
    // pair odd junctions with short connecting walks: global greedy + 2-opt improvement
    const degree = new Map(); const bump = v => degree.set(v, (degree.get(v) || 0) + 1);
    for(const { e } of inst){ bump(g.edges[e].a); bump(g.edges[e].b); }
    const odd = [...degree].filter(([, d]) => d % 2).map(([v]) => v);
    if(odd.length){
      const k = odd.length, idx = new Map(odd.map((v, i) => [v, i]));
      const D = Array.from({ length:k }, () => new Float64Array(k).fill(Infinity));
      const trees = odd.map(v => sssp(g, v));
      for(let i = 0; i < k; i++) for(let j = 0; j < k; j++) D[i][j] = trees[i].d[odd[j]];
      const pairs = [];
      for(let i = 0; i < k; i++) for(let j = i + 1; j < k; j++) if(isFinite(D[i][j])) pairs.push([D[i][j], i, j]);
      pairs.sort((x, y) => x[0] - y[0]);
      const mate = new Int32Array(k).fill(-1);
      for(const [, i, j] of pairs) if(mate[i] < 0 && mate[j] < 0){ mate[i] = j; mate[j] = i; }
      for(let pass = 0, improved = true; improved && pass < 30; pass++){
        improved = false;
        for(let a = 0; a < k; a++){
          const b = mate[a]; if(b < a) continue;
          for(let c = a + 1; c < k; c++){
            const d = mate[c]; if(c === b || d < c || d === a) continue;
            const cur = D[a][b] + D[c][d], s1 = D[a][c] + D[b][d], s2 = D[a][d] + D[b][c];
            if(s1 < cur - 1e-6 && s1 <= s2){ mate[a] = c; mate[c] = a; mate[b] = d; mate[d] = b; improved = true; break; }
            if(s2 < cur - 1e-6){ mate[a] = d; mate[d] = a; mate[b] = c; mate[c] = b; improved = true; break; }
          }
        }
      }
      for(let i = 0; i < k; i++){
        const j = mate[i]; if(j < i) continue;
        for(const e of pathFrom(trees[i], odd[j])) inst.push({ e, dead:true });
      }
    }
    // Hierholzer: Euler circuit over all instances
    const inc = new Map(); const addInc = (v, i) => { if(!inc.has(v)) inc.set(v, []); inc.get(v).push(i); };
    inst.forEach((x, i) => { addInc(g.edges[x.e].a, i); if(g.edges[x.e].a !== g.edges[x.e].b) addInc(g.edges[x.e].b, i); else addInc(g.edges[x.e].a, i); });
    const used = new Uint8Array(inst.length), ptr = new Map();
    const stack = [{ v:root, i:-1, from:-1 }], circuit = [];
    while(stack.length){
      const top = stack[stack.length - 1], list = inc.get(top.v) || [];
      let p = ptr.get(top.v) || 0;
      while(p < list.length && used[list[p]]) p++;
      ptr.set(top.v, p);
      if(p < list.length){
        const i = list[p]; used[i] = 1; const ed = g.edges[inst[i].e];
        stack.push({ v: ed.a === top.v ? ed.b : ed.a, i, from:top.v });
      }else circuit.push(stack.pop());
    }
    circuit.reverse();
    const path = []; let length = 0, street = 0;
    for(const step of circuit){
      if(step.i < 0) continue;
      const ed = g.edges[inst[step.i].e];
      const c = step.from === ed.a ? ed.coords : ed.coords.slice().reverse();
      for(const p of (path.length ? c.slice(1) : c)) path.push([+p[0].toFixed(6), +p[1].toFixed(6)]);
      length += ed.len; if(!inst[step.i].dead) street += ed.len;
    }
    return { path, length_m:Math.round(length), street_m:Math.round(street), edges:req.length, covered:used.reduce((s, x) => s + x, 0) === inst.length };
  }

  /* ---------- progress: which parts of a planned path are already walked ---------- */
  const COLORS = ['#2563EB','#C2185B','#D97706','#7C3AED','#059669','#0891B2','#DC2626','#4D7C0F','#DB2777','#EA580C'];
  function densifyPath(path, step){
    const out = [];
    for(let i = 0; i < path.length; i++){
      if(i === 0){ out.push(path[0]); continue; }
      const a = path[i-1], b = path[i], d = dist(a, b), n = Math.max(1, Math.ceil(d / step));
      for(let k = 1; k <= n; k++) out.push([a[0] + (b[0]-a[0]) * k/n, a[1] + (b[1]-a[1]) * k/n]);
    }
    return out;
  }
  // tracker keeps a sampled plan and marks samples near walked points; tol in meters
  function makeTracker(path, tol){
    tol = tol || 25;
    const samples = densifyPath(path, 8), done = new Uint8Array(samples.length);
    const cell = 0.0004, grid = new Map(), key = (la, lo) => Math.floor(la / cell) + ':' + Math.floor(lo / cell);
    samples.forEach((p, i) => { const k = key(p[0], p[1]); if(!grid.has(k)) grid.set(k, []); grid.get(k).push(i); });
    let count = 0;
    function mark(p){
      const cy = Math.floor(p[0] / cell), cx = Math.floor(p[1] / cell); let changed = false;
      for(let dy = -1; dy <= 1; dy++) for(let dx = -1; dx <= 1; dx++){
        const list = grid.get((cy+dy) + ':' + (cx+dx)); if(!list) continue;
        for(const i of list) if(!done[i] && dist(samples[i], p) <= tol){ done[i] = 1; count++; changed = true; }
      }
      return changed;
    }
    function markLine(a, b){ // also fill between sparse track points
      const d = dist(a, b), n = Math.min(50, Math.max(1, Math.ceil(d / 10))); let ch = false;
      for(let k = 0; k <= n; k++) ch = mark([a[0] + (b[0]-a[0]) * k/n, a[1] + (b[1]-a[1]) * k/n]) || ch;
      return ch;
    }
    function addTrack(pts){ let ch = false; for(let i = 0; i < pts.length; i++) ch = (i && dist(pts[i-1], pts[i]) < 120 ? markLine(pts[i-1], pts[i]) : mark(pts[i])) || ch; return ch; }
    function runs(){ // covered stretches as polylines
      const out = []; let cur = null;
      for(let i = 0; i < samples.length; i++){
        if(done[i]){ if(!cur){ cur = []; if(i) cur.push(samples[i-1]); } cur.push(samples[i]); }
        else if(cur){ cur.push(samples[i]); out.push(cur); cur = null; }
      }
      if(cur) out.push(cur);
      return out;
    }
    function nextIndex(){ for(let i = 0; i < samples.length; i++) if(!done[i]) return i; return -1; }
    return { samples, mark, markLine, addTrack, runs, nextIndex, pct: () => samples.length ? Math.round(100 * count / samples.length) : 0 };
  }

  function suggestWorkers(streetMeters){ return Math.max(1, Math.round(streetMeters * 1.25 / 1000 / WORKER_KM_PER_SHIFT)); }
  function hours(meters){ return meters / 1000 / WALK_KMH; }

  /* ---------- orchestration ---------- */
  async function loadZone(poly, fetchImpl){
    const osm = await fetchStreets(poly, fetchImpl);
    const g = largestComponent(buildGraph(osm, poly));
    g.street_m = Math.round(g.edges.reduce((s, e) => s + e.len, 0));
    return g;
  }
  function planRoutes(g, start, n){
    return partition(g, start, n).map((part, k) => ({ idx:k, ...planPart(g, part, start) }));
  }

  const api = { COLORS, densifyPath, makeTracker, fetchStreets, buildGraph, largestComponent, partition, planPart, planRoutes, loadZone, suggestWorkers, hours, dist, inPoly, lineLen };
  if(typeof module !== 'undefined' && module.exports) module.exports = api; else root.Planner = api;
})(typeof window !== 'undefined' ? window : globalThis);
