export function renderApp(root) {
  root.innerHTML = `
    <div class="frame">
      <div id="viewNow" class="view"></div>
      <div id="viewLibrary" class="view hidden"></div>
      <div id="viewPlaylist" class="view hidden"></div>
      <div id="viewQueue" class="view hidden"></div>
      <div id="viewDevices" class="view hidden"></div>
      <div id="viewLastPlayed" class="view hidden"></div>
      <div id="viewStandby" class="view hidden"></div>
    </div>

    <div id="toast" class="toast hidden"></div>

    <div id="ledIndicator">
      <div id="ledColorBox"></div>
      <div id="ledLabel">LED</div>
    </div>
  `;
}

export function showView(name) {
  const views = ["Now", "Library", "Playlist", "Queue", "Devices", "LastPlayed", "Standby"];
  for (const v of views) {
    document.getElementById(`view${v}`).classList.toggle("hidden", v !== name);
  }
}

export function toast(msg, ms = 2200) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add("hidden"), ms);
}

export function formatTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? "0" : ""}${r}`;
}

export function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* spotify.js may call this; safe no-op if element isn't present */
export function setStatus(msg) {
  const el = document.getElementById("statusLine");
  if (el) el.textContent = msg || "";
}
