/**
 * Server boundary for Free Audience generation / persist actions.
 * Loads existing plan + Define + Audience authority. Does not generate.
 */

import { cache } from "react";
import { deriveDefineState, type DefineKind } from "@/lib/home/homeDomainState";
import {
  assertFreeAudienceGenerationAllowed,
  type FreeAudienceGenerationAction,
  type FreeAudienceGenerationInput,
} from "@/lib/organization/freeAudienceGeneration";
import { loadHomeDefineResult } from "@/services/home/homeReadService";
import {
  loadFreeAudienceAuthority,
  type FreeAudienceAuthority,
} from "@/services/organization/freeAudienceAuthority";
import {
  requireCurrentOrganizationContext,
  resolveAthenaPlan,
} from "@/services/organizationService";
import type { AthenaPlan } from "@/services/athenaPlan";

export type FreeAudienceGenerationContext = {
  organizationId: string;
  userId: string;
  athenaPlan: AthenaPlan;
  defineKind: DefineKind;
  audience: FreeAudienceAuthority;
};

const EMPTY_AUDIENCE_AUTHORITY: FreeAudienceAuthority = {
  status: "available",
  personaId: null,
  reservedAt: null,
  reservationToken: null,
};

export const loadFreeAudienceGenerationContext = cache(
  async (): Promise<FreeAudienceGenerationContext> => {
    const { organizationId, userId } = await requireCurrentOrganizationContext();
    const [athenaPlan, defineResult] = await Promise.all([
      resolveAthenaPlan(organizationId),
      loadHomeDefineResult(organizationId, userId),
    ]);

    const audience =
      athenaPlan === "free"
        ? await loadFreeAudienceAuthority(organizationId)
        : EMPTY_AUDIENCE_AUTHORITY;

    return {
      organizationId,
      userId,
      athenaPlan,
      defineKind: deriveDefineState(defineResult).kind,
      audience,
    };
  },
);

export async function assertCurrentFreeAudienceGeneration(input?: {
  action?: FreeAudienceGenerationAction;
}): Promise<FreeAudienceGenerationContext> {
  const context = await loadFreeAudienceGenerationContext();
  const policyInput: FreeAudienceGenerationInput = {
    athenaPlan: context.athenaPlan,
    defineKind: context.defineKind,
    audienceStatus: context.audience.status,
    action: input?.action ?? "persist",
  };
  assertFreeAudienceGenerationAllowed(policyInput);
  return context;
}
