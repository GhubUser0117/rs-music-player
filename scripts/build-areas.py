"""Build areas.js from the OSRS wiki music map (Map:Music_tracks).

Usage: python3 -I scripts/build-areas.py [cached-mapdata.json]
Writes areas.js next to tracks.js. Needs tracks.js to exist.
"""
import html
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent.parent
API = ("https://oldschool.runescape.wiki/api.php?action=query&prop=mapdata"
       "&titles=Map:Music_tracks&format=json&mpdlimit=max")


def load_mapdata():
    if len(sys.argv) > 1:
        raw = json.loads(Path(sys.argv[1]).read_text())
    else:
        req = urllib.request.Request(API, headers={"User-Agent": "Mozilla/5.0 osrs-music-player"})
        raw = json.load(urllib.request.urlopen(req))
    page = next(iter(raw["query"]["pages"].values()))
    groups = json.loads(page["mapdata"][0])
    return [f for g in groups.values() for f in g[0]["features"]]


def load_tracks():
    src = (ROOT / "tracks.js").read_text().strip()
    return json.loads(src[len("const TRACKS = "):-1])


def norm(s):
    return html.unescape(unquote(s)).replace("_", " ").strip().lower()


def main():
    tracks = load_tracks()
    by_name = {norm(t["name"]): i for i, t in enumerate(tracks)}
    by_file = {norm(t["file"]): i for i, t in enumerate(tracks)}

    areas, unmatched = [], []
    for f in load_mapdata():
        props = f["properties"]
        title = html.unescape(re.sub(r"<[^>]+>", "", props["title"])).strip()
        files = dict.fromkeys(re.findall(r'File:([^"]+\.ogg)', props["description"]))
        idx = list(dict.fromkeys(by_file[norm(x)] for x in files if norm(x) in by_file))
        if not idx:
            key = norm(re.sub(r"\s*\(music track\)$", "", title))
            if key in by_name:
                idx = [by_name[key]]
        if not idx:
            unmatched.append(title)
            continue
        for ring in f["geometry"]["coordinates"][:1]:
            pts = [[round(x), round(y)] for x, y in ring]
            areas.append({"n": re.sub(r"\s+music$", "", title), "t": idx, "p": pts})

    zones = build_zones(areas, tracks)
    out = ("const AREAS = " + json.dumps(areas, ensure_ascii=False, separators=(",", ":")) + ";\n"
           "const ZONES = " + json.dumps(zones, ensure_ascii=False, separators=(",", ":")) + ";\n")
    (ROOT / "areas.js").write_text(out)
    print(f"{len(areas)} areas, {len(zones)} zones, {len(unmatched)} unmatched: {unmatched[:10]}")


# ponytail: coarse hand-drawn kingdom boxes (game coords, x0 x1 y0 y1) for tracks whose
# polygon sits in no named wiki region. Refine boxes if a track lands in the wrong kingdom.
KINGDOMS = [
    ("Feldip Hills", 2440, 2680, 2880, 3060),
    ("Karamja", 2690, 3000, 2850, 3135),
    ("Kharidian Desert", 3130, 3520, 2730, 3210),
    ("Misthalin", 3080, 3330, 3135, 3525),
    ("Asgarnia", 2860, 3080, 3135, 3600),
    ("Kandarin", 2370, 2860, 3060, 3620),
    ("Morytania", 3390, 3750, 3150, 3600),
    ("Wilderness", 2940, 3400, 3520, 3980),
    ("Fremennik Province", 2490, 2860, 3620, 3950),
    ("Tirannwn", 2150, 2370, 3100, 3400),
    ("Lunar Isle", 2040, 2200, 3840, 3960),
    ("Mos Le'Harmless", 3640, 3830, 2900, 3090),
    ("Ape Atoll", 2680, 2830, 2680, 2830),
    ("Fossil Island", 3640, 3860, 3690, 3930),
    ("Great Kourend", 1200, 1950, 3400, 4000),
    ("Varlamore", 1300, 1950, 2800, 3400),
]


