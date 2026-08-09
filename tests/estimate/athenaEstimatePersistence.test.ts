import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  ESTIMATE_GENERATION_JOB_RPCS,
  isActiveEstimateGenerationJobStatus,
  mapEstimateGenerationJobRow,
} from "../../services/estimate/estimateGenerationJobs/estimateGenerationJobTypes";

const ROOT = process.cwd();
const MIGRATION =
  "supabase/migrations/20260809000001_create_athena_estimates.sql";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Athena Estimate L1 persistence foundation", () => {
  it("migration file exists and is not applied by this suite", () => {
    assert.equal(existsSync(join(ROOT, MIGRATION)), true);
  });

  it("9-11. schema contains expected FKs, no licensee_sub_accounts FK, org RESTRICT", () => {
    const migration = read(MIGRATION);

    assert.match(migration, /create table if not exists athena_estimates/);
    assert.match(
      migration,
      /create table if not exists athena_estimate_generation_jobs/,
    );

    assert.match(
      migration,
      /licensee_account_id uuid not null\s+references licensee_accounts\(id\) on delete cascade/,
    );
    assert.match(
      migration,
      /organization_id uuid not null\s+references organizations\(id\) on delete restrict/,
    );
    assert.match(
      migration,
      /requested_by uuid\s+references auth\.users\(id\) on delete set null/,
    );

    // Comments may mention the relationship table; there must be no FK/column.
    assert.doesNotMatch(migration, /references\s+licensee_sub_accounts/i);
    assert.doesNotMatch(migration, /licensee_sub_account_id/);

    // Jobs table estimate FK cascade + org restrict
    assert.match(
      migration,
      /estimate_id uuid not null\s+references athena_estimates\(id\) on delete cascade/,
    );
    assert.match(
      migration,
      /organization_id uuid not null\s+references organizations\(id\) on delete restrict/,
    );

    assert.match(
      migration,
      /athena_estimates_licensee_created_idx/,
    );
    assert.match(
      migration,
      /athena_estimates_licensee_org_created_idx/,
    );
    assert.match(
      migration,
      /athena_estimates_licensee_status_idx/,
    );
    assert.match(
      migration,
      /athena_estimates_organization_id_idx/,
    );
    assert.match(
      migration,
      /organization_id never implies Estimate authority/i,
    );
  });

  it("12-14. RLS enabled; public/anon/authenticated revoked; service_role granted", () => {
    const migration = read(MIGRATION);

    for (const table of [
      "athena_estimates",
      "athena_estimate_generation_jobs",
    ]) {
      assert.match(
        migration,
        new RegExp(`alter table ${table} enable row level security`, "i"),
      );
      assert.match(
        migration,
        new RegExp(`revoke all on table ${table} from public`, "i"),
      );
      assert.match(
        migration,
        new RegExp(`revoke all on table ${table} from anon`, "i"),
      );
      assert.match(
        migration,
        new RegExp(`revoke all on table ${table} from authenticated`, "i"),
      );
      assert.match(
        migration,
        new RegExp(`grant all on table ${table} to service_role`, "i"),
      );
    }

    assert.doesNotMatch(migration, /create policy/i);
  });

  it("15. active-job uniqueness and lease indexes follow SEO/Ads pattern", () => {
    const migration = read(MIGRATION);
    assert.match(
      migration,
      /athena_estimate_generation_jobs_one_active_estimate/,
    );
    assert.match(
      migration,
      /where status in \('queued', 'processing', 'retryable'\)/,
    );
    assert.match(
      migration,
      /athena_estimate_generation_jobs_claimable_idx/,
    );
    assert.match(
      migration,
      /athena_estimate_generation_jobs_lease_idx/,
    );
    assert.match(migration, /where status = 'processing'/);
  });

  it("16. Estimate RPC names/contracts mirror durable job lease semantics", () => {
    const migration = read(MIGRATION);

    assert.equal(
      ESTIMATE_GENERATION_JOB_RPCS.claim,
      "claim_athena_estimate_generation_job",
    );
    assert.equal(
      ESTIMATE_GENERATION_JOB_RPCS.heartbeat,
      "heartbeat_athena_estimate_generation_job",
    );
    assert.equal(
      ESTIMATE_GENERATION_JOB_RPCS.complete,
      "complete_athena_estimate_generation_job",
    );
    assert.equal(
      ESTIMATE_GENERATION_JOB_RPCS.fail,
      "fail_athena_estimate_generation_job",
    );

    for (const rpc of Object.values(ESTIMATE_GENERATION_JOB_RPCS)) {
      assert.match(
        migration,
        new RegExp(`create or replace function ${rpc}`, "i"),
      );
      assert.match(
        migration,
        new RegExp(`revoke all on function ${rpc}`, "i"),
      );
      assert.match(
        migration,
        new RegExp(`grant execute on function ${rpc}[^;]* to service_role`, "i"),
      );
    }

    assert.match(migration, /for update skip locked/);
    assert.match(migration, /claim_expires_at < v_now/);
    assert.match(migration, /status = 'retryable'/);
    assert.match(migration, /set search_path = public/);
    assert.match(migration, /security definer/);
    assert.match(migration, /max_attempts integer not null default 3/);
    assert.match(migration, /attempt_count = attempt_count \+ 1/);
    assert.match(migration, /v_now \+ interval '30 seconds'/);

    // Entity status mirroring
    assert.match(migration, /status = 'Processing'/);
    assert.match(migration, /status = 'Ready'/);
    assert.match(migration, /status = 'Processing Failed'/);

    const job = mapEstimateGenerationJobRow({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      licensee_account_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      organization_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      estimate_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      status: "queued",
      generation_stage: "assembling_context",
      attempt_count: 0,
      max_attempts: 3,
      claimed_by: null,
      claim_token: null,
      claimed_at: null,
      claim_expires_at: null,
      heartbeat_at: null,
      next_attempt_at: null,
      error_code: null,
      error_message: null,
      error_metadata: null,
      requested_by: null,
      started_at: null,
      completed_at: null,
      created_at: "2026-08-09T00:00:00.000Z",
      updated_at: "2026-08-09T00:00:00.000Z",
    });
    assert.equal(job.estimate_id, "dddddddd-dddd-4ddd-8ddd-dddddddddddd");
    assert.equal(isActiveEstimateGenerationJobStatus("queued"), true);
    assert.equal(isActiveEstimateGenerationJobStatus("processing"), true);
    assert.equal(isActiveEstimateGenerationJobStatus("retryable"), true);
    assert.equal(isActiveEstimateGenerationJobStatus("completed"), false);
  });

  it("relationship removal contract: no sub-account FK; org restrict; name snapshot", () => {
    const migration = read(MIGRATION);
    assert.match(migration, /organization_name_snapshot text not null/);
    assert.match(
      migration,
      /Survives org rename or sub-account disconnect/i,
    );
    assert.doesNotMatch(migration, /licensee_sub_account_id/);
  });
});
