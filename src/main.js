import "./styles.css";
import { renderApp, showView, toast, formatTime, escapeHtml } from "./ui.js";
import { ensureAuthedOrRedirect, api } from "./spotify.js";

const POLL = parseInt(import.meta.env.VITE_POLL_INTERVAL_MS || "2500", 10);

let now = {
  trackId: null,
  trackUri: null,
  name: "Song Name",
  artist: "Artist Name",
  album: "Album Name",
  artUrl: null,
  isPlaying: false,
  progressMs: 0,
  durationMs: 0,
  liked: false
};

let playlists = [];
let selectedPlaylist = null;
let playlistTracks = [];

function $(id){ return document.getElementById(id); }

function renderNowView(){
  $("viewNow").innerHTML = `
    <div class="now">
      <div class="nowTop">
        <div>
          <div id="cover" class="cover">${now.artUrl ? `<img src="${now.artUrl}" alt="cover">` : ""}</div>
        </div>

        <div class="meta">
          <h2 id="songTitle">${escapeHtml(now.name)}</h2>
          <div class="sub">
            <div id="songArtist">${escapeHtml(now.artist)}</div>
            <div id="songAlbum">${escapeHtml(now.album)}</div>
          </div>

          <div class="barRow">
            <div class="time" id="tCur">${formatTime(now.progressMs)}</div>
            <input id="progress" class="progress" type="range" min="0" max="${Math.max(1, now.durationMs)}" value="${Math.min(now.progressMs, now.durationMs)}" />
            <div class="time" id="tDur">${formatTime(now.durationMs)}</div>
          </div>
        </div>
      </div>

      <div class="bottomBar">
        <button id="btnPlay" class="iconBtn primary" title="Play/Pause">${now.isPlaying ? "⏸" : "▶"}</button>
        <button id="btnPrev" class="iconBtn" title="Previous">⏮</button>
        <button id="btnNext" class="iconBtn" title="Next">⏭</button>
        <button id="btnLike" class="iconBtn ${now.liked ? "active":""}" title="Like">${now.liked ? "♥" : "♡"}</button>
        <button id="btnLibrary" class="iconBtn" title="Library">Library</button>
      </div>
    </div>
  `;

  $("btnPlay").onclick = togglePlayPause;
  $("btnPrev").onclick = previousTrack;
  $("btnNext").onclick = nextTrack;
  $("btnLike").onclick = toggleLikeCurrent;
  $("btnLibrary").onclick = () => { showView("Library"); renderLibraryView(); };

  $("progress").addEventListener("change", async (e) => {
    const ms = parseInt(e.target.value, 10);
    if (Number.isFinite(ms)) await seekTo(ms);
  });
}

function renderLibraryView(){
  $("viewLibrary").innerHTML = `
    <div class="lib">
      <div class="libHeader">
        <div style="font-weight:900; font-size:18px;">Library</div>
        <button id="libBack" class="iconBtn" title="Back">←</button>
      </div>
      <div id="grid" class="libGrid">
        ${playlists.length ? "" : `<div style="color:#333;">Loading playlists…</div>`}
      </div>
    </div>
  `;

  $("libBack").onclick = () => { showView("Now"); };

  const grid = $("grid");
  if (!playlists.length) return;

  grid.innerHTML = "";
  playlists.forEach(p => {
    const img = p.images?.[0]?.url || "";
    const el = document.createElement("div");
    el.className = "tile";
    el.innerHTML = `
      ${img ? `<img src="${img}" alt="">` : `<img alt="" />`}
      <div class="tname">${escapeHtml(p.name)}</div>
    `;
    el.onclick = async () => {
      selectedPlaylist = p;
      showView("Playlist");
      renderPlaylistView();
      await loadAllPlaylistTracks(p.id);
      renderPlaylistTracks();
    };
    grid.appendChild(el);
  });
}

