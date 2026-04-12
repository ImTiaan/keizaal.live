import { NextResponse } from "next/server";
import { getStreamsPayloadOrStale, type StreamItem } from "../streams/route";

export const revalidate = 60;

type SupabaseSnapshotRow = {
  captured_at: string;
};

type SupabasePresenceRow = {
  captured_at: string;
  channel: string;
  viewer_count: number;
};

type FeaturedCard = {
  stream: StreamItem;
  growthPct5m: number;
  isBreakout: boolean;
};

type FeaturedResponse = {
  generatedAt: string;
  title: "Going Viral";
  cards: FeaturedCard[];
};

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

function sanitizeChannel(value: string) {
  const channel = value.trim().toLowerCase();
  if (!/^[a-z0-9_]{1,64}$/.test(channel)) return null;
  return channel;
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function chooseCards(params: {
  streams: StreamItem[];
  growthPctByChannel: Map<string, number>;
}) {
  const { streams, growthPctByChannel } = params;
  const teewee = streams.find((s) => s.channel.toLowerCase() === "its_teewee") || null;
  const isTeeweeLive = Boolean(teewee);
  const breakoutViewerCeiling = 150;

  const growers = streams
    .map((s) => {
      const ch = s.channel.toLowerCase();
      return { stream: s, growthPct: growthPctByChannel.get(ch) ?? 0 };
    })
    .sort((a, b) => b.growthPct - a.growthPct);

  const byViewers = [...streams].sort((a, b) => b.viewerCount - a.viewerCount);

  const takeTopGrowers = (count: number, excludeChannels: Set<string>) => {
    const picked: FeaturedCard[] = [];
    for (const candidate of growers) {
      if (picked.length >= count) break;
      const ch = candidate.stream.channel.toLowerCase();
      if (excludeChannels.has(ch)) continue;
      excludeChannels.add(ch);
      if (candidate.growthPct > 0) {
        picked.push({ stream: candidate.stream, growthPct5m: candidate.growthPct, isBreakout: false });
      }
    }
    if (picked.length < count) {
      for (const s of byViewers) {
        if (picked.length >= count) break;
        const ch = s.channel.toLowerCase();
        if (excludeChannels.has(ch)) continue;
        excludeChannels.add(ch);
        picked.push({ stream: s, growthPct5m: growthPctByChannel.get(ch) ?? 0, isBreakout: false });
      }
    }
    return picked;
  };

  const breakoutCard: FeaturedCard | null = (() => {
    if (isTeeweeLive && teewee) {
      return {
        stream: teewee,
        growthPct5m: growthPctByChannel.get("its_teewee") ?? 0,
        isBreakout: true,
      };
    }

    const smallGrowers = growers.filter(
      (g) => g.stream.channel.toLowerCase() !== "its_teewee" && g.stream.viewerCount <= breakoutViewerCeiling
    );
    const bestSmall = smallGrowers.find((g) => g.growthPct > 0) || null;
    if (bestSmall) {
      return { stream: bestSmall.stream, growthPct5m: bestSmall.growthPct, isBreakout: true };
    }

    const fallbackSmall =
      byViewers.find(
        (s) => s.channel.toLowerCase() !== "its_teewee" && s.viewerCount <= breakoutViewerCeiling
      ) || null;
    if (fallbackSmall) {
      return { stream: fallbackSmall, growthPct5m: growthPctByChannel.get(fallbackSmall.channel.toLowerCase()) ?? 0, isBreakout: true };
    }

    const fallbackAny = growers[0]?.stream || byViewers[0] || null;
    if (!fallbackAny) return null;
    return { stream: fallbackAny, growthPct5m: growthPctByChannel.get(fallbackAny.channel.toLowerCase()) ?? 0, isBreakout: true };
  })();

  const exclude = new Set<string>();
  if (breakoutCard) exclude.add(breakoutCard.stream.channel.toLowerCase());

  const topGrowers = takeTopGrowers(2, exclude);
  const cards = [breakoutCard, topGrowers[0], topGrowers[1]].filter(Boolean) as FeaturedCard[];
  return { title: "Going Viral" as const, cards };
}

export async function GET() {
  try {
    const { payload: streamsPayload } = await getStreamsPayloadOrStale();
    const streams = Array.isArray(streamsPayload.streams) ? streamsPayload.streams : [];

    const channels = unique(
      streams
        .map((s) => sanitizeChannel(String(s.channel || "")))
        .filter((c): c is string => Boolean(c))
    );

    const growthPctByChannel = new Map<string, number>();

    if (channels.length > 0 && getSupabaseUrl() && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const snapRes = await supabaseFetch(
        `/rest/v1/stream_snapshots_5m?select=captured_at&order=captured_at.desc&limit=2`,
        {
          method: "GET",
          headers: { Accept: "application/json" },
        }
      );

      if (snapRes.ok) {
        const snaps = (await snapRes.json()) as SupabaseSnapshotRow[];
        const latest = snaps[0]?.captured_at ? new Date(snaps[0].captured_at).toISOString() : null;
        const previous = snaps[1]?.captured_at ? new Date(snaps[1].captured_at).toISOString() : null;

        if (latest && previous) {
          const qs = new URLSearchParams({
            select: "captured_at,channel,viewer_count",
            order: "captured_at.desc",
          });
          qs.append("captured_at", `in.(${[latest, previous].join(",")})`);
          qs.append("channel", `in.(${channels.join(",")})`);

          const presenceRes = await supabaseFetch(`/rest/v1/streamer_presence_5m?${qs.toString()}`, {
            method: "GET",
            headers: { Accept: "application/json" },
          });

          if (presenceRes.ok) {
            const rows = (await presenceRes.json()) as SupabasePresenceRow[];
            const byChannel = new Map<string, SupabasePresenceRow[]>();
            for (const r of rows) {
              const ch = sanitizeChannel(String(r.channel || ""));
              if (!ch) continue;
              const list = byChannel.get(ch) || [];
              list.push(r);
              byChannel.set(ch, list);
            }

            const baseline = 5;
            for (const ch of channels) {
              const list = (byChannel.get(ch) || []).sort(
                (a, b) => Date.parse(b.captured_at) - Date.parse(a.captured_at)
              );
              const v1 = list.find((r) => new Date(r.captured_at).toISOString() === latest)?.viewer_count ?? null;
              const v0 = list.find((r) => new Date(r.captured_at).toISOString() === previous)?.viewer_count ?? null;
              if (v1 === null || v0 === null) {
                growthPctByChannel.set(ch, 0);
                continue;
              }
              const prev = Math.max(0, Math.floor(Number(v0) || 0));
              const curr = Math.max(0, Math.floor(Number(v1) || 0));
              const pct = ((curr - prev) / Math.max(prev, baseline)) * 100;
              growthPctByChannel.set(ch, Math.max(0, pct));
            }
          }
        }
      }
    }

    const chosen = chooseCards({ streams, growthPctByChannel });
    const responseBody: FeaturedResponse = {
      generatedAt: new Date().toISOString(),
      title: chosen.title,
      cards: chosen.cards,
    };

    const res = NextResponse.json(responseBody);
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
