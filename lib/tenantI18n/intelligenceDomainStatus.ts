import {
  normalizeIntelligenceDomainStatus,
  type IntelligenceDomainStatusKey,
} from "@/lib/intelligenceDomainStatus";
import { en } from "./messages/en";
import type { TenantMessages } from "./types";

const SAFE_LABEL_FALLBACK = "—";

const STATUS_LABEL_KEYS = {
  active: "statusActive",
  inactive: "statusInactive",
} as const satisfies Record<
  IntelligenceDomainStatusKey,
  keyof TenantMessages["intelligenceDomains"]
>;

/**
 * Presentation-only Intelligence Domain status label.
 * Does not read or write stored status tokens.
 */
export function getLocalizedIntelligenceDomainStatus(
  messages: TenantMessages,
  storedStatus?: string | null,
): string {
  const key = normalizeIntelligenceDomainStatus(storedStatus);
  const labelKey = STATUS_LABEL_KEYS[key];
  const localized = messages.intelligenceDomains[labelKey];
  if (typeof localized === "string" && localized.trim()) {
    return localized;
  }
  const fallback = en.intelligenceDomains[labelKey];
  if (typeof fallback === "string" && fallback.trim()) {
    return fallback;
  }
  return SAFE_LABEL_FALLBACK;
}
