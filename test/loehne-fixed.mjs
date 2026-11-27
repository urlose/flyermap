// Löhne (27.11.2026), fixed print run 6,155 flyers, 2 people, 26 h together: the residential streets are chosen by walking
// distance from the flag (like "time first"), neighbouring built-up areas included – the dense quarter east of the flag (the
// "white area" the admin marked) must come before the far streets in the west. Then the area is split between the two people.
// Real map data of test/loehne-split.mjs (OSM © OpenStreetMap contributors, ODbL; Zensus 2022 dl-de/by-2-0).
//   node test/loehne-fixed.mjs [--svg DIR]
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import Planner from '../admin/planner.js';
import { createPlanService } from '../worker/src/plancore.js';

const START = [52.206232, 8.699767], FLYERS = 6155, N = 2, HOURS = 26;
const svgAt = process.argv.indexOf('--svg'), svgDir = svgAt > 0 ? process.argv[svgAt + 1] : null;
const ZENSUS = new URL('../admin/zensus/', import.meta.url);
const tiles = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/loehne-2026-11-27.json.gz', import.meta.url)))).tiles;
const respond = (buf, status = 200) => ({ ok:status === 200, status, arrayBuffer:async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) });
globalThis.fetch = async url => {
  url = String(url);
  if(url.includes('/flyermap/zensus/')){ const f = new URL(url.split('/').pop(), ZENSUS); return existsSync(f) ? respond(readFileSync(f)) : respond(new Uint8Array(0), 404); }
  if(url.startsWith(Planner.TILES_URL)){ const k = url.slice(Planner.TILES_URL.length).split('?')[0]; return tiles[k] ? respond(new Uint8Array(Buffer.from(tiles[k], 'base64'))) : respond(new Uint8Array(0), 404); }
  throw new Error('offline test: no request to ' + url.slice(0, 80));
};

const svc = createPlanService(null), t0 = Date.now();
// 26 h together = 2 people × 13 h (one day: the days are not cut any more)
const res = await svc.plan({ fixedNear:true, start:START, flyers:FLYERS, n:N, days:1, hours:HOURS / N, quota:3000, travel:'zones', split:'even', exact:true, mainName:'Löhne', budget:null }, () => {}, () => false);
const ms = Date.now() - t0, plan = res.plan, b = plan.budget, G = svc._graph();

// walking distances from the flag over the street network (with the way, to draw it)
const root = (() => { let best = -1, bd = Infinity; G.pts.forEach((p, i) => { if(!G.adj[i].length) return; const d = Math.hypot(p[0] - START[0], (p[1] - START[1]) * .61); if(d < bd){ bd = d; best = i; } }); return best; })();
const dist = new Float64Array(G.pts.length).fill(Infinity), via = new Int32Array(G.pts.length).fill(-1); dist[root] = 0;
{ const heap = [[0, root]]; while(heap.length){ let bi = 0; for(let q = 1; q < heap.length; q++) if(heap[q][0] < heap[bi][0]) bi = q; const [d, v] = heap.splice(bi, 1)[0]; if(d > dist[v]) continue;
  for(const { e, to } of G.adj[v]){ const nd = d + G.edges[e].len; if(nd < dist[to]){ dist[to] = nd; via[to] = e; heap.push([nd, to]); } } } }
const mid = e => e.coords[Math.floor(e.coords.length / 2)], dOf = e => Math.min(dist[e.a], dist[e.b]);
// the "white area" east of the flag (the admin's circle) and the far streets in the west (old plan without walking distances)
// the admin's circle: an ellipse east of the flag (from the screenshot of the old plan)
const WHITE = [[52.2055, 8.714], [52.2335, 8.766]], FARWEST = [[52.185, 8.600], [52.225, 8.665]];
const inBox = (p, B) => { if(B !== WHITE) return p[0] >= B[0][0] && p[0] <= B[1][0] && p[1] >= B[0][1] && p[1] <= B[1][1];
  const cy = (B[0][0] + B[1][0]) / 2, cx = (B[0][1] + B[1][1]) / 2, ry = (B[1][0] - B[0][0]) / 2, rx = (B[1][1] - B[0][1]) / 2; return ((p[0] - cy) / ry) ** 2 + ((p[1] - cx) / rx) ** 2 <= 1; };
