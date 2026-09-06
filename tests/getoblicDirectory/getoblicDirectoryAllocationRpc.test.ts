import "./getoblicDirectoryTestEnv";

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CONSUME_GETOBLIC_LISTING_ALLOCATION_RPC } from "../../services/getoblicDirectory/getoblicDirectoryClaimService";

const ROOT = process.cwd();
const FOUNDATION_MIGRATION =
  "supabase/migrations/20260906000001_create_athena_getoblic_directory.sql";
const ALLOCATION_RPC_MIGRATION =
  "supabase/migrations/20260906000002_consume_getoblic_listing_allocation.sql";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("GetOblic consume_getoblic_listing_allocation SQL contract", () => {
  it("adds exactly one new migration after the Phase 2A foundation", () => {
    assert.equal(existsSync(join(ROOT, FOUNDATION_MIGRATION)), true);
    assert.equal(existsSync(join(ROOT, ALLOCATION_RPC_MIGRATION)), true);
    const foundation = read(FOUNDATION_MIGRATION);
    assert.doesNotMatch(foundation, /create or replace function/);
    assert.doesNotMatch(foundation, /consume_getoblic_listing_allocation/);
  });

  it("creates the service-role-only SECURITY DEFINER RPC", () => {
    const migration = read(ALLOCATION_RPC_MIGRATION);
    assert.match(
      migration,
      new RegExp(
        `create or replace function ${CONSUME_GETOBLIC_LISTING_ALLOCATION_RPC}`,
        "i",
      ),
    );
    assert.match(migration, /security definer/);
    assert.match(migration, /set search_path = public/);
    assert.match(migration, /language plpgsql/);
    assert.match(
      migration,
      /revoke all on function consume_getoblic_listing_allocation\(uuid, uuid, uuid, bigint, date, text, uuid, uuid\) from public/i,
    );
    assert.match(
      migration,
      /revoke all on function consume_getoblic_listing_allocation\(uuid, uuid, uuid, bigint, date, text, uuid, uuid\) from anon/i,
    );
    assert.match(
      migration,
      /revoke all on function consume_getoblic_listing_allocation\(uuid, uuid, uuid, bigint, date, text, uuid, uuid\) from authenticated/i,
    );
    assert.match(
      migration,
      /grant execute on function consume_getoblic_listing_allocation\(uuid, uuid, uuid, bigint, date, text, uuid, uuid\) to service_role/i,
    );
    assert.doesNotMatch(
      migration,
      /grant execute on function consume_getoblic_listing_allocation[^;]+ to anon/i,
    );
    assert.doesNotMatch(
      migration,
      /grant execute on function consume_getoblic_listing_allocation[^;]+ to authenticated/i,
    );
  });

  it("does not accept caller-controlled allowance or event_kind", () => {
    const migration = read(ALLOCATION_RPC_MIGRATION);
    const signature = migration.slice(
      migration.indexOf("create or replace function consume_getoblic_listing_allocation"),
      migration.indexOf("returns table"),
    );
    assert.match(signature, /p_organization_id uuid/);
    assert.match(signature, /p_prospect_id uuid/);
    assert.match(signature, /p_listing_link_id uuid/);
    assert.match(signature, /p_wordpress_listing_id bigint/);
    assert.match(signature, /p_period_start date/);
    assert.match(signature, /p_idempotency_key text/);
    assert.match(signature, /p_actor_user_id uuid default null/);
    assert.match(signature, /p_actor_licensee_account_id uuid default null/);
    assert.doesNotMatch(signature, /monthly_allowance/);
    assert.doesNotMatch(signature, /event_kind/);
    assert.doesNotMatch(signature, /p_settings/);
    assert.match(migration, /event_kind,\s+period_start,/);
    assert.match(migration, /'allocate_existing'/);
    assert.match(
      migration,
      /from athena_getoblic_directory_settings s[\s\S]*monthly_allowance/,
    );
  });

  it("serializes first-time allocations on the organization settings row", () => {
    const migration = read(ALLOCATION_RPC_MIGRATION);
    const body = migration.slice(
      migration.indexOf("as $$"),
      migration.lastIndexOf("$$;"),
    );

    const settingsLock = body.match(
      /select s\.monthly_allowance\s+into v_monthly_allowance\s+from athena_getoblic_directory_settings s\s+where s\.organization_id = p_organization_id\s+for update;/i,
    );
    assert.ok(
      settingsLock,
      "settings-row SELECT ... FOR UPDATE is the org serialization primitive",
    );

    const lockIdx = body.search(/for update/i);
    const lifetimeIdx = body.search(
      /from athena_getoblic_listing_allocation_events e\s+where e\.organization_id = p_organization_id\s+and e\.wordpress_listing_id = p_wordpress_listing_id/i,
    );
    const countIdx = body.search(/select count\(\*\)/i);
    const insertIdx = body.search(
      /insert into athena_getoblic_listing_allocation_events/i,
    );

    assert.ok(lockIdx >= 0, "FOR UPDATE is present");
    assert.ok(lifetimeIdx > lockIdx, "lifetime check occurs after FOR UPDATE");
    assert.ok(countIdx > lifetimeIdx, "period count occurs after lifetime check");
    assert.ok(insertIdx > countIdx, "insert occurs after period count");
    assert.doesNotMatch(body, /lock table athena_getoblic_directory_settings/i);
    assert.match(
      body,
      /where e\.organization_id = p_organization_id\s+and e\.period_start = p_period_start/,
    );
  });

  it("returns deterministic already / exceeded / consumed / not_configured rows", () => {
    const migration = read(ALLOCATION_RPC_MIGRATION);
    assert.match(migration, /not_configured := true/);
    assert.match(migration, /already := true/);
    assert.match(migration, /exceeded := true/);
    assert.match(migration, /consumed := true/);
    assert.match(
      migration,
      /if v_used >= v_monthly_allowance then[\s\S]*exceeded := true/i,
    );
    assert.match(
      migration,
      /p_period_start <> \(date_trunc\('month', p_period_start\)\)::date/,
    );
    assert.doesNotMatch(migration, /timezone\(/i);
    assert.doesNotMatch(migration, /at time zone/i);
  });

  it("documents that uniqueness is additional protection, not the quota lock", () => {
    const migration = read(ALLOCATION_RPC_MIGRATION);
    assert.match(migration, /Monthly quota serialization must not/);
    assert.match(migration, /rely on those constraints/);
    assert.match(migration, /when unique_violation then/);
    assert.match(migration, /Quota serialization is the settings/);
    assert.match(migration, /row lock above/);
    assert.match(
      migration,
      /Different organizations lock different settings rows/,
    );
  });

  it("does not apply itself, mutate WordPress, or invent claim/search/KB APIs", () => {
    const migration = read(ALLOCATION_RPC_MIGRATION);
    assert.doesNotMatch(migration, /supabase db push/i);
    assert.doesNotMatch(migration, /supabase migration repair/i);
    assert.doesNotMatch(migration, /wp-json/);
    assert.doesNotMatch(migration, /knowledge.base/i);
    assert.doesNotMatch(migration, /relationship_status/);
    assert.doesNotMatch(migration, /google.place/i);
  });
});

describe("GetOblic allocation concurrency source contract", () => {
  it("cannot exercise live Postgres races here; the SQL lock order is the proof", () => {
    const migration = read(ALLOCATION_RPC_MIGRATION);
    const service = read(
      "services/getoblicDirectory/getoblicDirectoryClaimService.ts",
    );

    assert.match(
      migration,
      /Two simultaneous first-time claims for DIFFERENT listings in the SAME/,
    );
    assert.match(service, /consume_getoblic_listing_allocation/);
    assert.match(service, /Monthly quota serialization/);
    assert.match(service, /lives in consume_getoblic_listing_allocation/);
    assert.doesNotMatch(service, /GETOBLIC_LISTING_ALLOCATION_EVENTS_TABLE/);

    // Limitation: this suite does not open two concurrent Postgres
    // transactions against live Athena V2. Same-org serialization is
    // proven by FOR UPDATE + count + insert inside one function.
  });
});
