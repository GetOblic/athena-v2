import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  deriveFreeTractionPresentation,
  shouldShowAdsCreate,
  shouldShowAdsRegenerate,
  shouldShowAdsRetrySameCampaign,
} from "../../lib/ads/freeTractionPresentation";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import { ORGANIZATION_LANGUAGES } from "../../services/organizationLanguage";

const ROOT = process.cwd();

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

const CAMPAIGN_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("FREE-10 Traction presentation", () => {
  it("keeps Full UI on the current create + regenerate contract", () => {
    const presentation = deriveFreeTractionPresentation({
      athenaPlan: "full",
      defineKind: "ready",
    });
    assert.equal(presentation, "full");
    assert.equal(shouldShowAdsCreate(presentation), true);
    assert.equal(shouldShowAdsRegenerate(presentation), true);
  });

  it("shows one starter create surface for trained available Free", () => {
    const presentation = deriveFreeTractionPresentation({
      athenaPlan: "free",
      defineKind: "ready",
      tractionStatus: "available",
    });
    assert.equal(presentation, "available");
    assert.equal(shouldShowAdsCreate(presentation), true);
    assert.equal(shouldShowAdsRegenerate(presentation), false);
  });

  it("hides create and regenerate while processing, ready, or historical Ready", () => {
    assert.equal(
      shouldShowAdsCreate(
        deriveFreeTractionPresentation({
          athenaPlan: "free",
          defineKind: "ready",
          tractionStatus: "reserved",
          boundCampaignStatus: "Processing",
        }),
      ),
      false,
    );
    assert.equal(
      shouldShowAdsRegenerate(
        deriveFreeTractionPresentation({
          athenaPlan: "free",
          defineKind: "ready",
          tractionStatus: "consumed",
          boundCampaignId: CAMPAIGN_A,
          boundCampaignStatus: "Ready",
        }),
      ),
      false,
    );
    assert.equal(
      shouldShowAdsCreate(
        deriveFreeTractionPresentation({
          athenaPlan: "free",
          defineKind: "ready",
          tractionStatus: "available",
          hasReadyCampaign: true,
        }),
      ),
      false,
    );
  });

  it("shows Retry on the same bound failed campaign only", () => {
    const failed = deriveFreeTractionPresentation({
      athenaPlan: "free",
      defineKind: "ready",
      tractionStatus: "available",
      boundCampaignId: CAMPAIGN_A,
      boundCampaignStatus: "Processing Failed",
    });
    assert.equal(failed, "failed");
    assert.equal(
      shouldShowAdsRetrySameCampaign(failed, {
        currentCampaignId: CAMPAIGN_A,
        boundCampaignId: CAMPAIGN_A,
      }),
      true,
    );
    assert.equal(
      shouldShowAdsRetrySameCampaign(failed, {
        currentCampaignId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        boundCampaignId: CAMPAIGN_A,
      }),
      false,
    );
    assert.equal(shouldShowAdsCreate(failed), false);
    assert.equal(shouldShowAdsRegenerate(failed), false);
  });

  it("wires /ads family chrome, optional brief, and no pricing", () => {
    const landing = read("app/ads/page.tsx");
    const create = read("app/ads/new/page.tsx");
    const detail = read("app/ads/[id]/page.tsx");
    const form = read("components/ads/AdCampaignGenerateForm.tsx");
    const library = read("components/ads/AdsLibraryClient.tsx");
    const status = read("components/ads/AdCampaignStatusPanel.tsx");
    const campaign = read("components/ads/AdCampaignDetailView.tsx");

    for (const source of [landing, create, detail]) {
      assert.match(source, /\{\.\.\.freeProgression\}/);
      assert.match(source, /loadFreeTractionPageState/);
      assert.doesNotMatch(source, /paywall|1\/1|quota/i);
    }
    assert.match(landing, /shouldShowAdsCreate/);
    assert.match(landing, /copy\.free\.availableSubtitle/);
    assert.match(landing, /allowCreate=\{showCreate\}/);
    assert.match(create, /shouldShowAdsCreate/);
    assert.match(create, /copy\.free\.newContext/);
    assert.match(create, /redirect\(/);
    assert.match(form, /starterContext/);
    assert.match(form, /fetch\("\/api\/ads"/);
    assert.match(form, /personaId: targetAudience\.personaId/);
    assert.match(library, /allowCreate/);
    assert.match(status, /allowRetrySame/);
    assert.match(status, /copy\.retry/);
    assert.match(status, /copy\.regenerateAsNew/);
    assert.match(campaign, /allowRegenerate/);
    assert.match(campaign, /CopyButton|getAdsCopyChrome/);
    assert.doesNotMatch(form, /upgrade|paywall|1\/1/i);
    assert.doesNotMatch(library, /padlock|upgrade/i);
    assert.doesNotMatch(campaign, /padlock|upgrade/i);
  });

  it("adds Free Traction copy to all six locales without pricing", () => {
    const required = [
      "ads.free.availableSubtitle",
      "ads.free.availableContext",
      "ads.free.newContext",
      "ads.free.processingNote",
      "ads.free.completedNote",
      "ads.free.failedNote",
      "ads.free.historicalNote",
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
        `${language} missing Free Traction keys`,
      );
      const blob = JSON.stringify(dictionary.ads.free);
      assert.doesNotMatch(blob, /upgrade|paywall|1\/1|€|\$|price/i);
    }
    assert.notEqual(fr.ads.free.availableSubtitle, en.ads.free.availableSubtitle);
    assert.notEqual(de.ads.free.completedNote, en.ads.free.completedNote);
    assert.notEqual(es.ads.free.failedNote, en.ads.free.failedNote);
    assert.notEqual(itMessages.ads.free.newContext, en.ads.free.newContext);
    assert.notEqual(pt.ads.free.processingNote, en.ads.free.processingNote);
  });
});
