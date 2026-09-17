import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { evaluateFreeAudienceGeneration } from "../../lib/organization/freeAudienceGeneration";
import { evaluateFreeAudienceIntelligence } from "../../lib/organization/freeAudienceIntelligence";
import {
  applyBindFreeAudience,
  applyConsumeFreeAudience,
  applyFreeAudiencePlanChange,
  applyReserveFreeAudience,
  emptyFreeAudienceOrganizationState,
  type FreeAudienceWorld,
} from "../../lib/organization/freeAudienceReservation";
import {
  deriveFreeAudiencePresentation,
  shouldShowPersonaAddObservation,
  shouldShowPersonaCreate,
  shouldShowPersonaCsvImport,
  shouldShowPersonaDeepScrape,
  shouldShowPersonaManual,
  shouldShowPersonaRefreshIntelligence,
  shouldShowPersonaSuggest,
  shouldShowPersonaThinkDifferently,
} from "../../lib/personas/freeAudiencePresentation";

const ROOT = process.cwd();
const ORG = "11111111-1111-4111-8111-111111111111";
const PERSONA_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function world(): FreeAudienceWorld {
  return {
    organization: emptyFreeAudienceOrganizationState(),
    personas: {},
  };
}

describe("FREE-13 Audience continuity", () => {
  it("restores Full creation from plan only and keeps the same persona id", () => {
    const current = world();
    applyReserveFreeAudience({
      world: current,
      organizationId: ORG,
      nowMs: 1_000,
      nextToken: "token-1",
    });
    applyBindFreeAudience({
      world: current,
      reservationToken: "token-1",
      personaId: PERSONA_A,
    });
    applyConsumeFreeAudience({ world: current, personaId: PERSONA_A });
    const afterUpgrade = applyFreeAudiencePlanChange({
      world: current,
      nextPlan: "full",
    });
    assert.equal(afterUpgrade.status, "consumed");
    assert.equal(afterUpgrade.personaId, PERSONA_A);

    const full = deriveFreeAudiencePresentation({
      athenaPlan: "full",
      defineKind: "ready",
      audienceStatus: afterUpgrade.status,
      boundPersonaId: afterUpgrade.personaId,
    });
    assert.equal(full, "full");
    assert.equal(shouldShowPersonaCreate(full), true);
    assert.equal(shouldShowPersonaSuggest(full), true);
    assert.equal(shouldShowPersonaManual(full), true);
    assert.equal(shouldShowPersonaCsvImport(full), true);
    assert.equal(shouldShowPersonaRefreshIntelligence(full), true);
    assert.equal(shouldShowPersonaThinkDifferently(full), true);
    assert.equal(shouldShowPersonaDeepScrape(full), true);
    assert.equal(shouldShowPersonaAddObservation(full), true);
    assert.deepEqual(
      evaluateFreeAudienceGeneration({
        athenaPlan: "full",
        audienceStatus: "consumed",
        action: "suggest",
      }),
      { allow: true },
    );
    assert.deepEqual(
      evaluateFreeAudienceGeneration({
        athenaPlan: "full",
        action: "csv",
      }),
      { allow: true },
    );
    assert.deepEqual(
      evaluateFreeAudienceIntelligence({
        athenaPlan: "full",
        audienceStatus: "consumed",
        action: "refresh",
      }),
      { allow: true },
    );
  });

  it("Full → Free with previous Free consumption denies another audience", () => {
    const current = world();
    applyReserveFreeAudience({
      world: current,
      organizationId: ORG,
      nowMs: 1_000,
      nextToken: "token-1",
    });
    applyBindFreeAudience({
      world: current,
      reservationToken: "token-1",
      personaId: PERSONA_A,
    });
    applyConsumeFreeAudience({ world: current, personaId: PERSONA_A });
    applyFreeAudiencePlanChange({ world: current, nextPlan: "full" });
    applyFreeAudiencePlanChange({ world: current, nextPlan: "free" });

    const presentation = deriveFreeAudiencePresentation({
      athenaPlan: "free",
      defineKind: "ready",
      audienceStatus: current.organization.status,
      boundPersonaId: current.organization.personaId,
    });
    assert.equal(presentation, "consumed");
    assert.equal(shouldShowPersonaCreate(presentation), false);
    assert.equal(
      evaluateFreeAudienceGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        audienceStatus: "consumed",
        action: "suggest",
      }).allow,
      false,
    );
    assert.equal(
      evaluateFreeAudienceGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        audienceStatus: "consumed",
        action: "persist",
      }).allow,
      false,
    );
    assert.equal(shouldShowPersonaRefreshIntelligence(presentation), false);
    assert.equal(
      evaluateFreeAudienceIntelligence({
        athenaPlan: "free",
        audienceStatus: "consumed",
        action: "refresh",
      }).allow,
      false,
    );
  });

  it("does not reset or copy the existing audience on plan change", () => {
    const landing = read("app/personas/page.tsx");
    const importPage = read("app/personas/import/page.tsx");
    const orchestration = read("services/personas/freeAudienceOrchestration.ts");
    for (const source of [landing, importPage, orchestration]) {
      assert.doesNotMatch(source, /clonePersona|copyPersona|resetFreeAudience/);
      assert.doesNotMatch(source, /deletePersona\([\s\S]{0,40}plan/);
    }
  });
});
