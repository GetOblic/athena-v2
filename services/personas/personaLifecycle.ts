/**
 * Client-managed Persona lifecycle.
 * Distinct from intelligence readiness (Queued / Ready / …).
 * Isolated from Prospect CRM lifecycle vocabulary.
 */

export const PERSONA_LIFECYCLE_STATUSES = [
  "New",
  "Reviewing",
  "Researching",
  "In Use",
  "Validating",
  "Refined",
  "Not a Fit",
  "Archived",
] as const;

export type PersonaLifecycleStatus =
  (typeof PERSONA_LIFECYCLE_STATUSES)[number];

export function isPersonaLifecycleStatus(
  value: string,
): value is PersonaLifecycleStatus {
  return (PERSONA_LIFECYCLE_STATUSES as readonly string[]).includes(value);
}

export function normalizePersonaLifecycleStatus(
  value?: string | null,
): PersonaLifecycleStatus {
  const trimmed = String(value ?? "").trim();
  if (isPersonaLifecycleStatus(trimmed)) {
    return trimmed;
  }
  return "New";
}

/**
 * Write-path validation: reject unknown lifecycle values (including Prospect CRM labels).
 */
export function assertPersonaLifecycleStatus(
  value?: string | null,
): PersonaLifecycleStatus {
  const trimmed = String(value ?? "").trim();
  if (!isPersonaLifecycleStatus(trimmed)) {
    throw new Error(
      `Invalid Persona lifecycle status: ${String(value ?? "")}`,
    );
  }
  return trimmed;
}

const LIFECYCLE_COLORS: Record<PersonaLifecycleStatus, string> = {
  New: "text-[var(--athena-warning)]",
  Reviewing: "text-cyan-400",
  Researching: "text-sky-300",
  "In Use": "text-blue-300",
  Validating: "text-purple-300",
  Refined: "text-[var(--athena-success)]",
  "Not a Fit": "text-white/45",
  Archived: "text-white/35",
};

export function getPersonaLifecycleColor(value?: string | null): string {
  return LIFECYCLE_COLORS[normalizePersonaLifecycleStatus(value)];
}
