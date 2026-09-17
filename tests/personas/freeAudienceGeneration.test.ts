import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { evaluateFreeAudienceGeneration } from "../../lib/organization/freeAudienceGeneration";
import {
  applyBindFreeAudience,
  applyConsumeFreeAudience,
  applyReleaseFreeAudience,
  applyReserveFreeAudience,
  emptyFreeAudienceOrganizationState,
  type FreeAudienceWorld,
} from "../../lib/organization/freeAudienceReservation";

const ROOT = process.cwd();
const ORG = "11111111-1111-4111-8111-111111111111";
const PERSONA_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PERSONA_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

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

function world(): FreeAudienceWorld {
  return {
    organization: emptyFreeAudienceOrganizationState(),
    personas: {},
  };
}

describe("FREE-13 Audience creation API", () => {
  it("denies Free untrained suggest / persist / prospect before work", () => {
    for (const action of ["suggest", "persist", "prospect"] as const) {
      const decision = evaluateFreeAudienceGeneration({
        athenaPlan: "free",
        defineKind: "needs_setup",
        action,
      });
      assert.equal(decision.allow, false);
      if (decision.allow) return;
      assert.equal(decision.code, "FREE_UNTRAINED");
      assert.equal(decision.httpStatus, 403);
    }
  });

  it("allows trained available Free Suggest and manual, leaves Full unchanged", () => {
    assert.deepEqual(
      evaluateFreeAudienceGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        audienceStatus: "available",
        action: "suggest",
      }),
      { allow: true },
    );
    assert.deepEqual(
      evaluateFreeAudienceGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        audienceStatus: "available",
        action: "persist",
      }),
      { allow: true },
    );
    assert.deepEqual(
      evaluateFreeAudienceGeneration({
        athenaPlan: "full",
        action: "suggest",
      }),
      { allow: true },
    );
  });

  it("reserves before provider and releases on generate failure", () => {
    const orchestration = read("services/personas/freeAudienceOrchestration.ts");
    const suggestFn = sliceFn(
      orchestration,
      "export async function generateFreeAudienceCandidate",
      "export async function persistFreeAudiencePersona",
    );
    assert.ok(
      suggestFn.indexOf("reserveForFreeOrganization") <
        suggestFn.indexOf("generatePersonaCandidate"),
    );
    assert.match(suggestFn, /releaseFreeAudienceIfReserved/);
    assert.doesNotMatch(suggestFn, /consumeFreeAudienceIfReserved/);
  });

  it("reuses a reserved Suggest slot on persist, then binds and consumes", () => {
    const orchestration = read("services/personas/freeAudienceOrchestration.ts");
    const persistFn = sliceFn(
      orchestration,
      "export async function persistFreeAudiencePersona",
    );
    assert.match(persistFn, /ensureFreeAudiencePersistReservation/);
    assert.match(persistFn, /importPersonaManualUnchecked/);
    assert.ok(
      persistFn.indexOf("ensureFreeAudiencePersistReservation") <
        persistFn.indexOf("importPersonaManualUnchecked("),
    );
    assert.ok(
      persistFn.indexOf("importPersonaManualUnchecked") <
        persistFn.indexOf("bindFreeAudiencePersona"),
    );
    assert.ok(
      persistFn.indexOf("bindFreeAudiencePersona") <
        persistFn.indexOf("consumeFreeAudienceIfReserved"),
    );
    assert.match(persistFn, /deletePersona/);
  });

  it("direct POST uses existing persona routes and cannot inject org or plan", () => {
    const generate = read("app/api/personas/generate/route.ts");
    const persist = read("app/api/personas/route.ts");
    const csv = read("app/api/personas/import/route.ts");
    const preview = read("app/api/personas/import/preview/route.ts");
    assert.match(generate, /assertCurrentFreeAudienceGeneration/);
    assert.match(generate, /action: "suggest"/);
    assert.match(generate, /generateFreeAudienceCandidate/);
    assert.match(persist, /action: "persist"/);
    assert.match(persist, /importPersonaManual/);
    assert.match(csv, /action: "csv"/);
    assert.match(preview, /action: "csv_preview"/);
    for (const source of [generate, persist, csv, preview]) {
      assert.doesNotMatch(source, /body\.athenaPlan|body\.athena_plan|allowance/);
    }
  });
});

