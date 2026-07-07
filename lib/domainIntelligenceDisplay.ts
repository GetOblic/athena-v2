import type { CommunityIntelligence } from "@/services/communityIntelligenceService";

export type DomainIntelligenceSection = {
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
      title: "Terminology",
      value: readRawField(intelligence, "terminology"),
    },
    {
      title: "Competitors / Alternatives",
      value:
        readRawField(intelligence, "competitors_alternatives") ??
        intelligence?.strategic_recommendations ??
        null,
    },
    {
      title: "Important People / Brands",
      value: readRawField(intelligence, "important_people_brands"),
    },
    {
      title: "Recurring Questions",
      value: intelligence?.recurring_questions ?? null,
    },
    {
      title: "Recurring Objections",
      value: intelligence?.recurring_objections ?? null,
    },
    {
      title: "Emerging Trends",
      value: intelligence?.market_trends ?? null,
    },
    {
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
