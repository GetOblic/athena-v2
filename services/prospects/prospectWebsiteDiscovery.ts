/**
 * Intelligent page discovery from homepage HTML — not recursive crawling.
 */

import { normalizeCrawlUrl } from "@/services/prospects/prospectWebsiteUrl";

export type DiscoveredPageSource = "homepage" | "nav" | "keyword" | "content";

export type DiscoveredPageCandidate = {
  url: string;
  source: DiscoveredPageSource;
  anchorText: string;
};

/** Highest-priority business knowledge page patterns (path or anchor). */
export const HIGH_VALUE_PAGE_PATTERNS: Array<{
  label: string;
  patterns: RegExp[];
}> = [
  {
    label: "About",
    patterns: [/\babout(?:-?us)?\b/i, /\bour[-_\s]?story\b/i, /\bwho[-_\s]?we[-_\s]?are\b/i],
  },
  {
    label: "Services",
    patterns: [/\bservices?\b/i, /\btreatments?\b/i, /\bsolutions?\b/i],
  },
  {
    label: "Products",
    patterns: [/\bproducts?\b/i, /\bpackages?\b/i, /\bmemberships?\b/i],
  },
  {
    label: "Pricing",
    patterns: [/\bpric(?:e|ing|es)\b/i, /\brates?\b/i, /\bcosts?\b/i],
  },
  {
    label: "FAQ",
    patterns: [/\bfaqs?\b/i, /\bfrequently[-_\s]?asked\b/i, /\bquestions?\b/i],
  },
  {
    label: "Team",
    patterns: [/\b(?:our[-_\s]?)?team\b/i, /\bstaff\b/i, /\bproviders?\b/i, /\bdoctors?\b/i],
  },
  {
    label: "Locations",
    patterns: [/\blocations?\b/i, /\bfind[-_\s]?us\b/i, /\boffices?\b/i],
  },
  {
    label: "Contact",
    patterns: [/\bcontact\b/i, /\breach[-_\s]?us\b/i],
  },
  {
    label: "Policies",
    patterns: [/\bpolic(?:y|ies)\b/i, /\bcancellation\b/i, /\brefund\b/i],
  },
  {
    label: "Booking",
    patterns: [/\bbook(?:ing)?\b/i, /\bschedule\b/i, /\bappointments?\b/i, /\bconsult/i],
  },
  {
    label: "Technology",
    patterns: [/\btechnology\b/i, /\btechnologies\b/i, /\bequipment\b/i, /\bdevices?\b/i],
  },
  {
    label: "Process",
    patterns: [/\bprocess\b/i, /\bhow[-_\s]?it[-_\s]?works\b/i, /\bwhat[-_\s]?to[-_\s]?expect\b/i],
  },
];

export function classifyPageLabel(
  url: string,
  anchorText = "",
): string | null {
  const haystack = `${url} ${anchorText}`;
  for (const entry of HIGH_VALUE_PAGE_PATTERNS) {
    if (entry.patterns.some((pattern) => pattern.test(haystack))) {
      return entry.label;
    }
  }
  return null;
}

function extractLinksFromHtmlChunk(
  html: string,
  baseUrl: string,
  source: DiscoveredPageSource,
): DiscoveredPageCandidate[] {
  const results: DiscoveredPageCandidate[] = [];
  for (const match of html.matchAll(
    /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    const href = match[1] ?? "";
    const anchorText = (match[2] ?? "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const normalized = normalizeCrawlUrl(href, baseUrl);
    if (!normalized) continue;
    results.push({ url: normalized, source, anchorText });
  }
  return results;
}

/**
 * Discover high-value internal pages from the homepage document.
 * Does not crawl recursively — candidates come from nav + homepage links only.
 */
export function discoverCandidatePages(
  homepageHtml: string,
  homepageUrl: string,
): DiscoveredPageCandidate[] {
  const homepageNormalized = normalizeCrawlUrl(homepageUrl, homepageUrl);
  const byUrl = new Map<string, DiscoveredPageCandidate>();

  if (homepageNormalized) {
    byUrl.set(homepageNormalized, {
      url: homepageNormalized,
      source: "homepage",
      anchorText: "Home",
    });
  }

  const navChunks = [
    ...homepageHtml.matchAll(/<nav\b[^>]*>([\s\S]*?)<\/nav>/gi),
    ...homepageHtml.matchAll(
      /<(?:header|div|ul|section)\b[^>]*(?:role=["']navigation["']|class=["'][^"']*(?:nav|menu|header)[^"']*["'])[^>]*>([\s\S]*?)<\/(?:header|div|ul|section)>/gi,
    ),
  ].map((match) => match[1] ?? "");

  for (const chunk of navChunks) {
    for (const link of extractLinksFromHtmlChunk(chunk, homepageUrl, "nav")) {
      const existing = byUrl.get(link.url);
      if (!existing || existing.source === "content") {
        byUrl.set(link.url, link);
      }
    }
  }

  // Full-document links: keyword-priority vs remaining content links.
  for (const link of extractLinksFromHtmlChunk(
    homepageHtml,
    homepageUrl,
    "content",
  )) {
    const label = classifyPageLabel(link.url, link.anchorText);
    const next: DiscoveredPageCandidate = label
      ? { ...link, source: "keyword" }
      : link;
    const existing = byUrl.get(next.url);
    if (!existing) {
      byUrl.set(next.url, next);
      continue;
    }
    const rank = { homepage: 4, nav: 3, keyword: 2, content: 1 } as const;
    if (rank[next.source] > rank[existing.source]) {
      byUrl.set(next.url, next);
    }
  }

  return [...byUrl.values()];
}
