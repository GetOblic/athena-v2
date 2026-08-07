/**
 * Shared Technical SEO severity contract.
 * Priorities: Critical | High | Improvement.
 * Critical requires executive critical evidence — not prompt pressure.
 */

import type {
  SeoTechnicalActionPlan,
  SeoTechnicalExecutiveEvaluation,
  SeoTechnicalPriority,
} from "@/services/seo/seoReportTypes";

export const SEO_TECHNICAL_PRIORITIES = [
  "Critical",
  "High",
  "Improvement",
] as const satisfies readonly SeoTechnicalPriority[];

export function isSeoTechnicalPriority(
  value: unknown,
): value is SeoTechnicalPriority {
  return (
    typeof value === "string" &&
    (SEO_TECHNICAL_PRIORITIES as readonly string[]).includes(value)
  );
}

/**
 * Prevent Action Plan Critical items when Executive Evaluation reports none.
 * Downgrades orphan Critical items to High (preserves readability).
 */
export function normalizeActionPlanSeverityConsistency(
  actionPlan: SeoTechnicalActionPlan,
  executiveEvaluation: SeoTechnicalExecutiveEvaluation,
): SeoTechnicalActionPlan {
  const hasExecutiveCritical = executiveEvaluation.criticalIssues.length > 0;
  if (hasExecutiveCritical) {
    return actionPlan;
  }

  let changed = false;
  const items = actionPlan.items.map((item) => {
    if (item.priority !== "Critical") return item;
    changed = true;
    return { ...item, priority: "High" as const };
  });

  return changed ? { ...actionPlan, items } : actionPlan;
}

export function actionPlanHasOrphanCritical(
  actionPlan: SeoTechnicalActionPlan,
  executiveEvaluation: SeoTechnicalExecutiveEvaluation,
): boolean {
  if (executiveEvaluation.criticalIssues.length > 0) return false;
  return actionPlan.items.some((item) => item.priority === "Critical");
}
