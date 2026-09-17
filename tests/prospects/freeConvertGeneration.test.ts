import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { evaluateFreeConvertGeneration } from "../../lib/organization/freeConvertGeneration";

const ROOT = process.cwd();
const PROSPECT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROSPECT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

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

describe("FREE-11 Convert creation API", () => {
  it("denies Free untrained create / generate / regenerate before job work", () => {
    for (const action of ["create", "generate", "regenerate"] as const) {
      const decision = evaluateFreeConvertGeneration({
        athenaPlan: "free",
        defineKind: "needs_setup",
        action,
        prospectId: PROSPECT_A,
        boundProspectId: PROSPECT_A,
      });
      assert.equal(decision.allow, false);
      if (decision.allow) return;
      assert.equal(decision.code, "FREE_UNTRAINED");
      assert.equal(decision.httpStatus, 403);
    }
  });

  it("allows trained available Free starter create and leaves Full unchanged", () => {
    assert.deepEqual(
      evaluateFreeConvertGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        convertStatus: "available",
        action: "create",
      }),
      { allow: true },
    );
    assert.deepEqual(
      evaluateFreeConvertGeneration({
        athenaPlan: "full",
        action: "create",
      }),
      { allow: true },
    );
  });

  it("denies CSV / bulk import for Free and leaves Full import unchanged", () => {
    const decision = evaluateFreeConvertGeneration({
      athenaPlan: "free",
      defineKind: "ready",
      convertStatus: "available",
      action: "import",
    });
    assert.equal(decision.allow, false);
    if (decision.allow) return;
    assert.equal(decision.code, "FREE_CONVERT_IMPORT_DENIED");
    assert.deepEqual(
      evaluateFreeConvertGeneration({
        athenaPlan: "full",
        action: "import",
      }),
      { allow: true },
    );
    const route = read("app/api/prospects/import/route.ts");
    assert.match(route, /action: "import"/);
    assert.match(route, /assertCurrentFreeConvertGeneration/);
  });

  it("reserves before createProspect and enqueue, then binds the prospect", () => {
    const orchestration = read("services/prospects/freeConvertOrchestration.ts");
    const persistFn = sliceFn(
      orchestration,
      "async function persistFreeConvertProspect",
      "export async function createFreeConvertManualProspect",
    );
    assert.ok(
      persistFn.indexOf("reserveFreeConvert") < persistFn.indexOf("createProspect"),
    );
    assert.ok(
      persistFn.indexOf("createProspect") < persistFn.indexOf("bindFreeConvertProspect"),
    );
    assert.ok(
      persistFn.indexOf("bindFreeConvertProspect") <
        persistFn.indexOf("ensureProspectGenerationQueued"),
    );
    assert.doesNotMatch(persistFn, /importProspectManual/);
    const createFn = sliceFn(
      orchestration,
      "export async function createFreeConvertManualProspect",
      "export async function persistFreeConvertFromGetOblic",
    );
    assert.match(createFn, /persistFreeConvertProspect/);
    assert.doesNotMatch(createFn, /importProspectManual/);
  });

  it("direct POST uses existing /api/prospects and cannot inject org or plan", () => {
    const route = read("app/api/prospects/route.ts");
    assert.match(route, /assertCurrentFreeConvertGeneration/);
    assert.match(route, /action: "create"/);
    assert.match(route, /createFreeConvertManualProspect/);
    assert.match(route, /importProspectManual/);
    assert.match(route, /organization_id: _organizationId/);
    assert.match(route, /organizationId: _organizationIdCamel/);
    assert.doesNotMatch(route, /body\.athenaPlan|body\.athena_plan|allowance/);
    const post = sliceFn(route, "export async function POST", "catch (error)");
    assert.ok(
      post.indexOf("assertCurrentFreeConvertGeneration") <
        post.indexOf("createFreeConvertManualProspect"),
    );
  });

  it("denies Free GetOblic before allocation and leaves Google starter persist intact", () => {
    const decision = evaluateFreeConvertGeneration({
      athenaPlan: "free",
      defineKind: "ready",
      convertStatus: "available",
      action: "from_getoblic",
    });
    assert.equal(decision.allow, false);
    if (decision.allow) return;
    assert.equal(decision.code, "FREE_CONVERT_GETOBLIC_DENIED");
    assert.equal(decision.httpStatus, 403);
    assert.deepEqual(
      evaluateFreeConvertGeneration({
        athenaPlan: "full",
        action: "from_getoblic",
      }),
      { allow: true },
    );

    const getoblic = read("app/api/prospects/from-getoblic/route.ts");
    const google = read("app/api/prospects/from-google-business/route.ts");
    const orchestration = read("services/prospects/freeConvertOrchestration.ts");
    const post = sliceFn(getoblic, "export async function POST", "catch (error)");
    assert.match(post, /action: "from_getoblic"/);
    assert.match(post, /assertCurrentFreeConvertGeneration/);
    assert.doesNotMatch(post, /persistFreeConvertFromGetOblic/);
    assert.ok(
      post.indexOf("assertCurrentFreeConvertGeneration") <
        post.indexOf("convertGetOblicDirectoryListing"),
    );
    assert.doesNotMatch(post, /reserveFreeConvert|reserveGetOblicListingCapacity/);
    assert.match(google, /persistFreeConvertFromGoogleBusiness/);
    const getoblicFn = sliceFn(
      orchestration,
      "export async function persistFreeConvertFromGetOblic",
      "export async function persistFreeConvertFromGoogleBusiness",
    );
    assert.ok(
      getoblicFn.indexOf("reserveFreeConvert") <
        getoblicFn.indexOf("convertGetOblicDirectoryListing"),
    );
    assert.ok(
      getoblicFn.indexOf("convertGetOblicDirectoryListing") <
        getoblicFn.indexOf("bindFreeConvertProspect"),
    );
    assert.doesNotMatch(getoblicFn, /ensureProspectGenerationQueued/);
    const search = read("services/getoblicDirectory/getoblicDirectorySearchService.ts");
    assert.doesNotMatch(search, /reserveFreeConvert|free_convert/);
  });
});

