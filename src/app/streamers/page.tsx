"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Activity, Users } from "lucide-react";

type RangeKey = "24h" | "7d" | "30d" | "90d" | "365d";

type LeaderboardRow = {
  channel: string;
  displayName: string;
  profileImageUrl: string;
  daysStreamed: number;
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
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "90d", value: "90d" },
  { label: "365d", value: "365d" },
];

export default function StreamersPage() {
  const [range, setRange] = useState<RangeKey>("7d");
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);

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

  const subtitle = useMemo(() => {
    if (loading) return "";
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
            <Link href="/" className="text-zinc-400 hover:text-white transition-colors hidden sm:inline-block">
              Live Streams
            </Link>
            <Link href="/clips" className="text-zinc-400 hover:text-white transition-colors hidden sm:inline-block">
              Top Clips
            </Link>
            <Link href="/stats" className="text-zinc-400 hover:text-white transition-colors hidden sm:inline-block">
              Stats
            </Link>
            <Link href="/streamers" className="text-white transition-colors hidden sm:inline-block">
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
        {loading && !leaderboard.length ? (
          <div className="flex-grow flex items-center justify-center">
            <Activity className="w-8 h-8 animate-pulse text-keizaal-accent" />
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-800/50 bg-keizaal-card shadow-lg overflow-hidden">
            <div className="px-4 py-4 border-b border-zinc-800/50 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-zinc-400" />
                <div className="text-sm font-semibold text-zinc-200">Top Streamers</div>
              </div>
              <div className="text-xs text-zinc-500">Sorted by days streamed, then max viewers</div>
            </div>

            {switching ? (
              <div className="px-4 py-4 animate-pulse">
                <div className="h-10 bg-zinc-900/40 rounded-lg" />
                <div className="h-10 bg-zinc-900/40 rounded-lg mt-3" />
                <div className="h-10 bg-zinc-900/40 rounded-lg mt-3" />
              </div>
            ) : leaderboard.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase tracking-wider text-zinc-500">
                    <tr className="border-b border-zinc-800/50">
                      <th className="text-left font-semibold px-4 py-3 w-12">#</th>
                      <th className="text-left font-semibold px-4 py-3">Streamer</th>
                      <th className="text-right font-semibold px-4 py-3 w-28">Days</th>
                      <th className="text-right font-semibold px-4 py-3 w-32">Max Viewers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.slice(0, 100).map((row, idx) => (
                      <tr key={row.channel} className="border-b border-zinc-800/30 hover:bg-zinc-900/30">
                        <td className="px-4 py-3 text-zinc-500 tabular-nums">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <a href={`https://twitch.tv/${row.channel}`} target="_blank" rel="noreferrer">
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
                            </a>
                            <div className="min-w-0">
                              <a
                                href={`https://twitch.tv/${row.channel}`}
                                target="_blank"
                                rel="noreferrer"
                                className="font-semibold text-zinc-200 hover:text-white transition-colors truncate block"
                              >
                                {row.displayName}
                              </a>
                              <div className="text-xs text-zinc-500 truncate">{row.channel}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-zinc-200">{row.daysStreamed}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-zinc-200">{row.maxViewers.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-4 py-4 text-sm text-zinc-500">No streamer data yet. Check back after a few snapshots.</div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

