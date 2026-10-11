/**
 * CO-UNCLAIMED-1 Gate 3A — static SQL contract.
 * Reads the migration source only. Does not connect to a database.
 */

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();
const MIGRATION_NAME = "20261011000001_allow_unclaimed_getoblic_prospects.sql";
const MIGRATION = `supabase/migrations/${MIGRATION_NAME}`;
const PREVIOUS_MIGRATION =
  "supabase/migrations/20261010000004_add_organization_commercial_identity_channels.sql";
const CAPACITY_MIGRATION =
  "supabase/migrations/20260916000005_enforce_organization_prospect_capacity.sql";
const ACQUIRE_SIGNATURE =
  "acquire_unclaimed_getoblic_prospect(uuid, bigint, text, uuid, text, text, text, text, text, text, text, text, text)";
const TOKEN_SETTING = "athena.unclaimed_getoblic_prospect_authorization";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function functionBody(sql: string, name: string): string {
  const start = sql.indexOf(`function public.${name}`);
  assert.ok(start >= 0, `missing function ${name}`);
  const asMarker = sql.indexOf("as $$", start);
  const end = sql.indexOf("$$;", asMarker);
  assert.ok(asMarker > start && end > asMarker);
  return sql.slice(asMarker, end);
}

describe("unclaimed GetOblic prospect migration contract", () => {
  const sql = read(MIGRATION);

  it("is the single migration after 20261010000004 and does not apply SQL", () => {
    assert.equal(existsSync(join(ROOT, MIGRATION)), true);
    assert.equal(existsSync(join(ROOT, PREVIOUS_MIGRATION)), true);
    const names = readdirSync(join(ROOT, "supabase/migrations"))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    assert.equal(names.at(-1), MIGRATION_NAME);
    assert.deepEqual(
      names.filter((name) => name.startsWith("20261011")),
      [MIGRATION_NAME],
    );
    assert.ok(names.includes("20261010000004_add_organization_commercial_identity_channels.sql"));
    assert.doesNotMatch(sql, /supabase db push/i);
    assert.doesNotMatch(sql, /supabase migration repair/i);
    assert.match(sql, /do not apply this migration from/i);
  });

  it("adds one NOT NULL false Licensee boolean and does not rewrite rows", () => {
    assert.equal((sql.match(/\balter\s+table\b/gi) ?? []).length, 1);
    assert.match(
      sql,
      /alter table licensee_accounts\s+add column if not exists allow_unclaimed_getoblic_prospecting boolean not null default false;/i,
    );
    assert.match(
      sql,
      /comment on column licensee_accounts\.allow_unclaimed_getoblic_prospecting is/i,
    );
    assert.match(sql, /May be enabled before Own Company designation/i);
    assert.doesNotMatch(sql, /\bupdate\s+(public\.)?licensee_accounts\b/i);
    assert.doesNotMatch(sql, /\bupdate\s+(public\.)?prospects\b/i);
    assert.doesNotMatch(sql, /\bdelete\s+from\b/i);
    assert.doesNotMatch(sql, /\btruncate\b/i);
    assert.doesNotMatch(sql, /\bdrop\s+index\b/i);
    assert.doesNotMatch(sql, /\balter\s+table\s+(public\.)?prospects\b/i);
    assert.doesNotMatch(sql, /\bcreate\s+table\b/i);
    assert.doesNotMatch(sql, /\bcreate\s+policy\b/i);
    assert.doesNotMatch(sql, /\benable\s+row\s+level\s+security\b/i);
    assert.doesNotMatch(
      sql,
      /create trigger[\s\S]{0,200}on\s+(public\.)?licensee_accounts/i,
    );
  });

  it("does not touch listing links, listing capacity, conversion, or free convert", () => {
    assert.doesNotMatch(sql, /athena_getoblic_listing_links/);
    assert.doesNotMatch(sql, /reserve_getoblic_listing_capacity/);
    assert.doesNotMatch(sql, /licensee_prospect_client_conversions/);
    assert.doesNotMatch(sql, /free_convert/);
    assert.doesNotMatch(sql, /wordpress_author_id/);
    assert.doesNotMatch(sql, /wp-json/);
    assert.doesNotMatch(sql, /\bset\s+session_replication_role\b/i);
    assert.doesNotMatch(sql, /\bdisable\s+trigger\b/i);
    assert.doesNotMatch(sql, /function organization_prospect_capacity_limit/i);
    assert.match(sql, /organization_prospect_capacity_limit\(\)/);
    const capacity = read(CAPACITY_MIGRATION);
    assert.match(capacity, /select 300;/);
    assert.doesNotMatch(capacity, /allow_unclaimed_getoblic_prospecting/);
  });
});

