/**
 * FREE-11 worker lifecycle: consume on success, release on terminal fail.
 * Exercises the reservation simulator + complete/fail RPC spec.
 * Does not call live Supabase, workers, or the real QA organization.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { evaluateFreeConvertGeneration } from "../../lib/organization/freeConvertGeneration";
import {
  applyBindFreeConvert,
  applyReserveFreeConvert,
  emptyFreeConvertOrganizationState,
  type FreeConvertWorld,
} from "../../lib/organization/freeConvertReservation";
import {
  applyCompleteAthenaGenerationJob,
  applyFailAthenaGenerationJob,
  applyProspectWorkerIdempotentSuccess,
  applyProspectWorkerSuccess,
  applyProspectWorkerTerminalFailure,
} from "../../lib/organization/freeConvertWorkerLifecycle";

const ROOT = process.cwd();
const FOLLOW_UP_MIGRATION =
  "supabase/migrations/20260917000006_patch_athena_generation_job_free_convert.sql";
const ORIGINAL_CONVERT_MIGRATION =
  "supabase/migrations/20260917000005_add_organization_free_convert.sql";
const ORG = "11111111-1111-4111-8111-111111111111";
const PROSPECT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROSPECT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DISCUSSION_A = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const DISCUSSION_B = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const DISCUSSION_NONE = "ffffffff-ffff-4fff-8fff-ffffffffffff";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function world(): FreeConvertWorld {
  return {
    organization: emptyFreeConvertOrganizationState(),
    prospects: {},
    jobs: [],
  };
}

function seedReservedBound(input: {
  source: "google" | "manual";
  prospectId?: string;
  discussionId?: string;
  token?: string;
}): FreeConvertWorld {
  const current = world();
  const prospectId = input.prospectId ?? PROSPECT_A;
  const discussionId = input.discussionId ?? DISCUSSION_A;
  const token = input.token ?? "token-1";
  applyReserveFreeConvert({
    world: current,
    organizationId: ORG,
    nowMs: 1_000,
    nextToken: token,
  });
  applyBindFreeConvert({
    world: current,
    reservationToken: token,
    prospectId,
  });
  current.prospects[prospectId] = {
    id: prospectId,
    organizationId: ORG,
    linkedDiscussionId: discussionId,
    source: input.source,
    status: "Processing",
  };
  current.jobs.push({
    prospectId,
    organizationId: ORG,
    discussionId,
    status: "processing",
    attemptCount: 1,
    maxAttempts: 3,
  });
  return current;
}

function assertConsumedReady(
  current: FreeConvertWorld,
  prospectId: string,
): void {
  const prospect = current.prospects[prospectId];
  assert.equal(prospect.status, "Ready");
  assert.equal(current.organization.status, "consumed");
  assert.equal(current.organization.prospectId, prospectId);
  assert.equal(current.organization.reservedAt, null);
  assert.equal(current.organization.reservationToken, null);
}

describe("FREE-11 worker lifecycle — Google and manual success", () => {
  it("A. Free direct-Google reserved+bound worker success consumes exactly once", () => {
    const current = seedReservedBound({ source: "google" });
    assert.equal(current.prospects[PROSPECT_A].source, "google");
    assert.equal(current.organization.status, "reserved");
    assert.equal(current.organization.prospectId, PROSPECT_A);
    assert.ok(current.organization.reservedAt);
    assert.ok(current.organization.reservationToken);

    const result = applyProspectWorkerSuccess({
      world: current,
      organizationId: ORG,
      discussionId: DISCUSSION_A,
    });
    assert.equal(result.completed, true);
    assert.equal(result.prospectId, PROSPECT_A);
    assert.equal(result.consume?.outcome, "consumed");
    assertConsumedReady(current, PROSPECT_A);
  });

  it("B. Free manual reserved+bound worker success has the same result", () => {
    const current = seedReservedBound({ source: "manual" });
    assert.equal(current.prospects[PROSPECT_A].source, "manual");

    const result = applyProspectWorkerSuccess({
      world: current,
      organizationId: ORG,
      discussionId: DISCUSSION_A,
    });
    assert.equal(result.completed, true);
    assert.equal(result.consume?.outcome, "consumed");
    assertConsumedReady(current, PROSPECT_A);
  });
});

describe("FREE-11 worker lifecycle — exact-bound and idempotence", () => {
  it("C. completing another prospect does not consume this reservation", () => {
    const current = seedReservedBound({ source: "google" });
    current.prospects[PROSPECT_B] = {
      id: PROSPECT_B,
      organizationId: ORG,
      linkedDiscussionId: DISCUSSION_B,
      source: "manual",
      status: "Processing",
    };
    current.jobs.push({
      prospectId: PROSPECT_B,
      organizationId: ORG,
      discussionId: DISCUSSION_B,
      status: "processing",
      attemptCount: 1,
      maxAttempts: 3,
    });

    const other = applyProspectWorkerSuccess({
      world: current,
      organizationId: ORG,
      discussionId: DISCUSSION_B,
    });
    assert.equal(other.completed, true);
    assert.equal(other.prospectId, PROSPECT_B);
    assert.equal(other.consume?.outcome, "ignored");
    assert.equal(current.prospects[PROSPECT_B].status, "Ready");
    assert.equal(current.organization.status, "reserved");
    assert.equal(current.organization.prospectId, PROSPECT_A);
    assert.equal(current.organization.reservationToken, "token-1");
    assert.equal(current.prospects[PROSPECT_A].status, "Processing");
  });

  it("D. successful completion retry cannot double-consume or corrupt state", () => {
    const current = seedReservedBound({ source: "manual" });
    const first = applyProspectWorkerSuccess({
      world: current,
      organizationId: ORG,
      discussionId: DISCUSSION_A,
    });
    assert.equal(first.consume?.outcome, "consumed");
    assertConsumedReady(current, PROSPECT_A);

    current.jobs[0].status = "processing";
    const retry = applyProspectWorkerSuccess({
      world: current,
      organizationId: ORG,
      discussionId: DISCUSSION_A,
    });
    assert.equal(retry.completed, true);
    assert.equal(retry.consume?.outcome, "already");
    assertConsumedReady(current, PROSPECT_A);
  });

  it("SQL complete is the primary consume and does not write Ready", () => {
    const current = seedReservedBound({ source: "google" });
    const completed = applyCompleteAthenaGenerationJob({
      world: current,
      organizationId: ORG,
      discussionId: DISCUSSION_A,
    });
    assert.equal(completed.completed, true);
    assert.equal(completed.consume?.outcome, "consumed");
    assert.equal(current.organization.status, "consumed");
    assert.equal(current.organization.prospectId, PROSPECT_A);
    assert.equal(current.organization.reservedAt, null);
    assert.equal(current.organization.reservationToken, null);
    assert.equal(current.prospects[PROSPECT_A].status, "Processing");
  });

  it("idempotent already-published short-circuit still reaches Ready and consumed", () => {
    const current = seedReservedBound({ source: "google" });
    const result = applyProspectWorkerIdempotentSuccess({
      world: current,
      organizationId: ORG,
      discussionId: DISCUSSION_A,
    });
    assert.equal(result.completed, true);
    assert.equal(result.consume?.outcome, "consumed");
    assertConsumedReady(current, PROSPECT_A);
  });
});

describe("FREE-11 worker lifecycle — terminal and retryable failure", () => {
  it("E. terminal failure releases the exact bound reservation", () => {
    const current = seedReservedBound({ source: "google" });
    const failed = applyProspectWorkerTerminalFailure({
      world: current,
      organizationId: ORG,
      discussionId: DISCUSSION_A,
    });
    assert.equal(failed.status, "failed");
    assert.equal(failed.prospectId, PROSPECT_A);
    assert.equal(failed.release?.outcome, "released");
    assert.equal(current.prospects[PROSPECT_A].status, "Processing Failed");
    assert.equal(current.organization.status, "available");
    assert.equal(current.organization.prospectId, PROSPECT_A);
    assert.equal(current.organization.reservedAt, null);
    assert.equal(current.organization.reservationToken, null);
  });

  it("F. retryable failure remains reserved", () => {
    const current = seedReservedBound({ source: "manual" });
    const retryable = applyFailAthenaGenerationJob({
      world: current,
      organizationId: ORG,
      discussionId: DISCUSSION_A,
      retryable: true,
      attemptCount: 1,
      maxAttempts: 3,
    });
    assert.equal(retryable.status, "retryable");
    assert.equal(retryable.release, null);
    assert.equal(current.jobs[0].status, "retryable");
    assert.equal(current.organization.status, "reserved");
    assert.equal(current.organization.prospectId, PROSPECT_A);
    assert.equal(current.organization.reservationToken, "token-1");
    assert.ok(current.organization.reservedAt);
    assert.equal(current.prospects[PROSPECT_A].status, "Processing");
  });

  it("exhausted retries are terminal and release", () => {
    const current = seedReservedBound({ source: "google" });
    const failed = applyFailAthenaGenerationJob({
      world: current,
      organizationId: ORG,
      discussionId: DISCUSSION_A,
      retryable: true,
      attemptCount: 3,
      maxAttempts: 3,
    });
    assert.equal(failed.status, "failed");
    assert.equal(failed.release?.outcome, "released");
    assert.equal(current.organization.status, "available");
    assert.equal(current.organization.prospectId, PROSPECT_A);
  });
});

describe("FREE-11 worker lifecycle — second acquisition, Full, non-prospect", () => {
  it("G. second acquisition after consumed is denied", () => {
    const current = seedReservedBound({ source: "google" });
    applyProspectWorkerSuccess({
      world: current,
      organizationId: ORG,
      discussionId: DISCUSSION_A,
    });
    assert.equal(current.organization.status, "consumed");

    const create = evaluateFreeConvertGeneration({
      athenaPlan: "free",
      defineKind: "ready",
      convertStatus: current.organization.status,
      boundProspectId: current.organization.prospectId,
      action: "create",
    });
    assert.equal(create.allow, false);
    if (create.allow) return;
    assert.equal(create.code, "FREE_CONVERT_CONSUMED");

    const reservedAgain = applyReserveFreeConvert({
      world: current,
      organizationId: ORG,
      nowMs: 9_000_000,
      nextToken: "after-consume",
    });
    assert.equal(reservedAgain.outcome, "already_consumed");
    assert.equal(current.organization.status, "consumed");
    assert.equal(current.organization.prospectId, PROSPECT_A);
  });

  it("H. Full generic completion/failure leaves free_convert null", () => {
    const current = world();
    current.prospects[PROSPECT_A] = {
      id: PROSPECT_A,
      organizationId: ORG,
      linkedDiscussionId: DISCUSSION_A,
      source: "manual",
      status: "Processing",
    };
    current.jobs.push({
      prospectId: PROSPECT_A,
      organizationId: ORG,
      discussionId: DISCUSSION_A,
      status: "processing",
      attemptCount: 1,
      maxAttempts: 3,
    });

    const completed = applyProspectWorkerSuccess({
      world: current,
      organizationId: ORG,
      discussionId: DISCUSSION_A,
    });
    assert.equal(completed.completed, true);
    assert.equal(completed.consume?.outcome, "ignored");
    assert.equal(current.prospects[PROSPECT_A].status, "Ready");
    assert.equal(current.organization.status, "available");
    assert.equal(current.organization.prospectId, null);
    assert.equal(current.organization.reservedAt, null);
    assert.equal(current.organization.reservationToken, null);

    current.prospects[PROSPECT_B] = {
      id: PROSPECT_B,
      organizationId: ORG,
      linkedDiscussionId: DISCUSSION_B,
      source: "manual",
      status: "Processing",
    };
    current.jobs.push({
      prospectId: PROSPECT_B,
      organizationId: ORG,
      discussionId: DISCUSSION_B,
      status: "processing",
      attemptCount: 1,
      maxAttempts: 3,
    });
    const failed = applyProspectWorkerTerminalFailure({
      world: current,
      organizationId: ORG,
      discussionId: DISCUSSION_B,
    });
    assert.equal(failed.status, "failed");
    assert.equal(failed.release?.outcome, "ignored");
    assert.equal(current.organization.status, "available");
    assert.equal(current.organization.prospectId, null);
    assert.equal(current.organization.reservationToken, null);
  });

  it("I. existing non-prospect discussions keep generic complete/fail unchanged", () => {
    const reserved = seedReservedBound({ source: "google" });
    reserved.jobs.push({
      prospectId: "not-a-prospect",
      organizationId: ORG,
      discussionId: DISCUSSION_NONE,
      status: "processing",
      attemptCount: 1,
      maxAttempts: 3,
    });

    const completed = applyCompleteAthenaGenerationJob({
      world: reserved,
      organizationId: ORG,
      discussionId: DISCUSSION_NONE,
    });
    assert.equal(completed.completed, true);
    assert.equal(completed.prospectId, null);
    assert.equal(completed.consume, null);
    assert.equal(reserved.organization.status, "reserved");
    assert.equal(reserved.organization.prospectId, PROSPECT_A);
    assert.equal(reserved.organization.reservationToken, "token-1");

    reserved.jobs[1].status = "processing";
    const failed = applyFailAthenaGenerationJob({
      world: reserved,
      organizationId: ORG,
      discussionId: DISCUSSION_NONE,
      retryable: false,
    });
    assert.equal(failed.status, "failed");
    assert.equal(failed.prospectId, null);
    assert.equal(failed.release, null);
    assert.equal(reserved.organization.status, "reserved");
    assert.equal(reserved.organization.reservationToken, "token-1");
  });
});

describe("FREE-11 follow-up migration contract", () => {
  it("patches complete_athena_generation_job and fail_athena_generation_job", () => {
    assert.equal(existsSync(join(ROOT, FOLLOW_UP_MIGRATION)), true);
    assert.equal(existsSync(join(ROOT, ORIGINAL_CONVERT_MIGRATION)), true);
    const followUp = read(FOLLOW_UP_MIGRATION);
    const original = read(ORIGINAL_CONVERT_MIGRATION);

    assert.doesNotMatch(
      original,
      /create or replace function complete_athena_generation_job/,
    );
    assert.doesNotMatch(
      original,
      /create or replace function fail_athena_generation_job/,
    );

    assert.match(
      followUp,
      /create or replace function complete_athena_generation_job/,
    );
    assert.match(
      followUp,
      /create or replace function fail_athena_generation_job/,
    );
    assert.match(
      followUp,
      /perform consume_athena_free_convert\(v_job\.organization_id, v_prospect_id\)/,
    );

    const complete = followUp.slice(
      followUp.indexOf("create or replace function complete_athena_generation_job"),
      followUp.indexOf("create or replace function fail_athena_generation_job"),
    );
    assert.match(
      complete,
      /p\.linked_discussion_id = v_job\.discussion_id/,
    );
    assert.match(complete, /p\.organization_id = v_job\.organization_id/);
    assert.doesNotMatch(complete, /prospect\.source|p\.source/);
    assert.doesNotMatch(complete, /reservation_token/);
    assert.doesNotMatch(complete, /athena_plan/);

    const failFn = followUp.slice(
      followUp.lastIndexOf("create or replace function fail_athena_generation_job"),
    );
    const failedBranchStart = failFn.indexOf("if v_status = 'failed' then");
    assert.ok(failedBranchStart >= 0);
    const failedBranch = failFn.slice(failedBranchStart);
    assert.match(
      failedBranch,
      /perform release_athena_free_convert\(\s*v_job\.organization_id,\s*v_prospect_id,\s*null/,
    );
    const retryableRule = failFn.slice(
      0,
      failFn.indexOf("if v_status = 'failed' then"),
    );
    assert.match(
      retryableRule,
      /if p_retryable and v_job\.attempt_count < v_job\.max_attempts then/,
    );
    assert.doesNotMatch(
      retryableRule,
      /perform release_athena_free_convert/,
    );

    assert.match(
      followUp,
      /grant execute on function complete_athena_generation_job\(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid\) to service_role/,
    );
    assert.match(
      followUp,
      /revoke all on function complete_athena_generation_job\(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid\) from authenticated/,
    );
    assert.match(
      followUp,
      /grant execute on function fail_athena_generation_job\(uuid, uuid, text, text, boolean, timestamptz, jsonb, text\) to service_role/,
    );
    assert.match(
      followUp,
      /revoke all on function fail_athena_generation_job\(uuid, uuid, text, text, boolean, timestamptz, jsonb, text\) from authenticated/,
    );
    assert.doesNotMatch(
      followUp,
      /grant execute on function complete_athena_generation_job[\s\S]{0,200}to authenticated/,
    );
  });

  it("does not rewrite the already-applied convert migration", () => {
    const original = read(ORIGINAL_CONVERT_MIGRATION);
    assert.match(original, /create or replace function consume_athena_free_convert/);
    assert.match(original, /create or replace function release_athena_free_convert/);
    assert.doesNotMatch(original, /complete_athena_generation_job/);
    assert.doesNotMatch(original, /fail_athena_generation_job/);
  });
});
