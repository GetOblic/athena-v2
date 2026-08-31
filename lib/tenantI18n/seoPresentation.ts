/**
 * Presentation-only SEO status, stage, score, and shared chrome.
 * Does not read or write stored tokens, API values, or generation payloads.
 */
import type { SeoExecutiveOverviewChrome } from "@/components/seo/SeoExecutiveOverview";
import type { SeoRecommendationCardChrome } from "@/components/seo/SeoRecommendationCard";
import type { SeoReportSectionChrome } from "@/components/seo/SeoReportSection";
import type { SeoWebsitePagesAnalyzedChrome } from "@/components/seo/SeoWebsitePagesAnalyzedSection";
import type { ConfirmDeleteChrome } from "@/components/ui/ConfirmDeleteControl";
import type { SeoGenerationType } from "@/services/seo/seoGenerationType";
import {
  seoScoreBandFromValue,
  type SeoExecutiveOverviewModel,
  type SeoPillarScore,
  type SeoPriorityVisual,
} from "@/services/seo/seoReportPresentation";
import type { SeoReportGenerationStage } from "@/services/seo/seoReportTypes";
import { SEO_REPORT_STATUSES } from "@/services/seo/seoReportTypes";
import { interpolateTenantMessage } from "./interpolate";
import { getAssetCopyChrome } from "./opportunityPresentation";
import { en } from "./messages/en";
import type { TenantMessages } from "./types";

const SAFE_LABEL_FALLBACK = "—";
const COVERAGE_GAPS_SENTINEL = en.seo.detail.coverageGapsFallback;

const STATUS_KEYS = {
  Queued: "queued",
  Processing: "processing",
  Ready: "ready",
  "Processing Failed": "processingFailed",
} as const satisfies Record<
  (typeof SEO_REPORT_STATUSES)[number],
  keyof TenantMessages["seo"]["status"]
>;

const STAGE_KEYS = {
  assembling_context: "assemblingContext",
  executive_assessment: "executiveAssessment",
  content_coverage: "contentCoverage",
  customer_intent: "customerIntent",
  commercial_opportunities: "commercialOpportunities",
  trust_and_authority: "trustAndAuthority",
  ninety_day_roadmap: "ninetyDayRoadmap",
  analyzing_technical_evidence: "analyzingTechnicalEvidence",
  technical_executive_evaluation: "technicalExecutiveEvaluation",
  technical_recommendations: "technicalRecommendations",
  technical_action_plan: "technicalActionPlan",
  validating: "validating",
  completed: "completed",
  failed: "failed",
} as const satisfies Record<
  SeoReportGenerationStage,
  keyof TenantMessages["seo"]["stages"]
>;

const PRIORITY_KEYS = {
  fast_win: "fastWin",
  P0: "highPriority",
  strategic: "strategicOpportunity",
  P2: "plannedGrowth",
  long_term: "longTermInvestment",
} as const;

const TECHNICAL_PRIORITY_KEYS = {
  Critical: "critical",
  High: "high",
  Improvement: "improvement",
} as const;

const EFFORT_KEYS = {
  low: "low",
  medium: "medium",
  high: "high",
} as const;

/**
 * Presentation-only SEO report status label.
 * Unknown tokens remain verbatim.
 */
export function getLocalizedSeoReportStatusLabel(
  messages: TenantMessages,
  status?: string | null,
): string {
  const trimmed = String(status ?? "").trim();
  if (!trimmed) {
    const localized = messages.seo.status.queued;
    return localized.trim() ? localized : en.seo.status.queued;
  }
  const key = STATUS_KEYS[trimmed as keyof typeof STATUS_KEYS];
  if (!key) {
    return trimmed;
  }
  const localized = messages.seo.status[key];
  if (typeof localized === "string" && localized.trim()) {
    return localized;
  }
  const fallback = en.seo.status[key];
  return typeof fallback === "string" && fallback.trim()
    ? fallback
    : SAFE_LABEL_FALLBACK;
}

