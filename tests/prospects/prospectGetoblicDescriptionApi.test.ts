/**
 * POST /api/prospects/[id]/getoblic-description — source contract.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("GetOblic Description API", () => {
  it("is authenticated, organization-scoped, and returns 404 for a missing prospect", () => {
    const route = read("app/api/prospects/[id]/getoblic-description/route.ts");
    assert.match(route, /export async function POST/);
    assert.match(route, /requireCurrentOrganizationContext/);
    assert.match(route, /OrganizationAccessError/);
    assert.match(route, /UNAUTHORIZED/);
    assert.match(route, /401/);
    assert.match(route, /generateProspectGetoblicDescription/);
    assert.match(route, /prospectId: id/);
    assert.match(route, /organizationId/);
    assert.match(route, /ProspectGetoblicDescriptionError/);
    assert.match(route, /404/);
    assert.match(route, /generatedListingDescription/);
    assert.match(route, /maxDuration = 60/);
    assert.match(route, /error\.code/);
    assert.match(route, /error\.httpStatus|error\.code === "NOT_FOUND"/);
  });

  it("persists through the isolated generator and supports refresh on the same POST", () => {
    const route = read("app/api/prospects/[id]/getoblic-description/route.ts");
    const service = read("services/prospects/prospectGetoblicDescription.ts");
    assert.match(route, /generateProspectGetoblicDescription/);
    assert.match(service, /persistGeneratedListingDescription/);
    assert.match(service, /generated_listing_description/);
    assert.doesNotMatch(route, /ensureProspectGenerationQueued/);
    assert.doesNotMatch(route, /from\("prospects"\)[\s\S]*raw_json/);
  });

  it("returns a safe error payload and does not call claim, release, KB, or scrape", () => {
    const route = read("app/api/prospects/[id]/getoblic-description/route.ts");
    const service = read("services/prospects/prospectGetoblicDescription.ts");
    assert.match(route, /GENERATION_FAILED/);
    assert.match(route, /ok: false/);
    assert.match(service, /WEBSITE_INTELLIGENCE_REQUIRED/);
    assert.match(service, /INVALID_OUTPUT/);
    assert.doesNotMatch(route, /claimGetOblicListing|releaseGetOblicListing/);
    assert.doesNotMatch(route, /knowledge-base|knowledgeBase/);
    assert.doesNotMatch(route, /getoblicWordpressClient|updateListing|putListing/);
    assert.doesNotMatch(route, /deep-scrape|ensureProspectGenerationQueued/);
    assert.doesNotMatch(route, /homepageOnlyWebsiteIntelligenceProvider/);
  });
});
