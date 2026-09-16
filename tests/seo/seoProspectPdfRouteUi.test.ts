import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("SEO prospect PDF route and CTA", () => {
  it("exposes an authenticated nodejs binary route", () => {
    const route = read("app/api/seo/[id]/prospect-pdf/route.ts");
    assert.match(route, /export const runtime = "nodejs"/);
    assert.match(route, /export const dynamic = "force-dynamic"/);
    assert.match(route, /export const maxDuration = 60/);
    assert.match(route, /requireCurrentOrganizationContext/);
    assert.match(route, /getSeoReportById/);
    assert.match(route, /resolveSeoProspectPdfParties/);
    assert.match(route, /loadSeoProspectPdfBrandAssets/);
    assert.match(route, /renderSeoProspectPdf/);
    assert.match(route, /application\/pdf/);
    assert.match(route, /Content-Disposition/);
    assert.match(route, /Cache-Control": "no-store"/);
    assert.doesNotMatch(route, /senderOrganizationId/);
    assert.doesNotMatch(route, /searchParams/);
    assert.doesNotMatch(route, /GetOblic/);
    assert.doesNotMatch(route, /writeFile|upload\(|from\("storage"\)/);
  });

  it("adds a Ready-only prospect PDF CTA to both SEO detail headers", () => {
    const intelligence = read("components/seo/SeoReportDetailView.tsx");
    const technical = read("components/seo/SeoTechnicalReportDetailView.tsx");
    const button = read("components/seo/SeoProspectPdfDownloadButton.tsx");

    for (const view of [intelligence, technical]) {
      assert.match(view, /SeoProspectPdfDownloadButton/);
      assert.match(view, /report.status === "Ready" && pkg/);
      assert.match(view, /unlockCompletionSound/);
    }

    assert.match(button, /FileText/);
    assert.match(button, /generatingLabel/);
    assert.match(button, /createObjectURL/);
    assert.match(button, /revokeObjectURL/);
    assert.match(button, /parseContentDispositionFilename/);
    assert.doesNotMatch(button, /window\.open/);
    assert.doesNotMatch(button, /window\.print/);
  });

  it("keeps prospect PDF shell keys aligned across six locales", () => {
    const dictionaries = [en, fr, es, de, itMessages, pt];
    const canonical = Object.keys(en.seo.prospectPdf).sort();
    for (const dictionary of dictionaries) {
      assert.deepEqual(Object.keys(dictionary.seo.prospectPdf).sort(), canonical);
    }
    assert.equal(en.seo.prospectPdf.generate, "Generate Prospect PDF");
    assert.equal(en.seo.prospectPdf.commercialClose, "We're the AI guy.");
    assert.equal(en.seo.prospectPdf.seoIntelligenceReport, "SEO Intelligence Report");
    assert.equal(en.seo.prospectPdf.appendix, "Appendix");
    assert.equal(
      en.seo.prospectPdf.websitePagesAnalyzed,
      "Website Pages Analyzed",
    );
    assert.equal(
      en.seo.prospectPdf.pageLevelTechnicalAnalysis,
      "Page-Level Technical Analysis",
    );
    assert.equal(en.seo.prospectPdf.currentLabel, "Current");
    assert.equal(en.seo.prospectPdf.recommendedLabel, "Recommended");
    assert.equal(
      en.seo.prospectPdf.readyToTurnThisIntoAction,
      "Ready to turn this into action?",
    );
    assert.equal(en.seo.lenses.intelligence, "Visibility Strategy");
    assert.equal(en.seo.lenses.technical, "Website Technical Health");
  });
});
