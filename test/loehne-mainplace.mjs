// Löhne (27.11.2026), fixed print run (no "maximum flyers for the working time"): the order must start collecting the streets
// around the flag in Obernbeck. Before, the planner took the BIGGEST built-up area within 1.5 km (Mennighüffen–Westscheid–
// Werste) as "the place", switched off every street outside it and moved the start of the walk into its centre.
// Real map data of test/loehne-split.mjs (OSM © OpenStreetMap contributors, ODbL; Zensus 2022 dl-de/by-2-0).
//   node test/loehne-mainplace.mjs [--svg DIR] [--legacy]
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import Planner from '../admin/planner.js';
import { createPlanService } from '../worker/src/plancore.js';
import { cellOf, unlaea } from '../worker/src/zensus.js';

const START = [52.206232, 8.699767], FLYERS = 6155;
const svgAt = process.argv.indexOf('--svg'), svgDir = svgAt > 0 ? process.argv[svgAt + 1] : null, legacy = process.argv.includes('--legacy');
const ZENSUS = new URL('../admin/zensus/', import.meta.url);
const tiles = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/loehne-2026-11-27.json.gz', import.meta.url)))).tiles;
const respond = (buf, status = 200) => ({ ok:status === 200, status, arrayBuffer:async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) });
globalThis.fetch = async url => {
  url = String(url);
  if(url.includes('/flyermap/zensus/')){ const f = new URL(url.split('/').pop(), ZENSUS); return existsSync(f) ? respond(readFileSync(f)) : respond(new Uint8Array(0), 404); }
  if(url.startsWith(Planner.TILES_URL)){ const k = url.slice(Planner.TILES_URL.length).split('?')[0]; return tiles[k] ? respond(new Uint8Array(Buffer.from(tiles[k], 'base64'))) : respond(new Uint8Array(0), 404); }
  throw new Error('offline test: no request to ' + url.slice(0, 80));
};
if(legacy) process.env.FM_LEGACY_MAIN_PLACE = '1';

const svc = createPlanService(null);
const t0 = Date.now();
const res = await svc.plan({ start:START, flyers:FLYERS, n:2, days:7, hours:8, quota:3000, travel:'zones', split:'even', exact:true, mainName:'Löhne', budget:null }, () => {}, () => false);
const ms = Date.now() - t0, plan = res.plan, mp = plan.mainPlace, G = svc._graph();
const segLen = (a, b) => 111320 * Math.hypot(b[0] - a[0], (b[1] - a[1]) * Math.cos(a[0] * Math.PI / 180));
const boxes = plan.routes.flatMap(r => r.boxes || []);
const within = m => Math.round(boxes.filter(b => segLen(b, START) <= m).reduce((a, b) => a + (b[2] || 1), 0));
// streets with mailboxes within 600 m walking-ish (straight line) of the flag, and how many of them the plan delivers
const delivered = new Set(boxes.map(b => b[0].toFixed(6) + ',' + b[1].toFixed(6)));
const nearStreets = G.edges.filter(e => e.mb > 0 && (e.boxes || []).length && segLen(e.coords[Math.floor(e.coords.length / 2)], START) <= 600);
const nearDone = nearStreets.filter(e => e.boxes.some(b => delivered.has(b[0].toFixed(6) + ',' + b[1].toFixed(6))));
const names = [...new Set(nearDone.map(e => e.name).filter(Boolean))].sort();
const R = { legacy, ms, rule:mp.rule, place_walk_m:mp.walk_m, mailboxes:plan.mailboxes, routes:plan.routes.length, walk_start:mp.start.map(x => +x.toFixed(6)), walk_start_from_flag_m:Math.round(segLen(mp.start, START)),
  place:{ households:mp.mask?.households, centre:mp.mask?.centre?.map(x => +x.toFixed(5)) }, mailboxes_within_500m:within(500), mailboxes_within_1000m:within(1000),
  streets_near_flag:nearStreets.length, streets_near_flag_in_plan:nearDone.length, street_names_near_flag_in_plan:names,
  workers:plan.routes.map(r => ({ w:r.w, hours:Math.round(r.minutes / 6) / 10, mailboxes:Math.round(r.mailboxes), place:r.place })) };
