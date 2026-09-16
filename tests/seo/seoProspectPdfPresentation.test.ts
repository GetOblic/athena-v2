import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { contrastRatio, resolveSeoProspectPdfColors } from "../../services/seo/seoProspectPdf/seoProspectPdfColors";
import {
  parseSeoProspectPdfPercent,
  parseSeoProspectPdfScore,
  sanitizeSeoProspectPdfText,
} from "../../services/seo/seoProspectPdf/seoProspectPdfText";
import { SEO_PROSPECT_PDF_PAGE } from "../../services/seo/seoProspectPdf/seoProspectPdfTokens";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("SEO prospect PDF presentation", () => {
  it("keeps A4 tokens and reusable pagination primitives", () => {
    assert.equal(SEO_PROSPECT_PDF_PAGE.size, "A4");
    assert.equal(SEO_PROSPECT_PDF_PAGE.contentWidth, 487);
    const shell = read("services/seo/seoProspectPdf/seoProspectPdfShell.ts");
    const kit = read("services/seo/seoProspectPdf/seoProspectPdfKit.ts");
    assert.match(shell, /ensureSpace\(/);
    assert.match(shell, /beginAppendix\(/);
    assert.match(shell, /pageRecord\(/);
    assert.match(shell, /comparisonLine\(/);
    assert.match(shell, /keepFieldTogether\(/);
    assert.match(shell, /priorityItem\(/);
    assert.match(shell, /drawClose\(/);
    assert.match(shell, /mode = "close"/);
    assert.match(shell, /mode === "body"/);
    assert.match(kit, /SEO_PROSPECT_PDF_PAGE/);
    assert.doesNotMatch(shell, /pie|gauge|doughnut/i);
  });

  it("sanitizes control characters without converting Unicode letters", () => {
    assert.equal(
      sanitizeSeoProspectPdfText("Café\u0000 Núñez\u200B"),
      "Café Núñez",
    );
    assert.equal(sanitizeSeoProspectPdfText("Line\r\none"), "Line\none");
    assert.equal(parseSeoProspectPdfScore("63"), 63);
    assert.equal(parseSeoProspectPdfScore("Unavailable"), null);
    assert.equal(parseSeoProspectPdfPercent("80%"), 80);
  });

  it("keeps brand surfaces readable against ink", () => {
    const colors = resolveSeoProspectPdfColors({
      organization_id: "22222222-2222-4222-8222-222222222222",
      brand_logo_storage_path: null,
      brand_profile_picture_storage_path: null,
      brand_primary_color: "#1F3A5F",
      brand_secondary_color: "#4A5568",
      brand_accent_color: "#9A3412",
      brand_background_color: "#111111",
      brand_font: "helvetica",
    });
    assert.equal(colors.coverWash, null);
    assert.ok(contrastRatio(colors.ink, colors.surface) >= 4.5);
    assert.ok(contrastRatio(colors.ink, colors.primaryTint) >= 4.5);
    assert.ok(contrastRatio(colors.ink, colors.codeSurface) >= 4.5);
  });

  it("confines presentation mapping to the PDF adapters and shell", () => {
    const visibility = read(
      "services/seo/seoProspectPdf/visibilityStrategyPdfAdapter.ts",
    );
    const technical = read(
      "services/seo/seoProspectPdf/technicalHealthPdfAdapter.ts",
    );
    const shell = read("services/seo/seoProspectPdf/seoProspectPdfShell.ts");
    for (const source of [visibility, technical, shell]) {
      assert.doesNotMatch(source, /openai|anthropic|generateSeo|llm/i);
      assert.doesNotMatch(source, /writeFile|upload\(/);
    }
    assert.match(visibility, /role: "snapshot"/);
    assert.match(visibility, /role: "appendix"/);
    assert.match(visibility, /role: "methodology"/);
    assert.match(technical, /type: "metricRows"/);
    assert.match(technical, /role: "notes"/);
    assert.match(technical, /type: "pageRecord"/);
    assert.match(technical, /id: "page-analysis"/);
    assert.doesNotMatch(technical, /id: "page-metadata"/);
    assert.doesNotMatch(technical, /prospectPdf\.websitePagesAnalyzed/);
    assert.match(shell, /seoIntelligenceReport/);
    assert.match(shell, /readyToTurnThisIntoAction/);
    assert.doesNotMatch(shell, /characterSpacing/);
  });
});
