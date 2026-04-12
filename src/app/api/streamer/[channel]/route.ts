import { NextResponse } from "next/server";
import { getStreamsPayloadOrStale, type StreamItem } from "../../streams/route";

export const revalidate = 60;

type StreamerPresenceRow = {
  captured_at: string;
  viewer_count: number;
};

type StreamerProfileResponse = {
  channel: string;
  displayName: string;
  profileImageUrl: string;
  isLive: boolean;
  live?: {
    title: string;
    startedAt: string;
    viewerCount: number;
    thumbnailUrl: string;
    url: string;
  };
  stats: {
    streamsAllTime: number;
    maxViewersAllTime: number;
    lastSeenAt: string | null;
  };
  sessions: Array<{
    startedAt: string;
    firstSeenAt: string;
    lastSeenAt: string;
    maxViewers: number;
  }>;
  presence24h: Array<{ t: string; v: number }>;
};

function sanitizeChannel(value: string) {
  const channel = value.trim().toLowerCase();
  if (!/^[a-z0-9_]{1,64}$/.test(channel)) return null;
  return channel;
}

function assertEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function getSupabaseUrl() {
  return (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
}

async function supabaseFetch(path: string, init?: RequestInit) {
  const url = getSupabaseUrl();
  if (!url) throw new Error("Missing SUPABASE_URL");
  const key = assertEnv("SUPABASE_SERVICE_ROLE_KEY");
  return fetch(`${url}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
}

function parseContentRangeTotal(value: string | null) {
  if (!value) return null;
  const match = value.match(/\/(\d+)\s*$/);
  if (!match) return null;
  const total = Number(match[1]);
  return Number.isFinite(total) ? total : null;
}

type StreamsResult = Awaited<ReturnType<typeof getStreamsPayloadOrStale>>;

export async function GET(_: Request, ctx: { params: Promise<{ channel: string }> }) {
  try {
    const params = await ctx.params;
    const channel = sanitizeChannel(String(params?.channel || ""));
    if (!channel) {
      return NextResponse.json({ error: "Invalid channel" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const [streamsPayload, sessionsCountRes, peakRes, latestRes, sessionsRes, presenceRes] = await Promise.all([
      getStreamsPayloadOrStale().catch(() => null as StreamsResult | null),
      supabaseFetch(`/rest/v1/streamer_sessions?select=channel&channel=eq.${channel}`, {
        method: "HEAD",
        headers: { Prefer: "count=exact" },
      }).catch(() => null),
      supabaseFetch(
        `/rest/v1/streamer_sessions?select=max_viewers&channel=eq.${channel}&order=max_viewers.desc&limit=1`,
        { method: "GET", headers: { Accept: "application/json" } }
      ).catch(() => null),
      supabaseFetch(
        `/rest/v1/streamer_sessions?select=display_name,profile_image_url,last_seen_at&channel=eq.${channel}&order=last_seen_at.desc&limit=1`,
        { method: "GET", headers: { Accept: "application/json" } }
      ).catch(() => null),
      supabaseFetch(
        `/rest/v1/streamer_sessions?select=started_at,first_seen_at,last_seen_at,max_viewers&channel=eq.${channel}&order=started_at.desc&limit=25`,
        { method: "GET", headers: { Accept: "application/json" } }
      ).catch(() => null),
      (() => {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const qs = new URLSearchParams({
          select: "captured_at,viewer_count",
          order: "captured_at.asc",
          limit: "400",
        });
        qs.append("channel", `eq.${channel}`);
        qs.append("captured_at", `gte.${since}`);
        return supabaseFetch(`/rest/v1/streamer_presence_5m?${qs.toString()}`, {
          method: "GET",
          headers: { Accept: "application/json" },
        });
      })().catch(() => null),
    ]);

    const streams = Array.isArray(streamsPayload?.payload?.streams) ? (streamsPayload?.payload?.streams as StreamItem[]) : [];
    const liveStream = streams.find((s) => String(s.channel || "").toLowerCase() === channel) || null;

    const streamsAllTime =
      sessionsCountRes && "headers" in sessionsCountRes
        ? parseContentRangeTotal(sessionsCountRes.headers.get("content-range")) ?? 0
        : 0;

    let maxViewersAllTime = 0;
    if (peakRes?.ok) {
      const json = (await peakRes.json()) as Array<{ max_viewers: number }>;
      const v = Number(json?.[0]?.max_viewers ?? 0);
      if (Number.isFinite(v)) maxViewersAllTime = Math.max(0, Math.floor(v));
    }

    let displayName = channel;
    let profileImageUrl = "";
    let lastSeenAt: string | null = null;
    if (latestRes?.ok) {
      const json = (await latestRes.json()) as Array<{ display_name: string; profile_image_url: string; last_seen_at: string }>;
      const row = json?.[0];
      if (row?.display_name) displayName = String(row.display_name);
      if (row?.profile_image_url) profileImageUrl = String(row.profile_image_url);
      if (row?.last_seen_at) lastSeenAt = new Date(row.last_seen_at).toISOString();
    }

    if (liveStream) {
      displayName = String(liveStream.displayName || displayName);
      profileImageUrl = String(liveStream.profileImageUrl || profileImageUrl);
    }

    const sessions: StreamerProfileResponse["sessions"] = [];
    if (sessionsRes?.ok) {
      const json = (await sessionsRes.json()) as Array<{
        started_at: string;
        first_seen_at: string;
        last_seen_at: string;
        max_viewers: number;
      }>;
      for (const r of json || []) {
        const startedAt = new Date(r.started_at).toISOString();
        const firstSeenAt = new Date(r.first_seen_at).toISOString();
        const lastSeenAtSession = new Date(r.last_seen_at).toISOString();
        const maxV = Number(r.max_viewers ?? 0);
        sessions.push({
          startedAt,
          firstSeenAt,
          lastSeenAt: lastSeenAtSession,
          maxViewers: Number.isFinite(maxV) ? Math.max(0, Math.floor(maxV)) : 0,
        });
      }
    }

    const presence24h: StreamerProfileResponse["presence24h"] = [];
    if (presenceRes?.ok) {
      const json = (await presenceRes.json()) as StreamerPresenceRow[];
      for (const r of json || []) {
        const t = new Date(r.captured_at).toISOString();
        const v = Number(r.viewer_count ?? 0);
        presence24h.push({ t, v: Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0 });
      }
    }

    const body: StreamerProfileResponse = {
      channel,
      displayName,
      profileImageUrl,
      isLive: Boolean(liveStream),
      live: liveStream
        ? {
            title: String(liveStream.title || ""),
            startedAt: String(liveStream.startedAt || ""),
            viewerCount: Number(liveStream.viewerCount || 0),
            thumbnailUrl: String(liveStream.thumbnailUrl || ""),
            url: String(liveStream.url || `https://twitch.tv/${channel}`),
          }
        : undefined,
      stats: {
        streamsAllTime,
        maxViewersAllTime,
        lastSeenAt,
      },
      sessions,
      presence24h,
    };

    const res = NextResponse.json(body);
    res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=30");
    res.headers.set("CDN-Cache-Control", "public, s-maxage=60, stale-while-revalidate=30");
    res.headers.set("Vercel-CDN-Cache-Control", "public, s-maxage=60, stale-while-revalidate=30");
    return res;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const res = NextResponse.json({ error: message }, { status: 500 });
    res.headers.set("Cache-Control", "no-store");
    return res;
  }
}
