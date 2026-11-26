/**
 * Solusquare production adapter.
 * Ports the accepted Toscane parser: homepage categories, listing pagination,
 * sitemap enumeration, prodID family identity, and separate size and length fields.
 * Ordinary HTTP only. No browser rendering.
 */

import * as cheerio from "cheerio";

import type {
  MonitorAdapterCategory,
  MonitorAdapterFamilyRef,
  MonitorAdapterResult,
  MonitorEnumerationValue,
  MonitorExtractedProduct,
  MonitorPageFetch,
  MonitorProductionAdapter,
} from "@/services/monitor/monitorAdapter";
import { hostMatchesRegistrableDomain, isHardDeniedMonitorUrl } from "@/services/monitor/monitorSources";
import { categoryKeyFromUrl } from "@/services/monitor/monitorWebsiteIdentity";
import { MONITOR_ADAPTER_VERSION } from "@/services/monitor/monitorTypes";
import { parseSolusquareProduct, prodIdFromSolusquareUrl } from "@/services/monitor/solusquareProduct";

const SOLUSQUARE_CATEGORY = /-c-\d+\.htm$/i;
const SOLUSQUARE_PAGE = /-page-\d+\.htm$/i;
const LISTING_PATH = /^(.*-c-\d+)(?:-page-(\d+))?\.htm$/i;
/**
 * Hard safety backstop. Do not raise it to conceal a pagination cycle.
 * A reached bound stays incomplete and keeps a forward resume URL when one exists.
 */
const MAX_LISTING_PAGES = 500;
const MAX_SITEMAPS = 20;
/**
 * Contradictory listing pagination: a self-link, a repeated URL, a backward move,
 * or an explicit next link that is not a forward page of this category.
 * Source coverage stores the code. The jobs error_code check already accepts this
 * shape, and Monitor presentation does not translate listing diagnostics, so no
 * schema or UI change is required. done:false with this code leaves coverage
 * incomplete; partial coverage is not an open phase, so the worker does not retry.
 */
const PAGINATION_LOOP = "PAGINATION_LOOP";

const IRRELEVANT =
  /cadeau|gift|panier|compte|connexion|login|search|recherche|blog|magazine|newsletter|wishlist|favori|accueil|home/i;

function blocked(message: string): MonitorAdapterResult<never> {
  return { ok: false, code: "fetch_failed", message };
}

function absoluteUrl(href: string, baseUrl: string): string | null {
  try {
    const url = new URL(href, baseUrl);
    url.hash = "";
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (isHardDeniedMonitorUrl(url.toString())) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isSolusquareCategoryPath(pathname: string): boolean {
  return (
    SOLUSQUARE_CATEGORY.test(pathname) &&
    !/-cl-\d+\.htm$/i.test(pathname) &&
    !SOLUSQUARE_PAGE.test(pathname) &&
    !/-p-\d+-coul-\d+\.htm$/i.test(pathname)
  );
}

export function discoverSolusquareCategories(html: string, pageUrl: string): MonitorAdapterCategory[] {
  const $ = cheerio.load(html);
  const found: MonitorAdapterCategory[] = [];
  const seen = new Set<string>();
  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    const canonicalUrl = absoluteUrl(href, pageUrl);
    if (!canonicalUrl) return;
    let pathname = "";
    try {
      pathname = decodeURIComponent(new URL(canonicalUrl).pathname);
    } catch {
      return;
    }
    if (!isSolusquareCategoryPath(pathname)) return;
    const displayName = $(element).text().replace(/\s+/g, " ").trim().slice(0, 200);
    if (!displayName || IRRELEVANT.test(displayName) || IRRELEVANT.test(pathname)) return;
    let categoryKey = "";
    try {
      categoryKey = categoryKeyFromUrl(canonicalUrl);
    } catch {
      return;
    }
    if (seen.has(categoryKey)) return;
    let parentCategoryKey: string | null = null;
    $(element)
      .parents("li")
      .each((__, parent) => {
        if (parentCategoryKey) return;
        const parentHref = $(parent).children("a[href]").first().attr("href");
        if (!parentHref) return;
        const parentUrl = absoluteUrl(parentHref, pageUrl);
        if (!parentUrl || parentUrl === canonicalUrl) return;
        try {
          const parentPath = decodeURIComponent(new URL(parentUrl).pathname);
          if (!isSolusquareCategoryPath(parentPath)) return;
          parentCategoryKey = categoryKeyFromUrl(parentUrl);
        } catch {
          parentCategoryKey = null;
        }
      });
    seen.add(categoryKey);
    found.push({ displayName, canonicalUrl, parentCategoryKey });
  });
  const keys = new Set(found.map((category) => categoryKeyFromUrl(category.canonicalUrl)));
  return found.map((category) => ({
    ...category,
    parentCategoryKey:
      category.parentCategoryKey && keys.has(category.parentCategoryKey) && category.parentCategoryKey !== categoryKeyFromUrl(category.canonicalUrl)
        ? category.parentCategoryKey
        : null,
  }));
}

