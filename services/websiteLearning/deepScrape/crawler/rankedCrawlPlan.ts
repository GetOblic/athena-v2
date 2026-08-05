/**
 * Deterministic ranked crawl plan — shared by Prospect and Brain Phase A.
 * Builds an inspectable top-N fetch plan after homepage structural discovery.
 */

import { DEEP_SCRAPE_CRAWL_POLICY, isExcludedUrl } from "@/services/websiteLearning/deepScrape/crawlPolicy";
import {
  compareRankedCandidates,
  scoreDeepScrapeCandidate,
  strongerProvenance,
  type DiscoveryProvenance,
  type RankedUrlCandidate,
} from "@/services/websiteLearning/deepScrape/crawler/urlRelevance";
import { canonicalizePageUrl } from "@/services/websiteLearning/deepScrape/urlSafety";

export type RankedPlanCandidateInput = {
  url: string;
  provenance?: DiscoveryProvenance;
  anchorText?: string | null;
};

export type RankedCrawlPlan = {
  homepageUrl: string;
  /** Full scored inventory after hard-filters + dedupe (≤ maxDiscoveryInventory). */
  inventory: RankedUrlCandidate[];
  /** Homepage first, then up to maxRankedCandidates-1 secondaries. */
  selected: RankedUrlCandidate[];
  /** Secondaries only (excludes homepage). */
  secondarySelected: RankedUrlCandidate[];
  excluded: RankedUrlCandidate[];
  stats: {
    totalCandidatesObserved: number;
    totalCandidatesAfterHardFilters: number;
    totalCandidatesAfterDeduplication: number;
    candidatesHardRejected: number;
    candidatesDeduplicated: number;
    selectedCandidateCount: number;
    maxRankedCandidates: number;
    maxDiscoveryInventory: number;
    maxFetchAttempts: number;
    maxMeaningfulPages: number;
    homepageIncluded: boolean;
    lowestSelectedScore: number | null;
    topCandidatePaths: string[];
    topCandidateScores: number[];
    topCandidateProvenances: string[];
  };
};

function pathOf(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return "/";
  }
}

/**
 * Normalize, hard-filter, dedupe (strongest provenance), rank, select top plan.
 * Homepage is always first in `selected` when present and is not displaced by
 * higher-scoring sitemap seeds. Plan size ≤ maxRankedCandidates (default 100).
 */
export function buildRankedCrawlPlan(input: {
  rootUrl: string;
  homepageUrl: string;
  candidates: RankedPlanCandidateInput[];
  maxDiscoveryInventory?: number;
  maxRankedCandidates?: number;
}): RankedCrawlPlan {
  const maxInventory =
    input.maxDiscoveryInventory ?? DEEP_SCRAPE_CRAWL_POLICY.maxDiscoveryInventory;
  const maxRanked =
    input.maxRankedCandidates ?? DEEP_SCRAPE_CRAWL_POLICY.maxRankedCandidates;
  const homepageUrl =
    canonicalizePageUrl(input.homepageUrl) ?? input.homepageUrl;

  let observed = 0;
  let hardRejected = 0;
  let duplicateMerges = 0;
  const byUrl = new Map<string, RankedUrlCandidate>();

  for (const entry of input.candidates) {
    observed += 1;
    const ranked = scoreDeepScrapeCandidate({
      url: entry.url,
      rootUrl: input.rootUrl,
      provenance: entry.provenance,
      anchorText: entry.anchorText,
      sameDomain: true,
    });
    if (ranked.rejectedBeforeFetch) {
      hardRejected += 1;
      continue;
    }
    if (
      isExcludedUrl(ranked.normalizedUrl) &&
      ranked.pageType !== "homepage"
    ) {
      hardRejected += 1;
      continue;
    }

    const prior = byUrl.get(ranked.normalizedUrl);
    if (!prior) {
      byUrl.set(ranked.normalizedUrl, ranked);
      continue;
    }
    duplicateMerges += 1;
    const mergedProvenance = strongerProvenance(
      prior.provenance,
      ranked.provenance,
    );
    if (
      mergedProvenance !== prior.provenance ||
      ranked.totalScore > prior.totalScore
    ) {
      byUrl.set(
        ranked.normalizedUrl,
        scoreDeepScrapeCandidate({
          url: ranked.normalizedUrl,
          rootUrl: input.rootUrl,
          provenance: mergedProvenance,
          anchorText: ranked.anchorText ?? prior.anchorText,
          sameDomain: true,
        }),
      );
    }
  }

  const afterHardFilters = byUrl.size + hardRejected;
  const deduped = [...byUrl.values()].sort(compareRankedCandidates);
  const inventory = deduped.slice(0, Math.max(1, maxInventory));

  const homepageEntry =
    inventory.find((entry) => entry.normalizedUrl === homepageUrl) ??
    scoreDeepScrapeCandidate({
      url: homepageUrl,
      rootUrl: input.rootUrl,
      provenance: "unknown",
      sameDomain: true,
    });

  const secondaryPool = inventory.filter(
    (entry) => entry.normalizedUrl !== homepageUrl,
  );
  const secondarySlots = Math.max(0, maxRanked - 1);
  const secondarySelected = secondaryPool.slice(0, secondarySlots);
  const selected = homepageEntry.rejectedBeforeFetch
    ? secondarySelected
    : [homepageEntry, ...secondarySelected];
  const selectedKeys = new Set(selected.map((entry) => entry.normalizedUrl));
  const excluded = inventory.filter(
    (entry) => !selectedKeys.has(entry.normalizedUrl),
  );

  const lowestSelectedScore =
    secondarySelected.length > 0
      ? secondarySelected[secondarySelected.length - 1]!.totalScore
      : selected[0]?.totalScore ?? null;

  return {
    homepageUrl,
    inventory,
    selected,
    secondarySelected,
    excluded,
    stats: {
      totalCandidatesObserved: observed,
      totalCandidatesAfterHardFilters: afterHardFilters - hardRejected,
      totalCandidatesAfterDeduplication: deduped.length,
      candidatesHardRejected: hardRejected,
      candidatesDeduplicated: duplicateMerges,
      selectedCandidateCount: selected.length,
      maxRankedCandidates: maxRanked,
      maxDiscoveryInventory: maxInventory,
      maxFetchAttempts: DEEP_SCRAPE_CRAWL_POLICY.maxFetchAttempts,
      maxMeaningfulPages: DEEP_SCRAPE_CRAWL_POLICY.maxMeaningfulPages,
      homepageIncluded: selected.some(
        (entry) => entry.normalizedUrl === homepageUrl,
      ),
      lowestSelectedScore,
      topCandidatePaths: selected.slice(0, 15).map((entry) => pathOf(entry.normalizedUrl)),
      topCandidateScores: selected.slice(0, 15).map((entry) => entry.totalScore),
      topCandidateProvenances: selected
        .slice(0, 15)
        .map((entry) => entry.provenance),
    },
  };
}

/** Pure helper for Prospect/Brain parity tests — ranking ignores sourceType. */
export function buildRankedCrawlPlanForSource(input: {
  rootUrl: string;
  homepageUrl: string;
  candidates: RankedPlanCandidateInput[];
  sourceType: "brain" | "prospect" | "persona";
}): RankedCrawlPlan {
  void input.sourceType;
  return buildRankedCrawlPlan(input);
}
