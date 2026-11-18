// Smaller print run in a time-first order (18.11.2026). The full plan inside the circle comes first; when the admin enters
// fewer flyers, mailboxes are taken out place by place and the routes are planned again for what stays.
// Rules: circle (centre, radius) unchanged; the main town has priority; cut first in the nearby places with the most
// flyers (largest first, down to a common level); keep a presence in every selected place while possible; inside a place
// the streets farthest from the start go first. Pure functions, tested in test/flyercap.mjs.
import { cellOf } from './zensus.js';

export const boxKey = b => (+b[0]).toFixed(6) + ',' + (+b[1]).toFixed(6);
const d2 = (a, b) => { const x = (a[1] - b[1]) * Math.cos(a[0] * Math.PI / 180), y = a[0] - b[0]; return x * x + y * y; };

// delivered mailboxes of a plan: one entry per building with its weight (route mailboxes spread over the route's boxes)
export function plannedBoxes(routes){
  const out = new Map();
  for(const r of routes || []){
    const bx = r.boxes || [], sum = bx.reduce((s, b) => s + (b[2] || 1), 0); if(!sum) continue;
    const f = (r.mailboxes || 0) / sum;
    for(const b of bx){ const k = boxKey(b), w = (b[2] || 1) * f, o = out.get(k); if(o) o.w += w; else out.set(k, { k, p:[+b[0], +b[1]], w }); }
  }
  return [...out.values()];
}

// census places [{id,name,cells,lat,lng}] -> which one each box belongs to; the place around the start is the main town
export function attribute(boxes, places, start){
  const cellMap = new Map(), [sa, sb] = cellOf(start[0], start[1]);
  let main = null, mainD = Infinity;
  for(const pl of places || []){
    for(let k = 0; k + 1 < (pl.cells || []).length; k += 2){
      const a = pl.cells[k], b = pl.cells[k + 1], dd = Math.max(Math.abs(a - sa), Math.abs(b - sb));
      if(dd < mainD){ mainD = dd; main = pl.id; }
      for(let x = -1; x <= 1; x++) for(let y = -1; y <= 1; y++){ const key = (a + x) + ',' + (b + y); if(!cellMap.has(key) || (x === 0 && y === 0)) cellMap.set(key, pl.id); }
    }
  }
  if(mainD > 5) main = null;   // no census place at the start: the start's surroundings are the main town
  const centres = (places || []).map(pl => ({ id:pl.id, p:[pl.lat, pl.lng] }));
  return boxes.map(bx => {
    const [a, b] = cellOf(bx.p[0], bx.p[1]); let id = cellMap.get(a + ',' + b);
    if(id == null){ let best = Infinity; for(const c of centres){ const v = d2(bx.p, c.p); if(v < best){ best = v; id = c.id; } } }
    // closer to the start than to any place centre beyond 1.5 km: main town
    if(id == null || (main == null && d2(bx.p, start) < 1.5e-4)) id = main ?? '_main';
    return { ...bx, place:id, main:id === (main ?? '_main') };
  });
}

// mailboxes per place -> how many each place keeps
// floor = presence in a place: at least 15 % of it, at least 20 mailboxes (never more than it has)
export function allocate(counts, target){
  const ids = Object.keys(counts), total = ids.reduce((s, id) => s + counts[id].n, 0), quota = {};
  ids.forEach(id => quota[id] = counts[id].n);
  let need = total - Math.max(0, target);
  if(need <= 0) return quota;
  const others = ids.filter(id => !counts[id].main), mains = ids.filter(id => counts[id].main);
  const floor = id => Math.min(counts[id].n, Math.max(20, Math.ceil(counts[id].n * 0.15)));
  // water level: every place above the level is cut to it (largest first), never below its floor
  const fill = (list, lo, amount) => {
    const cut = L => list.reduce((s, id) => s + Math.max(0, quota[id] - Math.max(L, lo(id))), 0);
    const can = cut(0); if(can <= 0) return 0;
    if(amount >= can){ list.forEach(id => quota[id] = Math.min(quota[id], lo(id))); return can; }
    let a = 0, b = Math.max(...list.map(id => quota[id]));
    for(let i = 0; i < 60; i++){ const m = (a + b) / 2; if(cut(m) > amount) a = m; else b = m; }
    list.forEach(id => quota[id] = Math.min(quota[id], Math.max(b, lo(id))));
    return amount;
  };
  need -= fill(others, floor, need);            // 1. nearby places down to their floor, biggest first
  if(need > 0) need -= fill(others, () => 0, need);   // 2. still too much: the presence goes too (biggest first)
  if(need > 0) need -= fill(mains, () => 0, need);    // 3. only then the main town
  return quota;
}

