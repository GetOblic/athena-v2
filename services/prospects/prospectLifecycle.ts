/**
 * Client-managed Prospect business lifecycle.
 * Distinct from intelligence readiness (Queued / Ready / …).
 */

export const PROSPECT_LIFECYCLE_STATUSES = [
  "New",
  "Reviewing",
  "Outreach Planned",
  "Contacted",
  "Follow-up",
  "Engaged",
  "Qualified",
  "Not a Fit",
  "Completed",
] as const;

export type ProspectLifecycleStatus =
  (typeof PROSPECT_LIFECYCLE_STATUSES)[number];

const LIFECYCLE_COLORS: Record<ProspectLifecycleStatus, string> = {
  New: "text-[var(--athena-warning)]",
  Reviewing: "text-cyan-400",
  "Outreach Planned": "text-sky-300",
  Contacted: "text-blue-300",
  "Follow-up": "text-purple-300",
  Engaged: "text-violet-300",
  Qualified: "text-[var(--athena-success)]",
  "Not a Fit": "text-white/45",
  Completed: "text-[var(--athena-success)]",
};

export function isProspectLifecycleStatus(
  value: string,
): value is ProspectLifecycleStatus {
  return (PROSPECT_LIFECYCLE_STATUSES as readonly string[]).includes(value);
}

export function normalizeProspectLifecycleStatus(
  value?: string | null,
): ProspectLifecycleStatus {
  const trimmed = String(value ?? "").trim();
  if (isProspectLifecycleStatus(trimmed)) {
    return trimmed;
  }
  return "New";
}

export function getProspectLifecycleColor(
  value?: string | null,
): string {
  return LIFECYCLE_COLORS[normalizeProspectLifecycleStatus(value)];
}
