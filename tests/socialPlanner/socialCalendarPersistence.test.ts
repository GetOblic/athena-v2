import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  SOCIAL_CALENDAR_GENERATION_JOB_RPCS,
  isActiveSocialCalendarGenerationJobStatus,
  mapSocialCalendarGenerationJobRow,
} from "../../services/socialPlanner/socialCalendarGenerationJobs/socialCalendarGenerationJobTypes";

const ROOT = process.cwd();
const MIGRATION =
  "supabase/migrations/20260819000001_create_athena_social_calendars.sql";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Social Calendar L1 persistence foundation", () => {
  it("migration file exists and is not applied by this suite", () => {
    assert.equal(existsSync(join(ROOT, MIGRATION)), true);
  });

  it("creates org-owned calendar + job tables with Ads-style cascade and lineage restrict", () => {
    const migration = read(MIGRATION);

    assert.match(migration, /create table if not exists athena_social_calendars/);
    assert.match(
      migration,
      /create table if not exists athena_social_calendar_generation_jobs/,
    );

    assert.match(
      migration,
      /organization_id uuid not null\s+references organizations\(id\) on delete cascade/,
    );
    assert.match(
      migration,
      /user_id uuid\s+references auth\.users\(id\) on delete set null/,
    );
    assert.match(
      migration,
      /source_calendar_id uuid\s+references athena_social_calendars\(id\) on delete restrict/,
    );
    assert.match(
      migration,
      /root_calendar_id uuid\s+references athena_social_calendars\(id\) on delete restrict/,
    );
    assert.match(
      migration,
      /calendar_id uuid not null\s+references athena_social_calendars\(id\) on delete cascade/,
    );
    assert.match(
      migration,
      /requested_by uuid\s+references auth\.users\(id\) on delete set null/,
    );

    assert.match(migration, /period_start date not null/);
    assert.match(migration, /period_end date not null/);
    assert.match(
      migration,
      /athena_social_calendars_period_seven_days_chk/,
    );
    assert.match(migration, /period_end = \(period_start \+ 6\)/);
    assert.match(migration, /user_guidance text/);
    assert.match(migration, /char_length\(user_guidance\) <= 4000/);
    assert.match(migration, /generation_mode text not null default 'standard'/);
    assert.match(migration, /'conversation_revision'/);
    assert.match(migration, /package_json jsonb/);
    assert.match(
      migration,
      /provenance_json jsonb not null default '\{\}'::jsonb/,
    );
    assert.match(
      migration,
      /calendar_context_json jsonb not null default '\{\}'::jsonb/,
    );
    assert.match(
      migration,
      /status text not null\s+check \(status in \('Queued', 'Processing', 'Ready', 'Processing Failed'\)\)/,
    );
  });

  it("indexes cover org recency, job claim, and lineage access paths", () => {
    const migration = read(MIGRATION);

    assert.match(migration, /athena_social_calendars_org_created_idx/);
    assert.match(
      migration,
      /on athena_social_calendars \(organization_id, created_at desc\)/,
    );
    assert.match(migration, /athena_social_calendars_source_idx/);
    assert.match(migration, /athena_social_calendars_root_version_idx/);
    assert.match(migration, /athena_social_calendars_root_version_unique/);
    assert.match(
      migration,
      /athena_social_calendar_generation_jobs_org_idx/,
    );
    assert.match(
      migration,
      /athena_social_calendar_generation_jobs_calendar_idx/,
    );
    assert.match(
      migration,
      /athena_social_calendar_generation_jobs_claimable_idx/,
    );
    assert.match(
      migration,
      /athena_social_calendar_generation_jobs_lease_idx/,
    );
    assert.match(
      migration,
      /athena_social_calendar_generation_jobs_one_active_calendar/,
    );
    assert.match(
      migration,
      /where status in \('queued', 'processing', 'retryable'\)/,
    );
  });

  it("does not enable RLS or browser policies on ordinary tenant artifacts", () => {
    const migration = read(MIGRATION);
    assert.doesNotMatch(migration, /enable row level security/i);
    assert.doesNotMatch(migration, /create policy/i);
    assert.doesNotMatch(migration, /licensee_account_id/);
    assert.doesNotMatch(migration, /licensee_sub_account/);
  });

  it("job RPCs mirror Ads/SEO leases and Estimate Ready-immutability guards", () => {
    const migration = read(MIGRATION);

    assert.equal(
      SOCIAL_CALENDAR_GENERATION_JOB_RPCS.claim,
      "claim_athena_social_calendar_generation_job",
    );
    assert.equal(
      SOCIAL_CALENDAR_GENERATION_JOB_RPCS.heartbeat,
      "heartbeat_athena_social_calendar_generation_job",
    );
    assert.equal(
      SOCIAL_CALENDAR_GENERATION_JOB_RPCS.complete,
      "complete_athena_social_calendar_generation_job",
    );
    assert.equal(
      SOCIAL_CALENDAR_GENERATION_JOB_RPCS.fail,
      "fail_athena_social_calendar_generation_job",
    );

    for (const rpc of Object.values(SOCIAL_CALENDAR_GENERATION_JOB_RPCS)) {
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
    assert.match(migration, /status is distinct from 'Ready'/);
    assert.match(
      migration,
      /when status = 'Ready' and package_json is not null then package_json/,
    );
    assert.match(migration, /p_package_json jsonb/);
    assert.match(migration, /p_calendar_context_json jsonb/);
    assert.match(migration, /p_provenance_json jsonb/);
    assert.match(migration, /calendar_context_json required object/);
    assert.match(migration, /provenance_json required object/);
    assert.match(
      migration,
      /when status = 'Ready' and package_json is not null then calendar_context_json/,
    );
    assert.match(
      migration,
      /when status = 'Ready' and package_json is not null then provenance_json/,
    );
    assert.match(
      migration,
      /revoke all on function complete_athena_social_calendar_generation_job\(uuid, uuid, jsonb, jsonb, jsonb\) from public/,
    );
    assert.match(
      migration,
      /grant execute on function complete_athena_social_calendar_generation_job\(uuid, uuid, jsonb, jsonb, jsonb\) to service_role/,
    );
    assert.equal(
      (
        migration.match(
          /create or replace function complete_athena_social_calendar_generation_job/g,
        ) ?? []
      ).length,
      1,
    );
    assert.doesNotMatch(
      migration,
      /complete_athena_social_calendar_generation_job\(\s*p_job_id uuid,\s*p_claim_token uuid,\s*p_package_json jsonb\s*\)/,
    );
    assert.doesNotMatch(
      migration,
      /complete_athena_social_calendar_generation_job\(uuid, uuid, jsonb\)/,
    );

    assert.match(migration, /status = 'Processing'/);
    assert.match(migration, /status = 'Ready'/);
    assert.match(migration, /status = 'Processing Failed'/);

    const job = mapSocialCalendarGenerationJobRow({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      organization_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      calendar_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
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
      created_at: "2026-08-19T00:00:00.000Z",
      updated_at: "2026-08-19T00:00:00.000Z",
    });
    assert.equal(job.calendar_id, "cccccccc-cccc-4ccc-8ccc-cccccccccccc");
    assert.equal(isActiveSocialCalendarGenerationJobStatus("queued"), true);
    assert.equal(isActiveSocialCalendarGenerationJobStatus("processing"), true);
    assert.equal(isActiveSocialCalendarGenerationJobStatus("retryable"), true);
    assert.equal(isActiveSocialCalendarGenerationJobStatus("completed"), false);
  });

  it("does not persist Ask Athena messages or seven blueprint rows", () => {
    const migration = read(MIGRATION);
    assert.doesNotMatch(migration, /athena_social_calendar_messages/);
    assert.doesNotMatch(migration, /references athena_asset_blueprints/);
    assert.doesNotMatch(migration, /create table if not exists discussions/);
  });
});
