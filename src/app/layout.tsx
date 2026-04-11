import type { Metadata } from "next";
import { Geist, Geist_Mono, Cinzel } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

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
    default: "Keizaal Live Streams | Skyrim Roleplay Directory",
    template: "%s | Keizaal Live"
  },
  description: "Discover live streams of The Elder Scrolls V: Skyrim on the Keizaal roleplay server. See who is live, check viewer counts, and jump into the best Skyrim RP action on Twitch.",
  keywords: [
    "Keizaal", "Keizaal RP", "Skyrim RP", "Skyrim Roleplay", 
    "Keizaal Online", "Elder Scrolls V", "Twitch Directory", 
    "Live Streams", "Skyrim Multiplayer"
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
        <Script id="ms-clarity" strategy="beforeInteractive">
          {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window, document, "clarity", "script", "wa954bktem");`}
        </Script>
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
