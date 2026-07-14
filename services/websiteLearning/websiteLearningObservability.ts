/**
 * Structured, non-sensitive website-learning observability.
 * Logs decisions and outcomes only — never content, HTML, prompts, or secrets.
 */

import type { WebsiteLearningDecision } from "@/services/prospects/prospectWebsiteLearningPolicy";

export type ProspectWebsiteLearningLogReason =
  | "initial_import_missing_intelligence"
  | "stored_intelligence_present"
  | "non_initial_trigger"
  | "missing_website";

export type IdentityWebsiteLearningLogReason =
  | "missing_homepage_learning"
  | "stored_homepage_learning_present";

/** Map internal policy reasons to stable production observability reasons. */
export function toProspectWebsiteLearningLogReason(
  policyReason: WebsiteLearningDecision["reason"],
): ProspectWebsiteLearningLogReason {
  switch (policyReason) {
    case "no_website":
      return "missing_website";
    case "intelligence_refresh":
    case "non_import_trigger":
      return "non_initial_trigger";
    case "import_retry_reuse_stored":
      return "stored_intelligence_present";
    case "initial_import":
    case "import_retry_resume":
      return "initial_import_missing_intelligence";
  }
}

export function logWebsiteLearning(
  payload: Record<string, string | boolean | null | undefined>,
): void {
  console.log("[ATHENA_WEBSITE_LEARNING]", payload);
}
