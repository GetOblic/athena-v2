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
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { readSubmittedCommercialField } from "../../services/organization/commercialIdentity";
import { ORGANIZATION_LANGUAGES } from "../../services/organizationLanguage";
import {
  OrganizationCommercialIdentityNotFoundError,
  commercialIdentitySaveErrorCode,
  getOrganizationCommercialIdentity,
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
  whatsapp_number?: string | null;
  facebook?: string | null;
  instagram?: string | null;
  linkedin?: string | null;
  google_business_url?: string | null;
  category?: string | null;
  industry?: string | null;
  timezone?: string | null;
  email?: string | null;
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
  whatsapp_number: "",
  facebook: "",
  instagram: "",
  linkedin: "",
  google_business_url: "",
  category: "",
  industry: "",
  timezone: "",
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
      "whatsapp_number",
      "facebook",
      "instagram",
      "linkedin",
      "google_business_url",
      "category",
      "industry",
      "timezone",
    ]) {
      assert.match(html, new RegExp(`name="${name}"`));
    }
    assert.ok(
      html.indexOf("Business Classification") <
        html.indexOf("Business Communication"),
    );
    assert.ok(
      html.indexOf("Business Communication") < html.indexOf("Online Presence"),
    );
    assert.ok(html.indexOf("name=\"legal_name\"") < html.indexOf("Business Classification"));
    assert.ok(
      html.indexOf("Business Communication") < html.indexOf("name=\"business_email\""),
    );
    assert.ok(
      html.indexOf("name=\"whatsapp_number\"") < html.indexOf("Online Presence"),
    );
    assert.ok(html.indexOf("Online Presence") < html.indexOf("name=\"facebook\""));
    assert.doesNotMatch(html, /type="url"/);
    assert.doesNotMatch(html, /placeholder=/);
    assert.doesNotMatch(html, /<a\b/);
    assert.match(html, /type="text"/);
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

  it("loads channel values, saves edits, reloads them, and clears blanks to null", async () => {
    const rows: Record<string, OrganizationRow> = {
      "org-a": {
        id: "org-a",
        name: "Acme Trading",
        slug: "acme-trading",
        language: "fr",
        email: "login@acme.test",
        legal_name: "Acme Ltd",
        business_email: "billing@acme.test",
        phone: "555",
        decision_maker: "Ada",
        whatsapp_number: "+33 6 00",
        facebook: "https://facebook.com/old",
        instagram: "https://instagram.com/old",
        linkedin: "https://linkedin.com/company/old",
        google_business_url: "https://maps.google.com/maps?cid=1",
        category: "Bakery",
        industry: "Food",
        timezone: "Europe/Paris",
      },
    };
    const calls = installOrganizations(rows);
    const loaded = await getOrganizationCommercialIdentity("org-a");
    assert.ok(loaded);

    const loadedHtml = renderToStaticMarkup(
      createElement(BusinessInformationSection, {
        tradingName: loaded.name,
        initialValues: {
          ...emptyValues,
          legal_name: loaded.legal_name ?? "",
          business_email: loaded.business_email ?? "",
          phone: loaded.phone ?? "",
          decision_maker: loaded.decision_maker ?? "",
          whatsapp_number: loaded.whatsapp_number ?? "",
          facebook: loaded.facebook ?? "",
          instagram: loaded.instagram ?? "",
          linkedin: loaded.linkedin ?? "",
          google_business_url: loaded.google_business_url ?? "",
          category: loaded.category ?? "",
          industry: loaded.industry ?? "",
          timezone: loaded.timezone ?? "",
        },
        saveBusinessInformation: async () => {},
        messages: en.identity.business,
      }),
    );
    assert.match(loadedHtml, /Acme Trading/);
    assert.match(loadedHtml, /value="\+33 6 00"/);
    assert.match(loadedHtml, /value="https:\/\/facebook\.com\/old"/);
    assert.match(loadedHtml, /value="Bakery"/);
    assert.match(loadedHtml, /value="Food"/);
    assert.match(loadedHtml, /value="Europe\/Paris"/);
    assert.match(loadedHtml, /value="billing@acme\.test"/);
    assert.match(loadedHtml, /value="555"/);
    assert.doesNotMatch(loadedHtml, /name="email"/);
    assert.doesNotMatch(loadedHtml, /name="language"/);
    assert.doesNotMatch(loadedHtml, /name="website"/);
    assert.doesNotMatch(loadedHtml, /login@acme\.test/);

    const form = new FormData();
    form.set("legal_name", "Acme Ltd");
    form.set("business_email", " billing@acme.test ");
    form.set("phone", "555");
    form.set("whatsapp_number", " +33 6 11 ");
    form.set("facebook", " facebook.com/acme/ ");
    form.set("instagram", "https://instagram.com/acme");
    form.set("linkedin", "https://www.linkedin.com/company/acme");
    form.set("google_business_url", " https://maps.google.com/maps?cid=9 ");
    form.set("category", " Plumber ");
    form.set("industry", " Home services ");
    form.set("timezone", " America/New_York ");

    const saved = await updateOrganizationCommercialIdentity({
      organizationId: "org-a",
      legal_name: readSubmittedCommercialField(form, "legal_name"),
      business_email: readSubmittedCommercialField(form, "business_email"),
      phone: readSubmittedCommercialField(form, "phone"),
      decision_maker: readSubmittedCommercialField(form, "decision_maker"),
      whatsapp_number: readSubmittedCommercialField(form, "whatsapp_number"),
      facebook: readSubmittedCommercialField(form, "facebook"),
      instagram: readSubmittedCommercialField(form, "instagram"),
      linkedin: readSubmittedCommercialField(form, "linkedin"),
      google_business_url: readSubmittedCommercialField(form, "google_business_url"),
      category: readSubmittedCommercialField(form, "category"),
      industry: readSubmittedCommercialField(form, "industry"),
      timezone: readSubmittedCommercialField(form, "timezone"),
    });

    assert.equal(saved.legal_name, "Acme Ltd");
    assert.equal(saved.business_email, "billing@acme.test");
    assert.equal(saved.phone, "555");
    assert.equal(saved.decision_maker, "Ada");
    assert.equal(saved.whatsapp_number, "+33 6 11");
    assert.equal(saved.facebook, "facebook.com/acme/");
    assert.equal(saved.instagram, "https://instagram.com/acme");
    assert.equal(saved.linkedin, "https://www.linkedin.com/company/acme");
    assert.equal(saved.google_business_url, "https://maps.google.com/maps?cid=9");
    assert.equal(saved.category, "Plumber");
    assert.equal(saved.industry, "Home services");
    assert.equal(saved.timezone, "America/New_York");
    assert.equal(rows["org-a"]?.name, "Acme Trading");
    assert.equal(rows["org-a"]?.language, "fr");
    assert.equal(rows["org-a"]?.email, "login@acme.test");
    assert.equal(Object.hasOwn(calls.updates[0]?.values ?? {}, "name"), false);
    assert.equal(Object.hasOwn(calls.updates[0]?.values ?? {}, "language"), false);
    assert.equal(Object.hasOwn(calls.updates[0]?.values ?? {}, "email"), false);
    assert.equal(Object.hasOwn(calls.updates[0]?.values ?? {}, "decision_maker"), false);

    const reloaded = await getOrganizationCommercialIdentity("org-a");
    assert.ok(reloaded);
    const reloadedHtml = renderToStaticMarkup(
      createElement(BusinessInformationSection, {
        tradingName: reloaded.name,
        initialValues: {
          ...emptyValues,
          legal_name: reloaded.legal_name ?? "",
          business_email: reloaded.business_email ?? "",
          phone: reloaded.phone ?? "",
          decision_maker: reloaded.decision_maker ?? "",
          whatsapp_number: reloaded.whatsapp_number ?? "",
          facebook: reloaded.facebook ?? "",
          instagram: reloaded.instagram ?? "",
          linkedin: reloaded.linkedin ?? "",
          google_business_url: reloaded.google_business_url ?? "",
          category: reloaded.category ?? "",
          industry: reloaded.industry ?? "",
          timezone: reloaded.timezone ?? "",
        },
        saveBusinessInformation: async () => {},
        messages: fr.identity.business,
      }),
    );
    assert.match(reloadedHtml, /value="\+33 6 11"/);
    assert.match(reloadedHtml, /value="facebook\.com\/acme\/"/);
    assert.doesNotMatch(reloadedHtml, /<a\b/);
    assert.match(reloadedHtml, /value="Plumber"/);
    assert.match(reloadedHtml, /value="Home services"/);
    assert.match(reloadedHtml, /value="America\/New_York"/);
    assert.match(reloadedHtml, /Catégorie/);
    assert.match(reloadedHtml, /Communication commerciale/);
    assert.doesNotMatch(reloadedHtml, />Category</);

    const clear = new FormData();
    clear.set("whatsapp_number", " ");
    clear.set("facebook", "");
    clear.set("instagram", "   ");
    clear.set("linkedin", "");
    clear.set("google_business_url", " ");
    clear.set("category", "");
    clear.set("industry", " ");
    clear.set("timezone", "");
    const cleared = await updateOrganizationCommercialIdentity({
      organizationId: "org-a",
      whatsapp_number: readSubmittedCommercialField(clear, "whatsapp_number"),
      facebook: readSubmittedCommercialField(clear, "facebook"),
      instagram: readSubmittedCommercialField(clear, "instagram"),
      linkedin: readSubmittedCommercialField(clear, "linkedin"),
      google_business_url: readSubmittedCommercialField(clear, "google_business_url"),
      category: readSubmittedCommercialField(clear, "category"),
      industry: readSubmittedCommercialField(clear, "industry"),
      timezone: readSubmittedCommercialField(clear, "timezone"),
      legal_name: readSubmittedCommercialField(clear, "legal_name"),
    });
    assert.equal(cleared.whatsapp_number, null);
    assert.equal(cleared.facebook, null);
    assert.equal(cleared.instagram, null);
    assert.equal(cleared.linkedin, null);
    assert.equal(cleared.google_business_url, null);
    assert.equal(cleared.category, null);
    assert.equal(cleared.industry, null);
    assert.equal(cleared.timezone, null);
    assert.equal(cleared.legal_name, "Acme Ltd");
    assert.equal(cleared.business_email, "billing@acme.test");
    assert.equal(cleared.phone, "555");
    assert.equal(cleared.decision_maker, "Ada");
    assert.equal(rows["org-a"]?.language, "fr");
    assert.equal(rows["org-a"]?.email, "login@acme.test");

    const clearedView = await getOrganizationCommercialIdentity("org-a");
    assert.ok(clearedView);
    const clearedHtml = renderToStaticMarkup(
      createElement(BusinessInformationSection, {
        tradingName: clearedView.name,
        initialValues: {
          ...emptyValues,
          legal_name: clearedView.legal_name ?? "",
          business_email: clearedView.business_email ?? "",
          phone: clearedView.phone ?? "",
          whatsapp_number: clearedView.whatsapp_number ?? "",
          facebook: clearedView.facebook ?? "",
          category: clearedView.category ?? "",
          timezone: clearedView.timezone ?? "",
        },
        saveBusinessInformation: async () => {},
        messages: en.identity.business,
      }),
    );
    assert.match(clearedHtml, /value="Acme Ltd"/);
    assert.match(clearedHtml, /value="billing@acme\.test"/);
    assert.doesNotMatch(clearedHtml, /\+33 6 11/);
    assert.doesNotMatch(clearedHtml, /facebook\.com\/acme/);
    assert.doesNotMatch(clearedHtml, /Plumber/);
  });

  it("stores ordinary channel text and keeps save failures on the existing alert", async () => {
    const rows: Record<string, OrganizationRow> = {
      "org-a": {
        id: "org-a",
        name: "Acme Trading",
        slug: "acme-trading",
        language: "de",
        email: "login@acme.test",
        legal_name: "Acme Ltd",
        facebook: "https://facebook.com/kept",
        category: "Plumber",
        business_email: "billing@acme.test",
      },
    };
    const calls = installOrganizations(rows);
    const form = new FormData();
    form.set("legal_name", "Acme Ltd");
    form.set("facebook", " My Facebook Page ");
    form.set("instagram", " @example ");
    form.set("category", "Changed");
    form.set("business_email", "billing@acme.test");

    const saved = await updateOrganizationCommercialIdentity({
      organizationId: "org-a",
      legal_name: readSubmittedCommercialField(form, "legal_name"),
      facebook: readSubmittedCommercialField(form, "facebook"),
      instagram: readSubmittedCommercialField(form, "instagram"),
      category: readSubmittedCommercialField(form, "category"),
      business_email: readSubmittedCommercialField(form, "business_email"),
    });
    assert.equal(calls.updates.length, 1);
    assert.equal(saved.legal_name, "Acme Ltd");
    assert.equal(saved.facebook, "My Facebook Page");
    assert.equal(saved.instagram, "@example");
    assert.equal(saved.category, "Changed");
    assert.equal(saved.business_email, "billing@acme.test");
    assert.equal(rows["org-a"]?.language, "de");
    assert.equal(rows["org-a"]?.email, "login@acme.test");
    assert.equal(
      commercialIdentitySaveErrorCode(new OrganizationCommercialIdentityNotFoundError()),
      "not_found",
    );
    assert.equal(commercialIdentitySaveErrorCode(new Error("boom")), "save_failed");

    const html = renderToStaticMarkup(
      createElement(BusinessInformationSection, {
        tradingName: "Acme Trading",
        initialValues: {
          ...emptyValues,
          legal_name: "Acme Ltd",
          facebook: "My Facebook Page",
          instagram: "@example",
          category: "Changed",
        },
        saveBusinessInformation: async () => {},
        error: en.identity.flashBusinessSaveFailed,
        messages: en.identity.business,
      }),
    );
    assert.match(html, /role="alert"/);
    assert.match(html, /Could not save business information\./);
    assert.match(html, /value="My Facebook Page"/);
    assert.match(html, /value="@example"/);
    assert.doesNotMatch(html, /Enter a valid Facebook address/);
    assert.doesNotMatch(html, /<a\b/);
    assert.doesNotMatch(html, /type="url"/);

    const page = read("app/identity/page.tsx");
    const section = read("components/identity/BusinessInformationSection.tsx");
    assert.doesNotMatch(page, /invalid_url:/);
    assert.doesNotMatch(page, /invalidFacebook/);
    assert.doesNotMatch(section, /invalidFacebook|type="url"|placeholder=/);
    assert.match(page, /defaultOpen=\{Boolean\(businessError\)\}/);
    assert.match(page, /commercialIdentitySaveErrorCode/);
  });

  it("keeps business identity labels aligned in six languages without translating stored values", () => {
    const dictionaries = {
      en,
      fr,
      es,
      it: itMessages,
      de,
      pt,
    };
    const englishKeys = Object.keys(en.identity.business).sort();
    for (const language of ORGANIZATION_LANGUAGES) {
      const business = dictionaries[language].identity.business;
      assert.deepEqual(Object.keys(business).sort(), englishKeys, language);
      for (const key of englishKeys) {
        const value = business[key as keyof typeof business];
        assert.equal(typeof value, "string", `${language}.${key}`);
        assert.ok(value.trim().length > 0, `${language}.${key}`);
      }
      assert.notEqual(
        business.category,
        language === "en" ? "" : en.identity.business.category,
      );
      assert.notEqual(
        business.googleBusiness,
        language === "en" ? "" : en.identity.business.googleBusiness,
      );
      assert.equal(
        Object.hasOwn(business, "invalidFacebook") ||
          Object.hasOwn(business, "invalidInstagram") ||
          Object.hasOwn(business, "invalidLinkedin") ||
          Object.hasOwn(business, "invalidGoogleBusiness"),
        false,
        language,
      );
    }

    const html = renderToStaticMarkup(
      createElement(BusinessInformationSection, {
        tradingName: "Acme Trading",
        initialValues: {
          ...emptyValues,
          category: "Plumber",
          industry: "Home services",
          timezone: "America/New_York",
          facebook: "https://facebook.com/acme",
        },
        saveBusinessInformation: async () => {},
        messages: es.identity.business,
      }),
    );
    assert.match(html, /Clasificación del negocio/);
    assert.match(html, /Presencia en línea/);
    assert.match(html, /value="Plumber"/);
    assert.match(html, /value="Home services"/);
    assert.match(html, /value="America\/New_York"/);
    assert.match(html, /value="https:\/\/facebook\.com\/acme"/);
    assert.doesNotMatch(html, />Category</);
    assert.doesNotMatch(html, />Industry</);
    assert.doesNotMatch(html, />Timezone</);
  });
});
