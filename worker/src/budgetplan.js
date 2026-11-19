// Time-budget orders: how a plan becomes `task_plans` rows (pure, no DOM, no network – tested in test/budget.mjs).
// One row per WORKER (route index = worker slot, r.w); the worker is the row's worker_id, the colour is only for the map. Old orders and
// the old zone/side/cores modes build their rows exactly as before (budgetDays hands their days back untouched).

// days of a time-budget route: each day lists the town sections it walks (place, range of path points), the rides between places that fall
// on it (straight-line km, minutes only when the admin knew them) and – on the first day – the budget of the order, so that the order can be
// reopened in this mode (no database column). Extra keys in the days are ignored by everything that reads days today.
import { gridForSave } from './drivezone.js';

export function budgetDays(r, pl){
  if(!pl || !pl.budget || !r.parts) return r.days;
  const jumps = (r.jumps || []).filter(j => !j.same);
  return (r.days || []).map((x, k) => {
    const rides = jumps.filter(j => j.idx > x.i0 && j.idx <= x.i1).map(j => ({ from:j.from, to:j.to, km:j.km, min:j.geom ? j.min : j.known ? j.min : null, ...(j.geom ? { idx:j.idx, known:!!j.known, manual:!!j.manual, walk:!!j.walk, geom:j.geom } : {}) }));   // 19.11.2026: road rides keep their line
    return { ...x, parts:r.parts.filter(z => z.i1 >= x.i0 && z.i0 <= x.i1).map(z => ({ place:z.place, part:z.part, i0:Math.max(z.i0, x.i0), i1:Math.min(z.i1, x.i1) })),
      ...(rides.length ? { rides } : {}), ...(k === 0 ? { budget_h:pl.budget.hours, budget_tol:pl.budget.tolerance, ...(pl.budget.radiusKm != null ? { delivery_radius_km:pl.budget.radiusKm } : {}), ...(pl.budget.cap && pl.budget.cap.target > 0 ? { flyer_cap:pl.budget.cap.target } : {}), ...(pl.budget.mode === 'drive' && pl.budget.drive ? { budget_mode:'drive', drive_min:pl.budget.drive.limit_min, max_flyers:pl.budget.drive.max_flyers, outlier_m:pl.budget.drive.outlier.m, outlier_per_km:pl.budget.drive.outlier.perKm, delivery_zone:gridForSave(pl.budget.driveZone) } : {}), ...(pl.budget.strategy ? { budget_strategy:pl.budget.strategy, budget_car:!!pl.budget.car } : {}), ...(pl.budget.travel?.known ? { budget_travel_min:pl.budget.travel.moves ? pl.budget.travel.minutes / pl.budget.travel.moves : 0 } : {}) } : {}) };
  });
}

// rows for the insert: assign[i] = worker id of route i (or none), counts = savedMailboxCounts(...).routes, colors = palette
function integerCount(value){
  const n = Number(value);
  if(!Number.isFinite(n) || n < 0) throw new Error('Invalid mailbox count');
  return Math.round(n);
}

export function planRows(pl, { taskId, assign = {}, counts, colors }){
  return pl.routes.map((r, i) => ({ task_id:taskId, idx:i, worker_id:assign[i] || null, color:colors[(r.w != null ? r.w : i) % colors.length], path:r.path, length_m:r.length_m, street_m:r.street_m,
    mailboxes:integerCount(counts[i]), boxes:r.boxes, minutes:r.minutes, days:budgetDays(r, pl), steps:r.steps, reserve:r.reserve || [] }));
}

