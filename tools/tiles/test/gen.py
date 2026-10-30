# synthetic OSM data across several squares: streets (some filtered out), houses and other buildings with varied tags
import json, random, sys
from xml.sax.saxutils import quoteattr
random.seed(7)
nodes, ways = [], []
nid, wid = 1000, 50000
def node(lat, lon):
    global nid; nid += random.randint(1, 5); nodes.append((nid, round(lat, 7), round(lon, 7))); return nid
def way(ids, tags):
    global wid; wid += random.randint(1, 9); ways.append((wid, ids, tags))
S, W = 52.17, 8.66   # around the square corner 52.20 / 8.685 … 8.73
hw = ['residential'] * 6 + ['service', 'unclassified', 'tertiary', 'footway', 'track', 'living_street', 'primary', 'motorway']
for k in range(120):
    la, lo = S + random.random() * 0.09, W + random.random() * 0.12
    ids = [node(la, lo)]
    for s in range(random.randint(1, 8)):
        la += random.uniform(-0.004, 0.004); lo += random.uniform(-0.006, 0.006); ids.append(node(la, lo))
    if random.random() < 0.3 and len(ids) > 2: ids.append(ids[0])
    t = {'highway': random.choice(hw)}
    if random.random() < 0.7: t['name'] = 'Straße %d' % k
    elif random.random() < 0.3: t['ref'] = 'K%d' % k
    if random.random() < 0.1: t['service'] = random.choice(['driveway', 'parking_aisle', 'alley'])
    if random.random() < 0.08: t['access'] = random.choice(['private', 'no', 'yes', 'destination'])
    way(ids, t)
# one long straight road crossing a square without a node inside it
way([node(52.215, 8.60), node(52.215, 8.80)], {'highway': 'residential', 'name': 'Lange Straße'})
btypes = ['house'] * 5 + ['yes'] * 5 + ['detached', 'apartments', 'residential', 'garage', 'shed', 'terrace', 'commercial', 'school', 'semidetached_house', 'dormitory', 'no', 'roof']
for k in range(900):
    la, lo = S + random.random() * 0.09, W + random.random() * 0.12
    dx, dy = random.uniform(0.00005, 0.0006), random.uniform(0.00005, 0.0005)
    ids = [node(la, lo), node(la + dy, lo), node(la + dy, lo + dx), node(la, lo + dx)]; ids.append(ids[0])
    t = {'building': random.choice(btypes)}
    r = random.random()
    if r < 0.4: t['addr:housenumber'] = str(random.randint(1, 99))
    if random.random() < 0.15: t['building:levels'] = random.choice(['2', '3', '1.5', '4;5', 'x', '0'])
    if random.random() < 0.05: t['building:flats'] = random.choice(['6', '12a', ' 3', 'none'])
    if random.random() < 0.05: t[random.choice(['shop', 'office', 'amenity', 'abandoned', 'disused'])] = 'yes'
    way(ids, t)
with open('data.json', 'w') as f: json.dump({'nodes': nodes, 'ways': ways}, f)
with open('data.osm', 'w') as f:
    f.write("<?xml version='1.0' encoding='UTF-8'?>\n<osm version='0.6'>\n")
    for i, la, lo in sorted(nodes): f.write("<node id='%d' version='1' lat='%.7f' lon='%.7f'/>\n" % (i, la, lo))
    for i, ids, t in ways:
        f.write("<way id='%d' version='1'>" % i + ''.join("<nd ref='%d'/>" % n for n in ids) + ''.join('<tag k=%s v=%s/>' % (quoteattr(k), quoteattr(v)) for k, v in t.items()) + '</way>\n')
    f.write('</osm>\n')
print(len(nodes), 'nodes', len(ways), 'ways')
