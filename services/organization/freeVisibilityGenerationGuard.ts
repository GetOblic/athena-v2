/**
 * Server boundary for Free Visibility generation / cost actions.
 * Loads existing plan + Define + Visibility authority. Does not generate.
 */

import { cache } from "react";
import { deriveDefineState, type DefineKind } from "@/lib/home/homeDomainState";
import {
  assertFreeVisibilityGenerationAllowed,
  type FreeVisibilityGenerationInput,
} from "@/lib/organization/freeVisibilityGeneration";
import { loadHomeDefineResult } from "@/services/home/homeReadService";
import {
  loadFreeVisibilityAuthority,
  type FreeVisibilityAuthority,
} from "@/services/organization/freeVisibilityAuthority";
import {
  requireCurrentOrganizationContext,
  resolveAthenaPlan,
} from "@/services/organizationService";
import type { AthenaPlan } from "@/services/athenaPlan";
import type { SeoGenerationType } from "@/services/seo/seoGenerationType";

export type FreeVisibilityGenerationContext = {
  organizationId: string;
  userId: string;
  athenaPlan: AthenaPlan;
  defineKind: DefineKind;
  visibility: FreeVisibilityAuthority;
};

export const loadFreeVisibilityGenerationContext = cache(
  async (): Promise<FreeVisibilityGenerationContext> => {
    const { organizationId, userId } = await requireCurrentOrganizationContext();
    const [athenaPlan, defineResult] = await Promise.all([
      resolveAthenaPlan(organizationId),
      loadHomeDefineResult(organizationId, userId),
    ]);

    const visibility =
      athenaPlan === "free"
        ? await loadFreeVisibilityAuthority(organizationId)
        : {
            status: "available" as const,
            reportId: null,
            reservedAt: null,
            reservationToken: null,
          };

    return {
      organizationId,
      userId,
      athenaPlan,
      defineKind: deriveDefineState(defineResult).kind,
      visibility,
    };
  },
);

export async function assertCurrentFreeVisibilityGeneration(input?: {
  action?: FreeVisibilityGenerationInput["action"];
  generationType?: SeoGenerationType | null;
  reportId?: string | null;
}): Promise<FreeVisibilityGenerationContext> {
  const context = await loadFreeVisibilityGenerationContext();
  const policyInput: FreeVisibilityGenerationInput = {
    athenaPlan: context.athenaPlan,
    defineKind: context.defineKind,
    visibilityStatus: context.visibility.status,
    generationType: input?.generationType ?? null,
    action: input?.action ?? "create",
    reportId: input?.reportId ?? null,
    boundReportId: context.visibility.reportId,
  };
  assertFreeVisibilityGenerationAllowed(policyInput);
  return context;
}
