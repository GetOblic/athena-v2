/**
 * Thin SEO-specific organization context composer.
 * Reuses Brain builders and reads Deep Website Intelligence (deep_v1) as evidence.
 * Never accepts organization ownership from the client.
 * Never mutates Deep Scrape, Brain, Personas, Discussions, or Ads.
 */

import {
  formatBrainContextForPrompt,
  type PromptIdentityContext,
} from "@/services/brain/formatBrainContextForPrompt";
import type { BrainEngineContext } from "@/services/brain/brainContextTypes";
import {
  formatSeoReportBriefGuidanceBlock,
  resolveSeoReportBriefMode,
} from "@/services/seo/seoReportBrief";
import type {
  SeoReportBrief,
  SeoReportBriefMode,
  SeoWebsitePagesAnalyzed,
} from "@/services/seo/seoReportTypes";
import { snapshotSeoWebsitePagesAnalyzed } from "@/services/seo/seoWebsitePagesSnapshot";
import type { Persona } from "@/services/personas/personaService";
import {
  formatDeepIntelligenceForBrainPrompt,
  isDeepWebsiteIntelligence,
  type DeepWebsiteIntelligence,
} from "@/services/websiteLearning/deepScrape/deepWebsiteIntelligence";
import {
  IDENTITY_EXECUTIVE_INTELLIGENCE_KEY,
  readIdentityExecutiveIntelligence,
} from "@/services/identity/identityExecutiveIntelligence";

type BuildBrainFn = (organizationId: string) => Promise<BrainEngineContext | null>;
type LoadPersonasFn = (organizationId: string) => Promise<Persona[]>;
type LoadDeepIntelligenceFn = (
  organizationId: string,
) => Promise<DeepWebsiteIntelligence | null>;
type LoadAdsKeywordThemesFn = (organizationId: string) => Promise<string | null>;

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

/**
 * Read-only load of organization Deep Website Intelligence (deep_v1).
 * Does not enqueue scrape jobs or mutate athena_identity.
 */
export async function loadOrganizationDeepWebsiteIntelligence(
  organizationId: string,
): Promise<DeepWebsiteIntelligence | null> {
  const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
  const { data, error } = await supabaseAdmin
    .from("athena_identity")
    .select("website_intelligence")
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[ATHENA_SEO] deep_intelligence_lookup_failed", {
      organizationId,
      error: error.message,
    });
    return null;
  }

  const intelligence = data?.website_intelligence;
  if (!isDeepWebsiteIntelligence(intelligence)) {
    return null;
  }
  return intelligence;
}

