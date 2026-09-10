/**
 * Authoritative Prospect website-learning trigger policy.
 *
 * Website learning runs on first ingestion (Manual/CSV import) and on the
 * first Generate Intelligence (manual_refresh) when usable stored Website
 * Intelligence is absent. Refresh / Append / metadata edits reuse stored
 * intelligence and do not crawl.
 */

import type { AthenaGenerationTriggerType } from "@/services/generationJobs/generationJobTypes";

export type WebsiteLearningDecision = {
  /** Whether to call the WebsiteIntelligenceProvider / crawl. */
  shouldCrawl: boolean;
  /** Stable reason for diagnostics. */
  reason:
    | "initial_import"
    | "import_retry_resume"
    | "import_retry_reuse_stored"
    | "initial_generate_missing_stored"
    | "intelligence_refresh"
    | "non_import_trigger"
    | "no_website";
};

/**
 * True when stored homepage intelligence has usable content sections.
 * Matches the homepage-only provider shape used by Prospect generation.
 */
export function websiteIntelligenceHasUsableContent(
  websiteIntelligence: Record<string, unknown> | null | undefined,
): boolean {
  if (!websiteIntelligence) return false;

  const pages =
    typeof websiteIntelligence.pages_analyzed === "number"
      ? websiteIntelligence.pages_analyzed
      : 0;
  if (pages > 0) return true;

  const knowledge = websiteIntelligence.business_knowledge;
  if (knowledge && typeof knowledge === "object") {
    return Object.values(knowledge as Record<string, unknown>).some(
      (value) => typeof value === "string" && value.trim().length > 0,
    );
  }

  return [
    "about",
    "services",
    "products",
    "positioning",
    "paragraphs",
    "headings",
    "value_proposition",
    "messaging",
  ].some((key) => {
    const value = websiteIntelligence[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}

/**
 * Decide whether this Prospect generation job may perform live website learning.
 *
 * Allowed:
 * - discussion_import when usable website_intelligence is not yet stored
 * - manual_refresh when a website is present and usable website_intelligence
 *   is not yet stored (first Generate Intelligence)
 *
 * Denied:
 * - manual_refresh when usable website_intelligence is already stored
 * - prospect_deep_scrape (deep-scrape follow-on; never homepage-crawls)
 * - discussion_update and any other non-import trigger
 */
export function resolveProspectWebsiteLearningDecision(input: {
  triggerType: AthenaGenerationTriggerType | string | null | undefined;
  hasWebsite: boolean;
  websiteIntelligence?: Record<string, unknown> | null;
}): WebsiteLearningDecision {
  if (!input.hasWebsite) {
    return { shouldCrawl: false, reason: "no_website" };
  }

  const trigger = String(input.triggerType ?? "").trim();

  if (trigger === "prospect_deep_scrape") {
    return { shouldCrawl: false, reason: "intelligence_refresh" };
  }

  if (trigger === "manual_refresh") {
    if (websiteIntelligenceHasUsableContent(input.websiteIntelligence)) {
      return { shouldCrawl: false, reason: "intelligence_refresh" };
    }
    return { shouldCrawl: true, reason: "initial_generate_missing_stored" };
  }

  if (trigger !== "discussion_import") {
    return { shouldCrawl: false, reason: "non_import_trigger" };
  }

  if (websiteIntelligenceHasUsableContent(input.websiteIntelligence)) {
    // Same import job retrying after a successful crawl — reuse stored brain.
    return { shouldCrawl: false, reason: "import_retry_reuse_stored" };
  }

  // First import attempt, or import retry after empty/failed crawl.
  const priorAttempted = Boolean(
    input.websiteIntelligence &&
      (typeof input.websiteIntelligence.scraped_at === "string" ||
        typeof input.websiteIntelligence.error === "string"),
  );

  return {
    shouldCrawl: true,
    reason: priorAttempted ? "import_retry_resume" : "initial_import",
  };
}
