import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Top Clips",
  description:
    "Top Keizaal RP / Skyrim roleplay Twitch clips. Browse the best moments from Keizaal streams across multiple time ranges.",
  alternates: {
    canonical: "https://keizaal.live/clips",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

