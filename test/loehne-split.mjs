// Löhne (27.11.2026): two workers, 26 h, "time first". The split between the two must give two whole areas: the admin saw the
// pink worker with the west, a piece of Mahnen in the south-east and a strip in the north between the blue streets.
// Real map data, recorded once in CI (OSM © OpenStreetMap contributors, ODbL; Zensus 2022 dl-de/by-2-0):
//   node test/loehne-split.mjs record      fetches the planner's own map squares (public GET) → test/fixtures/loehne-2026-11-27.json.gz
//   node test/loehne-split.mjs             offline: same selection of streets, old split vs new split, checks + report
//   node test/loehne-split.mjs --svg DIR   also writes before.svg / after.svg (same scale) and report.json
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import Planner from '../admin/planner.js';
import { createPlanService } from '../worker/src/plancore.js';

const FIX = new URL('./fixtures/loehne-2026-11-27.json.gz', import.meta.url);
const START = [52.206232, 8.699767], HOURS = 26, N = 2;
const record = process.argv[2] === 'record', svgAt = process.argv.indexOf('--svg'), svgDir = svgAt > 0 ? process.argv[svgAt + 1] : null;
const ZENSUS = new URL('../admin/zensus/', import.meta.url), realFetch = globalThis.fetch;
const tiles = record ? {} : JSON.parse(gunzipSync(readFileSync(FIX))).tiles;
const respond = (buf, status = 200) => ({ ok:status === 200, status, arrayBuffer:async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) });
globalThis.fetch = async (url, o) => {
  url = String(url);
  if(url.includes('/flyermap/zensus/')){ const f = new URL(url.split('/').pop(), ZENSUS); return existsSync(f) ? respond(readFileSync(f)) : respond(new Uint8Array(0), 404); }
  if(url.startsWith(Planner.TILES_URL)){
    const k = url.slice(Planner.TILES_URL.length).split('?')[0];
    if(record){
      const r = await realFetch(url, { method:'GET', signal:AbortSignal.timeout(30000) });
      if(!r.ok){ tiles[k] = null; return respond(new Uint8Array(0), r.status); }
      const b = new Uint8Array(await r.arrayBuffer()); tiles[k] = Buffer.from(b).toString('base64'); return respond(b);
    }
    return tiles[k] ? respond(new Uint8Array(Buffer.from(tiles[k], 'base64'))) : respond(new Uint8Array(0), 404);
  }
  throw new Error('offline test: no request to ' + url.slice(0, 80));
};

const svc = createPlanService(null);
const args = { start:START, flyers:0, n:N, days:7, hours:8, quota:3000, travel:'zones', split:'even', exact:true, mainName:'Löhne',
  budget:{ on:true, strategy:'near-first', mode:'walk', hours:HOURS, tolerance:0, maxFlyers:10000 } };
const t0 = Date.now(), res = await svc.plan(args, () => {}, () => false), planMs = Date.now() - t0;
assert.ok(res && res.plan && res.plan.routes.length === N, 'plan with two routes');
if(record){
  writeFileSync(FIX, gzipSync(JSON.stringify({ start:START, recorded:new Date().toISOString(), tiles })));
  console.log('recorded', Object.keys(tiles).length, 'squares');
  process.exit(0);
}
const G = svc._graph(), ids = [...new Set(res.plan.routes.flatMap(r => r.part || []))];
assert.ok(ids.length > 100, 'selection of streets: ' + ids.length);
Planner.setPace(3000);
const opt = { days:1, hoursPerDay:HOURS * 60, selectedEdgeIds:ids, walkTree:Planner.walkingTreeCache(), compact:true };
const run = legacy => { const s = Date.now(), p = Planner.planFlyers(G, START, Infinity, N, { ...opt, legacySplit:legacy }); return { p, ms:Date.now() - s }; };
const before = run(true), after = run(false);

