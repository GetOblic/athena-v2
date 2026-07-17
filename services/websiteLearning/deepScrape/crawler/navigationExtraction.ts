/**
 * Navigation-aware link extraction for Deep Scrape discovery.
 * Classifies internal links by structural provenance (nav/footer/content).
 */

import * as cheerio from "cheerio";
import {
  type DiscoveryProvenance,
  strongerProvenance,
} from "@/services/websiteLearning/deepScrape/crawler/urlRelevance";
import { DEEP_SCRAPE_CRAWL_POLICY } from "@/services/websiteLearning/deepScrape/crawlPolicy";
import {
  canonicalizePageUrl,
  isSameRegistrableDomain,
  resolveAbsoluteUrl,
} from "@/services/websiteLearning/deepScrape/urlSafety";

export type ExtractedDiscoveryLink = {
  url: string;
  provenance: DiscoveryProvenance;
  anchorText: string | null;
};

const PRIMARY_NAV_SELECTOR = [
  "nav",
  'header nav',
  '[role="navigation"]',
  "header [role='navigation']",
  ".main-nav",
  ".main-menu",
  ".primary-nav",
  ".primary-menu",
  ".navbar",
  ".navbar-nav",
  ".site-nav",
  ".site-navigation",
  "#main-nav",
  "#main-menu",
  "#primary-menu",
  "#site-navigation",
  ".menu-main",
  ".nav-menu",
  ".mobile-menu",
  ".mobile-nav",
  "[data-nav]",
  "[data-navigation]",
].join(", ");

const SECONDARY_NAV_SELECTOR = [
  "aside nav",
  "aside [role='navigation']",
  ".sidebar nav",
  ".side-nav",
  ".secondary-nav",
  ".secondary-menu",
  ".sub-menu",
  ".utility-nav",
].join(", ");

const FOOTER_SELECTOR = [
  "footer",
  '[role="contentinfo"]',
  ".site-footer",
  "#footer",
  ".footer-nav",
  ".footer-menu",
].join(", ");

function hasNavLikeClassOrId($: cheerio.CheerioAPI, el: unknown): boolean {
  const id = (($(el as never).attr("id") ?? "") as string).toLowerCase();
  const className = (($(el as never).attr("class") ?? "") as string).toLowerCase();
  const haystack = `${id} ${className}`;
  return /(^|[\s_-])(nav|menu|navbar|navigation|menubar)([\s_-]|$)/i.test(
    haystack,
  );
}

function classifyAnchorProvenance(
  $: cheerio.CheerioAPI,
  el: unknown,
): DiscoveryProvenance {
  const $el = $(el as never);
  if ($el.closest(FOOTER_SELECTOR).length > 0) {
    return "footer_navigation";
  }
  if ($el.closest(PRIMARY_NAV_SELECTOR).length > 0) {
    return "primary_navigation";
  }
  if ($el.closest(SECONDARY_NAV_SELECTOR).length > 0) {
    return "secondary_navigation";
  }

  // Walk ancestors for nav-like class/id without relying only on hard-coded class lists.
  let current: unknown = el;
  for (let depth = 0; depth < 8 && current; depth += 1) {
    if (hasNavLikeClassOrId($, current)) {
      const tag =
        ((current as { name?: string }).name ?? "").toLowerCase() || "";
      if (tag === "footer") return "footer_navigation";
      const $current = $(current as never);
      if ($current.closest("header, [role='banner']").length > 0) {
        return "primary_navigation";
      }
      if ($current.closest("aside").length > 0) {
        return "secondary_navigation";
      }
      return "primary_navigation";
    }
    current = (current as { parent?: unknown }).parent ?? null;
  }

  return "content_link";
}

function isJunkHref(href: string): boolean {
  const trimmed = href.trim();
  if (!trimmed) return true;
  if (trimmed === "#") return true;
  if (/^#/.test(trimmed)) return true;
  if (/^(mailto|tel|javascript|data):/i.test(trimmed)) return true;
  if (/^javascript:\s*void/i.test(trimmed)) return true;
  return false;
}

/**
 * Extract same-domain links with structural provenance.
 * Strongest provenance wins when the same URL appears multiple times.
 */
export function extractDiscoveryLinks(input: {
  html: string;
  baseUrl: string;
  registrableDomain: string;
}): {
  links: ExtractedDiscoveryLink[];
  primaryNavigationCount: number;
  secondaryNavigationCount: number;
  footerNavigationCount: number;
  contentLinkCount: number;
} {
  const $ = cheerio.load(input.html);
  const byUrl = new Map<string, ExtractedDiscoveryLink>();

  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") ?? "").toString();
    if (isJunkHref(href)) return;
    const absolute = resolveAbsoluteUrl(href, input.baseUrl);
    if (!absolute) return;
    if (!isSameRegistrableDomain(absolute, input.registrableDomain)) return;
    const canonical = canonicalizePageUrl(absolute);
    if (!canonical) return;

    const provenance = classifyAnchorProvenance($, el);
    const anchorText =
      $(el).text().replace(/\s+/g, " ").trim().slice(0, 120) || null;
    const prior = byUrl.get(canonical);
    if (!prior) {
      byUrl.set(canonical, { url: canonical, provenance, anchorText });
      return;
    }
    const nextProvenance = strongerProvenance(prior.provenance, provenance);
    byUrl.set(canonical, {
      url: canonical,
      provenance: nextProvenance,
      anchorText: prior.anchorText || anchorText,
    });
  });

  const links = [...byUrl.values()].slice(
    0,
    DEEP_SCRAPE_CRAWL_POLICY.maxDiscoveryInventory,
  );
  return {
    links,
    primaryNavigationCount: links.filter(
      (link) => link.provenance === "primary_navigation",
    ).length,
    secondaryNavigationCount: links.filter(
      (link) => link.provenance === "secondary_navigation",
    ).length,
    footerNavigationCount: links.filter(
      (link) => link.provenance === "footer_navigation",
    ).length,
    contentLinkCount: links.filter((link) => link.provenance === "content_link")
      .length,
  };
}
