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
  BRAIN_CONTEXT_LIMITS,
} from "@/services/brain/brainContextBuilder";

export type {
  BrainEngineContext,
  BrainContextScope,
  BusinessMemory,
  DomainMemory,
  DiscussionMemory,
  OpportunityMemory,
  BriefingMemory,
  AssetMemory,
  KnowledgeMemory,
  FeedbackSignals,
  ContextSummary,
  BuildBrainContextForDiscussionParams,
  BuildBrainContextForOpportunityParams,
  BuildBrainContextForBriefingParams,
} from "@/services/brain/brainContextTypes";

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

/** @deprecated Use PromptIdentityContext for legacy prompt formatting. */
export type AthenaBrainContext = PromptIdentityContext;

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
