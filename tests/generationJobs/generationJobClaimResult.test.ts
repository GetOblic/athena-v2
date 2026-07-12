import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import {
  describeClaimRpcDataShape,
  isExecutableClaimedJob,
  isGenerationJobUuid,
  normalizeClaimRpcResult,
} from "../../services/generationJobs/generationJobClaimResult";
import type { AthenaGenerationJob } from "../../services/generationJobs/generationJobTypes";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key-for-claim-tests";

const JOB_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const DISCUSSION_ID = "33333333-3333-4333-8333-333333333333";
const CLAIM_TOKEN = "44444444-4444-4444-8444-444444444444";

function nullCompositeRow(): Record<string, unknown> {
  return {
    id: null,
    organization_id: null,
    discussion_id: null,
    discussion_update_id: null,
    trigger_type: null,
    requested_by: null,
    status: null,
    current_stage: null,
    progress: null,
    attempt_count: null,
    max_attempts: null,
    regeneration_run_id: null,
    analysis_id: null,
    opportunity_id: null,
    review_id: null,
    blueprint_id: null,
    executive_version_id: null,
    published_version_id: null,
    error_code: null,
    error_message: null,
    error_metadata: null,
    claimed_by: null,
    claim_token: null,
    claimed_at: null,
    claim_expires_at: null,
    heartbeat_at: null,
    next_attempt_at: null,
    started_at: null,
    completed_at: null,
    created_at: null,
    updated_at: null,
  };
}

function validClaimRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: JOB_ID,
    organization_id: ORG_ID,
    discussion_id: DISCUSSION_ID,
    discussion_update_id: null,
    trigger_type: "manual_refresh",
    requested_by: null,
    status: "processing",
    current_stage: "preparing",
    progress: {},
    attempt_count: 1,
    max_attempts: 3,
    regeneration_run_id: null,
    analysis_id: null,
    opportunity_id: null,
    review_id: null,
    blueprint_id: null,
    executive_version_id: null,
    published_version_id: null,
    error_code: null,
    error_message: null,
    error_metadata: null,
    claimed_by: "athena-worker:test",
    claim_token: CLAIM_TOKEN,
    claimed_at: "2026-07-12T00:00:00.000Z",
    claim_expires_at: "2026-07-12T00:02:00.000Z",
    heartbeat_at: "2026-07-12T00:00:00.000Z",
    next_attempt_at: null,
    started_at: "2026-07-12T00:00:00.000Z",
    completed_at: null,
    created_at: "2026-07-12T00:00:00.000Z",
    updated_at: "2026-07-12T00:00:00.000Z",
    ...overrides,
  };
}

function mapStub(row: Record<string, unknown>): AthenaGenerationJob {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    discussion_id: row.discussion_id as string,
    discussion_update_id: (row.discussion_update_id as string | null) ?? null,
    trigger_type: row.trigger_type as AthenaGenerationJob["trigger_type"],
    requested_by: (row.requested_by as string | null) ?? null,
    status: row.status as AthenaGenerationJob["status"],
    current_stage: (row.current_stage as string | null) ?? null,
    progress: (row.progress as Record<string, unknown>) ?? {},
    attempt_count: Number(row.attempt_count ?? 0),
    max_attempts: Number(row.max_attempts ?? 3),
    regeneration_run_id: (row.regeneration_run_id as string | null) ?? null,
    analysis_id: (row.analysis_id as string | null) ?? null,
    opportunity_id: (row.opportunity_id as string | null) ?? null,
    review_id: (row.review_id as string | null) ?? null,
    blueprint_id: (row.blueprint_id as string | null) ?? null,
    executive_version_id: (row.executive_version_id as string | null) ?? null,
    published_version_id: (row.published_version_id as string | null) ?? null,
    error_code: (row.error_code as string | null) ?? null,
    error_message: (row.error_message as string | null) ?? null,
    error_metadata:
      (row.error_metadata as Record<string, unknown> | null) ?? null,
    claimed_by: (row.claimed_by as string | null) ?? null,
    claim_token: (row.claim_token as string | null) ?? null,
    claimed_at: (row.claimed_at as string | null) ?? null,
    claim_expires_at: (row.claim_expires_at as string | null) ?? null,
    heartbeat_at: (row.heartbeat_at as string | null) ?? null,
    next_attempt_at: (row.next_attempt_at as string | null) ?? null,
    started_at: (row.started_at as string | null) ?? null,
    completed_at: (row.completed_at as string | null) ?? null,
    created_at: (row.created_at as string) ?? "",
    updated_at: (row.updated_at as string) ?? "",
  };
}

