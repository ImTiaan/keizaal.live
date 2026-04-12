import { NextResponse } from "next/server";
import { getStreamsPayloadOrStale, type StreamsPayload } from "../../streams/route";

export const revalidate = 0;

const INDEXNOW_HOST = "keizaal.live";
const INDEXNOW_KEY = process.env.INDEXNOW_KEY || "1b462535014948c49913fcb8ba1431bf";
const INDEXNOW_KEY_LOCATION = `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`;

type Snapshot5mRow = {
  captured_at: string;
  live_streams: number;
  total_viewers: number;
};

type RollupRow = {
  bucket_start: string;
  count: number;
  sum_live_streams: number;
  sum_total_viewers: number;
  max_live_streams: number;
  min_live_streams: number;
  max_total_viewers: number;
  min_total_viewers: number;
};

type StreamerDailyRow = {
  day_start: string;
  channel: string;
  display_name: string;
  profile_image_url: string;
  max_viewers: number;
  last_seen_at: string;
};

type StreamerSessionRow = {
  channel: string;
  started_at: string;
  display_name: string;
  profile_image_url: string;
  max_viewers: number;
  first_seen_at: string;
  last_seen_at: string;
};

type StreamerPresenceRow = {
  captured_at: string;
  channel: string;
  started_at: string;
  viewer_count: number;
  display_name: string;
  profile_image_url: string;
};

function assertEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function roundDownToMs(epochMs: number, intervalMs: number) {
  return Math.floor(epochMs / intervalMs) * intervalMs;
}

function toIso(ms: number) {
  return new Date(ms).toISOString();
}

function bucketHourStartIso(epochMs: number) {
  const d = new Date(epochMs);
  const ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), 0, 0, 0);
  return toIso(ms);
}

function bucketDayStartIso(epochMs: number) {
  const d = new Date(epochMs);
  const ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0);
  return toIso(ms);
}

function safeToIso(value: string) {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function getSupabaseUrl() {
  return (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
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

async function notifyIndexNow(urls: string[]) {
  const unique = Array.from(
    new Set(
      urls
        .map((u) => u.trim())
        .filter((u) => u.startsWith(`https://${INDEXNOW_HOST}/`))
    )
  ).slice(0, 1000);

  if (unique.length === 0) return 0;

  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      host: INDEXNOW_HOST,
      key: INDEXNOW_KEY,
      keyLocation: INDEXNOW_KEY_LOCATION,
      urlList: unique,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`IndexNow failed (${res.status}): ${text}`);
  }

  return unique.length;
}

async function getExistingSnapshot(capturedAtIso: string) {
  const qs = new URLSearchParams({
    select: "captured_at",
    "captured_at": `eq.${capturedAtIso}`,
    limit: "1",
  });
  const res = await supabaseFetch(`/rest/v1/stream_snapshots_5m?${qs.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase snapshot lookup failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as Array<{ captured_at: string }>;
  return json.length > 0;
}

async function insertSnapshot(row: Snapshot5mRow) {
  const res = await supabaseFetch(`/rest/v1/stream_snapshots_5m?on_conflict=captured_at`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify([row]),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase snapshot insert failed (${res.status}): ${text}`);
  }
}

