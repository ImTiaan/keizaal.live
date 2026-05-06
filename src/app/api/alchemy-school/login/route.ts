import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createAlchemySchoolCookieValue, getAlchemySchoolCookieName } from "@/lib/alchemySchoolAuth";

function safeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export async function POST(request: Request) {
  try {
    const expected = process.env.ALCHEMY_SCHOOL_PASSWORD || "";
    if (!expected) {
      return NextResponse.json({ error: "Missing ALCHEMY_SCHOOL_PASSWORD" }, { status: 500 });
    }

    const body = (await request.json()) as { password?: string };
    const password = String(body?.password || "");
    if (!safeEqual(password, expected)) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    const cookieName = getAlchemySchoolCookieName();
    const cookieValue = createAlchemySchoolCookieValue();

    const res = NextResponse.json({ ok: true });
    res.cookies.set(cookieName, cookieValue, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/alchemy-school",
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