describe("FREE-11 Convert retry and regenerate", () => {
  it("allows generate only on the bound starter prospect with a website", () => {
    assert.deepEqual(
      evaluateFreeConvertGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        convertStatus: "reserved",
        action: "generate",
        prospectId: PROSPECT_A,
        boundProspectId: PROSPECT_A,
        hasWebsite: true,
      }),
      { allow: true },
    );
    assert.equal(
      evaluateFreeConvertGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        convertStatus: "reserved",
        action: "generate",
        prospectId: PROSPECT_B,
        boundProspectId: PROSPECT_A,
        hasWebsite: true,
      }).allow,
      false,
    );
    assert.equal(
      evaluateFreeConvertGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        convertStatus: "reserved",
        action: "generate",
        prospectId: PROSPECT_A,
        boundProspectId: PROSPECT_A,
        hasWebsite: false,
      }).allow,
      false,
    );
    assert.equal(
      evaluateFreeConvertGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        convertStatus: "consumed",
        action: "generate",
        prospectId: PROSPECT_A,
        boundProspectId: PROSPECT_A,
        hasWebsite: true,
      }).allow,
      false,
    );
  });

  it("denies regenerate, updates, think differently, and deep scrape after consumed", () => {
    for (const action of ["regenerate", "deep_scrape"] as const) {
      const decision = evaluateFreeConvertGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        convertStatus: "consumed",
        action,
        prospectId: PROSPECT_A,
        boundProspectId: PROSPECT_A,
      });
      assert.equal(decision.allow, false);
    }
    assert.deepEqual(
      evaluateFreeConvertGeneration({
        athenaPlan: "full",
        action: "regenerate",
      }),
      { allow: true },
    );
    const think = read("app/api/prospects/[id]/think-differently/route.ts");
    const updates = read("app/api/prospects/[id]/updates/route.ts");
    const refresh = read("app/api/prospects/[id]/refresh/route.ts");
    const deep = read("app/api/prospects/[id]/deep-scrape/route.ts");
    const patch = read("app/api/prospects/[id]/route.ts");
    assert.match(think, /action: "regenerate"/);
    assert.match(updates, /action: "regenerate"/);
    assert.match(refresh, /action: "generate"/);
    assert.match(deep, /action: "deep_scrape"/);
    assert.match(patch, /FREE_CONVERT_REGENERATE_DENIED/);
    assert.match(patch, /hasMeaningfulProspectEdit/);
  });

  it("makes Ask Athena, GetOblic description, and Create Audience unreachable after consumed", () => {
    const decision = evaluateFreeConvertGeneration({
      athenaPlan: "free",
      defineKind: "ready",
      convertStatus: "consumed",
      action: "sync_ai",
    });
    assert.equal(decision.allow, false);
    if (decision.allow) return;
    assert.equal(decision.code, "FREE_CONVERT_SYNC_DENIED");
    assert.deepEqual(
      evaluateFreeConvertGeneration({
        athenaPlan: "full",
        action: "sync_ai",
      }),
      { allow: true },
    );
    const conversation = read("app/api/prospects/[id]/conversation/route.ts");
    const description = read("app/api/prospects/[id]/getoblic-description/route.ts");
    const audience = read("app/api/prospects/[id]/create-audience/route.ts");
    for (const source of [conversation, description, audience]) {
      assert.match(source, /action: "sync_ai"/);
      assert.match(source, /assertCurrentFreeConvertGeneration/);
    }
  });
});

