// Phase 2A map link: list <-> map highlight (worker/src/sugmap.js). The state machine is tested with fake draw callbacks (no
// Leaflet/DOM); geometry with SYNTHETIC cells and with the REAL Zensus 2022 files (Weidenberg / Eisfeld, admin/zensus). Run: node test/sugmap.mjs
import { readFileSync, existsSync } from 'node:fs';
import { censusPlaces, clusterCells, laea, unlaea } from '../worker/src/zensus.js';
import { rankSuggestions, addSuggestion, suggestionFlow } from '../worker/src/expand.js';
import { cellRuns, shapeOf, createHighlighter, keyOf, nameShown, MAX_RUNS } from '../worker/src/sugmap.js';
let fail = 0; const ok = (name, c, info) => { console.log((c ? 'ok   ' : 'FAIL ') + name + (info != null ? '  ' + info : '')); if(!c) fail++; };
const hav = (a, b, c, d) => { const R = 6371000, r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };

// ---- geometry [synthetic] ----
{ const runs = cellRuns([0, 0, 1, 0, 2, 0, 5, 0, 0, 1, 1, 1]);   // row 0: cells 0,1,2 and 5; row 1: cells 0,1
  ok('[synthetic] cells of a row are merged into runs, a gap starts a new one', JSON.stringify(runs.sort()) === JSON.stringify([[0, 0, 2], [0, 5, 5], [1, 0, 1]].sort()), JSON.stringify(runs));
  const it = { id:'a', lat:49.9, lng:11.7, cells:Int32Array.from([4400, 2900, 4401, 2900]) }, sh = shapeOf(it);
  ok('[synthetic] a place with cells gets an approximate area, not a border', sh.kind === 'cells' && sh.approx === true && sh.rects.length === 1 && sh.rects[0].length === 4);
  const [la, lo] = unlaea(4400 * 100, 2900 * 100), r = sh.rects[0][0]; ok('[synthetic] corners are the real cell corners', hav(la, lo, r[0], r[1]) < 1);
  ok('[synthetic] shape is computed once per item', shapeOf(it) === sh);
  ok('no cells (old data) -> marker at the place', shapeOf({ id:'b', lat:1, lng:2 }).kind === 'marker');
  const many = []; for(let y = 0; y < MAX_RUNS + 5; y++) many.push(0, y * 2);   // more rows than runs we draw
  ok('too big to draw -> marker instead of a slow map', shapeOf({ id:'c', lat:1, lng:2, cells:Int32Array.from(many) }).kind === 'marker');
  ok('nothing -> nothing', shapeOf(null) === null);
}

// ---- state machine ----
const rig = () => { const log = []; const h = createHighlighter({ show:(s, it) => log.push('show:' + keyOf(it)), hide:() => log.push('hide'), focus:(s, it) => log.push('focus:' + keyOf(it)) }); return { h, log }; };
const A = { id:'A', lat:1, lng:1 }, B = { id:'B', lat:2, lng:2 }, C = { id:'C', lat:3, lng:3 };
{ const { h, log } = rig();
  h.enter(A); ok('1 mouseenter highlights the row\'s area', log.join() === 'show:A');
  h.leave(A); ok('2 mouseleave removes the temporary highlight', log.join() === 'show:A,hide' && h.shown === null); }
{ const { h, log } = rig();
  h.enter(A); h.enter(B); h.leave(A); h.enter(C); h.leave(B); h.leave(C);
  ok('8 fast moves A->B->C: only the row under the cursor is lit, a late leave of an older row does not remove the newer one', log.join() === 'show:A,show:B,show:C,hide', log.join()); }
{ const { h, log } = rig();
  h.enter(A); h.enter(A); h.enter(A); ok('8 repeated enter of the same row draws once', log.join() === 'show:A'); }
{ const { h, log } = rig();
  h.pin(B); ok('3/4 tap on the name: map moves there and the place stays lit', log.join() === 'focus:B,show:B');
  h.enter(A); h.leave(A); ok('3 hovering another row and leaving returns to the pinned place', log.join() === 'focus:B,show:B,show:A,show:B', log.join());
  h.pin(C); ok('3 tapping another name moves on', log.slice(-2).join() === 'focus:C,show:C'); }
{ const { h, log } = rig();
  h.enter(A); h.refresh([A, B]); ok('8 list redrawn while the cursor is on a row that still exists: highlight stays, no flicker', log.join() === 'show:A');
  h.refresh([{ ...A }, B]); ok('8 same place ranked anew (new object, same id): no redraw', log.join() === 'show:A');
  h.refresh([B, C]); ok('8 the suggestion disappeared (added / re-ranked away): highlight is removed', log.join() === 'show:A,hide' && h.shown === null);
  h.leave(A); ok('8 a leave that comes after the row is gone is harmless', log.join() === 'show:A,hide'); }
{ const { h, log } = rig();
  h.pin(A); h.refresh([B]); ok('7 after adding a village the pinned suggestion is gone from the list: highlight cleared', h.shown === null && log.at(-1) === 'hide');
  h.pin(B); h.clear(); ok('7 clear() (add / new start) removes everything', h.shown === null); h.refresh([B]); ok('7 and a later refresh does not bring it back', h.shown === null); }
{ const { h, log } = rig(); h.enter(null); h.enter({}); h.leave(undefined); h.pin(undefined); ok('8 no item / item without id or position -> nothing happens', log.length === 0, log.join()); }
{ const { h, log } = rig(); h.enter({ lat:5, lng:6 }); ok('8 an item without id is keyed by its position', log.length === 1); }

