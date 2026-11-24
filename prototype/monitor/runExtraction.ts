import { fetchRobotsRules, type RobotsRules } from "@/services/websiteLearning/deepScrape/robots";

import { parseSfraProduct, type SfraParse } from "./adapters/sfra";
import { parseSolusquareProduct } from "./adapters/solusquare";
import {
  AccessBlockedError,
  describeBrowserRuntime,
  readBrowserDocument,
  readBrowserRobots,
  readHttpDocument,
  withHeadedChrome,
} from "./browser";
import {
  chooseClothingCategory,
  classifyEntryUrl,
  collectProductUrls,
  findNextListingUrl,
  lengthGroupKey,
  lengthValueFromSlug,
  prioritizeLengthPairs,
  prodIdFromSolusquareUrl,
  skuFromProductUrl,
} from "./discover";
import { applyVariationThreshold, matchingFamilies } from "./filter";
import { MONITOR_LIMITS } from "./limits";
import { assertDocumentAllowed, canonicalMonitorUrl, isRobotsAllowed } from "./safety";
import type {
  DedupEvidence,
  ExtractedFamily,
  ExtractionError,
  ExtractionRun,
  LengthEvidence,
} from "./types";
import { resolveSupportedTarget, type SupportedTarget as Target } from "./safety";

