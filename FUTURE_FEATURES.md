# Future Features Roadmap

## Native Multistream Hub (Keizaal Multi-Viewer)

Instead of sending users off-site to MultiTwitch or Kadgar, build a native multistream viewing experience directly into `keizaal.live`.

### Goals
- Let viewers watch 2–6 Twitch streams at once without leaving keizaal.live (one main view, up to 5 other streams wrapped around the main view - 3x at bottom and 2x on right side)
- Allow users to build and save “groups” (stream sets) for events and recurring POVs
- Keep the current “directory” experience lightweight; multistream is an opt-in route

### Constraints / Notes
- Twitch embeds require the correct `parent` domain(s). This must be configured for `keizaal.live` (and any preview/staging domains you care about).
- Multiple embedded players can be heavy; we need layout caps (2–6 max) and guardrails for lower-end devices.
- Chat embeds add even more weight; a “chat panel” should be optional/toggleable.
- mobile phone not permitted, add a message saying multistream only available on tablets and desktops.

### MVP Phasing

#### Phase 1 (No Auth, Shareable Links)
**Objective:** Make a usable multistream page quickly, without accounts.
- Route: `/multistream`
- Select streams from current live list (client-side only)
- Layout presets: `2-up`, `3-up`, `4-up`, `5-up`, `6-up`
- Default layout for 4–6: **Focus layout** (1 main + up to 5 side tiles: 3 along the bottom, 2 on the right)
- Shareable URL using query params, e.g. `/multistream?channels=a,b,c&layout=3`
- No persistence beyond the URL

#### Phase 2 (Auth + Saved Groups)
**Objective:** Let people save “groups” with names and quick-load them later.
- Twitch login via OAuth
- “Save group” / “Load group” UI
- Basic group management (rename, delete)

#### Phase 3 (Polish + Chat)
**Objective:** Make it feel premium and event-friendly.
- Optional chat column with a tabbed chat switcher
- “Focus mode” (click a stream to enlarge it; others become smaller)
- Keybinds (cycle focus, toggle chat, mute/unmute)

### UX Plan

#### Entry Points
- Add an “Add to Multistream” action on each live stream card (plus a small counter in the header like “2 selected”).
- A “Watch Selected” button opens `/multistream` in a new tab.

#### Multistream Page Layout
- Top bar: selected channels, layout selector, clear selection, open each on Twitch
- Main area: responsive layout supporting 2–6 streams
- Optional right panel: chat (toggle)

### Focus Layout Spec (4–6 Streams)

This is the default for `layout=4|5|6` unless `mode=grid` is explicitly chosen.

### Layout Spec (2–3 Streams)

For 2–3 streams we keep it simple and prioritize readability.

#### Defaults
- `layout=2`: default `mode=grid` (2-up)
- `layout=3`: default `mode=grid` (3-up)
- Users can switch to `mode=focus` if they want one main POV

#### Breakpoints
- **Desktop (≥ 1024px):**
  - `layout=2` grid: 2 tiles side-by-side (16:9)
  - `layout=3` grid: 3 tiles in a row (16:9) if space allows; otherwise 2 + 1 wrap
  - `mode=focus`:
    - Main tile on top
    - 1–2 smaller tiles along the bottom
- **Tablet (768px–1023px):**
  - Prefer `mode=grid` for 2–3
  - If `mode=focus`, use main + bottom row (no right rail)

#### Layout Geometry
- **Main player:** large tile in the top-left (dominant view)
- **Right rail:** up to 2 smaller tiles stacked vertically on the right
- **Bottom rail:** up to 3 smaller tiles along the bottom (full width of the main + right rail)

Mapping example (6 streams total):
- Main: 1
- Right rail: 2
- Bottom rail: 3

#### Breakpoints
- **Desktop (≥ 1024px):**
  - Enable full focus layout (main + right rail + bottom rail)
  - Default `layout=4` uses: main + 1 right + 2 bottom
  - Default `layout=5` uses: main + 2 right + 2 bottom
  - Default `layout=6` uses: main + 2 right + 3 bottom
