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
  it("adds Athena Quote navigation without renaming existing items", () => {
    const labels = dashboardNavItems.map((item) => item.label);

    assert.ok(labels.includes("Athena Quote"));
    assert.ok(labels.includes("Athena Brain"));
    assert.ok(labels.includes("Getting Started"));
    assert.ok(labels.includes("Briefings"));
    assert.equal(
      dashboardNavItems.find((item) => item.label === "Athena Quote")?.href,
      "/quote",
    );
  });

  it("page covers commercial model, workflow, categories, and form anchor", () => {
    const page = read("app/quote/page.tsx");

    assert.match(page, /You Sell It\. We Build It\./);
    assert.match(page, /private\s+fulfillment quote/i);
    assert.match(page, /Your Price Is Your Business/);
    assert.match(page, /Example only/);
    assert.match(page, /Never Say/);
    assert.match(page, /id="athena-quote-form"/);
    assert.match(page, /AthenaQuoteFormEmbed/);
    assert.match(page, /QuoteFormScrollLink/);
    assert.doesNotMatch(page, /suggested retail/i);
    assert.doesNotMatch(page, /marketplace/i);
    assert.doesNotMatch(page, /commission/i);
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