// ---- no change of the order; real data without network ----
const dir = new URL('../admin/zensus/', import.meta.url).pathname; let fetches = 0;
const fetcher = async u => { fetches++; const p = dir + u.split('/').pop(); return existsSync(p) ? { ok:true, status:200, arrayBuffer:async () => new Uint8Array(readFileSync(p)).buffer } : { ok:false, status:404 }; };
for(const [name, st] of Object.entries({ Weidenberg:{ lat:49.9424, lng:11.7290 }, Eisfeld:{ lat:50.4215, lng:10.9105 } })){
  const places = await censusPlaces(st.lat, st.lng, 18000, { fetcher }), list = rankSuggestions(places, { start:st, missing:8000 }), n0 = fetches;
  const side = Object.freeze([]), before = JSON.stringify(list), { h } = rig();
  const shapes = list.slice(0, 10).map(x => shapeOf(x));
  ok(`[real] ${name}: every shown suggestion has a drawable area from the census cells (no extra request)`, shapes.every(s => s.kind === 'cells') && fetches === n0, shapes.map(s => s.rects.length).join(','));
  const x = list.find(v => v.small), sh = shapeOf(x), c = x.cells, minLa = Math.min(...sh.rects.flat().map(p => p[0])), maxLa = Math.max(...sh.rects.flat().map(p => p[0])), minLo = Math.min(...sh.rects.flat().map(p => p[1])), maxLo = Math.max(...sh.rects.flat().map(p => p[1]));
  ok(`[real] ${name}: the area surrounds the suggestion's point and is village-sized`, x.lat >= minLa && x.lat <= maxLa && x.lng >= minLo && x.lng <= maxLo && hav(minLa, minLo, maxLa, maxLo) < 4000, Math.round(hav(minLa, minLo, maxLa, maxLo)) + ' m diagonal, ' + c.length / 2 + ' cells');
  const cover = new Set(); for(const [y, x0, x1] of cellRuns(c)) for(let q = x0; q <= x1; q++) cover.add(q + ',' + y);
  ok(`[real] ${name}: the runs cover exactly the cluster's cells`, cover.size === c.length / 2);
  // hover / pin / leave over all rows leaves the order, the list and the ranking untouched
  const hh = createHighlighter({ show() {}, hide() {}, focus() {} }); list.forEach(v => { hh.enter(v); hh.leave(v); }); hh.pin(list[0]); hh.refresh(list.slice(1)); hh.clear();
  ok(`[real] ${name}: hovering/focusing changes neither the suggestions nor the order (side stays empty)`, side.length === 0 && JSON.stringify(list) === before && JSON.stringify(rankSuggestions(places, { start:st, side, missing:8000 })) === before);
  const pick = list.find(v => v.small && v.km >= 4), s2 = addSuggestion([], pick, 'Dorf'), l2 = rankSuggestions(places, { start:st, side:s2, missing:8000 });
  const g = createHighlighter({ show() {}, hide() {}, focus() {} }); g.enter(pick); g.refresh(l2);
  ok(`[real] ${name}: after adding the village its highlight is dropped on refresh; the new list still has drawable areas`, g.shown === null && l2.slice(0, 10).every(v => shapeOf(v).kind === 'cells'));
}

