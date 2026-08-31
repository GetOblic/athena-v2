/**
 * Presentation-only Intelligence Domain detail helpers.
 * Canonical health tokens and event kinds stay unchanged.
 * Does not read or write stored/generated content.
 */
import type { DomainIntelligenceSectionKey } from "@/lib/domainIntelligenceDisplay";
import { isDomainHealthState } from "@/lib/domainHealthDisplay";
import type { DomainLearningEventKind } from "@/services/intelligenceDomainService";
import { en } from "./messages/en";
import type { TenantMessages } from "./types";

type DetailCopy = TenantMessages["intelligenceDomains"]["detail"];

const SAFE_LABEL_FALLBACK = "—";

const HEALTH_LABEL_KEYS = {
  Learning: "healthLearning",
  Building: "healthBuilding",
  Confident: "healthConfident",
  Mature: "healthMature",
} as const satisfies Record<string, keyof DetailCopy>;

const EVENT_TITLE_KEYS = {
  intelligence: "eventIntelligence",
  import: "eventImport",
  analysis: "eventAnalysis",
  regeneration: "eventRegeneration",
  update: "eventUpdate",
  opportunity: "eventOpportunity",
  briefing: "eventBriefing",
  blueprint: "eventBlueprint",
} as const satisfies Record<DomainLearningEventKind, keyof DetailCopy>;

const SECTION_TITLE_KEYS = {
  terminology: "sectionTerminology",
  competitorsAlternatives: "sectionCompetitors",
  importantPeopleBrands: "sectionPeopleBrands",
  recurringQuestions: "sectionQuestions",
  recurringObjections: "sectionObjections",
  emergingTrends: "sectionTrends",
  recommendedContentAngles: "sectionContentAngles",
} as const satisfies Record<DomainIntelligenceSectionKey, keyof DetailCopy>;

function detailLabel(
  messages: TenantMessages,
  key: keyof DetailCopy,
): string {
  const localized = messages.intelligenceDomains.detail[key];
  if (typeof localized === "string" && localized.trim()) {
    return localized;
  }
  const fallback = en.intelligenceDomains.detail[key];
  if (typeof fallback === "string" && fallback.trim()) {
    return fallback;
  }
  return SAFE_LABEL_FALLBACK;
}

/**
 * Presentation-only domain health label.
 * Canonical health-state tokens stay Learning | Building | Confident | Mature.
 * Unknown values remain verbatim.
 */
export function getLocalizedDomainHealthLabel(
  messages: TenantMessages,
  healthState?: string | null,
): string {
  const token = String(healthState ?? "").trim();
  if (!isDomainHealthState(token)) {
    return token;
  }
  return detailLabel(messages, HEALTH_LABEL_KEYS[token]);
}

/**
 * Presentation-only learning-timeline title from structured event.kind.
 * Does not translate stored event.detail / event.title.
 * Unknown kinds fall back to the raw existing title.
 */
export function getLocalizedDomainLearningEventTitle(
  messages: TenantMessages,
  kind: string,
  fallbackTitle?: string,
): string {
  const key = EVENT_TITLE_KEYS[kind as DomainLearningEventKind];
  if (!key) {
    const raw = String(fallbackTitle ?? "").trim();
    return raw || kind;
  }
  return detailLabel(messages, key);
}

/**
 * Presentation-only intelligence section heading.
 * Generated section values stay verbatim.
 */
export function getLocalizedDomainIntelligenceSectionTitle(
  messages: TenantMessages,
  sectionKey: DomainIntelligenceSectionKey,
  fallbackTitle?: string,
): string {
  const key = SECTION_TITLE_KEYS[sectionKey];
  if (!key) {
    return String(fallbackTitle ?? "").trim() || SAFE_LABEL_FALLBACK;
  }
  return detailLabel(messages, key);
}
