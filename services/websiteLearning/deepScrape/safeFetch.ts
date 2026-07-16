/**
 * Safe HTTP fetch for deep scrape: SSRF checks, redirect pinning, size limits.
 */

import {
  DEEP_SCRAPE_CRAWL_POLICY,
} from "@/services/websiteLearning/deepScrape/crawlPolicy";
import {
  assertPublicHostname,
  canonicalizePageUrl,
  isSameRegistrableDomain,
  type HostnameSafetyContext,
} from "@/services/websiteLearning/deepScrape/urlSafety";

export type SafeFetchResult = {
  ok: boolean;
  finalUrl: string;
  status: number;
  contentType: string;
  bodyText: string | null;
  errorCode?: string;
  redirectCount?: number;
};

async function readBodyWithLimit(
  response: Response,
  maxBytes: number,
): Promise<{ text: string | null; errorCode?: string }> {
  const contentLength = response.headers.get("content-length");
  if (contentLength) {
    const length = Number(contentLength);
    if (Number.isFinite(length) && length > maxBytes) {
      return { text: null, errorCode: "RESPONSE_TOO_LARGE" };
    }
  }

  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) {
      return { text: null, errorCode: "RESPONSE_TOO_LARGE" };
    }
    return { text };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
      return { text: null, errorCode: "RESPONSE_TOO_LARGE" };
    }
    chunks.push(value);
  }
  const merged = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  return { text: merged.toString("utf8") };
}

function contentTypeAllowed(contentType: string): boolean {
  const normalized = contentType.toLowerCase().split(";")[0]?.trim() ?? "";
  return DEEP_SCRAPE_CRAWL_POLICY.allowedContentTypes.some((allowed) =>
    normalized.includes(allowed),
  );
}

/**
 * Fetch a URL with manual redirect following and per-hop SSRF validation.
 * Never logs response bodies.
 */
export async function safeFetchHtml(input: {
  url: string;
  registrableDomain: string;
  timeoutMs?: number;
  maxRedirects?: number;
  acceptXml?: boolean;
  safetyContext?: HostnameSafetyContext;
}): Promise<SafeFetchResult> {
  const timeoutMs =
    input.timeoutMs ?? DEEP_SCRAPE_CRAWL_POLICY.perPageTimeoutMs;
  const maxRedirects =
    input.maxRedirects ?? DEEP_SCRAPE_CRAWL_POLICY.maxRedirectDepth;

  let currentUrl = canonicalizePageUrl(input.url) ?? input.url;
  let redirectCount = 0;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    if (!isSameRegistrableDomain(currentUrl, input.registrableDomain)) {
      return {
        ok: false,
        finalUrl: currentUrl,
        status: 0,
        contentType: "",
        bodyText: null,
        errorCode: "CROSS_DOMAIN_REJECTED",
        redirectCount,
      };
    }

    let hostname: string;
    try {
      hostname = new URL(currentUrl).hostname;
    } catch {
      return {
        ok: false,
        finalUrl: currentUrl,
        status: 0,
        contentType: "",
        bodyText: null,
        errorCode: "INVALID_URL",
        redirectCount,
      };
    }

    try {
      await assertPublicHostname(hostname, {
        ...input.safetyContext,
        redirectDepth: hop,
      });
    } catch (error) {
      return {
        ok: false,
        finalUrl: currentUrl,
        status: 0,
        contentType: "",
        bodyText: null,
        errorCode:
          error instanceof Error ? error.message : "DNS_LOOKUP_FAILED",
        redirectCount,
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(currentUrl, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": DEEP_SCRAPE_CRAWL_POLICY.userAgent,
          Accept: input.acceptXml
            ? "application/xml,text/xml,application/xhtml+xml,text/html;q=0.9,*/*;q=0.1"
            : "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        },
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) {
          return {
            ok: false,
            finalUrl: currentUrl,
            status: response.status,
            contentType: "",
            bodyText: null,
            errorCode: "REDIRECT_MISSING_LOCATION",
            redirectCount,
          };
        }
        currentUrl = new URL(location, currentUrl).toString();
        redirectCount += 1;
        continue;
      }

      const contentType = response.headers.get("content-type") ?? "";
      const xmlOk =
        input.acceptXml &&
        /xml|text\/plain/i.test(contentType);
      if (!response.ok) {
        return {
          ok: false,
          finalUrl: currentUrl,
          status: response.status,
          contentType,
          bodyText: null,
          errorCode: `HTTP_${response.status}`,
        };
      }

      if (!xmlOk && !contentTypeAllowed(contentType)) {
        return {
          ok: false,
          finalUrl: currentUrl,
          status: response.status,
          contentType,
          bodyText: null,
          errorCode: "UNSUPPORTED_CONTENT_TYPE",
        };
      }

      const body = await readBodyWithLimit(
        response,
        DEEP_SCRAPE_CRAWL_POLICY.maxResponseBytes,
      );
      if (body.errorCode) {
        return {
          ok: false,
          finalUrl: currentUrl,
          status: response.status,
          contentType,
          bodyText: null,
          errorCode: body.errorCode,
        };
      }

      return {
        ok: true,
        finalUrl: currentUrl,
        status: response.status,
        contentType,
        bodyText: body.text,
        redirectCount,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const errorCode = /abort/i.test(message) ? "PAGE_TIMEOUT" : "FETCH_FAILED";
      return {
        ok: false,
        finalUrl: currentUrl,
        status: 0,
        contentType: "",
        bodyText: null,
        errorCode,
        redirectCount,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    ok: false,
    finalUrl: currentUrl,
    status: 0,
    contentType: "",
    bodyText: null,
    errorCode: "REDIRECT_DEPTH_EXCEEDED",
    redirectCount,
  };
}
