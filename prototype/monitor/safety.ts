import {
  assertPublicHostname,
  canonicalizePageUrl,
  extractRegistrableDomain,
  isSameRegistrableDomain,
  normalizeRootWebsiteUrl,
} from "@/services/websiteLearning/deepScrape/urlSafety";
import {
  isPathAllowedByRobots,
  type RobotsRules,
} from "@/services/websiteLearning/deepScrape/robots";

import type { ExtractionAdapterId } from "./types";

const SUPPORTED: Record<string, ExtractionAdapterId> = {
  "breal.net": "sfra",
  "bonoboplanet.com": "sfra",
  "cache-cache.fr": "sfra",
  "toscane-boutique.fr": "solusquare",
};

/**
 * Paths the public robots files disallow and that this prototype must not request.
 * Applied even when robots.txt itself cannot be fetched.
 */
const HARD_DENY = [
  /\/on\/demandware\.store\//i,
  /product-variation/i,
  /[?&]dwvar_/i,
  /[?&]q=/i,
  /[?&]pid=/i,
  /[?&]cgid=/i,
  /[?&]pmin=/i,
  /[?&]pmax=/i,
  /[?&]prefn\d*=/i,
  /[?&]prefv\d*=/i,
  /[?&]variantid=/i,
  /\/e_commerce\/xml\//i,
  /\+/,
];

export type SupportedTarget = {
  url: string;
  hostname: string;
  registrableDomain: string;
  adapter: ExtractionAdapterId;
};

export function supportedAdapter(hostname: string): ExtractionAdapterId | null {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return SUPPORTED[host] ?? null;
}

export function resolveSupportedTarget(rawUrl: string): SupportedTarget {
  const normalized = normalizeRootWebsiteUrl(rawUrl);
  if (!normalized) {
    throw new Error("INVALID_URL");
  }
  const parsed = new URL(normalized.url);
  if (parsed.protocol !== "https:") {
    throw new Error("HTTPS_REQUIRED");
  }
  const adapter = supportedAdapter(parsed.hostname);
  if (!adapter) {
    throw new Error("UNSUPPORTED_SITE");
  }
  const registrableDomain = extractRegistrableDomain(parsed.hostname);
  if (!registrableDomain) {
    throw new Error("INVALID_URL");
  }
  return {
    url: canonicalMonitorUrl(parsed.toString()),
    hostname: parsed.hostname.toLowerCase(),
    registrableDomain,
    adapter,
  };
}

export function canonicalMonitorUrl(rawUrl: string): string {
  return canonicalizePageUrl(rawUrl) ?? rawUrl;
}

export function isHardDeniedUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    const path = `${parsed.pathname}${parsed.search}`;
    return HARD_DENY.some((pattern) => pattern.test(path));
  } catch {
    return true;
  }
}

export function isRobotsAllowed(rawUrl: string, rules: RobotsRules | null): boolean {
  if (isHardDeniedUrl(rawUrl)) return false;
  if (!rules?.fetched) return true;
  const parsed = new URL(rawUrl);
  return isPathAllowedByRobots(`${parsed.pathname}${parsed.search}`, rules);
}

export async function assertDocumentAllowed(input: {
  url: string;
  registrableDomain: string;
  robots: RobotsRules | null;
}): Promise<string> {
  const url = canonicalMonitorUrl(input.url);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("INVALID_URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("INVALID_URL");
  }
  if (!isSameRegistrableDomain(url, input.registrableDomain)) {
    throw new Error("CROSS_DOMAIN_REJECTED");
  }
  if (!supportedAdapter(parsed.hostname)) {
    throw new Error("UNSUPPORTED_SITE");
  }
  if (!isRobotsAllowed(url, input.robots)) {
    throw new Error("DISALLOWED_PATH");
  }
  await assertPublicHostname(parsed.hostname);
  return url;
}
