import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("ad campaign API contracts", () => {
  it("list/create require org context and ignore client organization ownership", () => {
    const route = read("app/api/ads/route.ts");
    assert.match(route, /requireCurrentOrganizationContext/);
    assert.match(route, /normalizeAdCampaignBrief/);
    assert.match(route, /createAdCampaignWithJob/);
    assert.match(route, /listAdCampaigns\(organizationId\)/);
    assert.match(route, /organization_id: _organizationId/);
    assert.match(route, /organizationId: _organizationIdCamel/);
    assert.match(route, /202/);
  });

  it("detail/delete are org-scoped and return cross-tenant as not found", () => {
    const route = read("app/api/ads/[id]/route.ts");
    assert.match(route, /requireCurrentOrganizationContext/);
    assert.match(route, /getAdCampaignById\(id, organizationId\)/);
    assert.match(route, /deleteAdCampaign\(id, organizationId\)/);
    assert.match(route, /NOT_FOUND/);
    assert.match(route, /404/);
  });

  it("generate rejects duplicate active jobs and Ready overwrite", () => {
    const route = read("app/api/ads/[id]/generate/route.ts");
    assert.match(route, /enqueueGenerationForExistingCampaign/);
    assert.match(route, /ActiveAdGenerationJobConflictError/);
    assert.match(route, /ReadyAdCampaignImmutableError/);
    assert.match(route, /409/);
    assert.match(route, /202/);
  });

  it("regenerate creates a new campaign from previous brief", () => {
    const route = read("app/api/ads/[id]/regenerate/route.ts");
    assert.match(route, /regenerateAdCampaign/);
    assert.match(route, /regeneratedFrom/);
    assert.match(route, /202/);
  });

  it("status endpoint polls campaign + active job without leaking internals", () => {
    const route = read("app/api/ads/[id]/status/route.ts");
    assert.match(route, /toPublicAdCampaignStatus/);
    assert.match(route, /getActiveAdGenerationJobForCampaign/);
    assert.doesNotMatch(route, /claim_token/);
    assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE/);
  });

  it("create without brief is supported", () => {
    const route = read("app/api/ads/route.ts");
    assert.match(route, /normalizeAdCampaignBrief\(briefSource\)/);
    const form = read("components/ads/AdCampaignGenerateForm.tsx");
    assert.match(form, /copy\.briefOptional/);
    assert.match(form, /name: name\.trim\(\) \|\| undefined/);
  });
});
