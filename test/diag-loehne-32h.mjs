// Diagnosis Löhne 32 h (27.11.2026): "Maximum Flyer für die Arbeitszeit", 2 people, start Obernbeck. Cem marked three parts of
// the route (white) and three residential quarters (black) to take instead. Criterion: flyers in the same 32 h, walks included.
// Each variant: the white part is left out, the black quarter is forced in, and the team is filled up to 32 h again by walking
// distance from the flag (the same rule as the planner) – then split between the two people as usual (#63).
// Real map data (OSM © OpenStreetMap contributors, ODbL; Zensus 2022 dl-de/by-2-0).   node test/diag-loehne-32h.mjs [--svg DIR]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import Planner from '../admin/planner.js';
import { createPlanService } from '../worker/src/plancore.js';
import { outwardStreetOrder } from '../worker/src/nearfirst.js';

const START = [52.206232, 8.699767], N = 2, TEAM_H = 32, DAYS = 7, HPD = 8, QUOTA = 3000;
const svgAt = process.argv.indexOf('--svg'), svgDir = svgAt > 0 ? process.argv[svgAt + 1] : null;
const ZENSUS = new URL('../admin/zensus/', import.meta.url);
const tiles = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/loehne-2026-11-27.json.gz', import.meta.url)))).tiles;
const respond = (buf, status = 200) => ({ ok:status === 200, status, arrayBuffer:async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) });
globalThis.fetch = async url => { url = String(url);
  if(url.includes('/flyermap/zensus/')){ const f = new URL(url.split('/').pop(), ZENSUS); return existsSync(f) ? respond(readFileSync(f)) : respond(new Uint8Array(0), 404); }
  if(url.startsWith(Planner.TILES_URL)){ const k = url.slice(Planner.TILES_URL.length).split('?')[0]; return tiles[k] ? respond(new Uint8Array(Buffer.from(tiles[k], 'base64'))) : respond(new Uint8Array(0), 404); }
  throw new Error('offline: ' + url.slice(0, 60)); };

// areas: [south-west corner, north-east corner] (lat, lng). WHITE = parts of the current route, BLACK = quarters to take instead.
export const AREAS = JSON.parse(process.env.AREAS || 'null') || {
  white:[],   // filled in from Cem's map
  black:[
    { name:'Häver', box:[[52.212, 8.640], [52.224, 8.671]] },
    { name:'Westscheid', box:[[52.2255, 8.692], [52.2365, 8.713]] },
    { name:'An der Bahn (Süd)', box:[[52.185, 8.676], [52.1915, 8.712]] },
  ] };

const svc = createPlanService(null), t0 = Date.now();
const base = (await svc.plan({ start:START, flyers:0, n:N, days:DAYS, hours:HPD, quota:QUOTA, travel:'zones', split:'even', exact:true, mainName:'Löhne',
  budget:{ on:true, strategy:'near-first', mode:'walk', hours:TEAM_H, tolerance:0, maxFlyers:10000 } }, () => {}, () => false)).plan;
const baseMs = Date.now() - t0, G = svc._graph();
Planner.setPace(QUOTA);
const seg = (a, b) => 111320 * Math.hypot(b[0] - a[0], (b[1] - a[1]) * Math.cos(a[0] * Math.PI / 180));
const mid = i => { const c = G.edges[i].coords; return c[Math.floor(c.length / 2)]; };
const inBox1 = (p, B) => p[0] >= B[0][0] && p[0] <= B[1][0] && p[1] >= B[0][1] && p[1] <= B[1][1];
const inBox = (p, B) => Array.isArray(B[0][0]) ? B.some(b => inBox1(p, b)) : inBox1(p, B);   // one box or a list of boxes
// walking distance from the flag
const root = (() => { let best = -1, bd = Infinity; G.pts.forEach((p, i) => { if(!G.adj[i].length) return; const d = seg(p, START); if(d < bd){ bd = d; best = i; } }); return best; })();
const dist = new Float64Array(G.pts.length).fill(Infinity); dist[root] = 0;
{ const heap = [[0, root]]; while(heap.length){ let bi = 0; for(let q = 1; q < heap.length; q++) if(heap[q][0] < heap[bi][0]) bi = q; const [d, v] = heap.splice(bi, 1)[0]; if(d > dist[v]) continue;
  for(const { e, to } of G.adj[v]){ const nd = d + G.edges[e].len; if(nd < dist[to]){ dist[to] = nd; heap.push([nd, to]); } } } }
