/**
 * In-process spec of the generic discussion-worker complete/fail boundary
 * for Free Convert. Mirrors complete_athena_generation_job and
 * fail_athena_generation_job after 20260917000006, plus the TypeScript
 * Ready/Failed secondary hooks. Not a live RPC client.
 */

import {
  applyConsumeFreeConvert,
  applyReleaseFreeConvert,
  type ConsumeFreeConvertResult,
  type FreeConvertJobSnapshot,
  type FreeConvertProspectSnapshot,
  type FreeConvertWorld,
  type ReleaseFreeConvertResult,
} from "@/lib/organization/freeConvertReservation";

const DEFAULT_MAX_ATTEMPTS = 3;

function prospectForDiscussion(
  world: FreeConvertWorld,
  organizationId: string,
  discussionId: string,
): FreeConvertProspectSnapshot | null {
  return (
    Object.values(world.prospects).find(
      (prospect) =>
        prospect.organizationId === organizationId &&
        prospect.linkedDiscussionId === discussionId,
    ) ?? null
  );
}

function processingJobForDiscussion(
  world: FreeConvertWorld,
  organizationId: string,
  discussionId: string,
): FreeConvertJobSnapshot | null {
  return (
    world.jobs.find(
      (job) =>
        job.organizationId === organizationId &&
        job.discussionId === discussionId &&
        job.status === "processing",
    ) ?? null
  );
}

export type CompleteAthenaGenerationJobResult = {
  completed: boolean;
  prospectId: string | null;
  consume: ConsumeFreeConvertResult | null;
};

export type FailAthenaGenerationJobResult = {
  status: "retryable" | "failed" | null;
  prospectId: string | null;
  release: ReleaseFreeConvertResult | null;
};

/**
 * Spec of complete_athena_generation_job: claim-owned processing job
 * completes, then consume_athena_free_convert(org, prospect) when the
 * discussion belongs to a same-org prospect.
 */
export function applyCompleteAthenaGenerationJob(input: {
  world: FreeConvertWorld;
  organizationId: string;
  discussionId: string;
}): CompleteAthenaGenerationJobResult {
  const job = processingJobForDiscussion(
    input.world,
    input.organizationId,
    input.discussionId,
  );
  if (!job) {
    return { completed: false, prospectId: null, consume: null };
  }

  job.status = "completed";

  const prospect = prospectForDiscussion(
    input.world,
    input.organizationId,
    input.discussionId,
  );
  if (!prospect) {
    return { completed: true, prospectId: null, consume: null };
  }

  return {
    completed: true,
    prospectId: prospect.id,
    consume: applyConsumeFreeConvert({
      world: input.world,
      prospectId: prospect.id,
    }),
  };
}

/**
 * Spec of fail_athena_generation_job: retryable stays reserved.
 * Terminal failed releases only the exact bound prospect.
 */
export function applyFailAthenaGenerationJob(input: {
  world: FreeConvertWorld;
  organizationId: string;
  discussionId: string;
  retryable?: boolean;
  attemptCount?: number;
  maxAttempts?: number;
}): FailAthenaGenerationJobResult {
  const job = processingJobForDiscussion(
    input.world,
    input.organizationId,
    input.discussionId,
  );
  if (!job) {
    return { status: null, prospectId: null, release: null };
  }

  const attemptCount = input.attemptCount ?? job.attemptCount ?? 1;
  const maxAttempts = input.maxAttempts ?? job.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const status =
    input.retryable && attemptCount < maxAttempts ? "retryable" : "failed";
  job.status = status;
  job.attemptCount = attemptCount;

  const prospect = prospectForDiscussion(
    input.world,
    input.organizationId,
    input.discussionId,
  );

  if (status !== "failed") {
    return { status, prospectId: prospect?.id ?? null, release: null };
  }

  if (!prospect) {
    return { status, prospectId: null, release: null };
  }

  return {
    status,
    prospectId: prospect.id,
    release: applyReleaseFreeConvert({
      world: input.world,
      prospectId: prospect.id,
    }),
  };
}

/**
 * Spec of markProspectGenerationReady — TypeScript secondary consume.
 */
export function applyMarkProspectGenerationReady(input: {
  world: FreeConvertWorld;
  organizationId: string;
  discussionId: string;
}): ConsumeFreeConvertResult | null {
  const prospect = prospectForDiscussion(
    input.world,
    input.organizationId,
    input.discussionId,
  );
  if (!prospect) return null;
  prospect.status = "Ready";
  return applyConsumeFreeConvert({
    world: input.world,
    prospectId: prospect.id,
  });
}

/**
 * Spec of markProspectGenerationFailed — TypeScript secondary release.
 */
export function applyMarkProspectGenerationFailed(input: {
  world: FreeConvertWorld;
  organizationId: string;
  discussionId: string;
}): ReleaseFreeConvertResult | null {
  const prospect = prospectForDiscussion(
    input.world,
    input.organizationId,
    input.discussionId,
  );
  if (!prospect) return null;
  prospect.status = "Processing Failed";
  return applyReleaseFreeConvert({
    world: input.world,
    prospectId: prospect.id,
  });
}

/**
 * Successful bound-prospect worker path: SQL complete (primary consume)
 * then TypeScript Ready (secondary consume).
 */
export function applyProspectWorkerSuccess(input: {
  world: FreeConvertWorld;
  organizationId: string;
  discussionId: string;
}): CompleteAthenaGenerationJobResult {
  const completed = applyCompleteAthenaGenerationJob(input);
  applyMarkProspectGenerationReady(input);
  return completed;
}

/**
 * Idempotent already-published short-circuit after the surgical fix:
 * complete the job, then mark Ready so a published generation cannot
 * remain non-Ready or reserved.
 */
export function applyProspectWorkerIdempotentSuccess(input: {
  world: FreeConvertWorld;
  organizationId: string;
  discussionId: string;
}): CompleteAthenaGenerationJobResult {
  return applyProspectWorkerSuccess(input);
}

/**
 * Terminal failed worker path: SQL fail (primary release) then
 * TypeScript Processing Failed (secondary release).
 */
export function applyProspectWorkerTerminalFailure(input: {
  world: FreeConvertWorld;
  organizationId: string;
  discussionId: string;
}): FailAthenaGenerationJobResult {
  const failed = applyFailAthenaGenerationJob({
    ...input,
    retryable: false,
  });
  applyMarkProspectGenerationFailed(input);
  return failed;
}