function productLinks(html: string, pageUrl: string): string[] {
  const $ = cheerio.load(html);
  const links: string[] = [];
  const seen = new Set<string>();
  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    const absolute = absoluteUrl(href, pageUrl);
    if (!absolute) return;
    if (!prodIdFromSolusquareUrl(absolute)) return;
    if (seen.has(absolute)) return;
    seen.add(absolute);
    links.push(absolute);
  });
  return links;
}

type ListingLocation = {
  href: string;
  key: string;
  host: string;
  stem: string;
  page: number;
};

type ListingStep =
  | { kind: "forward"; url: string; key: string; page: number }
  | { kind: "complete" }
  | { kind: "anomaly" };

function listingLocation(raw: string, baseUrl: string, registrableDomain: string): ListingLocation | null {
  const absolute = absoluteUrl(raw, baseUrl);
  if (!absolute) return null;
  let url: URL;
  try {
    url = new URL(absolute);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostMatchesRegistrableDomain(host, registrableDomain)) return null;
  let pathname = "";
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  const match = pathname.match(LISTING_PATH);
  const stem = match?.[1]?.toLowerCase();
  if (!stem || /-cl-\d+\.htm$/i.test(pathname)) return null;
  let page = 1;
  if (match?.[2]) {
    if (!/^[1-9]\d*$/.test(match[2])) return null;
    page = Number(match[2]);
    if (!Number.isSafeInteger(page) || page < 1) return null;
  }
  return { href: absolute, key: `${host}|${stem}|${page}`, host, stem, page };
}

function sameListing(candidate: ListingLocation, origin: ListingLocation): boolean {
  return candidate.host === origin.host && candidate.stem === origin.stem;
}

/**
 * The next page is the lowest numbered listing page strictly after the current one.
 * An explicit rel=next link is accepted only when it passes that forward check.
 * A closer numbered page wins over an explicit link that would skip it.
 * Previous-page links alone are a legitimate final page.
 * An explicit next link that is not forward, with no forward candidate, is an anomaly.
 */
function decideNextListing(
  html: string,
  pageUrl: string,
  registrableDomain: string,
  origin: ListingLocation,
): ListingStep {
  const current = listingLocation(pageUrl, pageUrl, registrableDomain);
  if (!current || !sameListing(current, origin)) return { kind: "anomaly" };
  const $ = cheerio.load(html);
  const selected: { page: ListingLocation | null } = { page: null };
  let explicitInvalid = false;
  const consider = (candidate: ListingLocation | null): boolean => {
    if (!candidate || !sameListing(candidate, origin) || candidate.page <= current.page) return false;
    if (!selected.page || candidate.page < selected.page.page) selected.page = candidate;
    return true;
  };
  const collectExplicit = (selector: string) => {
    $(selector).each((_, element) => {
      const rel = ($(element).attr("rel") ?? "").toLowerCase().split(/\s+/);
      if (!rel.includes("next")) return;
      const href = ($(element).attr("href") ?? "").trim();
      if (!consider(href ? listingLocation(href, pageUrl, registrableDomain) : null)) {
        explicitInvalid = true;
      }
    });
  };
  collectExplicit("a[rel]");
  collectExplicit("link[rel]");
  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href || !/-page-\d+\.htm/i.test(href)) return;
    consider(listingLocation(href, pageUrl, registrableDomain));
  });
  const chosen = selected.page;
  if (chosen) return { kind: "forward", url: chosen.href, key: chosen.key, page: chosen.page };
  if (explicitInvalid) return { kind: "anomaly" };
  return { kind: "complete" };
}

