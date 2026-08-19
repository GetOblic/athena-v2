/**
 * Deterministic source selection and compact summarization for L3.
 * Default loaders are organization-scoped. Callers must still fail closed
 * on any row whose organization_id does not match the trusted id.
 */

import type { BrainEngineContext } from "@/services/brain/brainContextTypes";
import type { AdCampaign } from "@/services/ads/adCampaignTypes";
import type { SeoReport } from "@/services/seo/seoReportTypes";
import {
  isSeoIntelligencePackage,
  isSeoTechnicalPackage,
} from "@/services/seo/seoReportTypes";
import type { Persona } from "@/services/personas/personaService";
import type { Prospect } from "@/services/prospects/prospectService";
import type { AthenaAssetBlueprint } from "@/services/assetBlueprints/assetBlueprintService";
import type { DeepWebsiteIntelligence } from "@/services/websiteLearning/deepScrape/deepWebsiteIntelligence";
import { emptyBusinessKnowledge } from "@/services/websiteLearning/deepScrape/deepWebsiteIntelligence";
import {
  readIdentityExecutiveIntelligence,
} from "@/services/identity/identityExecutiveIntelligence";
import type { ActiveGovernedInstruction } from "@/services/superAdmin/strategicBlueprintInstructionConstants";
import { TREND_SOCIAL_PROMPT_CONFIG_KEY } from "@/services/superAdmin/strategicBlueprintInstructionConstants";
import {
  SOCIAL_PLANNER_INTELLIGENCE_CONSIDER_CAPS,
  SOCIAL_PLANNER_INTELLIGENCE_ITEM_CAPS,
  SOCIAL_PLANNER_INTELLIGENCE_LIMITS,
  SOCIAL_PLANNER_TREND_SOCIAL_INSTRUCTION_MAX_CHARS,
  optionalTruncatedText,
} from "@/services/socialPlanner/intelligence/socialPlannerIntelligenceBudgets";
import {
  SOCIAL_PLANNER_ADS_REFERENCE_ROLE,
  SocialPlannerIntelligenceError,
  type SocialPlannerAdsCampaignReference,
  type SocialPlannerBrainIntelligence,
  type SocialPlannerBlueprintIntelligence,
  type SocialPlannerDiscussionIntelligence,
  type SocialPlannerIdentityExecutiveIntelligence,
  type SocialPlannerOpportunityIntelligence,
  type SocialPlannerOrganizationFacts,
  type SocialPlannerPersonaIntelligence,
  type SocialPlannerPersonaPortfolio,
  type SocialPlannerProspectIntelligence,
  type SocialPlannerProspectPortfolio,
  type SocialPlannerSeoIntelligenceItem,
  type SocialPlannerTrendSocialPrompt,
  type SocialPlannerWebsiteIntelligence,
} from "@/services/socialPlanner/intelligence/socialPlannerIntelligenceTypes";

export type SocialPlannerCurrentExecutiveVersionSource = {
  id: string;
  discussion_id: string;
  organization_id: string;
  version_number: number;
  is_current: boolean;
  generated_at: string;
  analysis_id: string | null;
  intelligence: unknown;
};

function recencyMs(createdAt: string | null | undefined, updatedAt?: string | null): number {
  const updated = Date.parse(updatedAt ?? "");
  const created = Date.parse(createdAt ?? "");
  return Math.max(
    Number.isNaN(updated) ? 0 : updated,
    Number.isNaN(created) ? 0 : created,
  );
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
  }
  return Array.from(seen);
}

function assertOrganizationId(organizationId: string): string {
  const trimmed = organizationId.trim();
  if (!trimmed) {
    throw new SocialPlannerIntelligenceError(
      "INVALID_ORGANIZATION",
      "organizationId is required for Social Planner intelligence composition.",
    );
  }
  return trimmed;
}

export function assertTenantOwnedRows(
  organizationId: string,
  rows: ReadonlyArray<{ organization_id?: string | null } | Record<string, unknown>>,
  source: string,
): void {
  for (const row of rows) {
    const owner =
      "organization_id" in row
        ? (row.organization_id as string | null | undefined)
        : undefined;
    if (owner != null && owner !== organizationId) {
      throw new SocialPlannerIntelligenceError(
        "CROSS_TENANT_CONTAMINATION",
        `${source} included a row that does not belong to the trusted organization.`,
      );
    }
  }
}

