/**
 * Conservative Deep Website Scrape crawl limits and URL scoring.
 * Reliability over exhaustive coverage. Max 25 meaningful pages.
 */

import {
  rankCrawlCandidates,
  scoreDeepScrapeCandidate,
} from "@/services/websiteLearning/deepScrape/crawler/urlRelevance";

export const DEEP_SCRAPE_CRAWL_POLICY = {
  maxDiscoveredUrls: 200,
  maxMeaningfulPages: 25,
  /**
   * Soft fetch budget after priority ordering.
   * Allows some rejects/404s without burning the full discovery queue.
   */
  maxFetchAttempts: 25 + 40,
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
   * Page acceptance: usable extracted content for synthesis (not index richness).
   * Concise legitimate business pages must pass when readable content exists.
   */
  minPageReadableChars: 40,
  minPageWordCount: 6,
  minPageCharsWithSignal: 20,
  /** Combined corpus must clear a modest floor before Gemini Flash. */
  minCorpusReadableChars: 60,
  minCorpusWordCount: 10,
} as const;

type ShellPattern = { code: string; pattern: RegExp };

const SHELL_OR_ERROR_PATTERNS: ShellPattern[] = [
  { code: "PAGE_ACCESS_DENIED", pattern: /\b(access\s*denied|403\s*forbidden|401\s*unauthorized|forbidden)\b/i },
  { code: "PAGE_SERVER_ERROR", pattern: /\b(500\s*internal\s*server\s*error|502\s*bad\s*gateway|503\s*service\s*unavailable|internal\s*server\s*error|bad\s*gateway)\b/i },
  { code: "PAGE_LOGIN_GATE", pattern: /\b(please\s*log\s*in|sign\s*in\s*to\s*continue|create\s*an\s*account\s*to\s*continue|member\s*login)\b/i },
  { code: "PAGE_COOKIE_WALL_ONLY", pattern: /\b(accept\s*(all\s*)?cookies|cookie\s*consent|we\s*use\s*cookies\s*to\s*(improve|enhance|provide))\b/i },
  { code: "PAGE_PARKED_DOMAIN", pattern: /\b(parked\s*(domain|page)|this\s*domain\s*is\s*parked)\b/i },
  { code: "PAGE_DOMAIN_FOR_SALE", pattern: /\b(domain\s*is\s*for\s*sale|buy\s*this\s*domain|this\s*domain\s*may\s*be\s*for\s*sale)\b/i },
  { code: "PAGE_JS_SHELL", pattern: /\b(enable\s*javascript|you\s*need\s*to\s*enable\s*javascript|this\s*site\s*requires\s*javascript)\b/i },
  { code: "PAGE_CAPTCHA", pattern: /\b(verify\s*you\s*are\s*human|attention\s*required|checking\s*your\s*browser|just\s*a\s*moment|captcha)\b/i },
  { code: "PAGE_COMING_SOON", pattern: /\b(coming\s*soon|under\s*construction)\b/i },
];

const BUSINESS_SIGNAL_DEFS: Array<{ type: string; pattern: RegExp }> = [
  {
    type: "service_terminology",
    pattern:
      /\b(about|services?|products?|solutions?|pricing|training|courses?|clinic|treatment|therapy|consult|offer)\b/i,
  },
  {
    type: "contact_heading",
    pattern: /\b(contact|get\s*in\s*touch|book|schedule|team|staff|faq|testimonial|review|hours|opening)\b/i,
  },
  {
    type: "phone",
    pattern: /\b\+?\d[\d\s().-]{7,}\d\b/,
  },
  {
    type: "email",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  },
  {
    type: "address",
    pattern:
      /\b(\d{1,5}\s+[A-Za-z0-9.\-'\s]+(?:street|st|road|rd|avenue|ave|boulevard|blvd|lane|ln|drive|dr|suite|ste|floor)\b|[A-Z]{1,2}\d[A-Z0-9]?\s*\d[A-Z]{2})\b/i,
  },
];

const NAV_ONLY_TOKENS = new Set([
  "home",
  "about",
  "services",
  "contact",
  "menu",
  "login",
  "search",
  "privacy",
  "terms",
  "skip",
  "content",
  "main",
  "navigation",
  "nav",
  "cart",
  "account",
  "blog",
  "faq",
]);

export type ExtractedPageAcceptance = {
  accepted: boolean;
  rejectionCode: string | null;
  extractedCharacterCount: number;
  extractedWordCount: number;
  businessSignals: string[];
  businessSignalCount: number;
  blockedPattern: string | null;
  shellOrErrorPattern: string | null;
  duplicateFingerprint: string | null;
  pageType: string | null;
  useful: boolean;
  reason: string;
  charCount: number;
  wordCount: number;
  hasTitleOrHeading: boolean;
};

/** @deprecated Use ExtractedPageAcceptance via evaluateExtractedPageUsefulness */
export type PageUsefulnessResult = ExtractedPageAcceptance;

export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0).length;
}

