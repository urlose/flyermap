// Census correction of the mailbox estimate (Planner.censusFill): adds what the census has more, cuts a cell down to
// census × 1.1 + 2 where we count clearly more, keeps sums exact.
// Run: node test/census.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const P = require('../admin/planner.js');
let fail = 0; const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if(!ok) fail++; };
// fake census on a plain 100 m grid in degrees (cell = floor(lat*1000), floor(lng*1000))
const census = H => ({ cellOf:(la, lo) => [Math.floor(lo * 1000), Math.floor(la * 1000)], centre:(cx, cy) => [(cy + 0.5) / 1000, (cx + 0.5) / 1000],
  households:async () => new Map(Object.entries(H)) });
const box = [[0, 0], [0, 0.01], [0.01, 0.01], [0.01, 0]];
const b = [{ lat:0.0012, lng:0.0012, n:1 }, { lat:0.0015, lng:0.0018, n:3 }, { lat:0.0052, lng:0.0052, n:9 }];
const out = await P.censusFill(b, box, census({ '1,1':12, '5,5':4, '8,8':6 }));
const sum = (l, f) => l.filter(f).reduce((a, x) => a + x.n, 0);
check(sum(out, x => x.lat < 0.002) === 12, 'cell with 4 counted, census 12: lifted to 12');
check(out[0].n === 3 && out[1].n === 9, `shared in proportion (1:3 → ${out[0].n}:${out[1].n})`);
check(out[2].n === 6, `cell with 9 counted, census 4: cut to 4 × 1.1 + 2 = 6 (${out[2].n})`);
{ const big = [{ lat:0.0031, lng:0.0031, n:129 }, { lat:0.0034, lng:0.0036, n:13 }, { lat:0.0037, lng:0.0032, n:1 }];
  const o2 = await P.censusFill(big, box, census({ '3,3':94 }));
  check(sum(o2, () => true) === 105, `big building: cell 143 counted, census 94 → ${sum(o2, () => true)} (94 × 1.1 + 2)`);
  check(o2[0].n > o2[1].n && o2[2].n === 1 && o2.removed === 38, `shared in proportion, every house keeps one (${o2.map(x => x.n).join(' / ')})`); }
{ const o3 = await P.censusFill([{ lat:0.0031, lng:0.0031, n:50 }], box, census({ '3,3':46 }));
  check(o3[0].n === 50, 'a little over the census (firms, empty flats) stays'); }
{ const o4 = await P.censusFill([{ lat:0.0031, lng:0.0031, n:30 }], box, census({ '5,5':10 }));
  check(o4[0].n === 30, 'cell without census households stays'); }
check(sum(out, x => x.census) === 6 && out.some(x => x.census && Math.abs(x.lat - 0.0085) < 1e-9), 'cell without our houses gets a point at its centre');
check(b[0].n === 1, 'input list is not changed');
check((await P.censusFill(b, box, census({}))) === b, 'no census data: unchanged');
process.exit(fail ? 1 : 0);
