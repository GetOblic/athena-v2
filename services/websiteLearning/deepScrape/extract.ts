/**
 * Lightweight HTML extraction for deep scrape (no cheerio dependency).
 */

import { DEEP_SCRAPE_CRAWL_POLICY } from "@/services/websiteLearning/deepScrape/crawlPolicy";
import { resolveAbsoluteUrl } from "@/services/websiteLearning/deepScrape/urlSafety";

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripHtmlToText(html: string, maxChars?: number): string {
  const limit = maxChars ?? DEEP_SCRAPE_CRAWL_POLICY.maxExtractedCharsPerPage;
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  ).slice(0, limit);
}

export function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match?.[1]) return null;
  const title = decodeEntities(match[1].replace(/<[^>]+>/g, " "));
  return title || null;
}

export function extractMetaDescription(html: string): string {
  const match = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
  );
  return match?.[1] ? decodeEntities(match[1]) : "";
}

export function extractHeadings(html: string, limit = 20): string[] {
  const headings: string[] = [];
  for (const match of html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)) {
    const text = decodeEntities((match[1] ?? "").replace(/<[^>]+>/g, " "));
    if (text.length >= 2) headings.push(text);
    if (headings.length >= limit) break;
  }
  return headings;
}

export function extractSameDomainLinks(
  html: string,
  pageUrl: string,
): string[] {
  const links: string[] = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)) {
    const href = match[1] ?? "";
    const absolute = resolveAbsoluteUrl(href, pageUrl);
    if (absolute) links.push(absolute);
  }
  return links;
}

export type ExtractedPageContent = {
  url: string;
  title: string | null;
  metaDescription: string;
  headings: string[];
  text: string;
  discoveredLinks: string[];
};

export function extractPageContent(
  html: string,
  pageUrl: string,
): ExtractedPageContent {
  return {
    url: pageUrl,
    title: extractTitle(html),
    metaDescription: extractMetaDescription(html),
    headings: extractHeadings(html),
    text: stripHtmlToText(html),
    discoveredLinks: extractSameDomainLinks(html, pageUrl),
  };
}
