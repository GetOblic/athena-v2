import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { evaluateFreeVisibilityGeneration } from "../../lib/organization/freeVisibilityGeneration";
import {
  applyConsumeFreeVisibility,
  applyFreeVisibilityPlanChange,
  applyReserveFreeVisibility,
  emptyFreeVisibilityOrganizationState,
  type FreeVisibilityWorld,
} from "../../lib/organization/freeVisibilityReservation";
import {
  deriveFreeVisibilityPresentation,
  shouldShowSeoNewAnalysis,
  shouldShowSeoRegenerate,
  shouldShowSeoTechnicalOption,
} from "../../lib/seo/freeVisibilityPresentation";

const ROOT = process.cwd();
const ORG = "11111111-1111-4111-8111-111111111111";
const REPORT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function world(): FreeVisibilityWorld {
  return {
    organization: emptyFreeVisibilityOrganizationState(),
    reports: {},
    jobs: [],
  };
}

describe("FREE-9 Visibility continuity", () => {
  it("restores Full controls from plan only and keeps the same report id", () => {
    const current = world();
    applyReserveFreeVisibility({
      world: current,
      organizationId: ORG,
      nowMs: 1_000,
      nextToken: "token-1",
    });
    current.organization.reportId = REPORT_A;
    applyConsumeFreeVisibility({ world: current, reportId: REPORT_A });
    const afterUpgrade = applyFreeVisibilityPlanChange({
      world: current,
      nextPlan: "full",
    });
    assert.equal(afterUpgrade.status, "consumed");
    assert.equal(afterUpgrade.reportId, REPORT_A);

    const full = deriveFreeVisibilityPresentation({
      athenaPlan: "full",
      defineKind: "ready",
      visibilityStatus: afterUpgrade.status,
      boundReportId: afterUpgrade.reportId,
    });
    assert.equal(full, "full");
    assert.equal(shouldShowSeoNewAnalysis(full), true);
    assert.equal(shouldShowSeoRegenerate(full), true);
    assert.equal(shouldShowSeoTechnicalOption(full), true);
    assert.deepEqual(
      evaluateFreeVisibilityGeneration({
        athenaPlan: "full",
        visibilityStatus: "consumed",
        action: "create",
        generationType: "technical",
      }),
      { allow: true },
    );
  });

  it("Full → Free with historical Ready denies another starter", () => {
    const current = world();
    current.reports[REPORT_A] = {
      id: REPORT_A,
      organizationId: ORG,
      status: "Ready",
    };
    assert.equal(
      applyReserveFreeVisibility({
        world: current,
        organizationId: ORG,
        nowMs: 1_000,
        nextToken: "token-1",
      }).outcome,
      "already_consumed",
    );
    assert.equal(
      evaluateFreeVisibilityGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        visibilityStatus: "consumed",
        action: "create",
        generationType: "intelligence",
      }).allow,
      false,
    );
  });

  it("does not clear counters from organization plan writes", () => {
    const plan = read("services/athenaPlan.ts");
    const organization = read("services/organizationService.ts");
    assert.doesNotMatch(plan, /free_visibility_/);
    assert.doesNotMatch(organization, /free_visibility_/);
    assert.doesNotMatch(
      read("lib/home/freeStarterHome.ts"),
      /free_visibility_|loadFreeVisibility/,
    );
  });
});