/**
 * Presentation-only SEO generation-stage label.
 * Unknown tokens remain verbatim; missing stage uses the queued fallback.
 */
export function getLocalizedSeoGenerationStageLabel(
  messages: TenantMessages,
  stage?: string | null,
): string {
  const trimmed = String(stage ?? "").trim();
  if (!trimmed) {
    const localized = messages.seo.statusPanel.queuedFallback;
    return localized.trim()
      ? localized
      : en.seo.statusPanel.queuedFallback;
  }
  const key = STAGE_KEYS[trimmed as keyof typeof STAGE_KEYS];
  if (!key) {
    return trimmed;
  }
  const localized = messages.seo.stages[key];
  if (typeof localized === "string" && localized.trim()) {
    return localized;
  }
  return en.seo.stages[key];
}

/**
 * Presentation-only SEO generation-type label.
 * Canonical tokens remain intelligence | technical.
 */
export function getLocalizedSeoGenerationTypeLabel(
  messages: TenantMessages,
  generationType: SeoGenerationType,
): string {
  const key = generationType === "technical" ? "technical" : "intelligence";
  const localized = messages.seo.generationType[key];
  if (typeof localized === "string" && localized.trim()) {
    return localized;
  }
  return en.seo.generationType[key];
}

function localizePillarScore(
  messages: TenantMessages,
  score: SeoPillarScore,
): SeoPillarScore {
  const band = seoScoreBandFromValue(score.value);
  const localized = messages.seo.scores[band];
  return {
    ...score,
    label: localized.trim() ? localized : en.seo.scores[band],
  };
}

/**
 * Remaps application-owned score labels and the deterministic risk fallback.
 * Generated overview values stay verbatim.
 */
export function localizeSeoExecutiveOverview(
  messages: TenantMessages,
  model: SeoExecutiveOverviewModel,
): SeoExecutiveOverviewModel {
  return {
    ...model,
    overallScore: localizePillarScore(messages, model.overallScore),
    commercialReadiness: localizePillarScore(
      messages,
      model.commercialReadiness,
    ),
    contentCoverage: localizePillarScore(messages, model.contentCoverage),
    trustAuthority: localizePillarScore(messages, model.trustAuthority),
    biggestRisk:
      model.biggestRisk === COVERAGE_GAPS_SENTINEL
        ? messages.seo.detail.coverageGapsFallback
        : model.biggestRisk,
  };
}

export function localizeSeoPriorityVisual(
  messages: TenantMessages,
  visual: SeoPriorityVisual,
): SeoPriorityVisual {
  const key = PRIORITY_KEYS[visual.key as keyof typeof PRIORITY_KEYS];
  if (!key) {
    return visual;
  }
  const localized = messages.seo.priority[key];
  return {
    ...visual,
    label: localized.trim() ? localized : en.seo.priority[key],
  };
}

export function getLocalizedSeoTechnicalPriorityLabel(
  messages: TenantMessages,
  priority?: string | null,
): string {
  const trimmed = String(priority ?? "").trim();
  const key =
    TECHNICAL_PRIORITY_KEYS[trimmed as keyof typeof TECHNICAL_PRIORITY_KEYS];
  if (!key) {
    return trimmed;
  }
  const localized = messages.seo.technicalPriority[key];
  return localized.trim() ? localized : en.seo.technicalPriority[key];
}

export function getLocalizedSeoEffortLabel(
  messages: TenantMessages,
  effort?: string | null,
): string {
  const trimmed = String(effort ?? "").trim();
  const key = EFFORT_KEYS[trimmed as keyof typeof EFFORT_KEYS];
  if (!key) {
    return trimmed;
  }
  const localized = messages.seo.effort[key];
  return localized.trim() ? localized : en.seo.effort[key];
}

