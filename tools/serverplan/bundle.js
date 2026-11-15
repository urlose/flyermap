(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // ../admin/planner.js
  var require_planner = __commonJS({
    "../admin/planner.js"(exports, module) {
      (function(root) {
        "use strict";
        const R = 6371e3, RAD = Math.PI / 180;
        const NO_WAY = "motorway|motorway_link|trunk|trunk_link|footway|cycleway|path|steps|bridleway|construction|proposed|raceway|corridor|elevator|platform|bus_stop|track|bus_guideway|escape|rest_area|services";
        const OVERPASS = ["https://overpass.openstreetmap.fr/api/interpreter", "https://overpass-api.de/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];
        const WORK_HOURS = 7;
        const WALK_KMH = 3.2;
        const TRANSIT_W = 3;
        const DIST_MB = 8;
        const BOX_SEC = 5;
        let PACE_M30 = 0;
        function setPace(m30) {
          PACE_M30 = m30 > 0 ? +m30 : 0;
        }
        const walkMin = (len, mb) => (PACE_M30 ? len / PACE_M30 * 30 : len / 1e3 / WALK_KMH * 60) + (mb || 0) * BOX_SEC / 60;
        function dist(a, b) {
          const x = Math.sin((b[0] - a[0]) * RAD / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin((b[1] - a[1]) * RAD / 2) ** 2;
          return 2 * R * Math.asin(Math.sqrt(x));
        }
        function inPoly(p, poly) {
          let inside = false;
          for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const [yi, xi] = poly[i], [yj, xj] = poly[j];
            if (yi > p[0] !== yj > p[0] && p[1] < (xj - xi) * (p[0] - yi) / (yj - yi) + xi) inside = !inside;
          }
          return inside;
        }
        function lineLen(c) {
          let s = 0;
          for (let i = 1; i < c.length; i++) s += dist(c[i - 1], c[i]);
          return s;
        }
        async function overpass(q, fetchImpl, timeoutMs, stale) {
          const t0 = Date.now();
          let wait = 4e3;
          for (; ; ) {
            try {
              return await overpassRound(q, fetchImpl, timeoutMs);
            } catch (e) {
              if (Date.now() - t0 > 24e4 || stale && stale()) throw e;
              await new Promise((r) => setTimeout(r, wait));
              wait = Math.min(3e4, wait * 2);
              if (stale && stale()) throw new Error("stale");
            }
          }
        }
        function overpassRound(q, fetchImpl, timeoutMs) {
          const f = fetchImpl || fetch, total = timeoutMs || 6e4;
          return new Promise((resolve, reject) => {
            let done = false, failed = 0, next = 0, lastErr;
            const ctrls = [], timers = [];
            const finish = (fn, v) => {
              if (done) return;
              done = true;
              timers.forEach(clearTimeout);
              ctrls.forEach((c) => {
                try {
                  c.abort();
                } catch {
                }
              });
              fn(v);
            };
            const launch = () => {
              if (done || next >= OVERPASS.length) return;
              const url = OVERPASS[next++];
              if (next < OVERPASS.length) timers.push(setTimeout(launch, 1e4));
              const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
              if (ctrl) ctrls.push(ctrl);
              const tm = ctrl ? setTimeout(() => ctrl.abort(), total) : null;
              if (tm) timers.push(tm);
              (async () => {
                try {
                  const r = await f(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q), signal: ctrl && ctrl.signal });
                  if (!r.ok) throw new Error("overpass " + r.status);
                  const j = await r.json();
                  if (j && j.remark && /runtime error|out of memory|timed out/i.test(j.remark)) throw new Error("overpass " + j.remark);
                  finish(resolve, j);
                } catch (e) {
                  lastErr = e;
                  failed++;
                  if (failed >= OVERPASS.length) finish(reject, lastErr || new Error("overpass"));
                  else launch();
                }
              })();
            };
            launch();
          });
        }
        const HW_FILTER = `["highway"]["highway"!~"^(${NO_WAY})$"]["service"!~"^(parking_aisle|driveway|drive-through|emergency_access)$"]["access"!~"^(private|no)$"]["foot"!~"^(no|private)$"]["motorroad"!="yes"]`;
        async function fetchStreets(poly, fetchImpl) {
          const ps = poly.map((p) => p[0].toFixed(6) + " " + p[1].toFixed(6)).join(" ");
          return overpass(`[out:json][timeout:110];way${HW_FILTER}(poly:"${ps}");out body;>;out skel qt;`, fetchImpl, 11e4);
        }
        const rc = (c) => [Math.round(c[0] * 1e3) / 1e3, Math.round(c[1] * 1e3) / 1e3];
        const bbox = (c, r) => {
          const k = rc(c), dLat = r / 111320, dLng = r / (111320 * Math.cos(k[0] * RAD));
          return [k[0] - dLat, k[1] - dLng, k[0] + dLat, k[1] + dLng].map((v) => v.toFixed(5)).join(",");
        };
        const qStreets = (c, r) => `[out:json][timeout:110];way${HW_FILTER}(${bbox(c, r)});out body;>;out skel qt;`;
        const qBuildings = (c, r) => {
          const bb = bbox(c, r);
          return `[out:json][timeout:110];way["building"~"^(${HOUSE_B})$"](${bb})->.h;way["building"]["building"!~"^(${HOUSE_B}|${NO_B})$"](${bb})->.o;.h out center tags;.o out geom tags;`;
        };
        async function fetchStreetsAround(c, r, fetchImpl) {
          return overpass(qStreets(c, r), fetchImpl, 11e4);
        }
        async function fetchBuildings(c, r, fetchImpl) {
          return overpass(qBuildings(c, r), fetchImpl, 11e4);
        }
        const TILE_LAT = 0.03, TILE_LNG = 0.045, TILE_V = "fm3";
        const tileKey = (i, j) => i + ":" + j;
        function tilesFor(c, r) {
          const dLat = r / 111320, dLng = r / (111320 * Math.cos(c[0] * RAD)), out = [];
          const i0 = Math.floor((c[0] - dLat) / TILE_LAT), i1 = Math.floor((c[0] + dLat) / TILE_LAT);
          const j0 = Math.floor((c[1] - dLng) / TILE_LNG), j1 = Math.floor((c[1] + dLng) / TILE_LNG);
          for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) out.push(tileKey(i, j));
          const mid = (k) => {
            const [i, j] = k.split(":").map(Number);
            return Math.hypot((i + 0.5) * TILE_LAT - c[0], ((j + 0.5) * TILE_LNG - c[1]) * Math.cos(c[0] * RAD));
          };
          return out.sort((a, b) => mid(a) - mid(b));
        }
        function qTile(k) {
          const [i, j] = k.split(":").map(Number), bb = [i * TILE_LAT, j * TILE_LNG, (i + 1) * TILE_LAT, (j + 1) * TILE_LNG].map((v) => v.toFixed(4)).join(",");
          return `[out:json][timeout:90];way${HW_FILTER}(${bb});out body qt;>;out skel qt;way["building"~"^(${HOUSE_B})$"](${bb});out center tags qt;way["building"]["building"!~"^(${HOUSE_B}|${NO_B})$"](${bb});out geom tags qt;/*${TILE_V}*/`;
        }
        const r6 = (v) => Math.round(v * 1e6) / 1e6;
        function fastNoWalk(g) {
          if (!/^(primary|secondary|tertiary)(_link)?$/.test(g.highway || "")) return false;
          const v = String(g.maxspeed || "").trim().toLowerCase(), sp = /^(de:rural|de:motorway|none)$/.test(v) ? 100 : /^(de:urban|walk|de:living_street)$/.test(v) ? 50 : parseInt(v, 10);
          if (!(sp >= 70)) return false;
          return !["sidewalk", "sidewalk:both", "sidewalk:left", "sidewalk:right"].some((k) => /^(yes|both|left|right|separate)$/.test(g[k] || ""));
        }
        function compactTile(osm) {
          const n = [], w = [], b = [];
          for (const e of osm && osm.elements || []) {
            if (e.type === "node") n.push(e.id, r6(e.lat), r6(e.lon));
            else if (e.type === "way" && e.nodes && e.tags && e.tags.highway) {
              if (!fastNoWalk(e.tags)) w.push([e.id, e.tags.name || e.tags.ref || "", e.nodes]);
            } else if (e.type === "way") {
              const x = parseBuildings({ elements: [e] })[0];
              if (x) b.push([e.id, r6(x.lat), r6(x.lng), x.n]);
            }
          }
          return { v: TILE_V, elements: [], n, w, b };
        }
        function decodeTile(t) {
          if (!t || t.v !== "fm4") return t;
          const n = [], w = [], b = [];
          let id = 0, la = 0, lo = 0;
          for (let i = 0; i < t.n.length; i += 3) {
            id += t.n[i];
            la += t.n[i + 1];
            lo += t.n[i + 2];
            n.push(id, la / 1e6, lo / 1e6);
          }
          let wid = 0;
          for (const x of t.w) {
            wid += x[0];
            let nid = 0;
            w.push([wid, x[1], x[2].map((d) => nid += d)]);
          }
          la = 0;
          lo = 0;
          for (let i = 0; i < t.b.length; i += 3) {
            la += t.b[i];
            lo += t.b[i + 1];
            b.push([0, la / 1e6, lo / 1e6, t.b[i + 2]]);
          }
          return { v: "fm4", elements: [], n, w, b };
        }
        function mergeTiles(list) {
          const nodes = /* @__PURE__ */ new Map(), ways = /* @__PURE__ */ new Map(), bs = /* @__PURE__ */ new Map();
          for (const t of list) {
            if (!t) continue;
            for (let i = 0; i < t.n.length; i += 3) nodes.set(t.n[i], [t.n[i + 1], t.n[i + 2]]);
            for (const x of t.w) ways.set(x[0], x);
            for (const x of t.b) bs.set(x[1] + "," + x[2], x);
          }
          const elements = [];
          for (const [id, p] of nodes) elements.push({ type: "node", id, lat: p[0], lon: p[1] });
          for (const [id, x] of ways) elements.push({ type: "way", id, nodes: x[2], tags: x[1] ? { name: x[1] } : {} });
          return { osm: { elements }, buildings: [...bs.values()].map((x) => ({ lat: x[1], lng: x[2], n: x[3] })) };
        }
        const TILES_URL = "https://xobrvfkwqessbkdwiavu.supabase.co/storage/v1/object/public/tiles/v4/";
        let tileStamp = "";
        function setTileStamp(s) {
          tileStamp = s ? "?b=" + encodeURIComponent(s) : "";
        }
        async function fetchOwnTile(base, k, f) {
          const r = await f(base + k.replace(":", "_") + ".json.gz" + tileStamp);
          if (!r.ok) return null;
          const buf = new Uint8Array(await r.arrayBuffer());
          let text;
          if (buf[0] === 31 && buf[1] === 139) {
            if (typeof DecompressionStream === "undefined") return null;
            text = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
          } else text = new TextDecoder().decode(buf);
          const t = decodeTile(JSON.parse(text));
          return t && t.v === "fm4" && Array.isArray(t.n) ? t : null;
        }
        async function fetchTiles(keys, store, opt) {
          const miss = keys.filter((k) => !store.has(k)), total = keys.length;
          const report = () => opt.progress && opt.progress(keys.filter((k) => store.has(k)).length, total);
          if (!miss.length) return;
          const base = opt.tilesUrl === void 0 ? opt.fetchImpl ? null : TILES_URL : opt.tilesUrl, tf = opt.tileFetch || (typeof fetch !== "undefined" ? fetch : null);
          if (base && tf) {
            let next2 = 0;
            const lane2 = async () => {
              while (next2 < miss.length) {
                const k = miss[next2++];
                try {
                  const t = await fetchOwnTile(base, k, tf);
                  if (t) {
                    store.set(k, t);
                    report();
                  }
                } catch (e) {
                }
              }
            };
            await Promise.all([lane2(), lane2(), lane2(), lane2()]);
            if (miss.every((k) => store.has(k))) return;
          }
          if (opt.cache) {
            const left = miss.filter((k) => !store.has(k)), chunks = [];
            for (let i = 0; i < left.length; i += 3) chunks.push(left.slice(i, i + 3));
            await Promise.all(chunks.map(async (ch) => {
              try {
                const hit = await opt.cache.get(ch.map(qTile));
                (hit || []).forEach((x, i) => {
                  if (x && x.v === TILE_V && Array.isArray(x.n)) store.set(ch[i], x);
                });
              } catch (e) {
              }
            }));
          }
          const todo = miss.filter((k) => !store.has(k));
          report();
          let next = 0;
          const lane = async () => {
            while (next < todo.length) {
              if (opt.stale && opt.stale()) throw new Error("stale");
              const k = todo[next++], q = qTile(k);
              const t = compactTile(await overpass(q, opt.fetchImpl, 9e4, opt.stale));
              store.set(k, t);
              report();
              if (opt.cache) Promise.resolve(opt.cache.put([{ q, payload: t }])).catch(() => {
              });
            }
          };
          await Promise.all([lane(), lane()]);
        }
        function buildGraph(osm, poly) {
          const nodes = /* @__PURE__ */ new Map();
          for (const e of osm.elements) if (e.type === "node") nodes.set(e.id, [e.lat, e.lon]);
          const segs = [], deg = /* @__PURE__ */ new Map(), adjSeg = /* @__PURE__ */ new Map();
          const addAdj = (n, i) => {
            if (!adjSeg.has(n)) adjSeg.set(n, []);
            adjSeg.get(n).push(i);
            deg.set(n, (deg.get(n) || 0) + 1);
          };
          for (const w of osm.elements) {
            if (w.type !== "way" || !w.nodes) continue;
            const name = w.tags && (w.tags.name || w.tags.ref) || "";
            for (let i = 1; i < w.nodes.length; i++) {
              const u = w.nodes[i - 1], v = w.nodes[i], a = nodes.get(u), b = nodes.get(v);
              if (!a || !b || u === v) continue;
              if (poly && !inPoly([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], poly)) continue;
              const id = segs.length;
              segs.push({ u, v, name, used: false });
              addAdj(u, id);
              addAdj(v, id);
            }
          }
          const jIndex = /* @__PURE__ */ new Map(), pts = [];
          const jid = (n) => {
            if (!jIndex.has(n)) {
              jIndex.set(n, pts.length);
              pts.push(nodes.get(n));
            }
            return jIndex.get(n);
          };
          const edges = [];
          const walk = (start, firstSeg) => {
            const coords = [nodes.get(start)];
            let cur = start, sid = firstSeg, name = segs[firstSeg].name;
            while (true) {
              const s = segs[sid];
              s.used = true;
              const nxt = s.u === cur ? s.v : s.u;
              coords.push(nodes.get(nxt));
              if (!name && s.name) name = s.name;
              cur = nxt;
              if (deg.get(cur) !== 2 || cur === start) break;
              const ns = adjSeg.get(cur).find((i) => !segs[i].used);
              if (ns === void 0) break;
              sid = ns;
            }
            if (cur === start && coords.length < 3) return;
            edges.push({ a: jid(start), b: jid(cur), coords, len: lineLen(coords), name });
          };
          for (const [n, d] of deg) if (d !== 2) {
            for (const sid of adjSeg.get(n)) if (!segs[sid].used) walk(n, sid);
          }
          for (let i = 0; i < segs.length; i++) if (!segs[i].used) walk(segs[i].u, i);
          return finishGraph(pts, edges);
        }
        function finishGraph(pts, edges) {
          const adj = pts.map(() => []);
          edges.forEach((e, i) => {
            adj[e.a].push({ e: i, to: e.b });
            if (e.a !== e.b) adj[e.b].push({ e: i, to: e.a });
          });
          return { pts, edges, adj };
        }
        function largestComponent(g, near) {
          const comp = new Array(g.pts.length).fill(-1);
          let c = 0;
          const len = [];
          for (let s = 0; s < g.pts.length; s++) {
            if (comp[s] !== -1 || !g.adj[s].length) continue;
            const st = [s];
            comp[s] = c;
            len[c] = 0;
            while (st.length) {
              const v = st.pop();
              for (const { e, to } of g.adj[v]) {
                if (comp[to] === -1) {
                  comp[to] = c;
                  st.push(to);
                }
              }
            }
            c++;
          }
          g.edges.forEach((e) => {
            len[comp[e.a]] += e.len;
          });
          let best = 0;
          for (let i = 1; i < c; i++) if (len[i] > len[best]) best = i;
          if (near) {
            let nv = -1, nd = 500;
            for (let v = 0; v < g.pts.length; v++) {
              if (comp[v] < 0) continue;
              const d = dist(near, g.pts[v]);
              if (d < nd) {
                nd = d;
                nv = v;
              }
            }
            if (nv >= 0 && len[comp[nv]] >= 2e3) best = comp[nv];
          }
          const map = /* @__PURE__ */ new Map(), pts = [], edges = [];
          const nid = (v) => {
            if (!map.has(v)) {
              map.set(v, pts.length);
              pts.push(g.pts[v]);
            }
            return map.get(v);
          };
          let dropped = 0;
          for (const e of g.edges) {
            if (comp[e.a] === best) edges.push({ ...e, a: nid(e.a), b: nid(e.b) });
            else dropped += e.len;
          }
          const out = finishGraph(pts, edges);
          out.dropped_m = dropped;
          return out;
        }
        class Heap {
          constructor() {
            this.a = [];
          }
          push(k, v) {
            const a = this.a;
            a.push([k, v]);
            let i = a.length - 1;
            while (i) {
              const p = i - 1 >> 1;
              if (a[p][0] <= a[i][0]) break;
              [a[p], a[i]] = [a[i], a[p]];
              i = p;
            }
          }
          pop() {
            const a = this.a, top = a[0], last = a.pop();
            if (a.length) {
              a[0] = last;
              let i = 0;
              for (; ; ) {
                const l = 2 * i + 1, r = l + 1;
                let m = i;
                if (l < a.length && a[l][0] < a[m][0]) m = l;
                if (r < a.length && a[r][0] < a[m][0]) m = r;
                if (m === i) break;
                [a[m], a[i]] = [a[i], a[m]];
                i = m;
              }
            }
            return top;
          }
          get size() {
            return this.a.length;
          }
        }
        function shortestTo(g, sources, isTarget) {
          const d = new Float64Array(g.pts.length).fill(Infinity), pe = new Int32Array(g.pts.length).fill(-1), pv = new Int32Array(g.pts.length).fill(-1);
          const h = new Heap();
          for (const s of sources) {
            d[s] = 0;
            h.push(0, s);
          }
          while (h.size) {
            const [k, v] = h.pop();
            if (k > d[v]) continue;
            if (isTarget(v)) {
              const path = [];
              let x = v;
              while (pe[x] !== -1) {
                path.push(pe[x]);
                x = pv[x];
              }
              return { target: v, edges: path.reverse() };
            }
            for (const { e, to } of g.adj[v]) {
              const nd = k + g.edges[e].len;
              if (nd < d[to]) {
                d[to] = nd;
                pe[to] = e;
                pv[to] = v;
                h.push(nd, to);
              }
            }
          }
          return null;
        }
        function sssp(g, src) {
          const d = new Float64Array(g.pts.length).fill(Infinity), pe = new Int32Array(g.pts.length).fill(-1), pv = new Int32Array(g.pts.length).fill(-1);
          const h = new Heap();
          d[src] = 0;
          h.push(0, src);
          while (h.size) {
            const [k, v] = h.pop();
            if (k > d[v]) continue;
            for (const { e, to } of g.adj[v]) {
              const nd = k + g.edges[e].len;
              if (nd < d[to]) {
                d[to] = nd;
                pe[to] = e;
                pv[to] = v;
                h.push(nd, to);
              }
            }
          }
          return { d, pe, pv };
        }
        function emptyGap(g, start, poly) {
          const nodes = g.pts.map((_, i) => i).filter((i) => g.adj[i].length);
          if (!nodes.length) return Infinity;
          const target = new Uint8Array(g.pts.length);
          let any = false;
          for (const i of nodes) if (inPoly(g.pts[i], poly)) {
            target[i] = 1;
            any = true;
          }
          if (!any) return Infinity;
          const src = nearestNode(g, start, nodes), d = new Float64Array(g.pts.length).fill(Infinity), h = new Heap();
          d[src] = 0;
          h.push(0, src);
          while (h.size) {
            const [k, v] = h.pop();
            if (k > d[v]) continue;
            if (target[v]) return Math.round(k);
            for (const { e, to } of g.adj[v]) {
              const E3 = g.edges[e], c = (E3.mb || 0) * 60 >= E3.len ? 0 : E3.len, nd = k + c;
              if (nd < d[to]) {
                d[to] = nd;
                h.push(nd, to);
              }
            }
          }
          return Infinity;
        }
        function denseEntry(g, from, zone, need) {
          if (!g || !g.pts || !g.edges || !g.adj) return null;
          const cy = 27e-4, cx = cy / Math.max(0.2, Math.cos((from[0] || 51) * RAD)), key = (i, j) => i + ":" + j, cells = /* @__PURE__ */ new Map();
          for (const e of g.edges) {
            if (!(e.mb > 0)) continue;
            const p = g.pts[e.a];
            if (zone && zone.length > 2 && !inPoly(p, zone)) continue;
            const k = key(Math.floor(p[0] / cy), Math.floor(p[1] / cx));
            cells.set(k, (cells.get(k) || 0) + e.mb);
          }
          const around = (p) => {
            const i = Math.floor(p[0] / cy), j = Math.floor(p[1] / cx);
            let s = 0;
            for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) s += cells.get(key(i + a, j + b)) || 0;
            return s;
          };
          let best = null, dense = null;
          for (let v = 0; v < g.pts.length; v++) {
            if (!g.adj[v] || !g.adj[v].length) continue;
            const p = g.pts[v];
            if (zone && zone.length > 2 && !inPoly(p, zone)) continue;
            const mb = around(p), dd = dist(p, from);
            if (mb >= need && (!best || dd < best.dd)) best = { p, dd };
            if (!dense || mb > dense.mb) dense = { p, mb };
          }
          return (best || dense || {}).p || null;
        }
        function pathFrom(tree, target) {
          const out = [];
          let x = target;
          while (tree.pe[x] !== -1) {
            out.push(tree.pe[x]);
            x = tree.pv[x];
          }
          return out.reverse();
        }
        function partition(g, start, n, ids, weight) {
          const cosLat = Math.cos(start[0] * RAD);
          const list = ids || g.edges.map((e, i) => i), wf = weight || ((e) => e.len);
          const items = list.map((i) => {
            const e = g.edges[i], m = e.coords[Math.floor(e.coords.length / 2)];
            return { i, len: wf(e), ang: Math.atan2(m[0] - start[0], (m[1] - start[1]) * cosLat) };
          }).sort((x, y) => x.ang - y.ang);
          if (n <= 1 || !items.length) return [items.map((x) => x.i)];
          let gapAt = 0, gap = -1;
          for (let k = 0; k < items.length; k++) {
            const a = items[k].ang, b = k + 1 < items.length ? items[k + 1].ang : items[0].ang + 2 * Math.PI;
            if (b - a > gap) {
              gap = b - a;
              gapAt = k + 1;
            }
          }
          const rot = items.slice(gapAt).concat(items.slice(0, gapAt));
          const total = rot.reduce((s, x) => s + x.len, 0), parts = Array.from({ length: n }, () => []);
          let cum = 0;
          for (const x of rot) {
            const p = Math.min(n - 1, Math.floor((cum + x.len / 2) / total * n));
            parts[p].push(x.i);
            cum += x.len;
          }
          return parts;
        }
        function pieces(g, ids) {
          const set = new Set(ids), seen = /* @__PURE__ */ new Set(), out = [];
          for (const i of ids) {
            if (seen.has(i)) continue;
            const st = [i], c = [];
            seen.add(i);
            while (st.length) {
              const e = st.pop();
              c.push(e);
              for (const v of [g.edges[e].a, g.edges[e].b]) for (const { e: f } of g.adj[v]) if (set.has(f) && !seen.has(f)) {
                seen.add(f);
                st.push(f);
              }
            }
            out.push(c);
          }
          return out;
        }
        function owners(g, parts) {
          const own = /* @__PURE__ */ new Map();
          parts.forEach((p, k) => {
            for (const e of p) for (const v of [g.edges[e].a, g.edges[e].b]) {
              let m = own.get(v);
              if (!m) own.set(v, m = /* @__PURE__ */ new Map());
              m.set(k, (m.get(k) || 0) + 1);
            }
          });
          return own;
        }
        function tidyParts(g, parts) {
          parts = parts.map((p) => p.slice());
          const lenOf = (c) => c.reduce((s, e) => s + g.edges[e].len, 0);
          for (let round = 0; round < 20; round++) {
            let moved = false;
            for (let k = 0; k < parts.length; k++) {
              const ps = pieces(g, parts[k]);
              if (ps.length < 2) continue;
              ps.sort((a, b) => lenOf(b) - lenOf(a));
              const own = owners(g, parts), keep = ps[0].slice(), all = lenOf(parts[k]);
              for (const c of ps.slice(1)) {
                if (lenOf(c) > 0.3 * all) {
                  for (const e of c) keep.push(e);
                  continue;
                }
                const touch = /* @__PURE__ */ new Map();
                for (const e of c) for (const v of [g.edges[e].a, g.edges[e].b]) {
                  const m = own.get(v);
                  if (m) {
                    for (const [q, cnt] of m) if (q !== k) touch.set(q, (touch.get(q) || 0) + cnt);
                  }
                }
                if (!touch.size) {
                  for (const e of c) keep.push(e);
                  continue;
                }
                let bq = -1, bc = -1;
                for (const [q, cnt] of touch) if (cnt > bc) {
                  bc = cnt;
                  bq = q;
                }
                for (const e of c) parts[bq].push(e);
                moved = true;
              }
              parts[k] = keep;
            }
            if (!moved) break;
          }
          return parts;
        }
        const edgeMin = (x) => walkMin(1.35 * x.len, x.mb);
        function neighbours(g, parts, P, own) {
          const nb = /* @__PURE__ */ new Set();
          for (const e of parts[P]) for (const v of [g.edges[e].a, g.edges[e].b]) {
            const m = own.get(v);
            if (m) {
              for (const q of m.keys()) if (q !== P) nb.add(q);
            }
          }
          return nb;
        }
        function shiftStrip(g, parts, P, Q, want, own) {
          const inP = new Set(parts[P]), take = /* @__PURE__ */ new Set(), seen = /* @__PURE__ */ new Set(), queue = [];
          for (const e of parts[P]) for (const v of [g.edges[e].a, g.edges[e].b]) {
            const m = own.get(v);
            if (m && m.has(Q) && !seen.has(e)) {
              seen.add(e);
              queue.push(e);
            }
          }
          let got = 0;
          for (let h = 0; h < queue.length && got < want && take.size < inP.size - 1; h++) {
            const e = queue[h];
            take.add(e);
            got += edgeMin(g.edges[e]);
            for (const v of [g.edges[e].a, g.edges[e].b]) for (const { e: f } of g.adj[v]) if (inP.has(f) && !seen.has(f)) {
              seen.add(f);
              queue.push(f);
            }
          }
          if (!take.size) return null;
          const out = parts.map((p) => p.slice());
          out[P] = out[P].filter((e) => !take.has(e));
          for (const e of take) out[Q].push(e);
          return tidyParts(g, out);
        }
        function balanceParts(g, parts, rounds) {
          const cost = (p) => p.reduce((s, e) => s + edgeMin(g.edges[e]), 0);
          parts = tidyParts(g, parts);
          for (let it = 0; it < (rounds || 40); it++) {
            const c = parts.map(cost), mean = c.reduce((a, b) => a + b, 0) / parts.length, own = owners(g, parts);
            let next = null;
            for (const P of c.map((x, k) => k).sort((a, b) => c[b] - c[a])) {
              if (c[P] <= mean * 1.03) break;
              const nb = [...neighbours(g, parts, P, own)].filter((q) => c[q] < c[P]).sort((a, b) => c[a] - c[b]);
              if (!nb.length) continue;
              next = shiftStrip(g, parts, P, nb[0], (c[P] - c[nb[0]]) / 2, own);
              if (next) break;
            }
            if (!next) break;
            parts = next;
          }
          return parts;
        }
        function startNode(g, p) {
          const k = p[0] + "," + p[1];
          if (!g._sn || g._sn.k !== k) g._sn = { k, v: nearestNode(g, p, g.pts.map((_, i) => i).filter((i) => g.adj[i].length)) };
          return g._sn.v;
        }
        function nearestNode(g, p, among) {
          let best = -1, bd = Infinity;
          for (const v of among) {
            const d = dist(g.pts[v], p);
            if (d < bd) {
              bd = d;
              best = v;
            }
          }
          return best;
        }
        const bearing = (a, b) => Math.atan2((b[1] - a[1]) * Math.cos(a[0] * RAD), b[0] - a[0]) / RAD;
        const turnCode = (d) => {
          const a = Math.abs(d);
          return a < 25 ? "S" : a < 60 ? d < 0 ? "SL" : "SR" : a < 150 ? d < 0 ? "L" : "R" : "U";
        };
        function planPart(g, req, start, rootNode) {
          if (!req.length) return { path: [], length_m: 0, street_m: 0, edges: 0, steps: [] };
          const inst = req.map((e) => ({ e, dead: false }));
          const touched = /* @__PURE__ */ new Set();
          for (const e of req) {
            touched.add(g.edges[e].a);
            touched.add(g.edges[e].b);
          }
          const root2 = rootNode != null ? rootNode : startNode(g, start);
          touched.add(root2);
          const par = /* @__PURE__ */ new Map();
          const find = (x) => {
            while (par.get(x) !== x) {
              par.set(x, par.get(par.get(x)));
              x = par.get(x);
            }
            return x;
          };
          const uni = (a, b) => {
            if (!par.has(a)) par.set(a, a);
            if (!par.has(b)) par.set(b, b);
            par.set(find(a), find(b));
          };
          for (const v of touched) par.set(v, v);
          for (const e of req) uni(g.edges[e].a, g.edges[e].b);
          for (let guard = 0; guard < 5e3; guard++) {
            const rr = find(root2), comp = [...touched].filter((v) => find(v) === rr);
            if (comp.length === touched.size) break;
            const r = shortestTo(g, comp, (v) => touched.has(v) && find(v) !== rr);
            if (!r) break;
            for (const e of r.edges) {
              inst.push({ e, dead: true });
              const { a, b } = g.edges[e];
              touched.add(a);
              touched.add(b);
              uni(a, b);
            }
          }
          const degree = /* @__PURE__ */ new Map();
          const bump = (v) => degree.set(v, (degree.get(v) || 0) + 1);
          for (const { e } of inst) {
            bump(g.edges[e].a);
            bump(g.edges[e].b);
          }
          const odd = [...degree].filter(([, d]) => d % 2).map(([v]) => v);
          if (odd.length) {
            const k = odd.length, idx = new Map(odd.map((v, i) => [v, i]));
            const D2 = Array.from({ length: k }, () => new Float64Array(k).fill(Infinity));
            const trees = odd.map((v) => sssp(g, v));
            for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) D2[i][j] = trees[i].d[odd[j]];
            const pairs = [];
            for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) if (isFinite(D2[i][j])) pairs.push([D2[i][j], i, j]);
            pairs.sort((x, y) => x[0] - y[0]);
            const mate = new Int32Array(k).fill(-1);
            for (const [, i, j] of pairs) if (mate[i] < 0 && mate[j] < 0) {
              mate[i] = j;
              mate[j] = i;
            }
            for (let pass = 0, improved = true; improved && pass < 30; pass++) {
              improved = false;
              for (let a = 0; a < k; a++) {
                const b = mate[a];
                if (b < a) continue;
                for (let c = a + 1; c < k; c++) {
                  const d = mate[c];
                  if (c === b || d < c || d === a) continue;
                  const cur = D2[a][b] + D2[c][d], s1 = D2[a][c] + D2[b][d], s2 = D2[a][d] + D2[b][c];
                  if (s1 < cur - 1e-6 && s1 <= s2) {
                    mate[a] = c;
                    mate[c] = a;
                    mate[b] = d;
                    mate[d] = b;
                    improved = true;
                    break;
                  }
                  if (s2 < cur - 1e-6) {
                    mate[a] = d;
                    mate[d] = a;
                    mate[b] = c;
                    mate[c] = b;
                    improved = true;
                    break;
                  }
                }
              }
            }
            for (let i = 0; i < k; i++) {
              const j = mate[i];
              if (j < i) continue;
              for (const e of pathFrom(trees[i], odd[j])) inst.push({ e, dead: true });
            }
          }
          const inc = /* @__PURE__ */ new Map();
          const addInc = (v, i) => {
            if (!inc.has(v)) inc.set(v, []);
            inc.get(v).push(i);
          };
          inst.forEach((x, i) => {
            addInc(g.edges[x.e].a, i);
            if (g.edges[x.e].a !== g.edges[x.e].b) addInc(g.edges[x.e].b, i);
            else addInc(g.edges[x.e].a, i);
          });
          const used = new Uint8Array(inst.length), ptr = /* @__PURE__ */ new Map();
          const stack = [{ v: root2, i: -1, from: -1 }], circuit = [];
          while (stack.length) {
            const top = stack[stack.length - 1], list = inc.get(top.v) || [];
            let p = ptr.get(top.v) || 0;
            while (p < list.length && used[list[p]]) p++;
            ptr.set(top.v, p);
            if (p < list.length) {
              const i = list[p];
              used[i] = 1;
              const ed = g.edges[inst[i].e];
              stack.push({ v: ed.a === top.v ? ed.b : ed.a, i, from: top.v });
            } else circuit.push(stack.pop());
          }
          circuit.reverse();
          const path = [];
          let length = 0, street = 0;
          const steps = [];
          let prevB = null, prevName = null;
          for (const step of circuit) {
            if (step.i < 0) continue;
            const ed = g.edges[inst[step.i].e];
            const c = step.from === ed.a ? ed.coords : ed.coords.slice().reverse();
            const at = path.length ? path.length - 1 : 0;
            let j = 1;
            while (j < c.length - 1 && dist(c[0], c[j]) < 4) j++;
            const b0 = bearing(c[0], c[j]);
            let turn = 0;
            if (prevB != null) {
              turn = b0 - prevB;
              while (turn > 180) turn -= 360;
              while (turn < -180) turn += 360;
            }
            const nm = ed.name || "";
            if (prevB == null) steps.push([at, "start", nm]);
            else if (Math.abs(turn) >= 25 || nm && nm !== prevName) steps.push([at, turnCode(turn), nm]);
            let k = c.length - 2;
            while (k > 0 && dist(c[c.length - 1], c[k]) < 4) k--;
            prevB = bearing(c[k], c[c.length - 1]);
            prevName = nm || prevName;
            for (const p of path.length ? c.slice(1) : c) path.push([+p[0].toFixed(6), +p[1].toFixed(6)]);
            length += ed.len;
            if (!inst[step.i].dead) street += ed.len;
          }
          if (path.length) steps.push([path.length - 1, "end", ""]);
          return { path, steps, root: root2, length_m: Math.round(length), street_m: Math.round(street), edges: req.length, covered: used.reduce((s, x) => s + x, 0) === inst.length };
        }
        const COLORS = ["#2563EB", "#C2185B", "#D97706", "#7C3AED", "#059669", "#0891B2", "#DC2626", "#4D7C0F", "#DB2777", "#EA580C"];
        function pathRuns(path) {
          const out = [];
          let cur = [];
          for (const q of path || []) {
            if (q[2] === 1 && cur.length) {
              out.push(cur);
              cur = [];
            }
            cur.push(q);
          }
          if (cur.length) out.push(cur);
          return out;
        }
        function densifyPath(path, step) {
          const out = [];
          for (let i = 0; i < path.length; i++) {
            if (i === 0) {
              out.push(path[0]);
              continue;
            }
            const a = path[i - 1], b = path[i];
            if (b[2] === 1) {
              out.push(b);
              continue;
            }
            const d = dist(a, b), n = Math.max(1, Math.ceil(d / step));
            for (let k = 1; k <= n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
          }
          return out;
        }
        const DIR_FROM = Date.parse("2026-11-12T23:00:00Z");
        function makeTracker(path, tol) {
          tol = tol || 25;
          const samples = densifyPath(path, 8), done = new Uint8Array(samples.length);
          const KY = R * RAD, KX = Math.cos((samples.length ? samples[0][0] : 51) * RAD) * R * RAD;
          const sdir = samples.map((q, i) => {
            const a = i > 0 && q[2] !== 1 ? samples[i - 1] : q, b = i < samples.length - 1 && samples[i + 1][2] !== 1 ? samples[i + 1] : q;
            const dx = (b[1] - a[1]) * KX, dy = (b[0] - a[0]) * KY, l = Math.hypot(dx, dy);
            return l > 0.5 ? [dx / l, dy / l] : null;
          });
          const cell = 4e-4, grid = /* @__PURE__ */ new Map(), key = (la, lo) => Math.floor(la / cell) + ":" + Math.floor(lo / cell);
          samples.forEach((p, i) => {
            const k = key(p[0], p[1]);
            if (!grid.has(k)) grid.set(k, []);
            grid.get(k).push(i);
          });
          let count = 0;
          function mark(p) {
            const cy = Math.floor(p[0] / cell), cx = Math.floor(p[1] / cell);
            let changed = false;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
              const list = grid.get(cy + dy + ":" + (cx + dx));
              if (!list) continue;
              for (const i of list) if (!done[i] && dist(samples[i], p) <= tol) {
                done[i] = 1;
                count++;
                changed = true;
              }
            }
            return changed;
          }
          const CLOSE = 6, ALONG = 8, COS = Math.cos(50 * RAD), AGREE = Math.cos(35 * RAD);
          let hist = [];
          function markDir(a, b) {
            if (!hist.length || hist[hist.length - 1][0] !== a[0] || hist[hist.length - 1][1] !== a[1]) hist = [a];
            hist.push(b);
            if (hist.length > 40) hist.shift();
            const vec = (p, q) => {
              const x = (q[1] - p[1]) * KX, y = (q[0] - p[0]) * KY;
              return [x, y, Math.hypot(x, y)];
            };
            let long = null, short = null, from = a;
            for (let k = hist.length - 2; k >= 0; k--) {
              const v2 = vec(hist[k], b);
              if (v2[2] > 80) break;
              if (!short && v2[2] >= 8) short = v2;
              if (v2[2] >= 20) {
                long = v2;
                from = hist[k];
                break;
              }
            }
            let dir = null;
            if (long && short && (long[0] * short[0] + long[1] * short[1]) / (long[2] * short[2]) >= AGREE) dir = [long[0] / long[2], long[1] / long[2]];
            else from = a;
            const v = vec(from, b), vx = v[0], vy = v[1], len = v[2];
            const seen = /* @__PURE__ */ new Set(), n = Math.min(50, Math.max(1, Math.ceil(len / 10)));
            let ch = false;
            const hit = [];
            for (let s = 0; s <= n; s++) {
              const p = [from[0] + (b[0] - from[0]) * s / n, from[1] + (b[1] - from[1]) * s / n], cy = Math.floor(p[0] / cell), cx = Math.floor(p[1] / cell);
              for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const k = cy + dy + ":" + (cx + dx);
                if (seen.has(k)) continue;
                seen.add(k);
                const list = grid.get(k);
                if (!list) continue;
                for (const i of list) {
                  if (done[i]) continue;
                  const px = (samples[i][1] - from[1]) * KX, py = (samples[i][0] - from[0]) * KY;
                  const al = len > 0 ? (px * vx + py * vy) / len : 0, t = Math.max(0, Math.min(len, al));
                  const dC = Math.hypot(px - (len > 0 ? vx / len * t : 0), py - (len > 0 ? vy / len * t : 0));
                  let ok = dC <= CLOSE;
                  if (!ok && dir && dC <= tol && al >= -2 && al <= len + ALONG && sdir[i]) ok = Math.abs(dir[0] * sdir[i][0] + dir[1] * sdir[i][1]) >= COS;
                  if (ok) {
                    done[i] = 1;
                    count++;
                    ch = true;
                    hit.push(i);
                  }
                }
              }
            }
            const cont = (i, j) => samples[j][2] !== 1 && dist(samples[i], samples[j]) <= 12;
            for (const i of hit) for (const sgn of [-1, 1]) for (let g = 1; g <= 2; g++) {
              const j = i + sgn * (g + 1);
              if (j < 0 || j >= samples.length || !done[j]) continue;
              let fine = true;
              for (let x = Math.min(i, j); x < Math.max(i, j); x++) if (!cont(x, x + 1)) {
                fine = false;
                break;
              }
              if (fine) {
                for (let x = Math.min(i, j) + 1; x < Math.max(i, j); x++) if (!done[x]) {
                  done[x] = 1;
                  count++;
                }
              }
              break;
            }
            return ch;
          }
          const isNew = (p) => (p[2] || 0) >= DIR_FROM;
          function markLine(a, b) {
            if (isNew(b)) return markDir(a, b);
            const d = dist(a, b), n = Math.min(50, Math.max(1, Math.ceil(d / 10)));
            let ch = false;
            for (let k = 0; k <= n; k++) ch = mark([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]) || ch;
            return ch;
          }
          function near(p, r) {
            const cy = Math.floor(p[0] / cell), cx = Math.floor(p[1] / cell), out = [];
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
              const list = grid.get(cy + dy + ":" + (cx + dx));
              if (list) {
                for (const i of list) if (dist(samples[i], p) <= r) out.push(i);
              }
            }
            return out;
          }
          function fillGap(a, b) {
            const d = dist(a, b);
            if (d > 600) return false;
            const A2 = near(a, 30), B = near(b, 30);
            if (!A2.length || !B.length) return false;
            let best = null;
            for (const i of A2) for (const j of B) {
              const k = Math.abs(i - j);
              if (!best || k < best.k) best = { i, j, k };
            }
            if (best.k * 8 > 1.5 * d + 40) return false;
            let ch = false;
            for (let x = Math.min(best.i, best.j); x <= Math.max(best.i, best.j); x++) if (!done[x]) {
              done[x] = 1;
              count++;
              ch = true;
            }
            return ch;
          }
          function addTrack(pts) {
            let ch = false;
            for (let i = 0; i < pts.length; i++) {
              const d = i ? dist(pts[i - 1], pts[i]) : 0;
              ch = (i && d < 120 ? markLine(pts[i - 1], pts[i]) : (i ? fillGap(pts[i - 1], pts[i]) : false) | (isNew(pts[i]) ? markDir(pts[i], pts[i]) : mark(pts[i]))) || ch;
            }
            return ch;
          }
          const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          const straight = (i, j) => {
            const a = sdir[i], b = sdir[j];
            return !a || !b || a[0] * b[0] + a[1] * b[1] >= 0.7;
          };
          function runs() {
            const out = [];
            let cur = null;
            for (let i = 0; i < samples.length; i++) {
              const jump = samples[i][2] === 1;
              if (jump && cur) {
                out.push(cur);
                cur = null;
              }
              if (done[i]) {
                if (!cur) {
                  cur = [];
                  if (i && !jump && straight(i - 1, i)) cur.push(mid(samples[i - 1], samples[i]));
                }
                cur.push(samples[i]);
              } else if (cur) {
                if (!jump && straight(i - 1, i)) cur.push(mid(samples[i], samples[i - 1]));
                out.push(cur);
                cur = null;
              }
            }
            if (cur) out.push(cur);
            return out;
          }
          function nextIndex() {
            for (let i = 0; i < samples.length; i++) if (!done[i]) return i;
            return -1;
          }
          return { samples, mark, markLine, fillGap, addTrack, runs, nextIndex, isDone: (i) => !!done[i], doneCount: () => count, pct: () => samples.length ? Math.round(100 * count / samples.length) : 0 };
        }
        const NO_B = "garage|garages|shed|roof|carport|greenhouse|hut|cabin|barn|farm_auxiliary|stable|cowshed|sty|ruins|construction|service|parking|hangar|kiosk|toilets|bunker|digester|silo|tank|transformer_tower|water_tower|storage_tank|bridge|boathouse|container|allotment_house|gatehouse|church|chapel|mosque|synagogue|temple|cathedral|train_station|transportation|grandstand|stadium|pavilion|tower|industrial|warehouse|manufacture|power|substation|commercial|retail|supermarket|shop|mall|office|hotel|hospital|clinic|school|university|college|kindergarten|public|civic|government|fire_station|sports_hall|sports_centre|gym|restaurant|cafe|fuel|petrol_station|bank|data_center|factory|works|laboratory|museum|theatre|cinema|library|prison|barracks|military", HOUSE_B = "house|detached|semidetached_house|terrace|bungalow|villa|farm|cottage|houseboat|static_caravan";
        const NO_MAILBOX = new RegExp("^(" + NO_B + ")$"), HOUSE = new RegExp("^(" + HOUSE_B + ")$");
        const FLATS = /^(apartments|residential|dormitory)$/;
        function polyArea(geom) {
          if (!geom || geom.length < 3) return 0;
          const lat0 = geom[0].lat, kx = Math.cos(lat0 * RAD) * R * RAD, ky = R * RAD;
          let a = 0;
          for (let i = 0; i < geom.length; i++) {
            const p = geom[i], q = geom[(i + 1) % geom.length];
            a += p.lon * kx * (q.lat * ky) - q.lon * kx * (p.lat * ky);
          }
          return Math.abs(a) / 2;
        }
        function estimateMailboxes(tags, area) {
          tags = tags || {};
          if (tags.abandoned || tags.disused || tags["disused:building"]) return 0;
          const b = String(tags.building || "yes");
          const business = tags.shop || tags.office || tags.amenity || tags.craft || tags.tourism || tags.industrial || tags.healthcare || tags.leisure;
          const flats = parseInt(tags["building:flats"] || tags["addr:flats"], 10);
          if (flats > 0) return Math.min(flats, 250);
          if (NO_MAILBOX.test(b)) return 0;
          const hasNr = !!tags["addr:housenumber"];
          if (HOUSE.test(b)) return area < 25 ? 0 : 1;
          const lv = parseFloat(tags["building:levels"]);
          const levels = lv > 0 ? lv : area < 120 ? 2 : 4;
          if (FLATS.test(b)) return Math.max(2, Math.min(250, Math.round(area * levels * 0.75 / 80)));
          if (business) return 0;
          if (b === "yes") {
            if (area < 30 || !hasNr && area < 60) return 0;
            if (!(lv > 0) && area > 900) return 0;
            if (!(lv > 0) && !hasNr) return area < 160 ? 1 : 0;
            if (!(lv > 0)) return area < 160 ? 1 : area < 260 ? 2 : area < 500 ? 3 : Math.max(3, Math.min(250, Math.round(area * 3 * 0.75 / 80)));
            return Math.max(1, Math.min(250, Math.round(area * levels * 0.75 / 80)));
          }
          return 0;
        }
        function parseBuildings(osm) {
          const out = [];
          for (const w of osm.elements || []) {
            if (w.type !== "way") continue;
            if (w.geometry) {
              const area = polyArea(w.geometry), n = estimateMailboxes(w.tags, area);
              if (!n) continue;
              let la = 0, lo = 0;
              for (const p of w.geometry) {
                la += p.lat;
                lo += p.lon;
              }
              out.push({ lat: la / w.geometry.length, lng: lo / w.geometry.length, n });
            } else if (w.center) {
              const n = estimateMailboxes(w.tags, 100);
              if (n) out.push({ lat: w.center.lat, lng: w.center.lon, n });
            }
          }
          return out;
        }
        function attachBuildings(g, buildings, maxSnap) {
          maxSnap = maxSnap || 70;
          const cell = 80, lat0 = g.pts.length ? g.pts[0][0] : 51, kx = Math.cos(lat0 * RAD) * R * RAD, ky = R * RAD;
          const key = (x, y) => Math.floor(x / cell) + ":" + Math.floor(y / cell), grid = /* @__PURE__ */ new Map();
          const add = (k, v) => {
            let l = grid.get(k);
            if (!l) grid.set(k, l = []);
            l.push(v);
          };
          g.edges.forEach((e, ei) => {
            e.mb = 0;
            e.boxes = [];
            for (let i = 1; i < e.coords.length; i++) {
              const ax = e.coords[i - 1][1] * kx, ay = e.coords[i - 1][0] * ky, bx = e.coords[i][1] * kx, by = e.coords[i][0] * ky;
              const L = Math.hypot(bx - ax, by - ay), steps = Math.max(1, Math.ceil(L / 30)), seen = /* @__PURE__ */ new Set();
              for (let s = 0; s <= steps; s++) {
                const x = ax + (bx - ax) * s / steps, y = ay + (by - ay) * s / steps;
                for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
                  const k = key(x + dx * cell, y + dy * cell);
                  if (!seen.has(k)) {
                    seen.add(k);
                    add(k, [ei, ax, ay, bx, by]);
                  }
                }
              }
            }
          });
          let used = 0, dropped = 0;
          for (const b of buildings) {
            const x = b.lng * kx, y = b.lat * ky, cand = grid.get(key(x, y));
            let best = -1, bd = Infinity;
            if (cand) for (const [ei, ax, ay, bx, by] of cand) {
              const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
              let t = l2 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
              t = Math.max(0, Math.min(1, t));
              const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
              if (d < bd) {
                bd = d;
                best = ei;
              }
            }
            if (best < 0 || bd > (b.snap || maxSnap)) {
              dropped += b.n;
              continue;
            }
            const e = g.edges[best];
            e.mb += b.n;
            e.boxes.push([+b.lat.toFixed(6), +b.lng.toFixed(6), b.n]);
            used += b.n;
          }
          g.mailboxes = used;
          g.dropped_mb = dropped;
          return g;
        }
        function selectForFlyers(g, start, flyers) {
          const root2 = nearestNode(g, start, g.pts.map((p, i) => i).filter((i) => g.adj[i].length));
          const tree = sssp(g, root2), n = g.pts.length, items = [];
          let sm = 0, sl = 0;
          g.edges.forEach((e) => {
            if (e.mb > 0) {
              sm += e.mb;
              sl += e.len;
            }
          });
          const D2 = sl ? sm / sl * 1e3 : 0;
          const minDens = Math.max(4, Math.min(15, 0.25 * D2));
          const sparse = (e) => e.len > 100 && e.mb * 1e3 / e.len < minDens;
          let skipped = 0;
          g.edges.forEach((e, i) => {
            if (e.mb > 0) {
              if (!g.zoned && sparse(e)) {
                skipped += e.mb;
                return;
              }
              items.push({ i, k: (tree.d[e.a] + tree.d[e.b]) / 2, v: tree.d[e.a] <= tree.d[e.b] ? e.b : e.a });
            }
          });
          const B = new Float64Array(n), Lc = new Float64Array(n), kids = Array.from({ length: n }, () => []);
          for (let v = 0; v < n; v++) if (tree.pe[v] !== -1) kids[tree.pv[v]].push(v);
          const pre = [], st = [root2];
          while (st.length) {
            const v = st.pop();
            pre.push(v);
            for (const c of kids[v]) st.push(c);
          }
          items.forEach((it) => {
            const e = g.edges[it.i];
            B[it.v] += e.mb;
            Lc[it.v] += e.len;
          });
          for (let q = pre.length - 1; q >= 0; q--) {
            const v = pre[q];
            if (tree.pe[v] === -1) continue;
            Lc[v] += g.edges[tree.pe[v]].len;
            B[tree.pv[v]] += B[v];
            Lc[tree.pv[v]] += Lc[v];
          }
          const thr = Math.max(6, Math.min(25, 0.3 * D2)), drop = new Uint8Array(n);
          for (const v of pre) {
            if (tree.pe[v] === -1) continue;
            if (drop[tree.pv[v]]) drop[v] = 1;
            else if (!g.zoned && tree.d[v] > 300 && Lc[v] > 0 && B[v] / Lc[v] * 1e3 < thr) drop[v] = 1;
          }
          const kept = items.filter((it) => {
            if (drop[it.v]) {
              skipped += g.edges[it.i].mb;
              return false;
            }
            return true;
          });
          const denseThr = Math.max(12, Math.min(45, 0.25 * D2));
          const uf = Int32Array.from({ length: n }, (_, i) => i), find = (x) => {
            while (uf[x] !== x) {
              uf[x] = uf[uf[x]];
              x = uf[x];
            }
            return x;
          };
          const isDense = (it) => {
            const e = g.edges[it.i];
            return e.len <= 100 || e.mb * 1e3 / e.len >= denseThr;
          };
          kept.forEach((it) => {
            if (isDense(it)) {
              const e = g.edges[it.i];
              uf[find(e.a)] = find(e.b);
            }
          });
          const groups = /* @__PURE__ */ new Map();
          for (const it of kept) {
            const e = g.edges[it.i], key = isDense(it) ? find(e.a) : "x" + it.i;
            let c = groups.get(key);
            if (!c) groups.set(key, c = { items: [], entry: e.a });
            c.items.push(it);
            for (const v of [e.a, e.b]) if (tree.d[v] < tree.d[c.entry]) c.entry = v;
          }
          const cl = [...groups.values()], E3 = g.edges.length, taken = new Uint8Array(E3), reached = new Uint8Array(n);
          cl.forEach((c, i) => {
            c.ix = i;
          });
          let alive = /* @__PURE__ */ new Set(), sum = 0;
          const take = (i) => {
            if (!taken[i]) {
              taken[i] = 1;
              sum += g.edges[i].mb;
            }
          };
          const markPath = (c) => {
            let x = c.entry;
            while (tree.pe[x] !== -1) {
              take(tree.pe[x]);
              reached[g.edges[tree.pe[x]].a] = 1;
              reached[g.edges[tree.pe[x]].b] = 1;
              x = tree.pv[x];
            }
          };
          const transit = (c) => {
            const path = [];
            let x = c.entry, len = 0;
            while (!reached[x] && tree.pe[x] !== -1) {
              path.push(tree.pe[x]);
              len += g.edges[tree.pe[x]].len;
              x = tree.pv[x];
            }
            return { path, len };
          };
          const reset = (list, forbid) => {
            taken.fill(0);
            reached.fill(0);
            reached[root2] = 1;
            sum = 0;
            const inList = new Set(list.map((p) => p.c));
            alive = /* @__PURE__ */ new Set();
            cl.forEach((c, i) => {
              if (!inList.has(c) && !(forbid && forbid.has(c))) alive.add(i);
            });
            for (const p of list) {
              markPath(p.c);
              for (const it of p.items) {
                take(it.i);
                reached[g.edges[it.i].a] = 1;
                reached[g.edges[it.i].b] = 1;
              }
            }
          };
          const bestCluster = () => {
            let best = null;
            for (const ci of alive) {
              const c = cl[ci];
              let mb = 0, len = 0;
              let far = 0;
              for (const it of c.items) if (!taken[it.i]) {
                mb += g.edges[it.i].mb;
                len += g.edges[it.i].len;
                far += g.edges[it.i].mb * it.k;
              }
              if (!mb) {
                alive.delete(ci);
                continue;
              }
              const tr = transit(c), c0 = 1.35 * len + TRANSIT_W * tr.len + 200 + DIST_MB * far / 1e3, score = mb / c0;
              if (!best || score > best.score) best = { ci, c, tr, mb, score };
            }
            return best;
          };
          const pick = (best, limit) => {
            const { ci, c, tr } = best;
            alive.delete(ci);
            for (const ei of tr.path) take(ei);
            const items2 = c.items.filter((it) => !taken[it.i]).sort((x, y) => x.k - y.k), used = [];
            for (const it of items2) {
              if (sum >= limit) break;
              take(it.i);
              used.push(it);
            }
            for (const it of c.items) {
              if (taken[it.i]) {
                reached[g.edges[it.i].a] = 1;
                reached[g.edges[it.i].b] = 1;
              }
            }
            for (const ei of tr.path) {
              reached[g.edges[ei].a] = 1;
              reached[g.edges[ei].b] = 1;
            }
            return { c, items: used.length ? used : c.items };
          };
          const build = (list) => {
            const inSet = new Uint8Array(E3), isItem = new Uint8Array(E3);
            let sm2 = 0, c = 0;
            const add = (i, it) => {
              if (it) isItem[i] = 1;
              if (!inSet[i]) {
                inSet[i] = 1;
                sm2 += g.edges[i].mb;
              }
            };
            for (const p of list) {
              for (const it of p.items) add(it.i, true);
              let x = p.c.entry;
              while (tree.pe[x] !== -1) {
                add(tree.pe[x], false);
                x = tree.pv[x];
              }
            }
            let walk = 0;
            for (let i = 0; i < E3; i++) if (inSet[i]) {
              const e = g.edges[i], w = e.len * (isItem[i] ? 1.35 : TRANSIT_W);
              walk += w;
              c += w + DIST_MB * e.mb * (tree.d[e.a] + tree.d[e.b]) / 2e3;
            }
            return { inSet, sum: sm2, cost: c + 200 * list.length, walk: walk + 200 * list.length };
          };
          const grow = (list, forbid) => {
            reset(list, forbid);
            const out = list.slice();
            while (sum < flyers) {
              const best = bestCluster();
              if (!best) break;
              out.push(pick(best, sum + best.mb - flyers <= 0.05 * flyers ? Infinity : flyers));
            }
            return out;
          };
          let S = grow([], null), cur = build(S);
          for (let round = 0; round < 15 && flyers < 1e8; round++) {
            const cand = S.map((p, k) => {
              const b = build(S.filter((_, j) => j !== k));
              return { k, r: (cur.cost - b.cost) / Math.max(1, cur.sum - b.sum) };
            }).sort((x, y) => y.r - x.r).slice(0, 6);
            let done = false;
            for (const { k } of cand) {
              const S2 = grow(S.filter((_, j) => j !== k), /* @__PURE__ */ new Set([S[k].c])), b2 = build(S2);
              if (b2.sum >= flyers && b2.cost < cur.cost * 0.995) {
                S = S2;
                cur = b2;
                done = true;
                break;
              }
            }
            if (!done) break;
          }
          if (flyers < 1e8) {
            reset(S, null);
            for (let guard = 0; guard < 400; guard++) {
              const best = bestCluster();
              if (!best || best.score < 0.9 * cur.sum / cur.cost || sum + best.mb > 1.35 * flyers) break;
              S.push(pick(best, Infinity));
              cur = build(S);
            }
          }
          for (let guard = 0; guard < 400 && cur.sum > flyers && S.length > 1; guard++) {
            let bi = -1, bb = null, br = -1;
            for (let k = 0; k < S.length; k++) {
              const b = build(S.filter((_, j) => j !== k));
              if (b.sum < flyers) continue;
              const r = (cur.cost - b.cost) / Math.max(1, cur.sum - b.sum);
              if (r > br) {
                br = r;
                bi = k;
                bb = b;
              }
            }
            if (bi < 0) break;
            S.splice(bi, 1);
            cur = bb;
          }
          if (flyers < 1e8) {
            const nearWalked = (inSet, lim) => {
              lim = lim || 120;
              const on = new Uint8Array(n), dW = new Float64Array(n).fill(Infinity), hW = new Heap();
              for (let i = 0; i < E3; i++) if (inSet[i]) {
                for (const v of [g.edges[i].a, g.edges[i].b]) if (dW[v]) {
                  dW[v] = 0;
                  hW.push(0, v);
                }
              }
              while (hW.size) {
                const [k, v] = hW.pop();
                if (k > dW[v]) continue;
                on[v] = 1;
                for (const { e, to } of g.adj[v]) {
                  const nd = k + g.edges[e].len;
                  if (nd <= lim && nd < dW[to]) {
                    dW[to] = nd;
                    hW.push(nd, to);
                  }
                }
              }
              return on;
            };
            const protect = /* @__PURE__ */ new Set();
            const bigMb = S.reduce((a, p) => {
              const all = p.c.items.reduce((x, it) => x + g.edges[it.i].mb, 0);
              return all > 0.1 * flyers ? a + p.items.reduce((x, it) => x + g.edges[it.i].mb, 0) : a;
            }, 0);
            const budget = flyers * 1.15 + 0.5 * bigMb;
            let selLen = 0;
            for (let i = 0; i < E3; i++) if (cur.inSet[i] && g.edges[i].mb) selLen += g.edges[i].len;
            const avgDens = cur.sum / Math.max(1, selLen);
            for (let guard = 0; guard < 200; guard++) {
              let best = null;
              const onWay = nearWalked(cur.inSet);
              for (const c of cl) {
                if (protect.has(c)) continue;
                let any = false, restMb = 0, restLen = 0, allMb = 0;
                for (const it of c.items) {
                  const e = g.edges[it.i];
                  allMb += e.mb;
                  if (cur.inSet[it.i] || onWay[e.a] || onWay[e.b]) any = true;
                  if (!cur.inSet[it.i]) {
                    restMb += e.mb;
                    restLen += e.len;
                  }
                }
                if (!any || !restMb || allMb > 0.1 * flyers || restMb / (restLen + 1) < 0.5 * avgDens) continue;
                const p0 = S.find((x) => x.c === c), S2 = p0 ? S.map((x) => x === p0 ? { c, items: c.items.slice() } : x) : S.concat([{ c, items: c.items.slice() }]);
                const b = build(S2), extra = b.walk - cur.walk;
                if (extra > 1.35 * restLen * 1.3 + 200 + TRANSIT_W * 150) {
                  protect.add(c);
                  continue;
                }
                const r = restMb / Math.max(1, extra);
                if (!best || r > best.r) best = { c, r, restMb, S2, b };
              }
              if (!best) break;
              if (cur.sum + best.restMb > budget) {
                protect.add(best.c);
                continue;
              }
              S = best.S2;
              cur = best.b;
              protect.add(best.c);
            }
            for (let guard = 0; guard < 400 && cur.sum > flyers && S.length > 1; guard++) {
              let done = false;
              for (const k of S.map((p, k2) => k2).sort((x, y) => tree.d[S[y].c.entry] - tree.d[S[x].c.entry])) {
                if (protect.has(S[k].c)) continue;
                const b = build(S.filter((_, j) => j !== k));
                if (b.sum < flyers) continue;
                if (S[k].c.items.some((it) => b.inSet[it.i])) continue;
                const nw = nearWalked(b.inSet, 250);
                if (S[k].c.items.some((it) => nw[g.edges[it.i].a] || nw[g.edges[it.i].b])) continue;
                S.splice(k, 1);
                cur = b;
                done = true;
                break;
              }
              if (!done) break;
            }
            if (cur.sum > flyers * 1.01) {
              const bigC = (p) => !protect.has(p.c) && p.c.items.reduce((a, it) => a + g.edges[it.i].mb, 0) > 0.1 * flyers;
              const far = [];
              S.forEach((p) => {
                if (bigC(p)) for (const it of p.items) far.push(it);
              });
              far.sort((x, y) => y.k - x.k);
              const drop2 = /* @__PURE__ */ new Set();
              let extra = cur.sum - flyers;
              for (const it of far) {
                const mb = g.edges[it.i].mb;
                if (mb && mb <= extra) {
                  drop2.add(it);
                  extra -= mb;
                }
                if (extra < 5e-3 * flyers) break;
              }
              if (drop2.size) {
                const S2 = S.map((p) => ({ c: p.c, items: p.items.filter((it) => !drop2.has(it)) })).filter((p) => p.items.length), b = build(S2);
                if (b.sum >= flyers) {
                  S = S2;
                  cur = b;
                }
              }
            }
          }
          const ids = [];
          let reach = 0;
          sum = 0;
          for (let i = 0; i < E3; i++) if (cur.inSet[i]) {
            ids.push(i);
            sum += g.edges[i].mb;
            const k = (tree.d[g.edges[i].a] + tree.d[g.edges[i].b]) / 2;
            if (k > reach) reach = k;
          }
          return { ids, mailboxes: sum, skipped_mb: skipped, reach_m: Math.round(reach) };
        }
        const MAX_R = 6e3, MUST_MAX_R = 1e4;
        function nextRadius(g, flyers) {
          const need = flyers * 1.15, have = Math.max(1, g.usable != null ? g.usable : g.mailboxes || 1);
          let r = g.radius * 1.3;
          if (have < need) r = Math.max(r, g.radius * Math.sqrt(need / have) * 1.1);
          if (g.reach) r = Math.max(r, g.reach / 0.6);
          return Math.min(MAX_R, Math.round(r));
        }
        function hull(points) {
          const p = points.map((q) => [q[1], q[0]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
          if (p.length < 3) return points.slice();
          const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
          const lo = [], up = [];
          for (const q of p) {
            while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
            lo.push(q);
          }
          for (let i = p.length - 1; i >= 0; i--) {
            const q = p[i];
            while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
            up.push(q);
          }
          return lo.slice(0, -1).concat(up.slice(0, -1)).map((q) => [q[1], q[0]]);
        }
        function makeBoxCounter(boxes, tol) {
          tol = tol || 30;
          const done = new Uint8Array(boxes.length);
          let count = 0;
          const total = boxes.reduce((s, b) => s + b[2], 0);
          const reach = boxes.map((b) => tol + Math.min(25, 4 * Math.sqrt(Math.max(1, b[2] || 1))));
          const cell = 4e-4, grid = /* @__PURE__ */ new Map(), key = (la, lo) => Math.floor(la / cell) + ":" + Math.floor(lo / cell);
          boxes.forEach((b, i) => {
            const k = key(b[0], b[1]);
            if (!grid.has(k)) grid.set(k, []);
            grid.get(k).push(i);
          });
          function visit(lat, lng) {
            const cy = Math.floor(lat / cell), cx = Math.floor(lng / cell);
            for (let dy = -2; dy <= 2; dy++) for (let dx = -3; dx <= 3; dx++) {
              const list = grid.get(cy + dy + ":" + (cx + dx));
              if (!list) continue;
              for (const i of list) if (!done[i] && dist([lat, lng], boxes[i]) <= reach[i]) {
                done[i] = 1;
                count += boxes[i][2];
              }
            }
            return count;
          }
          function visitLine(a, b) {
            const d = dist(a, b), n = Math.min(50, Math.max(1, Math.ceil(d / 15)));
            for (let k = 0; k <= n; k++) visit(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n);
            return count;
          }
          return { visit, visitLine, visitAll(pts) {
            for (let i = 0; i < pts.length; i++) {
              if (i && dist(pts[i - 1], pts[i]) < 120) visitLine(pts[i - 1], pts[i]);
              else visit(pts[i][0], pts[i][1]);
            }
            return count;
          }, count: () => count, total };
        }
        const DRIVE_MS = 14 / 3.6, DRIVE_MIN_M = 200, DRIVE_NET_M = 150;
        function walkRuns(pts) {
          const P = (pts || []).map((p) => Array.isArray(p) ? p : [p.lat, p.lng, +new Date(p.t)]), walk = [], drive = [], fast = new Uint8Array(P.length);
          for (let i = 1; i < P.length; i++) {
            const a = P[i - 1], b = P[i], d = dist(a, b), dt = ((b[2] || 0) - (a[2] || 0)) / 1e3;
            if (d > 30 && dt > 0 && d / dt > DRIVE_MS) fast[i] = 1;
          }
          for (let i = 1; i < P.length; ) {
            if (!fast[i]) {
              i++;
              continue;
            }
            let j = i, len = 0;
            while (j < P.length && fast[j]) {
              len += dist(P[j - 1], P[j]);
              j++;
            }
            if (len < DRIVE_MIN_M || dist(P[i - 1], P[j - 1]) < DRIVE_NET_M) for (let k = i; k < j; k++) fast[k] = 0;
            i = j;
          }
          let w = [], dr = [];
          for (let i = 0; i < P.length; i++) {
            const b = P[i];
            if (!i) {
              w.push([b[0], b[1], b[2]]);
              continue;
            }
            const a = P[i - 1];
            if (fast[i]) {
              if (w.length) walk.push(w);
              w = [];
              if (!dr.length) dr.push([a[0], a[1]]);
              dr.push([b[0], b[1]]);
            } else {
              if (dr.length) {
                drive.push(dr);
                dr = [];
              }
              if (!w.length) w.push([a[0], a[1], a[2]]);
              w.push([b[0], b[1], b[2]]);
            }
          }
          if (w.length) walk.push(w);
          if (dr.length > 1) drive.push(dr);
          return { walk, drive, driveM: drive.reduce((s, r) => s + r.reduce((x, q, k) => x + (k ? dist(r[k - 1], q) : 0), 0), 0) };
        }
        function suggestWorkers(totalMinutes, hoursPerDay, days) {
          return Math.max(1, Math.ceil(totalMinutes / 60 / ((hoursPerDay || WORK_HOURS) * (days || 1))));
        }
        function hours(meters) {
          return walkMin(meters, 0) / 60;
        }
        function routeMinutes(len, mb) {
          return Math.round(walkMin(len, mb));
        }
        function capacity(routes, flyers, opt) {
          const hpd = opt && opt.hoursPerDay || WORK_HOURS, days = opt && opt.days || 2, limit = hpd * days;
          const hr = (r) => r.minutes != null ? r.minutes / 60 : hours(r.length_m);
          const totalH = routes.reduce((s, r) => s + hr(r), 0), over = routes.filter((r) => hr(r) > limit).map((r) => r.idx);
          const cap = routes.length * limit, ok = totalH <= cap && !over.length;
          const slowest = routes.reduce((m, r) => Math.max(m, hr(r)), 0);
          return { ok, limit, totalH, slowest, over, suggestedFlyers: ok ? flyers : Math.max(0, Math.floor(flyers * Math.min(1, limit / (slowest || limit)) / 50) * 50) };
        }
        async function loadZone(poly, fetchImpl) {
          const osm = await fetchStreets(poly, fetchImpl);
          const g = largestComponent(buildGraph(osm, poly));
          g.street_m = Math.round(g.edges.reduce((s, e) => s + e.len, 0));
          return g;
        }
        const CENSUS_SLACK = 1.1;
        async function censusFill(buildings, box, census2) {
          const las = box.map((p) => p[0]), los = box.map((p) => p[1]);
          const c0 = census2.cellOf(Math.min(...las), Math.min(...los)), c1 = census2.cellOf(Math.max(...las), Math.max(...los)), c2 = census2.cellOf(Math.min(...las), Math.max(...los)), c3 = census2.cellOf(Math.max(...las), Math.min(...los));
          const x0 = Math.min(c0[0], c1[0], c2[0], c3[0]), x1 = Math.max(c0[0], c1[0], c2[0], c3[0]), y0 = Math.min(c0[1], c1[1], c2[1], c3[1]), y1 = Math.max(c0[1], c1[1], c2[1], c3[1]);
          const H = await census2.households(x0, y0, x1, y1);
          if (!H || !H.size) return buildings;
          const own = /* @__PURE__ */ new Map();
          buildings.forEach((b, i) => {
            const c = census2.cellOf(b.lat, b.lng), k = c[0] + "," + c[1];
            let l = own.get(k);
            if (!l) own.set(k, l = []);
            l.push(i);
          });
          const out = buildings.map((b) => ({ ...b }));
          let added = 0, removed = 0;
          for (const [k, idx] of own) {
            const h = H.get(k);
            if (!h) continue;
            const ours = idx.reduce((a, i) => a + out[i].n, 0), cap = Math.round(h * CENSUS_SLACK) + 2;
            if (ours <= cap) continue;
            const share = idx.map((i) => ({ i, x: Math.max(1, cap * out[i].n / ours) }));
            let left = cap;
            share.forEach((s) => {
              const f = Math.max(1, Math.floor(s.x));
              left -= f;
              s.f = f;
              s.r = s.x - Math.floor(s.x);
            });
            share.sort((a, b) => b.r - a.r);
            for (let j = 0; j < left; j++) share[j % share.length].f += 1;
            share.forEach((s) => {
              removed += out[s.i].n - s.f;
              out[s.i].n = s.f;
            });
          }
          for (const [k, h] of H) {
            const [cx, cy] = k.split(",").map(Number);
            if (cx < x0 || cx > x1 || cy < y0 || cy > y1) continue;
            const idx = own.get(k) || [], ours = idx.reduce((a, i) => a + out[i].n, 0), miss = h - ours;
            if (miss <= 0) continue;
            const [la, lo] = census2.centre(cx, cy);
            if (la < Math.min(...las) || la > Math.max(...las) || lo < Math.min(...los) || lo > Math.max(...los)) continue;
            if (!idx.length) {
              out.push({ lat: la, lng: lo, n: miss, census: true, snap: 110 });
              added += miss;
              continue;
            }
            const share = idx.map((i) => ({ i, x: miss * out[i].n / ours }));
            let left = miss;
            share.forEach((s) => {
              const f = Math.floor(s.x);
              out[s.i].n += f;
              left -= f;
              s.r = s.x - f;
            });
            share.sort((a, b) => b.r - a.r);
            for (let j = 0; j < left; j++) out[share[j % share.length].i].n += 1;
            added += miss;
          }
          out.added = added;
          out.removed = removed;
          return out;
        }
        async function loadForFlyers(start, flyers, opt) {
          opt = opt || {};
          const zr = opt.zone && opt.zone.length > 2 ? mustRadius(start, [opt.zone]) : 0;
          const mr = Math.min(MUST_MAX_R, Math.max(mustRadius(start, opt.must), zr));
          let r = Math.max(Math.min(MAX_R, opt.radius || 1500), mr), last = null;
          const store = opt.tiles || /* @__PURE__ */ new Map();
          for (let round = 0; round < 6; round++) {
            const keys = tilesFor(start, r);
            await fetchTiles(keys, store, opt);
            const m = mergeTiles(keys.map((k) => store.get(k)));
            const dLat = r / 111320, dLng = r / (111320 * Math.cos(start[0] * RAD)), box = [[start[0] - dLat, start[1] - dLng], [start[0] - dLat, start[1] + dLng], [start[0] + dLat, start[1] + dLng], [start[0] + dLat, start[1] - dLng]];
            const g = largestComponent(buildGraph(m.osm, box), start);
            let bl = m.buildings.filter((b) => Math.abs(b.lat - start[0]) <= dLat && Math.abs(b.lng - start[1]) <= dLng);
            if (opt.census) {
              try {
                bl = await censusFill(bl, box, opt.census);
              } catch (e) {
              }
            }
            attachBuildings(g, bl);
            g.radius = r;
            g.street_m = Math.round(g.edges.reduce((s, e) => s + e.len, 0));
            last = g;
            g.usable = selectForFlyers(g, start, 1e9).mailboxes;
            g.reach = selectWithMust(g, start, flyers, opt.must, opt.zone).reach_m;
            if (zr || g.usable >= flyers * 1.15 && g.reach <= 0.65 * r || r >= MAX_R) break;
            r = nextRadius(g, flyers);
          }
          return last;
        }
        function mixShare(g, parts) {
          const own = owners(g, parts);
          let shared = 0;
          for (const m of own.values()) if (m.size > 1) shared++;
          return own.size ? shared / own.size : 0;
        }
        function bandSplits(g, start, n, ids, weight) {
          if (n < 2 || ids.length < n) return [];
          const root2 = nearestNode(g, start, g.pts.map((_, i) => i)), dd = sssp(g, root2).d, wf = weight || ((e) => e.len);
          const items = ids.map((i) => ({ i, d: Math.min(dd[g.edges[i].a], dd[g.edges[i].b]), w: wf(g.edges[i]) })).sort((a, b) => a.d - b.d);
          const total = items.reduce((a, x) => a + x.w, 0), out = [];
          for (const shift of [0, -0.08, 0.08]) {
            const parts = Array.from({ length: n }, () => []);
            let cum = 0;
            for (const x of items) {
              const f = (cum + x.w / 2) / total;
              let p = 0;
              for (let k = 1; k < n; k++) if (f > k / n + shift) p = k;
              parts[p].push(x.i);
              cum += x.w;
            }
            if (parts.every((q) => q.length)) out.push(parts);
          }
          return out;
        }
        function centreSplits(g, n, ids, weight, tries) {
          if (n < 2 || ids.length < n) return [];
          const wf = weight || ((e) => e.len), mid = (i) => {
            const c2 = g.edges[i].coords;
            return c2[Math.floor(c2.length / 2)];
          };
          let la = 0, lo = 0, W = 0;
          for (const i of ids) {
            const m = mid(i), x = wf(g.edges[i]) || 1e-6;
            la += m[0] * x;
            lo += m[1] * x;
            W += x;
          }
          const c = [la / W, lo / W], cosLat = Math.cos(c[0] * RAD);
          const items = ids.map((i) => {
            const m = mid(i);
            return { i, w: wf(g.edges[i]), ang: Math.atan2(m[0] - c[0], (m[1] - c[1]) * cosLat) };
          }).sort((a, b) => a.ang - b.ang);
          const total = items.reduce((a, x) => a + x.w, 0), M = items.length, out = [];
          for (let t = 0; t < tries; t++) {
            const off = Math.floor(t * M / tries), ring = items.slice(off).concat(items.slice(0, off)), parts = Array.from({ length: n }, () => []);
            let cum = 0;
            for (const x of ring) {
              parts[Math.min(n - 1, Math.floor((cum + x.w / 2) / total * n))].push(x.i);
              cum += x.w;
            }
            if (parts.every((q) => q.length)) out.push(parts);
          }
          return out;
        }
        function balancedSplits(g, start, n, ids, tries) {
          const cosLat = Math.cos(start[0] * RAD), root2 = nearestNode(g, start, g.pts.map((_, i) => i)), dd = sssp(g, root2).d;
          const items = ids.map((i) => {
            const e = g.edges[i], m = e.coords[Math.floor(e.coords.length / 2)];
            return { i, len: e.len, mb: e.mb, d: Math.min(dd[e.a], dd[e.b]), ang: Math.atan2(m[0] - start[0], (m[1] - start[1]) * cosLat) };
          }).sort((x, y) => x.ang - y.ang);
          const M = items.length, out = [];
          if (M < n) return out;
          const cost = (len, mb, far) => walkMin(1.35 * len + 2 * far, mb);
          for (let t = 0; t < tries; t++) {
            const off = Math.floor(t * M / tries), ring = items.slice(off).concat(items.slice(0, off));
            const cut = (T) => {
              const cuts = [];
              let len = 0, mb = 0, far = 0, from = 0;
              for (let k = 0; k < M; k++) {
                const x = ring[k], nl = len + x.len, nm = mb + x.mb, nf = Math.max(far, x.d);
                if (k > from && cost(nl, nm, nf) > T) {
                  cuts.push(k);
                  if (cuts.length >= n) return null;
                  from = k;
                  len = x.len;
                  mb = x.mb;
                  far = x.d;
                } else {
                  len = nl;
                  mb = nm;
                  far = nf;
                }
              }
              return cuts;
            };
            let lo = 0, hi = cost(items.reduce((a, x) => a + x.len, 0), items.reduce((a, x) => a + x.mb, 0), Math.max(...items.map((x) => x.d)));
            let best = cut(hi);
            for (let it = 0; it < 28; it++) {
              const mid = (lo + hi) / 2, c = cut(mid);
              if (c) {
                best = c;
                hi = mid;
              } else lo = mid;
            }
            if (!best) continue;
            const bounds = [0, ...best, M], parts = [];
            for (let k = 0; k + 1 < bounds.length; k++) parts.push(ring.slice(bounds[k], bounds[k + 1]).map((x) => x.i));
            while (parts.length < n) {
              let bi = 0;
              parts.forEach((p2, i) => {
                if (p2.length > parts[bi].length) bi = i;
              });
              const p = parts[bi];
              if (p.length < 2) break;
              parts.splice(bi, 1, p.slice(0, p.length >> 1), p.slice(p.length >> 1));
            }
            if (parts.length === n) out.push(parts);
          }
          return out;
        }
        const mp = (a) => Array.isArray(a) ? { p: a, n: 0 } : { p: a && a.p || [], n: Math.max(0, +(a && a.n) || 0) };
        const inArea = (e, P) => P.length > 2 && inPoly(e.coords[Math.floor(e.coords.length / 2)], P);
        function mustEdges(g, polys) {
          const out = [];
          if (!polys || !polys.length) return out;
          const ps = polys.map((a) => mp(a).p);
          g.edges.forEach((e, i) => {
            if (e.mb && ps.some((P) => inArea(e, P))) out.push(i);
          });
          return out;
        }
        function mustPick(g, start, polys) {
          const out = [], info = [];
          if (!polys || !polys.length) return { ids: out, info };
          let d = null;
          for (const raw of polys) {
            const A2 = mp(raw), ids = [];
            g.edges.forEach((e, i) => {
              if (e.mb && inArea(e, A2.p)) ids.push(i);
            });
            const avail = ids.reduce((x, i) => x + g.edges[i].mb, 0);
            let use = ids;
            if (A2.n > 0 && A2.n < avail) {
              if (!d) {
                const root2 = nearestNode(g, start, g.pts.map((p, i) => i).filter((i) => g.adj[i].length));
                d = sssp(g, root2).d;
              }
              const k = (i) => Math.min(d[g.edges[i].a], d[g.edges[i].b]);
              use = [];
              let sum = 0;
              for (const i of ids.slice().sort((x, y) => k(x) - k(y))) {
                if (sum >= A2.n) break;
                use.push(i);
                sum += g.edges[i].mb;
              }
            }
            for (const i of use) out.push(i);
            info.push({ avail, used: use.reduce((x, i) => x + g.edges[i].mb, 0), n: A2.n });
          }
          return { ids: [...new Set(out)], info };
        }
        function mustRadius(start, polys) {
          let r = 0;
          for (const a of polys || []) for (const q of mp(a).p) r = Math.max(r, dist(start, q));
          return r ? r + 400 : 0;
        }
        function zoneView(g, zone, must) {
          if (!zone || zone.length < 3) return g;
          const ps = [zone, ...(must || []).map((a) => mp(a).p)];
          return { ...g, zoned: true, edges: g.edges.map((e) => !e.mb || ps.some((P) => inArea(e, P)) ? e : { ...e, mb: 0, boxes: [] }) };
        }
        function selectWithMust(g, start, flyers, polys, zone) {
          g = zoneView(g, zone, polys);
          const zone_mb = g.zoned ? g.edges.reduce((a, e) => a + e.mb, 0) : null;
          const pk = mustPick(g, start, polys), must = pk.ids;
          if (!must.length) return { ...selectForFlyers(g, start, flyers), must_mb: 0, must_ids: [], must_info: pk.info, zone_mb };
          const mustSet = new Set(must), mustMb = must.reduce((a, i) => a + g.edges[i].mb, 0);
          let rest = Math.max(0, flyers - mustMb), sel = rest > 0 ? selectForFlyers(g, start, rest) : { ids: [], mailboxes: 0, reach_m: 0 };
          const overlap = sel.ids.reduce((a, i) => a + (mustSet.has(i) ? g.edges[i].mb : 0), 0);
          if (rest > 0 && overlap > 0) sel = selectForFlyers(g, start, rest + overlap);
          const ids = [.../* @__PURE__ */ new Set([...sel.ids, ...must])], mailboxes = ids.reduce((a, i) => a + g.edges[i].mb, 0);
          const root2 = nearestNode(g, start, g.pts.map((p, i) => i).filter((i) => g.adj[i].length)), d = sssp(g, root2).d;
          const reach = Math.max(sel.reach_m || 0, ...must.map((i) => Math.max(d[g.edges[i].a], d[g.edges[i].b])).filter(isFinite));
          return { ...sel, ids, mailboxes, reach_m: Math.round(reach), must_mb: mustMb, must_ids: must, must_info: pk.info, zone_mb };
        }
        const RES_R = 400, RES_MAX = 120;
        function reserveFor(g, used, routes, opt) {
          const skip = opt && opt.skip;
          const cell = 4e-3, key = (a, b) => Math.floor(a / cell) + ":" + Math.floor(b / cell), grid = /* @__PURE__ */ new Map();
          routes.forEach((r, k) => {
            r.reserve = [];
            const pp = r.path || [];
            for (let i = 0; i < pp.length; i += 2) {
              const q = pp[i], gk = key(q[0], q[1]);
              let l = grid.get(gk);
              if (!l) grid.set(gk, l = []);
              l.push([q[0], q[1], k]);
            }
          });
          if (!grid.size) return;
          const cand = routes.map(() => []);
          g.edges.forEach((e, i) => {
            if (used.has(i) || !(e.mb > 0) || !e.coords || e.coords.length < 2 || skip && skip(i)) return;
            const m = e.coords[Math.floor(e.coords.length / 2)], i0 = Math.floor(m[0] / cell), j0 = Math.floor(m[1] / cell);
            let best = -1, bd = Infinity;
            for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
              const l = grid.get(i0 + a + ":" + (j0 + b));
              if (l) for (const q of l) {
                const d = dist(m, q);
                if (d < bd) {
                  bd = d;
                  best = q[2];
                }
              }
            }
            if (best >= 0 && bd <= RES_R) cand[best].push({ d: bd, p: e.coords.map((c) => [+c[0].toFixed(6), +c[1].toFixed(6)]), mb: Math.round(e.mb) });
          });
          cand.forEach((l, k) => {
            routes[k].reserve = l.sort((a, b) => a.d - b.d).slice(0, RES_MAX).map(({ p, mb }) => ({ p, mb }));
          });
        }
        function planFlyers(g, start, flyers, n, opt) {
          opt = opt || {};
          g = zoneView(g, opt.zone, opt.must);
          const sel = selectWithMust(g, start, flyers, opt.must);
          const total = sel.ids.reduce((s, i) => s + g.edges[i].len, 0), mbTotal = sel.mailboxes || 1;
          const w = (e) => 0.5 * e.len / (total || 1) + 0.5 * e.mb / mbTotal;
          const N = n || 1, build = (parts, rootNode) => parts.map((part, k) => {
            const r = planPart(g, part, start, rootNode);
            const boxes = [];
            let mb = 0;
            for (const i of part) {
              mb += g.edges[i].mb;
              for (const b of g.edges[i].boxes) boxes.push(b);
            }
            return { idx: k, ...r, part, mailboxes: mb, boxes, minutes: routeMinutes(r.length_m, mb) };
          });
          const score = (rs) => {
            const m = rs.map((r) => r.minutes), mx = Math.max(...m), sum = m.reduce((a, b) => a + b, 0);
            return mx + 0.3 * sum / m.length + 0.01 * (mx - Math.min(...m));
          };
          let bestParts = null, routes = null, builds = 0;
          const tryParts = (parts) => {
            const rs = build(parts);
            builds++;
            if (!routes || score(rs) < score(routes)) {
              routes = rs;
              bestParts = parts;
              return true;
            }
            return false;
          };
          const cands = [partition(g, start, N, sel.ids, w), ...N > 1 ? balancedSplits(g, start, N, sel.ids, 8) : []];
          const tried = cands.map((raw) => {
            const t = tidyParts(g, raw), rs = build(t);
            builds++;
            if (!routes || score(rs) < score(routes)) {
              routes = rs;
              bestParts = t;
            }
            return { t, sc: score(rs) };
          });
          if (N > 1) for (const { t } of tried.sort((a, b) => a.sc - b.sc).slice(0, 3)) tryParts(balanceParts(g, t));
          if (N > 1) {
            for (let it = 0; it < 10 && builds < 30; it++) {
              const m = routes.map((r) => r.minutes), own = owners(g, bestParts), P = m.indexOf(Math.max(...m));
              let better = false;
              for (const Q of [...neighbours(g, bestParts, P, own)].filter((q) => m[q] < m[P] * 0.95).sort((a, b) => m[a] - m[b]).slice(0, 2)) {
                for (const f of [0.5, 0.25]) {
                  const parts = shiftStrip(g, bestParts, P, Q, (m[P] - m[Q]) * f, own);
                  if (parts && tryParts(parts)) {
                    better = true;
                    break;
                  }
                }
                if (better) break;
              }
              if (!better) {
                const parts = bestParts.map((p) => p.slice());
                for (let k = 0; k < N; k++) {
                  const j = (k + 1) % N, a = m[k], b = m[j];
                  if (a > b * 1.08 && parts[k].length > 1) {
                    const c = Math.max(1, Math.min(parts[k].length - 1, Math.round(parts[k].length * Math.min(0.35, (a - b) / (2 * a)))));
                    parts[j] = parts[k].splice(parts[k].length - c, c).concat(parts[j]);
                  } else if (b > a * 1.08 && parts[j].length > 1) {
                    const c = Math.max(1, Math.min(parts[j].length - 1, Math.round(parts[j].length * Math.min(0.35, (b - a) / (2 * b)))));
                    parts[k] = parts[k].concat(parts[j].splice(0, c));
                  }
                }
                better = tryParts(tidyParts(g, parts));
              }
              if (!better) break;
            }
          }
          const hpd = opt.hoursPerDay || WORK_HOURS, maxDays = opt.days || 1;
          const dayInfo = (r) => ({ length_m: r.length_m, street_m: r.street_m, minutes: r.minutes, mailboxes: r.mailboxes });
          const withDays = (part, k, base) => {
            const nd = Math.min(maxDays, Math.max(1, Math.ceil(base.minutes / 60 / hpd)));
            if (nd < 2 || part.length < nd) return { ...base, days: [{ i0: 0, i1: Math.max(0, base.path.length - 1), ...dayInfo(base) }] };
            const raw = [partition(g, start, nd, part, w), ...balancedSplits(g, start, nd, part, 4), ...bandSplits(g, start, nd, part, w), ...centreSplits(g, nd, part, w, 4)];
            const cands2 = raw.flatMap((ps) => {
              const t = tidyParts(g, ps);
              return [ps, t, balanceParts(g, t)];
            });
            let best = null;
            for (const ps of cands2) {
              const rs = build(ps.filter((x) => x.length), base.root);
              if (rs.length < 2) continue;
              const mx = Math.max(...rs.map((r) => r.minutes)), mn = Math.min(...rs.map((r) => r.minutes));
              const sc = mx + 0.3 * rs.reduce((a, r) => a + r.minutes, 0) / rs.length + 0.01 * (mx - mn) + 250 * mixShare(g, ps.filter((x) => x.length));
              if (!best || sc < best.sc) {
                best = { rs, sc };
              }
            }
            if (!best) return { ...base, days: [{ i0: 0, i1: Math.max(0, base.path.length - 1), ...dayInfo(base) }] };
            const path = [], steps = [], boxes = [], days = [];
            for (const d of best.rs) {
              const off = path.length ? path.length - 1 : 0, i0 = off;
              for (const q of path.length ? d.path.slice(1) : d.path) path.push(q);
              for (const st of d.steps) steps.push([off + st[0], st[1], st[2]]);
              for (const b of d.boxes) boxes.push(b);
              days.push({ i0, i1: path.length - 1, ...dayInfo(d) });
            }
            const sum = (k2) => days.reduce((a, d) => a + d[k2], 0);
            return { ...base, path, steps, boxes, days, length_m: sum("length_m"), street_m: sum("street_m"), minutes: sum("minutes"), mailboxes: sum("mailboxes") };
          };
          if (maxDays > 1) routes = bestParts.map((part, k) => withDays(part, k, routes[k]));
          else routes = routes.map((r) => ({ ...r, days: [{ i0: 0, i1: Math.max(0, r.path.length - 1), length_m: r.length_m, street_m: r.street_m, minutes: r.minutes, mailboxes: r.mailboxes }] }));
          const pts = [];
          for (const i of sel.ids) for (const c of g.edges[i].coords) pts.push(c);
          reserveFor(g, new Set(sel.ids), routes);
          return { routes, mailboxes: sel.mailboxes, must_mb: sel.must_mb || 0, must_info: sel.must_info || [], zone_mb: g.zoned ? g.edges.reduce((a, e) => a + e.mb, 0) : null, reach_m: sel.reach_m, zone: hull(pts), capacity: capacity(routes, flyers) };
        }
        function planRoutes(g, start, n) {
          return partition(g, start, n).map((part, k) => ({ idx: k, ...planPart(g, part, start) }));
        }
        const api = { reserveFor, censusFill, setTileStamp, setPace, denseEntry, pathRuns, emptyGap, tilesFor, qTile, compactTile, mergeTiles, decodeTile, fetchOwnTile, TILES_URL, TILE_V, MUST_MAX_R, mustEdges, mustPick, mustRadius, selectWithMust, zoneView, COLORS, densifyPath, makeTracker, DIR_FROM, makeBoxCounter, walkRuns, DRIVE_MS, DRIVE_MIN_M, DRIVE_NET_M, fetchStreets, fetchStreetsAround, fetchBuildings, parseBuildings, estimateMailboxes, attachBuildings, selectForFlyers, nextRadius, MAX_R, planFlyers, loadForFlyers, capacity, hull, buildGraph, largestComponent, partition, planPart, planRoutes, loadZone, suggestWorkers, hours, routeMinutes, dist, inPoly, lineLen, WORK_HOURS, WALK_KMH, BOX_SEC };
        if (typeof module !== "undefined" && module.exports) module.exports = api;
        else root.Planner = api;
      })(typeof window !== "undefined" ? window : globalThis);
    }
  });

  // src/plancore.js
  var import_planner = __toESM(require_planner());

  // src/zensus.js
  var BASE = "https://urlose.github.io/flyermap/zensus/";
  var squares = /* @__PURE__ */ new Map();
  var A = 6378137;
  var E2 = 0.0066943800229;
  var E = Math.sqrt(E2);
  var P0 = 52 * Math.PI / 180;
  var L0 = 10 * Math.PI / 180;
  var qf = (s) => (1 - E2) * (s / (1 - E2 * s * s) - Math.log((1 - E * s) / (1 + E * s)) / (2 * E));
  var QP = qf(1);
  var B0 = Math.asin(qf(Math.sin(P0)) / QP);
  var RQ = A * Math.sqrt(QP / 2);
  var D = A * (Math.cos(P0) / Math.sqrt(1 - E2 * Math.sin(P0) ** 2)) / (RQ * Math.cos(B0));
  function laea(lat, lng) {
    const b = Math.asin(qf(Math.sin(lat * Math.PI / 180)) / QP), dl = lng * Math.PI / 180 - L0;
    const k = RQ * Math.sqrt(2 / (1 + Math.sin(B0) * Math.sin(b) + Math.cos(B0) * Math.cos(b) * Math.cos(dl)));
    return [4321e3 + k * D * Math.cos(b) * Math.sin(dl), 321e4 + k / D * (Math.cos(B0) * Math.sin(b) - Math.sin(B0) * Math.cos(b) * Math.cos(dl))];
  }
  var cellOf = (lat, lng) => {
    const [x, y] = laea(lat, lng);
    return [Math.floor(x / 100), Math.floor(y / 100)];
  };
  function parseSquare(buf) {
    const u = new Uint32Array(buf.slice(0, buf.byteLength - buf.byteLength % 4)), m = /* @__PURE__ */ new Map();
    for (let i = 0; i < u.length; i++) m.set(u[i] >>> 12, u[i] & 4095);
    return m;
  }
  function square(key, fetcher) {
    if (!squares.has(key)) squares.set(key, (fetcher || fetch)(BASE + "h_" + key + ".bin").then((r) => r.status === 404 ? /* @__PURE__ */ new Map() : r.ok ? r.arrayBuffer().then(parseSquare) : Promise.reject(new Error("zensus " + r.status))).catch((e) => {
      squares.delete(key);
      throw e;
    }));
    return squares.get(key);
  }
  async function compare(boxes, fetcher) {
    const cells = /* @__PURE__ */ new Map();
    for (const b of boxes || []) {
      if (!b || b[0] == null) continue;
      const [cx, cy] = cellOf(b[0], b[1]), k = cx + "," + cy;
      cells.set(k, (cells.get(k) || 0) + (b[2] || 1));
    }
    if (!cells.size) return null;
    const need = /* @__PURE__ */ new Set();
    for (const k of cells.keys()) {
      const [cx, cy] = k.split(",").map(Number);
      need.add(Math.floor(cx / 500) + "_" + Math.floor(cy / 500));
    }
    const sq = {};
    await Promise.all([...need].map(async (k) => {
      sq[k] = await square(k, fetcher);
    }));
    let ours = 0, households = 0, emptyOurs = 0;
    for (const [k, n] of cells) {
      const [cx, cy] = k.split(",").map(Number), h = sq[Math.floor(cx / 500) + "_" + Math.floor(cy / 500)].get(cy % 500 * 500 + cx % 500) || 0;
      ours += n;
      households += h;
      if (!h) emptyOurs += n;
    }
    return { ours, households, cells: cells.size, emptyOurs };
  }
  function unlaea(x, y) {
    let lat = 52 + (y - 321e4) / 111320, lng = 10 + (x - 4321e3) / (111320 * Math.cos(lat * Math.PI / 180));
    for (let k = 0; k < 6; k++) {
      const [fx, fy] = laea(lat, lng), h = 1e-5, [ax, ay] = laea(lat + h, lng), [bx, by] = laea(lat, lng + h);
      const j11 = (ax - fx) / h, j21 = (ay - fy) / h, j12 = (bx - fx) / h, j22 = (by - fy) / h, det = j11 * j22 - j12 * j21, ex = x - fx, ey = y - fy;
      lat += (j22 * ex - j12 * ey) / det;
      lng += (-j21 * ex + j11 * ey) / det;
      if (Math.abs(ex) + Math.abs(ey) < 0.01) break;
    }
    return [lat, lng];
  }
  function censusSource(fetcher) {
    return {
      cellOf,
      centre: (cx, cy) => unlaea(cx * 100 + 50, cy * 100 + 50),
      async households(x0, y0, x1, y1) {
        const keys = [];
        for (let sx = Math.floor(x0 / 500); sx <= Math.floor(x1 / 500); sx++) for (let sy = Math.floor(y0 / 500); sy <= Math.floor(y1 / 500); sy++) keys.push([sx, sy]);
        const out = /* @__PURE__ */ new Map();
        await Promise.all(keys.map(async ([sx, sy]) => {
          const m = await square(sx + "_" + sy, fetcher);
          for (const [i, h] of m) {
            const cx = sx * 500 + i % 500, cy = sy * 500 + Math.floor(i / 500);
            if (h && cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) out.set(cx + "," + cy, h);
          }
        }));
        return out;
      }
    };
  }
  async function townsAround(lat, lng, minR, maxR, fetcher) {
    const src = censusSource(fetcher), [x, y] = laea(lat, lng), r = Math.ceil(maxR / 100);
    const cx = Math.floor(x / 100), cy = Math.floor(y / 100);
    const H = await src.households(cx - r, cy - r, cx + r, cy + r);
    const blk = /* @__PURE__ */ new Map();
    for (const [k, h] of H) {
      const [ix, iy] = k.split(",").map(Number), bk = Math.floor(ix / 10) + "," + Math.floor(iy / 10);
      let b = blk.get(bk);
      if (!b) blk.set(bk, b = { h: 0, sx: 0, sy: 0 });
      b.h += h;
      b.sx += (ix * 100 + 50) * h;
      b.sy += (iy * 100 + 50) * h;
    }
    const dense = new Set([...blk].filter(([, b]) => b.h >= 25).map(([k]) => k)), seen = /* @__PURE__ */ new Set(), out = [];
    for (const k0 of dense) {
      if (seen.has(k0)) continue;
      seen.add(k0);
      const st = [k0];
      let h = 0, sx = 0, sy = 0, top = null, nb = 0;
      while (st.length) {
        const k = st.pop(), b = blk.get(k);
        h += b.h;
        nb++;
        sx += b.sx;
        sy += b.sy;
        if (!top || b.h > top.h) top = b;
        const [bx, by] = k.split(",").map(Number);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          const n = bx + dx + "," + (by + dy);
          if (dense.has(n) && !seen.has(n)) {
            seen.add(n);
            st.push(n);
          }
        }
      }
      const mx = sx / h, my = sy / h, dist = Math.hypot(mx - x, my - y);
      if (h < 150 || dist < minR || dist > maxR) continue;
      const [la, lo] = unlaea(top.sx / top.h, top.sy / top.h);
      out.push({ lat: +la.toFixed(6), lng: +lo.toFixed(6), households: h, dist: Math.round(dist), km2: nb, dense: Math.round(h / nb) });
    }
    return out.sort((a, b) => a.dist - b.dist);
  }
  async function placeMask(lat, lng, { maxR = 7e3, pick = 1500, fetcher } = {}) {
    const src = censusSource(fetcher), [x, y] = laea(lat, lng), r = Math.ceil(maxR / 100), cx = Math.floor(x / 100), cy = Math.floor(y / 100);
    const H = await src.households(cx - r, cy - r, cx + r, cy + r);
    if (!H.size) return null;
    const comp = /* @__PURE__ */ new Map();
    let nc = 0;
    const info = [];
    for (const k0 of H.keys()) {
      if (comp.has(k0)) continue;
      const id = nc++, st = [k0];
      comp.set(k0, id);
      let h = 0, near = Infinity;
      const cells = [];
      while (st.length) {
        const k = st.pop();
        cells.push(k);
        h += H.get(k);
        const [ix, iy] = k.split(",").map(Number);
        near = Math.min(near, Math.hypot(ix - cx, iy - cy) * 100);
        for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
          const n = ix + dx + "," + (iy + dy);
          if (H.has(n) && !comp.has(n)) {
            comp.set(n, id);
            st.push(n);
          }
        }
      }
      info.push({ id, h, near, cells });
    }
    const cand = info.filter((c) => c.near <= pick);
    if (!cand.length) return null;
    const best = cand.reduce((a, c) => c.h > a.h ? c : a);
    const own = /* @__PURE__ */ new Set();
    for (const k of best.cells) {
      const [ix, iy] = k.split(",").map(Number);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) own.add(ix + dx + "," + (iy + dy));
    }
    let sx = 0, sy = 0;
    for (const k of best.cells) {
      const [ix, iy] = k.split(",").map(Number), h = H.get(k);
      sx += ix * h;
      sy += iy * h;
    }
    const mx = sx / best.h, my = sy / best.h, ck = best.cells.reduce((a, k) => {
      const [ix, iy] = k.split(",").map(Number), d = Math.hypot(ix - mx, iy - my);
      return d < a.d ? { k, d } : a;
    }, { k: null, d: Infinity }).k.split(",").map(Number);
    const centre = unlaea(ck[0] * 100 + 50, ck[1] * 100 + 50);
    return { households: best.h, cells: best.cells.length, centre, inside: (la, lo) => {
      const [a, b] = cellOf(la, lo);
      return own.has(a + "," + b);
    } };
  }

  // src/plancore.js
  var census = censusSource();
  function createPlanService(cache) {
    let G = null, gKey = "";
    const tiles = /* @__PURE__ */ new Map();
    const keyOf = (s) => s[0].toFixed(5) + "," + s[1].toFixed(5);
    const info = () => G ? { radius: G.radius, usable: G.usable, mailboxes: G.mailboxes, street_m: G.street_m } : null;
    const load = async (start, flyers, radius, must, stage, stale, key, zone) => {
      if (tiles.size > 150) tiles.clear();
      G = await import_planner.default.loadForFlyers(start, flyers, {
        cache,
        radius,
        must,
        zone,
        tiles,
        stale,
        census,
        progress: (done, total) => {
          if (stage && total > 1) stage((key || "loadingArea") + "|" + done + "|" + total);
        }
      });
      gKey = keyOf(start);
    };
    const sideG = /* @__PURE__ */ new Map();
    const sideGraph = async (c, stage, stale) => {
      const z = c.zone && c.zone.length > 2 ? c.zone : null, k = keyOf([c.lat, c.lng]) + ":" + (z ? "z" + z.length + "," + z[0].join(",") : c.loadFor || c.flyers);
      if (sideG.has(k)) return sideG.get(k);
      if (sideG.size > 6) sideG.clear();
      const g = await import_planner.default.loadForFlyers([c.lat, c.lng], c.loadFor || c.flyers, { cache, tiles, stale, zone: z, census, progress: (done, total) => {
        if (stage && total > 1) stage("loadingSide|" + done + "|" + total);
      } });
      sideG.set(k, g);
      return g;
    };
    const roadMatrix = async (pts, costing) => {
      try {
        const q = { sources: pts.map((p) => ({ lat: p[0], lon: p[1] })), targets: pts.map((p) => ({ lat: p[0], lon: p[1] })), costing, units: "kilometers" };
        const ctrl = new AbortController(), tm = setTimeout(() => ctrl.abort(), 9e3);
        const r = await fetch("https://valhalla1.openstreetmap.de/sources_to_targets?json=" + encodeURIComponent(JSON.stringify(q)), { signal: ctrl.signal });
        clearTimeout(tm);
        if (!r.ok) return null;
        const j = await r.json();
        const m = j.sources_to_targets;
        if (!Array.isArray(m)) return null;
        return m.map((row) => row.map((c) => c && c.distance != null ? c.distance * 1e3 : null));
      } catch {
        return null;
      }
    };
    const SPEED = { bike: 250, car: 667 };
    const SEQ_MIN = 150;
    const TRAVEL_MIN = 30, EMPTY_GAP = 1e3, EMPTY_GAP_BIKE = 600;
    const segLen = (a, b) => {
      const k = Math.cos(a[0] * Math.PI / 180);
      return 111320 * Math.hypot(b[0] - a[0], (b[1] - a[1]) * k);
    };
    const lpt = (items, n) => {
      const bins = Array.from({ length: n }, () => ({ min: 0, items: [], far: 0 }));
      const fars = items.filter((x) => x.isFar).sort((x, y) => y.min - x.min), rest = items.filter((x) => !x.isFar).sort((x, y) => y.min - x.min);
      const put = (it, among) => {
        const b = among.reduce((m, x) => x.min < m.min ? x : m, among[0]);
        b.items.push(it);
        b.min += it.min;
        if (it.isFar) b.far++;
      };
      fars.forEach((it) => {
        const free = bins.filter((b) => !b.far);
        put(it, free.length ? free : bins);
      });
      rest.forEach((it) => put(it, bins));
      return bins;
    };
    const buildLine = (pieces, hours, rideMin, breaks, origin, hoursToo) => {
      const path = [], steps = [], boxes = [], segMin = [], segMb = [], segSt = [], place = [], cutAt = /* @__PURE__ */ new Set();
      if (origin && pieces.length && segLen(origin, pieces[0].r.path[0]) > 30) {
        path.push([origin[0], origin[1]]);
        segMin.push(0);
        segMb.push(0);
        segSt.push(0);
        place.push("");
      }
      let length_m = 0, street_m = 0, minutes = 0, mailboxes = 0;
      const reserve = [], resSeen = /* @__PURE__ */ new Set();
      for (const [pi, { r, name }] of pieces.entries()) {
        const L = path.length, jump = (!!name || pi === 0) && L > 0;
        if (breaks && breaks.has(pi) && L > 0) cutAt.add(L);
        const tot = r.path.slice(1).reduce((s, q, j) => s + segLen(r.path[j], q), 0) || 1;
        r.path.forEach((q, j) => {
          path.push(j === 0 && jump ? [q[0], q[1], 1] : [q[0], q[1]]);
          const d = j ? segLen(r.path[j - 1], q) : 0;
          segMin.push(j === 0 ? jump ? rideMin ? rideMin(path[L - 1], q) : TRAVEL_MIN : 0 : r.minutes * d / tot);
          segMb.push(j ? (r.mailboxes || 0) * d / tot : 0);
          segSt.push(j ? (r.street_m || 0) * d / tot : 0);
          place.push(name || "");
        });
        (r.steps || []).forEach((st2) => steps.push([st2[0] + L, st2[1], st2[2]]));
        (r.boxes || []).forEach((x) => boxes.push(x));
        for (const x of r.reserve || []) {
          const k = x.p && x.p[0] ? x.p[0].join(",") : "";
          if (k && !resSeen.has(k)) {
            resSeen.add(k);
            reserve.push(x);
          }
        }
        length_m += r.length_m || 0;
        street_m += r.street_m || 0;
        minutes += r.minutes || 0;
        mailboxes += r.mailboxes || 0;
      }
      const lim = hours * 60, days = [];
      let i0 = 0, t = 0, mb = 0, st = 0, ln = 0, pl = /* @__PURE__ */ new Set();
      const close = (i1) => {
        days.push({ i0, i1, minutes: Math.round(t), mailboxes: Math.round(mb), street_m: Math.round(st), length_m: Math.round(ln), place: [...pl].filter(Boolean).join(" + ") || void 0 });
        i0 = i1;
        t = 0;
        mb = 0;
        st = 0;
        ln = 0;
        pl = /* @__PURE__ */ new Set();
      };
      const left = new Float64Array(path.length + 1);
      if (hoursToo) for (let i = path.length - 1; i >= 1; i--) left[i] = segMin[i] + (cutAt.has(i + 1) ? 0 : left[i + 1]);
      for (let i = 1; i < path.length; i++) {
        if ((hoursToo ? cutAt.has(i) || t >= lim && left[i] >= 60 : breaks ? cutAt.has(i) : t >= lim) && t > 0) close(i - 1);
        t += segMin[i];
        mb += segMb[i];
        st += segSt[i];
        ln += path[i][2] === 1 ? 0 : segLen(path[i - 1], path[i]);
        pl.add(place[i]);
      }
      if (t > 0 || !days.length) close(path.length - 1);
      if (!breaks && days.length > 1 && days[days.length - 1].minutes < 45) {
        const x = days.pop(), y = days[days.length - 1];
        y.i1 = x.i1;
        ["minutes", "mailboxes", "street_m", "length_m"].forEach((k) => y[k] += x[k]);
        if (x.place) y.place = [...new Set([...(y.place || "").split(" + "), ...x.place.split(" + ")].filter(Boolean))].join(" + ");
      }
      return { path, steps, boxes, days, length_m, street_m, minutes, mailboxes, reserve: reserve.slice(0, 400) };
    };
    const CORE_T = 25, CORE_MIN = 40, CORE_PARK = 8;
    const denseCores = (g, area) => {
      const n = g.pts.length, uf = Int32Array.from({ length: n }, (_, i) => i), f = (x) => {
        while (uf[x] !== x) {
          uf[x] = uf[uf[x]];
          x = uf[x];
        }
        return x;
      };
      const dense = (e) => e.mb > 0 && (e.len <= 80 || e.mb * 1e3 / e.len >= CORE_T), dn = new Uint8Array(n);
      g.edges.forEach((e) => {
        if (dense(e)) {
          uf[f(e.a)] = f(e.b);
          dn[e.a] = 1;
          dn[e.b] = 1;
        }
      });
      const link = (e) => !dense(e) && e.len <= 60 && dn[e.a] && dn[e.b];
      g.edges.forEach((e) => {
        if (link(e)) uf[f(e.a)] = f(e.b);
      });
      const cl = /* @__PURE__ */ new Map();
      g.edges.forEach((e, i) => {
        if (!dense(e) && !link(e)) return;
        const k = f(e.a);
        let c = cl.get(k);
        if (!c) cl.set(k, c = { area, ids: [], mb: 0, len: 0 });
        c.ids.push(i);
        c.mb += e.mb;
        c.len += e.len;
      });
      return [...cl.values()].filter((c) => c.mb >= CORE_MIN).map((c) => {
        let la = 0, lo = 0, w = 0;
        for (const i of c.ids) {
          const e = g.edges[i];
          la += (g.pts[e.a][0] + g.pts[e.b][0]) / 2 * e.len;
          lo += (g.pts[e.a][1] + g.pts[e.b][1]) / 2 * e.len;
          w += e.len;
        }
        const ctr = [la / w, lo / w];
        let best = -1, bd = Infinity;
        for (const i of c.ids) for (const v of [g.edges[i].a, g.edges[i].b]) {
          const d = segLen(ctr, g.pts[v]);
          if (d < bd) {
            bd = d;
            best = v;
          }
        }
        return { ...c, g, park: [g.pts[best][0], g.pts[best][1]] };
      });
    };
    const subGraph = (g, ids) => {
      const edges = ids.map((i) => g.edges[i]), adj = g.pts.map(() => []);
      edges.forEach((e, i) => {
        adj[e.a].push({ e: i, to: e.b });
        if (e.a !== e.b) adj[e.b].push({ e: i, to: e.a });
      });
      return { pts: g.pts, edges, adj, zoned: true };
    };
    const ECO_K = 1.35;
    const ecoFlyers = (start, F, must, zone) => {
      const pts = [0.8, 0.85, 0.9, 0.95, 1].map((f) => {
        const sel = import_planner.default.selectWithMust(G, start, Math.round(F * f), must, zone);
        const len = sel.ids.reduce((a, i) => a + G.edges[i].len, 0);
        return { mb: sel.mailboxes, min: import_planner.default.routeMinutes(len * 1.35, sel.mailboxes) };
      });
      const base = pts[0].min / Math.max(1, pts[0].mb);
      let best = pts[0];
      for (let i = 1; i < pts.length; i++) {
        const dm = pts[i].mb - pts[0].mb;
        if (dm <= 0 || (pts[i].min - pts[0].min) / dm <= ECO_K * base) best = pts[i];
      }
      return best.mb >= 0.97 * F ? F : Math.max(100, Math.round(best.mb / 50) * 50);
    };
    return {
      // map data around a new start point
      async load({ start, flyers, must, zone }, stage, stale) {
        if (G && gKey === keyOf(start)) return info();
        stage("loadingArea");
        G = null;
        gKey = "";
        await load(start, flyers, void 0, must, stage, stale, "loadingArea", zone);
        return info();
      },
      // plans the routes; loads a larger square first when the plan reaches the edge of what is loaded
      async plan({ start, flyers, n, days, hours, must, zone, side, quota, bike, travel, split, exact, mainAll, cores, together, first, near, mainName }, stage, stale) {
        const eco = !exact && !mainAll;
        const zones = travel === "zones";
        if (cores && !zones) return this.planCores({ start, flyers, n, hours, must, zone, side, travel, together, exact, first }, stage, stale);
        if (!zones) {
          travel = travel === "bike" || travel === "car" ? travel : bike ? "bike" : "bus";
          bike = travel !== "bus";
        }
        import_planner.default.setPace(quota);
        side = (side || []).filter((c) => c && (c.flyers > 0 || split === "even"));
        const bus = [];
        if ((must || []).some((a) => a && a.name && a.p && a.p.length > 2)) {
          if (!G || gKey !== keyOf(start)) {
            stage("loadingArea");
            await load(start, flyers, void 0, must, stage, stale, "loadingArea", zone);
          }
          if (stale()) return { skipped: true };
          const mr = Math.min(import_planner.default.MUST_MAX_R, import_planner.default.mustRadius(start, must));
          if (mr > G.radius) {
            stage("loadingMore");
            await load(start, flyers, mr, must, stage, stale, "loadingMore", zone);
            if (stale()) return { skipped: true };
          }
          const keepMust = [];
          for (const a of must) {
            const gap = a && a.name && a.p && a.p.length > 2 ? import_planner.default.emptyGap(G, start, a.p) : 0;
            if (gap > (bike ? EMPTY_GAP_BIKE : EMPTY_GAP)) {
              const ctr = a.c || a.p.reduce((x, q) => [x[0] + q[0] / a.p.length, x[1] + q[1] / a.p.length], [0, 0]);
              side.push({ name: a.name, lat: ctr[0], lng: ctr[1], flyers: a.n || 1e3, zone: a.p, all: !!a.all });
              bus.push({ name: a.name, gap });
            } else keepMust.push(a);
          }
          must = keepMust;
        }
        let splitInfo = null;
        if (zones) {
          const res = await this.planZones({ start, flyers, n, days, hours, must, zone, side, mainAll, cores, mainName }, stage, stale);
          if (res && res.plan) res.plan.bus = bus;
          return res;
        }
        const seq = split === "even" && !!near && side.length > 0 && !mainAll && !(must || []).some((a) => a && a.name) && !side.some((c) => c.all || c.zone && c.zone.length > 2);
        if (seq) {
          if (!G || gKey !== keyOf(start)) {
            stage("loadingArea");
            await load(start, flyers, void 0, must, stage, stale, "loadingArea", zone);
          }
          if (stale()) return { skipped: true };
          const seen = /* @__PURE__ */ new Set(), keyE = (g, i) => {
            const e = g.edges[i];
            return ((g.pts[e.a][0] + g.pts[e.b][0]) / 2).toFixed(5) + "," + ((g.pts[e.a][1] + g.pts[e.b][1]) / 2).toFixed(5);
          };
          const mainSel = import_planner.default.selectWithMust(G, start, flyers, must, zone), mainMb = Math.min(flyers, Math.round(mainSel.mailboxes));
          mainSel.ids.forEach((i) => seen.add(keyE(G, i)));
          let rest = flyers - mainMb;
          const info2 = /* @__PURE__ */ new Map();
          for (const c of side.slice().sort((x, y) => segLen(start, [x.lat, x.lng]) - segLen(start, [y.lat, y.lng]))) {
            const hh = c.flyers || 0;
            if (rest < SEQ_MIN) {
              c.flyers = 0;
              info2.set(c, { name: c.name, flyers: 0 });
              continue;
            }
            stage("loadingSide");
            c.loadFor = Math.min(rest, Math.max(600, Math.round(hh * 1.3)));
            const g0 = await sideGraph(c, stage, stale);
            if (stale()) return { skipped: true };
            const g = { ...g0, edges: g0.edges.map((e, i) => e.mb && seen.has(keyE(g0, i)) ? { ...e, mb: 0, boxes: [] } : e) };
            const st = import_planner.default.denseEntry(g, start, null, Math.min(300, Math.max(100, rest * 0.2))) || [c.lat, c.lng];
            const cap = Math.round(import_planner.default.selectForFlyers(g, st, 1e9).mailboxes || 0);
            c.flyers = Math.min(cap, rest);
            if (c.flyers < SEQ_MIN) c.flyers = 0;
            if (c.flyers) {
              c.g = g;
              c.st = st;
              import_planner.default.selectWithMust(g, st, c.flyers).ids.forEach((i) => seen.add(keyE(g, i)));
            }
            rest -= c.flyers;
            info2.set(c, { name: c.name, flyers: c.flyers, cap });
          }
          splitInfo = [{ name: null, flyers: mainMb, cap: mainMb }, ...side.map((c) => info2.get(c))];
          side = side.filter((c) => c.flyers > 0);
        } else if (split === "even" && ((must || []).some((a) => a && a.name) || side.length)) {
          if (!G || gKey !== keyOf(start)) {
            stage("loadingArea");
            await load(start, flyers, void 0, must, stage, stale, "loadingArea", zone);
          }
          if (stale()) return { skipped: true };
          const nearM = (must || []).filter((a) => a && a.name && a.p && a.p.length > 2);
          const capNear = nearM.map((a) => import_planner.default.mustPick(G, start, [{ p: a.p, n: 0 }]).info[0].avail);
          const capFar = [];
          for (const c of side) {
            stage("loadingSide");
            c.flyers = c.flyers || flyers;
            const g = await sideGraph(c, stage, stale);
            if (stale()) return { skipped: true };
            capFar.push(c.zone && c.zone.length > 2 ? import_planner.default.mustPick(g, [c.lat, c.lng], [{ p: c.zone, n: 0 }]).info[0].avail : (g.usable != null ? g.usable : g.mailboxes) || 0);
          }
          const capMain = Math.max(0, (G.usable != null ? G.usable : G.mailboxes) - capNear.reduce((a, b) => a + b, 0));
          const caps = [capMain, ...capNear, ...capFar], share = new Array(caps.length).fill(0);
          const fixed = new Set([mainAll ? 0 : -1, ...nearM.map((a, i) => a.all ? 1 + i : -1), ...side.map((c, i) => c.all ? 1 + nearM.length + i : -1)].filter((i) => i >= 0));
          let rest = flyers;
          fixed.forEach((i) => {
            share[i] = caps[i];
            rest -= caps[i];
          });
          rest = Math.max(0, rest);
          let open = caps.map((_, i) => i).filter((i) => !fixed.has(i));
          while (rest > 0 && open.length) {
            const each = rest / open.length, full = open.filter((i) => caps[i] - share[i] <= each);
            if (!full.length) {
              open.forEach((i) => {
                share[i] += each;
              });
              rest = 0;
              break;
            }
            full.forEach((i) => {
              rest -= caps[i] - share[i];
              share[i] = caps[i];
            });
            open = open.filter((i) => !full.includes(i));
          }
          const r50 = (x) => Math.max(0, Math.round(x / 50) * 50);
          const shr = (i) => fixed.has(i) ? Math.round(share[i]) : r50(share[i]);
          nearM.forEach((a, i) => {
            a.n = a.all ? 0 : Math.max(50, shr(1 + i));
          });
          side.forEach((c, i) => {
            c.flyers = shr(1 + nearM.length + i);
          });
          splitInfo = [{ name: null, flyers: r50(share[0]), cap: Math.round(capMain) }, ...nearM.map((a, i) => ({ name: a.name, flyers: shr(1 + i), cap: Math.round(capNear[i]), all: !!a.all })), ...side.map((c, i) => ({ name: c.name, flyers: c.flyers, cap: Math.round(capFar[i]), all: !!c.all }))];
          side = side.filter((c) => c.flyers > 0);
        }
        if (side.length) {
          const res = await this.planSide({ start, flyers, n, days, hours, must, zone, side, bike, travel, eco, mainAll, mainShare: splitInfo ? splitInfo[0].flyers : null, near: seq }, stage, stale);
          if (res && res.plan) {
            res.plan.bus = bus;
            res.plan.split = splitInfo;
            if (seq) res.plan.near = true;
          }
          return res;
        }
        const resM = await this.planMain({ start, flyers, n, days, hours, must, zone, eco, mainAll }, stage, stale);
        if (resM && resM.plan) {
          resM.plan.split = splitInfo;
          if (seq) resM.plan.near = true;
        }
        return resM;
      },
      // only the dense cores of the main area and of every place; cores are taken best first (mailboxes per hour incl. parking)
      // until the flyers are reached; one tour by car through all of them. together: everybody in one car – every core is shared
      // out among the workers, everybody visits the cores in the same order and the days end at the same core for all.
      async planCores({ start, flyers, n, hours, must, zone, side, travel, together, exact, first }, stage, stale) {
        if (!G || gKey !== keyOf(start)) {
          stage("loadingArea");
          await load(start, flyers, void 0, must, stage, stale, "loadingArea", zone);
        }
        if (stale()) return { skipped: true };
        const hasZone = !!(zone && zone.length > 2);
        let all;
        if (hasZone) {
          const gz = import_planner.default.zoneView(G, zone), ids = import_planner.default.selectWithMust(G, start, 1e9, must, zone).ids;
          const mb = ids.reduce((a, i) => a + gz.edges[i].mb, 0), len = ids.reduce((a, i) => a + gz.edges[i].len, 0);
          all = ids.length ? [{ area: null, g: gz, ids, mb, len, park: start, forced: true }] : [];
        } else if (exact) {
          const ids = import_planner.default.selectForFlyers(G, start, flyers).ids;
          const mb = ids.reduce((a, i) => a + G.edges[i].mb, 0), len = ids.reduce((a, i) => a + G.edges[i].len, 0);
          all = ids.length ? [{ area: null, g: G, ids, mb, len, park: start, forced: true }] : [];
        } else all = denseCores(G, null);
        for (const c of side || []) {
          stage("loadingSide");
          const g = await sideGraph({ ...c, flyers: c.flyers || 3e3 }, stage, stale);
          if (stale()) return { skipped: true };
          const z = c.zone && c.zone.length > 2 ? c.zone : null;
          all = all.concat(denseCores(z ? import_planner.default.zoneView(g, z) : g, c.name));
        }
        {
          const seenE = /* @__PURE__ */ new Set(), keyE = (g, i) => {
            const e = g.edges[i];
            return ((g.pts[e.a][0] + g.pts[e.b][0]) / 2).toFixed(5) + "," + ((g.pts[e.a][1] + g.pts[e.b][1]) / 2).toFixed(5);
          };
          all = all.filter((c) => {
            const ids = c.ids.filter((i) => !seenE.has(keyE(c.g, i)));
            if (!c.forced && ids.length < c.ids.length * 0.5) return false;
            ids.forEach((i) => seenE.add(keyE(c.g, i)));
            c.ids = ids;
            c.mb = ids.reduce((a, i) => a + c.g.edges[i].mb, 0);
            c.len = ids.reduce((a, i) => a + c.g.edges[i].len, 0);
            return c.mb >= 10;
          });
        }
        if (!all.length) return { plan: { routes: [], mailboxes: 0, zone: [], cores: [] }, sug: n };
        stage("calculating");
        const K = together ? n : 1;
        const MAXSPAN = Math.min(90, hours * 60 * 0.25), parkOf = (g, ids) => {
          let la = 0, lo = 0, w = 0;
          for (const i of ids) {
            const e = g.edges[i];
            la += (g.pts[e.a][0] + g.pts[e.b][0]) / 2 * e.len;
            lo += (g.pts[e.a][1] + g.pts[e.b][1]) / 2 * e.len;
            w += e.len;
          }
          const ctr = [la / w, lo / w];
          let best = -1, bd = Infinity;
          for (const i of ids) for (const v of [g.edges[i].a, g.edges[i].b]) {
            const d = segLen(ctr, g.pts[v]);
            if (d < bd) {
              bd = d;
              best = v;
            }
          }
          return [g.pts[best][0], g.pts[best][1]];
        };
        const pieces = [];
        for (const c of all) {
          const m = Math.ceil(import_planner.default.routeMinutes(c.len * 1.35, c.mb) / K / MAXSPAN);
          if (m <= 1) {
            if (c.forced) c.park = parkOf(c.g, c.ids);
            pieces.push(c);
            continue;
          }
          const pp = import_planner.default.planFlyers(subGraph(c.g, c.ids), c.park, 1e9, m, { days: 1, hoursPerDay: 99 });
          for (const r of pp.routes) {
            const ids = (r.part || []).map((i) => c.ids[i]);
            if (!ids.length) continue;
            const mb = ids.reduce((a, i) => a + c.g.edges[i].mb, 0);
            if (mb < 10) continue;
            pieces.push({ area: c.area, g: c.g, ids, mb, len: ids.reduce((a, i) => a + c.g.edges[i].len, 0), park: parkOf(c.g, ids), forced: c.forced });
          }
          if (stale()) return { skipped: true };
        }
        all = pieces;
        for (const c of all) {
          const p = import_planner.default.planFlyers(subGraph(c.g, c.ids), c.park, 1e9, Math.max(1, Math.min(K, Math.floor(c.mb / 30))), { days: 1, hoursPerDay: 99 });
          c.routes = p.routes.map(({ part, ...r }) => r);
          c.mb = p.mailboxes;
          c.work = c.routes.reduce((a, r) => a + r.minutes, 0);
          c.span = Math.max(...c.routes.map((r) => r.minutes));
          c.score = c.mb / (c.work + CORE_PARK * c.routes.length);
          if (stale()) return { skipped: true };
        }
        const near = (c) => c.score / (1 + segLen(start, c.park) / 2e4);
        all.sort((a, b) => (b.forced ? 1 : 0) - (a.forced ? 1 : 0) || near(b) - near(a));
        const chosen = all.filter((c) => c.forced);
        let sum = chosen.reduce((a, c) => a + c.mb, 0);
        const capOf = {};
        let capSum = 0;
        for (const c of side || []) if (c.flyers > 0) {
          capOf[c.name] = c.flyers;
          capSum += c.flyers;
        }
        if (capSum && capSum < flyers) capOf[""] = flyers - capSum;
        const got = {};
        chosen.forEach((c) => {
          const k = c.area || "";
          got[k] = (got[k] || 0) + c.mb;
        });
        for (const c of all) {
          if (c.forced) continue;
          if (sum >= flyers) break;
          const k = c.area || "";
          if (capSum && capOf[k] != null && (got[k] || 0) + c.mb > capOf[k] * 1.1 + 30) continue;
          got[k] = (got[k] || 0) + c.mb;
          if (!exact && sum >= 0.8 * flyers && c.score < 0.55 * sum / chosen.reduce((a, x) => a + x.work + CORE_PARK * x.routes.length, 0)) break;
          chosen.push(c);
          sum += c.mb;
        }
        const cnt = {};
        chosen.forEach((c) => {
          const k = c.area || "";
          cnt[k] = (cnt[k] || 0) + 1;
        });
        const seen = {};
        chosen.forEach((c) => {
          const k = c.area || "";
          seen[k] = (seen[k] || 0) + 1;
          c.name = (c.area || t0(c)) + (cnt[k] > 1 ? " " + seen[k] : "");
        });
        function t0(c) {
          const r = c.routes[0], st = (r.steps || []).find((x) => x[2]);
          return st ? st[2] : "Kern";
        }
        {
          const kE = (g, i) => {
            const e = g.edges[i];
            return ((g.pts[e.a][0] + g.pts[e.b][0]) / 2).toFixed(5) + "," + ((g.pts[e.a][1] + g.pts[e.b][1]) / 2).toFixed(5);
          };
          const taken = /* @__PURE__ */ new Set();
          chosen.forEach((c) => c.ids.forEach((i) => taken.add(kE(c.g, i))));
          for (const g of new Set(chosen.map((c) => c.g))) {
            const cs = chosen.filter((c) => c.g === g), used = new Set(cs.flatMap((c) => c.ids));
            import_planner.default.reserveFor(g, used, cs.flatMap((c) => c.routes), { skip: (i) => taken.has(kE(g, i)) });
          }
          if (stale()) return { skipped: true };
        }
        let tour = [], left = chosen.slice(), at = start, origin = start;
        const firstCores = first ? left.filter((c) => (c.area || "") === first) : [];
        if (firstCores.length) {
          const f0 = firstCores.reduce((b, c) => segLen(start, c.park) < segLen(start, b.park) ? c : b);
          left.splice(left.indexOf(f0), 1);
          tour.push(f0);
          at = f0.park;
        }
        while (left.length) {
          let bi = 0;
          left.forEach((x2, i) => {
            if (segLen(at, x2.park) < segLen(at, left[bi].park)) bi = i;
          });
          const x = left.splice(bi, 1)[0];
          tour.push(x);
          at = x.park;
        }
        const tl = (tr) => tr.reduce((a, x, i) => a + segLen(i ? tr[i - 1].park : origin, x.park), 0), i0 = firstCores.length ? 1 : 0;
        for (let improved = true, guard = 0; improved && guard < 60; guard++) {
          improved = false;
          for (let i = i0; i < tour.length - 1; i++) for (let j = i + 1; j < tour.length; j++) {
            const c2 = [...tour.slice(0, i), ...tour.slice(i, j + 1).reverse(), ...tour.slice(j + 1)];
            if (tl(c2) < tl(tour) - 1) {
              tour = c2;
              improved = true;
            }
          }
        }
        let mat = null;
        const mPts = [start, ...tour.map((x) => x.park)];
        if (travel !== "bus" && mPts.length <= 50) {
          stage("loadingSide");
          mat = await roadMatrix(mPts, travel === "car" ? "auto" : "bicycle");
          if (stale()) return { skipped: true };
        }
        const ride = (a, b) => {
          if (travel === "bus") return TRAVEL_MIN;
          const i = mPts.findIndex((q) => q === a || q[0] === a[0] && q[1] === a[1]), j = mPts.findIndex((q) => q === b || q[0] === b[0] && q[1] === b[1]);
          const road = mat && i >= 0 && j >= 0 && mat[i][j] != null ? mat[i][j] : segLen(a, b) * 1.3;
          return 5 + road / SPEED[travel === "car" ? "car" : "bike"];
        };
        let routes;
        if (together) {
          const breaks = /* @__PURE__ */ new Set();
          let tday = 0;
          tour.forEach((c, k) => {
            const add = (k ? ride(tour[k - 1].park, c.park) : 0) + c.span;
            if (k && tday + add > hours * 60 + 20) {
              breaks.add(k);
              tday = c.span;
            } else tday += add;
          });
          routes = Array.from({ length: n }, (_, w) => buildLine(tour.filter((c) => c.routes[w]).map((c) => ({ r: c.routes[w], name: c.name })), hours, (a, b) => ride(a, b), new Set([...breaks].map((k) => tour.slice(0, k).filter((c) => c.routes[w]).length)), start)).map((r, i) => ({ idx: i, ...r }));
        } else {
          const vill = [];
          {
            let prev = start;
            tour.forEach((x) => {
              vill.push({ min: x.work + ride(prev, x.park), x });
              prev = x.park;
            });
          }
          const P2 = [0];
          vill.forEach((v) => P2.push(P2[P2.length - 1] + v.min));
          const parts = [];
          let from = 0;
          for (let w = 0; w < n; w++) {
            const goal = P2[P2.length - 1] * (w + 1) / n;
            let to = from;
            while (to < vill.length && (w === n - 1 || P2[to + 1] - vill[to].min / 2 <= goal)) to++;
            parts.push(vill.slice(from, to));
            from = to;
          }
          routes = parts.filter((p) => p.length).map((p, i) => ({ idx: i, ...buildLine(p.map((v) => ({ r: v.x.routes[0], name: v.x.name })), hours, (a, b) => ride(a, b), null, start) }));
        }
        const plan = { routes, mailboxes: Math.round(sum), zone: [], cores: tour.map((c) => ({ name: c.name, mb: Math.round(c.mb), c: c.park, min: Math.round(c.span) })), road_km: !!mat, side_info: [], side_failed: [], must_mb: 0, must_info: [] };
        plan.capacity = import_planner.default.capacity(routes, flyers);
        if (!exact && sum < flyers) plan.eco = { asked: flyers, used: Math.round(sum) };
        return { plan, sug: n, street_m: Math.round(chosen.reduce((a, c) => a + c.len, 0)) };
      },
      async planSide({ start, flyers, n, days, hours, must, zone, side, bike, travel, eco, mainAll, mainShare, near }, stage, stale) {
        const team = !!near && n > 1;
        const far = [], failed = [];
        for (const c of side) {
          stage("loadingSide");
          const g = c.g || await sideGraph(c, stage, stale);
          if (stale()) return { skipped: true };
          const z = c.zone && c.zone.length > 2 ? c.zone : null, st = c.st || import_planner.default.denseEntry(g, start, z, Math.min(300, Math.max(100, c.flyers * 0.2))) || [c.lat, c.lng];
          const p = import_planner.default.planFlyers(g, st, c.flyers, team ? n : 1, { days: 1, hoursPerDay: hours, zone: z });
          const rs = (p && p.routes || []).filter((r) => r.path && r.path.length > 1).map(({ part, ...r }) => r);
          if (!rs.length) {
            failed.push(c.name);
            continue;
          }
          far.push({ c, r: rs[0], rs, min: Math.max(...rs.map((r) => r.minutes)), mb: p.mailboxes });
        }
        let mainFlyers = Math.max(100, flyers - far.reduce((s, x) => s + x.c.flyers, 0));
        if (!far.length) {
          const r1 = await this.planMain({ start, flyers, n, days, hours, must, zone, eco, mainAll }, stage, stale);
          if (r1 && r1.plan) r1.plan.side_failed = failed;
          return r1;
        }
        let mainEco = null;
        if (eco && !(zone && zone.length > 2)) {
          if (!G || gKey !== keyOf(start)) {
            stage("loadingArea");
            await load(start, mainFlyers, void 0, must, stage, stale, "loadingArea", zone);
          }
          const ef = ecoFlyers(start, mainFlyers, must, zone);
          if (ef < mainFlyers) {
            mainEco = { asked: mainFlyers, used: ef };
            mainFlyers = ef;
          }
        }
        let res = await this.planMain({ start, flyers: mainFlyers, n, days: 1, hours, must, zone, mainAll }, stage, stale);
        if (!res || res.skipped) return res;
        const M = res.plan.routes.reduce((s, r) => s + r.minutes, 0);
        const ent = (x) => x.r.path[0], ext = (x) => x.r.path[x.r.path.length - 1];
        let tour = [], left = [...far], at = start;
        while (left.length) {
          let bi = 0;
          left.forEach((x2, i) => {
            if (segLen(at, ent(x2)) < segLen(at, ent(left[bi]))) bi = i;
          });
          const x = left.splice(bi, 1)[0];
          tour.push(x);
          at = ext(x);
        }
        const tourLen = (tr) => tr.reduce((s, x, i) => s + segLen(i ? ext(tr[i - 1]) : start, ent(x)), 0);
        for (let improved = true, guard = 0; improved && guard < 50; guard++) {
          improved = false;
          for (let i = 0; i < tour.length - 1; i++) for (let j = i + 1; j < tour.length; j++) {
            const cand = [...tour.slice(0, i), ...tour.slice(i, j + 1).reverse(), ...tour.slice(j + 1)];
            if (tourLen(cand) < tourLen(tour) - 1) {
              tour = cand;
              improved = true;
            }
          }
        }
        let mat = null;
        const mPts = [start, ...far.map((x) => ent(x))], idx = (p) => mPts.findIndex((q) => Math.abs(q[0] - p[0]) < 1e-7 && Math.abs(q[1] - p[1]) < 1e-7);
        if (travel !== "bus" && far.length) {
          stage("loadingSide");
          mat = await roadMatrix(mPts, travel === "car" ? "auto" : "bicycle");
          if (stale()) return { skipped: true };
        }
        const ride = (a, b) => {
          if (travel === "bus") return TRAVEL_MIN;
          const i = idx(a), j = idx(b), road = mat && i >= 0 && j >= 0 && mat[i][j] != null ? mat[i][j] : segLen(a, b) * 1.3;
          return 5 + road / SPEED[travel];
        };
        const vill = [];
        {
          let prev = start;
          tour.forEach((x) => {
            vill.push({ min: x.min + ride(prev, ent(x)), far: x });
            prev = ext(x);
          });
        }
        const lim = hours * 60, after = (m) => {
          if (m <= lim + 60) return m;
          const r = m % lim;
          return r < 60 ? lim : r;
        };
        const dayStarts = (t0, mins) => {
          const out = /* @__PURE__ */ new Set();
          let t = t0;
          mins.forEach((m, k) => {
            if (t > 0 && t + m > lim + 20 && m <= lim + 20) {
              out.add(k);
              t = m;
            } else t = after(t + m);
          });
          return out;
        };
        if (team) {
          const mains = res.plan.routes, starts = dayStarts(after(Math.max(0, ...mains.map((r) => r.minutes))), vill.map((v) => v.min));
          const lines = [];
          for (let w = 0; w < n; w++) {
            const pieces = mains[w] ? [{ r: mains[w], name: null }] : [], br = /* @__PURE__ */ new Set();
            tour.forEach((x, k) => {
              if (!x.rs[w]) return;
              if (starts.has(k)) br.add(pieces.length);
              pieces.push({ r: x.rs[w], name: x.c.name });
            });
            if (pieces.length) lines.push(buildLine(pieces, hours, ride, br, null, true));
          }
          if (mainEco) res.plan.eco = mainEco;
          res.plan.routes = lines.map((r, k) => ({ idx: k, ...r }));
          res.plan.road_km = mat ? true : false;
          res.plan.mailboxes += far.reduce((s, x) => s + x.mb, 0);
          res.plan.side_failed = failed;
          res.plan.side_info = [];
          res.plan.team = far.map((x) => x.c.name);
          res.plan.capacity = import_planner.default.capacity(res.plan.routes, flyers);
          res.sug = Math.min(20, import_planner.default.suggestWorkers(res.plan.routes.reduce((s, r) => s + r.minutes, 0), hours, days));
          return res;
        }
        const cut = (items, n2) => {
          const m = items.length, P = [0];
          items.forEach((x) => P.push(P[P.length - 1] + x.min));
          const k = Math.min(n2, m);
          if (!k) return Array.from({ length: n2 }, () => []);
          const dp = Array.from({ length: k + 1 }, () => new Array(m + 1).fill(Infinity)), at2 = Array.from({ length: k + 1 }, () => new Array(m + 1).fill(0));
          dp[0][0] = 0;
          for (let j = 1; j <= k; j++) for (let i2 = j; i2 <= m; i2++) for (let p = j - 1; p < i2; p++) {
            const v = Math.max(dp[j - 1][p], P[i2] - P[p]);
            if (v < dp[j][i2]) {
              dp[j][i2] = v;
              at2[j][i2] = p;
            }
          }
          const parts = [];
          let i = m;
          for (let j = k; j >= 1; j--) {
            const p = at2[j][i];
            parts.unshift(items.slice(p, i));
            i = p;
          }
          while (parts.length < n2) parts.push([]);
          return parts;
        };
        const vparts = cut(vill, n);
        const share = (mains) => {
          const bins2 = vparts.map((p) => ({ min: p.reduce((s, x) => s + x.min, 0), mains: [], vill: p }));
          [...mains].sort((x, y) => y.minutes - x.minutes).forEach((r) => {
            const b = bins2.reduce((m, x) => x.min < m.min ? x : m, bins2[0]);
            b.mains.push(r);
            b.min += r.minutes;
          });
          return bins2;
        };
        let bestK = n, bestMax = Infinity;
        for (let k = n; k <= 3 * n; k++) {
          const mx = Math.max(...share(Array.from({ length: k }, () => ({ minutes: M / k }))).map((b) => b.min));
          if (mx < bestMax - 15) {
            bestMax = mx;
            bestK = k;
          }
        }
        if (bestK !== n) {
          stage("calculating");
          const r2 = await this.planMain({ start, flyers: mainFlyers, n: bestK, days: 1, hours, must, zone, mainAll }, stage, stale);
          if (!r2 || r2.skipped) return r2;
          res = r2;
        }
        if (mainEco) res.plan.eco = mainEco;
        const bins = share(res.plan.routes).filter((b) => b.mains.length || b.vill.length).map((b) => ({ ...b, items: b.vill }));
        res.plan.routes = bins.map((b, k) => {
          const br = dayStarts(after(b.mains.reduce((s, r) => s + r.minutes, 0)), b.vill.map((x) => x.min));
          return { idx: k, ...buildLine([...b.mains.map((r) => ({ r, name: null })), ...b.vill.map((x) => ({ r: x.far.r, name: x.far.c.name }))], hours, ride, new Set([...br].map((i) => i + b.mains.length)), null, true) };
        });
        res.plan.road_km = mat ? true : false;
        res.plan.mailboxes += far.reduce((s, x) => s + x.mb, 0);
        res.plan.side_failed = failed;
        res.plan.side_info = far.map((x) => ({ name: x.c.name, mailboxes: x.mb, worker: bins.findIndex((b) => b.items.some((i) => i.far === x)) }));
        res.plan.capacity = import_planner.default.capacity(res.plan.routes, flyers);
        res.sug = Math.min(20, import_planner.default.suggestWorkers(res.plan.routes.reduce((s, r) => s + r.minutes, 0), hours, days));
        return res;
      },
      // Zones (new orders): every place is planned on its own, on foot, and shared out among all workers – everyone gets a zone
      // in every place (a small place: one person). Nothing is drawn or counted between the places: people drive there themselves,
      // like the hand-made Weidenberg order (one order per town, joined). Each route = one place × one person: r.place, r.w.
      // cores: in every place only its dense streets (Ortskerne), thin outskirts and the roads between hamlets are left out.
      async planZones({ start, flyers, n, days, hours, must, zone, side, mainAll, cores, mainName }, stage, stale) {
        const maxDays = Math.max(1, Math.min(14, days || 1)), routes = [], failed = [], split = [];
        let mb = 0, rest = flyers;
        const view = (g, mask) => {
          const cv = cores ? new Set(denseCores(g, null).flatMap((c) => c.ids)) : null;
          return { ...g, zoned: g.zoned || !!mask, edges: g.edges.map((e, i) => {
            if (!e.mb) return e;
            const m = e.coords && e.coords[Math.floor(e.coords.length / 2)], mid = m || g.pts[e.a];
            return mask && !mask.inside(mid[0], mid[1]) || cv && !cv.has(i) ? { ...e, mb: 0, boxes: [] } : e;
          }) };
        };
        const maskOf = async (lat, lng) => {
          try {
            return await placeMask(lat, lng);
          } catch {
            return null;
          }
        };
        const load0 = (k) => routes.filter((x) => x.w === k).reduce((a, x) => a + x.minutes, 0);
        const people = (m) => Math.max(1, Math.min(n, Math.floor(m / 150)));
        const whom = (k) => Array.from({ length: n }, (_, i) => i).sort((a, b) => load0(a) - load0(b)).slice(0, k).sort((a, b) => a - b);
        const seen = /* @__PURE__ */ new Set(), keyE = (g, i) => {
          const e = g.edges[i];
          return ((g.pts[e.a][0] + g.pts[e.b][0]) / 2).toFixed(5) + "," + ((g.pts[e.a][1] + g.pts[e.b][1]) / 2).toFixed(5);
        };
        const planPlace = async (g0, st, name, ask, zn, isMain, mask) => {
          stage("calculating");
          const g = { ...g0, edges: g0.edges.map((e, i) => e.mb && seen.has(keyE(g0, i)) ? { ...e, mb: 0, boxes: [] } : e) };
          const cap = Math.round(import_planner.default.selectWithMust(g, st, 1e9, isMain ? must : [], zn).mailboxes || 0);
          const want = Math.min(cap, ask != null ? ask : rest, rest);
          split.push({ name, flyers: want, cap, hh: mask ? mask.households : null });
          if (want < SEQ_MIN && !(isMain && want > 0)) return;
          const p = import_planner.default.planFlyers(g, st, want, people(want), { days: maxDays, hoursPerDay: hours, must: isMain ? must : void 0, zone: zn });
          const rs = (p && p.routes || []).filter((r) => r.path && r.path.length > 1).map(({ part, ...r }) => r);
          if (!rs.length) {
            failed.push(name);
            return;
          }
          const ws = whom(rs.length);
          rs.forEach((r, k) => {
            r.place = name || "";
            r.w = ws[k];
            (r.days || []).forEach((d) => {
              d.place = name || void 0;
            });
            routes.push(r);
          });
          import_planner.default.selectWithMust(g, st, want, isMain ? must : [], zn).ids.forEach((i) => seen.add(keyE(g, i)));
          mb += p.mailboxes || 0;
          rest -= Math.round(p.mailboxes || 0);
        };
        if (!G || gKey !== keyOf(start)) {
          stage("loadingArea");
          await load(start, Math.max(flyers, 2e3), void 0, must, stage, stale, "loadingArea", zone);
        }
        if (stale()) return { skipped: true };
        const hasZone = !!(zone && zone.length > 2);
        const mMask = hasZone ? null : await maskOf(start[0], start[1]);
        const gm = view(G, mMask);
        let st0 = start;
        if (mMask) {
          const at = (s0) => import_planner.default.selectWithMust(gm, s0, 1e9, must, null).mailboxes || 0, a = at(start);
          const c0 = import_planner.default.denseEntry(gm, mMask.centre, null, 150) || mMask.centre;
          if (at(c0) > a * 1.3) st0 = c0;
        }
        await planPlace(gm, st0, mainName || "", mainAll ? 1e9 : null, hasZone ? zone : null, true, mMask);
        if (stale()) return { skipped: true };
        for (const c of side || []) {
          if (rest < SEQ_MIN) {
            split.push({ name: c.name, flyers: 0, cap: null });
            continue;
          }
          const zn = c.zone && c.zone.length > 2 ? c.zone : null;
          stage("loadingSide");
          c.loadFor = Math.max(600, Math.round(Math.min(rest, c.flyers || rest) * 1.3));
          const g0 = await sideGraph({ ...c, flyers: c.loadFor }, stage, stale);
          if (stale()) return { skipped: true };
          const mask = zn ? null : await maskOf(c.lat, c.lng);
          const g = view(g0, mask);
          let st = import_planner.default.denseEntry(g, start, zn, Math.min(300, Math.max(100, rest * 0.2))) || [c.lat, c.lng];
          if (mask) {
            const at = (s0) => import_planner.default.selectWithMust(g, s0, 1e9, [], zn).mailboxes || 0, c0 = import_planner.default.denseEntry(g, mask.centre, zn, 150) || mask.centre;
            if (at(c0) > at(st) * 1.3) st = c0;
          }
          await planPlace(g, st, c.name, c.all ? 1e9 : c.auto ? null : c.flyers || null, zn, false, mask);
          if (stale()) return { skipped: true };
        }
        routes.forEach((r, i) => {
          r.idx = i;
        });
        const perW = Array.from({ length: n }, (_, k) => load0(k));
        const plan = { routes, mailboxes: Math.round(mb), zone: [], zones: true, split, side_failed: failed, side_info: [], must_mb: 0, must_info: [], per_worker: perW };
        plan.capacity = import_planner.default.capacity(perW.map((m, k) => ({ idx: k, minutes: m })), flyers, { hoursPerDay: hours, days });
        const sug = Math.min(20, import_planner.default.suggestWorkers(perW.reduce((a, b) => a + b, 0), hours, days));
        return { plan, sug, street_m: G.street_m };
      },
      async planMain({ start, flyers, n, days, hours, must, zone, eco, mainAll }, stage, stale) {
        if (!G || gKey !== keyOf(start)) {
          stage("loadingArea");
          await load(start, flyers, void 0, must, stage, stale, "loadingArea", zone);
        }
        if (stale()) return { skipped: true };
        const hasZone = !!(zone && zone.length > 2);
        const mr = Math.min(import_planner.default.MUST_MAX_R, Math.max(import_planner.default.mustRadius(start, must), hasZone ? import_planner.default.mustRadius(start, [zone]) : 0));
        if (mr > G.radius) {
          stage("loadingMore");
          await load(start, flyers, mr, must, stage, stale, "loadingMore", zone);
          if (stale()) return { skipped: true };
        }
        const reach = import_planner.default.selectWithMust(G, start, flyers, must, zone).reach_m;
        G.reach = reach;
        if (!hasZone && ((G.usable != null ? G.usable : G.mailboxes) < flyers * 1.05 || reach > 0.65 * G.radius) && G.radius < import_planner.default.MAX_R) {
          stage("loadingMore");
          const keep = G;
          try {
            await load(start, flyers, import_planner.default.nextRadius(G, flyers), must, stage, stale, "loadingMore", zone);
          } catch (e) {
            G = keep;
            gKey = keyOf(start);
          }
          if (stale()) return { skipped: true };
        }
        stage("calculating");
        let ecoInfo = null;
        if (mainAll && hasZone) flyers = Math.max(100, import_planner.default.selectWithMust(G, start, 1e9, must, zone).mailboxes);
        else if (eco && !hasZone) {
          const ef = ecoFlyers(start, flyers, must, zone);
          if (ef < flyers) {
            ecoInfo = { asked: flyers, used: ef };
            flyers = ef;
          }
        }
        const sel = import_planner.default.selectWithMust(G, start, flyers, must, zone);
        const sug = Math.min(20, import_planner.default.suggestWorkers(import_planner.default.routeMinutes(sel.ids.reduce((s, i) => s + G.edges[i].len, 0) * 1.35, sel.mailboxes), hours, days));
        if (stale()) return { skipped: true };
        const plan = import_planner.default.planFlyers(G, start, flyers, n, { days, hoursPerDay: hours, must, zone });
        plan.routes = plan.routes.map(({ part, ...r }) => r);
        if (ecoInfo) plan.eco = ecoInfo;
        return { plan, sug, street_m: G.street_m };
      }
    };
  }

  // ../tools/serverplan/entry.mjs
  var import_planner2 = __toESM(require_planner(), 1);
  globalThis.FMRun = async (req) => {
    const start = req.start, flyers = req.flyers, svc = createPlanService(null), log = [], side = [];
    const plan = () => svc.plan({
      start,
      flyers,
      n: req.n || 2,
      days: req.days || 2,
      hours: req.hours || 7,
      quota: req.quota || 2500,
      travel: req.travel || "bus",
      bike: req.travel === "bike",
      split: "even",
      exact: true,
      mainAll: false,
      mainName: req.mainName || "Start",
      cores: !!req.cores,
      together: false,
      first: null,
      near: side.length > 0,
      must: [],
      zone: null,
      side: side.map((x) => ({ name: x.name, lat: x.lat, lng: x.lng, flyers: x.flyers, zone: null, all: false }))
    }, () => {
    }, () => false);
    if (req.debug) {
      const m = await placeMask(start[0], start[1]);
      log.push("mask " + (m ? m.households + " hh, " + m.cells + " cells" : "none"));
      const G0 = await import_planner2.default.loadForFlyers(start, flyers, { census: censusSource() });
      let tot = 0, ins = 0;
      G0.edges.forEach((e) => {
        if (e.mb > 0) {
          const c = e.coords[Math.floor(e.coords.length / 2)];
          tot += e.mb;
          if (m && m.inside(c[0], c[1])) ins += e.mb;
        }
      });
      log.push("graph mb " + Math.round(tot) + " inside " + Math.round(ins) + " r " + G0.radius);
      const gv = { ...G0, zoned: true, edges: G0.edges.map((e) => {
        const c = e.coords && e.coords[Math.floor(e.coords.length / 2)];
        return e.mb && m && !m.inside(c[0], c[1]) ? { ...e, mb: 0, boxes: [] } : e;
      }) };
      const st = import_planner2.default.denseEntry(gv, start, null, 150);
      log.push("entry " + JSON.stringify(st) + " sel " + Math.round(import_planner2.default.selectWithMust(gv, st || start, 1e9, [], null).mailboxes) + " sel@start " + Math.round(import_planner2.default.selectWithMust(gv, start, 1e9, [], null).mailboxes) + " sel@centre " + (m ? Math.round(import_planner2.default.selectWithMust(gv, import_planner2.default.denseEntry(gv, m.centre, null, 150) || m.centre, 1e9, [], null).mailboxes) + " " + JSON.stringify(m.centre) : ""));
    }
    let res = await plan();
    log.push("walk " + res.plan.mailboxes);
    const hav = (a, b, c, d) => 111320 * Math.hypot(c - a, (d - b) * Math.cos(a * Math.PI / 180));
    for (let round = 1; round <= 3 && res.plan.mailboxes < flyers * 0.95; round++) {
      const need = flyers - res.plan.mailboxes;
      let towns = await townsAround(start[0], start[1], 2500, 3e4);
      const big = towns.filter((c) => c.households >= 300);
      if (big.length) towns = big;
      if (req.travel === "zones") towns = towns.filter((c) => c.dist <= 25e3).sort((a, b) => b.dense / (1 + b.dist / 12e3) - a.dense / (1 + a.dist / 12e3));
      const pick = [];
      let got = 0;
      for (const c of towns) {
        if (got >= need * 1.1 || pick.length >= 4) break;
        if (side.some((x) => hav(x.lat, x.lng, c.lat, c.lng) < 1500)) continue;
        pick.push(c);
        got += c.households * 0.9;
      }
      if (!pick.length) break;
      pick.forEach((c) => side.push({ name: "Ort " + (side.length + 1), lat: c.lat, lng: c.lng, flyers: c.households, km: Math.round(c.dist / 100) / 10, auto: true }));
      res = await plan();
      log.push("round " + round + " +" + pick.length + " -> " + res.plan.mailboxes);
    }
    let streets = null;
    if (req.dump) {
      streets = [];
      const census2 = censusSource(), sp = res.plan.split || [];
      const add = (g) => g.edges.forEach((e) => {
        if (e.mb > 0 && e.coords) streets.push([Math.round(e.mb), ...e.coords.flatMap((c) => [+c[0].toFixed(5), +c[1].toFixed(5)])]);
      });
      add(await import_planner2.default.loadForFlyers(start, flyers, { census: census2 }));
      for (const x of side) {
        const f = (sp.find((y) => y.name === x.name) || {}).flyers;
        if (f > 0) add(await import_planner2.default.loadForFlyers([x.lat, x.lng], f, { census: census2 }));
      }
    }
    let places = null;
    if (res.plan.zones) {
      places = [];
      for (const name of [...new Set(res.plan.routes.map((r) => r.place))]) {
        const rs = res.plan.routes.filter((r) => r.place === name), c = await compare(rs.flatMap((r) => r.boxes || []));
        places.push({ name, routes: rs.length, mailboxes: Math.round(rs.reduce((a, r) => a + r.mailboxes, 0)), census: c && c.households, minutes: Math.round(rs.reduce((a, r) => a + r.minutes, 0)), km: Math.round(rs.reduce((a, r) => a + r.length_m, 0) / 100) / 10, reserve: rs.reduce((a, r) => a + (r.reserve || []).length, 0) });
      }
    }
    const all = await compare(res.plan.routes.flatMap((r) => r.boxes || []));
    return { log, places, census: all, side, sug: res.sug, street_m: res.street_m, plan: res.plan, streets };
  };
})();
