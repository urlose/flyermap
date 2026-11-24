// Plans one order on a SAVED snapshot of the real data (no network on replay) and prints metrics that compare two versions
// of the planner on identical data: flyers, hours per person and day, rides, directions of the delivery area, duplicates, time.
//   node test/plan-compare.mjs frankfurt --record [--merge] [--snap file]   needs network (GitHub Actions): records every request;
//       --connectors plans with pedestrian connectors (experiment, off in the app)
//       --merge keeps the requests (and the start) of an existing snapshot, so one snapshot serves several versions of the planner
//   node test/plan-compare.mjs frankfurt [--snap file] [--out result.json]   replays offline
//   node test/plan-compare.mjs leipheim  [--out result.json]      replays test/fixtures/leipheim-drive-2026-11-20.json.gz
// The script only reads public map data (tiles, Overpass roads, census files, a geocoder) – no database, no orders, no workers.
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2), opt = n => { const i = argv.indexOf('--' + n); return i < 0 ? null : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const name = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'frankfurt';
const record = !!opt('record');
const here = p => fileURLToPath(new URL(p, import.meta.url));
const SCEN = {
  // Order of the report: Westerbachstraße 29, 60489 Frankfurt, 2 people, 10 000 flyers, mode "Automatisch" (defaults of a new order: 7 h, 2 days)
  frankfurt:{ snap:'./fixtures/frankfurt-westerbachstrasse-2026-11-24.json.gz', address:'Westerbachstraße 29, 60489 Frankfurt am Main', mainName:'Frankfurt', n:2, days:2, hours:7, flyers:10000,
    budget:{ hours:32, tolerance:.05, strategy:'near-first', mode:'auto', driveMin:15, maxFlyers:null, travelMin:null, car:false, radiusKm:null, outlierM:850, outlierPerKm:3, placeLabel:'Ort in {km} km' } },
  // Leipheim snapshot of 20.11.2026 (test/leipheim-drive-snapshot.mjs): 2 people, 9 h, 3 days, 32 h, 15 min, 10 000 flyers
  leipheim:{ snap:'./fixtures/leipheim-drive-2026-11-20.json.gz', start:[48.460716, 10.212487], mainName:'Leipheim', n:2, days:3, hours:9, flyers:1,
    budget:{ strategy:'near-first', mode:'drive', tolerance:0, hours:32, driveMin:15, maxFlyers:10000 } }
};
const sc = SCEN[name]; if(!sc){ console.error('scenario: ' + Object.keys(SCEN).join(' | ')); process.exit(2); }
const snapFile = typeof opt('snap') === 'string' ? opt('snap') : here(sc.snap);

// ---- fetch: record or replay ----
const keyOf = (url, init) => (init && init.method || 'GET') + ' ' + url + ' ' + createHash('sha1').update(String(init && init.body || '')).digest('hex').slice(0, 16);
const realFetch = globalThis.fetch, log = new Map();
let start = sc.start || null;
if(record){
  if(opt('merge')){ try{ const old = JSON.parse(gunzipSync(readFileSync(snapFile)).toString()); for(const [k, v] of Object.entries(old.requests)) log.set(k, v); start = start || old.start; }catch{ /* no snapshot yet */ } }
  globalThis.fetch = async (url, init) => {
    const k = keyOf(String(url), init);
    try{ const r = await realFetch(url, init), buf = Buffer.from(await r.arrayBuffer());
      log.set(k, { s:r.status, t:r.headers.get('content-type') || '', b:buf.toString('base64') });
      return new Response(buf, { status:r.status, headers:{ 'content-type':r.headers.get('content-type') || '' } });
    }catch(e){ log.set(k, { err:String(e && e.message || e) }); throw e; }
  };
  if(!start){
    const r = await realFetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(sc.address), { headers:{ 'user-agent':'flyermap-plan-compare/1 (public map data test)' } });
    const j = await r.json(); if(!j[0]) throw new Error('address not found'); start = [+j[0].lat, +j[0].lon];
    console.log('start', start, j[0].display_name);
  }
}else{
  const snap = JSON.parse(gunzipSync(readFileSync(snapFile)).toString());
  start = start || snap.start;
  globalThis.fetch = async (url, init) => {
    const x = snap.requests[keyOf(String(url), init)];
    if(!x) throw new Error('not in the snapshot: ' + String(url).slice(0, 90));
    if(x.err) throw new Error(x.err);
    return new Response(Buffer.from(x.b, 'base64'), { status:x.s, headers:{ 'content-type':x.t } });
  };
}

