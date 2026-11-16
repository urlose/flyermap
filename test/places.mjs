// Phase 2A "dynamic villages": detection of small places, ranking around confirmed places, duplicates, async safety.
// Part 1 uses SYNTHETIC census cells (invented villages on a grid) – marked [synthetic]. Part 2 uses the REAL Zensus 2022 files in
// admin/zensus (Weidenberg 49.9424/11.7290 and Eisfeld 50.4215/10.9105) – marked [real]. No network. Run: node test/places.mjs
import { readFileSync, existsSync } from 'node:fs';
import { clusterCells, censusPlaces, laea, unlaea } from '../worker/src/zensus.js';
import { rankSuggestions, mergePlaces, addSuggestion, anchorArea, suggestionFlow, sugKey, PAGE } from '../worker/src/expand.js';
let fail = 0; const ok = (name, c, info) => { console.log((c ? 'ok   ' : 'FAIL ') + name + (info != null ? '  ' + info : '')); if(!c) fail++; };
const hav = (a, b, c, d) => { const R = 6371000, r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };

// ---------- Part 1: synthetic cells ----------
// a village = a w×h block of 100 m cells with `hh` households per cell, lower-left corner at metres (mx, my) from an origin
const O = laea(49.9424, 11.7290).map(v => Math.floor(v / 100) * 100);
function world(villages){
  const H = new Map(); for(const v of villages) for(let i = 0; i < v.w; i++) for(let j = 0; j < v.h; j++) H.set((O[0] / 100 + Math.round(v.x / 100) + i) + ',' + (O[1] / 100 + Math.round(v.y / 100) + j), v.hh);
  return H;
}
const toPlaces = (H, minH = 50) => clusterCells(H).filter(c => c.households >= minH).map(c => { const [la, lo] = unlaea(c.x, c.y); return { id:c.id, lat:la, lng:lo, households:c.households, n:c.n, dense:Math.round(c.households / c.n * 100), x:c.x, y:c.y, cells:c.cells }; });
const START = { lat:49.9424, lng:11.7290 };
const V = [
  { name:'Hauptort', x:-400, y:-400, w:8, h:8, hh:12 },          // 768 hh around the start
  { name:'Dorf A', x:4000, y:0, w:5, h:5, hh:4 },                // 100 hh, 4 km east
  { name:'Dorf B', x:5300, y:0, w:5, h:5, hh:4 },                // 100 hh, 1.3 km beyond A: 800 m of fields between (different village)
  { name:'Weiler', x:2500, y:2500, w:3, h:3, hh:4 },             // 36 hh -> below 50, never a candidate
  { name:'Kleinstadt', x:6000, y:-6000, w:20, h:20, hh:8 },     // 3200 hh, ~8.5 km south-east
  { name:'Ortsteil neben A', x:4000, y:800, w:4, h:3, hh:5 },   // 60 hh, 300 m north of A (gap 3 cells -> own area)
  { name:'Dorf C', x:8200, y:600, w:5, h:5, hh:4 },              // 100 hh, 3.2 km beyond B (found from B, 8.2 km from the start)
  { name:'zu weit', x:17000, y:0, w:6, h:6, hh:6 },              // 216 hh, 17 km away: outside the global limit
];
const H = world(V), pl = toPlaces(H), at = n => { const v = V.find(x => x.name === n); return pl.find(p => { const [px, py] = [p.x, p.y]; return px >= O[0] + v.x && px <= O[0] + v.x + v.w * 100 && py >= O[1] + v.y && py <= O[1] + v.y + v.h * 100; }); };
const near = (c, n) => c && at(n) && c.id === at(n).id;
{ const c = clusterCells(H); ok('[synthetic] every village is its own area (8 villages -> 8 areas)', c.length === V.length, String(c.length));
  ok('[synthetic] A and B (800 m of fields) are two places, the district 300 m from A a third', at('Dorf A') && at('Dorf B') && at('Dorf A').id !== at('Dorf B').id && at('Ortsteil neben A') && at('Ortsteil neben A').id !== at('Dorf A').id);
  ok('[synthetic] a hamlet of 36 households is below the detection limit (50)', !at('Weiler')); }

