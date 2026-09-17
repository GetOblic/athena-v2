/**
 * Narrow Free first-session Home gate.
 * Answers one question: should Home render the welcome surface?
 *
 * Authority is the existing Define readiness kind from deriveDefineState.
 * needs_setup means Athena is untrained / needs initial Identity setup.
 * This is not an entitlement, onboarding flag, or pipeline-emptiness check.
 */

import type { DefineKind } from "@/lib/home/homeDomainState";
import { isFreeUntrained } from "@/lib/organization/freeUntrained";
import type { AthenaPlan } from "@/services/athenaPlan";

export type FreeFirstSessionHomeInput = {
  athenaPlan: AthenaPlan;
  defineKind: DefineKind;
};

export function shouldShowFreeFirstSessionHome(
  input: FreeFirstSessionHomeInput,
): boolean {
  return isFreeUntrained(input);
}