KEYWORDS = [
    (("lumbridge", "draynor", "varrock", "edgeville", "barbarian village", "misthalin", "digsite"), "Misthalin"),
    (("falador", "taverley", "burthorpe", "port sarim", "rimmington", "asgarnia", "ice mountain", "dwarven mine", "mudskipper", "entrana", "crandor"), "Asgarnia"),
    (("al kharid", "desert", "pollnivneach", "nardah", "sophanem", "menaphos", "kalphite", "uzer", "bedabin", "shantay"), "Kharidian Desert"),
    (("karamja", "brimhaven", "shilo", "tai bwo", "musa point", "tzhaar", "mor ul rek", "crash island", "kharazi"), "Karamja"),
    (("wilderness", "lava maze", "mage arena", "chaos altar"), "Wilderness"),
    (("morytania", "canifis", "phasmatys", "mort", "burgh de rott", "meiyerditch", "darkmeyer", "slayer tower", "barrows", "haunted woods", "harmony island", "paterdomus", "vampyre", "werewolf"), "Morytania"),
    (("fremennik", "rellekka", "miscellania", "etceteria", "jatizso", "neitiznot", "waterbirth", "keldagrim", "lunar", "weiss", "trollweiss", "trollheim", "troll", "god wars"), "Fremennik Province"),
    (("tirannwn", "isafdar", "lletya", "prifddinas", "zul-andra", "elf", "arandar"), "Tirannwn"),
    (("feldip", "gu'tanoth", "oo'glog", "rantz", "jiggig", "castle wars", "corsair", "myths' guild", "zul"), "Feldip Hills"),
    (("ardougne", "yanille", "catherby", "seers", "camelot", "kandarin", "gnome", "hemenster", "fishing guild", "ranging guild", "piscatoris", "observatory", "witchaven", "legends' guild", "baxtorian", "waterfall", "barbarian outpost", "otto", "white wolf"), "Kandarin"),
    (("kourend", "zeah", "hosidius", "shayzien", "arceuus", "lovakengj", "piscarilius", "kebos", "mount karuulm", "farming guild", "woodcutting guild", "wintertodt", "chambers of xeric", "catacombs"), "Great Kourend"),
    (("varlamore", "civitas", "aldarin", "sunset coast", "fortis", "hunter guild", "ralos"), "Varlamore"),
    (("ape atoll", "marim"), "Ape Atoll"),
    (("mos le'harmless", "mos le harmless"), "Mos Le'Harmless"),
    (("fossil island", "mushroom forest"), "Fossil Island"),
    (("zanaris",), "Zanaris"),
    (("dorgesh", "lumbridge swamp caves", "goblin cave"), "Misthalin"),
]


# ponytail: typical combat levels of what roams each zone, from memory, surface mobs,
# bosses excluded. Edit freely. Zones missing here sort last as "unknown".
LEVELS = {
    "Lumbridge": (1, 12), "Draynor": (2, 26), "Varrock": (2, 28), "Rimmington": (2, 25),
    "Misthalin": (5, 45), "Falador": (5, 45), "Digsite": (5, 40), "Seers' Village": (5, 50),
    "Musa Point": (5, 82), "Asgarnia": (5, 85), "Desert": (8, 30), "Taverley": (10, 60),
    "Burthorpe": (10, 60), "Catherby": (10, 60), "Hemenster": (10, 45), "Outpost": (10, 60),
    "Observatory": (10, 50), "Piscatoris Hunter area": (10, 60), "Keldagrim": (10, 50),
    "Tree Gnome Stronghold": (5, 65), "Kandarin": (15, 100), "Kharidian Desert": (15, 100),
    "Great Kourend": (15, 150), "East Ardougne": (20, 70), "Brimhaven": (20, 55),
    "Karamja": (20, 150), "Northern Ocean": (20, 125), "Civitas illa Fortis": (20, 60),
    "Avium Savannah": (20, 90), "Zanaris": (24, 70), "Fossil Island": (25, 120),
    "Dead Quiet": (30, 50), "Yanile": (30, 85), "Morytania": (30, 125), "Aldarin": (30, 80),
    "Auburn Valley": (30, 80), "Feldip Hills": (40, 90), "Baxtorian Falls": (40, 90),
    "Varlamore": (40, 150), "Fremennik Province": (13, 125), "Ape Atoll": (60, 110),
    "Troll Country": (65, 125), "Night of the Vampyre": (65, 125), "Mos Le'Harmless": (70, 85),
    "Isafdar": (85, 110), "Tirannwn": (85, 180), "Karuulm Slayer Dungeon": (99, 194),
    "Prifddinas": (100, 200), "Lunar Isle": (110, 111), "Wilderness": (10, 200),
    "Farming Guild": (1, 1),
}


