/**
 * Pure Persona display helpers.
 *
 * Stage 3: job-aware readiness labels. Stored Queued without an active job
 * remains "Profile Created" for pre-Stage-3 / ungenerated Personas.
 * Terminal shared analysis maps to "Analysis Generated" (not Prospect Ready).
 */

export const PERSONA_STORED_STATUSES = [
  "Queued",
  "Processing",
  "Learning from Website",
  "Generating Executive Intelligence",
  "Analysis Generated",
  "Ready",
  "Processing Failed",
] as const;

export type PersonaStoredStatus = (typeof PERSONA_STORED_STATUSES)[number];

/** Stage 3 user-facing readiness labels (display-layer only). */
export const PERSONA_DISPLAY_READINESS_LABELS = [
  "Profile Created",
  "Queued",
  "Processing",
  "Generating Executive Intelligence",
  "Analysis Generated",
  "Processing Failed",
] as const;

export type PersonaDisplayReadiness =
  (typeof PERSONA_DISPLAY_READINESS_LABELS)[number];

/**
 * Map stored Persona.status alone (library / Stage 2-compatible).
 * "Queued" without job context → "Profile Created".
 */
export function resolvePersonaDisplayReadiness(
  storedStatus?: string | null,
): PersonaDisplayReadiness {
  return resolvePersonaDisplayStatus({ personaStatus: storedStatus });
}

/**
 * Job + analysis aware Persona display status (Stage 3).
 * Never claims Prospect-style Ready from Deployment Asset completeness.
 */
export function resolvePersonaDisplayStatus(input: {
  personaStatus?: string | null;
  jobStatus?: string | null;
  jobStage?: string | null;
  hasGeneratedAnalysis?: boolean;
  hasTerminalJobFailure?: boolean;
}): PersonaDisplayReadiness {
  const job = input.jobStatus?.toLowerCase() ?? null;
  const stage = (input.jobStage ?? "").toLowerCase();

  if (job === "failed") return "Processing Failed";
  if (job === "queued") return "Queued";
  if (job === "retryable") return "Processing";
  if (job === "processing") {
    if (stage.includes("prepar")) return "Processing";
    return "Generating Executive Intelligence";
  }

  if (input.hasGeneratedAnalysis) {
    return "Analysis Generated";
  }

  if (input.hasTerminalJobFailure) {
    return "Processing Failed";
  }

  const current = String(input.personaStatus ?? "").trim();
  if (/fail/i.test(current)) return "Processing Failed";
  if (/analysis generated/i.test(current)) return "Analysis Generated";
  // Stage 3: never display Prospect Ready — map accidental Ready storage away.
  if (/^ready$/i.test(current)) return "Analysis Generated";
  if (/generat|analyz/i.test(current)) {
    return "Generating Executive Intelligence";
  }
  if (/process/i.test(current)) return "Processing";
  // Stage 2 / ungenerated: stored Queued is not a live generation queue.
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
