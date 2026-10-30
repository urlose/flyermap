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
process.exit(fail ? 1 : 0);
