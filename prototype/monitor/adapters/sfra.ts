import * as cheerio from "cheerio";

import { jsonLdBrand, jsonLdPrice, jsonLdString, readJsonLd } from "../jsonLd";
import type { ExtractedFamily } from "../types";
import { cleanText, uniqueStrings } from "../text";

export type SfraColor = {
  id: string | null;
  name: string | null;
  sku: string | null;
  publicUrl: string | null;
};

export type SfraParse = {
  family: ExtractedFamily;
  colorLevelDataPid: string | null;
  colors: SfraColor[];
  suffixWidth: number | null;
};

const HOME_CRUMBS = new Set(["accueil", "home", "homepage"]);

export function familyIdFromColorSkus(
  colors: readonly { id: string; sku: string }[],
): { familyId: string; suffixWidth: number } | null {
  if (!colors.length) return null;
  for (const width of [4, 3, 5]) {
    const prefixes = new Set<string>();
    let valid = true;
    for (const color of colors) {
      if (!/^\d+$/.test(color.id) || !/^\d+$/.test(color.sku)) {
        valid = false;
        break;
      }
      const suffix = color.id.padStart(width, "0");
      if (suffix.length !== width || !color.sku.endsWith(suffix)) {
        valid = false;
        break;
      }
      const prefix = color.sku.slice(0, -width);
      if (prefix.length < 8) {
        valid = false;
        break;
      }
      prefixes.add(prefix);
    }
    if (valid && prefixes.size === 1) {
      return { familyId: [...prefixes][0] ?? "", suffixWidth: width };
    }
  }
  return null;
}

export function publicProductUrlFromImage(imageUrl: string, pageUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(imageUrl, pageUrl);
  } catch {
    return null;
  }
  const file = decodeURIComponent(parsed.pathname.split("/").pop() ?? "");
  const match = file.match(/^(.*)-vue\d+-(\d{8,})\.(?:jpe?g|png|webp)$/i);
  if (!match?.[1] || !match[2]) return null;
  return `${new URL(pageUrl).origin}/${match[1]}-${match[2]}.html`;
}

