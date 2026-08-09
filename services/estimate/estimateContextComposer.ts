/**
 * Athena Estimate organization context composer (V26 L3).
 *
 * Accepts a TRUSTED organizationId supplied only after L2/L0 authorization.
 * Does NOT establish Master authorization, write tenant intelligence, or call LLMs.
 *
 * Strict separation:
 *   TRUSTED ATHENA EVIDENCE  vs  OPERATOR PROJECT GUIDANCE
 */

import {
  formatBrainContextForPrompt,
  type PromptIdentityContext,
} from "@/services/brain/formatBrainContextForPrompt";
import type { BrainEngineContext } from "@/services/brain/brainContextTypes";
import {
  normalizeEstimateRequest,
} from "@/services/estimate/athenaEstimateRequest";
import type { EstimateRequest } from "@/services/estimate/athenaEstimateTypes";
import {
  extractGeoEvidenceFromDeepWebsite,
  extractGeoEvidenceFromExecutiveIntelligence,
  resolveEstimateGeoCurrency,
  type EstimateGeoCurrencyResult,
} from "@/services/estimate/estimateGeoCurrency";
import {
  IDENTITY_EXECUTIVE_INTELLIGENCE_KEY,
  readIdentityExecutiveIntelligence,
  type IdentityExecutiveIntelligence,
} from "@/services/identity/identityExecutiveIntelligence";
import type { Persona } from "@/services/personas/personaService";
import type { SeoReport } from "@/services/seo/seoReportTypes";
import {
  isSeoTechnicalPackage,
  type SeoIntelligencePackage,
  type SeoTechnicalPackage,
} from "@/services/seo/seoReportTypes";
import { resolveSeoGenerationType } from "@/services/seo/seoGenerationType";
import { loadOrganizationDeepWebsiteIntelligence } from "@/services/seo/seoContextComposer";
import {
  formatDeepIntelligenceForBrainPrompt,
  type DeepWebsiteIntelligence,
} from "@/services/websiteLearning/deepScrape/deepWebsiteIntelligence";

type BuildBrainFn = (organizationId: string) => Promise<BrainEngineContext | null>;
type LoadPersonasFn = (organizationId: string) => Promise<Persona[]>;
type LoadDeepIntelligenceFn = (
  organizationId: string,
) => Promise<DeepWebsiteIntelligence | null>;
type LoadSeoReportsFn = (organizationId: string) => Promise<SeoReport[]>;

async function defaultBuildBrain(
  organizationId: string,
): Promise<BrainEngineContext | null> {
  const { buildBrainContextForOrganization } = await import(
    "@/services/brain/brainContextBuilder"
  );
  return buildBrainContextForOrganization(organizationId);
}

async function defaultLoadPersonas(organizationId: string): Promise<Persona[]> {
  const { getPersonas } = await import("@/services/personas/personaService");
  return getPersonas(organizationId);
}

async function defaultLoadSeoReports(
  organizationId: string,
): Promise<SeoReport[]> {
  const { listSeoReports } = await import("@/services/seo/seoReportService");
  return listSeoReports(organizationId);
}

/** Frozen L3 char budgets (methodology block excluded until later phase). */
export const ESTIMATE_CONTEXT_LIMITS = {
  personasMax: 6,
  fieldTruncate: 220,
  brainMaxChars: 10_000,
  executiveIntelligenceMaxChars: 4_000,
  deepWebsiteMaxChars: 12_000,
  organizationAggregatesMaxChars: 4_000,
  strategicSeoMaxChars: 3_000,
  technicalSeoMaxChars: 3_000,
  personasMaxChars: 4_000,
  operatorGuidanceMaxChars: 4_000,
  /** Sum of trusted source budgets (excludes operator + future methodology). */
  trustedTotalMaxChars: 40_000,
  /** Trusted + operator guidance. */
  totalMaxChars: 44_000,
} as const;

export type EstimatePersonaSummary = {
  personaName: string;
  category: string | null;
  occupation: string | null;
  seniority: string | null;
  painPoints: string | null;
  objections: string | null;
  motivations: string | null;
  buyingTriggers: string | null;
  valueDrivers: string | null;
};

export type EstimateTrustedContextBlocks = {
  brain: string;
  executiveIntelligence: string;
  deepWebsite: string;
  organizationAggregates: string;
  strategicSeo: string;
  technicalSeo: string;
  personas: string;
};

