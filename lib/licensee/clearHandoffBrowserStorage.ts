/**
 * Client-safe clearer for browser storage that can leak UI context across
 * Master ↔ sub-account session handoffs.
 *
 * Prefer clearing at the handoff boundary over redesigning all persistence.
 */

import {
  LICENSEE_HANDOFF_CLEAR_STORAGE_KEYS,
  LICENSEE_HANDOFF_CLEAR_STORAGE_PREFIXES,
} from "@/services/licensee/licenseeHandoffStorageKeys";

function clearMatchingKeys(
  storage: Storage,
  exactKeys: readonly string[],
  prefixes: readonly string[],
): void {
  for (const key of exactKeys) {
    storage.removeItem(key);
  }

  const toRemove: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (!key) {
      continue;
    }
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      toRemove.push(key);
    }
  }

  for (const key of toRemove) {
    storage.removeItem(key);
  }
}

export function clearLicenseeHandoffBrowserStorage(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    clearMatchingKeys(
      window.sessionStorage,
      LICENSEE_HANDOFF_CLEAR_STORAGE_KEYS,
      LICENSEE_HANDOFF_CLEAR_STORAGE_PREFIXES,
    );
  } catch {
    // Ignore storage access failures.
  }

  try {
    clearMatchingKeys(window.localStorage, [], ["athena:getoblic-links:v1:"]);
  } catch {
    // Ignore storage access failures.
  }
}