export function selectCurrentPersonas(personas: Persona[]): Persona[] {
  const eligible = personas.filter((persona) => {
    if (persona.lifecycle_status === "Archived" || persona.lifecycle_status === "Not a Fit") {
      return false;
    }
    if (persona.status === "Processing Failed") {
      return false;
    }
    return true;
  });

  const rank = (persona: Persona): number => {
    if (persona.status === "Ready") return 0;
    if (persona.status === "Analysis Generated") return 1;
    return 2;
  };

  return [...eligible]
    .sort((left, right) => {
      const rankDelta = rank(left) - rank(right);
      if (rankDelta !== 0) return rankDelta;
      return recencyMs(right.created_at, right.updated_at) - recencyMs(left.created_at, left.updated_at);
    })
    .slice(0, SOCIAL_PLANNER_INTELLIGENCE_CONSIDER_CAPS.personas);
}

export function selectCurrentProspects(prospects: Prospect[]): Prospect[] {
  const eligible = prospects.filter(
    (prospect) => prospect.lifecycle_status !== "Not a Fit",
  );
  return [...eligible]
    .sort(
      (left, right) =>
        recencyMs(right.created_at, right.updated_at) -
        recencyMs(left.created_at, left.updated_at),
    )
    .slice(0, SOCIAL_PLANNER_INTELLIGENCE_CONSIDER_CAPS.prospects);
}

export function selectReadySeoReports(reports: SeoReport[]): SeoReport[] {
  return reports
    .filter((report) => report.status === "Ready" && report.package_json)
    .sort(
      (left, right) =>
        recencyMs(right.created_at, right.updated_at) -
        recencyMs(left.created_at, left.updated_at),
    )
    .slice(0, SOCIAL_PLANNER_INTELLIGENCE_CONSIDER_CAPS.seoReports);
}

export function selectReadyAdCampaigns(campaigns: AdCampaign[]): AdCampaign[] {
  return campaigns
    .filter((campaign) => campaign.status === "Ready" && campaign.package_json)
    .sort(
      (left, right) =>
        recencyMs(right.created_at, right.updated_at) -
        recencyMs(left.created_at, left.updated_at),
    )
    .slice(0, SOCIAL_PLANNER_INTELLIGENCE_CONSIDER_CAPS.adsCampaigns);
}

export function selectCurrentBlueprints(
  blueprints: AthenaAssetBlueprint[],
): AthenaAssetBlueprint[] {
  const hasPrompts = (blueprint: AthenaAssetBlueprint): boolean =>
    Boolean(
      blueprint.image_prompt?.trim() ||
        blueprint.pdf_prompt?.trim() ||
        blueprint.social_prompt?.trim() ||
        blueprint.trend_social_prompt?.trim(),
    );

  return [...blueprints]
    .sort((left, right) => {
      const promptDelta = Number(hasPrompts(right)) - Number(hasPrompts(left));
      if (promptDelta !== 0) return promptDelta;
      return recencyMs(right.created_at, right.updated_at) - recencyMs(left.created_at, left.updated_at);
    })
    .slice(0, SOCIAL_PLANNER_INTELLIGENCE_CONSIDER_CAPS.blueprints);
}

export function composeOrganizationFacts(
  organizationId: string,
  brain: BrainEngineContext | null,
): SocialPlannerOrganizationFacts {
  const identity = brain?.businessMemory.identity ?? null;
  return {
    id: organizationId,
    name: brain?.organization.name ?? null,
    slug: brain?.organization.slug ?? null,
    website: optionalTruncatedText(identity?.website),
    aboutYou: optionalTruncatedText(identity?.aboutYou),
    expertise: optionalTruncatedText(identity?.expertise),
    brainStatus: identity?.brainStatus ?? null,
    isBrainTrained: Boolean(brain?.businessMemory.isBrainTrained),
  };
}

