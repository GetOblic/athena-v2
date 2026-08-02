import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveOrganizationIdForUser } from "@/services/organizationService";
import { getAthenaIdentityByUserId } from "@/services/identity/identityService";

export {
  assertOrganizationId,
  BrainContextNotFoundError,
  BrainContextOrganizationRequiredError,
  buildBrainContextForBriefing,
  buildBrainContextForDiscussion,
  buildBrainContextForOpportunity,
  buildBrainContextForOrganization,
} from "@/services/brain/brainContextBuilder";

export { buildBrainContext } from "@/services/brain/executiveContextBuilder";

export { buildBrainSnapshot } from "@/services/brain/brainSnapshot";

export {
  buildExecutiveMemory,
  getExecutiveMemory,
  clearExecutiveMemoryCache,
} from "@/services/brain/executiveMemoryService";

export {
  buildExecutiveLearning,
  getExecutiveLearning,
  clearExecutiveLearningCache,
} from "@/services/brain/executiveLearningService";

export {
  buildExecutiveReasoning,
  getExecutiveReasoning,
  clearExecutiveReasoningCache,
  buildDiscussionAnalysisBrainPrompt,
} from "@/services/brain/executiveReasoningService";

export {
  buildGenerationContract,
  resolveGenerationBundle,
  resolveValidatedGenerationBundle,
  resolveExecutiveUnderstandingBundle,
  getExecutiveUnderstanding,
  clearGenerationContractCache,
  clearGenerationPipelineCache,
  clearExecutiveUnderstandingCache,
  validateGenerationContract,
  validateSharedExecutiveUnderstanding,
  assembleDiscussionAnalysisPrompt,
  assembleExecutiveBriefingPrompt,
  assembleOpportunityReviewPrompt,
  assembleStrategicBlueprintPrompt,
  assembleExecutiveGenerationContextBlock,
  formatExecutiveUnderstandingForPrompt,
  buildExecutiveStrategy,
  formatExecutiveStrategyForPrompt,
  formatOutputResponsibilityForPrompt,
  validateOutputDiversity,
  validateExecutiveOutputCoherence,
  validateSharedExecutiveStrategy,
} from "@/services/brain/generationContractService";

export type {
  GenerationContract,
  GenerationBundle,
  GenerationWorkflowType,
} from "@/services/brain/generationContractService";

export type {
  ExecutiveUnderstanding,
  ExecutiveUnderstandingBundle,
} from "@/services/brain/executiveUnderstandingService";

export type { ExecutiveStrategy } from "@/services/brain/executiveCoherenceService";

export type {
  ExecutiveLearningSummary,
  BuildExecutiveLearningParams,
  MarketEvidenceEntry,
  PromotionCandidate,
} from "@/services/brain/executiveLearningTypes";

export type {
  ExecutiveReasoning,
  BuildExecutiveReasoningParams,
  PriorityAssessment,
  RecommendedDirectionKey,
} from "@/services/brain/executiveReasoningTypes";

export {
  MAX_BLUEPRINTS_CONTEXT,
  MAX_BRIEFINGS_CONTEXT,
  MAX_DISCUSSIONS_CONTEXT,
  MAX_DOMAINS_CONTEXT,
  MAX_KNOWLEDGE_CONTEXT,
  MAX_OPPORTUNITIES_CONTEXT,
  BRAIN_CONTEXT_LIMITS,
} from "@/services/brain/brainContextTypes";

export type {
  AthenaBrainContext,
  BrainEngineContext,
  BrainContextScope,
  BrainSnapshot,
  BlueprintMemory,
  BuildBrainContextParams,
  BusinessMemory,
  ContextWarnings,
  DomainMemory,
  DiscussionMemory,
  FeedbackMemory,
  IdentityMemory,
  KnowledgeMemory,
  OperationalMemory,
  OpportunityMemory,
  BriefingMemory,
  AssetMemory,
  FeedbackSignals,
  ContextSummary,
  BuildBrainContextForDiscussionParams,
  BuildBrainContextForOpportunityParams,
  BuildBrainContextForBriefingParams,
} from "@/services/brain/brainContextTypes";

export type {
  ExecutiveMemory,
  BuildExecutiveMemoryParams,
  MemoryMetadata,
} from "@/services/brain/executiveMemoryTypes";

export {
  formatBrainContextForPrompt,
  getEmptyAthenaBrainContext,
  type PromptIdentityContext,
} from "@/services/brain/formatBrainContextForPrompt";

import {
  getEmptyAthenaBrainContext,
  type PromptIdentityContext,
} from "@/services/brain/formatBrainContextForPrompt";

export async function getAthenaBrainContextForUserId(
  userId: string | null | undefined,
  organizationId: string,
): Promise<PromptIdentityContext> {
  if (!userId) {
    return getEmptyAthenaBrainContext();
  }

  const identity = await getAthenaIdentityByUserId(userId, organizationId);

  return {
    userId,
    organizationId,
    identity: identity
      ? {
          about_you: identity.about_you,
          expertise: identity.expertise,
          website: identity.website,
          master_profile: identity.master_profile,
        }
      : null,
  };
}

export async function getAthenaBrainContextForCurrentUser(): Promise<PromptIdentityContext> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return getEmptyAthenaBrainContext();
  }

  const organizationId = await resolveOrganizationIdForUser(
    user.id,
    user.email,
  );

  return getAthenaBrainContextForUserId(user.id, organizationId);
}