export function fingerprintExtractedText(text: string): string {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 500);
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  return `fp_${hash.toString(16)}`;
}

function detectBusinessSignals(text: string): string[] {
  const found = new Set<string>();
  for (const entry of BUSINESS_SIGNAL_DEFS) {
    if (entry.pattern.test(text)) {
      found.add(entry.type);
    }
  }
  return [...found];
}

function isNavigationOnly(text: string, wordCount: number): boolean {
  if (wordCount === 0 || wordCount > 18) return false;
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (tokens.length === 0) return false;
  const navCount = tokens.filter((token) => NAV_ONLY_TOKENS.has(token)).length;
  return navCount / tokens.length >= 0.7;
}

function detectShellOrError(haystack: string, charCount: number): string | null {
  for (const entry of SHELL_OR_ERROR_PATTERNS) {
    if (!entry.pattern.test(haystack)) continue;
    // Cookie/coming-soon mentions on otherwise substantial pages are allowed.
    if (
      (entry.code === "PAGE_COOKIE_WALL_ONLY" ||
        entry.code === "PAGE_COMING_SOON") &&
      charCount >= DEEP_SCRAPE_CRAWL_POLICY.minPageReadableChars * 3
    ) {
      continue;
    }
    return entry.code;
  }
  return null;
}

/**
 * Page-level gate: accept usable human-readable business content for synthesis.
 * Concise legitimate pages are accepted; shells/errors/parking are rejected.
 */
export function evaluateExtractedPageUsefulness(input: {
  title?: string | null;
  headings?: string[];
  metaDescription?: string | null;
  text: string;
  pageType?: string | null;
  seenFingerprints?: Set<string>;
}): ExtractedPageAcceptance {
  const title = (input.title ?? "").trim();
  const headings = (input.headings ?? []).map((value) => value.trim()).filter(Boolean);
  const metaDescription = (input.metaDescription ?? "").trim();
  const body = (input.text ?? "").replace(/\s+/g, " ").trim();
  const combined = [title, metaDescription, ...headings, body]
    .filter(Boolean)
    .join("\n")
    .replace(/\s+/g, " ")
    .trim();
  const charCount = combined.length;
  const wordCount = countWords(combined);
  const hasTitleOrHeading = Boolean(title) || headings.length > 0;
  const businessSignals = detectBusinessSignals(combined);
  const businessSignalCount = businessSignals.length;
  const fingerprint = charCount > 0 ? fingerprintExtractedText(combined) : null;
  const shellOrErrorPattern = detectShellOrError(combined, charCount);

  const base = {
    extractedCharacterCount: charCount,
    extractedWordCount: wordCount,
    businessSignals,
    businessSignalCount,
    blockedPattern: shellOrErrorPattern,
    shellOrErrorPattern,
    duplicateFingerprint: fingerprint,
    pageType: input.pageType ?? null,
    charCount,
    wordCount,
    hasTitleOrHeading,
  };

  if (!combined) {
    return {
      ...base,
      accepted: false,
      useful: false,
      rejectionCode: "PAGE_EMPTY",
      reason: "PAGE_EMPTY",
    };
  }

  if (
    fingerprint &&
    input.seenFingerprints?.has(fingerprint) &&
    input.pageType !== "homepage"
  ) {
    return {
      ...base,
      accepted: false,
      useful: false,
      rejectionCode: "PAGE_DUPLICATE",
      reason: "PAGE_DUPLICATE",
    };
  }

  if (shellOrErrorPattern) {
    return {
      ...base,
      accepted: false,
      useful: false,
      rejectionCode: shellOrErrorPattern,
      reason: shellOrErrorPattern,
    };
  }

  if (isNavigationOnly(combined, wordCount)) {
    return {
      ...base,
      accepted: false,
      useful: false,
      rejectionCode: "PAGE_NAVIGATION_ONLY",
      reason: "PAGE_NAVIGATION_ONLY",
      blockedPattern: "PAGE_NAVIGATION_ONLY",
    };
  }

  const meetsFloor =
    charCount >= DEEP_SCRAPE_CRAWL_POLICY.minPageReadableChars ||
    wordCount >= DEEP_SCRAPE_CRAWL_POLICY.minPageWordCount;
  const meetsSignalFloor =
    businessSignalCount > 0 &&
    charCount >= DEEP_SCRAPE_CRAWL_POLICY.minPageCharsWithSignal;

  if (!meetsFloor && !meetsSignalFloor) {
    return {
      ...base,
      accepted: false,
      useful: false,
      rejectionCode: "PAGE_NO_USABLE_TEXT",
      reason: "PAGE_NO_USABLE_TEXT",
    };
  }

  return {
    ...base,
    accepted: true,
    useful: true,
    rejectionCode: null,
    reason: "accepted",
  };
}

