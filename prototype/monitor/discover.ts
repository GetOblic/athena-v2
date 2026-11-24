import * as cheerio from "cheerio";

import { canonicalMonitorUrl, isHardDeniedUrl } from "./safety";
import type { ExtractionAdapterId } from "./types";
import { cleanText } from "./text";

const SFRA_PRODUCT = /-\d{12,}\.html$/i;
const SFRA_CATEGORY = /-(?:sc|c|tp)_[0-9a-z]+$/i;
const SOLUSQUARE_PRODUCT = /-p-\d+-coul-\d+\.htm$/i;
const SOLUSQUARE_CATEGORY = /-c-\d+\.htm$/i;

export type EntryKind = "home" | "category" | "product";

export function classifyEntryUrl(rawUrl: string, adapter: ExtractionAdapterId): EntryKind {
  const path = new URL(rawUrl).pathname;
  if (adapter === "sfra" && SFRA_PRODUCT.test(path)) return "product";
  if (adapter === "solusquare" && SOLUSQUARE_PRODUCT.test(path)) return "product";
  if (adapter === "sfra" && SFRA_CATEGORY.test(path)) return "category";
  if (adapter === "solusquare" && SOLUSQUARE_CATEGORY.test(path) && !/-cl-\d+\.htm$/i.test(path)) {
    return "category";
  }
  return "home";
}

export function isProductUrl(rawUrl: string, adapter: ExtractionAdapterId): boolean {
  return classifyEntryUrl(rawUrl, adapter) === "product";
}

export function collectPageLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const links: string[] = [];
  const seen = new Set<string>();
  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    let absolute: string;
    try {
      absolute = new URL(href, baseUrl).toString();
    } catch {
      return;
    }
    if (isHardDeniedUrl(absolute)) return;
    const canonical = canonicalMonitorUrl(absolute);
    if (seen.has(canonical)) return;
    seen.add(canonical);
    links.push(canonical);
  });
  return links;
}

export function scoreClothingCategory(rawUrl: string, linkText: string | null): number {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return -1;
  }
  const path = decodeURIComponent(parsed.pathname).toLowerCase();
  const sfraCategory = SFRA_CATEGORY.test(path);
  const solusquareCategory = SOLUSQUARE_CATEGORY.test(path) && !/-cl-\d+\.htm$/i.test(path) && !/-page-\d+\.htm$/i.test(path);
  if (!sfraCategory && !solusquareCategory) return -1;

  const haystack = `${path} ${cleanText(linkText, 120) ?? ""}`.toLowerCase();
  let score = 1;
  if (/jean/.test(haystack)) score += 50;
  if (/pantalon/.test(haystack)) score += 40;
  if (/robe|pull|chemise|manteau|veste|jupe|tregging/.test(haystack)) score += 25;
  if (/vetement|vêtement/.test(haystack)) score += 10;
  if (/femme|homme/.test(haystack)) score += 3;
  if (/cadeau|carte|bijou|accessoire|parfum|beaute|beauté/.test(haystack)) score -= 40;
  return score;
}

export function chooseClothingCategory(html: string, baseUrl: string): string | null {
  const $ = cheerio.load(html);
  let bestUrl: string | null = null;
  let bestScore = 0;
  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    let absolute: string;
    try {
      absolute = canonicalMonitorUrl(new URL(href, baseUrl).toString());
    } catch {
      return;
    }
    if (isHardDeniedUrl(absolute)) return;
    const score = scoreClothingCategory(absolute, $(element).text());
    if (score > bestScore) {
      bestScore = score;
      bestUrl = absolute;
    }
  });
  return bestUrl;
}

export function collectProductUrls(
  html: string,
  baseUrl: string,
  adapter: ExtractionAdapterId,
): string[] {
  return collectPageLinks(html, baseUrl).filter((url) => isProductUrl(url, adapter));
}

export function findNextListingUrl(html: string, baseUrl: string): string | null {
  const $ = cheerio.load(html);
  const href =
    $("a[rel='next']").attr("href") ??
    $("link[rel='next']").attr("href") ??
    $("a[href*='page=2']").first().attr("href") ??
    null;
  if (!href) return null;
  try {
    const absolute = canonicalMonitorUrl(new URL(href, baseUrl).toString());
    if (isHardDeniedUrl(absolute)) return null;
    return absolute;
  } catch {
    return null;
  }
}

export function skuFromProductUrl(rawUrl: string): string | null {
  const match = new URL(rawUrl).pathname.match(/-(\d{12,})\.html$/i);
  return match?.[1] ?? null;
}

export function prodIdFromSolusquareUrl(rawUrl: string): string | null {
  const match = new URL(rawUrl).pathname.match(/-p-(\d+)-coul-\d+\.htm$/i);
  return match?.[1] ?? null;
}

export function sfraSlug(rawUrl: string): string | null {
  const path = decodeURIComponent(new URL(rawUrl).pathname).replace(/^\//, "");
  if (!/-\d{12,}\.html$/i.test(path)) return null;
  return path.replace(/-\d{12,}\.html$/i, "");
}

export function lengthValueFromSlug(rawUrl: string): string | null {
  const slug = sfraSlug(rawUrl);
  const match = slug?.match(/longueur-(\d+)/i);
  return match?.[1] ?? null;
}

/** Same model words with the length number removed. Null when the URL has no length. */
export function lengthGroupKey(rawUrl: string): string | null {
  const slug = sfraSlug(rawUrl);
  if (!slug || !/longueur-\d+/i.test(slug)) return null;
  return slug.replace(/longueur-\d+/gi, "longueur-#");
}

export function prioritizeLengthPairs(urls: readonly string[]): string[] {
  const groups = new Map<string, string[]>();
  for (const url of urls) {
    const key = lengthGroupKey(url);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(url);
    groups.set(key, list);
  }
  const preferred: string[] = [];
  for (const list of groups.values()) {
    const byLength = new Map<string, string>();
    for (const url of list) {
      const length = lengthValueFromSlug(url);
      if (length && !byLength.has(length)) byLength.set(length, url);
    }
    if (byLength.size >= 2) {
      preferred.push(...[...byLength.values()].slice(0, 2));
      break;
    }
  }
  const preferredSet = new Set(preferred);
  return [...preferred, ...urls.filter((url) => !preferredSet.has(url))];
}
