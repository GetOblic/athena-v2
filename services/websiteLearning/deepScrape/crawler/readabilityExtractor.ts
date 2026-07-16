/**
 * Page-specific extraction cascade:
 * metadata/JSON-LD → fresh DOM → strip chrome → Readability → selector fallbacks → body.
 * Structured business data is retained separately and only lightly merged for synthesis.
 */

import { Readability } from "@mozilla/readability";
import * as cheerio from "cheerio";
import { JSDOM } from "jsdom";
import { hashMeaningfulContent } from "@/services/websiteLearning/deepScrape/crawler/boilerplate";
import type { StructuredBusinessData } from "@/services/websiteLearning/deepScrape/crawler/crawlerTypes";
import { DEEP_SCRAPE_CRAWL_POLICY } from "@/services/websiteLearning/deepScrape/crawlPolicy";
import {
  canonicalizePageUrl,
  isSameRegistrableDomain,
  resolveAbsoluteUrl,
} from "@/services/websiteLearning/deepScrape/urlSafety";

export type ReadabilityExtraction = {
  title: string | null;
  byline: string | null;
  excerpt: string | null;
  readableText: string;
  /** Page-specific text used for hashing (excludes sitewide structured blob). */
  meaningfulText: string;
  description: string | null;
  headings: string[];
  canonicalUrl: string | null;
  /** True when extracted canonical matches this page URL path. */
  selfCanonical: boolean;
  htmlLanguage: string | null;
  discoveredLinks: string[];
  structuredBusinessData: StructuredBusinessData;
  contentHash: string;
  readabilityUsed: boolean;
  extractionMethodSelected:
    | "readability"
    | "article"
    | "main"
    | "content_container"
    | "body_stripped"
    | "structured_only";
  preBoilerplateChars: number;
  pageSpecificHeading: string | null;
};

