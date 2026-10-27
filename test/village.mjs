// A road leads from the town to a rich village; half-way it passes a small hamlet (side streets off the road).
// The flyers run out with the town + the rich village. The hamlet's side streets must not be left out while
// the route walks right past them (seen in Görschnitz near Weidenberg).
// Run: node test/village.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const P = require(process.env.PLANNER || '../admin/planner.js');
const LAT0 = 49.94, LNG0 = 11.72, mLat = 1 / 111320, mLng = 1 / (111320 * Math.cos(LAT0 * Math.PI / 180));
const pt = (x, y) => [LAT0 + y * mLat, LNG0 + x * mLng];
const SHORT = process.env.SHORT === '1';   // country road cut into short pieces: road, hamlet and village become one cluster
const pts = [], key = new Map(), edges = [];
const node = (x, y) => { const k = x + ',' + y; if(!key.has(k)){ key.set(k, pts.length); pts.push(pt(x, y)); } return key.get(k); };
const street = (x1, y1, x2, y2, perKm, name) => { const a = node(x1, y1), b = node(x2, y2), len = Math.hypot(x2 - x1, y2 - y1); edges.push({ a, b, len, coords:[pts[a], pts[b]], mb:Math.round(len * perKm / 1000), boxes:[], name:name || '' }); };
const grid = (x0, y0, nx, ny, step, perKm) => { for(let i = 0; i <= nx; i++) for(let j = 0; j <= ny; j++){ if(i < nx) street(x0 + i * step, y0 + j * step, x0 + (i + 1) * step, y0 + j * step, perKm); if(j < ny) street(x0 + i * step, y0 + j * step, x0 + i * step, y0 + (j + 1) * step, perKm); } };
grid(-500, -500, 10, 10, 100, 300);                       // town around the start: 220 streets × 30 = 6600 boxes
{ const step = SHORT ? 50 : 250; for(let y = 500; y < 2000; y += step) street(0, y, 0, y + step, 5); }   // country road north
for(const y of [1000, 1250]) for(const dx of [-150, 150]) street(0, y, dx, y + 40, 160, 'hamlet');   // hamlet side streets off the road
grid(-200, 2000, 4, 4, 100, 400);                         // rich village at the end: 40 × 40 = 1600 boxes
const adj = pts.map(() => []); edges.forEach((e, i) => { adj[e.a].push({ e:i, to:e.b }); adj[e.b].push({ e:i, to:e.a }); });
const g = { pts, edges, adj };
const ham = edges.map((e, i) => e.name === 'hamlet' ? i : -1).filter(i => i >= 0);
let bad = 0;
for(const flyers of [7000, 7500, 8000, 8200, 8500]){
  const sel = P.selectForFlyers(g, pt(0, 0), flyers), set = new Set(sel.ids);
  const road = edges.some((e, i) => set.has(i) && e.name === '' && pts[e.a][0] > pt(0, 1100)[0] && pts[e.a][0] < pt(0, 1900)[0] && e.mb < 3);
  const hin = ham.filter(i => set.has(i)).length;
  const half = road && hin < ham.length;
  if(half) bad++;
  console.log(`flyers ${flyers}: ${sel.mailboxes} boxes, road past the hamlet walked: ${road ? 'yes' : 'no'}, hamlet streets ${hin}/${ham.length}${half ? '  <-- left out' : ''}`);
}
console.log(bad ? `${bad} plans walk past the hamlet without doing it` : 'ok');
process.exit(bad ? 1 : 0);
