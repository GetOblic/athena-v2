/**
 * Synthetic GenerationBundle + Discussion for non-production prompt assembly.
 * Fixture-only facts. Never loads production tenant data.
 */

import { EXECUTIVE_UNDERSTANDING_VERSION } from "@/services/brain/executiveUnderstanding/executiveUnderstandingTypes";
import { buildExecutiveStrategyFromUnderstanding } from "@/services/brain/executiveCoherence/executiveStrategyBuilder";
import { buildSampleExecutiveIntelligencePipeline } from "@/services/brain/executiveIntelligenceHelpers";
import { buildSampleExecutiveInitiativeSelection } from "@/services/brain/executiveInitiativeSelectionHelpers";
import { buildExecutiveCampaignNarrative } from "@/services/brain/executiveOutputReviewHelpers";
import type { GenerationBundle } from "@/services/brain/generationContracts/generationContractTypes";
import type { Discussion } from "@/services/discussionService";
import { PROSPECT_INTELLIGENCE_PLATFORM } from "@/services/prospects/prospectBridgeMarker";
import type { ProspectFixture } from "./fixtures";

const ORG_ID = "00000000-0000-4000-8000-0000000000b1";

export type AssembledFixtureContext = {
  organizationId: string;
  discussion: Discussion;
  analysis: Record<string, unknown>;
  opportunity: Record<string, unknown>;
  briefing: Record<string, unknown>;
  websiteIntelligence: Record<string, unknown>;
  bundle: GenerationBundle;
};

