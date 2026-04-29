import type { Metadata } from "next";
import { Geist, Geist_Mono, Cinzel } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import AnalyticsConsent from "./components/AnalyticsConsent";
import "./globals.css";

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "G-XS8B8JEC9T";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://keizaal.live"),
  title: {
    default: "Keizaal Live | Keizaal RP Skyrim Twitch Streams & Stats",
    template: "%s | Keizaal Live"
  },
  description: "Live Twitch directory for Keizaal RP (Skyrim roleplay). See who's live now, fastest growing streams, top streamers by peak viewers, and viewer/stream stats over time.",
  icons: {
    icon: [{ url: "/logo.png", type: "image/png" }],
    shortcut: [{ url: "/logo.png", type: "image/png" }],
    apple: [{ url: "/logo.png", type: "image/png" }],
  },
  keywords: [
    "Keizaal",
    "Keizaal RP",
    "Keizaal roleplay",
    "Keizaal Online",
    "Skyrim RP",
    "Skyrim roleplay",
    "Skyrim RP Twitch",
    "Skyrim Twitch streams",
    "Keizaal Twitch streams",
    "Roleplay Twitch streams",
    "The Elder Scrolls V: Skyrim",
    "Twitch directory",
    "Live streams",
    "Stream stats",
  ],
  authors: [{ name: "teewee", url: "https://twitch.tv/its_teewee" }],
  creator: "teewee",
  publisher: "Keizaal Live",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: "https://keizaal.live",
  },
  openGraph: {
    title: "Keizaal Live Streams | Skyrim RP Directory",
    description: "Discover live streams of The Elder Scrolls V: Skyrim on the Keizaal roleplay server. See who is live, check viewer counts, and jump into the action.",
    url: "https://keizaal.live",
    siteName: "Keizaal Live",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Keizaal Live Streams | Skyrim RP",
    description: "Discover live streams of The Elder Scrolls V: Skyrim on the Keizaal roleplay server. See who is live and jump into the action.",
    creator: "@its_teewee",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${cinzel.variable} h-full antialiased`}
    >
      <head>
        <Script id="google-analytics-consent" strategy="beforeInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent', 'default', {
  ad_storage: 'denied',
  analytics_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied'
});`}
        </Script>
        <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
        <Script id="google-analytics" strategy="afterInteractive">
          {`gtag('js', new Date());
gtag('config', '${GA_MEASUREMENT_ID}', { anonymize_ip: true });`}
        </Script>
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <Analytics />
        <AnalyticsConsent />
      </body>
    </html>
  );
}
