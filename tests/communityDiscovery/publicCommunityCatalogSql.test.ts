/**
 * COMMUNITY-INTELLIGENCE-1 Gate 3A — static SQL contract.
 * Reads the migration source only. Does not connect to a database.
 */

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  FACEBOOK_GROUPS_IDENTITY_MAX_LENGTH,
  FACEBOOK_GROUPS_IDENTITY_MIN_LENGTH,
  FACEBOOK_GROUPS_IDENTITY_PATTERN,
  FACEBOOK_GROUPS_NUMERIC_IDENTITY_PATTERN,
  FACEBOOK_GROUPS_RESERVED_KEYS,
} from "../../services/communityDiscovery/facebookGroupsUrl";

const ROOT = process.cwd();
const MIGRATION_NAME = "20261012000004_create_athena_public_community_catalog.sql";
const MIGRATION = `supabase/migrations/${MIGRATION_NAME}`;
const PREVIOUS_MIGRATION =
  "supabase/migrations/20261012000003_accept_getoblic_stripe_payment_link_domain.sql";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function between(sql: string, start: string, end: string): string {
  const from = sql.indexOf(start);
  const to = sql.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `${start} .. ${end}`);
  return sql.slice(from, to);
}

describe("public community catalog migration", () => {
  const sql = read(MIGRATION);
  const catalog = between(
    sql,
    "create table if not exists athena_public_communities (",
    "create table if not exists athena_organization_communities (",
  );
  const relationship = between(
    sql,
    "create table if not exists athena_organization_communities (",
    "alter table athena_public_communities enable row level security;",
  );

  it("is one additive migration after 20261012000003 and does not apply SQL", () => {
    assert.equal(existsSync(join(ROOT, MIGRATION)), true);
    assert.equal(existsSync(join(ROOT, PREVIOUS_MIGRATION)), true);
    const names = readdirSync(join(ROOT, "supabase/migrations"))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    assert.equal(names.at(-1), MIGRATION_NAME);
    assert.deepEqual(
      names.filter((name) => name.startsWith("20261012000004")),
      [MIGRATION_NAME],
    );
    assert.match(sql, /do not apply this file from application code/i);
    assert.doesNotMatch(sql, /supabase db push/i);
    assert.equal((sql.match(/\bcreate\s+table\b/gi) ?? []).length, 2);
    assert.doesNotMatch(sql, /\bcreate\s+table\b[^;]*\balias\b/i);
    assert.match(sql, /No alias table/i);
    assert.match(sql, /Reddit is not implemented/i);
    assert.doesNotMatch(sql, /action_request/i);
    assert.doesNotMatch(sql, /\binsert\s+into\b/i);
    assert.doesNotMatch(sql, /\bdelete\s+from\b/i);
    assert.doesNotMatch(sql, /\btruncate\b/i);
    assert.doesNotMatch(sql, /\bdrop\s+(table|index|function|policy|constraint)\b/i);
    assert.doesNotMatch(sql, /\bcreate\s+(or\s+replace\s+)?function\b/i);
    assert.doesNotMatch(sql, /\bcreate\s+policy\b/i);
    assert.doesNotMatch(sql, /\balter\s+table\s+(public\.)?communities\b/i);
    assert.doesNotMatch(sql, /\balter\s+table\s+(public\.)?discussions\b/i);
    assert.doesNotMatch(
      sql,
      /\balter\s+table\s+(public\.)?athena_community_intelligence\b/i,
    );
  });

  it("stores public identity, provenance, and suppression without organization data", () => {
    assert.match(catalog, /platform text not null/);
    assert.match(catalog, /canonical_identity text not null/);
    assert.match(catalog, /canonical_url text not null/);
    assert.match(catalog, /display_name text not null/);
    assert.match(catalog, /source text not null/);
    assert.match(catalog, /sourced_at timestamptz not null/);
    assert.match(catalog, /created_at timestamptz not null default now\(\)/);
    assert.match(catalog, /updated_at timestamptz not null default now\(\)/);
    assert.match(
      catalog,
      /suppression_state text not null default 'active'/,
    );
    assert.match(catalog, /suppressed_at timestamptz/);
    assert.match(catalog, /check \(platform = 'facebook_groups'\)/);
    assert.doesNotMatch(catalog, /check\s*\(\s*platform\s*=\s*'reddit'/i);
    assert.match(catalog, /check \(source = 'public_url'\)/);
    assert.match(catalog, /suppression_state = 'active'/);
    assert.match(catalog, /suppression_state = 'suppressed'/);
    assert.match(
      catalog,
      /unique \(platform, canonical_identity\)/,
    );
    assert.match(catalog, /unique \(canonical_url\)/);
    assert.match(
      catalog,
      /canonical_url = 'https:\/\/www\.facebook\.com\/groups\/' \|\| canonical_identity/,
    );
    assert.match(
      catalog,
      new RegExp(
        `char_length\\(canonical_identity\\) between ${FACEBOOK_GROUPS_IDENTITY_MIN_LENGTH} and ${FACEBOOK_GROUPS_IDENTITY_MAX_LENGTH}`,
      ),
    );
    assert.match(catalog, new RegExp(escapeRegExp(FACEBOOK_GROUPS_IDENTITY_PATTERN)));
    assert.match(
      catalog,
      new RegExp(escapeRegExp(FACEBOOK_GROUPS_NUMERIC_IDENTITY_PATTERN)),
    );
    for (const key of FACEBOOK_GROUPS_RESERVED_KEYS) {
      assert.match(catalog, new RegExp(`'${key}'`));
    }
    assert.doesNotMatch(
      catalog,
      /organization_id|user_id|licensee|notes|qualification/i,
    );
  });

  it("stores one private qualification and note per organization and community", () => {
    assert.match(
      relationship,
      /organization_id uuid not null\s+references organizations\(id\) on delete cascade/,
    );
    assert.match(
      relationship,
      /community_id uuid not null\s+references athena_public_communities\(id\) on delete restrict/,
    );
    assert.match(relationship, /qualification text not null/);
    assert.match(relationship, /notes text/);
    assert.match(relationship, /unique \(organization_id, community_id\)/);
    assert.match(
      relationship,
      /qualification in \('relevant', 'not_relevant'\)/,
    );
    assert.match(relationship, /created_at timestamptz not null default now\(\)/);
    assert.match(relationship, /updated_at timestamptz not null default now\(\)/);
    assert.doesNotMatch(relationship, /platform|canonical_identity|display_name|source/i);
  });

  it("locks both tables to service_role without client policies", () => {
    for (const table of [
      "athena_public_communities",
      "athena_organization_communities",
    ]) {
      assert.match(
        sql,
        new RegExp(
          `alter table ${table} enable row level security;`,
          "i",
        ),
      );
      assert.match(
        sql,
        new RegExp(`revoke all on table ${table} from public;`, "i"),
      );
      assert.match(
        sql,
        new RegExp(`revoke all on table ${table} from anon;`, "i"),
      );
      assert.match(
        sql,
        new RegExp(`revoke all on table ${table} from authenticated;`, "i"),
      );
      assert.match(
        sql,
        new RegExp(`grant all on table ${table} to service_role;`, "i"),
      );
    }
    assert.doesNotMatch(sql, /\bgrant\b[^;]*\bto\s+(anon|authenticated)\b/i);
    assert.match(sql, /Callers must scope every read and write by organization_id/);
    assert.match(sql, /No organization-private data/);
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