describe("claim RPC empty-queue normalization", () => {
  it("returns empty when RPC data is null", () => {
    const result = normalizeClaimRpcResult(null, mapStub, CLAIM_TOKEN);
    assert.equal(result.kind, "empty");
  });

  it("returns empty when RPC data is []", () => {
    const result = normalizeClaimRpcResult([], mapStub, CLAIM_TOKEN);
    assert.equal(result.kind, "empty");
  });

  it("returns empty when RPC data is [{ id: null, ... }]", () => {
    const result = normalizeClaimRpcResult(
      [nullCompositeRow()],
      mapStub,
      CLAIM_TOKEN,
    );
    assert.equal(result.kind, "empty");
  });

  it("returns empty when RPC data is an object with null primary identifiers", () => {
    const result = normalizeClaimRpcResult(
      nullCompositeRow(),
      mapStub,
      CLAIM_TOKEN,
    );
    assert.equal(result.kind, "empty");
    assert.equal(describeClaimRpcDataShape(nullCompositeRow()), "object");
  });

  it("maps a valid claimed job unchanged", () => {
    const result = normalizeClaimRpcResult(
      validClaimRow(),
      mapStub,
      CLAIM_TOKEN,
    );
    assert.equal(result.kind, "claimed");
    if (result.kind !== "claimed") return;
    assert.equal(result.job.id, JOB_ID);
    assert.equal(result.job.discussion_id, DISCUSSION_ID);
    assert.equal(result.job.organization_id, ORG_ID);
    assert.equal(result.job.trigger_type, "manual_refresh");
    assert.equal(result.job.status, "processing");
    assert.equal(result.claimToken, CLAIM_TOKEN);
  });

  it("rejects string 'null' and empty UUID lookalikes", () => {
    assert.equal(isGenerationJobUuid(null), false);
    assert.equal(isGenerationJobUuid("null"), false);
    assert.equal(isGenerationJobUuid("undefined"), false);
    assert.equal(isGenerationJobUuid(""), false);
    assert.equal(isGenerationJobUuid(JOB_ID), true);

    const result = normalizeClaimRpcResult(
      validClaimRow({ id: "null", discussion_id: "null" }),
      mapStub,
      CLAIM_TOKEN,
    );
    assert.equal(result.kind, "invalid");
  });
});

describe("executable claimed-job validation", () => {
  it("rejects malformed jobs before Discussion lookup", () => {
    assert.equal(
      isExecutableClaimedJob({
        job: mapStub(nullCompositeRow()),
        claimToken: CLAIM_TOKEN,
      }),
      false,
    );
    assert.equal(isExecutableClaimedJob(null), false);
  });

  it("accepts a fully valid claimed job", () => {
    assert.equal(
      isExecutableClaimedJob({
        job: mapStub(validClaimRow()),
        claimToken: CLAIM_TOKEN,
      }),
      true,
    );
  });
});

describe("claimAndExecuteNextJob empty-queue behaviour", () => {
  it("does not invoke executor or log job_claimed/job_started on empty claim", async () => {
    const { claimAndExecuteNextJob } = await import(
      "../../services/generationJobs/generationJobExecutor"
    );

    const logs: string[] = [];
    const logMock = mock.method(console, "log", (...args: unknown[]) => {
      logs.push(String(args[0] ?? ""));
    });
    const errorMock = mock.method(console, "error", () => {});
    const executeFn = mock.fn(async () => "completed" as const);

    try {
      const didWork = await claimAndExecuteNextJob("athena-worker:test", {
        claimFn: async () => null,
        executeFn: executeFn as never,
      });

      assert.equal(didWork, false);
      assert.equal(executeFn.mock.callCount(), 0);
      assert.equal(
        logs.some((line) => line.includes("job_claimed")),
        false,
      );
      assert.equal(
        logs.some((line) => line.includes("job_started")),
        false,
      );
    } finally {
      logMock.mock.restore();
      errorMock.mock.restore();
    }
  });

  it("does not invoke executor for malformed claim and logs invalid_claim_result", async () => {
    const { claimAndExecuteNextJob } = await import(
      "../../services/generationJobs/generationJobExecutor"
    );

    const errors: string[] = [];
    const errorMock = mock.method(console, "error", (...args: unknown[]) => {
      errors.push(String(args[0] ?? ""));
    });
    const executeFn = mock.fn(async () => "completed" as const);

    try {
      const didWork = await claimAndExecuteNextJob("athena-worker:test", {
        claimFn: async () => ({
          job: mapStub(nullCompositeRow()),
          claimToken: CLAIM_TOKEN,
        }),
        executeFn: executeFn as never,
      });

      assert.equal(didWork, false);
      assert.equal(executeFn.mock.callCount(), 0);
      assert.ok(
        errors.some((line) => line.includes("invalid_claim_result")),
      );
    } finally {
      errorMock.mock.restore();
    }
  });

  it("executes a valid claimed job and logs job_claimed", async () => {
    const { claimAndExecuteNextJob } = await import(
      "../../services/generationJobs/generationJobExecutor"
    );

    const logs: string[] = [];
    const logMock = mock.method(console, "log", (...args: unknown[]) => {
      logs.push(String(args[0] ?? ""));
    });
    const executeFn = mock.fn(async () => "completed" as const);

    try {
      const didWork = await claimAndExecuteNextJob("athena-worker:test", {
        claimFn: async () => ({
          job: mapStub(validClaimRow()),
          claimToken: CLAIM_TOKEN,
        }),
        executeFn: executeFn as never,
      });

      assert.equal(didWork, true);
      assert.equal(executeFn.mock.callCount(), 1);
      assert.ok(logs.some((line) => line.includes("job_claimed")));
    } finally {
      logMock.mock.restore();
    }
  });

  it("poll loop continues normally after an empty result (didWork=false)", async () => {
    const { claimAndExecuteNextJob } = await import(
      "../../services/generationJobs/generationJobExecutor"
    );

    const first = await claimAndExecuteNextJob("athena-worker:test", {
      claimFn: async () => null,
      executeFn: async () => "completed",
    });
    const second = await claimAndExecuteNextJob("athena-worker:test", {
      claimFn: async () => null,
      executeFn: async () => "completed",
    });

    assert.equal(first, false);
    assert.equal(second, false);
  });
});
