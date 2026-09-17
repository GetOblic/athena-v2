/**
 * FREE-13C — consumed Free Audience intelligence containment.
 * Creation / persist authority stays in freeAudienceGeneration.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { evaluateFreeAudienceGeneration } from "../../lib/organization/freeAudienceGeneration";
import { evaluateFreeAudienceIntelligence } from "../../lib/organization/freeAudienceIntelligence";
import { evaluateFreeTractionGeneration } from "../../lib/organization/freeTractionGeneration";
import { evaluateFreeSocialPlannerGeneration } from "../../lib/organization/freeSocialPlannerGeneration";

const ROOT = process.cwd();

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

describe("FREE-13C Audience intelligence policy", () => {
  it("does not reuse creation consumed semantics for regenerate", () => {
    const create = evaluateFreeAudienceGeneration({
      athenaPlan: "free",
      defineKind: "ready",
      audienceStatus: "consumed",
      action: "persist",
    });
    const refresh = evaluateFreeAudienceIntelligence({
      athenaPlan: "free",
      audienceStatus: "consumed",
      action: "refresh",
    });
    assert.equal(create.allow, false);
    assert.equal(refresh.allow, false);
    if (create.allow || refresh.allow) return;
    assert.equal(create.code, "FREE_AUDIENCE_CONSUMED");
    assert.equal(create.httpStatus, 409);
    assert.equal(refresh.code, "FREE_AUDIENCE_REGENERATE_DENIED");
    assert.equal(refresh.httpStatus, 403);
  });

  it("denies every post-creation Free intelligence action and leaves Full unchanged", () => {
    for (const action of [
      "refresh",
      "think_differently",
      "deep_scrape",
      "observation",
    ] as const) {
      const consumed = evaluateFreeAudienceIntelligence({
        athenaPlan: "free",
        audienceStatus: "consumed",
        action,
      });
      const available = evaluateFreeAudienceIntelligence({
        athenaPlan: "free",
        audienceStatus: "available",
        action,
      });
      assert.equal(consumed.allow, false);
      assert.equal(available.allow, false);
      if (consumed.allow) return;
      assert.equal(consumed.code, "FREE_AUDIENCE_REGENERATE_DENIED");
      assert.deepEqual(
        evaluateFreeAudienceIntelligence({
          athenaPlan: "full",
          audienceStatus: "consumed",
          action,
        }),
        { allow: true },
      );
    }
  });

  it("allows the reserved first persist queue and denies a second generate after consume", () => {
    assert.deepEqual(
      evaluateFreeAudienceIntelligence({
        athenaPlan: "free",
        audienceStatus: "reserved",
        action: "generate",
      }),
      { allow: true },
    );
    const consumed = evaluateFreeAudienceIntelligence({
      athenaPlan: "free",
      audienceStatus: "consumed",
      action: "generate",
    });
    assert.equal(consumed.allow, false);
    if (consumed.allow) return;
    assert.equal(consumed.code, "FREE_AUDIENCE_REGENERATE_DENIED");
  });
});

describe("FREE-13C HTTP and service bypasses", () => {
  it("direct persona POST routes assert before queue / scrape / append", () => {
    const refresh = read("app/api/personas/[id]/refresh/route.ts");
    const think = read("app/api/personas/[id]/think-differently/route.ts");
    const updates = read("app/api/personas/[id]/updates/route.ts");
    const deep = read("app/api/personas/[id]/deep-scrape/route.ts");
    assert.match(refresh, /action: "refresh"/);
    assert.match(think, /action: "think_differently"/);
    assert.match(updates, /action: "observation"/);
    assert.match(deep, /action: "deep_scrape"/);
    for (const source of [refresh, think, updates, deep]) {
      assert.match(source, /assertCurrentFreeAudienceIntelligence/);
      assert.match(source, /FreeAudienceIntelligenceError/);
      assert.doesNotMatch(source, /assertCurrentFreeAudienceGeneration/);
    }
    const refreshPost = sliceFn(refresh, "export async function POST", "catch (error)");
    assert.ok(
      refreshPost.indexOf("assertCurrentFreeAudienceIntelligence") <
        refreshPost.indexOf("ensurePersonaGenerationQueued"),
    );
    const thinkPost = sliceFn(think, "export async function POST", "catch (error)");
    assert.ok(
      thinkPost.indexOf("assertCurrentFreeAudienceIntelligence") <
        thinkPost.indexOf("ensurePersonaGenerationQueued"),
    );
    const updatesPost = sliceFn(updates, "export async function POST", "catch (error)");
    assert.ok(
      updatesPost.indexOf("assertCurrentFreeAudienceIntelligence") <
        updatesPost.indexOf("appendPersonaInteraction"),
    );
    const deepPost = sliceFn(deep, "export async function POST", "catch (error)");
    assert.ok(
      deepPost.indexOf("assertCurrentFreeAudienceIntelligence") <
        deepPost.indexOf("enqueuePersonaReferenceWebsiteDeepScrape"),
    );
  });

  it("discussion persona_intelligence bypasses use the same containment", () => {
    const analyze = read("app/api/discussions/[id]/analyze/route.ts");
    const think = read("app/api/discussions/[id]/think-differently/route.ts");
    const updates = read("app/api/discussions/[id]/updates/route.ts");
    assert.match(analyze, /assertCurrentPersonaIntelligenceDiscussion/);
    assert.match(analyze, /action: "refresh"/);
    assert.match(think, /action: "think_differently"/);
    assert.match(updates, /action: "observation"/);
    for (const source of [analyze, think, updates]) {
      assert.match(source, /FreeAudienceIntelligenceError/);
    }
  });

  it("reusable queue / service entries cannot bypass the persona routes", () => {
    const importer = read("services/personas/personaImporter.ts");
    const interactions = read("services/personas/personaInteractions.ts");
    const deep = read("services/personas/personaDeepScrape.ts");
    const runner = read("services/generationJobs/generationJobRunner.ts");
    const executor = read("services/generationJobs/generationJobExecutor.ts");
    const guard = read(
      "services/organization/freeAudienceIntelligenceGuard.ts",
    );
    const queued = sliceFn(
      importer,
      "export async function ensurePersonaGenerationQueued",
      "export async function markPersonaGenerationReady",
    );
    assert.match(queued, /assertFreeAudienceIntelligenceForOrganization/);
    assert.ok(
      queued.indexOf("assertFreeAudienceIntelligenceForOrganization") <
        queued.indexOf("enqueueDiscussionGenerationJob"),
    );
    assert.match(queued, /discussion_import" \? "generate" : "refresh"/);
    assert.match(interactions, /action: "observation"/);
    assert.match(deep, /action: "deep_scrape"/);
    const enqueueDeep = sliceFn(
      deep,
      "export async function enqueuePersonaReferenceWebsiteDeepScrape",
      "export async function getPersonaDeepScrapeStatus",
    );
    assert.ok(
      enqueueDeep.indexOf("assertFreeAudienceIntelligenceForOrganization") <
        enqueueDeep.indexOf("enqueuePersonaDeepScrapeJob"),
    );
    assert.match(runner, /assertPersonaIntelligenceFreeAudienceEnqueue/);
    assert.match(guard, /isPersonaIntelligenceBridge/);
    assert.match(executor, /isPersonaIntelligenceBridge\(discussion\)/);
    assert.match(executor, /isProspectIntelligenceBridge\(discussion\) \|\|/);
    assert.match(executor, /isPersonaIntelligenceBridge\(discussion\)/);
    assert.match(executor, /athenaPlan === "free"/);
  });

  it("keeps metadata, lifecycle, GET, delete, and conversation ungated by containment", () => {
    const detail = read("app/api/personas/[id]/route.ts");
    const lifecycle = read("app/api/personas/[id]/lifecycle/route.ts");
    const status = read("app/api/personas/[id]/status/route.ts");
    const conversation = read("app/api/personas/[id]/conversation/route.ts");
    assert.match(detail, /export async function PATCH/);
    assert.match(detail, /export async function GET/);
    assert.match(detail, /export async function DELETE/);
    assert.doesNotMatch(detail, /freeAudienceIntelligence|FreeAudienceIntelligence/);
    assert.doesNotMatch(detail, /releaseFreeAudienceIfReserved/);
    assert.doesNotMatch(lifecycle, /freeAudienceIntelligence|FreeAudienceIntelligence/);
    assert.doesNotMatch(status, /freeAudienceIntelligence|FreeAudienceIntelligence/);
    assert.doesNotMatch(
      conversation,
      /freeAudienceIntelligence|FreeAudienceIntelligence/,
    );
  });
});

describe("FREE-13C Full, downstream, and delete non-interference", () => {
  it("does not change Full create or the first Free persist queue", () => {
    assert.deepEqual(
      evaluateFreeAudienceGeneration({
        athenaPlan: "full",
        action: "persist",
      }),
      { allow: true },
    );
    const persist = read("services/personas/freeAudienceOrchestration.ts");
    const persistFn = sliceFn(
      persist,
      "export async function persistFreeAudiencePersona",
    );
    assert.match(persistFn, /importPersonaManualUnchecked/);
    assert.match(persistFn, /consumeFreeAudienceIfReserved/);
    assert.doesNotMatch(persistFn, /freeAudienceIntelligence/);
  });

  it("does not leak into Advertising or Social Content Free authority", () => {
    assert.deepEqual(
      evaluateFreeTractionGeneration({
        athenaPlan: "full",
        action: "create",
      }),
      { allow: true },
    );
    assert.deepEqual(
      evaluateFreeSocialPlannerGeneration({
        athenaPlan: "full",
      }),
      { allow: true },
    );
    const ads = read("services/ads/freeTractionOrchestration.ts");
    const social = read(
      "services/organization/freeSocialPlannerGenerationGuard.ts",
    );
    assert.doesNotMatch(ads, /freeAudienceIntelligence|FreeAudienceIntelligence/);
    assert.doesNotMatch(
      social,
      /freeAudienceIntelligence|FreeAudienceIntelligence/,
    );
  });
});
