import type { CommunityIntelligence } from "@/services/communityIntelligenceService";

export type DomainIntelligenceSectionKey =
  | "terminology"
  | "competitorsAlternatives"
  | "importantPeopleBrands"
  | "recurringQuestions"
  | "recurringObjections"
  | "emergingTrends"
  | "recommendedContentAngles";

export type DomainIntelligenceSection = {
  key: DomainIntelligenceSectionKey;
  title: string;
  value: string | null;
};

const EMPTY_MESSAGE =
  "Athena will populate this as more discussions are analyzed.";

function readRawField(
  intelligence: CommunityIntelligence | null,
  key: string,
): string | null {
  const rawValue = intelligence?.raw_json?.[key];
  return typeof rawValue === "string" && rawValue.trim() ? rawValue.trim() : null;
}

export function getDomainIntelligenceSections(
  intelligence: CommunityIntelligence | null,
): DomainIntelligenceSection[] {
  return [
    {
      key: "terminology",
      title: "Terminology",
      value: readRawField(intelligence, "terminology"),
    },
    {
      key: "competitorsAlternatives",
      title: "Competitors / Alternatives",
      value:
        readRawField(intelligence, "competitors_alternatives") ??
        intelligence?.strategic_recommendations ??
        null,
    },
    {
      key: "importantPeopleBrands",
      title: "Important People / Brands",
      value: readRawField(intelligence, "important_people_brands"),
    },
    {
      key: "recurringQuestions",
      title: "Recurring Questions",
      value: intelligence?.recurring_questions ?? null,
    },
    {
      key: "recurringObjections",
      title: "Recurring Objections",
      value: intelligence?.recurring_objections ?? null,
    },
    {
      key: "emergingTrends",
      title: "Emerging Trends",
      value: intelligence?.market_trends ?? null,
    },
    {
      key: "recommendedContentAngles",
      title: "Recommended Content Angles",
      value:
        intelligence?.recommended_content ??
        intelligence?.recommended_campaigns ??
        null,
    },
  ];
}

export function getDomainIntelligenceEmptyMessage(): string {
  return EMPTY_MESSAGE;
}
