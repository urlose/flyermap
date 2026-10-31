#!/bin/bash
# Map data for the presentation video (Löhne): full OSM features for rendering + the app's own squares. © OpenStreetMap contributors, ODbL
mkdir -p demo && cd demo
BB="52.180,8.650,52.235,8.750"
get(){   # $1 = file, $2 = query
  for round in 1 2 3 4; do
    for U in https://overpass.openstreetmap.fr/api/interpreter https://overpass-api.de/api/interpreter https://z.overpass-api.de/api/interpreter https://maps.mail.ru/osm/tools/overpass/api/interpreter; do
      code=$(curl -s --max-time 240 -o "$1" -w '%{http_code}' --data-urlencode "data=$2" "$U")
      if [ "$code" = 200 ] && python3 -c "import json,sys;d=json.load(open('$1'));sys.exit(0 if d.get('elements') and not d.get('remark') else 1)" 2>/dev/null; then echo "::notice::$1 from $U: $(du -h $1 | cut -f1)"; gzip -9 -f "$1"; return 0; fi
      echo "::notice::$1 $U → $code $(head -c 150 $1 2>/dev/null | tr '\n' ' ')"
    done
    sleep $((round * 30))
  done
  return 1
}
get roads.json "[out:json][timeout:200];(way[highway]($BB);way[railway]($BB);way[waterway]($BB););out geom tags;" || exit 1
get buildings.json "[out:json][timeout:200];way[building]($BB);out geom;" || exit 1
get areas.json "[out:json][timeout:200];(way[landuse]($BB);way[natural]($BB);way[leisure]($BB);way[amenity=parking]($BB);relation[landuse]($BB);relation[natural]($BB);relation[leisure]($BB););out geom tags;" || exit 1
for i in 1739 1740 1741 1742 1743 1744; do for j in 191 192 193 194 195 196; do
  curl -sSf -o "${i}_${j}.json.gz" "https://xobrvfkwqessbkdwiavu.supabase.co/storage/v1/object/public/tiles/v4/${i}_${j}.json.gz" || rm -f "${i}_${j}.json.gz"
done; done
echo "::notice::$(ls | wc -l) files, $(du -sh . | cut -f1)"
