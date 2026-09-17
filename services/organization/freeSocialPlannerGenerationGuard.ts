/**
 * Server boundary for Free Social Planner generation / cost actions.
 * Loads existing plan + Define + starter authority. Does not generate.
 */

import { cache } from "react";
import { deriveDefineState, type DefineKind } from "@/lib/home/homeDomainState";
import {
  assertFreeSocialPlannerGenerationAllowed,
  type FreeSocialPlannerGenerationInput,
} from "@/lib/organization/freeSocialPlannerGeneration";
import { loadHomeDefineResult } from "@/services/home/homeReadService";
import {
  loadFreeStarterAuthority,
  type FreeStarterAuthority,
} from "@/services/organization/freeStarterAuthority";
import {
  requireCurrentOrganizationContext,
  resolveAthenaPlan,
} from "@/services/organizationService";
import type { AthenaPlan } from "@/services/athenaPlan";

export type FreeSocialPlannerGenerationContext = {
  organizationId: string;
  userId: string;
  athenaPlan: AthenaPlan;
  defineKind: DefineKind;
  starter: FreeStarterAuthority;
};

export const loadFreeSocialPlannerGenerationContext = cache(
  async (): Promise<FreeSocialPlannerGenerationContext> => {
    const { organizationId, userId } = await requireCurrentOrganizationContext();
    const [athenaPlan, defineResult, starter] = await Promise.all([
      resolveAthenaPlan(organizationId),
      loadHomeDefineResult(organizationId, userId),
      loadFreeStarterAuthority(organizationId),
    ]);

    return {
      organizationId,
      userId,
      athenaPlan,
      defineKind: deriveDefineState(defineResult).kind,
      starter,
    };
  },
);

export async function assertCurrentFreeSocialPlannerGeneration(input?: {
  authorizedStarter?: boolean;
}): Promise<FreeSocialPlannerGenerationContext> {
  const context = await loadFreeSocialPlannerGenerationContext();
  const policyInput: FreeSocialPlannerGenerationInput = {
    athenaPlan: context.athenaPlan,
    defineKind: context.defineKind,
    starterStatus: context.starter.status,
    authorizedStarter: input?.authorizedStarter === true,
  };
  assertFreeSocialPlannerGenerationAllowed(policyInput);
  return context;
}
