import { NextResponse } from "next/server";

export const revalidate = 300;

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

const CLIPS_CACHE_TTL_MS = 5 * 60 * 1000;
const clipsResponseCache = new Map<string, { storedAt: number; payload: unknown }>();

type TwitchTokenResponse = {
  access_token: string;
  expires_in: number;
};

type TwitchGame = {
  id: string;
  name: string;
};

type TwitchGamesResponse = {
  data: TwitchGame[];
};

type TwitchClip = {
  id: string;
  url: string;
  embed_url: string;
  broadcaster_id: string;
  broadcaster_name: string;
  creator_name: string;
  title: string;
  view_count: number;
  created_at: string;
  thumbnail_url: string;
  duration: number;
};

type TwitchClipsResponse = {
  data: TwitchClip[];
  pagination?: { cursor?: string };
};

type TwitchUser = {
  id: string;
  profile_image_url: string;
};

type TwitchUsersResponse = {
  data: TwitchUser[];
};

let cachedToken = "";
let tokenExpiresAt = 0;

async function getTwitchToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const response = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
    { method: "POST" }
  );

  if (!response.ok) {
    throw new Error("Failed to fetch Twitch token");
  }

  const data = (await response.json()) as TwitchTokenResponse;
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000;
  return cachedToken;
}

const KEIZAAL_TERMS = [
  "keizaal",
  "keizaal rp",
  "keizaal roleplay",
  "keizaalrp",
  "keizaalroleplay",
  "keizaal-rp",
  "keizaal-roleplay",
  "#keizaal",
  "#keizaalrp",
  "!keizaal",
  "!keizaalrp",
  "keizaal_rp",
  "keizaal_roleplay",
  "keizaal.live",
  "skyrim rp",
  "skyrim roleplay",
  "skyrimrp",
  "skyrimroleplay",
  "skyrim-rp",
  "skyrim-roleplay",
  "#skyrimrp",
  "!skyrimrp",
  "skyrim_rp",
  "skyrim_roleplay",
];

function matchesKeywords(text: string) {
  const lower = text.toLowerCase();
  return KEIZAAL_TERMS.some((term) => lower.includes(term));
}

const TWITCH_GAME_CANDIDATES: { name: string; fallbackId?: string }[] = [
  { name: "The Elder Scrolls V: Skyrim", fallbackId: "18846" },
  { name: "The Elder Scrolls V: Skyrim - Special Edition" },
];

async function getGameIds(token: string) {
  const ids = new Set<string>();

  for (const candidate of TWITCH_GAME_CANDIDATES) {
    const gameRes = await fetch(
      `https://api.twitch.tv/helix/games?name=${encodeURIComponent(candidate.name)}`,
      {
        headers: {
          "Client-ID": TWITCH_CLIENT_ID!,
          Authorization: `Bearer ${token}`,
        },
        next: { revalidate: 86400 },
      }
    );

    if (gameRes.ok) {
      const gameData = (await gameRes.json()) as TwitchGamesResponse;
      const id = gameData?.data?.[0]?.id;
      if (typeof id === "string" && id.length > 0) {
        ids.add(id);
        continue;
      }
    }

    if (candidate.fallbackId) {
      ids.add(candidate.fallbackId);
    }
  }

  return Array.from(ids);
}

