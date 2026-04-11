import { NextResponse } from "next/server";

export const revalidate = 0;

type RangeKey = "24h" | "7d" | "30d" | "90d" | "365d";

type StreamerDailyRow = {
  day_start: string;
  channel: string;
  display_name: string;
  profile_image_url: string;
  max_viewers: number;
  last_seen_at: string;
};

type LeaderboardRow = {
  channel: string;
  displayName: string;
  profileImageUrl: string;
  daysStreamed: number;
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
  if (value === "24h" || value === "7d" || value === "30d" || value === "90d" || value === "365d") {
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

function dayStartIsoFromMs(ms: number) {
  const d = new Date(ms);
  const dayMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0);
  return new Date(dayMs).toISOString();
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

async function fetchAllDailyRows(startIso: string, endIso: string) {
  const rows: StreamerDailyRow[] = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 100_000; offset += pageSize) {
    const qs = new URLSearchParams({
      select: "day_start,channel,display_name,profile_image_url,max_viewers,last_seen_at",
      order: "day_start.asc",
      limit: String(pageSize),
      offset: String(offset),
    });
    qs.append("day_start", `gte.${startIso}`);
    qs.append("day_start", `lte.${endIso}`);
    const res = await supabaseFetch(`/rest/v1/streamer_daily?${qs.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Supabase streamer_daily query failed (${res.status}): ${text}`);
    }
    const page = (await res.json()) as StreamerDailyRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const range = parseRange(url.searchParams.get("range"));
    const days = rangeToDays(range);

    const endIso = dayStartIsoFromMs(Date.now());
    const startIso = dayStartIsoFromMs(Date.now() - (days - 1) * 24 * 60 * 60 * 1000);

    const rows = await fetchAllDailyRows(startIso, endIso);

    const byChannel = new Map<
      string,
      { channel: string; days: number; max: number; lastSeenAtMs: number; displayName: string; profileImageUrl: string }
    >();

    for (const row of rows) {
      const channel = String(row.channel || "").toLowerCase();
      if (!/^[a-z0-9_]{1,64}$/.test(channel)) continue;
      const daysKey = channel;
      const existing = byChannel.get(daysKey);
      const lastSeenAtMs = new Date(row.last_seen_at).getTime();
      const max = Number(row.max_viewers) || 0;
      const displayName = String(row.display_name || channel);
      const profileImageUrl = String(row.profile_image_url || "");

      if (!existing) {
        byChannel.set(daysKey, {
          channel,
          days: 1,
          max,
          lastSeenAtMs,
          displayName,
          profileImageUrl,
        });
        continue;
      }

      existing.days += 1;
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
        daysStreamed: v.days,
        maxViewers: v.max,
      }))
      .sort((a, b) => {
        if (b.daysStreamed !== a.daysStreamed) return b.daysStreamed - a.daysStreamed;
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

