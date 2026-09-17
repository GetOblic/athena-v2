import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { evaluateFreeConvertGeneration } from "../../lib/organization/freeConvertGeneration";
import {
  applyConsumeFreeConvert,
  applyFreeConvertPlanChange,
  applyReserveFreeConvert,
  emptyFreeConvertOrganizationState,
  type FreeConvertWorld,
} from "../../lib/organization/freeConvertReservation";
import {
  deriveFreeConvertPresentation,
  shouldShowProspectCreate,
  shouldShowProspectRegenerate,
} from "../../lib/prospects/freeConvertPresentation";

const ROOT = process.cwd();
const ORG = "11111111-1111-4111-8111-111111111111";
const PROSPECT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function world(): FreeConvertWorld {
  return {
    organization: emptyFreeConvertOrganizationState(),
    prospects: {},
    jobs: [],
  };
}

describe("FREE-11 Convert continuity", () => {
  it("restores Full controls from plan only and keeps the same prospect id", () => {
    const current = world();
    applyReserveFreeConvert({
      world: current,
      organizationId: ORG,
      nowMs: 1_000,
      nextToken: "token-1",
    });
    current.organization.prospectId = PROSPECT_A;
    applyConsumeFreeConvert({ world: current, prospectId: PROSPECT_A });
    const afterUpgrade = applyFreeConvertPlanChange({
      world: current,
      nextPlan: "full",
    });
    assert.equal(afterUpgrade.status, "consumed");
    assert.equal(afterUpgrade.prospectId, PROSPECT_A);

    const full = deriveFreeConvertPresentation({
      athenaPlan: "full",
      defineKind: "ready",
      convertStatus: afterUpgrade.status,
      boundProspectId: afterUpgrade.prospectId,
    });
    assert.equal(full, "full");
    assert.equal(shouldShowProspectCreate(full), true);
    assert.equal(shouldShowProspectRegenerate(full), true);
    assert.deepEqual(
      evaluateFreeConvertGeneration({
        athenaPlan: "full",
        convertStatus: "consumed",
        action: "create",
      }),
      { allow: true },
    );
    assert.deepEqual(
      evaluateFreeConvertGeneration({
        athenaPlan: "full",
        action: "regenerate",
      }),
      { allow: true },
    );
  });

  it("Full → Free with previous Free consumption denies another starter", () => {
    const current = world();
    current.organization.status = "consumed";
    current.organization.prospectId = PROSPECT_A;
    applyFreeConvertPlanChange({ world: current, nextPlan: "free" });
    assert.equal(
      applyReserveFreeConvert({
        world: current,
        organizationId: ORG,
        nowMs: Date.now(),
        nextToken: "again",
      }).outcome,
      "already_consumed",
    );
    assert.equal(
      evaluateFreeConvertGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        convertStatus: "consumed",
        boundProspectId: PROSPECT_A,
        action: "create",
      }).allow,
      false,
    );
    const presentation = deriveFreeConvertPresentation({
      athenaPlan: "free",
      defineKind: "ready",
      convertStatus: "consumed",
      boundProspectId: PROSPECT_A,
    });
    assert.equal(presentation, "consumed");
    assert.equal(shouldShowProspectCreate(presentation), false);
  });

  it("does not infer starter state from prospect count or source", () => {
    const pageState = read("services/prospects/freeConvertPageState.ts");
    const presentation = read("lib/prospects/freeConvertPresentation.ts");
    assert.match(pageState, /loadFreeConvertAuthority/);
    assert.match(pageState, /deriveFreeConvertPresentation/);
    assert.doesNotMatch(pageState, /prospects\.length|created_at|source ===/);
    assert.doesNotMatch(
      presentation,
      /prospects\.length|created_at|source ===/,
    );
  });
});
