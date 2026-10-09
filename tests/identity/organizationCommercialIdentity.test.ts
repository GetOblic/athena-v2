/**
 * EST-QUOTE-1C.2 — Sub-account Business Information.
 * Mocks Supabase. Does not write the live database.
 */

import "../organization/organizationLanguageTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, it } from "node:test";
import { BusinessInformationSection } from "../../components/identity/BusinessInformationSection";
import { en } from "../../lib/tenantI18n/messages/en";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import {
  OrganizationCommercialIdentityNotFoundError,
  updateOrganizationCommercialIdentity,
} from "../../services/organization/organizationCommercialIdentity";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  language?: string | null;
  legal_name?: string | null;
  address?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  phone?: string | null;
  business_email?: string | null;
  decision_maker?: string | null;
  job_title?: string | null;
  registration_number?: string | null;
  tax_identifier?: string | null;
  tax_identifier_label?: string | null;
  brand_logo_storage_path?: string | null;
  brand_primary_color?: string | null;
  brand_font?: string | null;
};

type CallLog = {
  updates: Array<{
    table: string;
    values: Record<string, unknown>;
    filters: Record<string, string>;
  }>;
};

function installOrganizations(rows: Record<string, OrganizationRow>): CallLog {
  const calls: CallLog = { updates: [] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = (table: string) => {
    const filters: Record<string, string> = {};
    let pendingUpdate: Record<string, unknown> | null = null;

    const builder = {
      select: () => builder,
      eq(column: string, value: string) {
        filters[column] = value;
        return builder;
      },
      update(values: Record<string, unknown>) {
        pendingUpdate = values;
        return builder;
      },
      async maybeSingle() {
        if (table !== "organizations") {
          return { data: null, error: null };
        }
        const id = filters.id;
        return { data: id ? (rows[id] ?? null) : null, error: null };
      },
      async single() {
        const id = filters.id;
        const existing = id ? rows[id] : undefined;
        if (table !== "organizations" || !existing || !pendingUpdate) {
          return { data: null, error: { message: "not found" } };
        }
        calls.updates.push({
          table,
          values: pendingUpdate,
          filters: { ...filters },
        });
        Object.assign(existing, pendingUpdate);
        return { data: existing, error: null };
      },
    };

    return builder;
  };

  return calls;
}

function restoreSupabaseAdmin() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = originalFrom;
}

const emptyValues = {
  legal_name: "",
  address: "",
  address_line2: "",
  city: "",
  state: "",
  postal_code: "",
  country: "",
  phone: "",
  business_email: "",
  decision_maker: "",
  job_title: "",
  registration_number: "",
  tax_identifier: "",
  tax_identifier_label: "",
};

describe("Sub-account Business Information", () => {
  afterEach(() => {
    restoreSupabaseAdmin();
  });

  it("renders the commercial fields and the existing trading name", () => {
    const html = renderToStaticMarkup(
      createElement(BusinessInformationSection, {
        tradingName: "Acme Trading",
        initialValues: {
          ...emptyValues,
          legal_name: "Acme Ltd",
          business_email: "billing@acme.test",
        },
        saveBusinessInformation: async () => {},
        messages: en.identity.business,
      }),
    );

    assert.match(html, /Acme Trading/);
    assert.match(html, /Acme Ltd/);
    assert.match(html, /billing@acme\.test/);
    for (const name of [
      "legal_name",
      "address",
      "address_line2",
      "city",
      "state",
      "postal_code",
      "country",
      "phone",
      "business_email",
      "decision_maker",
      "job_title",
      "registration_number",
      "tax_identifier",
      "tax_identifier_label",
    ]) {
      assert.match(html, new RegExp(`name="${name}"`));
    }
    assert.doesNotMatch(html, /name="website"/);
    assert.doesNotMatch(html, /name="brand_primary_color"/);
    assert.doesNotMatch(html, /name="brand_font"/);
    assert.doesNotMatch(html, /name="name"/);

    const page = read("app/identity/page.tsx");
    assert.match(page, /BusinessInformationSection/);
    assert.match(page, /BrandIdentitySection/);
    assert.match(page, /upsertAthenaIdentity/);
    const save = page.slice(
      page.indexOf("async function saveBusinessInformation"),
      page.indexOf("async function saveBrandIdentity"),
    );
    assert.match(save, /requireCurrentOrganizationContext/);
    assert.match(save, /updateOrganizationCommercialIdentity/);
    assert.doesNotMatch(save, /formData\.get\(["']organization/);
    assert.doesNotMatch(save, /upsertAthenaIdentity/);
    assert.doesNotMatch(save, /updateOrganizationBrandIdentity/);
  });

  it("saves only the session organization commercial columns and trims blanks to null", async () => {
    const rows: Record<string, OrganizationRow> = {
      "org-a": {
        id: "org-a",
        name: "Acme Trading",
        slug: "acme-trading",
        language: "fr",
        brand_primary_color: "#112233",
        brand_logo_storage_path: "org-a/logo.png",
        brand_font: "geist",
        legal_name: "Old Legal",
      },
      "org-b": {
        id: "org-b",
        name: "Other Trading",
        slug: "other-trading",
        legal_name: "Other Legal",
      },
    };
    const calls = installOrganizations(rows);

    const saved = await updateOrganizationCommercialIdentity({
      organizationId: "org-a",
      legal_name: "  Acme Ltd  ",
      address: "  ",
      address_line2: " Floor 2 ",
      city: " Paris ",
      state: "",
      postal_code: " 75001 ",
      country: " FR ",
      phone: "  ",
      business_email: " billing@acme.test ",
      decision_maker: " Ada ",
      job_title: "  ",
      registration_number: " RCS-1 ",
      tax_identifier: " FR99 ",
      tax_identifier_label: " TVA ",
    });

    assert.equal(saved.organization_id, "org-a");
    assert.equal(saved.name, "Acme Trading");
    assert.equal(saved.legal_name, "Acme Ltd");
    assert.equal(saved.address, null);
    assert.equal(saved.address_line2, "Floor 2");
    assert.equal(saved.postal_code, "75001");
    assert.equal(saved.phone, null);
    assert.equal(saved.business_email, "billing@acme.test");
    assert.equal(saved.job_title, null);
    assert.equal(rows["org-a"]?.language, "fr");
    assert.equal(rows["org-a"]?.slug, "acme-trading");
    assert.equal(rows["org-a"]?.brand_primary_color, "#112233");
    assert.equal(rows["org-a"]?.brand_logo_storage_path, "org-a/logo.png");
    assert.equal(rows["org-a"]?.brand_font, "geist");
    assert.equal(rows["org-b"]?.legal_name, "Other Legal");
    assert.equal(calls.updates.length, 1);
    assert.equal(calls.updates[0]?.filters.id, "org-a");
    for (const forbidden of [
      "name",
      "slug",
      "language",
      "website",
      "brand_logo_storage_path",
      "brand_primary_color",
      "brand_font",
    ]) {
      assert.equal(Object.hasOwn(calls.updates[0]?.values ?? {}, forbidden), false);
    }

    await assert.rejects(
      () =>
        updateOrganizationCommercialIdentity({
          organizationId: "missing-org",
          legal_name: "Nope",
        }),
      (error: unknown) =>
        error instanceof OrganizationCommercialIdentityNotFoundError,
    );
    assert.equal(calls.updates.length, 1);
    assert.equal(rows["org-b"]?.legal_name, "Other Legal");
  });
});
