import "./socialPlannerTestEnv";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { SOCIAL_CALENDAR_GENERATION_JOB_RPCS } from "../../services/socialPlanner/socialCalendarGenerationJobs/socialCalendarGenerationJobTypes";
import { TENANT_TABLES } from "../../lib/tenantDatabase";

const ROOT = process.cwd();
const L1 = "supabase/migrations/20260819000001_create_athena_social_calendars.sql";
const L9 =
  "supabase/migrations/20260820000001_create_athena_social_calendar_conversation.sql";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Social Planner L9 migration contracts", () => {
  it("adds an additive L9 file without amending L1 RPCs", () => {
    assert.equal(existsSync(join(ROOT, L9)), true);
    const l1 = read(L1);
    const l9 = read(L9);
    assert.match(l9, /create table if not exists athena_social_calendar_messages/);
    assert.doesNotMatch(l9, /create or replace function complete_athena_social_calendar_generation_job/);
    assert.doesNotMatch(l9, /create or replace function fail_athena_social_calendar_generation_job/);
    assert.doesNotMatch(l9, /create or replace function claim_athena_social_calendar_generation_job/);
    assert.equal(
      SOCIAL_CALENDAR_GENERATION_JOB_RPCS.complete,
      "complete_athena_social_calendar_generation_job",
    );
    assert.match(
      l1,
      /complete_athena_social_calendar_generation_job\(\s*p_job_id uuid,\s*p_claim_token uuid,\s*p_package_json jsonb,\s*p_calendar_context_json jsonb,\s*p_provenance_json jsonb\s*\)/s,
    );
    assert.doesNotMatch(l9, /p_revision_context_json/);
  });

  it("creates the message table with role, content, FKs, and indexes", () => {
    const migration = read(L9);
    assert.match(migration, /role text not null\s+check \(role in \('user', 'assistant'\)\)/);
    assert.match(migration, /content text not null\s+check \(char_length\(trim\(content\)\) > 0\)/);
    assert.match(
      migration,
      /social_calendar_id uuid not null\s+references athena_social_calendars\(id\) on delete cascade/,
    );
    assert.match(
      migration,
      /organization_id uuid not null\s+references organizations\(id\) on delete cascade/,
    );
    assert.match(
      migration,
      /athena_social_calendar_messages_calendar_created_idx/,
    );
    assert.match(
      migration,
      /on athena_social_calendar_messages \(social_calendar_id, created_at\)/,
    );
    assert.match(
      migration,
      /athena_social_calendar_messages_org_calendar_created_idx/,
    );
    assert.match(
      migration,
      /on athena_social_calendar_messages \(organization_id, social_calendar_id, created_at\)/,
    );
    assert.doesNotMatch(migration, /licensee_account_id/);
    assert.doesNotMatch(migration, /enable row level security/i);
    assert.doesNotMatch(migration, /create policy/i);
  });

  it("adds revision_context_json with object and generation-mode checks", () => {
    const migration = read(L9);
    assert.match(migration, /add column if not exists revision_context_json jsonb/);
    assert.match(migration, /athena_social_calendars_revision_context_object_chk/);
    assert.match(
      migration,
      /revision_context_json is null\s+or jsonb_typeof\(revision_context_json\) = 'object'/,
    );
    assert.match(migration, /athena_social_calendars_revision_context_mode_chk/);
    assert.match(
      migration,
      /generation_mode = 'conversation_revision'\s+and revision_context_json is not null/,
    );
    assert.match(
      migration,
      /generation_mode is distinct from 'conversation_revision'\s+and revision_context_json is null/,
    );
  });

  it("registers only the message table in TENANT_TABLES and never executes SQL", () => {
    assert.ok(TENANT_TABLES.includes("athena_social_calendar_messages"));
    const l9 = read(L9);
    assert.doesNotMatch(l9, /supabase\.rpc|exec\(|psql /);
    assert.doesNotMatch(read("tests/socialPlanner/socialPlannerConversationMigration.test.ts"), /supabaseAdmin\.rpc/);
  });
});
