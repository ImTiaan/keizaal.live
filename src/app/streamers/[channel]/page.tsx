"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Radio, Users } from "lucide-react";
import { track } from "@vercel/analytics";

type StreamerProfileResponse = {
  channel: string;
  displayName: string;
  profileImageUrl: string;
  isLive: boolean;
  live?: {
    title: string;
    startedAt: string;
    viewerCount: number;
    thumbnailUrl: string;
    url: string;
  };
  stats: {
    streamsAllTime: number;
    maxViewersAllTime: number;
    lastSeenAt: string | null;
  };
  sessions: Array<{
    startedAt: string;
    firstSeenAt: string;
    lastSeenAt: string;
    maxViewers: number;
  }>;
  presence24h: Array<{ t: string; v: number }>;
  error?: string;
};

function TwitchLogo(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={props.className} fill="currentColor" aria-hidden="true">
      <path d="M4.7 2.8h17.5v12.6l-5.2 5.2h-3.8l-2.6 2.6H7.9v-2.6H4.7V2.8zm2.6 2.6v12.6h3.2v2.6l2.6-2.6h4.5l3.2-3.2V5.4H7.3zm6.4 3.2h2.6v6.4h-2.6V8.6zm-4.5 0h2.6v6.4H9.2V8.6z" />
    </svg>
  );
}