export function formatLocalizedSeoReadingTime(
  messages: TenantMessages,
  minutes: number,
): string {
  const template = messages.seo.detail.readingTime.includes("{minutes}")
    ? messages.seo.detail.readingTime
    : en.seo.detail.readingTime;
  return interpolateTenantMessage(template, { minutes });
}

export function formatLocalizedSeoStarsAria(
  messages: TenantMessages,
  stars: number,
): string {
  const template = messages.seo.detail.starsAria.includes("{stars}")
    ? messages.seo.detail.starsAria
    : en.seo.detail.starsAria;
  return interpolateTenantMessage(template, { stars });
}

export function getSeoCopyChrome(messages: TenantMessages) {
  return getAssetCopyChrome(messages);
}

export function getSeoReportSectionChrome(
  messages: TenantMessages,
): SeoReportSectionChrome {
  return {
    emptyValue: messages.seo.emptyValue,
    readingTime: (minutes) => formatLocalizedSeoReadingTime(messages, minutes),
    starsAria: (stars) => formatLocalizedSeoStarsAria(messages, stars),
    expand: messages.seo.expand,
    collapse: messages.seo.collapse,
    copy: getSeoCopyChrome(messages),
  };
}

export function getSeoRecommendationCardChrome(
  messages: TenantMessages,
): SeoRecommendationCardChrome {
  const detail = messages.seo.detail;
  return {
    whyLabel: detail.whyAthenaRecommends,
    evidenceLabel: detail.evidence,
    impactLabel: detail.expectedBusinessImpact,
    copyWhyPrefix: (why) =>
      interpolateTenantMessage(
        detail.copyWhyPrefix.includes("{why}")
          ? detail.copyWhyPrefix
          : en.seo.detail.copyWhyPrefix,
        { why },
      ),
    copyImpactPrefix: (impact) =>
      interpolateTenantMessage(
        detail.copyImpactPrefix.includes("{impact}")
          ? detail.copyImpactPrefix
          : en.seo.detail.copyImpactPrefix,
        { impact },
      ),
    copyEvidencePrefix: (evidence) =>
      interpolateTenantMessage(
        detail.copyEvidencePrefix.includes("{evidence}")
          ? detail.copyEvidencePrefix
          : en.seo.detail.copyEvidencePrefix,
        { evidence },
      ),
    copy: getSeoCopyChrome(messages),
  };
}

export function getSeoExecutiveOverviewChrome(
  messages: TenantMessages,
): SeoExecutiveOverviewChrome {
  const detail = messages.seo.detail;
  return {
    eyebrow: detail.executiveOverview,
    atAGlance: detail.atAGlance,
    overallScore: detail.overallScore,
    commercialReadiness: detail.commercialReadiness,
    contentCoverage: detail.contentCoverage,
    trustAuthority: detail.trustAuthority,
    biggestOpportunity: detail.biggestOpportunity,
    biggestRisk: detail.biggestRisk,
    fastestWin: detail.fastestWin,
    recommendedNextAction: detail.recommendedNextAction,
  };
}

export function getSeoWebsitePagesChrome(
  messages: TenantMessages,
): SeoWebsitePagesAnalyzedChrome {
  return {
    title: messages.seo.detail.websitePagesAnalyzed,
    pageCountOne: messages.seo.detail.pageCountOne,
    pageCountMany: messages.seo.detail.pageCountMany,
    emptyMessage: messages.seo.detail.pagesEmpty,
    untitledPage: messages.seo.detail.untitledPage,
    expand: messages.seo.expand,
    collapse: messages.seo.collapse,
  };
}

export function getSeoConfirmDeleteChrome(
  messages: TenantMessages,
): ConfirmDeleteChrome {
  return {
    delete: messages.common.delete,
    cancel: messages.common.cancel,
    confirmDelete: messages.common.confirmDelete,
    deleting: messages.common.deleting,
    confirmDeletion: messages.common.confirmDeletion,
  };
}