const res_ = G.edges.map((e, i) => ({ e, i })).filter(x => x.e.mb > 0);
const white = res_.filter(x => inBox(mid(x.e), WHITE)), west = res_.filter(x => inBox(mid(x.e), FARWEST));
const planned = new Set(plan.routes.flatMap(r => r.part || []));
const stat = list => { const ds = list.map(x => dOf(x.e)).filter(Number.isFinite).sort((a, b) => a - b), mb = list.reduce((a, x) => a + x.e.mb, 0), inPlan = list.filter(x => planned.has(x.i));
  return { streets:list.length, mailboxes:Math.round(mb), walk_min_m:Math.round(ds[0]), walk_median_m:Math.round(ds[ds.length >> 1]), in_plan_streets:inPlan.length, in_plan_mailboxes:Math.round(inPlan.reduce((a, x) => a + x.e.mb, 0)) }; };
// the planning frontier: walking distance of the farthest planned street; streets of the white area nearer than that
const frontier = Math.max(...[...planned].map(i => dOf(G.edges[i])));
const whiteNear = white.filter(x => dOf(x.e) <= frontier), whiteNearShare = whiteNear.length ? whiteNear.filter(x => planned.has(x.i)).length / whiteNear.length : 1;
const R = { ms, ordered:FLYERS, frontier_m:Math.round(frontier), white_within_frontier:{ streets:whiteNear.length, planned_share:Math.round(whiteNearShare * 100) },  planned:plan.mailboxes, fixed:b.fixed, stop:b.walk.stop, total_hours:Math.round(plan.routes.reduce((a, r) => a + r.minutes, 0) / 6) / 10,
  workers:plan.routes.map(r => ({ w:r.w, hours:Math.round(r.minutes / 6) / 10, mailboxes:Math.round(r.mailboxes), pieces:Planner.linkedPieces(G, r.part, new Set(plan.routes.filter(x => x !== r).flatMap(x => x.part))).length })),
  white_area:stat(white), far_west:stat(west) };
console.log(JSON.stringify(R, null, 1));

