import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("technical SEO UX identification", () => {
  it("keeps type-first selection and a single Start analysis submit", () => {
    const form = read("components/seo/SeoReportGenerateForm.tsx");
    assert.match(form, /copy\.chooseWhat/);
    assert.match(form, /copy\.startAnalysis/);
    assert.match(form, /--athena-orange/);
    assert.match(form, /generationType/);
    assert.equal((form.match(/type="submit"/g) ?? []).length, 1);
    assert.doesNotMatch(form, /enqueueBrainDeepScrapeJob/);
  });

  it("library and badges identify historical vs technical reports", () => {
    const library = read("components/seo/SeoLibraryClient.tsx");
    const badge = read("components/seo/SeoGenerationTypeBadge.tsx");
    assert.match(library, /SeoGenerationTypeBadge/);
    assert.match(library, /getLocalizedSeoLensLabel/);
    assert.doesNotMatch(library, /copy\.generateIntelligence/);
    assert.doesNotMatch(library, /copy\.generateTechnical/);
    assert.match(badge, /seoGenerationTypeLabel/);
    assert.match(badge, /--athena-success/);
    assert.match(badge, /--athena-orange/);
    const labels = read("services/seo/seoGenerationType.ts");
    assert.match(labels, /SEO Intelligence/);
    assert.match(labels, /Technical SEO/);
  });

  it("seo workspace copy is neutral and dual-mode", () => {
    const page = read("app/seo/page.tsx");
    assert.match(page, /copy\.visibility\.eyebrow/);
    assert.match(page, /copy\.visibility\.subtitle/);
    assert.match(page, /getTenantLocalization/);
    assert.doesNotMatch(page, /not a traditional crawler audit/);
  });

  it("detail views branch by generation type", () => {
    const detail = read("components/seo/SeoReportDetailView.tsx");
    const technical = read("components/seo/SeoTechnicalReportDetailView.tsx");
    assert.match(detail, /SeoTechnicalReportDetailView/);
    assert.match(detail, /SeoGenerationTypeBadge/);
    assert.match(detail, /copy\.visibility\.eyebrow/);
    assert.match(technical, /copy\.visibility\.eyebrow/);
    assert.match(technical, /SeoCoverageMeter/);
    assert.match(technical, /pkg\.executiveEvaluation/);
    assert.match(technical, /pkg\.actionPlan/);
  });
});
