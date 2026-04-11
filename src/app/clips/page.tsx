"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Eye, Play } from "lucide-react";

type Clip = {
  id: string;
  url: string;
  embedUrl: string;
  title: string;
  viewCount: number;
  createdAt: string;
  duration: number;
  thumbnailUrl: string;
  broadcasterId: string;
  broadcasterName: string;
  broadcasterProfileImageUrl: string;
  creatorName: string;
};

type ClipsResponse = {
  generatedAt: string;
  range: string;
  stats: {
    clips: number;
    totalViews: number;
  };
  clips: Clip[];
  error?: string;
};

const RANGE_OPTIONS: { label: string; value: "24h" | "7d" | "30d" }[] = [
  { label: "24 Hours", value: "24h" },
  { label: "7 Days", value: "7d" },
  { label: "30 Days", value: "30d" },
];

function formatCompactNumber(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatDuration(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m > 0) return `${m}:${String(s).padStart(2, "0")}`;
  return `0:${String(s).padStart(2, "0")}`;
}

function formatAge(createdAtIso: string) {
  const createdAt = new Date(createdAtIso).getTime();
  const now = Date.now();
  const ms = Math.max(0, now - createdAt);
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days >= 2) return `${days} days ago`;
  if (days === 1) return "Yesterday";
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours >= 1) return `${hours}h ago`;
  const minutes = Math.floor(ms / (60 * 1000));
  if (minutes >= 1) return `${minutes}m ago`;
  return "Just now";
}

