/**
 * Server boundary for Free Audience post-creation intelligence containment.
 * Loads existing plan + Audience authority. Does not generate.
 */

import {
  assertFreeAudienceIntelligenceAllowed,
  type FreeAudienceIntelligenceAction,
} from "@/lib/organization/freeAudienceIntelligence";
import { getDiscussionById } from "@/services/discussionService";
import {
  loadFreeAudienceGenerationContext,
  type FreeAudienceGenerationContext,
} from "@/services/organization/freeAudienceGenerationGuard";
import { loadFreeAudienceAuthority } from "@/services/organization/freeAudienceAuthority";
import { resolveAthenaPlan } from "@/services/organizationService";
import { isPersonaIntelligenceBridge } from "@/services/personas/personaBridgeMarker";

export async function assertCurrentFreeAudienceIntelligence(input: {
  action: FreeAudienceIntelligenceAction;
}): Promise<FreeAudienceGenerationContext> {
  const context = await loadFreeAudienceGenerationContext();
  assertFreeAudienceIntelligenceAllowed({
    athenaPlan: context.athenaPlan,
    audienceStatus: context.audience.status,
    action: input.action,
  });
  return context;
}

/**
 * Request-agnostic service / worker entry. Unrelated discussions unchanged.
 */
export async function assertPersonaIntelligenceFreeAudienceEnqueue(input: {
  organizationId: string;
  discussionId: string;
  triggerType?: string | null;
}): Promise<void> {
  const discussion = await getDiscussionById(
    input.discussionId,
    input.organizationId,
  );
  if (!isPersonaIntelligenceBridge(discussion)) {
    return;
  }

  const athenaPlan = await resolveAthenaPlan(input.organizationId);
  if (athenaPlan !== "free") {
    return;
  }

  const audience = await loadFreeAudienceAuthority(input.organizationId);
  const action: FreeAudienceIntelligenceAction =
    input.triggerType === "discussion_import" ? "generate" : "refresh";

  assertFreeAudienceIntelligenceAllowed({
    athenaPlan,
    audienceStatus: audience.status,
    action,
  });
}

export async function assertFreeAudienceIntelligenceForOrganization(input: {
  organizationId: string;
  action: FreeAudienceIntelligenceAction;
}): Promise<void> {
  const athenaPlan = await resolveAthenaPlan(input.organizationId);
  if (athenaPlan !== "free") {
    return;
  }

  const audience = await loadFreeAudienceAuthority(input.organizationId);
  assertFreeAudienceIntelligenceAllowed({
    athenaPlan,
    audienceStatus: audience.status,
    action: input.action,
  });
}

export async function assertCurrentPersonaIntelligenceDiscussion(input: {
  discussionId: string;
  action: FreeAudienceIntelligenceAction;
}): Promise<void> {
  const context = await loadFreeAudienceGenerationContext();
  if (context.athenaPlan !== "free") {
    return;
  }

  const discussion = await getDiscussionById(
    input.discussionId,
    context.organizationId,
  );
  if (!isPersonaIntelligenceBridge(discussion)) {
    return;
  }

  assertFreeAudienceIntelligenceAllowed({
    athenaPlan: context.athenaPlan,
    audienceStatus: context.audience.status,
    action: input.action,
  });
}
