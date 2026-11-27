// Regression (24.11.2026, updated 27.11.2026): in the drive-time mode nobody may get more hours than the period allows – rides
// included – and the team not more than the order's hours. Since 27.11.2026 a route is one line for the whole period (no cut into
// days), so the limit per person is days × hours per day. Leipheim snapshot with short shifts, exact check in minutes.
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const run = env => JSON.parse(execFileSync(process.execPath, [new URL('./drive-layout-report.mjs', import.meta.url).pathname, '--json'],
  { env:{ ...process.env, ...env }, stdio:['ignore', 'pipe', 'ignore'] }).toString().trim().split('\n').pop());
for(const env of [{ HPD:'1', DAYS:'3', TEAM_H:'6' }, { HPD:'2', DAYS:'2', TEAM_H:'8' }]){
  const s = run(env), period = +env.HPD * +env.DAYS * 60, team = +env.TEAM_H * 60;
  console.log(env.HPD + ' h × ' + env.DAYS + ':', s.workers.map(w => 'P' + w.w + ' ' + w.minutes + '/' + period + ' min (Auto ' + w.ride_minutes + ', ' + w.rides + ' Fahrten)').join(' | '), '· Team', s.total_minutes + '/' + team);
  assert.equal(s.dup_boxes, 0);
  assert.ok(s.total_minutes <= team, `team: ${s.total_minutes} min > ${team} min`);
  for(const w of s.workers){
    assert.ok(w.days.length <= +env.DAYS, `person ${w.w}: ${w.days.length} days > ${env.DAYS}`);
    assert.ok(w.minutes <= period, `person ${w.w}: ${w.minutes} min > ${period} min (rides included)`);
    assert.ok(Math.abs(w.minutes - (w.work_minutes + w.ride_minutes)) <= 1, `person ${w.w}: rides counted`);
  }
}
console.log('shift limit ok');
