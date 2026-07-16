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
  /**
   * Homepage / page usefulness thresholds.
   * Allow brochure / single-page sites; reject empty shells and denial pages.
   */
  minUsefulReadableChars: 120,
  minUsefulWordCount: 20,
  minUsefulSignalChars: 40,
} as const;

const USELESS_CONTENT_PATTERNS: RegExp[] = [
  /access\s*denied/i,
  /403\s*forbidden/i,
  /401\s*unauthorized/i,
  /just\s*a\s*moment/i,
  /enable\s*javascript/i,
  /you\s*need\s*to\s*enable\s*javascript/i,
  /this\s*site\s*requires\s*javascript/i,
  /attention\s*required/i,
  /cloudflare/i,
  /checking\s*your\s*browser/i,
  /verify\s*you\s*are\s*human/i,
  /cookie\s*(consent|policy|settings|notice)/i,
  /we\s*use\s*cookies/i,
  /accept\s*(all\s*)?cookies/i,
  /parked\s*(domain|page)/i,
  /domain\s*is\s*for\s*sale/i,
  /buy\s*this\s*domain/i,
  /coming\s*soon/i,
  /under\s*construction/i,
  /please\s*log\s*in/i,
  /sign\s*in\s*to\s*continue/i,
];

const BUSINESS_SIGNAL_PATTERNS: RegExp[] = [
  /\b(about|services?|products?|solutions?|pricing|training|courses?|contact|team|clients?|customers?|mission|company|business|offer|consult|book|schedule)\b/i,
];

export type PageUsefulnessResult = {
  useful: boolean;
  reason:
    | "useful"
    | "empty_text"
    | "too_thin"
    | "low_word_count"
    | "denied_or_shell"
    | "no_business_signal";
  charCount: number;
  wordCount: number;
  hasTitleOrHeading: boolean;
};

export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0).length;
}

/**
 * Conservative usefulness check for a single extracted page.
 * Does not require multiple pages. Rejects denial/cookie/JS shells.
 */
export function evaluatePageUsefulness(input: {
  title?: string | null;
  headings?: string[];
  text: string;
}): PageUsefulnessResult {
  const text = (input.text ?? "").replace(/\s+/g, " ").trim();
  const charCount = text.length;
  const wordCount = countWords(text);
  const title = (input.title ?? "").trim();
  const headings = (input.headings ?? []).map((value) => value.trim()).filter(Boolean);
  const hasTitleOrHeading = Boolean(title) || headings.length > 0;
  const haystack = [title, ...headings, text].join("\n");

  if (!text) {
    return {
      useful: false,
      reason: "empty_text",
      charCount,
      wordCount,
      hasTitleOrHeading,
    };
  }

  if (USELESS_CONTENT_PATTERNS.some((pattern) => pattern.test(haystack))) {
    // Allow pages that mention cookies incidentally if they still have substantial body.
    const looksLikeWallOnly =
      charCount < DEEP_SCRAPE_CRAWL_POLICY.minUsefulReadableChars * 2 ||
      /accept\s*(all\s*)?cookies|enable\s*javascript|access\s*denied|parked\s*(domain|page)/i.test(
        haystack,
      );
    if (looksLikeWallOnly) {
      return {
        useful: false,
        reason: "denied_or_shell",
        charCount,
        wordCount,
        hasTitleOrHeading,
      };
    }
  }

  if (charCount < DEEP_SCRAPE_CRAWL_POLICY.minUsefulReadableChars) {
    return {
      useful: false,
      reason: "too_thin",
      charCount,
      wordCount,
      hasTitleOrHeading,
    };
  }

  if (wordCount < DEEP_SCRAPE_CRAWL_POLICY.minUsefulWordCount) {
    return {
      useful: false,
      reason: "low_word_count",
      charCount,
      wordCount,
      hasTitleOrHeading,
    };
  }

  const signalText = haystack.slice(0, 4_000);
  const hasBusinessSignal =
    BUSINESS_SIGNAL_PATTERNS.some((pattern) => pattern.test(signalText)) ||
    (hasTitleOrHeading &&
      charCount >= DEEP_SCRAPE_CRAWL_POLICY.minUsefulSignalChars * 3);

  if (!hasBusinessSignal && charCount < DEEP_SCRAPE_CRAWL_POLICY.minUsefulReadableChars * 3) {
    return {
      useful: false,
      reason: "no_business_signal",
      charCount,
      wordCount,
      hasTitleOrHeading,
    };
  }

  return {
    useful: true,
    reason: "useful",
    charCount,
    wordCount,
    hasTitleOrHeading,
  };
}

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
    .filter((url) => !isExcludedUrl(url) || scoreUrl(url).pageType === "homepage")
    .map(scoreUrl)
    .filter((entry) => entry.score > 0 || entry.pageType === "homepage")
    .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));

  const selected: ScoredUrl[] = [];
  const seen = new Set<string>();

  for (const entry of scored) {
    if (selected.length >= maxPages) break;
    if (seen.has(entry.url)) continue;
    // Keep homepage + high-priority types; allow limited "other"/"evergreen".
    if (
      entry.pageType === "other" &&
      selected.filter((s) => s.pageType === "other").length >= 3
    ) {
      continue;
    }
    selected.push(entry);
    seen.add(entry.url);
  }

  return selected;
}

/** Guarantee the normalized homepage remains a crawl candidate. */
export function ensureHomepageCandidate(
  urls: Iterable<string>,
  homepageUrl: string,
): string[] {
  const out = new Set<string>();
  for (const url of urls) {
    if (url) out.add(url);
  }
  out.add(homepageUrl);
  return [...out];
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