export function buildSyntheticContextFromFixture(
  fixture: ProspectFixture,
): AssembledFixtureContext {
  const discussionId = `00000000-0000-4000-8000-${fixture.slot.charCodeAt(1).toString(16).padStart(12, "0")}`;
  const ctx = fixture.context;

  const discussion: Discussion = {
    id: discussionId,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    organization_id: ORG_ID,
    community_id: null,
    user_id: null,
    platform: PROSPECT_INTELLIGENCE_PLATFORM,
    title: `${ctx.businessName} — synthetic prospect`,
    author: ctx.businessName,
    url: ctx.website,
    body: ctx.sourceBody,
    status: "new",
    priority: 0,
    opportunity_score: 0,
    sentiment: null,
    summary: ctx.summary,
    ai_notes: null,
    last_activity: null,
    raw_json: { synthetic: true, fixtureId: fixture.id },
  };

  const analysis: Record<string, unknown> = {
    id: `analysis-${fixture.id}`,
    summary: ctx.summary,
    pain_points: ctx.painPoints.join("; "),
    buyer_stage: ctx.buyerStage,
    intent: "Evaluate fit from synthetic fixture evidence only.",
    opportunity_score: 72,
  };

  const opportunity: Record<string, unknown> = {
    id: `opportunity-${fixture.id}`,
    title: `${ctx.businessName} outreach opportunity`,
    summary: ctx.summary,
    pain_points: ctx.painPoints.join("; "),
    buyer_stage: ctx.buyerStage,
  };

  const briefing: Record<string, unknown> = {
    id: `briefing-${fixture.id}`,
    summary: ctx.summary,
    pain_points: ctx.painPoints.join("; "),
    buyer_stage: ctx.buyerStage,
    recommended_response: "",
    cta: "",
  };

  const websiteIntelligence: Record<string, unknown> = {
    provider: fixture.evidenceRichness === "sparse" ? "homepage_v1" : "deep_v1",
    url: ctx.website,
    pages_analyzed: fixture.evidenceRichness === "sparse" ? 1 : 6,
    crawl_summary: ctx.websiteSummary,
    business_knowledge: ctx.businessKnowledge,
    pages: [
      {
        url: ctx.website,
        title: ctx.businessName,
        excerpt: ctx.websiteSummary,
      },
    ],
  };

  const understanding = {
    metadata: {
      generatedAt: "2026-01-01T00:00:00.000Z",
      organizationId: ORG_ID,
      discussionId,
      understandingVersion: EXECUTIVE_UNDERSTANDING_VERSION,
      reasoningVersion: "synthetic",
      memoryEnriched: false,
      learningEnriched: false,
      degradationMode: "full" as const,
      understandingFingerprint: `synthetic-${fixture.id}`,
    },
    executiveSummary: {
      headline: ctx.summary.slice(0, 80) || ctx.businessName,
      narrative: ctx.summary,
      primaryObjective: "Produce deployable outreach and content assets",
      discussionId,
      scope: "discussion" as const,
    },
    businessUnderstanding: {
      positioning: ctx.category,
      voice: ctx.aboutYou.slice(0, 120) || "Professional",
      expertise: ctx.expertise,
      website: ctx.website,
      homepageUnderstanding: ctx.websiteSummary,
      businessConstraints: [],
      knowledgeCompleteness: fixture.evidenceRichness === "sparse" ? 35 : 75,
      isBrainTrained: true,
      summary: ctx.aboutYou,
    },
    marketUnderstanding: {
      buyerStage: ctx.buyerStage,
      painPoints: ctx.painPoints,
      marketSignals: ctx.businessKnowledge.slice(0, 3),
      recurringTerminology: [ctx.industry, ctx.category].filter(Boolean),
      competitors: [],
      emergingThemes: [],
      discussionRelevance: "High",
      domainRelevance: ctx.industry,
      evidenceStrength: "moderate" as const,
      historicalEnrichmentAvailable: false,
    },
    strategicUnderstanding: {
      recommendedPositioning: ctx.category,
      recommendedDirection: "consultative" as const,
      secondaryDirection: null,
      recommendedExecutiveAction: "Personalized outreach",
      recommendedDeploymentDirection: "Multi-channel deployment assets",
      primaryExecutiveObjective: "Start a relevant conversation",
      rationale: ctx.painPoints.slice(0, 2),
    },
    opportunityUnderstanding: {
      businessOpportunity: ctx.businessName,
      businessAlignment: "high",
      executiveAlignment: "aligned",
      importance: "high_intent",
      supportingEvidence: [ctx.summary],
      historicalEvidence: [],
      historicalEvidenceAvailable: false,
    },
    riskUnderstanding: {
      overallRisk: "low" as const,
      signals: [],
      missingInformation:
        fixture.evidenceRichness === "sparse"
          ? ["Limited website evidence in fixture"]
          : [],
      sparseHistory: fixture.evidenceRichness === "sparse",
    },
    priorityUnderstanding: {
      level: "high_intent",
      rationale: ["Synthetic fixture for evaluation only"],
    },
    supportingEvidence: {
      entries: [
        {
          source: "current_discussion",
          label: "Fixture source body",
          detail: ctx.sourceBody.slice(0, 200),
          optional: false,
        },
      ],
      totalCount: 1,
      historicalCount: 0,
    },
    executiveIntelligence: buildSampleExecutiveIntelligencePipeline(),
    executiveInitiativeSelection: buildSampleExecutiveInitiativeSelection(),
  };

  const campaign = buildExecutiveCampaignNarrative(understanding as never);
  const strategy = buildExecutiveStrategyFromUnderstanding({
    organizationId: ORG_ID,
    executiveUnderstanding: {
      ...understanding,
      executiveCampaignNarrative: campaign,
    } as never,
  });

  const identity = {
    userId: null,
    greetingName: ctx.greetingName,
    aboutYou: ctx.aboutYou,
    expertise: ctx.expertise,
    website: ctx.website,
    brainStatus: "ready",
    masterProfile: null,
    masterProfileVersion: null,
    homepageLearning: ctx.websiteSummary,
  };

  const brainContext = {
    organization: {
      id: ORG_ID,
      name: ctx.organizationName,
      slug: "synthetic-breakthrough-eval",
    },
    scope: "discussion" as const,
    businessMemory: {
      identity,
      missingFields: [],
      isBrainTrained: true,
      completenessScore: 80,
    },
    identityMemory: {
      ...identity,
      missingFields: [],
    },
    domainMemory: {
      domains: [],
      totalDomains: 0,
      activeDomainCount: 0,
      focusDomainId: null,
    },
    discussionMemory: {
      recentDiscussions: [],
      recentAnalyzedDiscussions: [],
      highIntentDiscussions: [],
      monitoringDiscussions: [],
      recurringThemes: [],
      lifecycleDistribution: {},
      focus: {
        discussion,
        threadUpdates: [],
        latestAnalysis: null,
        priorAnalyses: [],
        linkedOpportunity: null,
        linkedBriefing: null,
        linkedBlueprint: null,
      },
    },
    opportunityMemory: {
      recentOpportunities: [],
      highPriorityOpportunities: [],
      focus: null,
    },
    briefingMemory: { recentBriefings: [], focus: null },
    blueprintMemory: { recentBlueprints: [], focus: null },
    knowledgeMemory: { assets: [], totalCount: 0 },
    feedbackMemory: { entries: [] },
    operationalMemory: {
      dashboardStats: null,
      todaysIntelligence: null,
    },
    communityIntelligenceMemory: { entries: [] },
    productionIntelligenceMemory: { entries: [] },
    executiveMemory: {
      episodic: [],
      semantic: [],
      procedural: [],
    },
    learningMemory: null,
    evidenceMemory: { entries: [] },
    reasoningMemory: null,
    warnings: ["synthetic_fixture_non_production"],
    snapshot: null,
    contextSummary: ctx.summary,
    builtAt: "2026-01-01T00:00:00.000Z",
  };

  const reasoningPipeline = {
    version: "synthetic_v1",
    organizationId: ORG_ID,
    discussionId,
    evidence: {
      statedPainPoints: ctx.painPoints,
      objections: [],
      explicitBuyerNeed: ctx.painPoints[0] ?? null,
      confidence: 0.7,
      quotes: [],
      signals: [],
    },
    memory: {
      priorWinningAngles: [],
      relevantDomainTerminology: [ctx.industry].filter(Boolean),
      hasMemory: false,
      existingPositioning: ctx.category,
    },
    reasoning: {
      highestLeverageMove: "Lead with a prospect-specific observation",
      strategicTension: ctx.painPoints[0] ?? "Unclear fit",
      businessImplication: "Personalized outreach required",
      confidence: 0.7,
      alternativesConsidered: [],
      risks: [],
    },
    decision: {
      decision: "pursue",
      recommendedAssetType: "deployment_assets",
      whyThisAsset: "Pilot evaluation of outreach package",
      primaryCta: "Start a conversation",
      intendedOutcome: "Book a discovery conversation",
      targetAudience: ctx.category,
      urgency: "normal",
      confidence: 0.7,
    },
  };

  const generationContract = {
    metadata: {
      generatedAt: "2026-01-01T00:00:00.000Z",
      organizationId: ORG_ID,
      workflowType: "deployment_asset" as const,
      contractVersion: "generation_contract_v1",
      reasoningVersion: null,
      memoryVersion: null,
      learningVersion: null,
      scope: "discussion" as const,
    },
    purpose: {
      workflowType: "deployment_asset" as const,
      summary: "Synthetic Breakthrough evaluation",
      audience: "Operator",
    },
    requiredSections: {
      sections: ["deployment_assets"],
      outputFormat: "structured_text" as const,
    },
    evidenceRequirements: {
      minimumEvidenceCount: 1,
      requireExecutiveReasoning: false,
      requireBusinessContext: true,
      requireMarketEvidence: false,
      requiredTerminology: [],
    },
    outputRequirements: {
      requiredFields: [],
      jsonOnly: false,
      noMarkdown: false,
    },
    qualityRequirements: {
      minimumCompletenessScore: 0,
      requireReasoningAttached: false,
      requireOrganizationMatch: false,
      mandatorySections: [],
    },
    toneRequirements: {
      voice: ctx.aboutYou.slice(0, 80) || null,
      positioning: ctx.category,
      recommendedDirection: "consultative",
      nonSalesy: true,
      noOverpromise: true,
    },
    forbiddenBehaviors: { behaviors: [] },
    validationRules: { rules: [], requiredChecks: [] },
  };

  const bundle = {
    brainContext,
    executiveReasoning: {
      metadata: {
        generatedAt: "2026-01-01T00:00:00.000Z",
        organizationId: ORG_ID,
        discussionId,
      },
      strategicAssessment: "Synthetic",
      businessAssessment: "Synthetic",
      marketAssessment: "Synthetic",
      opportunityAssessment: "Synthetic",
      priorityAssessment: "Synthetic",
      riskAssessment: "Synthetic",
      recommendedDirection: "consultative",
      executiveIntelligence: buildSampleExecutiveIntelligencePipeline(),
    },
    executiveUnderstanding: {
      ...understanding,
      executiveCampaignNarrative: campaign,
    },
    executiveStrategy: strategy,
    generationContract,
    reasoningPipeline,
  } as unknown as GenerationBundle;

  return {
    organizationId: ORG_ID,
    discussion,
    analysis,
    opportunity,
    briefing,
    websiteIntelligence,
    bundle,
  };
}
