"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { RefreshCw, Users, Radio, Info, ChevronDown, ChevronUp } from "lucide-react";

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

export default function Home() {
  const [data, setData] = useState<StreamsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);

  const fetchStreams = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch("/api/streams", {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to fetch");
      setData(json);
    } catch (err) {
      setData({
        generatedAt: new Date().toISOString(),
        stats: { liveStreams: 0, totalViewers: 0 },
        streams: [],
        error: err instanceof Error ? err.message : "Failed to fetch",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStreams();
  }, []);

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

      {/* Sticky Stats Bar */}
      <div className="sticky top-16 z-40 bg-keizaal-bg/95 backdrop-blur-md border-b border-zinc-800/50 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-keizaal-card p-4 rounded-xl border border-zinc-800/50 shadow-lg">
            <div className="flex items-center gap-6">
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
            
            <div className="flex items-center gap-4 justify-between sm:justify-end">
              {data?.generatedAt && (
                <span className="text-xs text-zinc-500 hidden sm:inline-block">
                  Updated {new Date(data.generatedAt).toLocaleTimeString()}
                </span>
              )}
              <button
                onClick={() => fetchStreams(true)}
                disabled={loading || refreshing}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-keizaal-accent" : ""}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-grow flex flex-col">
        {loading && !data ? (
          <div className="flex-grow flex items-center justify-center">
            <RefreshCw className="w-8 h-8 animate-spin text-keizaal-accent" />
          </div>
        ) : data?.streams && data.streams.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {data.streams.map((stream) => (
              <a
                key={stream.channel}
                href={stream.url}
                target="_blank"
                rel="noreferrer"
                className="group flex flex-col bg-keizaal-card rounded-xl overflow-hidden border border-zinc-800/50 hover:border-zinc-700 transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-keizaal-accent/10"
              >
                <div className="relative aspect-video bg-zinc-900">
                  {stream.thumbnailUrl ? (
                    <Image
                      src={stream.thumbnailUrl}
                      alt={stream.title}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : null}
                  <div className="absolute top-3 left-3 flex items-center gap-2">
                    <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded tracking-wider uppercase shadow-md flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
                      Live
                    </span>
                    <span className="bg-black/60 backdrop-blur-md text-white text-xs font-semibold px-2 py-1 rounded shadow-md flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      {stream.viewerCount.toLocaleString()}
                    </span>
                  </div>
                  {stream.platform === "twitch" && (
                    <div className="absolute top-3 right-3 bg-[#9146ff] text-white text-[10px] font-bold px-2 py-1 rounded tracking-wider uppercase shadow-md">
                      Twitch
                    </div>
                  )}
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
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-zinc-800"></div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-bold text-white truncate group-hover:text-keizaal-accent transition-colors" title={stream.displayName}>
                      {stream.displayName}
                    </h2>
                    <p className="text-sm text-zinc-400 line-clamp-2 mt-0.5 leading-snug" title={stream.title}>
                      {stream.title}
                    </p>
                  </div>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="flex-grow flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 bg-zinc-800/50 rounded-full flex items-center justify-center mb-4">
              <Radio className="w-8 h-8 text-zinc-500" />
            </div>
            <h2 className="text-xl font-bold text-zinc-300 mb-2">
              {data?.error ? "Couldn't load streams" : "No streams are live"}
            </h2>
            <p className="text-zinc-500 max-w-md">
              {data?.error
                ? data.error
                : "There are currently no Keizaal RP streams live on Twitch right now."}
            </p>
          </div>
        )}

        <div className="mt-auto border border-zinc-800 rounded-xl overflow-hidden bg-keizaal-card">
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

      {/* Footer */}
      <footer className="border-t border-zinc-800 bg-black mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="mb-12 flex flex-col gap-4">
            <h2 className="text-xl font-bold tracking-widest text-zinc-300 font-[family-name:var(--font-cinzel)] uppercase">
              KEIZAAL <span className="text-keizaal-accent">LIVE</span>
            </h2>
            <p className="text-zinc-500 text-sm max-w-xl leading-relaxed">
              Not affiliated with Keizaal Online, Bethesda Softworks or Zenimax Media. The Elder Scrolls&reg; and Skyrim&reg; are registered trademarks of their respective owners. The Keizaal Online logo belongs to its respective owners.
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
