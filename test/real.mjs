// Real map data (OpenStreetMap, © OpenStreetMap contributors, ODbL) around Industriestraße 4, Weidenberg: the case from
// the screenshots. Checks that the work area stays around the start and that villages next to the route are done.
// Run: node test/real.mjs
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { gunzipSync } from 'zlib';
const require = createRequire(import.meta.url);
const P = require(process.env.PLANNER || '../admin/planner.js');
const S = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/weidenberg-8000.json.gz', import.meta.url))));
const graph = () => { const adj = S.pts.map(() => []), edges = S.edges.map(e => ({ ...e, boxes:e.boxes || [] })); edges.forEach((e, i) => { adj[e.a].push({ e:i, to:e.b }); if(e.a !== e.b) adj[e.b].push({ e:i, to:e.a }); }); return { pts:S.pts, edges, adj }; };
let fail = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if(!ok) fail++; };
const g = graph(), sel = P.selectForFlyers(g, S.start, 8000), set = new Set(sel.ids);
const share = nm => { const es = g.edges.map((e, i) => [e, i]).filter(([e]) => e.name === nm && e.mb > 0); return es.filter(([, i]) => set.has(i)).length / es.length; };
check(sel.mailboxes >= 8000 && sel.mailboxes <= 8000 * 1.02, `mailboxes ${sel.mailboxes} for 8000 flyers`);
check(sel.reach_m < 3300, `work area reaches ${sel.reach_m} m from the start (no trip to far villages)`);
check(share('Am Anger') === 1, `Am Anger (next to the walked Görschnitz road) done: ${Math.round(share('Am Anger') * 100)} %`);
check(share('Mengersreuth') >= 0.9, `Mengersreuth (1.7 km, near the start) done: ${Math.round(share('Mengersreuth') * 100)} %`);
check(share('Am Sand') === 0 && share('Hammergasse') === 0, 'the far village (Am Sand / Hammergasse, ~4 km) is not used');
const plan = P.planFlyers(graph(), S.start, 8000, 2, { days:2, hoursPerDay:12 });
check(plan.routes.every(r => r.covered !== false), 'every route covers all of its streets');
check(Math.max(...plan.routes.map(r => r.minutes)) < 1050, `slowest of 2 workers: ${Math.max(...plan.routes.map(r => r.minutes))} min`);
process.exit(fail ? 1 : 0);
