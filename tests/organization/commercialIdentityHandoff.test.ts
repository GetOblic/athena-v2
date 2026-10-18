/**
 * EST-QUOTE-1C.2 and PC-ID-1C — pure Prospect → Client commercial fill.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  PROSPECT_TO_ORGANIZATION_COMMERCIAL_FIELDS,
  buildBlankCommercialIdentityFill,
  normalizeOptionalCommercialText,
} from "../../services/organization/commercialIdentity";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const CHANNEL_MAPPINGS = [
  ["whatsapp_number", "whatsapp_number"],
  ["facebook", "facebook"],
  ["instagram", "instagram"],
  ["linkedin", "linkedin"],
  ["google_business_url", "google_business_url"],
  ["category", "category"],
  ["industry", "industry"],
  ["timezone", "timezone"],
] as const;

describe("commercial identity handoff", () => {
  it("trims optional text to null", () => {
    assert.equal(normalizeOptionalCommercialText("  Acme Ltd  "), "Acme Ltd");
    assert.equal(normalizeOptionalCommercialText("   "), null);
    assert.equal(normalizeOptionalCommercialText(null), null);
    assert.equal(normalizeOptionalCommercialText(12), null);
  });

  it("maps prospect email to business_email and fills only blank targets", () => {
    assert.deepEqual(
      PROSPECT_TO_ORGANIZATION_COMMERCIAL_FIELDS.find(
        ([source]) => source === "email",
      ),
      ["email", "business_email"],
    );

    const fill = buildBlankCommercialIdentityFill(
      {
        legal_name: "  New Legal  ",
        address: " 12 Main ",
        email: " buyer@acme.test ",
        business_name: "Should Not Become The Client Name",
        notes: "private",
        additional_context: "strategy",
        website: "https://acme.test",
        website_intelligence: { about: "secret" },
        phone: "  ",
      },
      {
        name: "Existing Trading",
        legal_name: "Kept Legal",
        address: "   ",
        business_email: null,
        phone: "555",
        slug: "kept-slug",
        language: "fr",
        brand_primary_color: "#112233",
      },
    );

    assert.deepEqual(fill, {
      address: "12 Main",
      business_email: "buyer@acme.test",
    });
    assert.equal(Object.hasOwn(fill, "legal_name"), false);
    assert.equal(Object.hasOwn(fill, "name"), false);
    assert.equal(Object.hasOwn(fill, "phone"), false);
    assert.equal(Object.hasOwn(fill, "notes"), false);
    assert.equal(Object.hasOwn(fill, "website"), false);
  });

  it("maps the eight channel fields onto blank organization columns", () => {
    for (const pair of CHANNEL_MAPPINGS) {
      assert.deepEqual(
        PROSPECT_TO_ORGANIZATION_COMMERCIAL_FIELDS.find(
          ([source, target]) => source === pair[0] && target === pair[1],
        ),
        pair,
      );
    }

    const fill = buildBlankCommercialIdentityFill(
      {
        whatsapp_number: " +1 555 ",
        facebook: " https://facebook.com/acme/ ",
        instagram: " instagram.com/acme ",
        linkedin: " https://www.linkedin.com/company/acme ",
        google_business_url: " https://maps.google.com/?cid=1 ",
        category: " Plumber ",
        industry: " Home services ",
        timezone: " America/New_York ",
      },
      {
        whatsapp_number: null,
        facebook: "",
        instagram: "   ",
        linkedin: null,
        google_business_url: null,
        category: null,
        industry: null,
        timezone: null,
      },
    );

    assert.deepEqual(fill, {
      whatsapp_number: "+1 555",
      facebook: "https://facebook.com/acme/",
      instagram: "instagram.com/acme",
      linkedin: "https://www.linkedin.com/company/acme",
      google_business_url: "https://maps.google.com/?cid=1",
      category: "Plumber",
      industry: "Home services",
      timezone: "America/New_York",
    });
  });

  it("omits null, missing, and blank channel values", () => {
    const fill = buildBlankCommercialIdentityFill(
      {
        whatsapp_number: null,
        facebook: "   ",
        instagram: "",
        category: "  ",
      },
      {
        whatsapp_number: null,
        facebook: null,
        instagram: null,
        linkedin: null,
        google_business_url: null,
        category: null,
        industry: null,
        timezone: null,
      },
    );

    assert.deepEqual(fill, {});
  });

  it("fills only blank channel fields and keeps client-edited values", () => {
    const fill = buildBlankCommercialIdentityFill(
      {
        whatsapp_number: "+1 999",
        facebook: "https://facebook.com/prospect",
        instagram: "https://instagram.com/prospect",
        linkedin: "https://linkedin.com/company/prospect",
        google_business_url: "https://maps.google.com/?cid=9",
        category: "Prospect category",
        industry: "Prospect industry",
        timezone: "Europe/Paris",
        name: "Prospect Trading Name",
      },
      {
        name: "Client Trading Name",
        whatsapp_number: "+1 111",
        facebook: "https://facebook.com/client",
        instagram: "   ",
        linkedin: null,
        google_business_url: "https://maps.google.com/?cid=kept",
        category: "Client category",
        industry: "",
        timezone: "America/Chicago",
        language: "fr",
      },
    );

    assert.deepEqual(fill, {
      instagram: "https://instagram.com/prospect",
      linkedin: "https://linkedin.com/company/prospect",
      industry: "Prospect industry",
    });
    assert.equal(Object.hasOwn(fill, "name"), false);
    assert.equal(Object.hasOwn(fill, "language"), false);
    assert.equal(Object.hasOwn(fill, "whatsapp_number"), false);
    assert.equal(Object.hasOwn(fill, "facebook"), false);
    assert.equal(Object.hasOwn(fill, "category"), false);
    assert.equal(Object.hasOwn(fill, "timezone"), false);
  });

  it("copies non-URL channel strings and does not overwrite client text", () => {
    const fill = buildBlankCommercialIdentityFill(
      {
        legal_name: "Acme Ltd",
        whatsapp_number: "+1 555",
        facebook: " My Facebook Page ",
        instagram: " @example ",
        linkedin: "@@@",
        google_business_url: " maps ",
        category: "Plumber",
      },
      {
        legal_name: null,
        whatsapp_number: null,
        facebook: null,
        instagram: null,
        linkedin: null,
        google_business_url: null,
        category: null,
      },
    );

    assert.deepEqual(fill, {
      legal_name: "Acme Ltd",
      whatsapp_number: "+1 555",
      facebook: "My Facebook Page",
      instagram: "@example",
      linkedin: "@@@",
      google_business_url: "maps",
      category: "Plumber",
    });

    const kept = buildBlankCommercialIdentityFill(
      {
        facebook: "https://facebook.com/overwrite",
        instagram: "@prospect",
        linkedin: "Prospect LinkedIn",
        google_business_url: "https://maps.google.com/?cid=9",
      },
      {
        facebook: "My Facebook Page",
        instagram: "@example",
        linkedin: "@@@",
        google_business_url: "maps",
      },
    );
    assert.deepEqual(kept, {});
  });

  it("does not transfer excluded prospect data or derive decision_maker", () => {
    const fill = buildBlankCommercialIdentityFill(
      {
        first_name: "Ada",
        last_name: "Lovelace",
        decision_maker: " ",
        email: " buyer@acme.test ",
        description: "Directory description",
        about_you: "Should stay off athena_identity",
        notes: "private",
        additional_context: "strategy",
        ads_content: "ad copy",
        external_contact_id: "crm-1",
        lifecycle_status: "Qualified",
        status: "Ready",
        region: "Texas",
        website: "https://acme.test",
        website_intelligence: { about: "secret" },
      },
      {
        decision_maker: null,
        business_email: null,
        about_you: null,
      },
    );

    assert.deepEqual(fill, {
      business_email: "buyer@acme.test",
    });
    assert.equal(Object.hasOwn(fill, "decision_maker"), false);
    assert.equal(Object.hasOwn(fill, "about_you"), false);
    assert.equal(Object.hasOwn(fill, "email"), false);
    assert.equal(Object.hasOwn(fill, "notes"), false);
    assert.equal(Object.hasOwn(fill, "region"), false);
    assert.equal(Object.hasOwn(fill, "website"), false);
  });

  it("returns an empty fill when every source value is blank", () => {
    assert.deepEqual(
      buildBlankCommercialIdentityFill(
        {
          legal_name: " ",
          email: "",
          notes: "still private",
          whatsapp_number: " ",
          facebook: "",
        },
        { legal_name: null, business_email: "", whatsapp_number: null },
      ),
      {},
    );
  });

  it("does not train Brain, generate, or change GetOblic claim and release", () => {
    const pure = read("services/organization/commercialIdentity.ts");
    const hydration = read(
      "services/licensee/licenseeProspectClientCommercialHydration.ts",
    );
    const mapping = read("lib/prospects/freeGoogleProspectMapping.ts");
    const conversion = read(
      "services/licensee/licenseeProspectClientConversion.ts",
    );

    for (const source of [pure, hydration, mapping]) {
      assert.doesNotMatch(source, /brainContextBuilder|compileMasterIdentityProfile/);
      assert.doesNotMatch(source, /generateReview|openrouter|OpenRouter/i);
      assert.doesNotMatch(source, /athena_generation_jobs|enqueueDiscussionGenerationJob/);
      assert.doesNotMatch(
        source,
        /releaseGetOblicListing|claimKnown|consume_getoblic|reserve_getoblic/,
      );
      assert.doesNotMatch(source, /about_you/);
    }

    assert.match(hydration, /buildBlankCommercialIdentityFill/);
    assert.match(conversion, /tryHydrateLicenseeProspectClientCommercialIdentity/);
    assert.match(conversion, /COMMERCIAL_IDENTITY_HYDRATION_FAILED/);
    assert.doesNotMatch(conversion, /accountEmail:\s*prospect\.email/);
    assert.match(conversion, /requireGetOblicOwnershipForConversion/);
    assert.match(conversion, /resolveGetOblicProspectConversionEligibility/);
  });
});
