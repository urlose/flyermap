// Car rides between work areas (worker/src/carroute.js) on synthetic roads – no network. Run: node test/carroute.mjs
import assert from 'node:assert/strict';
import { carGraph, rideMatrix, bestOrder, carRides, estimate, roadSpeed } from '../worker/src/carroute.js';
const o = [48.45, 10.22], m2lat = m => m / 111320, m2lng = m => m / (111320 * Math.cos(o[0] * Math.PI / 180));
const at = (n, e) => [o[0] + m2lat(n), o[1] + m2lng(e)];
const way = (pts, tags) => ({ type:'way', tags, geometry:pts.map(([la, lo]) => ({ lat:la, lon:lo })) });
const line = (a, b, k = 50) => Array.from({ length:k + 1 }, (_, i) => [a[0] + (b[0] - a[0]) * i / k, a[1] + (b[1] - a[1]) * i / k]);
// a fast road east (A at 0, B at 6 km, C at 12 km), a slow farm road north to D (3 km)
const json = { elements:[ way(line(at(0, 0), at(0, 12000), 120), { highway:'primary', maxspeed:'100' }), way(line(at(0, 0), at(3000, 0), 30), { highway:'unclassified' }) ] };
const g = carGraph(json);
assert.ok(Math.abs(roadSpeed({ highway:'primary', maxspeed:'100' }) - 80) < 1e-9);
const P = [at(0, 0), at(0, 6000), at(0, 12000), at(3000, 0), at(400, 6000)];
const M = rideMatrix(g, P);
assert.ok(Math.abs(M[0][1].min - 5) <= 1 && Math.abs(M[0][1].km - 6) < 0.2, 'A→B 6 km at 80 km/h ≈ 4,5 min: ' + JSON.stringify(M[0][1]));
assert.ok(M[0][3].min >= 4 && M[0][3].min <= 6, 'A→D 3 km farm road ≈ 5 min: ' + M[0][3].min);
assert.ok(M[0][4].km > 6 && M[0][4].min > M[0][1].min, 'a point beside the road: road + last bit');
assert.ok(M[0][1].geom.length >= 2 && M[0][1].known, 'the road itself is returned');
assert.ok(M[1][2].geom.every(p => Math.abs(p[0] - o[0]) < 1e-3), 'geometry follows the road');
// best order from the studio (A): D, B, C... ride(i,j) with -1 = studio
const areas = [at(0, 12000), at(0, 6000), at(3000, 0)];   // C, B, D
const all = [o, ...areas], R = rideMatrix(g, all), ride = (i, j) => R[i + 1][j + 1].min;
const ord = bestOrder(3, ride);
assert.deepEqual(ord, [2, 1, 0], 'studio → D → B → C beats the given order: ' + ord);
const ord2 = bestOrder(9, (i, j) => Math.abs((i < 0 ? 0 : i + 1) - (j + 1)));
assert.deepEqual(ord2, [0, 1, 2, 3, 4, 5, 6, 7, 8], 'many areas: nearest next + 2-opt');
const e = estimate(o, at(0, 10000));
assert.ok(!e.known && e.km > 13 && e.min > 15, 'estimate is marked');
const off = await carRides(o, 10, [o, at(0, 5000)], { fetchImpl:async () => { throw new Error('offline'); } });
assert.ok(!off[0][1].known, 'offline: estimates, marked');
const on = await carRides(o, 10, [o, at(0, 5000)], { fetchImpl:async () => ({ ok:true, json:async () => json }) });
assert.ok(on[0][1].known && on[0][1].geom.length > 1, 'with roads: known ride');
console.log('all ok');
