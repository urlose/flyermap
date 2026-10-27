// Synthetic town: start in the middle, dense grid west and east, a village to the north on one road.
// Checks that no worker gets a small detached piece inside another worker's area.
// Run: node test/islands.mjs   (DAYS=1, PLANNER=path to compare another planner version)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const P = require(process.env.PLANNER || '../admin/planner.js'); const DAYS = +(process.env.DAYS || 2);
const LAT0 = 49.94, LNG0 = 11.72, mLat = 1 / 111320, mLng = 1 / (111320 * Math.cos(LAT0 * Math.PI / 180));
const pt = (x, y) => [LAT0 + y * mLat, LNG0 + x * mLng];
function town(seed){
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const pts = [], key = new Map(), edges = [];
  const node = (x, y) => { const k = x + ',' + y; if(!key.has(k)){ key.set(k, pts.length); pts.push(pt(x, y)); } return key.get(k); };
  const street = (x1, y1, x2, y2, dens, name) => {
    const a = node(x1, y1), b = node(x2, y2), len = Math.hypot(x2 - x1, y2 - y1), mb = Math.round(len * dens * (0.6 + 0.8 * rnd()));
    edges.push({ a, b, len, coords:[pts[a], pts[b]], mb, boxes:[], name:name || '' });
  };
  const grid = (x0, y0, nx, ny, step, dens, name) => {
    for(let i = 0; i <= nx; i++) for(let j = 0; j <= ny; j++){
      if(i < nx) street(x0 + i * step, y0 + j * step, x0 + (i + 1) * step, y0 + j * step, dens, name);
      if(j < ny) street(x0 + i * step, y0 + j * step, x0 + i * step, y0 + (j + 1) * step, dens, name);
    }
  };
  grid(-1200, -400, 10, 6, 100, 0.3);              // west town (dense)
  grid(100, -300, 8, 3, 100, 0.12);                // east industrial strip (sparse)
  street(0, 0, -200, 0, 0.1); street(0, 0, 100, 0, 0.1);
  street(0, 0, 0, 300, 0.02); street(0, 300, 160, 700, 0.02);   // one road north
  grid(0, 700, 6, 3, 80, 0.4);                     // village in the north
  // a lonely road north-west: through a small hamlet (main street + side streets) on to a rich village behind it
  street(-600, 200, -600, 1000, 0.01);
  for(let y = 1000; y < 1240; y += 60) street(-600, y, -600, y + 60, 0.35, 'hamlet');                  // hamlet main street
  for(let y = 1000; y <= 1240; y += 60){ street(-600, y, -680, y + 20, 0.3, 'hamlet'); street(-600, y, -520, y + 20, 0.3, 'hamlet'); }   // its side streets
  street(-600, 1240, -600, 1800, 0.01); grid(-800, 1800, 5, 4, 80, 0.6);                                  // rich village behind it
  for(let k = 0; k < 4; k++) street(80 * k + 80, 940, 80 * k + 80 + 20, 1040, 0.4);   // spurs at the village edge
  const adj = pts.map(() => []);
  edges.forEach((e, i) => { adj[e.a].push({ e:i, to:e.b }); adj[e.b].push({ e:i, to:e.a }); });
  return { pts, edges, adj };
}
// pieces of one route that are not connected to its main body (by shared junctions)
// pieces of a route that are cut off from its main area AND lie against another worker's area (a walk through a colleague's streets)
function islands(g, ids, others){
  const near = new Set(); for(const o of others) for(const e of o){ near.add(g.edges[e].a); near.add(g.edges[e].b); }
  const all = ids.reduce((s, e) => s + g.edges[e].len, 0);
  return islandsAll(g, ids).filter(c => c.touch(near)).map(c => ({ len:c.len, share:c.len / all }));
}
function islandsAll(g, ids){
  const set = new Set(ids), seen = new Set(), comps = [];
  for(const i of ids){
    if(seen.has(i)) continue;
    const st = [i], c = []; seen.add(i);
    while(st.length){ const e = st.pop(); c.push(e); for(const v of [g.edges[e].a, g.edges[e].b]) for(const { e:f } of g.adj[v]) if(set.has(f) && !seen.has(f)){ seen.add(f); st.push(f); } }
    comps.push({ len:c.reduce((s, e) => s + g.edges[e].len, 0), touch:near => c.some(e => near.has(g.edges[e].a) || near.has(g.edges[e].b)) });
  }
  comps.sort((a, b) => b.len - a.len);
  return comps.slice(1);
}
let bad = 0, total = 0, small = 0, half = 0;
for(const seed of [1, 2, 3, 4, 5, 6, 7, 8]) for(const n of [2, 3, 4]) for(const flyers of [2500, 4000, 8000]){
  const g = town(seed), plan = P.planFlyers(g, pt(0, 0), flyers, n, { days:DAYS, hoursPerDay:7 });
  const isl = plan.routes.map((r, k) => islands(g, r.part, plan.routes.filter((_, j) => j !== k).map(x => x.part))).flat().filter(m => m.len > 0);
  const mins = plan.routes.map(r => r.minutes), walk = plan.routes.reduce((s, r) => s + r.length_m, 0);
  const ham = g.edges.map((e, i) => e.name === 'hamlet' ? i : -1).filter(i => i >= 0), inPlan = new Set(plan.routes.flatMap(r => r.part));
  const hIn = ham.filter(i => inPlan.has(i)).length; if(hIn && hIn < ham.length){ half++; console.log(`  !! hamlet only half planned: ${hIn} of ${ham.length} streets`); }
  total++; if(isl.length) bad++; small += isl.filter(m => m.share < 0.3).length;
  if(plan.routes.some(r => r.covered === false)) console.log('  !! a route misses some of its streets');
  console.log(`seed ${seed} n=${n} flyers=${flyers}: max ${Math.max(...mins)} min, all ${Math.round(walk / 1000 * 10) / 10} km, detached pieces: ${isl.length ? isl.map(m => Math.round(m.len)).join(', ') + ' m' : '—'}`);
}
console.log(`\n${bad} of ${total} plans have detached pieces, ${small} of them small stray bits (< 30 % of the route)`);
console.log(`${half} plans leave the small hamlet half walked`);
if(small || half) process.exit(1);
