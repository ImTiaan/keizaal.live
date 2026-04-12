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
  deltaViewers5m: number;
};

type FeaturedResponse = {
  generatedAt: string;
  title: "Featured" | "Going Viral";
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
  deltaByChannel: Map<string, number>;
}) {
  const { streams, deltaByChannel } = params;
  const teewee = streams.find((s) => s.channel.toLowerCase() === "its_teewee") || null;
  const isTeeweeLive = Boolean(teewee);

  const deltas = streams
    .map((s) => {
      const ch = s.channel.toLowerCase();
      return { stream: s, delta: deltaByChannel.get(ch) ?? 0 };
    })
    .sort((a, b) => b.delta - a.delta);

  const byViewers = [...streams].sort((a, b) => b.viewerCount - a.viewerCount);

  const takeTop = (count: number, excludeChannels: Set<string>) => {
    const picked: FeaturedCard[] = [];
    for (const candidate of deltas) {
      if (picked.length >= count) break;
      const ch = candidate.stream.channel.toLowerCase();
      if (excludeChannels.has(ch)) continue;
      excludeChannels.add(ch);
      picked.push({ stream: candidate.stream, deltaViewers5m: candidate.delta });
    }
    if (picked.length < count) {
      for (const s of byViewers) {
        if (picked.length >= count) break;
        const ch = s.channel.toLowerCase();
        if (excludeChannels.has(ch)) continue;
        excludeChannels.add(ch);
        picked.push({ stream: s, deltaViewers5m: deltaByChannel.get(ch) ?? 0 });
      }
    }
    return picked;
  };

  if (isTeeweeLive && teewee) {
    const exclude = new Set<string>(["its_teewee"]);
    const topGrowers = takeTop(2, exclude);
    const teeweeCard: FeaturedCard = {
      stream: teewee,
      deltaViewers5m: deltaByChannel.get("its_teewee") ?? 0,
    };
    return { title: "Featured" as const, cards: [topGrowers[0], teeweeCard, topGrowers[1]].filter(Boolean) };
  }

  const exclude = new Set<string>();
  return { title: "Going Viral" as const, cards: takeTop(3, exclude) };
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

    const deltaByChannel = new Map<string, number>();

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

            for (const ch of channels) {
              const list = (byChannel.get(ch) || []).sort(
                (a, b) => Date.parse(b.captured_at) - Date.parse(a.captured_at)
              );
              const v1 = list.find((r) => new Date(r.captured_at).toISOString() === latest)?.viewer_count ?? null;
              const v0 = list.find((r) => new Date(r.captured_at).toISOString() === previous)?.viewer_count ?? null;
              const current = streams.find((s) => s.channel.toLowerCase() === ch)?.viewerCount ?? 0;
              const delta = Math.max(0, Math.floor((v1 ?? current) - (v0 ?? 0)));
              deltaByChannel.set(ch, delta);
            }
          }
        }
      }
    }

    const chosen = chooseCards({ streams, deltaByChannel });
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
