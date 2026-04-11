# Multistream Plan (Keizaal Live)

This document describes the implementation plan for native multistream viewing inside `keizaal.live`, including Supabase authentication and saved stream groups per user.

## Goals

- Native multistream viewing inside Keizaal Live (no third-party multistream sites)
- Support 2–6 streams
- Two layout modes:
  - `grid` for 2–3 by default
  - `focus` for 4–6 by default (1 main + up to 5 surrounding)
- Shareable multistream links (Phase 1)
- Twitch login + saved “groups/packages” (Phase 2, Supabase)
- Phone not supported for multistream (tablet/desktop only)

## Phase 1: Multistream MVP (No Auth)

### Deliverables

- New route: `/multistream`
- Phone gate:
  - Message: multistream is tablet/desktop only
  - Buttons back to `/` and `/clips`
- Layout modes:
  - `mode=grid` for 2–3 (default)
  - `mode=focus` for 4–6 (default)
- Focus swapping:
  - Clicking a side tile promotes it to the main slot
  - Avoid reloading streams by keeping each iframe stable and only reordering containers / grid areas
- Audio behavior:
  - Main stream unmuted
  - All other streams muted by default
  - Optional “Audio follows focus” toggle (default ON)
- Entry point from Live Streams page:
  - Per-card “Add to Multistream” action
  - Selected counter in header
  - “Watch Selected” opens `/multistream?...` in a new tab

### URL Schema (Shareable Links)

Canonical format:

`/multistream?channels=<csv>&layout=<n>&mode=<grid|focus>&chat=<0|1>&focus=<login>&muted=<csv>&v=1`

Fields:
- `channels`: comma-separated Twitch logins (ordered)
- `layout`: `2|3|4|5|6`
- `mode`: `grid|focus`
- `chat`: `0|1`
- `focus`: main stream on load (fallback to first channel)
- `muted`: comma-separated logins that start muted (fallback: all except `focus`)
- `v`: version number for future compatibility (start at `1`)

Validation rules:
- De-duplicate channels, keep first occurrence order
- Cap `layout` to `min(6, channels.length)`
- If `focus` not present, use `channels[0]`

## Phase 2: Supabase Auth + Saved Groups

### Auth

- Use Supabase Auth with Twitch OAuth provider
- Store Twitch identity fields in `profiles`

### Database (Supabase)

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
- `focus` text (optional)
- `muted` text[] (optional)
- `created_at` timestamptz default now()
- `updated_at` timestamptz default now()

### RLS Policies (Supabase)

Enable RLS on `profiles` and `groups`:
- `profiles`: allow read/write where `auth.uid() = id`
- `groups`: allow CRUD where `auth.uid() = user_id`

### App UX (Phase 2)

On `/multistream`:
- “Login with Twitch”
- “Save Group” modal:
  - group name
  - current channels/layout/mode/chat
- “My Groups” list:
  - load
  - rename
  - delete

Routes:
- Private group: `/multistream/g/<groupId>` (requires login)
- Optional later: `/multistream/s/<shareId>` for public share links

## Phase 3: Polish

- Chat improvements:
  - Tabbed chat
  - “Follow focus” toggle
  - Popout chat
- Low Power Mode:
  - Only focused stream mounted/playing
  - Others replaced with “Click to load”
- Keyboard shortcuts
- Optional Twitch Embed JS API integration for better mute/volume control

## Twitch Embed Requirements

### Player iframe

Base:
- `https://player.twitch.tv/`

Params:
- `channel=<login>`
- `parent=<domain>` (required)
- `muted=true|false`
- `autoplay=true|false`

### Chat iframe

Base:
- `https://www.twitch.tv/embed/<login>/chat`

Params:
- `parent=<domain>` (required)

### Parent domains

Recommended support:
- `keizaal.live` (prod)
- `localhost` (dev)

Preview domains can be disabled or handled with an allowlist if needed.

## Environment Variables

Add these locally and in Vercel project settings:

- `TWITCH_CLIENT_ID`
- `TWITCH_CLIENT_SECRET`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; never exposed to the browser)
