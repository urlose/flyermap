#!/bin/sh
# Map data for the presentation video (Löhne): full OSM features for rendering + the app's own squares. © OpenStreetMap contributors, ODbL
set -e
mkdir -p demo && cd demo
BB="52.180,8.650,52.235,8.750"
Q="[out:json][timeout:180];(way[highway]($BB);way[building]($BB);way[landuse]($BB);way[natural]($BB);way[leisure]($BB);way[waterway]($BB);way[railway]($BB);way[amenity=parking]($BB);relation[landuse]($BB);relation[natural]($BB);relation[leisure]($BB););out geom tags;"
for U in https://overpass.openstreetmap.fr/api/interpreter https://overpass-api.de/api/interpreter; do
  if curl -sSf --max-time 300 -o map.json --data-urlencode "data=$Q" "$U"; then break; fi; sleep 20
done
python3 -c "import json;d=json.load(open('map.json'));print('elements',len(d['elements']))"
gzip -9 -f map.json
for i in 1739 1740 1741 1742 1743 1744; do for j in 191 192 193 194 195 196; do
  curl -sSf -o "${i}_${j}.json.gz" "https://xobrvfkwqessbkdwiavu.supabase.co/storage/v1/object/public/tiles/v4/${i}_${j}.json.gz" || true
done; done
ls -la | head -50
