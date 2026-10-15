const BASE = "https://oldschool.runescape.wiki/images/";
const WIKI = "https://oldschool.runescape.wiki/w/";
const $ = (id) => document.getElementById(id);

const audio = $("audio");
const list = $("list");
const byName = (a, b) => TRACKS[a].name.localeCompare(TRACKS[b].name);

const state = {
  index: -1,
  ctx: null, // { name, tracks, played } while playing from a zone, null for the whole list
  shuffle: localStorage.getItem("shuffle") === "1",
  repeat: localStorage.getItem("repeat") === "1",
  byZone: localStorage.getItem("byzone") !== "0",
  oldMap: localStorage.getItem("oldmap") !== "0",
  visible: [],
  visibleSet: new Set(),
};

const FILTERS = {
  all: () => true,
  f2p: (t) => !t.p2p,
  p2p: (t) => t.p2p,
  holiday: (t) => t.holiday,
  exclusive: (t) => t.exclusive,
};

const fmt = (s) => {
  if (!Number.isFinite(s)) return "00:00";
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

const zoneCtx = (name, tracks) => ({ name, tracks: [...new Set(tracks)].sort(byName), played: new Set() });
const fullImage = (thumb) => thumb.replace(/\/images\/thumb\/(.+?)\/\d+px-[^?]+/, "/images/$1").replace(/\?.*$/, "");

function makeLi(i) {
  const t = TRACKS[i];
  const li = document.createElement("li");
  li.dataset.index = i;
  li.className = `${t.p2p ? "p2p" : ""} ${t.holiday ? "holiday" : ""} ${i === state.index ? "playing" : ""}`;
  li.innerHTML = `<span class="name"></span><span class="len">${t.len}</span>`;
  li.querySelector(".name").textContent = t.name;
  return li;
}

function render() {
  const q = $("search").value.trim().toLowerCase();
  const keep = FILTERS[$("filter").value];
  const maxYear = Number($("era").value);
  const inZone = new Set(q ? ZONES.flatMap((z) => (z.n.toLowerCase().includes(q) ? z.t : [])) : []);
  state.visible = TRACKS.flatMap((t, i) =>
    keep(t) &&
    Number(t.date.slice(-4)) <= maxYear &&
    (!q || t.name.toLowerCase().includes(q) || t.unlock.toLowerCase().includes(q) || inZone.has(i))
      ? [i]
      : []
  );
  state.visibleSet = new Set(state.visible);

  if (state.byZone) {
    list.replaceChildren(
      ...ZONES.flatMap((z, zi) => {
        const items = z.t.filter((i) => state.visibleSet.has(i));
        if (!items.length) return [];
        const d = document.createElement("details");
        d.className = "zone";
        d.dataset.zone = zi;
        d.open = items.includes(state.index);
        d.innerHTML = `<summary></summary><ol></ol>`;
        const lvl = Object.assign(document.createElement("span"), { className: `lvl ${z.lv ? "" : "unknown"}`, textContent: levels(z) });
        if (z.lv) lvl.style.setProperty("--hue", 120 - Math.min((z.lv[0] + z.lv[1]) / 2, LVL_MAX) / LVL_MAX * 120);
        d.querySelector("summary").append(z.n, " ", Object.assign(document.createElement("span"), { className: "count", textContent: `${items.length} · ` }), lvl);
        d.querySelector("ol").append(...items.map(makeLi));
        return [d];
      })
    );
  } else {
    list.replaceChildren(...state.visible.map(makeLi));
  }
  $("status").textContent = `Tracks: ${state.visible.length} / ${TRACKS.length}`;
  map.setVisible((i) => state.visibleSet.has(i));
  showQueue();
}

// Tracks of the current context after filters; the list itself when nothing is left.
function queue() {
  const pool = state.ctx ? state.ctx.tracks.filter((i) => state.visibleSet.has(i)) : state.visible;
  return pool.length ? pool : state.visible;
}

// Next zone (by level order) that still has tracks after filters, wrapping around.
function nextZone(dir) {
  let zi = ZONES.findIndex((z) => z.n === state.ctx.name);
  if (zi < 0) zi = zoneOf[state.index] ?? 0;
  for (let k = 1; k <= ZONES.length; k++) {
    const z = ZONES[(zi + dir * k + ZONES.length * k) % ZONES.length];
    if (z.t.some((i) => state.visibleSet.has(i))) return z;
  }
  return null;
}

// What plays after a step: the track, plus a new context when the zone is done.
function resolve(dir) {
  const pool = queue();
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const hop = () => {
    const z = nextZone(dir);
    if (!z) return { i: state.index };
    const ctx = zoneCtx(z.n, z.t);
    const tracks = ctx.tracks.filter((i) => state.visibleSet.has(i));
    return { i: state.shuffle ? pick(tracks) : tracks[dir > 0 ? 0 : tracks.length - 1], ctx };
  };
  if (state.shuffle) {
    const left = pool.filter((i) => i !== state.index && !state.ctx?.played.has(i));
    if (left.length) return { i: pick(left) };
    if (state.ctx) return hop();
    const rest = state.visible.filter((i) => i !== state.index);
    return { i: rest.length ? pick(rest) : state.index };
  }
  const pos = pool.indexOf(state.index) + dir;
  if (state.ctx && (pos < 0 || pos >= pool.length)) return hop();
  return { i: pool[(pos + pool.length) % pool.length] };
}

function step(dir) {
  if (!state.visible.length) return;
  const r = resolve(dir);
  if (r.ctx) state.ctx = r.ctx;
  play(r.i);
  map.focus(r.i);
}

function showQueue() {
  const box = $("now-queue");
  box.replaceChildren();
  const ctx = state.ctx;
  const pool = ctx ? queue() : [];
  $("now-from").textContent = ctx ? `${ctx.name} (${pool.indexOf(state.index) + 1} of ${pool.length})` : "All music";
  if (ctx && pool.length <= 15) {
    pool.forEach((t) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = TRACKS[t].name;
      b.classList.toggle("current", t === state.index);
      b.classList.toggle("done", ctx.played.has(t) && t !== state.index);
      b.addEventListener("click", () => play(t));
      box.append(b);
    });
  }
  const next = state.index < 0 || !state.visible.length ? null : state.shuffle ? "shuffle" : TRACKS[resolve(1).i].name;
  $("now-next").textContent = next ?? "";
}

