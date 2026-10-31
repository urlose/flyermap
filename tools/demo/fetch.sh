#!/bin/bash
# Map data for the presentation video (Löhne): OSM features from the Geofabrik extract (Overpass refuses data centres)
# + the app's own squares. © OpenStreetMap contributors, ODbL
set -e
sudo apt-get install -y -q osmium-tool >/dev/null
mkdir -p demo work && cd work
curl -sSfL -o region.osm.pbf https://download.geofabrik.de/europe/germany/nordrhein-westfalen/detmold-regbez-latest.osm.pbf
osmium extract -b 8.64,52.17,8.76,52.245 -s complete_ways region.osm.pbf -o box.osm.pbf --overwrite
osmium tags-filter box.osm.pbf nwr/highway nwr/building nwr/landuse nwr/natural nwr/leisure w/waterway w/railway nwr/amenity=parking -o f.osm.pbf --overwrite
osmium export f.osm.pbf -f geojsonseq -o ../demo/map.geojsonseq --overwrite
cd ../demo && gzip -9 -f map.geojsonseq
for i in 1739 1740 1741 1742 1743 1744; do for j in 191 192 193 194 195 196; do
  curl -sSf -o "${i}_${j}.json.gz" "https://xobrvfkwqessbkdwiavu.supabase.co/storage/v1/object/public/tiles/v4/${i}_${j}.json.gz" || rm -f "${i}_${j}.json.gz"
done; done
echo "::notice::$(ls | wc -l) files, $(du -sh . | cut -f1)"
