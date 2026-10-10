/**
 * PC-ID-1B — organization commercial identity channel persistence.
 * Mocks Supabase. Does not write the live database or apply SQL.
 */

import "./organizationLanguageTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import {
  ORGANIZATION_COMMERCIAL_FIELDS,
  PROSPECT_TO_ORGANIZATION_COMMERCIAL_FIELDS,
  normalizeOptionalCommercialText,
} from "../../services/organization/commercialIdentity";
import {
  OrganizationCommercialIdentityNotFoundError,
  getOrganizationCommercialIdentity,
  updateOrganizationCommercialIdentity,
} from "../../services/organization/organizationCommercialIdentity";

const ROOT = process.cwd();
const MIGRATION =
  "supabase/migrations/20261010000004_add_organization_commercial_identity_channels.sql";

const CHANNEL_FIELDS = [
  "whatsapp_number",
  "facebook",
  "instagram",
  "linkedin",
  "google_business_url",
  "category",
  "industry",
  "timezone",
] as const;

const PRIOR_COMMERCIAL_FIELDS = [
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
] as const;

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  language?: string | null;
  email?: string | null;
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
  whatsapp_number?: string | null;
  facebook?: string | null;
  instagram?: string | null;
  linkedin?: string | null;
  google_business_url?: string | null;
  category?: string | null;
  industry?: string | null;
  timezone?: string | null;
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
  tables: string[];
};

