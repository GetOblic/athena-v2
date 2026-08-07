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

  it("library has empty state, dual Generate CTAs, open/delete actions", () => {
    const library = read("components/seo/SeoLibraryClient.tsx");
    assert.match(library, /No SEO reports yet/);
    assert.match(library, /Generate SEO Intelligence/);
    assert.match(library, /Generate Technical SEO/);
    assert.match(library, /--athena-orange/);
    assert.match(library, /--athena-success/);
    assert.match(library, /Open/);
    assert.match(library, /SeoReportHeaderDeleteButton/);
  });

  it("new form states brief is optional and supports generation without brief", () => {
    const form = read("components/seo/SeoReportGenerateForm.tsx");
    assert.match(form, /brief is optional/i);
    assert.match(form, /More detail/);
    assert.match(form, /Generate SEO Intelligence/);
    assert.match(form, /Generate Technical SEO/);
    assert.match(form, /submittingRef/);
  });

  it("detail view renders executive overview and progressive disclosure sections", () => {
    const detail = read("components/seo/SeoReportDetailView.tsx");
    assert.match(detail, /SeoExecutiveOverview/);
    assert.match(detail, /Executive Assessment/);
    assert.match(detail, /Content Coverage Analysis/);
    assert.match(detail, /Customer Intent Analysis/);
    assert.match(detail, /Commercial Opportunity Analysis/);
    assert.match(detail, /Trust & Authority Analysis/);
    assert.match(detail, /90-Day SEO Roadmap/);
    assert.match(detail, /SeoWebsitePagesAnalyzedSection/);
    assert.match(detail, /SeoRecommendationCard/);
    assert.match(detail, /SeoReportStatusPanel/);
    assert.match(detail, /Regenerate/);
    assert.match(detail, /defaultOpen=\{false\}/);

    const overview = read("components/seo/SeoExecutiveOverview.tsx");
    assert.match(overview, /Overall SEO Intelligence Score/);
    assert.match(overview, /Commercial Readiness/);
    assert.match(overview, /Content Coverage/);
    assert.match(overview, /Trust & Authority/);
    assert.match(overview, /Biggest Opportunity/);
    assert.match(overview, /Biggest Risk/);
    assert.match(overview, /Fastest Win/);
    assert.match(overview, /Recommended Next Action/);

    const section = read("components/seo/SeoReportSection.tsx");
    assert.match(section, /CopyButton/);
    assert.match(section, /showContinue=\{false\}/);
    assert.match(section, /tracking=\{null\}/);
    assert.match(section, /defaultOpen = false/);
    assert.match(section, /formatReadingTime/);
    assert.match(section, /formatStarRating/);
    assert.match(section, /showToggleLabel/);

    const recommendation = read("components/seo/SeoRecommendationCard.tsx");
    assert.match(recommendation, /Why Athena recommends this/);
    assert.match(recommendation, /Expected business impact/);
    assert.match(recommendation, /data-future-action-kinds/);
    assert.match(recommendation, /seo-recommendation-actions/);

    const pagesSection = read("components/seo/SeoWebsitePagesAnalyzedSection.tsx");
    assert.match(pagesSection, /Website Pages Analyzed/);
    assert.match(pagesSection, /defaultOpen=\{false\}/);
    assert.match(pagesSection, /WebsiteAnalyzedPagesList/);
    assert.match(pagesSection, /No website page inventory was captured/);

    const sharedList = read(
      "components/websiteLearning/WebsiteAnalyzedPagesList.tsx",
    );
    assert.match(sharedList, /Untitled page/);
    assert.match(sharedList, /target="_blank"/);
    assert.match(sharedList, /rel="noopener noreferrer"/);

    const identity = read("components/identity/IdentityExecutiveIntelligence.tsx");
    assert.match(identity, /WebsiteAnalyzedPagesList/);
    assert.match(identity, /Analyzed source pages/);
    assert.match(identity, /Website Intelligence Coverage/);

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
