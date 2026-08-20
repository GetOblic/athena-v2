import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  BLUEPRINT_ASSET_TYPES,
  buildSocialCalendarAssetInteractionType,
  isSupportedAssetInteractionType,
  parseSocialCalendarAssetInteractionType,
} from "../../services/assetInteractions/assetInteractionKeys";
import { SocialCalendarPeriodError } from "../../services/socialPlanner/socialCalendarTypes";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Social Planner V30 L3 interaction keys", () => {
  it("builds social_day_YYYY-MM-DD from a valid calendar date", () => {
    assert.equal(
      buildSocialCalendarAssetInteractionType("2026-05-11"),
      "social_day_2026-05-11",
    );
    assert.equal(
      buildSocialCalendarAssetInteractionType("2024-02-29"),
      "social_day_2024-02-29",
    );
  });

  it("round-trips a valid key through the parser", () => {
    const key = buildSocialCalendarAssetInteractionType("2026-05-11");
    assert.equal(parseSocialCalendarAssetInteractionType(key), "2026-05-11");
    assert.equal(
      parseSocialCalendarAssetInteractionType("social_day_2026-08-21"),
      "2026-08-21",
    );
  });

  it("rejects a malformed prefix and does not accept a surrounding match", () => {
    assert.equal(
      parseSocialCalendarAssetInteractionType("Social_day_2026-05-11"),
      null,
    );
    assert.equal(
      parseSocialCalendarAssetInteractionType("day_2026-05-11"),
      null,
    );
    assert.equal(
      parseSocialCalendarAssetInteractionType("social-day-2026-05-11"),
      null,
    );
    assert.equal(
      parseSocialCalendarAssetInteractionType("xsocial_day_2026-05-11"),
      null,
    );
    assert.equal(
      parseSocialCalendarAssetInteractionType("social_day_2026-05-11_extra"),
      null,
    );
    assert.equal(parseSocialCalendarAssetInteractionType("social_day_"), null);
    assert.equal(parseSocialCalendarAssetInteractionType("carousel"), null);
    assert.equal(parseSocialCalendarAssetInteractionType(null), null);
  });

  it("rejects a malformed ISO date fragment", () => {
    assert.equal(
      parseSocialCalendarAssetInteractionType("social_day_20260511"),
      null,
    );
    assert.equal(
      parseSocialCalendarAssetInteractionType("social_day_2026-5-11"),
      null,
    );
    assert.equal(
      parseSocialCalendarAssetInteractionType("social_day_05/11/2026"),
      null,
    );
    assert.equal(
      parseSocialCalendarAssetInteractionType("social_day_2026-08-19T00:00:00.000Z"),
      null,
    );
    assert.equal(
      parseSocialCalendarAssetInteractionType("social_day_next-monday"),
      null,
    );
  });

  it("rejects an impossible calendar date and arbitrary social_day_* values", () => {
    assert.equal(
      parseSocialCalendarAssetInteractionType("social_day_2026-02-30"),
      null,
    );
    assert.equal(
      parseSocialCalendarAssetInteractionType("social_day_2023-02-29"),
      null,
    );
    assert.equal(
      parseSocialCalendarAssetInteractionType("social_day_2026-13-01"),
      null,
    );
    assert.equal(
      parseSocialCalendarAssetInteractionType("social_day_not-a-date"),
      null,
    );
    assert.throws(
      () => buildSocialCalendarAssetInteractionType("2026-02-30"),
      SocialCalendarPeriodError,
    );
  });

  it("keeps existing Deployment/Blueprint keys supported and rejects malformed social days", () => {
    assert.equal(isSupportedAssetInteractionType("community_reply"), true);
    assert.equal(isSupportedAssetInteractionType("email_outreach"), true);
    assert.equal(
      isSupportedAssetInteractionType(BLUEPRINT_ASSET_TYPES.image_prompt),
      true,
    );
    assert.equal(isSupportedAssetInteractionType("objection_handling"), true);
    assert.equal(
      isSupportedAssetInteractionType("social_day_2026-05-11"),
      true,
    );
    assert.equal(
      isSupportedAssetInteractionType("social_day_2026-02-30"),
      false,
    );
    assert.equal(isSupportedAssetInteractionType("social_day_monday"), false);
    assert.equal(isSupportedAssetInteractionType("not_a_real_asset"), false);
  });

  it("does not add generated daily keys to the static supported set", () => {
    const keys = read("services/assetInteractions/assetInteractionKeys.ts");
    assert.match(keys, /SUPPORTED_ASSET_INTERACTION_TYPES = new Set/);
    assert.doesNotMatch(
      keys,
      /SUPPORTED_ASSET_INTERACTION_TYPES = new Set<string>\(\[[\s\S]*social_day_/,
    );
    assert.match(keys, /parseSocialCalendarAssetInteractionType\(key\)/);
    assert.match(keys, /parseSocialCalendarDate/);
  });
});
