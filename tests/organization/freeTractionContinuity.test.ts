import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { evaluateFreeTractionGeneration } from "../../lib/organization/freeTractionGeneration";
import {
  applyConsumeFreeTraction,
  applyFreeTractionPlanChange,
  applyReserveFreeTraction,
  emptyFreeTractionOrganizationState,
  type FreeTractionWorld,
} from "../../lib/organization/freeTractionReservation";
import {
  deriveFreeTractionPresentation,
  shouldShowAdsCreate,
  shouldShowAdsRegenerate,
} from "../../lib/ads/freeTractionPresentation";

const ROOT = process.cwd();
const ORG = "11111111-1111-4111-8111-111111111111";
const CAMPAIGN_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function world(): FreeTractionWorld {
  return {
    organization: emptyFreeTractionOrganizationState(),
    campaigns: {},
    jobs: [],
  };
}

describe("FREE-10 Traction continuity", () => {
  it("restores Full controls from plan only and keeps the same campaign id", () => {
    const current = world();
    applyReserveFreeTraction({
      world: current,
      organizationId: ORG,
      nowMs: 1_000,
      nextToken: "token-1",
    });
    current.organization.campaignId = CAMPAIGN_A;
    applyConsumeFreeTraction({ world: current, campaignId: CAMPAIGN_A });
    const afterUpgrade = applyFreeTractionPlanChange({
      world: current,
      nextPlan: "full",
    });
    assert.equal(afterUpgrade.status, "consumed");
    assert.equal(afterUpgrade.campaignId, CAMPAIGN_A);

    const full = deriveFreeTractionPresentation({
      athenaPlan: "full",
      defineKind: "ready",
      tractionStatus: afterUpgrade.status,
      boundCampaignId: afterUpgrade.campaignId,
    });
    assert.equal(full, "full");
    assert.equal(shouldShowAdsCreate(full), true);
    assert.equal(shouldShowAdsRegenerate(full), true);
    assert.deepEqual(
      evaluateFreeTractionGeneration({
        athenaPlan: "full",
        tractionStatus: "consumed",
        action: "create",
      }),
      { allow: true },
    );
    assert.deepEqual(
      evaluateFreeTractionGeneration({
        athenaPlan: "full",
        action: "regenerate",
      }),
      { allow: true },
    );
  });

  it("Full → Free with previous Free consumption denies another starter", () => {
    const current = world();
    current.organization.status = "consumed";
    current.organization.campaignId = CAMPAIGN_A;
    applyFreeTractionPlanChange({ world: current, nextPlan: "full" });
    applyFreeTractionPlanChange({ world: current, nextPlan: "free" });
    assert.equal(
      applyReserveFreeTraction({
        world: current,
        organizationId: ORG,
        nowMs: 1_000,
        nextToken: "token-1",
      }).outcome,
      "already_consumed",
    );
    assert.equal(
      evaluateFreeTractionGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        tractionStatus: "consumed",
        action: "create",
      }).allow,
      false,
    );
  });

  it("does not clear counters from organization plan writes", () => {
    const plan = read("services/athenaPlan.ts");
    const organization = read("services/organizationService.ts");
    assert.doesNotMatch(plan, /free_traction_/);
    assert.doesNotMatch(organization, /free_traction_/);
    assert.doesNotMatch(
      read("lib/home/freeStarterHome.ts"),
      /free_traction_|loadFreeTraction/,
    );
    assert.doesNotMatch(
      read("app/page.tsx"),
      /free_traction_|loadFreeTraction/,
    );
  });
});
