/**
 * Visibility Strategy report detail visual polish — presentation contracts only.
 * Does not generate reports or change Content Coverage Score / pipeline math.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  strategyRoadmapPriorityAccent,
  strategyRoadmapPriorityPill,
} from "../../components/seo/seoStrategyReportPresentation";
import {
  computeContentCoverageScore,
  computeContentCoverageScoreFromPackage,
} from "../../lib/seo/seoScorePresentation";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Visibility Strategy report detail presentation", () => {
  it("keeps the accepted Content Coverage Score formula and package adapter", () => {
    assert.equal(
      computeContentCoverageScore({
        wellCovered: ["a", "b"],
        weakCoverage: ["c"],
        missingCoverage: ["d"],
      }),
      63,
    );
    assert.equal(computeContentCoverageScoreFromPackage(null), null);
    const intelligence = read("components/seo/SeoReportDetailView.tsx");
    const score = read("lib/seo/seoScorePresentation.ts");
    assert.match(intelligence, /computeContentCoverageScoreFromPackage/);
    assert.doesNotMatch(intelligence, /computeTechnicalCompletenessScore/);
    assert.match(score, /well \* 1\.0 \+ weak \* 0\.5 \+ missing \* 0\.0/);
    assert.doesNotMatch(score, /computeOverallSeoScore/);
  });

  it("maps stored P0–P3 priorities onto existing severity families", () => {
    assert.equal(strategyRoadmapPriorityAccent("P0"), "high");
    assert.equal(strategyRoadmapPriorityAccent("P1"), "high");
    assert.equal(strategyRoadmapPriorityAccent("P2"), "strategic");
    assert.equal(strategyRoadmapPriorityAccent("P3"), "improvement");
    assert.match(strategyRoadmapPriorityPill("P0"), /athena-orange/);
    assert.match(strategyRoadmapPriorityPill("P2"), /167,139,250/);
    assert.match(strategyRoadmapPriorityPill("P3"), /athena-success/);
  });

  it("preserves assessment, recommendations, findings, and disclaimer content", () => {
    const intelligence = read("components/seo/SeoReportDetailView.tsx");
    assert.match(intelligence, /copy\.detail\.athenasAssessment/);
    assert.match(intelligence, /\{leadAssessment\}/);
    assert.match(
      intelligence,
      /leadAssessment !== pkg\.executiveAssessment\.overallAssessment/,
    );
    assert.match(intelligence, /copy\.detail\.recommendedImprovements/);
    assert.match(intelligence, /presentation\.roadmapItems\.map/);
    assert.doesNotMatch(intelligence, /roadmapItems\.sort/);
    assert.match(intelligence, /item\.reason/);
    assert.match(intelligence, /item\.expectedBusinessImpact/);
    assert.match(intelligence, /copy\.detail\.detailedFindings/);
    assert.match(intelligence, /copy\.detail\.executiveAssessment/);
    assert.match(intelligence, /copy\.detail\.contentCoverageV2/);
    assert.match(intelligence, /copy\.detail\.customerIntentV2/);
    assert.match(intelligence, /copy\.detail\.commercialOpportunitiesV2/);
    assert.match(intelligence, /copy\.detail\.trustAndAuthorityV2/);
    assert.match(intelligence, /pkg\.contentCoverage\.wellCoveredServices/);
    assert.match(intelligence, /pkg\.contentCoverage\.weaklyCoveredServices/);
    assert.match(intelligence, /pkg\.contentCoverage\.missingServices/);
    assert.match(intelligence, /pkg\.trustAndAuthority\.recommendations\.map/);
    assert.match(intelligence, /SeoWebsitePagesAnalyzedSection/);
    assert.match(intelligence, /\{pkg\.disclaimer\}/);
    assert.match(intelligence, /copy\.detail\.regenerate/);
    assert.match(intelligence, /SeoReportHeaderDeleteButton/);
    assert.doesNotMatch(intelligence, /SeoExecutiveOverview/);
    assert.doesNotMatch(intelligence, /Visibility Score|Discoverability Score/i);
    assert.doesNotMatch(intelligence, /from "@\/services\/identity/);
    assert.doesNotMatch(intelligence, /IdentityKnowledgeScore/);
  });

  it("uses the strategy semantic icon map", () => {
    const intelligence = read("components/seo/SeoReportDetailView.tsx");
    assert.match(intelligence, /<Telescope /);
    assert.match(intelligence, /<Brain /);
    assert.match(intelligence, /<Target /);
    assert.match(intelligence, /<Layers /);
    assert.match(intelligence, /<Users /);
    assert.match(intelligence, /<TrendingUp /);
    assert.match(intelligence, /<ShieldCheck /);
    assert.match(intelligence, /<Globe /);
    assert.match(intelligence, /<Info[\s>]/);
    assert.match(intelligence, /family="strategy"/);
    assert.match(intelligence, /copyVariant="utility"/);
  });

  it("keeps the approved section order", () => {
    const intelligence = read("components/seo/SeoReportDetailView.tsx");
    const readyTree = intelligence.slice(
      intelligence.lastIndexOf("family=\"strategy\""),
    );
    const scoreIndex = readyTree.indexOf("family=\"strategy\"");
    const assessmentIndex = readyTree.indexOf("copy.detail.athenasAssessment");
    const roadmapIndex = readyTree.indexOf("copy.detail.recommendedImprovements");
    const findingsIndex = readyTree.indexOf("copy.detail.detailedFindings");
    const pagesIndex = readyTree.indexOf("<SeoWebsitePagesAnalyzedSection");
    const disclaimerIndex = readyTree.indexOf("{pkg.disclaimer}");
    assert.ok(scoreIndex >= 0 && scoreIndex < assessmentIndex);
    assert.ok(assessmentIndex < roadmapIndex);
    assert.ok(roadmapIndex < findingsIndex);
    assert.ok(findingsIndex < pagesIndex);
    assert.ok(pagesIndex < disclaimerIndex);
  });

  it("does not undo accepted technical recommendation-card grammar", () => {
    const card = read("components/seo/SeoRecommendationCard.tsx");
    assert.match(card, /Why Athena recommends this/);
    assert.match(card, /Expected business impact/);
    assert.match(card, /data-future-action-kinds/);
    assert.match(card, /seo-recommendation-actions/);
    assert.match(card, /<CopyButton/);
    assert.match(card, /tracking=\{null\}/);
    assert.match(card, /showContinue=\{false\}/);
    assert.match(card, /variant=\{copyVariant\}/);
    assert.match(card, /copyVariant = "default"/);
    assert.match(card, /SEO_TECHNICAL_PRIORITY_CARD/);
    const technical = read("components/seo/SeoTechnicalReportDetailView.tsx");
    assert.match(technical, /copyVariant="utility"/);
    assert.match(technical, /<Gauge /);
    assert.match(technical, /family="technical"/);
  });

  it("does not rewrite accepted Identity or SEO landing files", () => {
    const intelligence = read("components/seo/SeoReportDetailView.tsx");
    assert.doesNotMatch(intelligence, /IdentityKnowledgeScore/);
    assert.doesNotMatch(intelligence, /identityPagePresentation/);
    const landing = read("app/seo/page.tsx");
    assert.match(landing, /SeoAnalysisTypeCard/);
    assert.match(landing, /computeContentCoverageScoreFromPackage/);
    assert.match(landing, /computeTechnicalCompletenessScoreFromPackage/);
  });
});