function emptyStructuredData(): StructuredBusinessData {
  return {
    types: [],
    organizationName: null,
    businessName: null,
    description: null,
    telephone: null,
    email: null,
    address: null,
    openingHours: [],
    socialLinks: [],
    services: [],
    products: [],
    people: [],
    faqs: [],
    reviews: [],
    rawJsonLdCount: 0,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function flattenJsonLd(node: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(node)) {
    for (const item of node) flattenJsonLd(item, out);
    return;
  }
  const record = asRecord(node);
  if (!record) return;
  if (Array.isArray(record["@graph"])) {
    flattenJsonLd(record["@graph"], out);
  }
  out.push(record);
}

function typeList(node: Record<string, unknown>): string[] {
  const raw = node["@type"];
  if (typeof raw === "string") return [raw];
  if (Array.isArray(raw)) {
    return raw.filter((value): value is string => typeof value === "string");
  }
  return [];
}

function formatAddress(value: unknown): string | null {
  if (typeof value === "string") return asString(value);
  const record = asRecord(value);
  if (!record) return null;
  const parts = [
    asString(record.streetAddress),
    asString(record.addressLocality),
    asString(record.addressRegion),
    asString(record.postalCode),
    asString(record.addressCountry),
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export function collectStructuredBusinessData(html: string): StructuredBusinessData {
  const data = emptyStructuredData();
  const $ = cheerio.load(html);
  const nodes: Record<string, unknown>[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).html()?.trim();
    if (!raw) return;
    try {
      flattenJsonLd(JSON.parse(raw), nodes);
      data.rawJsonLdCount += 1;
    } catch {
      // ignore
    }
  });

  const typeSet = new Set<string>();
  for (const node of nodes) {
    const types = typeList(node);
    for (const type of types) typeSet.add(type);

    const name = asString(node.name);
    if (name) {
      if (types.some((type) => /organization|localbusiness|store|clinic/i.test(type))) {
        data.organizationName = data.organizationName ?? name;
        data.businessName = data.businessName ?? name;
      }
      if (types.some((type) => /person/i.test(type))) data.people.push(name);
      if (types.some((type) => /service/i.test(type))) data.services.push(name);
      if (types.some((type) => /product|course/i.test(type))) data.products.push(name);
    }

    data.description =
      data.description ?? asString(node.description) ?? asString(node.slogan);
    data.telephone = data.telephone ?? asString(node.telephone);
    data.email = data.email ?? asString(node.email);
    data.address = data.address ?? formatAddress(node.address);

    const hours = node.openingHours ?? node.openingHoursSpecification;
    if (typeof hours === "string") data.openingHours.push(hours);
    if (Array.isArray(hours)) {
      for (const entry of hours) {
        if (typeof entry === "string") data.openingHours.push(entry);
        else {
          const record = asRecord(entry);
          const label = [
            asString(record?.dayOfWeek),
            asString(record?.opens),
            asString(record?.closes),
          ]
            .filter(Boolean)
            .join(" ");
          if (label) data.openingHours.push(label);
        }
      }
    }

    if (types.some((type) => /faqpage/i.test(type))) {
      const entities = Array.isArray(node.mainEntity)
        ? node.mainEntity
        : node.mainEntity
          ? [node.mainEntity]
          : [];
      for (const entity of entities) {
        const record = asRecord(entity);
        if (!record) continue;
        const question = asString(record.name);
        const accepted = asRecord(record.acceptedAnswer);
        const answer = asString(accepted?.text) ?? asString(record.text);
        if (question && answer) data.faqs.push({ question, answer });
      }
    }

    if (types.some((type) => /review/i.test(type))) {
      const reviewBody = asString(node.reviewBody) ?? asString(node.description);
      if (reviewBody) data.reviews.push(reviewBody);
    }

    const sameAs = node.sameAs;
    if (typeof sameAs === "string") data.socialLinks.push(sameAs);
    if (Array.isArray(sameAs)) {
      for (const link of sameAs) {
        if (typeof link === "string") data.socialLinks.push(link);
      }
    }
  }

  const mailto = $('a[href^="mailto:"]').first().attr("href");
  if (mailto) {
    data.email = data.email ?? mailto.replace(/^mailto:/i, "").split("?")[0] ?? null;
  }
  const tel = $('a[href^="tel:"]').first().attr("href");
  if (tel) {
    data.telephone = data.telephone ?? tel.replace(/^tel:/i, "").trim();
  }

  data.types = [...typeSet];
  data.openingHours = [...new Set(data.openingHours)].slice(0, 20);
  data.socialLinks = [...new Set(data.socialLinks)].slice(0, 20);
  data.services = [...new Set(data.services)].slice(0, 40);
  data.products = [...new Set(data.products)].slice(0, 40);
  data.people = [...new Set(data.people)].slice(0, 40);
  data.faqs = data.faqs.slice(0, 40);
  data.reviews = data.reviews.slice(0, 20);
  return data;
}

function extractHeadings($: cheerio.CheerioAPI): string[] {
  const headings: string[] = [];
  $("h1, h2, h3").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text) headings.push(text.slice(0, 200));
  });
  return headings.slice(0, 40);
}

function extractLinks(
  $: cheerio.CheerioAPI,
  baseUrl: string,
  registrableDomain: string,
): string[] {
  const links = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const absolute = resolveAbsoluteUrl(href, baseUrl);
    if (!absolute) return;
    if (!isSameRegistrableDomain(absolute, registrableDomain)) return;
    const canonical = canonicalizePageUrl(absolute);
    if (canonical) links.add(canonical);
  });
  return [...links].slice(0, DEEP_SCRAPE_CRAWL_POLICY.maxDiscoveredUrls);
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function sameUrlPath(a: string, b: string): boolean {
  try {
    const left = new URL(a);
    const right = new URL(b);
    const normalize = (pathname: string) =>
      pathname.replace(/\/+$/, "") || "/";
    return (
      left.hostname.replace(/^www\./, "") === right.hostname.replace(/^www\./, "") &&
      normalize(left.pathname) === normalize(right.pathname)
    );
  } catch {
    return false;
  }
}

const CONTENT_CONTAINER_SELECTORS = [
  "article",
  "main",
  '[role="main"]',
  ".entry-content",
  ".post-content",
  ".blog-content",
  ".article-content",
  ".page-content",
  ".content",
  "#content",
  ".site-main",
  ".elementor-widget-theme-post-content",
  ".wpb_text_column",
];

