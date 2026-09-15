import "../licensee/licenseeAuthTestEnv";

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { GETOBLIC_PROSPECT_PROVENANCE_ORIGIN } from "../../services/getoblicDirectory/getoblicDirectoryConvertService";
import {
  isGetOblicDerivedProspect,
  organizationOwnsActiveGetOblicClaimForProspect,
} from "../../services/prospects/prospectGetOblicOwnership";

const ROOT = process.cwd();
const ORG = "33333333-3333-4333-8333-333333333333";
const PROSPECT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = originalFrom;
});

describe("GetOblic Prospect provenance", () => {
  it("classifies from raw_json.origin and wordpress_listing_id, not business name", () => {
    assert.equal(
      isGetOblicDerivedProspect({
        raw_json: {
          origin: GETOBLIC_PROSPECT_PROVENANCE_ORIGIN,
          wordpress_listing_id: 1000,
        },
      }),
      true,
    );
    assert.equal(
      isGetOblicDerivedProspect({
        raw_json: { origin: GETOBLIC_PROSPECT_PROVENANCE_ORIGIN },
      }),
      true,
    );
    assert.equal(
      isGetOblicDerivedProspect({
        raw_json: { wordpress_listing_id: 4401 },
      }),
      true,
    );
    assert.equal(
      isGetOblicDerivedProspect({
        raw_json: { observed: { wordpress_listing_id: 12 } },
      }),
      true,
    );
    assert.equal(
      isGetOblicDerivedProspect({
        raw_json: { business_name: "Joe's Plumbing", website: "https://joesplumbing.com" },
      }),
      false,
    );
    assert.equal(isGetOblicDerivedProspect({ raw_json: null }), false);
    assert.equal(isGetOblicDerivedProspect({}), false);
  });

  it("treats claiming, linked, and remote_missing as active ownership", async () => {
    for (const status of ["claiming", "linked", "remote_missing"] as const) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabaseAdmin as any).from = () => {
        const builder = {
          select() {
            return builder;
          },
          eq() {
            return builder;
          },
          in() {
            return builder;
          },
          async maybeSingle() {
            return {
              data: {
                id: "link-1",
                organization_id: ORG,
                prospect_id: PROSPECT,
                wordpress_listing_id: 1000,
                google_id_snapshot: null,
                google_id_is_matchable: false,
                relationship_origin: "linked_existing",
                relationship_status: status,
                wordpress_author_id: 42,
                allocated_at: "2026-09-01T00:00:00.000Z",
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
          },
        };
        return builder;
      };

      assert.equal(
        await organizationOwnsActiveGetOblicClaimForProspect(ORG, PROSPECT),
        true,
        status,
      );
    }
  });

  it("does not treat a released-only row as active ownership", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabaseAdmin as any).from = () => {
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        in() {
          return builder;
        },
        async maybeSingle() {
          return { data: null, error: null };
        },
      };
      return builder;
    };

    assert.equal(
      await organizationOwnsActiveGetOblicClaimForProspect(ORG, PROSPECT),
      false,
    );
  });

  it("keeps conversion identity and email helpers unchanged", () => {
    const conversion = read(
      "services/licensee/licenseeProspectClientConversion.ts",
    );
    const email = read("services/licensee/provisionalClientAccountEmail.ts");
    const migration = read(
      "supabase/migrations/20260915000001_create_licensee_prospect_client_conversions.sql",
    );
    assert.doesNotMatch(conversion, /getoblicDirectory/);
    assert.match(email, /collisionLocalPartFallback/);
    assert.match(
      migration,
      /licensee_prospect_client_conversions_one_active_per_prospect/,
    );
    assert.match(migration, /prospect_id uuid primary key/);
  });
});
