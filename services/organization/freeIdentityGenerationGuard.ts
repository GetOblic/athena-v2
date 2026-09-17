/**
 * Server boundary for Free Identity generation / cost actions.
 * Loads existing plan + Identity Brain state. Does not compile or scrape.
 */

import { cache } from "react";
import {
  assertFreeIdentityGenerationAllowed,
  isIdentityBrainObtained,
  type FreeIdentityGenerationInput,
} from "@/lib/organization/freeIdentityGeneration";
import { getAthenaIdentityByUserId } from "@/services/identity/identityService";
import {
  requireCurrentOrganizationContext,
  resolveAthenaPlan,
} from "@/services/organizationService";
import type { AthenaPlan } from "@/services/athenaPlan";

export type FreeIdentityGenerationContext = {
  organizationId: string;
  userId: string;
  athenaPlan: AthenaPlan;
  trained: boolean;
};

export const loadFreeIdentityGenerationContext = cache(
  async (): Promise<FreeIdentityGenerationContext> => {
    const { organizationId, userId } = await requireCurrentOrganizationContext();
    const [athenaPlan, identity] = await Promise.all([
      resolveAthenaPlan(organizationId),
      getAthenaIdentityByUserId(userId, organizationId),
    ]);

    return {
      organizationId,
      userId,
      athenaPlan,
      trained: isIdentityBrainObtained(identity),
    };
  },
);

export async function assertCurrentFreeIdentityGeneration(): Promise<FreeIdentityGenerationContext> {
  const context = await loadFreeIdentityGenerationContext();
  const policyInput: FreeIdentityGenerationInput = {
    athenaPlan: context.athenaPlan,
    trained: context.trained,
  };
  assertFreeIdentityGenerationAllowed(policyInput);
  return context;
}
