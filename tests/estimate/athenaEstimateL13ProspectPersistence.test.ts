import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { mapAthenaEstimateRow } from "../../services/estimate/athenaEstimateMappers";
import {
  EstimateProspectGenerationContextValidationError,
  validateEstimateProspectGenerationContext,
} from "../../services/estimate/athenaEstimateProspectContext";
import {
  toPublicAthenaEstimateDetail,
  toPublicAthenaEstimateSummary,
} from "../../services/estimate/athenaEstimatePublic";
import { normalizeAthenaEstimateProspectTarget } from "../../services/estimate/athenaEstimateProspectTarget";
import {
  ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
  ATHENA_ESTIMATE_SCHEMA_VERSION,
  AthenaEstimateProspectTargetError,
  ESTIMATE_PROSPECT_CONTEXT_COMPOSED_TEXT_MAX_CHARS,
  ESTIMATE_PROSPECT_CONTEXT_SCHEMA_VERSION,
  type AthenaEstimatePackage,
  type EstimateProspectGenerationContextV1,
} from "../../services/estimate/athenaEstimateTypes";

const ROOT = process.cwd();
const L13_MIGRATION =
  "supabase/migrations/20260809000003_athena_estimate_prospect_target.sql";
const L1_MIGRATION =
  "supabase/migrations/20260809000001_create_athena_estimates.sql";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function validProspectContext(
  overrides: Partial<EstimateProspectGenerationContextV1> = {},
): EstimateProspectGenerationContextV1 {
  return {
    schemaVersion: ESTIMATE_PROSPECT_CONTEXT_SCHEMA_VERSION,
    prospectId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    businessName: "ABC Dental",
    capturedAt: "2026-08-09T12:00:00.000Z",
    composedText: "Bounded Prospect generation context for Estimate.",
    available: {
      profile: true,
      notesOrAdditionalContext: false,
      adsContent: true,
      websiteIntelligence: true,
      executiveIntelligence: false,
      strategicAssetBlueprint: false,
    },
    sources: {
      linkedDiscussionId: null,
      executiveVersionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    },
    ...overrides,
  };
}

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

