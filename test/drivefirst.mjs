// Drive-time planner (plancore driveFirstCore, 19.11.2026) on synthetic maps – no network: the road server is unreachable,
// so the zone is the fallback (40 km/h from the start). Run: node test/drivefirst.mjs
import assert from 'node:assert/strict';
import Planner from '../admin/planner.js';
import { createPlanService } from '../worker/src/plancore.js';
globalThis.fetch = async url => {
  if(/overpass|maps\.mail\.ru/.test(new URL(url).hostname)) return Response.json({ elements:[] });
  throw new Error('No network in synthetic tests');
};
const start = [48.46, 10.21], at = (n, e) => [start[0] + n / 111320, start[1] + e / (111320 * Math.cos(start[0] * Math.PI / 180))];
// a street of `len` m going east from (n, e0) with k houses of `per` mailboxes
function street(n, e0, len, k, per, name){ const a = at(n, e0), b = at(n, e0 + len), pts = [a, b];
  return { pts, edges:[{ a:0, b:1, len, coords:pts, mb:k * per, boxes:Array.from({ length:k }, (_, i) => [...at(n + 8, e0 + len * (i + .5) / k), per]), name }], adj:[[{ e:0, to:1 }], [{ e:0, to:0 }]] }; }
function join(...gs){ const pts = [], edges = [], adj = []; for(const g of gs){ const o = pts.length; pts.push(...g.pts); g.edges.forEach(e => edges.push({ ...e, a:e.a + o, b:e.b + o })); g.adj.forEach(l => adj.push(l.map(x => ({ e:x.e + edges.length - g.edges.length, to:x.to + o })))); }
  // link consecutive streets with an empty road (one walking map)
  for(let k = 1; k < gs.length; k++){ const a = 2 * k - 1, b = 2 * k; const len = Math.round(Math.hypot((pts[a][0] - pts[b][0]) * 111320, (pts[a][1] - pts[b][1]) * 74000)); edges.push({ a, b, len, coords:[pts[a], pts[b]], mb:0, boxes:[] }); adj[a].push({ e:edges.length - 1, to:b }); adj[b].push({ e:edges.length - 1, to:a }); }
  const mb = edges.reduce((s, e) => s + e.mb, 0); return { pts, edges, adj, radius:10000, usable:mb, mailboxes:mb, street_m:edges.reduce((s, e) => s + e.len, 0) }; }
// main town: streets at 0,3 km and – reached on foot over a long road – 5 km east; village: separate map 2,5 km north
const main = join(street(0, 100, 300, 30, 2, 'Nah'), street(0, 5000, 300, 30, 2, 'Fern'));
const village = join(street(2500, 0, 300, 30, 2, 'Dorf'));
Planner.loadForFlyers = async s => structuredClone(Math.abs(s[0] - start[0]) < 1e-3 ? main : village);
const base = { start, flyers:1, n:1, days:3, hours:9, quota:2500, travel:'zones', split:'even', exact:true, must:[], zone:null, side:[], mainName:'Main' };
const villages = [{ name:'Dorf', lat:at(2500, 150)[0], lng:at(2500, 150)[1], cid:'v', households:40, min:3.75 }];
const run = async b => (await createPlanService(null).plan({ ...base, budget:{ strategy:'near-first', mode:'drive', tolerance:0, _villages:villages, ...b } }, () => {}, () => false)).plan;
const by = p => Object.fromEntries(p.split.map(x => [x.name, x.flyers]));

// 1. ring order: the village (≈ 4 min by car) comes before the far street of the main town (≈ 7,5 min)
const all = await run({ hours:20 });
assert.equal(all.mailboxes, 180, 'everything fits: 60 + 60 + 60');
const unit = all.budget.workers[0].walk;   // walking for everything
const twoThirds = await run({ hours:(all.budget.actual_minutes - unit / 3 * .8) / 60 });   // not enough for the far street
const s2 = by(twoThirds);
assert.ok((s2.Main || 0) >= 60 && s2.Dorf === 60, 'near street and village planned: ' + JSON.stringify(s2));
assert.ok(twoThirds.mailboxes < 180, 'the far street of the main town waits: ' + JSON.stringify(s2));
assert.equal(twoThirds.budget.drive.stop, 'hours', 'stopped by the hours');
assert.ok(twoThirds.budget.actual_minutes <= all.budget.actual_minutes - unit / 3 * .8 + .5, 'hours are a maximum (no +5 %)');
assert.ok(twoThirds.budget.drive.full_min >= 4 && twoThirds.budget.drive.next && twoThirds.budget.drive.next.min > twoThirds.budget.drive.full_min, 'last full ring and the next ring reported: ' + JSON.stringify(twoThirds.budget.drive.next));
// 2. three independent limits – the first one reached stops
const f = await run({ hours:20, maxFlyers:90 });
assert.ok(f.mailboxes <= 90 && f.budget.drive.stop === 'flyers', 'flyer maximum: ' + f.mailboxes + ' ' + f.budget.drive.stop);
const d = await run({ hours:20, driveMin:5 });
assert.ok(by(d).Dorf === 60 && d.mailboxes === 120 && d.budget.drive.stop === 'drive', 'drive-time maximum 5 min: far street (7,5 min) out: ' + JSON.stringify(by(d)));
const three = await run({ hours:20, driveMin:15, maxFlyers:10000 });
assert.equal(three.budget.drive.stop, 'drive', 'hours and flyers not reached: every address within 15 min is planned – the drive time stopped it');
assert.equal((await run({ hours:20 })).budget.drive.stop, 'all', 'no drive limit, nothing reached: all addresses planned');
// 3. rides by car between the areas, once in the working time; a short hop from the start is walking
assert.ok(all.budget.travel.moves >= 1 && all.budget.travel.minutes > 0, 'car ride to the village counted');
assert.equal(all.budget.actual_minutes, all.budget.work_minutes + all.budget.travel.minutes, 'every ride once');
assert.ok(all.routes.flatMap(r => r.jumps).filter(j => j.from === 'Start').every(j => j.walk), 'start → first street (100 m) is walked');
// 4. outliers: a long sparse dead end (1,2 km, 2 mailboxes) out by default, in with a bigger threshold
const spur = join(street(0, 100, 300, 30, 2, 'Nah'), street(0, 900, 1200, 1, 2, 'Hof'));
spur.adj[3] = spur.adj[3].filter(x => x.to !== 4); // dead end
Planner.loadForFlyers = async s => structuredClone(Math.abs(s[0] - start[0]) < 1e-3 ? spur : village);
const o1 = await run({ hours:20, _villages:[] }), o2 = await run({ hours:20, _villages:[], outlierM:5000 });
assert.ok(o1.mailboxes === 60 && o2.mailboxes === 62, 'outlier threshold: ' + o1.mailboxes + ' / ' + o2.mailboxes);
console.log('all ok');

