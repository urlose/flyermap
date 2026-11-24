// Regression (24.11.2026): in the drive-time mode no day of a person may be longer than the shift – rides included –
// and nobody gets more days than allowed. Leipheim snapshot with 60-minute shifts (2 persons × 3 days), exact check in minutes.
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const run = env => JSON.parse(execFileSync(process.execPath, [new URL('./drive-layout-report.mjs', import.meta.url).pathname, '--json'],
  { env:{ ...process.env, ...env }, stdio:['ignore', 'pipe', 'ignore'] }).toString().trim().split('\n').pop());
for(const env of [{ HPD:'1', DAYS:'3', TEAM_H:'6' }, { HPD:'2', DAYS:'2', TEAM_H:'8' }]){
  const s = run(env), lim = +env.HPD * 60;
  console.log(env.HPD + ' h × ' + env.DAYS + ':', s.workers.map(w => 'P' + w.w + ' [' + w.days.map(d => d.minutes).join(', ') + '] min, ' + w.rides + ' Fahrten').join(' | '));
  assert.equal(s.dup_boxes, 0);
  for(const w of s.workers){
    assert.ok(w.days.length <= +env.DAYS, `person ${w.w}: ${w.days.length} days > ${env.DAYS}`);
    for(const d of w.days) assert.ok(d.minutes <= lim, `person ${w.w}, day ${d.day}: ${d.minutes} min > ${lim} min`);
  }
}
console.log('shift limit ok');
