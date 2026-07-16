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

export type NormalizedPageDocument = {
  url: string;
  canonicalUrl: string;
  finalUrl: string;
  title: string | null;
  description: string | null;
  headings: string[];
  readableText: string;
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

export type CrawlerRunStats = {
  candidatesDiscovered: number;
  fetchesAttempted: number;
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
};

export type CrawlerRunResult = {
  pages: NormalizedPageDocument[];
  stats: CrawlerRunStats;
};

export type CrawlerRunInput = {
  websiteUrl: string;
  organizationId: string;
  jobId: string;
  sourceType: "brain" | "prospect";
  onProgress?: (progress: CrawlerProgress) => void | Promise<void>;
};
