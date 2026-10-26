#!/bin/bash
# usage: fetch_osm.sh name south west north east
name=$1; s=$2; w=$3; n=$4; e=$5
Q="[out:json][timeout:90];(way[\"highway\"]($s,$w,$n,$e);way[\"building\"]($s,$w,$n,$e);way[\"waterway\"]($s,$w,$n,$e);way[\"natural\"=\"water\"]($s,$w,$n,$e););out geom qt;"
for i in 1 2 3 4 5 6; do
  for u in https://overpass-api.de/api/interpreter https://overpass.kumi.systems/api/interpreter; do
    curl -s -m 120 -A "ZombieOutbreakSim/1.0 (hobby project)" --data-urlencode "data=$Q" $u -o tools/raw/$name.json
    if head -c 1 tools/raw/$name.json | grep -q '{'; then echo "OK $name $u"; ls -la tools/raw/$name.json; exit 0; fi
    sleep 12
  done
done
echo FAIL $name
