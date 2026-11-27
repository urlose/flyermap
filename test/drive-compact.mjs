// Drive-time layout on the Leipheim snapshot: no address twice, workers' areas hardly overlap, hours kept, enough flyers.
// Two settings: 2 persons × 3 days × 9 h (snapshot test) and 2 × 2 × 8 h (the live order).
// Since 27.11.2026 a route is not cut into days any more (one line per person, the worker decides when to stop): every person's
// hours – walking AND rides – must fit into the whole period (days × hours per day), and the team into the order's hours.
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
for(const env of [{ DAYS:'3', HPD:'9', QUOTA:'2500' }, { DAYS:'2', HPD:'8', QUOTA:'3000' }]){
  const out = execFileSync(process.execPath, [new URL('./drive-layout-report.mjs', import.meta.url).pathname, '--json'], { env:{ ...process.env, ...env }, stdio:['ignore', 'pipe', 'ignore'] }).toString();
  const s = JSON.parse(out.trim().split('\n').pop()), period = +env.HPD * +env.DAYS * 60, team = 32 * 60;
  console.log(env.DAYS + '×' + env.HPD + ' h:', s.flyers, 'Flyer ·', s.total_h, 'h · overlap', s.overlap_pct, '% · rides', s.rides, '·', s.workers.map(w => w.minutes + '/' + period + ' min (Auto ' + w.ride_minutes + ') ' + w.spread_m + ' m').join(' | '));
  assert.equal(s.dup_boxes, 0, 'an address in two routes');
  assert.ok(s.overlap_pct <= 5, 'the workers\' areas overlap: ' + s.overlap_pct + ' %');
  assert.ok(s.total_minutes <= team, 'team hours with rides: ' + s.total_minutes + ' > ' + team + ' min');
  assert.equal(s.total_minutes, s.workers.reduce((a, w) => a + w.minutes, 0), 'team hours = sum of the persons');
  for(const w of s.workers){
    assert.ok(Math.abs(w.minutes - (w.work_minutes + w.ride_minutes)) <= 1, `person ${w.w}: hours include the rides (${w.minutes} = ${w.work_minutes} + ${w.ride_minutes})`);
    assert.ok(w.minutes <= period, `person ${w.w}: ${w.minutes} min > ${period} min (${env.DAYS} days × ${env.HPD} h)`);
    assert.ok(w.days.length >= 1 && w.days.length <= +env.DAYS, 'days of person ' + w.w);
    assert.equal(w.days.reduce((a, d) => a + d.minutes, 0), w.minutes, 'person ' + w.w + ': the line holds all of the hours');
  }
  assert.ok(s.flyers >= (env.DAYS === '3' ? 5285 : 6600), 'coverage: ' + s.flyers);
}
console.log('compact ok');
