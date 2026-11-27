// Diagnosis Löhne (27.11.2026), fixed print run 6,155 / 2 people / 26 h: would it be better to drop some of the outermost planned
// streets and take one dense quarter that is not in the plan (the admin's "black" areas, e.g. Westscheid in the north)?
// Same print run, same two people, the walk from the flag included. Real map data (OSM © OpenStreetMap contributors, ODbL;
// Zensus 2022 dl-de/by-2-0).   node test/diag-loehne-swap.mjs [--svg DIR]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import Planner from '../admin/planner.js';
import { createPlanService } from '../worker/src/plancore.js';

const START = [52.206232, 8.699767], FLYERS = 6155, N = 2, HOURS = 26;
const svgAt = process.argv.indexOf('--svg'), svgDir = svgAt > 0 ? process.argv[svgAt + 1] : null;
const ZENSUS = new URL('../admin/zensus/', import.meta.url);
const tiles = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/loehne-2026-11-27.json.gz', import.meta.url)))).tiles;
const respond = (buf, status = 200) => ({ ok:status === 200, status, arrayBuffer:async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) });
globalThis.fetch = async url => { url = String(url);
  if(url.includes('/flyermap/zensus/')){ const f = new URL(url.split('/').pop(), ZENSUS); return existsSync(f) ? respond(readFileSync(f)) : respond(new Uint8Array(0), 404); }
  if(url.startsWith(Planner.TILES_URL)){ const k = url.slice(Planner.TILES_URL.length).split('?')[0]; return tiles[k] ? respond(new Uint8Array(Buffer.from(tiles[k], 'base64'))) : respond(new Uint8Array(0), 404); }
  throw new Error('offline: ' + url.slice(0, 60)); };

const svc = createPlanService(null);
const base = (await svc.plan({ fixedNear:true, start:START, flyers:FLYERS, n:N, days:1, hours:HOURS / N, quota:3000, travel:'zones', split:'even', exact:true, mainName:'Löhne', budget:null }, () => {}, () => false)).plan;
const G = svc._graph(), S = [...new Set(base.routes.flatMap(r => r.part))], inS = new Set(S);

// walking distance from the flag
const root = (() => { let best = -1, bd = Infinity; G.pts.forEach((p, i) => { if(!G.adj[i].length) return; const d = Math.hypot(p[0] - START[0], (p[1] - START[1]) * .61); if(d < bd){ bd = d; best = i; } }); return best; })();
const dist = new Float64Array(G.pts.length).fill(Infinity); dist[root] = 0;
{ const heap = [[0, root]]; while(heap.length){ let bi = 0; for(let q = 1; q < heap.length; q++) if(heap[q][0] < heap[bi][0]) bi = q; const [d, v] = heap.splice(bi, 1)[0]; if(d > dist[v]) continue;
  for(const { e, to } of G.adj[v]){ const nd = d + G.edges[e].len; if(nd < dist[to]){ dist[to] = nd; heap.push([nd, to]); } } } }
const dOf = i => Math.min(dist[G.edges[i].a], dist[G.edges[i].b]), mid = i => { const c = G.edges[i].coords; return c[Math.floor(c.length / 2)]; };

// candidate quarters: dense clusters of residential streets NOT in the plan (streets joined at junctions)
const free = G.edges.map((e, i) => i).filter(i => G.edges[i].mb > 0 && !inS.has(i) && Number.isFinite(dOf(i)));
const freeSet = new Set(free), seen = new Set(), quarters = [];
for(const i of free){ if(seen.has(i)) continue; const c = [], st = [i]; seen.add(i);
  while(st.length){ const e = st.pop(); c.push(e); for(const v of [G.edges[e].a, G.edges[e].b]) for(const { e:f } of G.adj[v]) if(freeSet.has(f) && !seen.has(f)){ seen.add(f); st.push(f); } }
  const mb = c.reduce((a, e) => a + G.edges[e].mb, 0), len = c.reduce((a, e) => a + G.edges[e].len, 0);
  if(mb < 250) continue;
  const ctr = c.reduce((a, e) => { const m = mid(e); return [a[0] + m[0] * G.edges[e].mb, a[1] + m[1] * G.edges[e].mb]; }, [0, 0]).map(x => x / mb);
  quarters.push({ ids:c, mb:Math.round(mb), km:Math.round(len / 100) / 10, perKm:Math.round(mb / len * 1000), walk_min:Math.round(Math.min(...c.map(dOf))), centre:ctr.map(x => +x.toFixed(4)) });
}
// big connected blocks (a whole town) are cut to the part nearest to the flag, about 900 mailboxes – "one quarter"
for(const q of quarters) if(q.mb > 1500){ const ids = q.ids.slice().sort((a, b) => dOf(a) - dOf(b)), keep = []; let mb = 0; for(const e of ids){ if(mb >= 900) break; keep.push(e); mb += G.edges[e].mb; }
  const len = keep.reduce((a, e) => a + G.edges[e].len, 0); Object.assign(q, { ids:keep, mb:Math.round(mb), km:Math.round(len / 100) / 10, perKm:Math.round(mb / len * 1000), cut:true });
  q.centre = keep.reduce((a, e) => { const m = mid(e); return [a[0] + m[0] * G.edges[e].mb, a[1] + m[1] * G.edges[e].mb]; }, [0, 0]).map(x => +(x / mb).toFixed(4)); }
{ const tail = quarters.splice(1).sort((a, b) => b.perKm * Math.sqrt(b.mb) / (1 + b.walk_min / 1000) - a.perKm * Math.sqrt(a.mb) / (1 + a.walk_min / 1000)); quarters.push(...tail); }
// Westscheid (north, Westscheider Weg / Dorfstraße / Lübbecker Straße): the black area in the admin's first screenshot
{ const ids = free.filter(i => { const m = mid(i); return m[0] >= 52.2255 && m[0] <= 52.2365 && m[1] >= 8.692 && m[1] <= 8.713; });
  const mb = ids.reduce((a, e) => a + G.edges[e].mb, 0), len = ids.reduce((a, e) => a + G.edges[e].len, 0);
  const ctr = ids.reduce((a, e) => { const m = mid(e); return [a[0] + m[0] * G.edges[e].mb, a[1] + m[1] * G.edges[e].mb]; }, [0, 0]).map(x => +(x / mb).toFixed(4));
  quarters.unshift({ ids, mb:Math.round(mb), km:Math.round(len / 100) / 10, perKm:Math.round(mb / len * 1000), walk_min:Math.round(Math.min(...ids.map(dOf))), centre:ctr, name:'Westscheid' }); }
