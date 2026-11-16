// Phase 1 (16.11.2026): "Hauptort zuerst – Erweiterung nur nach Bestätigung".
// New orders are planned for the main place and for the places the admin chose. When the mailboxes are not enough, the app
// only SUGGESTS more places (census, townsAround); a suggestion becomes part of the order only when the admin adds it.
// Pure functions here (no DOM, no network) so they can be tested in Node: test/expand.mjs.

import { laea } from './zensus.js';

// how much of the wanted flyers the current plan covers (estimates from the planner; never negative, never filled up)
export function coverage(want, mailboxes){
  const w = Math.max(0, Math.round(+want || 0)), have = Math.max(0, Math.round(+mailboxes || 0));
  if(!isFinite(have) || !w) return { want:w, have, missing:0, ok:true, pct:100 };
  const missing = Math.max(0, w - have);
  return { want:w, have, missing, ok:have >= w * 0.95, pct:Math.min(100, Math.round(have / w * 100)) };
}

const hav = (a, b, c, d) => { const R = 6371000, r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };

// ---- Suggestions (Phase 2A, 16.11.2026: small villages, dynamic search) -----------------------------------------------------
// Input: census places (zensus.censusPlaces: 100 m cell clusters, small villages included, each with a stable `id` and its cells)
// found ONCE around the original start (radius = max distance + a margin). Nothing is searched again when the admin adds a place:
// the same list is only ranked anew, now measured from the start AND from every confirmed place, so the surroundings of a
// confirmed place surface. The global limit (maxKm, straight line from the ORIGINAL start) is never relaxed by a confirmed place.
// All distances are straight lines. Nothing here changes `side`; only addSuggestion() (admin click) does.
export const PAGE = 10, MAX_LIST = 60, MAX_KM = 15, LOCAL_KM = 4, SMALL_HH = 150;

const cellDist = (cells, px, py) => { let d = Infinity; for(let i = 0; i < cells.length; i += 2){ const e = Math.hypot(cells[i] * 100 + 50 - px, cells[i + 1] * 100 + 50 - py); if(e < d) d = e; } return d; };
const edgeDist = (a, b) => { let d = Infinity; for(let i = 0; i < a.length; i += 2) for(let j = 0; j < b.length; j += 2){ const e = Math.hypot(a[i] - b[j], a[i + 1] - b[j + 1]) * 100; if(e < d) d = e; } return d; };

// The built-up area a confirmed point (start or confirmed place) belongs to: an area with a cell within 150 m of the point (the
// largest if several), else the largest area with a cell within 1 km (a start in an industrial estate still has its town).
// Geometry, not name or centre distance: two villages 1.2 km apart are two areas, one town found twice is one.
export function anchorArea(places, pt){
  if(!pt || pt.lat == null) return null;
  const [x, y] = laea(pt.lat, pt.lng); let best = null;
  for(const tier of [150, 1000]){
    for(const c of places || []){ if(!c.cells || !c.cells.length) continue; if(Math.abs(c.x - x) > 60000) continue; const d = cellDist(c.cells, x, y); if(d <= tier && (!best || c.households > best.households)) best = c; }
    if(best) return best;
  }
  return null;
}

// the same place found from two search centres (or twice in one list) once; no id (old/synthetic data) -> within 500 m
export function mergePlaces(...lists){
  const out = [], byId = new Map();
  for(const c of lists.flat()){
    if(!c || !isFinite(c.lat) || !isFinite(c.lng)) continue;
    if(c.id){ const o = byId.get(c.id); if(o){ if(c.households > o.households) Object.assign(o, c); continue; } byId.set(c.id, c); out.push(c); continue; }
    if(out.some(o => !o.id && hav(o.lat, o.lng, c.lat, c.lng) < 500)) continue;
    out.push(c);
  }
  return out;
}

