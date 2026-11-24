/** Bounded local prototype. These caps are not production crawl policy. */
export const MONITOR_LIMITS = {
  maxFamilies: 20,
  maxListingPages: 2,
  maxProductUrls: 80,
  maxRequests: 40,
  maxConcurrency: 1,
  delayMs: 400,
  pageTimeoutMs: 20_000,
  siteDeadlineMs: 8 * 60_000,
  maxHtmlBytes: 4_000_000,
  maxTextLength: 300,
} as const;
