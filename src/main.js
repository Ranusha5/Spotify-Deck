import "./styles.css";
import { renderShell, setStatus, formatTime, escapeHtml, toast } from "./ui.js";
import { ensureAuthedOrRedirect, api, logout } from "./spotify.js";

const POLL = parseInt(import.meta.env.VITE_POLL_INTERVAL_MS || "2500", 10);

let showingCoverArt = true;
let isPlaying = false;
let lastNowId = null;

let playlists = [];
let currentPlaylist = null;

function $(id){ return document.getElementById(id); }

function wireUI(){
  $("logoutBtn").addEventListener("click", () => {
    logout();
    // No login page: immediately re-auth
    window.location.reload();
  });

  $("toggleArtBtn").addEventListener("click", () => {
    showingCoverArt = !showingCoverArt;
    lastNowId = null;
    updateNowPlaying();
  });

  $("prevBtn").addEventListener("click", previousTrack);
  $("nextBtn").addEventListener("click", nextTrack);
  $("playPauseBtn").addEventListener("click", togglePlayPause);

  $("progressBar").addEventListener("change", (e) => {
    const ms = parseInt(e.target.value, 10);
    if (Number.isFinite(ms)) seekTo(ms);
  });

  $("volumeControl").addEventListener("change", (e) => {
    const v = parseInt(e.target.value, 10);
    if (Number.isFinite(v)) setVolume(v);
  });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space"){ e.preventDefault(); togglePlayPause(); }
    if (e.code === "ArrowRight"){ nextTrack(); }
    if (e.code === "ArrowLeft"){ previousTrack(); }
    if (e.code === "ArrowUp"){ e.preventDefault(); adjustVolume(+5); }
    if (e.code === "ArrowDown"){ e.preventDefault(); adjustVolume(-5); }
    if (e.key?.toLowerCase() === "v"){ showingCoverArt = !showingCoverArt; lastNowId = null; updateNowPlaying(); }
  });
}

async function loadPlaylists(){
  const data = await api("/me/playlists?limit=50");
  if (!data?.items) return;
  playlists = data.items;
  renderPlaylists();
}

function renderPlaylists(){
  const list = $("playlistList");
  list.innerHTML = "";
  if (!playlists.length){
    list.innerHTML = `<div class="muted">No playlists found.</div>`;
    return;
  }
  playlists.forEach(p => {
    const el = document.createElement("div");
    el.className = "playlist-item" + (currentPlaylist?.id === p.id ? " active" : "");
    el.textContent = p.name;
    el.title = p.name;
    el.onclick = () => selectPlaylist(p);
    list.appendChild(el);
  });
}

async function selectPlaylist(p){
  currentPlaylist = p;
  renderPlaylists();
  toast(`Selected: ${p.name}`);
  // (Optional) load tracks here later; current UI focuses on now-playing + controls first.
}

async function updateNowPlaying(){
  const data = await api("/me/player/currently-playing");
  if (!data?.item){
    $("trackName").textContent = "No track playing";
    $("artistName").textContent = "-";
    $("albumName").textContent = "-";
    $("art").textContent = "No track";
    $("currentTime").textContent = "0:00";
    $("duration").textContent = "0:00";
    $("progressBar").max = 100;
    $("progressBar").value = 0;
    setStatus("Start playback on any Spotify device.");
    return;
  }

  const track = data.item;
  const progress = data.progress_ms || 0;
  const duration = track.duration_ms || 0;
  const volume = (data.device && typeof data.device.volume_percent === "number") ? data.device.volume_percent : 50;
  isPlaying = !!data.is_playing;

  const nowId = `${track.id}|${isPlaying ? 1 : 0}`;
  if (nowId !== lastNowId){
    $("trackName").textContent = track.name || "Unknown";
    $("artistName").textContent = (track.artists || []).map(a => a.name).join(", ") || "-";
    $("albumName").textContent = track.album?.name || "-";

    const art = $("art");
    if (showingCoverArt && track.album?.images?.length){
      art.innerHTML = `<img src="${track.album.images[0].url}" alt="Album art">`;
    } else {
      art.innerHTML = `
        <div style="text-align:center; padding:14px;">
          <div style="font-size:44px; margin-bottom:10px;">♫</div>
          <div style="font-size:12px; color:var(--text-secondary); line-height:1.3;">
            ${escapeHtml(track.name)}<br>${escapeHtml(track.artists?.[0]?.name || "")}
          </div>
        </div>
      `;
    }

    lastNowId = nowId;
  }

  if (duration > 0){
    $("progressBar").max = duration;
    $("progressBar").value = progress;
    $("currentTime").textContent = formatTime(progress);
    $("duration").textContent = formatTime(duration);
  }

  $("playPauseBtn").textContent = isPlaying ? "⏸" : "▶";

  $("volumeControl").value = volume;
  $("volumeLabel").textContent = `${volume}%`;

  setStatus(`Active device: ${data.device?.name || "Unknown"}`);
}

async function togglePlayPause(){
  if (isPlaying){
    await api("/me/player/pause", { method: "PUT" });
  } else {
    await api("/me/player/play", { method: "PUT" });
  }
  setTimeout(updateNowPlaying, 450);
}

async function nextTrack(){
  await api("/me/player/next", { method: "POST" });
  setTimeout(updateNowPlaying, 650);
}

async function previousTrack(){
  await api("/me/player/previous", { method: "POST" });
  setTimeout(updateNowPlaying, 650);
}

async function seekTo(ms){
  await api(`/me/player/seek?position_ms=${encodeURIComponent(ms)}`, { method: "PUT" });
  setTimeout(updateNowPlaying, 250);
}

async function setVolume(vol){
  const v = Math.max(0, Math.min(100, Math.round(vol)));
  await api(`/me/player/volume?volume_percent=${encodeURIComponent(v)}`, { method: "PUT" });
  $("volumeLabel").textContent = `${v}%`;
}

function adjustVolume(delta){
  const current = parseInt($("volumeControl").value || "50", 10);
  const next = Math.max(0, Math.min(100, current + delta));
  $("volumeControl").value = next;
  setVolume(next);
}

async function main(){
  const root = document.getElementById("app");
  renderShell(root);

  wireUI();

  setStatus("Authorizing…");
  await ensureAuthedOrRedirect();

  setStatus("Loading…");
  await Promise.all([loadPlaylists(), updateNowPlaying()]);

  window.setInterval(updateNowPlaying, Number.isFinite(POLL) ? POLL : 2500);
}

main().catch((e) => {
  console.error(e);
  const root = document.getElementById("app");
  root.innerHTML = `
    <div style="padding:20px; color:white;">
      <h2 style="margin-bottom:10px;">Spotify-Deck error</h2>
      <pre style="white-space:pre-wrap; color:#ff6b6b;">${String(e.message || e)}</pre>
      <p style="margin-top:10px; color:#b3b3b3;">
        Check your <code>.env</code> values and the Redirect URI in Spotify dashboard.
      </p>
    </div>
  `;
});