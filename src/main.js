import "./styles.css";
import { renderApp, showView, toast, formatTime, escapeHtml, setStatus } from "./ui.js";
import { ensureAuthedOrRedirect, api, apiRaw } from "./spotify.js";
import { createNavigator } from "./nav.js";

const POLL = parseInt(import.meta.env.VITE_POLL_INTERVAL_MS || "1500", 10);
const NO_PLAYBACK_TO_STANDBY_MS = 3 * 60_000;

// Views rendered by ui.js containers
// Now | Library | Playlist | Queue | Devices | LastPlayed | Standby
let currentView = "Now";

// UI state machine (appliance flow)
let uiState = "LIBRARY"; // LIBRARY | NOW_PLAYING | LAST_PLAYED | STANDBY

// Data
let playlists = [];
let selectedPlaylist = null;
let playlistTracks = [];
let queueItems = [];
let devices = [];
let selectedDeviceId = null;

let lastPlayed = null; // { name, artist, album, artUrl, atMs, rgb }
let noPlaybackSince = null;

let now = {
  id: null,
  name: "Not playing",
  artist: "-",
  album: "-",
  artUrl: null,
  isPlaying: false,
  progressMs: 0,
  durationMs: 0
};

function $(id){ return document.getElementById(id); }

/* ---------------- LED simulation + Now bg ---------------- */

let ledOn = true;
let ledBrightness = 0.7; // 0..1
let ledColor = { r: 0, g: 0, b: 0 };    // current effective (already brightness applied)
let ledTarget = { r: 0, g: 0, b: 0 };   // target effective
let _ledAnim = null;

function clamp01(x){ return Math.max(0, Math.min(1, x)); }

function setNowPlayingBackground(rgb) {
  const r = Math.round(rgb.r), g = Math.round(rgb.g), b = Math.round(rgb.b);
  document.documentElement.style.setProperty("--np-bg", `rgb(${r},${g},${b})`);

  const lum = 0.2126*r + 0.7152*g + 0.0722*b;
  document.documentElement.style.setProperty("--np-fg", lum < 128 ? "#ffffff" : "#111111");
}

function updateLedIndicator() {
  const box = $("ledColorBox");
  const label = $("ledLabel");
  if (!box || !label) return;

  if (!ledOn) {
    box.style.backgroundColor = "#000";
    box.style.opacity = "0.25";
    label.textContent = `LED OFF (${Math.round(ledBrightness*100)}%)`;
    return;
  }

  const r = Math.round(ledColor.r), g = Math.round(ledColor.g), b = Math.round(ledColor.b);
  box.style.backgroundColor = `rgb(${r},${g},${b})`;
  box.style.opacity = "1";
  label.textContent = `LED ${Math.round(ledBrightness*100)}%`;
}

function animateLedTo(target, durationMs = 900) {
  if (_ledAnim) cancelAnimationFrame(_ledAnim);
  const start = { ...ledColor };
  const t0 = performance.now();
  const d = Math.max(80, durationMs);

  const step = (t) => {
    const k = Math.min(1, (t - t0) / d);
    ledColor.r = start.r + (target.r - start.r) * k;
    ledColor.g = start.g + (target.g - start.g) * k;
    ledColor.b = start.b + (target.b - start.b) * k;
    updateLedIndicator();
    if (k < 1) _ledAnim = requestAnimationFrame(step);
  };
  _ledAnim = requestAnimationFrame(step);
}

function setLedBaseColor(baseRgb, transitionMs = 900) {
  // baseRgb is pre-brightness (0..255)
  if (!ledOn || uiState === "STANDBY") {
    ledTarget = { r: 0, g: 0, b: 0 };
    animateLedTo(ledTarget, Math.min(transitionMs, 700));
    return;
  }
  ledTarget = {
    r: baseRgb.r * ledBrightness,
    g: baseRgb.g * ledBrightness,
    b: baseRgb.b * ledBrightness
  };
  animateLedTo(ledTarget, transitionMs);
}

