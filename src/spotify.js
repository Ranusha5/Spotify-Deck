// import { setStatus } from "./ui.js";

const AUTH_ENDPOINT = "https://accounts.spotify.com/authorize";
const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const API_BASE = "https://api.spotify.com/v1";

const SCOPES = [
  "user-read-private",
  "user-read-email",
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-library-read",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-library-modify"
];

const STORAGE = {
  accessToken: "sd_access_token",
  refreshToken: "sd_refresh_token",
  expiresAt: "sd_expires_at",
  pkceVerifier: "sd_pkce_verifier",
  authState: "sd_auth_state"
};

let accessToken = null;
let expiresAt = 0;

function getEnv(name) {
  return import.meta.env[name];
}

function randomString(length){
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  let text = "";
  const values = crypto.getRandomValues(new Uint8Array(length));
  for (let i=0;i<values.length;i++) text += possible[values[i] % possible.length];
  return text;
}

function base64UrlEncode(arrayBuffer){
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let i=0;i<bytes.byteLength;i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}

async function sha256(plain){
  const data = new TextEncoder().encode(plain);
  return crypto.subtle.digest("SHA-256", data);
}

async function pkceChallengeFromVerifier(v){
  const hashed = await sha256(v);
  return base64UrlEncode(hashed);
}

export function loadSession(){
  accessToken = localStorage.getItem(STORAGE.accessToken);
  const exp = parseInt(localStorage.getItem(STORAGE.expiresAt) || "0", 10);
  expiresAt = Number.isFinite(exp) ? exp : 0;
}

export function logout(){
  accessToken = null;
  expiresAt = 0;
  localStorage.removeItem(STORAGE.accessToken);
  localStorage.removeItem(STORAGE.refreshToken);
  localStorage.removeItem(STORAGE.expiresAt);
  localStorage.removeItem(STORAGE.pkceVerifier);
  localStorage.removeItem(STORAGE.authState);
}

export function isAuthed(){
  return !!accessToken;
}

export async function ensureAuthedOrRedirect(){
  // Handle callback first
  await handleCallbackIfPresent();
  loadSession();
  if (accessToken) return;

  // No login screen: auto-redirect to Spotify
  await beginAuthRedirect();
}

async function beginAuthRedirect(){
  const clientId = getEnv("VITE_SPOTIFY_CLIENT_ID");
  const redirectUri = getEnv("VITE_SPOTIFY_REDIRECT_URI");

  if (!clientId || !redirectUri || clientId.includes("YOUR_") || redirectUri.includes("YOUR_")){
    throw new Error("Missing VITE_SPOTIFY_CLIENT_ID or VITE_SPOTIFY_REDIRECT_URI in .env");
  }

  const verifier = randomString(64);
  const challenge = await pkceChallengeFromVerifier(verifier);
  localStorage.setItem(STORAGE.pkceVerifier, verifier);

  const state = randomString(16);
  localStorage.setItem(STORAGE.authState, state);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SCOPES.join(" "),
    state,
    code_challenge_method: "S256",
    code_challenge: challenge
  });

  window.location = `${AUTH_ENDPOINT}?${params.toString()}`; // redirects user to Spotify login/consent [web:88]
}

async function handleCallbackIfPresent(){
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (!code && !error) return;

  window.history.replaceState({}, document.title, url.origin + url.pathname);

  if (error) throw new Error(`Spotify auth error: ${error}`);

  const expectedState = localStorage.getItem(STORAGE.authState);
  if (!state || state !== expectedState) throw new Error("State mismatch");

  const clientId = getEnv("VITE_SPOTIFY_CLIENT_ID");
  const redirectUri = getEnv("VITE_SPOTIFY_REDIRECT_URI");
  const verifier = localStorage.getItem(STORAGE.pkceVerifier);

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier
  });

  const resp = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });

  if (!resp.ok) throw new Error(`Token exchange failed (${resp.status})`);

  const data = await resp.json();
  accessToken = data.access_token;
  const refreshToken = data.refresh_token || null;
  expiresAt = Date.now() + (data.expires_in * 1000) - 10_000;

  localStorage.setItem(STORAGE.accessToken, accessToken);
  localStorage.setItem(STORAGE.expiresAt, String(expiresAt));
  if (refreshToken) localStorage.setItem(STORAGE.refreshToken, refreshToken);

  localStorage.removeItem(STORAGE.pkceVerifier);
  localStorage.removeItem(STORAGE.authState);
}

async function refreshIfNeeded(){
  if (!accessToken) return false;
  if (Date.now() < expiresAt) return true;

  const clientId = getEnv("VITE_SPOTIFY_CLIENT_ID");
  const refreshToken = localStorage.getItem(STORAGE.refreshToken);
  if (!refreshToken) return false;

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });

  const resp = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });

  if (!resp.ok) return false;

  const data = await resp.json();
  accessToken = data.access_token;
  expiresAt = Date.now() + (data.expires_in * 1000) - 10_000;

  localStorage.setItem(STORAGE.accessToken, accessToken);
  localStorage.setItem(STORAGE.expiresAt, String(expiresAt));
  return true;
}

export async function api(endpoint, options = {}){
  await refreshIfNeeded();
  if (!accessToken) return null;

  const resp = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (resp.status === 204 || resp.status === 202) return { ok: true };

  if (resp.status === 401){
    setStatus("Session expired. Redirecting to Spotify login…");
    logout();
    await beginAuthRedirect();
    return null;
  }

  if (!resp.ok){
    let msg = `Spotify API error ${resp.status}`;
    try {
      const j = await resp.json();
      if (j?.error?.message) msg = j.error.message;
    } catch {}
    setStatus(msg);
    return null;
  }

  return resp.json();
}
