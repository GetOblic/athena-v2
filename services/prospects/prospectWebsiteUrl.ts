/**
 * URL normalization and crawl eligibility for Prospect website intelligence.
 * Never leaves the original domain; ignores media, PDFs, and noise paths.
 */

export const WEBSITE_INTELLIGENCE_MAX_PAGES = 10;

const MEDIA_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "svg",
  "ico",
  "bmp",
  "mp4",
  "webm",
  "mov",
  "avi",
  "mp3",
  "wav",
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "zip",
  "rar",
  "gz",
  "css",
  "js",
  "mjs",
  "map",
  "json",
  "xml",
  "rss",
  "atom",
]);

const IGNORE_PATH_TOKENS = [
  "blog",
  "news",
  "press",
  "events",
  "privacy",
  "cookies",
  "terms",
  "login",
  "register",
  "account",
  "checkout",
  "cart",
  "search",
  "author",
  "archive",
  "tag",
  "rss",
  "feed",
  "wp-admin",
  "wp-login",
  "cdn-cgi",
];

function hostnameKey(hostname: string): string {
  return hostname.replace(/^www\./i, "").toLowerCase();
}

export function getUrlExtension(pathname: string): string {
  const base = pathname.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function isIgnoredCrawlPath(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  return IGNORE_PATH_TOKENS.some(
    (token) =>
      lower === `/${token}` ||
      lower.startsWith(`/${token}/`) ||
      lower.includes(`/${token}/`) ||
      lower.endsWith(`/${token}`),
  );
}

export function isNonHtmlResource(pathname: string): boolean {
  const ext = getUrlExtension(pathname);
  return Boolean(ext) && MEDIA_EXTENSIONS.has(ext);
}

/**
 * Normalize a candidate href against a base page URL.
 * Returns null when the URL must not be crawled.
 */
export function normalizeCrawlUrl(
  href: string,
  baseUrl: string,
): string | null {
  const raw = String(href ?? "").trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();
  if (
    lower.startsWith("mailto:") ||
    lower.startsWith("tel:") ||
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("#")
  ) {
    return null;
  }

  let resolved: URL;
  let base: URL;
  try {
    base = new URL(baseUrl);
    resolved = new URL(raw, base);
  } catch {
    return null;
  }

  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
    return null;
  }

  if (hostnameKey(resolved.hostname) !== hostnameKey(base.hostname)) {
    return null;
  }

  // Ignore query-string variants and fragments.
  resolved.hash = "";
  resolved.search = "";

  if (isNonHtmlResource(resolved.pathname)) {
    return null;
  }

  if (isIgnoredCrawlPath(resolved.pathname)) {
    return null;
  }

  // Normalize trailing slash (keep root as /).
  if (resolved.pathname.length > 1 && resolved.pathname.endsWith("/")) {
    resolved.pathname = resolved.pathname.slice(0, -1);
  }

  return resolved.toString();
}

export function isSameSiteUrl(candidateUrl: string, rootUrl: string): boolean {
  try {
    const candidate = new URL(candidateUrl);
    const root = new URL(rootUrl);
    return hostnameKey(candidate.hostname) === hostnameKey(root.hostname);
  } catch {
    return false;
  }
}