function formatDurationMs(ms: number) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function timeAgo(nowMs: number, iso: string | null) {
  if (!iso) return "";
  const ms = nowMs - new Date(iso).getTime();
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function buildPath(points: Array<{ t: string; v: number }>, w: number, h: number, pad: number) {
  const values = points.map((p) => Number(p.v)).filter((v) => Number.isFinite(v));
  const maxV = Math.max(1, ...values);
  const minV = Math.min(0, ...values);
  const x0 = pad;
  const x1 = w - pad;
  const y0 = pad;
  const y1 = h - pad;

  const n = points.length;
  if (n < 2) return "";

  const xAt = (idx: number) => x0 + (idx / (n - 1)) * (x1 - x0);
  const yAt = (v: number) => {
    const t = (v - minV) / (maxV - minV || 1);
    return y1 - t * (y1 - y0);
  };

  let d = "";
  points.forEach((p, idx) => {
    const x = xAt(idx);
    const y = yAt(p.v);
    d += idx === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  });
  return d;
}

export default function StreamerProfilePage() {
  const params = useParams<{ channel: string }>();
  const channel = String(params?.channel || "").toLowerCase();
  const [data, setData] = useState<StreamerProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);

    (async () => {
      try {
        const res = await fetch(`/api/streamer/${encodeURIComponent(channel)}`, { cache: "no-store" });
        const json = (await res.json()) as StreamerProfileResponse;
        if (!res.ok) throw new Error(json.error || "Failed to load streamer profile");
        if (!cancelled) setData(json);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load streamer profile";
        if (!cancelled) setErrorMessage(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [channel]);

  const twitchUrl = useMemo(() => `https://twitch.tv/${channel}`, [channel]);
  const presencePath = useMemo(() => {
    const pts = data?.presence24h || [];
    if (pts.length < 2) return "";
    return buildPath(pts, 860, 160, 16);
  }, [data?.presence24h]);

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
              onClick={() => track("Outbound_Click", { target: "keizaal", page: "streamer_profile" })}
            >
              Keizaal Online
            </a>
            <a
              href="https://discord.gg/zzCQ45nzyz"
              target="_blank"
              rel="noreferrer"
              className="text-zinc-400 hover:text-white transition-colors"
              onClick={() => track("Outbound_Click", { target: "discord", page: "streamer_profile" })}
            >
              Official Discord
            </a>
          </nav>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-grow flex flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/streamers"
            className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors"
            onClick={() => track("Streamer_Profile_Back", { channel })}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to leaderboard
          </Link>
          <a
            href={twitchUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm text-zinc-300 hover:text-white transition-colors"
            onClick={() => track("Outbound_Click", { target: "twitch", page: "streamer_profile", channel })}
          >
            <TwitchLogo className="w-4 h-4" />
            Open on Twitch
          </a>
        </div>

        {errorMessage ? (
          <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-300">
            {errorMessage}
          </div>
        ) : null}

        <div className="rounded-xl border border-zinc-800/50 bg-keizaal-card shadow-lg overflow-hidden">
          <div className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            {loading ? (
              <div className="w-16 h-16 rounded-full bg-zinc-800 animate-pulse" />
            ) : data?.profileImageUrl ? (
              <Image
                src={data.profileImageUrl}
                alt={data.displayName}
                width={64}
                height={64}
                className="rounded-full object-cover bg-zinc-800"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-zinc-800" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-xl font-bold text-white truncate">
                  {loading ? <span className="inline-block h-6 w-40 bg-zinc-800 rounded animate-pulse" /> : data?.displayName || channel}
                </h2>
                <div className="text-sm text-zinc-500 truncate">{channel}</div>
                {data?.isLive ? (
                  <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded tracking-wider uppercase shadow-md flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                    Live
                  </span>
                ) : null}
              </div>
              {data?.isLive && data.live?.title ? (
                <div className="text-sm text-zinc-300 mt-1 line-clamp-2">{data.live.title}</div>
              ) : null}
              {!data?.isLive && data?.stats?.lastSeenAt ? (
                <div className="text-sm text-zinc-500 mt-1">Last seen {timeAgo(nowMs, data.stats.lastSeenAt)}</div>
              ) : null}
            </div>
            {data?.isLive && data.live ? (
              <div className="flex items-center gap-3 bg-zinc-900/40 border border-zinc-800 rounded-xl px-4 py-3">
                <Radio className="w-5 h-5 text-red-500" />
                <div>
                  <div className="text-lg font-bold leading-none">{data.live.viewerCount.toLocaleString()}</div>
                  <div className="text-[11px] text-zinc-500 font-semibold tracking-wider uppercase mt-1">Viewers</div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="rounded-xl border border-zinc-800/50 bg-keizaal-card shadow-lg p-5">
            <div className="text-xs text-zinc-500 font-semibold tracking-wider uppercase">Streams</div>
            <div className="text-2xl font-bold text-white mt-2 tabular-nums">
              {loading ? <span className="inline-block h-7 w-24 bg-zinc-800 rounded animate-pulse" /> : (data?.stats.streamsAllTime || 0).toLocaleString()}
            </div>
            <div className="text-xs text-zinc-500 mt-1">All-time</div>
          </div>
          <div className="rounded-xl border border-zinc-800/50 bg-keizaal-card shadow-lg p-5">
            <div className="text-xs text-zinc-500 font-semibold tracking-wider uppercase">Peak Viewers</div>
            <div className="text-2xl font-bold text-white mt-2 tabular-nums">
              {loading ? <span className="inline-block h-7 w-28 bg-zinc-800 rounded animate-pulse" /> : (data?.stats.maxViewersAllTime || 0).toLocaleString()}
            </div>
            <div className="text-xs text-zinc-500 mt-1">All-time</div>
          </div>
          <div className="rounded-xl border border-zinc-800/50 bg-keizaal-card shadow-lg p-5">
            <div className="text-xs text-zinc-500 font-semibold tracking-wider uppercase">Last Seen</div>
            <div className="text-2xl font-bold text-white mt-2 tabular-nums">
              {loading ? (
                <span className="inline-block h-7 w-32 bg-zinc-800 rounded animate-pulse" />
              ) : data?.stats.lastSeenAt ? (
                timeAgo(nowMs, data.stats.lastSeenAt).replace(" ago", "")
              ) : (
                "—"
              )}
            </div>
            <div className="text-xs text-zinc-500 mt-1">On Keizaal Live</div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800/50 bg-keizaal-card shadow-lg overflow-hidden">
          <div className="px-4 py-4 border-b border-zinc-800/50 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-zinc-400" />
              <div className="text-sm font-semibold text-zinc-200">Viewers (last 24h)</div>
            </div>
            <div className="text-xs text-zinc-500">{data?.presence24h?.length ? `${data.presence24h.length} points` : ""}</div>
          </div>
          {loading ? (
            <div className="p-5 animate-pulse">
              <div className="h-[160px] bg-zinc-800 rounded" />
            </div>
          ) : data?.presence24h?.length ? (
            <div className="p-5">
              <svg viewBox="0 0 860 160" className="w-full h-[160px]">
                <path d={presencePath} fill="none" stroke="rgb(34, 197, 94)" strokeWidth="3" />
              </svg>
            </div>
          ) : (
            <div className="p-5 text-sm text-zinc-500">No viewer history yet. Check back after a few snapshots.</div>
          )}
        </div>

        <div className="rounded-xl border border-zinc-800/50 bg-keizaal-card shadow-lg overflow-hidden">
          <div className="px-4 py-4 border-b border-zinc-800/50 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-zinc-200">Recent Streams</div>
            <div className="text-xs text-zinc-500">{data?.sessions?.length ? `${data.sessions.length} sessions` : ""}</div>
          </div>
          {loading ? (
            <div className="p-5 animate-pulse">
              <div className="h-4 bg-zinc-800 rounded w-48 mb-4" />
              <div className="h-4 bg-zinc-800 rounded w-72 mb-3" />
              <div className="h-4 bg-zinc-800 rounded w-64 mb-3" />
              <div className="h-4 bg-zinc-800 rounded w-56" />
            </div>
          ) : data?.sessions?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-zinc-500">
                  <tr className="border-b border-zinc-800/50">
                    <th className="text-left font-semibold px-4 py-3">Started</th>
                    <th className="text-left font-semibold px-4 py-3">Duration</th>
                    <th className="text-right font-semibold px-4 py-3">Peak Viewers</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sessions.map((s) => {
                    const startedMs = new Date(s.startedAt).getTime();
                    const firstMs = new Date(s.firstSeenAt).getTime();
                    const lastMs = new Date(s.lastSeenAt).getTime();
                    const duration = formatDurationMs(Math.max(0, lastMs - (Number.isFinite(firstMs) ? firstMs : startedMs)));
                    return (
                      <tr key={`${channel}-${s.startedAt}`} className="border-b border-zinc-800/30">
                        <td className="px-4 py-3 text-zinc-300 tabular-nums">
                          {new Date(s.startedAt).toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="px-4 py-3 text-zinc-400 tabular-nums">{duration}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-zinc-200">{s.maxViewers.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-5 text-sm text-zinc-500">No sessions recorded yet. Check back after the streamer goes live.</div>
          )}
        </div>
      </div>
    </main>
  );
}

