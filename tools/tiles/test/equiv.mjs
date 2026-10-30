// Own squares (build.py) must equal what the app makes from Overpass answers (compactTile) for the same OSM data.
// Run: python3 gen.py && python3 ../build.py --pbf data.osm --bbox 52.17,8.66,52.26,8.78 --out out --nosplit && node equiv.mjs
import { createRequire } from 'module'; import { readFileSync, readdirSync } from 'fs'; import { gunzipSync } from 'zlib';
const require = createRequire(import.meta.url), P = require('../../../admin/planner.js');
const D = JSON.parse(readFileSync(new URL('./data.json', import.meta.url)));
const N = new Map(D.nodes.map(([id, lat, lon]) => [id, { id, lat, lon }]));
const HOUSE = /^(house|detached|semidetached_house|terrace|bungalow|villa|farm|cottage|houseboat|static_caravan)$/;
const src = readFileSync(new URL('../../../admin/planner.js', import.meta.url), 'utf8');
const NO_B = new RegExp('^(' + src.match(/const NO_B = '([^']*)'/)[1] + ')$'), NO_WAY = new RegExp('^(' + src.match(/const NO_WAY = '([^']*)'/)[1] + ')$');
const street = t => t.highway && !NO_WAY.test(t.highway) && !/^(parking_aisle|driveway|drive-through|emergency_access)$/.test(t.service || '') && !/^(private|no)$/.test(t.access || '');
// segment–rectangle intersection (Overpass bbox semantics for ways)
const inside = (p, b) => p.lat >= b[0] && p.lat <= b[2] && p.lon >= b[1] && p.lon <= b[3];
function segHits(a, c, b){
  if(inside(a, b) || inside(c, b)) return true;
  let t0 = 0, t1 = 1; const dx = c.lon - a.lon, dy = c.lat - a.lat;
  for(const [p, q] of [[-dx, a.lon - b[1]], [dx, b[3] - a.lon], [-dy, a.lat - b[0]], [dy, b[2] - a.lat]]){
    if(p === 0){ if(q < 0) return false; continue; }
    const r = q / p; if(p < 0){ if(r > t1) return false; if(r > t0) t0 = r; } else { if(r < t0) return false; if(r < t1) t1 = r; }
  }
  return true;
}
const hits = (ids, b) => ids.some((id, i) => i && segHits(N.get(ids[i - 1]), N.get(id), b)) || (ids.length === 1 && inside(N.get(ids[0]), b));
function overpassTile(k){
  const [i, j] = k.split(':').map(Number), b = [i * 0.03, j * 0.045, (i + 1) * 0.03, (j + 1) * 0.045];
  const els = [], used = new Set();
  for(const [id, ids, t] of D.ways) if(street(t) && hits(ids, b)){ els.push({ type:'way', id, nodes:ids, tags:t }); ids.forEach(n => used.add(n)); }
  for(const n of used) els.push({ type:'node', ...N.get(n) });
  for(const [id, ids, t] of D.ways){
    if(t.building === undefined || !hits(ids, b)) continue;
    const g = ids.map(n => N.get(n));
    if(HOUSE.test(t.building)){ const la = g.map(p => p.lat), lo = g.map(p => p.lon); els.push({ type:'way', id, tags:t, center:{ lat:(Math.min(...la) + Math.max(...la)) / 2, lon:(Math.min(...lo) + Math.max(...lo)) / 2 } }); }
    else if(!NO_B.test(t.building)) els.push({ type:'way', id, tags:t, geometry:g.map(p => ({ lat:p.lat, lon:p.lon })) });
  }
  return P.compactTile({ elements:els });
}
const files = readdirSync(new URL('./out', import.meta.url)).filter(f => f.endsWith('.json.gz'));
const keys = files.map(f => f.replace('.json.gz', '').replace('_', ':'));
const own = keys.map(k => P.decodeTile(JSON.parse(gunzipSync(readFileSync(new URL('./out/' + k.replace(':', '_') + '.json.gz', import.meta.url))))));
const ovp = keys.map(overpassTile);
const A = P.mergeTiles(own), B = P.mergeTiles(ovp);
let fail = 0; const check = (ok, m) => { console.log((ok ? 'ok   ' : 'FAIL ') + m); if(!ok) fail++; };
const sig = m => ({ nodes:m.osm.elements.filter(e => e.type === 'node').map(e => e.id + ':' + e.lat + ',' + e.lon).sort().join('|'),
  ways:m.osm.elements.filter(e => e.type === 'way').map(e => e.id + ':' + (e.tags.name || '') + ':' + e.nodes.join(',')).sort().join('|'),
  b:m.buildings.map(x => x.lat + ',' + x.lng + ':' + x.n).sort() });
const a = sig(A), b = sig(B);
check(a.ways === b.ways, `streets equal (${A.osm.elements.filter(e => e.type === 'way').length})`);
check(a.nodes === b.nodes, `street nodes equal (${A.osm.elements.filter(e => e.type === 'node').length})`);
// centres are computed in floating point on both sides: allow one unit in the 6th decimal
const near = (x, y) => { const [p, n] = x.split(':'), [q, m] = y.split(':'), [a1, b1] = p.split(',').map(Number), [a2, b2] = q.split(',').map(Number); return n === m && Math.abs(a1 - a2) < 1.5e-6 && Math.abs(b1 - b2) < 1.5e-6; };
const left = [...b.b]; let miss = [];
for(const x of a.b){ const k = left.findIndex(y => near(x, y)); if(k < 0) miss.push(x); else left.splice(k, 1); }
check(!miss.length && !left.length, `houses equal (${a.b.length} vs ${b.b.length}, mailboxes ${A.buildings.reduce((s, x) => s + x.n, 0)} vs ${B.buildings.reduce((s, x) => s + x.n, 0)})` + (miss.length || left.length ? ' own only: ' + miss.slice(0, 3) + ' overpass only: ' + left.slice(0, 3) : ''));
// the planner gives the same result
const start = [52.2062, 8.6998], g = m => { const x = P.largestComponent(P.buildGraph(m.osm, null)); P.attachBuildings(x, m.buildings); return x; };
const ga = g(A), gb = g(B);
check(ga.mailboxes === gb.mailboxes && ga.edges.length === gb.edges.length, `graph: ${ga.edges.length} edges, ${ga.mailboxes} mailboxes`);
process.exit(fail ? 1 : 0);
