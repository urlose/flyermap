// Own car-road squares (20.11.2026): tools/tiles/build.py writes car1/ squares, the planner reads them instead of the public
// road server. Builds the synthetic OSM test data (tools/tiles/test/gen.py) – needs python3 with osmium + shapely.
// Run: node test/cartiles.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { decodeCarTile, carTileWays, carGraph, setCarTileStamp, CAR_TILES } from '../worker/src/carroute.js';
import { driveZone, minutesTo } from '../worker/src/drivezone.js';
const root = new URL('..', import.meta.url).pathname, dir = mkdtempSync(join(tmpdir(), 'car-'));
execFileSync('python3', [root + 'tools/tiles/test/gen.py', '--car-seam'], { cwd:dir, stdio:'ignore' });
execFileSync('python3', [root + 'tools/tiles/build.py', '--pbf', 'data.osm', '--bbox', '52.05,8.325,52.35,9', '--out', 'tiles', '--nosplit'], { cwd:dir, stdio:'ignore' });
const files = readdirSync(join(dir, 'tiles', 'car1'));
assert.ok(files.length >= 1, 'car squares written');
// every car road of the OSM data is in the squares, with class, speed and one-way
const osm = JSON.parse(readFileSync(join(dir, 'data.json')));
const CLS = /^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified)$/;
const want = osm.ways.filter(w => CLS.test(w[2].highway || '') && !/^(private|no)$/.test(w[2].access || '') && w[2].area !== 'yes');
const got = files.flatMap(f => decodeCarTile(JSON.parse(gunzipSync(readFileSync(join(dir, 'tiles', 'car1', f))))));
assert.ok(want.length > 0 && new Set(got.map(w => w.geometry[0].lat.toFixed(6) + ',' + w.geometry[0].lon.toFixed(6))).size === want.length, 'car roads kept: ' + got.length + ' / ' + want.length);
assert.ok(got.every(w => CLS.test(w.tags.highway) && w.geometry.length >= 2), 'only car roads, with geometry');
assert.ok(!got.some(w => /^(residential|footway|track|service|living_street)$/.test(w.tags.highway)), 'no residential / footways in the car squares');
// the app reads them (fetch from storage) – no public server needed
const serve = (missing = []) => async url => { const u = String(url);
  if(u.startsWith(CAR_TILES)){ const f = u.slice(CAR_TILES.length).split('?')[0]; if(missing.includes(f) || !files.includes(f)) return new Response('', { status:404 }); return new Response(readFileSync(join(dir, 'tiles', 'car1', f))); }
  throw new Error('public server asked: ' + u.slice(0, 60)); };
const ways = await carTileWays(52.051, 8.326, 52.349, 8.999, serve());
assert.equal(ways?.elements.length, want.length, 'all roads read once across tile boundaries');
const g = carGraph(ways); assert.ok(g.pts.length > 10, 'road graph from the squares');
const start = [52.2, 8.7], z = await driveZone(start, 5, { fetchImpl:serve() });
assert.ok(z.real && z.source === 'tiles' && minutesTo(z, start) === 0, 'drive zone from own squares, no public server: ' + z.source + ' ' + z.error);
// a missing square (not built, abroad): the public server is asked
let asked = 0; const fb = await driveZone([52.2002, 8.7002], 5, { fetchImpl:async (u, i) => { if(!String(u).startsWith(CAR_TILES)){ asked++; return { ok:true, json:async () => ways }; } return serve(files)(u, i); } });
assert.ok(asked >= 1 && fb.source === 'overpass', 'missing square → public server');
const dataDir = join(dir, 'tiles', 'car1');
const loadTile = f => decodeCarTile(JSON.parse(gunzipSync(readFileSync(join(dataDir, f)))));
const longRoad = w => w.tags.highway === 'secondary' && w.geometry[0].lat === 52.2 && w.geometry[0].lon === 8.4;
for(const col of [37, 38, 39]){
  assert.ok(loadTile('348_' + col + '.json.gz').some(longRoad), 'crossing segment in tile ' + col);
}
assert.equal(ways.elements.filter(longRoad).length, 1);
const from = g.pts.findIndex(p => p[0] === 52.2 && p[1] === 8.4);
const to = g.pts.findIndex(p => p[0] === 52.2 && p[1] === 8.9);
assert.ok(from >= 0 && to >= 0 && g.adj[from][0] === to, 'one-way road graph stitched across tiles');
assert.equal(g.adj[to].length, 0, 'one-way direction preserved');
const invalid = await carTileWays(52.19, 8.66, 52.24, 8.76, async () =>
  new Response(JSON.stringify({v:'cr1', w:[[999, 50, 0, 52200000, 8700000, 5, 0]]})));
assert.equal(invalid, null, 'corrupt rows trigger fallback');
setCarTileStamp('sample stamp');
let stamped;
await carTileWays(52.19, 8.66, 52.19, 8.66, url => {
  stamped = String(url);
  return serve()(url);
});
assert.ok(stamped?.endsWith('?b=sample%20stamp'), 'tiles are versioned by the build stamp');
setCarTileStamp('');
const stalled = await carTileWays(52.19, 8.66, 52.24, 8.76, () => new Promise(() => {}), 10);
assert.equal(stalled, null, 'stalled tiles trigger fallback');
let emptyFallback = 0;
const empty = await driveZone([52.2003, 8.7003], 5, { fetchImpl:async url => {
  if(String(url).startsWith(CAR_TILES)) return new Response(JSON.stringify({v:'cr1', w:[]}));
  emptyFallback++;
  return Response.json(ways);
} });
assert.equal(empty.source, 'overpass');
assert.equal(emptyFallback, 1);
const farRoad = {
  v:'cr1', w:[[6, 50, 0, 52300000, 8700000, ...Array.from({length:12}, () => [100, 100]).flat()]],
};
const distant = await driveZone([52.2004, 8.7004], 5, { fetchImpl:async url =>
  String(url).startsWith(CAR_TILES) ? Response.json(farRoad) : Response.json(ways) });
assert.equal(distant.source, 'overpass', 'tiles with no roads at the start trigger fallback');
const unavailable = await driveZone([52.2005, 8.7005], 5, { fetchImpl:async url =>
  String(url).startsWith(CAR_TILES) ? new Response('', {status:404}) : Response.json({elements:[]}) });
assert.equal(unavailable.real, false, 'unusable tiles and Overpass lead to the estimated zone');
console.log('all ok');