function applyLedBrightness(newB, transitionMs = 150) {
  ledBrightness = clamp01(newB);
  // Re-apply current base color (use lastPlayed rgb if present, else neutral)
  const base = (uiState === "NOW_PLAYING" && lastPlayed?.rgb) ? lastPlayed.rgb : (lastPlayed?.rgb || { r: 30, g: 30, b: 30 });
  setLedBaseColor(base, transitionMs);
}

function setLedOnOff(on) {
  ledOn = !!on;
  const base = lastPlayed?.rgb || { r: 30, g: 30, b: 30 };
  setLedBaseColor(base, 400);
  updateLedIndicator();
}

// Simple average-color extractor (may fail due to CORS)
async function getAverageColor(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        const w = canvas.width = 40;
        const h = canvas.height = 40;
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;

        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3];
          if (a < 200) continue;
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          count++;
        }
        if (!count) return resolve({ r: 30, g: 30, b: 30 });
        resolve({ r: r / count, g: g / count, b: b / count });
      } catch {
        resolve({ r: 30, g: 30, b: 30 });
      }
    };
    img.onerror = () => resolve({ r: 30, g: 30, b: 30 });
    img.src = url;
  });
}

/* ---------------- Navigation ---------------- */

const nav = createNavigator({
  getItems: () => Array.from(document.querySelectorAll(`#view${currentView} .nav-item`)),
  onActivate: (el) => el.click(),
  onBack: () => back(),
  onAnyInput: () => notifyUserInput()
});

function goto(view) {
  currentView = view;
  showView(view);
  nav.setIndex(0);
}

function notifyUserInput() {
  // Wake behavior: any input in standby wakes to Library
  if (uiState === "STANDBY") {
    setState("LIBRARY");
  }
}

function back() {
  if (currentView === "Playlist") {
    goto("Library");
    renderLibraryView();
  } else if (currentView === "Queue") {
    goto("Now");
    renderNowView();
  } else if (currentView === "Devices") {
    goto("Now");
    renderNowView();
  } else if (currentView === "Library") {
    goto("Now");
    renderNowView();
  }
}

function setState(next) {
  uiState = next;

  if (next === "NOW_PLAYING") {
    goto("Now");
    renderNowView();
    // LED stays on with track color
  } else if (next === "LIBRARY") {
    goto("Library");
    renderLibraryView();
    // Leaving standby: restore LED color if on
    if (lastPlayed?.rgb) setLedBaseColor(lastPlayed.rgb, 500);
  } else if (next === "LAST_PLAYED") {
    goto("LastPlayed");
    renderLastPlayedView();
    // Keep last color (dim slightly for "no playback" vibe)
    if (lastPlayed?.rgb) {
      const dim = Math.max(0.12, ledBrightness * 0.5);
      const prev = ledBrightness;
      ledBrightness = dim;
      setLedBaseColor(lastPlayed.rgb, 450);
      ledBrightness = prev; // keep user setting; only output is dimmed via setLedBaseColor call above? (we used temp dim)
    }
  } else if (next === "STANDBY") {
    goto("Standby");
    renderStandbyView();
    // LED must turn off in standby (smooth fade)
    setLedBaseColor({ r: 0, g: 0, b: 0 }, 600);
  }
}

/* ---------------- Renders ---------------- */

