// Census comparison: projection to the census grid and the cell lookup. Run: node test/zensus.mjs
import { readFileSync, existsSync } from 'node:fs';
import { laea, cellOf, compare, diffPct } from '../worker/src/zensus.js';
let fail = 0; const ok = (name, cond, info = '') => { console.log((cond ? 'ok  ' : 'FAIL') + ' ' + name + (info ? ' (' + info + ')' : '')); if(!cond) fail++; };
const o = laea(52, 10).map(Math.round); ok('origin of EPSG:3035', o[0] === 4321000 && o[1] === 3210000, o.join(','));
const c = cellOf(49.945307, 11.577404); ok('a house in Bayreuth lands in its 100 m cell', c[0] === 44342 && c[1] === 29826, c.join(','));
const dir = new URL('../admin/zensus/', import.meta.url).pathname;
const fetcher = async u => { const p = dir + u.split('/').pop(); return existsSync(p) ? { ok:true, status:200, arrayBuffer:async () => new Uint8Array(readFileSync(p)).buffer } : { ok:false, status:404 }; };
const r = await compare([[49.945307, 11.577404, 21], [49.945422, 11.577611, 19], [54.5, 7.0, 4]], fetcher);
ok('our boxes are summed per cell', r.ours === 44 && r.cells === 2, JSON.stringify(r));
ok('census households of the Bayreuth cell', r.households === 46, String(r.households));
ok('boxes at sea have no census household', r.emptyOurs === 4);
ok('difference in percent', diffPct(r) === -4, String(diffPct(r)));
ok('no boxes, no comparison', (await compare([], fetcher)) === null);
process.exit(fail ? 1 : 0);
