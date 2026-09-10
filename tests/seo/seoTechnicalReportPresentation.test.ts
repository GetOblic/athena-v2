/**
 * Technical SEO report detail visual polish — presentation contracts only.
 * Does not generate reports or change score / pipeline math.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { technicalCoverageMeterAccent } from "../../components/seo/seoTechnicalReportPresentation";
import {
  computeTechnicalCompletenessScore,
  computeTechnicalCompletenessScoreFromPackage,
} from "../../lib/seo/seoScorePresentation";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("technical SEO report detail presentation", () => {
  it("keeps the accepted completeness formula and package adapter", () => {
    assert.equal(
      computeTechnicalCompletenessScore({
        titleCoveragePercent: 100,
        descriptionCoveragePercent: 80,
        h1CoveragePercent: 90,
        canonicalCoveragePercent: 100,
        schemaCoveragePercent: 50,
        imageAltCoveragePercent: 70,
      }),
      82,
    );
    assert.equal(computeTechnicalCompletenessScoreFromPackage(null), null);
    const technical = read("components/seo/SeoTechnicalReportDetailView.tsx");
    const score = read("lib/seo/seoScorePresentation.ts");
    assert.match(technical, /computeTechnicalCompletenessScoreFromPackage/);
    assert.doesNotMatch(technical, /computeContentCoverageScore/);
    assert.match(score, /Rounded arithmetic mean of available coverage percentages/);
    assert.doesNotMatch(score, /penalty|grade|seo grade/i);
  });

  it("tints coverage meters without inventing a new score", () => {
    assert.equal(technicalCoverageMeterAccent(100), "healthy");
    assert.equal(technicalCoverageMeterAccent(90), "healthy");
    assert.equal(technicalCoverageMeterAccent(89), "technical");
    assert.equal(technicalCoverageMeterAccent(0), "technical");
    assert.equal(technicalCoverageMeterAccent(null), "technical");
    const technical = read("components/seo/SeoTechnicalReportDetailView.tsx");
    assert.match(technical, /technicalCoverageMeterAccent\(coverage\.titleCoveragePercent\)/);
    assert.doesNotMatch(technical, /seoCompletenessBand\(/);
  });

  it("preserves assessment, recommendations, diagnostics, and disclaimer content", () => {
    const technical = read("components/seo/SeoTechnicalReportDetailView.tsx");
    assert.match(technical, /copy\.detail\.athenasAssessment/);
    assert.match(technical, /\{leadAssessment\}/);
    assert.match(technical, /technical\.recommendedImprovements/);
    assert.match(technical, /pkg\.actionPlan\.items\.map/);
    assert.doesNotMatch(technical, /actionPlan\.items\.sort/);
    assert.match(technical, /item\.reason/);
    assert.match(technical, /item\.recommendedAction/);
    assert.match(technical, /item\.affectedPages/);
    assert.match(technical, /technical\.whatAthenaFound/);
    assert.match(technical, /pkg\.technicalCoverage\.coverage/);
    assert.match(technical, /coverage\.titleCoveragePercent/);
    assert.match(technical, /coverage\.imageAltCoveragePercent/);
    assert.match(technical, /technical\.deeperDiagnostics/);
    assert.match(technical, /technical\.pageLevelMetadataV2/);
    assert.match(technical, /technical\.siteArchitectureV2/);
    assert.match(technical, /technical\.contentHtmlFindingsV2/);
    assert.match(technical, /technical\.structuredDataV2/);
    assert.match(technical, /technical\.imageSeoV2/);
    assert.match(technical, /technical\.crawlFindingsV2/);
    assert.match(technical, /technical\.implementationGuidanceTitle/);
    assert.match(technical, /SeoWebsitePagesAnalyzedSection/);
    assert.match(technical, /\{pkg\.disclaimer\}/);
    assert.match(technical, /copy\.detail\.regenerate/);
    assert.match(technical, /SeoReportHeaderDeleteButton/);
    assert.doesNotMatch(technical, /\/api\/seo(?!\/\$\{report\.id\})/);
    assert.doesNotMatch(technical, /from "@\/services\/identity/);
    assert.doesNotMatch(technical, /IdentityKnowledgeScore/);
  });

  it("uses the accepted semantic icon map", () => {
    const technical = read("components/seo/SeoTechnicalReportDetailView.tsx");
    assert.match(technical, /<Gauge /);
    assert.match(technical, /<Brain /);
    assert.match(technical, /<ListChecks /);
    assert.match(technical, /<ScanSearch /);
    assert.match(technical, /<FileText /);
    assert.match(technical, /<GitBranch /);
    assert.match(technical, /<Code2 /);
    assert.match(technical, /<Braces /);
    assert.match(technical, /<ImageIcon /);
    assert.match(technical, /<Wrench /);
    assert.match(technical, /<Globe /);
    assert.match(technical, /<Info[\s>]/);
    assert.match(technical, /<Layers /);
    const card = read("components/seo/SeoRecommendationCard.tsx");
    assert.match(card, /<Lightbulb /);
    assert.match(card, /<CheckCircle /);
    assert.match(card, /<FileText /);
    assert.match(card, /<ChevronDown/);
    assert.match(card, /variant=\{copyVariant\}/);
  });

  it("keeps Copy and collapse behavior on the shared recommendation card", () => {
    const card = read("components/seo/SeoRecommendationCard.tsx");
    assert.match(card, /Why Athena recommends this/);
    assert.match(card, /Expected business impact/);
    assert.match(card, /data-future-action-kinds/);
    assert.match(card, /seo-recommendation-actions/);
    assert.match(card, /<CopyButton/);
    assert.match(card, /tracking=\{null\}/);
    assert.match(card, /showContinue=\{false\}/);
    assert.match(card, /event\.stopPropagation\(\)/);
    assert.match(card, /aria-expanded=\{open\}/);
    const copy = read("components/deployment/CopyButton.tsx");
    assert.match(copy, /writeClipboardText/);
    assert.match(
      copy,
      /rounded-xl border border-\[var\(--athena-orange\)\]\/30 bg-\[var\(--athena-orange\)\]\/10 px-4 py-2 text-sm font-medium text-\[var\(--athena-orange\)\] transition hover:bg-\[var\(--athena-orange\)\]\/20/,
    );
    assert.match(copy, /variant === "utility"/);
  });

  it("does not rewrite accepted Identity or SEO landing files", () => {
    const technical = read("components/seo/SeoTechnicalReportDetailView.tsx");
    assert.doesNotMatch(technical, /IdentityKnowledgeScore/);
    assert.doesNotMatch(technical, /identityPagePresentation/);
    const landing = read("app/seo/page.tsx");
    assert.match(landing, /SeoAnalysisTypeCard/);
    assert.match(landing, /computeContentCoverageScoreFromPackage/);
    assert.match(landing, /computeTechnicalCompletenessScoreFromPackage/);
  });
});
