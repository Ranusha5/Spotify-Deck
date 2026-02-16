import "./styles.css";
import { renderApp, showView, toast, formatTime, escapeHtml } from "./ui.js";
import { ensureAuthedOrRedirect, api } from "./spotify.js";
import { createNavigator } from "./nav.js";

const POLL = parseInt(import.meta.env.VITE_POLL_INTERVAL_MS || "2500", 10);

let currentView = "Now"; // Now | Library | Playlist
let playlists = [];
let selectedPlaylist = null;
let playlistTracks = [];

let now = {
  name: "Not playing",
  artist: "-",
  album: "-",
  artUrl: null,
  isPlaying: false,
  progressMs: 0,
  durationMs: 0
};

function $(id){ return document.getElementById(id); }

const nav = createNavigator({
  getItems: () => Array.from(document.querySelectorAll(`#view${currentView} .nav-item`)),
  onActivate: (el) => el.click(),
  onBack: () => back()
});

function goto(view) {
  currentView = view;
  showView(view);
  nav.setIndex(0);
}

function back() {
  if (currentView === "Playlist") {
    goto("Library");
    renderLibraryView();
  } else if (currentView === "Library") {
    goto("Now");
    renderNowView();
  }
}

/* ---------- Renders (all nav-item marked) ---------- */

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
        <button id="btnLibrary" class="iconBtn nav-item" title="Library">Library</button>
        <button id="btnToggle" class="iconBtn nav-item" title="Toggle Art">Toggle</button>
      </div>
    </div>
  `;

  $("btnPlay").onclick = togglePlayPause;
  $("btnPrev").onclick = previousTrack;
  $("btnNext").onclick = nextTrack;

  $("btnLibrary").onclick = () => {
    goto("Library");
    renderLibraryView();
  };

  $("btnToggle").onclick = () => toast("Toggle reserved (Cover ↔ Visualizer)");

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
      goto("Now");
      renderNowView();
      setTimeout(updateNowPlaying, 500);
    };
    list.appendChild(el);
  });

  nav.setIndex(0);
}

/* ---------- Spotify ---------- */

async function updateNowPlaying(){
  const data = await api("/me/player/currently-playing");

  if (!data?.item){
    now = { ...now, name:"Not playing", artist:"-", album:"-", artUrl:null, isPlaying:false, progressMs:0, durationMs:0 };
    if (currentView === "Now") renderNowView();
    return;
  }

  const track = data.item;
  now.name = track.name || "Unknown";
  now.artist = track.artists?.map(a => a.name).join(", ") || "-";
  now.album = track.album?.name || "-";
  now.artUrl = track.album?.images?.[0]?.url || null;
  now.isPlaying = !!data.is_playing;
  now.progressMs = data.progress_ms || 0;
  now.durationMs = track.duration_ms || 0;

  if (currentView === "Now") renderNowView();
}

async function togglePlayPause(){
  if (now.isPlaying) await api("/me/player/pause", { method:"PUT" });
  else await api("/me/player/play", { method:"PUT" });
  setTimeout(updateNowPlaying, 400);
}

async function nextTrack(){
  await api("/me/player/next", { method:"POST" });
  setTimeout(updateNowPlaying, 650);
}

async function previousTrack(){
  await api("/me/player/previous", { method:"POST" });
  setTimeout(updateNowPlaying, 650);
}

async function seekTo(ms){
  await api(`/me/player/seek?position_ms=${encodeURIComponent(ms)}`, { method:"PUT" });
  setTimeout(updateNowPlaying, 250);
}

/* ---------- Playlists ---------- */

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

/* ---------- Boot ---------- */

async function main(){
  renderApp(document.getElementById("app"));
  nav.attach();

  await ensureAuthedOrRedirect();

  goto("Now");
  renderNowView();

  await loadPlaylists();

  setInterval(updateNowPlaying, Number.isFinite(POLL) ? POLL : 2500);
  await updateNowPlaying();
}

main().catch((e) => {
  console.error(e);
  document.getElementById("app").innerHTML = `
    <div style="padding:20px; color:white;">
      <h2 style="margin-bottom:10px;">Spotify-Deck error</h2>
      <pre style="white-space:pre-wrap; color:#ff6b6b;">${String(e.message || e)}</pre>
    </div>
  `;
});