function renderNowView(){
  $("viewNow").innerHTML = `
    <div class="now">
      <div class="nowTop">
        <div>
          <div class="cover">${now.artUrl ? `<img src="${now.artUrl}" alt="cover">` : ""}</div>
        </div>

        <div class="meta">
          <h2>${escapeHtml(now.name)}</h2>

          <div class="sub">
            <div>${escapeHtml(now.artist)}</div>
            <div>${escapeHtml(now.album)}</div>
            <div id="statusLine"> </div>
          </div>

          <div class="barRow">
            <div class="time">${formatTime(now.progressMs)}</div>
            <input id="progress" class="progress" type="range"
              min="0" max="${Math.max(1, now.durationMs)}"
              value="${Math.min(now.progressMs, now.durationMs)}" />
            <div class="time">${formatTime(now.durationMs)}</div>
          </div>
        </div>
      </div>

      <div class="bottomBar">
        <button id="btnPrev" class="iconBtn big nav-item" title="Previous">⏮</button>
        <button id="btnPlay" class="iconBtn big nav-item" title="Play/Pause">${now.isPlaying ? "⏸" : "▶"}</button>
        <button id="btnNext" class="iconBtn big nav-item" title="Next">⏭</button>

        <button id="btnQueue" class="iconBtn nav-item" title="Up Next">Up Next</button>
        <button id="btnDevices" class="iconBtn nav-item" title="Devices">Devices</button>
        <button id="btnLibrary" class="iconBtn nav-item" title="Library">Library</button>

        <button id="btnLed" class="iconBtn nav-item" title="Toggle LED">${ledOn ? "LED On" : "LED Off"}</button>
      </div>
    </div>
  `;

  $("btnPlay").onclick = togglePlayPause;
  $("btnPrev").onclick = previousTrack;
  $("btnNext").onclick = nextTrack;

  $("btnLibrary").onclick = () => {
    setState("LIBRARY");
  };

  $("btnQueue").onclick = async () => {
    goto("Queue");
    renderQueueView();
    await loadQueue();
    renderQueueItems();
    nav.setIndex(0);
  };

  $("btnDevices").onclick = async () => {
    goto("Devices");
    renderDevicesView();
    await loadDevices();
    renderDevicesList();
    nav.setIndex(0);
  };

  $("btnLed").onclick = () => {
    setLedOnOff(!ledOn);
    renderNowView();
  };

  $("progress").addEventListener("change", async (e) => {
    const ms = parseInt(e.target.value, 10);
    if (Number.isFinite(ms)) await seekTo(ms);
  });

  nav.sync();
}

function renderLibraryView(){
  $("viewLibrary").innerHTML = `
    <div class="lib">
      <div class="libHeader">
        <div style="font-weight:900; font-size:18px;">Library</div>
        <button id="libBack" class="iconBtn nav-item" title="Back">←</button>
      </div>
      <div id="grid" class="libGrid"></div>
    </div>
  `;

  $("libBack").onclick = () => back();

  const grid = $("grid");
  if (!playlists.length){
    grid.innerHTML = `<div style="color:#333;">Loading playlists…</div>`;
    nav.sync();
    return;
  }

  grid.innerHTML = "";
  playlists.forEach((p) => {
    const img = p.images?.[0]?.url || "";
    const el = document.createElement("div");
    el.className = "tile nav-item";
    el.innerHTML = `
      ${img ? `<img src="${img}" alt="">` : `<img alt="">`}
      <div class="tname">${escapeHtml(p.name)}</div>
    `;
    el.onclick = async () => {
      selectedPlaylist = p;
      goto("Playlist");
      renderPlaylistView();

      await loadAllPlaylistTracks(p.id);
      renderPlaylistTracks();
      nav.setIndex(0);
    };
    grid.appendChild(el);
  });

  nav.setIndex(0);
}

function renderPlaylistView(){
  $("viewPlaylist").innerHTML = `
    <div class="pl">
      <div class="plHeader">
        <button id="plBack" class="iconBtn nav-item" title="Back">←</button>
        <div style="font-weight:900; font-size:16px; text-align:center; flex:1;">
          ${escapeHtml(selectedPlaylist?.name || "Playlist")}
        </div>
        <div style="width:44px;"></div>
      </div>

      <div id="trackList" class="trackList">
        <div style="color:#333;">Loading tracks…</div>
      </div>
    </div>
  `;

  $("plBack").onclick = () => back();
  nav.sync();
}

