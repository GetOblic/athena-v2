/**
 * Authoritative Prospect website-learning trigger policy.
 *
 * Website learning is an ingestion concern (Manual/CSV import),
 * not a regeneration concern (Refresh / Append / metadata edits).
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
 * Allowed: discussion_import when usable website_intelligence is not yet stored.
 * Denied: manual_refresh, discussion_update, and any other non-import trigger.
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

  if (trigger !== "discussion_import") {
    if (trigger === "manual_refresh") {
      return { shouldCrawl: false, reason: "intelligence_refresh" };
    }
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
