/**
 * Presentation helpers for SEO Intelligence reports.
 * Derives executive overview signals and UI metadata from the existing package —
 * does not change generation contracts, prompts, or persistence.
 */

import type {
  SeoCommercialOpportunity,
  SeoCustomerIntentGap,
  SeoIntelligencePackage,
  SeoRoadmapEffort,
  SeoRoadmapItem,
  SeoRoadmapPriority,
} from "@/services/seo/seoReportTypes";

export type SeoScoreBand =
  | "strong"
  | "solid"
  | "developing"
  | "emerging"
  | "early";

export type SeoPillarScore = {
  /** 0–100 presentation strength */
  value: number;
  /** 1–5 star display */
  stars: number;
  label: string;
};

export type SeoPriorityVisual = {
  key: SeoRoadmapPriority | "fast_win" | "strategic" | "long_term";
  label: string;
  symbol: string;
  className: string;
};

export type SeoFutureActionKind =
  | "generate_article"
  | "generate_faq"
  | "generate_landing_page"
  | "generate_trust_page"
  | "generate_educational_guide"
  | "generate_comparison_page";

export type SeoExecutiveOverviewModel = {
  overallScore: SeoPillarScore;
  commercialReadiness: SeoPillarScore;
  contentCoverage: SeoPillarScore;
  trustAuthority: SeoPillarScore;
  biggestOpportunity: string;
  biggestRisk: string;
  fastestWin: string;
  recommendedNextAction: string;
  summary: string;
};

const WORDS_PER_MINUTE = 220;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function starsFromValue(value: number): number {
  return clamp(Math.round(value / 20), 1, 5);
}

const SCORE_BAND_ENGLISH: Record<SeoScoreBand, string> = {
  strong: "Strong",
  solid: "Solid",
  developing: "Developing",
  emerging: "Emerging",
  early: "Early",
};

/**
 * Structured score-band classification from the numeric pillar value.
 * English labels are a final presentation of this band, not the authority.
 */
export function seoScoreBandFromValue(value: number): SeoScoreBand {
  if (value >= 80) return "strong";
  if (value >= 65) return "solid";
  if (value >= 50) return "developing";
  if (value >= 35) return "emerging";
  return "early";
}

function labelFromValue(value: number): string {
  return SCORE_BAND_ENGLISH[seoScoreBandFromValue(value)];
}

function scoreFromText(text: string, baseline = 55): number {
  const lower = text.toLowerCase();
  let score = baseline;
  if (
    /\b(strong|robust|excellent|clear|well[- ]covered|mature|solid|compelling)\b/.test(
      lower,
    )
  ) {
    score += 14;
  }
  if (/\b(good|present|consistent|established|ready)\b/.test(lower)) {
    score += 8;
  }
  if (
    /\b(limited|sparse|thin|weak|missing|underrepresented|under[- ]covered|generic|early|developing)\b/.test(
      lower,
    )
  ) {
    score -= 14;
  }
  if (/\b(absent|none|no |lacking|critical gap)\b/.test(lower)) {
    score -= 18;
  }
  return clamp(score, 10, 95);
}

function pillar(value: number): SeoPillarScore {
  const rounded = Math.round(value);
  return {
    value: rounded,
    stars: starsFromValue(rounded),
    label: labelFromValue(rounded),
  };
}

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function formatStarRating(stars: number): string {
  const filled = clamp(stars, 0, 5);
  return `${"★".repeat(filled)}${"☆".repeat(5 - filled)}`;
}

export function estimateReadingMinutes(text: string): number {
  const words = countWords(text);
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

export function formatReadingTime(minutes: number): string {
  return `${minutes} min read`;
}

/** Soft-clean repetitive template phrasing for consulting-style display. */
export function cleanConsultingCopy(text: string): string {
  return text
    .replace(/^(athena recommends that you|athena recommends)\s+/i, "")
    .replace(/^(based on athena evidence[,:]?\s*)/i, "")
    .replace(/^(recommendation:\s*)/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeEvidenceKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s&/-]/g, "")
    .trim();
}

export function createEvidenceDeduper() {
  const seen = new Set<string>();
  return (items: string[]): string[] => {
    const unique: string[] = [];
    for (const item of items) {
      const trimmed = item.trim();
      if (!trimmed) continue;
      const key = normalizeEvidenceKey(trimmed);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(trimmed);
    }
    return unique;
  };
}

