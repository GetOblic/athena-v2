import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  deriveFreeVisibilityPresentation,
  shouldShowSeoNewAnalysis,
  shouldShowSeoRegenerate,
  shouldShowSeoRetrySameReport,
  shouldShowSeoTechnicalLocked,
  shouldShowSeoTechnicalOption,
} from "../../lib/seo/freeVisibilityPresentation";
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

const REPORT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("FREE-9 Visibility presentation", () => {
  it("keeps Full UI on the current New analysis + both types contract", () => {
    const presentation = deriveFreeVisibilityPresentation({
      athenaPlan: "full",
      defineKind: "ready",
    });
    assert.equal(presentation, "full");
    assert.equal(shouldShowSeoNewAnalysis(presentation), true);
    assert.equal(shouldShowSeoRegenerate(presentation), true);
    assert.equal(shouldShowSeoTechnicalOption(presentation), true);
    assert.equal(shouldShowSeoTechnicalLocked(presentation), false);
  });

  it("shows one starter analysis action for trained available Free", () => {
    const presentation = deriveFreeVisibilityPresentation({
      athenaPlan: "free",
      defineKind: "ready",
      visibilityStatus: "available",
    });
    assert.equal(presentation, "available");
    assert.equal(shouldShowSeoNewAnalysis(presentation), true);
    assert.equal(shouldShowSeoTechnicalOption(presentation), false);
    assert.equal(shouldShowSeoTechnicalLocked(presentation), true);
    assert.equal(shouldShowSeoRegenerate(presentation), false);
  });

  it("hides New analysis and regenerate while processing, ready, or historical Ready", () => {
    assert.equal(
      shouldShowSeoNewAnalysis(
        deriveFreeVisibilityPresentation({
          athenaPlan: "free",
          defineKind: "ready",
          visibilityStatus: "reserved",
          boundReportStatus: "Processing",
        }),
      ),
      false,
    );
    assert.equal(
      shouldShowSeoRegenerate(
        deriveFreeVisibilityPresentation({
          athenaPlan: "free",
          defineKind: "ready",
          visibilityStatus: "consumed",
          boundReportId: REPORT_A,
          boundReportStatus: "Ready",
        }),
      ),
      false,
    );
    assert.equal(
      shouldShowSeoNewAnalysis(
        deriveFreeVisibilityPresentation({
          athenaPlan: "free",
          defineKind: "ready",
          visibilityStatus: "available",
          hasReadyReport: true,
        }),
      ),
      false,
    );
  });

  it("shows Retry on the same bound failed report only", () => {
    const failed = deriveFreeVisibilityPresentation({
      athenaPlan: "free",
      defineKind: "ready",
      visibilityStatus: "available",
      boundReportId: REPORT_A,
      boundReportStatus: "Processing Failed",
    });
    assert.equal(failed, "failed");
    assert.equal(
      shouldShowSeoRetrySameReport(failed, {
        currentReportId: REPORT_A,
        boundReportId: REPORT_A,
      }),
      true,
    );
    assert.equal(
      shouldShowSeoRetrySameReport(failed, {
        currentReportId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        boundReportId: REPORT_A,
      }),
      false,
    );
    assert.equal(shouldShowSeoNewAnalysis(failed), false);
    assert.equal(shouldShowSeoRegenerate(failed), false);
  });

  it("wires /seo family chrome, intelligence-only composer, and no pricing", () => {
    const landing = read("app/seo/page.tsx");
    const create = read("app/seo/new/page.tsx");
    const detail = read("app/seo/[id]/page.tsx");
    const form = read("components/seo/SeoReportGenerateForm.tsx");
    const status = read("components/seo/SeoReportStatusPanel.tsx");
    const intelligence = read("components/seo/SeoReportDetailView.tsx");

    for (const source of [landing, create, detail]) {
      assert.match(source, /\{\.\.\.freeProgression\}/);
      assert.match(source, /loadFreeVisibilityPageState/);
      assert.doesNotMatch(source, /paywall|1\/1|quota/i);
    }
    assert.match(landing, /shouldShowSeoNewAnalysis/);
    assert.match(landing, /copy\.visibility\.newAnalysisCta/);
    assert.match(landing, /copy\.free\.availableSubtitle/);
    assert.match(create, /allowTechnical=\{shouldShowSeoTechnicalOption/);
    assert.match(create, /copy\.free\.newContext/);
    assert.match(form, /allowTechnical/);
    assert.match(form, /value="intelligence"/);
    assert.match(form, /value="technical"/);
    assert.match(form, /fetch\("\/api\/seo"/);
    assert.match(status, /allowRetrySame/);
    assert.match(status, /copy\.retryThis/);
    assert.match(status, /copy\.startNewSameBrief/);
    assert.match(intelligence, /allowRegenerate/);
    assert.match(intelligence, /SeoProspectPdfDownloadButton/);
    assert.doesNotMatch(form, /paywall|1\/1|quota/i);
    assert.match(form, /technicalSeoUpgradeContent/);
    assert.match(form, /UpgradeHint/);
  });

  it("adds Free Visibility copy to all six locales without pricing", () => {
    const required = [
      "seo.free.availableSubtitle",
      "seo.free.availableContext",
      "seo.free.newContext",
      "seo.free.processingNote",
      "seo.free.completedNote",
      "seo.free.failedNote",
      "seo.free.historicalNote",
      "seo.free.intelligenceOnly",
      "seo.free.technicalUnavailable",
      "seo.free.technicalLocked.headline",
      "seo.free.technicalLocked.capability1",
      "seo.free.technicalLocked.capability2",
    ];
    const canonical = collectKeyPaths(en);
    for (const path of required) {
      assert.ok(canonical.includes(path), path);
    }
    for (const language of ORGANIZATION_LANGUAGES) {
      const dictionary = DICTIONARIES[language];
      const paths = collectKeyPaths(dictionary);
      assert.deepEqual(
        required.filter((path) => !paths.includes(path)),
        [],
        `${language} missing Free Visibility keys`,
      );
      const blob = JSON.stringify(dictionary.seo.free);
      assert.doesNotMatch(blob, /upgrade|paywall|1\/1|€|\$|price/i);
    }
    assert.notEqual(fr.seo.free.availableSubtitle, en.seo.free.availableSubtitle);
    assert.notEqual(de.seo.free.completedNote, en.seo.free.completedNote);
    assert.notEqual(es.seo.free.failedNote, en.seo.free.failedNote);
    assert.notEqual(itMessages.seo.free.newContext, en.seo.free.newContext);
    assert.notEqual(pt.seo.free.processingNote, en.seo.free.processingNote);
  });
});
