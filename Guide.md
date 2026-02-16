# Spotify-Deck Step-by-Step

This guide gets you from “idea” → “working web app” → “working Raspberry Pi device”.

## Part A — Web app test (recommended first)

### 1) Create GitHub repo
- Repo name: `Spotify-Deck`
- Add `index.html` in root

### 2) Enable GitHub Pages
Repo → Settings → Pages → Deploy from branch → `main` + `/ (root)`.

Your URL becomes:
`https://<YOUR_GITHUB_USERNAME>.github.io/Spotify-Deck/` [web:104]

### 3) Create Spotify developer app
Go to: https://developer.spotify.com/dashboard
- Create app
- Copy **Client ID**
- Add Redirect URI:
  `https://<YOUR_GITHUB_USERNAME>.github.io/Spotify-Deck/`

### 4) Configure `index.html`
Edit:
- `const CLIENT_ID = '...'`
- `const REDIRECT_URI = 'https://<YOUR_GITHUB_USERNAME>.github.io/Spotify-Deck/'`

Commit & push.

### 5) Test
- Open your GitHub Pages URL
- Login
- Start playback on your phone/laptop/Echo Dot
- Confirm controls work

## Part B — Raspberry Pi device

### 6) Flash Raspberry Pi OS
Use Raspberry Pi Imager, enable SSH + Wi-Fi.

### 7) Install packages
```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y chromium-browser python3-pip python3-gpiozero