function renderPlaylistTracks(){
  const list = $("trackList");
  if (!list) return;

  if (!playlistTracks.length){
    list.innerHTML = `<div style="color:#333;">No tracks found or not accessible.</div>`;
    nav.sync();
    return;
  }

  list.innerHTML = "";
  playlistTracks.forEach((t, i) => {
    const el = document.createElement("div");
    el.className = "trackRow nav-item";
    el.innerHTML = `
      <div class="title">${i + 1}. ${escapeHtml(t.name)}</div>
      <div class="artist">${escapeHtml(t.artists?.map(a => a.name).join(", ") || "")}</div>
    `;
    el.onclick = async () => {
      await api("/me/player/play", { method:"PUT", body: JSON.stringify({ uris: [t.uri] }) });
      toast(`Playing: ${t.name}`);
      setState("NOW_PLAYING"); // optimistic
      setTimeout(pollPlayback, 500);
    };
    list.appendChild(el);
  });

  nav.setIndex(0);
}

function renderQueueView(){
  $("viewQueue").innerHTML = `
    <div class="queue">
      <div class="qHeader">
        <button id="qBack" class="iconBtn nav-item" title="Back">←</button>
        <div style="font-weight:900; font-size:16px; text-align:center; flex:1;">Up Next</div>
        <button id="qRefresh" class="iconBtn nav-item" title="Refresh">↻</button>
      </div>
      <div id="qList" class="trackList">
        <div style="color:#333;">Loading queue…</div>
      </div>
    </div>
  `;

  $("qBack").onclick = () => back();
  $("qRefresh").onclick = async () => {
    await loadQueue();
    renderQueueItems();
    toast("Queue refreshed");
  };

  nav.sync();
}

function renderQueueItems(){
  const list = $("qList");
  if (!list) return;

  if (!queueItems.length){
    list.innerHTML = `<div style="color:#333;">Queue is empty.</div>`;
    nav.sync();
    return;
  }

  list.innerHTML = "";
  queueItems.slice(0, 5).forEach((t, i) => {
    const el = document.createElement("div");
    el.className = "trackRow nav-item";
    el.innerHTML = `
      <div class="title">${i + 1}. ${escapeHtml(t.name || "Unknown")}</div>
      <div class="artist">${escapeHtml(t.artists?.map(a => a.name).join(", ") || "-")}</div>
    `;
    el.onclick = () => toast("Queue is read-only here (Spotify controls order).");
    list.appendChild(el);
  });

  nav.setIndex(0);
}

function renderDevicesView(){
  $("viewDevices").innerHTML = `
    <div class="devices">
      <div class="qHeader">
        <button id="dBack" class="iconBtn nav-item" title="Back">←</button>
        <div style="font-weight:900; font-size:16px; text-align:center; flex:1;">Devices</div>
        <button id="dRefresh" class="iconBtn nav-item" title="Refresh">↻</button>
      </div>

      <div id="dList" class="trackList">
        <div style="color:#333;">Loading devices…</div>
      </div>
    </div>
  `;

  $("dBack").onclick = () => back();
  $("dRefresh").onclick = async () => {
    await loadDevices();
    renderDevicesList();
    toast("Devices refreshed");
  };

  nav.sync();
}

function renderDevicesList(){
  const list = $("dList");
  if (!list) return;

  if (!devices.length){
    list.innerHTML = `<div style="color:#333;">No devices found. Open Spotify on a device.</div>`;
    nav.sync();
    return;
  }

  list.innerHTML = "";
  devices.forEach((d) => {
    const el = document.createElement("div");
    el.className = "deviceRow nav-item";
    const active = d.is_active ? " (active)" : "";
    el.innerHTML = `
      <div class="title">${escapeHtml(d.name || "Unknown")}${escapeHtml(active)}</div>
      <div class="artist">${escapeHtml(d.type || "")} • Vol ${typeof d.volume_percent === "number" ? d.volume_percent : "?"}</div>
    `;
    el.onclick = async () => {
      selectedDeviceId = d.id;
      const ok = await api("/me/player", {
        method: "PUT",
        body: JSON.stringify({ device_ids: [d.id], play: true })
      });
      if (ok) toast(`Switched to: ${d.name}`);
      setTimeout(pollPlayback, 500);
    };
    list.appendChild(el);
  });

  nav.setIndex(0);
}