const dOf = i => Math.min(dist[G.edges[i].a], dist[G.edges[i].b]);
// path pieces → edges (to split a route's walking into delivering and walking through)
const ekey = (p, q) => p[0].toFixed(5) + ',' + p[1].toFixed(5) + '|' + q[0].toFixed(5) + ',' + q[1].toFixed(5);
const edgeAt = new Map(); G.edges.forEach((e, i) => { const c = e.coords; for(let k = 1; k < c.length; k++){ edgeAt.set(ekey(c[k - 1], c[k]), i); edgeAt.set(ekey(c[k], c[k - 1]), i); } });

const opt = { days:1, hoursPerDay:TEAM_H * 60, walkTree:Planner.walkingTreeCache(), compact:true };
const route = ids => Planner.planFlyers(G, START, Infinity, N, { ...opt, selectedEdgeIds:ids }).routes;
const minutes = rs => rs.reduce((a, r) => a + r.minutes, 0);
// fill up to 32 h: forced streets first, then by walking distance (like the planner), binary search on the count
function fill(forced, banned){
  const ban = new Set(banned), force = forced.filter(i => !ban.has(i)), fs = new Set(force);
  const order = outwardStreetOrder(G, START).streets.map(q => q.i).filter(i => !ban.has(i) && !fs.has(i));
  let lo = 0, hi = order.length, best = null;
  while(lo <= hi){ const k = (lo + hi) >> 1, ids = [...force, ...order.slice(0, k)], rs = route(ids);
    if(minutes(rs) <= TEAM_H * 60 && rs.every(r => r.minutes <= DAYS * HPD * 60)){ best = { ids, rs }; lo = k + 1; } else hi = k - 1; }
  return best;
}
function stats(rs){
  const own = new Map(); rs.forEach((r, k) => r.part.forEach(i => own.set(i, k)));
  return rs.map((r, k) => { let deliver = 0, through = 0; const p = r.path, seen = new Set();
    for(let q = 1; q < p.length; q++){ if(p[q][2]) continue; const i = edgeAt.get(ekey(p[q - 1], p[q])), d = seg(p[q - 1], p[q]);
      if(i != null && own.get(i) === k && !seen.has(i + ':' + q)){ deliver += d; } else through += d; }
    // a street walked twice: the second time is walking through
    deliver = Math.min(deliver, r.part.reduce((a, i) => a + G.edges[i].len, 0)); through = r.length_m - deliver;
    return { hours:Math.round(r.minutes / 6) / 10, minutes:r.minutes, mailboxes:Math.round(r.mailboxes), km:Math.round(r.length_m / 100) / 10, deliver_km:Math.round(deliver / 100) / 10, through_km:Math.round(through / 100) / 10,
      through_min:Math.round(Planner.routeMinutes(through, 0)), pieces:Planner.linkedPieces(G, r.part, new Set(rs.filter(x => x !== r).flatMap(x => x.part))).length }; });
}
const reach = rs => { let R = 0; rs.forEach(r => (r.boxes || []).forEach(b => { R = Math.max(R, seg(b, START)); })); return Math.round(R / 100) / 10; };
const dups = rs => { const s = new Map(); let d = 0; rs.forEach((r, k) => (r.boxes || []).forEach(b => { const x = b[0].toFixed(6) + ',' + b[1].toFixed(6); if(s.has(x) && s.get(x) !== k) d++; s.set(x, k); })); return d; };
const summary = rs => { const w = stats(rs); return { mailboxes:w.reduce((a, x) => a + x.mailboxes, 0), hours:Math.round(minutes(rs) / 6) / 10, km:Math.round(rs.reduce((a, r) => a + r.length_m, 0) / 100) / 10,
  through_km:Math.round(w.reduce((a, x) => a + x.through_km, 0) * 10) / 10, reach_km:reach(rs), dup_addresses:dups(rs), workers:w }; };

