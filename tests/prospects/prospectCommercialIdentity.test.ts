/**
 * EST-QUOTE-1C.2 — Prospect commercial identity create/update.
 * Mocks Supabase. Does not write the live database.
 */

import "../organization/organizationLanguageTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import {
  createProspect,
  updateProspect,
} from "../../services/prospects/prospectService";

const ROOT = process.cwd();
const ORG_A = "org-a";
const ORG_B = "org-b";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);

type ProspectRow = Record<string, unknown> & {
  id: string;
  organization_id: string;
};

function installProspectStore(rows: ProspectRow[]) {
  let seq = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = (table: string) => {
    const filters: Record<string, string> = {};
    let pendingInsert: Record<string, unknown> | null = null;
    let pendingUpdate: Record<string, unknown> | null = null;
    let headCount = false;

    const matches = (row: ProspectRow) =>
      Object.entries(filters).every(
        ([column, value]) => String(row[column] ?? "") === value,
      );

    const builder = {
      select(_columns?: string, options?: { head?: boolean }) {
        headCount = Boolean(options?.head);
        return builder;
      },
      eq(column: string, value: string) {
        filters[column] = value;
        return builder;
      },
      insert(values: Record<string, unknown>) {
        if (table !== "prospects") {
          return builder;
        }
        pendingInsert = values;
        return builder;
      },
      update(values: Record<string, unknown>) {
        pendingUpdate = values;
        return builder;
      },
      async maybeSingle() {
        const found = rows.find(matches) ?? null;
        return { data: found, error: null };
      },
      async single() {
        if (pendingInsert) {
          seq += 1;
          const row = {
            id: `prospect-${seq}`,
            created_at: "2026-10-09T00:00:00.000Z",
            updated_at: "2026-10-09T00:00:00.000Z",
            linked_discussion_id: null,
            community_id: null,
            user_id: null,
            status: "Queued",
            lifecycle_status: "New",
            opportunity_score: null,
            priority: 0,
            website_intelligence: null,
            raw_json: null,
            generated_listing_description: null,
            last_activity: "2026-10-09T00:00:00.000Z",
            ...pendingInsert,
          } as ProspectRow;
          rows.push(row);
          return { data: row, error: null };
        }
        if (pendingUpdate) {
          const found = rows.find(matches);
          if (!found) {
            return { data: null, error: { message: "not found" } };
          }
          Object.assign(found, pendingUpdate);
          return { data: found, error: null };
        }
        return { data: null, error: { message: "not found" } };
      },
      then(
        onFulfilled?: (value: {
          data: unknown;
          error: unknown;
          count: number | null;
        }) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        const matched = table === "prospects" ? rows.filter(matches) : [];
        return Promise.resolve({
          data: headCount ? null : matched,
          error: null,
          count: matched.length,
        }).then(onFulfilled, onRejected);
      },
    };

    return builder;
  };
}

function restoreSupabaseAdmin() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = originalFrom;
}

describe("Prospect commercial identity", () => {
  afterEach(() => {
    restoreSupabaseAdmin();
  });

  it("creates and updates commercial fields inside the tenant, trimming blanks to null", async () => {
    const rows: ProspectRow[] = [];
    installProspectStore(rows);

    const created = await createProspect({
      organization_id: ORG_A,
      business_name: "  Acme Trading  ",
      legal_name: "  Acme Ltd  ",
      address_line2: "  ",
      postal_code: "  10001 ",
      registration_number: "  REG-1 ",
      tax_identifier: "   ",
      tax_identifier_label: " VAT ",
      email: " buyer@acme.test ",
    });

    assert.ok(created);
    assert.equal(created.organization_id, ORG_A);
    assert.equal(created.business_name, "Acme Trading");
    assert.equal(created.legal_name, "Acme Ltd");
    assert.equal(created.address_line2, null);
    assert.equal(created.postal_code, "10001");
    assert.equal(created.registration_number, "REG-1");
    assert.equal(created.tax_identifier, null);
    assert.equal(created.tax_identifier_label, "VAT");
    assert.equal(created.email, "buyer@acme.test");

    const wrongTenant = await updateProspect(created.id, ORG_B, {
      legal_name: "Other Tenant Ltd",
      postal_code: "99999",
    });
    assert.equal(wrongTenant, null);
    assert.equal(rows[0]?.legal_name, "Acme Ltd");
    assert.equal(rows[0]?.postal_code, "10001");

    const updated = await updateProspect(created.id, ORG_A, {
      legal_name: "  ",
      address_line2: " Floor 2 ",
      tax_identifier: " EIN-9 ",
    });
    assert.ok(updated);
    assert.equal(updated.legal_name, null);
    assert.equal(updated.address_line2, "Floor 2");
    assert.equal(updated.tax_identifier, "EIN-9");
    assert.equal(updated.postal_code, "10001");
    assert.equal(updated.organization_id, ORG_A);
  });

  it("keeps create and update authorized by the session organization", () => {
    const post = read("app/api/prospects/route.ts");
    const patch = read("app/api/prospects/[id]/route.ts");
    const service = read("services/prospects/prospectService.ts");

    assert.match(post, /requireCurrentOrganizationContext/);
    assert.match(post, /organization_id: _organizationId/);
    assert.match(post, /legal_name:/);
    assert.match(post, /address_line2:/);
    assert.match(post, /postal_code:/);
    assert.match(post, /registration_number:/);
    assert.match(post, /tax_identifier:/);
    assert.match(post, /tax_identifier_label:/);
    assert.match(patch, /requireCurrentOrganizationContext/);
    assert.match(patch, /updateProspect\(id, organizationId/);
    assert.match(patch, /legal_name: optionalString\(body\.legal_name\)/);
    assert.match(service, /\.eq\("organization_id", organizationId\)/);

    const editor = read("components/prospects/ProspectMetadataEditor.tsx");
    for (const field of [
      "legal_name",
      "address_line2",
      "postal_code",
      "registration_number",
      "tax_identifier",
      "tax_identifier_label",
      "business_name",
      "address",
      "decision_maker",
      "job_title",
    ]) {
      assert.match(editor, new RegExp(`"${field}"`));
    }
  });

  it("does not add commercial columns to GetOblic, Google, or CSV mappings", () => {
    const google = read("lib/prospects/freeGoogleProspectMapping.ts");
    const getoblic = read(
      "services/getoblicDirectory/getoblicDirectoryConvertService.ts",
    );
    const csv = read("services/prospects/prospectCsv.ts");
    for (const field of [
      "legal_name",
      "address_line2",
      "postal_code",
      "registration_number",
      "tax_identifier",
    ]) {
      assert.doesNotMatch(google, new RegExp(field));
      assert.doesNotMatch(getoblic, new RegExp(field));
      assert.doesNotMatch(csv, new RegExp(field));
    }
  });
});
