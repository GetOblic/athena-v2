/**
 * COMM-SAVED-UX-1 — additive organization-save mask.
 * Reads migration source only. Does not connect to a database.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();
const MIGRATION_NAME = "20261013000001_mask_athena_organization_communities.sql";
const MIGRATION = `supabase/migrations/${MIGRATION_NAME}`;
const CATALOG_MIGRATION =
  "supabase/migrations/20261012000004_create_athena_public_community_catalog.sql";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("organization community mask migration", () => {
  const sql = read(MIGRATION);
  const catalog = read(CATALOG_MIGRATION);

  it("is one later additive migration and does not apply SQL", () => {
    assert.equal(existsSync(join(ROOT, MIGRATION)), true);
    const names = readdirSync(join(ROOT, "supabase/migrations"))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    assert.equal(names.at(-1), MIGRATION_NAME);
    assert.ok(
      names.indexOf(MIGRATION_NAME) >
        names.indexOf("20261012000004_create_athena_public_community_catalog.sql"),
    );
    assert.match(sql, /do not apply this file from application code/i);
    assert.doesNotMatch(sql, /supabase db push/i);
    assert.doesNotMatch(sql, /\binsert\s+into\b/i);
    assert.doesNotMatch(sql, /\bdelete\s+from\b/i);
    assert.doesNotMatch(sql, /\btruncate\b/i);
    assert.doesNotMatch(sql, /\bdrop\s+(table|index|function|policy|constraint)\b/i);
    assert.doesNotMatch(sql, /\bcreate\s+table\b/i);
    assert.doesNotMatch(catalog, /removed_at/);
  });

  it("adds a nullable mask, an explanation, and an active-save index", () => {
    assert.match(
      sql,
      /alter table athena_organization_communities\s+add column if not exists removed_at timestamptz;/i,
    );
    assert.match(sql, /comment on column athena_organization_communities\.removed_at is/i);
    assert.match(sql, /without deleting the organization row/i);
    assert.match(
      sql,
      /create index if not exists athena_organization_communities_active_org_updated_idx\s+on athena_organization_communities \(organization_id, updated_at desc\)\s+where removed_at is null;/i,
    );
    assert.match(sql, /Does not alter athena_public_communities/);
    assert.doesNotMatch(sql, /alter table athena_public_communities/i);
    assert.equal((sql.match(/\balter\s+table\b/gi) ?? []).length, 1);
    assert.equal((sql.match(/\bcreate\s+index\b/gi) ?? []).length, 1);
  });
});