function getRangeWindows(range: string) {
  const now = new Date();
  const windows: { startedAt: string; endedAt: string }[] = [];

  if (range === "24h") {
    const started = new Date(now);
    started.setHours(started.getHours() - 24);
    windows.push({ startedAt: started.toISOString(), endedAt: now.toISOString() });
    return windows;
  }

  if (range === "30d") {
    const end = new Date(now);
    const start = new Date(now);
    start.setDate(start.getDate() - 30);

    const cursorEnd = new Date(end);
    while (cursorEnd.getTime() > start.getTime()) {
      const cursorStart = new Date(cursorEnd);
      cursorStart.setDate(cursorStart.getDate() - 7);
      if (cursorStart.getTime() < start.getTime()) {
        cursorStart.setTime(start.getTime());
      }
      windows.push({ startedAt: cursorStart.toISOString(), endedAt: cursorEnd.toISOString() });
      cursorEnd.setTime(cursorStart.getTime());
    }

    return windows;
  }

  const started = new Date(now);
  started.setDate(started.getDate() - 7);
  windows.push({ startedAt: started.toISOString(), endedAt: now.toISOString() });
  return windows;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const range = requestUrl.searchParams.get("range") || "7d";
  const limitRaw = requestUrl.searchParams.get("limit");
  const limitParsed = limitRaw ? Number.parseInt(limitRaw, 10) : 48;
  const targetLimit = Number.isFinite(limitParsed) ? Math.min(Math.max(limitParsed, 1), 250) : 48;

  const cacheKey = `${range}:${targetLimit}`;
  const cached = clipsResponseCache.get(cacheKey);
  if (cached && Date.now() - cached.storedAt < CLIPS_CACHE_TTL_MS) {
    const response = NextResponse.json(cached.payload);
    response.headers.set("X-Keizaal-Cache", "hit");
    response.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=60");
    response.headers.set("CDN-Cache-Control", "public, s-maxage=300, stale-while-revalidate=60");
    response.headers.set("Vercel-CDN-Cache-Control", "public, s-maxage=300, stale-while-revalidate=60");
    return response;
  }

  try {
    if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
      throw new Error("Missing Twitch credentials");
    }

    const windows = getRangeWindows(range);

    const token = await getTwitchToken();
    const gameIds = await getGameIds(token);

    const clipsById = new Map<string, TwitchClip>();

    for (const gameId of gameIds) {
      for (const window of windows) {
        let cursor = "";
        let pagesFetched = 0;
        let matchesAddedForWindow = 0;
        const maxPages = 5;
        const desiredMatchesForWindow = Math.min(Math.max(targetLimit, 48), 120);

        while (pagesFetched < maxPages) {
          const clipsUrl = new URL("https://api.twitch.tv/helix/clips");
          clipsUrl.searchParams.set("game_id", gameId);
          clipsUrl.searchParams.set("first", "100");
          clipsUrl.searchParams.set("started_at", window.startedAt);
          clipsUrl.searchParams.set("ended_at", window.endedAt);
          if (cursor) {
            clipsUrl.searchParams.set("after", cursor);
          }

          const clipsRes = await fetch(clipsUrl.toString(), {
            headers: {
              "Client-ID": TWITCH_CLIENT_ID,
              Authorization: `Bearer ${token}`,
            },
            next: { revalidate: 300 },
          });

          if (!clipsRes.ok) {
            break;
          }

          const clipsData = (await clipsRes.json()) as TwitchClipsResponse;
          const clipsPage = clipsData.data || [];
          if (clipsPage.length === 0) {
            break;
          }

          for (const clip of clipsPage) {
            if (!clip?.id) continue;
            if (!matchesKeywords(clip.title)) continue;
            clipsById.set(clip.id, clip);
            matchesAddedForWindow += 1;
          }

          pagesFetched += 1;
          const nextCursor = clipsData.pagination?.cursor;
          if (!nextCursor) {
            break;
          }

          cursor = nextCursor;

          if (matchesAddedForWindow >= desiredMatchesForWindow) {
            break;
          }
        }
      }
    }

    const filtered = Array.from(clipsById.values())
      .sort((a, b) => b.view_count - a.view_count)
      .slice(0, targetLimit);

    const broadcasterIds = Array.from(new Set(filtered.map((c) => c.broadcaster_id)));
    const profileImages: Record<string, string> = {};

    for (let i = 0; i < broadcasterIds.length; i += 100) {
      const chunk = broadcasterIds.slice(i, i + 100);
      const usersUrl = new URL("https://api.twitch.tv/helix/users");
      chunk.forEach((id) => usersUrl.searchParams.append("id", id));

      const usersRes = await fetch(usersUrl.toString(), {
        headers: {
          "Client-ID": TWITCH_CLIENT_ID,
          Authorization: `Bearer ${token}`,
        },
        next: { revalidate: 3600 },
      });

      if (!usersRes.ok) {
        continue;
      }

      const usersData = (await usersRes.json()) as TwitchUsersResponse;
      for (const user of usersData.data || []) {
        if (!user?.id) continue;
        profileImages[user.id] = user.profile_image_url;
      }
    }

    const totalViews = filtered.reduce((acc, c) => acc + (c.view_count || 0), 0);
    const generatedAt = new Date().toISOString();

    const payload = {
      generatedAt,
      range,
      stats: {
        clips: filtered.length,
        totalViews,
      },
      clips: filtered.map((c) => ({
        id: c.id,
        url: c.url,
        embedUrl: c.embed_url,
        title: c.title,
        viewCount: c.view_count,
        createdAt: c.created_at,
        duration: c.duration,
        thumbnailUrl: c.thumbnail_url,
        broadcasterId: c.broadcaster_id,
        broadcasterName: c.broadcaster_name,
        broadcasterProfileImageUrl: profileImages[c.broadcaster_id] || "",
        creatorName: c.creator_name,
      })),
    };

    clipsResponseCache.set(cacheKey, { storedAt: Date.now(), payload });
    const response = NextResponse.json(payload);
    response.headers.set("X-Keizaal-Cache", "miss");

    response.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=60");
    response.headers.set("CDN-Cache-Control", "public, s-maxage=300, stale-while-revalidate=60");
    response.headers.set("Vercel-CDN-Cache-Control", "public, s-maxage=300, stale-while-revalidate=60");
    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";

    if (cached) {
      const response = NextResponse.json(cached.payload);
      response.headers.set("X-Keizaal-Cache", "stale");
      response.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=60");
      response.headers.set("CDN-Cache-Control", "public, s-maxage=60, stale-while-revalidate=60");
      response.headers.set("Vercel-CDN-Cache-Control", "public, s-maxage=60, stale-while-revalidate=60");
      return response;
    }

    const response = NextResponse.json({ error: message }, { status: 500 });
    response.headers.set("X-Keizaal-Cache", "error");
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