describe("Athena Estimate L13 — Prospect persistence + domain foundation", () => {
  it("1. existing org-only Estimate rows map successfully with null Prospect fields", () => {
    const estimate = mapAthenaEstimateRow({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      licensee_account_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      organization_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      requested_by: null,
      organization_name_snapshot: "Org Snapshot",
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
    });
    assert.equal(estimate.prospect_id, null);
    assert.equal(estimate.prospect_business_name_snapshot, null);
    assert.equal(estimate.prospect_generation_context_json, null);
    assert.equal(estimate.organization_name_snapshot, "Org Snapshot");
    assert.equal(estimate.status, "Queued");
  });

  it("2. queued org-only creation path remains compatible (optional Prospect fields)", () => {
    const service = read("services/estimate/athenaEstimateService.ts");
    assert.match(service, /export async function createQueuedAthenaEstimate/);
    assert.match(service, /prospectId\?: string \| null/);
    assert.match(service, /prospectBusinessNameSnapshot\?: string \| null/);
    assert.match(service, /normalizeAthenaEstimateProspectTarget/);

    const orgOnly = normalizeAthenaEstimateProspectTarget({});
    assert.deepEqual(orgOnly, {
      prospectId: null,
      prospectBusinessNameSnapshot: null,
    });

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
    assert.match(createFn, /status: "Queued"/);
    assert.match(createFn, /prospect_id: prospectTarget\.prospectId/);
    assert.match(
      createFn,
      /prospect_generation_context_json: null/,
    );
  });

  it("3. Prospect target can be persisted with id + name snapshot", () => {
    const target = normalizeAthenaEstimateProspectTarget({
      prospectId: "  aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa  ",
      prospectBusinessNameSnapshot: "  ABC Dental  ",
    });
    assert.deepEqual(target, {
      prospectId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      prospectBusinessNameSnapshot: "ABC Dental",
    });

    const estimate = mapAthenaEstimateRow({
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      licensee_account_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      organization_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      requested_by: null,
      organization_name_snapshot: "Org Snapshot",
      prospect_id: target.prospectId,
      prospect_business_name_snapshot: target.prospectBusinessNameSnapshot,
      prospect_generation_context_json: null,
      request_json: { projectNeed: "Website rebuild" },
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
    });
    assert.equal(estimate.prospect_id, target.prospectId);
    assert.equal(estimate.prospect_business_name_snapshot, "ABC Dental");
  });

  it("4. Prospect id without snapshot is rejected", () => {
    assert.throws(
      () =>
        normalizeAthenaEstimateProspectTarget({
          prospectId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          prospectBusinessNameSnapshot: null,
        }),
      AthenaEstimateProspectTargetError,
    );
    assert.throws(
      () =>
        normalizeAthenaEstimateProspectTarget({
          prospectId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          prospectBusinessNameSnapshot: "   ",
        }),
      (error: unknown) =>
        error instanceof AthenaEstimateProspectTargetError &&
        error.code === "INVALID_PROSPECT_TARGET",
    );
  });

  it("5. frozen context validator accepts valid estimate_prospect_context_v1", () => {
    const ctx = validateEstimateProspectGenerationContext(
      validProspectContext(),
    );
    assert.equal(ctx.schemaVersion, "estimate_prospect_context_v1");
    assert.equal(ctx.businessName, "ABC Dental");
    assert.equal(ctx.available.profile, true);
    assert.equal(ctx.sources.linkedDiscussionId, null);
  });

  it("6. invalid schema version rejected", () => {
    assert.throws(
      () =>
        validateEstimateProspectGenerationContext(
          validProspectContext({
            schemaVersion: "estimate_prospect_context_v0" as "estimate_prospect_context_v1",
          }),
        ),
      EstimateProspectGenerationContextValidationError,
    );
  });

  it("7. composedText > 12,000 rejected", () => {
    assert.throws(
      () =>
        validateEstimateProspectGenerationContext(
          validProspectContext({
            composedText: "x".repeat(
              ESTIMATE_PROSPECT_CONTEXT_COMPOSED_TEXT_MAX_CHARS + 1,
            ),
          }),
        ),
      (error: unknown) =>
        error instanceof EstimateProspectGenerationContextValidationError &&
        error.details.some((d) => d.includes("12000")),
    );
  });

  it("8. malformed/empty identity rejected", () => {
    assert.throws(
      () =>
        validateEstimateProspectGenerationContext(
          validProspectContext({ prospectId: "   " }),
        ),
      EstimateProspectGenerationContextValidationError,
    );
    assert.throws(
      () =>
        validateEstimateProspectGenerationContext(
          validProspectContext({ businessName: "" }),
        ),
      EstimateProspectGenerationContextValidationError,
    );
    assert.throws(
      () =>
        validateEstimateProspectGenerationContext(
          validProspectContext({ capturedAt: "not-a-date" }),
        ),
      EstimateProspectGenerationContextValidationError,
    );
    assert.throws(
      () =>
        validateEstimateProspectGenerationContext({
          ...validProspectContext(),
          contactEmail: "leak@example.com",
        }),
      (error: unknown) =>
        error instanceof EstimateProspectGenerationContextValidationError &&
        error.details.some((d) => d.includes("contactEmail")),
    );
  });

  it("9. Ready completion accepts optional frozen Prospect context", () => {
    const jobService = read(
      "services/estimate/estimateGenerationJobs/estimateGenerationJobService.ts",
    );
    assert.match(
      jobService,
      /prospectGenerationContextJson\?: Record<string, unknown> \| null/,
    );
    assert.match(
      jobService,
      /p_prospect_generation_context_json:\s*input\.prospectGenerationContextJson \?\? null/,
    );

    const migration = read(L13_MIGRATION);
    assert.match(
      migration,
      /p_prospect_generation_context_json jsonb default null/,
    );
    assert.match(
      migration,
      /when p_prospect_generation_context_json is not null/,
    );
  });

  it("10. org-only Ready completion remains unchanged (null context default)", () => {
    const jobService = read(
      "services/estimate/estimateGenerationJobs/estimateGenerationJobService.ts",
    );
    assert.match(
      jobService,
      /p_prospect_generation_context_json:\s*input\.prospectGenerationContextJson \?\? null/,
    );

    const executor = read(
      "services/estimate/estimateGenerationJobs/estimateGenerationJobExecutor.ts",
    );
    // Org-only path still defaults frozen context to null via complete RPC arg.
    assert.match(
      executor,
      /prospectGenerationContextJson,\s*\n\s*\}\);/,
    );
    assert.match(executor, /frozenContext: null/);

    const migration = read(L13_MIGRATION);
    assert.match(
      migration,
      /Existing 3-arg callers remain valid via DEFAULT null/i,
    );
  });

  it("11. frozen context is protected by Ready immutability", () => {
    const migration = read(L13_MIGRATION);
    const completeStart = migration.indexOf(
      "create or replace function complete_athena_estimate_generation_job",
    );
    assert.ok(completeStart >= 0);
    const completeBody = migration.slice(
      completeStart,
      migration.indexOf(
        "revoke all on function complete_athena_estimate_generation_job",
      ),
    );
    assert.match(
      completeBody,
      /when status = 'Ready' and package_json is not null\s+then prospect_generation_context_json/,
    );
    assert.match(
      completeBody,
      /Ready packages and frozen Prospect generation context are immutable/i,
    );

    const types = read("services/estimate/athenaEstimateTypes.ts");
    assert.match(
      types,
      /package\/request\/Prospect generation context must never be/,
    );
  });

  it("12. migration contains ON DELETE SET NULL for prospect_id", () => {
    assert.equal(existsSync(join(ROOT, L13_MIGRATION)), true);
    const migration = read(L13_MIGRATION);
    assert.match(
      migration,
      /prospect_id uuid null\s+references prospects\(id\) on delete set null/i,
    );
  });

  it("13. migration permits null id + retained snapshot/context after deletion", () => {
    const migration = read(L13_MIGRATION);
    assert.match(migration, /athena_estimates_prospect_target_chk/);
    assert.match(
      migration,
      /prospect_id is null\s+or\s+\(\s*prospect_business_name_snapshot is not null/i,
    );
    assert.match(
      migration,
      /After Prospect deletion: prospect_id becomes NULL while snapshot/i,
    );

    // Post-delete row shape maps successfully.
    const ctx = validProspectContext();
    const afterDelete = mapAthenaEstimateRow({
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      licensee_account_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      organization_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      requested_by: null,
      organization_name_snapshot: "Org Snapshot",
      prospect_id: null,
      prospect_business_name_snapshot: "ABC Dental",
      prospect_generation_context_json: ctx,
      request_json: { projectNeed: "Website rebuild" },
      status: "Ready",
      generation_stage: "completed",
      package_json: samplePackage(),
      error_code: null,
      error_message: null,
      currency_code: "USD",
      geography_label: "United States",
      currency_resolution: "derived",
      instruction_config_key: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
      instruction_revision_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      instruction_configured: true,
      created_at: "2026-08-09T12:00:00.000Z",
      updated_at: "2026-08-09T12:00:00.000Z",
    });
    assert.equal(afterDelete.prospect_id, null);
    assert.equal(afterDelete.prospect_business_name_snapshot, "ABC Dental");
    assert.equal(
      afterDelete.prospect_generation_context_json?.businessName,
      "ABC Dental",
    );
  });

  it("14. existing V26 Estimate persistence/contracts remain; public DTOs omit frozen context", () => {
    const l1 = read(L1_MIGRATION);
    assert.match(l1, /create table if not exists athena_estimates/);
    assert.match(l1, /organization_name_snapshot text not null/);
    assert.doesNotMatch(l1, /prospect_id/);

    const packageValidation = read(
      "services/estimate/athenaEstimateValidation.ts",
    );
    assert.doesNotMatch(
      packageValidation,
      /EstimateProspectGenerationContext|prospect_generation_context/,
    );

    const publicApi = read("services/estimate/athenaEstimatePublic.ts");
    assert.doesNotMatch(publicApi, /prospect_generation_context|prospectGenerationContext/);

    const ready = mapAthenaEstimateRow({
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      licensee_account_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      organization_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      requested_by: null,
      organization_name_snapshot: "Org Snapshot",
      prospect_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      prospect_business_name_snapshot: "ABC Dental",
      prospect_generation_context_json: validProspectContext(),
      request_json: { projectNeed: "Website rebuild" },
      status: "Ready",
      generation_stage: "completed",
      package_json: samplePackage(),
      error_code: null,
      error_message: null,
      currency_code: "USD",
      geography_label: "United States",
      currency_resolution: "derived",
      instruction_config_key: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
      instruction_revision_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      instruction_configured: true,
      created_at: "2026-08-09T12:00:00.000Z",
      updated_at: "2026-08-09T12:00:00.000Z",
    });
    const summary = toPublicAthenaEstimateSummary(ready, true);
    const detail = toPublicAthenaEstimateDetail(ready, true);
    assert.equal(
      "prospectGenerationContext" in (summary as unknown as Record<string, unknown>),
      false,
    );
    assert.equal(
      "prospect_generation_context_json" in
        (detail as unknown as Record<string, unknown>),
      false,
    );
    assert.equal(detail.package?.schemaVersion, "estimate_v1");
    assert.equal(detail.organizationNameSnapshot, "Org Snapshot");
  });

  it("H. non-interference: Quote/SEO/Ads/Ask Athena/worker/request_json/package untouched", () => {
    const migration = read(L13_MIGRATION);
    assert.doesNotMatch(migration, /alter table seo_reports/i);
    assert.doesNotMatch(migration, /alter table ad_campaigns/i);
    assert.doesNotMatch(migration, /estimate_pricing_methodology/);
    assert.doesNotMatch(migration, /athena_estimate_messages/);
    assert.doesNotMatch(migration, /alter\s+column\s+request_json/i);
    assert.doesNotMatch(migration, /add column.*request_json/i);
    assert.match(migration, /without altering estimate_v1/i);

    const worker = read("workers/athenaWorker.ts");
    assert.doesNotMatch(worker, /prospect_generation_context/);
    assert.doesNotMatch(worker, /athena_estimate_generation_jobs/);

    const askPanel = read(
      "components/licensee/estimate/EstimateAskAthenaPanel.tsx",
    );
    assert.doesNotMatch(askPanel, /prospect_generation_context|EstimateProspectGenerationContext/);

    const quotePage = read("app/licensee/quote/page.tsx");
    assert.doesNotMatch(quotePage, /athena_estimates|prospect_generation_context/);

    const orchestration = read(
      "services/estimate/athenaEstimateOrchestration.ts",
    );
    // Create/regenerate persist Prospect identity only; L15 composition is in the executor.
    assert.doesNotMatch(
      orchestration,
      /validateEstimateProspectGenerationContext/,
    );
    assert.doesNotMatch(
      orchestration,
      /composeEstimateProspectGenerationContext/,
    );
    assert.match(
      orchestration,
      /freezes bounded/,
    );

    const postRoute = read("app/api/licensee/estimate/route.ts");
    assert.match(postRoute, /prospectId/);
    assert.match(postRoute, /delete rest\.prospectBusinessNameSnapshot/);
  });

  it("migration is present and not applied by this suite", () => {
    assert.equal(existsSync(join(ROOT, L13_MIGRATION)), true);
    const service = read("services/estimate/athenaEstimateService.ts");
    assert.doesNotMatch(service, /supabase db push/);
    assert.doesNotMatch(service, /execSql|runMigration/i);
  });
});
