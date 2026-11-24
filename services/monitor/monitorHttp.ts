/**
 * Abortable public HTTP fetch for the Monitor worker.
 * Reuses the existing hostname, domain, and response-size checks.
 * Shutdown aborts every controller still in the tracker.
 */

import { DEEP_SCRAPE_CRAWL_POLICY } from "@/services/websiteLearning/deepScrape/crawlPolicy";
import {
  assertPublicHostname,
  canonicalizePageUrl,
  isSameRegistrableDomain,
} from "@/services/websiteLearning/deepScrape/urlSafety";
import type { MonitorPageFetch } from "@/services/monitor/monitorAdapter";
import { isHardDeniedMonitorUrl } from "@/services/monitor/monitorSources";

const MAX_REDIRECTS = 4;

export type MonitorResourceTracker = {
  readonly closed: boolean;
  signalForRequest(): AbortSignal;
  release(signal: AbortSignal): void;
  close(): void;
};

export function createMonitorResources(): MonitorResourceTracker {
  const controllers = new Set<AbortController>();
  let closed = false;
  return {
    get closed() {
      return closed;
    },
    signalForRequest() {
      const controller = new AbortController();
      if (closed) controller.abort();
      controllers.add(controller);
      return controller.signal;
    },
    release(signal: AbortSignal) {
      for (const controller of controllers) {
        if (controller.signal === signal) controllers.delete(controller);
      }
    },
    close() {
      closed = true;
      for (const controller of controllers) controller.abort();
      controllers.clear();
    },
  };
}

async function readLimited(response: Response, maxBytes: number): Promise<string | null> {
  if (!response.body) {
    const text = await response.text();
    return Buffer.byteLength(text, "utf8") > maxBytes ? null : text;
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
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}

export function createMonitorPageFetch(resources: MonitorResourceTracker): MonitorPageFetch {
  return async (input) => {
    const requestSignal = resources.signalForRequest();
    const timeout = AbortSignal.timeout(input.timeoutMs);
    const signals = [requestSignal, timeout, ...(input.signal ? [input.signal] : [])];
    const signal = AbortSignal.any(signals);
    try {
      if (isHardDeniedMonitorUrl(input.url)) {
        return { ok: false, finalUrl: input.url, status: 0, bodyText: null, errorCode: "URL_DENIED" };
      }
      let currentUrl = canonicalizePageUrl(input.url) ?? input.url;
      for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
        if (!isSameRegistrableDomain(currentUrl, input.registrableDomain)) {
          return { ok: false, finalUrl: currentUrl, status: 0, bodyText: null, errorCode: "CROSS_DOMAIN_REJECTED" };
        }
        let hostname = "";
        try {
          hostname = new URL(currentUrl).hostname;
        } catch {
          return { ok: false, finalUrl: currentUrl, status: 0, bodyText: null, errorCode: "INVALID_URL" };
        }
        try {
          await assertPublicHostname(hostname, { redirectDepth: hop });
        } catch (error) {
          return {
            ok: false,
            finalUrl: currentUrl,
            status: 0,
            bodyText: null,
            errorCode: error instanceof Error ? error.message : "DNS_LOOKUP_FAILED",
          };
        }
        const response = await fetch(currentUrl, {
          method: "GET",
          redirect: "manual",
          signal,
          headers: {
            "User-Agent": DEEP_SCRAPE_CRAWL_POLICY.userAgent,
            Accept: input.acceptXml
              ? "application/xml,text/xml,text/html;q=0.9,*/*;q=0.1"
              : "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
          },
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get("location");
          if (!location) {
            return { ok: false, finalUrl: currentUrl, status: response.status, bodyText: null, errorCode: "REDIRECT_MISSING_LOCATION" };
          }
          currentUrl = new URL(location, currentUrl).toString();
          continue;
        }
        if (!response.ok) {
          return { ok: false, finalUrl: currentUrl, status: response.status, bodyText: null, errorCode: `HTTP_${response.status}` };
        }
        const bodyText = await readLimited(response, DEEP_SCRAPE_CRAWL_POLICY.maxResponseBytes);
        if (bodyText == null) {
          return { ok: false, finalUrl: currentUrl, status: response.status, bodyText: null, errorCode: "RESPONSE_TOO_LARGE" };
        }
        return { ok: true, finalUrl: currentUrl, status: response.status, bodyText };
      }
      return { ok: false, finalUrl: currentUrl, status: 0, bodyText: null, errorCode: "REDIRECT_DEPTH_EXCEEDED" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const errorCode = /abort/i.test(message) ? "ABORTED" : "FETCH_FAILED";
      return { ok: false, finalUrl: input.url, status: 0, bodyText: null, errorCode };
    } finally {
      resources.release(requestSignal);
    }
  };
}
