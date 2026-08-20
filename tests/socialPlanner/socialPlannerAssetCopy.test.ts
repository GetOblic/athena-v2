import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { serializeSocialCalendarAsset } from "../../components/socialPlanner/socialPlannerAssetCopyText";
import { resolveAssetContinuationDestination } from "../../services/assetContinuation/destinationRegistry";
import {
  buildGenerationContext,
  buildValidatedPackage,
} from "./socialPlannerGenerationFixtures";

function validatedAssets() {
  return buildValidatedPackage(buildGenerationContext()).assets;
}

describe("Social Planner V30 L1 whole-asset serializer", () => {
  it("includes representative execution-facing fields, Social Copy, and CTA", () => {
    const asset = validatedAssets()[0];
    const text = serializeSocialCalendarAsset(asset);

    assert.match(text, /Date: 2026-05-10/);
    assert.match(text, /Weekday: Sunday/);
    assert.match(text, /Asset Type: Carousel/);
    assert.match(text, /Objective: Educate/);
    assert.match(text, /Audience:/);
    assert.match(text, /Concept:/);
    assert.match(text, /Hook:/);
    assert.match(text, /Social Copy/);
    assert.equal(text.includes(asset.socialCopy), true);
    assert.match(text, /CTA: Ask about after-school hours/);
    assert.match(text, /Recommended Platforms: Instagram, LinkedIn/);
  });

  it("includes applicable production-spec content for each family", () => {
    const assets = validatedAssets();
    const byType = Object.fromEntries(
      assets.map((asset) => [asset.productionSpec.kind, asset]),
    );

    const carousel = serializeSocialCalendarAsset(byType.carousel);
    assert.match(carousel, /Production Specification/);
    assert.match(carousel, /Kind: Carousel/);
    assert.match(carousel, /Visual Direction:/);
    assert.match(carousel, /Design Prompt:/);
    assert.match(carousel, /Slide 1/);
    assert.match(carousel, /Headline: Overdue signs/);
    assert.match(carousel, /Body: Bleeding floss is a signal\./);

    const video = serializeSocialCalendarAsset(byType.video);
    assert.match(video, /Kind: Video/);
    assert.match(video, /Video Concept:/);
    assert.match(video, /Scene \/ Shot Plan/);
    assert.match(video, /Shot 1/);
    assert.match(video, /Production Direction:/);
    assert.match(video, /Dialogue:/);

    const document = serializeSocialCalendarAsset(byType.document);
    assert.match(document, /Kind: Document/);
    assert.match(document, /Document Concept:/);
    assert.match(document, /Heading: Before you arrive/);
    assert.match(document, /Design Prompt:/);

    const engagement = serializeSocialCalendarAsset(byType.engagement);
    assert.match(engagement, /Kind: Engagement/);
    assert.match(engagement, /Prompt:/);
    assert.match(engagement, /Options/);
    assert.match(engagement, /- After school/);

    const image = serializeSocialCalendarAsset(byType.static);
    assert.match(image, /Kind: Static/);
    assert.match(image, /Image Prompt:/);
    assert.match(image, /Composition:/);
    assert.match(image, /Overlay Guidance:/);
  });

  it("omits absent optional values and excludes internal metadata", () => {
    const asset = {
      ...validatedAssets()[2],
      hook: null,
      cta: null,
      calendarAnchors: [],
    };
    const text = serializeSocialCalendarAsset(asset);

    assert.doesNotMatch(text, /^Hook:/m);
    assert.doesNotMatch(text, /^CTA:/m);
    assert.doesNotMatch(text, /Calendar Opportunity/);
    assert.doesNotMatch(text, /creativeFingerprint|fingerprint/i);
    assert.doesNotMatch(text, /sourceSignals/);
    assert.doesNotMatch(text, /personaIds/);
    assert.doesNotMatch(text, /generationMetadata|provenance/i);
    assert.doesNotMatch(text, /sourceCandidateId/);
    assert.equal(text.includes(asset.socialCopy), true);
  });

  it("is deterministic and includes calendar opportunity labels only", () => {
    const [asset] = validatedAssets();
    const withAnchor = {
      ...asset,
      calendarAnchors: [
        {
          sourceCandidateId: "secret-anchor-id",
          date: asset.date,
          label: "Mother's Day",
          category: "commercial_event" as const,
          scope: "country" as const,
          jurisdictionCountryCode: "US",
          jurisdictionRegionCode: null,
          jurisdictionHemisphere: null,
          reason: "Selected as a relevant calendar anchor.",
        },
      ],
    };

    const first = serializeSocialCalendarAsset(withAnchor);
    const second = serializeSocialCalendarAsset(withAnchor);
    assert.equal(first, second);
    assert.match(first, /Calendar Opportunity: Mother's Day/);
    assert.doesNotMatch(first, /secret-anchor-id/);
    assert.doesNotMatch(first, /commercial_event/);
  });

  it("does not require destinationRegistry changes for Social Planner types", () => {
    for (const assetType of ["carousel", "talking_head_video", "branded_graphic", "poll"]) {
      const resolved = resolveAssetContinuationDestination({
        assetType,
        preferences: null,
      });
      assert.equal(resolved.kind, "ai_workspace");
      assert.equal(resolved.label, "ChatGPT");
    }
  });
});