function renderPlaylistView(){
  $("viewPlaylist").innerHTML = `
    <div class="pl">
      <div class="plHeader">
        <button id="plBack" class="iconBtn" title="Back">←</button>
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
  $("plBack").onclick = () => { showView("Library"); renderLibraryView(); };
}

function renderPlaylistTracks(){
  const list = $("trackList");
  if (!list) return;

  if (!playlistTracks.length){
    list.innerHTML = `<div style="color:#333;">No tracks found.</div>`;
    return;
  }

  list.innerHTML = "";
  playlistTracks.forEach((t, i) => {
    const el = document.createElement("div");
    el.className = "trackRow";
    el.innerHTML = `
      <div class="title">${i+1}. ${escapeHtml(t.name)}</div>
      <div class="artist">${escapeHtml(t.artists?.map(a => a.name).join(", ") || "")}</div>
    `;
    el.onclick = async () => {
      await api("/me/player/play", { method:"PUT", body: JSON.stringify({ uris: [t.uri] }) });
      toast(`Playing: ${t.name}`);
      showView("Now");
      // Force immediate refresh
      setTimeout(updateNowPlaying, 500);
    };
    list.appendChild(el);
  });
}

/* ========= Spotify actions ========= */

async function updateNowPlaying(){
  const data = await api("/me/player/currently-playing");
  if (!data?.item){
    now = { ...now, trackId:null, trackUri:null, name:"Not playing", artist:"-", album:"-", artUrl:null, isPlaying:false, progressMs:0, durationMs:0, liked:false };
    renderNowView();
    return;
  }

  const track = data.item;
  const artUrl = track.album?.images?.[0]?.url || null;

  now.trackId = track.id;
  now.trackUri = track.uri;
  now.name = track.name || "Unknown";
  now.artist = track.artists?.map(a => a.name).join(", ") || "-";
  now.album = track.album?.name || "-";
  now.artUrl = artUrl;
  now.isPlaying = !!data.is_playing;
  now.progressMs = data.progress_ms || 0;
  now.durationMs = track.duration_ms || 0;

  // check liked state (official endpoint)
  if (now.trackId){
    const likedArr = await api(`/me/tracks/contains?ids=${encodeURIComponent(now.trackId)}`);
    if (Array.isArray(likedArr)) now.liked = !!likedArr[0];
  }

  // Only re-render if we're on Now view
  if (!$("viewNow").classList.contains("hidden")) renderNowView();
}

async function togglePlayPause(){
  if (now.isPlaying){
    await api("/me/player/pause", { method:"PUT" });
  } else {
    await api("/me/player/play", { method:"PUT" });
  }
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

async function toggleLikeCurrent(){
  if (!now.trackId) return;

  if (!now.liked){
    // Save track to Liked Songs (official)
    await api(`/me/tracks?ids=${encodeURIComponent(now.trackId)}`, { method:"PUT" }); // Save Tracks for User [web:206]
    now.liked = true;
    toast("Added to Liked Songs");
  } else {
    await api(`/me/tracks?ids=${encodeURIComponent(now.trackId)}`, { method:"DELETE" });
    now.liked = false;
    toast("Removed from Liked Songs");
  }
  renderNowView();
}

/* ========= Library / playlist loading ========= */

async function loadPlaylists(){
  const data = await api("/me/playlists?limit=50");
  playlists = data?.items || [];
}

async function loadAllPlaylistTracks(playlistId){
  playlistTracks = [];
  let offset = 0;
  const limit = 100;

  while (true){
    const page = await api(`/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`); // paging via limit/offset [web:201]
    const items = page?.items || [];
    const tracks = items.map(it => it?.track).filter(Boolean);
    playlistTracks.push(...tracks);

    if (!page?.next || items.length === 0) break;
    offset += limit;

    // Safety cap (optional): remove if you want truly all
    if (playlistTracks.length > 2000) break;
  }
}

/* ========= Boot ========= */
async function main(){
  renderApp(document.getElementById("app"));
  await ensureAuthedOrRedirect();

  renderNowView();
  showView("Now");

  await loadPlaylists();

  // Keep library view snappy (renders from cached playlists)
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
