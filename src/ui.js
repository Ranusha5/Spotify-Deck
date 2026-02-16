export function renderShell(root) {
  root.innerHTML = `
    <div class="header">
      <div class="brand">
        <div class="logo">♫</div>
        <h1>Spotify-Deck</h1>
      </div>
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        <button id="toggleArtBtn" class="btn secondary">Toggle Art</button>
        <button id="logoutBtn" class="btn">Logout</button>
      </div>
    </div>

    <div class="container">
      <aside class="sidebar">
        <h2>Your Playlists</h2>
        <div id="playlistList" class="playlist-list">
          <div class="muted">Loading playlists…</div>
        </div>
      </aside>

      <main class="main">
        <section class="now-playing">
          <div id="art" class="art">No track</div>

          <div class="track">
            <div id="trackName" class="name">Not playing</div>
            <div id="artistName" class="artist">-</div>
            <div id="albumName" class="album">-</div>
            <div id="statusLine" class="muted" style="margin-top:8px;"></div>
          </div>

          <div class="row">
            <div class="progress">
              <span id="currentTime" class="time">0:00</span>
              <input id="progressBar" type="range" min="0" max="100" value="0" />
              <span id="duration" class="time">0:00</span>
            </div>

            <div class="controls">
              <button id="prevBtn" class="control-btn" title="Previous">⏮</button>
              <button id="playPauseBtn" class="control-btn play" title="Play/Pause">▶</button>
              <button id="nextBtn" class="control-btn" title="Next">⏭</button>
            </div>

            <div class="volume">
              <span>🔊</span>
              <input id="volumeControl" type="range" min="0" max="100" value="50" />
              <span id="volumeLabel" class="muted">50%</span>
            </div>

            <div class="muted" style="text-align:center; margin-top:10px;">
              Keyboard: Space=Play/Pause, ←/→=Prev/Next, ↑/↓=Vol, V=Toggle Art
            </div>
          </div>
        </section>
      </main>
    </div>

    <div id="toast" class="toast" style="display:none"></div>
  `;
}

export function toast(msg, ms = 2500) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  window.clearTimeout(el._t);
  el._t = window.setTimeout(() => (el.style.display = "none"), ms);
}

export function setStatus(msg) {
  const el = document.getElementById("statusLine");
  if (el) el.textContent = msg || "";
}

export function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

export function formatTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? "0" : ""}${r}`;
}
