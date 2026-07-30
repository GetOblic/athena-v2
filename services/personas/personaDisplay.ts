/**
 * Pure Persona display helpers.
 *
 * Stage 2 readiness note:
 * Stored `status` defaults to "Queued", but Stage 2 never enqueues generation.
 * Display maps pre-generation stored values to a neutral label so the UI does
 * not imply a live queued job. Stage 3 can activate true generation labels
 * without a migration by changing this mapping only.
 */

export const PERSONA_STORED_STATUSES = [
  "Queued",
  "Processing",
  "Learning from Website",
  "Generating Executive Intelligence",
  "Ready",
  "Processing Failed",
] as const;

export type PersonaStoredStatus = (typeof PERSONA_STORED_STATUSES)[number];

/** Stage 2 user-facing readiness labels (display-layer only). */
export const PERSONA_DISPLAY_READINESS_LABELS = [
  "Profile Created",
  "Processing",
  "Learning from Website",
  "Generating Executive Intelligence",
  "Ready",
  "Processing Failed",
] as const;

export type PersonaDisplayReadiness =
  (typeof PERSONA_DISPLAY_READINESS_LABELS)[number];

/**
 * Map stored Persona.status to a Stage 2 display readiness label.
 * "Queued" (and unknown pre-generation values) → "Profile Created".
 */
export function resolvePersonaDisplayReadiness(
  storedStatus?: string | null,
): PersonaDisplayReadiness {
  const current = String(storedStatus ?? "").trim();

  if (/fail/i.test(current)) return "Processing Failed";
  if (/ready/i.test(current)) return "Ready";
  if (/learn|scrape|website/i.test(current)) return "Learning from Website";
  if (/generat|analyz/i.test(current)) {
    return "Generating Executive Intelligence";
  }
  if (/process/i.test(current)) return "Processing";

  // Stage 2: stored Queued is not a live generation queue.
  return "Profile Created";
}

export function formatPersonaOpportunityScore(
  score: number | null | undefined,
): string {
  if (typeof score !== "number" || !Number.isFinite(score) || score <= 0) {
    return "—";
  }
  return String(Math.round(score));
}

/** Combine city/state/country without empty separators. */
export function formatPersonaLocation(input: {
  city?: string | null;
  state?: string | null;
  country?: string | null;
  location_summary?: string | null;
}): string | null {
  const summary = String(input.location_summary ?? "").trim();
  if (summary) return summary;

  const parts = [input.city, input.state, input.country]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

/** Safe hostname or concise URL for Reference Website display. */
export function formatPersonaReferenceWebsiteDisplay(
  referenceWebsite?: string | null,
): string | null {
  const raw = String(referenceWebsite ?? "").trim();
  if (!raw) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const hostname = new URL(withProtocol).hostname.replace(/^www\./i, "");
    return hostname || raw;
  } catch {
    return raw.length > 48 ? `${raw.slice(0, 47)}…` : raw;
  }
}
