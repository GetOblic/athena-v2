import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";
import { LICENSEE_ORIGIN_COOKIE } from "@/services/licensee/licenseeCookieNames";

export { LICENSEE_ORIGIN_COOKIE };

const ORIGIN_TTL_SECONDS = 60 * 60 * 8; // 8 hours — session handoff window only

export type LicenseeOriginPayload = {
  v: 1;
  masterUserId: string;
  licenseeAccountId: string;
  organizationId: string;
  iat: number;
  exp: number;
};

function getHandoffSigningSecret(): string {
  const dedicated = process.env.ATHENA_LICENSEE_HANDOFF_SECRET?.trim();
  if (dedicated) {
    return dedicated;
  }

  // Dev/spike fallback only — full implementation should set a dedicated secret.
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (serviceRole && process.env.NODE_ENV !== "production") {
    return `athena-licensee-handoff:${serviceRole}`;
  }

  throw new Error("Missing ATHENA_LICENSEE_HANDOFF_SECRET.");
}

function toBase64Url(value: string | Buffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string): Buffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + "=".repeat(padLength), "base64");
}

function signPayload(encodedPayload: string): string {
  return toBase64Url(
    createHmac("sha256", getHandoffSigningSecret())
      .update(encodedPayload)
      .digest(),
  );
}

export function buildLicenseeOriginCookieValue(input: {
  masterUserId: string;
  licenseeAccountId: string;
  organizationId: string;
  nowMs?: number;
}): string {
  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  const payload: LicenseeOriginPayload = {
    v: 1,
    masterUserId: input.masterUserId,
    licenseeAccountId: input.licenseeAccountId,
    organizationId: input.organizationId,
    iat: nowSeconds,
    exp: nowSeconds + ORIGIN_TTL_SECONDS,
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

export function parseLicenseeOriginCookieValue(
  cookieValue: string | undefined | null,
): LicenseeOriginPayload | null {
  if (!cookieValue) {
    return null;
  }

  const [encodedPayload, signature] = cookieValue.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expected = signPayload(encodedPayload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      fromBase64Url(encodedPayload).toString("utf8"),
    ) as LicenseeOriginPayload;

    if (
      payload.v !== 1 ||
      typeof payload.masterUserId !== "string" ||
      typeof payload.licenseeAccountId !== "string" ||
      typeof payload.organizationId !== "string" ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }

    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function applyLicenseeOriginCookie(
  response: NextResponse,
  cookieValue: string,
): void {
  response.cookies.set(LICENSEE_ORIGIN_COOKIE, cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ORIGIN_TTL_SECONDS,
  });
}

export function clearLicenseeOriginCookie(response: NextResponse): void {
  response.cookies.set(LICENSEE_ORIGIN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
