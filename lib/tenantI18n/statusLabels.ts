import { en } from "./messages/en";
import type { TenantMessages, TenantStatusKey } from "./types";

const SAFE_STATUS_FALLBACK = "—";

/**
 * Presentation-only status label lookup.
 * Does not read or write stored status tokens.
 * Later slices migrate individual views onto this helper.
 */
export function getLocalizedStatusLabel(
  messages: TenantMessages,
  statusKey: TenantStatusKey,
): string {
  const localized = messages.status[statusKey];
  if (typeof localized === "string" && localized.trim()) {
    return localized;
  }
  const fallback = en.status[statusKey];
  if (typeof fallback === "string" && fallback.trim()) {
    return fallback;
  }
  return SAFE_STATUS_FALLBACK;
}