describe("unclaimed GetOblic capacity exemption security", () => {
  const sql = read(MIGRATION);
  const trigger = functionBody(sql, "enforce_organization_prospect_capacity");
  const gate = functionBody(sql, "unclaimed_getoblic_prospect_insert_authorized");
  const contract = functionBody(
    sql,
    "licensee_own_company_unclaimed_getoblic_authorized",
  );

  it("keeps the organization lock and the 300-row count for ordinary inserts", () => {
    const lockAt = trigger.search(/for update/i);
    const gateAt = trigger.indexOf(
      "unclaimed_getoblic_prospect_insert_authorized",
    );
    const limitAt = trigger.indexOf("organization_prospect_capacity_limit()");
    const countAt = trigger.search(/from public\.prospects/i);
    const rejectAt = trigger.indexOf("v_count >= v_limit");
    assert.ok(lockAt >= 0);
    assert.ok(gateAt > lockAt);
    assert.ok(limitAt > gateAt);
    assert.ok(countAt > limitAt);
    assert.ok(rejectAt > countAt);
    assert.match(trigger, /prospect_capacity_exceeded/);
    assert.match(
      trigger,
      /unclaimed_getoblic_prospect_insert_authorized\(\s*NEW\.id,\s*NEW\.organization_id,\s*NEW\.source,\s*NEW\.raw_json\s*\)/,
    );
    assert.doesNotMatch(
      trigger,
      /if\s+new\.source\s*=\s*'getoblic'\s+then\s+return new/i,
    );
    assert.doesNotMatch(trigger, /if\s+new\.organization_id/i);
  });

  it("binds the transaction-local token to the inserted Prospect, not an organization id", () => {
    assert.match(sql, /Rejected: organization-id-only session setting/);
    assert.match(sql, /Rejected: exemption from forged source or raw_json/);
    assert.match(sql, /Rejected: writable exemption-ticket table/);
    assert.match(sql, /Rejected: disabling triggers/);
    assert.match(sql, /Rejected: session_replication_role/);
    assert.match(sql, new RegExp(`'${TOKEN_SETTING}'`));
    assert.doesNotMatch(sql, /set_config\([\s\S]{0,240}?,\s*false\s*\)/i);
    assert.match(gate, /current_setting/);
    assert.match(gate, /set_config/);
    assert.match(gate, /p_prospect_id is distinct from v_parts\[3\]::uuid/);
    assert.match(gate, /p_organization_id is distinct from v_parts\[1\]::uuid/);
    assert.match(gate, /p_source is distinct from 'getoblic'/);
    assert.match(gate, /p_raw_json->>'origin' is distinct from 'getoblic_directory'/);
    assert.match(
      gate,
      /prospect_canonical_wordpress_listing_id\(p_raw_json\)\s+is distinct from v_parts\[2\]::bigint/,
    );
    assert.match(
      gate,
      /licensee_own_company_unclaimed_getoblic_authorized\(p_organization_id\)/,
    );

    const pattern = gate.match(/regexp_matches\(\s*v_token,\s*'([^']+)'/)?.[1];
    assert.ok(pattern);
    const token = new RegExp(pattern);
    const org = "11111111-1111-4111-8111-111111111111";
    const listing = "4401";
    const prospect = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const nonce = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    assert.match(`v1|${org}|${listing}|${prospect}|${nonce}`, token);
    assert.doesNotMatch(`v1|${org}`, token);
    assert.doesNotMatch(`${org}`, token);
    assert.doesNotMatch(`v1|${org}|${listing}`, token);
    assert.doesNotMatch(`v1|${org}|${listing}|${prospect}`, token);
    assert.doesNotMatch(`v1|${org}|0|${prospect}|${nonce}`, token);
    assert.doesNotMatch(`v1|${org}|4401.5|${prospect}|${nonce}`, token);
    assert.doesNotMatch(
      `v1|${org}|${listing}|${prospect}|${nonce}|extra`,
      token,
    );
  });

  it("requires one Own Company, one controlling relationship, the flag, and an active Master", () => {
    assert.match(contract, /v_designated_count <> 1/);
    assert.match(contract, /v_allowed is distinct from true/);
    assert.match(contract, /v_relationship_count <> 1/);
    assert.match(
      contract,
      /v_relationship_licensee_id is distinct from v_licensee_id/,
    );
    assert.match(contract, /from public\.organizations/);
    assert.match(contract, /own_company_organization_id = p_organization_id/);
    assert.match(contract, /allow_unclaimed_getoblic_prospecting/);
    assert.match(contract, /from public\.licensee_sub_accounts/);
    assert.match(contract, /from public\.account_access_status/);
    assert.match(contract, /Missing account_access_status row means active/);
    assert.match(
      contract,
      /if found and v_access_status is distinct from 'active' then/,
    );
    assert.doesNotMatch(contract, /<>\s*'deactivated'|is distinct from 'deactivated'/i);
    assert.doesNotMatch(contract, /for update/i);
  });
});

