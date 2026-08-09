import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { mapAthenaEstimateRow } from "../../services/estimate/athenaEstimateMappers";
import {
  toPublicAthenaEstimateDetail,
  toPublicAthenaEstimateSummary,
} from "../../services/estimate/athenaEstimatePublic";
import {
  AthenaEstimateProspectResolutionError,
  deriveAthenaEstimateProspectRemoved,
  isRemovedAthenaEstimateProspectTarget,
  normalizeAthenaEstimateProspectTarget,
  resolveAthenaEstimateProspectTarget,
} from "../../services/estimate/athenaEstimateProspectTarget";
import {
  ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
  ATHENA_ESTIMATE_SCHEMA_VERSION,
  type AthenaEstimatePackage,
} from "../../services/estimate/athenaEstimateTypes";
const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

type ProspectIdentityStub = {
  id: string;
  business_name: string;
  organization_id: string;
  email?: string;
  phone?: string;
  whatsapp_number?: string;
  notes?: string;
  website_intelligence?: Record<string, unknown> | null;
  raw_json?: Record<string, unknown> | null;
};

function samplePackage(): AthenaEstimatePackage {
  return {
    schemaVersion: ATHENA_ESTIMATE_SCHEMA_VERSION,
    recommendedClientPrice: { amount: 12000, currencyCode: "USD" },
    recommendedPriceRange: {
      low: { amount: 9000, currencyCode: "USD" },
      high: { amount: 15000, currencyCode: "USD" },
    },
    scopeInterpretation: "A bounded website redesign.",
    pricingRationale: "Effort aligns with mid-market delivery.",
    keyPriceDrivers: ["Scope", "Timeline"],
    suggestedClientPositioning: "Fixed-scope delivery.",
    risksAndAssumptions: ["Assumes brand assets available"],
    geographyLabel: "United States",
    currencyResolution: "derived",
    guidanceDisclaimer: "Guidance only.",
    instructionProvenance: {
      configKey: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
      revisionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      configured: true,
    },
    marketResearchClaimed: false,
    competitorQuotesFabricated: false,
  };
}

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    licensee_account_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    organization_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    requested_by: "master-1",
    organization_name_snapshot: "Org Snapshot",
    prospect_id: null,
    prospect_business_name_snapshot: null,
    prospect_generation_context_json: null,
    request_json: { projectNeed: "Build a landing page" },
    status: "Queued",
    generation_stage: null,
    package_json: null,
    error_code: null,
    error_message: null,
    currency_code: null,
    geography_label: null,
    currency_resolution: null,
    instruction_config_key: null,
    instruction_revision_id: null,
    instruction_configured: false,
    created_at: "2026-08-09T12:00:00.000Z",
    updated_at: "2026-08-09T12:00:00.000Z",
    ...overrides,
  };
}

function stubProspect(
  overrides: Partial<ProspectIdentityStub> = {},
): ProspectIdentityStub {
  return {
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    organization_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    business_name: "ABC Dental",
    email: "secret@example.com",
    phone: "555-0100",
    whatsapp_number: "555-0101",
    notes: "private notes",
    website_intelligence: { deep: true },
    raw_json: { leak: true },
    ...overrides,
  };
}

