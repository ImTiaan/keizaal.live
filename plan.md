# keizaal.live — Keizaal RP Live Streams (Twitch)

## Goal

Build a single page that automatically lists all live streams on Twitch for people playing **The Elder Scrolls V: Skyrim** on the **Keizaal roleplay server**, sorted by **most viewers → least viewers**, with one special ordering rule:

- If `its_teewee` (Twitch) is live, keep it **2nd** in the list
- Exception: if `its_teewee` has the **most viewers**, it should be **1st**

Also add a top banner menu with right-aligned links:

- “Keizaal Online” → https://keizaal.com
- “Official Discord” → https://discord.gg/zzCQ45nzyz

Visual direction: take cues from the Keizaal site example (dark, minimal, premium), but do not reuse the Chase RP site’s color palette or styling.

## What counts as a “Keizaal stream”

We need deterministic rules so the site auto-finds streams without manual curation.

### Twitch identification options (pick 1 primary, keep others as fallback)

1. Category must be “The Elder Scrolls V: Skyrim” AND stream title contains one of:
   - `keizaal`
   - `keizaal rp`
   - `keizaal roleplay`
   - `keizaalrp`
   - `keizaalroleplay`
   - `keizaal-rp`
   - `keizaal-roleplay`
   - `#keizaal`
   - `#keizaalrp`
   - `!keizaal`
   - `!keizaalrp`
   - `keizaal_rp`
   - `keizaal_roleplay`
   - `keizaal.live`
   - `skyrim rp`
   - `skyrim roleplay`
   - `skyrimrp`
   - `skyrimroleplay`
   - `skyrim-rp`
   - `skyrim-roleplay`
   - `#skyrimrp`
   - `!skyrimrp`
   - `skyrim_rp`
   - `skyrim_roleplay`
2. Category must be Skyrim AND channel is in an allowlist (curated list)
3. Category must be Skyrim AND stream uses specific Twitch tags (if we define them)

Recommendation: Start with (1) because it’s zero-maintenance, then add an allowlist override for edge cases.

### Kick identification options

do not do kick for now.

## Data sources & API approach

### Twitch

- Use Twitch Helix API (requires `Client ID` + `Client Secret`).
- Use an app access token generated server-side; never expose secrets to the browser.
- Queries:
  - Fetch streams for game/category Skyrim (by game id)
  - Filter by title keywords (client-side after fetch) or search endpoints if suitable
  - Hydrate with user profile images where needed

### Kick

do not do kick for now.

### Aggregation layer (recommended)

Build a single server endpoint:

`GET /api/streams`

Response:

```json
{
  "generatedAt": "2026-04-11T00:00:00Z",
  "stats": {
    "liveStreams": 12,
    "totalViewers": 1200
  },
  "streams": [
    {
      "platform": "twitch",
      "channel": "its_teewee",
      "title": "…",
      "viewerCount": 123,
      "thumbnailUrl": "…",
      "profileImageUrl": "…",
      "url": "https://twitch.tv/its_teewee",
      "isLive": true
    }
  ]
}
```

Key behaviors:

- Cache upstream calls (60 seconds) to avoid rate limiting.
- Normalize fields so the frontend renders Twitch cards consistently.
- Include aggregated stats (live stream count + total viewers) so the UI can render a simple summary bar.

## Sorting & the “teewee always second” rule

Baseline sort: descending `viewerCount`.

Then apply the priority rule:

- If `its_teewee` is not present: keep baseline order.
- If `its_teewee` is present and has the top viewer count: keep at index 0.
- If `its_teewee` is present and NOT top: place at index 1.

Reference logic:

```txt
streamsSorted = streams sort by viewerCount desc
teeweeIndex = indexOf(channel == "its_teewee" && platform == "twitch")

if teeweeIndex == -1: return streamsSorted

if teeweeIndex == 0: return streamsSorted

teewee = remove(streamsSorted, teeweeIndex)
insert streamsSorted at index 1 with teewee
return streamsSorted
```

Edge case:

- If there is only 1 stream total and it’s `its_teewee`, it stays 1st.
- If there is only 1 stream total and it’s not `its_teewee`, normal behavior.

## UI / UX brainstorm (Keizaal-esque, not Chase-esque)

### Layout

- Top banner:
  - Left: “KEIZAAL LIVE” (or “KEIZAAL STREAMS”)
  - Right: the two links (Keizaal Online + Official Discord)
