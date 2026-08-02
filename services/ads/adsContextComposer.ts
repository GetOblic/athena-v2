/**
 * Thin Ads-specific organization context composer.
 * Reuses Brain builders; never accepts organization ownership from the client.
 */

import {
  formatBrainContextForPrompt,
  type PromptIdentityContext,
} from "@/services/brain/formatBrainContextForPrompt";
import type { BrainEngineContext } from "@/services/brain/brainContextTypes";
import {
  formatAdCampaignBriefGuidanceBlock,
  resolveAdCampaignBriefMode,
} from "@/services/ads/adCampaignBrief";
import type {
  AdCampaignBrief,
  AdCampaignBriefMode,
} from "@/services/ads/adCampaignTypes";
import type { Persona } from "@/services/personas/personaService";
import type { Prospect } from "@/services/prospects/prospectService";

type BuildBrainFn = (organizationId: string) => Promise<BrainEngineContext | null>;
type LoadProspectsFn = (organizationId: string) => Promise<Prospect[]>;
type LoadPersonasFn = (organizationId: string) => Promise<Persona[]>;

async function defaultBuildBrain(
  organizationId: string,
): Promise<BrainEngineContext | null> {
  const { buildBrainContextForOrganization } = await import(
    "@/services/brain/brainContextBuilder"
  );
  return buildBrainContextForOrganization(organizationId);
}

async function defaultLoadProspects(organizationId: string): Promise<Prospect[]> {
  const { getProspects } = await import("@/services/prospects/prospectService");
  return getProspects(organizationId);
}

async function defaultLoadPersonas(organizationId: string): Promise<Persona[]> {
  const { getPersonas } = await import("@/services/personas/personaService");
  return getPersonas(organizationId);
}

export const ADS_CONTEXT_LIMITS = {
  prospects: 8,
  personas: 8,
  fieldTruncate: 220,
  adsContentTruncate: 320,
  brainBlockMaxChars: 14_000,
  orgIntelligenceMaxChars: 8_000,
  prospectsBlockMaxChars: 6_000,
  personasBlockMaxChars: 6_000,
  totalMaxChars: 36_000,
} as const;

export type AdsProspectSummary = {
  name: string;
  category: string | null;
  shortDescription: string | null;
  painPoints: string | null;
  goals: string | null;
  adsContentExcerpt: string | null;
};

export type AdsPersonaSummary = {
  personaName: string;
  category: string | null;
  occupation: string | null;
  seniority: string | null;
  motivations: string | null;
  painPoints: string | null;
  preferredChannels: string | null;
  adsContentExcerpt: string | null;
};