// 1/2 — small places appear; a big town does not push all of them out
{ const l = rankSuggestions(pl, { start:START, missing:8000 });
  ok('1 small villages (< 150 households) are suggested', l.filter(x => x.small).length >= 3, l.filter(x => x.small).length + ' small of ' + l.length);
  ok('2 the big town is there too, but the small villages are not displaced', l.some(x => x.households >= 3000) && l.slice(0, PAGE).filter(x => x.small).length >= 3);
  const only = rankSuggestions([...pl.filter(p => p.households < 150), pl.find(p => p.households > 3000)], { start:START, missing:8000, page:3 });
  ok('2 with a page of 3 and one big town available, small villages still take places', only.slice(0, 3).filter(x => x.small).length >= 2, only.slice(0, 3).map(x => x.households).join(','));
}
// 3 — adding a place brings new places from ITS surroundings; 4/11 nothing changes by itself
{ const side0 = [], before = rankSuggestions(pl, { start:START, side:side0, missing:8000, page:3 });
  ok('4/11 ranking leaves side untouched (no automatic add)', side0.length === 0 && JSON.stringify(side0) === '[]');
  const b = before.find(x => near(x, 'Dorf B')) || before.find(x => x.km > 4), side = addSuggestion(side0, b, 'B');
  const after = rankSuggestions(pl, { start:START, side, missing:8000, page:3 });
  const first = after.slice(0, 3);
  ok('3 after adding B the first screen contains places right around B (Dorf C, 3 km from B)', first.some(x => near(x, 'Dorf C') && x.gapTo === 'B' && x.gapKm <= 4), first.map(x => x.households + 'hh/' + x.gapKm + 'km→' + x.gapTo).join(' | '));
  ok('3 Dorf C was not on the first screen before', !before.slice(0, 3).some(x => near(x, 'Dorf C')));
  ok('4 without adding, the same input gives the same list', JSON.stringify(rankSuggestions(pl, { start:START, side:side0, missing:8000, page:3 })) === JSON.stringify(before));
  // 6 — confirmed places are not suggested again (by area, not by centre distance)
  ok('6 the confirmed place itself is not suggested again', !after.some(x => near(x, 'Dorf B')));
  const sideShift = [{ name:'B', lat:b.lat + 0.002, lng:b.lng + 0.002 }];   // the admin point lies ~250 m beside the area's centre, still inside the same built-up area
  ok('6 same area through another point (search field instead of the suggestion): excluded', !rankSuggestions(pl, { start:START, side:sideShift, missing:8000 }).some(x => near(x, 'Dorf B')));
  ok('6 the start\'s own area is not suggested', !rankSuggestions(pl, { start:START, missing:8000 }).some(x => near(x, 'Hauptort')));
  // 10 — removing the place gives the old list back
  ok('10 removing B restores the list without it', JSON.stringify(rankSuggestions(pl, { start:START, side:side.filter(x => x.name !== 'B'), missing:8000, page:3 })) === JSON.stringify(before));
}
// 5 — the global limit: a confirmed place far out does not extend the search beyond maxKm from the ORIGINAL start
{ const ks = pl.find(p => p.households > 3000), far = { name:'Kleinstadt', lat:ks.lat, lng:ks.lng, cid:ks.id };
  const l = rankSuggestions(pl, { start:START, side:[far], missing:8000, maxKm:15 });
  ok('5 nothing beyond 15 km from the start, although a place at 8.5 km is confirmed', l.every(x => x.km <= 15) && !l.some(x => near(x, 'zu weit')));
  ok('5 raising the limit to 20 km shows it (a deliberate choice)', rankSuggestions(pl, { start:START, side:[far], missing:8000, maxKm:20 }).some(x => near(x, 'zu weit')));
  ok('5 a small limit (5 km) keeps only near places', rankSuggestions(pl, { start:START, missing:8000, maxKm:5 }).every(x => x.km <= 5)); }
// 7 — close but different villages stay different; both can be added (the old 1.5 km rule blocked the second)
{ const a = at('Dorf A'), b = at('Dorf B'), d = hav(a.lat, a.lng, b.lat, b.lng);
  const l = rankSuggestions(pl, { start:START, missing:8000, maxKm:15 });
  ok('7 villages ' + Math.round(d) + ' m apart are two suggestions', l.some(x => near(x, 'Dorf A')) && l.some(x => near(x, 'Dorf B')));
  const sa = l.find(x => near(x, 'Dorf A')), sb = l.find(x => near(x, 'Dorf B'));
  let side = addSuggestion([], sa, 'A'); side = addSuggestion(side, sb, 'B');
  ok('7 both can be added; adding A twice still adds it once', side.length === 2 && addSuggestion(side, sa, 'A') === side); }
{ const l = rankSuggestions(pl, { start:START, missing:8000 }), ot = l.find(x => near(x, 'Ortsteil neben A'));
  ok('7 a district 300 m beside a village is its own suggestion, flagged as adjacent when beside a confirmed area', !!ot);
  const side = addSuggestion([], l.find(x => near(x, 'Dorf A')), 'A'), l2 = rankSuggestions(pl, { start:START, side, missing:8000 }), ot2 = l2.find(x => near(x, 'Ortsteil neben A'));
  ok('7 after adding A, the district beside it is marked "adjacent" (may already be in the plan)', ot2 && ot2.adjacent === true, ot2 && ot2.gapKm + ' km'); }
