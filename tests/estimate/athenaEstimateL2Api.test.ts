import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { mapAthenaEstimateRow } from "../../services/estimate/athenaEstimateMappers";
import {
  toPublicAthenaEstimateDetail,
  toPublicAthenaEstimateSummary,
} from "../../services/estimate/athenaEstimatePublic";
import type { AthenaEstimatePackage } from "../../services/estimate/athenaEstimateTypes";
import {
  ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
  ATHENA_ESTIMATE_SCHEMA_VERSION,
} from "../../services/estimate/athenaEstimateTypes";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function samplePackage(): AthenaEstimatePackage {
  return {
    schemaVersion: ATHENA_ESTIMATE_SCHEMA_VERSION,
    recommendedClientPrice: { amount: 12000, currencyCode: "USD" },
    recommendedPriceRange: {
      low: { amount: 9000, currencyCode: "USD" },
      high: { amount: 15000, currencyCode: "USD" },
    },
    scopeInterpretation: "A bounded website redesign with CMS migration.",
    pricingRationale: "Effort aligns with mid-market delivery and review cycles.",
    keyPriceDrivers: ["Content migration volume", "Design system complexity"],
    suggestedClientPositioning:
      "Position as a fixed-scope delivery with clear acceptance criteria.",
    risksAndAssumptions: [
      "Assumes existing brand assets are available",
      "Assumes one primary decision-maker",
    ],
    geographyLabel: "United States",
    currencyResolution: "derived",
    guidanceDisclaimer:
      "Guidance only — not a formal quote or competitive market research.",
    instructionProvenance: {
      configKey: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
      revisionId: null,
      configured: false,
    },
    marketResearchClaimed: false,
    competitorQuotesFabricated: false,
  };
}

