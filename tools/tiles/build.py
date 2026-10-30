#!/usr/bin/env python3
"""FlyerMap: own map squares for Germany (no public Overpass server needed while planning).

Cuts an OpenStreetMap extract (Geofabrik germany-latest.osm.pbf) into the planner's squares (TILE_LAT x TILE_LNG degrees)
and keeps only what the planner uses: walkable streets (node ids + coordinates, way ids + names) and houses with their
estimated number of mailboxes. The selection and the mailbox estimate are exact copies of admin/planner.js
(qTile + compactTile + estimateMailboxes), so a square from here equals a square loaded from Overpass.

Output: <out>/<i>_<j>.json.gz in the compact delta format 'fm4' (decoded by decodeTile() in admin/planner.js).
Only squares that lie completely inside the extract's boundary polygon are written; the app loads the rest from Overpass.

  python3 build.py --pbf germany-latest.osm.pbf --poly germany.poly --out tiles/      (needs osmium-tool, pyosmium, shapely)
  python3 build.py --pbf small.osm --bbox S,W,N,E --out tiles/ --nosplit               (tests: no boundary, no band split)
Map data © OpenStreetMap contributors, ODbL.
"""
import argparse, gzip, json, math, os, re, subprocess, sys, time
import osmium

TILE_LAT, TILE_LNG, TILE_V = 0.03, 0.045, 'fm4'
R, RAD = 6371000.0, math.pi / 180

NO_WAY = 'motorway|motorway_link|trunk|trunk_link|footway|cycleway|path|steps|bridleway|construction|proposed|raceway|corridor|elevator|platform|bus_stop|track|bus_guideway|escape|rest_area|services'
NO_B = 'garage|garages|shed|roof|carport|greenhouse|hut|cabin|barn|farm_auxiliary|stable|cowshed|sty|ruins|construction|service|parking|hangar|kiosk|toilets|bunker|digester|silo|tank|transformer_tower|water_tower|storage_tank|bridge|boathouse|container|allotment_house|gatehouse|church|chapel|mosque|synagogue|temple|cathedral|train_station|transportation|grandstand|stadium|pavilion|tower|industrial|warehouse|manufacture|power|substation|commercial|retail|supermarket|shop|mall|office|hotel|hospital|clinic|school|university|college|kindergarten|public|civic|government|fire_station|sports_hall|sports_centre|gym|restaurant|cafe|fuel|petrol_station|bank|data_center|factory|works|laboratory|museum|theatre|cinema|library|prison|barracks|military'
HOUSE_B = 'house|detached|semidetached_house|terrace|bungalow|villa|farm|cottage|houseboat|static_caravan'
RX_NO_WAY = re.compile('^(' + NO_WAY + ')$')
RX_SERVICE = re.compile('^(parking_aisle|driveway|drive-through|emergency_access)$')
RX_ACCESS = re.compile('^(private|no)$')
RX_NO_MAILBOX = re.compile('^(' + NO_B + ')$')
RX_HOUSE = re.compile('^(' + HOUSE_B + ')$')
RX_HOUSE_OR_NO = re.compile('^(' + HOUSE_B + '|' + NO_B + ')$')
RX_FLATS = re.compile('^(apartments|residential|dormitory)$')
RX_INT = re.compile(r'\s*([+-]?\d+)')
RX_FLOAT = re.compile(r'\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)')

def js_round(x): return math.floor(x + 0.5)
def parse_int(s):
    m = RX_INT.match(s or ''); return int(m.group(1)) if m else None
def parse_float(s):
    m = RX_FLOAT.match(s or ''); return float(m.group(1)) if m else None

# Overpass regex filters ("k"!~"^(…)$") also match objects without the key — re.search on '' behaves the same for these lists
def is_street(tags):
    hw = tags.get('highway')
    if hw is None or RX_NO_WAY.search(hw): return False
    if RX_SERVICE.search(tags.get('service') or ''): return False
    if RX_ACCESS.search(tags.get('access') or ''): return False
    return True

