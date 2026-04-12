"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Activity, LineChart as LineChartIcon } from "lucide-react";

type RangeKey = "24h" | "7d" | "30d" | "90d" | "365d";

type ApiPoint = {
  t: string;
  avgViewers: number;
  peakViewers: number;
  minViewers: number;
  avgStreams: number;
  peakStreams: number;
  minStreams: number;
};

type ApiResponse = {
  range: RangeKey;
  bucket: "5m" | "1h" | "2h" | "1d";
  intervalMs: number;
  start: string;
  end: string;
  expectedPoints: number;
  series: ApiPoint[];
  previous: ApiPoint[] | null;
  error?: string;
};

type FilledPoint = {
  tIso: string;
  tMs: number;
  avgViewers: number | null;
  peakViewers: number | null;
  minViewers: number | null;
  avgStreams: number | null;
  peakStreams: number | null;
  minStreams: number | null;
};

const RANGE_OPTIONS: Array<{ label: string; value: RangeKey }> = [
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "90d", value: "90d" },
  { label: "365d", value: "365d" },
];

function formatCompact(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatAvg(n: number) {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 100) return Math.round(n).toLocaleString();
  return n.toFixed(1);
}

function formatExactInt(n: number) {
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString();
}

function movingAverage(values: Array<number | null>, windowSize: number) {
  const half = Math.floor(windowSize / 2);
  return values.map((_, idx) => {
    let sum = 0;
    let count = 0;
    for (let j = idx - half; j <= idx + half; j++) {
      const v = values[j];
      if (typeof v === "number" && Number.isFinite(v)) {
        sum += v;
        count += 1;
      }
    }
    return count > 0 ? sum / count : null;
  });
}

function fillSeries(startIso: string, intervalMs: number, expectedPoints: number, points: ApiPoint[]) {
  const map = new Map<string, ApiPoint>();
  points.forEach((p) => map.set(p.t, p));
  const startMs = new Date(startIso).getTime();
  const filled: FilledPoint[] = [];
  let missing = 0;

  for (let i = 0; i < expectedPoints; i++) {
    const tMs = startMs + i * intervalMs;
    const tIso = new Date(tMs).toISOString();
    const p = map.get(tIso);
    if (!p) missing += 1;
    filled.push({
      tIso,
      tMs,
      avgViewers: p ? p.avgViewers : null,
      peakViewers: p ? p.peakViewers : null,
      minViewers: p ? p.minViewers : null,
      avgStreams: p ? p.avgStreams : null,
      peakStreams: p ? p.peakStreams : null,
      minStreams: p ? p.minStreams : null,
    });
  }

  return { filled, missing };
}

function computeStats(valuesAvg: Array<number | null>, valuesPeak: Array<number | null>, valuesMin: Array<number | null>) {
  const avgValues = valuesAvg.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const peakValues = valuesPeak.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const minValues = valuesMin.filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  const avg = avgValues.length > 0 ? avgValues.reduce((a, b) => a + b, 0) / avgValues.length : 0;
  const peak = peakValues.length > 0 ? Math.max(...peakValues) : 0;
  const min = minValues.length > 0 ? Math.min(...minValues) : 0;

  return { avg, peak, min, samples: avgValues.length };
}

function buildPath(values: Array<number | null>, width: number, height: number, padding: number, yMax: number) {
  const n = values.length;
  if (n === 0) return "";
  const min = 0;
  const plotW = width - padding * 2;
  const plotH = height - padding * 2;
  const denom = yMax - min || 1;
  const xAt = (i: number) => padding + (plotW * i) / Math.max(1, n - 1);
  const yAt = (v: number) => padding + (plotH * (yMax - v)) / denom;

  let d = "";
  let started = false;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const x = xAt(i);
    const y = yAt(v);
    d += `${started ? " L" : " M"}${x.toFixed(2)} ${y.toFixed(2)}`;
    started = true;
  }
  return d.trim();
}

function findNearestNonNullIndex(values: Array<number | null>, idx: number) {
  if (idx < 0 || idx >= values.length) return null;
  const center = values[idx];
  if (typeof center === "number" && Number.isFinite(center)) return idx;
  for (let offset = 1; offset < values.length; offset++) {
    const left = idx - offset;
    if (left >= 0) {
      const v = values[left];
      if (typeof v === "number" && Number.isFinite(v)) return left;
    }
    const right = idx + offset;
    if (right < values.length) {
      const v = values[right];
      if (typeof v === "number" && Number.isFinite(v)) return right;
    }
  }
  return null;
}

