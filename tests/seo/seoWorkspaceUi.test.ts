import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { dashboardNavItems } from "../../components/dashboard/DashboardSidebar";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("seo workspace UI", () => {
  it("adds SEO Intelligence navigation item without renaming existing items", () => {
    const labels = dashboardNavItems.map((item) => item.label);
    assert.ok(labels.includes("SEO Intelligence"));
    assert.ok(labels.includes("Ads"));
    assert.ok(labels.includes("Personas"));
    assert.ok(labels.includes("Prospects"));
    assert.ok(labels.includes("Discussions"));
    assert.equal(
      dashboardNavItems.find((item) => item.label === "SEO Intelligence")?.href,
      "/seo",
    );
  });

  it("library has empty state, Generate CTA, open/delete actions", () => {
    const library = read("components/seo/SeoLibraryClient.tsx");
    assert.match(library, /No SEO reports yet/);
    assert.match(library, /Generate SEO Intelligence/);
    assert.match(library, /Open/);
    assert.match(library, /SeoReportHeaderDeleteButton/);
  });

  it("new form states brief is optional and supports generation without brief", () => {
    const form = read("components/seo/SeoReportGenerateForm.tsx");
    assert.match(form, /brief is optional/i);
    assert.match(form, /no brief at all/i);
    assert.match(form, /More detail/);
    assert.match(form, /Generate SEO Intelligence/);
    assert.match(form, /submittingRef/);
  });

  it("detail view renders six Ready sections, copy controls, status stages, regenerate", () => {
    const detail = read("components/seo/SeoReportDetailView.tsx");
    assert.match(detail, /Executive SEO Assessment/);
    assert.match(detail, /Content Coverage Analysis/);
    assert.match(detail, /Customer Intent Analysis/);
    assert.match(detail, /Commercial Opportunity Analysis/);
    assert.match(detail, /Trust & Authority Analysis/);
    assert.match(detail, /90-Day SEO Roadmap/);
    assert.match(detail, /SeoReportStatusPanel/);
    assert.match(detail, /Regenerate/);

    const section = read("components/seo/SeoReportSection.tsx");
    assert.match(section, /CopyButton/);
    assert.match(section, /showContinue=\{false\}/);
    assert.match(section, /tracking=\{null\}/);

    const status = read("components/seo/SeoReportStatusPanel.tsx");
    assert.match(status, /Assembling organization intelligence/);
    assert.match(status, /Generating executive SEO assessment/i);
    assert.match(status, /\/api\/seo\/\$\{reportId\}\/status/);
    assert.match(status, /Regenerate as new report/);
  });

  it("delete uses ConfirmDeleteControl pattern", () => {
    const del = read("components/seo/SeoReportHeaderDeleteButton.tsx");
    assert.match(del, /ConfirmDeleteControl/);
    assert.match(del, /\/api\/seo\/\$\{reportId\}/);
    assert.match(del, /redirectTo="\/seo"/);
  });

  it("pages exist for library, new, and detail", () => {
    assert.match(read("app/seo/page.tsx"), /SeoLibraryClient/);
    assert.match(read("app/seo/new/page.tsx"), /SeoReportGenerateForm/);
    assert.match(read("app/seo/[id]/page.tsx"), /SeoReportDetailView/);
  });
});