def estimate_mailboxes(tags, area):   # = estimateMailboxes() in admin/planner.js
    if tags.get('abandoned') or tags.get('disused') or tags.get('disused:building'): return 0
    b = tags.get('building') or 'yes'
    business = any(tags.get(k) for k in ('shop', 'office', 'amenity', 'craft', 'tourism', 'industrial', 'healthcare', 'leisure'))
    flats = parse_int(tags.get('building:flats') or tags.get('addr:flats'))
    if flats is not None and flats > 0: return min(flats, 250)
    if RX_NO_MAILBOX.search(b): return 0
    has_nr = bool(tags.get('addr:housenumber'))
    if RX_HOUSE.search(b): return 0 if area < 25 else 1
    lv = parse_float(tags.get('building:levels'))
    lv_ok = lv is not None and lv > 0
    levels = lv if lv_ok else (2 if area < 120 else 4)
    if RX_FLATS.search(b): return max(2, min(250, js_round(area * levels * 0.75 / 80)))
    if business: return 0
    if b == 'yes':
        if area < 30 or (not has_nr and area < 60): return 0
        if not lv_ok and area > 900: return 0
        return max(1, min(250, js_round(area * levels * 0.75 / 80)))
    return 0

def poly_area(geom):   # geom: [(lat, lon)], = polyArea()
    if len(geom) < 3: return 0
    lat0 = geom[0][0]; kx = math.cos(lat0 * RAD) * R * RAD; ky = R * RAD; a = 0.0
    for i in range(len(geom)):
        p = geom[i]; q = geom[(i + 1) % len(geom)]
        a += (p[1] * kx) * (q[0] * ky) - (q[1] * kx) * (p[0] * ky)
    return abs(a) / 2

def tile_of(lat, lon): return (math.floor(lat / TILE_LAT), math.floor(lon / TILE_LNG))
def i6(v): return js_round(v * 1e6)

class Collect(osmium.SimpleHandler):
    """streets and houses for the squares in `want` (set of (i, j)); nodes are kept only for streets"""
    def __init__(self, want):
        super().__init__(); self.want = want
        self.nodes = {}; self.ways = {}; self.tile_ways = {}; self.tile_b = {}
        self.n_ways = 0
    def way(self, w):
        tags = w.tags
        b = tags.get('building')
        street = is_street(tags)
        if not street and b is None: return
        pts = []
        for nd in w.nodes:
            if not nd.location.valid(): return
            pts.append((nd.ref, nd.lat, nd.lon))
        if not pts: return
        if street: self.add_street(w.id, tags.get('name') or tags.get('ref') or '', pts)
        if b is not None and not RX_HOUSE_OR_NO.search(b) or b is not None and RX_HOUSE.search(b): self.add_building(b, tags, pts)
    def add_street(self, wid, name, pts):
        tiles = set()
        for k, (_, la, lo) in enumerate(pts):
            tiles.add(tile_of(la, lo))
            if k:   # squares the segment passes without a node in them (Overpass bbox semantics)
                pa, po = pts[k - 1][1], pts[k - 1][2]; steps = int(max(abs(la - pa) / 0.004, abs(lo - po) / 0.006))
                for s in range(1, steps + 1): tiles.add(tile_of(pa + (la - pa) * s / (steps + 1), po + (lo - po) * s / (steps + 1)))
        tiles &= self.want
        if not tiles: return
        self.ways[wid] = (name, [p[0] for p in pts])
        for (nid, la, lo) in pts: self.nodes[nid] = (i6(la), i6(lo))
        for t in tiles: self.tile_ways.setdefault(t, []).append(wid)
        self.n_ways += 1
    def add_building(self, b, tags, pts):
        if RX_HOUSE.search(b):   # Overpass "out center" = centre of the bounding box; footprint does not matter for houses
            las = [p[1] for p in pts]; los = [p[2] for p in pts]
            lat, lon = (min(las) + max(las)) / 2, (min(los) + max(los)) / 2
            n = estimate_mailboxes(tags, 100)
        else:   # "out geom": footprint area, centre = mean of the vertices (closing vertex included, as in parseBuildings)
            geom = [(p[1], p[2]) for p in pts]
            n = estimate_mailboxes(tags, poly_area(geom))
            lat = sum(p[0] for p in geom) / len(geom); lon = sum(p[1] for p in geom) / len(geom)
        if not n: return
        t = tile_of(lat, lon)
        if t in self.want: self.tile_b.setdefault(t, []).append((i6(lat), i6(lon), n))

def encode(c, t):
    """fm4: n = [Δid, Δlat, Δlon …] (ids ascending, coordinates in 1e-6 degrees), w = [[Δid, name, [first node, Δ …]] …],
       b = [Δlat, Δlon, mailboxes …] (sorted by position)"""
    wids = sorted(set(c.tile_ways.get(t, [])))
    nids = sorted({nid for wid in wids for nid in c.ways[wid][1]})
    n = []; pid = plat = plon = 0
    for nid in nids:
        la, lo = c.nodes[nid]; n += [nid - pid, la - plat, lo - plon]; pid, plat, plon = nid, la, lo
    w = []; pw = 0
    for wid in wids:
        name, ids = c.ways[wid]; d = []; prev = 0
        for x in ids: d.append(x - prev); prev = x
        w.append([wid - pw, name, d]); pw = wid
    b = []; plat = plon = 0
    for (la, lo, k) in sorted(set(c.tile_b.get(t, []))):
        b += [la - plat, lo - plon, k]; plat, plon = la, lo
    return {'v': TILE_V, 'n': n, 'w': w, 'b': b}

