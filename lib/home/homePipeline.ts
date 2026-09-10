/**
 * Pure Home pipeline aggregation. No I/O, no writes, no scoring invention.
 */

import type { ActiveGetOblicRelationshipStatus } from "@/services/getoblicDirectory/getoblicDirectoryTypes";
import type { ProspectDisplayStatus } from "@/services/prospects/prospectDisplay";
import type { ProspectLifecycleStatus } from "@/services/prospects/prospectLifecycle";

export const HOME_HIGH_COMPLETENESS_SCORE = 70;

export const HOME_TERMINAL_LIFECYCLE_STATUSES = [
  "Not a Fit",
  "Completed",
] as const;

export const HOME_STRONG_NOT_PROGRESSING_LIFECYCLES = [
  "New",
  "Reviewing",
] as const;

export const HOME_WORKING_ATTENTION_LIFECYCLES = [
  "New",
  "Reviewing",
  "Follow-up",
] as const;

export const HOME_IN_PROGRESS_DISPLAY_STATUSES = [
  "Queued",
  "Processing",
  "Learning from Website",
  "Generating Executive Intelligence",
] as const;

export type HomeIntelligenceBucket =
  | "ready"
  | "in_progress"
  | "failed"
  | "missing";

export type HomeProspectProjection = {
  id: string;
  displayStatus: ProspectDisplayStatus;
  lifecycleStatus: ProspectLifecycleStatus;
  completeness: number;
  getoblicStatus: ActiveGetOblicRelationshipStatus | null;
};

export type HomePipelineData = {
  libraryCount: number;
  workingCount: number;
  terminalCount: number;
  readyCount: number;
  inProgressCount: number;
  failedCount: number;
  missingCount: number;
  strongCount: number;
  strongNotProgressingCount: number;
  workingAttentionCount: number;
  heldWithoutReadyCount: number;
  newCount: number;
  reviewingCount: number;
  followUpCount: number;
  readyIds: string[];
  strongNotProgressingIds: string[];
  failedIds: string[];
  missingIds: string[];
  workingAttentionIds: string[];
  heldWithoutReadyIds: string[];
};

const TERMINAL = new Set<string>(HOME_TERMINAL_LIFECYCLE_STATUSES);
const STRONG_NOT_PROGRESSING = new Set<string>(
  HOME_STRONG_NOT_PROGRESSING_LIFECYCLES,
);
const WORKING_ATTENTION = new Set<string>(HOME_WORKING_ATTENTION_LIFECYCLES);
const IN_PROGRESS = new Set<string>(HOME_IN_PROGRESS_DISPLAY_STATUSES);

export function isHomeWorkingLifecycle(
  lifecycle: ProspectLifecycleStatus,
): boolean {
  return !TERMINAL.has(lifecycle);
}

export function homeIntelligenceBucket(
  status: ProspectDisplayStatus,
): HomeIntelligenceBucket {
  if (status === "Ready") return "ready";
  if (status === "Processing Failed") return "failed";
  if (IN_PROGRESS.has(status)) return "in_progress";
  return "missing";
}

export function isHomeHighCompleteness(score: number): boolean {
  return score >= HOME_HIGH_COMPLETENESS_SCORE;
}

export function emptyHomePipelineData(): HomePipelineData {
  return {
    libraryCount: 0,
    workingCount: 0,
    terminalCount: 0,
    readyCount: 0,
    inProgressCount: 0,
    failedCount: 0,
    missingCount: 0,
    strongCount: 0,
    strongNotProgressingCount: 0,
    workingAttentionCount: 0,
    heldWithoutReadyCount: 0,
    newCount: 0,
    reviewingCount: 0,
    followUpCount: 0,
    readyIds: [],
    strongNotProgressingIds: [],
    failedIds: [],
    missingIds: [],
    workingAttentionIds: [],
    heldWithoutReadyIds: [],
  };
}

export function buildHomePipelineData(
  rows: readonly HomeProspectProjection[],
): HomePipelineData {
  const data = emptyHomePipelineData();
  data.libraryCount = rows.length;

  for (const row of rows) {
    const working = isHomeWorkingLifecycle(row.lifecycleStatus);
    if (working) {
      data.workingCount += 1;
    } else {
      data.terminalCount += 1;
    }

    if (row.lifecycleStatus === "New") data.newCount += 1;
    if (row.lifecycleStatus === "Reviewing") data.reviewingCount += 1;
    if (row.lifecycleStatus === "Follow-up") data.followUpCount += 1;

    if (!working) continue;

    const bucket = homeIntelligenceBucket(row.displayStatus);
    if (bucket === "ready") {
      data.readyCount += 1;
      data.readyIds.push(row.id);
    } else if (bucket === "in_progress") {
      data.inProgressCount += 1;
    } else if (bucket === "failed") {
      data.failedCount += 1;
      data.failedIds.push(row.id);
    } else {
      data.missingCount += 1;
      data.missingIds.push(row.id);
    }

    if (isHomeHighCompleteness(row.completeness)) {
      data.strongCount += 1;
    }

    if (
      row.displayStatus === "Ready" &&
      isHomeHighCompleteness(row.completeness) &&
      STRONG_NOT_PROGRESSING.has(row.lifecycleStatus)
    ) {
      data.strongNotProgressingCount += 1;
      data.strongNotProgressingIds.push(row.id);
    }

    if (WORKING_ATTENTION.has(row.lifecycleStatus)) {
      data.workingAttentionCount += 1;
      data.workingAttentionIds.push(row.id);
    }

    if (row.getoblicStatus != null && row.displayStatus !== "Ready") {
      data.heldWithoutReadyCount += 1;
      data.heldWithoutReadyIds.push(row.id);
    }
  }

  return data;
}