describe("Athena Estimate L14 — Prospect target authorization + create/regenerate", () => {
  it("1. Prospect list: owned organization loads only via assert then getProspects(organizationId)", () => {
    const route = read("app/api/licensee/estimate/prospects/route.ts");
    assert.match(route, /auth\.getUser/);
    assert.match(route, /listAthenaEstimateProspectsForMaster/);
    assert.match(route, /organizationId/);
    assert.doesNotMatch(
      route,
      /requireCurrentOrganizationContext\s*\(/,
    );
    assert.doesNotMatch(route, /from\("@\/services\/tenant/);
    assert.doesNotMatch(route, /licenseeSessionHandoff|establishLicensee/);

    const orchestration = read(
      "services/estimate/athenaEstimateOrchestration.ts",
    );
    const listStart = orchestration.indexOf(
      "export async function listAthenaEstimateProspectsForMaster",
    );
    assert.ok(listStart >= 0);
    const listEnd = orchestration.indexOf(
      "\nexport async function",
      listStart + 1,
    );
    const listFn = orchestration.slice(
      listStart,
      listEnd > listStart ? listEnd : undefined,
    );
    assert.match(listFn, /requireLicenseeMasterAccount/);
    assert.match(listFn, /assertLicenseeOwnsSubAccount/);
    assert.match(listFn, /getProspects\(organizationId\)/);
    // Ownership assert appears before getProspects.
    assert.ok(
      listFn.indexOf("assertLicenseeOwnsSubAccount") <
        listFn.indexOf("getProspects(organizationId)"),
    );
  });

  it("2. Prospect list: empty org returns successful empty collection", () => {
    const route = read("app/api/licensee/estimate/prospects/route.ts");
    assert.match(route, /ok: true, prospects/);
    assert.doesNotMatch(route, /prospects\.length === 0/);
    const orchestration = read(
      "services/estimate/athenaEstimateOrchestration.ts",
    );
    assert.match(
      orchestration,
      /return prospects\.map\(\(prospect\) => \(\{/,
    );
  });

  it("3. Prospect list: Master does not own organization → fail closed via LicenseeAccessError", () => {
    const route = read("app/api/licensee/estimate/prospects/route.ts");
    assert.match(route, /LicenseeAccessError/);
    assert.match(route, /403/);
    const orchestration = read(
      "services/estimate/athenaEstimateOrchestration.ts",
    );
    const listStart = orchestration.indexOf(
      "export async function listAthenaEstimateProspectsForMaster",
    );
    const listFn = orchestration.slice(listStart, listStart + 800);
    assert.match(listFn, /assertLicenseeOwnsSubAccount/);
  });

  it("4. Prospect list response exposes only id/businessName", () => {
    const orchestration = read(
      "services/estimate/athenaEstimateOrchestration.ts",
    );
    assert.match(
      orchestration,
      /businessName:\s*prospect\.business_name/,
    );
    assert.match(
      orchestration,
      /AthenaEstimateProspectOption = \{\s*id: string;\s*businessName: string;/,
    );
    const listStart = orchestration.indexOf(
      "export async function listAthenaEstimateProspectsForMaster",
    );
    const listEnd = orchestration.indexOf(
      "\nexport async function",
      listStart + 1,
    );
    const listFn = orchestration.slice(
      listStart,
      listEnd > listStart ? listEnd : undefined,
    );
    assert.doesNotMatch(listFn, /email|phone|whatsapp|notes|raw_json|website_intelligence|executive/i);
  });

  it("5. Org-only POST create remains identical V26 path when prospectId omitted", async () => {
    const route = read("app/api/licensee/estimate/route.ts");
    assert.match(route, /prospectId/);
    assert.match(route, /let prospectId: string \| null = null/);
    assert.match(
      route,
      /createAthenaEstimateWithJob\(\{[\s\S]*prospectId,/,
    );

    const orchestration = read(
      "services/estimate/athenaEstimateOrchestration.ts",
    );
    const createStart = orchestration.indexOf(
      "export async function createAthenaEstimateWithJob",
    );
    const createFn = orchestration.slice(createStart, createStart + 2200);
    assert.match(createFn, /requireLicenseeMasterAccount/);
    assert.match(createFn, /assertLicenseeOwnsSubAccount/);
    assert.match(createFn, /resolveAthenaEstimateProspectTarget/);
    assert.match(createFn, /createQueuedAthenaEstimate/);
    assert.match(createFn, /enqueueAthenaEstimateGenerationJob/);

    // Org-only resolve returns nulls without fetch.
    const target = await resolveAthenaEstimateProspectTarget(
      {
        organizationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        prospectId: null,
      },
      {
        getProspectById: async () => {
          throw new Error("must not fetch Prospect for org-only");
        },
      },
    );
    assert.deepEqual(target, {
      prospectId: null,
      prospectBusinessNameSnapshot: null,
    });
  });

  it("6. Prospect POST create: owned org + Prospect → server snapshot", async () => {
    const prospect = stubProspect({
      business_name: "  Live Prospect Name  ",
    });
    const target = await resolveAthenaEstimateProspectTarget(
      {
        organizationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        prospectId: prospect.id,
      },
      {
        getProspectById: async (id, organizationId) => {
          assert.equal(id, prospect.id);
          assert.equal(
            organizationId,
            "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          );
          return prospect;
        },
      },
    );
    assert.deepEqual(target, {
      prospectId: prospect.id,
      prospectBusinessNameSnapshot: "Live Prospect Name",
    });

    const orchestration = read(
      "services/estimate/athenaEstimateOrchestration.ts",
    );
    assert.match(
      orchestration,
      /prospectBusinessNameSnapshot:\s*prospectTarget\.prospectBusinessNameSnapshot/,
    );
    assert.match(
      orchestration,
      /prospectId: prospectTarget\.prospectId/,
    );
  });

  it("7. Cross-org prospectId fails closed", async () => {
    await assert.rejects(
      () =>
        resolveAthenaEstimateProspectTarget(
          {
            organizationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            prospectId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          },
          { getProspectById: async () => null },
        ),
      (error: unknown) =>
        error instanceof AthenaEstimateProspectResolutionError &&
        error.code === "PROSPECT_TARGET_UNAVAILABLE",
    );

    const route = read("app/api/licensee/estimate/route.ts");
    assert.match(route, /AthenaEstimateProspectResolutionError/);
    assert.match(route, /404/);
    assert.match(route, /Prospect target is unavailable/);
  });

  it("8. Prospect from another Licensee fails closed (org-bound getProspectById null)", async () => {
    await assert.rejects(
      () =>
        resolveAthenaEstimateProspectTarget(
          {
            organizationId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
            prospectId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          },
          { getProspectById: async () => null },
        ),
      AthenaEstimateProspectResolutionError,
    );

    const targetModule = read(
      "services/estimate/athenaEstimateProspectTarget.ts",
    );
    assert.match(targetModule, /getProspectById/);
    assert.match(targetModule, /organizationId/);
  });

  it("9. Client-supplied prospect business-name snapshot cannot override server snapshot", async () => {
    const route = read("app/api/licensee/estimate/route.ts");
    assert.match(route, /delete rest\.prospectBusinessNameSnapshot/);
    assert.match(route, /delete rest\.prospect_business_name_snapshot/);

    const prospect = stubProspect({ business_name: "Server Name" });
    const target = await resolveAthenaEstimateProspectTarget(
      {
        organizationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        prospectId: prospect.id,
      },
      { getProspectById: async () => prospect },
    );
    assert.equal(target.prospectBusinessNameSnapshot, "Server Name");
    assert.notEqual(target.prospectBusinessNameSnapshot, "Client Spoof");
  });

  it("10. Invalid prospectId rejected/fails closed without data leakage", async () => {
    const route = read("app/api/licensee/estimate/route.ts");
    assert.match(
      route,
      /prospectId must be a valid UUID when provided/,
    );

    await assert.rejects(
      () =>
        resolveAthenaEstimateProspectTarget(
          {
            organizationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            prospectId: "not-a-uuid",
          },
          {
            getProspectById: async () => {
              throw new Error("must not fetch on invalid uuid");
            },
          },
        ),
      AthenaEstimateProspectResolutionError,
    );
  });

  it("11. Prospect create keeps generation context null", () => {
    const service = read("services/estimate/athenaEstimateService.ts");
    const createStart = service.indexOf(
      "export async function createQueuedAthenaEstimate",
    );
    const createNext = service.indexOf(
      "\nexport async function",
      createStart + 1,
    );
    const createFn = service.slice(
      createStart,
      createNext > createStart ? createNext : undefined,
    );
    assert.match(createFn, /prospect_generation_context_json: null/);

    const orchestration = read(
      "services/estimate/athenaEstimateOrchestration.ts",
    );
    assert.doesNotMatch(
      orchestration,
      /validateEstimateProspectGenerationContext/,
    );
    assert.doesNotMatch(
      orchestration,
      /composeEstimateProspectGenerationContext/,
    );
    // Create persists null freeze; L15 composition happens at generation Ready.
    assert.match(
      orchestration,
      /Org-only Estimates remain V26 org-context with null frozen Prospect context/,
    );
  });

  it("12. Org-only Regenerate identical V26 behavior (null prospectId passthrough)", () => {
    const orchestration = read(
      "services/estimate/athenaEstimateOrchestration.ts",
    );
    const regenStart = orchestration.indexOf(
      "export async function regenerateAthenaEstimate",
    );
    const regenFn = orchestration.slice(regenStart, regenStart + 1800);
    assert.match(regenFn, /isRemovedAthenaEstimateProspectTarget/);
    assert.match(regenFn, /createAthenaEstimateWithJob/);
    assert.match(regenFn, /prospectId: source\.prospect_id/);
    assert.match(regenFn, /request: source\.request_json/);
    assert.match(regenFn, /organizationId: source\.organization_id/);
    assert.doesNotMatch(
      regenFn,
      /prospect_business_name_snapshot:\s*source/,
    );
  });

  it("13. Active Prospect Regenerate re-resolves live Prospect via create path", () => {
    const orchestration = read(
      "services/estimate/athenaEstimateOrchestration.ts",
    );
    const regenStart = orchestration.indexOf(
      "export async function regenerateAthenaEstimate",
    );
    const regenFn = orchestration.slice(regenStart, regenStart + 1800);
    assert.match(regenFn, /prospectId: source\.prospect_id/);
    assert.match(
      regenFn,
      /const created = await createAthenaEstimateWithJob/,
    );

    const createStart = orchestration.indexOf(
      "export async function createAthenaEstimateWithJob",
    );
    const createFn = orchestration.slice(createStart, createStart + 1800);
    assert.match(createFn, /resolveAthenaEstimateProspectTarget/);
    assert.match(createFn, /loadOrganizationNameSnapshot/);
  });

  it("14. Prospect renamed: resolver snapshots current business_name", async () => {
    const renamed = stubProspect({ business_name: "Renamed Clinic" });
    const target = await resolveAthenaEstimateProspectTarget(
      {
        organizationId: renamed.organization_id,
        prospectId: renamed.id,
      },
      { getProspectById: async () => renamed },
    );
    assert.equal(target.prospectBusinessNameSnapshot, "Renamed Clinic");

    const sourceSnapshot = "Old Snapshot Name";
    assert.notEqual(target.prospectBusinessNameSnapshot, sourceSnapshot);
  });

  it("15. Prospect removed: regenerate fails closed; no create path", () => {
    assert.equal(
      isRemovedAthenaEstimateProspectTarget({
        prospectId: null,
        prospectBusinessNameSnapshot: "ABC Dental",
      }),
      true,
    );
    assert.equal(
      isRemovedAthenaEstimateProspectTarget({
        prospectId: null,
        prospectBusinessNameSnapshot: null,
      }),
      false,
    );

    const orchestration = read(
      "services/estimate/athenaEstimateOrchestration.ts",
    );
    const regenStart = orchestration.indexOf(
      "export async function regenerateAthenaEstimate",
    );
    const regenFn = orchestration.slice(regenStart, regenStart + 1600);
    assert.match(regenFn, /isRemovedAthenaEstimateProspectTarget/);
    assert.match(regenFn, /AthenaEstimateProspectResolutionError/);
    assert.ok(
      regenFn.indexOf("isRemovedAthenaEstimateProspectTarget") <
        regenFn.indexOf("createAthenaEstimateWithJob"),
    );

    const route = read(
      "app/api/licensee/estimate/[id]/regenerate/route.ts",
    );
    assert.match(route, /AthenaEstimateProspectResolutionError/);
    assert.match(route, /409/);
  });

  it("16. Prospect moved/wrong organization: Regenerate fails closed on resolve", async () => {
    await assert.rejects(
      () =>
        resolveAthenaEstimateProspectTarget(
          {
            organizationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            prospectId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          },
          { getProspectById: async () => null },
        ),
      AthenaEstimateProspectResolutionError,
    );

    const orchestration = read(
      "services/estimate/athenaEstimateOrchestration.ts",
    );
    assert.match(
      orchestration,
      /prospectId: source\.prospect_id/,
    );
    assert.match(
      orchestration,
      /resolveAthenaEstimateProspectTarget/,
    );
  });

  it("17. Hide unchanged for all target states (no live Prospect required)", () => {
    const orchestration = read(
      "services/estimate/athenaEstimateOrchestration.ts",
    );
    const hideStart = orchestration.indexOf(
      "export async function hideAthenaEstimateForMaster",
    );
    const hideFn = orchestration.slice(hideStart, hideStart + 900);
    assert.match(hideFn, /hideAthenaEstimateForLicensee/);
    assert.doesNotMatch(hideFn, /getProspectById|prospect_id|assertLicenseeOwnsSubAccount/);
    assert.match(
      orchestration,
      /Works for org-only, active Prospect, and removed-Prospect/,
    );

    const hideRoute = read("app/api/licensee/estimate/[id]/hide/route.ts");
    assert.match(hideRoute, /hideAthenaEstimateForMaster/);
    assert.doesNotMatch(hideRoute, /getProspectById|prospectId/);
  });

  it("18. Public DTO: org-only → null Prospect / prospectRemoved false", () => {
    const estimate = mapAthenaEstimateRow(baseRow());
    const summary = toPublicAthenaEstimateSummary(estimate, true);
    assert.equal(summary.prospectId, null);
    assert.equal(summary.prospectBusinessNameSnapshot, null);
    assert.equal(summary.prospectRemoved, false);
  });

  it("19. Public DTO: active Prospect → id + snapshot / prospectRemoved false", () => {
    const estimate = mapAthenaEstimateRow(
      baseRow({
        prospect_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        prospect_business_name_snapshot: "ABC Dental",
        status: "Ready",
        generation_stage: "completed",
        package_json: samplePackage(),
        currency_code: "USD",
        geography_label: "United States",
        currency_resolution: "derived",
        instruction_config_key: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
        instruction_revision_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        instruction_configured: true,
      }),
    );
    const detail = toPublicAthenaEstimateDetail(estimate, true);
    assert.equal(detail.prospectId, "dddddddd-dddd-4ddd-8ddd-dddddddddddd");
    assert.equal(detail.prospectBusinessNameSnapshot, "ABC Dental");
    assert.equal(detail.prospectRemoved, false);
  });

  it("20. Public DTO: removed Prospect → id null + snapshot / prospectRemoved true", () => {
    const estimate = mapAthenaEstimateRow(
      baseRow({
        prospect_id: null,
        prospect_business_name_snapshot: "ABC Dental",
      }),
    );
    const summary = toPublicAthenaEstimateSummary(estimate, false);
    assert.equal(summary.prospectId, null);
    assert.equal(summary.prospectBusinessNameSnapshot, "ABC Dental");
    assert.equal(summary.prospectRemoved, true);
    assert.equal(
      deriveAthenaEstimateProspectRemoved({
        prospectId: null,
        prospectBusinessNameSnapshot: "ABC Dental",
      }),
      true,
    );
  });

  it("21. Full frozen generation context is NOT exposed publicly", () => {
    const publicApi = read("services/estimate/athenaEstimatePublic.ts");
    assert.doesNotMatch(
      publicApi,
      /prospectGenerationContext|prospect_generation_context/,
    );
    assert.match(publicApi, /prospectRemoved/);

    const estimate = mapAthenaEstimateRow(
      baseRow({
        prospect_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        prospect_business_name_snapshot: "ABC Dental",
        prospect_generation_context_json: {
          schemaVersion: "estimate_prospect_context_v1",
          prospectId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          businessName: "ABC Dental",
          capturedAt: "2026-08-09T12:00:00.000Z",
          composedText: "secret composed context",
          available: {
            profile: true,
            notesOrAdditionalContext: false,
            adsContent: false,
            websiteIntelligence: false,
            executiveIntelligence: false,
            strategicAssetBlueprint: false,
          },
          sources: {
            linkedDiscussionId: null,
            executiveVersionId: null,
          },
        },
        status: "Ready",
        generation_stage: "completed",
        package_json: samplePackage(),
        currency_code: "USD",
        geography_label: "United States",
        currency_resolution: "derived",
        instruction_config_key: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
        instruction_revision_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        instruction_configured: true,
      }),
    );
    const detail = toPublicAthenaEstimateDetail(estimate, true) as unknown as Record<
      string,
      unknown
    >;
    assert.equal("prospectGenerationContext" in detail, false);
    assert.equal("prospect_generation_context_json" in detail, false);
    assert.equal(detail.prospectId, "dddddddd-dddd-4ddd-8ddd-dddddddddddd");
  });

  it("22/24. Worker tolerates Prospect columns; L15 composes Prospect context; non-interference", () => {
    const executor = read(
      "services/estimate/estimateGenerationJobs/estimateGenerationJobExecutor.ts",
    );
    assert.match(executor, /composeEstimateProspectGenerationContext/);
    assert.match(executor, /validateEstimateProspectGenerationContext/);
    assert.match(executor, /prospectGenerationContextJson/);
    assert.match(
      executor,
      /Removed Prospect \(prospect_id null AND snapshot non-null\): fail closed/,
    );

    const normalize = normalizeAthenaEstimateProspectTarget({
      prospectId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      prospectBusinessNameSnapshot: "ABC Dental",
    });
    const estimate = mapAthenaEstimateRow(
      baseRow({
        prospect_id: normalize.prospectId,
        prospect_business_name_snapshot:
          normalize.prospectBusinessNameSnapshot,
        prospect_generation_context_json: null,
      }),
    );
    assert.equal(estimate.prospect_id, normalize.prospectId);
    assert.equal(estimate.prospect_generation_context_json, null);

    // Non-interference markers.
    assert.equal(
      existsSync(join(ROOT, "app/api/licensee/estimate/prospects/route.ts")),
      true,
    );
    const quotePage = read("app/licensee/quote/page.tsx");
    assert.doesNotMatch(quotePage, /listAthenaEstimateProspectsForMaster/);
    const askPanel = read(
      "components/licensee/estimate/EstimateAskAthenaPanel.tsx",
    );
    assert.doesNotMatch(
      askPanel,
      /resolveAthenaEstimateProspectTarget|listAthenaEstimateProspectsForMaster/,
    );
    const pricing = read(
      "services/estimate/estimatePricingMethodologyInstruction.ts",
    );
    assert.doesNotMatch(pricing, /resolveAthenaEstimateProspectTarget/);
  });

  it("POST strips ownership and Prospect snapshot/context client fields", () => {
    const route = read("app/api/licensee/estimate/route.ts");
    assert.match(route, /delete rest\.licensee_account_id/);
    assert.match(route, /delete rest\.prospectBusinessNameSnapshot/);
    assert.match(route, /delete rest\.prospectGenerationContext/);
    assert.match(route, /delete rest\.prospect_generation_context_json/);
    assert.match(route, /delete rest\.organizationNameSnapshot/);
  });

  it("no new migration introduced by L14", () => {
    assert.equal(
      existsSync(
        join(
          ROOT,
          "supabase/migrations/20260809000003_athena_estimate_prospect_target.sql",
        ),
      ),
      true,
    );
    assert.equal(
      existsSync(
        join(
          ROOT,
          "supabase/migrations/20260809000004_athena_estimate_prospect_auth.sql",
        ),
      ),
      false,
    );
  });
});
