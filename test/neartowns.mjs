// "Exactly N" with too few mailboxes around the start: the app adds the nearest towns as ordinary Nebenstädte (no car tour,
// no dense cores). Checked here with made-up towns (street grids): the main town is done whole, the nearest town gets what is
// still missing, every town is shared out among all workers when there are fewer towns than people, and a town that does
// not fit into the rest of the day starts a new day.
// Run: node test/neartowns.mjs
import Planner from '../admin/planner.js';
import { createPlanService } from '../worker/src/plancore.js';
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
const run = async (flyers, n, sides, extra) => (await createPlanService(null).plan({ start:START, flyers, n, days:2, hours:7, quota:2000, travel:'bus', split:'even', exact:true, must:[], zone:null, side:sides, ...extra }, () => {}, () => false)).plan;
const dayPlaces = r => r.days.map(d => d.place || '');
const inTown = (r, t) => r.boxes.filter(b => d2(b, t.c) < 1200).reduce((s, b) => s + b[2], 0);

// 1. main town + one town, two workers
{ const F = MAIN.mb + 2600, p = await run(F, 2, [side(B, 'Bstadt')], { near:true });
  const sp = p.split || [];
  ok('1 main town whole, the rest in the nearest town', sp[0] && sp[0].flyers === MAIN.mb && sp[1] && sp[1].flyers === 2600, JSON.stringify(sp));
  ok('1 exactly the flyers of the order', Math.abs(p.mailboxes - F) <= F * 0.03, p.mailboxes + ' of ' + F);
  ok('1 no car tour, no dense cores', !p.cores && p.team && p.team[0] === 'Bstadt');
  ok('1 two routes, both work in both towns', p.routes.length === 2 && p.routes.every(r => inTown(r, MAIN) > MAIN.mb * 0.3 && inTown(r, B) > 2600 * 0.3), p.routes.map(r => inTown(r, MAIN) + '+' + inTown(r, B)).join(' / '));
  ok('1 the town is a compact piece on the side towards the main town', p.routes.every(r => r.boxes.filter(b => d2(b, B.c) < 1200).every(b => (b[1] - B.c[1]) / mLng < 200)), 'easternmost ' + Math.round(Math.max(...p.routes.flatMap(r => r.boxes.filter(b => d2(b, B.c) < 1200).map(b => (b[1] - B.c[1]) / mLng)))) + ' m from the centre');
  ok('1 the second town starts a new day for everybody', p.routes.every(r => { const dp = dayPlaces(r); return dp[0] === '' && dp.slice(1).every(x => x === 'Bstadt'); }), p.routes.map(r => dayPlaces(r).join('|')).join(' / '));
  ok('1 the day starts are the same for both', new Set(p.routes.map(r => r.days.length)).size === 1, p.routes.map(r => r.days.map(d => d.minutes).join(',')).join(' / ')); }

// 2. main town + two towns, two workers: the nearer (small) town whole, the far one the rest; one town per person
{ const F = MAIN.mb + SMALL.mb + 2000, p = await run(F, 2, [side(C, 'Cstadt'), side(SMALL, 'Kleindorf')], { near:true });
  const sp = p.split || [], by = n => sp.find(x => x.name === n) || {};
  ok('2 nearest town whole, the next one gets the rest', by('Kleindorf').flyers === SMALL.mb && by('Cstadt').flyers === 2000, JSON.stringify(sp));
  ok('2 exactly the flyers of the order', Math.abs(p.mailboxes - F) <= F * 0.03, p.mailboxes + ' of ' + F);
  ok('2 each town goes whole to one worker', !p.team && p.routes.length === 2 && [SMALL, C].every(t => p.routes.filter(r => inTown(r, t) > 0).length === 1), p.routes.map(r => inTown(r, MAIN) + '+' + inTown(r, SMALL) + '+' + inTown(r, C)).join(' / '));
  ok('2 both workers work in the main town', p.routes.every(r => inTown(r, MAIN) > 0)); }

// 3. a town that would only get a handful of flyers is not visited
{ const F = MAIN.mb + 60, p = await run(F, 2, [side(B, 'Bstadt')], { near:true });
  ok('3 no trip for 60 flyers', p.routes.every(r => inTown(r, B) === 0) && Math.abs(p.mailboxes - MAIN.mb) <= MAIN.mb * 0.03, String(p.mailboxes)); }

// 4. towns added by hand: shared out evenly as before, a town goes whole to one worker
{ const F = 4000, p = await run(F, 2, [side(B, 'Bstadt')], {});
  const sp = p.split || [];
  ok('4 by hand: even sharing as before', sp[0] && sp[0].flyers === 2000 && sp[1].flyers === 2000 && !p.near && !p.team, JSON.stringify(sp));
  ok('4 by hand: the town goes to one worker', p.routes.filter(r => inTown(r, B) > 0).length === 1); }

// 5. a town never begins in the last hour of a day, and no day is longer than the hours + 1 h
for(const [F, n, sides] of [[MAIN.mb + 2600, 2, [side(B, 'Bstadt')]], [MAIN.mb + 4500, 3, [side(B, 'Bstadt'), side(C, 'Cstadt')]], [MAIN.mb + SMALL.mb + 3000, 2, [side(C, 'Cstadt'), side(SMALL, 'Kleindorf')]], [1500, 2, [side(B, 'Bstadt')]]]){
  const p = await run(Math.max(F, MAIN.mb + 200), n, sides, { near:true });
  const long = p.routes.flatMap(r => r.days.map(d => d.minutes)).filter(m => m > 7 * 60 + 61);
  const split = p.routes.some(r => { const dp = dayPlaces(r); return dp.some(x => x.includes(' + ') && r.days[dp.indexOf(x)].minutes > 7 * 60 + 61); });
  ok(`5 days of ${n} workers, ${sides.length} town(s): none over 8 h`, !long.length && !split, p.routes.map(r => r.days.map(d => d.minutes + (d.place ? ' ' + d.place : '')).join(', ')).join(' / ')); }
process.exit(fail ? 1 : 0);
