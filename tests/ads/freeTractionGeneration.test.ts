import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  evaluateFreeTractionGeneration,
} from "../../lib/organization/freeTractionGeneration";

const ROOT = process.cwd();
const CAMPAIGN_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CAMPAIGN_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function sliceFn(source: string, startMarker: string, endMarker?: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, startMarker);
  const end = endMarker
    ? source.indexOf(endMarker, start + startMarker.length)
    : source.length;
  assert.ok(end > start, endMarker ?? "end");
  return source.slice(start, end);
}

describe("FREE-10 Traction creation API", () => {
  it("denies Free untrained create / generate / regenerate before job work", () => {
    for (const action of ["create", "generate", "regenerate"] as const) {
      const decision = evaluateFreeTractionGeneration({
        athenaPlan: "free",
        defineKind: "needs_setup",
        action,
        campaignId: CAMPAIGN_A,
        boundCampaignId: CAMPAIGN_A,
      });
      assert.equal(decision.allow, false);
      if (decision.allow) return;
      assert.equal(decision.code, "FREE_UNTRAINED");
      assert.equal(decision.httpStatus, 403);
    }
  });

  it("allows trained available Free starter create and leaves Full unchanged", () => {
    assert.deepEqual(
      evaluateFreeTractionGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        tractionStatus: "available",
        action: "create",
      }),
      { allow: true },
    );
    assert.deepEqual(
      evaluateFreeTractionGeneration({
        athenaPlan: "full",
        action: "create",
      }),
      { allow: true },
    );
  });

  it("reserves before createAdCampaign and enqueue, then binds the campaign", () => {
    const orchestration = read("services/ads/freeTractionOrchestration.ts");
    const createFn = sliceFn(
      orchestration,
      "export async function createFreeTractionAdCampaignWithJob",
      "export async function retryFreeTractionAdCampaign",
    );
    assert.ok(
      createFn.indexOf("reserveFreeTraction") <
        createFn.indexOf("createAdCampaign"),
    );
    assert.ok(
      createFn.indexOf("reserveFreeTraction") <
        createFn.indexOf("enqueueAdGenerationJob"),
    );
    assert.ok(
      createFn.indexOf("createAdCampaign") <
        createFn.indexOf("bindFreeTractionCampaign"),
    );
    assert.ok(
      createFn.indexOf("bindFreeTractionCampaign") <
        createFn.indexOf("enqueueAdGenerationJob"),
    );
    assert.doesNotMatch(createFn, /createAdCampaignWithJob/);
    assert.match(createFn, /authorizedTargetPersonaId/);
  });

  it("direct POST uses the existing /api/ads path and cannot inject org or plan", () => {
    const route = read("app/api/ads/route.ts");
    assert.match(route, /assertCurrentFreeTractionGeneration/);
    assert.match(route, /action: "create"/);
    assert.match(route, /createFreeTractionAdCampaignWithJob/);
    assert.match(route, /createAdCampaignWithJob/);
    assert.match(route, /organization_id: _organizationId/);
    assert.match(route, /organizationId: _organizationIdCamel/);
    assert.doesNotMatch(route, /body\.athenaPlan|body\.athena_plan|allowance/);
    const post = sliceFn(route, "export async function POST", "catch (error)");
    assert.ok(
      post.indexOf("assertCurrentFreeTractionGeneration") <
        post.indexOf("createFreeTractionAdCampaignWithJob"),
    );
  });
});

describe("FREE-10 Traction retry and regenerate", () => {
  it("allows /generate only on the bound starter campaign", () => {
    assert.deepEqual(
      evaluateFreeTractionGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        tractionStatus: "reserved",
        action: "generate",
        campaignId: CAMPAIGN_A,
        boundCampaignId: CAMPAIGN_A,
      }),
      { allow: true },
    );
    assert.equal(
      evaluateFreeTractionGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        tractionStatus: "reserved",
        action: "generate",
        campaignId: CAMPAIGN_B,
        boundCampaignId: CAMPAIGN_A,
      }).allow,
      false,
    );
    assert.equal(
      evaluateFreeTractionGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        tractionStatus: "consumed",
        action: "generate",
        campaignId: CAMPAIGN_A,
        boundCampaignId: CAMPAIGN_A,
      }).allow,
      false,
    );
  });

  it("always denies Free /regenerate and leaves Full regenerate unchanged", () => {
    assert.equal(
      evaluateFreeTractionGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        tractionStatus: "available",
        action: "regenerate",
      }).allow,
      false,
    );
    assert.deepEqual(
      evaluateFreeTractionGeneration({
        athenaPlan: "full",
        action: "regenerate",
      }),
      { allow: true },
    );

    const regenerate = read("app/api/ads/[id]/regenerate/route.ts");
    assert.match(regenerate, /action: "regenerate"/);
    assert.match(regenerate, /regenerateAdCampaign/);
    const generate = read("app/api/ads/[id]/generate/route.ts");
    assert.match(generate, /retryFreeTractionAdCampaign/);
    assert.match(generate, /enqueueGenerationForExistingCampaign/);
    const generateFn = sliceFn(generate, "export async function POST", "catch (error)");
    assert.ok(
      generateFn.indexOf("assertCurrentFreeTractionGeneration") <
        generateFn.indexOf("retryFreeTractionAdCampaign"),
    );
  });

  it("retry enqueue does not create another ad_campaigns row", () => {
    const retry = sliceFn(
      read("services/ads/freeTractionOrchestration.ts"),
      "export async function retryFreeTractionAdCampaign",
    );
    assert.match(retry, /enqueueGenerationForExistingCampaign/);
    assert.doesNotMatch(retry, /createAdCampaign\(/);
    assert.doesNotMatch(retry, /createAdCampaignWithJob/);
  });
});

