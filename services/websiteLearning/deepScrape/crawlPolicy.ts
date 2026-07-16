/**
 * Conservative Deep Website Scrape crawl limits and URL scoring.
 * Reliability over exhaustive coverage. Max 25 meaningful pages.
 */

export const DEEP_SCRAPE_CRAWL_POLICY = {
  maxDiscoveredUrls: 200,
  maxMeaningfulPages: 25,
  maxConcurrentRequests: 2,
  perPageTimeoutMs: 15_000,
  phaseAWallClockMs: 12 * 60_000,
  maxResponseBytes: 1_500_000,
  maxExtractedCharsPerPage: 12_000,
  maxCombinedSourceChars: 120_000,
  maxRedirectDepth: 3,
  pageRetryCount: 1,
  sitemapDepth: 2,
  interRequestDelayMs: 400,
  userAgent: "AthenaDeepScrape/1.0 (+https://athena.app; website-learning)",
  allowedContentTypes: [
    "text/html",
    "application/xhtml+xml",
  ] as readonly string[],
} as const;

const PRIORITY_PATTERNS: Array<{ type: string; pattern: RegExp; score: number }> =
  [
    { type: "about", pattern: /\/(about|our-story|who-we-are|company)(\/|$)/i, score: 100 },
    { type: "services", pattern: /\/(services|service|what-we-do)(\/|$)/i, score: 95 },
    { type: "products", pattern: /\/(products?|shop|offerings?)(\/|$)/i, score: 95 },
    { type: "solutions", pattern: /\/(solutions?|platforms?)(\/|$)/i, score: 90 },
    { type: "pricing", pattern: /\/(pricing|plans?|packages?)(\/|$)/i, score: 90 },
    { type: "training", pattern: /\/(training|courses?|academy|education|workshops?)(\/|$)/i, score: 88 },
    { type: "faq", pattern: /\/(faq|faqs|questions?)(\/|$)/i, score: 85 },
    { type: "team", pattern: /\/(team|people|leadership|staff|founders?)(\/|$)/i, score: 80 },
    { type: "portfolio", pattern: /\/(portfolio|work|projects?)(\/|$)/i, score: 78 },
    { type: "case_studies", pattern: /\/(case-stud(?:y|ies)|success-stor(?:y|ies)|clients?)(\/|$)/i, score: 78 },
    { type: "testimonials", pattern: /\/(testimonials?|reviews?|social-proof)(\/|$)/i, score: 75 },
    { type: "contact", pattern: /\/(contact|get-in-touch|book|schedule)(\/|$)/i, score: 70 },
    { type: "commercial", pattern: /\/(landing|offer|demo|trial|consult)(\/|$)/i, score: 65 },
  ];

const EXCLUDE_PATTERNS: RegExp[] = [
  /\/(privacy|privacy-policy|terms|terms-of-(service|use)|legal|cookie|cookies|gdpr)(\/|$)/i,
  /\/(login|log-in|signin|sign-in|signup|sign-up|register|account|auth|sso)(\/|$)/i,
  /\/(cart|checkout|basket|payment|billing|order)(\/|$)/i,
  /\/(feed|rss|atom|tag|tags|category\/page|author|archive|archives)(\/|$)/i,
  /\/page\/\d+(\/|$)/i,
  /\.(pdf|png|jpe?g|gif|webp|svg|mp4|mp3|zip|docx?|xlsx?|pptx?)(\?|$)/i,
  /^(mailto|tel|javascript):/i,
];

export type ScoredUrl = {
  url: string;
  score: number;
  pageType: string;
};

export function isExcludedUrl(url: string): boolean {
  const normalized = url.trim();
  if (!normalized) return true;
  if (/^(mailto|tel|javascript):/i.test(normalized)) return true;
  try {
    const parsed = new URL(normalized);
    if (parsed.search && /([?&](utm_|fbclid|gclid|session|sid)=)/i.test(parsed.search)) {
      // Query-string tracking dupes are handled by canonicalization; still allow path.
    }
    const pathAndQuery = `${parsed.pathname}${parsed.search}`;
    return EXCLUDE_PATTERNS.some((pattern) => pattern.test(pathAndQuery));
  } catch {
    return true;
  }
}

export function scoreUrl(url: string): ScoredUrl {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    if (path === "/" || path === "") {
      return { url, score: 110, pageType: "homepage" };
    }
    for (const entry of PRIORITY_PATTERNS) {
      if (entry.pattern.test(path)) {
        return { url, score: entry.score, pageType: entry.type };
      }
    }
    // Mild boost for short evergreen paths without digits/pagination smell.
    if (path.split("/").filter(Boolean).length <= 2 && !/\d{4}/.test(path)) {
      return { url, score: 40, pageType: "evergreen" };
    }
    return { url, score: 20, pageType: "other" };
  } catch {
    return { url, score: 0, pageType: "invalid" };
  }
}

/** Prefer meaningful commercial pages; drop excluded / zero-score URLs. */
export function selectMeaningfulUrls(
  urls: string[],
  maxPages = DEEP_SCRAPE_CRAWL_POLICY.maxMeaningfulPages,
): ScoredUrl[] {
  const scored = urls
    .filter((url) => !isExcludedUrl(url))
    .map(scoreUrl)
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));

  const selected: ScoredUrl[] = [];
  const seenTypes = new Set<string>();

  for (const entry of scored) {
    if (selected.length >= maxPages) break;
    // Keep homepage + high-priority types; allow limited "other"/"evergreen".
    if (
      entry.pageType === "other" &&
      selected.filter((s) => s.pageType === "other").length >= 3
    ) {
      continue;
    }
    selected.push(entry);
    seenTypes.add(entry.pageType);
  }

  void seenTypes;
  return selected;
}

export function buildCrawlSummary(pages: Array<{ pageType: string }>): {
  pages_analyzed: number;
  services_discovered: number;
  faqs_discovered: number;
  testimonials_discovered: number;
  team_pages_discovered: number;
  commercial_pages_discovered: number;
} {
  const count = (type: string) =>
    pages.filter((page) => page.pageType === type).length;

  return {
    pages_analyzed: pages.length,
    services_discovered: count("services") + count("solutions") + count("products"),
    faqs_discovered: count("faq"),
    testimonials_discovered: count("testimonials") + count("case_studies"),
    team_pages_discovered: count("team"),
    commercial_pages_discovered:
      count("commercial") + count("pricing") + count("training"),
  };
}
