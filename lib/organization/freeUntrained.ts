/**
 * Shared Free + untrained product-state contract.
 *
 * Authority is the existing organization plan plus Define readiness kind
 * from deriveDefineState. This is a first-session readiness prerequisite,
 * not an entitlement, paid lock, or onboarding flag.
 */

import { IDENTITY_TEACH_ATHENA_HREF } from "@/components/identity/identityPagePresentation";
import type { DefineKind } from "@/lib/home/homeDomainState";
import type { AthenaPlan } from "@/services/athenaPlan";

export type FreeUntrainedInput = {
  athenaPlan?: AthenaPlan | null;
  defineKind?: DefineKind | null;
};

export const FREE_UNTRAINED_LOCKED_NAV_KEYS = [
  "buildVisibility",
  "generateTraction",
  "convertOpportunities",
] as const;

export type FreeUntrainedLockedNavKey =
  (typeof FREE_UNTRAINED_LOCKED_NAV_KEYS)[number];

export const FREE_UNTRAINED_TEACH_HREF = IDENTITY_TEACH_ATHENA_HREF;

export type FreeUntrainedLockedNavCopy = {
  subtitle: string;
  actionLabel: string;
  explanations: Record<FreeUntrainedLockedNavKey, string>;
};

export type FreeUntrainedLockedNavFields = {
  lockedHeading?: string;
  lockedExplanation?: string;
  lockedActionLabel?: string;
  lockedActionHref?: string;
};

export function isFreeUntrained(input: FreeUntrainedInput): boolean {
  return input.athenaPlan === "free" && input.defineKind === "needs_setup";
}

export function applyFreeUntrainedNavPresentation<
  T extends {
    key: string;
    href?: string;
    disabled?: boolean;
    subtitle?: string;
  } & FreeUntrainedLockedNavFields,
>(
  items: readonly T[],
  input: FreeUntrainedInput,
  copy: FreeUntrainedLockedNavCopy,
): T[] {
  if (!isFreeUntrained(input)) {
    return items.slice();
  }

  const locked = new Set<string>(FREE_UNTRAINED_LOCKED_NAV_KEYS);
  return items.map((item) => {
    if (!locked.has(item.key)) {
      return item;
    }

    const key = item.key as FreeUntrainedLockedNavKey;
    return {
      ...item,
      href: undefined,
      disabled: true,
      subtitle: copy.subtitle,
      lockedHeading: copy.subtitle,
      lockedExplanation: copy.explanations[key],
      lockedActionLabel: copy.actionLabel,
      lockedActionHref: FREE_UNTRAINED_TEACH_HREF,
    };
  });
}

export function freeUntrainedLockedNavCopy(nav: {
  teachAthenaFirst: string;
  teachAthenaAction: string;
  buildVisibilityTeachAthena: string;
  generateTractionTeachAthena: string;
  convertOpportunitiesTeachAthena: string;
}): FreeUntrainedLockedNavCopy {
  return {
    subtitle: nav.teachAthenaFirst,
    actionLabel: nav.teachAthenaAction,
    explanations: {
      buildVisibility: nav.buildVisibilityTeachAthena,
      generateTraction: nav.generateTractionTeachAthena,
      convertOpportunities: nav.convertOpportunitiesTeachAthena,
    },
  };
}
