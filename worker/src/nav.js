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
  const sg = (a, b) => b[2] === 1 ? 0 : hv(a, b);   // jump to a far place of the order: no street in between
  const cum = [0]; for(let i = 1; i < path.length; i++) cum.push(cum[i - 1] + sg(path[i - 1], path[i]));
  // position of every tracker sample (8 m steps, same densify as the progress tracker) along the path, as a fractional index
  const posOf = [0];
  for(let i = 1; i < path.length; i++){ const n = Math.max(1, Math.ceil(sg(path[i - 1], path[i]) / 8)); for(let k = 1; k <= n; k++) posOf.push(i - 1 + k / n); }
  let pos = 0, isDone = null, dayR = null;
  const mAt = q => { const j = Math.max(0, Math.min(path.length - 1, Math.floor(q))); return j < path.length - 1 ? cum[j] + (q - j) * (cum[j + 1] - cum[j]) : cum[j]; };   // metres along the line
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
    // which tracker sample a position on the line belongs to (posOf is ascending)
    sampleAt(p){ let lo = 0, hi = posOf.length - 1; while(lo < hi){ const mid = (lo + hi + 1) >> 1; if(posOf[mid] <= p) lo = mid; else hi = mid - 1; } return lo; },
    // isDone(sampleIndex): walked already (from the progress tracker) – such streets are passed over when an unwalked one is near
    setDoneCheck(fn){ isDone = fn; },
    // the working day the walker is on: pieces of other days (a street that belongs to day 1 and day 2) count only if nothing of this day is near
    setDay(k){ dayR = k == null ? null : days[Math.max(0, Math.min(days.length - 1, k))]; },
    // where on the line the walker is. All pieces within 50 m are candidates; the choice prefers (1) streets not walked yet,
    // (2) not going back along the route, (3) the nearest one. So a gap left behind does not pull the guidance back, and a street
    // walked earlier that runs close by does not catch the walker.
    // init: first fix after opening the screen – the walker stands where they walked last, so walked pieces are preferred there
    locate(lat, lng, init){
      if(path.length < 2) return { off:0 };
      const p = [lat, lng]; let best = null, near = Infinity;
      for(let j = 0; j <= path.length - 2; j++){
        const s = seg(p, j); if(s.d < near) near = s.d;
        if(s.d > 50) continue;
        const q = j + s.t, done = isDone ? isDone(api.sampleAt(q)) : false;
        const other = dayR && (q < dayR.i0 - 0.5 || q > dayR.i1 + 0.5) ? 45 : 0;
        const score = other + (init ? s.d - (done ? 30 : 0) - q * 0.001
          : s.d + (done && Math.abs(q - pos) > 4 ? 35 : 0) + (q < pos - 3 ? 25 : 0) + Math.min(40, Math.max(0, mAt(q) - mAt(pos) - 150) * 0.05));   // far ahead along the route (e.g. the end of the day runs back along the street walked first)   // the piece right here was just marked as walked: no penalty
        if(!best || score < best.score) best = { score, d:s.d, pos:q };
      }
      if(best) pos = best.pos;
      return { off:Math.round(best ? best.d : near), pos };
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
// nearest open (not yet walked) spot of an unfinished day (< 95 %): { d metres, day } or null
export function nearestOpen(plan, tracker, lat, lng){
  const nav = makeNav(plan), pc = dayProgress(plan, tracker), k = Math.cos(lat * Math.PI / 180);
  let best = null;
  for(let i = 0; i < tracker.samples.length; i++){
    if(tracker.isDone(i)) continue; const day = nav.dayAt(nav.posOf[i]); if(pc[day] >= 95) continue;
    const s = tracker.samples[i], d = 111320 * Math.hypot(s[0] - lat, (s[1] - lng) * k);
    if(!best || d < best.d) best = { d, day };
  }
  return best;
}
export function dayProgress(plan, tracker){
  const nav = makeNav(plan), cnt = nav.days.map(() => [0, 0]);
  for(let i = 0; i < tracker.samples.length; i++){ const k = nav.dayAt(nav.posOf[i]); cnt[k][1]++; if(tracker.isDone(i)) cnt[k][0]++; }
  return cnt.map(([d, n]) => n ? Math.round(100 * d / n) : 0);
}

// Re-route the rest of a working day from where the walker is: the walker took their own way, so the open streets of the
// day are put into a new order. The streets of the whole plan form the network (walking along streets of another day is
// allowed); greedy: always the nearest open street next, open streets passed on the way count as done, at the end back to
// the day's end point (the start point). isDone(sample) comes from the progress tracker (8 m samples, same as posOf).
export function rerouteDay(plan, dayIdx, isDone, here, head){
  const path = plan.path || [], base = makeNav(plan), day = base.days[Math.max(0, Math.min(base.days.length - 1, dayIdx || 0))];
  if(path.length < 2) return null;
  const ids = new Map(), pts = [], key = p => p[0].toFixed(6) + ',' + p[1].toFixed(6);
  const vid = path.map(p => { const k = key(p); let i = ids.get(k); if(i === undefined){ i = pts.length; ids.set(k, i); pts.push(p); } return i; });
  // open[j]: segment j (path[j] → path[j+1]) still needs walking. A few unmarked metres at a corner (GPS) do not count:
  // at least 3 samples (~24 m) and half of the segment must be open – otherwise the walker would be sent back for nothing.
  // A piece of 40 m in a row (5 samples) is open in any case: the end of a long street that was not walked to its end.
  const nS = new Uint16Array(path.length), nO = new Uint16Array(path.length), open = new Uint8Array(path.length), rowMax = new Uint16Array(path.length);
  let row = 0, rowJ = -1;
  for(let i = 0; i < base.posOf.length; i++){
    const j = Math.min(path.length - 2, Math.max(0, Math.ceil(base.posOf[i] - 1e-9) - 1)); nS[j]++;
    if(!isDone(i)){ nO[j]++; row = rowJ === j ? row + 1 : 1; rowJ = j; if(row > rowMax[j]) rowMax[j] = row; } else { row = 0; rowJ = -1; }
  }
  for(let j = 0; j < path.length - 1; j++) open[j] = nO[j] >= Math.max(3, nS[j] * 0.5) || rowMax[j] >= 5 ? 1 : 0;
  const E = [], byKey = new Map(), adj = pts.map(() => []);
  for(let j = 0; j < path.length - 1; j++){
    const a = vid[j], b = vid[j + 1]; if(a === b || path[j + 1][2] === 1) continue;   // a jump to a far place is no street
    const k = a < b ? a + '_' + b : b + '_' + a; let e = byKey.get(k);
    if(!e){ e = { a, b, len:hv(pts[a], pts[b]), req:false }; byKey.set(k, e); adj[a].push(E.length); adj[b].push(E.length); E.push(e); }
    if(j >= day.i0 && j < day.i1 && open[j]) e.req = true;
  }
  const dijkstra = src => {
    const d = new Float64Array(pts.length).fill(Infinity), pe = new Int32Array(pts.length).fill(-1), done = new Uint8Array(pts.length); d[src] = 0;
    const heap = [[0, src]];
    while(heap.length){
      let bi = 0; for(let i = 1; i < heap.length; i++) if(heap[i][0] < heap[bi][0]) bi = i;   // small graphs: a plain list is fast enough
      const [dv, v] = heap[bi]; heap[bi] = heap[heap.length - 1]; heap.pop();
      if(done[v]) continue; done[v] = 1;
      for(const ei of adj[v]){ const e = E[ei], w = e.a === v ? e.b : e.a, nd = dv + e.len; if(nd < d[w]){ d[w] = nd; pe[w] = ei; heap.push([nd, w]); } }
    }
    return { d, pe };
  };
  // start: the walker is on a street piece – they walk it to its end in the direction they go (that piece counts as done),
  // and the new order begins there; without a direction (standing) the nearest junction
  let start = 0, bd = Infinity; pts.forEach((p, i) => { if(adj[i].length){ const d = hv(p, here); if(d < bd){ bd = d; start = i; } } });
  if(head != null){
    const kx = Math.cos(here[0] * RAD) * R * RAD, ky = R * RAD; let on = null;
    E.forEach((e, ei) => {
      const A = pts[e.a], B = pts[e.b], ax = (A[1] - here[1]) * kx, ay = (A[0] - here[0]) * ky, bx = (B[1] - here[1]) * kx, by = (B[0] - here[0]) * ky;
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy; let t = L2 ? -(ax * dx + ay * dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(ax + t * dx, ay + t * dy); if(d <= 30 && (!on || d < on.d)) on = { ei, d };
    });
    if(on){
      const e = E[on.ei], toB = Math.abs(((bearing(pts[e.a], pts[e.b]) - head) % 360 + 540) % 360 - 180) < 90;
      start = toB ? e.b : e.a; e.req = false;
    }
  }
  if(!E.some(e => e.req)) return null;
  const endV = vid[day.i1];
  // one candidate route: optionally first the planned order from open segment j (the plan's good order is kept), then the
  // nearest open street again and again, then back to the day's end point
  const build = jFrom => {
    const req = E.map(e => e.req); let left = req.filter(Boolean).length, cur = start, len = 0;
    const out = [pts[start]], eIdx = (a, b) => adj[a].find(ei => (E[ei].a === a && E[ei].b === b) || (E[ei].b === a && E[ei].a === b));
    const step = (to, ei) => { if(req[ei]){ req[ei] = false; left--; } len += E[ei].len; out.push(pts[to]); cur = to; };
    const goTo = (t, sp) => { const chain = []; for(let v = t; v !== cur && sp.pe[v] >= 0; ){ const ei = sp.pe[v], e = E[ei]; chain.push([v, ei]); v = e.a === v ? e.b : e.a; } for(let k = chain.length - 1; k >= 0; k--) step(chain[k][0], chain[k][1]); };
    if(jFrom != null){
      goTo(vid[jFrom], dijkstra(cur));
      for(let j = jFrom; j < day.i1 && left > 0; j++){ const a = vid[j], b = vid[j + 1]; if(a === b) continue; const ei = eIdx(a, b); if(ei != null) step(b, ei); }
    }
    for(let guard = 0; left > 0 && guard < 5000; guard++){
      const sp = dijkstra(cur); let best = null;
      E.forEach((e, ei) => { if(!req[ei]) return; const da = sp.d[e.a], db = sp.d[e.b], dmin = Math.min(da, db); if(isFinite(dmin) && (!best || dmin < best.d)) best = { ei, d:dmin, near:da <= db ? e.a : e.b }; });
      if(!best) break;
      goTo(best.near, sp); const e = E[best.ei]; step(e.a === best.near ? e.b : e.a, best.ei);
    }
    if(endV !== cur){ const sp = dijkstra(cur); if(isFinite(sp.d[endV])) goTo(endV, sp); }
    return { out, len };
  };
  // where the planned order can be picked up: the open segment of the day nearest to the walker
  const sp0 = dijkstra(start); let jNear = null;
  for(let j = day.i0; j < day.i1; j++) if(open[j] && isFinite(sp0.d[vid[j]]) && (jNear == null || sp0.d[vid[j]] < sp0.d[vid[jNear]])) jNear = j;
  const cands = [build(null)]; if(jNear != null) cands.push(build(jNear));
  const best = cands.reduce((x, y) => y.len < x.len ? y : x);
  return best.out.length > 1 ? best.out : null;
}

// Checkpoints: every working day is cut into sections of about `every` metres; a section is done when 80 % of it is walked.
// Shown to the admin and the walker as numbered points along the route (✓ when done).
export function checkpoints(plan, isDone, every){
  every = every || 800;
  const nav = makeNav(plan), path = nav.path; if(path.length < 2) return [];
  const mAt = q => { const j = Math.max(0, Math.min(path.length - 1, Math.floor(q))); return j < path.length - 1 ? nav.cum[j] + (q - j) * (nav.cum[j + 1] - nav.cum[j]) : nav.cum[j]; };
  const out = [];
  nav.days.forEach((d, k) => {
    const m0 = nav.cum[d.i0], m1 = nav.cum[d.i1], n = Math.max(1, Math.round((m1 - m0) / every)), size = (m1 - m0) / n;
    const cnt = Array.from({ length:n }, () => [0, 0]);
    for(let i = 0; i < nav.posOf.length; i++){ const q = nav.posOf[i]; if(q < d.i0 || q > d.i1) continue; const s = Math.min(n - 1, Math.floor((mAt(q) - m0) / size)); cnt[s][1]++; if(isDone(i)) cnt[s][0]++; }
    for(let s = 0; s < n; s++){
      const target = m0 + (s + 0.5) * size; let j = d.i0; while(j < d.i1 && nav.cum[j + 1] < target) j++;
      const f = nav.cum[j + 1] > nav.cum[j] ? (target - nav.cum[j]) / (nav.cum[j + 1] - nav.cum[j]) : 0, a = path[j], b = path[Math.min(path.length - 1, j + 1)];
      const pct = cnt[s][1] ? Math.round(100 * cnt[s][0] / cnt[s][1]) : 0;
      // the streets of this section (pieces split at car/bus jumps) – to show it and to close it by hand
      const s0 = m0 + s * size, s1 = m0 + (s + 1) * size, runs = []; let cur = [];
      for(let i = d.i0; i <= d.i1; i++){
        if(path[i][2] === 1 && cur.length){ if(cur.length > 1) runs.push(cur); cur = []; }
        if(nav.cum[i] >= s0 - 1 && nav.cum[i] <= s1 + 1) cur.push([path[i][0], path[i][1]]);
        else if(cur.length){ if(cur.length > 1) runs.push(cur); cur = []; }
      }
      if(cur.length > 1) runs.push(cur);
      out.push({ day:k, n:s + 1, at:[a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], pct, done:pct >= 80, runs });
    }
  });
  return out;
}

// pieces of the route a distributor marked as not needed: they count as done everywhere (progress, guidance, checkpoints)
export function addSkips(tr, plan){
  if(!tr || !plan) return tr;
  for(const s of plan.skipped || []) if(s && Array.isArray(s.pts) && s.pts.length > 1) tr.addTrack(s.pts);
  return tr;
}

// The street the walker is on goes on, but is not walked there yet: the open piece (≥ 3 samples, about 24 m, in a row) that lies straight
// along the route from where the walker is (up to 200 m away, no turn in between). Used to notice that somebody turns
// around before the end of a street: { d: metres to its beginning, near, far, dir:[x, y] unit vector near→far, seed, key }.
// samples = tracker.samples (8 m steps), isDone(i), ok(i): sample belongs to what is walked now (the working day)
export function openStraight(samples, isDone, ok, lat, lng){
  const kx = Math.cos(lat * RAD) * R * RAD, ky = R * RAD, n = samples.length;
  const vec = (a, b) => { const x = (b[1] - a[1]) * kx, y = (b[0] - a[0]) * ky, l = Math.hypot(x, y); return l > 0.3 ? [x / l, y / l, l] : null; };
  const step = (i, j) => j >= 0 && j < n && samples[Math.max(i, j)][2] !== 1 ? vec(samples[i], samples[j]) : null;
  let best = null;
  for(let i = 0; i < n; i++){
    const q = samples[i]; if(!isDone(i) || Math.abs(q[0] - lat) > 0.0003) continue;
    const dHere = Math.hypot((q[1] - lng) * kx, (q[0] - lat) * ky); if(dHere > 20) continue;
    for(const sg of [-1, 1]){
      const d0 = step(i, i + sg); if(!d0 || d0[2] > 12) continue;
      let j = i + sg, prev = i, guard = 0, fine = true;
      const straight = (a, b) => { const v = step(a, b); return v && v[2] <= 12 && v[0] * d0[0] + v[1] * d0[1] >= 0.77; };   // ≤ 40° off the direction it began with
      while(fine && guard++ < 25 && isDone(j)){ prev = j; j += sg; fine = straight(prev, j); }
      if(!fine || isDone(j) || !ok(j)) continue;
      let end = j, len = 1; while(len < 60 && straight(end, end + sg) && !isDone(end + sg) && ok(end + sg)){ end += sg; len++; }
      if(len < 3) continue;   // less than ~24 m: GPS, or the last house is reached
      const near = samples[j], far = samples[end], d = Math.hypot((near[1] - lng) * kx, (near[0] - lat) * ky);
      if(d > 200) continue;
      if(!best || d < best.d) best = { d, near, far, dir:[d0[0], d0[1]], seed:j, key:far[0].toFixed(5) + ',' + far[1].toFixed(5), len:len * 8 };
    }
  }
  return best;
}

// What is left of a route, in tidy pieces for the map. Every piece of street is drawn once (a street walked up and down is
// one line, not two on top of each other) and belongs to one group:
//   done   – walked (or handed in as not needed)
//   today  – open, belongs to the working day `cur`
//   missed – open and left behind: of an earlier day, or a short piece (≤ 480 m) between streets that are already done
//   later  – open, belongs to a later day
// Returns { done, today, missed, later } as lists of lines, and the open metres per group.
export function routePieces(plan, tracker, cur){
  const S = tracker.samples, n = S.length, nav = makeNav(plan), cls = new Uint8Array(n);   // 0 done · 1 later · 2 missed · 3 today
  cur = cur == null ? 0 : cur;
  const cont = i => i > 0 && S[i][2] !== 1 && hv(S[i - 1], S[i]) <= 12;
  for(let i = 0; i < n; i++){ if(tracker.isDone(i)) continue; const k = nav.dayAt(nav.posOf[i]); cls[i] = k < cur ? 2 : k > cur ? 1 : 3; }
  // holes of the day: open runs with walked street before and after
  for(let i = 0; i < n; i++){
    if(cls[i] !== 3) continue;
    let e = i; while(e + 1 < n && cls[e + 1] === 3 && cont(e + 1)) e++;
    // "walked" means 70 m of street on that side (9 samples) – a crossing the walker passed is marked too, but it does not
    // make the side street next to it a hole
    const wal = (x, sg) => { for(let g = 0; g < 9; g++){ const y = x + sg * g; if(y < 0 || y >= n || cls[y] !== 0 || (g && !cont(sg > 0 ? y : y + 1))) return false; } return true; };
    const before = i > 0 && cont(i) && wal(i - 1, -1), after = e + 1 < n && cont(e + 1) && wal(e + 1, 1), len = e - i + 1;
    if(before && after && len <= 60) for(let x = i; x <= e; x++) cls[x] = len <= 2 ? 0 : 2;   // one or two samples: GPS, not a missed piece
    i = e;
  }
  // every piece of street once: the group that matters most wins (today > missed > later > done)
  const key = (a, b) => { const x = ((a[0] + b[0]) / 2).toFixed(5) + ',' + ((a[1] + b[1]) / 2).toFixed(5); return x; };
  const top = new Map(), segC = i => Math.max(cls[i - 1], cls[i]) === 0 ? 0 : (cls[i] || cls[i - 1]);
  for(let i = 1; i < n; i++){ if(!cont(i)) continue; const k = key(S[i - 1], S[i]), c = segC(i); if(!top.has(k) || top.get(k) < c) top.set(k, c); }
  const out = [[], [], [], []], m = [0, 0, 0, 0], used = new Set(); let line = null, lc = -1;
  for(let i = 1; i < n; i++){
    const k = cont(i) ? key(S[i - 1], S[i]) : null, c = k == null ? -1 : top.get(k);
    if(k == null || used.has(k)){ line = null; lc = -1; continue; }
    used.add(k); m[c] += hv(S[i - 1], S[i]);
    if(line && lc === c) line.push([S[i][0], S[i][1]]); else { line = [[S[i - 1][0], S[i - 1][1]], [S[i][0], S[i][1]]]; lc = c; out[c].push(line); }
  }
  return { done:out[0], later:out[1], missed:out[2], today:out[3], m:{ done:m[0], later:m[1], missed:m[2], today:m[3] } };
}