function installOrganizations(rows: Record<string, OrganizationRow>): CallLog {
  const calls: CallLog = { updates: [], tables: [] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = (table: string) => {
    calls.tables.push(table);
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

describe("organization commercial identity channels", () => {
  afterEach(() => {
    restoreSupabaseAdmin();
  });

  it("trims channel text and does not apply URL or timezone rules", () => {
    assert.equal(
      normalizeOptionalCommercialText(" https://facebook.com/acme/ "),
      "https://facebook.com/acme/",
    );
    assert.equal(
      normalizeOptionalCommercialText("instagram.com/acme"),
      "instagram.com/acme",
    );
    assert.equal(
      normalizeOptionalCommercialText("https://maps.google.com/maps?cid=1#reviews"),
      "https://maps.google.com/maps?cid=1#reviews",
    );
    assert.equal(normalizeOptionalCommercialText("@example"), "@example");
    assert.equal(
      normalizeOptionalCommercialText(" My Facebook Page "),
      "My Facebook Page",
    );
    assert.equal(normalizeOptionalCommercialText("localhost"), "localhost");
    assert.equal(normalizeOptionalCommercialText(" Not/AZone "), "Not/AZone");
    assert.equal(normalizeOptionalCommercialText("  "), null);
    assert.equal(normalizeOptionalCommercialText(null), null);
  });

  it("reads channel fields and leaves prior commercial fields intact", async () => {
    installOrganizations({
      "org-a": {
        id: "org-a",
        name: "Acme Trading",
        slug: "acme-trading",
        language: "fr",
        email: "login@acme.test",
        legal_name: "Acme Ltd",
        business_email: "billing@acme.test",
        decision_maker: "Ada",
        whatsapp_number: " +33 6 00 ",
        facebook: " https://facebook.com/acme/ ",
        instagram: "https://instagram.com/acme",
        linkedin: "https://www.linkedin.com/company/acme",
        google_business_url: "https://maps.google.com/maps?cid=1",
        category: " Plumber ",
        industry: " Home services ",
        timezone: " America/New_York ",
      },
    });

    const identity = await getOrganizationCommercialIdentity("org-a");
    assert.ok(identity);
    assert.equal(identity.organization_id, "org-a");
    assert.equal(identity.name, "Acme Trading");
    assert.equal(identity.legal_name, "Acme Ltd");
    assert.equal(identity.business_email, "billing@acme.test");
    assert.equal(identity.decision_maker, "Ada");
    assert.equal(identity.whatsapp_number, "+33 6 00");
    assert.equal(identity.facebook, "https://facebook.com/acme/");
    assert.equal(identity.instagram, "https://instagram.com/acme");
    assert.equal(identity.linkedin, "https://www.linkedin.com/company/acme");
    assert.equal(identity.google_business_url, "https://maps.google.com/maps?cid=1");
    assert.equal(identity.category, "Plumber");
    assert.equal(identity.industry, "Home services");
    assert.equal(identity.timezone, "America/New_York");
    assert.equal("email" in identity, false);
  });

  it("writes channel fields on the session organization and ignores name, language, and auth email", async () => {
    const rows: Record<string, OrganizationRow> = {
      "org-a": {
        id: "org-a",
        name: "Acme Trading",
        slug: "acme-trading",
        language: "fr",
        email: "login@acme.test",
        legal_name: "Old Legal",
        business_email: "billing@acme.test",
        decision_maker: "Ada",
        brand_primary_color: "#112233",
        brand_logo_storage_path: "org-a/logo.png",
        brand_font: "geist",
      },
      "org-b": {
        id: "org-b",
        name: "Other Trading",
        slug: "other-trading",
        language: "es",
        email: "login@other.test",
        legal_name: "Other Legal",
        facebook: "https://facebook.com/other",
        category: "Bakery",
      },
    };
    const calls = installOrganizations(rows);

    const saved = await updateOrganizationCommercialIdentity({
      organizationId: "org-a",
      legal_name: " Acme Ltd ",
      whatsapp_number: " +33 6 11 ",
      facebook: " facebook.com/acme/ ",
      instagram: "https://instagram.com/acme/",
      linkedin: "https://www.linkedin.com/company/acme",
      google_business_url: " https://maps.google.com/maps?cid=9 ",
      category: " Plumber ",
      industry: " Home services ",
      timezone: " Not/AZone ",
      name: "Hijacked Trading",
      language: "de",
      email: "auth@evil.test",
    } as Parameters<typeof updateOrganizationCommercialIdentity>[0]);

    assert.equal(saved.name, "Acme Trading");
    assert.equal(saved.legal_name, "Acme Ltd");
    assert.equal(saved.business_email, "billing@acme.test");
    assert.equal(saved.decision_maker, "Ada");
    assert.equal(saved.whatsapp_number, "+33 6 11");
    assert.equal(saved.facebook, "facebook.com/acme/");
    assert.equal(saved.instagram, "https://instagram.com/acme/");
    assert.equal(saved.linkedin, "https://www.linkedin.com/company/acme");
    assert.equal(saved.google_business_url, "https://maps.google.com/maps?cid=9");
    assert.equal(saved.category, "Plumber");
    assert.equal(saved.industry, "Home services");
    assert.equal(saved.timezone, "Not/AZone");
    assert.equal(saved.category === saved.industry, false);
    assert.equal(rows["org-a"]?.name, "Acme Trading");
    assert.equal(rows["org-a"]?.language, "fr");
    assert.equal(rows["org-a"]?.email, "login@acme.test");
    assert.equal(rows["org-a"]?.slug, "acme-trading");
    assert.equal(rows["org-a"]?.brand_primary_color, "#112233");
    assert.equal(rows["org-a"]?.brand_logo_storage_path, "org-a/logo.png");
    assert.equal(rows["org-a"]?.brand_font, "geist");
    assert.equal(rows["org-b"]?.legal_name, "Other Legal");
    assert.equal(rows["org-b"]?.facebook, "https://facebook.com/other");
    assert.equal(rows["org-b"]?.category, "Bakery");
    assert.equal(rows["org-b"]?.language, "es");
    assert.equal(calls.updates.length, 1);
    assert.equal(calls.updates[0]?.table, "organizations");
    assert.equal(calls.updates[0]?.filters.id, "org-a");
    assert.deepEqual(Object.keys(calls.updates[0]?.filters ?? {}), ["id"]);
    for (const forbidden of [
      "name",
      "slug",
      "language",
      "email",
      "website",
      "brand_logo_storage_path",
      "brand_primary_color",
      "brand_font",
    ]) {
      assert.equal(Object.hasOwn(calls.updates[0]?.values ?? {}, forbidden), false);
    }
    assert.equal(calls.tables.includes("auth"), false);
  });

  it("clears blank channel values and leaves omitted fields unchanged", async () => {
    const rows: Record<string, OrganizationRow> = {
      "org-a": {
        id: "org-a",
        name: "Acme Trading",
        slug: "acme-trading",
        language: "fr",
        legal_name: "Acme Ltd",
        phone: "555",
        whatsapp_number: "+33 6 00",
        facebook: "https://facebook.com/acme",
        instagram: "https://instagram.com/acme",
        linkedin: "https://linkedin.com/company/acme",
        google_business_url: "https://maps.google.com/maps?cid=1",
        category: "Plumber",
        industry: "Home services",
        timezone: "America/New_York",
      },
    };
    const calls = installOrganizations(rows);

    const saved = await updateOrganizationCommercialIdentity({
      organizationId: "org-a",
      whatsapp_number: " ",
      facebook: "",
      instagram: null,
      linkedin: "   ",
      google_business_url: "",
      category: "",
      industry: " Retail ",
      timezone: null,
    });

    assert.equal(saved.legal_name, "Acme Ltd");
    assert.equal(saved.phone, "555");
    assert.equal(saved.whatsapp_number, null);
    assert.equal(saved.facebook, null);
    assert.equal(saved.instagram, null);
    assert.equal(saved.linkedin, null);
    assert.equal(saved.google_business_url, null);
    assert.equal(saved.category, null);
    assert.equal(saved.industry, "Retail");
    assert.equal(saved.timezone, null);
    assert.equal(rows["org-a"]?.language, "fr");
    assert.equal(Object.hasOwn(calls.updates[0]?.values ?? {}, "legal_name"), false);
    assert.equal(Object.hasOwn(calls.updates[0]?.values ?? {}, "phone"), false);
    assert.equal(Object.hasOwn(calls.updates[0]?.values ?? {}, "name"), false);
    assert.equal(Object.hasOwn(calls.updates[0]?.values ?? {}, "language"), false);
  });

  it("stores handles, ordinary text, and foreign hosts without rewriting them", async () => {
    const rows: Record<string, OrganizationRow> = {
      "org-a": {
        id: "org-a",
        name: "Acme Trading",
        slug: "acme-trading",
        language: "fr",
        email: "login@acme.test",
        legal_name: "Acme Ltd",
        facebook: "@kept",
        instagram: "Kept Instagram",
        linkedin: "https://linkedin.com/company/kept",
        google_business_url: "https://maps.google.com/?cid=kept",
        category: "Plumber",
      },
      "org-b": {
        id: "org-b",
        name: "Other Trading",
        slug: "other-trading",
        facebook: "https://facebook.com/other",
      },
    };
    const calls = installOrganizations(rows);

    const saved = await updateOrganizationCommercialIdentity({
      organizationId: "org-a",
      facebook: " @example ",
      instagram: " My Facebook Page ",
      google_business_url: " https://evil.example/not-google#reviews ",
      timezone: " Not/AZone ",
    });

    assert.equal(calls.updates.length, 1);
    assert.equal(saved.facebook, "@example");
    assert.equal(saved.instagram, "My Facebook Page");
    assert.equal(saved.linkedin, "https://linkedin.com/company/kept");
    assert.equal(
      saved.google_business_url,
      "https://evil.example/not-google#reviews",
    );
    assert.equal(saved.timezone, "Not/AZone");
    assert.equal(saved.category, "Plumber");
    assert.equal(saved.legal_name, "Acme Ltd");
    assert.equal(saved.name, "Acme Trading");
    assert.equal(rows["org-a"]?.language, "fr");
    assert.equal(rows["org-a"]?.email, "login@acme.test");
    assert.equal(Object.hasOwn(calls.updates[0]?.values ?? {}, "linkedin"), false);
    assert.equal(Object.hasOwn(calls.updates[0]?.values ?? {}, "category"), false);
    assert.equal(Object.hasOwn(calls.updates[0]?.values ?? {}, "legal_name"), false);
    assert.equal(rows["org-b"]?.facebook, "https://facebook.com/other");
  });

  it("does not update a missing organization or trust a blank id", async () => {
    const rows: Record<string, OrganizationRow> = {
      "org-a": {
        id: "org-a",
        name: "Acme Trading",
        slug: "acme-trading",
        facebook: "https://facebook.com/acme",
      },
    };
    const calls = installOrganizations(rows);

    await assert.rejects(
      () =>
        updateOrganizationCommercialIdentity({
          organizationId: "missing-org",
          facebook: "https://facebook.com/nope",
        }),
      (error: unknown) =>
        error instanceof OrganizationCommercialIdentityNotFoundError,
    );
    await assert.rejects(
      () =>
        updateOrganizationCommercialIdentity({
          organizationId: "  ",
          category: "Nope",
        }),
      (error: unknown) =>
        error instanceof OrganizationCommercialIdentityNotFoundError,
    );

    assert.equal(calls.updates.length, 0);
    assert.equal(rows["org-a"]?.facebook, "https://facebook.com/acme");
    assert.equal(await getOrganizationCommercialIdentity("missing-org"), null);
  });
});

describe("organization commercial identity channel migration", () => {
  const sql = read(MIGRATION);

  it("adds eight nullable text columns and does not backfill or rewrite applied SQL", () => {
    assert.match(sql, /alter table organizations/i);
    assert.equal((sql.match(/alter table/gi) ?? []).length, 1);
    for (const column of CHANNEL_FIELDS) {
      assert.match(
        sql,
        new RegExp(`add column if not exists ${column} text`, "i"),
      );
      assert.match(sql, new RegExp(`comment on column organizations\\.${column}`, "i"));
    }
    const alterMatch = sql.match(/alter table organizations\b[\s\S]*?;/i);
    assert.ok(alterMatch);
    const alter = alterMatch[0];
    assert.doesNotMatch(alter, /not null/i);
    assert.doesNotMatch(alter, /default /i);
    assert.doesNotMatch(sql, /\bupdate\s+/i);
    assert.doesNotMatch(sql, /\binsert\s+/i);
    assert.doesNotMatch(sql, /create table|create policy|create trigger|create function|create index/i);
    assert.doesNotMatch(sql, /enable row level security/i);
    assert.doesNotMatch(sql, /rename column|drop column/i);
    assert.doesNotMatch(alter, /add column if not exists name\b/i);
    assert.doesNotMatch(alter, /add column if not exists language\b/i);
    assert.doesNotMatch(alter, /athena_identity|auth\.users/i);
    assert.match(sql, /Factual storage only/);
    assert.match(sql, /No backfill/);
    assert.match(sql, /Distinct from industry/);
    assert.match(sql, /Distinct from category/);
    assert.match(sql, /Not used for scheduling/);

    const applied = read(
      "supabase/migrations/20261009000001_create_athena_client_quote_foundation.sql",
    );
    assert.match(applied, /add column if not exists legal_name text/);
    assert.doesNotMatch(applied, /whatsapp_number/);
  });

  it("keeps channel columns out of downstream consumers while mapping them from Prospects", () => {
    for (const field of PRIOR_COMMERCIAL_FIELDS) {
      assert.equal(ORGANIZATION_COMMERCIAL_FIELDS.includes(field), true);
    }
    for (const field of CHANNEL_FIELDS) {
      assert.equal(ORGANIZATION_COMMERCIAL_FIELDS.includes(field), true);
    }

    const organization = read("services/organizationService.ts");
    for (const field of CHANNEL_FIELDS) {
      assert.match(organization, new RegExp(`${field}\\?:`));
    }
    assert.match(organization, /name: string/);
    assert.match(organization, /language\?:/);

    const persistence = read(
      "services/organization/organizationCommercialIdentity.ts",
    );
    assert.match(persistence, /\.eq\("id", organizationId\)/);
    assert.doesNotMatch(persistence, /supabaseAdmin\.auth|auth\.admin|updateUser/);
    assert.doesNotMatch(
      persistence,
      /brainContextBuilder|socialPlanner|personas\/|services\/ads|getoblic|seoReport/i,
    );

    const pure = read("services/organization/commercialIdentity.ts");
    assert.doesNotMatch(pure, /normalizeWebsiteUrl/);
    assert.doesNotMatch(pure, /OrganizationCommercialIdentityValidationError/);
    assert.doesNotMatch(pure, /about_you/);
    for (const field of CHANNEL_FIELDS) {
      assert.deepEqual(
        PROSPECT_TO_ORGANIZATION_COMMERCIAL_FIELDS.find(
          ([source, target]) => source === field && target === field,
        ),
        [field, field],
      );
    }

    const untouched = [
      "services/brain/brainContextBuilder.ts",
      "services/clientQuote/clientQuoteIssuerProfile.ts",
      "services/clientQuote/clientQuoteSeed.ts",
      "services/clientInvoice/clientInvoiceDomain.ts",
      "services/socialPlanner/generation/socialPlannerGenerationService.ts",
      "services/ads/adCampaignService.ts",
      "services/ads/adsContextComposer.ts",
      "services/seo/seoReportService.ts",
      "services/getoblicDirectory/getoblicDirectoryClaimService.ts",
      "services/licensee/licenseeProspectClientCommercialHydration.ts",
      "services/licensee/licenseeProspectClientConversion.ts",
    ];
    for (const relativePath of untouched) {
      const source = read(relativePath);
      for (const field of ["whatsapp_number", "google_business_url"] as const) {
        assert.equal(
          source.includes(field),
          false,
          `${relativePath} mentions ${field}`,
        );
      }
    }

    const brain = read("services/brain/brainContextBuilder.ts");
    assert.match(brain, /\.select\("id, name, slug"\)/);
    const issuer = read("services/clientQuote/clientQuoteIssuerProfile.ts");
    for (const field of CHANNEL_FIELDS) {
      assert.equal(issuer.includes(field), false, `issuer mentions ${field}`);
    }
    const audience = read("services/personas/prospectAudienceContextComposer.ts");
    assert.doesNotMatch(audience, /organizationCommercialIdentity|commercialIdentity/);
    const identityPage = read("app/identity/page.tsx");
    const save = identityPage.slice(
      identityPage.indexOf("async function saveBusinessInformation"),
      identityPage.indexOf("async function saveBrandIdentity"),
    );
    assert.match(save, /requireCurrentOrganizationContext/);
    assert.doesNotMatch(save, /formData\.get\(["']organization/);
    for (const field of CHANNEL_FIELDS) {
      assert.equal(save.includes(field), true, `save omits ${field}`);
    }
    assert.match(save, /readSubmittedCommercialField/);
    assert.match(save, /commercialIdentitySaveErrorCode/);
    assert.doesNotMatch(save, /upsertAthenaIdentity/);
    assert.doesNotMatch(save, /\blanguage\b/);
    assert.doesNotMatch(save, /supabaseAdmin\.auth|auth\.admin|updateUser/);

    const identityUi = [
      "app/identity/page.tsx",
      "components/identity/BusinessInformationSection.tsx",
    ];
    for (const relativePath of identityUi) {
      const source = read(relativePath);
      for (const field of CHANNEL_FIELDS) {
        assert.equal(
          source.includes(field),
          true,
          `${relativePath} missing ${field}`,
        );
      }
    }

    const brainSave = identityPage.slice(
      identityPage.indexOf("async function saveIdentity"),
      identityPage.indexOf("async function saveBusinessInformation"),
    );
    assert.match(brainSave, /upsertAthenaIdentity/);
    assert.doesNotMatch(brainSave, /updateOrganizationCommercialIdentity/);
    for (const field of CHANNEL_FIELDS) {
      assert.equal(brainSave.includes(field), false, `brain save mentions ${field}`);
    }
    const prompt = read("services/identity/prompts/masterIdentityProfilePrompt.ts");
    for (const field of [
      "whatsapp_number",
      "google_business_url",
      "instagram",
      "linkedin",
      "timezone",
    ]) {
      assert.equal(prompt.includes(field), false, `prompt mentions ${field}`);
    }
  });
});
