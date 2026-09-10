import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  computeContentCoverageScore,
  computeContentCoverageScoreFromPackage,
  computeTechnicalCompletenessScore,
  computeTechnicalCompletenessScoreFromPackage,
  contentCoverageInventoryFromAnalysis,
  seoCompletenessBand,
} from "../../lib/seo/seoScorePresentation";
import type {
  SeoContentCoverageAnalysis,
  SeoIntelligencePackage,
  SeoTechnicalPackage,
} from "../../services/seo/seoReportTypes";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function coverage(
  well: number,
  weak: number,
  missing: number,
): SeoContentCoverageAnalysis {
  return {
    wellCoveredServices: Array.from({ length: well }, (_, i) => `well-${i}`),
    weaklyCoveredServices: Array.from({ length: weak }, (_, i) => `weak-${i}`),
    missingServices: Array.from({ length: missing }, (_, i) => `missing-${i}`),
    missingCustomerQuestions: [],
    missingTrustContent: [],
    missingEducationalContent: [],
    missingConversionContent: [],
    analysis: "unused prose",
    athenaEvidence: ["unused evidence"],
  };
}

describe("Content Coverage Score", () => {
  it("returns null for empty or missing inventory", () => {
    assert.equal(computeContentCoverageScore(null), null);
    assert.equal(computeContentCoverageScore(undefined), null);
    assert.equal(computeContentCoverageScore({}), null);
    assert.equal(
      computeContentCoverageScore({
        wellCovered: [],
        weakCoverage: [],
        missingCoverage: [],
      }),
      null,
    );
    assert.equal(
      computeContentCoverageScoreFromPackage(null),
      null,
    );
  });

  it("scores all missing as 0, all weak as 50, all well as 100", () => {
    assert.equal(
      computeContentCoverageScore({
        wellCovered: [],
        weakCoverage: [],
        missingCoverage: ["a", "b"],
      }),
      0,
    );
    assert.equal(
      computeContentCoverageScore({
        wellCovered: [],
        weakCoverage: ["a", "b", "c"],
        missingCoverage: [],
      }),
      50,
    );
    assert.equal(
      computeContentCoverageScore({
        wellCovered: ["a", "b"],
        weakCoverage: [],
        missingCoverage: [],
      }),
      100,
    );
  });

  it("computes the exact mixed inventory roll-up", () => {
    // (2*1 + 1*0.5 + 1*0) / 4 * 100 = 62.5 → 63
    assert.equal(
      computeContentCoverageScore({
        wellCovered: ["a", "b"],
        weakCoverage: ["c"],
        missingCoverage: ["d"],
      }),
      63,
    );
    // (1*1 + 1*0.5 + 1*0) / 3 * 100 = 50
    assert.equal(
      computeContentCoverageScore({
        wellCovered: ["a"],
        weakCoverage: ["b"],
        missingCoverage: ["c"],
      }),
      50,
    );
  });

  it("is deterministic and bounded 0–100", () => {
    const inventory = {
      wellCovered: ["a"],
      weakCoverage: ["b", "c"],
      missingCoverage: ["d"],
    };
    const first = computeContentCoverageScore(inventory);
    const second = computeContentCoverageScore(inventory);
    assert.equal(first, second);
    assert.ok(first != null && first >= 0 && first <= 100);
  });

  it("maps the stored service-coverage inventory only", () => {
    const mapped = contentCoverageInventoryFromAnalysis(coverage(2, 1, 3));
    assert.deepEqual(mapped, {
      wellCovered: ["well-0", "well-1"],
      weakCoverage: ["weak-0"],
      missingCoverage: ["missing-0", "missing-1", "missing-2"],
    });
    // (2*1 + 1*0.5 + 3*0) / 6 * 100 = 41.67 → 42
    assert.equal(computeContentCoverageScore(mapped), 42);
  });

  it("does not depend on prose, scoreFromText, or technical coverage", () => {
    const source = read("lib/seo/seoScorePresentation.ts");
    const contentFn = source.slice(
      source.indexOf("export function computeContentCoverageScore("),
      source.indexOf("export function computeTechnicalCompletenessScore("),
    );
    assert.doesNotMatch(source, /scoreFromText/);
    assert.doesNotMatch(source, /buildSeoExecutiveOverview/);
    assert.doesNotMatch(contentFn, /executiveAssessment/);
    assert.doesNotMatch(contentFn, /overallAssessment/);
    assert.doesNotMatch(contentFn, /titleCoveragePercent/);
    const pkg = {
      executiveAssessment: {
        overallAssessment: "Excellent SEO performance",
        strengths: [],
        weaknesses: [],
        seoReadiness: "high",
        businessVisibilityAssessment: "strong visibility",
        summary: "Outstanding discoverability",
      },
      contentCoverage: coverage(0, 0, 2),
    } as unknown as SeoIntelligencePackage;
    assert.equal(computeContentCoverageScoreFromPackage(pkg), 0);
  });
});

