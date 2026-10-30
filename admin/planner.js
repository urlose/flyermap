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
  const NO_WAY = 'motorway|motorway_link|trunk|trunk_link|footway|cycleway|path|steps|bridleway|construction|proposed|raceway|corridor|elevator|platform|bus_stop|track|bus_guideway|escape|rest_area|services';
  // ordered by measured speed (30.10.2026: .fr and overpass-api.de answer, mail.ru often 504, private.coffee / kumi time out)
  // (private.coffee / kumi were dropped: they only ever timed out, which kept a failing round open for minutes)
  const OVERPASS = ['https://overpass.openstreetmap.fr/api/interpreter', 'https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
  const WORK_HOURS = 7;            // 8 h shift minus 1 h unpaid break
  const WALK_KMH = 2.5;            // effective walking speed while distributing (with a bag of flyers)
  // way to a village counts 3x its length: out and back, plus the extra loops when the work is split between workers and days
  const TRANSIT_W = 3;
  // compact work area: every mailbox costs this many extra metres per km of walking distance from the start, so nearby
  // villages come before richer ones far away (otherwise the plan sends people kilometres out for a slightly denser street)
  const DIST_MB = 8;
  const BOX_SEC = 5;               // handling time per mailbox (seconds)

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
  // Public Overpass servers are often busy: start the first mirror at once, the next one after 10 s
  // (or immediately if one fails) and take whichever answers first. When every mirror refuses (overloaded: 429 / 502 / 504),
  // wait and try again with growing pauses (4 s, 8 s, 16 s …) for up to about four minutes.
  async function overpass(q, fetchImpl, timeoutMs, stale){
    const t0 = Date.now(); let wait = 4000;
    for(;;){
      try{ return await overpassRound(q, fetchImpl, timeoutMs); }
      catch(e){
        if(Date.now() - t0 > 240000 || (stale && stale())) throw e;
        await new Promise(r => setTimeout(r, wait)); wait = Math.min(30000, wait * 2);
        if(stale && stale()) throw new Error('stale');
      }
    }
  }
  function overpassRound(q, fetchImpl, timeoutMs){
    const f = fetchImpl || fetch, total = timeoutMs || 60000;
    return new Promise((resolve, reject) => {
      let done = false, failed = 0, next = 0, lastErr; const ctrls = [], timers = [];
      const finish = (fn, v) => { if(done) return; done = true; timers.forEach(clearTimeout); ctrls.forEach(c => { try{ c.abort(); }catch{} }); fn(v); };
      const launch = () => {
        if(done || next >= OVERPASS.length) return;
        const url = OVERPASS[next++];
        if(next < OVERPASS.length) timers.push(setTimeout(launch, 10000));
        const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null; if(ctrl) ctrls.push(ctrl);
        const tm = ctrl ? setTimeout(() => ctrl.abort(), total) : null; if(tm) timers.push(tm);
        (async () => {
          try{
            const r = await f(url, { method:'POST', headers:{ 'Content-Type':'application/x-www-form-urlencoded' }, body:'data=' + encodeURIComponent(q), signal: ctrl && ctrl.signal });
            if(!r.ok) throw new Error('overpass ' + r.status);
            const j = await r.json();
            if(j && j.remark && /runtime error|out of memory|timed out/i.test(j.remark)) throw new Error('overpass ' + j.remark);   // busy server answers 200 with a partial result
            finish(resolve, j);
          }catch(e){ lastErr = e; failed++; if(failed >= OVERPASS.length) finish(reject, lastErr || new Error('overpass')); else launch(); }
        })();
      };
      launch();
    });
  }
  // every road a person can walk along between houses (village lanes are often mapped as "service" or "unclassified");
  // not motorways, paths/tracks, or parking aisles and private driveways
  const HW_FILTER = `["highway"]["highway"!~"^(${NO_WAY})$"]["service"!~"^(parking_aisle|driveway|drive-through|emergency_access)$"]["access"!~"^(private|no)$"]`;
  async function fetchStreets(poly, fetchImpl){
    const ps = poly.map(p => p[0].toFixed(6) + ' ' + p[1].toFixed(6)).join(' ');
    return overpass(`[out:json][timeout:110];way${HW_FILTER}(poly:"${ps}");out body;>;out skel qt;`, fetchImpl, 110000);
  }
  // the centre is rounded to ~100 m so that repeated plans for the same place hit the server-side cache
  const rc = c => [Math.round(c[0] * 1000) / 1000, Math.round(c[1] * 1000) / 1000];
  // bounding-box filters use the index and are far faster on busy Overpass servers than "around" (which checks every node)
  const bbox = (c, r) => { const k = rc(c), dLat = r / 111320, dLng = r / (111320 * Math.cos(k[0] * RAD)); return [k[0] - dLat, k[1] - dLng, k[0] + dLat, k[1] + dLng].map(v => v.toFixed(5)).join(','); };
  const qStreets = (c, r) => `[out:json][timeout:110];way${HW_FILTER}(${bbox(c, r)});out body;>;out skel qt;`;
  // houses only need a centre point, everything else a footprint; garages, sheds etc. are not loaded at all
  const qBuildings = (c, r) => { const bb = bbox(c, r); return `[out:json][timeout:110];way["building"~"^(${HOUSE_B})$"](${bb})->.h;way["building"]["building"!~"^(${HOUSE_B}|${NO_B})$"](${bb})->.o;.h out center tags;.o out geom tags;`; };
  async function fetchStreetsAround(c, r, fetchImpl){ return overpass(qStreets(c, r), fetchImpl, 110000); }
  async function fetchBuildings(c, r, fetchImpl){ return overpass(qBuildings(c, r), fetchImpl, 110000); }

  /* ---------- map tiles: the area is loaded as fixed squares (about 3.3 × 3 km) ----------
     Every square is one small Overpass request (about 2 s), is stored in the shared cache in a compact form and is reused for
     every start point nearby. Growing the area only loads the new squares around it. */
  const TILE_LAT = 0.03, TILE_LNG = 0.045, TILE_V = 'fm3';
  const tileKey = (i, j) => i + ':' + j;
  function tilesFor(c, r){
    const dLat = r / 111320, dLng = r / (111320 * Math.cos(c[0] * RAD)), out = [];
    const i0 = Math.floor((c[0] - dLat) / TILE_LAT), i1 = Math.floor((c[0] + dLat) / TILE_LAT);
    const j0 = Math.floor((c[1] - dLng) / TILE_LNG), j1 = Math.floor((c[1] + dLng) / TILE_LNG);
    for(let i = i0; i <= i1; i++) for(let j = j0; j <= j1; j++) out.push(tileKey(i, j));
    // nearest squares first, so the progress counts outwards from the start
    const mid = k => { const [i, j] = k.split(':').map(Number); return Math.hypot((i + 0.5) * TILE_LAT - c[0], ((j + 0.5) * TILE_LNG - c[1]) * Math.cos(c[0] * RAD)); };
    return out.sort((a, b) => mid(a) - mid(b));
  }
  function qTile(k){
    const [i, j] = k.split(':').map(Number), bb = [i * TILE_LAT, j * TILE_LNG, (i + 1) * TILE_LAT, (j + 1) * TILE_LNG].map(v => v.toFixed(4)).join(',');
    return `[out:json][timeout:90];way${HW_FILTER}(${bb});out body qt;>;out skel qt;way["building"~"^(${HOUSE_B})$"](${bb});out center tags qt;way["building"]["building"!~"^(${HOUSE_B}|${NO_B})$"](${bb});out geom tags qt;/*${TILE_V}*/`;
  }
  const r6 = v => Math.round(v * 1e6) / 1e6;
  // only what the planner needs: street nodes, street ways (id, name, node ids), houses with their estimated mailboxes
  function compactTile(osm){
    const n = [], w = [], b = [];
    for(const e of (osm && osm.elements) || []){
      if(e.type === 'node') n.push(e.id, r6(e.lat), r6(e.lon));
      else if(e.type === 'way' && e.nodes && e.tags && e.tags.highway) w.push([e.id, e.tags.name || e.tags.ref || '', e.nodes]);
      else if(e.type === 'way'){ const x = parseBuildings({ elements:[e] })[0]; if(x) b.push([e.id, r6(x.lat), r6(x.lng), x.n]); }
    }
    return { v:TILE_V, elements:[], n, w, b };
  }
  // several tiles → one Overpass-like street answer + one building list (ways and houses on a border appear only once)
  function mergeTiles(list){
    const nodes = new Map(), ways = new Map(), bs = new Map();
    for(const t of list){
      if(!t) continue;
      for(let i = 0; i < t.n.length; i += 3) nodes.set(t.n[i], [t.n[i + 1], t.n[i + 2]]);
      for(const x of t.w) ways.set(x[0], x);
      for(const x of t.b) bs.set(x[0], x);
    }
    const elements = [];
    for(const [id, p] of nodes) elements.push({ type:'node', id, lat:p[0], lon:p[1] });
    for(const [id, x] of ways) elements.push({ type:'way', id, nodes:x[2], tags:x[1] ? { name:x[1] } : {} });
    return { osm:{ elements }, buildings:[...bs.values()].map(x => ({ lat:x[1], lng:x[2], n:x[3] })) };
  }
  // fills `store` (tile key → compact tile) for all keys: shared cache first, then Overpass, two squares at a time
  async function fetchTiles(keys, store, opt){
    const miss = keys.filter(k => !store.has(k)), total = keys.length;
    const report = () => opt.progress && opt.progress(keys.filter(k => store.has(k)).length, total);
    if(!miss.length) return;
    if(opt.cache){
      const chunks = []; for(let i = 0; i < miss.length; i += 3) chunks.push(miss.slice(i, i + 3));   // the cache function takes up to 3 per call
      await Promise.all(chunks.map(async ch => {
        try{ const hit = await opt.cache.get(ch.map(qTile)); (hit || []).forEach((x, i) => { if(x && x.v === TILE_V && Array.isArray(x.n)) store.set(ch[i], x); }); }catch(e){ /* cache is optional */ }
      }));
    }
    const todo = miss.filter(k => !store.has(k)); report();
    let next = 0;
    const lane = async () => {
      while(next < todo.length){
        if(opt.stale && opt.stale()) throw new Error('stale');
        const k = todo[next++], q = qTile(k);
        const t = compactTile(await overpass(q, opt.fetchImpl, 90000, opt.stale));
        store.set(k, t); report();
        if(opt.cache) Promise.resolve(opt.cache.put([{ q, payload:t }])).catch(() => {});
      }
    };
    await Promise.all([lane(), lane()]);
  }

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
  function partition(g, start, n, ids, weight){
    const cosLat = Math.cos(start[0] * RAD);
    const list = ids || g.edges.map((e, i) => i), wf = weight || (e => e.len);
    const items = list.map(i => {
      const e = g.edges[i], m = e.coords[Math.floor(e.coords.length / 2)];
      return { i, len:wf(e), ang:Math.atan2(m[0] - start[0], (m[1] - start[1]) * cosLat) };
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

  /* ---------- 3b. keep every worker's area in one piece ---------- */
  // street pieces of one part that hang together (share a junction)
  function pieces(g, ids){
    const set = new Set(ids), seen = new Set(), out = [];
    for(const i of ids){
      if(seen.has(i)) continue;
      const st = [i], c = []; seen.add(i);
      while(st.length){ const e = st.pop(); c.push(e); for(const v of [g.edges[e].a, g.edges[e].b]) for(const { e:f } of g.adj[v]) if(set.has(f) && !seen.has(f)){ seen.add(f); st.push(f); } }
      out.push(c);
    }
    return out;
  }
  // which parts use a junction (junction → Map(part → number of street ends))
  function owners(g, parts){
    const own = new Map();
    parts.forEach((p, k) => { for(const e of p) for(const v of [g.edges[e].a, g.edges[e].b]){ let m = own.get(v); if(!m) own.set(v, m = new Map()); m.set(k, (m.get(k) || 0) + 1); } });
    return own;
  }
  // A sector cut around the start often leaves a few streets of a far village to one worker while a neighbour walks the rest of
  // that village: the worker has to walk all the way there for a handful of mailboxes. Such detached bits go to the neighbour
  // whose area they touch most. Big second areas (more than 30 % of the part) stay: those are planned on purpose.
  function tidyParts(g, parts){
    parts = parts.map(p => p.slice());
    const lenOf = c => c.reduce((s, e) => s + g.edges[e].len, 0);
    for(let round = 0; round < 20; round++){
      let moved = false;
      for(let k = 0; k < parts.length; k++){
        const ps = pieces(g, parts[k]); if(ps.length < 2) continue;
        ps.sort((a, b) => lenOf(b) - lenOf(a));
        const own = owners(g, parts), keep = ps[0].slice(), all = lenOf(parts[k]);
        for(const c of ps.slice(1)){
          if(lenOf(c) > 0.3 * all){ for(const e of c) keep.push(e); continue; }   // a real second area of this worker, not a stray bit
          const touch = new Map();
          for(const e of c) for(const v of [g.edges[e].a, g.edges[e].b]){ const m = own.get(v); if(m) for(const [q, cnt] of m) if(q !== k) touch.set(q, (touch.get(q) || 0) + cnt); }
          if(!touch.size){ for(const e of c) keep.push(e); continue; }   // reachable only over roads nobody walks: leave it
          let bq = -1, bc = -1; for(const [q, cnt] of touch) if(cnt > bc){ bc = cnt; bq = q; }
          for(const e of c) parts[bq].push(e); moved = true;
        }
        parts[k] = keep;
      }
      if(!moved) break;
    }
    return parts;
  }
  const edgeMin = x => 1.35 * x.len / 1000 / WALK_KMH * 60 + x.mb * BOX_SEC / 60;   // rough minutes for one street piece
  // neighbouring parts of P (they share a junction)
  function neighbours(g, parts, P, own){
    const nb = new Set();
    for(const e of parts[P]) for(const v of [g.edges[e].a, g.edges[e].b]){ const m = own.get(v); if(m) for(const q of m.keys()) if(q !== P) nb.add(q); }
    return nb;
  }
  // P hands a connected strip along its border with Q to Q (breadth first from the border), worth about `want` minutes
  function shiftStrip(g, parts, P, Q, want, own){
    const inP = new Set(parts[P]), take = new Set(), seen = new Set(), queue = [];
    for(const e of parts[P]) for(const v of [g.edges[e].a, g.edges[e].b]){ const m = own.get(v); if(m && m.has(Q) && !seen.has(e)){ seen.add(e); queue.push(e); } }
    let got = 0;
    for(let h = 0; h < queue.length && got < want && take.size < inP.size - 1; h++){
      const e = queue[h]; take.add(e); got += edgeMin(g.edges[e]);
      for(const v of [g.edges[e].a, g.edges[e].b]) for(const { e:f } of g.adj[v]) if(inP.has(f) && !seen.has(f)){ seen.add(f); queue.push(f); }
    }
    if(!take.size) return null;
    const out = parts.map(p => p.slice());
    out[P] = out[P].filter(e => !take.has(e)); for(const e of take) out[Q].push(e);
    return tidyParts(g, out);
  }
  // evens out the parts (rough minutes) without tearing them: the slowest part hands a strip to its fastest neighbour
  function balanceParts(g, parts, rounds){
    const cost = p => p.reduce((s, e) => s + edgeMin(g.edges[e]), 0);
    parts = tidyParts(g, parts);
    for(let it = 0; it < (rounds || 40); it++){
      const c = parts.map(cost), mean = c.reduce((a, b) => a + b, 0) / parts.length, own = owners(g, parts);
      let next = null;
      for(const P of c.map((x, k) => k).sort((a, b) => c[b] - c[a])){
        if(c[P] <= mean * 1.03) break;
        const nb = [...neighbours(g, parts, P, own)].filter(q => c[q] < c[P]).sort((a, b) => c[a] - c[b]);
        if(!nb.length) continue;
        next = shiftStrip(g, parts, P, nb[0], (c[P] - c[nb[0]]) / 2, own);
        if(next) break;
      }
      if(!next) break;
      parts = next;
    }
    return parts;
  }

  /* ---------- 4. route per part ---------- */
  function nearestNode(g, p, among){
    let best = -1, bd = Infinity;
    for(const v of among){ const d = dist(g.pts[v], p); if(d < bd){ bd = d; best = v; } }
    return best;
  }
  const bearing = (a, b) => Math.atan2((b[1] - a[1]) * Math.cos(a[0] * RAD), b[0] - a[0]) / RAD;
  const turnCode = d => { const a = Math.abs(d); return a < 25 ? 'S' : a < 60 ? (d < 0 ? 'SL' : 'SR') : a < 150 ? (d < 0 ? 'L' : 'R') : 'U'; };
  // rootNode (optional): common start/end junction, so that several day-loops of one worker all begin and end at the same place
  function planPart(g, req, start, rootNode){
    if(!req.length) return { path:[], length_m:0, street_m:0, edges:0, steps:[] };
    const inst = req.map(e => ({ e, dead:false }));
    const touched = new Set(); for(const e of req){ touched.add(g.edges[e].a); touched.add(g.edges[e].b); }
    if(rootNode != null) touched.add(rootNode);
    const root = rootNode != null ? rootNode : nearestNode(g, start, touched);
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
    // turn-by-turn steps: [path index, turn code (S SL SR L R U), street name]
    const steps = []; let prevB = null, prevName = null;
    for(const step of circuit){
      if(step.i < 0) continue;
      const ed = g.edges[inst[step.i].e];
      const c = step.from === ed.a ? ed.coords : ed.coords.slice().reverse();
      const at = path.length ? path.length - 1 : 0;
      let j = 1; while(j < c.length - 1 && dist(c[0], c[j]) < 4) j++;
      const b0 = bearing(c[0], c[j]); let turn = 0;
      if(prevB != null){ turn = b0 - prevB; while(turn > 180) turn -= 360; while(turn < -180) turn += 360; }
      const nm = ed.name || '';
      if(prevB == null) steps.push([at, 'start', nm]);
      else if(Math.abs(turn) >= 25 || (nm && nm !== prevName)) steps.push([at, turnCode(turn), nm]);
      let k = c.length - 2; while(k > 0 && dist(c[c.length - 1], c[k]) < 4) k--;
      prevB = bearing(c[k], c[c.length - 1]); prevName = nm || prevName;
      for(const p of (path.length ? c.slice(1) : c)) path.push([+p[0].toFixed(6), +p[1].toFixed(6)]);
      length += ed.len; if(!inst[step.i].dead) street += ed.len;
    }
    if(path.length) steps.push([path.length - 1, 'end', '']);
    return { path, steps, root, length_m:Math.round(length), street_m:Math.round(street), edges:req.length, covered:used.reduce((s, x) => s + x, 0) === inst.length };
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
    return { samples, mark, markLine, addTrack, runs, nextIndex, isDone:i => !!done[i], pct: () => samples.length ? Math.round(100 * count / samples.length) : 0 };
  }

  /* ---------- mailboxes (estimated from OSM buildings) ---------- */
  const NO_B = 'garage|garages|shed|roof|carport|greenhouse|hut|cabin|barn|farm_auxiliary|stable|cowshed|sty|ruins|construction|service|parking|hangar|kiosk|toilets|bunker|digester|silo|tank|transformer_tower|water_tower|storage_tank|bridge|boathouse|container|allotment_house|gatehouse|church|chapel|mosque|synagogue|temple|cathedral|train_station|transportation|grandstand|stadium|pavilion|tower|industrial|warehouse|manufacture|power|substation|commercial|retail|supermarket|shop|mall|office|hotel|hospital|clinic|school|university|college|kindergarten|public|civic|government|fire_station|sports_hall|sports_centre|gym|restaurant|cafe|fuel|petrol_station|bank|data_center|factory|works|laboratory|museum|theatre|cinema|library|prison|barracks|military', HOUSE_B = 'house|detached|semidetached_house|terrace|bungalow|villa|farm|cottage|houseboat|static_caravan';
  const NO_MAILBOX = new RegExp('^(' + NO_B + ')$'), HOUSE = new RegExp('^(' + HOUSE_B + ')$');
  const FLATS = /^(apartments|residential|dormitory)$/;
  function polyArea(geom){
    if(!geom || geom.length < 3) return 0;
    const lat0 = geom[0].lat, kx = Math.cos(lat0 * RAD) * R * RAD, ky = R * RAD;
    let a = 0;
    for(let i = 0; i < geom.length; i++){ const p = geom[i], q = geom[(i + 1) % geom.length]; a += (p.lon * kx) * (q.lat * ky) - (q.lon * kx) * (p.lat * ky); }
    return Math.abs(a) / 2;
  }
  function estimateMailboxes(tags, area){
    tags = tags || {};
    if(tags.abandoned || tags.disused || tags['disused:building']) return 0;
    const b = String(tags.building || 'yes');
    // shops, offices, restaurants, workshops … are no letterboxes for flyers (unless the building is explicitly residential)
    const business = tags.shop || tags.office || tags.amenity || tags.craft || tags.tourism || tags.industrial || tags.healthcare || tags.leisure;
    const flats = parseInt(tags['building:flats'] || tags['addr:flats'], 10);
    if(flats > 0) return Math.min(flats, 250);
    if(NO_MAILBOX.test(b)) return 0;
    const hasNr = !!tags['addr:housenumber'];
    if(HOUSE.test(b)) return area < 25 ? 0 : 1;
    const lv = parseFloat(tags['building:levels']);
    const levels = lv > 0 ? lv : (area < 120 ? 2 : 4);
    if(FLATS.test(b)) return Math.max(2, Math.min(250, Math.round(area * levels * 0.75 / 80)));
    if(business) return 0;
    if(b === 'yes'){
      if(area < 30 || (!hasNr && area < 60)) return 0;
      if(!(lv > 0) && area > 900) return 0;   // large box without levels: almost always a shop, hall or factory
      return Math.max(1, Math.min(250, Math.round(area * levels * 0.75 / 80)));
    }
    return 0;   // any other building type is not counted
  }
  function parseBuildings(osm){
    const out = [];
    for(const w of osm.elements || []){
      if(w.type !== 'way') continue;
      if(w.geometry){
        const area = polyArea(w.geometry), n = estimateMailboxes(w.tags, area);
        if(!n) continue;
        let la = 0, lo = 0; for(const p of w.geometry){ la += p.lat; lo += p.lon; }
        out.push({ lat:la / w.geometry.length, lng:lo / w.geometry.length, n });
      }else if(w.center){   // house types are loaded as centre point only; footprint size does not matter for them
        const n = estimateMailboxes(w.tags, 100);
        if(n) out.push({ lat:w.center.lat, lng:w.center.lon, n });
      }
    }
    return out;
  }
  // snap every building to its nearest street edge (≤ maxSnap m); edge.mb = mailboxes, edge.boxes = [[lat,lng,n]]
  function attachBuildings(g, buildings, maxSnap){
    maxSnap = maxSnap || 70;
    const cell = 80, lat0 = g.pts.length ? g.pts[0][0] : 51, kx = Math.cos(lat0 * RAD) * R * RAD, ky = R * RAD;
    const key = (x, y) => Math.floor(x / cell) + ':' + Math.floor(y / cell), grid = new Map();
    const add = (k, v) => { let l = grid.get(k); if(!l) grid.set(k, l = []); l.push(v); };
    g.edges.forEach((e, ei) => {
      e.mb = 0; e.boxes = [];
      for(let i = 1; i < e.coords.length; i++){
        const ax = e.coords[i-1][1] * kx, ay = e.coords[i-1][0] * ky, bx = e.coords[i][1] * kx, by = e.coords[i][0] * ky;
        const L = Math.hypot(bx - ax, by - ay), steps = Math.max(1, Math.ceil(L / 30)), seen = new Set();
        for(let s = 0; s <= steps; s++){ const x = ax + (bx - ax) * s / steps, y = ay + (by - ay) * s / steps; for(let dx = -1; dx <= 1; dx++) for(let dy = -1; dy <= 1; dy++){ const k = key(x + dx * cell, y + dy * cell); if(!seen.has(k)){ seen.add(k); add(k, [ei, ax, ay, bx, by]); } } }
      }
    });
    let used = 0, dropped = 0;
    for(const b of buildings){
      const x = b.lng * kx, y = b.lat * ky, cand = grid.get(key(x, y));
      let best = -1, bd = Infinity;
      if(cand) for(const [ei, ax, ay, bx, by] of cand){
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        let t = l2 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
        const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
        if(d < bd){ bd = d; best = ei; }
      }
      if(best < 0 || bd > maxSnap){ dropped += b.n; continue; }
      const e = g.edges[best]; e.mb += b.n; e.boxes.push([+b.lat.toFixed(6), +b.lng.toFixed(6), b.n]); used += b.n;
    }
    g.mailboxes = used; g.dropped_mb = dropped;
    return g;
  }
  // grow the work area from the start (walking distance) until it holds `flyers` mailboxes
  function selectForFlyers(g, start, flyers){
    const root = nearestNode(g, start, g.pts.map((p, i) => i).filter(i => g.adj[i].length));
    const tree = sssp(g, root), n = g.pts.length, items = [];
    // 1. skip long, nearly empty roads (fields, forest tracks, a lone farm at the end of a road)
    let sm = 0, sl = 0; g.edges.forEach(e => { if(e.mb > 0){ sm += e.mb; sl += e.len; } });
    const D = sl ? sm / sl * 1000 : 0;                                   // average mailboxes per km of street
    const minDens = Math.max(4, Math.min(15, 0.25 * D));
    const sparse = e => e.len > 100 && e.mb * 1000 / e.len < minDens;
    let skipped = 0;
    g.edges.forEach((e, i) => { if(e.mb > 0){ if(sparse(e)){ skipped += e.mb; return; } items.push({ i, k:(tree.d[e.a] + tree.d[e.b]) / 2, v:tree.d[e.a] <= tree.d[e.b] ? e.b : e.a }); } });
    // 2. drop poor branches: along the shortest-path tree from the start, a branch (road out to somewhere) is only worth walking
    //    if it brings enough mailboxes per km (walking out and back). Rich far villages survive, long empty spurs do not.
    const B = new Float64Array(n), Lc = new Float64Array(n), kids = Array.from({ length:n }, () => []);
    for(let v = 0; v < n; v++) if(tree.pe[v] !== -1) kids[tree.pv[v]].push(v);
    const pre = [], st = [root]; while(st.length){ const v = st.pop(); pre.push(v); for(const c of kids[v]) st.push(c); }
    items.forEach(it => { const e = g.edges[it.i]; B[it.v] += e.mb; Lc[it.v] += e.len; });
    for(let q = pre.length - 1; q >= 0; q--){ const v = pre[q]; if(tree.pe[v] === -1) continue; Lc[v] += g.edges[tree.pe[v]].len; B[tree.pv[v]] += B[v]; Lc[tree.pv[v]] += Lc[v]; }
    const thr = Math.max(6, Math.min(25, 0.3 * D)), drop = new Uint8Array(n);
    for(const v of pre){ if(tree.pe[v] === -1) continue; if(drop[tree.pv[v]]) drop[v] = 1; else if(tree.d[v] > 300 && Lc[v] > 0 && B[v] / Lc[v] * 1000 < thr) drop[v] = 1; }
    const kept = items.filter(it => { if(drop[it.v]){ skipped += g.edges[it.i].mb; return false; } return true; });
    // 3. villages = dense clusters of street pieces. Long, thin connecting roads do NOT glue villages together (otherwise a poor
    //    connector drags a rich village down and the pieces taken from such a blob are random).
    //    Clusters are taken greedily by mailboxes per metre of NEW walking: the way out is paid only once, so a village that lies
    //    on the way to an already chosen one is almost free and comes next. Mailboxes along the way are delivered on the way.
    const denseThr = Math.max(12, Math.min(45, 0.25 * D));
    const uf = Int32Array.from({ length:n }, (_, i) => i), find = x => { while(uf[x] !== x){ uf[x] = uf[uf[x]]; x = uf[x]; } return x; };
    const isDense = it => { const e = g.edges[it.i]; return e.len <= 100 || e.mb * 1000 / e.len >= denseThr; };
    kept.forEach(it => { if(isDense(it)){ const e = g.edges[it.i]; uf[find(e.a)] = find(e.b); } });
    const groups = new Map();
    for(const it of kept){
      const e = g.edges[it.i], key = isDense(it) ? find(e.a) : 'x' + it.i; let c = groups.get(key);
      if(!c) groups.set(key, c = { items:[], entry:e.a });
      c.items.push(it);
      for(const v of [e.a, e.b]) if(tree.d[v] < tree.d[c.entry]) c.entry = v;
    }
    const cl = [...groups.values()], E = g.edges.length, taken = new Uint8Array(E), reached = new Uint8Array(n);
    cl.forEach((c, i) => { c.ix = i; });
    let alive = new Set(), sum = 0;
    const take = i => { if(!taken[i]){ taken[i] = 1; sum += g.edges[i].mb; } };
    const markPath = c => { let x = c.entry; while(tree.pe[x] !== -1){ take(tree.pe[x]); reached[g.edges[tree.pe[x]].a] = 1; reached[g.edges[tree.pe[x]].b] = 1; x = tree.pv[x]; } };
    const transit = c => { const path = []; let x = c.entry, len = 0; while(!reached[x] && tree.pe[x] !== -1){ path.push(tree.pe[x]); len += g.edges[tree.pe[x]].len; x = tree.pv[x]; } return { path, len }; };
    // start again from a given set of chosen clusters {c, items}
    const reset = (list, forbid) => {
      taken.fill(0); reached.fill(0); reached[root] = 1; sum = 0;
      const inList = new Set(list.map(p => p.c)); alive = new Set();
      cl.forEach((c, i) => { if(!inList.has(c) && !(forbid && forbid.has(c))) alive.add(i); });
      for(const p of list){ markPath(p.c); for(const it of p.items){ take(it.i); reached[g.edges[it.i].a] = 1; reached[g.edges[it.i].b] = 1; } }
    };
    // best remaining cluster by mailboxes per metre of NEW walking (the way out is paid once; a village on the way is nearly free)
    const bestCluster = () => {
      let best = null;
      for(const ci of alive){
        const c = cl[ci]; let mb = 0, len = 0;
        let far = 0;
        for(const it of c.items) if(!taken[it.i]){ mb += g.edges[it.i].mb; len += g.edges[it.i].len; far += g.edges[it.i].mb * it.k; }
        if(!mb){ alive.delete(ci); continue; }
        const tr = transit(c), c0 = 1.35 * len + TRANSIT_W * tr.len + 200 + DIST_MB * far / 1000, score = mb / c0;
        if(!best || score > best.score) best = { ci, c, tr, mb, score };
      }
      return best;
    };
    const pick = (best, limit) => {
      const { ci, c, tr } = best; alive.delete(ci);
      for(const ei of tr.path) take(ei);                                   // houses on the way out are served on the way
      const items = c.items.filter(it => !taken[it.i]).sort((x, y) => x.k - y.k), used = [];
      for(const it of items){ if(sum >= limit) break; take(it.i); used.push(it); }
      for(const it of c.items){ if(taken[it.i]){ reached[g.edges[it.i].a] = 1; reached[g.edges[it.i].b] = 1; } }
      for(const ei of tr.path){ reached[g.edges[ei].a] = 1; reached[g.edges[ei].b] = 1; }
      return { c, items:used.length ? used : c.items };
    };
    // the chosen street pieces of every cluster + the road from the start to it (walked once out and back)
    const build = list => {
      const inSet = new Uint8Array(E), isItem = new Uint8Array(E); let sm = 0, c = 0;
      const add = (i, it) => { if(it) isItem[i] = 1; if(!inSet[i]){ inSet[i] = 1; sm += g.edges[i].mb; } };
      for(const p of list){ for(const it of p.items) add(it.i, true); let x = p.c.entry; while(tree.pe[x] !== -1){ add(tree.pe[x], false); x = tree.pv[x]; } }
      let walk = 0;
      for(let i = 0; i < E; i++) if(inSet[i]){ const e = g.edges[i], w = e.len * (isItem[i] ? 1.35 : TRANSIT_W); walk += w; c += w + DIST_MB * e.mb * (tree.d[e.a] + tree.d[e.b]) / 2000; }
      return { inSet, sum:sm, cost:c + 200 * list.length, walk:walk + 200 * list.length };
    };
    // greedy until the flyers are covered (a small overshoot is better than a village left half walked)
    const grow = (list, forbid) => {
      reset(list, forbid); const out = list.slice();
      while(sum < flyers){ const best = bestCluster(); if(!best) break; out.push(pick(best, sum + best.mb - flyers <= 0.05 * flyers ? Infinity : flyers)); }
      return out;
    };
    let S = grow([], null), cur = build(S);
    // A. exchange: drop the dearest cluster and cover the gap with a cheaper combination (a greedy pick of a big far village
    //    often costs more than a nearer village plus a few small ones)
    for(let round = 0; round < 15 && flyers < 1e8; round++){
      const cand = S.map((p, k) => { const b = build(S.filter((_, j) => j !== k)); return { k, r:(cur.cost - b.cost) / Math.max(1, cur.sum - b.sum) }; }).sort((x, y) => y.r - x.r).slice(0, 6);
      let done = false;
      for(const { k } of cand){
        const S2 = grow(S.filter((_, j) => j !== k), new Set([S[k].c])), b2 = build(S2);
        if(b2.sum >= flyers && b2.cost < cur.cost * 0.995){ S = S2; cur = b2; done = true; break; }
      }
      if(!done) break;
    }
    // B. along the way: villages the route passes anyway cost almost nothing (more than needed is fine, it is trimmed below)
    if(flyers < 1e8){
      reset(S, null);
      for(let guard = 0; guard < 400; guard++){
        const best = bestCluster(); if(!best || best.score < 0.9 * cur.sum / cur.cost || sum + best.mb > 1.35 * flyers) break;
        S.push(pick(best, Infinity)); cur = build(S);
      }
    }
    // C. trim: while the flyers stay covered, drop the cluster that saves the most walking per mailbox lost
    for(let guard = 0; guard < 400 && cur.sum > flyers && S.length > 1; guard++){
      let bi = -1, bb = null, br = -1;
      for(let k = 0; k < S.length; k++){
        const b = build(S.filter((_, j) => j !== k)); if(b.sum < flyers) continue;
        const r = (cur.cost - b.cost) / Math.max(1, cur.sum - b.sum);
        if(r > br){ br = r; bi = k; bb = b; }
      }
      if(bi < 0) break;
      S.splice(bi, 1); cur = bb;
    }
    // D. a village the route walks through or touches anyway is done completely. Walking its main road (on the way to somewhere else, or
    //    because the flyer count ran out right there) and leaving its side streets looks like a mistake and costs little.
    //    Small villages only: a town cut off at the flyer count stays cut. The surplus comes off elsewhere (E).
    if(flyers < 1e8){
      // junctions within a short walk (120 m) of the walked streets: a village joined to the road by a short piece of
      // street without mailboxes still counts as "right there"
      const nearWalked = (inSet, lim) => {
        lim = lim || 120;
        const on = new Uint8Array(n), dW = new Float64Array(n).fill(Infinity), hW = new Heap();
        for(let i = 0; i < E; i++) if(inSet[i]) for(const v of [g.edges[i].a, g.edges[i].b]) if(dW[v]){ dW[v] = 0; hW.push(0, v); }
        while(hW.size){ const [k, v] = hW.pop(); if(k > dW[v]) continue; on[v] = 1; for(const { e, to } of g.adj[v]){ const nd = k + g.edges[e].len; if(nd <= lim && nd < dW[to]){ dW[to] = nd; hW.push(nd, to); } } }
        return on;
      };
      const protect = new Set();
      // budget: 15 % over the flyer count, plus half of what can later come off the far end of a town cut at the count (F)
      const bigMb = S.reduce((a, p) => { const all = p.c.items.reduce((x, it) => x + g.edges[it.i].mb, 0); return all > 0.1 * flyers ? a + p.items.reduce((x, it) => x + g.edges[it.i].mb, 0) : a; }, 0);
      const budget = flyers * 1.15 + 0.5 * bigMb;
      let selLen = 0; for(let i = 0; i < E; i++) if(cur.inSet[i] && g.edges[i].mb) selLen += g.edges[i].len;
      const avgDens = cur.sum / Math.max(1, selLen);   // mailboxes per metre of the streets chosen so far
      for(let guard = 0; guard < 200; guard++){
        let best = null;
        const onWay = nearWalked(cur.inSet);
        for(const c of cl){
          if(protect.has(c)) continue;
          let any = false, restMb = 0, restLen = 0, allMb = 0;
          for(const it of c.items){ const e = g.edges[it.i]; allMb += e.mb; if(cur.inSet[it.i] || onWay[e.a] || onWay[e.b]) any = true; if(!cur.inSet[it.i]){ restMb += e.mb; restLen += e.len; } }
          if(!any || !restMb || allMb > 0.1 * flyers || restMb / (restLen + 1) < 0.5 * avgDens) continue;   // touched, small, not much thinner than the rest
          // only what is really right there: no new way out to it (its own streets, nothing more)
          const p0 = S.find(x => x.c === c), S2 = p0 ? S.map(x => x === p0 ? { c, items:c.items.slice() } : x) : S.concat([{ c, items:c.items.slice() }]);
          const b = build(S2), extra = b.walk - cur.walk;   // walking only: the village is right there, its distance does not matter
          if(extra > 1.35 * restLen * 1.3 + 200 + TRANSIT_W * 150){ protect.add(c); continue; }   // up to 150 m of way to it
          const r = restMb / Math.max(1, extra);
          if(!best || r > best.r) best = { c, r, restMb, S2, b };
        }
        if(!best) break;
        if(cur.sum + best.restMb > budget){ protect.add(best.c); continue; }   // too big for the budget: skip it, try the next
        S = best.S2; cur = best.b; protect.add(best.c);
      }
      // E. trim again, farthest first (the area stays compact around the start): whole clusters only, never a completed one,
      //    never one left half walked, never one the route passes within 250 m
      for(let guard = 0; guard < 400 && cur.sum > flyers && S.length > 1; guard++){
        let done = false;
        for(const k of S.map((p, k) => k).sort((x, y) => tree.d[S[y].c.entry] - tree.d[S[x].c.entry])){
          if(protect.has(S[k].c)) continue;
          const b = build(S.filter((_, j) => j !== k)); if(b.sum < flyers) continue;
          if(S[k].c.items.some(it => b.inSet[it.i])) continue;
          const nw = nearWalked(b.inSet, 250); if(S[k].c.items.some(it => nw[g.edges[it.i].a] || nw[g.edges[it.i].b])) continue;
          S.splice(k, 1); cur = b; done = true; break;
        }
        if(!done) break;
      }
      // F. still too many mailboxes: take the surplus off the far end of a town that is cut off at the flyer count anyway
      if(cur.sum > flyers * 1.01){
        const bigC = p => !protect.has(p.c) && p.c.items.reduce((a, it) => a + g.edges[it.i].mb, 0) > 0.1 * flyers;
        const far = []; S.forEach(p => { if(bigC(p)) for(const it of p.items) far.push(it); });
        far.sort((x, y) => y.k - x.k);
        const drop = new Set(); let extra = cur.sum - flyers;
        for(const it of far){ const mb = g.edges[it.i].mb; if(mb && mb <= extra){ drop.add(it); extra -= mb; } if(extra < 0.005 * flyers) break; }
        if(drop.size){
          const S2 = S.map(p => ({ c:p.c, items:p.items.filter(it => !drop.has(it)) })).filter(p => p.items.length), b = build(S2);
          if(b.sum >= flyers){ S = S2; cur = b; }
        }
      }
    }
    const ids = []; let reach = 0; sum = 0;
    for(let i = 0; i < E; i++) if(cur.inSet[i]){ ids.push(i); sum += g.edges[i].mb; const k = (tree.d[g.edges[i].a] + tree.d[g.edges[i].b]) / 2; if(k > reach) reach = k; }
    return { ids, mailboxes:sum, skipped_mb:skipped, reach_m:Math.round(reach) };
  }
  const MAX_R = 6000, MUST_MAX_R = 10000;   // a mandatory area may make the loaded square larger than usual
  // radius for the next map-data round. The loaded square must be clearly larger than the area we actually use,
  // otherwise villages near the edge are cut off and look poorer than they are.
  function nextRadius(g, flyers){
    const need = flyers * 1.15, have = Math.max(1, g.usable != null ? g.usable : (g.mailboxes || 1));
    let r = g.radius * 1.3;
    if(have < need) r = Math.max(r, g.radius * Math.sqrt(need / have) * 1.1);
    if(g.reach) r = Math.max(r, g.reach / 0.6);
    return Math.min(MAX_R, Math.round(r));
  }
  function hull(points){
    const p = points.map(q => [q[1], q[0]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if(p.length < 3) return points.slice();
    const cr = (o, a, b) => (a[0]-o[0]) * (b[1]-o[1]) - (a[1]-o[1]) * (b[0]-o[0]);
    const lo = [], up = [];
    for(const q of p){ while(lo.length >= 2 && cr(lo[lo.length-2], lo[lo.length-1], q) <= 0) lo.pop(); lo.push(q); }
    for(let i = p.length - 1; i >= 0; i--){ const q = p[i]; while(up.length >= 2 && cr(up[up.length-2], up[up.length-1], q) <= 0) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1)).map(q => [q[1], q[0]]);
  }
  /* counts estimated delivered flyers: a mailbox counts when the walker passed within `tol` metres */
  function makeBoxCounter(boxes, tol){
    tol = tol || 30;
    const done = new Uint8Array(boxes.length); let count = 0;
    const total = boxes.reduce((s, b) => s + b[2], 0);
    const cell = 0.0004, grid = new Map(), key = (la, lo) => Math.floor(la / cell) + ':' + Math.floor(lo / cell);
    boxes.forEach((b, i) => { const k = key(b[0], b[1]); if(!grid.has(k)) grid.set(k, []); grid.get(k).push(i); });
    function visit(lat, lng){
      const cy = Math.floor(lat / cell), cx = Math.floor(lng / cell);
      for(let dy = -1; dy <= 1; dy++) for(let dx = -1; dx <= 1; dx++){
        const list = grid.get((cy + dy) + ':' + (cx + dx)); if(!list) continue;
        for(const i of list) if(!done[i] && dist([lat, lng], boxes[i]) <= tol){ done[i] = 1; count += boxes[i][2]; }
      }
      return count;
    }
    function visitLine(a, b){ const d = dist(a, b), n = Math.min(50, Math.max(1, Math.ceil(d / 15))); for(let k = 0; k <= n; k++) visit(a[0] + (b[0]-a[0]) * k/n, a[1] + (b[1]-a[1]) * k/n); return count; }
    return { visit, visitLine, visitAll(pts){ for(let i = 0; i < pts.length; i++){ if(i && dist(pts[i-1], pts[i]) < 120) visitLine(pts[i-1], pts[i]); else visit(pts[i][0], pts[i][1]); } return count; }, count:() => count, total };
  }

  function suggestWorkers(totalMinutes, hoursPerDay, days){ return Math.max(1, Math.ceil(totalMinutes / 60 / ((hoursPerDay || WORK_HOURS) * (days || 1)))); }
  function hours(meters){ return meters / 1000 / WALK_KMH; }
  function routeMinutes(len, mb){ return Math.round(len / 1000 / WALK_KMH * 60 + (mb || 0) * BOX_SEC / 60); }
  /* does the plan fit the available time? */
  function capacity(routes, flyers, opt){
    const hpd = (opt && opt.hoursPerDay) || WORK_HOURS, days = (opt && opt.days) || 2, limit = hpd * days;
    const hr = r => r.minutes != null ? r.minutes / 60 : hours(r.length_m);
    const totalH = routes.reduce((s, r) => s + hr(r), 0), over = routes.filter(r => hr(r) > limit).map(r => r.idx);
    const cap = routes.length * limit, ok = totalH <= cap && !over.length;
    const slowest = routes.reduce((m, r) => Math.max(m, hr(r)), 0);
    return { ok, limit, totalH, slowest, over, suggestedFlyers: ok ? flyers : Math.max(0, Math.floor(flyers * Math.min(1, limit / (slowest || limit)) / 50) * 50) };
  }

  /* ---------- orchestration ---------- */
  async function loadZone(poly, fetchImpl){
    const osm = await fetchStreets(poly, fetchImpl);
    const g = largestComponent(buildGraph(osm, poly));
    g.street_m = Math.round(g.edges.reduce((s, e) => s + e.len, 0));
    return g;
  }
  // main entry: streets + buildings around the start; grows the radius until enough mailboxes exist.
  // opt: { cache, radius, must, tiles (Map kept between calls), progress(done, total), stale(), fetchImpl }
  async function loadForFlyers(start, flyers, opt){
    opt = opt || {}; const mr = Math.min(MUST_MAX_R, mustRadius(start, opt.must)); let r = Math.max(Math.min(MAX_R, opt.radius || 1500), mr), last = null;
    const store = opt.tiles || new Map();
    for(let round = 0; round < 6; round++){
      const keys = tilesFor(start, r);
      await fetchTiles(keys, store, opt);
      const m = mergeTiles(keys.map(k => store.get(k)));
      const g = largestComponent(buildGraph(m.osm, null));
      attachBuildings(g, m.buildings);
      g.radius = r; g.street_m = Math.round(g.edges.reduce((s, e) => s + e.len, 0)); last = g;
      g.usable = selectForFlyers(g, start, 1e9).mailboxes;   // what is really worth walking (poor spurs excluded)
      g.reach = selectWithMust(g, start, flyers, opt.must).reach_m;
      if((g.usable >= flyers * 1.15 && g.reach <= 0.65 * r) || r >= MAX_R) break;
      r = nextRadius(g, flyers);
    }
    return last;
  }
  // Cuts the angular ring of selected street pieces into n arcs of about equal estimated time (walk + way out and back + mailboxes).
  // Binary search on the time limit with a greedy sweep, repeated from several starting angles.
  function balancedSplits(g, start, n, ids, tries){
    const cosLat = Math.cos(start[0] * RAD), root = nearestNode(g, start, g.pts.map((_, i) => i)), dd = sssp(g, root).d;
    const items = ids.map(i => {
      const e = g.edges[i], m = e.coords[Math.floor(e.coords.length / 2)];
      return { i, len:e.len, mb:e.mb, d:Math.min(dd[e.a], dd[e.b]), ang:Math.atan2(m[0] - start[0], (m[1] - start[1]) * cosLat) };
    }).sort((x, y) => x.ang - y.ang);
    const M = items.length, out = [];
    if(M < n) return out;
    const cost = (len, mb, far) => (1.35 * len + 2 * far) / 1000 / WALK_KMH * 60 + mb * BOX_SEC / 60;
    for(let t = 0; t < tries; t++){
      const off = Math.floor(t * M / tries), ring = items.slice(off).concat(items.slice(0, off));
      const cut = T => {   // greedy: how many arcs are needed with limit T; returns cut indices or null
        const cuts = []; let len = 0, mb = 0, far = 0, from = 0;
        for(let k = 0; k < M; k++){
          const x = ring[k], nl = len + x.len, nm = mb + x.mb, nf = Math.max(far, x.d);
          if(k > from && cost(nl, nm, nf) > T){ cuts.push(k); if(cuts.length >= n) return null; from = k; len = x.len; mb = x.mb; far = x.d; }
          else { len = nl; mb = nm; far = nf; }
        }
        return cuts;
      };
      let lo = 0, hi = cost(items.reduce((a, x) => a + x.len, 0), items.reduce((a, x) => a + x.mb, 0), Math.max(...items.map(x => x.d)));
      let best = cut(hi);
      for(let it = 0; it < 28; it++){ const mid = (lo + hi) / 2, c = cut(mid); if(c){ best = c; hi = mid; } else lo = mid; }
      if(!best) continue;
      const bounds = [0, ...best, M], parts = [];
      for(let k = 0; k + 1 < bounds.length; k++) parts.push(ring.slice(bounds[k], bounds[k + 1]).map(x => x.i));
      while(parts.length < n){   // fewer arcs than workers: split the biggest one in two
        let bi = 0; parts.forEach((p, i) => { if(p.length > parts[bi].length) bi = i; });
        const p = parts[bi]; if(p.length < 2) break; parts.splice(bi, 1, p.slice(0, p.length >> 1), p.slice(p.length >> 1));
      }
      if(parts.length === n) out.push(parts);
    }
    return out;
  }
  /* ---------- mandatory areas: drawn by the admin, every street with mailboxes inside must be walked ---------- */
  function mustEdges(g, polys){
    const out = [];
    if(!polys || !polys.length) return out;
    g.edges.forEach((e, i) => { if(!e.mb) return; const m = e.coords[Math.floor(e.coords.length / 2)]; if(polys.some(P => P.length > 2 && inPoly(m, P))) out.push(i); });
    return out;
  }
  // radius (m) the loaded square needs so that all mandatory areas lie inside it
  function mustRadius(start, polys){
    let r = 0; for(const P of polys || []) for(const q of P) r = Math.max(r, dist(start, q));
    return r ? r + 400 : 0;
  }
  // the usual selection for the remaining flyers plus all mandatory streets (they count towards the flyers)
  function selectWithMust(g, start, flyers, polys){
    const must = mustEdges(g, polys);
    if(!must.length) return { ...selectForFlyers(g, start, flyers), must_mb:0, must_ids:[] };
    const mustSet = new Set(must), mustMb = must.reduce((a, i) => a + g.edges[i].mb, 0);
    let rest = Math.max(0, flyers - mustMb), sel = rest > 0 ? selectForFlyers(g, start, rest) : { ids:[], mailboxes:0, reach_m:0 };
    // streets chosen anyway that lie in a mandatory area would be counted twice: ask once more for that much
    const overlap = sel.ids.reduce((a, i) => a + (mustSet.has(i) ? g.edges[i].mb : 0), 0);
    if(rest > 0 && overlap > 0) sel = selectForFlyers(g, start, rest + overlap);
    const ids = [...new Set([...sel.ids, ...must])], mailboxes = ids.reduce((a, i) => a + g.edges[i].mb, 0);
    const root = nearestNode(g, start, g.pts.map((p, i) => i).filter(i => g.adj[i].length)), d = sssp(g, root).d;
    const reach = Math.max(sel.reach_m || 0, ...must.map(i => Math.max(d[g.edges[i].a], d[g.edges[i].b])).filter(isFinite));
    return { ...sel, ids, mailboxes, reach_m:Math.round(reach), must_mb:mustMb, must_ids:must };
  }

  function planFlyers(g, start, flyers, n, opt){
    opt = opt || {};
    const sel = selectWithMust(g, start, flyers, opt.must);
    const total = sel.ids.reduce((s, i) => s + g.edges[i].len, 0), mbTotal = sel.mailboxes || 1;
    const w = e => 0.5 * e.len / (total || 1) + 0.5 * e.mb / mbTotal;
    const N = n || 1, build = (parts, rootNode) => parts.map((part, k) => {
      const r = planPart(g, part, start, rootNode);
      const boxes = []; let mb = 0; for(const i of part){ mb += g.edges[i].mb; for(const b of g.edges[i].boxes) boxes.push(b); }
      return { idx:k, ...r, part, mailboxes:mb, boxes, minutes:routeMinutes(r.length_m, mb) };
    });
    // Equal slices of the street length give unequal days: the walk to far villages and back is not in the weights.
    // So several candidate splits are built (equal slices + time-balanced cuts from different starting angles), each is
    // every split is cleaned up so each worker gets ONE connected area (no detached streets inside a colleague's area), evened out
    // along the borders, routed for real, and scored: the slowest worker first, total walking second.
    const score = rs => { const m = rs.map(r => r.minutes), mx = Math.max(...m), sum = m.reduce((a, b) => a + b, 0); return mx + 0.3 * sum / m.length + 0.01 * (mx - Math.min(...m)); };
    let bestParts = null, routes = null, builds = 0;
    const tryParts = parts => { const rs = build(parts); builds++; if(!routes || score(rs) < score(routes)){ routes = rs; bestParts = parts; return true; } return false; };
    // every candidate with its stray bits handed over; the three best are also evened out along the borders
    const cands = [partition(g, start, N, sel.ids, w), ...(N > 1 ? balancedSplits(g, start, N, sel.ids, 8) : [])];
    const tried = cands.map(raw => { const t = tidyParts(g, raw), rs = build(t); builds++; if(!routes || score(rs) < score(routes)){ routes = rs; bestParts = t; } return { t, sc:score(rs) }; });
    if(N > 1) for(const { t } of tried.sort((a, b) => a.sc - b.sc).slice(0, 3)) tryParts(balanceParts(g, t));
    if(N > 1){
      // fine tuning with the real routes: the slowest worker hands streets at the border to a faster neighbour
      // (a strip grown from the shared border, or the last pieces of its sector), stray bits are cleaned up again
      for(let it = 0; it < 10 && builds < 30; it++){
        const m = routes.map(r => r.minutes), own = owners(g, bestParts), P = m.indexOf(Math.max(...m));
        let better = false;
        for(const Q of [...neighbours(g, bestParts, P, own)].filter(q => m[q] < m[P] * 0.95).sort((a, b) => m[a] - m[b]).slice(0, 2)){
          for(const f of [0.5, 0.25]){ const parts = shiftStrip(g, bestParts, P, Q, (m[P] - m[Q]) * f, own); if(parts && tryParts(parts)){ better = true; break; } }
          if(better) break;
        }
        if(!better){   // the old way: neighbours in the ring of sectors swap their border pieces
          const parts = bestParts.map(p => p.slice());
          for(let k = 0; k < N; k++){
            const j = (k + 1) % N, a = m[k], b = m[j];
            if(a > b * 1.08 && parts[k].length > 1){ const c = Math.max(1, Math.min(parts[k].length - 1, Math.round(parts[k].length * Math.min(0.35, (a - b) / (2 * a))))); parts[j] = parts[k].splice(parts[k].length - c, c).concat(parts[j]); }
            else if(b > a * 1.08 && parts[j].length > 1){ const c = Math.max(1, Math.min(parts[j].length - 1, Math.round(parts[j].length * Math.min(0.35, (b - a) / (2 * b))))); parts[k] = parts[k].concat(parts[j].splice(0, c)); }
          }
          better = tryParts(tidyParts(g, parts));
        }
        if(!better) break;
      }
    }
    // one worker needing more than a working day gets separate loops per day, all starting and ending at the same junction
    const hpd = opt.hoursPerDay || WORK_HOURS, maxDays = opt.days || 1;
    const dayInfo = r => ({ length_m:r.length_m, street_m:r.street_m, minutes:r.minutes, mailboxes:r.mailboxes });
    const withDays = (part, k, base) => {
      const nd = Math.min(maxDays, Math.max(1, Math.ceil(base.minutes / 60 / hpd)));
      if(nd < 2 || part.length < nd) return { ...base, days:[{ i0:0, i1:Math.max(0, base.path.length - 1), ...dayInfo(base) }] };
      const cands = [partition(g, start, nd, part, w), ...balancedSplits(g, start, nd, part, 4)].flatMap(ps => { const t = tidyParts(g, ps); return [ps, t, balanceParts(g, t)]; });
      let best = null;
      for(const ps of cands){
        const rs = build(ps.filter(x => x.length), base.root);
        if(rs.length < 2) continue;
        const mx = Math.max(...rs.map(r => r.minutes)), mn = Math.min(...rs.map(r => r.minutes));
        const sc = mx + 0.3 * rs.reduce((a, r) => a + r.minutes, 0) / rs.length + 0.01 * (mx - mn);
        if(!best || sc < best.sc){ best = { rs, sc }; }
      }
      if(!best) return { ...base, days:[{ i0:0, i1:Math.max(0, base.path.length - 1), ...dayInfo(base) }] };
      const path = [], steps = [], boxes = [], days = [];
      for(const d of best.rs){
        const off = path.length ? path.length - 1 : 0, i0 = off;
        for(const q of (path.length ? d.path.slice(1) : d.path)) path.push(q);
        for(const st of d.steps) steps.push([off + st[0], st[1], st[2]]);
        for(const b of d.boxes) boxes.push(b);
        days.push({ i0, i1:path.length - 1, ...dayInfo(d) });
      }
      const sum = k => days.reduce((a, d) => a + d[k], 0);
      return { ...base, path, steps, boxes, days, length_m:sum('length_m'), street_m:sum('street_m'), minutes:sum('minutes'), mailboxes:sum('mailboxes') };
    };
    if(maxDays > 1) routes = bestParts.map((part, k) => withDays(part, k, routes[k]));
    else routes = routes.map(r => ({ ...r, days:[{ i0:0, i1:Math.max(0, r.path.length - 1), length_m:r.length_m, street_m:r.street_m, minutes:r.minutes, mailboxes:r.mailboxes }] }));
    const pts = []; for(const i of sel.ids) for(const c of g.edges[i].coords) pts.push(c);
    return { routes, mailboxes:sel.mailboxes, must_mb:sel.must_mb || 0, reach_m:sel.reach_m, zone:hull(pts), capacity:capacity(routes, flyers) };
  }
  function planRoutes(g, start, n){
    return partition(g, start, n).map((part, k) => ({ idx:k, ...planPart(g, part, start) }));
  }

  const api = { tilesFor, qTile, compactTile, mergeTiles, TILE_V, MUST_MAX_R, mustEdges, mustRadius, selectWithMust, COLORS, densifyPath, makeTracker, makeBoxCounter, fetchStreets, fetchStreetsAround, fetchBuildings, parseBuildings, estimateMailboxes, attachBuildings, selectForFlyers, nextRadius, MAX_R, planFlyers, loadForFlyers, capacity, hull, buildGraph, largestComponent, partition, planPart, planRoutes, loadZone, suggestWorkers, hours, routeMinutes, dist, inPoly, lineLen, WORK_HOURS, WALK_KMH, BOX_SEC };
  if(typeof module !== 'undefined' && module.exports) module.exports = api; else root.Planner = api;
})(typeof window !== 'undefined' ? window : globalThis);