export function composeBrainIntelligence(
  brain: BrainEngineContext | null,
): SocialPlannerBrainIntelligence {
  if (!brain) {
    return {
      available: false,
      isBrainTrained: false,
      completenessScore: null,
      masterProfileVersion: null,
      homepageLearning: null,
      contextWarnings: [],
      missingSetupFields: [],
      domains: [],
      targetAudiences: [],
      businessGoals: [],
    };
  }

  return {
    available: true,
    isBrainTrained: brain.businessMemory.isBrainTrained,
    completenessScore: brain.businessMemory.completenessScore,
    masterProfileVersion: brain.businessMemory.identity?.masterProfileVersion ?? null,
    homepageLearning: optionalTruncatedText(
      brain.businessMemory.identity?.homepageLearning,
      480,
    ),
    contextWarnings: (brain.contextSummary.warnings ?? []).slice(0, 8),
    missingSetupFields: (brain.contextSummary.missingBrainSetupFields ?? []).slice(0, 8),
    domains: brain.domainMemory.domains
      .slice(0, SOCIAL_PLANNER_INTELLIGENCE_ITEM_CAPS.domains)
      .map((domain) => ({
        name: domain.name,
        market: optionalTruncatedText(domain.market),
        niche: optionalTruncatedText(domain.niche),
        description: optionalTruncatedText(domain.description),
      })),
    targetAudiences: (brain.assetMemory.targetAudiences ?? []).slice(0, 10),
    businessGoals: (brain.assetMemory.businessGoals ?? []).slice(0, 10),
  };
}

export function composeIdentityExecutiveIntelligence(
  brain: BrainEngineContext | null,
): SocialPlannerIdentityExecutiveIntelligence {
  const executive = readIdentityExecutiveIntelligence(
    brain?.businessMemory.identity?.masterProfile,
  );
  if (!executive) {
    return {
      available: false,
      executiveSummary: null,
      confidenceLevel: null,
      businessModel: {},
      hiddenSignals: [],
    };
  }

  return {
    available: true,
    executiveSummary: optionalTruncatedText(executive.executive_summary, 720),
    confidenceLevel: executive.confidence_level,
    businessModel: Object.fromEntries(
      Object.entries(executive.business_model).flatMap(([key, value]) => {
        const text = optionalTruncatedText(value, 280);
        return text ? [[key, text]] : [];
      }),
    ),
    hiddenSignals: executive.hidden_signals
      .slice(0, SOCIAL_PLANNER_INTELLIGENCE_ITEM_CAPS.hiddenSignals)
      .map((signal) => ({
        finding: optionalTruncatedText(signal.finding) ?? "",
        whyItMatters: optionalTruncatedText(signal.why_it_matters) ?? "",
      })),
  };
}

export function composeWebsiteIntelligence(
  intelligence: DeepWebsiteIntelligence | null,
): SocialPlannerWebsiteIntelligence {
  if (!intelligence) {
    return {
      available: false,
      provider: null,
      url: null,
      scrapedAt: null,
      pagesAnalyzed: null,
      businessKnowledge: {},
      crawlSummary: null,
      pageThemes: [],
    };
  }

  const knowledge = intelligence.business_knowledge ?? emptyBusinessKnowledge();
  const businessKnowledge: Record<string, string> = {};
  for (const [key, value] of Object.entries(knowledge)) {
    const text = optionalTruncatedText(value, 360);
    if (text) businessKnowledge[key] = text;
  }

  return {
    available: true,
    provider: "deep_v1",
    url: intelligence.url,
    scrapedAt: intelligence.scraped_at,
    pagesAnalyzed: intelligence.pages_analyzed,
    businessKnowledge,
    crawlSummary: {
      pagesAnalyzed: intelligence.crawl_summary.pages_analyzed,
      servicesDiscovered: intelligence.crawl_summary.services_discovered,
      faqsDiscovered: intelligence.crawl_summary.faqs_discovered,
      testimonialsDiscovered: intelligence.crawl_summary.testimonials_discovered,
    },
    pageThemes: intelligence.pages
      .slice(0, SOCIAL_PLANNER_INTELLIGENCE_ITEM_CAPS.websitePages)
      .map((page) => ({
        url: page.url,
        title: optionalTruncatedText(page.title, 120),
        pageType: page.page_type,
      })),
  };
}