export type AdsOrganizationContext = {
  organizationId: string;
  briefMode: AdCampaignBriefMode;
  brief: AdCampaignBrief;
  brainIdentityBlock: string;
  organizationIntelligenceBlock: string;
  prospectsBlock: string;
  personasBlock: string;
  operatorGuidanceBlock: string;
  composedPromptContext: string;
  meta: {
    prospectCount: number;
    personaCount: number;
    brainAvailable: boolean;
    totalChars: number;
  };
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

function formatOrganizationIntelligenceBlock(
  brain: BrainEngineContext | null,
): string {
  if (!brain) {
    return "No organization intelligence memory was available.";
  }

  const discussions = brain.discussionMemory.recentDiscussions
    .slice(0, 8)
    .map((entry) => ({
      title: entry.title,
      status: entry.status,
      summary: entry.summary
        ? truncateText(entry.summary, ADS_CONTEXT_LIMITS.fieldTruncate)
        : null,
      opportunityScore: entry.opportunityScore,
    }));

  const highIntent = brain.discussionMemory.highIntentDiscussions
    .slice(0, 6)
    .map((entry) => ({
      title: entry.title,
      summary: entry.summary
        ? truncateText(entry.summary, ADS_CONTEXT_LIMITS.fieldTruncate)
        : null,
    }));

  const opportunities = brain.opportunityMemory.recentOpportunities
    .slice(0, 8)
    .map((entry) => ({
      title: entry.title,
      status: entry.status,
      urgency: entry.urgency,
      score: entry.score,
    }));

  const briefings = brain.briefingMemory.recentBriefings
    .slice(0, 6)
    .map((entry) => ({
      status: entry.status,
      buyerStage: entry.buyerStage,
      confidence: entry.confidence,
      summary: entry.summary
        ? truncateText(entry.summary, ADS_CONTEXT_LIMITS.fieldTruncate)
        : null,
    }));

  const domains = brain.domainMemory.domains.slice(0, 8).map((domain) => ({
    name: domain.name,
    market: domain.market,
    niche: domain.niche,
    description: domain.description
      ? truncateText(domain.description, ADS_CONTEXT_LIMITS.fieldTruncate)
      : null,
  }));

  const payload = {
    organization: brain.organization,
    contextSummary: brain.contextSummary,
    domains,
    recentDiscussions: discussions,
    highIntentDiscussions: highIntent,
    recentOpportunities: opportunities,
    recentBriefings: briefings,
    assetAudiences: brain.assetMemory.targetAudiences.slice(0, 10),
    assetBusinessGoals: brain.assetMemory.businessGoals.slice(0, 10),
  };

  return clampBlock(
    JSON.stringify(payload, null, 2),
    ADS_CONTEXT_LIMITS.orgIntelligenceMaxChars,
  );
}

export function summarizeProspectsForAds(
  prospects: Prospect[],
): AdsProspectSummary[] {
  return prospects.slice(0, ADS_CONTEXT_LIMITS.prospects).map((prospect) => {
    const shortDescription =
      prospect.notes?.trim() ||
      prospect.additional_context?.trim() ||
      prospect.industry?.trim() ||
      null;
    return {
      name: prospect.business_name,
      category: prospect.category ?? prospect.industry ?? null,
      shortDescription: shortDescription
        ? truncateText(shortDescription, ADS_CONTEXT_LIMITS.fieldTruncate)
        : null,
      painPoints: prospect.pain_points
        ? truncateText(prospect.pain_points, ADS_CONTEXT_LIMITS.fieldTruncate)
        : null,
      goals: null,
      adsContentExcerpt: prospect.ads_content
        ? truncateText(
            prospect.ads_content,
            ADS_CONTEXT_LIMITS.adsContentTruncate,
          )
        : null,
    };
  });
}

export function summarizePersonasForAds(personas: Persona[]): AdsPersonaSummary[] {
  return personas.slice(0, ADS_CONTEXT_LIMITS.personas).map((persona) => ({
    personaName: persona.persona_name?.trim() || "Unnamed persona",
    category: persona.category,
    occupation: persona.occupation
      ? truncateText(persona.occupation, ADS_CONTEXT_LIMITS.fieldTruncate)
      : null,
    seniority: persona.seniority,
    motivations: persona.motivations
      ? truncateText(persona.motivations, ADS_CONTEXT_LIMITS.fieldTruncate)
      : null,
    painPoints: persona.pain_points
      ? truncateText(persona.pain_points, ADS_CONTEXT_LIMITS.fieldTruncate)
      : null,
    preferredChannels: persona.preferred_channels
      ? truncateText(
          persona.preferred_channels,
          ADS_CONTEXT_LIMITS.fieldTruncate,
        )
      : null,
    adsContentExcerpt: persona.ads_content
      ? truncateText(persona.ads_content, ADS_CONTEXT_LIMITS.adsContentTruncate)
      : null,
  }));
}

export function formatProspectSummariesBlock(
  summaries: AdsProspectSummary[],
): string {
  if (summaries.length === 0) {
    return "No prospect summaries available for this organization.";
  }
  return clampBlock(
    JSON.stringify(summaries, null, 2),
    ADS_CONTEXT_LIMITS.prospectsBlockMaxChars,
  );
}

export function formatPersonaSummariesBlock(
  summaries: AdsPersonaSummary[],
): string {
  if (summaries.length === 0) {
    return "No persona summaries available for this organization.";
  }
  return clampBlock(
    JSON.stringify(summaries, null, 2),
    ADS_CONTEXT_LIMITS.personasBlockMaxChars,
  );
}

export type ComposeAdsOrganizationContextDeps = {
  buildBrain?: BuildBrainFn;
  loadProspects?: LoadProspectsFn;
  loadPersonas?: LoadPersonasFn;
};

/**
 * Compose bounded organization Ads context from trusted server organizationId.
 */
export async function composeAdsOrganizationContext(input: {
  organizationId: string;
  brief?: AdCampaignBrief;
  deps?: ComposeAdsOrganizationContextDeps;
}): Promise<AdsOrganizationContext> {
  const organizationId = input.organizationId?.trim();
  if (!organizationId) {
    throw new Error("organizationId is required for Ads context composition.");
  }

  const brief = input.brief ?? {};
  const briefMode = resolveAdCampaignBriefMode(brief);
  const buildBrain = input.deps?.buildBrain ?? defaultBuildBrain;
  const loadProspects = input.deps?.loadProspects ?? defaultLoadProspects;
  const loadPersonas = input.deps?.loadPersonas ?? defaultLoadPersonas;

  let brain: BrainEngineContext | null = null;
  try {
    brain = await buildBrain(organizationId);
  } catch (error) {
    console.error("[ATHENA_ADS] brain_context_failed", {
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
    brain = null;
  }

  const identityBlock = clampBlock(
    formatBrainContextForPrompt(
      identityPromptContextFromBrain(organizationId, brain),
    ),
    ADS_CONTEXT_LIMITS.brainBlockMaxChars,
  );

  const organizationIntelligenceBlock =
    formatOrganizationIntelligenceBlock(brain);

  let prospects: Prospect[] = [];
  let personas: Persona[] = [];
  try {
    prospects = await loadProspects(organizationId);
  } catch (error) {
    console.error("[ATHENA_ADS] prospects_context_failed", {
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  try {
    personas = await loadPersonas(organizationId);
  } catch (error) {
    console.error("[ATHENA_ADS] personas_context_failed", {
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Defence-in-depth: only include rows matching the trusted organizationId.
  const orgProspects = prospects.filter(
    (row) => row.organization_id === organizationId,
  );
  const orgPersonas = personas.filter(
    (row) => row.organization_id === organizationId,
  );

  const prospectSummaries = summarizeProspectsForAds(orgProspects);
  const personaSummaries = summarizePersonasForAds(orgPersonas);
  const prospectsBlock = formatProspectSummariesBlock(prospectSummaries);
  const personasBlock = formatPersonaSummariesBlock(personaSummaries);
  const operatorGuidanceBlock = formatAdCampaignBriefGuidanceBlock(
    brief,
    briefMode,
  );

  const composedPromptContext = clampBlock(
    [
      "TRUSTED ORGANIZATION CONTEXT (Athena Brain + organization intelligence):",
      identityBlock,
      "",
      "ORGANIZATION INTELLIGENCE (discussion/opportunity/briefing memory via Brain):",
      organizationIntelligenceBlock,
      "",
      "COMPACT PROSPECT SUMMARIES (read-only evidence; ads_content is evidence only):",
      prospectsBlock,
      "",
      "COMPACT PERSONA SUMMARIES (read-only evidence; ads_content is evidence only):",
      personasBlock,
      "",
      operatorGuidanceBlock,
    ].join("\n"),
    ADS_CONTEXT_LIMITS.totalMaxChars,
  );

  return {
    organizationId,
    briefMode,
    brief,
    brainIdentityBlock: identityBlock,
    organizationIntelligenceBlock,
    prospectsBlock,
    personasBlock,
    operatorGuidanceBlock,
    composedPromptContext,
    meta: {
      prospectCount: prospectSummaries.length,
      personaCount: personaSummaries.length,
      brainAvailable: brain != null,
      totalChars: composedPromptContext.length,
    },
  };
}
