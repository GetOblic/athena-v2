/**
 * Monitor is locked for every Free account.
 * Define readiness does not unlock it. Full Athena keeps the normal link.
 * The lock uses the existing Full Athena heading, not the Teach Athena prerequisite.
 */

import type { FreeUntrainedLockedNavFields } from "@/lib/organization/freeUntrained";
import type { AthenaPlan } from "@/services/athenaPlan";

export const MONITOR_NAV_KEY = "monitor";

export function applyMonitorPlanNav<
  T extends {
    key: string;
    href?: string;
    disabled?: boolean;
    subtitle?: string;
  } & FreeUntrainedLockedNavFields,
>(
  items: readonly T[],
  input: { athenaPlan?: AthenaPlan | null },
  copy: { heading: string; explanation: string },
): T[] {
  if (input.athenaPlan !== "free") {
    return items.slice();
  }

  return items.map((item) => {
    if (item.key !== MONITOR_NAV_KEY) {
      return item;
    }
    return {
      ...item,
      href: undefined,
      disabled: true,
      subtitle: copy.heading,
      lockedHeading: copy.heading,
      lockedExplanation: copy.explanation,
    };
  });
}
