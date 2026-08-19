/**
 * Server-only Social Planner Intelligence Composer (L3).
 *
 * Ads-style organization composition, extended with Website Intelligence
 * and Identity Executive Intelligence patterns from SEO. Trusted evidence
 * only — no LLM, no weekly strategy, no social generation.
 */

import type { BrainEngineContext } from "@/services/brain/brainContextTypes";
import type { AdCampaign } from "@/services/ads/adCampaignTypes";
import type { SeoReport } from "@/services/seo/seoReportTypes";
import type { Persona } from "@/services/personas/personaService";
import type { Prospect } from "@/services/prospects/prospectService";
import type { AthenaAssetBlueprint } from "@/services/assetBlueprints/assetBlueprintService";
import type { DeepWebsiteIntelligence } from "@/services/websiteLearning/deepScrape/deepWebsiteIntelligence";
import type { ActiveGovernedInstruction } from "@/services/superAdmin/strategicBlueprintInstructionConstants";
import { TREND_SOCIAL_PROMPT_CONFIG_KEY } from "@/services/superAdmin/strategicBlueprintInstructionConstants";
import { composeSocialCalendarContext } from "@/services/socialPlanner/calendar/composeSocialCalendarContext";
import { validateSocialCalendarContext } from "@/services/socialPlanner/calendar/validateSocialCalendarContext";
import type { SocialCalendarContext } from "@/services/socialPlanner/calendar/socialCalendarContextTypes";
import type { SocialPlannerGeographyEvidence } from "@/services/socialPlanner/geography/socialPlannerGeographyTypes";
import { SocialCalendarContextError } from "@/services/socialPlanner/calendar/socialCalendarContextTypes";
import {
  SOCIAL_PLANNER_INTELLIGENCE_COMPOSER_VERSION,
  SOCIAL_PLANNER_INTELLIGENCE_LIMITS,
  SOCIAL_PLANNER_INTELLIGENCE_SCHEMA_VERSION,
  SOCIAL_PLANNER_INTELLIGENCE_SECTION_CHAR_CAPS,
  clampSocialPlannerBlock,
  fitStructuredSection,
} from "@/services/socialPlanner/intelligence/socialPlannerIntelligenceBudgets";
import {
  SOCIAL_PLANNER_INTELLIGENCE_UNAVAILABLE_REASONS,
  SocialPlannerIntelligenceError,
  type SocialPlannerBudgetDiagnostics,
  type SocialPlannerGenerationContextV1,
  type SocialPlannerSectionBudgetDiagnostic,
} from "@/services/socialPlanner/intelligence/socialPlannerIntelligenceTypes";
import {
  assertTenantOwnedRows,
  composeAdsReferences,
  composeBlueprintIntelligence,
  composeBrainIntelligence,
  composeDiscussionIntelligence,
  composeIdentityExecutiveIntelligence,
  composeOpportunityIntelligence,
  composeOrganizationFacts,
  composePersonaPortfolio,
  composeProspectPortfolio,
  composeSeoIntelligence,
  composeTrendSocialPrompt,
  composeWebsiteIntelligence,
  defaultBuildBrain,
  defaultLoadAdCampaigns,
  defaultLoadBlueprints,
  defaultLoadCurrentExecutiveVersions,
  defaultLoadDeepWebsiteIntelligence,
  defaultLoadPersonas,
  defaultLoadProspects,
  defaultLoadSeoReports,
  defaultLoadTrendSocialPrompt,
  type SocialPlannerCurrentExecutiveVersionSource,
} from "@/services/socialPlanner/intelligence/socialPlannerIntelligenceSources";
import { validateSocialPlannerIntelligence } from "@/services/socialPlanner/intelligence/validateSocialPlannerIntelligence";

export type ComposeSocialPlannerIntelligenceDeps = {
  buildBrain?: (organizationId: string) => Promise<BrainEngineContext | null>;
  loadDeepWebsiteIntelligence?: (
    organizationId: string,
  ) => Promise<DeepWebsiteIntelligence | null>;
  loadPersonas?: (organizationId: string) => Promise<Persona[]>;
  loadProspects?: (organizationId: string) => Promise<Prospect[]>;
  loadSeoReports?: (organizationId: string) => Promise<SeoReport[]>;
  loadAdCampaigns?: (organizationId: string) => Promise<AdCampaign[]>;
  loadBlueprints?: (organizationId: string) => Promise<AthenaAssetBlueprint[]>;
  loadCurrentExecutiveVersions?: (
    organizationId: string,
    discussionIds: string[],
  ) => Promise<SocialPlannerCurrentExecutiveVersionSource[]>;
  loadTrendSocialPrompt?: () => Promise<ActiveGovernedInstruction | null>;
};

