/**
 * /seo landing + detail presentation contracts for the type-first redesign.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  deriveVisibilityTypeCardState,
  scoreSourceForTypeCard,
} from "../../lib/seo/visibilityTypeCards";
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

describe("/seo type-first landing presentation", () => {
  it("places New analysis in the header and does not duplicate it on populated landing", () => {
    const landing = read("app/seo/page.tsx");
    assert.match(landing, /action=\{/);
    assert.match(landing, /copy\.visibility\.newAnalysisCta/);
    assert.equal((landing.match(/href="\/seo\/new"/g) ?? []).length, 1);
    assert.doesNotMatch(landing, /copy\.visibility\.analyzeCta/);
  });

  it("keeps both analysis-type cards as siblings with independent scores", () => {
    const landing = read("app/seo/page.tsx");
    const typeCard = read("components/seo/SeoAnalysisTypeCard.tsx");
    assert.match(landing, /lg:grid-cols-2/);
    assert.match(landing, /intelligenceScore/);
    assert.match(landing, /technicalScore/);
    assert.doesNotMatch(landing, /overallScore|combinedScore|averageScore/i);
    assert.match(typeCard, /isTechnical \? "technical" : "strategy"/);
    assert.doesNotMatch(typeCard, /contentCoverageScore \+ |technicalCompleteness \+/);
  });

  it("does not render Visibility Score, stars, or a parent SEO score", () => {
    const landing = read("app/seo/page.tsx");
    const typeCard = read("components/seo/SeoAnalysisTypeCard.tsx");
    const scoreCard = read("components/seo/SeoScoreCard.tsx");
    const intelligence = read("components/seo/SeoReportDetailView.tsx");
    const technical = read("components/seo/SeoTechnicalReportDetailView.tsx");
    for (const source of [landing, typeCard, scoreCard, intelligence, technical]) {
      assert.doesNotMatch(source, /Visibility Score/);
      assert.doesNotMatch(source, /Overall SEO Score/);
      assert.doesNotMatch(source, /stars=\{/);
      assert.doesNotMatch(source, /IdentityKnowledgeScore/);
    }
    assert.match(intelligence, /computeContentCoverageScoreFromPackage/);
    assert.doesNotMatch(intelligence, /computeTechnicalCompletenessScore/);
    assert.match(technical, /computeTechnicalCompletenessScoreFromPackage/);
    assert.doesNotMatch(technical, /computeContentCoverageScore/);
  });

  it("shows score unavailable as an em dash, not a fake 0%", () => {
    const scoreCard = read("components/seo/SeoScoreCard.tsx");
    assert.match(scoreCard, /available \? `\$\{clamped\}%` : "—"/);
    assert.match(scoreCard, /unavailableLabel/);
    assert.doesNotMatch(scoreCard, /\$\{clamped\}%` : "0/);
  });

  it("keeps Previous analyses correctly spelled and history searchable", () => {
    assert.equal(en.seo.visibility.historyTitle, "Previous analyses");
    const library = read("components/seo/SeoLibraryClient.tsx");
    assert.match(library, /copy\.visibility\.historyTitle/);
    assert.match(library, /report\.summary/);
    assert.match(library, /copy\.actionOpen/);
    assert.match(library, /SeoReportHeaderDeleteButton/);
    assert.match(library, /query\.trim/);
  });

  it("loads last Ready packages from the existing listSeoReports result", () => {
    const landing = read("app/seo/page.tsx");
    assert.match(landing, /listSeoReports\(organizationId\)/);
    assert.match(landing, /no extra query/);
    assert.doesNotMatch(landing, /getSeoReportById/);
    assert.doesNotMatch(landing, /fetch\(/);
    assert.doesNotMatch(landing, /\/api\/seo/);
  });

  it("consolidates intelligence lead assessment and keeps technical coverage", () => {
    const intelligence = read("components/seo/SeoReportDetailView.tsx");
    const technical = read("components/seo/SeoTechnicalReportDetailView.tsx");
    assert.match(intelligence, /leadAssessment/);
    assert.doesNotMatch(intelligence, /showOverall/);
    assert.match(intelligence, /copy\.detail\.detailedFindings/);
    assert.match(intelligence, /leadAssessment !== pkg\.executiveAssessment\.overallAssessment/);
    assert.match(technical, /TechnicalCoveragePanel/);
    assert.match(technical, /pkg\.technicalCoverage/);
    assert.match(technical, /technical\.recommendedImprovements/);
  });

  it("preserves /seo/new workflow while restyling type choice cards", () => {
    const form = read("components/seo/SeoReportGenerateForm.tsx");
    assert.match(form, /value="intelligence"/);
    assert.match(form, /value="technical"/);
    assert.match(form, /technicalSelectable/);
    assert.match(form, /<Telescope /);
    assert.match(form, /<Gauge /);
    assert.equal((form.match(/type="submit"/g) ?? []).length, 1);
    assert.match(form, /--athena-orange/);
  });

  it("adds required score keys to all six locales without changing Previous analyses", () => {
    const required = [
      "seo.visibility.contentCoverageScore",
      "seo.visibility.contentCoverageScoreHelp",
      "seo.visibility.technicalCompleteness",
      "seo.visibility.technicalCompletenessHelp",
      "seo.visibility.scoreUnavailable",
      "seo.visibility.needsAttention",
      "seo.visibility.developing",
      "seo.visibility.strong",
      "seo.visibility.excellentCoverage",
      "seo.visibility.strategyCardHelp",
      "seo.visibility.healthCardHelp",
      "seo.detail.detailedFindings",
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
        `${language} missing SEO score keys`,
      );
      assert.notEqual(
        DICTIONARIES[language].seo.visibility.historyTitle.trim(),
        "",
      );
    }
    assert.equal(en.seo.visibility.historyTitle, "Previous analyses");
    assert.equal(en.seo.generationType.intelligence, "SEO Intelligence");
    assert.equal(en.seo.generationType.technical, "Technical SEO");
    assert.notEqual(
      fr.seo.visibility.contentCoverageScore,
      en.seo.visibility.contentCoverageScore,
    );
    assert.notEqual(
      de.seo.visibility.technicalCompleteness,
      en.seo.visibility.technicalCompleteness,
    );
    assert.notEqual(es.seo.detail.detailedFindings, en.seo.detail.detailedFindings);
    assert.notEqual(itMessages.seo.visibility.scoreUnavailable, en.seo.visibility.scoreUnavailable);
    assert.notEqual(pt.seo.visibility.needsAttention, en.seo.visibility.needsAttention);
  });
});

describe("per-type landing card state", () => {
  it("tracks latest and last Ready independently for each analysis type", () => {
    const reports = [
      {
        id: "queued-strategy",
        name: "Queued strategy",
        status: "Queued",
        generationType: "intelligence" as const,
        summary: null,
        createdAt: "2026-09-08T00:00:00.000Z",
      },
      {
        id: "failed-health",
        name: "Failed health",
        status: "Processing Failed",
        generationType: "technical" as const,
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

    const strategy = deriveVisibilityTypeCardState(reports, "intelligence");
    const health = deriveVisibilityTypeCardState(reports, "technical");
    assert.equal(strategy.latest?.id, "queued-strategy");
    assert.equal(strategy.lastReady?.id, "ready-strategy");
    assert.equal(health.latest?.id, "failed-health");
    assert.equal(health.lastReady?.id, "ready-health");
    assert.equal(scoreSourceForTypeCard(strategy), "lastReady");
    assert.equal(scoreSourceForTypeCard(health), "previousReady");
  });
});
