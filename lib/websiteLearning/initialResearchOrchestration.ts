/**
 * Client-safe initial Deep Scrape marker.
 *
 * Durable classification lives in the existing deep-scrape progress jsonb
 * (`orchestration.role = initial_research`). This module has no Node, DNS,
 * or server-only imports so client progress can read the same marker the
 * worker writes.
 */

export const INITIAL_RESEARCH_ROLE = "initial_research" as const;
export const INITIAL_RESEARCH_PROGRESS_KEY = "orchestration" as const;

export type InitialResearchFallbackState = "idle" | "pending" | "settled";

export type InitialResearchOrchestration = {
  role: typeof INITIAL_RESEARCH_ROLE;
  fallback: InitialResearchFallbackState;
  failureCode: string | null;
  failureMessage: string | null;
  fallbackAttempts: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function readInitialResearchOrchestration(
  progress: Record<string, unknown> | null | undefined,
): InitialResearchOrchestration | null {
  const raw = asRecord(progress?.[INITIAL_RESEARCH_PROGRESS_KEY]);
  if (!raw || raw.role !== INITIAL_RESEARCH_ROLE) return null;
  const fallback =
    raw.fallback === "pending" || raw.fallback === "settled"
      ? raw.fallback
      : "idle";
  const attempts = Number(raw.fallbackAttempts ?? 0);
  return {
    role: INITIAL_RESEARCH_ROLE,
    fallback,
    failureCode:
      typeof raw.failureCode === "string" && raw.failureCode.trim()
        ? raw.failureCode
        : null,
    failureMessage:
      typeof raw.failureMessage === "string" && raw.failureMessage.trim()
        ? raw.failureMessage
        : null,
    fallbackAttempts: Number.isFinite(attempts) && attempts > 0 ? attempts : 0,
  };
}
