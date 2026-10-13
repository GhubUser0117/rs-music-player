// Game tile (x, y) to image pixel: px = (x - X0) * SCALE, py = (Y0 - y) * SCALE.
// ponytail: calibrated by eye against the official map, tweak these if polygons drift.
const CAL = { X0: 966, Y0: 4220, SCALE: 2.0 };
const IMG_W = 6145, IMG_H = 4353;

const map = (() => {
  const el = document.getElementById("map");
  const world = document.getElementById("world");
  const svg = document.getElementById("areas");
  const tooltip = document.getElementById("tooltip");
  const view = { x: 0, y: 0, s: 0.6 };
  const toPx = ([x, y]) => [(x - CAL.X0) * CAL.SCALE, (CAL.Y0 - y) * CAL.SCALE];

  // Dungeons and instances live at scrambled offsets on the wiki's composite map,
  // outside the official image. Those areas have no place on this map.
  const onMap = (a) => a.p.every((pt) => {
    const [x, y] = toPx(pt);
    return x >= 0 && y >= 0 && x <= IMG_W && y <= IMG_H;
  });
  const polys = AREAS.map((a, i) => {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    p.setAttribute("points", a.p.map((pt) => toPx(pt).map((v) => v.toFixed(1)).join(",")).join(" "));
    p.dataset.i = i;
    if (!onMap(a)) p.classList.add("offmap");
    return p;
  });
  // Big regions first so small areas on top win the hit test.
  const area = (pts) => Math.abs(pts.reduce((s, [x, y], i) => {
    const [nx, ny] = pts[(i + 1) % pts.length];
    return s + x * ny - nx * y;
  }, 0));
  svg.setAttribute("viewBox", `0 0 ${IMG_W} ${IMG_H}`);
  svg.append(...polys.slice().sort((a, b) => area(AREAS[b.dataset.i].p) - area(AREAS[a.dataset.i].p)));

  const apply = () => {
    world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.s})`;
    localStorage.setItem("view", JSON.stringify(view));
  };
  const minScale = () => Math.min(el.clientWidth / IMG_W, el.clientHeight / IMG_H) * 0.9;
  const clamp = () => {
    view.s = Math.min(Math.max(view.s, minScale()), 3);
    const w = IMG_W * view.s, h = IMG_H * view.s;
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

  let drag = null;
  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
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
    if (i !== undefined) {
      const a = AREAS[i];
      const z = ZONES[zoneOf[a.t[0]]];
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
  el.addEventListener("pointerleave", () => (tooltip.hidden = true));
  el.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = el.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.002));
  }, { passive: false });
  el.addEventListener("dblclick", (e) => {
    const r = el.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, 1.6);
  });
  window.addEventListener("resize", () => { clamp(); apply(); });

  const saved = JSON.parse(localStorage.getItem("view") || "null");
  if (saved) Object.assign(view, saved);
  else {
    const [lx, ly] = toPx([3222, 3218]);
    view.x = el.clientWidth / 2 - lx * view.s;
    view.y = el.clientHeight / 2 - ly * view.s;
  }
  clamp();
  apply();

  return {
    setVisible(isTrackVisible) {
      polys.forEach((p, i) => p.classList.toggle("hidden", !AREAS[i].t.some(isTrackVisible)));
    },
    highlight(track) {
      polys.forEach((p, i) => p.classList.toggle("playing", AREAS[i].t.includes(track)));
    },
    zoomOut() {
      view.s = minScale();
      view.x = (el.clientWidth - IMG_W * view.s) / 2;
      view.y = (el.clientHeight - IMG_H * view.s) / 2;
      apply();
    },
    focus(track) {
      const i = polys.findIndex((p, k) => AREAS[k].t.includes(track) && !p.classList.contains("hidden") && !p.classList.contains("offmap"));
      if (i < 0) return this.zoomOut();
      const pts = AREAS[i].p.map(toPx);
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      view.s = Math.max(view.s, 0.8);
      view.x = el.clientWidth / 2 - cx * view.s;
      view.y = el.clientHeight / 2 - cy * view.s;
      clamp();
      apply();
    },
  };
})();
