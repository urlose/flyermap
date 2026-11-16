// Time-budget optimizer ("Maximum Flyer für die Arbeitszeit"): the team's hours are the limit, every place is still planned on its own,
// every worker gets ONE route. Part 1: SYNTHETIC towns (street grids). Part 2: REAL Zensus 2022 cells (Weidenberg, Eisfeld, Leipheim) with a
// street graph derived from the census cells (1 mailbox per household, not OSM). No network. Run: node test/budget.mjs
import { readFileSync, existsSync } from 'node:fs';
import Planner from '../admin/planner.js';
import { createPlanService } from '../worker/src/plancore.js';
import { savedMailboxCounts } from '../worker/src/savecounts.js';
import { planRows, budgetDays } from '../worker/src/budgetplan.js';
import { censusSource, censusPlaces, laea, unlaea } from '../worker/src/zensus.js';
import { rankSuggestions, addSuggestion } from '../worker/src/expand.js';
let fail = 0; const ok = (name, c, info) => { console.log((c ? 'ok   ' : 'FAIL ') + name + (info != null ? '  ' + info : '')); if(!c) fail++; };
const hrs = m => (m / 60).toFixed(1);
const dups = p => { const seen = new Map(); let d = 0; p.routes.forEach(r => (r.boxes || []).forEach(b => { const k = b[0].toFixed(5) + ',' + b[1].toFixed(5); if(seen.has(k) && seen.get(k) !== r) d += b[2]; seen.set(k, r); })); return d; };

// ---------- Part 1: synthetic ----------
const LAT0 = 48.46, LNG0 = 10.21, mLat = 1 / 111320, mLng = 1 / (111320 * Math.cos(LAT0 * Math.PI / 180)), pt = (x, y) => [LAT0 + y * mLat, LNG0 + x * mLng];
const town = (cx, cy, nx, ny, perKm) => { const pts = [], key = new Map(), edges = [], step = 100; const node = (x, y) => { const k = x + ',' + y; if(!key.has(k)){ key.set(k, pts.length); pts.push(pt(x, y)); } return key.get(k); };
  const street = (x1, y1, x2, y2) => { const a = node(x1, y1), b = node(x2, y2), len = Math.hypot(x2 - x1, y2 - y1), mb = Math.round(len * perKm / 1000); edges.push({ a, b, len, coords:[pts[a], pts[b]], mb, boxes:[[(pts[a][0] + pts[b][0]) / 2, (pts[a][1] + pts[b][1]) / 2, mb]], name:'' }); };
  const x0 = cx - nx * step / 2, y0 = cy - ny * step / 2; for(let i = 0; i <= nx; i++) for(let j = 0; j <= ny; j++){ if(i < nx) street(x0 + i * step, y0 + j * step, x0 + (i + 1) * step, y0 + j * step); if(j < ny) street(x0 + i * step, y0 + j * step, x0 + i * step, y0 + (j + 1) * step); }
  const adj = pts.map(() => []); edges.forEach((e, i) => { adj[e.a].push({ e:i, to:e.b }); adj[e.b].push({ e:i, to:e.a }); }); const mb = edges.reduce((s, e) => s + e.mb, 0);
  return { c:pt(cx, cy), make:() => ({ pts, edges:edges.map(e => ({ ...e })), adj, radius:6000, usable:mb, mailboxes:mb, reach:1000, street_m:Math.round(edges.reduce((s, e) => s + e.len, 0)) }), mb }; };