console.log(JSON.stringify(R, null, 1));

if(svgDir){
  mkdirSync(svgDir, { recursive:true });
  const la0 = 52.170, la1 = 52.245, lo0 = 8.640, lo1 = 8.790, k = Math.cos(START[0] * Math.PI / 180), W = 1400, H = Math.round(W * (la1 - la0) / ((lo1 - lo0) * k));
  const X = p => ((p[1] - lo0) / (lo1 - lo0) * W).toFixed(1), Y = p => ((la1 - p[0]) / (la1 - la0) * H).toFixed(1);
  const line = (c, st) => `<polyline points="${c.map(p => X(p) + ',' + Y(p)).join(' ')}" ${st}/>`, s = [`<rect width="${W}" height="${H}" fill="#111827"/>`];
  // census cells of the chosen "place" (yellow)
  for(const key of mp.mask?.cellKeys || []){ const [cx, cy] = key.split(',').map(Number), a = unlaea(cx * 100, cy * 100), b = unlaea(cx * 100 + 100, cy * 100 + 100);
    s.push(`<rect x="${X(a)}" y="${Y(b)}" width="${(X(b) - X(a)).toFixed(1)}" height="${(Y(a) - Y(b)).toFixed(1)}" fill="#FBBF24" opacity=".16"/>`); }
  G.edges.forEach(e => s.push(line(e.coords, `fill="none" stroke="${e.mb > 0 ? '#4B5563' : '#2B3442'}" stroke-width="1"`)));
  const COL = ['#2563EB', '#C2185B'];
  plan.routes.forEach((r, w) => { let run = []; const fl = () => { if(run.length > 1) s.push(line(run, `fill="none" stroke="${COL[w % 2]}" stroke-width="2.6" opacity=".9"`)); run = []; }; r.path.forEach(q => { if(q[2]) fl(); run.push(q); }); fl(); });
  s.push(`<circle cx="${X(START)}" cy="${Y(START)}" r="9" fill="#fff" stroke="#000" stroke-width="2"/><text x="${+X(START) + 12}" y="${+Y(START) - 8}" fill="#fff" font-family="sans-serif" font-size="16">Flagge</text>`);
  s.push(`<circle cx="${X(mp.start)}" cy="${Y(mp.start)}" r="8" fill="#22C55E" stroke="#000" stroke-width="2"/><text x="${+X(mp.start) + 12}" y="${+Y(mp.start) + 20}" fill="#22C55E" font-family="sans-serif" font-size="16">Beginn des Laufens</text>`);
  s.push(`<rect x="8" y="8" width="640" height="84" fill="#000" opacity=".65" rx="8"/><text x="16" y="32" font-family="sans-serif" font-size="17" font-weight="700" fill="#fff">${legacy ? 'Vorher' : 'Nachher'} · feste Auflage ${FLYERS} · ${plan.mailboxes} Briefkästen im Plan</text>`
    + `<text x="16" y="56" font-family="sans-serif" font-size="15" fill="#FBBF24">Gelb: gewählte Bebauung (Zensus) · ${mp.mask?.households ?? '–'} Haushalte</text>`
    + `<text x="16" y="80" font-family="sans-serif" font-size="15" fill="#fff">Bis 500 m um die Flagge: ${R.mailboxes_within_500m} Briefkästen · Straßen bis 600 m im Plan: ${R.streets_near_flag_in_plan}/${R.streets_near_flag}</text>`);
  writeFileSync(`${svgDir}/${legacy ? 'before' : 'after'}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${s.join('')}</svg>`);
  writeFileSync(`${svgDir}/${legacy ? 'before' : 'after'}.json`, JSON.stringify(R, null, 1));
}
if(!legacy){
  assert.ok(R.walk_start_from_flag_m < 300, 'the walk begins at the flag (Obernbeck): ' + R.walk_start_from_flag_m + ' m');
  assert.ok(R.streets_near_flag_in_plan >= R.streets_near_flag * 0.8, 'streets around the flag are delivered: ' + R.streets_near_flag_in_plan + '/' + R.streets_near_flag);
  console.log('Löhne fixed print run: starts around the flag OK');
}