// which mailboxes stay: per place the ones nearest to the start, until the place's quota is used
export function chooseKeep(attributed, quota, start){
  const keep = new Set(), by = new Map();
  for(const b of attributed){ if(!by.has(b.place)) by.set(b.place, []); by.get(b.place).push(b); }
  for(const [id, list] of by){
    list.sort((a, b) => d2(a.p, start) - d2(b.p, start));
    const all = list.reduce((s, b) => s + b.w, 0); let left = quota[id] ?? 0;
    if(left >= all - 0.5){ list.forEach(b => keep.add(b.k)); continue; }   // the place keeps everything (weights are not whole numbers)
    for(const b of list){ if(b.w <= left + 0.25){ keep.add(b.k); left -= b.w; } else left = -1; }   // stop at the first that does not fit: no holes
  }
  return keep;
}

// the whole step: full plan routes + places + target -> keep set and the report per place
export function capPlan(routes, places, start, target){
  const boxes = attribute(plannedBoxes(routes), places, start), counts = {};
  for(const b of boxes){ (counts[b.place] = counts[b.place] || { n:0, main:b.main }).n += b.w; }
  const quota = allocate(counts, target), keep = chooseKeep(boxes, quota, start);
  // guarantee: never above the print run (rounding of fractional weights): drop the farthest boxes of the biggest nearby place
  let kept = boxes.filter(b => keep.has(b.k)).reduce((s, b) => s + b.w, 0);
  while(kept > target + 1e-6){
    const per = new Map(); for(const b of boxes) if(keep.has(b.k)) per.set(b.place, (per.get(b.place) || 0) + b.w);
    const ids = [...per.keys()], pick = ids.filter(id => !counts[id].main).sort((a, z) => per.get(z) - per.get(a))[0] ?? ids[0];
    const far = boxes.filter(b => b.place === pick && keep.has(b.k)).sort((a, z) => d2(z.p, start) - d2(a.p, start))[0];
    if(!far) break; keep.delete(far.k); kept -= far.w;
  }
  const report = Object.keys(counts).map(id => ({ id, main:counts[id].main, full:Math.round(counts[id].n), keep:Math.round(boxes.filter(b => b.place === id && keep.has(b.k)).reduce((s, b) => s + b.w, 0)) }));
  return { keep, report, total:Math.round(boxes.reduce((s, b) => s + b.w, 0)), place:new Map(boxes.map(b => [b.k, b.place])) };
}

// graph limited to the kept mailboxes (edges keep their walking geometry; mailboxes scaled as in clipDeliveryGraph)
export function clipToKeep(g, keep){
  return { ...g, edges:g.edges.map(e => {
    if(!(e.mb > 0)) return e;
    const boxes = e.boxes || [], total = boxes.reduce((s, b) => s + (b[2] || 1), 0);
    if(!total) return { ...e, mb:0, boxes:[] };
    const kept = boxes.filter(b => keep.has(boxKey(b)));
    if(kept.length === boxes.length) return e;
    return { ...e, boxes:kept, mb:e.mb * kept.reduce((s, b) => s + (b[2] || 1), 0) / total };
  }) };
}
// streets that lost all their mailboxes: drawn grey on the map (what was taken out)
export function droppedStreets(g, keep, delivered){
  const out = [];
  for(const e of g.edges){
    const bx = e.boxes || []; if(!(e.mb > 0) || !bx.length) continue;
    if(bx.some(b => delivered.has(boxKey(b))) && !bx.some(b => keep.has(boxKey(b)))){
      const pts = e.coords?.length ? e.coords : [g.pts[e.a], g.pts[e.b]];
      out.push(pts.map(p => [+(+p[0]).toFixed(5), +(+p[1]).toFixed(5)]));
    }
  }
  return out;
}
