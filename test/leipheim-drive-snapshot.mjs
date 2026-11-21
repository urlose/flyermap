// Leipheim on a saved snapshot of the real data (map tiles, census, OSM car roads, place names) – reproducible without
// Overpass. Two modes:
//   node test/leipheim-drive-snapshot.mjs record [file]   – needs network; records every request of the run (GitHub Actions)
//   node test/leipheim-drive-snapshot.mjs [file]          – replays the snapshot offline and checks Cem's rules
// Scenario: start of the Leipheim order (17.11.2026), 2 persons, 9 h/day, 3 days, max. 15 min / 32 h / 10.000 flyers.
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const mode = process.argv[2] === 'record' ? 'record' : 'replay';
const file = (mode === 'record' ? process.argv[3] : process.argv[2]) || new URL('./fixtures/leipheim-drive-2026-11-20.json.gz', import.meta.url).pathname;
const keyOf = (url, init) => (init && init.method || 'GET') + ' ' + url + ' ' + createHash('sha1').update(String(init && init.body || '')).digest('hex').slice(0, 16);
const realFetch = globalThis.fetch, log = new Map();
let namingRequests = 0;
if(mode === 'record'){
  globalThis.fetch = async (url, init) => {
    const k = keyOf(String(url), init);
    try{ const r = await realFetch(url, init), buf = Buffer.from(await r.arrayBuffer());
      log.set(k, { s:r.status, t:r.headers.get('content-type') || '', b:buf.toString('base64') });
      return new Response(buf, { status:r.status, headers:{ 'content-type':r.headers.get('content-type') || '' } });
    }catch(e){ log.set(k, { err:String(e && e.message || e) }); throw e; }
  };
}else{
  const snap = JSON.parse(gunzipSync(readFileSync(file)).toString());
  globalThis.fetch = async (url, init) => {
    if(String(url).includes('photon.komoot.io') || decodeURIComponent(String(init?.body || '')).includes('node["place"')){
      namingRequests++;
    }
    const x = snap.requests[keyOf(String(url), init)];
    if(!x) throw new Error('not in the snapshot: ' + String(url).slice(0, 80));
    if(x.err) throw new Error(x.err);
    return new Response(Buffer.from(x.b, 'base64'), { status:x.s, headers:{ 'content-type':x.t } });
  };
}
const { createPlanService } = await import('../worker/src/plancore.js');
const start = [48.460716, 10.212487], h = m => Math.round(m / 6) / 10;
const service = createPlanService(null);
const args = { start, flyers:1, n:2, days:3, hours:9, quota:2500, travel:'zones', split:'even', exact:true, must:[], zone:null, side:[], mainName:'Leipheim',
  budget:{ strategy:'near-first', mode:'drive', tolerance:0, hours:32, driveMin:15, maxFlyers:10000 } };
const calculate = budget => service.plan({ ...args, budget }, () => {}, () => false);
const { plan } = await calculate(args.budget);
const b = plan.budget, v = b.drive;
const out = { stop:v.stop, full_min:v.full_min, next:v.next, rings:v.rings.map(r => [r.min, r.planned, r.mb]), flyers:plan.mailboxes,
  walk_h:h(b.work_minutes), ride_h:h(b.travel.minutes), total_min:b.actual_minutes, max_min:v.max_minutes, left_min:v.left_minutes,
  real_roads:v.real_roads, rides_known:b.travel.known, villages:v.villages.map(x => x.name + ' ' + x.min + ' Min.'), filled:v.filled,
  workers:plan.routes.map(r => ({ w:r.w + 1, walk_h:h(r.work_minutes), ride_h:h(r.ride_minutes), total_h:h(r.minutes), order:r.parts.map(p => p.place + ' ' + p.part).join(' → ') })),
  rides:b.travel.jumps.filter(j => !j.walk).map(j => j.from + ' → ' + j.to + ': ' + j.km + ' km, ' + j.min + ' Min.') };
console.log(JSON.stringify(out, null, 1));
if(mode === 'record'){
  if(!v.real_roads || !b.travel.known){ console.log('roads not reached – snapshot not written'); process.exit(3); }
  writeFileSync(file, gzipSync(JSON.stringify({ taken:new Date().toISOString(), start, requests:Object.fromEntries(log) })));
  console.log('snapshot written: ' + log.size + ' requests');
}else{
  assert.equal(namingRequests, 0, 'the route plan does not wait for place names');
  assert.deepEqual([plan.mailboxes, b.actual_minutes, v.max_minutes], [5285, 1917, 1920]);
  // Cem's rules on the real data
  assert.ok(v.real_roads && b.travel.known, 'real roads in the snapshot');
  const rings = v.rings; let open = false;
  for(const r of rings){ if(open) assert.equal(r.planned, 0, 'nothing from a ring after the first incomplete one: ' + r.min); if(r.planned < r.mb) open = true; }
  assert.ok(rings.filter(r => r.min <= v.full_min).every(r => r.planned === r.mb), 'all rings up to ' + v.full_min + ' min complete');
  assert.ok(b.actual_minutes <= v.max_minutes, 'hours are a hard ceiling: ' + b.actual_minutes + ' ≤ ' + v.max_minutes);
  assert.ok(plan.mailboxes <= 10000 && v.stop === 'hours', 'stopped by the hours');
  assert.equal(b.actual_minutes, b.work_minutes + b.travel.minutes, 'every ride once');
  const cheapest = v.filled.next_cheapest;
  console.log(cheapest ? `next street of minute ${cheapest.ring}: ${cheapest.mb} mailboxes in ${cheapest.area}${cheapest.new_area ? ' (new area, incl. the ride)' : ''} would add ${cheapest.add_min} min – left ${v.left_minutes} min → ${cheapest.add_min <= v.left_minutes ? 'FITS' : 'does not fit'}` : 'no street left in the current ring');
  if(v.topup) console.log(`checked with the real routes: with that street ${v.topup.real_minutes} min for ${v.topup.real_flyers} flyers > ${v.max_minutes} → does not fit`);
  if(cheapest && cheapest.add_min <= v.left_minutes) assert.ok(v.topup && v.topup.real_minutes > v.max_minutes, 'a street of the current ring that fits by estimate must have been checked with the real routes');
  if(process.env.FLYERMAP_CHECK_REPLAN){
    const saved = structuredClone(b.driveZone); // same shape as a grid sent from the admin to the worker
    assert.equal(saved._g, undefined);
    const { plan:replanned } = await calculate({ ...args.budget, _grid:saved });
    assert.ok(replanned.budget.travel.known);
    assert.deepEqual([replanned.mailboxes, replanned.budget.actual_minutes], [5285, 1917]);
    assert.deepEqual(replanned.budget.travel.jumps.map(j => [j.min, j.km]), b.travel.jumps.map(j => [j.min, j.km]));
    console.log('saved grid: reapplied with the same real-road rides');
  }
  console.log('all ok');
}
