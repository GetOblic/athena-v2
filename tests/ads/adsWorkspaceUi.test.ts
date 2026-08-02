import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { dashboardNavItems } from "../../components/dashboard/DashboardSidebar";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("ads workspace UI", () => {
  it("adds Ads navigation item without renaming existing items", () => {
    const labels = dashboardNavItems.map((item) => item.label);
    assert.ok(labels.includes("Ads"));
    assert.ok(labels.includes("Personas"));
    assert.ok(labels.includes("Prospects"));
    assert.ok(labels.includes("Discussions"));
    assert.equal(
      dashboardNavItems.find((item) => item.label === "Ads")?.href,
      "/ads",
    );
  });

  it("library has empty state, Generate CTA, open/delete actions", () => {
    const library = read("components/ads/AdsLibraryClient.tsx");
    assert.match(library, /No Ads campaigns yet/);
    assert.match(library, /Generate Ads/);
    assert.match(library, /Open/);
    assert.match(library, /AdCampaignHeaderDeleteButton/);
  });

  it("new form states brief is optional and supports generation without brief", () => {
    const form = read("components/ads/AdCampaignGenerateForm.tsx");
    assert.match(form, /brief is optional/i);
    assert.match(form, /no brief at all/i);
    assert.match(form, /More detail/);
    assert.match(form, /Generate Ads/);
    assert.match(form, /submittingRef/);
  });

  it("detail view renders six Ready sections, copy controls, status stages, regenerate", () => {
    const detail = read("components/ads/AdCampaignDetailView.tsx");
    assert.match(detail, /Campaign Strategy/);
    assert.match(detail, /Facebook/);
    assert.match(detail, /Instagram/);
    assert.match(detail, /TikTok/);
    assert.match(detail, /Google Search Ads/);
    assert.match(detail, /Recommended Keyword Themes/);
    assert.match(detail, /AdCampaignStatusPanel/);
    assert.match(detail, /Regenerate/);

    const asset = read("components/ads/AdAssetSection.tsx");
    assert.match(asset, /CopyButton/);
    assert.match(asset, /showContinue=\{false\}/);
    assert.match(asset, /tracking=\{null\}/);

    const status = read("components/ads/AdCampaignStatusPanel.tsx");
    assert.match(status, /Assembling organization context/);
    assert.match(status, /Generating Facebook assets/i);
    assert.match(status, /\/api\/ads\/\$\{campaignId\}\/status/);
    assert.match(status, /Regenerate as new campaign/);
  });

  it("delete uses ConfirmDeleteControl pattern", () => {
    const del = read("components/ads/AdCampaignHeaderDeleteButton.tsx");
    assert.match(del, /ConfirmDeleteControl/);
    assert.match(del, /\/api\/ads\/\$\{campaignId\}/);
    assert.match(del, /redirectTo="\/ads"/);
  });

  it("pages exist for library, new, and detail", () => {
    assert.match(read("app/ads/page.tsx"), /AdsLibraryClient/);
    assert.match(read("app/ads/new/page.tsx"), /AdCampaignGenerateForm/);
    assert.match(read("app/ads/[id]/page.tsx"), /AdCampaignDetailView/);
  });
});
