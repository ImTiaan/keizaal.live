import { createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "keizaal_alchemy_school";

function getPassword() {
  return process.env.ALCHEMY_SCHOOL_PASSWORD || "";
}

function toBase64Url(input: Buffer) {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(input: string) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  return Buffer.from(padded, "base64");
}

function sign(value: string) {
  const key = getPassword();
  if (!key) throw new Error("Missing ALCHEMY_SCHOOL_PASSWORD");
  return createHmac("sha256", key).update(value).digest();
}

export function getAlchemySchoolCookieName() {
  return COOKIE_NAME;
}

export function createAlchemySchoolCookieValue() {
  const issuedAt = Date.now();
  const payload = `v1.${issuedAt}`;
  const sig = sign(payload);
  return `${payload}.${toBase64Url(sig)}`;
}

export function verifyAlchemySchoolCookieValue(value: string | undefined) {
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const payload = `${parts[0]}.${parts[1]}`;
  const providedSig = parts[2];
  if (!payload.startsWith("v1.")) return false;

  let expected: Buffer;
  try {
    expected = sign(payload);
  } catch {
    return false;
  }

  let provided: Buffer;
  try {
    provided = fromBase64Url(providedSig);
  } catch {
    return false;
  }

  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