function renderLastPlayedView(){
  const lp = lastPlayed;
  const when = lp?.atMs ? `${Math.max(0, Math.floor((Date.now() - lp.atMs)/1000))}s ago` : "";
  $("viewLastPlayed").innerHTML = `
    <div class="lastPlayed">
      <div style="font-weight:900; font-size:18px; margin-bottom:10px;">Last Played</div>

      <div class="lpRow">
        <div class="cover small">${lp?.artUrl ? `<img src="${lp.artUrl}" alt="cover">` : ""}</div>
        <div class="meta">
          <div style="font-size:16px; font-weight:900;">${escapeHtml(lp?.name || "Nothing yet")}</div>
          <div style="opacity:0.9;">${escapeHtml(lp?.artist || "-")}</div>
          <div style="opacity:0.85;">${escapeHtml(lp?.album || "-")}</div>
          <div style="opacity:0.7; margin-top:6px;">No playback ${when ? `• ${escapeHtml(when)}` : ""}</div>
        </div>
      </div>

      <div class="lpActions">
        <button id="lpLibrary" class="iconBtn nav-item">Library</button>
        <button id="lpNow" class="iconBtn nav-item">Now Playing</button>
      </div>
    </div>
  `;

  $("lpLibrary").onclick = () => setState("LIBRARY");
  $("lpNow").onclick = () => { goto("Now"); renderNowView(); };

  nav.sync();
}

function renderStandbyView(){
  $("viewStandby").innerHTML = `
    <div class="standby">
      <div class="logo">Spotify</div>
      <div class="byline">Created by …</div>
      <div class="hint">Turn the wheel or press a button to wake</div>
      <div class="hint2">LEDs are off in standby</div>
    </div>
  `;
  nav.sync();
}

/* ---------------- Spotify: polling + controls ---------------- */

async function pollPlayback(){
  // Use /me/player so we can treat 204 as "no playback"
  const resp = await apiRaw("/me/player");
  const nowMs = Date.now();

  if (!resp) return;

  if (resp.status === 204) {
    onNoPlayback(nowMs);
    return;
  }

  if (!resp.ok) {
    onNoPlayback(nowMs);
    return;
  }

  const data = await resp.json();
  const item = data?.item;
  const isPlaying = !!data?.is_playing;
  const isTrack = item && item.type === "track";

  if (isPlaying && isTrack) {
    noPlaybackSince = null;

    now.id = item.id || null;
    now.name = item.name || "Unknown";
    now.artist = item.artists?.map(a => a.name).join(", ") || "-";
    now.album = item.album?.name || "-";
    now.artUrl = item.album?.images?.[0]?.url || null;
    now.isPlaying = true;
    now.progressMs = data.progress_ms || 0;
    now.durationMs = item.duration_ms || 0;

    // Update bg + LED color (best-effort)
    if (now.artUrl) {
      const rgb = await getAverageColor(now.artUrl);
      lastPlayed = { name: now.name, artist: now.artist, album: now.album, artUrl: now.artUrl, atMs: nowMs, rgb };
      setNowPlayingBackground(rgb);
      if (uiState !== "STANDBY") setLedBaseColor(rgb, 900);
    } else {
      const rgb = { r: 30, g: 30, b: 30 };
      lastPlayed = { name: now.name, artist: now.artist, album: now.album, artUrl: null, atMs: nowMs, rgb };
      setNowPlayingBackground(rgb);
      if (uiState !== "STANDBY") setLedBaseColor(rgb, 600);
    }

    if (uiState !== "NOW_PLAYING") setState("NOW_PLAYING");
    else if (currentView === "Now") renderNowView();
    return;
  }

  // not playing OR not a track OR item null
  onNoPlayback(nowMs);
}

