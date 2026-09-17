/**
 * Server-owned Free first-session progression state.
 * Reuses existing plan + Define reads. Not authorization. Not middleware.
 */

import { cache } from "react";
import { redirect } from "next/navigation";
import { deriveDefineState, type DefineKind } from "@/lib/home/homeDomainState";
import { isFreeUntrained } from "@/lib/organization/freeUntrained";
import { loadHomeDefineResult } from "@/services/home/homeReadService";
import {
  requireCurrentOrganizationContext,
  resolveAthenaPlan,
} from "@/services/organizationService";
import type { AthenaPlan } from "@/services/athenaPlan";

export type FreeProgressionState = {
  athenaPlan: AthenaPlan;
  defineKind: DefineKind;
};

export const loadFreeProgressionState = cache(
  async (): Promise<FreeProgressionState> => {
    const { organizationId, userId } = await requireCurrentOrganizationContext();
    const [athenaPlan, defineResult] = await Promise.all([
      resolveAthenaPlan(organizationId),
      loadHomeDefineResult(organizationId, userId),
    ]);

    return {
      athenaPlan,
      defineKind: deriveDefineState(defineResult).kind,
    };
  },
);

export async function redirectIfFreeUntrainedGrowthRoute(): Promise<void> {
  const state = await loadFreeProgressionState();
  if (isFreeUntrained(state)) {
    redirect("/identity");
  }
}