// ---- 20.11.2026: three fixes before release ----
// A. the rest of the hours is filled ONLY inside the first ring that is not complete: a small village further out (later
//    ring) is not taken while the current ring still has streets left
{
  const mainA = join(street(0, 100, 300, 30, 2, 'Nah'), street(0, 1200, 300, 60, 2, 'Mittel'));
  const mini = join(street(2600, 0, 60, 1, 2, 'Mini'));
  Planner.loadForFlyers = async s => structuredClone(Math.abs(s[0] - start[0]) < 1e-3 ? mainA : mini);
  const vMini = [{ name:'Mini', lat:at(2600, 30)[0], lng:at(2600, 30)[1], cid:'m', households:1, min:3.9 }];
  const full = await run({ hours:20, _villages:vMini });
  assert.equal(full.mailboxes, 182, 'all: 60 + 120 + 2');
  const nearOnly = (await run({ hours:20, maxFlyers:60, _villages:vMini })).budget.actual_minutes;
  const p = await run({ hours:(nearOnly + 25) / 60, _villages:vMini });   // the near street + 25 min: enough for Mini, not for 'Mittel'
  assert.ok(!p.split.some(x => x.name === 'Mini'), 'no street from a later ring: ' + JSON.stringify(p.split));
  assert.ok(p.budget.drive.filled.next_streets.every(x => x.ring === p.budget.drive.next.min), 'the report lists only streets of the current ring');
  assert.equal(p.budget.drive.stop, 'hours');
}
// B. one minute limit for places added by hand and found automatically
{
  const farV = join(street(5000, 0, 300, 30, 2, 'HandStr'));
  Planner.loadForFlyers = async s => structuredClone(Math.abs(s[0] - start[0]) < 1e-3 ? main : Math.abs(s[0] - at(5000, 0)[0]) < 5e-3 ? farV : village);
  const hand = [{ name:'Hand', lat:at(5000, 150)[0], lng:at(5000, 150)[1], flyers:60, auto:false }];
  const go = async m => (await createPlanService(null).plan({ ...base, side:hand, budget:{ strategy:'near-first', mode:'drive', tolerance:0, _villages:[], hours:20, driveMin:m } }, () => {}, () => false)).plan;
  const in15 = await go(15), in5 = await go(5);
  assert.equal(by(in15).Hand, 60, 'hand-added place at ≈ 7,5 min is planned with 15 min');
  assert.ok(!by(in5).Hand, 'hand-added place at ≈ 7,5 min is outside a 5 min limit: ' + JSON.stringify(by(in5)));
}
// C. the person-hours are a hard ceiling for the final routes (rides between areas and the split included)
{
  Planner.loadForFlyers = async s => structuredClone(Math.abs(s[0] - start[0]) < 1e-3 ? main : village);
  const two = async hrs => (await createPlanService(null).plan({ ...base, n:2, budget:{ strategy:'near-first', mode:'drive', tolerance:0, _villages:villages, hours:hrs, travelMin:25 } }, () => {}, () => false)).plan;
  for(const hrs of [0.6, 1, 1.5, 2, 3, 4]){ const q = await two(hrs); assert.ok(q.budget.actual_minutes <= hrs * 60, hrs + ' h: ' + q.budget.actual_minutes + ' min'); }
}
// D. Net shifts and the days until the deadline set the actual team ceiling.
{
  const svc = createPlanService(null);
  for(const [hours, cap] of [[7.5, 1800], [8, 1920]]){
    const { plan } = await svc.plan({ ...base, n:2, days:2, hours,
      budget:{ strategy:'near-first', mode:'drive', _villages:villages, hours:32 } }, () => {}, () => false);
    assert.equal(plan.budget.drive.team_cap_minutes, cap);
    assert.equal(plan.budget.drive.max_minutes, cap);
    assert.ok(plan.budget.actual_minutes <= cap);
  }
}
console.log('fixes ok');
