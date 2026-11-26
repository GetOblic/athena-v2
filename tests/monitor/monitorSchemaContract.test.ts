/**
 * SOURCE CONTRACT ONLY.
 * These tests read the Monitor migration and adapter as text.
 * They do not open a PostgreSQL connection and they do not apply SQL.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { readMonitorRpcInteger, readMonitorRpcRow } from "../../services/monitor/monitorRecords";

const ROOT = process.cwd();
const MIGRATION_NAME = "20261124000001_create_athena_monitors.sql";
const RECONCILE_NAME = "20261126000001_reconcile_athena_monitor_source_categories.sql";
const MIGRATION = `supabase/migrations/${MIGRATION_NAME}`;
const ORIGINAL_MIGRATION_SHA256 = "6a4865a833a5f62f95ba1bb5d5feafc9fb0105dd29ff705341f152c99b8d6529";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Monitor schema source contract — not a PostgreSQL runtime test", () => {
  const sql = read(MIGRATION);

  it("does not connect to a database or apply the migration", () => {
    assert.equal(existsSync(join(ROOT, MIGRATION)), true);
    assert.match(sql, /Do not apply this file from application code/i);
    assert.doesNotMatch(sql, /postgres:\/\//i);
    assert.doesNotMatch(sql, /\bdblink\b/i);
    assert.equal(process.env.MONITOR_RUN_POSTGRES, undefined);
    const names = readdirSync(join(ROOT, "supabase/migrations")).filter((name) => name.endsWith(".sql"));
    assert.equal(names.filter((name) => name.includes("athena_monitor")).length, 2);
    assert.deepEqual(names.filter((name) => name > MIGRATION_NAME), [RECONCILE_NAME]);
    assert.equal(
      createHash("sha256").update(readFileSync(join(ROOT, MIGRATION))).digest("hex"),
      ORIGINAL_MIGRATION_SHA256,
    );
  });

  it("keeps the private tables and adds shared website intelligence without client policies", () => {
    assert.equal((sql.match(/\bcreate\s+table\s+if\s+not\s+exists\b/gi) ?? []).length, 7);
    const privateTables = ["athena_monitors", "athena_monitor_jobs", "athena_monitor_observations"];
    const sharedTables = [
      "athena_monitor_sources",
      "athena_monitor_source_categories",
      "athena_monitor_public_observations",
      "athena_monitor_discovery_coverage",
    ];
    for (const table of [...privateTables, ...sharedTables]) {
      assert.match(sql, new RegExp(`create table if not exists ${table}\\b`));
      assert.match(sql, new RegExp(`alter table ${table} enable row level security`));
      assert.match(sql, new RegExp(`revoke all on table ${table} from public`));
      assert.match(sql, new RegExp(`revoke all on table ${table} from anon`));
      assert.match(sql, new RegExp(`revoke all on table ${table} from authenticated`));
      assert.match(sql, new RegExp(`grant all on table ${table} to service_role`));
    }
    for (const table of sharedTables) {
      const body = sql.match(new RegExp(`create table if not exists ${table} \\(([\\s\\S]*?)\\n\\);`));
      assert.ok(body?.[1]);
      assert.doesNotMatch(body?.[1] ?? "", /\borganization_id\s+(uuid|text|bigint)\b/);
    }
    assert.match(
      sql,
      /foreign key \(monitor_id, organization_id\)\s+references athena_monitors \(id, organization_id\)/i,
    );
    assert.match(
      sql,
      /foreign key \(job_id, monitor_id, organization_id\)\s+references athena_monitor_jobs \(id, monitor_id, organization_id\)/i,
    );
    assert.match(sql, /public_observation_id uuid not null references athena_monitor_public_observations\(id\)/);
    assert.match(sql, /public_observation_id_rejected/);
    assert.match(sql, /batch_deadline_at/);
    assert.match(sql, /request_timeout_ms/);
    assert.doesNotMatch(sql, /\bcreate\s+policy\b/i);
    assert.doesNotMatch(sql, /\bgrant\s+[a-z,\s]+\s+to\s+(anon|authenticated)\b/i);
    assert.doesNotMatch(sql, /\bdrop\s+table\b/i);
    assert.doesNotMatch(sql, /\btruncate\b/i);
    assert.doesNotMatch(sql, /\bdelete\s+from\b/i);
    assert.doesNotMatch(sql, /\balter\s+table\s+(public\.)?organizations\b/i);
    assert.doesNotMatch(sql, /\balter\s+table\s+(public\.)?athena_generation_jobs\b/i);
    const inserts = [...sql.matchAll(/\binsert\s+into\s+((?:public\.)?athena_monitor_[a-z_]+)/gi)].map(
      (match) => match[1] ?? "",
    );
    assert.ok(inserts.length >= 2);
    assert.ok(inserts.every((target) => target.startsWith("public.athena_monitor_")));
  });

  it("defines the lifecycle fence, immutable snapshot, and idempotent observation identity", () => {
    assert.match(sql, /status in \([\s\S]*'queued'[\s\S]*'processing'[\s\S]*'completed'[\s\S]*'partial'[\s\S]*'failed'[\s\S]*'blocked'[\s\S]*'cancelled'/);
    assert.match(sql, /where status in \('queued', 'processing'\)/);
    assert.match(sql, /cancellation_requested_at is null/);
    assert.match(sql, /claim_expires_at < v_now/);
    assert.match(sql, /claim_token = p_claim_token/);
    assert.match(sql, /claim_expires_at > v_now/);
    assert.match(sql, /on conflict \(job_id, source_id, family_id\) do nothing/i);
    assert.match(sql, /monitor_observation_immutable/);
    assert.match(sql, /monitor_job_snapshot_immutable/);
    assert.match(sql, /p_status = 'completed'/);
    assert.match(sql, /last_successful_job_id = v_job\.id/);
    assert.match(sql, /for update skip locked/i);
    assert.match(sql, /athena_monitor_observations_result_page_idx/);
    assert.match(sql, /monitor_result_page_bound/);
    assert.match(sql, /monitor_result_fact_bound/);
    assert.match(sql, /p_page_size > 24/);
    assert.match(sql, /category_name/);
    assert.match(sql, /rawHtml/);
    assert.doesNotMatch(sql, /\bhtml_body\b|\braw_html\b|\bbytea\b/i);
    for (const name of [
      "claim_athena_monitor_job",
      "heartbeat_athena_monitor_job",
      "publish_athena_monitor_observations",
      "yield_athena_monitor_job",
      "finalize_athena_monitor_job",
      "request_athena_monitor_job_cancellation",
      "recover_athena_monitor_jobs",
      "page_athena_monitor_observations",
      "list_athena_monitor_observation_facts",
      "get_athena_monitor_observations_by_ids",
    ]) {
      assert.match(sql, new RegExp(`revoke all on function public\\.${name}\\b`));
      assert.match(sql, new RegExp(`grant execute on function public\\.${name}\\b`));
    }
  });

  it("keeps the Supabase adapter on organization filters and SQL functions", () => {
    const adapter = read("services/monitor/monitorSupabaseStore.ts");
    assert.match(adapter, /claim_athena_monitor_job/);
    assert.match(adapter, /publish_athena_monitor_observations/);
    assert.match(adapter, /finalize_athena_monitor_job/);
    assert.match(adapter, /\.eq\("organization_id"/);
    assert.match(adapter, /does not connect/i);
    assert.doesNotMatch(adapter, /athenaWorker|ecosystem\.config|playwright|openai/i);
    const domain = readdirSync(join(ROOT, "services/monitor"))
      .filter((name) => name.endsWith(".ts"))
      .map((name) => read(`services/monitor/${name}`))
      .join("\n");
    assert.doesNotMatch(domain, /playwright|crawlee|openai|anthropic|generateText/);
    assert.equal(readMonitorRpcRow([{ id: null }]), null);
    assert.equal(readMonitorRpcRow({ id: "job-1", status: "processing" })?.id, "job-1");
    assert.equal(readMonitorRpcInteger(null), null);
    assert.equal(readMonitorRpcInteger(2), 2);
    assert.match(adapter, /reconcile_athena_monitor_source_categories/);
    assert.doesNotMatch(adapter, /from\("athena_monitor_source_categories"\)[\s\S]{0,80}\.(insert|update|delete)\(/);
  });

  it("keeps the additive category publication function server-side", () => {
    const sql = read(`supabase/migrations/${RECONCILE_NAME}`);
    assert.match(sql, /reconcile_athena_monitor_source_categories/);
    assert.match(sql, /for update/);
    assert.match(sql, /security invoker/i);
    assert.match(sql, /set search_path = pg_catalog, public/);
    assert.match(sql, /revoke all on function public\.reconcile_athena_monitor_source_categories\(uuid, timestamptz, boolean, jsonb\) from public/);
    assert.match(sql, /revoke all on function public\.reconcile_athena_monitor_source_categories\(uuid, timestamptz, boolean, jsonb\) from anon/);
    assert.match(sql, /revoke all on function public\.reconcile_athena_monitor_source_categories\(uuid, timestamptz, boolean, jsonb\) from authenticated/);
    assert.match(sql, /grant execute on function public\.reconcile_athena_monitor_source_categories\(uuid, timestamptz, boolean, jsonb\) to service_role/);
    assert.doesNotMatch(sql, /\bdelete\s+from\b/i);
    assert.doesNotMatch(sql, /\bdrop\s+table\b/i);
    assert.doesNotMatch(sql, /organization_id/i);
    assert.doesNotMatch(sql, /^\s*execute\s+/im);
    assert.doesNotMatch(sql, /athena_monitors|athena_monitor_jobs|athena_monitor_observations|athena_monitor_discovery_coverage|athena_monitor_public_observations/);
  });
});