async function insertStreamerPresenceRows(rows: StreamerPresenceRow[]) {
  if (rows.length === 0) return;
  const res = await supabaseFetch(`/rest/v1/streamer_presence_5m?on_conflict=captured_at,channel`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase streamer_presence_5m insert failed (${res.status}): ${text}`);
  }
}

async function getRollupRow(table: "stream_snapshots_hourly" | "stream_snapshots_daily", bucketStartIso: string) {
  const qs = new URLSearchParams({
    select:
      "bucket_start,count,sum_live_streams,sum_total_viewers,max_live_streams,min_live_streams,max_total_viewers,min_total_viewers",
    bucket_start: `eq.${bucketStartIso}`,
    limit: "1",
  });
  const res = await supabaseFetch(`/rest/v1/${table}?${qs.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase rollup lookup failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as RollupRow[];
  return json[0] || null;
}

async function upsertRollupRow(
  table: "stream_snapshots_hourly" | "stream_snapshots_daily",
  row: RollupRow
) {
  const res = await supabaseFetch(`/rest/v1/${table}?on_conflict=bucket_start`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify([row]),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase rollup insert failed (${res.status}): ${text}`);
  }
}

async function updateRollupRow(
  table: "stream_snapshots_hourly" | "stream_snapshots_daily",
  bucketStartIso: string,
  patch: Omit<RollupRow, "bucket_start">
) {
  const qs = new URLSearchParams({
    bucket_start: `eq.${bucketStartIso}`,
  });
  const res = await supabaseFetch(`/rest/v1/${table}?${qs.toString()}`, {
    method: "PATCH",
    headers: {
      Prefer: "return=minimal",
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase rollup update failed (${res.status}): ${text}`);
  }
}

async function applyRollup(
  table: "stream_snapshots_hourly" | "stream_snapshots_daily",
  bucketStartIso: string,
  liveStreams: number,
  totalViewers: number
) {
  const existing = await getRollupRow(table, bucketStartIso);
  if (!existing) {
    await upsertRollupRow(table, {
      bucket_start: bucketStartIso,
      count: 1,
      sum_live_streams: liveStreams,
      sum_total_viewers: totalViewers,
      max_live_streams: liveStreams,
      min_live_streams: liveStreams,
      max_total_viewers: totalViewers,
      min_total_viewers: totalViewers,
    });
    return;
  }

  await updateRollupRow(table, bucketStartIso, {
    count: existing.count + 1,
    sum_live_streams: existing.sum_live_streams + liveStreams,
    sum_total_viewers: existing.sum_total_viewers + totalViewers,
    max_live_streams: Math.max(existing.max_live_streams, liveStreams),
    min_live_streams: Math.min(existing.min_live_streams, liveStreams),
    max_total_viewers: Math.max(existing.max_total_viewers, totalViewers),
    min_total_viewers: Math.min(existing.min_total_viewers, totalViewers),
  });
}

async function getExistingStreamerDailyRows(dayStartIso: string, channels: string[]) {
  if (channels.length === 0) return [] as StreamerDailyRow[];
  const qs = new URLSearchParams({
    select: "day_start,channel,display_name,profile_image_url,max_viewers,last_seen_at",
  });
  qs.append("day_start", `eq.${dayStartIso}`);
  qs.append("or", `(${channels.map((c) => `channel.eq.${c}`).join(",")})`);

  const res = await supabaseFetch(`/rest/v1/streamer_daily?${qs.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase streamer_daily lookup failed (${res.status}): ${text}`);
  }
  return (await res.json()) as StreamerDailyRow[];
}

async function insertStreamerDailyRows(rows: StreamerDailyRow[]) {
  if (rows.length === 0) return;
  const res = await supabaseFetch(`/rest/v1/streamer_daily?on_conflict=day_start,channel`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase streamer_daily insert failed (${res.status}): ${text}`);
  }
}

async function updateStreamerDailyRow(dayStartIso: string, channel: string, patch: Partial<StreamerDailyRow>) {
  const qs = new URLSearchParams();
  qs.append("day_start", `eq.${dayStartIso}`);
  qs.append("channel", `eq.${channel}`);
  const res = await supabaseFetch(`/rest/v1/streamer_daily?${qs.toString()}`, {
    method: "PATCH",
    headers: {
      Prefer: "return=minimal",
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase streamer_daily update failed (${res.status}): ${text}`);
  }
}

async function getExistingStreamerSessionRows(items: Array<{ channel: string; startedAtIso: string }>) {
  if (items.length === 0) return [] as StreamerSessionRow[];
  const or = items
    .map((it) => `and(channel.eq.${it.channel},started_at.eq.${it.startedAtIso})`)
    .join(",");
  const qs = new URLSearchParams({
    select: "channel,started_at,display_name,profile_image_url,max_viewers,first_seen_at,last_seen_at",
  });
  qs.append("or", `(${or})`);

  const res = await supabaseFetch(`/rest/v1/streamer_sessions?${qs.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase streamer_sessions lookup failed (${res.status}): ${text}`);
  }
  return (await res.json()) as StreamerSessionRow[];
}