// 8 — identical candidates from two search windows are merged
{ const w1 = pl, w2 = pl.filter(p => p.households < 3000).map(p => ({ ...p, dist:0 })), m = mergePlaces(w1, w2);
  ok('8 the same areas from two searches count once', m.length === pl.length, m.length + ' of ' + (w1.length + w2.length));
  ok('8 without ids (old data): within 500 m is one place, 1 km apart are two', mergePlaces([{ lat:49.9, lng:11.7 }, { lat:49.9020, lng:11.7 }]).length === 1 && mergePlaces([{ lat:49.9, lng:11.7 }, { lat:49.9090, lng:11.7 }]).length === 2); }
// 9/10 — async safety of the flow
{ const log = []; let release = []; const load = (st, km) => new Promise(res => release.push(() => res(pl)));
  const flow = suggestionFlow({ load, onUpdate:s => log.push(s.loading ? 'loading' : 'list:' + s.list.length) });
  const p1 = flow.refresh({ start:START, side:[], maxKm:15, missing:8000 });
  const side = [{ name:'A', lat:at('Dorf A').lat, lng:at('Dorf A').lng }];
  const p2 = flow.refresh({ start:START, side, maxKm:15, missing:8000 });          // an add while the first search is running
  await new Promise(r => setTimeout(r, 5));
  ok('9 same window is not loaded twice for two quick requests', release.length === 1);
  release.forEach(r => r()); const [r1, r2] = await Promise.all([p1, p2]);
  ok('9 the older result is dropped, the newer one applies', r1 === null && r2 && r2.key === sugKey({ start:START, side, maxKm:15 }) && !r2.list.some(x => near(x, 'Dorf A')));
  flow.invalidate(); const p3 = flow.refresh({ start:START, side:[], maxKm:15, missing:8000 }); flow.reset();
  ok('9 a start change (reset) drops a running search', (await p3) === null && flow.state === null);
  const p4 = flow.refresh({ start:START, side:[], maxKm:10, missing:8000 }); await new Promise(r => setTimeout(r, 5)); release.splice(0).forEach(r => r()); const r4 = await p4;
  ok('9 a new radius loads a new window and applies', r4 && r4.list.every(x => x.km <= 10));
  const calls = release.length; const r5 = await flow.refresh({ start:START, side:[], maxKm:10, missing:8000 });
  ok('9 same request again: no new load, same state', r5 === r4 && release.length === calls);
  const r6 = await flow.refresh({ start:START, side, maxKm:10, missing:8000 });
  ok('10 adding/removing places only re-ranks (no new download)', release.length === calls && r6 !== r4 && !r6.list.some(x => near(x, 'Dorf A')));
  const failing = suggestionFlow({ load:() => Promise.reject(new Error('net')) }), rf = await failing.refresh({ start:START, side:[], maxKm:15 });
  ok('9 a failed load is shown as failed, not as "no places"', rf.failed === true && rf.list.length === 0);
  const more = suggestionFlow({ load:async () => pl }); const rm = await more.refresh({ start:START, side:[], maxKm:15, missing:8000 }); const n0 = rm.shown; more.more();
  ok('"show more" extends from the list that is already there', more.state.shown >= n0 && more.state.shown <= more.state.list.length && more.state.list.length === rm.list.length, n0 + ' -> ' + more.state.shown + ' of ' + rm.list.length); }

