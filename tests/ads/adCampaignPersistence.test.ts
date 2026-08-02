import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  toPublicAdCampaignDetail,
  toPublicAdCampaignSummary,
} from "../../services/ads/adCampaignPublic";
import { mapAdCampaignRow } from "../../services/ads/adCampaignMappers";
import {
  KEYWORD_THEMES_DISCLAIMER,
  KEYWORD_THEMES_LABEL,
  type AdCampaignPackage,
} from "../../services/ads/adCampaignTypes";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function samplePackage(): AdCampaignPackage {
  return {
    strategy: {
      campaignName: "Ready Campaign",
      objective: "Leads",
      audience: "Founders",
      coreOfferOrMessage: "Clarity",
      positioningAngle: "Operator",
      primaryValueProposition: "Booked work",
      ctaDirection: "Book",
      landingPageDirection: "Service",
      rationale: "Evidence-backed",
      briefMode: "inferred",
    },
    facebook: {
      primaryText: "fb primary",
      headline: "fb headline",
      description: "fb desc",
      ctaRecommendation: "Book",
      audienceDirection: "Founders",
      creativeConcept: "Board",
      imagePrompt: "Desk",
    },
    instagram: {
      feedCaption: "ig caption",
      openingHook: "ig hook",
      reelOrStoryScript: "ig script",
      onScreenText: "ig text",
      cta: "ig cta",
      hashtagDirection: null,
      creativeConcept: "ig creative",
      imageOrShortVideoPrompt: "ig prompt",
    },
    tiktok: {
      openingHook: "tt hook",
      shortVideoScript: "tt script",
      sceneDirection: "tt scene",
      onScreenText: "tt text",
      caption: "tt caption",
      cta: "tt cta",
      creatorOrProductionDirection: "native",
    },
    googleSearch: {
      campaignTheme: "Search theme",
      adGroupThemes: ["A", "B"],
      headlines: ["H1", "H2", "H3"],
      descriptions: ["D1", "D2"],
      sitelinkIdeas: ["S1", "S2"],
      calloutIdeas: ["C1", "C2"],
      structuredSnippetIdeas: ["SS1", "SS2"],
      negativeKeywordSuggestions: ["free"],
      landingPageDirection: "LP",
    },
    keywordThemes: {
      label: KEYWORD_THEMES_LABEL,
      themes: [
        {
          theme: "t1",
          intentClassification: "i",
          audienceRelevance: "a",
          suggestedMessageAngle: "m",
          suggestedLandingPageDirection: "l",
        },
        {
          theme: "t2",
          intentClassification: "i",
          audienceRelevance: "a",
          suggestedMessageAngle: "m",
          suggestedLandingPageDirection: "l",
        },
        {
          theme: "t3",
          intentClassification: "i",
          audienceRelevance: "a",
          suggestedMessageAngle: "m",
          suggestedLandingPageDirection: "l",
        },
      ],
      disclaimer: KEYWORD_THEMES_DISCLAIMER,
    },
  };
}

describe("ad campaign persistence contracts", () => {
  it("maps organization ownership and hides partial packages unless Ready", () => {
    const processing = mapAdCampaignRow({
      id: "11111111-1111-4111-8111-111111111111",
      organization_id: "22222222-2222-4222-8222-222222222222",
      user_id: null,
      name: "Processing",
      brief_json: {},
      status: "Processing",
      generation_stage: "facebook",
      package_json: samplePackage(),
      error_code: null,
      error_message: null,
      created_at: "2026-08-02T00:00:00.000Z",
      updated_at: "2026-08-02T00:00:00.000Z",
    });

    assert.equal(processing.organization_id, "22222222-2222-4222-8222-222222222222");
    assert.equal(processing.package_json, null);
    assert.equal(toPublicAdCampaignDetail(processing).package, null);

    const ready = mapAdCampaignRow({
      ...processing,
      status: "Ready",
      package_json: samplePackage(),
    } as unknown as Record<string, unknown>);
    assert.ok(ready.package_json);
    assert.equal(toPublicAdCampaignSummary(ready).objective, "Leads");
    assert.equal(toPublicAdCampaignDetail(ready).package?.strategy.campaignName, "Ready Campaign");
  });

  it("failed campaigns never expose a complete package", () => {
    const failed = mapAdCampaignRow({
      id: "11111111-1111-4111-8111-111111111111",
      organization_id: "22222222-2222-4222-8222-222222222222",
      user_id: null,
      name: "Failed",
      brief_json: { guidance: "x" },
      status: "Processing Failed",
      generation_stage: "failed",
      package_json: samplePackage(),
      error_code: "INVALID_PACKAGE",
      error_message: "bad",
      created_at: "2026-08-02T00:00:00.000Z",
      updated_at: "2026-08-02T00:00:00.000Z",
    });
    assert.equal(failed.package_json, null);
    assert.equal(toPublicAdCampaignDetail(failed).package, null);
  });

  it("service queries always filter by organization_id", () => {
    const service = read("services/ads/adCampaignService.ts");
    assert.match(service, /\.eq\("organization_id", organizationId\)/);
    assert.match(service, /\.eq\("organization_id", input\.organizationId\)/);
    assert.match(service, /createAdCampaign/);
    assert.match(service, /deleteAdCampaign/);
    assert.doesNotMatch(service, /discussion_id/);
    assert.doesNotMatch(service, /executive_versions/);
    assert.doesNotMatch(service, /knowledge_assets/);
  });

  it("orchestration regenerates as a new row and never overwrites Ready packages", () => {
    const orchestration = read("services/ads/adCampaignOrchestration.ts");
    assert.match(orchestration, /createAdCampaignWithJob/);
    assert.match(orchestration, /regenerateAdCampaign/);
    assert.match(orchestration, /ReadyAdCampaignImmutableError/);
    assert.match(orchestration, /source\.brief_json/);
    assert.match(orchestration, /markAdCampaignEnqueueFailed/);
  });

  it("migration creates org-owned tables without altering existing tables", () => {
    const migration = read(
      "supabase/migrations/20260802000001_create_ad_campaigns.sql",
    );
    assert.match(migration, /create table if not exists ad_campaigns/);
    assert.match(migration, /create table if not exists athena_ad_generation_jobs/);
    assert.match(migration, /references organizations\(id\) on delete cascade/);
    assert.match(migration, /claim_athena_ad_generation_job/);
    assert.match(migration, /heartbeat_athena_ad_generation_job/);
    assert.match(migration, /complete_athena_ad_generation_job/);
    assert.match(migration, /fail_athena_ad_generation_job/);
    assert.doesNotMatch(migration, /alter table discussions/);
    assert.doesNotMatch(migration, /alter table prospects/);
    assert.doesNotMatch(migration, /alter table personas/);
    assert.doesNotMatch(migration, /alter table athena_generation_jobs/);
    assert.doesNotMatch(migration, /discussion_id/);
  });
});