- **Tablet (768px–1023px):**
  - Keep focus layout but simplify to avoid tiny tiles:
    - `layout=4`: main + 3 bottom (no right rail)
    - `layout=5`: main + 3 bottom + 1 extra tile toggled via “Next” (or switch to grid)
    - `layout=6`: strongly recommend grid; if forced, main + 3 bottom + 2 extra tiles toggled
- **Phone (< 768px):**
  - Hard blocked. Show a friendly message:
    - “Multistream is available on tablets and desktops.”
    - Buttons: “Back to Live Streams” and “Back to Top Clips”

#### Tile Sizing Targets
- **Main tile:** ~65–75% of available area (visually dominant)
- **Side tiles:** large enough to read the stream UI; keep minimum ~240px width/height where possible
- Maintain **16:9 aspect ratio** for all player tiles

#### Stream Ordering Rules
- The first channel in `channels=` is the initial **focused/main** stream.
- Clicking any side tile promotes it to the main tile (swap positions).
- Provide an explicit “Set as Main” action in a tile overflow menu for accessibility.

#### Audio Rules (Important)
- Default behavior:
  - **Main stream unmuted**
  - **All other streams muted**
- UI controls:
  - “Mute all” toggle
  - Per-tile mute toggle (for power users)
  - Optional “Audio follows focus” toggle (recommended ON by default)

#### Player Lifecycle / Performance
- Only mount 2–4 players immediately.
- For 5–6 streams, lazy-mount the extra tiles after user interaction (or after the page becomes idle).
- Provide “Low Power Mode”:
  - Keeps only the main stream playing
  - Pauses/unmounts other players
  - Disables chat panel

#### Chat Behavior
- Chat is optional and off by default for 4–6 layouts.
- If enabled, chat follows the focused stream (tabbed chat optional later).

#### Accessibility
- Keyboard navigation: cycle focus between tiles
- Visible focus ring on selected tile
- All controls have labels/tooltips

#### Shareable Links
- Query param approach:
  - `channels`: comma-separated list of Twitch logins
  - `layout`: `2|3|4|5|6`
  - `mode`: `grid|focus` (default `focus` for 4–6)
  - `chat`: `0|1`
- Example: `/multistream?channels=its_teewee,kyle,ziggy&layout=3&mode=grid&chat=1`
- Example: `/multistream?channels=its_teewee,kyle,ziggy,tharythefair&layout=4&mode=focus&chat=0`

### URL Schema + Saved Groups

#### URL Schema (Phase 1)

Canonical format:
- `/multistream?channels=<csv>&layout=<n>&mode=<grid|focus>&chat=<0|1>&focus=<login>&muted=<csv>&v=<int>`

Fields:
- `channels`: comma-separated Twitch logins, ordered by user selection.
- `layout`: `2|3|4|5|6` (how many tiles to show).
- `mode`: `grid|focus`.
- `chat`: `0|1` (whether chat panel is enabled).
- `focus`: Twitch login that should be the **main** stream on load. If omitted, `channels[0]` is used.
- `muted`: comma-separated Twitch logins that should start muted. Default: all except `focus` muted.
- `v`: version number for forwards compatibility (start with `1`).

Validation rules:
- De-duplicate channels.
- Preserve order of first appearance.
- Enforce caps:
  - `layout` cannot exceed the number of channels.
  - `layout` cannot exceed 6.
- If `mode=focus` and `layout>=4`, enforce the focus layout breakpoints rules (tablet/desktop).
- If `focus` is not in `channels`, ignore it and fall back to `channels[0]`.

Examples:
- Minimal: `/multistream?channels=its_teewee,kyle&layout=2&mode=grid&chat=0&v=1`
- Focus: `/multistream?channels=a,b,c,d,e,f&layout=6&mode=focus&chat=0&focus=d&v=1`

#### Saved Groups (Phase 2)

Goal: make group URLs stable and shareable, while still allowing private groups by default.

Proposed routes:
- **Private group:** `/multistream/g/<groupId>`
- **Public share link (optional Phase 2.5):** `/multistream/s/<shareId>`

Behavior:
- Visiting `/multistream/g/<groupId>`:
  - Requires login (Supabase session).
  - Loads group config from DB, then renders multistream.
- Visiting `/multistream/s/<shareId>`:
  - Does not require login.
  - Loads a limited, read-only share record.