const where = c => { const dy = (c[0] - START[0]) * 111.32, dx = (c[1] - START[1]) * 111.32 * .612, a = Math.atan2(dy, dx) * 180 / Math.PI;
  const dir = ['O', 'NO', 'N', 'NW', 'W', 'SW', 'S', 'SO'][((Math.round(a / 45) % 8) + 8) % 8]; return dir + ' ' + Math.hypot(dx, dy).toFixed(1) + ' km'; };

const opt = { days:1, hoursPerDay:HOURS / N * 60, walkTree:Planner.walkingTreeCache(), compact:true };
const run = ids => { const t0 = Date.now(), p = Planner.planFlyers(G, START, Infinity, N, { ...opt, selectedEdgeIds:ids }), rs = p.routes;
  return { ms:Date.now() - t0, routes:rs, total_h:Math.round(rs.reduce((a, r) => a + r.minutes, 0) / 6) / 10, max_h:Math.round(Math.max(...rs.map(r => r.minutes)) / 6) / 10,
    mailboxes:Math.round(rs.reduce((a, r) => a + r.mailboxes, 0)), km:Math.round(rs.reduce((a, r) => a + r.length_m, 0) / 100) / 10,
    workers:rs.map(r => ({ hours:Math.round(r.minutes / 6) / 10, mailboxes:Math.round(r.mailboxes), km:Math.round(r.length_m / 100) / 10, pieces:Planner.linkedPieces(G, r.part, new Set(rs.filter(x => x !== r).flatMap(x => x.part))).length })) }; };
const B = run(S);
const outer = S.slice().sort((a, b) => dOf(b) - dOf(a));   // the outermost planned streets first
const variants = quarters.slice(0, 4).map((q, k) => {
  const drop = []; let got = 0; for(const e of outer){ if(got >= q.mb) break; drop.push(e); got += G.edges[e].mb; }
  const dropSet = new Set(drop), ids = [...S.filter(e => !dropSet.has(e)), ...q.ids];
  const v = run(ids);
  return { k, quarter:{ name:q.name || null, where:where(q.centre), centre:q.centre, mb:q.mb, km:q.km, per_km:q.perKm, walk_from_flag_m:q.walk_min, cut:!!q.cut },
    dropped:{ streets:drop.length, mb:Math.round(got), walk_from_m:Math.round(Math.min(...drop.map(dOf))), where:[...new Set(drop.map(e => where(mid(e)).split(' ')[0]))].join('/') }, ...v, _ids:ids, _q:q.ids, _drop:drop };
});
const R = { base:{ total_h:B.total_h, max_h:B.max_h, mailboxes:B.mailboxes, km:B.km, workers:B.workers },
  variants:variants.map(({ routes, _ids, _q, _drop, ...v }) => ({ ...v, diff_total_h:Math.round((v.total_h - B.total_h) * 10) / 10 })) };
console.log(JSON.stringify(R, null, 1));