// ---------- Part 2: REAL Zensus 2022 data ----------
const dir = new URL('../admin/zensus/', import.meta.url).pathname;
const fetcher = async u => { const p = dir + u.split('/').pop(); return existsSync(p) ? { ok:true, status:200, arrayBuffer:async () => new Uint8Array(readFileSync(p)).buffer } : { ok:false, status:404 }; };
const REAL = { Weidenberg:{ lat:49.9424, lng:11.7290 }, Eisfeld:{ lat:50.4215, lng:10.9105 } };
const report = {};
for(const [name, st] of Object.entries(REAL)){
  const places = await censusPlaces(st.lat, st.lng, 18000, { fetcher });
  const list = rankSuggestions(places, { start:st, missing:8000 }), first = list.slice(0, PAGE);
  ok(`[real] ${name}: census places found`, places.length > 40, places.length + ' places >= 50 households within 18 km');
  const within = list.filter(x => x.km <= 15);
  ok(`[real] ${name}: small villages (< 150 households) among the suggestions, also on the first screen`, list.filter(x => x.small).length >= 10 && first.filter(x => x.small).length >= 3, list.filter(x => x.small).length + ' small of ' + list.length + '; first screen ' + first.filter(x => x.small).length);
  ok(`[real] ${name}: everything within 15 km (Luftlinie) of the start`, list.every(x => x.km <= 15) && within.length === list.length);
  // after adding a small village 4–8 km out, new places around it come up
  const pick = list.find(x => x.small && x.km >= 4 && x.km <= 8), side = addSuggestion([], pick, 'Dorf'), l2 = rankSuggestions(places, { start:st, side, missing:8000 });
  const newAround = l2.slice(0, PAGE).filter(x => x.gapTo === 'Dorf' && x.gapKm <= 4 && !first.some(f => f.id === x.id));
  ok(`[real] ${name}: after adding a village (${pick.households} hh, ${pick.km} km) new places around it appear on the first screen`, newAround.length >= 1, newAround.map(x => x.households + 'hh/' + x.gapKm + 'km').join(', '));
  ok(`[real] ${name}: the added village is not suggested again`, !l2.some(x => x.id === pick.id));
  ok(`[real] ${name}: raising nothing silently – still all within 15 km of the ORIGINAL start`, l2.every(x => x.km <= 15));
  // a second search from the village as centre finds the same places under the same ids (merge)
  const [vla, vlo] = [pick.lat, pick.lng], p2 = await censusPlaces(vla, vlo, 6000, { fetcher }), ids = new Set(places.map(p => p.id));
  const common = p2.filter(p => p.dist > 800 && p.dist < 4000), same = common.filter(p => ids.has(p.id));
  ok(`[real] ${name}: a second search centre finds the same areas under the same ids (merged to one)`, common.length > 3 && same.length >= common.length * 0.9 && mergePlaces(places, p2).length < places.length + p2.length, same.length + ' of ' + common.length + ' identical');
  report[name] = { places:places.length, suggestions:list.length, small:list.filter(x => x.small).length, first:first.map(x => `${x.households}hh ${x.km}km`), afterAdd:l2.slice(0, 6).map(x => `${x.households}hh ${x.km}km (${x.gapKm}km bis ${x.gapTo || 'Start'})`), added:`${pick.households}hh ${pick.km}km` };
}

// ---------- Nearest first ----------
{ const l = rankSuggestions(pl, { start:START, missing:8000 }), g = l.map(x => x.gapKm);
  ok('[synthetic] suggestions are sorted nearest first (distance to the nearest confirmed area, then to the start)', g.every((v, i) => i === 0 || v >= g[i - 1]) && l.length > 3, g.join(' <= '));
  const b = l.find(x => near(x, 'Dorf B')), side = addSuggestion([], b, 'B'), l2 = rankSuggestions(pl, { start:START, side, missing:8000 }), g2 = l2.map(x => x.gapKm);
  ok('[synthetic] after adding a place the list is nearest-first again, measured from the start AND the added place', g2.every((v, i) => i === 0 || v >= g2[i - 1]) && l2[0].gapKm <= 1.5, g2.join(' <= '));
  ok('[synthetic] a small village is not pushed behind a bigger, farther town (no size preference)', l.findIndex(x => x.small) < l.findIndex(x => x.households > 3000)); }
for(const [name, st] of Object.entries({ Weidenberg:{ lat:49.9424, lng:11.7290 }, Eisfeld:{ lat:50.4215, lng:10.9105 } })){
  const places = await censusPlaces(st.lat, st.lng, 18000, { fetcher }), l = rankSuggestions(places, { start:st, missing:8000 }), g = l.map(x => x.gapKm);
  ok(`[real] ${name}: all ${l.length} suggestions nearest first, first screen = the 10 nearest`, g.every((v, i) => i === 0 || v >= g[i - 1]) && g.slice(0, 10).every(v => v <= g[10]), g.slice(0, 12).join(','));
  const side = addSuggestion([], l.find(x => x.km >= 4), 'Dorf'), l2 = rankSuggestions(places, { start:st, side, missing:8000 }), g2 = l2.map(x => x.gapKm);
  ok(`[real] ${name}: after adding a village the list is nearest first from start and village`, g2.every((v, i) => i === 0 || v >= g2[i - 1]) && l2.every(x => x.km <= 15));
}
if(process.env.REPORT) console.log(JSON.stringify(report, null, 1));
console.log(fail ? fail + ' FAILED' : 'all ok'); process.exit(fail ? 1 : 0);
