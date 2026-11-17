// Geographic delivery boundary, independent of road travel time. Legacy plans
// have no radius. The 10 km default is configurable, never an isochrone.
export const DEFAULT_RADIUS_KM = 10;
export const MIN_RADIUS_KM = 0.5;
// Matches the existing map loader's supported maximum area radius.
export const MAX_RADIUS_KM = 10;
const EARTH_M = 6371000, RAD = Math.PI / 180;

export function radiusKm(value){
  if(value == null || value === '') return null;
  const n = Number(value);
  if(!Number.isFinite(n) || n < MIN_RADIUS_KM || n > MAX_RADIUS_KM)
    throw new Error('Radius must be between 0.5 and 10 km');
  return n;
}
export function radiusFromPlans(plans){
  const value = (plans || []).map(p => p.days?.[0]?.delivery_radius_km).find(x => x != null);
  return radiusKm(value);
}
export function distanceM(a, b){
  const lat = (b[0] - a[0]) * RAD, lng = (b[1] - a[1]) * RAD;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(Math.sin(lat / 2) ** 2 +
    Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(lng / 2) ** 2)));
}
export const insideCircle = (point, start, km) => distanceM(point, start) <= km * 1000 + 0.001;

// Polygon only for saving/drawing the boundary. Delivery uses exact distance.
export function circlePolygon(start, km, segments = 128){
  radiusKm(km);
  const lat = start[0] * RAD, lng = start[1] * RAD, d = km * 1000 / EARTH_M;
  return Array.from({ length:segments }, (_, i) => {
    const bearing = i * 2 * Math.PI / segments;
    const a = Math.asin(Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(bearing));
    const b = lng + Math.atan2(Math.sin(bearing) * Math.sin(d) * Math.cos(lat), Math.cos(d) - Math.sin(lat) * Math.sin(a));
    return [a / RAD, ((b / RAD + 540) % 360) - 180];
  });
}

// Keep connecting roads intact: a walking detour may leave the circle, but no
// automatic delivery point may do so. Do not mutate the cached source graph.
export function clipDeliveryGraph(g, start, km){
  if(km == null) return g;
  radiusKm(km);
  return { ...g, edges:g.edges.map(e => {
    if(!(e.mb > 0)) return e;
    const boxes = e.boxes || [], total = boxes.reduce((s, b) => s + (b[2] || 1), 0);
    if(total > 0){
      const kept = boxes.filter(b => insideCircle(b, start, km));
      if(kept.length === boxes.length) return e;
      return { ...e, boxes:kept, mb:e.mb * kept.reduce((s, b) => s + (b[2] || 1), 0) / total };
    }
    const points = e.coords?.length ? e.coords : [g.pts[e.a], g.pts[e.b]];
    return points.every(p => insideCircle(p, start, km)) ? e : { ...e, mb:0, boxes:[] };
  }) };
}

export function manualOutsideCircle(start, km, side = [], must = [], zone = null){
  if(!start || km == null) return false;
  const outside = p => !insideCircle(p, start, km);
  return side.some(c => !c.auto && (c.p?.length > 2 ? c.p.some(outside) : outside([c.lat, c.lng]))) ||
    must.some(c => c.p?.some(outside)) || !!zone?.some(outside);
}
