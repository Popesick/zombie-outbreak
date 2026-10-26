# Zombie Outbreak Simulator

Browser-Sandbox und Kampagne auf echten Karten (Moosburg a. d. Isar, Pfaffenhofen a. d. Ilm).
Kartendaten: © OpenStreetMap-Mitwirkende (ODbL), Satellitenbild: Esri (zur Laufzeit geladen). Spielstände liegen lokal im Browser (localStorage).

- **Sandbox / Classic**: freie Parameter, Barrikaden-Bauphase, Evakuierung, Trucks, Luftschläge, Squads.
- **Kampagne**: 3 Missionen mit Primär-/Sekundärzielen, begrenzter Munition, Erfahrung (Level), Shop (Upgrades, neue Einheiten) und Comic-Story.

Lokal starten: `./start.sh` und http://localhost:8765 öffnen.

Karten neu erzeugen: `tools/fetch_osm.sh <name> <süd> <west> <nord> <ost>` lädt OSM-Rohdaten (Overpass),
`python3 tools/build_map2.py <name> <süd> <west> <nord> <ost>` erzeugt `maps/<name>.js`.
Missionsparameter stehen in `campaign.js` (Objekt `MIS`), Comic-Szenen und Texte in `comics.js`.
Sprachausgabe: Computerstimme (Web Speech) oder eigene Dateien unter `audio/<sequenz>_<panel>.mp3`.