// Ranked suggestions. towns = census places (censusPlaces); start = the ORIGINAL start; side = confirmed places.
// Excluded: places of the start's own area and of every confirmed place (same cell area, or – without cell data – within 1.5 km of
// a confirmed point), places beyond maxKm straight line from the start, duplicates. Not excluded: small villages, villages next to
// big towns, districts only 300 m beyond a confirmed area (those get `adjacent`, the plan may already contain them).
// Order: nearness to the start or to the nearest confirmed place first (halves every ~3 km), then what the place can take of the
// missing flyers, a little compactness. The first `page` entries reserve room for the surroundings of each confirmed place
// and for small villages, so neither a big town nor the start's own neighbourhood pushes them off the first screen.
export function rankSuggestions(towns, { start, side = [], missing = 0, max = MAX_LIST, maxKm = MAX_KM, localKm = LOCAL_KM, page = PAGE } = {}){
  const all = mergePlaces(towns || []);
  const anchors = [{ pt:start, name:null }, ...side.map(x => ({ pt:x, name:x.name }))].filter(a => a.pt && a.pt.lat != null).map(a => ({ ...a, area:anchorArea(all, a.pt) }));
  const ownIds = new Set(anchors.filter(a => a.area).map(a => a.area.id));
  const toStart = c => start ? hav(start.lat, start.lng, c.lat, c.lng) : (c.dist != null ? c.dist : 0);
  const gapOf = (c, a) => { // metres from the place to an anchor: its edge when the cells are known, else the point
    if(a.area && a.area.cells && c.cells){ const d0 = cellDist(a.area.cells, c.x, c.y); return d0 < 2500 ? edgeDist(c.cells, a.area.cells) : d0; }
    if(a.area && a.area.cells && c.x != null) return cellDist(a.area.cells, c.x, c.y);
    return hav(a.pt.lat, a.pt.lng, c.lat, c.lng); };
  const need = Math.max(300, missing || 0);
  let list = all.filter(c => c.households > 0 && toStart(c) <= maxKm * 1000 && !(c.id && ownIds.has(c.id)));
  // no cell data (synthetic / old): the old rule – not within 2 km of the start or 1.5 km of a confirmed place
  list = list.filter(c => c.id ? true : !anchors.some(a => hav(a.pt.lat, a.pt.lng, c.lat, c.lng) < (a.name == null ? 2000 : 1500)));
  list = list.map(c => {
    const gaps = anchors.map(a => gapOf(c, a)), gi = gaps.indexOf(Math.min(...gaps)), gap = gaps[gi], km = toStart(c) / 1000;
    const take = Math.min(1, c.households / need), dense = c.dense || 0;
    const score = Math.exp(-gap / 3000) * (0.75 + 0.25 * Math.exp(-km / maxKm)) * (0.45 + 0.55 * Math.sqrt(take)) * (0.9 + 0.1 * dense / (dense + 200)) * (gap < 500 ? 0.5 : 1);   // an area right beside a confirmed one may already be in its plan: shown, but not first
    return { c, gaps, gap, gi, km, score };
  }).sort((a, b) => b.score - a.score);
  // the first screen: reserved room, then by score
  const first = new Set(), take = (r, n) => { for(const x of r){ if(n <= 0 || first.size >= page) break; if(!first.has(x)){ first.add(x); n--; } } };
  anchors.map((a, k) => k).filter(k => k > 0).reverse().slice(0, 3).forEach(k => take(list.filter(x => x.gaps[k] <= localKm * 1000), 2));   // surroundings of confirmed places, newest first
  take(list.filter(x => x.c.households < SMALL_HH), 3);                                                                                    // small villages
  take(list, page);
  const ordered = [...list.filter(x => first.has(x)), ...list.filter(x => !first.has(x))].slice(0, max);
  const out = ordered.map(x => ({
    id:x.c.id || null, lat:x.c.lat, lng:x.c.lng, households:x.c.households, km:Math.round(x.km * 10) / 10, dense:x.c.dense || null,
    gapKm:Math.round(x.gap / 100) / 10, gapTo:anchors[x.gi].name, small:x.c.households < SMALL_HH, adjacent:x.gap < 500,
  })).map((o, i) => Object.defineProperty(o, 'cells', { value:ordered[i].c.cells, enumerable:false }));   // the census cells of the area (for the map highlight): shared, not copied, not part of the item's data
  // within the first screen: sorted by score again (reservations only decide who is on it)
  const n = Math.min(page, out.length), idx = new Map(ordered.map((x, i) => [i, x.score]));
  const head = out.slice(0, n).map((o, i) => ({ o, s:idx.get(i) })).sort((a, b) => b.s - a.s).map(z => z.o);
  return [...head, ...out.slice(n)];
}