const S = [...new Set(base.routes.flatMap(r => r.part))], inS = new Set(S);
const B = summary(base.routes);
const R = { reproduced:{ mailboxes:base.mailboxes, hours:Math.round(base.budget.actual_minutes / 6) / 10, km:Math.round(base.budget.length_m / 100) / 10, ms:baseMs,
  settings:{ people:N, team_hours:TEAM_H, mode:'walk', quota_m30:QUOTA, days:DAYS, hours_per_day:HPD } }, base:B, white:[], black:[], variants:[] };
// white parts of the route: mailboxes, delivery minutes, walking through
for(const w of AREAS.white){
  const ids = S.filter(i => inBox(mid(i), w.box)), mb = ids.reduce((a, i) => a + G.edges[i].mb, 0), len = ids.reduce((a, i) => a + G.edges[i].len, 0);
  let through = 0; base.routes.forEach(r => { const own = new Set(r.part); const p = r.path; for(let q = 1; q < p.length; q++){ if(p[q][2]) continue; if(!inBox(p[q], w.box)) continue; const i = edgeAt.get(ekey(p[q - 1], p[q])); if(i == null || !own.has(i)) through += seg(p[q - 1], p[q]); } });
  R.white.push({ name:w.name, streets:ids.length, mailboxes:Math.round(mb), deliver_m:Math.round(len), deliver_min:Math.round(Planner.routeMinutes(len, mb)), through_m:Math.round(through), through_min:Math.round(Planner.routeMinutes(through, 0)),
    walk_from_flag_m:Math.round(Math.min(...ids.map(dOf))), _ids:ids });
}
for(const b of AREAS.black){
  const ids = G.edges.map((e, i) => i).filter(i => G.edges[i].mb > 0 && inBox(mid(i), b.box) && Number.isFinite(dOf(i)));
  const free = ids.filter(i => !inS.has(i)), mb = free.reduce((a, i) => a + G.edges[i].mb, 0), len = free.reduce((a, i) => a + G.edges[i].len, 0);
  R.black.push({ name:b.name, streets:free.length, already_in_plan:ids.length - free.length, mailboxes:Math.round(mb), per_km:Math.round(mb / Math.max(1, len) * 1000), walk_from_flag_m:Math.round(Math.min(...free.map(dOf))), _ids:free });
}
const pairs = [[null, null]];   // the same fill procedure without any change: the reference for every variant
for(const w of [null, ...R.white]) for(const b of R.black) pairs.push([w, b]);
for(const w of R.white) pairs.push([w, null]);
for(const [w, b] of pairs){
  const t = Date.now(), f = fill(b ? b._ids : [], w ? w._ids : []), s = summary(f.rs);
  R.variants.push({ name:!w && !b ? 'Referenz (gleiches Verfahren)' : (w ? 'ohne ' + w.name : 'nichts weg') + (b ? ' + ' + b.name : ''), ms:Date.now() - t, ...s, diff_mailboxes:s.mailboxes - B.mailboxes, diff_through_km:Math.round((s.through_km - B.through_km) * 10) / 10, _rs:f.rs, _w:w, _b:b });
}
const strip = o => JSON.parse(JSON.stringify(o, (k, v) => k.startsWith('_') ? undefined : v));
console.log(JSON.stringify(strip(R), null, 1));

