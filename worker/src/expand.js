// Phase 1 (16.11.2026): "Hauptort zuerst – Erweiterung nur nach Bestätigung".
// New orders are planned for the main place and for the places the admin chose. When the mailboxes are not enough, the app
// only SUGGESTS more places (census, townsAround); a suggestion becomes part of the order only when the admin adds it.
// Pure functions here (no DOM, no network) so they can be tested in Node: test/expand.mjs.

// how much of the wanted flyers the current plan covers (estimates from the planner; never negative, never filled up)
export function coverage(want, mailboxes){
  const w = Math.max(0, Math.round(+want || 0)), have = Math.max(0, Math.round(+mailboxes || 0));
  if(!isFinite(have) || !w) return { want:w, have, missing:0, ok:true, pct:100 };
  const missing = Math.max(0, w - have);
  return { want:w, have, missing, ok:have >= w * 0.95, pct:Math.min(100, Math.round(have / w * 100)) };
}

const hav = (a, b, c, d) => { const R = 6371000, r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };

// Suggestions from the census places around the start (townsAround). Not only the densest: nearness counts most, then the
// households the place can take (only up to what is missing), then how compact it is. Places already chosen (or right at the
// start / next to a chosen one) are not suggested again; at most `max` places, no duplicates.
export function rankSuggestions(towns, { start, side = [], missing = 0, max = 6, maxKm = 30 } = {}){
  const seen = [];
  const near = (c, list, m) => list.some(x => x && x.lat != null && hav(x.lat, x.lng, c.lat, c.lng) < m);
  let list = (towns || []).filter(c => c && isFinite(c.lat) && isFinite(c.lng) && c.households > 0 && (c.dist == null || c.dist <= maxKm * 1000));
  const big = list.filter(c => c.households >= 300); if(big.length) list = big;   // a real place before a hamlet
  list = list.filter(c => !near(c, side, 1500) && !(start && hav(start.lat, start.lng, c.lat, c.lng) < 2000));
  const need = Math.max(300, missing || 0);
  // nearness first (halves every ~4 km), then how much of the missing flyers the place can take (square root: a big city does
  // not win only by size), a little for compactness (households per km²)
  const score = c => { const km = (c.dist != null ? c.dist : hav(start.lat, start.lng, c.lat, c.lng)) / 1000, take = Math.min(1, c.households / need), dense = c.dense || 0;
    return Math.exp(-km / 6) * (0.5 + 0.5 * Math.sqrt(take)) * (0.9 + 0.1 * dense / (dense + 200)); };
  const out = [];
  for(const c of list.sort((a, b) => score(b) - score(a))){
    if(out.length >= max) break;
    if(near(c, seen, 1500)) continue; seen.push(c);
    out.push({ lat:c.lat, lng:c.lng, households:c.households, km:Math.round((c.dist != null ? c.dist : hav(start.lat, start.lng, c.lat, c.lng)) / 100) / 10, dense:c.dense || null });
  }
  return out;
}

// the admin adds a suggestion: it becomes a confirmed Nebenstadt (same shape as before, so the planner treats it as before).
// Returns the new side list, or the old one when the place is already there (double click).
export function addSuggestion(side, s, name){
  if((side || []).some(x => x.lat != null && hav(x.lat, x.lng, s.lat, s.lng) < 1500)) return side;
  const used = new Set((side || []).map(x => x.name)); let nm = name || 'Ort'; for(let j = 2; used.has(nm); j++) nm = (name || 'Ort') + ' (' + j + ')';
  return [...(side || []), { name:nm, lat:s.lat, lng:s.lng, p:null, flyers:s.households, km:s.km, auto:true, confirmed:true }];
}

// key of a start point: suggestions found for another start are thrown away
export const startKey = st => st ? st.lat.toFixed(5) + ',' + st.lng.toFixed(5) : '';

// the places of an order lie apart (more than ~3 km between the start and a place): the admin should check how people get there
export const placesApart = (start, side) => !!(start && (side || []).some(x => x.lat != null && hav(start.lat, start.lng, x.lat, x.lng) > 3000));
