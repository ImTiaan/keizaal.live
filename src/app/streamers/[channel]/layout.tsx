import type { Metadata } from "next";

type StreamerLatestRow = {
  display_name: string;
  profile_image_url: string;
  last_seen_at: string;
};

type StreamerPeakRow = {
  max_viewers: number;
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

async function getStreamerMeta(channel: string) {
  const latestRes = await supabaseFetch(
    `/rest/v1/streamer_sessions?select=display_name,profile_image_url,last_seen_at&channel=eq.${channel}&order=last_seen_at.desc&limit=1`,
    { method: "GET", headers: { Accept: "application/json" } }
  );
  const peakRes = await supabaseFetch(
    `/rest/v1/streamer_sessions?select=max_viewers&channel=eq.${channel}&order=max_viewers.desc&limit=1`,
    { method: "GET", headers: { Accept: "application/json" } }
  );

  let displayName = channel;
  let profileImageUrl = "";
  let lastSeenAt: string | null = null;

  if (latestRes.ok) {
    const json = (await latestRes.json()) as StreamerLatestRow[];
    const row = json?.[0];
    if (row?.display_name) displayName = String(row.display_name);
    if (row?.profile_image_url) profileImageUrl = String(row.profile_image_url);
    if (row?.last_seen_at) lastSeenAt = new Date(String(row.last_seen_at)).toISOString();
  }

  let peakViewers = 0;
  if (peakRes.ok) {
    const json = (await peakRes.json()) as StreamerPeakRow[];
    const v = Number(json?.[0]?.max_viewers ?? 0);
    if (Number.isFinite(v)) peakViewers = Math.max(0, Math.floor(v));
  }

  return { displayName, profileImageUrl, lastSeenAt, peakViewers };
}

export async function generateMetadata(props: {
  params: Promise<{ channel: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  const channel = sanitizeChannel(String(params?.channel || ""));
  if (!channel) {
    return {
      title: "Streamer",
      robots: { index: false, follow: false },
    };
  }

  let displayName = channel;
  let peakViewers = 0;

  try {
    const meta = await getStreamerMeta(channel);
    displayName = meta.displayName;
    peakViewers = meta.peakViewers;
  } catch (e) {
    void e;
  }

  const title = `${displayName} (${channel}) Stats`;
  const description =
    peakViewers > 0
      ? `${displayName} Keizaal RP (Skyrim roleplay) Twitch stream stats: peak ${peakViewers.toLocaleString()} viewers, recent streams, and viewer history.`
      : `${displayName} Keizaal RP (Skyrim roleplay) Twitch stream stats: recent streams and viewer history on Keizaal Live.`;

  return {
    title,
    description,
    alternates: {
      canonical: `https://keizaal.live/streamers/${channel}`,
    },
    openGraph: {
      title,
      description,
      url: `https://keizaal.live/streamers/${channel}`,
      type: "profile",
    },
  };
}

export default async function Layout(props: {
  children: React.ReactNode;
  params: Promise<{ channel: string }>;
}) {
  const params = await props.params;
  const channel = sanitizeChannel(String(params?.channel || ""));

  let displayName = channel || "";
  let profileImageUrl = "";
  let peakViewers = 0;
  try {
    if (channel) {
      const meta = await getStreamerMeta(channel);
      displayName = meta.displayName;
      profileImageUrl = meta.profileImageUrl;
      peakViewers = meta.peakViewers;
    }
  } catch (e) {
    void e;
  }

  const jsonLd =
    channel && displayName
      ? {
          "@context": "https://schema.org",
          "@type": "ProfilePage",
          name: `${displayName} (${channel})`,
          url: `https://keizaal.live/streamers/${channel}`,
          about: {
            "@type": "Person",
            name: displayName,
            image: profileImageUrl || undefined,
            sameAs: `https://twitch.tv/${channel}`,
          },
          mainEntity: {
            "@type": "CreativeWork",
            name: "Keizaal RP Twitch streamer stats",
          },
          isPartOf: {
            "@type": "WebSite",
            name: "Keizaal Live",
            url: "https://keizaal.live",
          },
          additionalProperty:
            peakViewers > 0
              ? [
                  {
                    "@type": "PropertyValue",
                    name: "Peak viewers (tracked)",
                    value: peakViewers,
                  },
                ]
              : undefined,
        }
      : null;

  return (
    <>
      {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} /> : null}
      {props.children}
    </>
  );
}