function paginationLoop(families: MonitorAdapterFamilyRef[]): MonitorAdapterResult<MonitorEnumerationValue> {
  return {
    ok: true,
    value: { families, done: false, resumeUrl: null, errorCode: PAGINATION_LOOP },
  };
}

function familiesFromUrls(
  urls: readonly string[],
  categoryKey: string | null,
  alreadySeen: ReadonlySet<string>,
  familyLimit: number,
): { families: MonitorAdapterFamilyRef[]; limited: boolean } {
  const families: MonitorAdapterFamilyRef[] = [];
  const seen = new Set(alreadySeen);
  let limited = false;
  for (const productUrl of urls) {
    const familyId = prodIdFromSolusquareUrl(productUrl);
    if (!familyId || seen.has(familyId)) continue;
    if (families.length >= familyLimit) {
      limited = true;
      break;
    }
    seen.add(familyId);
    families.push({ familyId, productUrl, categoryKey });
  }
  return { families, limited };
}

async function readListing(input: {
  startUrl: string;
  categoryKey: string | null;
  registrableDomain: string;
  fetchPage: MonitorPageFetch;
  timeoutMs: number;
  signal?: AbortSignal;
  resumeUrl: string | null;
  familyLimit: number;
  alreadySeen: ReadonlySet<string>;
}): Promise<MonitorAdapterResult<MonitorEnumerationValue>> {
  const families: MonitorAdapterFamilyRef[] = [];
  const seen = new Set(input.alreadySeen);
  const origin = listingLocation(input.startUrl, input.startUrl, input.registrableDomain);
  if (!origin) return paginationLoop(families);
  let url = input.resumeUrl ?? input.startUrl;
  const visited = new Set<string>();
  let pages = 0;
  while (url && families.length < input.familyLimit && pages < MAX_LISTING_PAGES) {
    if (input.signal?.aborted) return blocked("The listing request was aborted.");
    const requested = listingLocation(url, origin.href, input.registrableDomain);
    if (!requested || !sameListing(requested, origin) || visited.has(requested.key)) {
      return paginationLoop(families);
    }
    visited.add(requested.key);
    const page = await input.fetchPage({
      url: requested.href,
      registrableDomain: input.registrableDomain,
      timeoutMs: input.timeoutMs,
      signal: input.signal,
    });
    if (!page.ok || !page.bodyText) {
      return {
        ok: true,
        value: {
          families,
          done: false,
          resumeUrl: requested.href,
          errorCode: page.errorCode ?? "FETCH_FAILED",
        },
      };
    }
    const landed = listingLocation(page.finalUrl, page.finalUrl, input.registrableDomain);
    if (
      !landed ||
      !sameListing(landed, origin) ||
      landed.page < requested.page ||
      (landed.key !== requested.key && visited.has(landed.key))
    ) {
      return paginationLoop(families);
    }
    if (landed.key !== requested.key) visited.add(landed.key);
    const links = productLinks(page.bodyText, landed.href);
    const batch = familiesFromUrls(links, input.categoryKey, seen, input.familyLimit - families.length);
    for (const family of batch.families) {
      seen.add(family.familyId);
      families.push(family);
    }
    const decision = decideNextListing(page.bodyText, landed.href, input.registrableDomain, origin);
    const forward =
      decision.kind === "forward" && decision.page > landed.page && !visited.has(decision.key)
        ? decision
        : null;
    const moreOnPage = links.some((link) => {
      const familyId = prodIdFromSolusquareUrl(link);
      return familyId != null && !seen.has(familyId);
    });
    if (families.length >= input.familyLimit) {
      if (moreOnPage) {
        return { ok: true, value: { families, done: false, resumeUrl: landed.href } };
      }
      if (forward) {
        return { ok: true, value: { families, done: false, resumeUrl: forward.url } };
      }
      if (decision.kind === "complete") {
        return { ok: true, value: { families, done: true, resumeUrl: null } };
      }
      return paginationLoop(families);
    }
    if (decision.kind === "complete") {
      return { ok: true, value: { families, done: true, resumeUrl: null } };
    }
    if (!forward) return paginationLoop(families);
    url = forward.url;
    pages += 1;
  }
  if (pages >= MAX_LISTING_PAGES && url) {
    return {
      ok: true,
      value: { families, done: false, resumeUrl: url, errorCode: "LISTING_BOUND" },
    };
  }
  return { ok: true, value: { families, done: true, resumeUrl: null } };
}

