/**
 * Same-origin redirect continuation for the Cheerio deep-scrape path.
 *
 * Athena keeps gotOptions.followRedirect = false for SSRF control. When a ranked
 * candidate receives a same-origin 3xx whose Location canonicalizes to a URL
 * already in the enqueue set (e.g. /products → /products/), we must continue
 * fetching that Location as the same logical candidate instead of terminalizing
 * REDIRECT without ever seeing the final 200.
 *
 * Loop detection uses hop identity that preserves trailing-slash / scheme / host
 * differences. Canonical equivalence alone must not classify /faq → /faq/ as a loop.
 */

import { DEEP_SCRAPE_CRAWL_POLICY } from "@/services/websiteLearning/deepScrape/crawlPolicy";
import {
  assertPublicHostname,
  isSameRegistrableDomain,
  type HostnameSafetyContext,
} from "@/services/websiteLearning/deepScrape/urlSafety";
import { isPathAllowedByRobots, type RobotsRules } from "@/services/websiteLearning/deepScrape/robots";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export type RedirectContinuationOk = {
  ok: true;
  statusCode: number;
  finalUrl: string;
  bodyText: string;
  contentType: string | null;
  redirectCount: number;
  responseBytes: number;
};

export type RedirectContinuationErr = {
  ok: false;
  errorCode:
    | "REDIRECT_MISSING_LOCATION"
    | "CROSS_DOMAIN_REJECTED"
    | "REDIRECT_LOOP"
    | "REDIRECT_DEPTH_EXCEEDED"
    | "ROBOTS_DISALLOWED"
    | "NETWORK_ERROR"
    | "TIMEOUT"
    | "EMPTY_BODY"
    | "UNSUPPORTED_CONTENT_TYPE";
  finalUrl: string;
  redirectCount: number;
  statusCode?: number;
};

export type RedirectContinuationResult =
  | RedirectContinuationOk
  | RedirectContinuationErr;

export type RedirectContinuationDeps = {
  fetchImpl?: typeof fetch;
  assertHostname?: (
    hostname: string,
    context?: HostnameSafetyContext,
  ) => Promise<string[]> | string[];
};

/**
 * Hop identity for redirect-loop detection.
 * Preserves trailing slash, scheme, and host so /faq and /faq/ are distinct hops.
 * Strips only hash + common tracking params (not path shape).
 */
