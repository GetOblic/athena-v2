/**
 * Server boundary for Free Convert Opportunities generation / cost actions.
 * Loads existing plan + Define + Convert authority. Does not generate.
 */

import { cache } from "react";
import { deriveDefineState, type DefineKind } from "@/lib/home/homeDomainState";
import {
  assertFreeConvertGenerationAllowed,
  type FreeConvertGenerationAction,
  type FreeConvertGenerationInput,
} from "@/lib/organization/freeConvertGeneration";
import { isProspectIntelligenceBridge } from "@/services/prospects/prospectBridgeMarker";
import { loadHomeDefineResult } from "@/services/home/homeReadService";
import {
  loadFreeConvertAuthority,
  type FreeConvertAuthority,
} from "@/services/organization/freeConvertAuthority";
import {
  requireCurrentOrganizationContext,
  resolveAthenaPlan,
} from "@/services/organizationService";
import { getDiscussionById } from "@/services/discussionService";
import { getProspectByLinkedDiscussionId } from "@/services/prospects/prospectService";
import { normalizeWebsiteUrl } from "@/services/prospects/prospectUtils";
import type { AthenaPlan } from "@/services/athenaPlan";

export type FreeConvertGenerationContext = {
  organizationId: string;
  userId: string;
  athenaPlan: AthenaPlan;
  defineKind: DefineKind;
  convert: FreeConvertAuthority;
};

const EMPTY_CONVERT_AUTHORITY: FreeConvertAuthority = {
  status: "available",
  prospectId: null,
  reservedAt: null,
  reservationToken: null,
};

export const loadFreeConvertGenerationContext = cache(
  async (): Promise<FreeConvertGenerationContext> => {
    const { organizationId, userId } = await requireCurrentOrganizationContext();
    const [athenaPlan, defineResult] = await Promise.all([
      resolveAthenaPlan(organizationId),
      loadHomeDefineResult(organizationId, userId),
    ]);

    const convert =
      athenaPlan === "free"
        ? await loadFreeConvertAuthority(organizationId)
        : EMPTY_CONVERT_AUTHORITY;

    return {
      organizationId,
      userId,
      athenaPlan,
      defineKind: deriveDefineState(defineResult).kind,
      convert,
    };
  },
);

export async function assertCurrentFreeConvertGeneration(input?: {
  action?: FreeConvertGenerationAction;
  prospectId?: string | null;
  hasWebsite?: boolean | null;
}): Promise<FreeConvertGenerationContext> {
  const context = await loadFreeConvertGenerationContext();
  const policyInput: FreeConvertGenerationInput = {
    athenaPlan: context.athenaPlan,
    defineKind: context.defineKind,
    convertStatus: context.convert.status,
    action: input?.action ?? "create",
    prospectId: input?.prospectId ?? null,
    boundProspectId: context.convert.prospectId,
    hasWebsite: input?.hasWebsite,
  };
  assertFreeConvertGenerationAllowed(policyInput);
  return context;
}

/**
 * Defense-in-depth for prospect_intelligence discussion enqueue.
 * Unrelated discussion platforms are unchanged. Does not use request
 * session so worker/shared enqueue stays request-agnostic.
 */
export async function assertCurrentProspectIntelligenceDiscussion(input: {
  discussionId: string;
  action: FreeConvertGenerationAction;
}): Promise<void> {
  const context = await loadFreeConvertGenerationContext();
  if (context.athenaPlan !== "free") {
    return;
  }

  const discussion = await getDiscussionById(
    input.discussionId,
    context.organizationId,
  );
  if (!isProspectIntelligenceBridge(discussion)) {
    return;
  }

  const prospect = await getProspectByLinkedDiscussionId(
    input.discussionId,
    context.organizationId,
  );
  assertFreeConvertGenerationAllowed({
    athenaPlan: context.athenaPlan,
    defineKind: context.defineKind,
    convertStatus: context.convert.status,
    action: input.action,
    prospectId: prospect?.id ?? null,
    boundProspectId: context.convert.prospectId,
    hasWebsite: prospect
      ? Boolean(normalizeWebsiteUrl(prospect.website))
      : false,
  });
}

export async function assertProspectIntelligenceFreeConvertEnqueue(input: {
  organizationId: string;
  discussionId: string;
  triggerType?: string | null;
}): Promise<void> {
  const discussion = await getDiscussionById(
    input.discussionId,
    input.organizationId,
  );
  if (!isProspectIntelligenceBridge(discussion)) {
    return;
  }

  const athenaPlan = await resolveAthenaPlan(input.organizationId);
  if (athenaPlan !== "free") {
    return;
  }

  const [convert, defineResult, prospect] = await Promise.all([
    loadFreeConvertAuthority(input.organizationId),
    loadHomeDefineResult(input.organizationId, discussion?.user_id ?? ""),
    getProspectByLinkedDiscussionId(input.discussionId, input.organizationId),
  ]);

  const action: FreeConvertGenerationAction =
    input.triggerType === "discussion_update" ||
    input.triggerType === "prospect_deep_scrape"
      ? "regenerate"
      : "generate";

  assertFreeConvertGenerationAllowed({
    athenaPlan,
    defineKind: deriveDefineState(defineResult).kind,
    convertStatus: convert.status,
    action,
    prospectId: prospect?.id ?? null,
    boundProspectId: convert.prospectId,
    hasWebsite: prospect
      ? Boolean(normalizeWebsiteUrl(prospect.website))
      : false,
  });
}
