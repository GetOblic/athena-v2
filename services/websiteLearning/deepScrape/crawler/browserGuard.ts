/**
 * Playwright request interception for SSRF and resource blocking.
 */

import { isIP } from "node:net";
import type { Page } from "playwright";
import {
  assertPublicHostname,
  isSameRegistrableDomain,
  normalizeIpLiteral,
} from "@/services/websiteLearning/deepScrape/urlSafety";

const BLOCKED_RESOURCE_TYPES = new Set([
  "image",
  "media",
  "font",
  "websocket",
  "manifest",
  "texttrack",
  "eventsource",
]);

const TRACKING_HOST_RE =
  /(google-analytics|googletagmanager|doubleclick|facebook\.net|hotjar|segment\.io|mixpanel|newrelic|sentry\.io|clarity\.ms|adservice|adnxs|taboola|outbrain)/i;

function isBlockedScheme(url: string): boolean {
  return /^(file|data|blob|javascript|about):/i.test(url);
}

export async function isNavigationTargetAllowed(
  url: string,
  registrableDomain: string,
): Promise<{ allowed: boolean; reason?: string }> {
  if (isBlockedScheme(url)) {
    return { allowed: false, reason: "BLOCKED_SCHEME" };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, reason: "INVALID_URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { allowed: false, reason: "BLOCKED_SCHEME" };
  }
  if (!isSameRegistrableDomain(url, registrableDomain)) {
    return { allowed: false, reason: "CROSS_DOMAIN_REJECTED" };
  }
  const host = parsed.hostname;
  if (isIP(host) || normalizeIpLiteral(host)) {
    return { allowed: false, reason: "IP_LITERAL_REJECTED" };
  }
  try {
    await assertPublicHostname(host, { fetchPurpose: "page" });
  } catch (error) {
    return {
      allowed: false,
      reason: error instanceof Error ? error.message : "PRIVATE_IP_REJECTED",
    };
  }
  return { allowed: true };
}

async function hostIsPublic(hostname: string): Promise<boolean> {
  if (!hostname) return false;
  if (isIP(hostname) || normalizeIpLiteral(hostname)) return false;
  try {
    await assertPublicHostname(hostname, { fetchPurpose: "page" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Install route guards:
 * - validate every host (no private/protected addresses)
 * - block media/fonts/websockets/tracking
 * - block external document/iframe navigations
 * - allow same-domain + public CDN scripts/XHR needed for rendering
 */
export async function installPlaywrightSecurityRoutes(
  page: Page,
  registrableDomain: string,
): Promise<void> {
  const publicHostCache = new Map<string, boolean>();

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = request.url();
    const resourceType = request.resourceType();

    if (isBlockedScheme(url)) {
      await route.abort("blockedbyclient");
      return;
    }

    if (BLOCKED_RESOURCE_TYPES.has(resourceType)) {
      await route.abort("blockedbyclient");
      return;
    }

    // Stylesheets usually unnecessary for text extraction.
    if (resourceType === "stylesheet") {
      await route.abort("blockedbyclient");
      return;
    }

    let hostname = "";
    try {
      hostname = new URL(url).hostname;
    } catch {
      await route.abort("blockedbyclient");
      return;
    }

    if (TRACKING_HOST_RE.test(hostname)) {
      await route.abort("blockedbyclient");
      return;
    }

    let publicHost = publicHostCache.get(hostname);
    if (publicHost === undefined) {
      publicHost = await hostIsPublic(hostname);
      publicHostCache.set(hostname, publicHost);
    }
    if (!publicHost) {
      await route.abort("blockedbyclient");
      return;
    }

    const sameDomain = isSameRegistrableDomain(url, registrableDomain);
    if (
      (resourceType === "document" ||
        resourceType === "iframe" ||
        request.isNavigationRequest()) &&
      !sameDomain
    ) {
      await route.abort("blockedbyclient");
      return;
    }

    await route.continue();
  });

  page.on("download", async (download) => {
    try {
      await download.cancel();
    } catch {
      // ignore
    }
  });
}
