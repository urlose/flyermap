// Phase 2A map link: list <-> map highlight (worker/src/sugmap.js). The state machine is tested with fake draw callbacks (no
// Leaflet/DOM); geometry with SYNTHETIC cells and with the REAL Zensus 2022 files (Weidenberg / Eisfeld, admin/zensus). Run: node test/sugmap.mjs
import { readFileSync, existsSync } from 'node:fs';
import { censusPlaces, clusterCells, laea, unlaea } from '../worker/src/zensus.js';
import { rankSuggestions, addSuggestion } from '../worker/src/expand.js';
import { cellRuns, shapeOf, createHighlighter, keyOf, MAX_RUNS } from '../worker/src/sugmap.js';
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
console.log(fail ? fail + ' FAILED' : 'all ok'); process.exit(fail ? 1 : 0);
