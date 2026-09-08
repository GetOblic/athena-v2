import "./getoblicDirectoryTestEnv";

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { RESERVE_GETOBLIC_LISTING_CAPACITY_RPC } from "../../services/getoblicDirectory/getoblicDirectoryClaimService";

const ROOT = process.cwd();
const CAPACITY_RPC_MIGRATION =
  "supabase/migrations/20260910000001_reserve_getoblic_listing_capacity.sql";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("GetOblic reserve_getoblic_listing_capacity SQL contract", () => {
  it("adds exactly one new unapplied migration after the latest V2 GetOblic account migration", () => {
    assert.equal(existsSync(join(ROOT, CAPACITY_RPC_MIGRATION)), true);
    const migration = read(CAPACITY_RPC_MIGRATION);
    assert.doesNotMatch(migration, /supabase db push/i);
    assert.doesNotMatch(migration, /supabase migration repair/i);
    assert.doesNotMatch(migration, /wp-json/);
    assert.doesNotMatch(migration, /openrouter/i);
  });

  it("creates the service-role-only SECURITY DEFINER capacity RPC", () => {
    const migration = read(CAPACITY_RPC_MIGRATION);
    assert.match(
      migration,
      new RegExp(
        `create or replace function ${RESERVE_GETOBLIC_LISTING_CAPACITY_RPC}`,
        "i",
      ),
    );
    assert.match(migration, /security definer/);
    assert.match(migration, /set search_path = public/);
    assert.match(
      migration,
      /revoke all on function reserve_getoblic_listing_capacity\(uuid, uuid, bigint, date, text, uuid, uuid\) from public/i,
    );
    assert.match(
      migration,
      /grant execute on function reserve_getoblic_listing_capacity\(uuid, uuid, bigint, date, text, uuid, uuid\) to service_role/i,
    );
    assert.doesNotMatch(
      migration,
      /grant execute on function reserve_getoblic_listing_capacity[^;]+ to anon/i,
    );
  });

  it("locks settings, counts active links, and inserts claiming only after capacity is secured", () => {
    const migration = read(CAPACITY_RPC_MIGRATION);
    const body = migration.slice(
      migration.indexOf("as $$"),
      migration.lastIndexOf("$$;"),
    );
    const lockIdx = body.search(/for update/i);
    const countIdx = body.search(
      /relationship_status in \('claiming', 'linked', 'remote_missing'\)/i,
    );
    const exceedIdx = body.search(/v_held >= v_listing_capacity/i);
    const insertLinkIdx = body.search(
      /insert into athena_getoblic_listing_links/i,
    );
    assert.ok(lockIdx >= 0);
    assert.ok(countIdx > lockIdx);
    assert.ok(exceedIdx > countIdx);
    assert.ok(insertLinkIdx > exceedIdx);
    assert.match(
      body,
      /Legacy physical naming|v_listing_capacity|monthly_allowance/,
    );
    assert.doesNotMatch(
      body,
      /and e\.period_start = p_period_start[\s\S]*v_held/,
    );
  });

  it("does not let a historical allocation event bypass capacity for a new relationship", () => {
    const migration = read(CAPACITY_RPC_MIGRATION);
    assert.match(
      migration,
      /Historical events and origin Prospects do not bypass this check/,
    );
    assert.match(
      migration,
      /A historical allocation event does NOT bypass capacity/,
    );
    assert.match(
      migration,
      /Same already-active relationship may resume without consuming another slot/,
    );
  });

  it("resumes a unique-violation only for the exact org + Prospect + listing", () => {
    const migration = read(CAPACITY_RPC_MIGRATION);
    const insertStart = migration.indexOf(
      "insert into athena_getoblic_listing_links",
    );
    const uniqueInsertHandler = migration.slice(
      insertStart,
      migration.indexOf("\n  end;", insertStart),
    );

    assert.match(uniqueInsertHandler, /when unique_violation then/);
    assert.match(
      uniqueInsertHandler,
      /where l\.organization_id = p_organization_id\s+and l\.prospect_id = p_prospect_id\s+and l\.wordpress_listing_id = p_wordpress_listing_id\s+and l\.relationship_status in \('claiming', 'linked', 'remote_missing'\)/,
    );
    assert.match(uniqueInsertHandler, /if found then[\s\S]*resumed := true/);
    assert.match(uniqueInsertHandler, /conflicted := true/);
    assert.match(
      uniqueInsertHandler,
      /Same Prospect \+[\s\S]*different listing[\s\S]*conflicted, not resumed/,
    );
    assert.doesNotMatch(
      uniqueInsertHandler,
      /or l\.prospect_id = p_prospect_id/,
    );
    assert.doesNotMatch(
      uniqueInsertHandler,
      /wordpress_listing_id = p_wordpress_listing_id\s+or/,
    );
  });

  it("keeps monthly_allowance as legacy physical naming for concurrent capacity", () => {
    const migration = read(CAPACITY_RPC_MIGRATION);
    assert.match(
      migration,
      /comment on column athena_getoblic_directory_settings.monthly_allowance/i,
    );
    assert.match(migration, /Legacy physical naming/);
    assert.match(migration, /concurrent GetOblic listing capacity/i);
    assert.doesNotMatch(migration, /rename column monthly_allowance/i);
    assert.doesNotMatch(migration, /delete from athena_getoblic_listing_allocation_events/i);
  });
});