describe("Athena Estimate L2 Master API contracts", () => {
  it("1/19/20/21. create/list require genuine Master via getUser + requireLicenseeMasterAccount; marker cookie is not authority", () => {
    const route = read("app/api/licensee/estimate/route.ts");
    assert.match(route, /createSupabaseServerClient/);
    assert.match(route, /auth\.getUser/);
    assert.match(route, /UNAUTHORIZED/);
    assert.match(route, /401/);
    assert.match(route, /LicenseeAccessError/);
    assert.match(route, /403/);
    assert.match(route, /listAthenaEstimatesForMaster/);
    assert.match(route, /createAthenaEstimateWithJob/);
    assert.doesNotMatch(route, /LICENSEE_MASTER_MARKER/);
    assert.doesNotMatch(route, /master-marker/);
    assert.doesNotMatch(route, /cookies\(\)\.get/);

    const orchestration = read(
      "services/estimate/athenaEstimateOrchestration.ts",
    );
    assert.match(orchestration, /requireLicenseeMasterAccount/);
    assert.match(orchestration, /assertLicenseeOwnsSubAccount/);
  });

  it("2/3. create rejects unrelated org via assertLicenseeOwnsSubAccount (Master A cannot use Master B sub-account)", () => {
    const orchestration = read(
      "services/estimate/athenaEstimateOrchestration.ts",
    );
    assert.match(
      orchestration,
      /const authorized = await assertLicenseeOwnsSubAccount\(\{/,
    );
    assert.match(orchestration, /masterUserId: input\.masterUserId/);
    assert.match(orchestration, /organizationId/);
    // Must not authorize from organizationId alone.
    assert.doesNotMatch(
      orchestration,
      /from\("organizations"\)[\s\S]*assertLicenseeOwnsSubAccount/,
    );
  });

  it("4/5. POST does not trust client licensee_account_id or requested_by; server derives both", () => {
    const route = read("app/api/licensee/estimate/route.ts");
    assert.match(route, /delete rest\.licensee_account_id/);
    assert.match(route, /delete rest\.licenseeAccountId/);
    assert.match(route, /delete rest\.requested_by/);
    assert.match(route, /delete rest\.requestedBy/);
    assert.match(route, /masterUserId: user\.id/);

    const orchestration = read(
      "services/estimate/athenaEstimateOrchestration.ts",
    );
    assert.match(orchestration, /requestedBy: input\.masterUserId/);
    assert.match(orchestration, /licenseeAccountId/);
    assert.match(
      orchestration,
      /authorized\.licenseeAccountId/,
    );

    const service = read("services/estimate/athenaEstimateService.ts");
    assert.match(service, /licensee_account_id: input\.licenseeAccountId/);
    assert.match(service, /requested_by: input\.requestedBy/);
  });

  it("6. valid create produces Queued Estimate + generation job + snapshot + normalized request", () => {
    const service = read("services/estimate/athenaEstimateService.ts");
    assert.match(service, /status: "Queued"/);
    assert.match(service, /organization_name_snapshot/);
    assert.match(service, /request_json: input\.request/);
    assert.match(service, /loadOrganizationNameSnapshot/);

    const jobService = read(
      "services/estimate/estimateGenerationJobs/estimateGenerationJobService.ts",
    );
    assert.match(jobService, /status: "queued"/);
    assert.match(jobService, /generation_stage: "assembling_context"/);
    assert.match(jobService, /estimate_id: input\.estimateId/);

    const orchestration = read(
      "services/estimate/athenaEstimateOrchestration.ts",
    );
    assert.match(orchestration, /normalizeEstimateRequest/);
    assert.match(orchestration, /createQueuedAthenaEstimate/);
    assert.match(orchestration, /enqueueAthenaEstimateGenerationJob/);
    assert.match(orchestration, /loadOrganizationNameSnapshot/);
  });

  it("7. create/enqueue partial-failure safety uses markAthenaEstimateEnqueueFailed compensation", () => {
    const orchestration = read(
      "services/estimate/athenaEstimateOrchestration.ts",
    );
    assert.match(orchestration, /markAthenaEstimateEnqueueFailed/);
    assert.match(orchestration, /ENQUEUE_FAILED/);
    assert.match(orchestration, /catch \(error\)/);
    assert.match(orchestration, /throw error/);

    const service = read("services/estimate/athenaEstimateService.ts");
    assert.match(service, /status: "Processing Failed"/);
    assert.match(service, /generation_stage: "failed"/);
    // Must not invent a broad transaction framework / delete-on-failure.
    assert.doesNotMatch(orchestration, /\.rpc\(/);
    assert.doesNotMatch(orchestration, /begin\s+transaction/i);
    assert.doesNotMatch(service, /\.delete\(\)/);
  });

  it("8/9/10. GET list/detail constrained to Master licensee_account_id; cross-Master as not found", () => {
    const service = read("services/estimate/athenaEstimateService.ts");
    assert.match(
      service,
      /\.eq\("licensee_account_id", licenseeAccountId\)/,
    );
    assert.match(
      service,
      /\.eq\("licensee_account_id", input\.licenseeAccountId\)|\.eq\("licensee_account_id", licenseeAccountId\)/,
    );

    const detail = read("app/api/licensee/estimate/[id]/route.ts");
    assert.match(detail, /getAthenaEstimateDetailForMaster/);
    assert.match(detail, /AthenaEstimateOrchestrationNotFoundError/);
    assert.match(detail, /NOT_FOUND/);
    assert.match(detail, /404/);

    const orchestration = read(
      "services/estimate/athenaEstimateOrchestration.ts",
    );
    assert.match(
      orchestration,
      /getAthenaEstimateByIdForLicensee\(\s*input\.estimateId,\s*masterAccount\.id/,
    );
    assert.match(
      orchestration,
      /listAthenaEstimatesForLicensee\(masterAccount\.id\)/,
    );
  });

  it("11/12. disconnected historical Ready remains readable; relationshipConnected computed live", () => {
    const orchestration = read(
      "services/estimate/athenaEstimateOrchestration.ts",
    );
    // Historical get/list do NOT call assertLicenseeOwnsSubAccount.
    const getStart = orchestration.indexOf(
      "export async function getAthenaEstimateDetailForMaster",
    );
    const getEnd = orchestration.indexOf(
      "return toPublicAthenaEstimateDetail(estimate, relationshipConnected);",
      getStart,
    );
    const getFn = orchestration.slice(getStart, getEnd);
    assert.doesNotMatch(getFn, /assertLicenseeOwnsSubAccount/);
    assert.match(getFn, /getEstimateRelationshipConnected/);

    const listStart = orchestration.indexOf(
      "export async function listAthenaEstimatesForMaster",
    );
    const listEnd = orchestration.indexOf(
      "export async function getAthenaEstimateDetailForMaster",
    );
    const listFn = orchestration.slice(listStart, listEnd);
    assert.doesNotMatch(listFn, /assertLicenseeOwnsSubAccount/);
    assert.match(listFn, /getEstimateRelationshipConnectedMap/);

    const ready = mapAthenaEstimateRow({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      licensee_account_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      organization_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      requested_by: null,
      organization_name_snapshot: "Acme Frozen Name",
      request_json: { projectNeed: "Need a new site" },
      status: "Ready",
      generation_stage: "completed",
      package_json: samplePackage(),
      error_code: null,
      error_message: null,
      currency_code: "USD",
      geography_label: "United States",
      currency_resolution: "derived",
      instruction_config_key: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
      instruction_revision_id: null,
      instruction_configured: false,
      created_at: "2026-08-09T00:00:00.000Z",
      updated_at: "2026-08-09T00:00:00.000Z",
    });

    const disconnected = toPublicAthenaEstimateDetail(ready, false);
    assert.equal(disconnected.relationshipConnected, false);
    assert.equal(disconnected.organizationNameSnapshot, "Acme Frozen Name");
    assert.ok(disconnected.package);
    assert.equal(disconnected.status, "Ready");

    const connected = toPublicAthenaEstimateSummary(ready, true);
    assert.equal(connected.relationshipConnected, true);
  });

  it("13. list/get do not load tenant intelligence", () => {
    const orchestration = read(
      "services/estimate/athenaEstimateOrchestration.ts",
    );
    const service = read("services/estimate/athenaEstimateService.ts");
    for (const source of [orchestration, service]) {
      assert.doesNotMatch(source, /brainContext|loadBrain|athena_identity/i);
      assert.doesNotMatch(source, /deepWebsite|seoContextComposer|adsContext/i);
      assert.doesNotMatch(source, /personaConversation|prospectConversation/i);
    }
    // relationship lookup only touches licensee_sub_accounts + estimates.
    assert.match(service, /from\("licensee_sub_accounts"\)/);
    assert.match(service, /from\("athena_estimates"\)/);
    assert.match(service, /from\("organizations"\)/);
  });

  it("14/15. regenerate creates NEW Estimate row/job and leaves original untouched", () => {
    const orchestration = read(
      "services/estimate/athenaEstimateOrchestration.ts",
    );
    assert.match(
      orchestration,
      /Regenerate creates a NEW Estimate row/,
    );
    assert.match(orchestration, /createAthenaEstimateWithJob/);
    assert.match(orchestration, /source\.request_json/);
    assert.match(orchestration, /regeneratedFrom: source\.id/);
    // Must not update/requeue the source row.
    assert.doesNotMatch(orchestration, /\.update\(/);
    assert.doesNotMatch(orchestration, /status: "Queued"/);

    const route = read(
      "app/api/licensee/estimate/[id]/regenerate/route.ts",
    );
    assert.match(route, /regenerateAthenaEstimate/);
    assert.match(route, /regeneratedFrom/);
    assert.match(route, /202/);
  });

  it("16/17. regenerate requires current sub-account relationship; removed relationship → 403", () => {
    const orchestration = read(
      "services/estimate/athenaEstimateOrchestration.ts",
    );
    // regenerate → createAthenaEstimateWithJob → assertLicenseeOwnsSubAccount
    assert.match(orchestration, /export async function regenerateAthenaEstimate/);
    const regen = orchestration.slice(
      orchestration.indexOf("export async function regenerateAthenaEstimate"),
    );
    assert.match(regen, /createAthenaEstimateWithJob/);

    const create = orchestration.slice(
      orchestration.indexOf("export async function createAthenaEstimateWithJob"),
      orchestration.indexOf("export async function listAthenaEstimatesForMaster"),
    );
    assert.match(create, /assertLicenseeOwnsSubAccount/);

    const route = read(
      "app/api/licensee/estimate/[id]/regenerate/route.ts",
    );
    assert.match(route, /LicenseeAccessError/);
    assert.match(route, /403/);
  });

  it("18. malformed request rejected via L1 normalizeEstimateRequest", () => {
    const route = read("app/api/licensee/estimate/route.ts");
    assert.match(route, /normalizeEstimateRequest/);
    assert.match(route, /EstimateRequestValidationError/);
    assert.match(route, /INVALID_BODY/);
    assert.match(route, /organizationId is required/);
    assert.match(route, /organizationId must be a valid UUID/);
    assert.match(route, /400/);
  });

  it("22. POST does not invoke OpenRouter / generation / context composition", () => {
    const route = read("app/api/licensee/estimate/route.ts");
    const orchestration = read(
      "services/estimate/athenaEstimateOrchestration.ts",
    );
    const jobService = read(
      "services/estimate/estimateGenerationJobs/estimateGenerationJobService.ts",
    );
    for (const source of [route, orchestration, jobService]) {
      assert.doesNotMatch(source, /openrouter|OpenRouter/i);
      assert.doesNotMatch(source, /composeEstimate|estimateContext/i);
      assert.doesNotMatch(source, /claim_athena_estimate_generation_job/);
      assert.doesNotMatch(source, /complete_athena_estimate_generation_job/);
    }
  });

  it("23. middleware permits /api/licensee/** without broad changes for Estimate", () => {
    const middleware = read("lib/supabase/middleware.ts");
    assert.match(middleware, /path\.startsWith\("\/api\/licensee\/"\)/);
    // Estimate routes should not require special-casing in middleware.
    assert.doesNotMatch(middleware, /estimate/i);
    assert.equal(existsSync(join(ROOT, "app/api/licensee/estimate/route.ts")), true);
    assert.equal(
      existsSync(join(ROOT, "app/api/licensee/estimate/[id]/route.ts")),
      true,
    );
    assert.equal(
      existsSync(
        join(ROOT, "app/api/licensee/estimate/[id]/regenerate/route.ts"),
      ),
      true,
    );
  });

  it("job service exposes enqueue/read and L5 lease wrappers for worker claim path", () => {
    const jobService = read(
      "services/estimate/estimateGenerationJobs/estimateGenerationJobService.ts",
    );
    assert.match(jobService, /enqueueAthenaEstimateGenerationJob/);
    assert.match(jobService, /getActiveEstimateGenerationJobForEstimate/);
    assert.match(jobService, /getEstimateGenerationJobById/);
    assert.match(jobService, /claimNextEstimateGenerationJob/);
    assert.match(jobService, /heartbeatEstimateGenerationJob/);
    assert.match(jobService, /completeEstimateGenerationJobWithClaim/);
    assert.match(jobService, /failEstimateGenerationJobWithClaim/);
    assert.match(jobService, /ESTIMATE_GENERATION_JOB_RPCS\.(claim|heartbeat|complete|fail)/);
  });

  it("no tenant /api/estimate routes; Master APIs only under /api/licensee/estimate", () => {
    assert.equal(existsSync(join(ROOT, "app/api/estimate")), false);
    assert.equal(existsSync(join(ROOT, "app/api/estimates")), false);
    // L7 adds Master UI under /licensee/estimate — never tenant /estimate.
    assert.equal(existsSync(join(ROOT, "app/estimate")), false);
  });

  it("Queued/Failed public shapes hide package; Ready may expose package", () => {
    const queued = mapAthenaEstimateRow({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      licensee_account_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      organization_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      requested_by: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      organization_name_snapshot: "Org",
      request_json: { projectNeed: "Need a new site" },
      status: "Queued",
      generation_stage: null,
      package_json: samplePackage(),
      error_code: null,
      error_message: null,
      currency_code: null,
      geography_label: null,
      currency_resolution: null,
      instruction_config_key: null,
      instruction_revision_id: null,
      instruction_configured: false,
      created_at: "2026-08-09T00:00:00.000Z",
      updated_at: "2026-08-09T00:00:00.000Z",
    });
    assert.equal(queued.package_json, null);
    assert.equal(toPublicAthenaEstimateDetail(queued, true).package, null);

    const failedRow = mapAthenaEstimateRow({
      id: queued.id,
      licensee_account_id: queued.licensee_account_id,
      organization_id: queued.organization_id,
      requested_by: queued.requested_by,
      organization_name_snapshot: queued.organization_name_snapshot,
      request_json: queued.request_json,
      status: "Processing Failed",
      generation_stage: "failed",
      package_json: samplePackage(),
      error_code: "ENQUEUE_FAILED",
      error_message: "Failed to enqueue Estimate generation job.",
      currency_code: null,
      geography_label: null,
      currency_resolution: null,
      instruction_config_key: null,
      instruction_revision_id: null,
      instruction_configured: false,
      created_at: queued.created_at,
      updated_at: queued.updated_at,
    });
    assert.equal(failedRow.package_json, null);
    assert.equal(toPublicAthenaEstimateDetail(failedRow, false).package, null);
  });

  it("migration remains present and unapplied by this suite", () => {
    const migration =
      "supabase/migrations/20260809000001_create_athena_estimates.sql";
    assert.equal(existsSync(join(ROOT, migration)), true);
    // Suite is source-contract only — no DB migration runners.
    const orchestration = read(
      "services/estimate/athenaEstimateOrchestration.ts",
    );
    const service = read("services/estimate/athenaEstimateService.ts");
    for (const source of [orchestration, service]) {
      assert.doesNotMatch(source, /supabase db push/);
      assert.doesNotMatch(source, /execSql|runMigration/i);
    }
  });
});