export function redirectHopKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.username = "";
    parsed.password = "";
    parsed.hostname = parsed.hostname.toLowerCase();
    const dropKeys: string[] = [];
    parsed.searchParams.forEach((_value, key) => {
      if (
        /^(utm_|fbclid|gclid|mc_|session|sid|ref)$/i.test(key) ||
        key.toLowerCase().startsWith("utm_")
      ) {
        dropKeys.push(key);
      }
    });
    for (const key of dropKeys) {
      parsed.searchParams.delete(key);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Continue a redirect chain from the first Location after an initial 3xx.
 * `startUrl` is the ranked candidate URL that already returned the first redirect.
 * That first hop counts toward maxRedirectDepth.
 */
export async function continueSameOriginRedirectChain(input: {
  startUrl: string;
  firstLocation: string;
  registrableDomain: string;
  safetyContext: HostnameSafetyContext;
  robotsRules: RobotsRules | null;
  maxRedirects?: number;
  timeoutMs?: number;
  deps?: RedirectContinuationDeps;
}): Promise<RedirectContinuationResult> {
  const maxRedirects =
    input.maxRedirects ?? DEEP_SCRAPE_CRAWL_POLICY.maxRedirectDepth;
  const timeoutMs =
    input.timeoutMs ?? DEEP_SCRAPE_CRAWL_POLICY.perPageTimeoutMs;
  const fetchImpl = input.deps?.fetchImpl ?? fetch;
  const assertHostname = input.deps?.assertHostname ?? assertPublicHostname;

  // Traversed hop identities (request URLs), not slash-collapsed canonicals.
  const visitedHops = new Set<string>([redirectHopKey(input.startUrl)]);

  let currentUrl: string;
  try {
    currentUrl = new URL(input.firstLocation, input.startUrl).toString();
  } catch {
    return {
      ok: false,
      errorCode: "REDIRECT_MISSING_LOCATION",
      finalUrl: input.startUrl,
      redirectCount: 1,
    };
  }

  // First hop already consumed by the Cheerio response that handed us Location.
  let redirectCount = 1;

  while (true) {
    if (redirectCount > maxRedirects) {
      return {
        ok: false,
        errorCode: "REDIRECT_DEPTH_EXCEEDED",
        finalUrl: currentUrl,
        redirectCount,
      };
    }

    const currentHop = redirectHopKey(currentUrl);
    if (visitedHops.has(currentHop)) {
      return {
        ok: false,
        errorCode: "REDIRECT_LOOP",
        finalUrl: currentUrl,
        redirectCount,
      };
    }
    visitedHops.add(currentHop);

    if (!isSameRegistrableDomain(currentUrl, input.registrableDomain)) {
      return {
        ok: false,
        errorCode: "CROSS_DOMAIN_REJECTED",
        finalUrl: currentUrl,
        redirectCount,
      };
    }

    try {
      await assertHostname(new URL(currentUrl).hostname, {
        ...input.safetyContext,
        redirectDepth: redirectCount,
      });
    } catch {
      return {
        ok: false,
        errorCode: "CROSS_DOMAIN_REJECTED",
        finalUrl: currentUrl,
        redirectCount,
      };
    }

    if (
      input.robotsRules &&
      !isPathAllowedByRobots(new URL(currentUrl).pathname, input.robotsRules)
    ) {
      return {
        ok: false,
        errorCode: "ROBOTS_DISALLOWED",
        finalUrl: currentUrl,
        redirectCount,
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(currentUrl, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": DEEP_SCRAPE_CRAWL_POLICY.userAgent,
          Accept: "text/html,application/xhtml+xml",
        },
      });
    } catch (err) {
      clearTimeout(timer);
      const aborted =
        err instanceof Error &&
        (err.name === "AbortError" || /aborted|timeout/i.test(err.message));
      return {
        ok: false,
        errorCode: aborted ? "TIMEOUT" : "NETWORK_ERROR",
        finalUrl: currentUrl,
        redirectCount,
      };
    } finally {
      clearTimeout(timer);
    }

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        return {
          ok: false,
          errorCode: "REDIRECT_MISSING_LOCATION",
          finalUrl: currentUrl,
          redirectCount,
          statusCode: response.status,
        };
      }

      let nextUrl: string;
      try {
        nextUrl = new URL(location, currentUrl).toString();
      } catch {
        return {
          ok: false,
          errorCode: "REDIRECT_MISSING_LOCATION",
          finalUrl: currentUrl,
          redirectCount,
          statusCode: response.status,
        };
      }

      const nextHop = redirectHopKey(nextUrl);
      // Self-redirect (server returns 3xx to the same hop) or revisit of any
      // previously traversed hop (A → B → A).
      if (nextHop === currentHop || visitedHops.has(nextHop)) {
        return {
          ok: false,
          errorCode: "REDIRECT_LOOP",
          finalUrl: nextUrl,
          redirectCount: redirectCount + 1,
          statusCode: response.status,
        };
      }

      redirectCount += 1;
      currentUrl = nextUrl;
      continue;
    }

    if (response.status < 200 || response.status >= 300) {
      return {
        ok: false,
        errorCode: "NETWORK_ERROR",
        finalUrl: currentUrl,
        redirectCount,
        statusCode: response.status,
      };
    }

    const contentType = response.headers.get("content-type");
    if (
      contentType &&
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml")
    ) {
      return {
        ok: false,
        errorCode: "UNSUPPORTED_CONTENT_TYPE",
        finalUrl: currentUrl,
        redirectCount,
        statusCode: response.status,
      };
    }

    const bodyText = await response.text();
    if (!bodyText.trim()) {
      return {
        ok: false,
        errorCode: "EMPTY_BODY",
        finalUrl: currentUrl,
        redirectCount,
        statusCode: response.status,
      };
    }

    return {
      ok: true,
      statusCode: response.status,
      finalUrl: response.url || currentUrl,
      bodyText,
      contentType,
      redirectCount,
      responseBytes: Buffer.byteLength(bodyText, "utf8"),
    };
  }
}
