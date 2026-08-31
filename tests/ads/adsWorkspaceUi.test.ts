import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { dashboardNavItems } from "../../components/dashboard/DashboardSidebar";
import { en } from "../../lib/tenantI18n/messages/en";

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
    assert.equal(en.ads.emptyTitle, "No Ads campaigns yet");
    assert.equal(en.ads.generateAds, "Generate Ads");
    assert.equal(en.ads.actionOpen, "Open");
    assert.match(library, /copy\.emptyTitle/);
    assert.match(library, /copy\.generateAds/);
    assert.match(library, /copy\.actionOpen/);
    assert.match(library, /AdCampaignHeaderDeleteButton/);
  });

  it("new form states brief is optional and supports generation without brief", () => {
    const form = read("components/ads/AdCampaignGenerateForm.tsx");
    assert.match(en.ads.new.briefOptional, /brief is optional/i);
    assert.match(en.ads.new.briefOptional, /no brief at all/i);
    assert.equal(en.ads.new.moreDetail, "More detail");
    assert.equal(en.ads.new.generate, "Generate Ads");
    assert.match(form, /copy\.briefOptional/);
    assert.match(form, /copy\.moreDetail/);
    assert.match(form, /copy\.generate/);
    assert.match(form, /submittingRef/);
    assert.match(form, /landingPage: landingPage\.trim\(\) \|\| undefined/);
    assert.doesNotMatch(form, /language:/);
  });

  it("detail view renders six Ready sections, copy controls, status stages, regenerate", () => {
    const detail = read("components/ads/AdCampaignDetailView.tsx");
    assert.equal(en.ads.detail.campaignStrategy, "Campaign Strategy");
    assert.equal(en.ads.detail.facebook, "Facebook");
    assert.equal(en.ads.detail.instagram, "Instagram");
    assert.equal(en.ads.detail.tiktok, "TikTok");
    assert.equal(en.ads.detail.googleSearchAds, "Google Search Ads");
    assert.equal(
      en.ads.detail.recommendedKeywordThemes,
      "Recommended Keyword Themes",
    );
    assert.match(detail, /copy\.detail\.campaignStrategy/);
    assert.match(detail, /copy\.detail\.facebook/);
    assert.match(detail, /copy\.detail\.instagram/);
    assert.match(detail, /copy\.detail\.tiktok/);
    assert.match(detail, /copy\.detail\.googleSearchAds/);
    assert.match(detail, /copy\.detail\.recommendedKeywordThemes/);
    assert.match(detail, /AdCampaignStatusPanel/);
    assert.match(detail, /copy\.detail\.regenerate/);

    const asset = read("components/ads/AdAssetSection.tsx");
    assert.match(asset, /CopyButton/);
    assert.match(asset, /showContinue=\{false\}/);
    assert.match(asset, /tracking=\{null\}/);

    const status = read("components/ads/AdCampaignStatusPanel.tsx");
    assert.match(status, /Assembling organization context/);
    assert.match(status, /Generating Facebook assets/i);
    assert.match(status, /\/api\/ads\/\$\{campaignId\}\/status/);
    assert.match(status, /copy\.regenerateAsNew/);
    assert.equal(
      en.ads.statusPanel.regenerateAsNew,
      "Regenerate as new campaign",
    );
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
