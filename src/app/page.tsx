"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { RefreshCw, Users, Radio, Info, ChevronDown, ChevronUp, Play, Pause, Flame, Clock, TrendingUp } from "lucide-react";
import { track } from "@vercel/analytics";

interface Stream {
  platform: string;
  channel: string;
  displayName: string;
  title: string;
  viewerCount: number;
  thumbnailUrl: string;
  profileImageUrl: string;
  url: string;
  isLive: boolean;
  startedAt: string;
}

interface Stats {
  liveStreams: number;
  totalViewers: number;
}

interface StreamsResponse {
  generatedAt: string;
  stats: Stats;
  streams: Stream[];
  error?: string;
}

interface FeaturedCard {
  stream: Stream;
  growthPct5m: number;
  isBreakout: boolean;
}

interface FeaturedResponse {
  generatedAt: string;
  title: "Going Viral";
  cards: FeaturedCard[];
  error?: string;
}

export default function Home() {
  const [data, setData] = useState<StreamsResponse | null>(null);
  const [featured, setFeatured] = useState<FeaturedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(60);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [imageBuster, setImageBuster] = useState(() => Date.now());
  const [thumbRetriesByChannel, setThumbRetriesByChannel] = useState<Record<string, number>>({});

  const lastGoodDataRef = useRef<StreamsResponse | null>(null);
  const fetchStreamsRef = useRef<(isRefresh?: boolean) => Promise<void>>(async () => {});
  const howToRef = useRef<HTMLDivElement | null>(null);

  const formatTimeAgo = (iso?: string) => {
    if (!iso) return "";
    const ms = now - new Date(iso).getTime();
    const seconds = Math.max(0, Math.floor(ms / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  const formatUptime = (startedAt?: string) => {
    if (!startedAt) return "";
    const ms = now - new Date(startedAt).getTime();
    const minutes = Math.max(0, Math.floor(ms / 60000));
    const hours = Math.floor(minutes / 60);
    const remainingMins = minutes % 60;
    
    if (hours > 0) return `${hours}h ${remainingMins}m`;
    return `${minutes}m`;
  };

  const formatCompactViewers = (count: number) => {
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toLocaleString();
  };

  const cacheBuster = String(imageBuster);
  const withCacheBuster = (url: string) => {
    if (!cacheBuster) return url;
    return url.includes("?") ? `${url}&t=${cacheBuster}` : `${url}?t=${cacheBuster}`;
  };

  const bumpThumbRetry = (channel: string) => {
    const key = channel.toLowerCase();
    setThumbRetriesByChannel((prev) => {
      const current = prev[key] ?? 0;
      if (current >= 2) return prev;
      return { ...prev, [key]: current + 1 };
    });
  };

  const getThumbSrc = (channel: string, url: string) => {
    const key = channel.toLowerCase();
    const retry = thumbRetriesByChannel[key] ?? 0;
    const base = withCacheBuster(url);
    if (retry <= 0) return base;
    return base.includes("?") ? `${base}&r=${retry}` : `${base}?r=${retry}`;
  };

  const podiumRankByChannel = useMemo(() => {
    const rankMap = new Map<string, 1 | 2 | 3>();
    if (!data?.streams || data.streams.length === 0) return rankMap;

    const top = [...data.streams].sort((a, b) => b.viewerCount - a.viewerCount).slice(0, 3);
    top.forEach((s, idx) => {
      const rank = (idx + 1) as 1 | 2 | 3;
      rankMap.set(s.channel.toLowerCase(), rank);
    });

    return rankMap;
  }, [data?.streams]);

  const fetchStreams = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setErrorMessage(null);
    try {
      const fetchPair = async (suffix = "") => {
        const [streamsRes, featuredRes] = await Promise.all([
          fetch(`/api/streams${suffix}`, { cache: "no-store" }),
          fetch(`/api/featured-streams${suffix}`, { cache: "no-store" }),
        ]);

        const streamsJson = (await streamsRes.json()) as StreamsResponse;
        if (!streamsRes.ok) throw new Error(streamsJson.error || "Failed to fetch");

        let featuredJson: FeaturedResponse | null = null;
        try {
          const parsed = (await featuredRes.json()) as FeaturedResponse;
          if (featuredRes.ok && Array.isArray(parsed.cards)) {
            featuredJson = parsed;
          }
        } catch {
          featuredJson = null;
        }

        return { streamsJson, featuredJson };
      };

      let { streamsJson, featuredJson } = await fetchPair();

      const generatedAtMs = Date.parse(String(streamsJson.generatedAt || ""));
      const ageMs = Number.isFinite(generatedAtMs) ? Date.now() - generatedAtMs : Number.POSITIVE_INFINITY;
      if (ageMs > 2 * 60 * 1000) {
        const bust = `?t=${Date.now()}`;
        ({ streamsJson, featuredJson } = await fetchPair(bust));
      }

      const nextData = streamsJson as StreamsResponse;

      setData(nextData);
      lastGoodDataRef.current = nextData;
      setSecondsUntilRefresh(60);
      setImageBuster(Date.now());

      setFeatured(featuredJson);

      if (nextData.stats) {
        const viewers = formatCompactViewers(nextData.stats.totalViewers);
        document.title = `${nextData.stats.liveStreams} Live Keizaal RP Streams - ${viewers} Viewers | Keizaal Live`;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch streams";
      setErrorMessage(message);

      if (!lastGoodDataRef.current) {
        setData({
          generatedAt: new Date().toISOString(),
          stats: { liveStreams: 0, totalViewers: 0 },
          streams: [],
          error: message,
        });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  fetchStreamsRef.current = fetchStreams;

  useEffect(() => {
    void fetchStreamsRef.current();
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
      setSecondsUntilRefresh((prev) => {
        if (!autoRefreshEnabled) return prev;
        if (prev <= 1) {
          void fetchStreamsRef.current(true);
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(id);
  }, [autoRefreshEnabled]);

  return (
    <main className="min-h-screen bg-keizaal-bg text-zinc-100 flex flex-col font-sans">
      <header className="border-b border-zinc-800 bg-keizaal-bg/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image 
              src="/logo.png" 
              alt="Keizaal Logo" 
              width={32} 
              height={32} 
              className="object-contain"
            />
            <h1 className="text-2xl font-bold tracking-widest text-white font-[family-name:var(--font-cinzel)] pt-1">
              KEIZAAL <span className="text-keizaal-accent">LIVE</span>
            </h1>
          </div>
          <nav className="flex items-center gap-4 sm:gap-6 text-sm font-medium">
            <Link
              href="/"
              className="text-white transition-colors hidden sm:inline-block"
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
              className="text-zinc-400 hover:text-white transition-colors hidden sm:inline-block"
              onClick={() => track("Nav_Click", { destination: "streamers" })}
            >
              Streamers
            </Link>
            <a
              href="https://keizaal.com"
              target="_blank"
              rel="noreferrer"
              className="text-zinc-400 hover:text-white transition-colors hidden sm:inline-block"
              onClick={() => track("Outbound_Click", { target: "keizaal", page: "home" })}
            >
              Keizaal Online
            </a>
            <a
              href="https://discord.gg/zzCQ45nzyz"
              target="_blank"
              rel="noreferrer"
              className="text-zinc-400 hover:text-white transition-colors"
              onClick={() => track("Outbound_Click", { target: "discord", page: "home" })}
            >
              Official Discord
            </a>
          </nav>
        </div>
      </header>

      <div className="sticky top-16 z-40 bg-keizaal-bg/95 backdrop-blur-md border-b border-zinc-800/50 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3">
            {errorMessage ? (
              <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-300">
                Having trouble reaching Twitch right now. Try again in a moment.
              </div>
            ) : null}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-keizaal-card p-4 rounded-xl border border-zinc-800/50 shadow-lg">
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-3">
                <Radio className="w-7 h-7 text-red-500" />
                <div>
                  <div className="text-2xl font-bold leading-none">{data?.stats?.liveStreams || 0}</div>
                  <div className="text-xs text-zinc-400 font-semibold tracking-wider uppercase mt-1">Live Streams</div>
                </div>
              </div>
              <div className="w-px h-10 bg-zinc-800 hidden sm:block"></div>
              <div className="flex items-center gap-3">
                <Users className="w-7 h-7 text-keizaal-accent" />
                <div>
                  <div className="text-2xl font-bold leading-none">{data?.stats?.totalViewers?.toLocaleString() || 0}</div>
                  <div className="text-xs text-zinc-400 font-semibold tracking-wider uppercase mt-1">Total Viewers</div>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3 justify-between sm:justify-end flex-wrap">
              {data?.generatedAt && !autoRefreshEnabled ? (
                <span className="text-xs text-zinc-500">
                  Last checked {formatTimeAgo(data.generatedAt)}
                </span>
              ) : null}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAutoRefreshEnabled((v) => !v);
                    if (!autoRefreshEnabled) setSecondsUntilRefresh(60);
                  }}
                  title={autoRefreshEnabled ? "Pause auto-refresh" : "Enable auto-refresh"}
                  className="flex items-center justify-center w-9 h-9 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
                >
                  {autoRefreshEnabled ? <Pause className="w-4 h-4" fill="currentColor" /> : <Play className="w-4 h-4" fill="currentColor" />}
                </button>

                <button
                  onClick={() => fetchStreams(true)}
                  disabled={loading || refreshing}
                  className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-[170px] justify-center"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-keizaal-accent" : ""}`} />
                  Refresh{" "}
                  <span
                    className={`inline-block w-[52px] text-right tabular-nums ${
                      autoRefreshEnabled && !loading && !refreshing ? "opacity-100" : "opacity-0"
                    }`}
                  >
                    ({String(secondsUntilRefresh).padStart(2, "0")}s)
                  </span>
                </button>
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-grow flex flex-col">
        {featured?.cards && featured.cards.length > 0 && data?.streams && data.streams.length > 0 ? (
          <section className="mb-10">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-lg font-bold tracking-wider text-zinc-200 uppercase">Growing</h2>
              <div className="text-xs text-zinc-500">{featured.generatedAt ? `Updated ${formatTimeAgo(featured.generatedAt)}` : null}</div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {featured.cards.slice(0, 3).map((card) => {
                const stream = card.stream;
                const growthPct = Number(card.growthPct5m || 0);
                const growthFixed = growthPct < 10 ? growthPct.toFixed(1) : growthPct.toFixed(0);
                const growthText = growthPct > 0 ? `+${growthFixed}% (5m)` : null;
                return (
                  <a
                    key={`featured-${stream.channel}`}
                    href={stream.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex flex-col bg-keizaal-card rounded-xl overflow-hidden border border-zinc-800/50 hover:border-zinc-700 transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-keizaal-accent/10"
                    onClick={() =>
                      track("Stream_Open", {
                        source: "featured_section",
                        channel: stream.channel,
                        viewers: stream.viewerCount,
                        growthPct5m: Number.isFinite(growthPct) ? growthPct : 0,
                        section: "Going Viral",
                        isBreakout: Boolean(card.isBreakout),
                      })
                    }
                  >
                    <div className="relative aspect-video bg-zinc-900">
                      {stream.thumbnailUrl && (thumbRetriesByChannel[stream.channel.toLowerCase()] ?? 0) < 2 ? (
                        <Image
                          src={getThumbSrc(stream.channel, stream.thumbnailUrl)}
                          alt={stream.title}
                          fill
                          sizes="(min-width: 1024px) 33vw, 100vw"
                          className="object-cover group-hover:scale-105 transition-transform duration-500"
                          unoptimized
                          onError={() => bumpThumbRetry(stream.channel)}
                        />
                      ) : null}
                      {card.isBreakout ? (
                        <div className="absolute top-3 right-3">
                          <span className="bg-black/60 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded tracking-wider uppercase shadow-md">
                            Breakout
                          </span>
                        </div>
                      ) : null}
                      <div className="absolute top-3 left-3 flex flex-col gap-2 items-start">
                        <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded tracking-wider uppercase shadow-md flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                          Live
                        </span>
                        {growthText ? (
                          <span className="bg-keizaal-accent text-black text-[10px] font-bold px-2 py-1 rounded tracking-wider uppercase shadow-md flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" />
                            {growthText}
                          </span>
                        ) : null}
                      </div>
                      <div className="absolute bottom-3 left-3">
                        <span className="bg-black/60 backdrop-blur-md text-white text-xs font-semibold px-2 py-1 rounded shadow-md flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5" />
                          {stream.viewerCount.toLocaleString()}
                        </span>
                      </div>
                      {stream.startedAt ? (
                        <div className="absolute bottom-3 right-3">
                          <span className="bg-black/60 backdrop-blur-md text-white text-xs font-semibold px-2 py-1 rounded shadow-md flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" />
                            {formatUptime(stream.startedAt)}
                          </span>
                        </div>
                      ) : null}
                    </div>
                    <div className="p-4 flex gap-3">
                      <div className="flex-shrink-0">
                        {stream.profileImageUrl ? (
                          <Image
                            src={stream.profileImageUrl}
                            alt={stream.displayName}
                            width={40}
                            height={40}
                            className="rounded-full ring-2 ring-zinc-800"
                            unoptimized
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-zinc-800" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3
                          className="font-bold text-white truncate group-hover:text-keizaal-accent transition-colors"
                          title={stream.displayName}
                        >
                          {stream.displayName}
                        </h3>
                        <p className="text-sm text-zinc-400 line-clamp-2 mt-0.5 leading-snug" title={stream.title}>
                          {stream.title}
                        </p>
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          </section>
        ) : null}

        {loading && !data ? (
          <div className="flex-grow flex items-center justify-center">
            <RefreshCw className="w-8 h-8 animate-spin text-keizaal-accent" />
          </div>
        ) : data?.streams && data.streams.length > 0 ? (
          <>
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-lg font-bold tracking-wider text-zinc-200 uppercase">Live Now</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
              {data.streams.map((stream) => {
                const podiumRank = podiumRankByChannel.get(stream.channel.toLowerCase()) || 0;
                const isGold = podiumRank === 1;
                const isSilver = podiumRank === 2;
                const isBronze = podiumRank === 3;

                const cardClassName = `group flex flex-col bg-keizaal-card rounded-xl overflow-hidden border transition-all hover:-translate-y-1 hover:shadow-2xl ${
                  isGold
                    ? "border-amber-500/50 hover:border-amber-500 shadow-amber-500/10"
                    : isSilver
                      ? "border-zinc-200/50 hover:border-zinc-200 shadow-zinc-200/10"
                      : isBronze
                        ? "border-[#cd7f32]/50 hover:border-[#cd7f32] shadow-[#cd7f32]/10"
                        : "border-zinc-800/50 hover:border-zinc-700 hover:shadow-keizaal-accent/10"
                }`;

                const avatarClassName = `rounded-full ring-2 ${
                  isGold
                    ? "ring-amber-500"
                    : isSilver
                      ? "ring-zinc-200"
                      : isBronze
                        ? "ring-[#cd7f32]"
                        : "ring-zinc-800"
                }`;

                const avatarPlaceholderClassName = `w-10 h-10 rounded-full ${
                  isGold
                    ? "bg-amber-500/20 ring-2 ring-amber-500"
                    : isSilver
                      ? "bg-zinc-200/10 ring-2 ring-zinc-200"
                      : isBronze
                        ? "bg-[#cd7f32]/10 ring-2 ring-[#cd7f32]"
                        : "bg-zinc-800"
                }`;

                return (
                  <a
                    key={stream.channel}
                    href={stream.url}
                    target="_blank"
                    rel="noreferrer"
                    className={cardClassName}
                    onClick={() =>
                      track("Stream_Open", {
                        source: "live_streams_page",
                        channel: stream.channel,
                        rank: isGold ? "gold" : isSilver ? "silver" : isBronze ? "bronze" : "none",
                        viewers: stream.viewerCount,
                      })
                    }
                  >
                    <div className="relative aspect-video bg-zinc-900">
                      {stream.thumbnailUrl && (thumbRetriesByChannel[stream.channel.toLowerCase()] ?? 0) < 2 ? (
                        <Image
                          src={getThumbSrc(stream.channel, stream.thumbnailUrl)}
                          alt={stream.title}
                          fill
                          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                          className="object-cover group-hover:scale-105 transition-transform duration-500"
                          unoptimized
                          onError={() => bumpThumbRetry(stream.channel)}
                        />
                      ) : null}
                      <div className="absolute top-3 left-3 flex flex-col gap-2 items-start">
                        <div className="flex items-center gap-2">
                          <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded tracking-wider uppercase shadow-md flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
                            Live
                          </span>
                        </div>
                        {isGold && (
                          <span className="bg-amber-500 text-black text-[10px] font-bold px-2 py-1 rounded tracking-wider uppercase shadow-md flex items-center gap-1">
                            <Flame className="w-3 h-3" />
                            Top Stream
                          </span>
                        )}
                        {isSilver && (
                          <span className="bg-zinc-200 text-black text-[10px] font-bold px-2 py-1 rounded tracking-wider uppercase shadow-md flex items-center gap-1">
                            <Flame className="w-3 h-3" />
                            Top Stream
                          </span>
                        )}
                        {isBronze && (
                          <span className="bg-[#cd7f32] text-black text-[10px] font-bold px-2 py-1 rounded tracking-wider uppercase shadow-md flex items-center gap-1">
                            <Flame className="w-3 h-3" />
                            Top Stream
                          </span>
                        )}
                      </div>
                      <div className="absolute bottom-3 left-3">
                        <span className="bg-black/60 backdrop-blur-md text-white text-xs font-semibold px-2 py-1 rounded shadow-md flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5" />
                          {stream.viewerCount.toLocaleString()}
                        </span>
                      </div>
                      {stream.startedAt ? (
                        <div className="absolute bottom-3 right-3">
                          <span className="bg-black/60 backdrop-blur-md text-white text-xs font-semibold px-2 py-1 rounded shadow-md flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" />
                            {formatUptime(stream.startedAt)}
                          </span>
                        </div>
                      ) : null}
                    </div>

                    <div className="p-4 flex gap-3">
                      <div className="flex-shrink-0">
                        {stream.profileImageUrl ? (
                          <Image
                            src={stream.profileImageUrl}
                            alt={stream.displayName}
                            width={40}
                            height={40}
                            className={avatarClassName}
                            unoptimized
                          />
                        ) : (
                          <div className={avatarPlaceholderClassName}></div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h2 className="font-bold text-white truncate group-hover:text-keizaal-accent transition-colors" title={stream.displayName}>
                            {stream.displayName}
                          </h2>
                        </div>
                        <p className="text-sm text-zinc-400 line-clamp-2 mt-0.5 leading-snug" title={stream.title}>
                          {stream.title}
                        </p>
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          </>
        ) : (
          <div className="flex-grow flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 bg-zinc-800/50 rounded-full flex items-center justify-center mb-4">
              <Radio className="w-8 h-8 text-zinc-500" />
            </div>
            <h2 className="text-xl font-bold text-zinc-300 mb-2">
              {errorMessage || data?.error ? "Couldn't load streams" : "No streams are live"}
            </h2>
            <p className="text-zinc-500 max-w-md">
              {errorMessage || data?.error
                ? "Something went wrong while checking Twitch. Try Refresh, or check back in a minute."
                : "There are currently no Keizaal RP streams live on Twitch right now."}
            </p>
            {data?.generatedAt ? (
              <p className="text-zinc-600 text-sm mt-3">
                Last checked {formatTimeAgo(data.generatedAt)}
              </p>
            ) : null}
            <div className="flex items-center gap-3 mt-6">
              <button
                type="button"
                onClick={() => fetchStreams(true)}
                disabled={loading || refreshing}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-keizaal-accent" : ""}`} />
                Refresh
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowHowTo(true);
                  window.setTimeout(() => {
                    howToRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }, 0);
                }}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-sm font-medium rounded-lg transition-colors"
              >
                How to get featured
              </button>
            </div>
          </div>
        )}

        <div ref={howToRef} className="mt-auto border border-zinc-800 rounded-xl overflow-hidden bg-keizaal-card">
          <button 
            onClick={() => setShowHowTo(!showHowTo)}
            className="w-full flex items-center justify-between p-4 sm:p-5 text-left hover:bg-zinc-800/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Info className="w-5 h-5 text-keizaal-accent" />
              <h3 className="font-semibold text-zinc-200">How to Get Featured on This Site</h3>
            </div>
            {showHowTo ? <ChevronUp className="w-5 h-5 text-zinc-500" /> : <ChevronDown className="w-5 h-5 text-zinc-500" />}
          </button>
          
          {showHowTo && (
            <div className="p-4 sm:p-5 border-t border-zinc-800 text-sm text-zinc-400 leading-relaxed bg-zinc-900/30">
              <p className="mb-4">
                To get featured on this site, your stream must be in the <strong className="text-zinc-200">The Elder Scrolls V: Skyrim</strong> category on Twitch and include one of these tags or terms in your stream title &mdash; capitalization does not matter:
              </p>
              <div className="flex flex-wrap gap-2 mb-4">
                {[
                  'keizaal', 'keizaal rp', 'keizaal roleplay', 'keizaalrp', 'keizaalroleplay', 
                  'keizaal-rp', 'keizaal-roleplay', '#keizaal', '#keizaalrp', '!keizaal', 
                  '!keizaalrp', 'keizaal_rp', 'keizaal_roleplay', 'keizaal.live',
                  'skyrim rp', 'skyrim roleplay', 'skyrimrp', 'skyrimroleplay',
                  'skyrim-rp', 'skyrim-roleplay', '#skyrimrp', '!skyrimrp',
                  'skyrim_rp', 'skyrim_roleplay'
                ].map(term => (
                  <code key={term} className="bg-zinc-800 text-zinc-300 px-2 py-1 rounded text-xs">
                    {term}
                  </code>
                ))}
              </div>
              <p>
                Streams are automatically detected and updated. If you meet these requirements and are live, your stream should appear within a few minutes.
              </p>
            </div>
          )}
        </div>
      </div>

      <footer className="border-t border-zinc-800 bg-black mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="mb-12 flex flex-col gap-4">
            <h2 className="text-xl font-bold tracking-widest text-zinc-300 font-[family-name:var(--font-cinzel)] uppercase">
              KEIZAAL <span className="text-keizaal-accent">LIVE</span>
            </h2>
            <p className="text-zinc-500 text-sm max-w-xl leading-relaxed">
              Not affiliated with Keizaal Online, Bethesda Softworks or Zenimax Media. The Elder Scrolls&reg; and Skyrim&reg; are registered trademarks of their respective owners. The Keizaal Online logo belongs to its respective owners.
            </p>
            <p className="text-zinc-600 text-xs max-w-xl leading-relaxed">
              How it works: this site automatically lists live Twitch streams in Skyrim categories when their titles include Keizaal / Skyrim RP terms. Updated every 60 seconds.
            </p>
          </div>
          
          <div className="pt-8 border-t border-zinc-800 flex items-center justify-center text-xs text-zinc-500">
            <p>
              &copy; 2026 Keizaal Online. All rights reserved. Made by <a href="https://twitch.tv/its_teewee" target="_blank" rel="noreferrer" className="text-zinc-400 hover:text-keizaal-accent transition-colors underline underline-offset-4">teewee</a>
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