describe("On-page Technical Completeness", () => {
  it("returns null when no coverage values exist", () => {
    assert.equal(computeTechnicalCompletenessScore(null), null);
    assert.equal(computeTechnicalCompletenessScore(undefined), null);
    assert.equal(computeTechnicalCompletenessScore({}), null);
    assert.equal(
      computeTechnicalCompletenessScore({
        titleCoveragePercent: null,
        descriptionCoveragePercent: null,
        imageAltCoveragePercent: null,
      }),
      null,
    );
    assert.equal(computeTechnicalCompletenessScoreFromPackage(null), null);
  });

  it("keeps numeric zero in the mean and ignores nulls", () => {
    assert.equal(
      computeTechnicalCompletenessScore({
        titleCoveragePercent: 0,
        descriptionCoveragePercent: 0,
        h1CoveragePercent: 0,
      }),
      0,
    );
    assert.equal(
      computeTechnicalCompletenessScore({
        titleCoveragePercent: 100,
        descriptionCoveragePercent: 80,
        h1CoveragePercent: 60,
        canonicalCoveragePercent: null,
        schemaCoveragePercent: null,
        imageAltCoveragePercent: null,
      }),
      80,
    );
  });

  it("averages available percentages and scores all 100 as 100", () => {
    assert.equal(
      computeTechnicalCompletenessScore({
        titleCoveragePercent: 100,
        descriptionCoveragePercent: 100,
        h1CoveragePercent: 100,
        canonicalCoveragePercent: 100,
        schemaCoveragePercent: 100,
        imageAltCoveragePercent: 100,
      }),
      100,
    );
    assert.equal(
      computeTechnicalCompletenessScore({
        titleCoveragePercent: 90,
        descriptionCoveragePercent: 70,
        h1CoveragePercent: 80,
      }),
      80,
    );
  });

  it("is deterministic and bounded 0–100", () => {
    const coveragePercents = {
      titleCoveragePercent: 12,
      descriptionCoveragePercent: 88,
    };
    const first = computeTechnicalCompletenessScore(coveragePercents);
    const second = computeTechnicalCompletenessScore(coveragePercents);
    assert.equal(first, second);
    assert.ok(first != null && first >= 0 && first <= 100);
  });

  it("does not use LLM fields or Content Coverage Score", () => {
    const source = read("lib/seo/seoScorePresentation.ts");
    const technicalStart = source.indexOf(
      "export function computeTechnicalCompletenessScore(",
    );
    const technicalFn = source.slice(
      technicalStart,
      source.indexOf("return clampScore(mean);", technicalStart) +
        "return clampScore(mean);".length,
    );
    assert.doesNotMatch(source, /scoreFromText/);
    assert.doesNotMatch(technicalFn, /wellCoveredServices/);
    assert.doesNotMatch(technicalFn, /contentCoverage/);
    const pkg = {
      generationType: "technical",
      executiveEvaluation: {
        overallAssessment: "Excellent technical SEO",
        strengths: [],
        criticalIssues: [],
        warnings: [],
        remediationPriorities: [],
        summary: "Perfect site",
      },
      technicalCoverage: {
        coverage: {
          titleCoveragePercent: 0,
          descriptionCoveragePercent: 0,
          h1CoveragePercent: 0,
          canonicalCoveragePercent: 0,
          schemaCoveragePercent: 0,
          imageAltCoveragePercent: 0,
        },
      },
    } as unknown as SeoTechnicalPackage;
    assert.equal(computeTechnicalCompletenessScoreFromPackage(pkg), 0);
  });
});

describe("no combined SEO score", () => {
  it("does not export or compute a parent / averaged SEO score", () => {
    const source = read("lib/seo/seoScorePresentation.ts");
    assert.doesNotMatch(source, /computeOverallSeoScore/);
    assert.doesNotMatch(source, /Overall SEO Score/);
    assert.doesNotMatch(source, /Combined Score/);
    assert.doesNotMatch(source, /Average Score/);
    assert.doesNotMatch(source, /overallSeo/);
    assert.match(source, /never combined, averaged, or rolled into a parent/);
  });

  it("keeps the two formulas independent", () => {
    const content = computeContentCoverageScore({
      wellCovered: ["a"],
      weakCoverage: [],
      missingCoverage: [],
    });
    const technical = computeTechnicalCompletenessScore({
      titleCoveragePercent: 0,
      descriptionCoveragePercent: 0,
    });
    assert.equal(content, 100);
    assert.equal(technical, 0);
    assert.notEqual(content, technical);
    const combined = ((content ?? 0) + (technical ?? 0)) / 2;
    assert.notEqual(content, combined);
    assert.notEqual(technical, combined);
  });

  it("assigns bands with completeness wording, not SEO performance claims", () => {
    assert.equal(seoCompletenessBand(0), "needsAttention");
    assert.equal(seoCompletenessBand(39), "needsAttention");
    assert.equal(seoCompletenessBand(40), "developing");
    assert.equal(seoCompletenessBand(69), "developing");
    assert.equal(seoCompletenessBand(70), "strong");
    assert.equal(seoCompletenessBand(89), "strong");
    assert.equal(seoCompletenessBand(90), "excellentCoverage");
    assert.equal(seoCompletenessBand(100), "excellentCoverage");
  });
});
