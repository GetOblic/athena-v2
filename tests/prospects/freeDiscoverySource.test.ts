/**
 * FREE-11 surgical correction: Athena Free discovery is Google-only.
 * Source-contract and policy checks. No live provider, prospect, or worker.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { evaluateFreeConvertGeneration } from "../../lib/organization/freeConvertGeneration";
import {
  defaultOpportunityDiscoveryMethod,
  deriveFreeConvertPresentation,
  shouldOfferGetOblicDiscovery,
  shouldOfferGoogleDiscovery,
  shouldShowGetOblicListingCapacityCard,
  shouldShowProspectFindAdd,
} from "../../lib/prospects/freeConvertPresentation";
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

const FREE_AVAILABLE = deriveFreeConvertPresentation({
  athenaPlan: "free",
  defineKind: "ready",
  convertStatus: "available",
});
const FREE_RESERVED = deriveFreeConvertPresentation({
  athenaPlan: "free",
  defineKind: "ready",
  convertStatus: "reserved",
  boundProspectId: PROSPECT_A,
  boundProspectStatus: "Saved",
});
const FREE_CONSUMED = deriveFreeConvertPresentation({
  athenaPlan: "free",
  defineKind: "ready",
  convertStatus: "consumed",
  boundProspectId: PROSPECT_A,
  boundProspectStatus: "Ready",
});
const FULL = deriveFreeConvertPresentation({
  athenaPlan: "full",
  defineKind: "ready",
});

describe("FREE discovery source presentation", () => {
  it("defaults Free /prospects/find to Google and keeps Full on Directory", () => {
    assert.equal(FREE_AVAILABLE, "available");
    assert.equal(shouldOfferGetOblicDiscovery(FREE_AVAILABLE), false);
    assert.equal(defaultOpportunityDiscoveryMethod(false), "google");
    assert.equal(shouldOfferGetOblicDiscovery(FULL), true);
    assert.equal(defaultOpportunityDiscoveryMethod(true), "directory");

    const find = read("app/prospects/find/page.tsx");
    const methods = read("components/prospects/OpportunityDiscoveryMethods.tsx");
    assert.match(find, /shouldOfferGetOblicDiscovery\(presentation\)/);
    assert.match(find, /shouldOfferGoogleDiscovery\(presentation\)/);
    assert.match(find, /directoryAvailable=/);
    assert.match(find, /googleAvailable=/);
    assert.match(
      methods,
      /defaultOpportunityDiscoveryMethod\(directoryAvailable\)/,
    );
    assert.match(methods, /googleAvailable && !directoryAvailable/);
  });

  it("keeps Free Google search mounted and usable", () => {
    assert.equal(shouldOfferGoogleDiscovery(FREE_AVAILABLE), true);
    const methods = read("components/prospects/OpportunityDiscoveryMethods.tsx");
    const google = read("components/prospects/GoogleBusinessDiscovery.tsx");
    assert.match(methods, /GoogleBusinessDiscovery/);
    assert.match(methods, /googleAvailable && googleVisited \?/);
    assert.match(google, /\/api\/prospects\/from-google-business/);
    assert.match(google, /NEXT_PUBLIC_GOOGLE_MAPS_API_KEY/);
    assert.match(google, /types: \["establishment"\]/);
    assert.doesNotMatch(google, /from-getoblic/);
  });

  it("keeps Free GetOblic visible, explained, and non-interactive", () => {
    const methods = read("components/prospects/OpportunityDiscoveryMethods.tsx");
    const unavailableStart = methods.indexOf('data-discovery-available="false"');
    const googleButton = methods.indexOf(
      'data-discovery-source="google"',
      unavailableStart,
    );
    const unavailable = methods.slice(
      unavailableStart,
      methods.lastIndexOf("<button", googleButton),
    );
    assert.match(methods, /directoryLabel/);
    assert.match(unavailable, /directoryUnavailable/);
    assert.match(unavailable, /aria-disabled="true"/);
    assert.match(unavailable, /aria-describedby=/);
    assert.doesNotMatch(unavailable, /<button/);
    assert.doesNotMatch(unavailable, /<a |href=/);
    assert.doesNotMatch(unavailable, /onClick|onKeyDown/);
    assert.match(methods, /selectMethod\(next[\s\S]*!directoryAvailable\)/);
    assert.equal(
      en.prospects.find.methods.directoryUnavailable,
      "Available with Full Athena",
    );
    assert.doesNotMatch(
      en.prospects.find.methods.directoryUnavailable,
      /upgrade|paywall|€|\$|price/i,
    );
  });

  it("does not let Free switch into GetOblic search", () => {
    const methods = read("components/prospects/OpportunityDiscoveryMethods.tsx");
    const gated = sliceFn(
      methods,
      "{directoryAvailable ? (",
      "{googleAvailable && googleVisited ? (",
    );
    assert.match(gated, /GetOblicOpportunityDiscovery/);
    assert.match(methods, /if \(next === "directory" && !directoryAvailable\)/);
    assert.doesNotMatch(
      sliceFn(methods, 'data-discovery-available="false"', "data-discovery-source=\"google\""),
      /GetOblicOpportunityDiscovery/,
    );
  });
});

describe("FREE /prospects listing-capacity card", () => {
  it("hides the GetOblic listing-capacity card for Free and keeps Find", () => {
    assert.equal(shouldShowGetOblicListingCapacityCard(FREE_AVAILABLE), false);
    assert.equal(shouldShowGetOblicListingCapacityCard(FULL), true);
    assert.equal(shouldShowProspectFindAdd(FREE_AVAILABLE), true);

    const page = read("app/prospects/page.tsx");
    assert.match(page, /shouldShowGetOblicListingCapacityCard\(presentation\)/);
    assert.match(page, /showListingCapacity && capacity/);
    assert.match(page, /findOpportunitiesCta/);
    assert.match(page, /href="\/prospects\/find"/);
    assert.doesNotMatch(page, /paywall/i);
  });
});

describe("FREE GetOblic API backstop", () => {
  it("denies Free POST /api/prospects/from-getoblic before any work", () => {
    const trained = evaluateFreeConvertGeneration({
      athenaPlan: "free",
      defineKind: "ready",
      convertStatus: "available",
      action: "from_getoblic",
    });
    const untrained = evaluateFreeConvertGeneration({
      athenaPlan: "free",
      defineKind: "needs_setup",
      action: "from_getoblic",
    });
    assert.equal(trained.allow, false);
    assert.equal(untrained.allow, false);
    if (trained.allow || untrained.allow) return;
    assert.equal(trained.code, "FREE_CONVERT_GETOBLIC_DENIED");
    assert.equal(untrained.code, "FREE_CONVERT_GETOBLIC_DENIED");
    assert.equal(trained.httpStatus, 403);

    const route = read("app/api/prospects/from-getoblic/route.ts");
    const post = sliceFn(route, "export async function POST", "catch (error)");
    assert.match(post, /action: "from_getoblic"/);
    assert.match(post, /assertCurrentFreeConvertGeneration/);
    assert.doesNotMatch(route, /persistFreeConvertFromGetOblic/);
    assert.ok(
      post.indexOf("assertCurrentFreeConvertGeneration") <
        post.indexOf("convertGetOblicDirectoryListing"),
    );
    assert.doesNotMatch(post, /reserveGetOblicListingCapacity/);
    assert.doesNotMatch(post, /reserveFreeConvert/);
    assert.doesNotMatch(post, /bindFreeConvertProspect/);
    assert.doesNotMatch(post, /createProspect/);
    assert.doesNotMatch(post, /ensureProspectGenerationQueued/);
    assert.doesNotMatch(post, /openrouter|OpenRouter/i);
  });
});

describe("FREE-11 Google and one-prospect authority non-regression", () => {
  it("keeps Google starter reservation and one-prospect authority", () => {
    assert.deepEqual(
      evaluateFreeConvertGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        convertStatus: "available",
        action: "create",
      }),
      { allow: true },
    );
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

    const google = read("app/api/prospects/from-google-business/route.ts");
    const orchestration = read("services/prospects/freeConvertOrchestration.ts");
    const reservation = read("lib/organization/freeConvertReservation.ts");
    assert.match(google, /persistFreeConvertFromGoogleBusiness/);
    assert.match(google, /action: "create"/);
    assert.match(orchestration, /reserveFreeConvert/);
    assert.match(orchestration, /bindFreeConvertProspect/);
    assert.match(reservation, /free_convert_status|status/);
    assert.doesNotMatch(
      read("lib/organization/freeConvert.ts"),
      /from_getoblic/,
    );
  });
});

describe("Full discovery non-regression", () => {
  it("leaves Full GetOblic and Google flows unchanged", () => {
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

    const methods = read("components/prospects/OpportunityDiscoveryMethods.tsx");
    const find = read("app/prospects/find/page.tsx");
    const getoblic = read("app/api/prospects/from-getoblic/route.ts");
    const google = read("app/api/prospects/from-google-business/route.ts");
    assert.match(methods, /directoryAvailable \? \(/);
    assert.match(methods, /GetOblicOpportunityDiscovery/);
    assert.match(methods, /GoogleBusinessDiscovery/);
    assert.match(find, /directoryAvailable=\{shouldOfferGetOblicDiscovery/);
    assert.match(find, /googleAvailable=\{shouldOfferGoogleDiscovery/);
    assert.match(getoblic, /convertGetOblicDirectoryListing/);
    assert.match(google, /convertGoogleBusinessSelection/);
    assert.doesNotMatch(getoblic, /FREE_CONVERT_GETOBLIC_DENIED/);
    assert.doesNotMatch(find, /upgrade|paywall/i);
  });
});

describe("FREE discovery i18n", () => {
  it("keeps exact six-language key parity for the unavailable explanation", () => {
    const canonical = collectKeyPaths(en);
    assert.ok(canonical.includes("prospects.find.methods.directoryUnavailable"));
    assert.ok(canonical.includes("prospects.find.methods.googleUnavailable"));
    assert.equal(
      en.prospects.free.findContext,
      "Search is repeatable. Adding a business starts your one researched opportunity.",
    );
    assert.equal(
      en.prospects.find.methods.directoryLabel,
      "Search the GetOblic Directory",
    );
    assert.equal(
      en.prospects.find.methods.googleLabel,
      "Find One Specific Business",
    );
    assert.equal(
      en.prospects.find.methods.googleDescription,
      "Look up one real business and add it.",
    );
    assert.equal(en.prospects.find.google.inputLabel, "Business search");
    assert.equal(
      en.prospects.find.google.startTyping,
      "Start typing, then choose a business from the suggestions.",
    );
    assert.equal(
      en.prospects.find.methods.googleUnavailable,
      "Your Free opportunity has already been researched.",
    );

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
      const methods = DICTIONARIES[language].prospects.find.methods;
      assert.ok(methods.directoryUnavailable.trim());
      assert.ok(methods.googleUnavailable.trim());
      assert.doesNotMatch(
        methods.directoryUnavailable,
        /upgrade|paywall|€|\$|price/i,
      );
      assert.doesNotMatch(
        methods.googleUnavailable,
        /upgrade|paywall|€|\$|price/i,
      );
    }
    assert.notEqual(
      fr.prospects.find.methods.directoryUnavailable,
      en.prospects.find.methods.directoryUnavailable,
    );
    assert.notEqual(
      de.prospects.find.methods.directoryUnavailable,
      en.prospects.find.methods.directoryUnavailable,
    );
    assert.notEqual(
      fr.prospects.find.methods.googleUnavailable,
      en.prospects.find.methods.googleUnavailable,
    );
    assert.notEqual(
      de.prospects.find.methods.googleUnavailable,
      en.prospects.find.methods.googleUnavailable,
    );
  });
});

describe("FREE consumed discovery completion", () => {
  it("keeps Google active and GetOblic unavailable for trained available Free", () => {
    assert.equal(FREE_AVAILABLE, "available");
    assert.equal(shouldOfferGoogleDiscovery(FREE_AVAILABLE), true);
    assert.equal(shouldOfferGetOblicDiscovery(FREE_AVAILABLE), false);
    assert.equal(shouldShowProspectFindAdd(FREE_AVAILABLE), true);
  });

  it("makes consumed Find a read-only completion state without a second acquisition", () => {
    assert.equal(FREE_CONSUMED, "consumed");
    assert.equal(shouldOfferGoogleDiscovery(FREE_CONSUMED), false);
    assert.equal(shouldOfferGetOblicDiscovery(FREE_CONSUMED), false);
    assert.equal(shouldShowProspectFindAdd(FREE_CONSUMED), false);

    const find = read("app/prospects/find/page.tsx");
    assert.match(find, /googleAvailable=\{shouldOfferGoogleDiscovery\(presentation\)\}/);
    assert.match(find, /copy\.free\.openBoundProspect/);
    assert.match(find, /presentation === "consumed"/);
    assert.match(find, /copy\.free\.completedNote/);
    assert.doesNotMatch(find, /upgrade|paywall|€|price/i);
  });

  it("does not mount Google acquisition when Google is unavailable", () => {
    const methods = read("components/prospects/OpportunityDiscoveryMethods.tsx");
    const unavailableGoogle = sliceFn(
      methods,
      'data-discovery-source="google"\n            data-discovery-available="false"',
      "{directoryAvailable ? (",
    );
    const mountedGoogle = sliceFn(
      methods,
      "{googleAvailable && googleVisited ? (",
    );

    assert.match(methods, /googleAvailable \? \(/);
    assert.match(methods, /if \(next === "google" && !googleAvailable\)/);
    assert.match(unavailableGoogle, /aria-disabled="true"/);
    assert.match(unavailableGoogle, /aria-describedby=/);
    assert.match(unavailableGoogle, /googleUnavailable/);
    assert.doesNotMatch(unavailableGoogle, /<button/);
    assert.doesNotMatch(unavailableGoogle, /<a |href=/);
    assert.doesNotMatch(unavailableGoogle, /onClick|onKeyDown|tabIndex/);
    assert.doesNotMatch(unavailableGoogle, /GoogleBusinessDiscovery/);
    assert.doesNotMatch(unavailableGoogle, /<input/);
    assert.doesNotMatch(unavailableGoogle, /autocomplete|Places|addCta/);
    assert.doesNotMatch(unavailableGoogle, /Add this business/);
    assert.match(mountedGoogle, /GoogleBusinessDiscovery/);
    assert.doesNotMatch(
      sliceFn(
        methods,
        'data-discovery-available="false"',
        'data-discovery-source="google"',
      ),
      /GoogleBusinessDiscovery/,
    );
  });

  it("keeps GetOblic unavailable after Free consumption", () => {
    assert.equal(shouldOfferGetOblicDiscovery(FREE_CONSUMED), false);
    const methods = read("components/prospects/OpportunityDiscoveryMethods.tsx");
    assert.match(methods, /directoryUnavailable/);
    assert.match(
      sliceFn(
        methods,
        'data-discovery-source="directory"',
        'data-discovery-source="google"',
      ),
      /directoryUnavailable/,
    );
  });

  it("blocks a second Free acquisition while reserved", () => {
    assert.equal(FREE_RESERVED, "bound");
    assert.equal(shouldOfferGoogleDiscovery(FREE_RESERVED), false);
    assert.equal(shouldOfferGetOblicDiscovery(FREE_RESERVED), false);
    assert.equal(shouldShowProspectFindAdd(FREE_RESERVED), false);
    assert.equal(
      evaluateFreeConvertGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        convertStatus: "reserved",
        action: "create",
      }).allow,
      false,
    );
  });

  it("keeps Full Google and GetOblic active and restores both after Free", () => {
    assert.equal(shouldOfferGoogleDiscovery(FULL), true);
    assert.equal(shouldOfferGetOblicDiscovery(FULL), true);
    assert.equal(shouldShowProspectFindAdd(FULL), true);
    assert.equal(shouldOfferGoogleDiscovery(FREE_CONSUMED), false);
    assert.equal(shouldOfferGoogleDiscovery(FULL), true);
    assert.equal(shouldOfferGetOblicDiscovery(FREE_CONSUMED), false);
    assert.equal(shouldOfferGetOblicDiscovery(FULL), true);
  });

  it("keeps the authoritative consumed POST denial unchanged", () => {
    const decision = evaluateFreeConvertGeneration({
      athenaPlan: "free",
      defineKind: "ready",
      convertStatus: "consumed",
      action: "create",
    });
    assert.equal(decision.allow, false);
    if (decision.allow) return;
    assert.equal(decision.code, "FREE_CONVERT_CONSUMED");
    assert.equal(decision.httpStatus, 409);

    const google = read("app/api/prospects/from-google-business/route.ts");
    const post = sliceFn(google, "export async function POST", "catch (error)");
    assert.match(post, /assertCurrentFreeConvertGeneration/);
    assert.match(post, /action: "create"/);
    assert.ok(
      post.indexOf("assertCurrentFreeConvertGeneration") <
        post.indexOf("persistFreeConvertFromGoogleBusiness"),
    );
  });
});
