// Drive-time zone (worker/src/drivezone.js) on synthetic roads – no network.
// Run: node test/drivezone.mjs
import { driveTimes, buildGrid, minutesTo, insideZone, zoneLoadM, gridRects, fallbackGrid, driveZone, gridForSave, zoneFromPlans, zoneRides } from '../worker/src/drivezone.js';
import { carGraph, roadSpeed } from '../worker/src/carroute.js';
import { distanceM } from '../worker/src/circlearea.js';

let fail = 0; const ok = (name, cond, info = '') => { console.log((cond ? 'ok   ' : 'FAIL ') + name + (cond ? '' : '  ' + info)); if(!cond) fail++; };
const start = [48.45, 10.22], m2lng = m => m / (111320 * Math.cos(start[0] * Math.PI / 180)), m2lat = m => m / 111320;
const way = (pts, tags) => ({ type:'way', tags, geometry:pts.map(([la, lo]) => ({ lat:la, lon:lo })) });
const line = (from, dLat, dLng, n) => Array.from({ length:n + 1 }, (_, i) => [from[0] + dLat * i / n, from[1] + dLng * i / n]);

// a 30 km federal road east (100 km/h sign), a 30 km farm road north (unclassified, no sign), a one-way road west
const east = line(start, 0, m2lng(30000), 300), north = line(start, m2lat(30000), 0, 300), west = line(start, 0, -m2lng(20000), 200);
const json = { elements:[ way(east, { highway:'primary', maxspeed:'100' }), way(north, { highway:'unclassified' }), way(west, { highway:'secondary', oneway:'-1' }) ] };
const g = carGraph(json), t = driveTimes(g, start, 15), grid = buildGrid(g, t, start, 15);

ok('road speed: sign wins, 80 % of it', Math.abs(roadSpeed({ highway:'primary', maxspeed:'100' }) - 80) < 1e-9);
ok('road speed: urban sign = 50 km/h', Math.abs(roadSpeed({ highway:'secondary', maxspeed:'DE:urban' }) - 40) < 1e-9);
ok('road speed: class default without sign', Math.abs(roadSpeed({ highway:'unclassified' }) - 36) < 1e-9);
const at = (dLat, dLng) => [start[0] + m2lat(dLat), start[1] + m2lng(dLng)];
const e10 = minutesTo(grid, at(0, 10000)), n10 = minutesTo(grid, at(10000, 0));
ok('10 km east on the fast road ≈ 7,5 min', e10 != null && Math.abs(e10 - 7.5) < 0.6, e10);
ok('10 km north on the farm road ≈ 16,7 min → outside 15 min', n10 == null, n10);
const n8 = minutesTo(grid, at(8000, 0));
ok('8 km north ≈ 13,3 min → inside', n8 != null && Math.abs(n8 - 13.3) < 0.6, n8);
const e19 = minutesTo(grid, at(0, 19000)), e21 = minutesTo(grid, at(0, 21000));
ok('19 km east inside (≈ 14,3 min), 21 km east outside', e19 != null && e21 == null, e19 + ' / ' + e21);
ok('one-way road towards the start: west not reachable by car', minutesTo(grid, at(0, -3000)) == null || minutesTo(grid, at(0, -3000)) > 4);
ok('fields beside the road (600 m) are reached at 20 km/h', (() => { const v = minutesTo(grid, at(600, 5000)); return v != null && v > minutesTo(grid, at(0, 5000)) + 1.2; })());
ok('far from every road (2 km beside) not reached', minutesTo(grid, at(2000, 5000)) == null);
ok('start cell always inside', minutesTo(grid, start) != null);
ok('no km limit: 19 km east on the fast road is delivered', insideZone(grid, start, at(0, 19000)) && !insideZone(grid, start, at(0, 21000)));
ok('street map loaded as far as the zone reaches', zoneLoadM(grid, start) > 19000 && zoneLoadM(grid, start) < 22000, zoneLoadM(grid, start));
const small = buildGrid(g, driveTimes(g, start, 5), start, 5);
ok('5 min zone loads only its own reach', zoneLoadM(small, start) < 10000 && zoneLoadM(small, start) > 4000, zoneLoadM(small, start));
ok('map rectangles: one per run', gridRects(grid).length * 3 === grid.runs.length);
const saved = JSON.parse(JSON.stringify(gridForSave(grid)));
ok('saved zone keeps the answers', minutesTo(saved, at(0, 10000)) === e10 && JSON.stringify(saved).length < 60000, JSON.stringify(saved).length);
ok('zone found again in the plans of an order', !!zoneFromPlans([{ days:[{ i0:0, delivery_zone:saved }] }]));
const fb = fallbackGrid(start, 15);
ok('fallback: circle of 9 km, marked as not real', !fb.real && insideZone(fb, start, at(8800, 0)) && !inGridish(fb, at(9400, 0)));
function inGridish(gr, p){ return minutesTo(gr, p) != null; }

// loading through a fake map server; a broken server gives the circle
let calls = 0;
const z = await driveZone(start, 15, { fetchImpl:async () => { calls++; return { ok:true, json:async () => json }; } });
ok('driveZone: real zone from the map server', z.real && minutesTo(z, at(0, 10000)) != null);
const after = calls;
await driveZone(start, 15, { fetchImpl:async () => { calls++; throw new Error('x'); } });
ok('driveZone: cached per start and minutes (no new request)', calls === after, calls + ' / ' + after);
const z2 = await driveZone([48.5, 10.3], 15, { fetchImpl:async () => { throw new Error('offline'); } });
ok('driveZone: offline → circle, not real', z2.real === false && z2.km === 9);
// speed: realistic size
const big = { elements:[] };
for(let i = 0; i < 400; i++){ const a = i * Math.PI / 200; big.elements.push(way(line(start, Math.sin(a) * m2lat(20000), Math.cos(a) * m2lng(20000), 80), { highway:i % 3 ? 'tertiary' : 'secondary' })); }
const t0 = Date.now(), gb = carGraph(big), gridB = buildGrid(gb, driveTimes(gb, start, 15), start, 15);
ok('32.000 road points in under 2 s', Date.now() - t0 < 2000 && gridB.runs.length > 0, (Date.now() - t0) + ' ms');
console.log(fail ? fail + ' FAILED' : 'all ok'); process.exit(fail ? 1 : 0);
