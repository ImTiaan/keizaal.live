import { NextResponse } from "next/server";

export const revalidate = 0;

type RangeKey = "all" | "24h" | "7d" | "30d" | "90d" | "365d";

type StreamerSessionRow = {
  channel: string;
  started_at: string;
  display_name: string;
  profile_image_url: string;
  max_viewers: number;
  first_seen_at: string;
  last_seen_at: string;
};

type LeaderboardRow = {
  channel: string;
  displayName: string;
  profileImageUrl: string;
  streams: number;
  maxViewers: number;
};

function assertEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function getSupabaseUrl() {
  return (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
}

function parseRange(value: string | null): RangeKey {
  if (
    value === "all" ||
    value === "24h" ||
    value === "7d" ||
    value === "30d" ||
    value === "90d" ||
    value === "365d"
  ) {
    return value;
  }
  return "7d";
}

function rangeToDays(range: RangeKey) {
  if (range === "24h") return 1;
  if (range === "7d") return 7;
  if (range === "30d") return 30;
  if (range === "90d") return 90;
  return 365;
}

function nowIso() {
  return new Date().toISOString();
}

async function supabaseFetch(path: string, init?: RequestInit) {
  const url = getSupabaseUrl();
  if (!url) throw new Error("Missing SUPABASE_URL");
  const key = assertEnv("SUPABASE_SERVICE_ROLE_KEY");
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  return res;
}

async function fetchAllSessionsOverlapping(startIso: string, endIso: string) {
  const rows: StreamerSessionRow[] = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 100_000; offset += pageSize) {
    const qs = new URLSearchParams({
      select: "channel,started_at,display_name,profile_image_url,max_viewers,first_seen_at,last_seen_at",
      order: "last_seen_at.asc",
      limit: String(pageSize),
      offset: String(offset),
    });
    qs.append("last_seen_at", `gte.${startIso}`);
    qs.append("started_at", `lte.${endIso}`);
    const res = await supabaseFetch(`/rest/v1/streamer_sessions?${qs.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Supabase streamer_sessions query failed (${res.status}): ${text}`);
    }
    const page = (await res.json()) as StreamerSessionRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

async function fetchEarliestSessionStart() {
  const qs = new URLSearchParams({
    select: "started_at",
    order: "started_at.asc",
    limit: "1",
  });
  const res = await supabaseFetch(`/rest/v1/streamer_sessions?${qs.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase streamer_sessions earliest query failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as Array<{ started_at: string }>;
  const first = json[0]?.started_at;
  if (!first) return null;
  return new Date(first).toISOString();
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const range = parseRange(url.searchParams.get("range"));

    const endIso = nowIso();
    const startIso =
      range === "all"
        ? ((await fetchEarliestSessionStart()) ?? endIso)
        : new Date(Date.now() - rangeToDays(range) * 24 * 60 * 60 * 1000).toISOString();

    const rows = await fetchAllSessionsOverlapping(startIso, endIso);

    const byChannel = new Map<
      string,
      { channel: string; streams: number; max: number; lastSeenAtMs: number; displayName: string; profileImageUrl: string }
    >();

    for (const row of rows) {
      const channel = String(row.channel || "").toLowerCase();
      if (!/^[a-z0-9_]{1,64}$/.test(channel)) continue;
      const key = channel;
      const existing = byChannel.get(key);
      const lastSeenAtMs = new Date(row.last_seen_at).getTime();
      const max = Number(row.max_viewers) || 0;
      const displayName = String(row.display_name || channel);
      const profileImageUrl = String(row.profile_image_url || "");

      if (!existing) {
        byChannel.set(key, {
          channel,
          streams: 1,
          max,
          lastSeenAtMs,
          displayName,
          profileImageUrl,
        });
        continue;
      }

      existing.streams += 1;
      existing.max = Math.max(existing.max, max);
      if (lastSeenAtMs >= existing.lastSeenAtMs) {
        existing.lastSeenAtMs = lastSeenAtMs;
        existing.displayName = displayName;
        if (profileImageUrl) existing.profileImageUrl = profileImageUrl;
      }
    }

    const leaderboard: LeaderboardRow[] = Array.from(byChannel.values())
      .map((v) => ({
        channel: v.channel,
        displayName: v.displayName,
        profileImageUrl: v.profileImageUrl,
        streams: v.streams,
        maxViewers: v.max,
      }))
      .sort((a, b) => {
        if (b.streams !== a.streams) return b.streams - a.streams;
        if (b.maxViewers !== a.maxViewers) return b.maxViewers - a.maxViewers;
        return a.displayName.localeCompare(b.displayName);
      })
      .slice(0, 100);

    return NextResponse.json(
      {
        range,
        start: startIso,
        end: endIso,
        leaderboard,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
