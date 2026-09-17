/**
 * Server boundary for Free Traction generation / cost actions.
 * Loads existing plan + Define + Traction authority. Does not generate.
 */

import { cache } from "react";
import { deriveDefineState, type DefineKind } from "@/lib/home/homeDomainState";
import {
  assertFreeTractionGenerationAllowed,
  type FreeTractionGenerationInput,
} from "@/lib/organization/freeTractionGeneration";
import { loadHomeDefineResult } from "@/services/home/homeReadService";
import {
  loadFreeTractionAuthority,
  type FreeTractionAuthority,
} from "@/services/organization/freeTractionAuthority";
import {
  requireCurrentOrganizationContext,
  resolveAthenaPlan,
} from "@/services/organizationService";
import type { AthenaPlan } from "@/services/athenaPlan";

export type FreeTractionGenerationContext = {
  organizationId: string;
  userId: string;
  athenaPlan: AthenaPlan;
  defineKind: DefineKind;
  traction: FreeTractionAuthority;
};

export const loadFreeTractionGenerationContext = cache(
  async (): Promise<FreeTractionGenerationContext> => {
    const { organizationId, userId } = await requireCurrentOrganizationContext();
    const [athenaPlan, defineResult] = await Promise.all([
      resolveAthenaPlan(organizationId),
      loadHomeDefineResult(organizationId, userId),
    ]);

    const traction =
      athenaPlan === "free"
        ? await loadFreeTractionAuthority(organizationId)
        : {
            status: "available" as const,
            campaignId: null,
            reservedAt: null,
            reservationToken: null,
          };

    return {
      organizationId,
      userId,
      athenaPlan,
      defineKind: deriveDefineState(defineResult).kind,
      traction,
    };
  },
);

export async function assertCurrentFreeTractionGeneration(input?: {
  action?: FreeTractionGenerationInput["action"];
  campaignId?: string | null;
}): Promise<FreeTractionGenerationContext> {
  const context = await loadFreeTractionGenerationContext();
  const policyInput: FreeTractionGenerationInput = {
    athenaPlan: context.athenaPlan,
    defineKind: context.defineKind,
    tractionStatus: context.traction.status,
    action: input?.action ?? "create",
    campaignId: input?.campaignId ?? null,
    boundCampaignId: context.traction.campaignId,
  };
  assertFreeTractionGenerationAllowed(policyInput);
  return context;
}
