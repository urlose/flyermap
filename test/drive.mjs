// GPS track → walking and driving. A single fast hop (GPS jump between houses) must stay walking; only a real ride
// (fast steps in a row, ≥ 200 m of way, ending ≥ 150 m away) is driving. Run: node test/drive.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const P = require(process.env.PLANNER || '../admin/planner.js');
const LAT0 = 48.46, LNG0 = 10.21, mLat = 1 / 111320, mLng = 1 / (111320 * Math.cos(LAT0 * Math.PI / 180));
let fail = 0; const ok = (name, cond, info = '') => { console.log((cond ? 'ok  ' : 'FAIL') + ' ' + name + (info ? ' (' + info + ')' : '')); if(!cond) fail++; };
// track from steps [dx m, dy m, seconds]
const track = steps => { let x = 0, y = 0, t = 0; const out = [[LAT0, LNG0, 0]]; for(const [dx, dy, s] of steps){ x += dx; y += dy; t += s * 1000; out.push([LAT0 + y * mLat, LNG0 + x * mLng, t]); } return out; };
const walk = n => Array.from({ length:n }, () => [10, 0, 8]);   // 4.5 km/h
{ const r = P.walkRuns(track([...walk(10), [70, 20, 5], ...walk(10)]));
  ok('one hop of 70 m in 5 s is walking', r.drive.length === 0 && r.walk.length === 1 && r.driveM === 0, r.drive.length + ' drive runs'); }
{ const r = P.walkRuns(track([...walk(10), [80, 0, 5], [-75, 5, 5], ...walk(10)]));
  ok('a jump out and back is walking', r.drive.length === 0 && r.walk.length === 1); }
{ const r = P.walkRuns(track([...walk(5), [60, 0, 6], [50, 10, 6], ...walk(5)]));
  ok('110 m at 30 km/h (two hops) is walking', r.drive.length === 0); }
{ const r = P.walkRuns(track([...walk(10), ...Array.from({ length:12 }, () => [100, 0, 9]), ...walk(10)]));
  ok('1.2 km at 40 km/h is a ride', r.drive.length === 1 && Math.abs(r.driveM - 1200) < 5 && r.walk.length === 2, Math.round(r.driveM) + ' m'); }
{ const r = P.walkRuns(track([...walk(10), ...Array.from({ length:5 }, () => [60, 0, 12]), ...walk(10)]));
  ok('300 m by bike (18 km/h) is a ride', r.drive.length === 1 && Math.abs(r.driveM - 300) < 5); }
{ const pts = track([...walk(3), [70, 0, 5], ...walk(3)]).map(p => ({ lat:p[0], lng:p[1], t:new Date(1.7e12 + p[2]).toISOString() }));
  ok('points from the database ({lat,lng,t})', P.walkRuns(pts).drive.length === 0 && P.walkRuns(pts).walk[0].length === pts.length); }
process.exit(fail ? 1 : 0);