function showZone(i) {
  const z = ZONES[zoneOf[i]];
  $("now-fig").hidden = !z?.page;
  $("now-img").hidden = !z?.img;
  if (z?.img) $("now-img").src = z.img;
  if (z?.page) {
    $("now-zone").textContent = z.page;
    $("now-zone").href = WIKI + encodeURIComponent(z.page.replaceAll(" ", "_"));
  }
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: TRACKS[i].name,
      artist: z?.n ?? "Old School RuneScape",
      album: "Old School RuneScape",
      artwork: z?.img ? [{ src: z.img, sizes: "400x400", type: "image/png" }] : [],
    });
  }
}

// Open the playing track's zone group, close the ones the user did not open by hand.
function revealInList(i) {
  list.querySelector(".playing")?.classList.remove("playing");
  const li = list.querySelector(`[data-index="${i}"]`);
  li?.classList.add("playing");
  const group = li?.closest("details");
  if (group) {
    list.querySelectorAll("details[open]").forEach((d) => { if (d !== group && !d.dataset.user) d.open = false; });
    group.open = true;
  }
  li?.scrollIntoView({ block: "nearest" });
}

function play(i) {
  const t = TRACKS[i];
  if (!t) return;
  state.index = i;
  state.ctx?.played.add(i);
  audio.src = BASE + encodeURIComponent(t.file);
  audio.play().catch(armAutoplay);
  localStorage.setItem("last", i);
  localStorage.setItem("ctx", state.ctx?.name ?? "");
  history.replaceState(null, "", `#${encodeURIComponent(t.name)}`);

  $("now-title").textContent = t.name;
  $("now-meta").textContent = `${t.p2p ? "Members" : "Free to play"} · ${t.len} · ${t.date}`;
  $("now-unlock").innerHTML = "";
  $("now-unlock").append(t.unlock + " ", Object.assign(document.createElement("a"), {
    href: WIKI + encodeURIComponent(t.name.replaceAll(" ", "_")), target: "_blank", textContent: "[wiki]",
  }));
  document.title = `${t.name} · OSRS Music`;
  showZone(i);
  revealInList(i);
  map.highlight(i);
  showQueue();
}