export type EstimateOrganizationContext = {
  organizationId: string;
  trusted: EstimateTrustedContextBlocks;
  composedTrustedContext: string;
  operatorGuidanceBlock: string;
  geoCurrency: EstimateGeoCurrencyResult;
  meta: {
    available: {
      brain: boolean;
      executiveIntelligence: boolean;
      deepWebsite: boolean;
      strategicSeo: boolean;
      technicalSeo: boolean;
      personas: boolean;
    };
    included: {
      strategicSeo: boolean;
      technicalSeo: boolean;
      personas: boolean;
    };
    charCounts: {
      brain: number;
      executiveIntelligence: number;
      deepWebsite: number;
      organizationAggregates: number;
      strategicSeo: number;
      technicalSeo: number;
      personas: number;
      operatorGuidance: number;
      composedTrusted: number;
    };
    totalChars: number;
    personaCount: number;
  };
};

export type ComposeEstimateOrganizationContextDeps = {
  buildBrain?: BuildBrainFn;
  loadPersonas?: LoadPersonasFn;
  loadDeepIntelligence?: LoadDeepIntelligenceFn;
  loadSeoReports?: LoadSeoReportsFn;
};

function truncateText(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function clampBlock(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function unavailable(message: string): string {
  return message;
}

/**
 * Narrow keyword matcher — technical SEO / website remediation relevance.
 * Deterministic; not a semantic classifier.
 */
export function isTechnicalSeoRelevantForEstimate(
  request: EstimateRequest,
): boolean {
  const haystack = [
    request.projectNeed,
    request.additionalContext ?? "",
  ]
    .join("\n")
    .toLowerCase();

  const patterns: RegExp[] = [
    /\btechnical\s+seo\b/,
    /\bseo\b/,
    /\bwebsite\b/,
    /\bweb\s*site\b/,
    /\bredesign\b/,
    /\bcrawl(?:ing|er|s)?\b/,
    /\bindex(?:ation|ing)?\b/,
    /\bspeed\b/,
    /\bperformance\b/,
    /\bschema\b/,
    /\bstructured\s+data\b/,
    /\bmetadata\b/,
    /\bmeta\s+data\b/,
    /\bcanonical\b/,
    /\bredirects?\b/,
    /\binternal\s+link(?:ing|s)?\b/,
    /\bon[- ]page\b/,
    /\bsitemap\b/,
    /\brobots\.txt\b/,
    /\bcore\s+web\s+vitals\b/,
    /\bpagespeed\b/,
    /\bsite\s+architecture\b/,
  ];
  return patterns.some((pattern) => pattern.test(haystack));
}

/**
 * Narrow keyword matcher — commercially relevant persona inclusion.
 */
export function isPersonaContextRelevantForEstimate(
  request: EstimateRequest,
): boolean {
  const haystack = [
    request.projectNeed,
    request.additionalContext ?? "",
  ]
    .join("\n")
    .toLowerCase();

  const patterns: RegExp[] = [
    /\baudience\b/,
    /\bpersonas?\b/,
    /\bpositioning\b/,
    /\bmarketing\b/,
    /\boffer(?:ing)?\b/,
    /\bcustomers?\b/,
    /\bconversion\b/,
    /\bbranding\b/,
    /\bbrand\b/,
    /\bcontent\b/,
    /\bmessaging\b/,
    /\bbuyers?\b/,
    /\bsegment(?:ation|s)?\b/,
    /\btarget\s+market\b/,
    /\bcampaign\b/,
    /\bgtm\b/,
    /\bgo[- ]to[- ]market\b/,
    /\bicp\b/,
    /\bideal\s+customer\b/,
  ];
  return patterns.some((pattern) => pattern.test(haystack));
}

export function formatEstimateOperatorGuidanceBlock(
  request: EstimateRequest,
): string {
  const normalized = normalizeEstimateRequest(request);
  const lines = [
    "OPERATOR PROJECT GUIDANCE",
    "(Operator-entered assertions — NOT automatically client facts. Do not merge into trusted business evidence.)",
    "",
    `projectNeed: ${normalized.projectNeed}`,
  ];
  if (normalized.additionalContext) {
    lines.push(`additionalContext: ${normalized.additionalContext}`);
  }
  if (normalized.timeframe) {
    lines.push(`timeframe: ${normalized.timeframe}`);
  }
  return clampBlock(
    lines.join("\n"),
    ESTIMATE_CONTEXT_LIMITS.operatorGuidanceMaxChars,
  );
}

function identityPromptContextFromBrain(
  organizationId: string,
  brain: BrainEngineContext | null,
): PromptIdentityContext {
  const identity = brain?.businessMemory.identity;
  if (!identity) {
    return {
      userId: null,
      organizationId,
      identity: null,
    };
  }

  return {
    userId: null,
    organizationId,
    identity: {
      about_you: identity.aboutYou ?? null,
      expertise: identity.expertise ?? null,
      website: identity.website ?? null,
      master_profile:
        (identity.masterProfile as Record<string, unknown> | null) ?? null,
    },
  };
}

function formatOrganizationAggregatesBlock(
  brain: BrainEngineContext | null,
): string {
  if (!brain) {
    return unavailable(
      "No Brain organization aggregates were available.",
    );
  }

  const discussions = brain.discussionMemory.recentDiscussions
    .slice(0, 6)
    .map((entry) => ({
      title: entry.title,
      status: entry.status,
      summary: entry.summary
        ? truncateText(entry.summary, ESTIMATE_CONTEXT_LIMITS.fieldTruncate)
        : null,
      opportunityScore: entry.opportunityScore,
    }));

  const opportunities = brain.opportunityMemory.recentOpportunities
    .slice(0, 6)
    .map((entry) => ({
      title: entry.title,
      status: entry.status,
      urgency: entry.urgency,
      score: entry.score,
    }));

  const briefings = brain.briefingMemory.recentBriefings
    .slice(0, 4)
    .map((entry) => ({
      status: entry.status,
      buyerStage: entry.buyerStage,
      confidence: entry.confidence,
      summary: entry.summary
        ? truncateText(entry.summary, ESTIMATE_CONTEXT_LIMITS.fieldTruncate)
        : null,
    }));

  const payload = {
    organization: brain.organization,
    contextSummary: brain.contextSummary,
    recentDiscussions: discussions,
    recentOpportunities: opportunities,
    recentBriefings: briefings,
    assetAudiences: brain.assetMemory.targetAudiences.slice(0, 8),
    assetBusinessGoals: brain.assetMemory.businessGoals.slice(0, 8),
  };

  return clampBlock(
    JSON.stringify(payload, null, 2),
    ESTIMATE_CONTEXT_LIMITS.organizationAggregatesMaxChars,
  );
}

function readExecutiveIntelligence(
  brain: BrainEngineContext | null,
): IdentityExecutiveIntelligence | null {
  const masterProfile = brain?.businessMemory.identity?.masterProfile as
    | Record<string, unknown>
    | null
    | undefined;
  if (!masterProfile) return null;
  return readIdentityExecutiveIntelligence(masterProfile);
}

function formatExecutiveIntelligenceBlock(
  executive: IdentityExecutiveIntelligence | null,
): string {
  if (!executive) {
    return unavailable(
      "No Executive Intelligence was available on Master Profile.",
    );
  }

  return clampBlock(
    JSON.stringify(
      {
        key: IDENTITY_EXECUTIVE_INTELLIGENCE_KEY,
        executiveIntelligence: executive,
      },
      null,
      2,
    ),
    ESTIMATE_CONTEXT_LIMITS.executiveIntelligenceMaxChars,
  );
}

function formatDeepWebsiteBlock(
  intelligence: DeepWebsiteIntelligence | null,
): string {
  if (!intelligence) {
    return unavailable(
      "No Deep Website Intelligence (deep_v1) was available for this organization.",
    );
  }

  const pages = intelligence.pages.slice(0, 30).map((page) => ({
    url: page.url,
    title: page.title,
    page_type: page.page_type,
    excerpt: truncateText(page.excerpt || "", 160),
  }));

  const formatted = [
    formatDeepIntelligenceForBrainPrompt(intelligence),
    "",
    "CRAWL SUMMARY:",
    JSON.stringify(intelligence.crawl_summary, null, 2),
    "",
    "PAGE INDEX (bounded read-only evidence):",
    JSON.stringify(pages, null, 2),
  ].join("\n");

  return clampBlock(formatted, ESTIMATE_CONTEXT_LIMITS.deepWebsiteMaxChars);
}

function selectLatestReadyStrategicSeo(
  reports: SeoReport[],
): SeoReport | null {
  for (const report of reports) {
    if (report.status !== "Ready" || !report.package_json) continue;
    const generationType = resolveSeoGenerationType({
      brief: report.brief_json,
      package: report.package_json,
    });
    if (generationType !== "technical") {
      return report;
    }
  }
  return null;
}

function selectLatestReadyTechnicalSeo(
  reports: SeoReport[],
): SeoReport | null {
  for (const report of reports) {
    if (report.status !== "Ready" || !report.package_json) continue;
    const generationType = resolveSeoGenerationType({
      brief: report.brief_json,
      package: report.package_json,
    });
    if (generationType === "technical") {
      return report;
    }
  }
  return null;
}

function formatStrategicSeoSummary(report: SeoReport | null): string {
  if (!report?.package_json || isSeoTechnicalPackage(report.package_json)) {
    return unavailable(
      "No Ready Strategic SEO report was available for this organization.",
    );
  }

  const pkg = report.package_json as SeoIntelligencePackage;
  const payload = {
    reportId: report.id,
    reportName: pkg.reportName ?? report.name,
    generationType: "intelligence",
    summary: pkg.executiveAssessment?.summary
      ? truncateText(
          pkg.executiveAssessment.summary,
          ESTIMATE_CONTEXT_LIMITS.fieldTruncate,
        )
      : null,
    seoReadiness: pkg.executiveAssessment?.seoReadiness
      ? truncateText(
          pkg.executiveAssessment.seoReadiness,
          ESTIMATE_CONTEXT_LIMITS.fieldTruncate,
        )
      : null,
    strengths: (pkg.executiveAssessment?.strengths ?? [])
      .slice(0, 4)
      .map((item) => truncateText(item, ESTIMATE_CONTEXT_LIMITS.fieldTruncate)),
    weaknesses: (pkg.executiveAssessment?.weaknesses ?? [])
      .slice(0, 4)
      .map((item) => truncateText(item, ESTIMATE_CONTEXT_LIMITS.fieldTruncate)),
    commercialSummary: pkg.commercialOpportunities?.summary
      ? truncateText(
          pkg.commercialOpportunities.summary,
          ESTIMATE_CONTEXT_LIMITS.fieldTruncate,
        )
      : null,
  };

  return clampBlock(
    JSON.stringify(payload, null, 2),
    ESTIMATE_CONTEXT_LIMITS.strategicSeoMaxChars,
  );
}

function formatTechnicalSeoSummary(report: SeoReport | null): string {
  if (!report?.package_json || !isSeoTechnicalPackage(report.package_json)) {
    return unavailable(
      "No Ready Technical SEO report was available for this organization.",
    );
  }

  const pkg = report.package_json as SeoTechnicalPackage;
  const payload = {
    reportId: report.id,
    reportName: pkg.reportName ?? report.name,
    generationType: "technical",
    summary: pkg.executiveEvaluation?.summary
      ? truncateText(
          pkg.executiveEvaluation.summary,
          ESTIMATE_CONTEXT_LIMITS.fieldTruncate,
        )
      : null,
    overallAssessment: pkg.executiveEvaluation?.overallAssessment
      ? truncateText(
          pkg.executiveEvaluation.overallAssessment,
          ESTIMATE_CONTEXT_LIMITS.fieldTruncate,
        )
      : null,
    criticalIssues: (pkg.executiveEvaluation?.criticalIssues ?? [])
      .slice(0, 5)
      .map((item) => truncateText(item, ESTIMATE_CONTEXT_LIMITS.fieldTruncate)),
    remediationPriorities: (pkg.executiveEvaluation?.remediationPriorities ?? [])
      .slice(0, 5)
      .map((item) => truncateText(item, ESTIMATE_CONTEXT_LIMITS.fieldTruncate)),
    actionPlanOverview: pkg.actionPlan?.overview
      ? truncateText(
          pkg.actionPlan.overview,
          ESTIMATE_CONTEXT_LIMITS.fieldTruncate,
        )
      : null,
  };

  return clampBlock(
    JSON.stringify(payload, null, 2),
    ESTIMATE_CONTEXT_LIMITS.technicalSeoMaxChars,
  );
}

export function summarizePersonasForEstimate(
  personas: Persona[],
): EstimatePersonaSummary[] {
  return personas.slice(0, ESTIMATE_CONTEXT_LIMITS.personasMax).map((persona) => {
    const valueDrivers = [persona.goals, persona.needs]
      .filter((value): value is string => Boolean(value?.trim()))
      .join(" | ");

    return {
      personaName: persona.persona_name?.trim() || "Unnamed persona",
      category: persona.category,
      occupation: persona.occupation
        ? truncateText(persona.occupation, ESTIMATE_CONTEXT_LIMITS.fieldTruncate)
        : null,
      seniority: persona.seniority,
      painPoints: persona.pain_points
        ? truncateText(persona.pain_points, ESTIMATE_CONTEXT_LIMITS.fieldTruncate)
        : null,
      objections: persona.objections
        ? truncateText(persona.objections, ESTIMATE_CONTEXT_LIMITS.fieldTruncate)
        : null,
      motivations: persona.motivations
        ? truncateText(persona.motivations, ESTIMATE_CONTEXT_LIMITS.fieldTruncate)
        : null,
      buyingTriggers: persona.buying_triggers
        ? truncateText(
            persona.buying_triggers,
            ESTIMATE_CONTEXT_LIMITS.fieldTruncate,
          )
        : null,
      valueDrivers: valueDrivers
        ? truncateText(valueDrivers, ESTIMATE_CONTEXT_LIMITS.fieldTruncate)
        : null,
    };
  });
}

function formatPersonaSummariesBlock(
  summaries: EstimatePersonaSummary[],
): string {
  if (summaries.length === 0) {
    return unavailable(
      "No compact persona summaries were included for this Estimate.",
    );
  }
  return clampBlock(
    JSON.stringify(summaries, null, 2),
    ESTIMATE_CONTEXT_LIMITS.personasMaxChars,
  );
}

/**
 * Compose bounded Estimate organization context from a trusted organizationId.
 * Authorization must already have been established by the caller.
 */
export async function composeEstimateOrganizationContext(input: {
  organizationId: string;
  request: EstimateRequest | unknown;
  deps?: ComposeEstimateOrganizationContextDeps;
}): Promise<EstimateOrganizationContext> {
  const organizationId = input.organizationId?.trim();
  if (!organizationId) {
    throw new Error(
      "organizationId is required for Estimate context composition.",
    );
  }

  const request = normalizeEstimateRequest(input.request);
  const buildBrain = input.deps?.buildBrain ?? defaultBuildBrain;
  const loadPersonas = input.deps?.loadPersonas ?? defaultLoadPersonas;
  const loadDeepIntelligence =
    input.deps?.loadDeepIntelligence ?? loadOrganizationDeepWebsiteIntelligence;
  const loadSeoReports = input.deps?.loadSeoReports ?? defaultLoadSeoReports;

  const includeTechnicalSeo = isTechnicalSeoRelevantForEstimate(request);
  const includePersonas = isPersonaContextRelevantForEstimate(request);

  let brain: BrainEngineContext | null = null;
  try {
    brain = await buildBrain(organizationId);
  } catch (error) {
    console.error("[ATHENA_ESTIMATE] brain_context_failed", {
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
    brain = null;
  }

  const brainBlock = clampBlock(
    formatBrainContextForPrompt(
      identityPromptContextFromBrain(organizationId, brain),
    ),
    ESTIMATE_CONTEXT_LIMITS.brainMaxChars,
  );

  const executive = readExecutiveIntelligence(brain);
  const executiveIntelligenceBlock = formatExecutiveIntelligenceBlock(executive);
  const organizationAggregatesBlock = formatOrganizationAggregatesBlock(brain);

  let deepIntelligence: DeepWebsiteIntelligence | null = null;
  try {
    deepIntelligence = await loadDeepIntelligence(organizationId);
  } catch (error) {
    console.error("[ATHENA_ESTIMATE] deep_intelligence_context_failed", {
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const deepWebsiteBlock = formatDeepWebsiteBlock(deepIntelligence);

  let seoReports: SeoReport[] = [];
  try {
    seoReports = await loadSeoReports(organizationId);
  } catch (error) {
    console.error("[ATHENA_ESTIMATE] seo_reports_context_failed", {
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Defense-in-depth: only consider reports for the supplied organizationId.
  const orgSeoReports = seoReports.filter(
    (report) => report.organization_id === organizationId,
  );
  const strategicReport = selectLatestReadyStrategicSeo(orgSeoReports);
  const technicalReport = includeTechnicalSeo
    ? selectLatestReadyTechnicalSeo(orgSeoReports)
    : null;

  const strategicSeoBlock = formatStrategicSeoSummary(strategicReport);
  const technicalSeoBlock = includeTechnicalSeo
    ? formatTechnicalSeoSummary(technicalReport)
    : unavailable(
        "Technical SEO context excluded — project need does not indicate technical/site relevance.",
      );

  let personas: Persona[] = [];
  try {
    personas = await loadPersonas(organizationId);
  } catch (error) {
    console.error("[ATHENA_ESTIMATE] personas_context_failed", {
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const orgPersonas = personas.filter(
    (row) => row.organization_id === organizationId,
  );
  const personaSummaries = includePersonas
    ? summarizePersonasForEstimate(orgPersonas)
    : [];
  const personasBlock = includePersonas
    ? formatPersonaSummariesBlock(personaSummaries)
    : unavailable(
        "Persona context excluded — project need does not indicate commercial audience relevance.",
      );

  const operatorGuidanceBlock = formatEstimateOperatorGuidanceBlock(request);

  const trusted: EstimateTrustedContextBlocks = {
    brain: brainBlock,
    executiveIntelligence: executiveIntelligenceBlock,
    deepWebsite: deepWebsiteBlock,
    organizationAggregates: organizationAggregatesBlock,
    strategicSeo: strategicSeoBlock,
    technicalSeo: technicalSeoBlock,
    personas: personasBlock,
  };

  const composedTrustedContext = clampBlock(
    [
      "TRUSTED ATHENA EVIDENCE",
      "(Business intelligence from Athena — not operator project guidance.)",
      "",
      "BRAIN / ORGANIZATION IDENTITY:",
      trusted.brain,
      "",
      "IDENTITY EXECUTIVE INTELLIGENCE:",
      trusted.executiveIntelligence,
      "",
      "BRAIN ORGANIZATION AGGREGATES (via Brain — not full source libraries):",
      trusted.organizationAggregates,
      "",
      "DEEP WEBSITE INTELLIGENCE (deep_v1 — read-only promoted evidence):",
      trusted.deepWebsite,
      "",
      "STRATEGIC SEO SUMMARY (latest Ready, non-technical):",
      trusted.strategicSeo,
      "",
      "TECHNICAL SEO SUMMARY (conditional):",
      trusted.technicalSeo,
      "",
      "COMPACT PERSONA SUMMARIES (conditional, max 6):",
      trusted.personas,
    ].join("\n"),
    ESTIMATE_CONTEXT_LIMITS.trustedTotalMaxChars,
  );

  // Operator guidance is NEVER merged into composedTrustedContext.
  const totalChars = Math.min(
    composedTrustedContext.length + operatorGuidanceBlock.length,
    ESTIMATE_CONTEXT_LIMITS.totalMaxChars,
  );

  const geoCurrency = resolveEstimateGeoCurrency({
    executiveGeographicReach:
      extractGeoEvidenceFromExecutiveIntelligence(executive),
    deepWebsiteContactInformation:
      extractGeoEvidenceFromDeepWebsite(deepIntelligence),
  });

  const strategicAvailable = Boolean(strategicReport);
  const technicalAvailable = Boolean(
    selectLatestReadyTechnicalSeo(orgSeoReports),
  );

  return {
    organizationId,
    trusted,
    composedTrustedContext,
    operatorGuidanceBlock,
    geoCurrency,
    meta: {
      available: {
        brain: brain != null,
        executiveIntelligence: executive != null,
        deepWebsite: deepIntelligence != null,
        strategicSeo: strategicAvailable,
        technicalSeo: technicalAvailable,
        personas: orgPersonas.length > 0,
      },
      included: {
        strategicSeo: strategicAvailable,
        technicalSeo: includeTechnicalSeo && Boolean(technicalReport),
        personas: includePersonas && personaSummaries.length > 0,
      },
      charCounts: {
        brain: trusted.brain.length,
        executiveIntelligence: trusted.executiveIntelligence.length,
        deepWebsite: trusted.deepWebsite.length,
        organizationAggregates: trusted.organizationAggregates.length,
        strategicSeo: trusted.strategicSeo.length,
        technicalSeo: trusted.technicalSeo.length,
        personas: trusted.personas.length,
        operatorGuidance: operatorGuidanceBlock.length,
        composedTrusted: composedTrustedContext.length,
      },
      totalChars,
      personaCount: personaSummaries.length,
    },
  };
}