/** Compatibility wrapper used by existing call sites. */
export function evaluatePageUsefulness(input: {
  title?: string | null;
  headings?: string[];
  metaDescription?: string | null;
  text: string;
  pageType?: string | null;
  seenFingerprints?: Set<string>;
}): ExtractedPageAcceptance {
  return evaluateExtractedPageUsefulness(input);
}

export function evaluateCorpusUsefulness(
  pages: Array<{ text: string; title?: string | null; pageType?: string }>,
): {
  useful: boolean;
  code: "OK" | "NO_USABLE_PAGES" | "EMPTY_OR_UNUSABLE_CORPUS";
  combinedChars: number;
  combinedWords: number;
  acceptedPageCount: number;
} {
  if (pages.length === 0) {
    return {
      useful: false,
      code: "NO_USABLE_PAGES",
      combinedChars: 0,
      combinedWords: 0,
      acceptedPageCount: 0,
    };
  }

  const combined = pages
    .map((page) => [page.title ?? "", page.text].filter(Boolean).join(" "))
    .join("\n")
    .replace(/\s+/g, " ")
    .trim();
  const combinedChars = combined.length;
  const combinedWords = countWords(combined);

  if (
    combinedChars < DEEP_SCRAPE_CRAWL_POLICY.minCorpusReadableChars &&
    combinedWords < DEEP_SCRAPE_CRAWL_POLICY.minCorpusWordCount
  ) {
    return {
      useful: false,
      code: "EMPTY_OR_UNUSABLE_CORPUS",
      combinedChars,
      combinedWords,
      acceptedPageCount: pages.length,
    };
  }

  return {
    useful: true,
    code: "OK",
    combinedChars,
    combinedWords,
    acceptedPageCount: pages.length,
  };
}

const EXCLUDE_PATTERNS: RegExp[] = [
  /\/(privacy|privacy-policy|terms|terms-of-(service|use)|legal|cookie|cookies|gdpr)(\/|$)/i,
  /\/(login|log-in|signin|sign-in|signup|sign-up|register|account|auth|sso)(\/|$)/i,
  /\/(cart|checkout|basket|payment|billing|order)(\/|$)/i,
  /\/(feed|rss|atom|tag|tags|category\/page|author|archive|archives|search)(\/|$)/i,
  /\/(wp-content\/uploads|wp-includes|wp-json|graphql)(\/|$)/i,
  /\/page\/\d+(\/|$)/i,
  /\.(pdf|png|jpe?g|gif|webp|svg|mp4|mp3|zip|docx?|xlsx?|pptx?)(\?|$)/i,
  /^(mailto|tel|javascript|data):/i,
];

export type ScoredUrl = {
  url: string;
  score: number;
  pageType: string;
};

export {
  rankCrawlCandidates,
  scoreDeepScrapeCandidate,
  compareRankedCandidates,
  type DiscoveryProvenance,
  type RankedUrlCandidate,
  type ScoreFactor,
} from "@/services/websiteLearning/deepScrape/crawler/urlRelevance";

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
  // Compatibility wrapper over the shared structure-aware scorer.
  const ranked = scoreDeepScrapeCandidate({
    url,
    rootUrl: url,
    provenance: "unknown",
  });
  if (ranked.rejectedBeforeFetch || ranked.pageType === "invalid") {
    return { url, score: 0, pageType: "invalid" };
  }
  return {
    url: ranked.normalizedUrl,
    score: ranked.totalScore,
    pageType: ranked.pageType === "evergreen" ? "evergreen" : ranked.pageType,
  };
}

/** Prefer meaningful commercial pages; drop excluded / zero-score URLs. */
export function selectMeaningfulUrls(
  urls: string[],
  maxPages = DEEP_SCRAPE_CRAWL_POLICY.maxMeaningfulPages,
): ScoredUrl[] {
  const rootUrl =
    urls.find((url) => {
      try {
        const path = new URL(url).pathname;
        return path === "/" || path === "";
      } catch {
        return false;
      }
    }) ?? urls[0] ?? "https://example.com/";

  const ranked = rankCrawlCandidates({
    urls: urls
      .filter((url) => !isExcludedUrl(url) || scoreUrl(url).pageType === "homepage")
      .map((url) => ({ url, provenance: "sitemap" as const })),
    rootUrl,
    maxQueue: Math.max(maxPages * 4, maxPages),
  });

  const selected: ScoredUrl[] = [];
  const seen = new Set<string>();
  let otherCount = 0;

  for (const entry of ranked) {
    if (selected.length >= maxPages) break;
    if (seen.has(entry.normalizedUrl)) continue;
    const pageType =
      entry.pageType === "evergreen"
        ? "evergreen"
        : entry.pageType === "other"
          ? "other"
          : entry.pageType;
    if (pageType === "other") {
      if (otherCount >= 3) continue;
      otherCount += 1;
    }
    selected.push({
      url: entry.normalizedUrl,
      score: entry.totalScore,
      pageType,
    });
    seen.add(entry.normalizedUrl);
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