// Browsers block sound until the page has been clicked or typed in. Wait for that, then start.
function armAutoplay() {
  document.body.classList.add("needs-click");
  const go = () => {
    document.body.classList.remove("needs-click");
    audio.play().catch(() => {});
  };
  document.addEventListener("pointerdown", go, { once: true, capture: true });
  document.addEventListener("keydown", go, { once: true, capture: true });
}

function togglePlay() {
  if (state.index < 0) return step(1);
  if (!audio.src) return play(state.index); // restored from a previous visit, nothing loaded yet
  audio.paused ? audio.play() : audio.pause();
}

function setToggle(key, on) {
  state[key] = on;
  $(key).classList.toggle("on", on);
  localStorage.setItem(key, on ? "1" : "0");
}

list.addEventListener("click", (e) => {
  const summary = e.target.closest("summary");
  if (summary) {
    // Default action flips it after this handler, so "closed now" means the user is opening it.
    const d = summary.parentElement;
    if (d.open) delete d.dataset.user; else d.dataset.user = "1";
    return;
  }
  const li = e.target.closest("li");
  if (!li) return;
  const i = Number(li.dataset.index);
  const zi = li.closest("details")?.dataset.zone;
  state.ctx = zi === undefined ? null : zoneCtx(ZONES[zi].n, ZONES[zi].t);
  play(i);
  map.focus(i);
});
$("map").addEventListener("areaclick", (e) => {
  const a = AREAS[e.detail];
  const z = ZONES[zoneOf[a.t[0]]];
  state.ctx = a.t.length > 1 ? zoneCtx(a.n, a.t) : z ? zoneCtx(z.n, z.t) : null;
  // Region click starts at the top of its sorted queue; a single-track spot plays that track.
  play(a.t.length > 1 ? queue()[0] : a.t[0]);
});
$("search").addEventListener("input", render);
$("filter").addEventListener("change", render);
$("era").addEventListener("change", render);
$("byzone").addEventListener("change", (e) => {
  state.byZone = e.target.checked;
  localStorage.setItem("byzone", state.byZone ? "1" : "0");
  $("expand").disabled = $("collapse").disabled = !state.byZone;
  render();
});
$("oldmap").addEventListener("change", (e) => {
  state.oldMap = e.target.checked;
  localStorage.setItem("oldmap", state.oldMap ? "1" : "0");
  map.setMap(state.oldMap ? "y2007" : "modern");
});
$("hideunknown").addEventListener("change", (e) => {
  localStorage.setItem("hideunknown", e.target.checked ? "1" : "0");
  map.setHideUnknown(e.target.checked);
});
$("hideunknown").checked = localStorage.getItem("hideunknown") !== "0";
$("side").addEventListener("click", () => {
  const left = document.body.classList.toggle("side-left");
  localStorage.setItem("side", left ? "left" : "right");
});
document.body.classList.toggle("side-left", localStorage.getItem("side") === "left");
const setAll = (open) => () => list.querySelectorAll("details").forEach((d) => {
  d.open = open;
  if (open) d.dataset.user = "1"; else delete d.dataset.user;
});
$("expand").addEventListener("click", setAll(true));
$("collapse").addEventListener("click", setAll(false));
$("zoom-in").addEventListener("click", () => map.zoomBy(1.5));
$("zoom-out").addEventListener("click", () => map.zoomBy(1 / 1.5));
$("locate").addEventListener("click", () => state.index >= 0 && map.focus(state.index));
$("play").addEventListener("click", togglePlay);
$("next").addEventListener("click", () => step(1));
$("prev").addEventListener("click", () => step(-1));
$("shuffle").addEventListener("click", () => { setToggle("shuffle", !state.shuffle); showQueue(); });
$("repeat").addEventListener("click", () => setToggle("repeat", !state.repeat));
$("volume").addEventListener("input", (e) => {
  audio.volume = e.target.value;
  localStorage.setItem("volume", e.target.value);
});
$("progress").addEventListener("click", (e) => {
  if (audio.duration) audio.currentTime = (e.offsetX / e.currentTarget.clientWidth) * audio.duration;
});
$("now-img").addEventListener("click", () => {
  $("lightbox-img").src = fullImage($("now-img").src);
  $("lightbox").showModal();
});
$("lightbox").addEventListener("click", () => $("lightbox").close());

