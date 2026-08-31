import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("technical SEO UX identification", () => {
  it("keeps Generate SEO Intelligence orange and adds Generate Technical SEO green CTA", () => {
    const form = read("components/seo/SeoReportGenerateForm.tsx");
    assert.match(form, /copy\.generateIntelligence/);
    assert.match(form, /copy\.generateTechnical/);
    assert.match(form, /--athena-orange/);
    assert.match(form, /--athena-success/);
    assert.match(form, /generationType/);
    assert.doesNotMatch(form, /enqueueBrainDeepScrapeJob/);
  });

  it("library and badges identify historical vs technical reports", () => {
    const library = read("components/seo/SeoLibraryClient.tsx");
    const badge = read("components/seo/SeoGenerationTypeBadge.tsx");
    assert.match(library, /SeoGenerationTypeBadge/);
    assert.match(library, /copy\.generateIntelligence/);
    assert.match(library, /copy\.generateTechnical/);
    assert.match(badge, /seoGenerationTypeLabel/);
    assert.match(badge, /--athena-success/);
    assert.match(badge, /--athena-orange/);
    const labels = read("services/seo/seoGenerationType.ts");
    assert.match(labels, /SEO Intelligence/);
    assert.match(labels, /Technical SEO/);
  });

  it("seo workspace copy is neutral and dual-mode", () => {
    const page = read("app/seo/page.tsx");
    assert.match(page, /copy\.eyebrow/);
    assert.match(page, /copy\.subtitle/);
    assert.match(page, /getTenantLocalization/);
    assert.doesNotMatch(page, /not a traditional crawler audit/);
  });

  it("detail views branch by generation type", () => {
    const detail = read("components/seo/SeoReportDetailView.tsx");
    const technical = read("components/seo/SeoTechnicalReportDetailView.tsx");
    assert.match(detail, /SeoTechnicalReportDetailView/);
    assert.match(detail, /SeoGenerationTypeBadge/);
    assert.match(detail, /copy\.detail\.eyebrow/);
    assert.match(technical, /technical\.eyebrow/);
    assert.match(technical, /SeoCoverageMeter/);
    assert.match(technical, /technical\.executiveEvaluation/);
    assert.match(technical, /technical\.actionPlan/);
  });
});
