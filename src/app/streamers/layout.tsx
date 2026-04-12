import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Streamers Leaderboard",
  description:
    "Top Keizaal RP / Skyrim roleplay Twitch streamers, sortable by peak viewers or number of streams, across multiple time ranges.",
  alternates: {
    canonical: "https://keizaal.live/streamers",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