async function defaultLoadAdsKeywordThemes(
  organizationId: string,
): Promise<string | null> {
  try {
    const { listAdCampaigns } = await import("@/services/ads/adCampaignService");
    const campaigns = await listAdCampaigns(organizationId);
    const ready = campaigns.find(
      (campaign) =>
        campaign.status === "Ready" &&
        campaign.package_json?.keywordThemes?.themes?.length,
    );
    if (!ready?.package_json?.keywordThemes) return null;
    return JSON.stringify(
      {
        label: ready.package_json.keywordThemes.label,
        disclaimer: ready.package_json.keywordThemes.disclaimer,
        themes: ready.package_json.keywordThemes.themes.slice(0, 8).map((theme) => ({
          theme: theme.theme,
          intentClassification: theme.intentClassification,
          audienceRelevance: theme.audienceRelevance,
          suggestedMessageAngle: theme.suggestedMessageAngle,
          suggestedLandingPageDirection: theme.suggestedLandingPageDirection,
        })),
      },
      null,
      2,
    );
  } catch (error) {
    console.error("[ATHENA_SEO] ads_keyword_themes_context_failed", {
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export const SEO_CONTEXT_LIMITS = {
  personas: 8,
  fieldTruncate: 220,
  brainBlockMaxChars: 12_000,
  orgIntelligenceMaxChars: 8_000,
  deepIntelligenceMaxChars: 14_000,
  executiveIntelligenceMaxChars: 4_000,
  personasBlockMaxChars: 6_000,
  communitiesBlockMaxChars: 4_000,
  adsKeywordThemesMaxChars: 3_000,
  totalMaxChars: 48_000,
} as const;

export type SeoPersonaSummary = {
  personaName: string;
  category: string | null;
  occupation: string | null;
  seniority: string | null;
  motivations: string | null;
  painPoints: string | null;
  preferredChannels: string | null;
};

export type SeoOrganizationContext = {
  organizationId: string;
  briefMode: SeoReportBriefMode;
  brief: SeoReportBrief;
  brainIdentityBlock: string;
  organizationIntelligenceBlock: string;
  deepWebsiteIntelligenceBlock: string;
  executiveIntelligenceBlock: string;
  personasBlock: string;
  communitiesBlock: string;
  adsKeywordThemesBlock: string;
  operatorGuidanceBlock: string;
  composedPromptContext: string;
  /** Immutable deep_v1 page inventory for package persistence (not live Identity). */
  websitePagesAnalyzed: SeoWebsitePagesAnalyzed;
  meta: {
    personaCount: number;
    brainAvailable: boolean;
    deepIntelligenceAvailable: boolean;
    executiveIntelligenceAvailable: boolean;
    adsKeywordThemesAvailable: boolean;
    totalChars: number;
    websitePagesSnapshotCount: number;
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
        ? truncateText(entry.summary, SEO_CONTEXT_LIMITS.fieldTruncate)
        : null,
      opportunityScore: entry.opportunityScore,
    }));

  const highIntent = brain.discussionMemory.highIntentDiscussions
    .slice(0, 6)
    .map((entry) => ({
      title: entry.title,
      summary: entry.summary
        ? truncateText(entry.summary, SEO_CONTEXT_LIMITS.fieldTruncate)
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
        ? truncateText(entry.summary, SEO_CONTEXT_LIMITS.fieldTruncate)
        : null,
    }));

  const payload = {
    organization: brain.organization,
    contextSummary: brain.contextSummary,
    recentDiscussions: discussions,
    highIntentDiscussions: highIntent,
    recentOpportunities: opportunities,
    recentBriefings: briefings,
    assetAudiences: brain.assetMemory.targetAudiences.slice(0, 10),
    assetBusinessGoals: brain.assetMemory.businessGoals.slice(0, 10),
  };

  return clampBlock(
    JSON.stringify(payload, null, 2),
    SEO_CONTEXT_LIMITS.orgIntelligenceMaxChars,
  );
}

function formatCommunitiesBlock(brain: BrainEngineContext | null): string {
  if (!brain) {
    return "No community / intelligence-domain memory was available.";
  }

  const domains = brain.domainMemory.domains.slice(0, 8).map((domain) => ({
    name: domain.name,
    market: domain.market,
    niche: domain.niche,
    description: domain.description
      ? truncateText(domain.description, SEO_CONTEXT_LIMITS.fieldTruncate)
      : null,
  }));

  const communityIntel = (
    brain.knowledgeMemory.communityIntelligence ?? []
  )
    .slice(0, 6)
    .map((entry) => ({
      communityId: entry.communityId,
      executiveSummary: entry.executiveSummary
        ? truncateText(
            entry.executiveSummary,
            SEO_CONTEXT_LIMITS.fieldTruncate,
          )
        : null,
      confidence: entry.confidence,
    }));

  return clampBlock(
    JSON.stringify({ domains, communityIntelligence: communityIntel }, null, 2),
    SEO_CONTEXT_LIMITS.communitiesBlockMaxChars,
  );
}

function formatExecutiveIntelligenceBlock(
  brain: BrainEngineContext | null,
): string {
  const masterProfile = brain?.businessMemory.identity?.masterProfile as
    | Record<string, unknown>
    | null
    | undefined;
  if (!masterProfile) {
    return "No Executive Intelligence was available on Master Profile.";
  }

  const executive = readIdentityExecutiveIntelligence(masterProfile);
  if (!executive) {
    return "No Executive Intelligence was available on Master Profile.";
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
    SEO_CONTEXT_LIMITS.executiveIntelligenceMaxChars,
  );
}

function formatDeepWebsiteIntelligenceBlock(
  intelligence: DeepWebsiteIntelligence | null,
): string {
  if (!intelligence) {
    return [
      "No Deep Website Intelligence (deep_v1) was available for this organization.",
      "Do not invent website pages, services, testimonials, or FAQs.",
      "Base website-related findings only on Brain / Master Profile homepage learning if present, and mark website coverage confidence as limited.",
    ].join("\n");
  }

  const pages = intelligence.pages.slice(0, 50).map((page) => ({
    url: page.url,
    title: page.title,
    page_type: page.page_type,
    excerpt: truncateText(page.excerpt || "", 180),
  }));

  const formatted = [
    formatDeepIntelligenceForBrainPrompt(intelligence),
    "",
    "CRAWL SUMMARY:",
    JSON.stringify(intelligence.crawl_summary, null, 2),
    "",
    "PAGE INDEX (read-only evidence):",
    JSON.stringify(pages, null, 2),
  ].join("\n");

  return clampBlock(formatted, SEO_CONTEXT_LIMITS.deepIntelligenceMaxChars);
}

export function summarizePersonasForSeo(personas: Persona[]): SeoPersonaSummary[] {
  return personas.slice(0, SEO_CONTEXT_LIMITS.personas).map((persona) => ({
    personaName: persona.persona_name?.trim() || "Unnamed persona",
    category: persona.category,
    occupation: persona.occupation
      ? truncateText(persona.occupation, SEO_CONTEXT_LIMITS.fieldTruncate)
      : null,
    seniority: persona.seniority,
    motivations: persona.motivations
      ? truncateText(persona.motivations, SEO_CONTEXT_LIMITS.fieldTruncate)
      : null,
    painPoints: persona.pain_points
      ? truncateText(persona.pain_points, SEO_CONTEXT_LIMITS.fieldTruncate)
      : null,
    preferredChannels: persona.preferred_channels
      ? truncateText(
          persona.preferred_channels,
          SEO_CONTEXT_LIMITS.fieldTruncate,
        )
      : null,
  }));
}

export function formatPersonaSummariesBlock(
  summaries: SeoPersonaSummary[],
): string {
  if (summaries.length === 0) {
    return "No persona summaries available for this organization.";
  }
  return clampBlock(
    JSON.stringify(summaries, null, 2),
    SEO_CONTEXT_LIMITS.personasBlockMaxChars,
  );
}

export type ComposeSeoOrganizationContextDeps = {
  buildBrain?: BuildBrainFn;
  loadPersonas?: LoadPersonasFn;
  loadDeepIntelligence?: LoadDeepIntelligenceFn;
  loadAdsKeywordThemes?: LoadAdsKeywordThemesFn;
};

/**
 * Compose bounded organization SEO context from trusted server organizationId.
 */
export async function composeSeoOrganizationContext(input: {
  organizationId: string;
  brief?: SeoReportBrief;
  deps?: ComposeSeoOrganizationContextDeps;
}): Promise<SeoOrganizationContext> {
  const organizationId = input.organizationId?.trim();
  if (!organizationId) {
    throw new Error("organizationId is required for SEO context composition.");
  }

  const brief = input.brief ?? {};
  const briefMode = resolveSeoReportBriefMode(brief);
  const buildBrain = input.deps?.buildBrain ?? defaultBuildBrain;
  const loadPersonas = input.deps?.loadPersonas ?? defaultLoadPersonas;
  const loadDeepIntelligence =
    input.deps?.loadDeepIntelligence ?? loadOrganizationDeepWebsiteIntelligence;
  const loadAdsKeywordThemes =
    input.deps?.loadAdsKeywordThemes ?? defaultLoadAdsKeywordThemes;

  let brain: BrainEngineContext | null = null;
  try {
    brain = await buildBrain(organizationId);
  } catch (error) {
    console.error("[ATHENA_SEO] brain_context_failed", {
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
    brain = null;
  }

  const identityBlock = clampBlock(
    formatBrainContextForPrompt(
      identityPromptContextFromBrain(organizationId, brain),
    ),
    SEO_CONTEXT_LIMITS.brainBlockMaxChars,
  );

  const organizationIntelligenceBlock =
    formatOrganizationIntelligenceBlock(brain);
  const communitiesBlock = formatCommunitiesBlock(brain);
  const executiveIntelligenceBlock = formatExecutiveIntelligenceBlock(brain);

  let deepIntelligence: DeepWebsiteIntelligence | null = null;
  try {
    deepIntelligence = await loadDeepIntelligence(organizationId);
  } catch (error) {
    console.error("[ATHENA_SEO] deep_intelligence_context_failed", {
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const deepWebsiteIntelligenceBlock =
    formatDeepWebsiteIntelligenceBlock(deepIntelligence);
  const websitePagesAnalyzed =
    snapshotSeoWebsitePagesAnalyzed(deepIntelligence);

  let personas: Persona[] = [];
  try {
    personas = await loadPersonas(organizationId);
  } catch (error) {
    console.error("[ATHENA_SEO] personas_context_failed", {
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const orgPersonas = personas.filter(
    (row) => row.organization_id === organizationId,
  );
  const personaSummaries = summarizePersonasForSeo(orgPersonas);
  const personasBlock = formatPersonaSummariesBlock(personaSummaries);

  const adsKeywordThemesRaw = await loadAdsKeywordThemes(organizationId);
  const adsKeywordThemesBlock = adsKeywordThemesRaw
    ? clampBlock(
        adsKeywordThemesRaw,
        SEO_CONTEXT_LIMITS.adsKeywordThemesMaxChars,
      )
    : "No Ads keyword themes were available. Do not invent keyword metrics.";

  const operatorGuidanceBlock = formatSeoReportBriefGuidanceBlock(
    brief,
    briefMode,
  );

  const composedPromptContext = clampBlock(
    [
      "TRUSTED ORGANIZATION CONTEXT (Athena Brain + Master Profile):",
      identityBlock,
      "",
      "EXECUTIVE INTELLIGENCE (Master Profile, read-only):",
      executiveIntelligenceBlock,
      "",
      "ORGANIZATION INTELLIGENCE (discussions / opportunities / briefings via Brain):",
      organizationIntelligenceBlock,
      "",
      "COMMUNITIES / INTELLIGENCE DOMAINS (read-only via Brain):",
      communitiesBlock,
      "",
      "DEEP WEBSITE INTELLIGENCE (deep_v1 from Website Deep Scrape — read-only evidence):",
      deepWebsiteIntelligenceBlock,
      "",
      "COMPACT PERSONA SUMMARIES (read-only evidence for customer intent):",
      personasBlock,
      "",
      "ADS KEYWORD THEMES (optional read-only evidence; not live keyword data):",
      adsKeywordThemesBlock,
      "",
      operatorGuidanceBlock,
    ].join("\n"),
    SEO_CONTEXT_LIMITS.totalMaxChars,
  );

  return {
    organizationId,
    briefMode,
    brief,
    brainIdentityBlock: identityBlock,
    organizationIntelligenceBlock,
    deepWebsiteIntelligenceBlock,
    executiveIntelligenceBlock,
    personasBlock,
    communitiesBlock,
    adsKeywordThemesBlock,
    operatorGuidanceBlock,
    composedPromptContext,
    websitePagesAnalyzed,
    meta: {
      personaCount: personaSummaries.length,
      brainAvailable: brain != null,
      deepIntelligenceAvailable: deepIntelligence != null,
      executiveIntelligenceAvailable: !executiveIntelligenceBlock.startsWith(
        "No Executive Intelligence",
      ),
      adsKeywordThemesAvailable: Boolean(adsKeywordThemesRaw),
      totalChars: composedPromptContext.length,
      websitePagesSnapshotCount: websitePagesAnalyzed.pages.length,
    },
  };
}
