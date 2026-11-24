// read-only: pedestrian bridges / tunnels / crossings around the order start (public OSM data via Overpass)
const [lat, lon] = [50.1228113, 8.6040439], R = 3000, rad = Math.PI / 180;
const q = `[out:json][timeout:90];(
 way["highway"~"^(footway|steps|path|cycleway|pedestrian)$"]["bridge"](around:${R},${lat},${lon});
 way["highway"~"^(footway|steps|path|cycleway|pedestrian)$"]["tunnel"](around:${R},${lat},${lon});
 way["highway"="footway"]["footway"="crossing"](around:${R},${lat},${lon});
 way["highway"~"^(footway|path|pedestrian)$"]["layer"](around:${R},${lat},${lon});
);out center tags;`;
const servers = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
let j = null;
for(const s of servers){ try{ const r = await fetch(s, { method:'POST', body:'data=' + encodeURIComponent(q), headers:{ 'content-type':'application/x-www-form-urlencoded', 'user-agent':'flyermap-footway-census/1' } }); if(r.ok){ j = await r.json(); console.log('server', s); break; } console.log('status', r.status, s); }catch(e){ console.log('err', s, String(e).slice(0, 80)); } }
if(!j) process.exit(1);
const SEC = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'], cnt = {}, rows = [];
for(const e of j.elements){
  const c = e.center; if(!c) continue; const dx = (c.lon - lon) * Math.cos(lat * rad) * 111320, dy = (c.lat - lat) * 111320, d = Math.hypot(dx, dy);
  const sec = SEC[Math.floor((((Math.atan2(dx, dy) / rad) + 360) % 360 + 22.5) % 360 / 45)], t = e.tags || {};
  const kind = t.bridge ? 'bridge' : t.tunnel ? 'tunnel' : t.footway === 'crossing' ? 'crossing' : 'layer';
  const key = sec + ':' + kind; cnt[key] = (cnt[key] || 0) + 1;
  if(kind !== 'crossing' && d < 2200) rows.push([sec, kind, t.highway, Math.round(d), t.name || '', +c.lat.toFixed(5), +c.lon.toFixed(5)]);
}
console.log('total ways', j.elements.length); console.log('by sector:kind', JSON.stringify(cnt));
console.log('bridges/tunnels within 2.2 km (sector, kind, highway, dist, name, lat, lon):'); rows.sort((a, b) => a[3] - b[3]).slice(0, 70).forEach(r => console.log(JSON.stringify(r)));
