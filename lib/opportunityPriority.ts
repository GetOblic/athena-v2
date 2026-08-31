import { normalizeOpportunityStatus } from "@/lib/opportunityStatus";
import type { Opportunity } from "@/services/opportunityService";

export type OpportunityPriorityKey =
  | "immediate_action"
  | "high_intent"
  | "monitor"
  | "low_priority";

export type OpportunityPriorityPresentation = {
  key: OpportunityPriorityKey;
  title: string;
  description: string;
};

export const OPPORTUNITY_PRIORITY_ORDER: OpportunityPriorityKey[] = [
  "immediate_action",
  "high_intent",
  "monitor",
  "low_priority",
];

const PRIORITY_PRESENTATIONS: Record<
  OpportunityPriorityKey,
  Omit<OpportunityPriorityPresentation, "key">
> = {
  immediate_action: {
    title: "Immediate Action",
    description: "High score or urgency — pursue now.",
  },
  high_intent: {
    title: "High Intent",
    description: "Strong signals worth active follow-up.",
  },
  monitor: {
    title: "Monitor",
    description: "Promising threads to watch closely.",
  },
  low_priority: {
    title: "Low Priority",
    description: "Lower urgency or closed outcomes.",
  },
};

const URGENCY_RANK: Record<string, number> = {
  critical: 5,
  urgent: 4,
  high: 3,
  medium: 2,
  moderate: 2,
  low: 1,
};

export function getUrgencyRank(value?: string | null): number {
  if (!value) {
    return 0;
  }

  return URGENCY_RANK[value.trim().toLowerCase()] ?? 0;
}

export function classifyOpportunityPriority(
  opportunity: Opportunity,
): OpportunityPriorityKey {
  const score = opportunity.score ?? 0;
  const urgency = getUrgencyRank(opportunity.urgency);
  const salesStatus = normalizeOpportunityStatus(opportunity.status);

  if (salesStatus === "won" || salesStatus === "lost") {
    return "low_priority";
  }

  if (
    score >= 75 ||
    urgency >= 4 ||
    salesStatus === "approved_for_outreach" ||
    salesStatus === "outreach_started" ||
    salesStatus === "conversation_active"
  ) {
    return "immediate_action";
  }

  if (score >= 50 || urgency >= 3 || salesStatus === "qualified") {
    return "high_intent";
  }

  if (score >= 25 || urgency >= 2) {
    return "monitor";
  }

  return "low_priority";
}

export function getOpportunityPriorityPresentation(
  key: OpportunityPriorityKey,
): OpportunityPriorityPresentation {
  return {
    key,
    ...PRIORITY_PRESENTATIONS[key],
  };
}

export function getOpportunityLatestActivity(
  opportunity: Opportunity,
): string {
  return opportunity.updated_at ?? opportunity.created_at;
}

export function sortOpportunitiesByPriority(
  a: Opportunity,
  b: Opportunity,
): number {
  if (b.score !== a.score) {
    return b.score - a.score;
  }

  const urgencyDiff =
    getUrgencyRank(b.urgency) - getUrgencyRank(a.urgency);
  if (urgencyDiff !== 0) {
    return urgencyDiff;
  }

  return (
    new Date(getOpportunityLatestActivity(b)).getTime() -
    new Date(getOpportunityLatestActivity(a)).getTime()
  );
}

const DEFAULT_WHY_NOW_URGENCY_TEMPLATE = "Urgency is {value}.";

export function buildWhyNowSummary(
  opportunity: Opportunity,
  briefingSummary?: string | null,
  urgencyTemplate: string = DEFAULT_WHY_NOW_URGENCY_TEMPLATE,
): string | null {
  const parts: string[] = [];

  if (opportunity.urgency) {
    const template = urgencyTemplate.includes("{value}")
      ? urgencyTemplate
      : DEFAULT_WHY_NOW_URGENCY_TEMPLATE;
    parts.push(template.replace(/\{value\}/g, opportunity.urgency));
  }

  if (opportunity.recommended_action?.trim()) {
    parts.push(opportunity.recommended_action.trim());
  } else if (opportunity.ai_recommendation?.trim()) {
    parts.push(opportunity.ai_recommendation.trim());
  }

  if (briefingSummary?.trim()) {
    parts.push(briefingSummary.trim());
  }

  if (parts.length === 0 && opportunity.reason?.trim()) {
    return opportunity.reason.trim();
  }

  return parts.length > 0 ? parts.join(" ") : null;
}
