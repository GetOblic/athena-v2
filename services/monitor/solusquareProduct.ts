import * as cheerio from "cheerio";

import type { ExtractedFamily } from "@/services/monitor/extractedFamily";
import { jsonLdBrand, jsonLdPrice, jsonLdString, readJsonLd } from "@/services/monitor/extractionJsonLd";
import { cleanText, uniqueStrings } from "@/services/monitor/extractionText";

export type SolusquareParse = {
  family: ExtractedFamily;
  htmlProdId: string | null;
  urlProdId: string | null;
  colorUrls: string[];
};

export function prodIdFromSolusquareUrl(rawUrl: string): string | null {
  const match = new URL(rawUrl).pathname.match(/-p-(\d+)-coul-\d+\.htm$/i);
  return match?.[1] ?? null;
}

function paramsField(params: string, key: string): string | null {
  const quoted = params.match(new RegExp(`${key}\\s*:\\s*'([^']*)'`, "i"));
  if (quoted?.[1]) return quoted[1];
  const numeric = params.match(new RegExp(`${key}\\s*:\\s*(\\d+(?:\\.\\d+)?)`, "i"));
  return numeric?.[1] ?? null;
}

export function parseSolusquareProduct(
  html: string,
  pageUrl: string,
  observedAt: string,
): SolusquareParse {
  const $ = cheerio.load(html);
  const jsonLd = readJsonLd(html);
  const offer = jsonLdPrice(jsonLd.product);
  const sheet = $("[data-params*='prodID']").first();
  const sheetParams = sheet.attr("data-params") ?? "";
  const htmlProdId =
    cleanText(paramsField(sheetParams, "prodID"), 40) ??
    cleanText(sheet.attr("data-pid") ?? sheet.attr("data-pID"), 40);
  const urlProdId = prodIdFromSolusquareUrl(pageUrl);
  const productName =
    cleanText(sheet.attr("data-gtm_item_name") ?? sheet.attr("data-GTM_item_name")) ??
    cleanText(jsonLdString(jsonLd.product?.name)) ??
    cleanText($("h1").first().text());
  const brand =
    cleanText($("meta[property='product:brand']").attr("content")) ??
    cleanText(sheet.attr("data-gtm_item_brand") ?? sheet.attr("data-GTM_item_brand")) ??
    cleanText(jsonLdBrand(jsonLd.product)) ??
    cleanText($("meta[property='og:site_name']").attr("content"));

  const colors: Array<{ id: string | null; name: string | null }> = [];
  const seen = new Set<string>();
  $("li[id]").each((_, element) => {
    const idAttr = $(element).attr("id") ?? "";
    if (!/^p\d+-\d+$/i.test(idAttr)) return;
    const params = $(element).attr("data-params") ?? "";
    if (!/colorLbl/i.test(params) && !/colorID/i.test(params)) return;
    const id = cleanText(paramsField(params, "colorID"), 40);
    const name = cleanText(paramsField(params, "colorLbl"), 80);
    const key = (id ?? name ?? "").toLocaleLowerCase("fr");
    if (!key || seen.has(key)) return;
    seen.add(key);
    colors.push({ id, name });
  });

  const sizeLabels: string[] = [];
  $("li[data-cid], li[data-cID]").each((_, element) => {
    sizeLabels.push($(element).text());
  });

  const canonicalHref = $("link[rel='canonical']").attr("href");
  let productUrl = pageUrl;
  if (canonicalHref) {
    try {
      productUrl = new URL(canonicalHref, pageUrl).toString();
    } catch {
      productUrl = pageUrl;
    }
  }

  const names = colors.map((color) => color.name).filter((name): name is string => Boolean(name));
  const categoryNames = jsonLd.breadcrumbNames
    .map((name) => cleanText(name, 80))
    .filter((name): name is string => Boolean(name))
    .filter((name) => {
      const key = name.toLocaleLowerCase("fr");
      if (key === "accueil" || key === "home") return false;
      if (productName && key === productName.toLocaleLowerCase("fr")) return false;
      return true;
    });

  const family: ExtractedFamily = {
    sourceWebsite: new URL(pageUrl).hostname.toLowerCase().replace(/^www\./, ""),
    brand,
    productFamilyId: htmlProdId,
    productName,
    category: categoryNames.length ? categoryNames.join(" > ") : null,
    productUrl,
    imageUrl: cleanText($("meta[property='og:image']").attr("content"), 2000),
    price: offer.price,
    currency: offer.currency,
    colorPatternNames: names,
    colorPatternIds: colors.map((color) => color.id),
    distinctVariationCount: names.length,
    sizeOptions: uniqueStrings(sizeLabels),
    lengthOptions: null,
    observedAt,
  };

  const colorUrls: string[] = [];
  if (urlProdId) {
    const colorPath = new RegExp(`-p-${urlProdId}-coul-\\d+\\.htm$`, "i");
    $("a[href]").each((_, element) => {
      const href = $(element).attr("href");
      if (!href) return;
      try {
        const absolute = new URL(href, pageUrl);
        if (colorPath.test(absolute.pathname)) colorUrls.push(absolute.toString());
      } catch {
        // Ignore malformed links in untrusted HTML.
      }
    });
  }

  return {
    family,
    htmlProdId,
    urlProdId,
    colorUrls: [...new Set(colorUrls)],
  };
}