const START = pt(0, 0), MAIN = town(0, 0, 22, 22, 150), B = town(8000, 0, 14, 14, 140), C = town(-8000, 3000, 10, 10, 120), D = town(3000, -9000, 7, 7, 90);
const V = [town(5000, 6000, 3, 3, 110), town(-5000, -5000, 3, 4, 100), town(9000, 7000, 4, 3, 120), town(-9000, -3000, 3, 3, 90), town(1000, 9000, 4, 4, 105)];   // five small villages
const WORLD = [MAIN, B, C, D, ...V], d2 = (a, b) => Math.hypot((a[0] - b[0]) / mLat, (a[1] - b[1]) / mLng);
Planner.loadForFlyers = async start => WORLD.reduce((m, t) => d2(start, t.c) < d2(start, m.c) ? t : m).make();
const side = (t, name, extra) => ({ name, lat:t.c[0], lng:t.c[1], flyers:t.mb, zone:null, all:false, auto:true, ...extra });
const run = async (flyers, n, sides, extra) => (await createPlanService(null).plan({ start:START, flyers, n, days:5, hours:7, quota:2000, travel:'zones', split:'even', exact:true, must:[], zone:null, side:sides, near:true, mainName:'Hauptstadt', ...extra }, () => {}, () => false)).plan;
const sides4 = () => [side(B, 'Bstadt'), side(C, 'Cdorf'), side(D, 'Ddorf')];
const placesOf = p => new Set(p.routes.flatMap(r => r.parts.map(x => x.place)));