export function composeSeoIntelligence(
  reports: SeoReport[],
): SocialPlannerSeoIntelligenceItem[] {
  const ready = selectReadySeoReports(reports);
  const intelligence = ready.find((report) =>
    isSeoIntelligencePackage(report.package_json),
  );
  const technical = ready.find((report) =>
    isSeoTechnicalPackage(report.package_json),
  );

  const items: SocialPlannerSeoIntelligenceItem[] = [];

  if (intelligence && isSeoIntelligencePackage(intelligence.package_json)) {
    const pkg = intelligence.package_json;
    items.push({
      id: intelligence.id,
      name: intelligence.name,
      generationType: "intelligence",
      role: "current_strategic_seo",
      summary: optionalTruncatedText(
        pkg.executiveAssessment.summary || pkg.executiveAssessment.overallAssessment,
        360,
      ),
      priorityTopics: [
        ...pkg.contentCoverage.weaklyCoveredServices,
        ...pkg.contentCoverage.missingServices,
      ]
        .map((entry) => optionalTruncatedText(entry, 120))
        .filter((entry): entry is string => Boolean(entry))
        .slice(0, 8),
      keywordThemes: pkg.customerIntent.representedIntents
        .map((entry) => optionalTruncatedText(entry, 120))
        .filter((entry): entry is string => Boolean(entry))
        .slice(0, 8),
      contentOpportunities: pkg.commercialOpportunities.opportunities
        .map((entry) => optionalTruncatedText(entry.title, 160))
        .filter((entry): entry is string => Boolean(entry))
        .slice(0, 6),
      targetServices: [
        ...pkg.contentCoverage.wellCoveredServices,
        ...pkg.contentCoverage.weaklyCoveredServices,
      ]
        .map((entry) => optionalTruncatedText(entry, 120))
        .filter((entry): entry is string => Boolean(entry))
        .slice(0, 8),
      questionsAndProblems: [
        ...pkg.contentCoverage.missingCustomerQuestions,
        ...pkg.customerIntent.painPointGaps,
      ]
        .map((entry) => optionalTruncatedText(entry, 160))
        .filter((entry): entry is string => Boolean(entry))
        .slice(0, 8),
    });
  }

  if (technical && isSeoTechnicalPackage(technical.package_json)) {
    const pkg = technical.package_json;
    items.push({
      id: technical.id,
      name: technical.name,
      generationType: "technical",
      role: "current_technical_seo_reference",
      summary: optionalTruncatedText(
        pkg.executiveEvaluation.summary || pkg.executiveEvaluation.overallAssessment,
        280,
      ),
      priorityTopics: pkg.executiveEvaluation.remediationPriorities
        .map((entry) => optionalTruncatedText(entry, 120))
        .filter((entry): entry is string => Boolean(entry))
        .slice(0, 4),
      keywordThemes: [],
      contentOpportunities: [],
      targetServices: [],
      questionsAndProblems: pkg.executiveEvaluation.criticalIssues
        .map((entry) => optionalTruncatedText(entry, 160))
        .filter((entry): entry is string => Boolean(entry))
        .slice(0, 3),
    });
  }

  return items.slice(0, SOCIAL_PLANNER_INTELLIGENCE_ITEM_CAPS.seoReports);
}

function extractAnalysisField(
  intelligence: unknown,
  key: string,
): string | null {
  if (!intelligence || typeof intelligence !== "object") return null;
  const analysis = (intelligence as { analysis?: Record<string, unknown> }).analysis;
  if (!analysis || typeof analysis !== "object") return null;
  const value = analysis[key];
  return typeof value === "string" ? optionalTruncatedText(value) : null;
}