export default function TopClipsPage() {
  const [range, setRange] = useState<"24h" | "7d" | "30d">("7d");
  const [data, setData] = useState<ClipsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [base30d, setBase30d] = useState<ClipsResponse | null>(null);
  const [switching, setSwitching] = useState(false);

  const fetchClips = useCallback(
    async (nextRange: typeof range, limit?: number) => {
      setErrorMessage(null);

      try {
        const qs = new URLSearchParams({ range: nextRange });
        if (typeof limit === "number") qs.set("limit", String(limit));

        const res = await fetch(`/api/clips?${qs.toString()}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as ClipsResponse;
        if (!res.ok) throw new Error(json.error || "Failed to fetch clips");
        return json;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch clips";
        setErrorMessage(message);
        return null;
      }
    },
    []
  );

  const deriveFromBase = useCallback((base: ClipsResponse, nextRange: typeof range) => {
    const now = Date.now();
    const withinMs =
      nextRange === "24h" ? 24 * 60 * 60 * 1000 : nextRange === "7d" ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
    const cutoff = now - withinMs;

    const filtered = base.clips
      .filter((c) => new Date(c.createdAt).getTime() >= cutoff)
      .sort((a, b) => b.viewCount - a.viewCount)
      .slice(0, 48);

    const totalViews = filtered.reduce((acc, c) => acc + (c.viewCount || 0), 0);

    return {
      generatedAt: base.generatedAt,
      range: nextRange,
      stats: {
        clips: filtered.length,
        totalViews,
      },
      clips: filtered,
    } satisfies ClipsResponse;
  }, []);

  useEffect(() => {
    void (async () => {
      const result = await fetchClips("30d", 200);
      if (result) {
        setBase30d(result);
      }
    })();
  }, [fetchClips]);

  useEffect(() => {
    void (async () => {
      setSwitching(true);
      setLoading(true);

      if (base30d) {
        setData(deriveFromBase(base30d, range));
        setLoading(false);
        window.setTimeout(() => setSwitching(false), 200);
        return;
      }

      const result = await fetchClips(range);
      if (result) {
        setData(result);
      } else {
        setData(null);
      }
      setLoading(false);
      window.setTimeout(() => setSwitching(false), 200);
    })();
  }, [base30d, deriveFromBase, fetchClips, range]);

  const generatedAtText = useMemo(() => {
    if (!data?.generatedAt) return "";
    return new Date(data.generatedAt).toLocaleString();
  }, [data?.generatedAt]);

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
            <Link href="/clips" className="text-white transition-colors hidden sm:inline-block">
              Top Clips
            </Link>
            <Link href="/stats" className="text-zinc-400 hover:text-white transition-colors hidden sm:inline-block">
              Stats
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
                Having trouble reaching Twitch clips right now. Try again in a moment.
              </div>
            ) : null}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-zinc-200">Time Range:</span>
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
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 flex-wrap">
                {data ? (
                  <div className="text-xs text-zinc-500">
                    {data.stats.clips} clips · {formatCompactNumber(data.stats.totalViews)} views · Updated {generatedAtText}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-grow flex flex-col">
        {loading || switching ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {Array.from({ length: 9 }).map((_, idx) => (
              <div
                key={idx}
                className="flex flex-col bg-keizaal-card rounded-xl overflow-hidden border border-zinc-800/50"
              >
                <div className="relative aspect-video bg-zinc-900 animate-pulse" />
                <div className="p-4 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-zinc-800 animate-pulse" />
                    <div className="flex-1 min-w-0">
                      <div className="h-5 w-32 bg-zinc-800 rounded animate-pulse" />
                      <div className="h-4 w-40 bg-zinc-900 rounded mt-2 animate-pulse" />
                    </div>
                  </div>
                  <div className="h-5 w-5/6 bg-zinc-800 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : data?.clips && data.clips.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {data.clips.map((clip) => (
              <a
                key={clip.id}
                href={clip.url}
                target="_blank"
                rel="noreferrer"
                className="group flex flex-col bg-keizaal-card rounded-xl overflow-hidden border border-zinc-800/50 hover:border-zinc-700 transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-keizaal-accent/10"
              >
                <div className="relative aspect-video bg-zinc-900">
                  {clip.thumbnailUrl ? (
                    <Image
                      src={clip.thumbnailUrl}
                      alt={clip.title}
                      fill
                      sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : null}

                  <div className="absolute top-3 left-3">
                    <span className="bg-black/70 backdrop-blur-md text-white text-xs font-semibold px-2.5 py-1.5 rounded shadow-md flex items-center gap-2">
                      <Play className="w-4 h-4" fill="currentColor" />
                      {formatDuration(clip.duration)}
                    </span>
                  </div>

                  <div className="absolute bottom-3 left-3">
                    <span className="bg-black/70 backdrop-blur-md text-white text-xs font-semibold px-2.5 py-1.5 rounded shadow-md flex items-center gap-2">
                      <Eye className="w-4 h-4 text-keizaal-accent" />
                      {formatCompactNumber(clip.viewCount)}
                    </span>
                  </div>

                  <div className="absolute bottom-3 right-3">
                    <span className="bg-black/70 backdrop-blur-md text-white text-xs font-semibold px-2.5 py-1.5 rounded shadow-md">
                      {formatAge(clip.createdAt)}
                    </span>
                  </div>
                </div>

                <div className="p-4 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    {clip.broadcasterProfileImageUrl ? (
                      <Image
                        src={clip.broadcasterProfileImageUrl}
                        alt={clip.broadcasterName}
                        width={44}
                        height={44}
                        className="rounded-full ring-2 ring-zinc-800"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-zinc-800" />
                    )}

                    <div className="min-w-0">
                      <div className="text-lg font-bold text-keizaal-accent truncate leading-tight">
                        {clip.broadcasterName}
                      </div>
                      <div className="text-sm text-zinc-500 truncate leading-tight">
                        Clipped by {clip.creatorName}
                      </div>
                    </div>
                  </div>

                  <div className="text-base font-semibold text-zinc-200 line-clamp-2 leading-snug">
                    {clip.title}
                  </div>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="flex-grow flex flex-col items-center justify-center py-20 text-center">
            <h2 className="text-xl font-bold text-zinc-300 mb-2">No clips found</h2>
            <p className="text-zinc-500 max-w-md">
              No clips matched the Keizaal / Skyrim RP keywords for this time range. Try a different range or refresh.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