{ const p = await run(10000, 2, sides4(), { budget:{ hours:32 } }), b = p.budget;
  ok('1 two workers, four towns, 32 h in total: two routes, together ≤ 32 h', p.routes.length === 2 && b.work_minutes <= 32 * 60 * 1.001, `${hrs(b.work_minutes)} h, ${p.routes.length} routes`);
  ok('1 about 16 h each (not 32 h each)', p.per_worker.every(m => Math.abs(m - 16 * 60) < 16 * 60 * 0.12), p.per_worker.map(hrs).join(' / ') + ' h');
  ok('1 every selected town is planned on its own (own part, own mailboxes)', ['Hauptstadt', 'Bstadt', 'Cdorf', 'Ddorf'].every(n => placesOf(p).has(n)) && p.split.every(x => x.flyers > 0), [...placesOf(p)].join(','));
  ok('1 the parts of a town carry their own mailboxes; they add up to the plan', Math.abs(p.routes.flatMap(r => r.parts).reduce((a, x) => a + x.mailboxes, 0) - p.mailboxes) <= 6, p.mailboxes + ' mailboxes');
  ok('1 no empty route is created to reach a number', p.routes.every(r => r.mailboxes > 0 && r.path.length > 1)); }
{ const base = await run(10000, 2, sides4()), baseH = base.per_worker.reduce((a, b) => a + b, 0) / 60, p = await run(10000, 2, sides4(), { budget:{ hours:32 } });
  ok('2 the 10 000 flyers need more than 32 h in the old plan, the budget plan stays within 32 h', baseH > 32 && p.budget.work_minutes / 60 <= 32.04, `old ${baseH.toFixed(1)} h, budget ${hrs(p.budget.work_minutes)} h for ${p.mailboxes} flyers`);
  ok('2 it is not the old plan cut proportionally: other streets/shares (towns keep their own parts, planned < 10 000)', p.mailboxes < 10000 && p.mailboxes > base.mailboxes * 0.9); }
{ const p = await run(30000, 2, sides4(), { budget:{ hours:32 } }), b = p.budget;
  ok('3 not all flyers fit in the time: uncovered is shown, the limit is not exceeded', b.uncovered > 15000 && b.limit === 'time' && b.work_minutes <= 32 * 60 * 1.001 && !b.fits_all, `uncovered ${b.uncovered}, limit ${b.limit}`);
  const q = await run(10000, 2, sides4(), { budget:{ hours:200 } });
  ok('3 with plenty of time the full order is planned and the hours stay lower than the budget', q.budget.fits_all && q.budget.uncovered === 0 && q.budget.work_minutes < 200 * 60 * 0.5 && q.mailboxes >= 9900, `${hrs(q.budget.work_minutes)} h for ${q.mailboxes}`);
  const r = await run(100000, 2, [side(D, 'Ddorf')], { budget:{ hours:400 } });
  ok('3 when the streets run out before the time: limit is the capacity, not the time', r.budget.limit === 'capacity' && r.budget.uncovered > 0, r.budget.limit); }
{ const sv = [...V.map((t, i) => side(t, 'Dorf' + (i + 1))), side(D, 'Ddorf')], p = await run(10000, 2, sv, { budget:{ hours:32 } });
  ok('4 several small villages: all are in the plan, still two routes, within the hours', V.every((_, i) => placesOf(p).has('Dorf' + (i + 1))) && p.routes.length === 2 && p.budget.work_minutes <= 32 * 60 * 1.001, `${placesOf(p).size} places, ${hrs(p.budget.work_minutes)} h`);
  ok('4 no street/mailbox twice', dups(p) === 0); }
{ const p1 = await run(10000, 2, sides4(), { budget:{ hours:32 } }), p2 = await run(10000, 2, sides4().filter(x => x.name !== 'Cdorf'), { budget:{ hours:32 } }), p3 = await run(10000, 2, [...sides4().filter(x => x.name !== 'Cdorf'), side(V[0], 'Neudorf')], { budget:{ hours:32 } });
  ok('5 a removed town is gone from the plan, nothing replaces it by itself', placesOf(p1).has('Cdorf') && !placesOf(p2).has('Cdorf') && !p2.split.some(x => x.name === 'Cdorf') && p2.budget.work_minutes <= 32 * 60 * 1.001);
  ok('5 a town added after the first calculation is planned (own part), budget kept', placesOf(p3).has('Neudorf') && p3.budget.work_minutes <= 32 * 60 * 1.001 && p3.routes.length === 2); }
{ const fixed = sides4().map(x => x.name === 'Bstadt' ? { ...x, auto:false, flyers:900 } : x), p = await run(10000, 2, fixed, { budget:{ hours:32 } }), sp = p.split.find(x => x.name === 'Bstadt');
  ok('6 the admin sets the flyers of one town: it gets that number, the others share the rest of the hours', sp && Math.abs(sp.flyers - 900) <= 900 * 0.05 && p.budget.work_minutes <= 32 * 60 * 1.001, `Bstadt ${sp && sp.flyers}`);
  const more = await run(10000, 2, fixed.map(x => x.name === 'Bstadt' ? { ...x, flyers:2500 } : x), { budget:{ hours:32 } });
  ok('6 changing the number again moves the hours: Bstadt grows, the main town shrinks', more.split.find(x => x.name === 'Bstadt').flyers > 2300 && more.split.find(x => x.name === 'Hauptstadt').flyers < p.split.find(x => x.name === 'Hauptstadt').flyers); }
{ const p = await run(24000, 2, sides4(), { budget:{ hours:300 } }); const clone = await run(10000, 2, [side(MAIN, 'Hauptstadt-Kopie', { lat:MAIN.c[0] + 0.0004 })], { budget:{ hours:32 } });
  ok('7 no mailbox is walked twice (two workers, four towns)', dups(p) === 0, 'duplicate mailboxes: ' + dups(p));
  ok('7 a second place on the same streets as the main town does not double the streets', dups(clone) === 0 && clone.mailboxes <= MAIN.mb); }
