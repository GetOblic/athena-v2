import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { dashboardNavItems } from "../../components/dashboard/DashboardSidebar";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Athena Quote UI", () => {
  it("keeps Athena Quote out of regular Athena product navigation", () => {
    const labels = dashboardNavItems.map((item) => item.label);
    const hrefs = dashboardNavItems.map((item) => item.href);

    assert.ok(!labels.includes("Athena Quote"));
    assert.ok(!hrefs.includes("/quote"));
    assert.ok(!hrefs.includes("/licensee/quote"));
    assert.ok(labels.includes("Athena Brain"));
    assert.ok(labels.includes("Getting Started"));
    assert.ok(labels.includes("Briefings"));
  });

  it("exposes Athena Quote on the Master Licensee dashboard", () => {
    const client = read("components/licensee/LicenseeDashboardClient.tsx");

    assert.match(client, /Athena Quote/);
    assert.match(client, /href="\/licensee\/quote"/);
    assert.match(
      client,
      /Submit client work for private GetOblic fulfillment pricing/,
    );
  });

  it("page covers commercial model, workflow, categories, and form anchor", () => {
    const page = read("app/licensee/quote/page.tsx");

    assert.match(page, /You Sell It\. We Build It\./);
    assert.match(page, /private\s+fulfillment quote/i);
    assert.match(page, /Your Price Is Your Business/);
    assert.match(page, /Example only/);
    assert.match(page, /Never Say/);
    assert.match(page, /id="athena-quote-form"/);
    assert.match(page, /AthenaQuoteFormEmbed/);
    assert.match(page, /QuoteFormScrollLink/);
    assert.match(page, /Back to Master dashboard/);
    assert.match(page, /getLicenseeAccountByUserId/);
    assert.match(page, /isAccountAccessActive/);
    assert.match(page, /This Master account has been deactivated/);
    assert.match(page, /\/licensee\/login/);
    assert.doesNotMatch(page, /DashboardSidebar/);
    assert.doesNotMatch(page, /suggested retail/i);
    assert.doesNotMatch(page, /marketplace/i);
    assert.doesNotMatch(page, /commission/i);
  });

  it("redirects legacy /quote into the Master Licensee route", () => {
    const redirectPage = read("app/quote/page.tsx");
    assert.match(redirectPage, /redirect\("\/licensee\/quote"\)/);
    assert.doesNotMatch(redirectPage, /DashboardSidebar/);
    assert.doesNotMatch(redirectPage, /AthenaQuoteFormEmbed/);
  });

  it("embeds the designated GHL form without duplicate script patterns", () => {
    const embed = read("components/quote/AthenaQuoteFormEmbed.tsx");

    assert.match(embed, /NQfn7tnDbGyyq9JVei6Q/);
    assert.match(embed, /go\.getoblic\.com\/widget\/form\/\$\{FORM_ID\}/);
    assert.match(embed, /go\.getoblic\.com\/js\/form_embed\.js/);
    assert.match(embed, /next\/script/);
    assert.match(embed, /ghl-athena-quote-form-embed/);
    assert.match(embed, /afterInteractive/);
  });
});
