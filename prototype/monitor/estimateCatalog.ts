/**
 * Bounded catalog-size estimate. One sitemap index and at most two sitemap
 * documents per site. It does not extract products.
 */
import { readHttpDocument, withHeadedChrome, readBrowserDocument } from "./browser";
import { MONITOR_LIMITS } from "./limits";
import { assertDocumentAllowed, resolveSupportedTarget } from "./safety";
import type { RobotsRules } from "@/services/websiteLearning/deepScrape/robots";

const SITES = [
  "https://www.toscane-boutique.fr/",
  "https://www.breal.net/",
  "https://www.bonoboplanet.com/",
  "https://www.cache-cache.fr/",
];

function locs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((match) => match[1] ?? "").filter(Boolean);
}

function productCount(urls: string[], adapter: "sfra" | "solusquare"): { urls: number; families: number } {
  if (adapter === "solusquare") {
    const ids = new Set<string>();
    let productUrls = 0;
    for (const url of urls) {
      const match = url.match(/-p-(\d+)-coul-\d+\.htm$/i);
      if (!match?.[1]) continue;
      productUrls += 1;
      ids.add(match[1]);
    }
    return { urls: productUrls, families: ids.size };
  }
  const prefixes = new Set<string>();
  let productUrls = 0;
  for (const url of urls) {
    const sku = url.match(/-(\d{12,})\.html$/i)?.[1];
    if (!sku) continue;
    productUrls += 1;
    prefixes.add(sku.slice(0, -4));
  }
  return { urls: productUrls, families: prefixes.size };
}

async function readXml(url: string, adapter: "sfra" | "solusquare", registrableDomain: string): Promise<string | null> {
  if (adapter === "solusquare") {
    const document = await readHttpDocument(url, registrableDomain, true);
    return document.html;
  }
  let xml: string | null = null;
  await withHeadedChrome(async (page) => {
    const document = await readBrowserDocument(page, url);
    xml = document.html;
  });
  return xml;
}

async function estimateSite(rawUrl: string): Promise<unknown> {
  const target = resolveSupportedTarget(rawUrl);
  const origin = new URL(target.url).origin;
  const robotsUrl = new URL("/robots.txt", origin).toString();
  await assertDocumentAllowed({ url: robotsUrl, registrableDomain: target.registrableDomain, robots: null });
  let robotsText = "";
  if (target.adapter === "solusquare") {
    robotsText = (await readHttpDocument(robotsUrl, target.registrableDomain, true)).html;
  } else {
    await withHeadedChrome(async (page) => {
      const document = await readBrowserDocument(page, robotsUrl);
      robotsText = document.html;
    });
  }
  const sitemapUrls = [
    ...robotsText.matchAll(/sitemap:\s*(https?:\/\/[^\s<"']+)/gi),
  ].map((match) => match[1] ?? "");
  const indexUrl = sitemapUrls[0] || new URL("/sitemap_index.xml", origin).toString();
  const rules: RobotsRules | null = null;
  await assertDocumentAllowed({ url: indexUrl, registrableDomain: target.registrableDomain, robots: rules });
  const indexXml = await readXml(indexUrl, target.adapter, target.registrableDomain);
  const indexLocs = locs(indexXml ?? "");
  const nested = indexLocs.filter((url) => /sitemap/i.test(url)).slice(0, 2);
  const documents = nested.length ? nested : [indexUrl];
  const counts = [];
  for (const url of documents) {
    if (url !== indexUrl) {
      await assertDocumentAllowed({ url, registrableDomain: target.registrableDomain, robots: null });
    }
    const xml = url === indexUrl && !nested.length ? indexXml : await readXml(url, target.adapter, target.registrableDomain);
    const urls = locs(xml ?? "");
    counts.push({ url, ...productCount(urls, target.adapter), locations: urls.length });
  }
  const sample = counts[0];
  const sitemapDocuments = indexLocs.filter((url) => /sitemap/i.test(url)).length || 1;
  return {
    site: target.hostname,
    indexUrl,
    sitemapDocuments,
    sampled: counts,
    estimatedProductUrls: sample ? sample.urls * (sitemapDocuments / Math.max(documents.length, 1)) : null,
    estimatedFamilies: sample ? Math.round(sample.families * (sitemapDocuments / Math.max(documents.length, 1))) : null,
    note: "Family estimate uses the validated suffix or prodID rule on the sampled sitemap only. SFRA full-catalog family counts stay estimates until every color URL is grouped.",
    maxHtmlBytes: MONITOR_LIMITS.maxHtmlBytes,
  };
}

async function main(): Promise<void> {
  const target = process.argv[2];
  const sites = target ? [target] : SITES;
  const results = [];
  for (const site of sites) {
    try {
      results.push(await estimateSite(site));
    } catch (error) {
      results.push({
        site,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
