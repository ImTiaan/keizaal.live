import { MetadataRoute } from 'next';

type StreamerSessionRow = {
  channel: string;
  last_seen_at: string;
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

async function getIndexableStreamerChannels() {
  const res = await supabaseFetch(
    `/rest/v1/streamer_sessions?select=channel,last_seen_at&order=last_seen_at.desc&limit=2000`,
    { method: "GET", headers: { Accept: "application/json" } }
  );
  if (!res.ok) return [] as Array<{ channel: string; lastSeenAt: string }>;
  const rows = (await res.json()) as StreamerSessionRow[];
  const seen = new Set<string>();
  const out: Array<{ channel: string; lastSeenAt: string }> = [];
  for (const r of rows || []) {
    const ch = sanitizeChannel(String(r.channel || ""));
    if (!ch) continue;
    if (seen.has(ch)) continue;
    seen.add(ch);
    const lastSeenAt = new Date(String(r.last_seen_at || "")).toISOString();
    out.push({ channel: ch, lastSeenAt });
    if (out.length >= 1000) break;
  }
  return out;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const urls: MetadataRoute.Sitemap = [
    {
      url: 'https://keizaal.live',
      lastModified: now,
      changeFrequency: 'always',
      priority: 1,
    },
    {
      url: 'https://keizaal.live/clips',
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.8,
    },
    {
      url: 'https://keizaal.live/stats',
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.7,
    },
    {
      url: 'https://keizaal.live/streamers',
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.9,
    },
  ];

  try {
    const channels = await getIndexableStreamerChannels();
    for (const s of channels) {
      urls.push({
        url: `https://keizaal.live/streamers/${s.channel}`,
        lastModified: new Date(s.lastSeenAt),
        changeFrequency: 'daily',
        priority: 0.6,
      });
    }
  } catch (e) {
    void e;
  }

  return urls;
}
