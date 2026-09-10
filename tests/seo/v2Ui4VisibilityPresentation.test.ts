/**
 * V2-UI-4C — Build Visibility presentation.
 * Source-contract checks only. Does not generate reports or mutate persistence.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { isTenantNavActive, localizeTenantNav } from "../../components/dashboard/tenantNavigation";
import {
  deriveVisibilityLandingState,
  olderReadyThanLatest,
  otherReadyLens,
} from "../../lib/seo/visibilityLandingState";
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

describe("V2-UI-4C Build Visibility presentation", () => {
  it("wraps /seo, /seo/new, and /seo/[id] in TenantAppShell with family currentPath", () => {
    const landing = read("app/seo/page.tsx");
    const create = read("app/seo/new/page.tsx");
    const detail = read("app/seo/[id]/page.tsx");
    assert.match(
      landing,
      /<TenantAppShell currentPath="\/seo" messages=\{messages\}>/,
    );
    assert.match(
      create,
      /<TenantAppShell currentPath="\/seo\/new" messages=\{messages\}>/,
    );
    assert.match(
      detail,
      /<TenantAppShell currentPath=\{`\/seo\/\$\{id\}`\} messages=\{messages\}>/,
    );
    for (const source of [landing, create, detail]) {
      assert.doesNotMatch(source, /AthenaBrandLink/);
      assert.doesNotMatch(source, /TenantBackLink/);
    }
  });

  it("keeps /seo to a single New analysis path without dual generate CTAs", () => {
    const landing = read("app/seo/page.tsx");
    const library = read("components/seo/SeoLibraryClient.tsx");
    assert.match(landing, /copy\.visibility\.newAnalysisCta/);
    assert.match(landing, /href="\/seo\/new"/);
    assert.equal((landing.match(/href="\/seo\/new"/g) ?? []).length, 1);
    assert.doesNotMatch(landing, /copy\.generateIntelligence/);
    assert.doesNotMatch(landing, /copy\.generateTechnical/);
    assert.doesNotMatch(library, /copy\.generateIntelligence/);
    assert.doesNotMatch(library, /copy\.generateTechnical/);
    assert.match(library, /copy\.visibility\.historyTitle/);
    assert.match(library, /copy\.visibility\.analysisNotFinished/);
  });

  it("renders a type-first landing with independent scores and no combined SEO score", () => {
    const landing = read("app/seo/page.tsx");
    const typeCard = read("components/seo/SeoAnalysisTypeCard.tsx");
    const scoreCard = read("components/seo/SeoScoreCard.tsx");
    const header = read("components/seo/VisibilityPageHeader.tsx");
    assert.match(header, /action\?:/);
    assert.match(landing, /VisibilityPageHeader/);
    assert.match(landing, /SEO_HEADER_CTA_CLASS/);
    assert.match(landing, /SeoAnalysisTypeCard/);
    assert.match(landing, /generationType="intelligence"/);
    assert.match(landing, /generationType="technical"/);
    assert.match(landing, /computeContentCoverageScoreFromPackage/);
    assert.match(landing, /computeTechnicalCompletenessScoreFromPackage/);
    assert.match(landing, /SeoLibraryClient/);
    assert.doesNotMatch(landing, /TwoLensExplanation/);
    assert.doesNotMatch(landing, /LatestReportCard/);
    assert.doesNotMatch(landing, /copy\.visibility\.lensesHeading/);
    assert.doesNotMatch(landing, /copy\.visibility\.latestAnalysis/);
    assert.doesNotMatch(landing, /Overall SEO Score|Combined Score|Average Score|Visibility Score/i);
    assert.doesNotMatch(landing, /computeOverallSeoScore/);
    assert.doesNotMatch(typeCard, /IdentityKnowledgeScore/);
    assert.doesNotMatch(scoreCard, /IdentityKnowledgeScore/);
    assert.match(typeCard, /contentCoverageScore/);
    assert.match(typeCard, /technicalCompleteness/);
    assert.match(typeCard, /<Telescope /);
    assert.match(typeCard, /<Gauge /);
    assert.equal(en.seo.visibility.historyTitle, "Previous analyses");
  });

  it("makes /seo/new type-first with one Start analysis submit and the existing evidence gate", () => {
    const page = read("app/seo/new/page.tsx");
    const form = read("components/seo/SeoReportGenerateForm.tsx");
    assert.match(page, /loadOrganizationDeepWebsiteIntelligence\(organizationId\)/);
    assert.match(page, /assessTechnicalSeoEvidenceSufficiency\(intelligence\)/);
    assert.doesNotMatch(page, /searchParams|generationType=/);
    assert.match(form, /copy\.chooseWhat/);
    assert.match(form, /copy\.startAnalysis/);
    assert.match(form, /value="intelligence"/);
    assert.match(form, /value="technical"/);
    assert.match(form, /technicalSelectable/);
    assert.match(form, /copy\.technicalNeedsRicher/);
    assert.match(form, /href="\/identity"/);
    assert.equal((form.match(/type="submit"/g) ?? []).length, 1);
    assert.doesNotMatch(form, /\{copy\.generateIntelligence\}/);
    assert.doesNotMatch(form, /\{copy\.generateTechnical\}/);
  });

  it("does not render SeoExecutiveOverview or Visibility Score/stars in the V2 primary tree", () => {
    const intelligence = read("components/seo/SeoReportDetailView.tsx");
    const technical = read("components/seo/SeoTechnicalReportDetailView.tsx");
    assert.doesNotMatch(intelligence, /SeoExecutiveOverview/);
    assert.doesNotMatch(intelligence, /buildSeoExecutiveOverview/);
    assert.doesNotMatch(intelligence, /SeoStrengthIndicator/);
    assert.doesNotMatch(intelligence, /stars=\{/);
    assert.doesNotMatch(intelligence, /Visibility Score|health score|discoverability score/i);
    assert.doesNotMatch(technical, /Visibility Score|health score|discoverability score/i);
    assert.doesNotMatch(technical, /stars=\{/);
    assert.match(intelligence, /copy\.detail\.recommendedImprovements/);
    assert.match(intelligence, /copy\.detail\.detailedFindings/);
    assert.doesNotMatch(intelligence, /copy\.detail\.supportingIntelligence/);
    const roadmapIndex = intelligence.indexOf("copy.detail.recommendedImprovements");
    const findingsIndex = intelligence.indexOf("copy.detail.detailedFindings");
    assert.ok(roadmapIndex > 0 && roadmapIndex < findingsIndex);
  });

  it("keeps technical action plan before coverage and diagnostics", () => {
    const technical = read("components/seo/SeoTechnicalReportDetailView.tsx");
    const readyTree = technical.slice(technical.lastIndexOf("return ("));
    const actionIndex = readyTree.indexOf("technical.recommendedImprovements");
    const coverageIndex = readyTree.indexOf("<TechnicalCoveragePanel");
    const diagnosticsIndex = readyTree.indexOf("technical.deeperDiagnostics");
    assert.ok(actionIndex > 0 && actionIndex < coverageIndex);
    assert.ok(coverageIndex > 0 && coverageIndex < diagnosticsIndex);
    assert.match(technical, /copy\.coverageScope/);
    assert.match(technical, /pkg\.actionPlan\.items\.map/);
    assert.doesNotMatch(technical, /actionPlan\.items\.sort/);
  });

  it("does not render fabricated trustRecommendationWhy in the V2 UI", () => {
    const intelligence = read("components/seo/SeoReportDetailView.tsx");
    assert.doesNotMatch(intelligence, /trustRecommendationWhy/);
    assert.match(intelligence, /pkg\.trustAndAuthority\.recommendations\.map/);
  });

  it("supports provenance date interpolation and analyzed-page coverage scope", () => {
    const presentation = read("lib/tenantI18n/seoPresentation.ts");
    const technical = read("components/seo/SeoTechnicalReportDetailView.tsx");
    assert.match(presentation, /formatLocalizedSeoProvenance/);
    assert.match(en.seo.detail.provenance, /\{date\}/);
    assert.match(technical, /copy\.coverageScope/);
    assert.match(technical, /pkg\.technicalCoverage\.analyzedPageCount/);
    assert.equal(
      en.seo.technical.coverageScope,
      "These figures describe the pages included in this analysis, not your overall discoverability.",
    );
  });

  it("leaves existing Home-facing generationType strings unchanged", () => {
    assert.equal(en.seo.generationType.intelligence, "SEO Intelligence");
    assert.equal(en.seo.generationType.technical, "Technical SEO");
    assert.equal(en.seo.lenses.intelligence, "Visibility Strategy");
    assert.equal(en.seo.lenses.technical, "Website Technical Health");
    const homePresentation = read("lib/home/homePresentation.ts");
    assert.match(
      homePresentation,
      /messages\.seo\.generationType\[state\.generationType\]/,
    );
    assert.doesNotMatch(homePresentation, /messages\.seo\.lenses/);
    assert.doesNotMatch(read("app/page.tsx"), /messages\.seo\.lenses/);
  });

  it("keeps TenantAppShell active behavior on /seo/new and /seo/[id]", () => {
    const items = localizeTenantNav(en);
    const visibility = items.find((item) => item.key === "buildVisibility");
    assert.ok(visibility);
    assert.equal(isTenantNavActive("/seo", visibility), true);
    assert.equal(isTenantNavActive("/seo/new", visibility), true);
    assert.equal(isTenantNavActive("/seo/abc", visibility), true);
    assert.equal(isTenantNavActive("/", visibility), false);
  });

  it("derives landing state from the report list only", () => {
    const reports = [
      {
        id: "new",
        name: "Queued strategy",
        status: "Queued",
        generationType: "intelligence" as const,
        summary: null,
        createdAt: "2026-09-07T00:00:00.000Z",
      },
      {
        id: "ready-health",
        name: "Ready health",
        status: "Ready",
        generationType: "technical" as const,
        summary: "Technical summary",
        createdAt: "2026-09-06T00:00:00.000Z",
      },
      {
        id: "ready-strategy",
        name: "Ready strategy",
        status: "Ready",
        generationType: "intelligence" as const,
        summary: "Strategy summary",
        createdAt: "2026-09-05T00:00:00.000Z",
      },
    ];
    const state = deriveVisibilityLandingState(reports);
    assert.equal(state.latest?.id, "new");
    assert.equal(state.lastReady?.id, "ready-health");
    assert.equal(state.lastReadyStrategy?.id, "ready-strategy");
    assert.equal(state.lastReadyHealth?.id, "ready-health");
    assert.equal(olderReadyThanLatest(state.latest, state.lastReady)?.id, "ready-health");
    assert.equal(otherReadyLens(state.lastReadyHealth, state)?.id, "ready-strategy");
    const landing = read("app/seo/page.tsx");
    assert.doesNotMatch(landing, /loadOrganizationDeepWebsiteIntelligence/);
    assert.doesNotMatch(landing, /assessTechnicalSeoEvidenceSufficiency/);
  });

  it("aligns new V2 chrome keys across all six dictionaries", () => {
    const required = [
      "seo.lenses.intelligence",
      "seo.lenses.technical",
      "seo.visibility.title",
      "seo.visibility.analyzeCta",
      "seo.visibility.newAnalysisCta",
      "seo.visibility.historyTitle",
      "seo.visibility.contentCoverageScore",
      "seo.visibility.technicalCompleteness",
      "seo.visibility.scoreUnavailable",
      "seo.visibility.needsAttention",
      "seo.visibility.developing",
      "seo.visibility.strong",
      "seo.visibility.excellentCoverage",
      "seo.detail.detailedFindings",
      "seo.new.startAnalysis",
      "seo.detail.provenance",
      "seo.technical.coverageScope",
      "seo.statusPanel.analyzing",
    ];
    const canonical = collectKeyPaths(en);
    for (const path of required) {
      assert.ok(canonical.includes(path), path);
    }
    for (const language of ORGANIZATION_LANGUAGES) {
      const paths = collectKeyPaths(DICTIONARIES[language]);
      assert.deepEqual(
        required.filter((path) => !paths.includes(path)),
        [],
        `${language} missing V2 visibility keys`,
      );
    }
    assert.notEqual(fr.seo.lenses.intelligence, en.seo.lenses.intelligence);
    assert.notEqual(de.seo.lenses.technical, en.seo.lenses.technical);
  });

  it("uses V2 default analysis name and guidance placeholder copy", () => {
    assert.equal(en.seo.new.namePlaceholder, "Untitled visibility analysis");
    assert.equal(
      en.seo.new.guidancePlaceholder,
      "Optional guidance for this analysis. Leave blank and Athena will determine what deserves attention.",
    );
    const form = read("components/seo/SeoReportGenerateForm.tsx");
    assert.match(form, /placeholder=\{copy\.namePlaceholder\}/);
    assert.match(form, /placeholder=\{copy\.guidancePlaceholder\}/);
    assert.doesNotMatch(en.seo.new.namePlaceholder, /SEO Report/i);
    assert.doesNotMatch(
      en.seo.new.guidancePlaceholder,
      /SEO report|freeform direction|strongest opportunities/i,
    );
    for (const language of ORGANIZATION_LANGUAGES) {
      if (language === "en") continue;
      const copy = DICTIONARIES[language].seo.new;
      assert.notEqual(copy.namePlaceholder, en.seo.new.namePlaceholder);
      assert.notEqual(copy.guidancePlaceholder, en.seo.new.guidancePlaceholder);
      assert.doesNotMatch(copy.namePlaceholder, /SEO Report|SEO-Bericht|rapport SEO|informe SEO|report SEO|relatório SEO/i);
      assert.doesNotMatch(
        copy.guidancePlaceholder,
        /SEO report|rapport SEO|informe SEO|report SEO|SEO-Bericht|relatório SEO|freeform|direction libre|dirección libre|direzione libera|freie Richtung|direção livre/i,
      );
    }
  });
});
