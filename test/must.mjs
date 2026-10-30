// Mandatory areas: every street with mailboxes inside a drawn area is in the plan, even when it is far from the start.
// Run: node test/must.mjs
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { gunzipSync } from 'zlib';
const require = createRequire(import.meta.url);
const P = require('../admin/planner.js');
const S = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/weidenberg-8000.json.gz', import.meta.url))));
const graph = () => { const adj = S.pts.map(() => []), edges = S.edges.map(e => ({ ...e, boxes:e.boxes || [] })); edges.forEach((e, i) => { adj[e.a].push({ e:i, to:e.b }); if(e.a !== e.b) adj[e.b].push({ e:i, to:e.a }); }); return { pts:S.pts, edges, adj }; };
let fail = 0; const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if(!ok) fail++; };
const g = graph(), flyers = 3000;
const base = P.selectForFlyers(g, S.start, flyers), inBase = new Set(base.ids);
// a mandatory square around a street piece with mailboxes that the normal plan does NOT take, far from the start
const far = g.edges.map((e, i) => [e, i]).filter(([e, i]) => e.mb >= 5 && !inBase.has(i)).sort((a, b) => P.dist(S.start, b[0].coords[0]) - P.dist(S.start, a[0].coords[0]))[20];
const c = far[0].coords[Math.floor(far[0].coords.length / 2)], d = 0.002;
const poly = [[c[0] - d, c[1] - d], [c[0] - d, c[1] + d], [c[0] + d, c[1] + d], [c[0] + d, c[1] - d]];
const must = P.mustEdges(g, [poly]);
check(must.length > 0, `${must.length} street pieces in the drawn area (${Math.round(P.dist(S.start, c))} m from the start)`);
const plan = P.planFlyers(g, S.start, flyers, 2, { days:2, hoursPerDay:7, must:[poly] });
const used = new Set(plan.routes.flatMap(r => r.part));
check(must.every(i => used.has(i)), 'every street piece of the area is in a route');
check(plan.mailboxes >= flyers * 0.97 && plan.mailboxes <= flyers * 1.2, `mailboxes ${plan.mailboxes} for ${flyers} flyers (area ${plan.must_mb})`);
const noMust = P.planFlyers(g, S.start, flyers, 2, { days:2, hoursPerDay:7 });
check(noMust.mailboxes >= flyers * 0.97, 'without an area the plan is unchanged in size');
check(P.mustRadius(S.start, [poly]) > P.dist(S.start, c), 'loaded square covers the area');
// a priority area with a flyer count: about that many there, nearest part first, the rest as usual
const D2 = 0.008, big = [[c[0] - D2, c[1] - D2], [c[0] - D2, c[1] + D2], [c[0] + D2, c[1] + D2], [c[0] + D2, c[1] - D2]];
const all = P.mustPick(g, S.start, [big]).info[0], want = Math.round(all.avail * 0.3);
const part = P.planFlyers(g, S.start, flyers, 2, { days:2, hoursPerDay:7, must:[{ p:big, n:want }] });
check(all.avail > want && part.must_info[0].used >= want && part.must_info[0].used < want * 1.4, `area with ${all.avail} mailboxes, ${want} wanted → ${part.must_info[0].used} in the plan`);
check(part.mailboxes >= flyers * 0.97 && part.mailboxes <= flyers * 1.2, `total ${part.mailboxes} for ${flyers} flyers`);
check(P.mustPick(g, S.start, [{ p:big, n:0 }]).info[0].used === all.avail && P.mustPick(g, S.start, [big]).info[0].used === all.avail, 'n = 0 and old areas (plain polygon) mean the whole area');
// own distribution area: flyers only inside it
const z0 = S.start, Z = 0.012, zone = [[z0[0] - Z, z0[1] - Z * 1.5], [z0[0] - Z, z0[1] + Z * 1.5], [z0[0] + Z, z0[1] + Z * 1.5], [z0[0] + Z, z0[1] - Z * 1.5]];
const zp = P.planFlyers(g, S.start, 1500, 2, { days:2, hoursPerDay:7, zone });
const boxes = zp.routes.flatMap(r => r.boxes);
check(boxes.length > 0 && boxes.every(b => P.inPoly([b[0], b[1]], zone)), `own area: all ${boxes.length} houses of the plan lie inside it`);
check(zp.mailboxes >= 1500 * 0.97 && zp.mailboxes <= Math.min(zp.zone_mb, 1500 * 1.25), `own area: ${zp.mailboxes} mailboxes for 1500 flyers (area has ${zp.zone_mb})`);
const zs = P.planFlyers(g, S.start, 1e6 > zp.zone_mb * 3 ? zp.zone_mb * 3 : 1e6, 2, { days:2, hoursPerDay:7, zone });
check(zs.mailboxes <= zp.zone_mb, `own area too small for the flyers: plan stays inside (${zs.mailboxes} ≤ ${zp.zone_mb})`);
process.exit(fail ? 1 : 0);