if(svgDir){
  mkdirSync(svgDir, { recursive:true });
  const la0 = 52.172, la1 = 52.246, lo0 = 8.612, lo1 = 8.790, kk = Math.cos(START[0] * Math.PI / 180), W = 1500, H = Math.round(W * (la1 - la0) / ((lo1 - lo0) * kk));
  const X = p => ((p[1] - lo0) / (lo1 - lo0) * W).toFixed(1), Y = p => ((la1 - p[0]) / (la1 - la0) * H).toFixed(1);
  const line = (c, st) => `<polyline points="${c.map(p => X(p) + ',' + Y(p)).join(' ')}" ${st}/>`, COL = ['#2563EB', '#C2185B'], f1 = x => String(x).replace('.', ',');
  const boxSvg = (B, col, label) => Array.isArray(B[0][0]) ? B.map((b, k) => boxSvg(b, col, k ? '' : label)).join('') : `<rect x="${X([0, B[0][1]])}" y="${Y([B[1][0], 0])}" width="${(X([0, B[1][1]]) - X([0, B[0][1]])).toFixed(1)}" height="${(Y([B[0][0], 0]) - Y([B[1][0], 0])).toFixed(1)}" fill="none" stroke="${col}" stroke-width="2.5" rx="10"/><text x="${+X([0, B[0][1]]) + 6}" y="${+Y([B[1][0], 0]) - 6}" fill="${col}" font-family="sans-serif" font-size="14" font-weight="600">${label}</text>`;
  const map = (name, title, rs, s, marks) => { const o = [`<rect width="${W}" height="${H}" fill="#111827"/>`];
    G.edges.forEach(e => o.push(line(e.coords, `fill="none" stroke="${e.mb > 0 ? '#4B5563' : '#2B3442'}" stroke-width="1"`)));
    rs.forEach((r, w) => { let run = []; const fl = () => { if(run.length > 1) o.push(line(run, `fill="none" stroke="${COL[w]}" stroke-width="1.8" stroke-dasharray="5 5"`)); run = []; }; r.path.forEach(q => { if(q[2]) fl(); run.push(q); }); fl(); });
    rs.forEach((r, w) => r.part.forEach(i => o.push(line(G.edges[i].coords, `fill="none" stroke="${COL[w]}" stroke-width="3.2" stroke-linecap="round"`))));
    (marks || []).forEach(m => o.push(m));
    const Rm = s.reach_km * 1000, rx = Rm / (111320 * kk) / (lo1 - lo0) * W, ry = Rm / 111320 / (la1 - la0) * H;
    o.push(`<ellipse cx="${X(START)}" cy="${Y(START)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="none" stroke="#60A5FA" stroke-width="2" stroke-dasharray="8 8"/><rect x="${+X(START) - 120}" y="${(+Y(START) - ry - 14).toFixed(1)}" width="240" height="22" rx="6" fill="#2563EB"/><text x="${X(START)}" y="${(+Y(START) - ry + 2).toFixed(1)}" text-anchor="middle" fill="#fff" font-family="sans-serif" font-size="14" font-weight="600">Verteilradius ≈ ${f1(s.reach_km.toFixed(1))} km (Luftlinie)</text>`);
    o.push(`<circle cx="${X(START)}" cy="${Y(START)}" r="9" fill="#fff" stroke="#000" stroke-width="2"/>`);
    o.push(`<rect x="8" y="8" width="700" height="136" fill="#000" opacity=".75" rx="8"/><text x="16" y="32" font-family="sans-serif" font-size="17" font-weight="700" fill="#fff">${title}</text>`
      + `<text x="16" y="56" font-family="sans-serif" font-size="15">${s.workers.map((w, j) => `<tspan x="16" dy="${j ? 22 : 0}" fill="${COL[j]}">${j ? 'Rosa' : 'Blau'}: ${f1(w.hours)} h · ${w.mailboxes} Briefkästen · ${f1(w.through_km)} km ohne Verteilen</tspan>`).join('')}</text>`
      + `<line x1="16" y1="112" x2="56" y2="112" stroke="#fff" stroke-width="3.2"/><text x="62" y="117" font-family="sans-serif" font-size="14" fill="#fff">verteilen</text><line x1="150" y1="112" x2="190" y2="112" stroke="#fff" stroke-width="1.8" stroke-dasharray="5 5"/><text x="196" y="117" font-family="sans-serif" font-size="14" fill="#fff">gehen ohne Verteilen</text>`
      + `<text x="16" y="136" font-family="sans-serif" font-size="14" fill="#9CA3AF">Team ${f1(s.hours)} h von ${TEAM_H} h · ${s.mailboxes} Briefkästen · ${f1(s.km)} km Weg · Start/Ende an der Flagge</text>`);
    writeFileSync(`${svgDir}/${name}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${o.join('')}</svg>`); };
  const allMarks = [...AREAS.white.map(w => boxSvg(w.box, '#F9FAFB', w.name)), ...AREAS.black.map(b => boxSvg(b.box, '#F59E0B', b.name))];
  map('ausgang', 'Löhne · 32 h · 2 Personen · Ausgang', base.routes, B, allMarks);
  R.variants.forEach((v, k) => map('variante-' + (k + 1), 'Variante ' + (k + 1) + ': ' + v.name, v._rs, v, allMarks));
  writeFileSync(`${svgDir}/report.json`, JSON.stringify(strip(R), null, 1));
}