function imageFromStyle(style: string | undefined): string | null {
  if (!style) return null;
  const match = style.match(/url\((['"]?)(.*?)\1\)/i);
  return match?.[2]?.replace(/&amp;/g, "&") ?? null;
}

function skuFromFile(imageUrl: string, pageUrl: string): string | null {
  try {
    const file = decodeURIComponent(new URL(imageUrl, pageUrl).pathname.split("/").pop() ?? "");
    return file.match(/(\d{8,})\.(?:jpe?g|png|webp)$/i)?.[1] ?? null;
  } catch {
    return null;
  }
}

function categoryFromCrumbs(names: string[], productName: string | null): string | null {
  const cleaned = names
    .map((name) => cleanText(name, 80))
    .filter((name): name is string => Boolean(name));
  const unique: string[] = [];
  for (const name of cleaned) {
    if (unique.at(-1)?.toLocaleLowerCase("fr") === name.toLocaleLowerCase("fr")) continue;
    unique.push(name);
  }
  const category = unique.filter((name) => {
    const key = name.toLocaleLowerCase("fr");
    if (HOME_CRUMBS.has(key)) return false;
    if (productName && key === productName.toLocaleLowerCase("fr")) return false;
    return true;
  });
  return category.length ? category.join(" > ") : null;
}

function lengthFromName(name: string | null): string[] {
  if (!name) return [];
  return uniqueStrings([...name.matchAll(/longueur[\s-]*(\d+)/gi)].map((match) => match[1] ?? null));
}

export function parseSfraProduct(html: string, pageUrl: string, observedAt: string): SfraParse {
  const $ = cheerio.load(html);
  const detail = $(".product-detail").first();
  const root = detail.length ? detail : $("html");
  const jsonLd = readJsonLd(html);
  const offer = jsonLdPrice(jsonLd.product);
  const productName =
    cleanText(jsonLdString(jsonLd.product?.name)) ??
    cleanText(root.find("h1").first().text()) ??
    cleanText($("h1").first().text());
  const brand =
    cleanText($("meta[property='product:brand']").attr("content")) ??
    cleanText(jsonLdBrand(jsonLd.product)) ??
    cleanText($("meta[property='og:site_name']").attr("content"));
  const canonicalHref = $("link[rel='canonical']").attr("href");
  let productUrl = pageUrl;
  if (canonicalHref) {
    try {
      productUrl = new URL(canonicalHref, pageUrl).toString();
    } catch {
      productUrl = pageUrl;
    }
  }
  const imageUrl =
    jsonLdString(jsonLd.product?.image) ??
    cleanText($("meta[property='og:image']").attr("content"), 2000);

  const colors: SfraColor[] = [];
  const seenColor = new Set<string>();
  root.find("button.color-attribute").each((_, element) => {
    const button = $(element);
    const swatch = button.find("[data-attr-value]").first();
    const id = cleanText(swatch.attr("data-attr-value") ?? button.attr("aria-describedby"), 40);
    const name = cleanText(
      swatch.attr("data-attr-display-value") ?? button.attr("title") ?? button.attr("aria-label"),
      80,
    );
    const image = imageFromStyle(swatch.attr("style"));
    const sku = image ? skuFromFile(image, pageUrl) : null;
    const key = (id ?? name ?? "").toLocaleLowerCase("fr");
    if (!key || seenColor.has(key)) return;
    seenColor.add(key);
    colors.push({
      id,
      name,
      sku,
      publicUrl: image ? publicProductUrlFromImage(image, pageUrl) : null,
    });
  });

  const sized: string[] = [];
  root.find("button.size-attribute").each((_, element) => {
    sized.push($(element).text());
  });

  const lengthFromAttributes: string[] = [];
  root.find(".attribute-container[data-attr]").each((_, element) => {
    const kind = ($(element).attr("data-attr") ?? "").toLowerCase();
    if (!/length|longueur|inseam/.test(kind)) return;
    $(element)
      .find("button")
      .each((__, button) => {
        lengthFromAttributes.push($(button).text());
      });
  });

  const identifiable = colors.filter(
    (color): color is SfraColor & { id: string; sku: string } => Boolean(color.id && color.sku),
  );
  const familyKey = familyIdFromColorSkus(identifiable);
  const colorOptions = colors.filter((color) => {
    if (color.name && /^longueur[\s-]*\d+$/i.test(color.name)) {
      lengthFromAttributes.push(color.name);
      return false;
    }
    return Boolean(color.name);
  });
  const lengthOptions = uniqueStrings([...lengthFromAttributes, ...lengthFromName(productName)]);
  const names = colorOptions.map((color) => color.name).filter((name): name is string => Boolean(name));
  const ids = colorOptions.map((color) => color.id);

  const domCrumbs: string[] = [];
  $(".breadcrumb a, [aria-label='breadcrumb'] a, .product-breadcrumb a").each((_, element) => {
    domCrumbs.push($(element).text());
  });
  const crumbSource = jsonLd.breadcrumbNames.length > 1 ? jsonLd.breadcrumbNames : domCrumbs;

  const family: ExtractedFamily = {
    sourceWebsite: new URL(pageUrl).hostname.toLowerCase().replace(/^www\./, ""),
    brand,
    productFamilyId: familyKey?.familyId ?? null,
    productName,
    category: categoryFromCrumbs(crumbSource, productName),
    productUrl,
    imageUrl,
    price: offer.price,
    currency: offer.currency,
    colorPatternNames: names,
    colorPatternIds: ids,
    distinctVariationCount: names.length,
    sizeOptions: uniqueStrings(sized),
    lengthOptions: lengthOptions.length ? lengthOptions : null,
    observedAt,
  };

  return {
    family,
    colorLevelDataPid: cleanText(detail.attr("data-pid"), 40),
    colors,
    suffixWidth: familyKey?.suffixWidth ?? null,
  };
}