function onNoPlayback(nowMs) {
  if (noPlaybackSince == null) noPlaybackSince = nowMs;
  const elapsed = nowMs - noPlaybackSince;

  now.isPlaying = false;

  if (elapsed >= NO_PLAYBACK_TO_STANDBY_MS) {
    if (uiState !== "STANDBY") setState("STANDBY");
  } else {
    if (uiState !== "LAST_PLAYED") setState("LAST_PLAYED");
    else if (currentView === "LastPlayed") renderLastPlayedView();
  }

  // If the user is explicitly on Now view, reflect "not playing" there too
  if (currentView === "Now") {
    now.name = lastPlayed?.name || "Not playing";
    now.artist = lastPlayed?.artist || "-";
    now.album = lastPlayed?.album || "-";
    now.artUrl = lastPlayed?.artUrl || null;
    now.progressMs = 0;
    now.durationMs = 0;
    renderNowView();
  }
}

async function togglePlayPause(){
  if (now.isPlaying) await api("/me/player/pause", { method:"PUT" });
  else await api("/me/player/play", { method:"PUT" });
  setTimeout(pollPlayback, 400);
}

async function nextTrack(){
  await api("/me/player/next", { method:"POST" });
  setTimeout(pollPlayback, 650);
}

async function previousTrack(){
  await api("/me/player/previous", { method:"POST" });
  setTimeout(pollPlayback, 650);
}

async function seekTo(ms){
  await api(`/me/player/seek?position_ms=${encodeURIComponent(ms)}`, { method:"PUT" });
  setTimeout(pollPlayback, 250);
}

/* ---------------- Queue + devices ---------------- */

async function loadQueue(){
  const data = await api("/me/player/queue");
  // /me/player/queue returns { currently_playing, queue } [web:42]
  queueItems = data?.queue || [];
}

async function loadDevices(){
  const data = await api("/me/player/devices");
  devices = data?.devices || [];
}

/* ---------------- Playlists ---------------- */

async function loadPlaylists(){
  const data = await api("/me/playlists?limit=50");
  playlists = data?.items || [];
}

async function loadAllPlaylistTracks(playlistId){
  playlistTracks = [];
  let offset = 0;
  const limit = 100;

  while (true){
    const page = await api(`/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`);
    if (!page) break;

    const items = page.items || [];
    const tracks = items
      .map(it => it?.track || null)
      .filter(t => t && t.type === "track" && t.uri);

    playlistTracks.push(...tracks);

    if (!page.next) break;
    offset += limit;
    if (offset > 5000) break;
  }
}

/* ---------------- Boot ---------------- */

async function main(){
  renderApp(document.getElementById("app"));
  nav.attach();

  // Global test hotkeys for LED brightness (simulate 3rd encoder)
  window.addEventListener("keydown", (e) => {
    if (e.key === "]") {
      e.preventDefault();
      applyLedBrightness(ledBrightness + 0.05, 120);
    } else if (e.key === "[") {
      e.preventDefault();
      applyLedBrightness(ledBrightness - 0.05, 120);
    } else if (e.key.toLowerCase() === "l") {
      e.preventDefault();
      setLedOnOff(!ledOn);
      if (currentView === "Now") renderNowView();
    }
  });

  updateLedIndicator();

  await ensureAuthedOrRedirect();

  // Start on Library (appliance wake destination)
  setState("LIBRARY");

  // Load initial data
  await loadPlaylists();

  // Start polling playback
  setInterval(pollPlayback, Number.isFinite(POLL) ? POLL : 1500);
  await pollPlayback();
}

main().catch((e) => {
  console.error(e);
  document.getElementById("app").innerHTML = `
    <div style="padding:20px; color:white;">
      <h2 style="margin-bottom:10px;">Spotify-Deck error</h2>
      <pre style="white-space:pre-wrap; color:#ff6b6b;">${String(e.message || e)}</pre>
    </div>
  `;
  setStatus(String(e.message || e));
});