export function composeDiscussionIntelligence(
  brain: BrainEngineContext | null,
  versions: SocialPlannerCurrentExecutiveVersionSource[],
): SocialPlannerDiscussionIntelligence[] {
  if (!brain) return [];

  const highIntent = brain.discussionMemory.highIntentDiscussions ?? [];
  const recent = brain.discussionMemory.recentDiscussions ?? [];
  const merged = [...highIntent, ...recent];
  const seen = new Set<string>();
  const selected = [];
  for (const entry of merged) {
    if (!entry?.id || seen.has(entry.id)) continue;
    seen.add(entry.id);
    selected.push(entry);
    if (selected.length >= SOCIAL_PLANNER_INTELLIGENCE_ITEM_CAPS.discussions) {
      break;
    }
  }

  const versionByDiscussion = new Map<string, SocialPlannerCurrentExecutiveVersionSource>();
  for (const version of versions) {
    if (!version.is_current) continue;
    if (!versionByDiscussion.has(version.discussion_id)) {
      versionByDiscussion.set(version.discussion_id, version);
    }
  }

  return selected.map((entry) => {
    const version = versionByDiscussion.get(entry.id);
    return {
      id: entry.id,
      title: entry.title,
      status: entry.status,
      summary: optionalTruncatedText(entry.summary),
      sourceType: "discussion" as const,
      currentExecutiveVersion: version
        ? {
            id: version.id,
            versionNumber: version.version_number,
            generatedAt: version.generated_at,
            analysisId: version.analysis_id,
            summary: extractAnalysisField(version.intelligence, "summary"),
            intent: extractAnalysisField(version.intelligence, "intent"),
            buyerStage: extractAnalysisField(version.intelligence, "buyer_stage"),
            painPoints: extractAnalysisField(version.intelligence, "pain_points"),
            recommendedAction: extractAnalysisField(
              version.intelligence,
              "recommended_action",
            ),
          }
        : null,
    };
  });
}

export function summarizePersona(
  persona: Persona,
): SocialPlannerPersonaIntelligence {
  const audienceGeography =
    optionalTruncatedText(persona.location_summary) ||
    uniqueStrings([persona.city, persona.state, persona.country]).join(", ") ||
    null;

  return {
    id: persona.id,
    name: persona.persona_name?.trim() || "Unnamed persona",
    category: optionalTruncatedText(persona.category),
    occupation: optionalTruncatedText(persona.occupation),
    seniority: optionalTruncatedText(persona.seniority),
    audienceSegment:
      optionalTruncatedText(persona.short_description) ||
      optionalTruncatedText(persona.category),
    needs: optionalTruncatedText(persona.needs),
    painPoints: optionalTruncatedText(persona.pain_points),
    motivations: optionalTruncatedText(persona.motivations),
    objections: optionalTruncatedText(persona.objections),
    contentInterests: optionalTruncatedText(persona.interests),
    decisionDrivers:
      optionalTruncatedText(persona.decision_criteria) ||
      optionalTruncatedText(persona.buying_triggers),
    communicationPreferences:
      optionalTruncatedText(persona.preferred_channels) ||
      optionalTruncatedText(persona.communication_style),
    audienceGeography: audienceGeography || null,
    status: persona.status,
    lifecycleStatus: persona.lifecycle_status,
  };
}

export function composePersonaPortfolio(
  personas: Persona[],
): SocialPlannerPersonaPortfolio {
  const selected = selectCurrentPersonas(personas).slice(
    0,
    SOCIAL_PLANNER_INTELLIGENCE_ITEM_CAPS.personas,
  );
  const summaries = selected.map(summarizePersona);
  return {
    consideredCount: personas.length,
    includedCount: summaries.length,
    distinctCategories: uniqueStrings(summaries.map((row) => row.category)),
    distinctOccupations: uniqueStrings(summaries.map((row) => row.occupation)),
    distinctAudienceGeographies: uniqueStrings(
      summaries.map((row) => row.audienceGeography),
    ),
    personas: summaries,
  };
}

export function summarizeProspect(
  prospect: Prospect,
): SocialPlannerProspectIntelligence {
  return {
    id: prospect.id,
    businessName: prospect.business_name,
    industry: optionalTruncatedText(prospect.industry),
    category: optionalTruncatedText(prospect.category),
    geography:
      uniqueStrings([prospect.city, prospect.state, prospect.country]).join(", ") ||
      null,
    commercialNeed:
      optionalTruncatedText(prospect.additional_context) ||
      optionalTruncatedText(prospect.ads_content, 160),
    painPoints: optionalTruncatedText(prospect.pain_points),
    status: prospect.status,
    lifecycleStatus: prospect.lifecycle_status,
  };
}

