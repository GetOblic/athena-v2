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

/** Legacy prompt-scoped identity context used by existing generation workflows. */
export type PromptIdentityContext = {
  userId: string | null;
  organizationId: string | null;
  identity: {
    about_you: string | null;
    expertise: string | null;
    website: string | null;
    master_profile: Record<string, unknown> | null;
  } | null;
};

export function getEmptyAthenaBrainContext(): PromptIdentityContext {
  return {
    userId: null,
    organizationId: null,
    identity: null,
  };
}

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

export function formatBrainContextForPrompt(context: PromptIdentityContext): string {
  if (!context.identity) {
    return `
ATHENA BRAIN CONTEXT:
No Athena Identity profile has been configured yet.

Use the discussion context only. Do not invent a user persona, brand voice, methodology, offers, resources, lead magnets, or expertise.
`.trim();
  }

  return `
ATHENA BRAIN CONTEXT:

USER ID:
${context.userId || "Not available."}

ABOUT THE USER:
${context.identity.about_you || "Not provided."}

USER EXPERTISE:
${context.identity.expertise || "Not provided."}

USER WEBSITE:
${context.identity.website || "Not provided."}

MASTER IDENTITY PROFILE:
${JSON.stringify(context.identity.master_profile ?? {}, null, 2)}

INSTRUCTIONS:
Use this identity context as the user's voice, expertise, methodology, terminology, rules, positioning, and CTA style.

Do not contradict it.
Do not invent credentials, guarantees, income promises, or unsupported claims.
Strategic asset recommendations are allowed, but phrase them as recommended/suggested assets unless the asset is explicitly present in the user's identity, website, documents, or existing resources.
If the identity says to educate before selling, follow that principle.
If the identity contains professional terminology or methodology, use it naturally.
`.trim();
}
