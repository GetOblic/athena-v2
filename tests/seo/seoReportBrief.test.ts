import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SeoReportBriefValidationError,
  formatSeoReportBriefGuidanceBlock,
  hasUsefulSeoReportGuidance,
  normalizeSeoReportBrief,
  resolveSeoReportBriefMode,
} from "../../services/seo/seoReportBrief";

describe("seo report brief", () => {
  it("accepts no brief / empty object as inferred", () => {
    assert.deepEqual(normalizeSeoReportBrief(null), {
      generationType: "intelligence",
    });
    assert.deepEqual(normalizeSeoReportBrief(undefined), {
      generationType: "intelligence",
    });
    assert.deepEqual(normalizeSeoReportBrief({}), {
      generationType: "intelligence",
    });
    assert.equal(resolveSeoReportBriefMode({}), "inferred");
    assert.equal(hasUsefulSeoReportGuidance({}), false);
  });

  it("accepts partial and complete briefs as guided when useful fields present", () => {
    const partial = normalizeSeoReportBrief({
      guidance: " Focus on service pages ",
    });
    assert.equal(partial.guidance, "Focus on service pages");
    assert.equal(resolveSeoReportBriefMode(partial), "guided");

    const complete = normalizeSeoReportBrief({
      name: "Q3 SEO",
      guidance: "Prioritize trust content",
      focusArea: "Service visibility",
      geography: "US",
      constraints: "No technical crawl topics",
    });
    assert.equal(complete.name, "Q3 SEO");
    assert.equal(resolveSeoReportBriefMode(complete), "guided");
  });

  it("treats name-only as inferred", () => {
    const brief = normalizeSeoReportBrief({ name: "Named only" });
    assert.equal(brief.name, "Named only");
    assert.equal(hasUsefulSeoReportGuidance(brief), false);
    assert.equal(resolveSeoReportBriefMode(brief), "inferred");
  });

  it("formats guidance as a separate operator block, not trusted facts", () => {
    const guided = formatSeoReportBriefGuidanceBlock(
      { guidance: "Prioritize B2B services" },
      "guided",
    );
    assert.match(guided, /OPERATOR GUIDANCE/);
    assert.match(guided, /not trusted business facts/i);
    assert.match(guided, /Prioritize B2B services/);

    const inferred = formatSeoReportBriefGuidanceBlock({}, "inferred");
    assert.match(inferred, /No SEO brief was supplied/);
  });

  it("rejects non-object briefs and oversized fields", () => {
    assert.throws(
      () => normalizeSeoReportBrief("bad"),
      SeoReportBriefValidationError,
    );
    assert.throws(
      () => normalizeSeoReportBrief({ guidance: "x".repeat(4001) }),
      SeoReportBriefValidationError,
    );
  });
});