def read_poly(path):
    """Osmosis .poly: name line, then rings (header line, "lon lat" lines, END; header "!…" = hole), final END"""
    from shapely.geometry import Polygon
    from shapely.ops import unary_union
    lines = [l.strip() for l in open(path) if l.strip()]
    rings, k = [], 1
    while k < len(lines) and lines[k] != 'END':
        hole = lines[k].startswith('!'); k += 1; ring = []
        while lines[k] != 'END':
            lon, lat = map(float, lines[k].split()[:2]); ring.append((lon, lat)); k += 1
        k += 1; rings.append((hole, ring))
    g = unary_union([Polygon(r) for h, r in rings if not h and len(r) > 2])
    for h, r in rings:
        if h and len(r) > 2: g = g.difference(Polygon(r))
    return g

def full_tiles(poly, bbox):
    from shapely.geometry import box
    from shapely.prepared import prep
    s, w, n, e = bbox; pp = prep(poly) if poly is not None else None; out = set()
    for i in range(math.floor(s / TILE_LAT), math.floor(n / TILE_LAT) + 1):
        for j in range(math.floor(w / TILE_LNG), math.floor(e / TILE_LNG) + 1):
            if pp is None or pp.contains(box(j * TILE_LNG, i * TILE_LAT, (j + 1) * TILE_LNG, (i + 1) * TILE_LAT)): out.add((i, j))
    return out

def write_tiles(c, tiles, out):
    size = 0
    for t in tiles:
        data = gzip.compress(json.dumps(encode(c, t), separators=(',', ':'), ensure_ascii=False).encode(), 9)
        with open(os.path.join(out, '%d_%d.json.gz' % t), 'wb') as f: f.write(data)
        size += len(data)
    return size

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--pbf', required=True); ap.add_argument('--poly'); ap.add_argument('--bbox'); ap.add_argument('--out', required=True)
    ap.add_argument('--nosplit', action='store_true'); ap.add_argument('--band', type=int, default=12); ap.add_argument('--work', default='.')
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    poly = read_poly(a.poly) if a.poly else None
    bbox = list(map(float, a.bbox.split(','))) if a.bbox else (lambda b: [b[1], b[0], b[3], b[2]])(poly.bounds)
    want_all = full_tiles(poly, bbox)
    print('squares inside the boundary:', len(want_all), flush=True)
    rows = sorted({t[0] for t in want_all}); total = 0; t0 = time.time(); done = 0
    bands = [rows] if a.nosplit else [rows[k:k + a.band] for k in range(0, len(rows), a.band)]
    for band in bands:
        want = {t for t in want_all if band[0] <= t[0] <= band[-1]}
        src = a.pbf
        if not a.nosplit:   # only this band of rows (+2 km), ways complete
            s, n = band[0] * TILE_LAT - 0.02, (band[-1] + 1) * TILE_LAT + 0.02
            src = os.path.join(a.work, 'band.osm.pbf')
            subprocess.run(['osmium', 'extract', '-b', '%f,%f,%f,%f' % (bbox[1] - 0.05, s, bbox[3] + 0.05, n), '-s', 'complete_ways', '--overwrite', '-o', src, a.pbf], check=True)
        c = Collect(want); c.apply_file(src, locations=True, idx='flex_mem')
        total += write_tiles(c, want, a.out); done += len(want)
        print('rows %d-%d: %d squares, %d streets, %d houses · %d/%d · %.1f MB · %d s' % (band[0], band[-1], len(want), c.n_ways, sum(len(v) for v in c.tile_b.values()), done, len(want_all), total / 1e6, time.time() - t0), flush=True)
    with open(os.path.join(a.out, 'meta.json'), 'w') as f:
        json.dump({'v': TILE_V, 'built': time.strftime('%Y-%m-%d'), 'squares': len(want_all), 'bytes': total, 'tile': [TILE_LAT, TILE_LNG]}, f)
    print('total %.1f MB in %d squares' % (total / 1e6, len(want_all)))

if __name__ == '__main__': main()