export function composeProspectPortfolio(
  prospects: Prospect[],
): SocialPlannerProspectPortfolio {
  const selected = selectCurrentProspects(prospects).slice(
    0,
    SOCIAL_PLANNER_INTELLIGENCE_ITEM_CAPS.prospects,
  );
  return {
    consideredCount: prospects.length,
    includedCount: selected.length,
    prospects: selected.map(summarizeProspect),
  };
}

export function composeOpportunityIntelligence(
  brain: BrainEngineContext | null,
): SocialPlannerOpportunityIntelligence[] {
  if (!brain) return [];
  return (brain.opportunityMemory.recentOpportunities ?? [])
    .slice(0, SOCIAL_PLANNER_INTELLIGENCE_ITEM_CAPS.opportunities)
    .map((entry) => ({
      id: entry.id,
      title: entry.title,
      status: entry.status,
      urgency: entry.urgency,
      score: entry.score,
    }));
}

export function composeAdsReferences(
  campaigns: AdCampaign[],
): SocialPlannerAdsCampaignReference[] {
  return selectReadyAdCampaigns(campaigns)
    .slice(0, SOCIAL_PLANNER_INTELLIGENCE_ITEM_CAPS.adsCampaigns)
    .map((campaign) => {
      const strategy = campaign.package_json?.strategy;
      const themes = campaign.package_json?.keywordThemes?.themes ?? [];
      return {
        id: campaign.id,
        name: campaign.name,
        role: SOCIAL_PLANNER_ADS_REFERENCE_ROLE,
        objective: optionalTruncatedText(strategy?.objective),
        audience: optionalTruncatedText(strategy?.audience),
        offer: optionalTruncatedText(strategy?.coreOfferOrMessage),
        positioning: optionalTruncatedText(strategy?.positioningAngle),
        messageAngle: optionalTruncatedText(strategy?.primaryValueProposition),
        keywordThemes: themes
          .slice(0, 6)
          .map((theme) => optionalTruncatedText(theme.theme, 80))
          .filter((theme): theme is string => Boolean(theme)),
      };
    });
}

function blueprintContextType(
  blueprint: AthenaAssetBlueprint,
): SocialPlannerBlueprintIntelligence["contextType"] {
  if (blueprint.discussion_id) return "discussion";
  if (blueprint.opportunity_id) return "opportunity";
  if (blueprint.briefing_id) return "briefing";
  return "organization";
}

export function composeBlueprintIntelligence(
  blueprints: AthenaAssetBlueprint[],
): SocialPlannerBlueprintIntelligence[] {
  return selectCurrentBlueprints(blueprints)
    .slice(0, SOCIAL_PLANNER_INTELLIGENCE_ITEM_CAPS.blueprints)
    .map((blueprint) => ({
      id: blueprint.id,
      contextType: blueprintContextType(blueprint),
      discussionId: blueprint.discussion_id,
      opportunityId: blueprint.opportunity_id,
      briefingId: blueprint.briefing_id,
      assetTitle: blueprint.asset_title,
      assetType: blueprint.asset_type,
      businessGoal: optionalTruncatedText(blueprint.business_goal),
      targetAudience: optionalTruncatedText(blueprint.target_audience),
      imagePromptTheme: optionalTruncatedText(
        blueprint.image_prompt,
        SOCIAL_PLANNER_INTELLIGENCE_LIMITS.fingerprintTruncate,
      ),
      pdfPromptTheme: optionalTruncatedText(
        blueprint.pdf_prompt,
        SOCIAL_PLANNER_INTELLIGENCE_LIMITS.fingerprintTruncate,
      ),
      socialPromptTheme: optionalTruncatedText(
        blueprint.social_prompt,
        SOCIAL_PLANNER_INTELLIGENCE_LIMITS.fingerprintTruncate,
      ),
      historicalTrendSocialOutput: optionalTruncatedText(
        blueprint.trend_social_prompt,
        SOCIAL_PLANNER_INTELLIGENCE_LIMITS.fingerprintTruncate,
      ),
      notes: optionalTruncatedText(blueprint.notes),
    }));
}