describe("FREE-10 Traction worker consume / release", () => {
  it("hooks consume and release only at the existing Ads job boundary", () => {
    const sql = read(
      "supabase/migrations/20260917000004_add_organization_free_traction.sql",
    );
    const complete = sliceFn(
      sql,
      "create or replace function complete_athena_ad_generation_job",
      "create or replace function fail_athena_ad_generation_job",
    );
    assert.match(complete, /status = 'Ready'/);
    assert.match(complete, /package_json = p_package_json/);
    assert.match(
      complete,
      /perform consume_athena_free_traction\(v_job\.organization_id, v_job\.campaign_id\)/,
    );
    assert.doesNotMatch(complete, /athena_plan/);
    assert.doesNotMatch(complete, /openrouter|prompt/i);

    const executor = read(
      "services/ads/adsGenerationJobs/adGenerationJobExecutor.ts",
    );
    assert.match(executor, /runAdsGenerationPipeline/);
    assert.doesNotMatch(executor, /free_traction|athenaPlan|reserveFreeTraction/);
  });

  it("does not alter Full create / generate / regenerate orchestration", () => {
    const orchestration = read("services/ads/adCampaignOrchestration.ts");
    assert.match(orchestration, /export async function createAdCampaignWithJob/);
    assert.match(orchestration, /export async function regenerateAdCampaign/);
    assert.doesNotMatch(orchestration, /free_traction|reserveFreeTraction/);
    assert.match(orchestration, /Regenerate creates a NEW campaign row/);
  });

  it("does not load Free Traction columns on Full create or /ads reads", () => {
    const guard = read(
      "services/organization/freeTractionGenerationGuard.ts",
    );
    const pageState = read("services/ads/freeTractionPageState.ts");
    const loadContext = guard.slice(
      guard.indexOf("export const loadFreeTractionGenerationContext"),
    );
    assert.ok(
      loadContext.indexOf("resolveAthenaPlan") <
        loadContext.indexOf("loadFreeTractionAuthority"),
    );
    assert.match(guard, /athenaPlan === "free"/);
    assert.match(pageState, /athenaPlan !== "free"/);
    const loadFn = pageState.slice(
      pageState.indexOf("export async function loadFreeTractionPageState"),
    );
    assert.ok(
      loadFn.indexOf('presentation: "full"') <
        loadFn.indexOf("loadFreeTractionAuthority"),
    );
  });

  it("keeps GET / status / delete available and delete cannot restore allowance", () => {
    const list = read("app/api/ads/route.ts");
    const detail = read("app/api/ads/[id]/route.ts");
    const status = read("app/api/ads/[id]/status/route.ts");
    const getList = sliceFn(list, "export async function GET", "export async function POST");
    assert.doesNotMatch(getList, /assertCurrentFreeTractionGeneration/);
    assert.match(detail, /export async function GET/);
    assert.match(detail, /export async function DELETE/);
    assert.doesNotMatch(detail, /assertCurrentFreeTractionGeneration|releaseFreeTraction|consumeFreeTraction/);
    assert.doesNotMatch(status, /assertCurrentFreeTractionGeneration/);
    assert.match(read("services/ads/adCampaignService.ts"), /export async function deleteAdCampaign/);
    assert.doesNotMatch(
      read("services/ads/adCampaignService.ts"),
      /free_traction|releaseFreeTraction|consumeFreeTraction/,
    );
  });
});

describe("FREE-10 Traction non-interference", () => {
  it("does not alter Social Planner, Visibility, Identity Ask, or Persona cost surfaces", () => {
    assert.doesNotMatch(
      read("services/socialPlanner/freeStarterOrchestration.ts"),
      /free_traction|reserveFreeTraction/,
    );
    assert.doesNotMatch(
      read("services/seo/freeVisibilityOrchestration.ts"),
      /free_traction|reserveFreeTraction/,
    );
    assert.doesNotMatch(
      read("services/organization/freeIdentityAskAuthority.ts"),
      /free_traction|reserveFreeTraction/,
    );
    assert.doesNotMatch(
      read("app/api/personas/route.ts"),
      /free_traction|assertCurrentFreeTractionGeneration/,
    );
    assert.doesNotMatch(
      read("middleware.ts"),
      /free_traction|redirectIfFreeUntrainedGrowthRoute/,
    );
    assert.match(
      read("app/ads/layout.tsx"),
      /redirectIfFreeUntrainedGrowthRoute/,
    );
  });
});
