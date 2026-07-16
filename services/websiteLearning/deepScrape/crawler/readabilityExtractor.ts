/**
 * Mozilla Readability + JSDOM extraction, augmented with structured business data.
 */

import { createHash } from "node:crypto";
import { Readability } from "@mozilla/readability";
import * as cheerio from "cheerio";
import { JSDOM } from "jsdom";
import { DEEP_SCRAPE_CRAWL_POLICY } from "@/services/websiteLearning/deepScrape/crawlPolicy";
import {
  canonicalizePageUrl,
  isSameRegistrableDomain,
  resolveAbsoluteUrl,
} from "@/services/websiteLearning/deepScrape/urlSafety";
import type { StructuredBusinessData } from "@/services/websiteLearning/deepScrape/crawler/crawlerTypes";

export type ReadabilityExtraction = {
  title: string | null;
  byline: string | null;
  excerpt: string | null;
  readableText: string;
  description: string | null;
  headings: string[];
  canonicalUrl: string | null;
  htmlLanguage: string | null;
  discoveredLinks: string[];
  structuredBusinessData: StructuredBusinessData;
  contentHash: string;
  readabilityUsed: boolean;
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

function collectStructuredBusinessData(html: string): StructuredBusinessData {
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
      // ignore malformed JSON-LD blocks
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
      if (types.some((type) => /person/i.test(type))) {
        data.people.push(name);
      }
      if (types.some((type) => /service/i.test(type))) {
        data.services.push(name);
      }
      if (types.some((type) => /product|course/i.test(type))) {
        data.products.push(name);
      }
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

  // Lightweight non-JSON-LD contact signals.
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

function cheerioVisibleText($: cheerio.CheerioAPI): string {
  $("script, style, noscript, svg, iframe").remove();
  const title = $("title").first().text().trim();
  const meta = $('meta[name="description"]').attr("content")?.trim() ?? "";
  const body = $("body").text().replace(/\s+/g, " ").trim();
  return [title, meta, body].filter(Boolean).join("\n").trim();
}

function structuredFallbackText(data: StructuredBusinessData): string {
  const parts = [
    data.businessName,
    data.organizationName,
    data.description,
    data.telephone,
    data.email,
    data.address,
    ...data.openingHours,
    ...data.services,
    ...data.products,
    ...data.people,
    ...data.faqs.map((faq) => `${faq.question} ${faq.answer}`),
    ...data.reviews,
  ].filter(Boolean);
  return parts.join("\n").replace(/\s+/g, " ").trim();
}

export function hashReadableContent(text: string): string {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  return createHash("sha256").update(normalized).digest("hex");
}

export function extractWithReadability(input: {
  html: string;
  url: string;
  registrableDomain: string;
}): ReadabilityExtraction {
  const $ = cheerio.load(input.html);
  const structuredBusinessData = collectStructuredBusinessData(input.html);
  const headings = extractHeadings($);
  const description =
    $('meta[name="description"]').attr("content")?.trim() ||
    $('meta[property="og:description"]').attr("content")?.trim() ||
    null;
  const canonicalHref =
    $('link[rel="canonical"]').attr("href") ||
    $('meta[property="og:url"]').attr("content") ||
    null;
  const canonicalUrl = canonicalHref
    ? canonicalizePageUrl(resolveAbsoluteUrl(canonicalHref, input.url) ?? canonicalHref)
    : canonicalizePageUrl(input.url);
  const htmlLanguage = $("html").attr("lang")?.trim() || null;
  const discoveredLinks = extractLinks($, input.url, input.registrableDomain);

  let title = $("title").first().text().replace(/\s+/g, " ").trim() || null;
  let byline: string | null = null;
  let excerpt: string | null = null;
  let readableText = "";
  let readabilityUsed = false;

  try {
    const dom = new JSDOM(input.html, { url: input.url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    if (article) {
      readabilityUsed = true;
      title = article.title?.trim() || title;
      byline = article.byline?.trim() || null;
      excerpt = article.excerpt?.trim() || null;
      readableText = (article.textContent ?? "").replace(/\s+/g, " ").trim();
    }
    dom.window.close();
  } catch {
    readabilityUsed = false;
  }

  if (!readableText || readableText.length < 40) {
    const fallback = cheerioVisibleText($);
    if (fallback.length > readableText.length) {
      readableText = fallback;
    }
  }

  const structuredText = structuredFallbackText(structuredBusinessData);
  if (structuredText) {
    readableText = [readableText, structuredText]
      .filter(Boolean)
      .join("\n")
      .replace(/\s+/g, " ")
      .trim();
  }

  readableText = readableText.slice(
    0,
    DEEP_SCRAPE_CRAWL_POLICY.maxExtractedCharsPerPage,
  );

  return {
    title,
    byline,
    excerpt: excerpt ?? description,
    readableText,
    description,
    headings,
    canonicalUrl,
    htmlLanguage,
    discoveredLinks,
    structuredBusinessData,
    contentHash: hashReadableContent(
      `${title ?? ""}\n${readableText}\n${structuredText}`,
    ),
    readabilityUsed,
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
