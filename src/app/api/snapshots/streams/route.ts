import { NextResponse } from "next/server";

export const revalidate = 0;

type StreamsResponse = {
  stats?: {
    liveStreams?: number;
    totalViewers?: number;
  };
};

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

function isAuthorized(request: Request) {
  const expected = assertEnv("CRON_SECRET");
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  return token.length > 0 && token === expected;
}

export async function GET(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    const origin = new URL(request.url);
    origin.pathname = "/api/streams";
    origin.search = "";

    const streamsRes = await fetch(origin.toString(), { cache: "no-store" });
    if (!streamsRes.ok) {
      const text = await streamsRes.text();
      throw new Error(`Failed to fetch /api/streams (${streamsRes.status}): ${text}`);
    }

    const streamsJson = (await streamsRes.json()) as StreamsResponse;
    const liveStreams = Number(streamsJson?.stats?.liveStreams ?? 0);
    const totalViewers = Number(streamsJson?.stats?.totalViewers ?? 0);
    if (!Number.isFinite(liveStreams) || !Number.isFinite(totalViewers)) {
      throw new Error("Invalid stats returned from /api/streams");
    }

    await insertSnapshot({
      captured_at: capturedAtIso,
      live_streams: liveStreams,
      total_viewers: totalViewers,
    });

    await applyRollup("stream_snapshots_hourly", bucketHourStartIso(capturedAtMs), liveStreams, totalViewers);
    await applyRollup("stream_snapshots_daily", bucketDayStartIso(capturedAtMs), liveStreams, totalViewers);

    return NextResponse.json(
      { ok: true, capturedAt: capturedAtIso, liveStreams, totalViewers },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
