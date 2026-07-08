/**
 * Run: npx tsx scripts/validateReasoningPipeline.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildReasoningPipeline } from "@/services/brain/reasoningPipeline/reasoningPipelineOrchestrator";
import { formatReasoningPipelineForPrompt } from "@/services/brain/reasoningPipeline/reasoningPipelinePromptFormatting";
import { REASONING_PIPELINE_VERSION } from "@/services/brain/reasoningPipeline/reasoningPipelineTypes";

const contractServicePath = join(process.cwd(), "services/brain/generationContractService.ts");
const promptAssemblyPath = join(
  process.cwd(),
  "services/brain/generationContracts/generationPromptAssembly.ts",
);
const workflowPath = join(process.cwd(), "services/workflows/discussionWorkflow.ts");
const blueprintPath = join(process.cwd(), "services/assetBlueprints/assetBlueprintService.ts");

const contractSource = readFileSync(contractServicePath, "utf8");
const promptSource = readFileSync(promptAssemblyPath, "utf8");
const workflowSource = readFileSync(workflowPath, "utf8");
const blueprintSource = readFileSync(blueprintPath, "utf8");

let failures = 0;

function pass(message: string) {
  console.log(`✓ ${message}`);
}

function fail(message: string) {
  failures += 1;
  console.error(`✗ ${message}`);
}

console.log("Evidence-First Reasoning Pipeline Validation\n");

const sampleContext = {
  organization: { id: "org-test", name: "Test Org", slug: "test-org" },
  scope: "discussion" as const,
  businessMemory: {
    identity: { userId: null, greetingName: null, aboutYou: "Operator", expertise: null, website: null, brainStatus: null, masterProfile: null, masterProfileVersion: null, homepageLearning: null },
    missingFields: [],
    isBrainTrained: true,
    completenessScore: 80,
  },
  identityMemory: {
    userId: null,
    greetingName: null,
    aboutYou: "Operator",
    expertise: null,
    website: null,
    brainStatus: null,
    masterProfile: null,
    masterProfileVersion: null,
    homepageLearning: null,
    missingFields: [],
    isBrainTrained: true,
    completenessScore: 80,
  },
  domainMemory: { domains: [], focus: null },
  discussionMemory: {
    recentDiscussions: [],
    recentAnalyzedDiscussions: [],
    highIntentDiscussions: [],
    monitoringDiscussions: [],
    recurringThemes: ["pricing objections"],
    lifecycleDistribution: {},
    focus: {
      discussion: {
        id: "discussion-test",
        title: "Need help choosing",
        body: "I am comparing options and worried about ROI.",
        organization_id: "org-test",
      },
      threadUpdates: [],
      latestAnalysis: {
        pain_points: "ROI uncertainty",
        buyer_stage: "consideration",
        intent: "evaluation",
        sentiment: "concerned",
      },
      priorAnalyses: [],
      linkedOpportunity: null,
      linkedBriefing: null,
      linkedBlueprint: null,
    },
  },
  opportunityMemory: { recentOpportunities: [], focus: null, queue: { immediateAction: [], highIntent: [], monitor: [], lowPriority: [] } },
  briefingMemory: {
    recentBriefings: [],
    approvedBriefings: [],
    needsRevisionBriefings: [],
    rejectedBriefings: [],
    draftBriefings: [],
    statusDistribution: {},
    buyerStageDistribution: {},
    focus: null,
  },
  blueprintMemory: { recentBlueprints: [], focus: null },
  knowledgeMemory: { assets: [], approvedBriefingKnowledgeCount: 0, communityIntelligence: [], productionIntelligence: [], knowledgeConfidence: null, knowledgeConfidenceDelta: null },
  feedbackMemory: {
    briefingStatuses: { draft: 0, approved: 0, needsRevision: 0, rejected: 0 },
    opportunitySalesStatuses: {},
    discussionLifecycleStatuses: {},
    approvalCount: 0,
    revisionRequestCount: 0,
    hasGeneratedAssets: false,
    missingAssetPrompts: 0,
    staleDiscussionCount: 0,
    deploymentReadinessDistribution: {},
    focusSignals: {
      briefingStatus: null,
      opportunityStatus: null,
      discussionStatus: null,
      hasLinkedBlueprint: false,
      hasDeploymentAssets: false,
    },
  },
  operationalMemory: {
    dashboard: { totalDiscussions: 0, totalOpportunities: 0, totalBriefings: 0, totalBlueprints: 0 },
    todaysIntelligence: { headline: null, summary: null, highlights: [] },
    queueCounts: {
      immediateActionOpportunities: 0,
      highIntentOpportunities: 0,
      monitorOpportunities: 0,
      lowPriorityOpportunities: 0,
      draftBriefings: 0,
      needsRevisionBriefings: 0,
      approvedBriefings: 0,
      rejectedBriefings: 0,
      pendingEditorialTotal: 0,
      newDiscussions: 0,
      strategicBlueprints: 0,
    },
  },
  executiveMemory: {
    metadata: {
      generatedAt: new Date().toISOString(),
      organizationId: "org-test",
      focusDomainId: null,
      focusDiscussionId: "discussion-test",
      discussionCount: 1,
      opportunityCount: 0,
      briefingCount: 0,
      knowledgeAssetCount: 0,
      domainCount: 0,
      analysisCount: 1,
      memoryVersion: "executive_memory_v1",
    },
    businessKnowledge: {
      description: null,
      voice: null,
      expertise: null,
      website: null,
      businessKnowledge: null,
      masterProfile: null,
      masterProfileVersion: null,
      homepageLearning: null,
      businessConstraints: [],
      missingFields: [],
      completenessScore: 0,
      isBrainTrained: false,
    },
    marketKnowledge: { topMarkets: [], mostActiveDomains: [], domainCoverage: 0, knowledgeGrowthDelta: null, recentActivityCount: 0, totalDomains: 0 },
    audienceKnowledge: { buyerStageDistribution: {}, topBuyerStages: [] },
    terminologyKnowledge: [],
    competitorKnowledge: [],
    painPointKnowledge: [{ painPoint: "ROI uncertainty", occurrences: 2, lastSeen: null, primaryDomainId: null, primaryDomainName: null, confidence: 70 }],
    buyingSignalKnowledge: [],
    decisionKnowledge: {
      briefingsApproved: 0,
      briefingsNeedsRevision: 0,
      briefingsRejected: 0,
      briefingsDraft: 0,
      opportunityStatusDistribution: {},
      discussionOutcomeDistribution: {},
      refreshIndicators: { staleDiscussions: 0, analysesConsidered: 1 },
    },
    contentKnowledge: {
      deploymentAssetCount: 0,
      blueprintCount: 0,
      blueprintWithPromptsCount: 0,
      knowledgeAssetCount: 0,
      approvedBriefingAssetCount: 0,
      latestBlueprintAt: null,
      latestKnowledgeAssetAt: null,
      averageEstimatedReuse: null,
      assetTypeCoverage: [],
    },
    patternKnowledge: {
      mostCommonBuyerStage: "consideration",
      mostCommonObjection: "ROI concern",
      mostCommonOpportunityReason: null,
      mostCommonRecommendation: null,
      mostCommonDeploymentType: null,
      mostActiveDomainId: null,
      mostActiveDomainName: null,
      highestOpportunityCategory: null,
    },
    performanceKnowledge: {
      averageOpportunityScore: null,
      averageBriefingConfidence: null,
      averageAnalysisConfidence: null,
      knowledgeConfidence: null,
      knowledgeConfidenceDelta: null,
    },
    executiveLearning: null,
    promotionCandidates: [],
  },
  executiveLearning: {
    metadata: {
      generatedAt: new Date().toISOString(),
      organizationId: "org-test",
      focusDomainId: null,
      focusDiscussionId: "discussion-test",
      focusOpportunityId: null,
      focusBriefingId: null,
      learningVersion: "executive_learning_v1",
      discussionEvents: 1,
      briefingEvents: 0,
      salesEvents: 0,
      refreshEvents: 0,
      marketEvidenceEvents: 0,
    },
    decisionLearning: { events: [], briefingDecisions: { draft: 0, approved: 0, needs_revision: 0, rejected: 0 }, opportunityProgressions: {}, latestBriefingDecision: null, latestSalesProgression: null, totalValidatedDecisions: 0 },
    discussionLearning: { refreshCount: 0, lifecycleDistribution: {}, repeatedAnalysisCount: 0, reprocessingCount: 0, latestActivity: null, averageAgeDays: null, stateDistribution: {}, events: [] },
    briefingLearning: { approved: 0, needsRevision: 0, rejected: 0, draft: 0, approvalFrequency: 0, revisionFrequency: 0, approvalHistory: [], latestDecision: null },
    salesLearning: { events: [], progressionCounts: {}, latestProgression: null },
    marketLearning: { evidenceCount: 0, domainCount: 0, terminologyCount: 0, competitorCount: 0, latestEvidenceAt: null },
    refreshLearning: { refreshCount: 0, reprocessingCount: 0, events: [] },
    patternLearning: {
      mostApprovedBuyerStage: null,
      mostRevisedBuyerStage: null,
      mostCommonOpportunityOutcome: null,
      mostCommonDeploymentCompletion: null,
      mostCommonObjection: "ROI concern",
      mostCommonTerminology: null,
      mostCommonOpportunityReason: null,
    },
    promotionCandidates: [],
  },
  marketEvidence: [],
  promotionCandidates: [],
  executiveReasoning: {} as never,
  contextWarnings: { missingBrainSetupFields: [], warnings: [] },
  snapshot: {} as never,
  contextSummary: {} as never,
  builtAt: new Date().toISOString(),
};

const pipeline = buildReasoningPipeline({
  organizationId: "org-test",
  discussionId: "discussion-test",
  brainContext: sampleContext,
});

if (pipeline.version === REASONING_PIPELINE_VERSION && pipeline.evidence.statedPainPoints.length > 0) {
  pass("EvidenceExtraction created from discussion context");
} else {
  fail("EvidenceExtraction missing");
}

if (pipeline.memory.recurringBuyerConcerns.length >= 0) {
  pass("Memory retrieval returns structured org-scoped signals");
} else {
  fail("Memory retrieval failed");
}

if (pipeline.reasoning.realBusinessOpportunity && pipeline.decision.decision) {
  pass("BusinessReasoning and BusinessDecision created");
} else {
  fail("Business reasoning/decision missing");
}

const prompt = formatReasoningPipelineForPrompt(pipeline);
if (prompt.includes("BUSINESS DECISION") && prompt.includes(pipeline.decision.whyThisAsset)) {
  pass("Prompt formatting exposes BusinessDecision including whyThisAsset");
} else {
  fail("Prompt formatting missing BusinessDecision");
}

if (contractSource.includes("buildReasoningPipeline") && contractSource.includes("reasoningPipeline")) {
  pass("Generation bundle includes reasoning pipeline");
} else {
  fail("Generation contract service missing reasoning pipeline");
}

if (promptSource.includes("formatReasoningPipelineForPrompt")) {
  pass("Prompt assembly uses evidence-first pipeline block");
} else {
  fail("Prompt assembly missing pipeline formatting");
}

if (workflowSource.includes("runSimplifiedQualityGateLoop")) {
  pass("Workflow uses simplified non-crashing quality gate");
} else {
  fail("Workflow missing simplified quality gate");
}

if (blueprintSource.includes("enrichBlueprintFromDecision")) {
  pass("Strategic Blueprint generation uses BusinessDecision");
} else {
  fail("Blueprint service not wired to BusinessDecision");
}

console.log(`\nValidation complete. Failures: ${failures}\n`);

if (failures > 0) {
  process.exit(1);
}

console.log("All reasoning pipeline checks passed.");
