import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stats",
  description:
    "Keizaal RP (Skyrim roleplay) Twitch stats over time: total live streams and total viewers, with peaks and averages.",
  alternates: {
    canonical: "https://keizaal.live/stats",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

