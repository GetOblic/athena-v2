import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  deriveFreeConvertPresentation,
  defaultOpportunityDiscoveryMethod,
  shouldOfferGetOblicDiscovery,
  shouldOfferGoogleDiscovery,
  shouldRequireGoogleAuthorMapping,
  shouldShowGetOblicListingCapacityCard,
  shouldShowProspectCreate,
  shouldShowProspectCsvImport,
  shouldShowProspectCsvLocked,
  shouldShowProspectDeepScrape,
  shouldShowProspectFindAdd,
  shouldShowProspectGenerate,
  shouldShowProspectRegenerate,
  shouldShowProspectRetrySame,
  shouldShowProspectSyncAi,
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

describe("FREE-11 Convert presentation", () => {
  it("keeps Full UI on the current create + regenerate contract", () => {
    const presentation = deriveFreeConvertPresentation({
      athenaPlan: "full",
      defineKind: "ready",
    });
    assert.equal(presentation, "full");
    assert.equal(shouldShowProspectCreate(presentation), true);
    assert.equal(shouldShowProspectCsvImport(presentation), true);
    assert.equal(shouldShowProspectCsvLocked(presentation), false);
    assert.equal(shouldShowProspectRegenerate(presentation), true);
    assert.equal(shouldShowProspectSyncAi(presentation), true);
    assert.equal(shouldShowProspectDeepScrape(presentation), true);
    assert.equal(shouldOfferGetOblicDiscovery(presentation), true);
    assert.equal(shouldOfferGoogleDiscovery(presentation), true);
    assert.equal(shouldRequireGoogleAuthorMapping(presentation), true);
    assert.equal(shouldShowGetOblicListingCapacityCard(presentation), true);
  });

  it("shows one starter Find + manual add surface for trained available Free", () => {
    const presentation = deriveFreeConvertPresentation({
      athenaPlan: "free",
      defineKind: "ready",
      convertStatus: "available",
    });
    assert.equal(presentation, "available");
    assert.equal(shouldShowProspectCreate(presentation), true);
    assert.equal(shouldShowProspectFindAdd(presentation), true);
    assert.equal(shouldShowProspectCsvImport(presentation), false);
    assert.equal(shouldShowProspectCsvLocked(presentation), true);
    assert.equal(shouldShowProspectRegenerate(presentation), false);
    assert.equal(shouldOfferGetOblicDiscovery(presentation), false);
    assert.equal(shouldOfferGoogleDiscovery(presentation), true);
    assert.equal(shouldRequireGoogleAuthorMapping(presentation), false);
    assert.equal(shouldShowGetOblicListingCapacityCard(presentation), false);
    assert.equal(defaultOpportunityDiscoveryMethod(false), "google");
    assert.equal(defaultOpportunityDiscoveryMethod(true), "directory");
  });

  it("closes Google acquisition after Free reservation or consumption", () => {
    const reserved = deriveFreeConvertPresentation({
      athenaPlan: "free",
      defineKind: "ready",
      convertStatus: "reserved",
      boundProspectStatus: "Saved",
    });
    const processing = deriveFreeConvertPresentation({
      athenaPlan: "free",
      defineKind: "ready",
      convertStatus: "reserved",
      boundProspectStatus: "Processing",
    });
    const consumed = deriveFreeConvertPresentation({
      athenaPlan: "free",
      defineKind: "ready",
      convertStatus: "consumed",
      boundProspectId: PROSPECT_A,
      boundProspectStatus: "Ready",
    });
    assert.equal(reserved, "bound");
    assert.equal(processing, "processing");
    assert.equal(consumed, "consumed");
    assert.equal(shouldOfferGoogleDiscovery(reserved), false);
    assert.equal(shouldOfferGoogleDiscovery(processing), false);
    assert.equal(shouldOfferGoogleDiscovery(consumed), false);
    assert.equal(shouldOfferGetOblicDiscovery(reserved), false);
    assert.equal(shouldOfferGetOblicDiscovery(consumed), false);
    assert.equal(shouldShowProspectFindAdd(reserved), false);
    assert.equal(shouldShowProspectFindAdd(consumed), false);
  });

  it("hides create while bound, processing, ready, or historical Ready", () => {
    assert.equal(
      shouldShowProspectCreate(
        deriveFreeConvertPresentation({
          athenaPlan: "free",
          defineKind: "ready",
          convertStatus: "reserved",
          boundProspectStatus: "Saved",
        }),
      ),
      false,
    );
    assert.equal(
      shouldShowProspectCreate(
        deriveFreeConvertPresentation({
          athenaPlan: "free",
          defineKind: "ready",
          convertStatus: "reserved",
          boundProspectStatus: "Processing",
        }),
      ),
      false,
    );
    assert.equal(
      shouldShowProspectRegenerate(
        deriveFreeConvertPresentation({
          athenaPlan: "free",
          defineKind: "ready",
          convertStatus: "consumed",
          boundProspectId: PROSPECT_A,
          boundProspectStatus: "Ready",
        }),
      ),
      false,
    );
    assert.equal(
      shouldShowProspectCreate(
        deriveFreeConvertPresentation({
          athenaPlan: "free",
          defineKind: "ready",
          convertStatus: "available",
          hasReadyProspect: true,
        }),
      ),
      false,
    );
  });

  it("shows retry only for the exact bound failed prospect", () => {
    const failed = deriveFreeConvertPresentation({
      athenaPlan: "free",
      defineKind: "ready",
      convertStatus: "available",
      boundProspectId: PROSPECT_A,
      boundProspectStatus: "Processing Failed",
    });
    assert.equal(failed, "failed");
    assert.equal(
      shouldShowProspectRetrySame({
        presentation: failed,
        currentProspectId: PROSPECT_A,
        boundProspectId: PROSPECT_A,
      }),
      true,
    );
    assert.equal(
      shouldShowProspectGenerate({
        presentation: failed,
        currentProspectId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        boundProspectId: PROSPECT_A,
      }),
      false,
    );
    assert.equal(shouldShowProspectCreate(failed), false);
    assert.equal(shouldShowProspectRegenerate(failed), false);
  });

  it("wires /prospects family chrome without pricing or a parallel route", () => {
    const landing = read("app/prospects/page.tsx");
    const find = read("app/prospects/find/page.tsx");
    const create = read("app/prospects/import/page.tsx");
    const detail = read("app/prospects/[id]/page.tsx");
    const nav = read("components/dashboard/tenantNavigation.ts");

    for (const source of [landing, find, create, detail]) {
      assert.match(source, /\{\.\.\.freeProgression\}/);
      assert.match(source, /loadFreeConvertPageState/);
      assert.doesNotMatch(source, /paywall|1\/1|quota/i);
      assert.doesNotMatch(source, /\/free-prospect|\/starter-prospect|\/free-opportunity/);
    }
    assert.match(landing, /shouldShowProspectFindAdd/);
    assert.match(find, /canAddProspect/);
    assert.match(find, /shouldOfferGoogleDiscovery\(presentation\)/);
    assert.match(create, /shouldShowProspectCsvImport/);
    assert.match(create, /shouldShowProspectCsvLocked/);
    assert.match(create, /redirect\(/);
    assert.match(detail, /showConversation=\{showSyncAi\}/);
    assert.match(detail, /showThinkDifferently=\{showRegenerate\}/);
    assert.match(nav, /convertOpportunities/);
    assert.doesNotMatch(nav, /free-prospect|starter-prospect/);
  });

  it("keeps generated outreach readable on consumed Free", () => {
    const detail = read("app/prospects/[id]/page.tsx");
    assert.match(detail, /ExecutiveIntelligenceWorkspace/);
    assert.match(detail, /assetChrome=\{getSharedAssetChrome\(messages\)\}/);
    assert.doesNotMatch(detail, /hideOutreach|hideDeploymentAssets/);
  });

  it("adds Free Convert copy to all six locales without pricing", () => {
    const required = [
      "prospects.free.availableSubtitle",
      "prospects.free.availableContext",
      "prospects.free.findContext",
      "prospects.free.manualContext",
      "prospects.free.boundNote",
      "prospects.free.processingNote",
      "prospects.free.completedNote",
      "prospects.free.failedNote",
      "prospects.free.historicalNote",
      "prospects.free.openBoundProspect",
      "prospects.free.retrySameProspect",
      "prospects.free.websiteRequired",
      "prospects.free.csvUnavailable",
      "prospects.free.csvLocked.headline",
      "prospects.free.csvLocked.capability1",
      "prospects.free.csvLocked.capability2",
    ];
    const canonical = collectKeyPaths(en);
    for (const path of required) {
      assert.ok(canonical.includes(path), path);
    }
    for (const language of ORGANIZATION_LANGUAGES) {
      const dictionary = DICTIONARIES[language];
      const paths = collectKeyPaths(dictionary);
      assert.deepEqual(
        required.filter((path) => !paths.includes(path)),
        [],
        `${language} missing Free Convert keys`,
      );
      const blob = JSON.stringify(dictionary.prospects.free);
      assert.doesNotMatch(blob, /upgrade|paywall|1\/1|€|\$|price/i);
    }
    assert.notEqual(
      fr.prospects.free.availableSubtitle,
      en.prospects.free.availableSubtitle,
    );
    assert.notEqual(
      de.prospects.free.completedNote,
      en.prospects.free.completedNote,
    );
    assert.notEqual(es.prospects.free.failedNote, en.prospects.free.failedNote);
    assert.notEqual(
      itMessages.prospects.free.manualContext,
      en.prospects.free.manualContext,
    );
    assert.notEqual(
      pt.prospects.free.processingNote,
      en.prospects.free.processingNote,
    );
  });
});