async function insertStreamerSessionRows(rows: StreamerSessionRow[]) {
  if (rows.length === 0) return;
  const res = await supabaseFetch(`/rest/v1/streamer_sessions?on_conflict=channel,started_at`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase streamer_sessions insert failed (${res.status}): ${text}`);
  }
}

async function updateStreamerSessionRow(channel: string, startedAtIso: string, patch: Partial<StreamerSessionRow>) {
  const qs = new URLSearchParams();
  qs.append("channel", `eq.${channel}`);
  qs.append("started_at", `eq.${startedAtIso}`);
  const res = await supabaseFetch(`/rest/v1/streamer_sessions?${qs.toString()}`, {
    method: "PATCH",
    headers: {
      Prefer: "return=minimal",
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase streamer_sessions update failed (${res.status}): ${text}`);
  }
}

function isAuthorized(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return { ok: false, status: 500 as const, reason: "Missing CRON_SECRET" };
  }
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  if (!token || token !== expected) {
    return { ok: false, status: 401 as const, reason: "Unauthorized" };
  }
  return { ok: true as const, status: 200 as const, reason: "OK" };
}

export async function GET(request: Request) {
  try {
    const hasSupabaseUrl = Boolean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
    const hasServiceRoleKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
    const auth = isAuthorized(request);
    if (!auth.ok) {
      const payload = {
        error: auth.reason,
        env: {
          hasSupabaseUrl,
          hasServiceRoleKey,
          hasCronSecret: Boolean(process.env.CRON_SECRET),
        },
      };
      if (auth.status === 500) console.error("[snapshots/streams] misconfigured:", payload);
      return NextResponse.json(payload, { status: auth.status });
    }

    const now = Date.now();
    const capturedAtMs = roundDownToMs(now, 5 * 60 * 1000);
    const capturedAtIso = toIso(capturedAtMs);

    const { payload: streamsJson } = await getStreamsPayloadOrStale();
    const liveStreams = Number(streamsJson.stats?.liveStreams ?? 0);
    const totalViewers = Number(streamsJson.stats?.totalViewers ?? 0);
    if (!Number.isFinite(liveStreams) || !Number.isFinite(totalViewers)) {
      throw new Error("Invalid stats returned from streams payload");
    }

    const snapshotExists = await getExistingSnapshot(capturedAtIso);
    if (!snapshotExists) {
      await insertSnapshot({
        captured_at: capturedAtIso,
        live_streams: liveStreams,
        total_viewers: totalViewers,
      });
    }

    let rollupError: string | null = null;
    try {
      if (!snapshotExists) {
        await applyRollup("stream_snapshots_hourly", bucketHourStartIso(capturedAtMs), liveStreams, totalViewers);
        await applyRollup("stream_snapshots_daily", bucketDayStartIso(capturedAtMs), liveStreams, totalViewers);
      }
    } catch (e) {
      rollupError = e instanceof Error ? e.message : "Unknown rollup error";
      console.error("[snapshots/streams] rollup failed:", rollupError);
    }

    let presenceError: string | null = null;
    try {
      const streams = Array.isArray((streamsJson as StreamsPayload).streams) ? streamsJson.streams : [];
      const presenceRows: StreamerPresenceRow[] = [];
      for (const s of streams) {
        const channel = String(s.channel || "").toLowerCase();
        if (!/^[a-z0-9_]{1,64}$/.test(channel)) continue;
        const startedAtIso = safeToIso(String(s.startedAt || ""));
        if (!startedAtIso) continue;
        const viewerCount = Number(s.viewerCount || 0);
        if (!Number.isFinite(viewerCount)) continue;
        presenceRows.push({
          captured_at: capturedAtIso,
          channel,
          started_at: startedAtIso,
          viewer_count: Math.max(0, Math.floor(viewerCount)),
          display_name: String(s.displayName || channel),
          profile_image_url: String(s.profileImageUrl || ""),
        });
      }
      await insertStreamerPresenceRows(presenceRows);
    } catch (e) {
      presenceError = e instanceof Error ? e.message : "Unknown presence error";
      console.error("[snapshots/streams] streamer_presence_5m failed:", presenceError);
    }

    let streamerDailyError: string | null = null;
    try {
      const streams = Array.isArray((streamsJson as StreamsPayload).streams) ? streamsJson.streams : [];
      const dayStartIso = bucketDayStartIso(capturedAtMs);
      const channels = streams
        .map((s) => String(s.channel || "").toLowerCase())
        .filter((c) => /^[a-z0-9_]{1,64}$/.test(c));

      const uniqueChannels = Array.from(new Set(channels));
      const existing = await getExistingStreamerDailyRows(dayStartIso, uniqueChannels);
      const byChannel = new Map(existing.map((r) => [r.channel.toLowerCase(), r]));

      const toInsert: StreamerDailyRow[] = [];
      const toUpdate: Array<{ channel: string; patch: Partial<StreamerDailyRow> }> = [];

      for (const s of streams) {
        const channel = String(s.channel || "").toLowerCase();
        if (!/^[a-z0-9_]{1,64}$/.test(channel)) continue;
        const displayName = String(s.displayName || channel);
        const profileImageUrl = String(s.profileImageUrl || "");
        const viewerCount = Number(s.viewerCount || 0);
        if (!Number.isFinite(viewerCount)) continue;

        const existingRow = byChannel.get(channel);
        if (!existingRow) {
          toInsert.push({
            day_start: dayStartIso,
            channel,
            display_name: displayName,
            profile_image_url: profileImageUrl,
            max_viewers: Math.max(0, Math.floor(viewerCount)),
            last_seen_at: capturedAtIso,
          });
          continue;
        }

        const nextMax = Math.max(existingRow.max_viewers, Math.floor(viewerCount));
        const patch: Partial<StreamerDailyRow> = {};
        if (nextMax !== existingRow.max_viewers) patch.max_viewers = nextMax;
        if (existingRow.last_seen_at !== capturedAtIso) patch.last_seen_at = capturedAtIso;
        if (profileImageUrl && existingRow.profile_image_url !== profileImageUrl) patch.profile_image_url = profileImageUrl;
        if (displayName && existingRow.display_name !== displayName) patch.display_name = displayName;
        if (Object.keys(patch).length > 0) {
          toUpdate.push({ channel, patch });
        }
      }

      await insertStreamerDailyRows(toInsert);
      await Promise.allSettled(
        toUpdate.map((u) => updateStreamerDailyRow(dayStartIso, u.channel, u.patch))
      );
    } catch (e) {
      streamerDailyError = e instanceof Error ? e.message : "Unknown streamer daily error";
      console.error("[snapshots/streams] streamer_daily failed:", streamerDailyError);
    }

    let streamerSessionsError: string | null = null;
    let indexNowError: string | null = null;
    let indexNowSubmitted = 0;
    try {
      const streams = Array.isArray((streamsJson as StreamsPayload).streams) ? streamsJson.streams : [];
      const sessionItems = streams
        .map((s) => ({
          channel: String(s.channel || "").toLowerCase(),
          startedAtIso: safeToIso(String(s.startedAt || "")),
        }))
        .filter((it) => /^[a-z0-9_]{1,64}$/.test(it.channel) && Boolean(it.startedAtIso));

      const uniqueKey = new Set<string>();
      const uniqueItems = sessionItems.filter((it) => {
        const k = `${it.channel}|${it.startedAtIso}`;
        if (uniqueKey.has(k)) return false;
        uniqueKey.add(k);
        return true;
      });

      const existing = await getExistingStreamerSessionRows(
        uniqueItems.map((it) => ({ channel: it.channel, startedAtIso: it.startedAtIso! }))
      );
      const byKey = new Map(existing.map((r) => [`${r.channel.toLowerCase()}|${new Date(r.started_at).toISOString()}`, r]));

      const toInsert: StreamerSessionRow[] = [];
      const toUpdate: Array<{ channel: string; startedAtIso: string; patch: Partial<StreamerSessionRow> }> = [];

      for (const s of streams) {
        const channel = String(s.channel || "").toLowerCase();
        if (!/^[a-z0-9_]{1,64}$/.test(channel)) continue;
        const startedAtIso = safeToIso(String(s.startedAt || ""));
        if (!startedAtIso) continue;

        const key = `${channel}|${startedAtIso}`;
        const existingRow = byKey.get(key);
        const displayName = String(s.displayName || channel);
        const profileImageUrl = String(s.profileImageUrl || "");
        const viewerCount = Number(s.viewerCount || 0);
        if (!Number.isFinite(viewerCount)) continue;

        if (!existingRow) {
          toInsert.push({
            channel,
            started_at: startedAtIso,
            display_name: displayName,
            profile_image_url: profileImageUrl,
            max_viewers: Math.max(0, Math.floor(viewerCount)),
            first_seen_at: capturedAtIso,
            last_seen_at: capturedAtIso,
          });
          continue;
        }

        const nextMax = Math.max(existingRow.max_viewers, Math.floor(viewerCount));
        const patch: Partial<StreamerSessionRow> = {};
        if (nextMax !== existingRow.max_viewers) patch.max_viewers = nextMax;
        if (existingRow.last_seen_at !== capturedAtIso) patch.last_seen_at = capturedAtIso;
        if (profileImageUrl && existingRow.profile_image_url !== profileImageUrl) patch.profile_image_url = profileImageUrl;
        if (displayName && existingRow.display_name !== displayName) patch.display_name = displayName;
        if (Object.keys(patch).length > 0) {
          toUpdate.push({ channel, startedAtIso, patch });
        }
      }

      await insertStreamerSessionRows(toInsert);

      const newSessionChannels = Array.from(new Set(toInsert.map((r) => r.channel))).filter((c) =>
        /^[a-z0-9_]{1,64}$/.test(c)
      );
      if (newSessionChannels.length > 0) {
        try {
          indexNowSubmitted = await notifyIndexNow([
            `https://${INDEXNOW_HOST}/`,
            `https://${INDEXNOW_HOST}/clips`,
            `https://${INDEXNOW_HOST}/stats`,
            `https://${INDEXNOW_HOST}/streamers`,
            ...newSessionChannels.map((c) => `https://${INDEXNOW_HOST}/streamers/${c}`),
          ]);
        } catch (e) {
          indexNowError = e instanceof Error ? e.message : "Unknown IndexNow error";
          console.error("[snapshots/streams] indexnow failed:", indexNowError);
        }
      }

      await Promise.allSettled(
        toUpdate.map((u) => updateStreamerSessionRow(u.channel, u.startedAtIso, u.patch))
      );
    } catch (e) {
      streamerSessionsError = e instanceof Error ? e.message : "Unknown streamer sessions error";
      console.error("[snapshots/streams] streamer_sessions failed:", streamerSessionsError);
    }

    return NextResponse.json(
      {
        ok: true,
        capturedAt: capturedAtIso,
        snapshot: snapshotExists ? "skipped" : "inserted",
        liveStreams,
        totalViewers,
        indexNow: indexNowSubmitted > 0 ? { submitted: indexNowSubmitted } : undefined,
        warnings:
          rollupError || presenceError || streamerDailyError || streamerSessionsError || indexNowError
            ? {
                rollups: rollupError,
                presence: presenceError,
                streamerDaily: streamerDailyError,
                streamerSessions: streamerSessionsError,
                indexNow: indexNowError,
              }
            : undefined,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[snapshots/streams] fatal:", message);
    return NextResponse.json({ error: message }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