Mapping group → query model:
- Store:
  - `channels`, `layout`, `mode`, `chat_enabled`
  - `focus` (optional)
  - `muted` (optional; otherwise derived)
- When rendering, you can internally represent everything as the Phase 1 query model so the rest of the UI logic is shared.

Public groups (optional):
- Add `is_public` boolean + `share_id` text unique + `share_created_at`
- Share page shows a simple banner: “Viewing a shared multistream group”

### /multistream UI Wireframe (Spec)

#### Mobile Gate (Phone)
If viewport width is phone-sized:
- Centered message:
  - Title: “Multistream is not available on mobile”
  - Body: “Please use a tablet or desktop.”
- Buttons:
  - “Back to Live Streams” → `/`
  - “Back to Top Clips” → `/clips`

#### Top Bar (Always Visible)
Left:
- Keizaal Live logo (click → `/`)
- Breadcrumb: `Live Streams / Multistream` (optional)

Center:
- **Selected channels pills** (max 6 shown; overflow becomes `+N`)
  - Each pill: avatar + login + remove `×`

Right:
- Layout selector: `2 3 4 5 6`
- Mode toggle: `Grid | Focus`
- Chat toggle: `Chat`
- Low Power Mode toggle
- “Open all on Twitch” (opens each selected stream in new tabs)
- “Clear” (removes all selections)

#### Main Area

Grid mode:
- Responsive grid with fixed 16:9 tiles
- Clicking a tile opens a mini menu:
  - “Set as Main” (only meaningful if switching to Focus later)
  - “Mute/Unmute”
  - “Open on Twitch”

Focus mode (4–6):
- Main tile top-left
- Right rail (up to 2)
- Bottom rail (up to 3)
- Clicking any tile makes it the main tile (swap animation)

#### Chat Panel (Optional)
- Right side panel
- Defaults OFF for layout 4–6
- When ON:
  - Chat follows the focused stream
  - Toggle: “Follow focus”
  - Button: “Popout chat” (opens Twitch popout chat in new tab)

#### Phase 2 UI (when authenticated)
Top bar additions:
- “Save Group” button
- “My Groups” dropdown:
  - list groups
  - load group
  - rename
  - delete

Save Group Modal:
- Name input
- Layout + mode summary
- Checkbox: “Enable chat by default”
- Button: “Save”

### Embed Implementation Notes

#### Twitch Embed URLs

**Player (iframe):**
- Base: `https://player.twitch.tv/`
- Query params:
  - `channel=<twitch_login>`
  - `parent=<domain>` (required; can be repeated for multiple parents)
  - `muted=true|false`
  - `autoplay=true|false`

Example (prod):
- `https://player.twitch.tv/?channel=its_teewee&parent=keizaal.live&muted=true&autoplay=true`

Example (dev):
- `https://player.twitch.tv/?channel=its_teewee&parent=localhost&muted=true&autoplay=true`

**Chat (iframe):**
- Base: `https://www.twitch.tv/embed/<twitch_login>/chat`
- Query params:
  - `parent=<domain>` (required; can be repeated)

Example:
- `https://www.twitch.tv/embed/its_teewee/chat?parent=keizaal.live`

#### Parent Domain Handling
- Twitch does not allow wildcards for `parent`.
- Practical approach:
  - Support `keizaal.live` (prod)
  - Support `localhost` for dev
  - Optionally support one stable staging domain if you use it
- Preview deployment domains are a maintenance burden; easiest is to disable embeds on previews.

#### Avoiding Player Reloads When Swapping Focus

Goal: when user clicks a side tile to make it the main tile, we should not re-create player iframes (which causes stream reloads).

Approach:
- Keep a stable “player container” per channel that contains the iframe.
- When focus changes:
  - Reorder the containers in the DOM (or switch CSS grid areas / `order`) so the focused container moves to the main slot.
  - Do not change the iframe `src`.
- Audio rules should be applied on focus change:
  - Focused stream unmuted, others muted.

Implementation options:
- **Simple (iframe-only):** no direct programmatic control; rely on the user’s Twitch player UI for mute/unmute.
  - Not ideal for “audio follows focus”.
- **Recommended:** use the Twitch Embed JS API to create Player instances per channel so we can call:
  - `setMuted(true/false)`
  - `setVolume(x)`
  - (and potentially pause/unmount in Low Power Mode)