- Main content:
  - “Live Streams” header
  - Compact stats row: total live streams + total viewers + refresh control + “last updated” time
  - Grid of stream cards (responsive: 1 column mobile → 2/3/4 desktop)

### Mobile-first requirements

- Keep the top banner usable on small screens (no tiny text): allow the right-side links to wrap onto a second line when needed.
- Keep the stats row readable on mobile: allow it to wrap into two lines and keep the refresh control easy to tap.
- Use a single-column stream grid on mobile with comfortable spacing; avoid side-by-side cards until there is room.
- Make each stream card fully tappable with clear tap targets (aim for ~44px+).
- Do not rely on hover-only affordances; ensure the “live” and viewer count info is always visible.
- Ensure the “How to Get Featured” accordion works well on touch and is readable without horizontal scrolling.

### Stats + refresh behavior

- Stats to display:
  - Live streams: count of matching live streams currently shown.
  - Total viewers: sum of `viewerCount` across all shown streams.
- “Last updated” indicator:
  - Display the `generatedAt` timestamp from `/api/streams` so users can tell if the data is fresh.
- Refresh control:
  - Provide a visible “Refresh” action that re-fetches `/api/streams` and re-renders.
  - Backend caching still applies; refresh should update immediately if cache has expired, otherwise the “last updated” time makes it clear the response is cached.

### Expandable “How to Get Featured” section

Add an expandable section (accordion) under the stream grid titled:

- “How to Get Featured on This Site”

Content copy (draft):

To get featured on this site, your stream must be in the **The Elder Scrolls V: Skyrim** category and include one of these tags or terms in your stream title — capitalization does not matter:

- `keizaal`
- `keizaal rp`
- `keizaal roleplay`
- `keizaalrp`
- `keizaalroleplay`
- `keizaal-rp`
- `keizaal-roleplay`
- `#keizaal`
- `#keizaalrp`
- `!keizaal`
- `!keizaalrp`
- `keizaal_rp`
- `keizaal_roleplay`
- `keizaal.live`
- `skyrim rp`
- `skyrim roleplay`
- `skyrimrp`
- `skyrimroleplay`
- `skyrim-rp`
- `skyrim-roleplay`
- `#skyrimrp`
- `!skyrimrp`
- `skyrim_rp`
- `skyrim_roleplay`

Streams are automatically detected and updated. If you meet these requirements and are live, your stream should appear within a few minutes.

### Stream card

- Large thumbnail with subtle hover lift
- Platform badge (Twitch)
- Channel name, stream title (truncate), viewer count
- Click opens stream in a new tab

### Empty state

- If no streams match:
  - A minimal message like “No Keizaal RP streams are live right now.”
  - Keep the page looking intentional (not “broken”).

### Visual language

- Dark background, lots of negative space
- One accent color (teal/cyan similar to Keizaal’s vibe), but not copied from any other site
- Typography: strong headline + readable body (avoid neon gradients / heavy borders)

## Technical architecture (high-level)

- Frontend: static site that calls `/api/streams` and renders the grid.
- Backend: a small serverless function (or lightweight Node service) that:
  - Fetches Twitch live data
  - Applies filtering rules (Skyrim + Keizaal keywords/allowlist)
  - Normalizes + sorts (including the `its_teewee` placement)
  - Caches results

## Deployment & domain

- Domain: `keizaal.live`
- Hosting: Vercel
- Use HTTPS and CDN caching for the frontend.
- Ensure the API endpoint is same-origin (recommended) or CORS-safe if separated.
- Configure environment variables in Vercel (server-side only):
  - `TWITCH_CLIENT_ID`
  - `TWITCH_CLIENT_SECRET`
- Use HTTP caching headers on `GET /api/streams` so refresh feels instant while still respecting rate limits (e.g., cache for ~60–120s).

## Open decisions to lock down next

1. The exact “Keizaal stream” detection rules (keywords list, allowlist, or both).
2. Whether we support:
   - manual “feature my channel” submission flow
   - a multistream viewer (not required; could be later)

## Next steps

- Set up the Vercel project for `keizaal.live` and add the Twitch environment variables.
- Implement `/api/streams` with caching.
- Implement the frontend grid with Keizaal-styled design.
- Add the top banner links exactly as specified.
