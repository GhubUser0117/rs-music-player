# RuneScape music map

Old School RuneScape music player with a clickable world map. Click an area to hear
the track that unlocks there, or browse the list grouped by zone. Pure HTML, CSS and
JavaScript, no build step: open `index.html`.

Tracks, unlock areas, fonts and zone pictures are hotlinked from the
[OSRS Wiki](https://oldschool.runescape.wiki); the map is the official Jagex world map.
`scripts/build-areas.py` regenerates `areas.js` from the wiki.
