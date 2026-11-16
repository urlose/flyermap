// Phase 2A: how many places does each grouping/threshold find in the REAL Zensus 2022 data (admin/zensus)? Prints a table, no asserts.
// old = townsAround (1 km blocks >= 25 households, glued, group >= minimum); cells = censusPlaces (100 m cells, gap 100/200/300 m).
// Places between 2.5 and 15 km Luftlinie from the start (the old search skipped < 2.5 km). Run: node test/places-thresholds.mjs
import { readFileSync, existsSync } from 'node:fs';
import { townsAround, censusPlaces } from '../worker/src/zensus.js';
const dir = new URL('../admin/zensus/', import.meta.url).pathname;
const fetcher = async u => { const p = dir + u.split('/').pop(); return existsSync(p) ? { ok:true, status:200, arrayBuffer:async () => new Uint8Array(readFileSync(p)).buffer } : { ok:false, status:404 }; };
for(const [name, [lat, lng]] of Object.entries({ Weidenberg:[49.9424, 11.7290], Eisfeld:[50.4215, 10.9105] })){
  console.log('== ' + name + ' (places 2.5–15 km from the start)');
  console.log('min households'.padEnd(34) + [30, 50, 100, 150].map(m => String(m).padStart(6)).join(''));
  const old = await townsAround(lat, lng, 2500, 15000, fetcher);   // townsAround itself drops < 150: re-count from its internals is not possible, so only 150 is shown for it
  console.log('old: 1 km blocks (only 150 kept)'.padEnd(34) + '     –     –     –' + String(old.length).padStart(6));
  for(const gap of [1, 2, 3]){
    const row = []; for(const m of [30, 50, 100, 150]){ const p = await censusPlaces(lat, lng, 15000, { minH:m, gap, fetcher }); row.push(p.filter(x => x.dist >= 2500 && x.dist <= 15000).length); }
    console.log(('cells, gap ' + gap * 100 + ' m' + (gap === 2 ? ' (chosen)' : '')).padEnd(34) + row.map(n => String(n).padStart(6)).join(''));
  }
}