#### Lazy Mounting + Low Power Mode
- For `layout=5|6`, mount the 5th/6th players only after:
  - user clicks “Enable 5–6 streams”, or
  - user interacts with the multistream page (first click), or
  - browser is idle (deferred mount)
- Low Power Mode:
  - keep only the focused player mounted and playing
  - replace others with thumbnails and “Click to load” buttons

### Data Model (Phase 2+)

#### Tables / Collections
- `users`
  - `id`
  - `twitchUserId`
  - `twitchLogin`
  - `displayName`
  - `avatarUrl`
- `groups`
  - `id`
  - `userId`
  - `name`
  - `channels` (array of Twitch logins)
  - `layout` (2|3|4|5|6)
  - `mode` (`grid|focus`)
  - `chatEnabled` (boolean)
  - `createdAt`, `updatedAt`

### Auth + Storage Options (Phase 2)
- **Recommended (since you already have it): Supabase**
  - Supabase Auth for login/session
  - Supabase Postgres for `users` + `groups`
  - Row Level Security (RLS) to ensure users can only access their own groups
- Alternative: NextAuth/Auth.js + Postgres (Neon/Vercel Postgres)
- Not recommended long-term: KV-only persistence for groups (works, but less flexible for filtering/searching)

### Supabase Plan (Phase 2)

#### Auth
- Login provider: Twitch OAuth via Supabase Auth
- Store `twitch_user_id` + `twitch_login` in a `profiles` table
- Session handled by Supabase client on the multistream page (SSR optional)

#### Database Schema (Supabase)

`profiles`
- `id` uuid primary key references `auth.users.id`
- `twitch_user_id` text unique
- `twitch_login` text
- `display_name` text
- `avatar_url` text
- `created_at` timestamptz default now()

`groups`
- `id` uuid primary key default gen_random_uuid()
- `user_id` uuid references `auth.users.id` on delete cascade
- `name` text
- `channels` text[] (Twitch logins)
- `layout` int (2/3/4/5/6)
- `mode` text (`grid|focus`) default 'focus'
- `chat_enabled` boolean default false
- `created_at` timestamptz default now()
- `updated_at` timestamptz default now()

#### RLS Policies (Supabase)
- Enable RLS on `profiles` and `groups`
- `profiles`: allow read/write where `auth.uid() = id`
- `groups`: allow CRUD where `auth.uid() = user_id`

### Implementation Checklist (when we build it)
- Phase 1
  - Add stream selection state to the live directory page (selected channels)
  - Add “Watch Selected” button → opens `/multistream?channels=...`
  - Add `/multistream` page that reads query params and renders 2–4 embeds
  - Add layout toggle (2/3/4) and chat toggle
- Phase 2 (Supabase)
  - Add “Login with Twitch” in multistream page header
  - Create `profiles` and `groups` tables + RLS
  - Add “Save group” modal (name + current selection + layout/chat)
  - Add “My groups” list (load/rename/delete)
  - Optionally: allow “public groups” share links (a future Phase 2.5)

### Environment Variables (Phase 2)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; never exposed to the client)

### Twitch Embed Requirements
- Player embed needs `parent` set to `keizaal.live` (and optionally `localhost` for dev).
- Chat embed also needs the same `parent` setting.
- If we support multiple domains (preview deployments), we need a strategy:
  - Only enable embeds on prod domain
  - Or maintain a small allowlist of preview domains and accept the maintenance

### Performance Guardrails
- Hard cap 6 streams
- Default to 2–4 on first use; require an explicit user action to enable 5–6 if performance is poor
- Lazy-load players (only mount if in viewport / after user confirms)
- “Low power mode” toggle: pause non-focused streams, disable chat

### Device Support
- Desktop + tablet supported
- On mobile phones, show a friendly “Multistream is available on tablets and desktops” message with a link back to `/` and `/clips`

### Risks
- Twitch policy changes around embeds/auth
- Browser memory/CPU spikes with 6 streams + chat
- Moderation concerns (chat shown on-site)

*Note: This requires careful handling of Twitch's embedding policies (parent domain requirements) and managing browser memory so multiple video players don't crash lower-end devices.*