# Zone names that are not wiki location pages.
IMAGE_ALIASES = {
    "Desert": "Al Kharid", "Dead Quiet": "Mort Myre Swamp", "Night of the Vampyre": "Darkmeyer",
    "Outpost": "Barbarian Outpost", "Yanile": "Yanille", "Nether Realm": "Nightmare Zone",
    "Piscatoris Hunter area": "Piscatoris Hunter area", "Elsewhere": None,
}
IMAGE_API = ("https://oldschool.runescape.wiki/api.php?action=query&prop=pageimages&pithumbsize=400"
             "&format=json&redirects=1&titles=")


def zone_images(names):
    """Best effort: wiki lead image per zone, by page title. Missing ones get no image."""
    titles = {n: IMAGE_ALIASES.get(n, n) for n in names}
    wanted = sorted({t for t in titles.values() if t})
    found = {}
    for i in range(0, len(wanted), 50):
        url = IMAGE_API + urllib.parse.quote("|".join(wanted[i:i + 50]))
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 osrs-music-player"})
            data = json.load(urllib.request.urlopen(req, timeout=20))
        except Exception as e:  # noqa: BLE001
            sys.stderr.write(f"image lookup failed: {e}\n")
            continue
        back = {r["to"]: r["from"] for r in data["query"].get("redirects", [])}
        for page in data["query"]["pages"].values():
            src = page.get("thumbnail", {}).get("source")
            if src:
                found[back.get(page["title"], page["title"])] = src
    return {n: (t, found.get(t)) for n, t in titles.items()}


def inside(pt, poly):
    x, y = pt
    hit = False
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % len(poly)]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            hit = not hit
    return hit


def poly_area(p):
    return abs(sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1]
                   for i in range(len(p)))) / 2


def build_zones(areas, tracks):
    regions = [a for a in areas if len(a["t"]) > 1]
    zone_of = {}

    def assign(track, name, size):
        if track not in zone_of or size < zone_of[track][1]:
            zone_of[track] = (name, size)

    for r in regions:
        for t in r["t"]:
            assign(t, r["n"], poly_area(r["p"]))
    for a in areas:
        if len(a["t"]) > 1:
            continue
        pts = a["p"]
        c = (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))
        hits = [r for r in regions if inside(c, r["p"])] or [r for r in regions if inside(pts[0], r["p"])]
        if hits:
            r = min(hits, key=lambda r: poly_area(r["p"]))
            assign(a["t"][0], r["n"], poly_area(r["p"]))
            continue
        box = next((k for k in KINGDOMS if k[1] <= c[0] <= k[2] and k[3] <= c[1] <= k[4]), None)
        if box:
            assign(a["t"][0], box[0], 1e12)
    # Dungeons and instances sit at scrambled offsets on the wiki's composite map,
    # so place them by the place names in their unlock text instead.
    for t, track in enumerate(tracks):
        if t not in zone_of:
            text = track["unlock"].lower()
            name = next((z for words, z in KEYWORDS if any(w in text for w in words)), "Elsewhere")
            zone_of[t] = (name, 1e12)

    grouped = {}
    for t, (name, _) in zone_of.items():
        grouped.setdefault(name, []).append(t)
    def order(n):
        lv = LEVELS.get(n)
        return (n == "Elsewhere", lv is None, sum(lv) / 2 if lv else 0, n.lower())

    images = zone_images(list(grouped))
    return [{"n": n, "lv": LEVELS.get(n), "page": images[n][0], "img": images[n][1],
             "t": sorted(grouped[n], key=lambda t: tracks[t]["name"].lower())}
            for n in sorted(grouped, key=order)]


if __name__ == "__main__":
    main()