describe("FREE-11 Convert discussion bridge and worker", () => {
  it("denies prospect_intelligence discussion analyze / think differently / updates bypass", () => {
    const analyze = read("app/api/discussions/[id]/analyze/route.ts");
    const think = read("app/api/discussions/[id]/think-differently/route.ts");
    const updates = read("app/api/discussions/[id]/updates/route.ts");
    const runner = read("services/generationJobs/generationJobRunner.ts");
    assert.match(analyze, /assertCurrentProspectIntelligenceDiscussion/);
    assert.match(analyze, /action: "generate"/);
    assert.match(think, /action: "regenerate"/);
    assert.match(updates, /action: "regenerate"/);
    assert.match(runner, /assertProspectIntelligenceFreeConvertEnqueue/);
    assert.match(
      read("services/organization/freeConvertGenerationGuard.ts"),
      /isProspectIntelligenceBridge/,
    );
  });

  it("keeps TypeScript consume/release as secondary hooks after Ready/Failed", () => {
    const importer = read("services/prospects/prospectImporter.ts");
    const ready = sliceFn(
      importer,
      "export async function markProspectGenerationReady",
      "export async function markProspectGenerationFailed",
    );
    const failed = sliceFn(
      importer,
      "export async function markProspectGenerationFailed",
      "export async function importProspectManual",
    );
    assert.ok(
      ready.indexOf('status: "Ready"') <
        ready.indexOf("consumeFreeConvertIfReserved"),
    );
    assert.ok(
      failed.indexOf('status: "Processing Failed"') <
        failed.indexOf("releaseFreeConvertIfReserved"),
    );
    assert.doesNotMatch(ready, /openrouter|prompt/i);
    const executor = read("services/generationJobs/generationJobExecutor.ts");
    const shortCircuit = sliceFn(
      executor,
      "Idempotent completion if this job already published its version.",
      "if (options?.shouldStop?.())",
    );
    assert.ok(
      shortCircuit.indexOf("completeGenerationJobWithClaim") <
        shortCircuit.indexOf("markProspectGenerationReady"),
    );
    assert.ok(
      shortCircuit.indexOf("markProspectGenerationReady") <
        shortCircuit.lastIndexOf('return "completed"'),
    );
  });

  it("does not alter Full create / generate orchestration", () => {
    const importer = read("services/prospects/prospectImporter.ts");
    const manual = sliceFn(
      importer,
      "export async function importProspectManual",
      "export async function importProspectsFromRows",
    );
    assert.match(manual, /ensureProspectGenerationQueued/);
    assert.doesNotMatch(manual, /reserveFreeConvert/);
    const route = read("app/api/prospects/route.ts");
    assert.match(route, /importProspectManual/);
  });

  it("does not load Free Convert columns on Full create or /prospects reads", () => {
    const guard = read(
      "services/organization/freeConvertGenerationGuard.ts",
    );
    const pageState = read("services/prospects/freeConvertPageState.ts");
    const loadContext = guard.slice(
      guard.indexOf("export const loadFreeConvertGenerationContext"),
    );
    assert.ok(
      loadContext.indexOf("resolveAthenaPlan") <
        loadContext.indexOf("loadFreeConvertAuthority"),
    );
    assert.match(guard, /athenaPlan === "free"/);
    assert.match(pageState, /athenaPlan !== "free"/);
    const loadFn = pageState.slice(
      pageState.indexOf("export async function loadFreeConvertPageState"),
    );
    assert.ok(
      loadFn.indexOf('presentation: "full"') <
        loadFn.indexOf("loadFreeConvertAuthority"),
    );
  });

  it("keeps GET / status / delete available and delete cannot restore allowance", () => {
    const detail = read("app/api/prospects/[id]/route.ts");
    const status = read("app/api/prospects/[id]/status/route.ts");
    assert.match(detail, /export async function GET/);
    assert.match(detail, /export async function DELETE/);
    assert.doesNotMatch(detail, /releaseFreeConvertIfReserved/);
    assert.doesNotMatch(status, /assertCurrentFreeConvertGeneration/);
  });
});
