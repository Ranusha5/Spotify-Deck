# Spotify-Deck (Raspberry Pi Spotify Controller)

Spotify-Deck is a dedicated Spotify controller you can run as a web app first (GitHub Pages) and later on a Raspberry Pi in kiosk mode with a touchscreen + physical buttons.

## What it does
- Shows current playing track (title, artist, album, cover art).
- Play / pause / next / previous.
- Seek within the track.
- Change volume on the active Spotify device.
- Browse playlists and play a playlist or an individual track.
- Optional GPIO buttons on Raspberry Pi for hardware controls.

## Project site (GitHub Pages)
Your Pages URL will be:

`https://<YOUR_GITHUB_USERNAME>.github.io/Spotify-Deck/` [web:104]

Add this exact URL to **Spotify Developer Dashboard → Your App → Edit Settings → Redirect URIs**.

## Quick start (web testing)
1. Create a Spotify Developer app: https://developer.spotify.com/dashboard
2. Copy the **Client ID**.
3. Add Redirect URI:
   `https://<YOUR_GITHUB_USERNAME>.github.io/Spotify-Deck/`
4. In `index.html`, set:
   - `CLIENT_ID`
   - `REDIRECT_URI` to the same Pages URL above
5. Enable GitHub Pages: Repo → Settings → Pages → Deploy from branch.
6. Open the Pages URL, login, start music on your phone/laptop/Echo, and control it.

## Raspberry Pi quick start (later)
- Install Raspberry Pi OS
- Run a local web server for `index.html`
- Run Chromium in kiosk mode
- Optional: run `gpio_controller.py` to map button presses to commands

## Docs
- `STEP_BY_STEP.md` — full setup guide
- `WORKFLOW.md` — how to build/test/deploy iteratively
- `PROJECT_GUIDELINES.md` — code style + architecture

## Notes / limitations
- This controls the *currently active* Spotify device.
- Some playback control features can behave differently depending on device type and account tier.

## License
MIT (add a LICENSE file if you want).