type Budget = {
  requests: number;
  errors: ExtractionError[];
  blocked: boolean;
  started: number;
  exhausted: () => boolean;
  begin: (url: string) => Promise<boolean>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createBudget(): Budget {
  const started = Date.now();
  let lastRequestAt = 0;
  const budget: Budget = {
    requests: 0,
    errors: [],
    blocked: false,
    started,
    exhausted() {
      return (
        budget.requests >= MONITOR_LIMITS.maxRequests ||
        Date.now() - started > MONITOR_LIMITS.siteDeadlineMs
      );
    },
    async begin(url: string) {
      if (budget.exhausted()) {
        budget.errors.push({ url, message: "BUDGET_EXHAUSTED" });
        return false;
      }
      const wait = MONITOR_LIMITS.delayMs - (Date.now() - lastRequestAt);
      if (lastRequestAt && wait > 0) await sleep(wait);
      budget.requests += 1;
      lastRequestAt = Date.now();
      return true;
    },
  };
  return budget;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sameIdSet(left: Array<string | null>, right: Array<string | null>): boolean {
  const normalize = (values: Array<string | null>) =>
    values
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLocaleLowerCase("fr"))
      .sort();
  const a = normalize(left);
  const b = normalize(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

async function guardedHttp(
  budget: Budget,
  url: string,
  target: Target,
  robots: RobotsRules | null,
  acceptXml = false,
): Promise<{ finalUrl: string; html: string } | null> {
  let allowed: string;
  try {
    allowed = await assertDocumentAllowed({
      url,
      registrableDomain: target.registrableDomain,
      robots,
    });
  } catch (error) {
    budget.errors.push({ url, message: errorMessage(error) });
    return null;
  }
  if (!(await budget.begin(allowed))) return null;
  try {
    const document = await readHttpDocument(allowed, target.registrableDomain, acceptXml);
    return { finalUrl: document.finalUrl, html: document.html };
  } catch (error) {
    budget.errors.push({ url: allowed, message: errorMessage(error) });
    return null;
  }
}

export async function runExtraction(input: {
  url: string;
  minDistinctColorPatterns: number;
}): Promise<ExtractionRun> {
  const target = resolveSupportedTarget(input.url);
  const observedAt = new Date().toISOString();
  if (target.adapter === "sfra") {
    return runSfra(target, input.minDistinctColorPatterns, observedAt);
  }
  return runSolusquare(target, input.minDistinctColorPatterns, observedAt);
}

async function runSfra(
  target: Target,
  minDistinctColorPatterns: number,
  observedAt: string,
): Promise<ExtractionRun> {
  const budget = createBudget();
  const browserRuntime = await describeBrowserRuntime(target.url);
  budget.requests += 2;

  let categoryUrl: string | null = null;
  let families: ExtractedFamily[] = [];
  let deduplication: DedupEvidence | null = null;
  let lengthInvestigation: LengthEvidence | null = null;
  let productUrlsDiscovered = 0;
  let productUrlsNotOpened = 0;
  let duplicateFamiliesRemoved = 0;

  try {
    await withHeadedChrome(async (page) => {
      const origin = new URL(target.url).origin;
      if (!(await budget.begin(new URL("/robots.txt", origin).toString()))) return;
      const robots = await readBrowserRobots(page, origin).catch((error: unknown) => {
        budget.errors.push({ url: `${origin}/robots.txt`, message: errorMessage(error) });
        return { fetched: false, disallow: [], allow: [] } satisfies RobotsRules;
      });

      const kind = classifyEntryUrl(target.url, "sfra");
      let listingUrls: string[] = [];
      if (kind === "product") {
        listingUrls = [target.url];
        categoryUrl = null;
      } else {
        let category = target.url;
        if (kind === "home") {
          const home = await openPage(page, budget, target.url, target, robots);
          if (!home) return;
          category = chooseClothingCategory(home.html, home.finalUrl) ?? "";
          if (!category) {
            budget.errors.push({ url: target.url, message: "NO_CLOTHING_CATEGORY" });
            return;
          }
        }
        categoryUrl = category;
        const first = await openPage(page, budget, category, target, robots);
        if (!first) return;
        const collected = new Set(collectProductUrls(first.html, first.finalUrl, "sfra"));
        if (collected.size < MONITOR_LIMITS.maxProductUrls) {
          const next = findNextListingUrl(first.html, first.finalUrl);
          if (next && isRobotsAllowed(next, robots)) {
            const second = await openPage(page, budget, next, target, robots);
            if (second) {
              for (const url of collectProductUrls(second.html, second.finalUrl, "sfra")) {
                collected.add(url);
                if (collected.size >= MONITOR_LIMITS.maxProductUrls) break;
              }
            }
          }
        }
        listingUrls = prioritizeLengthPairs([...collected]).slice(0, MONITOR_LIMITS.maxProductUrls);
      }

      productUrlsDiscovered = listingUrls.length;
      const knownSkus = new Map<string, string>();
      const parsed: Array<{ url: string; parsed: SfraParse }> = [];

      for (const url of listingUrls) {
        if (budget.blocked || parsed.length >= MONITOR_LIMITS.maxFamilies) break;
        const sku = skuFromProductUrl(url);
        if (sku && knownSkus.has(sku)) {
          duplicateFamiliesRemoved += 1;
          continue;
        }
        const document = await openPage(page, budget, url, target, robots);
        if (!document) continue;
        const result = parseSfraProduct(document.html, document.finalUrl, observedAt);
        if (!result.family.productFamilyId) {
          budget.errors.push({ url: document.finalUrl, message: "FAMILY_ID_UNCONFIRMED" });
          continue;
        }
        if (parsed.some((entry) => entry.parsed.family.productFamilyId === result.family.productFamilyId)) {
          duplicateFamiliesRemoved += 1;
          continue;
        }
        for (const color of result.colors) {
          if (color.sku && result.family.productFamilyId) {
            knownSkus.set(color.sku, result.family.productFamilyId);
          }
        }
        parsed.push({ url: document.finalUrl, parsed: result });
      }

      const opened = new Set(parsed.map((entry) => canonicalMonitorUrl(entry.url)));
      productUrlsNotOpened = listingUrls.filter((url) => {
        const sku = skuFromProductUrl(url);
        return !opened.has(canonicalMonitorUrl(url)) && !(sku && knownSkus.has(sku));
      }).length;

      if (!budget.blocked) {
        deduplication = await confirmSfraFamily(page, budget, target, robots, parsed, observedAt);
        lengthInvestigation = await investigateLengths(
          page,
          budget,
          target,
          robots,
          listingUrls,
          parsed,
          observedAt,
        );
      }
      families = parsed.map((entry) => entry.parsed.family);
    });
  } catch (error) {
    budget.errors.push({ url: target.url, message: errorMessage(error) });
  }

  const products = applyVariationThreshold(families, minDistinctColorPatterns);
  return {
    sourceWebsite: target.hostname.replace(/^www\./, ""),
    adapter: "sfra",
    entryUrl: target.url,
    categoryUrl,
    minDistinctColorPatterns,
    observedAt,
    browserRuntime,
    stats: {
      requests: budget.requests,
      elapsedMs: Date.now() - budget.started,
      productUrlsDiscovered,
      productUrlsNotOpened,
      familiesDiscovered: families.length,
      familiesAnalyzed: families.length,
      matchingFamilies: matchingFamilies(products).length,
      duplicateFamiliesRemoved,
      errors: budget.errors,
    },
    deduplication,
    lengthInvestigation,
    families: products,
    matches: matchingFamilies(products),
  };
}

async function openPage(
  page: import("playwright").Page,
  budget: Budget,
  url: string,
  target: Target,
  robots: RobotsRules | null,
): Promise<{ finalUrl: string; html: string } | null> {
  let allowed: string;
  try {
    allowed = await assertDocumentAllowed({
      url,
      registrableDomain: target.registrableDomain,
      robots,
    });
  } catch (error) {
    budget.errors.push({ url, message: errorMessage(error) });
    return null;
  }
  if (!(await budget.begin(allowed))) return null;
  try {
    const document = await readBrowserDocument(page, allowed);
    return { finalUrl: document.finalUrl, html: document.html };
  } catch (error) {
    budget.errors.push({ url: allowed, message: errorMessage(error) });
    if (error instanceof AccessBlockedError) budget.blocked = true;
    return null;
  }
}

async function confirmSfraFamily(
  page: import("playwright").Page,
  budget: Budget,
  target: Target,
  robots: RobotsRules | null,
  parsed: Array<{ url: string; parsed: SfraParse }>,
  observedAt: string,
): Promise<DedupEvidence | null> {
  const source = parsed.find((entry) =>
    entry.parsed.colors.some(
      (color) => color.publicUrl && canonicalMonitorUrl(color.publicUrl) !== canonicalMonitorUrl(entry.url),
    ),
  );
  if (!source?.parsed.family.productFamilyId) return null;
  const sibling = source.parsed.colors.find(
    (color) => color.publicUrl && canonicalMonitorUrl(color.publicUrl) !== canonicalMonitorUrl(source.url),
  );
  if (!sibling?.publicUrl) return null;
  const document = await openPage(page, budget, sibling.publicUrl, target, robots);
  if (!document) {
    return {
      confirmed: false,
      familyId: source.parsed.family.productFamilyId,
      urls: [source.url, sibling.publicUrl],
      colorIds: [source.parsed.family.colorPatternIds],
      colorLevelDataPids: [source.parsed.colorLevelDataPid],
      note: "The second public color URL could not be read, so the family id was not confirmed.",
    };
  }
  const second = parseSfraProduct(document.html, document.finalUrl, observedAt);
  const sameFamily = second.family.productFamilyId === source.parsed.family.productFamilyId;
  const sameColors = sameIdSet(source.parsed.family.colorPatternIds, second.family.colorPatternIds);
  const pidsDiffer = source.parsed.colorLevelDataPid !== second.colorLevelDataPid;
  return {
    confirmed: sameFamily && sameColors,
    familyId: source.parsed.family.productFamilyId,
    urls: [source.url, document.finalUrl],
    colorIds: [source.parsed.family.colorPatternIds, second.family.colorPatternIds],
    colorLevelDataPids: [source.parsed.colorLevelDataPid, second.colorLevelDataPid],
    note: sameFamily && sameColors
      ? `Both color URLs share family prefix ${source.parsed.family.productFamilyId} and the same color ids. data-pid values ${pidsDiffer ? "differ" : "match"} and are not the family id.`
      : "The second color URL did not reproduce the same family prefix and color ids.",
  };
}

async function investigateLengths(
  page: import("playwright").Page,
  budget: Budget,
  target: Target,
  robots: RobotsRules | null,
  listingUrls: string[],
  parsed: Array<{ url: string; parsed: SfraParse }>,
  observedAt: string,
): Promise<LengthEvidence> {
  const groups = new Map<string, string[]>();
  for (const url of listingUrls) {
    const key = lengthGroupKey(url);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(url);
    groups.set(key, list);
  }
  let pair: string[] | null = null;
  for (const urls of groups.values()) {
    const byLength = new Map<string, string>();
    for (const url of urls) {
      const length = lengthValueFromSlug(url);
      if (length && !byLength.has(length)) byLength.set(length, url);
    }
    if (byLength.size >= 2) {
      pair = [...byLength.values()].slice(0, 2);
      break;
    }
  }
  if (!pair) {
    const named = parsed.filter((entry) => entry.parsed.family.lengthOptions?.length);
    return {
      compared: false,
      urls: [],
      lengths: named.flatMap((entry) => entry.parsed.family.lengthOptions ?? []),
      familyIds: [],
      colorCounts: [],
      sameFamily: null,
      note: named.length
        ? "No second length of the same model was in the bounded listing. Length text was stored on lengthOptions and was not added to the color count."
        : "No length axis was present in the bounded sample. Size buttons were kept separate from colors.",
    };
  }

  const reads: SfraParse[] = [];
  const urls: string[] = [];
  for (const url of pair) {
    const existing = parsed.find((entry) => canonicalMonitorUrl(entry.url) === canonicalMonitorUrl(url));
    if (existing) {
      reads.push(existing.parsed);
      urls.push(existing.url);
      continue;
    }
    const document = await openPage(page, budget, url, target, robots);
    if (!document) continue;
    reads.push(parseSfraProduct(document.html, document.finalUrl, observedAt));
    urls.push(document.finalUrl);
  }
  const familyIds = reads.map((entry) => entry.family.productFamilyId);
  const sameFamily = familyIds.length === 2 && familyIds[0] !== null && familyIds[0] === familyIds[1];
  return {
    compared: reads.length === 2,
    urls,
    lengths: reads.flatMap((entry) => entry.family.lengthOptions ?? []),
    familyIds,
    colorCounts: reads.map((entry) => entry.family.distinctVariationCount),
    sameFamily: reads.length === 2 ? sameFamily : null,
    note: reads.length < 2
      ? "A length pair was listed, but both public pages could not be read."
      : sameFamily
        ? "The two lengths share one family id. Length values stayed on lengthOptions."
        : "The two lengths have different family ids, so each length is its own model. Color counts come only from color swatches.",
  };
}

async function runSolusquare(
  target: Target,
  minDistinctColorPatterns: number,
  observedAt: string,
): Promise<ExtractionRun> {
  const budget = createBudget();
  let robots: RobotsRules = { fetched: false, disallow: [], allow: [] };
  if (await budget.begin(new URL("/robots.txt", target.url).toString())) {
    try {
      robots = await fetchRobotsRules({
        rootUrl: new URL(target.url).origin,
        registrableDomain: target.registrableDomain,
      });
    } catch (error) {
      budget.errors.push({ url: target.url, message: errorMessage(error) });
    }
  }

  const kind = classifyEntryUrl(target.url, "solusquare");
  let categoryUrl: string | null = null;
  let listingUrls: string[] = [];
  if (kind === "product") {
    listingUrls = [target.url];
  } else {
    let category = target.url;
    if (kind === "home") {
      const home = await guardedHttp(budget, target.url, target, robots);
      if (home) {
        category = chooseClothingCategory(home.html, home.finalUrl) ?? "";
      }
      if (!category) {
        budget.errors.push({ url: target.url, message: "NO_CLOTHING_CATEGORY" });
      }
    }
    if (category) {
      categoryUrl = category;
      const first = await guardedHttp(budget, category, target, robots);
      if (first) {
        const collected = new Set(collectProductUrls(first.html, first.finalUrl, "solusquare"));
        const next = findNextListingUrl(first.html, first.finalUrl);
        if (next && collected.size < MONITOR_LIMITS.maxProductUrls && isRobotsAllowed(next, robots)) {
          const second = await guardedHttp(budget, next, target, robots);
          if (second) {
            for (const url of collectProductUrls(second.html, second.finalUrl, "solusquare")) {
              collected.add(url);
              if (collected.size >= MONITOR_LIMITS.maxProductUrls) break;
            }
          }
        }
        listingUrls = [...collected].slice(0, MONITOR_LIMITS.maxProductUrls);
      }
    }
  }

  const groups = new Map<string, string[]>();
  for (const url of listingUrls) {
    const prodId = prodIdFromSolusquareUrl(url);
    if (!prodId) continue;
    const list = groups.get(prodId) ?? [];
    list.push(url);
    groups.set(prodId, list);
  }
  const duplicateFamiliesRemoved = listingUrls.length - groups.size;
  const families: ExtractedFamily[] = [];
  let deduplication: DedupEvidence | null = null;

  for (const [prodId, urls] of groups) {
    if (families.length >= MONITOR_LIMITS.maxFamilies) break;
    const document = await guardedHttp(budget, urls[0] ?? "", target, robots);
    if (!document) continue;
    const parsed = parseSolusquareProduct(document.html, document.finalUrl, observedAt);
    if (!parsed.htmlProdId) {
      budget.errors.push({ url: document.finalUrl, message: "FAMILY_ID_UNCONFIRMED" });
      continue;
    }
    if (parsed.htmlProdId !== prodId) {
      budget.errors.push({
        url: document.finalUrl,
        message: `PRODID_MISMATCH url=${prodId} html=${parsed.htmlProdId}`,
      });
    }
    families.push(parsed.family);
    if (!deduplication && urls.length > 1) {
      deduplication = await confirmSolusquareFamily(
        budget,
        target,
        robots,
        parsed.htmlProdId,
        urls,
        parsed.family.colorPatternIds,
        observedAt,
      );
    }
  }

  const products = applyVariationThreshold(families, minDistinctColorPatterns);
  const notOpened = Math.max(groups.size - families.length, 0);
  return {
    sourceWebsite: target.hostname.replace(/^www\./, ""),
    adapter: "solusquare",
    entryUrl: target.url,
    categoryUrl,
    minDistinctColorPatterns,
    observedAt,
    browserRuntime: null,
    stats: {
      requests: budget.requests,
      elapsedMs: Date.now() - budget.started,
      productUrlsDiscovered: listingUrls.length,
      productUrlsNotOpened: notOpened,
      familiesDiscovered: groups.size,
      familiesAnalyzed: families.length,
      matchingFamilies: matchingFamilies(products).length,
      duplicateFamiliesRemoved,
      errors: budget.errors,
    },
    deduplication,
    lengthInvestigation: {
      compared: false,
      urls: [],
      lengths: [],
      familyIds: [],
      colorCounts: [],
      sameFamily: null,
      note: "Solusquare exposes color and size as separate attributes. No length axis was required for this adapter.",
    },
    families: products,
    matches: matchingFamilies(products),
  };
}

async function confirmSolusquareFamily(
  budget: Budget,
  target: Target,
  robots: RobotsRules | null,
  prodId: string,
  urls: string[],
  firstColorIds: Array<string | null>,
  observedAt: string,
): Promise<DedupEvidence> {
  const secondUrl = urls[1];
  if (!secondUrl) {
    return {
      confirmed: false,
      familyId: prodId,
      urls,
      colorIds: [firstColorIds],
      colorLevelDataPids: [],
      note: "Only one color URL was available to validate prodID grouping.",
    };
  }
  const document = await guardedHttp(budget, secondUrl, target, robots);
  if (!document) {
    return {
      confirmed: false,
      familyId: prodId,
      urls: [urls[0] ?? "", secondUrl],
      colorIds: [firstColorIds],
      colorLevelDataPids: [],
      note: "The second color URL could not be read.",
    };
  }
  const second = parseSolusquareProduct(document.html, document.finalUrl, observedAt);
  const sameId = second.htmlProdId === prodId && second.urlProdId === prodId;
  const sameColors = sameIdSet(firstColorIds, second.family.colorPatternIds);
  return {
    confirmed: sameId && sameColors,
    familyId: prodId,
    urls: [urls[0] ?? "", document.finalUrl],
    colorIds: [firstColorIds, second.family.colorPatternIds],
    colorLevelDataPids: [],
    note: sameId && sameColors
      ? `Both color URLs report prodID ${prodId} and the same color ids. The model is returned once.`
      : "prodID grouping was not confirmed on the second color URL.",
  };
}
