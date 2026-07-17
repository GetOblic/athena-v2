/**
 * Sitemap discovery and parsing for Deep Website Scrape.
 */

import { DEEP_SCRAPE_CRAWL_POLICY } from "@/services/websiteLearning/deepScrape/crawlPolicy";
import { safeFetchHtml } from "@/services/websiteLearning/deepScrape/safeFetch";
import {
  canonicalizePageUrl,
  isSameRegistrableDomain,
} from "@/services/websiteLearning/deepScrape/urlSafety";

function extractXmlTags(xml: string, tag: string): string[] {
  const values: string[] = [];
  const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  for (const match of xml.matchAll(pattern)) {
    const value = (match[1] ?? "")
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
      .trim();
    if (value) values.push(value);
  }
  return values;
}

function collectSitemapCandidates(rootUrl: string): string[] {
  const base = new URL(rootUrl);
  const origin = base.origin;
  return [
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemap-index.xml`,
    `${origin}/wp-sitemap.xml`,
  ];
}

export type SitemapAttempt = {
  url: string;
  ok: boolean;
  status: number;
  errorCode?: string;
};

export async function discoverSitemapUrls(input: {
  rootUrl: string;
  registrableDomain: string;
}): Promise<{ sitemapUrls: string[]; fromRobots: boolean }> {
  const found = new Set<string>();
  let fromRobots = false;

  try {
    const robotsUrl = new URL("/robots.txt", `${input.rootUrl}/`).toString();
    const robotsFetch = await safeFetchHtml({
      url: robotsUrl,
      registrableDomain: input.registrableDomain,
      acceptXml: true,
      timeoutMs: 8_000,
    });
    if (robotsFetch.ok && robotsFetch.bodyText) {
      for (const line of robotsFetch.bodyText.split(/\r?\n/)) {
        const match = line.match(/^\s*sitemap:\s*(.+)\s*$/i);
        if (match?.[1]) {
          const url = canonicalizePageUrl(match[1].trim());
          if (url && isSameRegistrableDomain(url, input.registrableDomain)) {
            found.add(url);
            fromRobots = true;
          }
        }
      }
    }
  } catch {
    // ignore
  }

  for (const candidate of collectSitemapCandidates(input.rootUrl)) {
    found.add(candidate);
  }

  return { sitemapUrls: [...found], fromRobots };
}

export async function collectUrlsFromSitemaps(input: {
  rootUrl: string;
  registrableDomain: string;
  onSitemapFound?: (url: string) => void;
}): Promise<{
  urls: string[];
  sitemapsParsed: number;
  locationsAttempted: string[];
  attempts: SitemapAttempt[];
}> {
  const { sitemapUrls } = await discoverSitemapUrls(input);
  const pageUrls = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = sitemapUrls.map(
    (url) => ({ url, depth: 0 }),
  );
  const seenSitemaps = new Set<string>();
  const attempts: SitemapAttempt[] = [];
  let sitemapsParsed = 0;

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) break;
    if (seenSitemaps.has(next.url)) continue;
    seenSitemaps.add(next.url);
    if (next.depth > DEEP_SCRAPE_CRAWL_POLICY.sitemapDepth) continue;

    const fetched = await safeFetchHtml({
      url: next.url,
      registrableDomain: input.registrableDomain,
      acceptXml: true,
      timeoutMs: 10_000,
    });

    attempts.push({
      url: next.url,
      ok: fetched.ok,
      status: fetched.status,
      errorCode: fetched.errorCode,
    });

    if (!fetched.ok || !fetched.bodyText) continue;

    sitemapsParsed += 1;
    input.onSitemapFound?.(fetched.finalUrl);

    const locs = extractXmlTags(fetched.bodyText, "loc");
    const looksLikeIndex =
      /<sitemapindex/i.test(fetched.bodyText) ||
      locs.some((loc) => /sitemap/i.test(loc));

    for (const loc of locs) {
      const canonical = canonicalizePageUrl(loc);
      if (!canonical) continue;
      if (!isSameRegistrableDomain(canonical, input.registrableDomain)) {
        continue;
      }
      if (
        looksLikeIndex &&
        next.depth < DEEP_SCRAPE_CRAWL_POLICY.sitemapDepth &&
        (/sitemap/i.test(canonical) || /\.xml(\?|$)/i.test(canonical))
      ) {
        queue.push({ url: canonical, depth: next.depth + 1 });
        continue;
      }
      pageUrls.add(canonical);
      if (pageUrls.size >= DEEP_SCRAPE_CRAWL_POLICY.maxDiscoveryInventory) {
        return {
          urls: [...pageUrls],
          sitemapsParsed,
          locationsAttempted: [...seenSitemaps],
          attempts,
        };
      }
    }
  }

  return {
    urls: [...pageUrls],
    sitemapsParsed,
    locationsAttempted: [...seenSitemaps],
    attempts,
  };
}
