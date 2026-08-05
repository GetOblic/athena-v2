import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("seo context composer", () => {
  it("loads Deep Website Intelligence read-only and does not enqueue scrapes", () => {
    const composer = read("services/seo/seoContextComposer.ts");
    assert.match(composer, /loadOrganizationDeepWebsiteIntelligence/);
    assert.match(composer, /website_intelligence/);
    assert.match(composer, /formatDeepIntelligenceForBrainPrompt/);
    assert.match(composer, /snapshotSeoWebsitePagesAnalyzed/);
    assert.match(composer, /websitePagesAnalyzed/);
    assert.match(composer, /pages\.slice\(0, 50\)/);
    assert.match(composer, /never mutates Deep Scrape/i);
    assert.doesNotMatch(composer, /enqueueDeepScrape/);
    assert.doesNotMatch(composer, /claimAndExecuteNextDeepScrapeJob/);
    assert.doesNotMatch(composer, /\.update\(/);
    assert.doesNotMatch(composer, /promoteBrainIntelligence/);
  });

  it("composes Brain, personas, communities, discussions, opportunities, ads themes", () => {
    const composer = read("services/seo/seoContextComposer.ts");
    assert.match(composer, /buildBrainContextForOrganization/);
    assert.match(composer, /COMPACT PERSONA SUMMARIES/);
    assert.match(composer, /COMMUNITIES \/ INTELLIGENCE DOMAINS/);
    assert.match(composer, /DEEP WEBSITE INTELLIGENCE/);
    assert.match(composer, /ADS KEYWORD THEMES/);
    assert.match(composer, /recentDiscussions/);
    assert.match(composer, /recentOpportunities/);
    assert.match(composer, /summarizePersonasForSeo/);
    assert.match(composer, /formatPersonaSummariesBlock/);
  });

  it("keeps operator guidance separate from trusted context", () => {
    const composer = read("services/seo/seoContextComposer.ts");
    assert.match(composer, /formatSeoReportBriefGuidanceBlock/);
    assert.match(composer, /operatorGuidanceBlock/);
    assert.match(composer, /trusted server organizationId/);

    const brief = read("services/seo/seoReportBrief.ts");
    assert.match(brief, /OPERATOR GUIDANCE/);
    assert.match(brief, /not trusted business facts/i);
  });
});