export function scoreContentCoverage(
  pkg: SeoIntelligencePackage,
): SeoPillarScore {
  const well = pkg.contentCoverage.wellCoveredServices.length;
  const weak = pkg.contentCoverage.weaklyCoveredServices.length;
  const missing =
    pkg.contentCoverage.missingServices.length +
    pkg.contentCoverage.missingCustomerQuestions.length +
    pkg.contentCoverage.missingTrustContent.length +
    pkg.contentCoverage.missingEducationalContent.length +
    pkg.contentCoverage.missingConversionContent.length;
  const total = well + weak + missing;
  const ratio = total === 0 ? 0.5 : well / total;
  const gapPenalty = clamp(missing * 4 + weak * 2, 0, 40);
  const value = clamp(ratio * 100 - gapPenalty + 20, 15, 95);
  return pillar(value);
}

export function scoreTrustAuthority(
  pkg: SeoIntelligencePackage,
): SeoPillarScore {
  const fields = [
    pkg.trustAndAuthority.trustSignals,
    pkg.trustAndAuthority.testimonials,
    pkg.trustAndAuthority.caseStudies,
    pkg.trustAndAuthority.expertPositioning,
    pkg.trustAndAuthority.authorityMessaging,
    pkg.trustAndAuthority.differentiation,
    pkg.trustAndAuthority.callsToAction,
    pkg.trustAndAuthority.consistency,
  ];
  const avg =
    fields.reduce((sum, field) => sum + scoreFromText(field), 0) /
    Math.max(fields.length, 1);
  return pillar(avg);
}

export function scoreCommercialReadiness(
  pkg: SeoIntelligencePackage,
): SeoPillarScore {
  const readiness = scoreFromText(pkg.executiveAssessment.seoReadiness, 50);
  const opportunityBoost = clamp(
    pkg.commercialOpportunities.opportunities.length * 4,
    0,
    16,
  );
  const visibility = scoreFromText(
    pkg.executiveAssessment.businessVisibilityAssessment,
    50,
  );
  return pillar((readiness + visibility) / 2 + opportunityBoost * 0.35);
}

export function buildSeoExecutiveOverview(
  pkg: SeoIntelligencePackage,
): SeoExecutiveOverviewModel {
  const contentCoverage = scoreContentCoverage(pkg);
  const trustAuthority = scoreTrustAuthority(pkg);
  const commercialReadiness = scoreCommercialReadiness(pkg);
  const qualitative = scoreFromText(
    [
      pkg.executiveAssessment.overallAssessment,
      pkg.executiveAssessment.seoReadiness,
      pkg.executiveAssessment.summary,
    ].join(" "),
    55,
  );
  const overallScore = pillar(
    contentCoverage.value * 0.3 +
      trustAuthority.value * 0.25 +
      commercialReadiness.value * 0.25 +
      qualitative * 0.2,
  );

  const sortedRoadmap = [...pkg.ninetyDayRoadmap.items].sort((a, b) =>
    a.priority.localeCompare(b.priority),
  );
  const p0 = sortedRoadmap.find((item) => item.priority === "P0");
  const fastWin =
    sortedRoadmap.find(
      (item) =>
        item.estimatedEffort === "low" &&
        (item.priority === "P0" || item.priority === "P1"),
    ) ??
    sortedRoadmap.find((item) => item.estimatedEffort === "low") ??
    p0 ??
    sortedRoadmap[0];

  const topOpportunity =
    pkg.commercialOpportunities.opportunities[0]?.title ??
    p0?.recommendation ??
    pkg.commercialOpportunities.summary;

  const biggestRisk =
    pkg.executiveAssessment.weaknesses[0] ??
    pkg.customerIntent.painPointGaps[0] ??
    pkg.contentCoverage.missingCustomerQuestions[0] ??
    "Coverage gaps remain across high-intent buyer journeys.";

  return {
    overallScore,
    commercialReadiness,
    contentCoverage,
    trustAuthority,
    biggestOpportunity: cleanConsultingCopy(topOpportunity),
    biggestRisk: cleanConsultingCopy(biggestRisk),
    fastestWin: cleanConsultingCopy(
      fastWin?.recommendation ?? pkg.ninetyDayRoadmap.overview,
    ),
    recommendedNextAction: cleanConsultingCopy(
      p0?.recommendation ??
        sortedRoadmap[0]?.recommendation ??
        pkg.executiveAssessment.summary,
    ),
    summary: pkg.executiveAssessment.summary,
  };
}

