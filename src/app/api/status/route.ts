import { NextResponse } from "next/server";

export const revalidate = 0;

export async function GET() {
  const twitchConfigured = Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);
  const payload = {
    ok: true,
    time: new Date().toISOString(),
    twitch: {
      configured: twitchConfigured,
    },
    uptimeSeconds: typeof process.uptime === "function" ? Math.floor(process.uptime()) : null,
  };

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