audio.addEventListener("play", () => ($("play").innerHTML = "&#10074;&#10074;"));
audio.addEventListener("pause", () => ($("play").innerHTML = "&#9654;"));
audio.addEventListener("timeupdate", () => {
  $("t-cur").textContent = fmt(audio.currentTime);
  $("t-dur").textContent = fmt(audio.duration);
  $("progress-fill").style.width = audio.duration ? `${(audio.currentTime / audio.duration) * 100}%` : "0";
});
audio.addEventListener("ended", () => (state.repeat ? play(state.index) : step(1)));
audio.addEventListener("error", () => {
  $("now-unlock").textContent = `Could not load ${TRACKS[state.index]?.file}. Skipping.`;
  setTimeout(() => step(1), 1500);
});

if ("mediaSession" in navigator) {
  const ms = navigator.mediaSession;
  ms.setActionHandler("play", () => togglePlay());
  ms.setActionHandler("pause", () => audio.pause());
  ms.setActionHandler("previoustrack", () => step(-1));
  ms.setActionHandler("nexttrack", () => step(1));
  ms.setActionHandler("seekto", (d) => { audio.currentTime = d.seekTime; });
  audio.addEventListener("play", () => (ms.playbackState = "playing"));
  audio.addEventListener("pause", () => (ms.playbackState = "paused"));
}

document.addEventListener("keydown", (e) => {
  if (e.target.matches("input, select")) return;
  if (e.code === "Space") { e.preventDefault(); togglePlay(); }
  if (e.code === "ArrowRight") step(1);
  if (e.code === "ArrowLeft") step(-1);
});

audio.volume = $("volume").value = localStorage.getItem("volume") ?? 0.7;
setToggle("shuffle", state.shuffle);
setToggle("repeat", state.repeat);
$("byzone").checked = state.byZone;
$("expand").disabled = $("collapse").disabled = !state.byZone;
$("oldmap").checked = state.oldMap;
map.setMap(state.oldMap ? "y2007" : "modern");
render();

const linked = TRACKS.findIndex((t) => t.name === decodeURIComponent(location.hash.slice(1)));
const firstVisit = localStorage.getItem("last") === null;
const last = firstVisit ? TRACKS.findIndex((t) => t.name === "Autumn Voyage") : Number(localStorage.getItem("last"));
if (linked >= 0) {
  play(linked);
  map.focus(linked);
} else if (TRACKS[last]) {
  state.index = last;
  const z = ZONES.find((z) => z.n === (firstVisit ? "Lumbridge" : localStorage.getItem("ctx")));
  if (z) state.ctx = zoneCtx(z.n, z.t);
  $("now-title").textContent = TRACKS[last].name;
  $("now-unlock").textContent = TRACKS[last].unlock;
  showZone(last);
  map.highlight(last);
  render();
}