function stripNonContent($: cheerio.CheerioAPI): void {
  $(
    [
      "script",
      "style",
      "noscript",
      "svg",
      "iframe",
      "nav",
      "footer",
      "header",
      "aside",
      "[role='navigation']",
      "[role='banner']",
      "[role='contentinfo']",
      ".cookie",
      ".cookies",
      "#cookie",
      "#cookies",
      ".cookie-banner",
      ".cookie-consent",
      "#cookie-banner",
      ".cc-banner",
      ".cky-consent-container",
      ".modal",
      ".popup",
      ".newsletter",
      ".share",
      ".social",
      ".breadcrumb",
      ".breadcrumbs",
      "#comments",
      ".comments",
    ].join(", "),
  ).remove();
}

function textFromSelector($: cheerio.CheerioAPI, selector: string): string {
  const parts: string[] = [];
  $(selector).each((_, el) => {
    const text = normalizeText($(el).text());
    if (text) parts.push(text);
  });
  return normalizeText(parts.join("\n"));
}

function prepareHtmlClone(html: string): string {
  // Fresh cheerio document per call — never mutate a shared instance.
  const $ = cheerio.load(html);
  stripNonContent($);
  return $.root().html() ?? html;
}

function structuredSupplementText(data: StructuredBusinessData): string {
  // Page-local structured facts only (FAQ/services/products/people found on page).
  // Sitewide LocalBusiness contact blob is intentionally excluded from hashing.
  const parts = [
    ...data.services,
    ...data.products,
    ...data.people,
    ...data.faqs.map((faq) => `${faq.question} ${faq.answer}`),
    ...data.reviews,
  ].filter(Boolean);
  return normalizeText(parts.join("\n"));
}

