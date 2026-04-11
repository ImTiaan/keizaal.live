import { NextResponse } from "next/server";

export const revalidate = 0;

type RangeKey = "24h" | "7d" | "30d" | "90d" | "365d";

type SeriesPoint = {
  t: string;
  avgViewers: number;
  peakViewers: number;
  minViewers: number;
  avgStreams: number;
  peakStreams: number;
  minStreams: number;
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

function parseRange(value: string | null): RangeKey {
  if (value === "24h" || value === "7d" || value === "30d" || value === "90d" || value === "365d") {
    return value;
  }
  return "7d";
}

function getRangeConfig(range: RangeKey) {
  if (range === "24h") return { bucket: "5m" as const, intervalMs: 5 * 60 * 1000, points: 24 * 12 };
  if (range === "7d") return { bucket: "5m" as const, intervalMs: 5 * 60 * 1000, points: 7 * 24 * 12 };
  if (range === "30d") return { bucket: "1h" as const, intervalMs: 60 * 60 * 1000, points: 30 * 24 };
  if (range === "90d") return { bucket: "2h" as const, intervalMs: 2 * 60 * 60 * 1000, points: 90 * 12 };
  return { bucket: "1d" as const, intervalMs: 24 * 60 * 60 * 1000, points: 365 };
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

async function fetchPaged<T>(pathBase: string, select: string, orderBy: string, maxRows: number) {
  const rows: T[] = [];
  const pageSize = 1000;
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const qs = new URLSearchParams({
      select,
      order: `${orderBy}.asc`,
      limit: String(pageSize),
      offset: String(offset),
    });
    const res = await supabaseFetch(`${pathBase}${pathBase.includes("?") ? "&" : "?"}${qs.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Supabase stats query failed (${res.status}): ${text}`);
    }
    const page = (await res.json()) as T[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

function asPointFrom5m(row: Snapshot5mRow): SeriesPoint {
  const streams = Number(row.live_streams);
  const viewers = Number(row.total_viewers);
  return {
    t: new Date(row.captured_at).toISOString(),
    avgViewers: viewers,
    peakViewers: viewers,
    minViewers: viewers,
    avgStreams: streams,
    peakStreams: streams,
    minStreams: streams,
  };
}

function asPointFromRollup(row: RollupRow): SeriesPoint {
  const count = Math.max(1, Number(row.count));
  const avgStreams = Number(row.sum_live_streams) / count;
  const avgViewers = Number(row.sum_total_viewers) / count;
  return {
    t: new Date(row.bucket_start).toISOString(),
    avgViewers,
    peakViewers: Number(row.max_total_viewers),
    minViewers: Number(row.min_total_viewers),
    avgStreams,
    peakStreams: Number(row.max_live_streams),
    minStreams: Number(row.min_live_streams),
  };
}

function aggregateTo2h(hourly: RollupRow[]): RollupRow[] {
  const bucketMs = 2 * 60 * 60 * 1000;
  const map = new Map<string, RollupRow>();

  for (const row of hourly) {
    const ms = new Date(row.bucket_start).getTime();
    const bucketStartIso = toIso(roundDownToMs(ms, bucketMs));
    const existing = map.get(bucketStartIso);
    if (!existing) {
      map.set(bucketStartIso, { ...row, bucket_start: bucketStartIso });
      continue;
    }
    existing.count += row.count;
    existing.sum_live_streams += row.sum_live_streams;
    existing.sum_total_viewers += row.sum_total_viewers;
    existing.max_live_streams = Math.max(existing.max_live_streams, row.max_live_streams);
    existing.min_live_streams = Math.min(existing.min_live_streams, row.min_live_streams);
    existing.max_total_viewers = Math.max(existing.max_total_viewers, row.max_total_viewers);
    existing.min_total_viewers = Math.min(existing.min_total_viewers, row.min_total_viewers);
  }

  return Array.from(map.values()).sort((a, b) => a.bucket_start.localeCompare(b.bucket_start));
}

async function getSeries(range: RangeKey, startIso: string, endIso: string) {
  const cfg = getRangeConfig(range);

  if (cfg.bucket === "5m") {
    const qsBase = new URLSearchParams();
    qsBase.append("captured_at", `gte.${startIso}`);
    qsBase.append("captured_at", `lte.${endIso}`);
    const rows = await fetchPaged<Snapshot5mRow>(
      `/rest/v1/stream_snapshots_5m?${qsBase.toString()}`,
      "captured_at,live_streams,total_viewers",
      "captured_at",
      cfg.points + 50
    );
    return rows.map(asPointFrom5m);
  }

  if (cfg.bucket === "1h") {
    const qsBase = new URLSearchParams();
    qsBase.append("bucket_start", `gte.${startIso}`);
    qsBase.append("bucket_start", `lte.${endIso}`);
    const rows = await fetchPaged<RollupRow>(
      `/rest/v1/stream_snapshots_hourly?${qsBase.toString()}`,
      "bucket_start,count,sum_live_streams,sum_total_viewers,max_live_streams,min_live_streams,max_total_viewers,min_total_viewers",
      "bucket_start",
      cfg.points + 50
    );
    return rows.map(asPointFromRollup);
  }

  if (cfg.bucket === "2h") {
    const qsBase = new URLSearchParams();
    qsBase.append("bucket_start", `gte.${startIso}`);
    qsBase.append("bucket_start", `lte.${endIso}`);
    const rows = await fetchPaged<RollupRow>(
      `/rest/v1/stream_snapshots_hourly?${qsBase.toString()}`,
      "bucket_start,count,sum_live_streams,sum_total_viewers,max_live_streams,min_live_streams,max_total_viewers,min_total_viewers",
      "bucket_start",
      cfg.points * 2 + 50
    );
    return aggregateTo2h(rows).map(asPointFromRollup);
  }

  const qsBase = new URLSearchParams();
  qsBase.append("bucket_start", `gte.${startIso}`);
  qsBase.append("bucket_start", `lte.${endIso}`);
  const rows = await fetchPaged<RollupRow>(
    `/rest/v1/stream_snapshots_daily?${qsBase.toString()}`,
    "bucket_start,count,sum_live_streams,sum_total_viewers,max_live_streams,min_live_streams,max_total_viewers,min_total_viewers",
    "bucket_start",
    cfg.points + 50
  );
  return rows.map(asPointFromRollup);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const range = parseRange(url.searchParams.get("range"));
    const compare = url.searchParams.get("compare") === "1";

    const cfg = getRangeConfig(range);
    const endMs = roundDownToMs(Date.now(), cfg.intervalMs);
    const startMs = endMs - (cfg.points - 1) * cfg.intervalMs;

    const startIso = toIso(startMs);
    const endIso = toIso(endMs);

    const series = await getSeries(range, startIso, endIso);

    let previous: SeriesPoint[] | null = null;
    if (compare) {
      const durationMs = cfg.points * cfg.intervalMs;
      const prevEndMs = endMs - durationMs;
      const prevStartMs = startMs - durationMs;
      previous = await getSeries(range, toIso(prevStartMs), toIso(prevEndMs));
    }

    return NextResponse.json(
      {
        range,
        bucket: cfg.bucket,
        intervalMs: cfg.intervalMs,
        start: startIso,
        end: endIso,
        expectedPoints: cfg.points,
        series,
        previous,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