export function composeTrendSocialPrompt(
  instruction: ActiveGovernedInstruction | null,
): SocialPlannerTrendSocialPrompt {
  if (!instruction || !instruction.configured) {
    return {
      key: TREND_SOCIAL_PROMPT_CONFIG_KEY,
      configured: false,
      revisionId: null,
      updatedAt: instruction?.updatedAt ?? null,
      instructionText: "",
    };
  }

  return {
    key: TREND_SOCIAL_PROMPT_CONFIG_KEY,
    configured: true,
    revisionId: instruction.revisionId,
    updatedAt: instruction.updatedAt,
    instructionText: optionalTruncatedText(
      instruction.instructionText,
      SOCIAL_PLANNER_TREND_SOCIAL_INSTRUCTION_MAX_CHARS,
    ) ?? "",
  };
}

export async function defaultBuildBrain(
  organizationId: string,
): Promise<BrainEngineContext | null> {
  const { buildBrainContextForOrganization } = await import(
    "@/services/brain/brainContextBuilder"
  );
  return buildBrainContextForOrganization(assertOrganizationId(organizationId));
}

export async function defaultLoadDeepWebsiteIntelligence(
  organizationId: string,
): Promise<DeepWebsiteIntelligence | null> {
  const { loadOrganizationDeepWebsiteIntelligence } = await import(
    "@/services/seo/seoContextComposer"
  );
  return loadOrganizationDeepWebsiteIntelligence(assertOrganizationId(organizationId));
}

export async function defaultLoadPersonas(organizationId: string): Promise<Persona[]> {
  const { getPersonas } = await import("@/services/personas/personaService");
  return getPersonas(assertOrganizationId(organizationId));
}

export async function defaultLoadProspects(organizationId: string): Promise<Prospect[]> {
  const { getProspects } = await import("@/services/prospects/prospectService");
  return getProspects(assertOrganizationId(organizationId));
}

export async function defaultLoadSeoReports(organizationId: string): Promise<SeoReport[]> {
  const { listSeoReports } = await import("@/services/seo/seoReportService");
  return listSeoReports(assertOrganizationId(organizationId));
}

export async function defaultLoadAdCampaigns(
  organizationId: string,
): Promise<AdCampaign[]> {
  const { listAdCampaigns } = await import("@/services/ads/adCampaignService");
  return listAdCampaigns(assertOrganizationId(organizationId));
}

export async function defaultLoadBlueprints(
  organizationId: string,
): Promise<AthenaAssetBlueprint[]> {
  const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
  const orgId = assertOrganizationId(organizationId);
  const { data, error } = await supabaseAdmin
    .from("athena_asset_blueprints")
    .select(
      "id, organization_id, discussion_id, opportunity_id, briefing_id, asset_title, asset_type, business_goal, target_audience, priority, image_prompt, pdf_prompt, social_prompt, trend_social_prompt, notes, status, created_at, updated_at",
    )
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(SOCIAL_PLANNER_INTELLIGENCE_CONSIDER_CAPS.blueprints);

  if (error) {
    console.error("[ATHENA_SOCIAL_PLANNER] blueprints_lookup_failed", {
      organizationId: orgId,
      error: error.message,
    });
    return [];
  }

  return ((data ?? []) as unknown as AthenaAssetBlueprint[]);
}

export async function defaultLoadCurrentExecutiveVersions(
  organizationId: string,
  discussionIds: string[],
): Promise<SocialPlannerCurrentExecutiveVersionSource[]> {
  if (discussionIds.length === 0) return [];
  const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
  const orgId = assertOrganizationId(organizationId);
  const { data, error } = await supabaseAdmin
    .from("athena_executive_intelligence_versions")
    .select(
      "id, discussion_id, organization_id, version_number, is_current, generated_at, analysis_id, intelligence",
    )
    .eq("organization_id", orgId)
    .eq("is_current", true)
    .in("discussion_id", discussionIds);

  if (error) {
    console.error("[ATHENA_SOCIAL_PLANNER] executive_versions_lookup_failed", {
      organizationId: orgId,
      error: error.message,
    });
    return [];
  }

  return (data ?? []) as SocialPlannerCurrentExecutiveVersionSource[];
}

export async function defaultLoadTrendSocialPrompt(): Promise<ActiveGovernedInstruction> {
  const { getActiveTrendSocialPromptInstruction } = await import(
    "@/services/superAdmin/strategicBlueprintInstructions"
  );
  return getActiveTrendSocialPromptInstruction();
}
