import { NextResponse } from "next/server";
import { getStreamsPayloadOrStale, type StreamsPayload } from "../../streams/route";

export const revalidate = 0;

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

    const alreadyExists = await getExistingSnapshot(capturedAtIso);
    if (alreadyExists) {
      return NextResponse.json(
        { ok: true, capturedAt: capturedAtIso, skipped: true },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const { payload: streamsJson } = await getStreamsPayloadOrStale();
    const liveStreams = Number(streamsJson.stats?.liveStreams ?? 0);
    const totalViewers = Number(streamsJson.stats?.totalViewers ?? 0);
    if (!Number.isFinite(liveStreams) || !Number.isFinite(totalViewers)) {
      throw new Error("Invalid stats returned from streams payload");
    }

    await insertSnapshot({
      captured_at: capturedAtIso,
      live_streams: liveStreams,
      total_viewers: totalViewers,
    });

    let rollupError: string | null = null;
    try {
      await applyRollup("stream_snapshots_hourly", bucketHourStartIso(capturedAtMs), liveStreams, totalViewers);
      await applyRollup("stream_snapshots_daily", bucketDayStartIso(capturedAtMs), liveStreams, totalViewers);
    } catch (e) {
      rollupError = e instanceof Error ? e.message : "Unknown rollup error";
      console.error("[snapshots/streams] rollup failed:", rollupError);
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

    return NextResponse.json(
      {
        ok: true,
        capturedAt: capturedAtIso,
        liveStreams,
        totalViewers,
        warnings:
          rollupError || streamerDailyError
            ? { rollups: rollupError, streamerDaily: streamerDailyError }
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
