// Phase 2A (map link): list of suggested places <-> map. Pure functions + a small state machine (no DOM, no Leaflet, no network),
// so it can be tested in Node: test/sugmap.mjs. admin.js draws what this decides.
// The shape of a suggestion is NOT an administrative border: it is the cluster of populated 100 m Zensus cells that censusPlaces()
// already found (rows of cells merged into rectangles). Without cells (old / synthetic data) or when it is too big to draw, a marker.
import { unlaea } from './zensus.js';
export const MAX_RUNS = 1500;

// cells = flat [cx, cy, …] -> runs [cy, x0, x1] (neighbouring cells of one row merged)
export function cellRuns(cells){
  const rows = new Map();
  for(let i = 0; i < cells.length; i += 2){ const y = cells[i + 1]; (rows.get(y) || rows.set(y, []).get(y)).push(cells[i]); }
  const out = [];
  for(const [y, xs] of rows){ xs.sort((a, b) => a - b); let a = xs[0], b = a; for(let i = 1; i <= xs.length; i++){ if(i < xs.length && xs[i] === b + 1){ b = xs[i]; continue; } out.push([y, a, b]); a = b = xs[i]; } }
  return out;
}
export const keyOf = x => x && (x.id || x.lat != null && x.lng != null) ? (x.id || x.lat + ',' + x.lng) : null;
const cache = new WeakMap();   // item -> shape: computed once, on first hover
// { kind:'cells', approx:true, rects:[[[lat,lng] ×4], …] } or { kind:'marker', lat, lng }
export function shapeOf(item){
  if(!item) return null; if(cache.has(item)) return cache.get(item);
  let s = { kind:'marker', lat:item.lat, lng:item.lng };
  if(item.cells && item.cells.length){
    const runs = cellRuns(item.cells);
    if(runs.length <= MAX_RUNS) s = { kind:'cells', approx:true, lat:item.lat, lng:item.lng, rects:runs.map(([y, x0, x1]) => [unlaea(x0 * 100, y * 100), unlaea((x1 + 1) * 100, y * 100), unlaea((x1 + 1) * 100, (y + 1) * 100), unlaea(x0 * 100, (y + 1) * 100)]) };
  }
  cache.set(item, s); return s;
}

// What is highlighted: the hovered row, else the place the admin tapped ("pinned"). show(shape, item) / hide() draw; focus(shape, item)
// moves the map. Never touches the order. refresh(items) is called after every redraw of the list.
export function createHighlighter({ show, hide, focus }){
  let hover = null, pinned = null, shown = null, shownItem = null; const items = new Map();
  const sync = () => {
    const k = hover != null ? hover : pinned;
    if(k === shown && (k == null || items.has(k))) return;   // same place (the list may have been ranked anew: same id = same cells) -> no redraw
    shown = k; shownItem = k != null ? items.get(k) : null;
    if(shownItem) show(shapeOf(shownItem), shownItem); else { shown = null; hide(); }
  };
  return {
    get shown(){ return shown; },
    enter(item){ const k = keyOf(item); if(k == null) return; items.set(k, item); hover = k; sync(); },
    leave(item){ const k = keyOf(item); if(k != null && hover === k){ hover = null; sync(); } },   // a late "leave" of an older row does not remove the newer highlight
    pin(item){ const k = keyOf(item); if(k == null) return; items.set(k, item); pinned = k; focus(shapeOf(item), item); sync(); },
    // the list was drawn again: rows that are gone lose their highlight; rows that are still there keep it (the cursor may still be on them)
    refresh(list){
      const now = new Map((list || []).map(x => [keyOf(x), x]));
      if(hover != null && !now.has(hover)) hover = null; if(pinned != null && !now.has(pinned)) pinned = null;
      items.clear(); for(const [k, x] of now) items.set(k, x);
      sync();
    },
    clear(){ hover = pinned = null; items.clear(); sync(); },
  };
}
