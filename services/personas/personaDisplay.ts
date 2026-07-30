/**
 * Pure Persona display helpers.
 *
 * Stage 4: Ready means Current Executive Version + Blueprint + complete
 * 14-key Persona Deployment Asset set. Analysis Generated is not terminal.
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

/** Stage 4 user-facing readiness labels (display-layer only). */
export const PERSONA_DISPLAY_READINESS_LABELS = [
  "Profile Created",
  "Queued",
  "Processing",
  "Generating Executive Intelligence",
  "Ready",
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
 * Job + publication aware Persona display status (Stage 4).
 * Ready only when publication completeness is known (Current EV) or stored Ready.
 */
export function resolvePersonaDisplayStatus(input: {
  personaStatus?: string | null;
  jobStatus?: string | null;
  jobStage?: string | null;
  hasGeneratedAnalysis?: boolean;
  hasCurrentExecutiveVersion?: boolean;
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

  if (input.hasCurrentExecutiveVersion) {
    return "Ready";
  }

  if (input.hasTerminalJobFailure) {
    return "Processing Failed";
  }

  const current = String(input.personaStatus ?? "").trim();
  if (/fail/i.test(current)) return "Processing Failed";
  if (/^ready$/i.test(current)) return "Ready";
  if (/generat|analyz/i.test(current)) {
    return "Generating Executive Intelligence";
  }
  if (/process/i.test(current)) return "Processing";
  // Stage 2 / ungenerated: stored Queued is not a live generation queue.
  // Analysis Generated without Current EV is not Ready — treat as Profile Created
  // until a complete publication exists (or active job drives processing labels).
  if (/analysis generated/i.test(current) && !input.hasCurrentExecutiveVersion) {
    return input.hasGeneratedAnalysis
      ? "Generating Executive Intelligence"
      : "Profile Created";
  }
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