export function priorityVisual(
  priority: SeoRoadmapPriority,
  effort?: SeoRoadmapEffort,
): SeoPriorityVisual {
  if (effort === "low" && (priority === "P0" || priority === "P1")) {
    return {
      key: "fast_win",
      label: "Fast Win",
      symbol: "⚡",
      className: "text-amber-200 border-amber-300/30 bg-amber-300/10",
    };
  }
  if (priority === "P0") {
    return {
      key: "P0",
      label: "High Priority",
      symbol: "★★★★★",
      className: "text-[var(--athena-orange)] border-[rgba(255,102,0,0.35)] bg-[rgba(255,102,0,0.1)]",
    };
  }
  if (priority === "P1") {
    return {
      key: "strategic",
      label: "Strategic Opportunity",
      symbol: "▲",
      className: "text-sky-200 border-sky-300/30 bg-sky-300/10",
    };
  }
  if (priority === "P2") {
    return {
      key: "P2",
      label: "Planned Growth",
      symbol: "◆",
      className: "text-white/70 border-white/15 bg-white/[0.04]",
    };
  }
  return {
    key: "long_term",
    label: "Long-Term Investment",
    symbol: "■",
    className: "text-white/55 border-white/10 bg-white/[0.03]",
  };
}

export function inferFutureActionKinds(input: {
  contentType?: string;
  title?: string;
  recommendation?: string;
}): SeoFutureActionKind[] {
  const haystack = [
    input.contentType,
    input.title,
    input.recommendation,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const kinds: SeoFutureActionKind[] = [];
  if (/\bfaq\b|questions?\b/.test(haystack)) kinds.push("generate_faq");
  if (/\bcase study|testimonial|trust|proof\b/.test(haystack)) {
    kinds.push("generate_trust_page");
  }
  if (/\beducational|guide|playbook|how[- ]to\b/.test(haystack)) {
    kinds.push("generate_educational_guide");
  }
  if (/\bcomparison|vs\.?|versus\b/.test(haystack)) {
    kinds.push("generate_comparison_page");
  }
  if (/\blanding|conversion|offer page|service page\b/.test(haystack)) {
    kinds.push("generate_landing_page");
  }
  if (/\barticle|blog|thought leadership\b/.test(haystack)) {
    kinds.push("generate_article");
  }
  if (kinds.length === 0) kinds.push("generate_article");
  return [...new Set(kinds)];
}

export function sectionReadingCorpus(parts: string[]): string {
  return parts.filter(Boolean).join("\n");
}

export type SeoGroupedOpportunity = SeoCommercialOpportunity & {
  futureActionKinds: SeoFutureActionKind[];
};

export type SeoGroupedIntentGap = SeoCustomerIntentGap & {
  futureActionKinds: SeoFutureActionKind[];
};

export type SeoGroupedRoadmapItem = SeoRoadmapItem & {
  visual: SeoPriorityVisual;
  futureActionKinds: SeoFutureActionKind[];
};

export function groupCommercialOpportunities(
  opportunities: SeoCommercialOpportunity[],
): SeoGroupedOpportunity[] {
  return opportunities.map((opportunity) => ({
    ...opportunity,
    title: cleanConsultingCopy(opportunity.title),
    rationale: cleanConsultingCopy(opportunity.rationale),
    expectedImpact: cleanConsultingCopy(opportunity.expectedImpact),
    futureActionKinds: inferFutureActionKinds({
      contentType: opportunity.contentType,
      title: opportunity.title,
    }),
  }));
}

export function groupIntentGaps(
  gaps: SeoCustomerIntentGap[],
): SeoGroupedIntentGap[] {
  return gaps.map((gap) => ({
    ...gap,
    recommendation: cleanConsultingCopy(gap.recommendation),
    websiteGap: cleanConsultingCopy(gap.websiteGap),
    futureActionKinds: inferFutureActionKinds({
      recommendation: gap.recommendation,
      title: gap.intent,
    }),
  }));
}

export function groupRoadmapItems(
  items: SeoRoadmapItem[],
): SeoGroupedRoadmapItem[] {
  return [...items]
    .sort((a, b) => a.priority.localeCompare(b.priority))
    .map((item) => ({
      ...item,
      recommendation: cleanConsultingCopy(item.recommendation),
      reason: cleanConsultingCopy(item.reason),
      expectedBusinessImpact: cleanConsultingCopy(item.expectedBusinessImpact),
      visual: priorityVisual(item.priority, item.estimatedEffort),
      futureActionKinds: inferFutureActionKinds({
        recommendation: item.recommendation,
      }),
    }));
}
