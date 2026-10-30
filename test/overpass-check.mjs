// Diagnostics: times every public Overpass mirror with the planner's real queries (needs internet; run in GitHub Actions).
// node test/overpass-check.mjs [lat lng radius]
import { readFileSync } from 'fs';
const src = readFileSync(new URL('../admin/planner.js', import.meta.url), 'utf8');
const get = n => src.match(new RegExp(n + " = '([^']*)'"))[1];
const NO_WAY = get('NO_WAY'), HOUSE_B = get('HOUSE_B'), NO_B = get('NO_B');
const HW = `["highway"]["highway"!~"^(${NO_WAY})$"]["service"!~"^(parking_aisle|driveway|drive-through|emergency_access)$"]["access"!~"^(private|no)$"]`;
const [lat, lng, r] = process.argv.length > 4 ? process.argv.slice(2).map(Number) : [52.1985, 8.6880, 1500];
const dLat = r / 111320, dLng = r / (111320 * Math.cos(lat * Math.PI / 180));
const bb = [lat - dLat, lng - dLng, lat + dLat, lng + dLng].map(v => v.toFixed(5)).join(',');
const qs = {
  streets:`[out:json][timeout:80];way${HW}(${bb});out body;>;out skel qt;`,
  buildings:`[out:json][timeout:80];way["building"~"^(${HOUSE_B})$"](${bb})->.h;way["building"]["building"!~"^(${HOUSE_B}|${NO_B})$"](${bb})->.o;.h out center tags;.o out geom tags;`,
  buildingsLight:`[out:json][timeout:80];way["building"]["building"!~"^(${NO_B})$"](${bb});out center tags;`,
};
const M = (process.env.MIRRORS || 'https://overpass-api.de/api/interpreter,https://overpass.private.coffee/api/interpreter,https://overpass.kumi.systems/api/interpreter,https://overpass.openstreetmap.fr/api/interpreter,https://maps.mail.ru/osm/tools/overpass/api/interpreter,https://overpass.osm.ch/api/interpreter').split(',');
for(const u of M){
  const line = [];
  for(const [k, q] of Object.entries(qs)){
    const t0 = Date.now(); let s;
    try{
      const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 90000);
      const res = await fetch(u, { method:'POST', body:'data=' + encodeURIComponent(q), headers:{ 'Content-Type':'application/x-www-form-urlencoded', 'User-Agent':'FlyerMap diagnostics' }, signal:ac.signal });
      const txt = await res.text(); clearTimeout(tm);
      let n; try{ const j = JSON.parse(txt); n = j.elements.length + ' el' + (j.remark ? ' REMARK ' + j.remark.slice(0, 60) : ''); }catch{ n = 'not json: ' + txt.slice(0, 60).replace(/\s+/g, ' '); }
      s = res.status + ' ' + n + ' ' + (txt.length / 1e6).toFixed(1) + 'MB';
    }catch(e){ s = 'ERR ' + (e.name === 'AbortError' ? 'timeout 90s' : e.message); }
    line.push(`${k} ${((Date.now() - t0) / 1000).toFixed(1)}s ${s}`);
  }
  console.log(`::notice title=${u.split('/')[2]}::${line.join(' || ')}`);
}
