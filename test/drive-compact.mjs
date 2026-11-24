// Drive-time layout on the Leipheim snapshot: no address twice, workers' areas hardly overlap, shifts and days kept.
// Two settings: 2 persons × 3 days × 9 h (snapshot test) and 2 × 2 × 8 h (the live order).
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
for(const env of [{ DAYS:'3', HPD:'9', QUOTA:'2500' }, { DAYS:'2', HPD:'8', QUOTA:'3000' }]){
  const out = execFileSync(process.execPath, [new URL('./drive-layout-report.mjs', import.meta.url).pathname, '--json'], { env:{ ...process.env, ...env }, stdio:['ignore', 'pipe', 'ignore'] }).toString();
  const s = JSON.parse(out.trim().split('\n').pop()), cap = +env.HPD * +env.DAYS;
  console.log(env.DAYS + '×' + env.HPD + ' h:', s.flyers, 'Flyer ·', s.total_h, 'h · overlap', s.overlap_pct, '% · rides', s.rides, '·', s.workers.map(w => w.hours + ' h/' + w.spread_m + ' m').join(' | '));
  assert.equal(s.dup_boxes, 0, 'an address in two routes');
  assert.ok(s.overlap_pct <= 5, 'the workers\' areas overlap: ' + s.overlap_pct + ' %');
  assert.ok(s.total_minutes <= 32 * 60, 'team hours');
  for(const w of s.workers){ assert.ok(w.minutes <= cap * 60, 'shift limit of person ' + w.w); assert.ok(w.days.length <= +env.DAYS, 'days of person ' + w.w);
    for(const d of w.days) assert.ok(d.minutes <= +env.HPD * 60, 'day too long: person ' + w.w + ' day ' + d.day + ' ' + d.hours + ' h'); }
  assert.ok(s.flyers >= (env.DAYS === '3' ? 5285 : 6600), 'coverage');
}
console.log('compact ok');