describe("unclaimed GetOblic acquisition RPC", () => {
  const sql = read(MIGRATION);
  const acquire = functionBody(sql, "acquire_unclaimed_getoblic_prospect");

  it("locks, authorizes, reuses the canonical listing, then inserts one stamped row", () => {
    const orgLock = acquire.indexOf("from public.organizations");
    const licenseeLock = acquire.indexOf("from public.licensee_accounts");
    const relationshipLock = acquire.indexOf("from public.licensee_sub_accounts");
    const accessLock = acquire.indexOf("from public.account_access_status");
    const authorize = acquire.indexOf(
      "licensee_own_company_unclaimed_getoblic_authorized",
    );
    const lookup = acquire.indexOf("from public.prospects prospect_row");
    const reuse = acquire.indexOf("inserted := false");
    const arm = acquire.indexOf("pg_catalog.set_config");
    const insert = acquire.indexOf("insert into public.prospects");
    const clear = acquire.indexOf("pg_catalog.set_config", arm + 1);
    assert.ok(orgLock >= 0);
    assert.ok(licenseeLock > orgLock);
    assert.ok(relationshipLock > licenseeLock);
    assert.ok(accessLock > relationshipLock);
    assert.ok(authorize > accessLock);
    assert.ok(lookup > authorize);
    assert.ok(reuse > lookup);
    assert.ok(arm > reuse);
    assert.ok(insert > arm);
    assert.ok(clear > insert);
    assert.equal((acquire.match(/\binsert\s+into\b/gi) ?? []).length, 1);
    assert.deepEqual(
      [...sql.matchAll(/\binsert\s+into\s+([a-z0-9_.]+)/gi)].map((match) => match[1]),
      ["public.prospects"],
    );
  });

  it("identifies an existing row only by organization, source, origin, and canonical listing id", () => {
    const lookupStart = acquire.indexOf("select prospect_row.id");
    const lookupEnd = acquire.indexOf("for update;", lookupStart);
    const lookup = acquire.slice(lookupStart, lookupEnd);
    assert.match(lookup, /prospect_row\.source = 'getoblic'/);
    assert.match(lookup, /prospect_row\.raw_json->>'origin' = 'getoblic_directory'/);
    assert.match(
      lookup,
      /prospect_canonical_wordpress_listing_id\(prospect_row\.raw_json\) = p_wordpress_listing_id/,
    );
    assert.doesNotMatch(lookup, /website|business_name|city/i);
    assert.doesNotMatch(acquire, /when unique_violation|when others/i);
    assert.match(acquire, /p_wordpress_listing_id <= 0/);
    assert.match(acquire, /unclaimed_getoblic_listing_id_invalid/);
    assert.match(acquire, /unclaimed_getoblic_prospecting_not_authorized/);
    assert.match(acquire, /length\(btrim\(p_business_name\)\) = 0/);
    assert.match(acquire, /unclaimed_getoblic_business_name_required/);
    const nameCheck = acquire.indexOf("length(btrim(p_business_name)) = 0");
    const reuse = acquire.indexOf("inserted := false");
    const insert = acquire.indexOf("insert into public.prospects");
    assert.ok(nameCheck > reuse);
    assert.ok(nameCheck < insert);
  });

  it("stamps source, origin, listing id, and Saved, and does not accept caller provenance", () => {
    const insert = acquire.slice(acquire.indexOf("insert into public.prospects"));
    assert.match(insert, /'getoblic'/);
    assert.match(insert, /'Saved'/);
    assert.match(insert, /'origin', 'getoblic_directory'/);
    assert.match(insert, /'wordpress_listing_id', p_wordpress_listing_id/);
    assert.match(insert, /v_prospect_id/);
    assert.doesNotMatch(acquire, /p_raw_json/);
    assert.doesNotMatch(insert, /source,\s*\n\s*p_/);
    assert.match(
      functionBody(sql, "prospect_canonical_wordpress_listing_id"),
      /btrim\(p_raw->>'wordpress_listing_id'\)/,
    );
    assert.match(
      functionBody(sql, "prospect_canonical_wordpress_listing_id"),
      /jsonb_typeof\(p_raw->'observed'\) = 'object'/,
    );
  });

  it("locks the RPC down to service_role and uses one definer with a fixed search_path", () => {
    const headers = [
      ...sql.matchAll(/create or replace function[\s\S]*?as \$\$/gi),
    ].map((match) => match[0]);
    const definers = headers.filter((header) => /security\s+definer/i.test(header));
    assert.equal(definers.length, 1);
    assert.match(definers[0], /acquire_unclaimed_getoblic_prospect/);
    assert.match(definers[0], /set search_path = pg_catalog, public, pg_temp/);
    assert.doesNotMatch(definers[0], /set search_path = pg_temp/i);
    for (const name of [
      "prospect_canonical_wordpress_listing_id(jsonb)",
      "licensee_own_company_unclaimed_getoblic_authorized(uuid)",
      "unclaimed_getoblic_prospect_insert_authorized(uuid, uuid, text, jsonb)",
      ACQUIRE_SIGNATURE,
      "enforce_organization_prospect_capacity()",
    ]) {
      for (const role of ["public", "anon", "authenticated"]) {
        assert.match(
          sql,
          new RegExp(
            `revoke all on function public\\.${name.replace(/[()]/g, "\\$&")} from ${role};`,
            "i",
          ),
        );
      }
      assert.match(
        sql,
        new RegExp(
          `grant execute on function public\\.${name.replace(/[()]/g, "\\$&")} to service_role;`,
          "i",
        ),
      );
    }
    assert.doesNotMatch(sql, /\bgrant\b[^;]*\bto\s+authenticated\b/i);
    assert.doesNotMatch(sql, /\bgrant\b[^;]*\bto\s+anon\b/i);
    assert.doesNotMatch(sql, /\bgrant\b[^;]*\bto\s+public\b/i);
  });
});