if(svgDir){
  mkdirSync(svgDir, { recursive:true });
  const la0 = 52.170, la1 = 52.245, lo0 = 8.600, lo1 = 8.790, k = Math.cos(START[0] * Math.PI / 180), W = 1500, H = Math.round(W * (la1 - la0) / ((lo1 - lo0) * k));
  const X = p => ((p[1] - lo0) / (lo1 - lo0) * W).toFixed(1), Y = p => ((la1 - p[0]) / (la1 - la0) * H).toFixed(1);
  const line = (c, st) => `<polyline points="${c.map(p => X(p) + ',' + Y(p)).join(' ')}" ${st}/>`, s = [`<rect width="${W}" height="${H}" fill="#111827"/>`];
  G.edges.forEach(e => s.push(line(e.coords, `fill="none" stroke="${e.mb > 0 ? '#4B5563' : '#2B3442'}" stroke-width="1"`)));
  const COL = ['#2563EB', '#C2185B'];
  plan.routes.forEach((r, w) => { let run = []; const fl = () => { if(run.length > 1) s.push(line(run, `fill="none" stroke="${COL[w % 2]}" stroke-width="1.4" stroke-dasharray="5 4" opacity=".8"`)); run = []; }; r.path.forEach(q => { if(q[2]) fl(); run.push(q); }); fl(); });
  plan.routes.forEach((r, w) => (r.part || []).forEach(i => s.push(line(G.edges[i].coords, `fill="none" stroke="${COL[w % 2]}" stroke-width="3" stroke-linecap="round"`))));
  // walking way from the flag to the nearest street of the white area (yellow)
  const nearestWhite = white.filter(x => Number.isFinite(dOf(x.e))).sort((a, c) => dOf(a.e) - dOf(c.e))[0];
  if(nearestWhite){ let v = dist[nearestWhite.e.a] <= dist[nearestWhite.e.b] ? nearestWhite.e.a : nearestWhite.e.b; const way = [G.pts[v]];
    while(via[v] >= 0){ const e = G.edges[via[v]]; v = e.a === v ? e.b : e.a; way.push(G.pts[v]); }
    s.push(line(way, 'fill="none" stroke="#FBBF24" stroke-width="3" stroke-dasharray="2 5" stroke-linecap="round"')); }
  for(const [B, name, st] of [[WHITE, 'weiße Zone', R.white_area], [FARWEST, 'ferner Westen', R.far_west]]){
    if(B === WHITE) s.push(`<ellipse cx="${X([0, (B[0][1] + B[1][1]) / 2])}" cy="${Y([(B[0][0] + B[1][0]) / 2, 0])}" rx="${((X([0, B[1][1]]) - X([0, B[0][1]])) / 2).toFixed(1)}" ry="${((Y([B[0][0], 0]) - Y([B[1][0], 0])) / 2).toFixed(1)}" fill="none" stroke="#F3F4F6" stroke-width="3"/>`);
    else s.push(`<rect x="${X([0, B[0][1]])}" y="${Y([B[1][0], 0])}" width="${(X([0, B[1][1]]) - X([0, B[0][1]])).toFixed(1)}" height="${(Y([B[0][0], 0]) - Y([B[1][0], 0])).toFixed(1)}" fill="none" stroke="#F3F4F6" stroke-width="2" stroke-dasharray="10 6" rx="14"/>`);
    s.push(`<text x="${+X([0, B[0][1]]) + 8}" y="${+Y([B[1][0], 0]) - 8}" fill="#F3F4F6" font-family="sans-serif" font-size="15">${name}: zu Fuß ab ${st.walk_min_m} m (Median ${st.walk_median_m} m) · im Plan ${st.in_plan_mailboxes}/${st.mailboxes} BK</text>`);
  }
  { // delivery radius as the app draws it: circle through the farthest planned mailbox
    const kk = Math.cos(START[0] * Math.PI / 180); let Rm = 0; plan.routes.forEach(r => (r.boxes || []).forEach(q => { Rm = Math.max(Rm, 111320 * Math.hypot(q[0] - START[0], (q[1] - START[1]) * kk)); }));
    const rx = Rm / (111320 * kk) / (lo1 - lo0) * W, ry = Rm / 111320 / (la1 - la0) * H;
    s.push(`<ellipse cx="${X(START)}" cy="${Y(START)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="#3B82F6" fill-opacity=".04" stroke="#60A5FA" stroke-width="2" stroke-dasharray="8 8"/><text x="${+X(START) - 70}" y="${(+Y(START) - ry - 8).toFixed(1)}" fill="#60A5FA" font-family="sans-serif" font-size="16">Verteilradius ≈ ${(Rm / 1000).toFixed(1).replace('.', ',')} km</text>`);
    R.reach_km = Math.round(Rm / 100) / 10; }
  s.push(`<circle cx="${X(START)}" cy="${Y(START)}" r="9" fill="#fff" stroke="#000" stroke-width="2"/><text x="${+X(START) - 18}" y="${+Y(START) + 28}" fill="#fff" font-family="sans-serif" font-size="16">Flagge</text>`);
  const leg = R.workers.map((w, j) => `<tspan x="16" dy="${j ? 22 : 0}" fill="${COL[j]}">${j ? 'Rosa' : 'Blau'}: ${String(w.hours).replace('.', ',')} h · ${w.mailboxes} Briefkästen · ${w.pieces} Teil</tspan>`).join('');
  s.push(`<rect x="8" y="8" width="600" height="110" fill="#000" opacity=".7" rx="8"/><text x="16" y="32" font-family="sans-serif" font-size="17" font-weight="700" fill="#fff">Feste Auflage ${FLYERS} · geplant ${plan.mailboxes} · ${String(R.total_hours).replace('.', ',')} h von ${HOURS} h</text><text x="16" y="58" font-family="sans-serif" font-size="15">${leg}</text><text x="16" y="106" font-family="sans-serif" font-size="14" fill="#FBBF24">Gelb gepunktet: Fußweg von der Flagge zur weißen Zone</text>`);
  writeFileSync(`${svgDir}/fixed.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${s.join('')}</svg>`);
  writeFileSync(`${svgDir}/fixed.json`, JSON.stringify(R, null, 1));
}

assert.ok(b.fixed && b.fixed.ordered === FLYERS, 'ordered print run kept separately');
assert.ok(R.white_area.walk_median_m < R.far_west.walk_median_m, 'the white area is nearer on foot than the far west');
assert.ok(R.white_within_frontier.planned_share >= 85, 'streets of the white area within the planning frontier are planned: ' + R.white_within_frontier.planned_share + ' %');
assert.ok(R.white_area.in_plan_mailboxes > R.far_west.in_plan_mailboxes, 'more of the white area than of the far west');
assert.ok(R.workers.every(w => w.pieces === 1), 'two whole areas');
assert.ok(R.total_hours <= HOURS + 0.05, 'within 26 h');
console.log('Löhne fixed print run by walking distance OK');

// too little time for the order: ordered and doable are reported apart, the ordered number is not reduced
{
  const short = (await createPlanService(null).plan({ fixedNear:true, start:START, flyers:FLYERS, n:N, days:1, hours:5, quota:3000, travel:'zones', split:'even', exact:true, mainName:'Löhne', budget:null }, () => {}, () => false)).plan.budget.fixed;
  console.log('10 h together:', JSON.stringify(short));
  assert.ok(short.short && short.ordered === FLYERS && short.feasible < FLYERS * 0.9, 'too little time: ordered ' + short.ordered + ', doable ' + short.feasible);
}
console.log('Löhne fixed print run: shortfall reported OK');