// rides between places: unknown time is reported, not counted as zero
{ const p = await run(10000, 2, sides4(), { budget:{ hours:32 } }), tr = p.budget.travel;
  ok('rides: places are joined by jump points, the time of the rides is UNKNOWN and said so', tr.known === false && tr.moves >= 2 && tr.jumps.every(j => j.known === false && j.min === null) && p.routes.every(r => r.path.filter(q => q[2] === 1).length === r.parts.length - 1), `${tr.moves} changes of place, far ${tr.far}`);
  ok('rides: no walking line between places (a jump marker starts every piece after the first)', p.routes.every(r => r.parts.slice(1).every(x => r.path[x.i0][2] === 1)) && p.routes.every(r => r.path[0][2] !== 1));
  const k = await run(10000, 2, sides4(), { budget:{ hours:32, travelMin:30 } });
  ok('rides: when the admin knows the ride time it is counted, and the budget is checked with it', k.budget.travel.known === true && k.budget.travel.minutes === k.budget.travel.moves * 30 && k.budget.work_minutes + k.budget.travel.minutes <= 32 * 60 * 1.01, `${k.budget.travel.moves} × 30 min`);
  const one = await run(10000, 1, sides4(), { budget:{ hours:32 } }); ok('one worker: one route with all places', one.routes.length === 1 && one.routes[0].parts.length >= 4);
  const three = await run(10000, 3, sides4(), { budget:{ hours:48 } }); ok('three workers: three routes, none empty', three.routes.length === 3 && three.routes.every(r => r.mailboxes > 0), three.per_worker.map(hrs).join('/'));
  const few = await run(300, 3, [], { budget:{ hours:48 } }); ok('fewer jobs than workers: no empty routes just to reach 3 records', few.routes.length < 3 && few.routes.every(r => r.mailboxes > 0), few.routes.length + ' route(s)'); }
// saved rows: two plans instead of one per place and person; GPS / days / progress invariants of every row
{ const bud = await run(24000, 2, sides4(), { budget:{ hours:60 } }), old = await run(24000, 2, sides4());
  const counts = savedMailboxCounts(bud.routes).routes, rows = planRows(bud, { taskId:'t', assign:{ 0:'wA', 1:'wB' }, counts, colors:Planner.COLORS }), oldRows = planRows(old, { taskId:'t', assign:{}, counts:savedMailboxCounts(old.routes).routes, colors:Planner.COLORS });
  ok('8 the new order saves two task_plans rows (the old zone mode needs one per place and person)', rows.length === 2 && oldRows.length > 4, `${rows.length} instead of ${oldRows.length}`);
  ok('8 one row per worker: worker_id, own idx; the colour is not the identity', rows.map(r => r.worker_id).join() === 'wA,wB' && rows.map(r => r.idx).join() === '0,1' && rows[0].color !== rows[1].color);
  ok('8 each row keeps every part\'s coordinates: path, boxes, steps, reserve, per-day town sections', rows.every(r => r.path.length > 10 && r.boxes.length > 10 && r.steps.length > 0 && r.days.every(d => d.parts && d.parts.length)));
  ok('8 the budget is remembered on the first day (reopening) and nowhere else', rows.every(r => r.days[0].budget_h === 60 && r.days.slice(1).every(d => d.budget_h == null)));
  ok('8 mailbox counts are integers and add up', rows.every(r => Number.isInteger(r.mailboxes)) && rows.reduce((a, r) => a + r.mailboxes, 0) === Math.round(bud.mailboxes));
  // days / GPS / progress
  const okDays = r => r.days.length >= 1 && r.days[0].i0 === 0 && r.days.at(-1).i1 === r.path.length - 1 && r.days.every((d, k) => d.i1 > d.i0 && (k === 0 || d.i0 === r.days[k - 1].i1)) && r.days.every(d => d.minutes <= 7 * 60 * 1.12 || d === r.days.at(-1));
  ok('9 days are contiguous over the whole path, at most one shift long, with the towns they walk', rows.every(okDays), rows.map(r => r.days.map(d => d.place).join(' | ')).join(' // '));
  ok('9 steps and reserve point into the path', rows.every(r => r.steps.every(st => st[0] >= 0 && st[0] < r.path.length)));
  const r0 = rows[0], pr0 = bud.routes[0], run1 = Planner.pathRuns(r0.path), tr = Planner.makeTracker(r0.path), part = pr0.parts[0], walk = r0.path.slice(part.i0, part.i1 + 1).map(q => [q[0], q[1]]);
  tr.addTrack(walk); const pct1 = tr.pct();
  ok('9 GPS/progress: walking the first town raises the progress, the other towns stay open; jump points are not streets', pct1 > 5 && pct1 < 95 && run1.length >= pr0.parts.length, `${pct1}% of the route after the first town; ${run1.length} line runs for ${pr0.parts.length} parts`);
  ok('9 the worker of a plan is found by worker_id for GPS/routes (plan_id link), progress per plan', rows.every(r => r.worker_id) && new Set(rows.map(r => r.worker_id)).size === rows.length);
  const re = budgetDays({ days:[{ i0:0, i1:5 }], parts:undefined }, bud); ok('9 a route without parts keeps its days untouched', JSON.stringify(re) === JSON.stringify([{ i0:0, i1:5 }])); }
