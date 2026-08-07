import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeSeoGenerationType,
  resolveSeoGenerationType,
  seoGenerationTypeLabel,
} from "../../services/seo/seoGenerationType";
import { normalizeSeoReportBrief } from "../../services/seo/seoReportBrief";
import { mapSeoReportRow } from "../../services/seo/seoReportMappers";
import { toPublicSeoReportSummary } from "../../services/seo/seoReportPublic";

describe("seo generationType normalization", () => {
  it("defaults missing/unknown values to intelligence", () => {
    assert.equal(normalizeSeoGenerationType(undefined), "intelligence");
    assert.equal(normalizeSeoGenerationType(null), "intelligence");
    assert.equal(normalizeSeoGenerationType(""), "intelligence");
    assert.equal(normalizeSeoGenerationType("other"), "intelligence");
    assert.equal(normalizeSeoGenerationType("technical"), "technical");
    assert.equal(normalizeSeoGenerationType("intelligence"), "intelligence");
  });

  it("resolves package over brief, then brief, then historical default", () => {
    assert.equal(
      resolveSeoGenerationType({
        brief: { generationType: "intelligence" },
        package: { generationType: "technical" },
      }),
      "technical",
    );
    assert.equal(
      resolveSeoGenerationType({
        brief: { generationType: "technical" },
        package: null,
      }),
      "technical",
    );
    assert.equal(resolveSeoGenerationType({ brief: {}, package: {} }), "intelligence");
  });

  it("normalizes briefs centrally with generationType", () => {
    assert.deepEqual(normalizeSeoReportBrief(null), {
      generationType: "intelligence",
    });
    assert.deepEqual(normalizeSeoReportBrief({}), {
      generationType: "intelligence",
    });
    assert.equal(
      normalizeSeoReportBrief({ generationType: "technical" }).generationType,
      "technical",
    );
  });

  it("treats historical Ready reports without generationType as intelligence", () => {
    const report = mapSeoReportRow({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      organization_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      user_id: null,
      name: "Legacy SEO",
      brief_json: {},
      status: "Queued",
      generation_stage: null,
      package_json: null,
      error_code: null,
      error_message: null,
      created_at: "2026-08-05T00:00:00.000Z",
      updated_at: "2026-08-05T00:00:00.000Z",
    });
    assert.equal(report.brief_json.generationType, "intelligence");
    assert.equal(
      toPublicSeoReportSummary(report).generationType,
      "intelligence",
    );
    assert.equal(seoGenerationTypeLabel("intelligence"), "SEO Intelligence");
    assert.equal(seoGenerationTypeLabel("technical"), "Technical SEO");
  });
});
