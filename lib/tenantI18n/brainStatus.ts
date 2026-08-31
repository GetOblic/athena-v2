import { en } from "./messages/en";
import type { TenantMessages } from "./types";

type BrainStatusToken = keyof typeof en.identity.brainStatusValues;

function isBrainStatusToken(value: string): value is BrainStatusToken {
  return value in en.identity.brainStatusValues;
}

/**
 * Presentation-only Brain status label.
 * Does not read or write persisted `brain_status` tokens.
 */
export function getLocalizedBrainStatus(
  messages: TenantMessages,
  storedStatus: string | null | undefined,
): string {
  const token = (storedStatus ?? "pending").trim() || "pending";
  if (isBrainStatusToken(token)) {
    const localized = messages.identity.brainStatusValues[token];
    if (typeof localized === "string" && localized.trim()) {
      return localized;
    }
    return en.identity.brainStatusValues[token];
  }
  return messages.identity.brainStatusValues.pending;
}