function sitewideBusinessFacts(data: StructuredBusinessData): string {
  return normalizeText(
    [
      data.businessName,
      data.organizationName,
      data.description,
      data.telephone,
      data.email,
      data.address,
      ...data.openingHours,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

export function hashReadableContent(text: string): string {
  return hashMeaningfulContent(text);
}

export function extractWithReadability(input: {
  html: string;
  url: string;
  registrableDomain: string;
}): ReadabilityExtraction {
  // Always parse from the exact response body for this URL.
  const html = String(input.html ?? "");
  const $meta = cheerio.load(html);
  const structuredBusinessData = collectStructuredBusinessData(html);
  const headings = extractHeadings($meta);
  const description =
    $meta('meta[name="description"]').attr("content")?.trim() ||
    $meta('meta[property="og:description"]').attr("content")?.trim() ||
    null;
  const canonicalHref =
    $meta('link[rel="canonical"]').attr("href") ||
    $meta('meta[property="og:url"]').attr("content") ||
    null;
  const resolvedCanonical = canonicalHref
    ? canonicalizePageUrl(
        resolveAbsoluteUrl(canonicalHref, input.url) ?? canonicalHref,
      )
    : null;
  const pageCanonical = canonicalizePageUrl(input.url);
  const selfCanonical = Boolean(
    resolvedCanonical &&
      pageCanonical &&
      sameUrlPath(resolvedCanonical, pageCanonical),
  );
  const canonicalUrl = selfCanonical
    ? resolvedCanonical
    : pageCanonical;
  const htmlLanguage = $meta("html").attr("lang")?.trim() || null;
  const discoveredLinks = extractLinks($meta, input.url, input.registrableDomain);

  let title =
    $meta("title").first().text().replace(/\s+/g, " ").trim() || null;
  const pageSpecificHeading =
    $meta("h1").first().text().replace(/\s+/g, " ").trim() ||
    headings[0] ||
    null;
  let byline: string | null = null;
  let excerpt: string | null = null;
  let readableText = "";
  let readabilityUsed = false;
  let extractionMethodSelected: ReadabilityExtraction["extractionMethodSelected"] =
    "body_stripped";

  // Fresh DOM per URL for Readability.
  try {
    const cleanedHtml = prepareHtmlClone(html);
    const dom = new JSDOM(cleanedHtml, { url: input.url });
    try {
      const reader = new Readability(dom.window.document, {
        charThreshold: 40,
      });
      const article = reader.parse();
      if (article?.textContent) {
        const text = normalizeText(article.textContent);
        if (text.length >= 40) {
          readabilityUsed = true;
          extractionMethodSelected = "readability";
          title = article.title?.trim() || title;
          byline = article.byline?.trim() || null;
          excerpt = article.excerpt?.trim() || null;
          readableText = text;
        }
      }
    } finally {
      dom.window.close();
    }
  } catch {
    readabilityUsed = false;
  }

  if (!readableText || readableText.length < 60) {
    const $ = cheerio.load(html);
    stripNonContent($);

    for (const selector of CONTENT_CONTAINER_SELECTORS) {
      const candidate = textFromSelector($, selector);
      if (candidate.length > readableText.length && candidate.length >= 40) {
        readableText = candidate;
        if (selector === "article") extractionMethodSelected = "article";
        else if (selector === "main" || selector === '[role="main"]') {
          extractionMethodSelected = "main";
        } else {
          extractionMethodSelected = "content_container";
        }
      }
    }

    if (!readableText || readableText.length < 40) {
      const body = normalizeText($("body").text());
      if (body.length > readableText.length) {
        readableText = body;
        extractionMethodSelected = "body_stripped";
      }
    }
  }

  const pageLocalStructured = structuredSupplementText(structuredBusinessData);
  const meaningfulText = normalizeText(
    [pageSpecificHeading, title, description, readableText, pageLocalStructured]
      .filter(Boolean)
      .join("\n"),
  ).slice(0, DEEP_SCRAPE_CRAWL_POLICY.maxExtractedCharsPerPage);

  // For synthesis corpus, optionally append sitewide facts once-worth of signal,
  // but never let them dominate hashing when page text exists.
  const sitewide = sitewideBusinessFacts(structuredBusinessData);
  let synthesisText = meaningfulText;
  if (meaningfulText.length < 80 && sitewide) {
    synthesisText = normalizeText(`${meaningfulText}\n${sitewide}`);
    if (!meaningfulText) extractionMethodSelected = "structured_only";
  } else if (sitewide && meaningfulText.length > 0) {
    // Keep sitewide facts out of the primary page body; synthesis can use structuredBusinessData.
    synthesisText = meaningfulText;
  }

  const contentHash = hashMeaningfulContent(
    [
      pageSpecificHeading ?? "",
      meaningfulText,
      // Intentionally exclude sitewide LocalBusiness blob from hash.
    ].join("\n"),
  );

  return {
    title,
    byline,
    excerpt: excerpt ?? description,
    readableText: synthesisText.slice(
      0,
      DEEP_SCRAPE_CRAWL_POLICY.maxExtractedCharsPerPage,
    ),
    meaningfulText,
    description,
    headings,
    canonicalUrl,
    selfCanonical,
    htmlLanguage,
    discoveredLinks,
    structuredBusinessData,
    contentHash,
    readabilityUsed,
    extractionMethodSelected,
    preBoilerplateChars: meaningfulText.length,
    pageSpecificHeading,
  };
}

export function hasStructuredBusinessSignal(
  data: StructuredBusinessData,
): boolean {
  return Boolean(
    data.types.length ||
      data.telephone ||
      data.email ||
      data.address ||
      data.organizationName ||
      data.businessName ||
      data.services.length ||
      data.products.length ||
      data.people.length ||
      data.faqs.length ||
      data.openingHours.length,
  );
}

export function looksLikeJsShell(html: string, readableText: string): boolean {
  const haystack = `${html.slice(0, 20_000)}\n${readableText}`.toLowerCase();
  if (
    /\b(enable javascript|you need to enable javascript|this site requires javascript)\b/i.test(
      haystack,
    )
  ) {
    return true;
  }
  if (readableText.replace(/\s+/g, " ").trim().length >= 80) {
    return false;
  }
  const hasAppRoot =
    /<div[^>]+id=["'](root|app|__next|__nuxt)["']/i.test(html) ||
    /data-reactroot|ng-version=|webpackJsonp|__NEXT_DATA__/i.test(html);
  return hasAppRoot;
}

export function htmlSuggestsUniqueContent(html: string): boolean {
  // Substantial page-specific DOM markers while extraction stayed generic.
  const sample = html.slice(0, 80_000);
  const headingCount = (sample.match(/<h1[\s>]/gi) ?? []).length;
  const paragraphCount = (sample.match(/<p[\s>]/gi) ?? []).length;
  const articleOrMain = /<(article|main)[\s>]/i.test(sample);
  const jsonLd = /application\/ld\+json/i.test(sample);
  return (
    articleOrMain ||
    headingCount >= 1 ||
    paragraphCount >= 3 ||
    (jsonLd && paragraphCount >= 1)
  );
}
