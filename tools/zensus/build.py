#!/usr/bin/env python3
"""Census 2022 households per 100 m cell -> small binary squares for the app (admin/zensus/).

Input:  households_0.parquet (columns x, y, value; EPSG:3035 cell centres) from the Zensus 2022 grid data,
        e.g. https://github.com/JsLth/z22data/blob/main/z22_data_100m/households_0.parquet
        (source: Statistische Ämter des Bundes und der Länder, Zensus 2022, dl-de/by-2-0).
Output: one file per 50 km square, h_<X>_<Y>.bin, X = floor(x / 50000), Y = floor(y / 50000).
        Little-endian uint32 per populated cell: (cy * 500 + cx) << 12 | households  (cx, cy = cell inside the square).
Usage:  python3 tools/zensus/build.py households_0.parquet admin/zensus
"""
import sys, os, struct, json, collections
import pyarrow.parquet as pq

src, out = sys.argv[1], sys.argv[2]
t = pq.read_table(src).to_pydict()
sq = collections.defaultdict(list); total = 0
for x, y, v in zip(t['x'], t['y'], t['value']):
    if v is None or v <= 0: continue
    cx, cy = x // 100, y // 100
    sq[(cx // 500, cy // 500)].append((((cy % 500) * 500 + (cx % 500)) << 12) | min(int(v), 4095)); total += int(v)
os.makedirs(out, exist_ok=True)
for (X, Y), cells in sq.items():
    cells.sort()
    with open(os.path.join(out, f'h_{X}_{Y}.bin'), 'wb') as f: f.write(struct.pack(f'<{len(cells)}I', *cells))
json.dump({'source': 'Zensus 2022, Haushalte je 100-m-Gitterzelle, Statistische Ämter des Bundes und der Länder (dl-de/by-2-0)', 'date': '2022-05-15',
           'cells': sum(len(c) for c in sq.values()), 'households': total, 'squares': sorted(f'{X}_{Y}' for X, Y in sq)}, open(os.path.join(out, 'index.json'), 'w'))
print(len(sq), 'squares,', sum(len(c) for c in sq.values()), 'cells,', total, 'households')
