import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.keizaal.live" }],
        destination: "https://keizaal.live/:path*",
        permanent: true,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "static-cdn.jtvnw.net",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "clips-media-assets.twitch.tv",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "clips-media-assets2.twitch.tv",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
