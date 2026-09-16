/**
 * Authoritative ordinary-Athena product plan contract.
 * Organization-level configuration only.
 * Not authorization, entitlements, billing, or Licensee plan terminology.
 */

export const ATHENA_PLANS = ["full", "free"] as const;

export type AthenaPlan = (typeof ATHENA_PLANS)[number];

export const DEFAULT_ATHENA_PLAN: AthenaPlan = "full";

export const ATHENA_PLAN_LABELS: Record<AthenaPlan, string> = {
  full: "Full Athena",
  free: "Free Athena",
};

const ATHENA_PLAN_SET = new Set<string>(ATHENA_PLANS);

export class AthenaPlanInvalidError extends Error {
  constructor(message = "Unsupported Athena plan.") {
    super(message);
    this.name = "AthenaPlanInvalidError";
  }
}

function normalizeAthenaPlan(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

export function isAthenaPlan(value: unknown): value is AthenaPlan {
  const normalized = normalizeAthenaPlan(value);
  return normalized !== null && ATHENA_PLAN_SET.has(normalized);
}

/**
 * Fail-closed parse for external or mutation input.
 * Rejects missing, empty, and unsupported values.
 */
export function parseAthenaPlan(value: unknown): AthenaPlan {
  const normalized = normalizeAthenaPlan(value);
  if (normalized && ATHENA_PLAN_SET.has(normalized)) {
    return normalized as AthenaPlan;
  }
  throw new AthenaPlanInvalidError();
}

/**
 * Compatibility resolve for persisted/legacy values.
 * Falls back to Full when the column is missing (pre-migration) or invalid.
 */
export function resolveAthenaPlanValue(value: unknown): AthenaPlan {
  const normalized = normalizeAthenaPlan(value);
  if (normalized && ATHENA_PLAN_SET.has(normalized)) {
    return normalized as AthenaPlan;
  }
  return DEFAULT_ATHENA_PLAN;
}

export function athenaPlanLabel(plan: AthenaPlan): string {
  return ATHENA_PLAN_LABELS[plan];
}

export function athenaPlanBadgeLabel(plan: AthenaPlan): string {
  return plan === "free" ? "FREE" : "FULL";
}