describe("FREE-13 Audience alternative paths and concurrency", () => {
  it("prospect create-audience obeys the same Free Audience authority", () => {
    const route = read("app/api/prospects/[id]/create-audience/route.ts");
    const create = read("services/personas/createAudienceFromProspect.ts");
    const prospectPage = read("app/prospects/[id]/page.tsx");
    assert.match(route, /assertCurrentFreeAudienceGeneration/);
    assert.match(route, /action: "prospect"/);
    assert.match(create, /generateFreeAudienceCandidate/);
    assert.match(prospectPage, /shouldShowProspectCreateAudience/);
  });

  it("CSV importer denies Free before creating persona rows", () => {
    const importer = read("services/personas/personaImporter.ts");
    const csvFn = sliceFn(importer, "export async function importPersonasFromRows");
    assert.match(csvFn, /FREE_AUDIENCE_CSV_DENIED/);
    assert.ok(
      csvFn.indexOf("FREE_AUDIENCE_CSV_DENIED") <
        csvFn.indexOf("const persist = input.createPersona"),
    );
  });

  it("manual create goes through Free persist when the org is Free", () => {
    const importer = read("services/personas/personaImporter.ts");
    const manual = sliceFn(
      importer,
      "export async function importPersonaManual(",
      "export async function importPersonaManualUnchecked",
    );
    assert.match(manual, /persistFreeAudiencePersona/);
    assert.match(manual, /resolveAthenaPlan/);
  });

  it("concurrent Suggest+Suggest, manual+manual, and mixed paths max one consumed audience", () => {
    const suggestWorld = world();
    const firstSuggest = applyReserveFreeAudience({
      world: suggestWorld,
      organizationId: ORG,
      nowMs: 1_000,
      nextToken: "s1",
    });
    const secondSuggest = applyReserveFreeAudience({
      world: suggestWorld,
      organizationId: ORG,
      nowMs: 1_100,
      nextToken: "s2",
    });
    assert.equal(firstSuggest.outcome, "reserved");
    assert.equal(secondSuggest.outcome, "already_reserved");

    const manualWorld = world();
    applyReserveFreeAudience({
      world: manualWorld,
      organizationId: ORG,
      nowMs: 1_000,
      nextToken: "m1",
    });
    applyBindFreeAudience({
      world: manualWorld,
      reservationToken: "m1",
      personaId: PERSONA_A,
    });
    applyConsumeFreeAudience({ world: manualWorld, personaId: PERSONA_A });
    const secondManual = applyReserveFreeAudience({
      world: manualWorld,
      organizationId: ORG,
      nowMs: 1_200,
      nextToken: "m2",
    });
    assert.equal(secondManual.outcome, "already_consumed");

    const mixed = world();
    applyReserveFreeAudience({
      world: mixed,
      organizationId: ORG,
      nowMs: 1_000,
      nextToken: "mix",
    });
    assert.equal(
      applyReserveFreeAudience({
        world: mixed,
        organizationId: ORG,
        nowMs: 1_050,
        nextToken: "mix-2",
      }).outcome,
      "already_reserved",
    );
    applyBindFreeAudience({
      world: mixed,
      reservationToken: "mix",
      personaId: PERSONA_A,
    });
    applyConsumeFreeAudience({ world: mixed, personaId: PERSONA_A });
    assert.equal(
      applyBindFreeAudience({
        world: mixed,
        reservationToken: "mix",
        personaId: PERSONA_B,
      }).outcome,
      "conflict",
    );
    assert.equal(mixed.organization.personaId, PERSONA_A);
  });

  it("invalid / failed Suggest releases and does not consume", () => {
    const current = world();
    applyReserveFreeAudience({
      world: current,
      organizationId: ORG,
      nowMs: 1_000,
      nextToken: "fail",
    });
    assert.deepEqual(
      applyReleaseFreeAudience({
        world: current,
        reservationToken: "fail",
      }),
      { outcome: "released" },
    );
    assert.equal(current.organization.status, "available");
    assert.notEqual(current.organization.status, "consumed");
  });

  it("does not leak Free restrictions into Ads or Social Content persona reads", () => {
    const adsComposer = read("services/ads/adsContextComposer.ts");
    const adsTarget = read("services/ads/adsTargetPersona.ts");
    const social = read(
      "services/socialPlanner/intelligence/socialPlannerIntelligenceSources.ts",
    );
    const adsOrch = read("services/ads/freeTractionOrchestration.ts");
    const socialGuard = read(
      "services/organization/freeSocialPlannerGenerationGuard.ts",
    );
    for (const source of [adsComposer, adsTarget, social]) {
      assert.doesNotMatch(source, /freeAudience|FreeAudience/);
      assert.match(source, /getPersonas|getPersonaById/);
    }
    assert.doesNotMatch(adsOrch, /freeAudience|FreeAudience/);
    assert.doesNotMatch(socialGuard, /freeAudience|FreeAudience/);
  });
});