function sitemapLocs(xml: string): string[] {
  const locs: string[] = [];
  const pattern = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let match = pattern.exec(xml);
  while (match) {
    if (match[1]) locs.push(match[1].trim());
    match = pattern.exec(xml);
  }
  return locs;
}

async function readSitemapProducts(input: {
  origin: string;
  registrableDomain: string;
  fetchPage: MonitorPageFetch;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<string[] | null> {
  const root = await input.fetchPage({
    url: `${input.origin}/sitemap.xml`,
    registrableDomain: input.registrableDomain,
    timeoutMs: input.timeoutMs,
    acceptXml: true,
    signal: input.signal,
  });
  if (!root.ok || !root.bodyText) return null;
  const locs = sitemapLocs(root.bodyText);
  const products: string[] = [];
  const nested = locs.filter((loc) => /sitemap/i.test(loc) && !prodIdFromSolusquareUrl(loc)).slice(0, MAX_SITEMAPS);
  const pages = locs.some((loc) => prodIdFromSolusquareUrl(loc)) ? [root.bodyText] : [];
  for (const loc of nested) {
    if (input.signal?.aborted) break;
    const child = await input.fetchPage({
      url: loc,
      registrableDomain: input.registrableDomain,
      timeoutMs: input.timeoutMs,
      acceptXml: true,
      signal: input.signal,
    });
    if (child.ok && child.bodyText) pages.push(child.bodyText);
  }
  if (pages.length === 0 && locs.length > 0 && nested.length === 0) return null;
  for (const page of pages.length > 0 ? pages : [root.bodyText]) {
    for (const loc of sitemapLocs(page)) {
      if (prodIdFromSolusquareUrl(loc)) products.push(loc);
    }
  }
  return products.length > 0 ? products : null;
}

function formatPrice(value: number | null): string | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  return (Math.round(value * 100) / 100).toFixed(2);
}

function httpsImage(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || isHardDeniedMonitorUrl(url.toString())) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function splitSizeAndLength(labels: readonly string[]): { sizes: string[] | null; lengths: string[] | null } {
  const sizes: string[] = [];
  const lengths: string[] = [];
  for (const label of labels) {
    if (/longueur|length/i.test(label)) lengths.push(label);
    else sizes.push(label);
  }
  return {
    sizes: sizes.length > 0 ? sizes : null,
    lengths: lengths.length > 0 ? lengths : null,
  };
}

export const solusquareProductionAdapter: MonitorProductionAdapter = {
  id: "solusquare",
  version: MONITOR_ADAPTER_VERSION,
  recognizes(sourceId: string): boolean {
    return sourceId === "toscane";
  },
  async discoverCategories(input) {
    if (input.signal?.aborted) return blocked("Category discovery was aborted.");
    const page = await input.fetchPage({
      url: input.canonicalUrl,
      registrableDomain: input.registrableDomain,
      timeoutMs: input.timeoutMs,
      signal: input.signal,
    });
    if (!page.ok || !page.bodyText) {
      return blocked(page.errorCode ?? "Category discovery failed.");
    }
    const categories = discoverSolusquareCategories(page.bodyText, page.finalUrl);
    return { ok: true, value: { categories, complete: categories.length > 0 } };
  },
  async enumerateScope(input) {
    if (input.familyLimit <= 0) {
      return { ok: true, value: { families: [], done: false, resumeUrl: input.resumeUrl } };
    }
    if (input.scope.kind === "category") {
      return readListing({
        startUrl: input.scope.canonicalUrl,
        categoryKey: input.scope.categoryKey,
        registrableDomain: input.registrableDomain,
        fetchPage: input.fetchPage,
        timeoutMs: input.timeoutMs,
        signal: input.signal,
        resumeUrl: input.resumeUrl,
        familyLimit: input.familyLimit,
        alreadySeen: input.alreadySeen,
      });
    }
    const origin = new URL(input.scope.canonicalUrl).origin;
    const resumeIsListing = input.resumeUrl != null && !/sitemap/i.test(input.resumeUrl);
    if (!resumeIsListing) {
      const products = await readSitemapProducts({
        origin,
        registrableDomain: input.registrableDomain,
        fetchPage: input.fetchPage,
        timeoutMs: input.timeoutMs,
        signal: input.signal,
      });
      if (products) {
        const batch = familiesFromUrls(products, null, input.alreadySeen, input.familyLimit);
        const seenAfter = new Set(input.alreadySeen);
        for (const family of batch.families) seenAfter.add(family.familyId);
        const remaining = products.some((url) => {
          const familyId = prodIdFromSolusquareUrl(url);
          return familyId != null && !seenAfter.has(familyId);
        });
        return {
          ok: true,
          value: {
            families: batch.families,
            done: !remaining,
            resumeUrl: remaining ? `${origin}/sitemap.xml` : null,
          },
        };
      }
    }
    if (input.scope.categoryUrls.length === 0) {
      return {
        ok: true,
        value: { families: [], done: false, resumeUrl: null, errorCode: "SITEMAP_UNAVAILABLE" },
      };
    }
    const families: MonitorAdapterFamilyRef[] = [];
    const seen = new Set(input.alreadySeen);
    let start = 0;
    if (input.resumeUrl) {
      const resumePath = new URL(input.resumeUrl).pathname;
      const index = input.scope.categoryUrls.findIndex((url) => {
        try {
          return new URL(url).pathname === resumePath || input.resumeUrl?.startsWith(url);
        } catch {
          return false;
        }
      });
      if (index >= 0) start = index;
    }
    for (let index = start; index < input.scope.categoryUrls.length; index += 1) {
      const categoryUrl = input.scope.categoryUrls[index] ?? "";
      let categoryKey: string | null = null;
      try {
        categoryKey = categoryKeyFromUrl(categoryUrl);
      } catch {
        categoryKey = null;
      }
      const listed = await readListing({
        startUrl: categoryUrl,
        categoryKey,
        registrableDomain: input.registrableDomain,
        fetchPage: input.fetchPage,
        timeoutMs: input.timeoutMs,
        signal: input.signal,
        resumeUrl: index === start ? input.resumeUrl : null,
        familyLimit: input.familyLimit - families.length,
        alreadySeen: seen,
      });
      if (!listed.ok) return listed;
      for (const family of listed.value.families) {
        seen.add(family.familyId);
        families.push(family);
      }
      if (!listed.value.done) {
        return {
          ok: true,
          value: {
            families,
            done: false,
            resumeUrl: listed.value.resumeUrl,
            errorCode: listed.value.errorCode,
          },
        };
      }
      if (families.length >= input.familyLimit) {
        const next = input.scope.categoryUrls[index + 1] ?? null;
        return { ok: true, value: { families, done: next == null, resumeUrl: next } };
      }
    }
    return { ok: true, value: { families, done: true, resumeUrl: null } };
  },
  async extractFamily(input) {
    if (input.signal?.aborted) return blocked("Product extraction was aborted.");
    const page = await input.fetchPage({
      url: input.productUrl,
      registrableDomain: input.registrableDomain,
      timeoutMs: input.timeoutMs,
      signal: input.signal,
    });
    if (!page.ok || !page.bodyText) {
      return blocked(page.errorCode ?? "Product extraction failed.");
    }
    const parsed = parseSolusquareProduct(page.bodyText, page.finalUrl, input.observedAt);
    const familyId = parsed.htmlProdId ?? parsed.urlProdId;
    if (!familyId || familyId !== input.familyId) {
      return blocked("The product page did not confirm the enumerated family identity.");
    }
    const names = parsed.family.colorPatternNames.filter((name) => name.trim().length > 0);
    const ids = parsed.family.colorPatternIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
    const axes = splitSizeAndLength(parsed.family.sizeOptions);
    const currency = parsed.family.currency ? parsed.family.currency.trim().toUpperCase() : null;
    const product: MonitorExtractedProduct = {
      familyId,
      productUrl: parsed.family.productUrl,
      productName: parsed.family.productName,
      category: parsed.family.category,
      priceAmount: formatPrice(parsed.family.price),
      currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : null,
      colorPatternNames: names.length > 0 ? names : null,
      colorPatternIds: ids.length === names.length && ids.length > 0 ? ids : null,
      distinctVariationCount: names.length,
      sizes: axes.sizes,
      lengths: axes.lengths,
      imageUrl: httpsImage(parsed.family.imageUrl),
    };
    return { ok: true, value: product };
  },
};
