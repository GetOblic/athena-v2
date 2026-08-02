import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AdCampaignBriefValidationError,
  formatAdCampaignBriefGuidanceBlock,
  hasUsefulAdCampaignGuidance,
  normalizeAdCampaignBrief,
  resolveAdCampaignBriefMode,
} from "../../services/ads/adCampaignBrief";

describe("ad campaign brief", () => {
  it("accepts no brief / empty object as inferred", () => {
    assert.deepEqual(normalizeAdCampaignBrief(null), {});
    assert.deepEqual(normalizeAdCampaignBrief(undefined), {});
    assert.deepEqual(normalizeAdCampaignBrief({}), {});
    assert.equal(resolveAdCampaignBriefMode({}), "inferred");
    assert.equal(hasUsefulAdCampaignGuidance({}), false);
  });

  it("accepts partial and complete briefs as guided when useful fields present", () => {
    const partial = normalizeAdCampaignBrief({ guidance: " Focus on webinars " });
    assert.equal(partial.guidance, "Focus on webinars");
    assert.equal(resolveAdCampaignBriefMode(partial), "guided");

    const complete = normalizeAdCampaignBrief({
      name: "Spring",
      guidance: "Push consulting",
      objective: "Leads",
      offer: "Audit",
      audience: "Founders",
      geography: "US",
      landingPage: "https://example.com",
      constraints: "No discounts",
    });
    assert.equal(complete.name, "Spring");
    assert.equal(resolveAdCampaignBriefMode(complete), "guided");
  });

  it("treats name-only as inferred (guidance is primary useful input)", () => {
    const brief = normalizeAdCampaignBrief({ name: "Named only" });
    assert.equal(brief.name, "Named only");
    assert.equal(hasUsefulAdCampaignGuidance(brief), false);
    assert.equal(resolveAdCampaignBriefMode(brief), "inferred");
  });

  it("formats guidance as a separate operator block, not trusted facts", () => {
    const guided = formatAdCampaignBriefGuidanceBlock(
      { guidance: "Prioritize B2B" },
      "guided",
    );
    assert.match(guided, /OPERATOR GUIDANCE/);
    assert.match(guided, /not trusted/);
    assert.match(guided, /Prioritize B2B/);
    assert.doesNotMatch(guided, /ATHENA BRAIN/);

    const inferred = formatAdCampaignBriefGuidanceBlock({}, "inferred");
    assert.match(inferred, /No campaign brief/);
    assert.match(inferred, /inferred/);
  });

  it("rejects invalid types and overlong fields", () => {
    assert.throws(
      () => normalizeAdCampaignBrief("nope"),
      AdCampaignBriefValidationError,
    );
    assert.throws(
      () => normalizeAdCampaignBrief({ guidance: 12 as unknown as string }),
      AdCampaignBriefValidationError,
    );
    assert.throws(
      () => normalizeAdCampaignBrief({ name: "x".repeat(121) }),
      AdCampaignBriefValidationError,
    );
  });
});