// ---- measures: delivery streets per worker, connected pieces, transit through the other's area ----
const ownerOf = rs => { const m = new Map(); rs.forEach((r, k) => (r.part || []).forEach(i => m.set(i, k))); return m; };
const pieces = part => {   // connected pieces of a worker's delivery streets (streets touching at a junction = one piece)
  const set = new Set(part), node = new Map(), seen = new Set(); let n = 0;
  for(const i of part){ const e = G.edges[i]; for(const v of [e.a, e.b]){ if(!node.has(v)) node.set(v, []); node.get(v).push(i); } }
  for(const i of part){ if(seen.has(i)) continue; n++; const st = [i]; seen.add(i);
    while(st.length){ const e = G.edges[st.pop()]; for(const v of [e.a, e.b]) for(const j of node.get(v)) if(set.has(j) && !seen.has(j)){ seen.add(j); st.push(j); } } }
  return n;
};
const near = (p, q) => Math.abs(p[0] - q[0]) < 2e-6 && Math.abs(p[1] - q[1]) < 2e-6;
const segLen = (a, b) => 111320 * Math.hypot(b[0] - a[0], (b[1] - a[1]) * Math.cos(a[0] * Math.PI / 180));
// walked metres on streets that the OTHER worker delivers (transit through a foreign area), from the real route path
const edgeAt = (() => { const m = new Map(); G.edges.forEach((e, i) => { const c = e.coords; for(let k = 1; k < c.length; k++){ const key = c[k - 1][0].toFixed(5) + ',' + c[k - 1][1].toFixed(5) + '|' + c[k][0].toFixed(5) + ',' + c[k][1].toFixed(5); m.set(key, i); m.set(c[k][0].toFixed(5) + ',' + c[k][1].toFixed(5) + '|' + c[k - 1][0].toFixed(5) + ',' + c[k - 1][1].toFixed(5), i); } }); return m; })();
const transit = (rs, own) => rs.map((r, k) => { let foreign = 0, empty = 0; const p = r.path;
  for(let q = 1; q < p.length; q++){ if(p[q][2] || p[q - 1][2]) continue; const i = edgeAt.get(p[q - 1][0].toFixed(5) + ',' + p[q - 1][1].toFixed(5) + '|' + p[q][0].toFixed(5) + ',' + p[q][1].toFixed(5)); if(i == null) continue;
    const o = own.get(i), d = segLen(p[q - 1], p[q]); if(o != null && o !== k) foreign += d; else if(o == null) empty += d; }
  return { foreign_m:Math.round(foreign), connector_m:Math.round(empty) }; });
// Mahnen: the district south of the railway in the south-east (Löhne-Mahnen), box from the map
const MAHNEN = [[52.180, 8.700], [52.196, 8.730]], inMahnen = i => { const c = G.edges[i].coords, m = c[Math.floor(c.length / 2)]; return m[0] >= MAHNEN[0][0] && m[0] <= MAHNEN[1][0] && m[1] >= MAHNEN[0][1] && m[1] <= MAHNEN[1][1]; };
const report = (name, { p, ms }) => {
  const rs = p.routes, own = ownerOf(rs), tr = transit(rs, own), mins = rs.map(r => r.minutes), avg = mins.reduce((a, b) => a + b, 0) / rs.length;
  const mahnen = rs.map(r => (r.part || []).filter(inMahnen).reduce((a, i) => a + G.edges[i].mb, 0));
  return { name, ms, spread_pct:Math.round((Math.max(...mins) - Math.min(...mins)) / avg * 1000) / 10,
    workers:rs.map((r, k) => ({ k, hours:Math.round(r.minutes / 6) / 10, mailboxes:Math.round(r.mailboxes), km:Math.round(r.length_m / 100) / 10, pieces:pieces(r.part || []), mahnen_mb:Math.round(mahnen[k]), ...tr[k] })) };
};
const R = { selection:{ streets:ids.length, mailboxes:Math.round(ids.reduce((a, i) => a + G.edges[i].mb, 0)), plan_ms:planMs }, before:report('before', before), after:report('after', after) };
console.log(JSON.stringify(R, null, 1));

