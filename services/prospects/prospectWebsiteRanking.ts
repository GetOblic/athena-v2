/**
 * Deterministic ranking of discovered website pages (never random).
 */

import {
  classifyPageLabel,
  type DiscoveredPageCandidate,
} from "@/services/prospects/prospectWebsiteDiscovery";
import { WEBSITE_INTELLIGENCE_MAX_PAGES } from "@/services/prospects/prospectWebsiteUrl";

const SOURCE_WEIGHT: Record<DiscoveredPageCandidate["source"], number> = {
  homepage: 1000,
  nav: 400,
  keyword: 300,
  content: 100,
};

const LABEL_WEIGHT: Record<string, number> = {
  Home: 1000,
  Services: 900,
  FAQ: 850,
  About: 800,
  Pricing: 750,
  Contact: 700,
  Products: 680,
  Booking: 650,
  Team: 620,
  Technology: 600,
  Process: 580,
  Locations: 560,
  Policies: 540,
};

function scoreCandidate(candidate: DiscoveredPageCandidate): number {
  const label =
    candidate.source === "homepage"
      ? "Home"
      : classifyPageLabel(candidate.url, candidate.anchorText) ?? "Other";
  const labelScore = LABEL_WEIGHT[label] ?? 200;
  return SOURCE_WEIGHT[candidate.source] + labelScore;
}

/**
 * Rank candidates and return at most `limit` URLs.
 * Homepage is always first when present.
 */
export function rankAndSelectPages(
  candidates: DiscoveredPageCandidate[],
  limit = WEBSITE_INTELLIGENCE_MAX_PAGES,
): DiscoveredPageCandidate[] {
  const unique = new Map<string, DiscoveredPageCandidate>();
  for (const candidate of candidates) {
    const existing = unique.get(candidate.url);
    if (!existing || scoreCandidate(candidate) > scoreCandidate(existing)) {
      unique.set(candidate.url, candidate);
    }
  }

  const ranked = [...unique.values()].sort((a, b) => {
    const scoreDelta = scoreCandidate(b) - scoreCandidate(a);
    if (scoreDelta !== 0) return scoreDelta;
    return a.url.localeCompare(b.url);
  });

  return ranked.slice(0, Math.max(1, Math.min(limit, WEBSITE_INTELLIGENCE_MAX_PAGES)));
}

export function pageDisplayLabel(candidate: DiscoveredPageCandidate): string {
  if (candidate.source === "homepage") return "Home";
  return (
    classifyPageLabel(candidate.url, candidate.anchorText) ??
    (candidate.anchorText.trim().slice(0, 40) || "Page")
  );
}
