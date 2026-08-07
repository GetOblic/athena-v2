/**
 * Normalized crawl contracts for Deep Website Scrape.
 * Crawlee/Playwright types must not leak past this boundary.
 */

export type ExtractionMethod = "cheerio_readability" | "playwright_readability";

export type StructuredBusinessData = {
  types: string[];
  organizationName: string | null;
  businessName: string | null;
  description: string | null;
  telephone: string | null;
  email: string | null;
  address: string | null;
  openingHours: string[];
  socialLinks: string[];
  services: string[];
  products: string[];
  people: string[];
  faqs: Array<{ question: string; answer: string }>;
  reviews: string[];
  rawJsonLdCount: number;
};

/** Heading with explicit level — additive for Technical SEO persistence. */
export type NormalizedHeadingEntry = {
  level: number;
  text: string;
};

export type NormalizedImageAltCoverage = {
  total: number;
  withAlt: number;
  missingAlt: number;
};

export type NormalizedHreflangAlternate = {
  hreflang: string;
  href: string;
};

export type NormalizedInternalLinkSample = {
  url: string;
  anchor: string | null;
  provenance: string | null;
};

export type NormalizedPageDocument = {
  url: string;
  canonicalUrl: string;
  finalUrl: string;
  title: string | null;
  description: string | null;
  /** Text-only headings (legacy consumers / usefulness). */
  headings: string[];
  readableText: string;
  meaningfulText: string;
  htmlLanguage: string | null;
  pageType: string;
  statusCode: number;
  contentType: string;
  extractionMethod: ExtractionMethod;
  renderedWithBrowser: boolean;
  discoveredLinks: string[];
  structuredBusinessData: StructuredBusinessData;
  contentHash: string;
  fetchedAt: string;
  responseBytes: number;
  redirectCount: number;
  selfCanonical: boolean;
  extractionMethodSelected?: string;
  preBoilerplateChars?: number;
  postBoilerplateChars?: number;
  /** Discovery provenance at accept time (nav/sitemap/…). */
  discoveryProvenance?: string;
  /** Ranked-plan score at accept time. */
  rankScore?: number;
  /** Index in the ranked fetch plan (homepage = 0), when known. */
  rankedPlanIndex?: number | null;
  /**
   * Declared canonical href when present (may differ from identity canonicalUrl).
   * Additive — does not change crawl identity / acceptance.
   */
  declaredCanonicalUrl?: string | null;
  /** Headings with level + text for Technical SEO persistence. */
  headingEntries?: NormalizedHeadingEntry[];
  robotsMeta?: string | null;
  imageAltCoverage?: NormalizedImageAltCoverage | null;
  hreflangAlternates?: NormalizedHreflangAlternate[];
  /** Bounded internal-link sample with anchor + provenance. */
  internalLinksSample?: NormalizedInternalLinkSample[];
};

export type PageClassificationResult = {
  accepted: boolean;
  rejectionCode: string | null;
  needsPlaywrightFallback: boolean;
  extractedCharacterCount: number;
  extractedWordCount: number;
  businessSignals: string[];
  structuredDataTypes: string[];
  blockedPattern: string | null;
  duplicateFingerprint: string | null;
  pageType: string;
};

export type CrawlerProgress = {
  stage: "discovering" | "crawling" | "rendering" | "synthesizing";
  pagesDiscovered: number;
  pagesAttempted: number;
  pagesAccepted: number;
  pagesRendered: number;
  pagesRejected: number;
  pagesCrawled: number;
  pagesTarget: number;
};

export type CorpusStopReason = "page_cap" | "char_cap" | "exhausted";

export type CrawlerRunStats = {
  candidatesDiscovered: number;
  fetchesAttempted: number;
  /** Pages included in the final synthesis corpus (after char/page bind). */
  pagesAccepted: number;
  pagesRejected: number;
  pagesRendered: number;
  rejectedByReason: Record<string, number>;
  cheerioProcessed: number;
  playwrightProcessed: number;
  combinedExtractedChars: number;
  combinedExtractedWords: number;
  browserFallbackUsed: boolean;
  queueSizeBounded: boolean;
  browserClosed: boolean;
  /** Additive diagnostics — do not replace legacy counters. */
  rankedCandidatesSelected?: number;
  rankedHandlersEntered?: number;
  pagesFetched?: number;
  pagesExtracted?: number;
  pagesAcceptedBeforeCorpusBound?: number;
  pagesIncludedInCorpus?: number;
  corpusStopReason?: CorpusStopReason;
  primaryNavigationSelected?: number;
  primaryNavigationAccepted?: number;
  primaryNavigationIncluded?: number;
  primaryNavigationRejectedByReason?: Record<string, number>;
};

export type CrawlerRunResult = {
  pages: NormalizedPageDocument[];
  stats: CrawlerRunStats;
};

export type CrawlerRunInput = {
  websiteUrl: string;
  organizationId: string;
  jobId: string;
  sourceType: "brain" | "prospect" | "persona";
  onProgress?: (progress: CrawlerProgress) => void | Promise<void>;
};
