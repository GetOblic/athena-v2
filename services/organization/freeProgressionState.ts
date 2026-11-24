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

/**
 * Organization plan for Monitor navigation when a page did not receive one.
 * Define readiness is intentionally not loaded: it does not unlock Monitor,
 * and it must not change other navigation locks on older pages.
 * Callers that already hold an authoritative plan should pass that plan through
 * and skip this read.
 */
export const loadAuthoritativeAthenaPlan = cache(async (): Promise<AthenaPlan> => {
  const { organizationId } = await requireCurrentOrganizationContext();
  return resolveAthenaPlan(organizationId);
});

export async function redirectIfFreeUntrainedGrowthRoute(): Promise<void> {
  const state = await loadFreeProgressionState();
  if (isFreeUntrained(state)) {
    redirect("/identity");
  }
}