// the admin adds a suggestion: it becomes a confirmed Nebenstadt (same shape as before, so the planner treats it as before).
// Returns the new side list, or the old one when this place is already there (double click). Same place = same census area (cid)
// or within 300 m – two villages 1 km apart can both be added.
export function addSuggestion(side, s, name){
  if((side || []).some(x => x.lat != null && ((s.id && x.cid === s.id) || hav(x.lat, x.lng, s.lat, s.lng) < 300))) return side;
  const used = new Set((side || []).map(x => x.name)); let nm = name || 'Ort'; for(let j = 2; used.has(nm); j++) nm = (name || 'Ort') + ' (' + j + ')';
  return [...(side || []), { name:nm, lat:s.lat, lng:s.lng, p:null, flyers:s.households, km:s.km, auto:true, confirmed:true, ...(s.id ? { cid:s.id } : {}) }];
}

// ---- the flow around the suggestions (async safety) -------------------------------------------------------------------------
// One census window per (start, maxKm); ranking is synchronous and repeated whenever the confirmed places change. Every result
// is checked against the newest request: a start change, an added or removed place, a new radius or a second click while an
// older search is still running drop the older result. load(start, maxKm) -> places (the only network/CPU part).
export const sugKey = ({ start, side = [], maxKm = MAX_KM }) => startKey(start) + '|' + maxKm + '|' + side.map(x => (x.cid || x.name) + '@' + (+x.lat).toFixed(4) + ',' + (+x.lng).toFixed(4)).join(';');
export function suggestionFlow({ load, onUpdate = () => {} }){
  let seq = 0, pool = null, state = null;
  return {
    get state(){ return state; },
    // the start changed: forget the window and the list
    reset(){ seq++; pool = null; state = null; },
    // a place was added/removed or the radius changed: older searches are dropped, the window stays (no new download)
    invalidate(){ seq++; },
    more(n = PAGE){ if(state && !state.loading){ state.shown = Math.min(state.list.length, state.shown + n); onUpdate(state); } },
    async refresh(ctx){
      const key = sugKey(ctx); if(state && state.key === key && !state.failed) return state;
      const my = ++seq, pk = startKey(ctx.start) + '|' + (ctx.maxKm || MAX_KM);
      state = { key, loading:true, list:[], shown:PAGE, total:0 }; onUpdate(state);
      if(!pool || pool.pk !== pk){ const p = { pk, promise:Promise.resolve().then(() => load(ctx.start, ctx.maxKm || MAX_KM)) }; p.promise.catch(() => { if(pool === p) pool = null; }); pool = p; }
      let towns; try{ towns = await pool.promise; }catch{ towns = null; }
      if(my !== seq) return null;                                   // outdated: another request or a reset came meanwhile
      if(!towns){ state = { key, loading:false, failed:true, list:[], shown:PAGE, total:0 }; onUpdate(state); return state; }
      const list = rankSuggestions(towns, { start:ctx.start, side:ctx.side, missing:ctx.missing, maxKm:ctx.maxKm || MAX_KM });
      state = { key, loading:false, list, shown:Math.min(PAGE, list.length), total:list.length, hh:list.reduce((a, x) => a + x.households, 0) }; onUpdate(state); return state;
    },
  };
}

// key of a start point: suggestions found for another start are thrown away
export const startKey = st => st ? st.lat.toFixed(5) + ',' + st.lng.toFixed(5) : '';

// the places of an order lie apart (more than ~3 km between the start and a place): the admin should check how people get there
export const placesApart = (start, side) => !!(start && (side || []).some(x => x.lat != null && hav(start.lat, start.lng, x.lat, x.lng) > 3000));
