// Game tile (x, y) to image pixel: px = (x - X0) * S, py = (Y0 - y) * S.
// ponytail: calibrated by eye against the music polygons, tweak if they drift.
const MAPS = {
  // sea: pixel to sample for the page backdrop, default is the most common non-black colour
  // (open water). fillBlack: paint unmapped
  // (fully black) 64-tile squares in that colour so the old map blends into the sea.
  modern: { src: "https://cdn.runescape.com/assets/img/external/oldschool/world-map/2025-11-18/osrs_world_map.jpg", w: 6145, h: 4353, X0: 966, Y0: 4220, S: 2, sea: [6, 6] },
  y2007: { src: "https://oldschool.runescape.wiki/images/World_Map_24_July_2007.png", w: 3712, h: 3328, X0: 2048, Y0: 4160, S: 2, fillBlack: true },
};

// Loads a map through a canvas: samples its sea colour and, for fillBlack maps, replaces
// black squares. Falls back to the plain image if the host blocks pixel access.
const prepared = {};
function prepareMap(name, fill) {
  const m = MAPS[name];
  fill = fill && m.fillBlack;
  prepared[name + fill] ??= (async () => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.src = m.src;
    const c = document.createElement("canvas");
    c.width = m.w;
    c.height = m.h;
    const g = c.getContext("2d", { willReadFrequently: true });
    let data;
    try {
      await im.decode();
      g.drawImage(im, 0, 0);
      data = g.getImageData(0, 0, m.w, m.h);
    } catch {
      return { src: m.src, sea: null };
    }
    const d = data.data;
    const at = (x, y) => (y * m.w + x) * 4;
    const sea = m.sea ? [0, 1, 2].map((n) => d[at(...m.sea) + n]) : (() => {
      const counts = new Map();
      for (let y = 0; y < m.h; y += 16) for (let x = 0; x < m.w; x += 16) {
        const i = at(x, y);
        const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
        if (key) counts.set(key, (counts.get(key) || 0) + 1);
      }
      const top = [...counts].sort((a, b) => b[1] - a[1])[0][0];
      return [top >> 16, (top >> 8) & 255, top & 255];
    })();
    if (!fill) return { src: m.src, sea: `rgb(${sea.join(",")})` };
    const B = 64 * m.S;
    const isBlack = (x, y) => { const i = at(x, y); return d[i] === 0 && d[i + 1] === 0 && d[i + 2] === 0; };
    for (let by = 0; by < m.h; by += B) {
      for (let bx = 0; bx < m.w; bx += B) {
        const w = Math.min(B, m.w - bx), h = Math.min(B, m.h - by);
        let black = 0, total = 0;
        for (let y = by; y < by + h; y += 8) for (let x = bx; x < bx + w; x += 8) { total++; if (isBlack(x, y)) black++; }
        if (black < total * 0.85) continue; // real map content, keep (labels may spill into a dead square)
        for (let y = by; y < by + h; y++) for (let x = bx; x < bx + w; x++) {
          if (!isBlack(x, y)) continue;
          const i = at(x, y); d[i] = sea[0]; d[i + 1] = sea[1]; d[i + 2] = sea[2];
        }
      }
    }
    g.putImageData(data, 0, 0);
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    return { src: URL.createObjectURL(blob), sea: `rgb(${sea.join(",")})` };
  })();
  return prepared[name + fill];
}

const LVL_MAX = 130; // midpoint level that reads as fully red
const levels = (z) => !z?.lv ? "lvl ?" : z.lv[1] <= 5 ? "safe" : `lvl ${z.lv[0]} to ${z.lv[1]}`;
const zoneOf = [];
ZONES.forEach((z, zi) => z.t.forEach((t) => (zoneOf[t] = zi)));