// old orders and old modes
{ const z1 = await run(MAIN.mb + 2600, 2, [side(B, 'Bstadt')], { mainName:'Hauptstadt' }), z2 = await run(MAIN.mb + 2600, 2, [side(B, 'Bstadt')], { mainName:'Hauptstadt', budget:null }), z3 = await run(MAIN.mb + 2600, 2, [side(B, 'Bstadt')], { mainName:'Hauptstadt', budget:{ hours:0 } });
  ok('10 without the budget mode nothing changes: zone plan with one route per place and person', z1.zones === true && z1.budget === undefined && z1.merged === undefined && z1.routes.length === 4 && JSON.stringify(z1.split) === JSON.stringify(z2.split) && z3.routes.length === 4);
  const own = await run(10000, 2, sides4(), { budget:{ hours:32 }, zone:[[0, 0], [0.01, 0], [0.01, 0.01]] }), ma = await run(10000, 2, sides4(), { budget:{ hours:32 }, mainAll:true });
  ok('10 a drawn work area or "all mailboxes" keeps the old planner (budget ignored there)', !own.budget && !ma.budget);
  const oldRows = planRows(z1, { taskId:'t', assign:{}, counts:savedMailboxCounts(z1.routes).routes, colors:Planner.COLORS });
  ok('10 old-style rows are built as before (days untouched, one per route)', oldRows.length === z1.routes.length && oldRows.every((r, i) => r.days === z1.routes[i].days && !r.days.some(d => d.parts || d.budget_h))); }

