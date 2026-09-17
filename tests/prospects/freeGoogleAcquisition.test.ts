/**
 * FREE-11 Google-only acquisition decoupling.
 * Source-contract and mapping checks. No live Google, prospect, or worker.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { GOOGLE_BUSINESS_ADD_ACTION } from "../../lib/googlePlaces/googlePlacesTypes";
import { evaluateFreeConvertGeneration } from "../../lib/organization/freeConvertGeneration";
import {
  deriveFreeConvertPresentation,
  shouldRequireGoogleAuthorMapping,
} from "../../lib/prospects/freeConvertPresentation";
import {
  FREE_GOOGLE_PROSPECT_SOURCE,
  mapGoogleBusinessToFreeProspectRow,
} from "../../lib/prospects/freeGoogleProspectMapping";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import { ORGANIZATION_LANGUAGES } from "../../services/organizationLanguage";

const ROOT = process.cwd();
const PROSPECT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function sliceFn(source: string, startMarker: string, endMarker?: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, startMarker);
  const end = endMarker
    ? source.indexOf(endMarker, start + startMarker.length)
    : source.length;
  assert.ok(end > start, endMarker ?? "end");
  return source.slice(start, end);
}

function collectKeyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }
  const paths = prefix ? [prefix] : [];
  for (const key of Object.keys(value as object).sort()) {
    const next = prefix ? `${prefix}.${key}` : key;
    paths.push(
      ...collectKeyPaths((value as Record<string, unknown>)[key], next),
    );
  }
  return paths;
}

const DICTIONARIES: Record<string, TenantMessages> = {
  en,
  fr,
  es,
  it: itMessages,
  de,
  pt,
};

function googlePayload(overrides: Record<string, unknown> = {}) {
  return {
    action: GOOGLE_BUSINESS_ADD_ACTION,
    company_name: "Oak Street Salon",
    google_id: "ChIJexamplePlace",
    google_url: "https://maps.google.com/?cid=1",
    latitude: "32.7767",
    longitude: "-96.797",
    address: "100 Oak St, Dallas, TX 75201, USA",
    city: "Dallas",
    state: "TX",
    zip: "75201",
    country: "US",
    category: "hair_care",
    tags: "hair_care,establishment,point_of_interest",
    business_phone: "+1 214-555-0100",
    website: "https://oak.example",
    opening_hours: "Monday: 9:00 AM – 5:00 PM",
    opening_hours_json: JSON.stringify({ periods: [] }),
    timezone: "-360",
    ...overrides,
  };
}

describe("FREE Google acquisition isolation", () => {
  it("does not require GetOblic settings, author mapping, Make, claim, or listing links", () => {
    const route = read("app/api/prospects/from-google-business/route.ts");
    const orchestration = read("services/prospects/freeConvertOrchestration.ts");
    const mapping = read("lib/prospects/freeGoogleProspectMapping.ts");
    const googleFn = sliceFn(
      orchestration,
      "export async function persistFreeConvertFromGoogleBusiness",
      "export async function enqueueFreeConvertProspectGeneration",
    );
    const persistFn = sliceFn(
      orchestration,
      "async function persistFreeConvertProspect",
      "export async function createFreeConvertManualProspect",
    );
    const freeBranch = sliceFn(
      route,
      'if (convertContext.athenaPlan === "free")',
      "const { make, conversion }",
    );

    assert.match(googleFn, /sanitizeGoogleBusinessPayload/);
    assert.match(googleFn, /mapGoogleBusinessToFreeProspectRow/);
    assert.match(googleFn, /persistFreeConvertProspect/);
    assert.doesNotMatch(googleFn, /convertGoogleBusinessSelection/);
    assert.doesNotMatch(googleFn, /addGoogleBusinessListing/);
    assert.doesNotMatch(googleFn, /convertGetOblicDirectoryListing/);
    assert.doesNotMatch(googleFn, /wordpress_author_id|getoblic_account_email/);
    assert.doesNotMatch(googleFn, /athena_getoblic_listing_links|claimKnown/);
    assert.doesNotMatch(googleFn, /getGetOblicDirectorySettings/);
    assert.doesNotMatch(persistFn, /convertGoogleBusinessSelection|addGoogleBusinessListing/);
    assert.doesNotMatch(persistFn, /source:\s*["']getoblic["']/);
    assert.doesNotMatch(mapping, /getoblic|wordpress_author_id|listing_links/);
    assert.doesNotMatch(freeBranch, /convertGoogleBusinessSelection|addGoogleBusinessListing/);
    assert.doesNotMatch(freeBranch, /toPublicGetOblicConversion|result: make/);
    assert.match(freeBranch, /persistFreeConvertFromGoogleBusiness/);
    assert.equal(FREE_GOOGLE_PROSPECT_SOURCE, "manual");
    assert.notEqual(FREE_GOOGLE_PROSPECT_SOURCE, "getoblic");
  });

  it("maps Google business fields onto the existing prospect contract", () => {
    const mapped = mapGoogleBusinessToFreeProspectRow(googlePayload());
    assert.equal(mapped.row.business_name, "Oak Street Salon");
    assert.equal(mapped.row.website, "https://oak.example");
    assert.equal(mapped.row.phone, "+1 214-555-0100");
    assert.equal(mapped.row.address, "100 Oak St, Dallas, TX 75201, USA");
    assert.equal(mapped.row.city, "Dallas");
    assert.equal(mapped.row.state, "TX");
    assert.equal(mapped.row.country, "US");
    assert.equal(mapped.row.category, "hair_care");
    assert.equal(mapped.row.timezone, "-360");
    assert.equal(mapped.row.google_business_url, "https://maps.google.com/?cid=1");
    assert.equal(mapped.row.source, "manual");
    assert.notEqual(mapped.row.source, "getoblic");
    assert.equal(mapped.rawJson.google_id, "ChIJexamplePlace");
    assert.equal(mapped.rawJson.zip, "75201");
    assert.equal(mapped.rawJson.latitude, "32.7767");
    assert.equal(mapped.rawJson.tags, "hair_care,establishment,point_of_interest");
    assert.equal(Object.hasOwn(mapped.row, "wordpress_listing_id"), false);
    assert.equal(Object.hasOwn(mapped.rawJson, "wordpress_listing_id"), false);

    const withoutWebsite = mapGoogleBusinessToFreeProspectRow(
      googlePayload({ website: undefined }),
    );
    assert.equal(withoutWebsite.row.website, null);
    assert.equal(withoutWebsite.row.source, "manual");
  });
});

describe("FREE Google reservation and queue contract", () => {
  it("validates, then reserves, persists, binds, and queues only when a website exists", () => {
    const route = read("app/api/prospects/from-google-business/route.ts");
    const orchestration = read("services/prospects/freeConvertOrchestration.ts");
    const post = sliceFn(route, "export async function POST", "catch (error)");
    const persistFn = sliceFn(
      orchestration,
      "async function persistFreeConvertProspect",
      "export async function createFreeConvertManualProspect",
    );
    const googleFn = sliceFn(
      orchestration,
      "export async function persistFreeConvertFromGoogleBusiness",
      "export async function enqueueFreeConvertProspectGeneration",
    );

    assert.ok(
      post.indexOf("requireCurrentOrganizationContext") <
        post.indexOf("sanitizeGoogleBusinessPayload"),
    );
    assert.ok(
      post.indexOf("sanitizeGoogleBusinessPayload") <
        post.indexOf("assertCurrentFreeConvertGeneration"),
    );
    assert.ok(
      post.indexOf("assertCurrentFreeConvertGeneration") <
        post.indexOf("persistFreeConvertFromGoogleBusiness"),
    );
    assert.doesNotMatch(post, /body\.athenaPlan|body\.athena_plan/);
    assert.match(googleFn, /sanitizeGoogleBusinessPayload/);
    assert.ok(
      googleFn.indexOf("sanitizeGoogleBusinessPayload") <
        googleFn.indexOf("persistFreeConvertProspect"),
    );
    assert.ok(
      persistFn.indexOf("findExistingProspectDuplicate") <
        persistFn.indexOf("reserveFreeConvert"),
    );
    assert.ok(
      persistFn.indexOf("reserveFreeConvert") < persistFn.indexOf("createProspect"),
    );
    assert.ok(
      persistFn.indexOf("createProspect") < persistFn.indexOf("bindFreeConvertProspect"),
    );
    assert.ok(
      persistFn.indexOf("bindFreeConvertProspect") <
        persistFn.indexOf("ensureProspectGenerationQueued"),
    );
    assert.match(persistFn, /hasResearchWebsite\(created\.website\)/);
    assert.ok(
      persistFn.indexOf("if (!hasResearchWebsite(created.website))") <
        persistFn.indexOf("ensureProspectGenerationQueued"),
    );
    assert.match(persistFn, /status: invalidWebsite \|\| !normalizedWebsite \? "Saved" : "Queued"/);
    assert.match(persistFn, /queued: false/);
    assert.match(persistFn, /withoutWebsite: true/);
    assert.match(persistFn, /releaseFreeConvertIfReserved/);
    assert.ok(
      persistFn.indexOf("Failed to create prospect") <
        persistFn.lastIndexOf("releaseFreeConvertIfReserved"),
    );
    assert.doesNotMatch(persistFn, /consumeFreeConvertIfReserved/);
    assert.doesNotMatch(persistFn, /openrouter|OpenRouter/i);
    assert.match(googleFn, /persistFreeConvertProspect/);
    assert.match(
      sliceFn(
        orchestration,
        "export async function createFreeConvertManualProspect",
        "export async function persistFreeConvertFromGetOblic",
      ),
      /persistFreeConvertProspect/,
    );
  });

  it("denies a second Free Google Add and keeps retry-same after failure", () => {
    assert.equal(
      evaluateFreeConvertGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        convertStatus: "reserved",
        action: "create",
      }).allow,
      false,
    );
    assert.equal(
      evaluateFreeConvertGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        convertStatus: "consumed",
        action: "create",
      }).allow,
      false,
    );
    assert.deepEqual(
      evaluateFreeConvertGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        convertStatus: "reserved",
        action: "generate",
        prospectId: PROSPECT_A,
        boundProspectId: PROSPECT_A,
        hasWebsite: true,
      }),
      { allow: true },
    );
    const route = read("app/api/prospects/from-google-business/route.ts");
    const persistFn = sliceFn(
      read("services/prospects/freeConvertOrchestration.ts"),
      "async function persistFreeConvertProspect",
      "export async function createFreeConvertManualProspect",
    );
    assert.match(route, /action: "create"/);
    assert.match(persistFn, /findExistingProspectDuplicate/);
    assert.match(persistFn, /FREE_CONVERT_RETRY_ONLY/);
  });

  it("does not consume Free Convert at Google persist / create time", () => {
    const persistFn = sliceFn(
      read("services/prospects/freeConvertOrchestration.ts"),
      "async function persistFreeConvertProspect",
      "export async function createFreeConvertManualProspect",
    );
    assert.doesNotMatch(persistFn, /consumeFreeConvertIfReserved/);
    assert.doesNotMatch(
      read("app/api/prospects/from-google-business/route.ts"),
      /consumeFreeConvertIfReserved/,
    );
  });
});

describe("FREE Google presentation and GetOblic deny", () => {
  it("stops Free /prospects/find from requiring author mapping and keeps the missing-key blocker independent", () => {
    const available = deriveFreeConvertPresentation({
      athenaPlan: "free",
      defineKind: "ready",
      convertStatus: "available",
    });
    const full = deriveFreeConvertPresentation({
      athenaPlan: "full",
      defineKind: "ready",
    });
    assert.equal(shouldRequireGoogleAuthorMapping(available), false);
    assert.equal(shouldRequireGoogleAuthorMapping(full), true);

    const find = read("app/prospects/find/page.tsx");
    const google = read("components/prospects/GoogleBusinessDiscovery.tsx");
    assert.match(find, /shouldRequireGoogleAuthorMapping\(presentation\)/);
    assert.match(find, /authorMappingMissing=\{authorMappingMissing\}/);
    assert.match(
      find,
      /requireGoogleAuthorMapping\s*\?\s*getGetOblicDirectorySettings/,
    );
    assert.match(google, /!authorMappingMissing/);
    assert.match(google, /\{authorMappingMissing \? \(/);
    assert.match(google, /loaderStatus === "missing_key"/);
    const inputDisabled = google.match(
      /const inputDisabled =\s*([\s\S]*?);/,
    )?.[1];
    assert.ok(inputDisabled);
    assert.doesNotMatch(inputDisabled, /authorMappingMissing/);
    assert.match(inputDisabled, /googleUnavailable/);
    assert.doesNotMatch(google, /NEXT_PUBLIC_GOOGLE_MAPS_API_KEY[\s\S]{0,80}authorMappingMissing/);
  });

  it("keeps Free GetOblic POST denied before allocation and leaves Full Google on convertGoogleBusinessSelection", () => {
    const trained = evaluateFreeConvertGeneration({
      athenaPlan: "free",
      defineKind: "ready",
      convertStatus: "available",
      action: "from_getoblic",
    });
    assert.equal(trained.allow, false);
    if (trained.allow) return;
    assert.equal(trained.code, "FREE_CONVERT_GETOBLIC_DENIED");
    assert.deepEqual(
      evaluateFreeConvertGeneration({
        athenaPlan: "full",
        action: "from_getoblic",
      }),
      { allow: true },
    );
    assert.deepEqual(
      evaluateFreeConvertGeneration({
        athenaPlan: "full",
        action: "create",
      }),
      { allow: true },
    );

    const getoblic = read("app/api/prospects/from-getoblic/route.ts");
    const google = read("app/api/prospects/from-google-business/route.ts");
    const convert = read(
      "services/googleBusiness/googleBusinessConvertService.ts",
    );
    const getoblicPost = sliceFn(
      getoblic,
      "export async function POST",
      "catch (error)",
    );
    const fullBranch = sliceFn(
      google,
      "const { make, conversion } = await convertGoogleBusinessSelection",
    );
    assert.match(getoblicPost, /action: "from_getoblic"/);
    assert.doesNotMatch(getoblicPost, /persistFreeConvertFromGetOblic/);
    assert.ok(
      getoblicPost.indexOf("assertCurrentFreeConvertGeneration") <
        getoblicPost.indexOf("convertGetOblicDirectoryListing"),
    );
    assert.match(google, /convertGoogleBusinessSelection/);
    assert.match(fullBranch, /actorLicenseeAccountId/);
    assert.match(convert, /GOOGLE_BUSINESS_AUTHOR_MAPPING_MISSING/);
    assert.match(convert, /addGoogleBusinessListing/);
    assert.match(convert, /convertGetOblicDirectoryListing/);
    assert.doesNotMatch(convert, /persistFreeConvertFromGoogleBusiness/);
    assert.doesNotMatch(
      read("services/licensee/licenseeIdentity.ts"),
      /persistFreeConvertFromGoogleBusiness|freeGoogleProspectMapping/,
    );
  });

  it("keeps exact six-language key parity after the Google decoupling", () => {
    const canonical = collectKeyPaths(en);
    for (const language of ORGANIZATION_LANGUAGES) {
      const paths = collectKeyPaths(DICTIONARIES[language]);
      assert.deepEqual(
        canonical.filter((path) => !paths.includes(path)),
        [],
        `${language} missing keys`,
      );
      assert.deepEqual(
        paths.filter((path) => !canonical.includes(path)),
        [],
        `${language} extra keys`,
      );
    }
    assert.equal(
      en.prospects.find.google.missingKey,
      "Google search isn’t configured for this Athena workspace yet.",
    );
    assert.match(
      en.prospects.find.google.authorMappingMissing,
      /GetOblic/,
    );
  });
});