function Chart({
  title,
  subtitle,
  valuesAvg,
  valuesPeak,
  valuesPrevAvg,
  smoothingEnabled,
  smoothingWindow,
  formatY,
  hoveredIndex,
  onHover,
}: {
  title: string;
  subtitle: string;
  valuesAvg: Array<number | null>;
  valuesPeak: Array<number | null>;
  valuesPrevAvg: Array<number | null> | null;
  smoothingEnabled: boolean;
  smoothingWindow: number;
  formatY: (n: number) => string;
  hoveredIndex: number | null;
  onHover: (idx: number | null, clientX: number, clientY: number) => void;
}) {
  const width = 1000;
  const height = 240;
  const padding = 28;

  const isPeakSameAsAvg = useMemo(() => {
    if (valuesAvg.length !== valuesPeak.length) return false;
    for (let i = 0; i < valuesAvg.length; i++) {
      const a = valuesAvg[i];
      const p = valuesPeak[i];
      if (a === null || p === null) {
        if (a !== p) return false;
        continue;
      }
      if (!Number.isFinite(a) || !Number.isFinite(p)) return false;
      if (Math.abs(a - p) > 1e-9) return false;
    }
    return true;
  }, [valuesAvg, valuesPeak]);

  const avgForLine = useMemo(() => {
    if (!smoothingEnabled) return valuesAvg;
    return movingAverage(valuesAvg, smoothingWindow);
  }, [smoothingEnabled, smoothingWindow, valuesAvg]);

  const maxY = useMemo(() => {
    const numeric = [
      ...valuesAvg.filter((v): v is number => typeof v === "number" && Number.isFinite(v)),
      ...valuesPeak.filter((v): v is number => typeof v === "number" && Number.isFinite(v)),
      ...(valuesPrevAvg ? valuesPrevAvg.filter((v): v is number => typeof v === "number" && Number.isFinite(v)) : []),
    ];
    return Math.max(0, ...numeric);
  }, [valuesAvg, valuesPeak, valuesPrevAvg]);

  const dAvg = useMemo(() => buildPath(avgForLine, width, height, padding, maxY), [avgForLine, maxY]);
  const dPeak = useMemo(() => buildPath(valuesPeak, width, height, padding, maxY), [valuesPeak, maxY]);
  const dPrev = useMemo(
    () => (valuesPrevAvg ? buildPath(valuesPrevAvg, width, height, padding, maxY) : ""),
    [valuesPrevAvg, maxY]
  );

  const gridLines = 4;
  const yTicks = Array.from({ length: gridLines + 1 }, (_, i) => (maxY * i) / gridLines).reverse();

  const markerX = useMemo(() => {
    if (hoveredIndex === null) return null;
    return padding + ((width - padding * 2) * hoveredIndex) / Math.max(1, valuesAvg.length - 1);
  }, [hoveredIndex, valuesAvg.length]);

  return (
    <div className="rounded-xl border border-zinc-800/50 bg-keizaal-card shadow-lg overflow-hidden">
      <div className="px-4 py-4 border-b border-zinc-800/50 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-zinc-200">{title}</div>
          <div className="text-xs text-zinc-500 mt-0.5">{subtitle}</div>
        </div>
        <div className="text-xs text-zinc-500 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-keizaal-accent" />
            Avg
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${isPeakSameAsAvg ? "bg-zinc-500" : "bg-violet-400"}`} />
            Peak{isPeakSameAsAvg ? " (same)" : ""}
          </span>
          {valuesPrevAvg ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-zinc-500" />
              Prev
            </span>
          ) : null}
        </div>
      </div>

      <div className="relative px-2 py-3">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-[240px]"
          onMouseMove={(e) => {
            const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const xPx = e.clientX - rect.left;
            const xSvg = (xPx / rect.width) * width;
            const plotW = width - padding * 2;
            const xClamped = Math.min(Math.max(xSvg, padding), width - padding);
            const t = plotW > 0 ? (xClamped - padding) / plotW : 0;
            const rawIdx = Math.round(t * (valuesAvg.length - 1));
            const snappedIdx = findNearestNonNullIndex(valuesAvg, rawIdx);
            if (snappedIdx === null) {
              onHover(null, e.clientX, e.clientY);
              return;
            }
            onHover(snappedIdx, e.clientX, e.clientY);
          }}
          onMouseLeave={(e) => onHover(null, e.clientX, e.clientY)}
        >
          <rect x="0" y="0" width={width} height={height} fill="transparent" />

          {yTicks.map((t, i) => {
            const y = padding + ((height - padding * 2) * i) / gridLines;
            return (
              <g key={String(i)}>
                <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                <text x={padding - 10} y={y + 4} textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.28)">
                  {formatY(t)}
                </text>
              </g>
            );
          })}

          {dPrev ? (
            <path d={dPrev} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="2" strokeDasharray="6 6" />
          ) : null}
          {dAvg ? <path d={dAvg} fill="none" stroke="rgba(34,121,97,0.95)" strokeWidth="4" /> : null}
          {!isPeakSameAsAvg && dPeak ? (
            <path d={dPeak} fill="none" stroke="rgba(185,142,255,0.9)" strokeWidth="2" strokeDasharray="4 4" />
          ) : null}

          {markerX !== null ? (
            <line x1={markerX} y1={padding} x2={markerX} y2={height - padding} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
          ) : null}
        </svg>
      </div>
    </div>
  );
}

export default function StatsPage() {
  const [range, setRange] = useState<RangeKey>("7d");
  const [smoothingEnabled] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [hoverClient, setHoverClient] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);

    (async () => {
      try {
        const res = await fetch(`/api/stats/streams?range=${range}&compare=0`, {
          cache: "no-store",
        });
        const json = (await res.json()) as ApiResponse;
        if (!res.ok) throw new Error(json.error || "Failed to load stats");
        if (!cancelled) setData(json);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load stats";
        if (!cancelled) setErrorMessage(msg);
      } finally {
        if (!cancelled) {
          setLoading(false);
          window.setTimeout(() => setSwitching(false), 150);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [range]);

  const filled = useMemo(() => {
    if (!data) return null;
    const current = fillSeries(data.start, data.intervalMs, data.expectedPoints, data.series);
    const previous = data.previous ? fillSeries(new Date(new Date(data.start).getTime() - data.expectedPoints * data.intervalMs).toISOString(), data.intervalMs, data.expectedPoints, data.previous) : null;
    return { current, previous };
  }, [data]);

  const smoothingWindow = useMemo(() => {
    if (!data) return 5;
    if (data.range === "24h") return 7;
    if (data.range === "7d") return 9;
    if (data.range === "30d") return 5;
    if (data.range === "90d") return 5;
    return 7;
  }, [data]);

  const viewersStats = useMemo(() => {
    if (!filled) return null;
    const cur = computeStats(
      filled.current.filled.map((p) => p.avgViewers),
      filled.current.filled.map((p) => p.peakViewers),
      filled.current.filled.map((p) => p.minViewers)
    );
    return { cur, prev: null };
  }, [filled]);

  const streamsStats = useMemo(() => {
    if (!filled) return null;
    const cur = computeStats(
      filled.current.filled.map((p) => p.avgStreams),
      filled.current.filled.map((p) => p.peakStreams),
      filled.current.filled.map((p) => p.minStreams)
    );
    return { cur, prev: null };
  }, [filled]);

  const hoveredTime = useMemo(() => {
    if (!filled || hoveredIndex === null) return null;
    const ms = filled.current.filled[hoveredIndex]?.tMs;
    if (typeof ms !== "number") return null;
    return new Date(ms).toLocaleString();
  }, [filled, hoveredIndex]);

  const hoveredValues = useMemo(() => {
    if (!filled || hoveredIndex === null) return null;
    const p = filled.current.filled[hoveredIndex];
    if (!p) return null;
    const prev = filled.previous ? filled.previous.filled[hoveredIndex] : null;
    return { p, prev };
  }, [filled, hoveredIndex]);

  const tooltip = useMemo(() => {
    if (!hoverClient || !containerRef.current || !hoveredValues || !hoveredTime) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const left = Math.min(Math.max(12, hoverClient.x - rect.left + 12), rect.width - 260);
    const top = Math.min(Math.max(12, hoverClient.y - rect.top - 12), rect.height - 140);
    return { left, top };
  }, [hoverClient, hoveredValues, hoveredTime]);

  const subtitle = useMemo(() => {
    if (!data) return "";
    const start = new Date(data.start).toLocaleString();
    const end = new Date(data.end).toLocaleString();
    return `${start} → ${end}`;
  }, [data]);

  return (
    <main className="min-h-screen bg-keizaal-bg text-zinc-100 flex flex-col font-sans">
      <header className="border-b border-zinc-800 bg-keizaal-bg/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="Keizaal Logo" width={32} height={32} className="object-contain" />
            <h1 className="text-2xl font-bold tracking-widest text-white font-[family-name:var(--font-cinzel)] pt-1">
              KEIZAAL <span className="text-keizaal-accent">LIVE</span>
            </h1>
          </div>
          <nav className="flex items-center gap-4 sm:gap-6 text-sm font-medium">
            <Link href="/" className="text-zinc-400 hover:text-white transition-colors hidden sm:inline-block">
              Live Streams
            </Link>
            <Link href="/clips" className="text-zinc-400 hover:text-white transition-colors hidden sm:inline-block">
              Top Clips
            </Link>
            <Link href="/stats" className="text-white transition-colors hidden sm:inline-block">
              Stats
            </Link>
            <Link href="/streamers" className="text-zinc-400 hover:text-white transition-colors hidden sm:inline-block">
              Streamers
            </Link>
            <a
              href="https://keizaal.com"
              target="_blank"
              rel="noreferrer"
              className="text-zinc-400 hover:text-white transition-colors hidden sm:inline-block"
            >
              Keizaal Online
            </a>
            <a
              href="https://discord.gg/zzCQ45nzyz"
              target="_blank"
              rel="noreferrer"
              className="text-zinc-400 hover:text-white transition-colors"
            >
              Official Discord
            </a>
          </nav>
        </div>
      </header>

      <div className="sticky top-16 z-40 bg-keizaal-bg/95 backdrop-blur-md border-b border-zinc-800/50 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-keizaal-card p-4 rounded-xl border border-zinc-800/50 shadow-lg flex flex-col gap-3">
            {errorMessage ? (
              <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-300">
                Having trouble loading stats right now. Try again in a moment.
              </div>
            ) : null}

            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-zinc-200">Range:</span>
                <div className="flex items-center gap-2 flex-wrap">
                  {RANGE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setSwitching(true);
                        setRange(opt.value);
                      }}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${
                        range === opt.value
                          ? "bg-zinc-800 border-zinc-700 text-white"
                          : "bg-zinc-900/40 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap justify-between" />
            </div>

            {data ? (
              <div className="text-xs text-zinc-500 flex items-center gap-2">
                <LineChartIcon className="w-4 h-4" />
                {subtitle}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div ref={containerRef} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-grow flex flex-col gap-6">
        {loading && !data ? (
          <div className="flex-grow flex items-center justify-center">
            <Activity className="w-8 h-8 animate-pulse text-keizaal-accent" />
          </div>
        ) : data && filled && viewersStats && streamsStats ? (
          <>
            {switching ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div
                    key={String(idx)}
                    className="rounded-xl border border-zinc-800/50 bg-keizaal-card p-4 shadow-lg animate-pulse"
                  >
                    <div className="h-3 w-24 bg-zinc-800 rounded" />
                    <div className="h-7 w-28 bg-zinc-800 rounded mt-3" />
                    <div className="h-3 w-20 bg-zinc-900 rounded mt-3" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="rounded-xl border border-zinc-800/50 bg-keizaal-card p-4 shadow-lg">
                  <div className="text-xs text-zinc-500 font-semibold tracking-wider uppercase">Avg Viewers</div>
                  <div className="text-2xl font-bold text-white mt-2">{formatAvg(viewersStats.cur.avg)}</div>
                  {null}
                </div>
                <div className="rounded-xl border border-zinc-800/50 bg-keizaal-card p-4 shadow-lg">
                  <div className="text-xs text-zinc-500 font-semibold tracking-wider uppercase">Peak Viewers</div>
                <div className="text-2xl font-bold text-white mt-2">{formatExactInt(viewersStats.cur.peak)}</div>
                </div>
                <div className="rounded-xl border border-zinc-800/50 bg-keizaal-card p-4 shadow-lg">
                  <div className="text-xs text-zinc-500 font-semibold tracking-wider uppercase">Min Viewers</div>
                <div className="text-2xl font-bold text-white mt-2">{formatExactInt(viewersStats.cur.min)}</div>
                </div>

                <div className="rounded-xl border border-zinc-800/50 bg-keizaal-card p-4 shadow-lg">
                  <div className="text-xs text-zinc-500 font-semibold tracking-wider uppercase">Avg Live Streams</div>
                  <div className="text-2xl font-bold text-white mt-2">{formatAvg(streamsStats.cur.avg)}</div>
                  {null}
                </div>
                <div className="rounded-xl border border-zinc-800/50 bg-keizaal-card p-4 shadow-lg">
                  <div className="text-xs text-zinc-500 font-semibold tracking-wider uppercase">Peak Live Streams</div>
                <div className="text-2xl font-bold text-white mt-2">{formatExactInt(streamsStats.cur.peak)}</div>
                </div>
                <div className="rounded-xl border border-zinc-800/50 bg-keizaal-card p-4 shadow-lg">
                  <div className="text-xs text-zinc-500 font-semibold tracking-wider uppercase">Min Live Streams</div>
                <div className="text-2xl font-bold text-white mt-2">{formatExactInt(streamsStats.cur.min)}</div>
                </div>
              </div>
            )}

            {switching ? (
              <div className="rounded-xl border border-zinc-800/50 bg-keizaal-card shadow-lg overflow-hidden animate-pulse">
                <div className="px-4 py-4 border-b border-zinc-800/50 flex items-center justify-between gap-3">
                  <div className="h-4 w-32 bg-zinc-800 rounded" />
                  <div className="h-3 w-40 bg-zinc-900 rounded" />
                </div>
                <div className="px-4 py-6">
                  <div className="h-[240px] w-full bg-zinc-900/40 rounded-lg" />
                </div>
              </div>
            ) : (
              <Chart
                title="Total Viewers"
                subtitle="Avg + Peak"
                valuesAvg={filled.current.filled.map((p) => p.avgViewers)}
                valuesPeak={filled.current.filled.map((p) => p.peakViewers)}
                valuesPrevAvg={null}
                smoothingEnabled={smoothingEnabled}
                smoothingWindow={smoothingWindow}
                formatY={(n) => formatCompact(Math.round(n))}
                hoveredIndex={hoveredIndex}
                onHover={(idx, x, y) => {
                  setHoveredIndex(idx);
                  setHoverClient(idx === null ? null : { x, y });
                }}
              />
            )}

            {switching ? (
              <div className="rounded-xl border border-zinc-800/50 bg-keizaal-card shadow-lg overflow-hidden animate-pulse">
                <div className="px-4 py-4 border-b border-zinc-800/50 flex items-center justify-between gap-3">
                  <div className="h-4 w-28 bg-zinc-800 rounded" />
                  <div className="h-3 w-40 bg-zinc-900 rounded" />
                </div>
                <div className="px-4 py-6">
                  <div className="h-[240px] w-full bg-zinc-900/40 rounded-lg" />
                </div>
              </div>
            ) : (
              <Chart
                title="Live Streams"
                subtitle="Avg + Peak"
                valuesAvg={filled.current.filled.map((p) => p.avgStreams)}
                valuesPeak={filled.current.filled.map((p) => p.peakStreams)}
                valuesPrevAvg={null}
                smoothingEnabled={smoothingEnabled}
                smoothingWindow={smoothingWindow}
                formatY={(n) => formatCompact(Math.round(n))}
                hoveredIndex={hoveredIndex}
                onHover={(idx, x, y) => {
                  setHoveredIndex(idx);
                  setHoverClient(idx === null ? null : { x, y });
                }}
              />
            )}
          </>
        ) : (
          <div className="flex-grow flex items-center justify-center text-zinc-500">
            {errorMessage ? "Couldn't load stats" : "No data yet"}
          </div>
        )}

        {tooltip && hoveredValues && hoveredTime ? (
          <div
            className="pointer-events-none absolute z-50"
            style={{ left: tooltip.left, top: tooltip.top }}
          >
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/95 backdrop-blur-md shadow-xl px-4 py-3 w-[250px]">
              <div className="text-xs text-zinc-400">{hoveredTime}</div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-zinc-400">Viewers</span>
                <span className="text-white font-semibold">
                  {hoveredValues.p.avgViewers !== null ? `${formatAvg(hoveredValues.p.avgViewers)} avg` : "—"}
                  {hoveredValues.p.peakViewers !== null ? ` • ${formatExactInt(hoveredValues.p.peakViewers)} peak` : ""}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm">
                <span className="text-zinc-400">Streams</span>
                <span className="text-white font-semibold">
                  {hoveredValues.p.avgStreams !== null ? `${formatAvg(hoveredValues.p.avgStreams)} avg` : "—"}
                  {hoveredValues.p.peakStreams !== null ? ` • ${formatExactInt(hoveredValues.p.peakStreams)} peak` : ""}
                </span>
              </div>
              {null}
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