export type ComposeSocialPlannerIntelligenceInput = {
  organizationId: string;
  calendarContext?: SocialCalendarContext;
  periodStart?: string;
  periodEnd?: string;
  geographyEvidence?: SocialPlannerGeographyEvidence;
  deps?: ComposeSocialPlannerIntelligenceDeps;
};

type OptionalLoad<T> = {
  value: T;
  failed: boolean;
};

function jsonChars(value: unknown): number {
  return JSON.stringify(value).length;
}

function fitSection<T>(value: T, maxChars: number): {
  value: T;
  truncated: boolean;
} {
  const fitted = fitStructuredSection(value, maxChars);
  return { value: fitted.value, truncated: fitted.truncated };
}

async function loadOptional<T>(
  label: string,
  organizationId: string,
  loader: () => Promise<T>,
  fallback: T,
): Promise<OptionalLoad<T>> {
  try {
    return { value: await loader(), failed: false };
  } catch (error) {
    console.error(`[ATHENA_SOCIAL_PLANNER] ${label}_failed`, {
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { value: fallback, failed: true };
  }
}

function resolveCalendarContext(
  input: ComposeSocialPlannerIntelligenceInput,
): SocialCalendarContext {
  if (input.calendarContext) {
    try {
      return validateSocialCalendarContext(input.calendarContext);
    } catch (error) {
      throw new SocialPlannerIntelligenceError(
        "INVALID_CALENDAR_CONTEXT",
        error instanceof Error
          ? error.message
          : "Social Calendar context is invalid.",
      );
    }
  }

  if (!input.periodStart || !input.periodEnd) {
    throw new SocialPlannerIntelligenceError(
      "INVALID_CALENDAR_CONTEXT",
      "Social Planner intelligence requires calendarContext or a seven-day period.",
    );
  }

  try {
    return composeSocialCalendarContext({
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      geographyEvidence: input.geographyEvidence,
    });
  } catch (error) {
    const message =
      error instanceof SocialCalendarContextError || error instanceof Error
        ? error.message
        : "Social Calendar context is invalid.";
    throw new SocialPlannerIntelligenceError("INVALID_CALENDAR_CONTEXT", message);
  }
}

function unavailableReason(input: {
  failed: boolean;
  available: boolean;
}): SocialPlannerSectionBudgetDiagnostic["unavailableReason"] {
  if (input.failed) return "load_failed";
  if (!input.available) return "absent";
  return undefined;
}

function sectionDiagnostic(input: {
  source: string;
  available: boolean;
  itemsConsidered: number;
  itemsIncluded: number;
  value: unknown;
  truncated: boolean;
  failed?: boolean;
}): SocialPlannerSectionBudgetDiagnostic {
  const diagnostic: SocialPlannerSectionBudgetDiagnostic = {
    source: input.source,
    available: input.available,
    itemsConsidered: input.itemsConsidered,
    itemsIncluded: input.itemsIncluded,
    charactersIncluded: jsonChars(input.value),
    truncated: input.truncated,
  };
  const reason = unavailableReason({
    failed: Boolean(input.failed),
    available: input.available,
  });
  if (reason && SOCIAL_PLANNER_INTELLIGENCE_UNAVAILABLE_REASONS.includes(reason)) {
    diagnostic.unavailableReason = reason;
  }
  return diagnostic;
}

function formatJsonSection(title: string, value: unknown): string {
  return `${title}\n${JSON.stringify(value, null, 2)}`;
}

function buildComposedText(context: Omit<SocialPlannerGenerationContextV1, "composedText" | "budgetDiagnostics">): {
  text: string;
  truncated: boolean;
  calendarTruncated: boolean;
} {
  const calendarFacts = {
    geography: context.calendarContext.geography,
    period: context.calendarContext.period,
    holidayCoverage: context.calendarContext.provenance.holidayCoverage,
    holidayProvider: context.calendarContext.provenance.holidayProvider,
    holidayProviderVersion: context.calendarContext.provenance.holidayProviderVersion,
    geographySource: context.calendarContext.provenance.geographySource,
    days: context.calendarContext.dayContexts.map((day) => ({
      date: day.date,
      dayOfWeek: day.dayOfWeek,
      season: day.season,
      daySemantics: day.daySemantics,
      opportunityIds: day.opportunityIds,
    })),
    opportunities: context.calendarContext.opportunities.map((opportunity) => ({
      id: opportunity.id,
      label: opportunity.label,
      date: opportunity.date,
      category: opportunity.category,
      selectionStatus: opportunity.selectionStatus,
    })),
  };

  const calendarBlock = clampSocialPlannerBlock(
    JSON.stringify(calendarFacts, null, 2),
    SOCIAL_PLANNER_INTELLIGENCE_SECTION_CHAR_CAPS.calendarContext,
  );

  const raw = [
    "SOCIAL PLANNER GENERATION CONTEXT (trusted evidence only — not a strategy or generation brief):",
    `schemaVersion: ${context.schemaVersion}`,
    `organizationId: ${context.organization.id}`,
    "",
    formatJsonSection("ORGANIZATION FACTS", context.organization),
    "",
    formatJsonSection("ATHENA BRAIN", context.brain),
    "",
    formatJsonSection(
      "IDENTITY EXECUTIVE INTELLIGENCE",
      context.identityExecutiveIntelligence,
    ),
    "",
    formatJsonSection("WEBSITE INTELLIGENCE", context.websiteIntelligence),
    "",
    formatJsonSection("SEO INTELLIGENCE", context.seoIntelligence),
    "",
    formatJsonSection("DISCUSSIONS / CURRENT EXECUTIVE VERSIONS", context.discussions),
    "",
    formatJsonSection("PERSONA PORTFOLIO", context.personas),
    "",
    formatJsonSection("PROSPECT PORTFOLIO", context.prospects),
    "",
    formatJsonSection("OPPORTUNITIES", context.opportunities),
    "",
    formatJsonSection(
      "ADS (existing campaign intelligence / reference — do not repeat)",
      context.ads,
    ),
    "",
    formatJsonSection(
      "STRATEGIC ASSET BLUEPRINTS (current creative fingerprints; historical Trend Social output is not live config)",
      context.strategicAssetBlueprints,
    ),
    "",
    formatJsonSection(
      "TREND SOCIAL PROMPT (current Super Admin configuration)",
      context.trendSocialPrompt,
    ),
    "",
    "CALENDAR CONTEXT (L2/L2B facts; holiday selectionStatus remains candidate):",
    calendarBlock.text,
  ].join("\n");

  const composed = clampSocialPlannerBlock(
    raw,
    SOCIAL_PLANNER_INTELLIGENCE_LIMITS.composedTextMaxChars,
  );
  return {
    text: composed.text,
    truncated: composed.truncated,
    calendarTruncated: calendarBlock.truncated,
  };
}

/**
 * Compose one bounded, tenant-safe Social Planner generation context.
 * organizationId is for already-authorized server-side use only.
 */
export async function composeSocialPlannerIntelligence(
  input: ComposeSocialPlannerIntelligenceInput,
): Promise<SocialPlannerGenerationContextV1> {
  const organizationId = input.organizationId?.trim();
  if (!organizationId) {
    throw new SocialPlannerIntelligenceError(
      "INVALID_ORGANIZATION",
      "organizationId is required for Social Planner intelligence composition.",
    );
  }

  const calendarContext = resolveCalendarContext(input);

  const buildBrain = input.deps?.buildBrain ?? defaultBuildBrain;
  const loadDeepWebsite =
    input.deps?.loadDeepWebsiteIntelligence ?? defaultLoadDeepWebsiteIntelligence;
  const loadPersonas = input.deps?.loadPersonas ?? defaultLoadPersonas;
  const loadProspects = input.deps?.loadProspects ?? defaultLoadProspects;
  const loadSeoReports = input.deps?.loadSeoReports ?? defaultLoadSeoReports;
  const loadAdCampaigns = input.deps?.loadAdCampaigns ?? defaultLoadAdCampaigns;
  const loadBlueprints = input.deps?.loadBlueprints ?? defaultLoadBlueprints;
  const loadTrendSocial =
    input.deps?.loadTrendSocialPrompt ?? defaultLoadTrendSocialPrompt;

  const [
    brainLoad,
    websiteLoad,
    personaLoad,
    prospectLoad,
    seoLoad,
    adsLoad,
    blueprintLoad,
    trendLoad,
  ] = await Promise.all([
    loadOptional("brain", organizationId, () => buildBrain(organizationId), null),
    loadOptional(
      "website_intelligence",
      organizationId,
      () => loadDeepWebsite(organizationId),
      null,
    ),
    loadOptional("personas", organizationId, () => loadPersonas(organizationId), []),
    loadOptional("prospects", organizationId, () => loadProspects(organizationId), []),
    loadOptional("seo_reports", organizationId, () => loadSeoReports(organizationId), []),
    loadOptional("ads", organizationId, () => loadAdCampaigns(organizationId), []),
    loadOptional("blueprints", organizationId, () => loadBlueprints(organizationId), []),
    loadOptional("trend_social", organizationId, () => loadTrendSocial(), null),
  ]);

  const brain = brainLoad.value;
  if (brain && brain.organization.id !== organizationId) {
    throw new SocialPlannerIntelligenceError(
      "CROSS_TENANT_CONTAMINATION",
      "Brain organization identity does not match the trusted organizationId.",
    );
  }

  assertTenantOwnedRows(organizationId, personaLoad.value, "Personas");
  assertTenantOwnedRows(organizationId, prospectLoad.value, "Prospects");
  assertTenantOwnedRows(organizationId, seoLoad.value, "SEO reports");
  assertTenantOwnedRows(organizationId, adsLoad.value, "Ads campaigns");
  assertTenantOwnedRows(
    organizationId,
    blueprintLoad.value as Array<{ organization_id?: string | null }>,
    "Strategic Asset Blueprints",
  );

  const organizationBound = fitSection(
    composeOrganizationFacts(organizationId, brain),
    SOCIAL_PLANNER_INTELLIGENCE_SECTION_CHAR_CAPS.organization,
  );
  const organization = organizationBound.value;

  const brainBound = fitSection(
    composeBrainIntelligence(brain),
    SOCIAL_PLANNER_INTELLIGENCE_SECTION_CHAR_CAPS.brain,
  );
  const brainSection = brainBound.value;

  const identityBound = fitSection(
    composeIdentityExecutiveIntelligence(brain),
    SOCIAL_PLANNER_INTELLIGENCE_SECTION_CHAR_CAPS.identityExecutiveIntelligence,
  );
  const identityExecutiveIntelligence = identityBound.value;

  const websiteBound = fitSection(
    composeWebsiteIntelligence(websiteLoad.value),
    SOCIAL_PLANNER_INTELLIGENCE_SECTION_CHAR_CAPS.websiteIntelligence,
  );
  const websiteIntelligence = websiteBound.value;

  const seoBound = fitSection(
    composeSeoIntelligence(seoLoad.value),
    SOCIAL_PLANNER_INTELLIGENCE_SECTION_CHAR_CAPS.seoIntelligence,
  );
  const seoIntelligence = seoBound.value;

  const discussionIds = [
    ...(brain?.discussionMemory.highIntentDiscussions ?? []).map((row) => row.id),
    ...(brain?.discussionMemory.recentDiscussions ?? []).map((row) => row.id),
  ].filter((id, index, all) => all.indexOf(id) === index);

  const evLoad = await loadOptional(
    "executive_versions",
    organizationId,
    () =>
      (input.deps?.loadCurrentExecutiveVersions ??
        defaultLoadCurrentExecutiveVersions)(organizationId, discussionIds),
    [],
  );
  assertTenantOwnedRows(organizationId, evLoad.value, "Executive Versions");

  const discussionBound = fitSection(
    composeDiscussionIntelligence(brain, evLoad.value),
    SOCIAL_PLANNER_INTELLIGENCE_SECTION_CHAR_CAPS.discussions,
  );
  const discussions = discussionBound.value;

  const personaBound = fitSection(
    composePersonaPortfolio(personaLoad.value),
    SOCIAL_PLANNER_INTELLIGENCE_SECTION_CHAR_CAPS.personas,
  );
  const personas = {
    ...personaBound.value,
    includedCount: personaBound.value.personas.length,
    distinctCategories: [
      ...new Set(
        personaBound.value.personas
          .map((persona) => persona.category)
          .filter((value): value is string => Boolean(value)),
      ),
    ],
    distinctOccupations: [
      ...new Set(
        personaBound.value.personas
          .map((persona) => persona.occupation)
          .filter((value): value is string => Boolean(value)),
      ),
    ],
    distinctAudienceGeographies: [
      ...new Set(
        personaBound.value.personas
          .map((persona) => persona.audienceGeography)
          .filter((value): value is string => Boolean(value)),
      ),
    ],
  };

  const prospectBound = fitSection(
    composeProspectPortfolio(prospectLoad.value),
    SOCIAL_PLANNER_INTELLIGENCE_SECTION_CHAR_CAPS.prospects,
  );
  const prospects = {
    ...prospectBound.value,
    includedCount: prospectBound.value.prospects.length,
  };

  const opportunityBound = fitSection(
    composeOpportunityIntelligence(brain),
    SOCIAL_PLANNER_INTELLIGENCE_SECTION_CHAR_CAPS.opportunities,
  );
  const opportunities = opportunityBound.value;

  const adsBound = fitSection(
    composeAdsReferences(adsLoad.value),
    SOCIAL_PLANNER_INTELLIGENCE_SECTION_CHAR_CAPS.ads,
  );
  const ads = adsBound.value;

  const blueprintBound = fitSection(
    composeBlueprintIntelligence(blueprintLoad.value),
    SOCIAL_PLANNER_INTELLIGENCE_SECTION_CHAR_CAPS.strategicAssetBlueprints,
  );
  const strategicAssetBlueprints = blueprintBound.value;

  const trendBound = fitSection(
    composeTrendSocialPrompt(trendLoad.value),
    SOCIAL_PLANNER_INTELLIGENCE_SECTION_CHAR_CAPS.trendSocialPrompt,
  );
  const trendSocialPrompt = trendBound.value;

  const currentExecutiveVersionIds = discussions
    .map((discussion) => discussion.currentExecutiveVersion?.id)
    .filter((id): id is string => Boolean(id));

  const provenance = {
    composerVersion: SOCIAL_PLANNER_INTELLIGENCE_COMPOSER_VERSION,
    schemaVersion: SOCIAL_PLANNER_INTELLIGENCE_SCHEMA_VERSION,
    organizationId,
    brainAvailable: brain != null,
    masterProfileVersion: brain?.businessMemory.identity?.masterProfileVersion ?? null,
    websiteIntelligenceScrapedAt: websiteIntelligence.scrapedAt,
    websitePagesAnalyzed: websiteIntelligence.pagesAnalyzed,
    discussionIds: discussions.map((discussion) => discussion.id),
    currentExecutiveVersionIds,
    personaIds: personas.personas.map((persona) => persona.id),
    prospectIds: prospects.prospects.map((prospect) => prospect.id),
    opportunityIds: opportunities.map((opportunity) => opportunity.id),
    seoReportIds: seoIntelligence.map((report) => report.id),
    adCampaignIds: ads.map((campaign) => campaign.id),
    blueprintIds: strategicAssetBlueprints.map((blueprint) => blueprint.id),
    trendSocialPrompt: {
      key: TREND_SOCIAL_PROMPT_CONFIG_KEY,
      configured: trendSocialPrompt.configured,
      revisionId: trendSocialPrompt.revisionId,
    },
    calendar: {
      resolverVersion: calendarContext.provenance.resolverVersion,
      schemaVersion: calendarContext.provenance.schemaVersion,
      holidayCoverage: calendarContext.provenance.holidayCoverage,
      holidayProvider: calendarContext.provenance.holidayProvider,
      holidayProviderVersion: calendarContext.provenance.holidayProviderVersion,
      geographySource: calendarContext.provenance.geographySource,
    },
  };

  const structuredBase = {
    schemaVersion: SOCIAL_PLANNER_INTELLIGENCE_SCHEMA_VERSION,
    organization,
    brain: brainSection,
    identityExecutiveIntelligence,
    websiteIntelligence,
    seoIntelligence,
    discussions,
    personas,
    prospects,
    opportunities,
    ads,
    strategicAssetBlueprints,
    trendSocialPrompt,
    calendarContext,
    provenance,
  };

  const composed = buildComposedText(structuredBase);

  const budgetDiagnostics: SocialPlannerBudgetDiagnostics = {
    sections: [
      sectionDiagnostic({
        source: "organization",
        available: true,
        itemsConsidered: 1,
        itemsIncluded: 1,
        value: organization,
        truncated: organizationBound.truncated,
      }),
      sectionDiagnostic({
        source: "brain",
        available: brainSection.available,
        itemsConsidered: brain ? 1 : 0,
        itemsIncluded: brainSection.available ? 1 : 0,
        value: brainSection,
        truncated: brainBound.truncated,
        failed: brainLoad.failed,
      }),
      sectionDiagnostic({
        source: "identityExecutiveIntelligence",
        available: identityExecutiveIntelligence.available,
        itemsConsidered: identityExecutiveIntelligence.available ? 1 : 0,
        itemsIncluded: identityExecutiveIntelligence.available ? 1 : 0,
        value: identityExecutiveIntelligence,
        truncated: identityBound.truncated,
      }),
      sectionDiagnostic({
        source: "websiteIntelligence",
        available: websiteIntelligence.available,
        itemsConsidered: websiteLoad.value ? 1 : 0,
        itemsIncluded: websiteIntelligence.available ? 1 : 0,
        value: websiteIntelligence,
        truncated: websiteBound.truncated,
        failed: websiteLoad.failed,
      }),
      sectionDiagnostic({
        source: "seoIntelligence",
        available: seoIntelligence.length > 0,
        itemsConsidered: seoLoad.value.length,
        itemsIncluded: seoIntelligence.length,
        value: seoIntelligence,
        truncated: seoBound.truncated,
        failed: seoLoad.failed,
      }),
      sectionDiagnostic({
        source: "discussions",
        available: discussions.length > 0,
        itemsConsidered: discussionIds.length,
        itemsIncluded: discussions.length,
        value: discussions,
        truncated: discussionBound.truncated,
        failed: evLoad.failed,
      }),
      sectionDiagnostic({
        source: "personas",
        available: personas.includedCount > 0,
        itemsConsidered: personas.consideredCount,
        itemsIncluded: personas.includedCount,
        value: personas,
        truncated: personaBound.truncated,
        failed: personaLoad.failed,
      }),
      sectionDiagnostic({
        source: "prospects",
        available: prospects.includedCount > 0,
        itemsConsidered: prospects.consideredCount,
        itemsIncluded: prospects.includedCount,
        value: prospects,
        truncated: prospectBound.truncated,
        failed: prospectLoad.failed,
      }),
      sectionDiagnostic({
        source: "opportunities",
        available: opportunities.length > 0,
        itemsConsidered: brain?.opportunityMemory.recentOpportunities.length ?? 0,
        itemsIncluded: opportunities.length,
        value: opportunities,
        truncated: opportunityBound.truncated,
      }),
      sectionDiagnostic({
        source: "ads",
        available: ads.length > 0,
        itemsConsidered: adsLoad.value.length,
        itemsIncluded: ads.length,
        value: ads,
        truncated: adsBound.truncated,
        failed: adsLoad.failed,
      }),
      sectionDiagnostic({
        source: "strategicAssetBlueprints",
        available: strategicAssetBlueprints.length > 0,
        itemsConsidered: blueprintLoad.value.length,
        itemsIncluded: strategicAssetBlueprints.length,
        value: strategicAssetBlueprints,
        truncated: blueprintBound.truncated,
        failed: blueprintLoad.failed,
      }),
      sectionDiagnostic({
        source: "trendSocialPrompt",
        available: trendSocialPrompt.configured,
        itemsConsidered: trendLoad.value ? 1 : 0,
        itemsIncluded: 1,
        value: trendSocialPrompt,
        truncated: trendBound.truncated,
        failed: trendLoad.failed,
      }),
      sectionDiagnostic({
        source: "calendarContext",
        available: true,
        itemsConsidered: 1,
        itemsIncluded: 1,
        value: {
          period: calendarContext.period,
          holidayCoverage: calendarContext.provenance.holidayCoverage,
        },
        truncated: composed.calendarTruncated,
      }),
    ],
    composedTextChars: 0,
    structuredChars: 0,
    composedTextTruncated: composed.truncated,
    structuredTruncated: false,
  };

  const context: SocialPlannerGenerationContextV1 = {
    ...structuredBase,
    budgetDiagnostics,
    composedText: composed.text,
  };

  context.budgetDiagnostics.composedTextChars = context.composedText.length;
  context.budgetDiagnostics.structuredChars = jsonChars({
    ...context,
    composedText: "",
  });
  context.budgetDiagnostics.structuredTruncated =
    context.budgetDiagnostics.structuredChars >
    SOCIAL_PLANNER_INTELLIGENCE_LIMITS.structuredMaxChars;

  return validateSocialPlannerIntelligence(context);
}
