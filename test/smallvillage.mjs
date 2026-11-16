// A small village the admin confirmed from the census suggestions (side.cid) gets its own route, also with < 150 mailboxes; the village
// itself, not a bigger neighbour within 1.5 km, is planned. Places without cid (old orders, app-picked places) behave as before.
// REAL Zensus 2022 cells (admin/zensus); the STREET GRAPH is synthetic: roads between neighbouring census cells, 1 mailbox per household.
// Run: node test/smallvillage.mjs
import { readFileSync, existsSync } from 'node:fs';
import Planner from '../admin/planner.js';
import { createPlanService } from '../worker/src/plancore.js';
import { censusSource, censusPlaces, laea, unlaea } from '../worker/src/zensus.js';
import { rankSuggestions, addSuggestion } from '../worker/src/expand.js';
let fail = 0; const ok = (name, c, info) => { console.log((c ? 'ok   ' : 'FAIL ') + name + (info != null ? '  ' + info : '')); if(!c) fail++; };
const dir = new URL('../admin/zensus/', import.meta.url).pathname;
globalThis.fetch = async u => { const p = dir + String(u).split('/').pop(); return existsSync(p) ? { ok:true, status:200, arrayBuffer:async () => new Uint8Array(readFileSync(p)).buffer } : { ok:false, status:404 }; };
const dist = (a, b) => Math.hypot((a[0] - b[0]) * 111320, (a[1] - b[1]) * 111320 * Math.cos(a[0] * Math.PI / 180));

async function world(START, drop){
  const [X, Y] = laea(START[0], START[1]), CX = Math.floor(X / 100), CY = Math.floor(Y / 100), WR = 160, H = await censusSource().households(CX - WR, CY - WR, CX + WR, CY + WR);
  const nid = new Map(), pts = [], edges = [], inc = new Map(); const node = (cx, cy) => { const k = cx + ',' + cy; if(!nid.has(k)){ nid.set(k, pts.length); pts.push(unlaea(cx * 100 + 50, cy * 100 + 50)); } return nid.get(k); };
  const addE = (a, b, c) => { const i = edges.length, A = pts[a], B = pts[b]; edges.push({ a, b, len:dist(A, B), coords:[A, B], mb:0, boxes:[], name:'' }); (inc.get(c) || inc.set(c, []).get(c)).push(i); };
  for(const [k] of H){ const [cx, cy] = k.split(',').map(Number); for(const [dx, dy] of [[1, 0], [0, 1]]) for(let s = 1; s <= 12; s++){ if(!H.has((cx + dx * s) + ',' + (cy + dy * s))) continue; let prev = node(cx, cy); for(let q = 1; q <= s; q++){ const nx = node(cx + dx * q, cy + dy * q); addE(prev, nx, q === 1 ? k : null); prev = nx; } break; } }
  for(const [k, h] of H){ if(drop && drop(k)) continue; const [cx, cy] = k.split(',').map(Number); let e = (inc.get(k) || [])[0]; if(e == null) e = [...(inc.get((cx - 1) + ',' + cy) || []), ...(inc.get(cx + ',' + (cy - 1)) || [])][0]; if(e == null) continue; const E = edges[e]; E.mb += h; E.boxes.push([(E.coords[0][0] + E.coords[1][0]) / 2, (E.coords[0][1] + E.coords[1][1]) / 2, h]); }
  Planner.loadForFlyers = async st => { const r = 3000, keep = new Set(); pts.forEach((p, i) => { if(dist(p, st) <= r) keep.add(i); }); const re = new Map(), P = []; keep.forEach(i => { re.set(i, P.length); P.push(pts[i]); });
    const E = edges.filter(e => keep.has(e.a) && keep.has(e.b)).map(e => ({ ...e, a:re.get(e.a), b:re.get(e.b), boxes:e.boxes.map(b => b.slice()) })), A = P.map(() => []); E.forEach((e, i) => { A[e.a].push({ e:i, to:e.b }); A[e.b].push({ e:i, to:e.a }); });
    const mb = E.reduce((s, e) => s + e.mb, 0); return { pts:P, edges:E, adj:A, radius:r, usable:mb, mailboxes:mb, reach:1000, street_m:Math.round(E.reduce((s, e) => s + e.len, 0)) }; };
  return { H, cellOf:(lat, lng) => { const [x, y] = laea(lat, lng); return Math.floor(x / 100) + ',' + Math.floor(y / 100); } };
}
const plan = async (START, name, side) => (await createPlanService(null).plan({ start:START, flyers:10000, n:2, days:5, hours:7, quota:2000, travel:'zones', split:'even', exact:true, must:[], zone:null, side, near:true, mainName:name }, () => {}, () => false)).plan;
const dups = p => { const seen = new Map(); let d = 0; p.routes.forEach(r => (r.boxes || []).forEach(b => { const k = b[0].toFixed(5) + ',' + b[1].toFixed(5); if(seen.has(k) && seen.get(k) !== r) d += b[2]; seen.set(k, r); })); return d; };
const asSide = s => { const x = addSuggestion([], s, 'Dorf ' + s.households)[0]; return { name:x.name, lat:x.lat, lng:x.lng, flyers:x.flyers, zone:null, all:false, ...(x.cid ? { cid:x.cid } : {}) }; };