// ---- full chain: censusPlaces -> suggestionFlow (rankSuggestions) -> state.list (= d.sugT.list) -> highlighter -> shape handed to the map ----
for(const [name, st] of Object.entries({ Weidenberg:{ lat:49.9424, lng:11.7290 }, Eisfeld:{ lat:50.4215, lng:10.9105 } })){
  const drawn = []; let state = null;
  const flow = suggestionFlow({ load:(s, km) => censusPlaces(s.lat, s.lng, (km + 3) * 1000, { fetcher }), onUpdate:x => { state = x; } });   // exactly how admin.js builds it (real loader, real census files)
  const h = createHighlighter({ show:(shape, item) => drawn.push({ shape, item }), hide() {}, focus(shape) { drawn.push({ focus:shape }); } });
  const r = await flow.refresh({ start:st, side:[], maxKm:15, missing:8000 });
  const vis = r.list.slice(0, r.shown);   // what the sheet renders and binds the hover to (d.sugT.list.slice(0, shown))
  ok(`[chain] ${name}: the list of the flow's state keeps the census cells on every item`, r.list.length > 20 && r.list.every(x => x.cells && x.cells.length >= 2), r.list.length + ' items');
  vis.forEach(x => h.enter(x)); h.leave(vis.at(-1));
  ok(`[chain] ${name}: hovering every shown row hands an AREA (not a marker) to the map`, drawn.length === vis.length && drawn.every(d => d.shape.kind === 'cells' && d.shape.rects.length > 0), drawn.length + ' hovers');
  nameShown_(r);   // names arrive later and mutate the items: the geometry stays
  function nameShown_(x){ x.list.forEach((it, i) => { if(i < 3) it.name = 'Name ' + i; }); }
  drawn.length = 0; h.leave(vis[0]); h.enter(vis[0]); h.pin(vis[1]);
  ok(`[chain] ${name}: still an area after the geocoder named the places, and for the click-to-focus`, drawn.filter(d => d.shape).every(d => d.shape.kind === 'cells') && drawn.some(d => d.focus && d.focus.kind === 'cells'));
  flow.more(); const more = state.list.slice(0, state.shown);
  ok(`[chain] ${name}: "show more" items (same list, no new load) are drawable too`, more.length > vis.length && more.every(x => shapeOf(x).kind === 'cells'));
  const side = addSuggestion([], vis[3], 'Dorf'), r2 = await flow.refresh({ start:st, side, maxKm:15, missing:8000 });
  ok(`[chain] ${name}: after adding a place the re-ranked list (new state) still carries the cells`, r2 !== r && r2.list.slice(0, r2.shown).every(x => shapeOf(x).kind === 'cells') && !r2.list.some(x => x.id === vis[3].id));
  ok(`[chain] ${name}: cells are not part of the item's serialised data (no huge JSON in drafts/logs)`, !JSON.stringify(r.list[0]).includes('cells'));
}

// ---- geocoder names: bounded, no endless requests (nameShown) ----
{ const mk = n => ({ list:Array.from({ length:n }, (_, i) => ({ id:'p' + i, lat:i, lng:i, households:100 })), shown:n, loading:false });
  const run = async (resolve, st, mem = { cache:new Map(), tries:new Map() }, extra = {}) => { let calls = 0, waits = 0; await nameShown(st, { resolve:async x => { calls++; return resolve(x); }, ...mem, wait:async () => { waits++; }, ...extra }); return { calls, waits, mem }; };
  let st = mk(5), r = await run(() => null, st);
  ok('[names] a geocoder that always answers nothing: ends, max 2 lookups per place', r.calls === 10 && st.naming === false && st.list.every(x => !x.name), r.calls + ' calls for 5 places');
  const again = await run(() => null, st, r.mem); ok('[names] a second pass (e.g. re-render, "show more") does not ask again for places that already failed twice', again.calls === 0);
  st = mk(3); r = await run(() => { throw new Error('429'); }, st); ok('[names] a geocoder that always throws: same limit, no unhandled error, waits between the two tries', r.calls === 6 && r.waits === 3 && st.naming === false);
  st = mk(2); let n = 0; r = await run(x => ++n === 1 ? null : 'Ort ' + x.id, st); ok('[names] one empty answer is retried once and then works', st.list.every(x => x.name) && r.calls === 3, st.list.map(x => x.name).join());
  st = mk(4); r = await run(x => 'N' + x.id, st); const again2 = await run(() => 'x', mk(4), r.mem);
  ok('[names] remembered names are reused without any request', again2.calls === 0 && r.calls === 4);
  st = mk(3); let cur = true; r = await run(() => { cur = false; return null; }, st, undefined, { isCurrent:() => cur });
  ok('[names] the list was replaced meanwhile: stops at once', r.calls === 1 && st.naming === false);
  st = mk(2); st.shown = 1; r = await run(() => null, st, undefined); st.shown = 2; const r2 = await run(() => null, st, r.mem);
  ok('[names] "show more" names only the places that were never tried (the failed one is not asked again)', r.calls === 2 && r2.calls === 2);
  st = mk(4); st.shown = 2; let seen = 0; const mem = { cache:new Map(), tries:new Map() };
  await nameShown(st, { resolve:async x => { seen++; if(seen === 1) st.shown = 4; return null; }, ...mem, wait:async () => {} });
  ok('[names] "show more" pressed DURING naming: the new places are done in the same run, still bounded', seen === 8 && st.naming === false, seen + ' calls'); }
console.log(fail ? fail + ' FAILED' : 'all ok'); process.exit(fail ? 1 : 0);
