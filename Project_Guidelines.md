# Project Guidelines (Spotify-Deck)

## Goals
- Simple, reliable, “appliance-like” controller.
- Optimized for Raspberry Pi performance.
- Minimal dependencies.

## Coding guidelines
- Keep UI responsive: avoid heavy DOM updates every poll.
- Prefer `async/await` and centralize API calls in one helper (like `apiRequest`).
- Handle error cases:
  - no playback
  - no active device
  - token expired (401)
  - rate limiting (429)

## UI guidelines
- Touch targets: aim for 44px+ minimum.
- High contrast text (good readability at distance).
- Big album art area; consistent layout.

## Security guidelines
- Don’t commit secrets.
- Use a flow appropriate for a public web app (Authorization Code + PKCE is preferred for SPAs).
- Store only what you need in localStorage; provide a “Logout” to clear tokens.

## Git guidelines
- Small commits, clear messages:
  - `feat: ...`
  - `fix: ...`
  - `docs: ...`
- Use feature branches for changes.
