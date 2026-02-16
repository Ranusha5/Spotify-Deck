# Spotify-Deck Workflow

This is the recommended workflow so you can validate everything in a browser before buying hardware.

## Phase 1 — Web app validation (no hardware)
1. Create repo: `Spotify-Deck`.
2. Enable GitHub Pages.
3. Create Spotify Developer app + add redirect URI:
   `https://<YOUR_GITHUB_USERNAME>.github.io/Spotify-Deck/` [web:104]
4. Add Client ID + redirect URI to `index.html`.
5. Test:
   - Login
   - Now Playing display
   - Play/pause/next/prev
   - Volume
   - Playlists + tracks
   - Cover art toggle

## Phase 2 — UI hardening
- Make buttons larger and touch-friendly.
- Add “no active device” message.
- Add retry/backoff when Spotify returns errors.
- Add keyboard shortcuts for quick testing.

## Phase 3 — Raspberry Pi bring-up
- Flash Raspberry Pi OS.
- Install Chromium.
- Host the web app locally (Python http.server).
- Run Chromium in kiosk mode pointing to the local server URL.

## Phase 4 — Physical buttons
- Wire buttons to GPIO (with proper pull-ups/pull-downs).
- Run a Python daemon using gpiozero.
- Send commands to the web app (or directly call Spotify Web API from Python).

## Phase 5 — Autostart + reliability
- Systemd service(s) for:
  - web server
  - gpio daemon
  - kiosk browser
- Disable screen blanking.
- Watchdog/restart on failure.
