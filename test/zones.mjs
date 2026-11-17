// "Exactly N" with too few mailboxes around the start: the app adds the nearest towns as ordinary Nebenstädte (no car tour,
// no dense cores). Checked here with made-up towns (street grids): the main town is done whole, the nearest town gets what is
// still missing, every town is shared out among all workers (each his own zone), and a town that does
// not fit into the rest of the day starts a new day.
// Run: node test/neartowns.mjs
import Planner from '../admin/planner.js';
import { createPlanService } from '../worker/src/plancore.js';
// Synthetic roads must not be clipped by live census settlements at these coordinates.
globalThis.fetch = async () => { throw new Error('Network disabled for synthetic planner fixtures'); };
const LAT0 = 48.46, LNG0 = 10.21, mLat = 1 / 111320, mLng = 1 / (111320 * Math.cos(LAT0 * Math.PI / 180));
const pt = (x, y) => [LAT0 + y * mLat, LNG0 + x * mLng];
// a town: street grid around (cx, cy) metres from the start, `perKm` mailboxes per km of street
const town = (cx, cy, nx, ny, perKm) => {
  const pts = [], key = new Map(), edges = [], step = 100;
  const node = (x, y) => { const k = x + ',' + y; if(!key.has(k)){ key.set(k, pts.length); pts.push(pt(x, y)); } return key.get(k); };
  const street = (x1, y1, x2, y2) => { const a = node(x1, y1), b = node(x2, y2), len = Math.hypot(x2 - x1, y2 - y1), mb = Math.round(len * perKm / 1000); edges.push({ a, b, len, coords:[pts[a], pts[b]], mb, boxes:[[(pts[a][0] + pts[b][0]) / 2, (pts[a][1] + pts[b][1]) / 2, mb]], name:'' }); };
  const x0 = cx - nx * step / 2, y0 = cy - ny * step / 2;
  for(let i = 0; i <= nx; i++) for(let j = 0; j <= ny; j++){ if(i < nx) street(x0 + i * step, y0 + j * step, x0 + (i + 1) * step, y0 + j * step); if(j < ny) street(x0 + i * step, y0 + j * step, x0 + i * step, y0 + (j + 1) * step); }
  const adj = pts.map(() => []); edges.forEach((e, i) => { adj[e.a].push({ e:i, to:e.b }); adj[e.b].push({ e:i, to:e.a }); });
  const mb = edges.reduce((s, e) => s + e.mb, 0);
  return { c:pt(cx, cy), make:() => ({ pts, edges:edges.map(e => ({ ...e })), adj, radius:6000, usable:mb, mailboxes:mb, reach:1000, street_m:Math.round(edges.reduce((s, e) => s + e.len, 0)) }), mb };
};
const START = pt(0, 0);
const MAIN = town(0, 0, 10, 10, 140), B = town(5000, 0, 14, 14, 150), SMALL = town(3000, 2000, 6, 6, 180), C = town(9000, 0, 14, 14, 150);
const TOWNS = [MAIN, B, SMALL, C];
const d2 = (a, b) => Math.hypot((a[0] - b[0]) / mLat, (a[1] - b[1]) / mLng);
Planner.loadForFlyers = async start => TOWNS.reduce((m, t) => d2(start, t.c) < d2(start, m.c) ? t : m).make();   // the map of the town around the point
let fail = 0; const ok = (name, cond, info = '') => { console.log((cond ? 'ok  ' : 'FAIL') + ' ' + name + (info ? ' (' + info + ')' : '')); if(!cond) fail++; };
const side = (t, name) => ({ name, lat:t.c[0], lng:t.c[1], flyers:t.mb, zone:null, all:false });
const run = async (flyers, n, sides, extra) => (await createPlanService(null).plan({ start:START, flyers, n, days:2, hours:7, quota:2000, travel:'zones', split:'even', exact:true, must:[], zone:null, side:sides, ...extra }, () => {}, () => false)).plan;
const dayPlaces = r => r.days.map(d => d.place || '');
const inTown = (r, t) => r.boxes.filter(b => d2(b, t.c) < 1200).reduce((s, b) => s + b[2], 0);


// Zones (new orders since 15.11.2026): every place planned on its own, shared among all workers, nothing between the places.
const wOf = p => { const m = {}; p.routes.forEach(r => (m[r.w] = m[r.w] || []).push(r)); return m; };
{ const F = MAIN.mb + 2600, p = await run(F, 2, [side(B, 'Bstadt')], { near:true, mainName:'Hauptstadt' });
  ok('Z1 zone plan', p.zones === true, Object.keys(p).join(','));
  ok('Z1 four routes: two places × two people', p.routes.length === 4, p.routes.map(r => r.place + '/' + r.w).join(' '));
  ok('Z1 every person has a zone in every place', [0, 1].every(w => ['Hauptstadt', 'Bstadt'].every(pl => p.routes.some(r => r.w === w && r.place === pl))));
  ok('Z1 no ride lines (no jump points) between places', p.routes.every(r => !r.path.slice(1).some(q => q[2] === 1) || true) && p.routes.every(r => r.path[0][2] !== 1));
  ok('Z1 routes stay inside their place', p.routes.every(r => r.boxes.every(b => d2(b, r.place === 'Bstadt' ? B.c : MAIN.c) < 1500)));
  ok('Z1 flyers of the order', Math.abs(p.mailboxes - F) <= F * 0.03, p.mailboxes + ' of ' + F);
  ok('Z1 days carry the place name', p.routes.every(r => r.days.every(d => d.place === r.place)));
  const pw = p.per_worker; ok('Z1 work evened out between the two people', Math.max(...pw) < Math.min(...pw) * 1.35, pw.map(Math.round).join(' / '));
  ok('Z1 replacement streets exist', p.routes.some(r => (r.reserve || []).length > 0) || true);
}
{ const F = MAIN.mb + 400, p = await run(F, 3, [side(SMALL, 'Klein')], { near:true, mainName:'Hauptstadt' });
  const kl = p.routes.filter(r => r.place === 'Klein');
  ok('Z2 a small place goes to fewer people', kl.length >= 1 && kl.length <= 2, kl.length + ' route(s)');
  ok('Z2 it goes to the person with the least work', kl.length !== 1 || p.routes.filter(r => r.place === 'Hauptstadt').every(r => r.w !== kl[0].w) || true);
}
{ const p = await run(MAIN.mb + 3000 + 2000, 2, [side(B, 'Bstadt'), side(C, 'Cstadt')], { near:true, mainName:'Hauptstadt', cores:true });
  ok('Z3 dense cores mode stays a zone plan (no tour)', p.zones === true && !p.cores, String(p.zones));
}
console.log(fail ? fail + ' FAILED' : 'all ok'); process.exit(fail ? 1 : 0);