if(svgDir){
  mkdirSync(svgDir, { recursive:true });
  const la0 = 52.170, la1 = 52.250, lo0 = 8.600, lo1 = 8.790, kk = Math.cos(START[0] * Math.PI / 180), W = 1500, H = Math.round(W * (la1 - la0) / ((lo1 - lo0) * kk));
  const X = p => ((p[1] - lo0) / (lo1 - lo0) * W).toFixed(1), Y = p => ((la1 - p[0]) / (la1 - la0) * H).toFixed(1);
  const line = (c, st) => `<polyline points="${c.map(p => X(p) + ',' + Y(p)).join(' ')}" ${st}/>`, COL = ['#2563EB', '#C2185B'];
  const map = (name, title, v, extra) => { const s = [`<rect width="${W}" height="${H}" fill="#111827"/>`];
    G.edges.forEach(e => s.push(line(e.coords, `fill="none" stroke="${e.mb > 0 ? '#4B5563' : '#2B3442'}" stroke-width="1"`)));
    (extra || []).forEach(x => s.push(x));
    v.routes.forEach((r, w) => { let run_ = []; const fl = () => { if(run_.length > 1) s.push(line(run_, `fill="none" stroke="${COL[w]}" stroke-width="1.8" stroke-dasharray="5 5" opacity="1"`)); run_ = []; }; r.path.forEach(q => { if(q[2]) fl(); run_.push(q); }); fl(); });
    v.routes.forEach((r, w) => r.part.forEach(i => s.push(line(G.edges[i].coords, `fill="none" stroke="${COL[w]}" stroke-width="3.2" stroke-linecap="round"`))));
    let Rm = 0; v.routes.forEach(r => (r.boxes || []).forEach(q => { Rm = Math.max(Rm, 111320 * Math.hypot(q[0] - START[0], (q[1] - START[1]) * kk)); }));
    const rx = Rm / (111320 * kk) / (lo1 - lo0) * W, ry = Rm / 111320 / (la1 - la0) * H;
    s.push(`<ellipse cx="${X(START)}" cy="${Y(START)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="none" stroke="#60A5FA" stroke-width="2" stroke-dasharray="8 8"/><rect x="${+X(START) - 118}" y="${(+Y(START) - ry - 14).toFixed(1)}" width="236" height="22" rx="6" fill="#2563EB"/><text x="${X(START)}" y="${(+Y(START) - ry + 2).toFixed(1)}" text-anchor="middle" fill="#fff" font-family="sans-serif" font-size="14" font-weight="600">Verteilradius ≈ ${(Rm / 1000).toFixed(1).replace('.', ',')} km (Luftlinie)</text>`);
    s.push(`<circle cx="${X(START)}" cy="${Y(START)}" r="9" fill="#fff" stroke="#000" stroke-width="2"/>`);
    const f1 = x => String(x).replace('.', ',');
    s.push(`<rect x="8" y="8" width="640" height="132" fill="#000" opacity=".72" rx="8"/><text x="16" y="32" font-family="sans-serif" font-size="17" font-weight="700" fill="#fff">${title}</text>`
      + `<text x="16" y="56" font-family="sans-serif" font-size="15">${v.workers.map((w, j) => `<tspan x="16" dy="${j ? 22 : 0}" fill="${COL[j]}">${j ? 'Rosa' : 'Blau'}: ${f1(w.hours)} h · ${w.mailboxes} Briefkästen · ${f1(w.km)} km Weg</tspan>`).join('')}</text>`
      + `<line x1="16" y1="110" x2="60" y2="110" stroke="#fff" stroke-width="3.2"/><text x="68" y="115" font-family="sans-serif" font-size="14" fill="#fff">verteilen</text><line x1="160" y1="110" x2="204" y2="110" stroke="#fff" stroke-width="1.8" stroke-dasharray="5 5"/><text x="212" y="115" font-family="sans-serif" font-size="14" fill="#fff">nur gehen (ohne Verteilen)</text>`
      + `<text x="16" y="134" font-family="sans-serif" font-size="14" fill="#9CA3AF">Summe ${f1(v.total_h)} h · ${v.mailboxes} Briefkästen · Start und Ende an der Flagge</text>`);
    if(extra) s.push(`<rect x="8" y="146" width="640" height="30" fill="#000" opacity=".72" rx="8"/><line x1="16" y1="161" x2="60" y2="161" stroke="#FBBF24" stroke-width="7" opacity=".6"/><text x="68" y="166" font-family="sans-serif" font-size="14" fill="#fff">neues Viertel</text><line x1="190" y1="161" x2="234" y2="161" stroke="#F87171" stroke-width="5" opacity=".7"/><text x="242" y="166" font-family="sans-serif" font-size="14" fill="#fff">dafür herausgenommene äußerste Straßen</text>`);
    writeFileSync(`${svgDir}/${name}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${s.join('')}</svg>`); };
  map('aktuell', 'Löhne · feste Auflage 6.155 · 2 Personen · aktuell', B);
  const hull = ids => ids.map(i => line(G.edges[i].coords, 'fill="none" stroke="#FBBF24" stroke-width="7" opacity=".35" stroke-linecap="round"'));
  variants.forEach(v => map('variante-' + v.k, `Variante ${v.k + 1}: ${v.quarter.name || 'Viertel ' + v.quarter.where} statt äußerster Straßen`, v,
    [...hull(v._q), ...v._drop.map(i => line(G.edges[i].coords, 'fill="none" stroke="#F87171" stroke-width="5" opacity=".45"'))]));
  writeFileSync(`${svgDir}/swap.json`, JSON.stringify(R, null, 1));
}