const map = (() => {
  const el = document.getElementById("map");
  const world = document.getElementById("world");
  const img = document.getElementById("map-img");
  const svg = document.getElementById("areas");
  const tooltip = document.getElementById("tooltip");
  let M = MAPS[localStorage.getItem("oldmap") !== "0" ? "y2007" : "modern"];
  let hideUnknown = localStorage.getItem("hideunknown") !== "0";
  const view = { x: 0, y: 0, s: 0.6 };
  const toPx = ([x, y]) => [(x - M.X0) * M.S, (M.Y0 - y) * M.S];
  const fromPx = ([px, py]) => [px / M.S + M.X0, M.Y0 - py / M.S];
  const zoneOfArea = AREAS.map((a) => zoneOf[a.t[0]]);

  const polys = AREAS.map((a, i) => {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    p.dataset.i = i;
    return p;
  });
  // Big regions first so small areas on top win the hit test.
  const area = (pts) => Math.abs(pts.reduce((s, [x, y], i) => {
    const [nx, ny] = pts[(i + 1) % pts.length];
    return s + x * ny - nx * y;
  }, 0));
  svg.append(...polys.slice().sort((a, b) => area(AREAS[b.dataset.i].p) - area(AREAS[a.dataset.i].p)));

  // Dungeons and instances live at scrambled offsets on the wiki's composite map,
  // outside the official images. Those areas have no place on the map.
  const onMap = (a) => a.p.every((pt) => {
    const [x, y] = toPx(pt);
    return x >= 0 && y >= 0 && x <= M.w && y <= M.h;
  });
  const loadImage = () => {
    const m = M, fill = hideUnknown;
    prepareMap(Object.keys(MAPS).find((k) => MAPS[k] === m), fill).then(({ src, sea }) => {
      if (M !== m || hideUnknown !== fill) return;
      img.src = src;
      if (sea) document.documentElement.style.setProperty("--sea", sea);
    });
  };
  const layout = () => {
    img.src = M.src;
    loadImage();
    img.style.width = svg.style.width = `${M.w}px`;
    img.style.height = svg.style.height = `${M.h}px`;
    svg.setAttribute("viewBox", `0 0 ${M.w} ${M.h}`);
    polys.forEach((p, i) => {
      p.setAttribute("points", AREAS[i].p.map((pt) => toPx(pt).map((v) => v.toFixed(1)).join(",")).join(" "));
      p.classList.toggle("offmap", !onMap(AREAS[i]));
    });
  };

  const apply = () => {
    world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.s})`;
    localStorage.setItem("view", JSON.stringify(view));
  };
  const minScale = () => Math.min(el.clientWidth / M.w, el.clientHeight / M.h) * 0.9;
  const clamp = () => {
    view.s = Math.min(Math.max(view.s, minScale()), 3);
    const w = M.w * view.s, h = M.h * view.s;
    view.x = w < el.clientWidth ? (el.clientWidth - w) / 2 : Math.min(Math.max(view.x, el.clientWidth - w), 0);
    view.y = h < el.clientHeight ? (el.clientHeight - h) / 2 : Math.min(Math.max(view.y, el.clientHeight - h), 0);
  };
  const zoomAt = (cx, cy, factor) => {
    const s = Math.min(Math.max(view.s * factor, minScale()), 3);
    view.x = cx - (cx - view.x) * (s / view.s);
    view.y = cy - (cy - view.y) * (s / view.s);
    view.s = s;
    clamp();
    apply();
  };
  const centerOn = (gx, gy, s = view.s) => {
    const [px, py] = toPx([gx, gy]);
    view.s = s;
    view.x = el.clientWidth / 2 - px * s;
    view.y = el.clientHeight / 2 - py * s;
    clamp();
    apply();
  };
  const centerGame = () => fromPx([(el.clientWidth / 2 - view.x) / view.s, (el.clientHeight / 2 - view.y) / view.s]);

  let drag = null;
  let hoverZone = -1;
  const setHoverZone = (zi) => {
    if (zi === hoverZone) return;
    hoverZone = zi;
    polys.forEach((p, k) => p.classList.toggle("zone-hover", zoneOfArea[k] === zi));
  };
  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest(".map-controls, .map-toggles")) return;
    drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener("pointermove", (e) => {
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > 4) drag.moved = true;
      view.x = drag.vx + dx;
      view.y = drag.vy + dy;
      clamp();
      apply();
    }
    const i = e.target.dataset?.i;
    tooltip.hidden = i === undefined;
    setHoverZone(i === undefined ? -1 : zoneOfArea[i]);
    if (i !== undefined) {
      const a = AREAS[i];
      const z = ZONES[zoneOfArea[i]];
      tooltip.textContent = `${a.n} (${levels(z)}): ${a.t.map((t) => TRACKS[t].name).join(", ")}`;
      const r = el.getBoundingClientRect();
      tooltip.style.left = `${e.clientX - r.left + 14}px`;
      tooltip.style.top = `${e.clientY - r.top + 14}px`;
    }
  });
  el.addEventListener("pointerup", (e) => {
    const moved = drag?.moved;
    drag = null;
    // Pointer capture retargets events to the map div, so look up the polygon by position.
    const i = document.elementFromPoint(e.clientX, e.clientY)?.dataset?.i;
    if (!moved && i !== undefined) el.dispatchEvent(new CustomEvent("areaclick", { detail: Number(i) }));
  });
  el.addEventListener("pointerleave", () => { tooltip.hidden = true; setHoverZone(-1); });
  el.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = el.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.002));
  }, { passive: false });
  el.addEventListener("dblclick", (e) => {
    if (e.target.closest(".map-controls")) return;
    const r = el.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, 1.6);
  });
  window.addEventListener("resize", () => { clamp(); apply(); });

  layout();
  const saved = JSON.parse(localStorage.getItem("view") || "null");
  if (saved) { Object.assign(view, saved); clamp(); apply(); }
  else centerOn(3222, 3218);

  return {
    setMap(name) {
      if (MAPS[name] === M) return;
      const [gx, gy] = centerGame();
      M = MAPS[name];
      layout();
      centerOn(gx, gy);
    },
    setHideUnknown(on) {
      hideUnknown = on;
      loadImage();
    },
    zoomBy(factor) { zoomAt(el.clientWidth / 2, el.clientHeight / 2, factor); },
    zoomOut() {
      view.s = minScale();
      clamp();
      apply();
    },
    setVisible(isTrackVisible) {
      polys.forEach((p, i) => p.classList.toggle("hidden", !AREAS[i].t.some(isTrackVisible)));
    },
    highlight(track) {
      polys.forEach((p, i) => p.classList.toggle("playing", AREAS[i].t.includes(track)));
    },
    focus(track) {
      const i = polys.findIndex((p, k) => AREAS[k].t.includes(track) && !p.classList.contains("hidden") && !p.classList.contains("offmap"));
      if (i < 0) return this.zoomOut();
      const pts = AREAS[i].p;
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      centerOn(cx, cy, Math.max(view.s, 0.8));
    },
  };
})();