// ---- maps: same frame for both ----
if(svgDir){
  mkdirSync(svgDir, { recursive:true });
  const all = ids.flatMap(i => G.edges[i].coords); let la0 = Math.min(...all.map(p => p[0])), la1 = Math.max(...all.map(p => p[0])), lo0 = Math.min(...all.map(p => p[1])), lo1 = Math.max(...all.map(p => p[1]));
  const pad = .004; la0 -= pad; la1 += pad; lo0 -= pad * 1.6; lo1 += pad * 1.6;
  const k = Math.cos(START[0] * Math.PI / 180), W = 1400, H = Math.round(W * (la1 - la0) / ((lo1 - lo0) * k));
  const X = p => ((p[1] - lo0) / (lo1 - lo0) * W).toFixed(1), Y = p => ((la1 - p[0]) / (la1 - la0) * H).toFixed(1);
  const line = (c, st) => `<polyline points="${c.map(p => X(p) + ',' + Y(p)).join(' ')}" ${st}/>`;
  const COL = ['#2563EB', '#C2185B'];
  const draw = (name, { p }) => {
    const rs = p.routes, s = [];
    s.push(`<rect width="${W}" height="${H}" fill="#111827"/>`);
    G.edges.forEach(e => { const c = e.coords; if(c.some(q => q[0] > la0 && q[0] < la1 && q[1] > lo0 && q[1] < lo1)) s.push(line(c, 'fill="none" stroke="#374151" stroke-width="1"')); });
    rs.forEach((r, w) => { let run = []; const flush = () => { if(run.length > 1) s.push(line(run, `fill="none" stroke="${COL[w]}" stroke-width="1.6" stroke-dasharray="5 4" opacity=".9"`)); run = []; };
      r.path.forEach(q => { if(q[2]) flush(); run.push(q); }); flush(); });   // walked way (thin dashed: also transit)
    rs.forEach((r, w) => (r.part || []).forEach(i => s.push(line(G.edges[i].coords, `fill="none" stroke="${COL[w]}" stroke-width="3.4" stroke-linecap="round"`))));   // delivery streets (thick)
    s.push(`<rect x="${X([MAHNEN[1][0], MAHNEN[0][1]])}" y="${Y([MAHNEN[1][0], 0])}" width="${(X([0, MAHNEN[1][1]]) - X([0, MAHNEN[0][1]])).toFixed(1)}" height="${(Y([MAHNEN[0][0], 0]) - Y([MAHNEN[1][0], 0])).toFixed(1)}" fill="none" stroke="#FBBF24" stroke-dasharray="8 6" stroke-width="1.5"/>`);
    s.push(`<text x="${+X([0, MAHNEN[0][1]]) + 6}" y="${+Y([MAHNEN[1][0], 0]) + 18}" fill="#FBBF24" font-family="sans-serif" font-size="16">Mahnen</text>`);
    s.push(`<circle cx="${X(START)}" cy="${Y(START)}" r="9" fill="#fff" stroke="#000" stroke-width="2"/><text x="${+X(START) + 12}" y="${+Y(START) - 10}" fill="#fff" font-family="sans-serif" font-size="16">Start</text>`);
    const rep = R[name], legend = rep.workers.map((w, j) => `<tspan fill="${COL[j]}" x="16" dy="${j ? 22 : 0}">${j ? 'Rosa' : 'Blau'}: ${String(w.hours).replace('.', ',')} h · ${w.mailboxes} Briefkästen · ${w.pieces} Teil(e) · fremd ${w.foreign_m} m</tspan>`).join('');
    s.push(`<rect x="8" y="8" width="560" height="${36 + 22 * rep.workers.length}" fill="#000" opacity=".65" rx="8"/><text x="16" y="30" font-family="sans-serif" font-size="16" font-weight="700" fill="#fff">${name === 'before' ? 'Vorher' : 'Nachher'} · Unterschied ${String(rep.spread_pct).replace('.', ',')} %</text><text x="16" y="54" font-family="sans-serif" font-size="15">${legend}</text>`);
    writeFileSync(`${svgDir}/${name}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${s.join('')}</svg>`);
  };
  draw('before', before); draw('after', after);
  writeFileSync(`${svgDir}/report.json`, JSON.stringify(R, null, 1));
}

// ---- checks (the new split) ----
const A = R.after;
assert.ok(A.workers.every(w => w.pieces === 1), 'each worker delivers ONE connected area: ' + A.workers.map(w => w.pieces));
assert.ok(A.spread_pct <= 15, 'difference between the workers ≤ 15 % of the average: ' + A.spread_pct);
assert.ok(A.workers.filter(w => w.mahnen_mb > 0).length <= 1, 'Mahnen belongs to one worker');
assert.ok(after.p.routes.every(r => r.minutes <= HOURS * 60) && A.workers.reduce((a, w) => a + w.hours, 0) <= HOURS + .05, 'within the 26 hours');
console.log('Löhne split: two whole areas OK');