for(const [name, START] of [['Weidenberg', [49.942445, 11.729003]], ['Eisfeld', [50.4215, 10.9105]]]){
  await world(START);
  const places = await censusPlaces(START[0], START[1], 18000), sug = rankSuggestions(places, { start:{ lat:START[0], lng:START[1] }, missing:8000, page:60 });
  const small = sug.filter(s => s.households >= 60 && s.households < 150 && s.km >= 2.5)[0], base = await plan(START, name, []);
  const chosen = await plan(START, name, [asSide(small)]), village = chosen.routes.filter(r => r.place === 'Dorf ' + small.households);
  const sp = (chosen.split || []).find(x => x.name === 'Dorf ' + small.households);
  ok(`${name}: a confirmed village of ${small.households} households gets its own route`, village.length >= 1 && chosen.mailboxes > base.mailboxes, `${base.mailboxes} -> ${chosen.mailboxes} mailboxes, ${village.length} route(s), ${Math.round(village.reduce((a, r) => a + r.minutes, 0))} min`);
  ok(`${name}: the planner plans THAT village (its own census area), not a bigger neighbour`, sp && sp.hh === small.households && sp.flyers > 0, JSON.stringify(sp));
  ok(`${name}: no mailbox is in two routes`, dups(chosen) === 0);
  const old = await plan(START, name, [{ ...asSide(small), cid:undefined }]);
  ok(`${name}: the same place WITHOUT cid (old orders / app-picked) behaves as before: no route below 150 flyers`, !old.routes.some(r => r.place === 'Dorf ' + small.households) && old.mailboxes === base.mailboxes, `${old.mailboxes} mailboxes`);
}
{ // a confirmed place with no usable streets: no route, no crash, the numbers say so (split flyers 0 -> the wizard shows the notice)
  const START = [49.942445, 11.729003], pl = await censusPlaces(START[0], START[1], 18000), sug = rankSuggestions(pl, { start:{ lat:START[0], lng:START[1] }, missing:8000, page:60 }), s = sug.filter(x => x.households >= 60 && x.households < 150 && x.km >= 2.5)[0];
  const own = new Set(); for(let i = 0; i < s.cells.length; i += 2) own.add(s.cells[i] + ',' + s.cells[i + 1]);
  await world(START, k => own.has(k));   // the village's houses have no mailboxes in the street data
  const p = await plan(START, 'Weidenberg', [asSide(s)]), sp = (p.split || []).find(x => x.name === 'Dorf ' + s.households);
  ok('a confirmed village without usable streets: no route, no error, flyers 0 in the split (the wizard shows the notice)', !p.routes.some(r => r.place === 'Dorf ' + s.households) && sp && sp.flyers === 0, JSON.stringify(sp));
}
console.log(fail ? fail + ' FAILED' : 'all ok'); process.exit(fail ? 1 : 0);