if(opt('connectors')) process.env.FM_CONNECTORS = '1';   // experiment: pedestrian bridges / underpasses / paths as walking connectors (planner.js fetchConnectors)
const root = process.env.PLAN_ROOT ? new URL('file://' + process.env.PLAN_ROOT.replace(/\/?$/, '/')) : new URL('../', import.meta.url);   // PLAN_ROOT: another checkout (e.g. main) planned on the same data
const { createPlanService } = await import(new URL('worker/src/plancore.js', root));
const { boxKey } = await import(new URL('worker/src/flyercap.js', root));
const args = { start, flyers:sc.flyers, n:sc.n, days:sc.days, hours:sc.hours, quota:2500, bike:false, travel:'zones', split:'even', exact:true, mainAll:false, cores:false, mainName:sc.mainName,
  together:false, first:null, near:false, must:[], zone:null, side:[], budget:sc.budget };
const svc = createPlanService(null);
const t0 = Date.now();
const { plan } = await svc.plan(args, () => {}, () => false);
const calc_s = +((Date.now() - t0) / 1000).toFixed(1);

// ---- metrics ----
const R = Math.PI / 180, cosL = Math.cos(start[0] * R);
const xy = p => [(p[1] - start[1]) * cosL * 111320, (p[0] - start[0]) * 111320];   // metres east / north of the start
const bearing = p => { const [x, y] = xy(p); return (Math.atan2(x, y) / R + 360) % 360; };   // 0 = north, 90 = east
const dist = p => Math.hypot(...xy(p));
const SEC = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'], sector = p => Math.floor(((bearing(p) + 22.5) % 360) / 45);
const r1 = v => Math.round(v * 10) / 10, h = m => r1(m / 60);
const pct = (a, q) => a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(q * a.length))] : 0;
function spread(points){   // compactness of a set of points: radius around the centroid (p90), bounding-box diagonal, distance of the centroid from the start
  if(!points.length) return { n:0 };
  const xs = points.map(p => xy(p)), cx = xs.reduce((s, p) => s + p[0], 0) / xs.length, cy = xs.reduce((s, p) => s + p[1], 0) / xs.length;
  const rad = xs.map(p => Math.hypot(p[0] - cx, p[1] - cy)), X = xs.map(p => p[0]), Y = xs.map(p => p[1]);
  return { n:points.length, p90_radius_m:Math.round(pct(rad, .9)), bbox_diag_m:Math.round(Math.hypot(Math.max(...X) - Math.min(...X), Math.max(...Y) - Math.min(...Y))), centroid_km:r1(Math.hypot(cx, cy) / 1000) };
}
function directions(boxes){   // weighted share of the mailboxes per compass sector + the most one-sided measure (mean resultant length: 0 = all round, 1 = one direction)
  const w = Array(8).fill(0); let tot = 0, sx = 0, sy = 0;
  for(const b of boxes){ const wt = b[2] || 1, p = [b[0], b[1]]; if(dist(p) < 1) continue; w[sector(p)] += wt; tot += wt; sx += wt * Math.sin(bearing(p) * R); sy += wt * Math.cos(bearing(p) * R); }
  const share = Object.fromEntries(SEC.map((s, i) => [s, tot ? Math.round(1000 * w[i] / tot) / 10 : 0]));
  return { share, sectors_over_5pct:w.filter(x => tot && x / tot > .05).length, max_sector_pct:tot ? Math.round(1000 * Math.max(...w) / tot) / 10 : 0, resultant:tot ? +(Math.hypot(sx, sy) / tot).toFixed(2) : 0,
    mean_bearing:tot ? Math.round((Math.atan2(sx, sy) / R + 360) % 360) : null };
}
const allBoxes = plan.routes.flatMap(r => r.boxes || []);
const seen = new Map(); for(const b of allBoxes) seen.set(boxKey(b), (seen.get(boxKey(b)) || 0) + 1);
const rides = (plan.budget.travel.jumps || []).filter(j => !j.walk);
const tripsOf = r => (r.jumps || []).filter(j => !j.walk && j.from !== 'Start').length;
const out = {
  scenario:name, start, args:{ n:sc.n, days:sc.days, hours:sc.hours, budget:{ ...sc.budget } }, calc_s,
  flyers:Math.round(plan.mailboxes), total_h:h(plan.budget.actual_minutes), max_h:h(plan.budget.drive?.max_minutes ?? plan.budget.max_minutes), stop:plan.budget.drive?.stop ?? plan.budget.limit, mode:plan.budget.mode,
  rides:{ count:rides.length, minutes:Math.round(plan.budget.travel.minutes || 0), km:r1(rides.reduce((s, j) => s + (j.km || 0), 0)) },
  duplicate_addresses:[...seen.values()].filter(c => c > 1).length, addresses:seen.size,
  distance_from_start_m:{ p50:Math.round(pct(allBoxes.map(dist), .5)), p90:Math.round(pct(allBoxes.map(dist), .9)), max:Math.round(Math.max(0, ...allBoxes.map(dist))) },
  area:directions(allBoxes),
  workers:plan.routes.map(r => ({ w:r.w + 1, total_h:h(r.minutes), walk_h:h(r.work_minutes), ride_h:h(r.ride_minutes), flyers:Math.round(r.mailboxes), trips:tripsOf(r), directions:directions(r.boxes || []), spread:spread((r.boxes || []).map(b => [b[0], b[1]])),
    days:(r.days || []).map((d, i) => ({ day:i + 1, h:h(d.minutes), flyers:Math.round(d.mailboxes), places:[...new Set((r.parts || []).filter(p => p.i0 <= d.i1 && p.i1 >= d.i0).map(p => p.place))],
      ...spread((r.path || []).slice(d.i0, d.i1 + 1).map(p => [p[0], p[1]])) })) })),
  per_worker_minutes:plan.per_worker
};
{ // how much the two people's areas overlap: share of one person's mailboxes that lie in the other's 200 m cells
  const cell = p => { const [x, y] = xy(p); return Math.floor(x / 200) + ',' + Math.floor(y / 200); };
  const sets = plan.routes.map(r => new Set((r.boxes || []).map(b => cell([b[0], b[1]]))));
  if(sets.length === 2){ const both = [...sets[0]].filter(c => sets[1].has(c)).length; out.cells_shared_by_both_pct = r1(100 * both / Math.max(1, Math.min(sets[0].size, sets[1].size))); }
}
const arg = typeof opt('out') === 'string' ? opt('out') : null;
if(arg){   // everything needed to draw the map: routes (r5), mailboxes, the car zone
  const r5 = p => [+(+p[0]).toFixed(5), +(+p[1]).toFixed(5)];
  writeFileSync(arg, JSON.stringify({ ...out, map:{ routes:plan.routes.map(r => ({ w:r.w + 1, path:r.path.map(r5), boxes:(r.boxes || []).map(b => [...r5(b), b[2] || 1]), days:r.days.map(d => [d.i0, d.i1]) })), zone:plan.budget.driveZone || null } }));
}
console.log(JSON.stringify(out, null, 1));
if(record){
  if(!plan.budget.drive?.real_roads && !plan.mailboxes){ console.log('nothing planned – snapshot not written'); process.exit(3); }
  writeFileSync(snapFile, gzipSync(JSON.stringify({ taken:new Date().toISOString(), scenario:name, start, requests:Object.fromEntries(log) })));
  console.log('snapshot written: ' + log.size + ' requests → ' + snapFile);
}
