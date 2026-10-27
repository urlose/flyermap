// Turn-by-turn guidance along a planned route (like a walking navigation): where am I on the line, what is the next turn.
// Pure logic, no DOM. path = [[lat,lng],…], steps = [[pathIndex, 'start'|'S'|'SL'|'SR'|'L'|'R'|'U'|'end', streetName],…], days = [{i0,i1,…}]
const R = 6371000, RAD = Math.PI / 180;
const hv = (a, b) => { const x = Math.sin((b[0] - a[0]) * RAD / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin((b[1] - a[1]) * RAD / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const bearing = (a, b) => Math.atan2((b[1] - a[1]) * Math.cos(a[0] * RAD), b[0] - a[0]) / RAD;
const turnCode = d => { const a = Math.abs(d); return a < 25 ? 'S' : a < 60 ? (d < 0 ? 'SL' : 'SR') : a < 150 ? (d < 0 ? 'L' : 'R') : 'U'; };

// plans made before turn data existed: derive the turns from the line itself (no street names)
export function stepsFromPath(path){
  const steps = [];
  if(path.length < 2) return steps;
  steps.push([0, 'start', '']);
  let last = 0;
  for(let i = 1; i < path.length - 1; i++){
    let a = i - 1; while(a > 0 && hv(path[a], path[i]) < 10) a--;
    let b = i + 1; while(b < path.length - 1 && hv(path[i], path[b]) < 10) b++;
    let turn = bearing(path[i], path[b]) - bearing(path[a], path[i]); while(turn > 180) turn -= 360; while(turn < -180) turn += 360;
    if(Math.abs(turn) >= 35 && i - last > 1){ steps.push([i, turnCode(turn), '']); last = i; }
  }
  steps.push([path.length - 1, 'end', '']);
  return steps;
}

export function makeNav(plan){
  const path = plan.path || [];
  const steps = (plan.steps && plan.steps.length ? plan.steps : stepsFromPath(path)).slice().sort((x, y) => x[0] - y[0]);
  const days = plan.days && plan.days.length ? plan.days : [{ i0:0, i1:Math.max(0, path.length - 1) }];
  const cum = [0]; for(let i = 1; i < path.length; i++) cum.push(cum[i - 1] + hv(path[i - 1], path[i]));
  // position of every tracker sample (8 m steps, same densify as the progress tracker) along the path, as a fractional index
  const posOf = [0];
  for(let i = 1; i < path.length; i++){ const n = Math.max(1, Math.ceil(hv(path[i - 1], path[i]) / 8)); for(let k = 1; k <= n; k++) posOf.push(i - 1 + k / n); }
  let pos = 0;
  const seg = (p, j) => {   // distance from p to segment j (path[j]→path[j+1]) and the fraction along it, in metres (flat approximation)
    const a = path[j], b = path[j + 1], kx = Math.cos(p[0] * RAD) * R * RAD, ky = R * RAD;
    const ax = (a[1] - p[1]) * kx, ay = (a[0] - p[0]) * ky, bx = (b[1] - p[1]) * kx, by = (b[0] - p[0]) * ky;
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy; let t = L2 ? -(ax * dx + ay * dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
    return { d:Math.hypot(ax + t * dx, ay + t * dy), t };
  };
  const api = {
    path, steps, days, cum, posOf, get pos(){ return pos; },
    setPosFromSample(i){ if(i >= 0 && i < posOf.length) pos = posOf[i]; else pos = Math.max(0, path.length - 1); },
    dayAt(p){ const j = Math.floor(p == null ? pos : p); const k = days.findIndex(d => j < d.i1 || (j === d.i1 && d === days[days.length - 1])); return k < 0 ? days.length - 1 : k; },
    // follows the walker: searches a window ahead of the last position (a street that is walked twice must not make us jump back)
    locate(lat, lng){
      if(path.length < 2) return { off:0 };
      const p = [lat, lng]; let best = null;
      const scan = (from, to) => { for(let j = Math.max(0, from); j <= Math.min(path.length - 2, to); j++){ const s = seg(p, j); if(!best || s.d < best.d) best = { d:s.d, pos:j + s.t }; } };
      const j0 = Math.floor(pos); scan(j0 - 2, j0 + 40);
      if(!best || best.d > 60){ const keep = best; best = null; scan(0, path.length - 2); if(keep && (!best || keep.d <= best.d + 15)) best = keep; }
      if(best && best.d <= 60) pos = Math.max(pos - 3, best.pos);   // never jump backwards
      return { off:Math.round(best ? best.d : 0), pos };
    },
    // the stretch right in front of the walker (from the current position, about `meters` along the line, not past the
    // end of the day): drawn bright on the map so the next steps stand out from the rest of the route
    ahead(dayIdx, meters){
      if(path.length < 2) return [];
      const day = days[Math.max(0, Math.min(days.length - 1, dayIdx || 0))], j = Math.floor(pos), f = pos - j;
      const out = [j < path.length - 1 ? [path[j][0] + (path[j + 1][0] - path[j][0]) * f, path[j][1] + (path[j + 1][1] - path[j][1]) * f] : path[j]];
      const here = cum[j] + (j < path.length - 1 ? f * (cum[j + 1] - cum[j]) : 0);
      for(let i = j + 1; i <= day.i1 && i < path.length; i++){
        if(cum[i] - here > meters){ const a = path[i - 1], b = path[i], need = meters - (cum[i - 1] - here), L = cum[i] - cum[i - 1] || 1, t = Math.max(0, Math.min(1, need / L)); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); break; }
        out.push(path[i]);
      }
      return out;
    },
    // next instruction inside the given day: { step, dist (m), then }
    next(dayIdx){
      const day = days[Math.max(0, Math.min(days.length - 1, dayIdx || 0))], endIdx = day.i1;
      const here = cum[Math.floor(pos)] + (Math.floor(pos) < path.length - 1 ? (pos - Math.floor(pos)) * (cum[Math.floor(pos) + 1] - cum[Math.floor(pos)]) : 0);
      const upcoming = steps.filter(s => s[0] > pos + 0.02 && s[0] < endIdx && s[1] !== 'end' && s[1] !== 'start');
      const mk = s => ({ step:s, dist:Math.max(0, Math.round(cum[s[0]] - here)), at:path[s[0]] });
      if(!upcoming.length || endIdx - pos < 0.02){ const last = [endIdx, 'end', '']; return { step:last, dist:Math.max(0, Math.round(cum[endIdx] - here)), at:path[endIdx], then:null, lastOfDay:true, day:days.indexOf(day) }; }
      return { ...mk(upcoming[0]), then:upcoming[1] ? mk(upcoming[1]) : null };
    },
  };
  return api;
}

// share of every day's route that has been walked (tracker needs isDone); returns [pct per day]
export function dayProgress(plan, tracker){
  const nav = makeNav(plan), cnt = nav.days.map(() => [0, 0]);
  for(let i = 0; i < tracker.samples.length; i++){ const k = nav.dayAt(nav.posOf[i]); cnt[k][1]++; if(tracker.isDone(i)) cnt[k][0]++; }
  return cnt.map(([d, n]) => n ? Math.round(100 * d / n) : 0);
}
