import "./getoblicDirectoryTestEnv";

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { TENANT_TABLES } from "../../lib/tenantDatabase";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { GetOblicDirectoryError } from "../../services/getoblicDirectory/getoblicDirectoryErrors";
import { deleteProspect } from "../../services/prospects/prospectService";

const ROOT = process.cwd();
const MIGRATION =
  "supabase/migrations/20260906000001_create_athena_getoblic_directory.sql";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = originalFrom;
});

describe("GetOblic Directory migration / schema", () => {
  it("migration file exists and is not applied by this suite", () => {
    assert.equal(existsSync(join(ROOT, MIGRATION)), true);
    const migration = read(MIGRATION);
    assert.match(migration, /Do not apply this migration from application code/);
    assert.doesNotMatch(migration, /supabase migration up/i);
  });

  it("creates the three required tables only", () => {
    const migration = read(MIGRATION);
    assert.match(
      migration,
      /create table if not exists athena_getoblic_listing_links/,
    );
    assert.match(
      migration,
      /create table if not exists athena_getoblic_directory_settings/,
    );
    assert.match(
      migration,
      /create table if not exists athena_getoblic_listing_allocation_events/,
    );
    assert.doesNotMatch(migration, /alter table prospects/i);
    assert.doesNotMatch(migration, /alter table athena_asset_interactions/i);
    assert.doesNotMatch(migration, /create table if not exists getoblic_links/i);
  });

  it("enforces global active wordpress_listing_id uniqueness, not per organization", () => {
    const migration = read(MIGRATION);
    const linksSection = migration.slice(
      0,
      migration.indexOf("athena_getoblic_directory_settings"),
    );
    assert.match(
      linksSection,
      /athena_getoblic_listing_links_one_active_per_listing/,
    );
    assert.match(
      linksSection,
      /on athena_getoblic_listing_links \(wordpress_listing_id\)/,
    );
    assert.match(
      linksSection,
      /where relationship_status in \('claiming', 'linked', 'remote_missing'\)/,
    );
    assert.doesNotMatch(
      linksSection,
      /unique \(organization_id, wordpress_listing_id\)/,
    );
    assert.doesNotMatch(
      linksSection,
      /on athena_getoblic_listing_links \(organization_id, wordpress_listing_id\)/,
    );
  });

  it("enforces one active claim per Prospect and excludes released from both partial uniques", () => {
    const migration = read(MIGRATION);
    assert.match(
      migration,
      /athena_getoblic_listing_links_one_active_per_prospect/,
    );
    assert.match(
      migration,
      /on athena_getoblic_listing_links \(prospect_id\)/,
    );
    const uniqueBlocks = migration.match(
      /create unique index if not exists athena_getoblic_listing_links_one_active[\s\S]*?;/g,
    );
    assert.ok(uniqueBlocks);
    assert.equal(uniqueBlocks?.length, 2);
    for (const block of uniqueBlocks ?? []) {
      assert.match(
        block,
        /where relationship_status in \('claiming', 'linked', 'remote_missing'\)/,
      );
      assert.doesNotMatch(block, /released/);
    }
  });

  it("includes claiming, linked, and remote_missing in both active unique indexes", () => {
    const migration = read(MIGRATION);
    const listingUnique = migration.slice(
      migration.indexOf("athena_getoblic_listing_links_one_active_per_listing"),
    );
    const prospectUnique = migration.slice(
      migration.indexOf("athena_getoblic_listing_links_one_active_per_prospect"),
    );
    for (const block of [listingUnique, prospectUnique]) {
      assert.match(block, /'claiming'/);
      assert.match(block, /'linked'/);
      assert.match(block, /'remote_missing'/);
    }
  });

  it("checks listing and author identifiers, allowance, ledger, and vocabulary", () => {
    const migration = read(MIGRATION);
    assert.match(
      migration,
      /athena_getoblic_listing_links_wordpress_listing_id_chk/,
    );
    assert.match(migration, /check \(wordpress_listing_id > 0\)/);
    assert.match(
      migration,
      /athena_getoblic_listing_links_wordpress_author_id_chk/,
    );
    assert.match(
      migration,
      /check \(wordpress_author_id is null or wordpress_author_id > 0\)/,
    );
    assert.match(
      migration,
      /athena_getoblic_directory_settings_monthly_allowance_chk/,
    );
    assert.match(migration, /check \(monthly_allowance >= 0\)/);
    assert.doesNotMatch(
      migration,
      /monthly_allowance integer not null default/,
    );
    assert.match(
      migration,
      /athena_getoblic_listing_allocation_events_wordpress_listing_id_chk/,
    );
    assert.match(
      migration,
      /athena_getoblic_listing_allocation_events_idempotency_key_unique/,
    );
    assert.match(migration, /unique \(idempotency_key\)/);
    assert.match(
      migration,
      /athena_getoblic_listing_allocation_events_org_listing_unique/,
    );
    assert.match(
      migration,
      /unique \(organization_id, wordpress_listing_id\)/,
    );
    assert.match(
      migration,
      /athena_getoblic_listing_links_relationship_status_chk/,
    );
    assert.match(
      migration,
      /relationship_status in \(\s*'claiming',\s*'linked',\s*'remote_missing',\s*'released'/,
    );
    assert.match(
      migration,
      /athena_getoblic_listing_links_relationship_origin_chk/,
    );
    assert.match(
      migration,
      /relationship_origin in \('linked_existing', 'created'\)/,
    );
    assert.match(migration, /athena_getoblic_listing_links_kb_push_status_chk/);
    assert.match(migration, /kb_push_status in \('never', 'success', 'failed'\)/);
    assert.match(
      migration,
      /athena_getoblic_listing_allocation_events_event_kind_chk/,
    );
    assert.match(
      migration,
      /event_kind in \('allocate_existing', 'create_listing'\)/,
    );
  });

  it("restricts Prospect delete and uses org-owned FKs without RLS", () => {
    const migration = read(MIGRATION);
    assert.match(
      migration,
      /prospect_id uuid not null\s+references prospects\(id\) on delete restrict/,
    );
    assert.match(
      migration,
      /organization_id uuid not null\s+references organizations\(id\) on delete cascade/,
    );
    assert.match(
      migration,
      /organization_id uuid primary key\s+references organizations\(id\) on delete cascade/,
    );
    assert.doesNotMatch(migration, /enable row level security/i);
    assert.doesNotMatch(migration, /create policy/i);
  });

  it("does not invent WordPress, claim APIs, or release writes", () => {
    const migration = read(MIGRATION);
    assert.doesNotMatch(migration, /wp-json/);
    assert.doesNotMatch(migration, /create or replace function/);
    const service = read(
      "services/getoblicDirectory/getoblicDirectoryService.ts",
    );
    assert.doesNotMatch(service, /relationship_status:\s*["']released["']/);
    assert.doesNotMatch(service, /\.insert\(/);
    assert.doesNotMatch(service, /\.update\(/);
    assert.doesNotMatch(service, /getoblic-links/);
  });
});

describe("GetOblic Directory tenant isolation", () => {
  it("registers the three organization-owned tables in TENANT_TABLES", () => {
    assert.ok(TENANT_TABLES.includes("athena_getoblic_listing_links"));
    assert.ok(TENANT_TABLES.includes("athena_getoblic_directory_settings"));
    assert.ok(
      TENANT_TABLES.includes("athena_getoblic_listing_allocation_events"),
    );
  });

  it("scopes ordinary service reads by organization_id and bounds the global check", () => {
    const service = read(
      "services/getoblicDirectory/getoblicDirectoryService.ts",
    );
    assert.match(service, /getGetOblicDirectorySettings/);
    assert.match(service, /\.eq\("organization_id", organizationId\)/);
    assert.match(service, /getActiveGetOblicLinkForProspect/);

    const globalFn = service.slice(
      service.indexOf("export async function getActiveGetOblicClaimByWordPressListingId"),
      service.indexOf("export async function determineGetOblicListingClaimAvailability"),
    );
    assert.match(globalFn, /\.eq\("wordpress_listing_id", wordpressListingId\)/);
    assert.doesNotMatch(globalFn, /\.eq\("organization_id"/);
    assert.match(globalFn, /LINK_CONFLICT_COLUMNS/);
    assert.match(
      service,
      /organization_id, prospect_id, relationship_status/,
    );

    const availabilityFn = service.slice(
      service.indexOf("export async function determineGetOblicListingClaimAvailability"),
    );
    assert.match(availabilityFn, /classifyGetOblicListingClaimAvailability/);
    assert.doesNotMatch(
      read("app/api/prospects/[id]/route.ts"),
      /getActiveGetOblicClaimByWordPressListingId/,
    );
  });

  it("does not depend on GetOblic Links", () => {
    const types = read("services/getoblicDirectory/getoblicDirectoryTypes.ts");
    const service = read(
      "services/getoblicDirectory/getoblicDirectoryService.ts",
    );
    const googleId = read("services/getoblicDirectory/getoblicGoogleId.ts");
    for (const source of [types, service, googleId]) {
      assert.doesNotMatch(source, /getoblic-links/);
      assert.doesNotMatch(source, /GETOBLIC_LINKS_/);
    }
  });
});

describe("Prospect delete safety for GetOblic claims", () => {
  it("preflights an active claim before bridge cleanup and does not release", () => {
    const service = read("services/prospects/prospectService.ts");
    const deleteBlock = service.slice(
      service.indexOf("export async function deleteProspect"),
    );
    const claimGuardIndex = deleteBlock.indexOf(
      "getActiveGetOblicLinkForProspect",
    );
    const discussionDeleteIndex = deleteBlock.indexOf("await deleteDiscussion");
    const prospectDeleteIndex = deleteBlock.indexOf('.from("prospects")');
    assert.ok(claimGuardIndex >= 0);
    assert.ok(discussionDeleteIndex > claimGuardIndex);
    assert.ok(prospectDeleteIndex > claimGuardIndex);
    assert.match(deleteBlock, /getOblicListingActiveClaimError/);
    const errors = read("services/getoblicDirectory/getoblicDirectoryErrors.ts");
    assert.match(errors, /GETOBLIC_LISTING_ACTIVE_CLAIM/);
    assert.doesNotMatch(deleteBlock, /relationship_status:\s*["']released["']/);
    assert.doesNotMatch(deleteBlock, /from\("athena_getoblic_listing_links"\)/);

    const route = read("app/api/prospects/[id]/route.ts");
    assert.match(route, /GETOBLIC_LISTING_ACTIVE_CLAIM/);
    assert.match(route, /GetOblicDirectoryError/);
    assert.match(route, /409/);
  });

  it("blocks hard delete for claiming, linked, and remote_missing without mutating mappings", async () => {
    for (const status of ["claiming", "linked", "remote_missing"] as const) {
      const mutations: string[] = [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabaseAdmin as any).from = (table: string) => {
        const filters: Record<string, unknown> = {};
        const builder = {
          select: () => builder,
          eq: (column: string, value: unknown) => {
            filters[column] = value;
            return builder;
          },
          in: () => builder,
          maybeSingle: async () => {
            if (table === "prospects") {
              return {
                data: {
                  id: "prospect-1",
                  organization_id: "org-1",
                  business_name: "Test",
                  linked_discussion_id: null,
                  lifecycle_status: "New",
                  created_at: "2026-09-01T00:00:00.000Z",
                  updated_at: "2026-09-01T00:00:00.000Z",
                },
                error: null,
              };
            }
            if (table === "athena_getoblic_listing_links") {
              return {
                data: {
                  id: "link-1",
                  organization_id: "org-1",
                  prospect_id: "prospect-1",
                  wordpress_listing_id: 123,
                  google_id_snapshot: null,
                  google_id_is_matchable: false,
                  relationship_origin: "linked_existing",
                  relationship_status: status,
                  wordpress_author_id: null,
                  allocated_at: null,
                  last_verified_at: null,
                  last_remote_error: null,
                  last_remote_error_at: null,
                  kb_push_status: "never",
                  kb_last_pushed_executive_version_id: null,
                  kb_last_content_sha256: null,
                  kb_last_pushed_at: null,
                  kb_last_push_error: null,
                  kb_last_push_error_at: null,
                  created_by_user_id: null,
                  created_via_licensee_account_id: null,
                  created_at: "2026-09-01T00:00:00.000Z",
                  updated_at: "2026-09-01T00:00:00.000Z",
                  released_at: null,
                },
                error: null,
              };
            }
            return { data: null, error: null };
          },
          delete: () => {
            mutations.push(`delete:${table}`);
            return builder;
          },
          update: () => {
            mutations.push(`update:${table}`);
            return builder;
          },
        };
        return builder;
      };

      await assert.rejects(
        () => deleteProspect("prospect-1", "org-1"),
        (error: unknown) => {
          assert.ok(error instanceof GetOblicDirectoryError);
          assert.equal(error.code, "GETOBLIC_LISTING_ACTIVE_CLAIM");
          return true;
        },
      );
      assert.deepEqual(mutations, []);
    }
  });
});
