"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Users } from "lucide-react";
import { track } from "@vercel/analytics";

type RangeKey = "all" | "24h" | "7d" | "30d" | "90d" | "365d";

type LeaderboardRow = {
  channel: string;
  displayName: string;
  profileImageUrl: string;
  streams: number;
  maxViewers: number;
};

type LeaderboardResponse = {
  range: RangeKey;
  start: string;
  end: string;
  leaderboard: LeaderboardRow[];
  error?: string;
};

const RANGE_OPTIONS: Array<{ label: string; value: RangeKey }> = [
  { label: "All", value: "all" },
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "90d", value: "90d" },
  { label: "365d", value: "365d" },
];

export default function StreamersPage() {
  const [range, setRange] = useState<RangeKey>("all");
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [sortKey, setSortKey] = useState<"maxViewers" | "streams">("maxViewers");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);

    (async () => {
      try {
        const res = await fetch(`/api/stats/streamers?range=${range}`, { cache: "no-store" });
        const json = (await res.json()) as LeaderboardResponse;
        if (!res.ok) throw new Error(json.error || "Failed to load leaderboard");
        if (!cancelled) setLeaderboard(Array.isArray(json.leaderboard) ? json.leaderboard : []);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load leaderboard";
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

  useEffect(() => {
    setPage(1);
  }, [range]);

  const sortedLeaderboard = useMemo(() => {
    const rows = [...leaderboard];
    const dir = sortDir === "desc" ? -1 : 1;

    rows.sort((a, b) => {
      if (sortKey === "maxViewers") {
        const primary = (a.maxViewers - b.maxViewers) * dir;
        if (primary !== 0) return primary;
        const secondary = (a.streams - b.streams) * dir;
        if (secondary !== 0) return secondary;
      } else {
        const primary = (a.streams - b.streams) * dir;
        if (primary !== 0) return primary;
        const secondary = (a.maxViewers - b.maxViewers) * dir;
        if (secondary !== 0) return secondary;
      }

      const ac = a.channel.toLowerCase();
      const bc = b.channel.toLowerCase();
      if (ac < bc) return -1;
      if (ac > bc) return 1;
      return 0;
    });

    return rows;
  }, [leaderboard, sortDir, sortKey]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(sortedLeaderboard.length / pageSize));
  }, [sortedLeaderboard.length]);

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const pagedLeaderboard = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedLeaderboard.slice(start, start + pageSize);
  }, [page, sortedLeaderboard]);

  const sortLabel = useMemo(() => {
    const isStreams = sortKey === "streams";
    const arrow = sortDir === "desc" ? "↓" : "↑";
    return {
      streams: isStreams ? arrow : "",
      maxViewers: !isStreams ? arrow : "",
    };
  }, [sortDir, sortKey]);

  const setSort = (nextKey: "streams" | "maxViewers") => {
    const nextDir = nextKey === sortKey ? (sortDir === "desc" ? "asc" : "desc") : "desc";
    setPage(1);
    setSortKey(nextKey);
    setSortDir(nextDir);
    track("Streamers_Sort_Change", { sort: nextKey, dir: nextDir, range });
  };

  const subtitle = useMemo(() => {
    if (loading) return "";
    if (range === "all") return "Since tracking started";
    return range === "24h" ? "Last 24 hours" : `Last ${range.replace("d", "")} days`;
  }, [loading, range]);

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
            <Link
              href="/"
              className="text-zinc-400 hover:text-white transition-colors hidden sm:inline-block"
              onClick={() => track("Nav_Click", { destination: "streams" })}
            >
              Live Streams
            </Link>
            <Link
              href="/clips"
              className="text-zinc-400 hover:text-white transition-colors hidden sm:inline-block"
              onClick={() => track("Nav_Click", { destination: "clips" })}
            >
              Top Clips
            </Link>
            <Link
              href="/stats"
              className="text-zinc-400 hover:text-white transition-colors hidden sm:inline-block"
              onClick={() => track("Nav_Click", { destination: "stats" })}
            >
              Stats
            </Link>
            <Link
              href="/streamers"
              className="text-white transition-colors hidden sm:inline-block"
              onClick={() => track("Nav_Click", { destination: "streamers" })}
            >
              Streamers
            </Link>
            <a
              href="https://keizaal.com"
              target="_blank"
              rel="noreferrer"
              className="text-zinc-400 hover:text-white transition-colors hidden sm:inline-block"
              onClick={() => track("Outbound_Click", { target: "keizaal", page: "streamers" })}
            >
              Keizaal Online
            </a>
            <a
              href="https://discord.gg/zzCQ45nzyz"
              target="_blank"
              rel="noreferrer"
              className="text-zinc-400 hover:text-white transition-colors"
              onClick={() => track("Outbound_Click", { target: "discord", page: "streamers" })}
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
                Having trouble loading streamers right now. Try again in a moment.
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
                        track("Streamers_Range_Change", { range: opt.value });
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
              <div className="text-xs text-zinc-500">{subtitle}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-grow flex flex-col gap-6">
        <div className="rounded-xl border border-zinc-800/50 bg-keizaal-card shadow-lg overflow-hidden">
          <div className="px-4 py-4 border-b border-zinc-800/50 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-zinc-400" />
              <div className="text-sm font-semibold text-zinc-200">Top Streamers</div>
            </div>
            <div className="text-xs text-zinc-500">{subtitle}</div>
          </div>

          {errorMessage ? (
            <div className="px-4 py-4 text-sm text-zinc-400">{errorMessage}</div>
          ) : loading || switching ? (
            <div className="overflow-x-auto animate-pulse">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-zinc-500">
                  <tr className="border-b border-zinc-800/50">
                    <th className="text-left font-semibold px-4 py-3 w-12">#</th>
                    <th className="text-left font-semibold px-4 py-3">Streamer</th>
                    <th className="text-right font-semibold px-4 py-3 w-28">Streams</th>
                    <th className="text-right font-semibold px-4 py-3 w-32">Max Viewers</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: pageSize }).map((_, idx) => (
                    <tr key={String(idx)} className="border-b border-zinc-800/30">
                      <td className="px-4 py-3">
                        <div className="h-4 w-6 bg-zinc-800 rounded" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-zinc-800" />
                          <div className="min-w-0">
                            <div className="h-4 w-32 bg-zinc-800 rounded" />
                            <div className="h-3 w-20 bg-zinc-900 rounded mt-2" />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-4 w-10 bg-zinc-800 rounded ml-auto" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-4 w-16 bg-zinc-800 rounded ml-auto" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : leaderboard.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase tracking-wider text-zinc-500">
                    <tr className="border-b border-zinc-800/50">
                      <th className="text-left font-semibold px-4 py-3 w-12">#</th>
                      <th className="text-left font-semibold px-4 py-3">Streamer</th>
                      <th className="text-right font-semibold px-4 py-3 w-28">
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 hover:text-zinc-300 transition-colors"
                          onClick={() => setSort("streams")}
                        >
                          Streams <span className="text-zinc-600">{sortLabel.streams}</span>
                        </button>
                      </th>
                      <th className="text-right font-semibold px-4 py-3 w-32">
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 hover:text-zinc-300 transition-colors"
                          onClick={() => setSort("maxViewers")}
                        >
                          Max Viewers <span className="text-zinc-600">{sortLabel.maxViewers}</span>
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedLeaderboard.map((row, idx) => (
                      <tr key={row.channel} className="border-b border-zinc-800/30 hover:bg-zinc-900/30">
                        <td className="px-4 py-3 text-zinc-500 tabular-nums">{(page - 1) * pageSize + idx + 1}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Link
                              href={`/streamers/${row.channel}`}
                              onClick={() =>
                                track("Streamer_Open", { source: "streamers_leaderboard", channel: row.channel, range })
                              }
                            >
                              {row.profileImageUrl ? (
                                <Image
                                  src={row.profileImageUrl}
                                  alt={row.displayName}
                                  width={28}
                                  height={28}
                                  className="rounded-full object-cover bg-zinc-800"
                                />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-zinc-800" />
                              )}
                            </Link>
                            <div className="min-w-0">
                              <Link
                                href={`/streamers/${row.channel}`}
                                className="font-semibold text-zinc-200 hover:text-white transition-colors truncate block"
                                onClick={() =>
                                  track("Streamer_Open", { source: "streamers_leaderboard", channel: row.channel, range })
                                }
                              >
                                {row.displayName}
                              </Link>
                              <div className="text-xs text-zinc-500 truncate">{row.channel}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-zinc-200">{row.streams}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-zinc-200">{row.maxViewers.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-4 flex items-center justify-between gap-3">
                <div className="text-xs text-zinc-500">
                  Page {page} of {totalPages}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setPage((p) => {
                        const next = Math.max(1, p - 1);
                        track("Streamers_Page_Change", { page: next, range });
                        return next;
                      })
                    }
                    disabled={page <= 1}
                    className="px-3 py-2 rounded-lg text-sm font-medium transition-colors border bg-zinc-900/40 border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700 disabled:opacity-40 disabled:hover:border-zinc-800 disabled:hover:text-zinc-300"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPage((p) => {
                        const next = Math.min(totalPages, p + 1);
                        track("Streamers_Page_Change", { page: next, range });
                        return next;
                      })
                    }
                    disabled={page >= totalPages}
                    className="px-3 py-2 rounded-lg text-sm font-medium transition-colors border bg-zinc-900/40 border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700 disabled:opacity-40 disabled:hover:border-zinc-800 disabled:hover:text-zinc-300"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="px-4 py-4 text-sm text-zinc-500">No streamer data yet. Check back after a few snapshots.</div>
          )}
        </div>
      </div>
    </main>
  );
}
