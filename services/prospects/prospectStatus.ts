/**
 * Executive-facing Prospect readiness status labels.
 * Resolution lives in prospectDisplay.ts (job + Current Version aware).
 */

export const PROSPECT_DISPLAY_STATUSES = [
  "Queued",
  "Processing",
  "Learning from Website",
  "Generating Executive Intelligence",
  "Ready",
  "Processing Failed",
] as const;

export type ProspectDisplayStatus = (typeof PROSPECT_DISPLAY_STATUSES)[number];

export {
  resolveProspectDisplayStatus as mapJobStatusToProspectDisplayStatus,
} from "@/services/prospects/prospectDisplay";