// ---------- Part 2: REAL census cells ----------
const dir = new URL('../admin/zensus/', import.meta.url).pathname;
globalThis.fetch = async u => { const p = dir + String(u).split('/').pop(); return existsSync(p) ? { ok:true, status:200, arrayBuffer:async () => new Uint8Array(readFileSync(p)).buffer } : { ok:false, status:404 }; };
const dist = (a, b) => Math.hypot((a[0] - b[0]) * 111320, (a[1] - b[1]) * 111320 * Math.cos(a[0] * Math.PI / 180));
async function world(S){
  const [X, Y] = laea(S[0], S[1]), CX = Math.floor(X / 100), CY = Math.floor(Y / 100), WR = 160, H = await censusSource().households(CX - WR, CY - WR, CX + WR, CY + WR);
  const nid = new Map(), pts = [], edges = [], inc = new Map(); const node = (cx, cy) => { const k = cx + ',' + cy; if(!nid.has(k)){ nid.set(k, pts.length); pts.push(unlaea(cx * 100 + 50, cy * 100 + 50)); } return nid.get(k); };
  const addE = (a, b, c) => { const i = edges.length, A = pts[a], B2 = pts[b]; edges.push({ a, b, len:dist(A, B2), coords:[A, B2], mb:0, boxes:[], name:'' }); (inc.get(c) || inc.set(c, []).get(c)).push(i); };
  for(const [k] of H){ const [cx, cy] = k.split(',').map(Number); for(const [dx, dy] of [[1, 0], [0, 1]]) for(let s = 1; s <= 30; s++){ if(!H.has((cx + dx * s) + ',' + (cy + dy * s))) continue; let prev = node(cx, cy); for(let q = 1; q <= s; q++){ const nx = node(cx + dx * q, cy + dy * q); addE(prev, nx, q === 1 ? k : null); prev = nx; } break; } }
  for(const [k, h] of H){ const [cx, cy] = k.split(',').map(Number); let e = (inc.get(k) || [])[0]; if(e == null) e = [...(inc.get((cx - 1) + ',' + cy) || []), ...(inc.get(cx + ',' + (cy - 1)) || [])][0]; if(e == null) continue; const E = edges[e]; E.mb += h; E.boxes.push([(E.coords[0][0] + E.coords[1][0]) / 2, (E.coords[0][1] + E.coords[1][1]) / 2, h]); }
  Planner.loadForFlyers = async st => { const r = 4500, keep = new Set(); pts.forEach((p, i) => { if(dist(p, st) <= r) keep.add(i); }); const re = new Map(), P = []; keep.forEach(i => { re.set(i, P.length); P.push(pts[i]); });
    const E = edges.filter(e => keep.has(e.a) && keep.has(e.b)).map(e => ({ ...e, a:re.get(e.a), b:re.get(e.b), boxes:e.boxes.map(b => b.slice()) })), A = P.map(() => []); E.forEach((e, i) => { A[e.a].push({ e:i, to:e.b }); A[e.b].push({ e:i, to:e.a }); });
    const mb = E.reduce((s, e) => s + e.mb, 0); return { pts:P, edges:E, adj:A, radius:r, usable:mb, mailboxes:mb, reach:1000, street_m:Math.round(E.reduce((s, e) => s + e.len, 0)) }; };
}
for(const [name, S] of [['Weidenberg', [49.942445, 11.729003]], ['Eisfeld', [50.4215, 10.9105]], ['Leipheim', [48.4486, 10.2186]]]){
  const places = await censusPlaces(S[0], S[1], 18000);
  if(!places.length){ console.log(`skip ${name}: no census data in admin/zensus`); continue; }
  await world(S);
  const sug = rankSuggestions(places, { start:{ lat:S[0], lng:S[1] }, missing:8000, page:60 }).filter(x => x.households >= 100).slice(0, 3);
  const sides = sug.map((x, i) => { const s = addSuggestion([], x, name + '-Ort' + (i + 1))[0]; return { name:s.name, lat:s.lat, lng:s.lng, flyers:s.flyers, zone:null, all:false, auto:true, cid:s.cid }; });
  const p = await (await createPlanService(null).plan({ start:S, flyers:10000, n:2, days:5, hours:7, quota:2000, travel:'zones', split:'even', exact:true, must:[], zone:null, side:sides, near:true, mainName:name, budget:{ hours:32 } }, () => {}, () => false)).plan;
  const b = p.budget, ps = [...placesOf(p)];
  ok(`[real] ${name}: 32 h for 2 workers → ${p.mailboxes} flyers in ${hrs(b.work_minutes)} h, 2 routes (${p.per_worker.map(hrs).join(' / ')} h), not covered ≈ ${b.uncovered}`, p.routes.length === 2 && b.work_minutes <= 32 * 60 * 1.001 && p.mailboxes > 1000 && p.mailboxes <= 10000, `limit ${b.limit}`);
  ok(`[real] ${name}: every selected place has its own part (${ps.length} places: ${ps.join(', ')})`, ps.length >= 3 && sides.every(s => ps.includes(s.name) || p.split.find(x => x.name === s.name)), p.split.map(x => x.name + ':' + x.flyers).join(' '));
  ok(`[real] ${name}: no street or mailbox twice, ride times unknown and reported (${b.travel.moves} changes of place)`, dups(p) === 0 && b.travel.known === false && b.travel.jumps.every(j => j.min === null));
  const rows = planRows(p, { taskId:'t', assign:{}, counts:savedMailboxCounts(p.routes).routes, colors:Planner.COLORS });
  ok(`[real] ${name}: two rows to save, days contiguous`, rows.length === 2 && rows.every(r => r.days[0].i0 === 0 && r.days.at(-1).i1 === r.path.length - 1));
}
console.log(fail ? fail + ' FAILED' : 'all ok'); process.exit(fail ? 1 : 0);
