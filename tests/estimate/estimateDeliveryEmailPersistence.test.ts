/**
 * EST-EMAIL-1C — delivery email persistence and authenticated detail mapping.
 * Source and in-memory behavior only. Does not apply SQL or call OpenRouter.
 */
import "../licensee/licenseeAuthTestEnv";

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { mapAthenaEstimateRow } from "../../services/estimate/athenaEstimateMappers";
import {
  toPublicAthenaEstimateDetail,
  toPublicAthenaEstimateSummary,
} from "../../services/estimate/athenaEstimatePublic";
import { persistGeneratedEstimateDeliveryEmailIfAbsent } from "../../services/estimate/athenaEstimateService";
import {
  ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
  ATHENA_ESTIMATE_SCHEMA_VERSION,
  type AthenaEstimate,
  type AthenaEstimatePackage,
} from "../../services/estimate/athenaEstimateTypes";
import {
  buildGeneratedEstimateDeliveryEmailRecord,
  type EstimateDeliveryEmailV1,
} from "../../services/estimate/estimateDeliveryEmail";
import { executeClaimedEstimateGenerationJob } from "../../services/estimate/estimateGenerationJobs/estimateGenerationJobExecutor";
import type { AthenaEstimateGenerationJob } from "../../services/estimate/estimateGenerationJobs/estimateGenerationJobTypes";

const ROOT = process.cwd();
const MIGRATION =
  "supabase/migrations/20261010000002_add_athena_estimate_delivery_email.sql";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function samplePackage(): AthenaEstimatePackage {
  return {
    schemaVersion: ATHENA_ESTIMATE_SCHEMA_VERSION,
    recommendedClientPrice: { amount: 18000, currencyCode: "USD" },
    recommendedPriceRange: {
      low: { amount: 14000, currencyCode: "USD" },
      high: { amount: 24000, currencyCode: "USD" },
    },
    scopeInterpretation:
      "Full marketing site rebuild with CMS migration and analytics setup.",
    pricingRationale:
      "Effort aligns with mid-market delivery and review cycles.",
    keyPriceDrivers: ["CMS migration volume", "Design system complexity"],
    suggestedClientPositioning:
      "Frame as a fixed-scope launch with clear acceptance criteria.",
    risksAndAssumptions: ["Assumes brand assets are available"],
    geographyLabel: "United States",
    currencyResolution: "derived",
    guidanceDisclaimer:
      "Guidance only — not a formal quote or competitive market research.",
    instructionProvenance: {
      configKey: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
      revisionId: null,
      configured: true,
    },
    marketResearchClaimed: false,
    competitorQuotesFabricated: false,
  };
}

function email(
  overrides: Partial<EstimateDeliveryEmailV1> = {},
): EstimateDeliveryEmailV1 {
  return {
    schemaVersion: "estimate_delivery_email_v1",
    language: "en",
    subject: "Website rebuild proposal for Northwind",
    body: "The recommended investment is 18,000 USD.",
    ...overrides,
  };
}

function baseRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    licensee_account_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    organization_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    requested_by: null,
    organization_name_snapshot: "Northwind",
    prospect_id: null,
    prospect_business_name_snapshot: null,
    prospect_generation_context_json: null,
    request_json: { projectNeed: "Rebuild the marketing site" },
    status: "Ready",
    generation_stage: "completed",
    package_json: samplePackage(),
    delivery_email_json: null,
    error_code: null,
    error_message: null,
    currency_code: "USD",
    geography_label: "United States",
    currency_resolution: "derived",
    instruction_config_key: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
    instruction_revision_id: null,
    instruction_configured: true,
    created_at: "2026-08-09T00:00:00.000Z",
    updated_at: "2026-08-09T00:00:00.000Z",
    ...overrides,
  };
}

type MemoryRow = {
  id: string;
  licensee_account_id: string;
  status: string;
  package_json: unknown;
  request_json: unknown;
  prospect_generation_context_json: unknown;
  delivery_email_json: unknown;
};

function memoryDb(row: MemoryRow) {
  let fromCalls = 0;
  return {
    fromCalls: () => fromCalls,
    from(table: string) {
      fromCalls += 1;
      if (table !== "athena_estimates") {
        throw new Error(`unexpected table ${table}`);
      }
      return {
        update(payload: Record<string, unknown>) {
          const filters: Array<(current: MemoryRow) => boolean> = [];
          const builder = {
            eq(column: string, value: unknown) {
              filters.push(
                (current) =>
                  (current as unknown as Record<string, unknown>)[column] ===
                  value,
              );
              return builder;
            },
            is(column: string, value: unknown) {
              filters.push((current) => {
                const actual = (current as unknown as Record<string, unknown>)[
                  column
                ];
                return value == null ? actual == null : actual === value;
              });
              return builder;
            },
            then(
              resolve: (value: { error: { message: string } | null }) => void,
              reject?: (reason: unknown) => void,
            ) {
              try {
                const keys = Object.keys(payload);
                if (keys.length !== 1 || keys[0] !== "delivery_email_json") {
                  resolve({
                    error: {
                      message: `unexpected update keys: ${keys.join(",")}`,
                    },
                  });
                  return;
                }
                if (filters.every((filter) => filter(row))) {
                  row.delivery_email_json = payload.delivery_email_json;
                }
                resolve({ error: null });
              } catch (error) {
                if (reject) reject(error);
                else throw error;
              }
            },
          };
          return builder;
        },
      };
    },
  };
}

function queuedEstimate(
  overrides: Partial<AthenaEstimate> = {},
): AthenaEstimate {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    licensee_account_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    organization_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    requested_by: "master-1",
    organization_name_snapshot: "Northwind",
    prospect_id: null,
    prospect_business_name_snapshot: null,
    prospect_generation_context_json: null,
    request_json: { projectNeed: "Rebuild the marketing site" },
    status: "Queued",
    generation_stage: "assembling_context",
    package_json: null,
    delivery_email_json: null,
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
    ...overrides,
  };
}

function claimedJob(
  estimate: AthenaEstimate,
): AthenaEstimateGenerationJob {
  return {
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    licensee_account_id: estimate.licensee_account_id,
    organization_id: estimate.organization_id,
    estimate_id: estimate.id,
    status: "processing",
    generation_stage: "asserting_authorization",
    attempt_count: 1,
    max_attempts: 3,
    claimed_by: "worker-1",
    claim_token: "claim-token",
    claimed_at: "2026-08-09T00:00:00.000Z",
    claim_expires_at: "2026-08-09T01:00:00.000Z",
    heartbeat_at: "2026-08-09T00:00:00.000Z",
    next_attempt_at: null,
    error_code: null,
    error_message: null,
    error_metadata: null,
    requested_by: estimate.requested_by,
    started_at: "2026-08-09T00:00:00.000Z",
    completed_at: null,
    created_at: "2026-08-09T00:00:00.000Z",
    updated_at: "2026-08-09T00:00:00.000Z",
  };
}

function jobOps() {
  const completes: Array<Record<string, unknown>> = [];
  const fails: Array<Record<string, unknown>> = [];
  return {
    completes,
    fails,
    ops: {
      heartbeat: async () => claimedJob(queuedEstimate()),
      complete: async (input: { packageJson: Record<string, unknown> }) => {
        completes.push(input.packageJson);
        return claimedJob(queuedEstimate({ status: "Ready" }));
      },
      fail: async (input: Record<string, unknown>) => {
        fails.push(input);
        return claimedJob(queuedEstimate());
      },
    },
  };
}

describe("EST-EMAIL-1C delivery email persistence", () => {
  it("adds a nullable delivery_email_json column and does not backfill or change the completion RPC", () => {
    assert.equal(existsSync(join(ROOT, MIGRATION)), true);
    assert.equal(
      existsSync(
        join(
          ROOT,
          "supabase/migrations/20261010000001_add_athena_estimate_delivery_email.sql",
        ),
      ),
      false,
    );
    const migration = read(MIGRATION);
    assert.match(
      migration,
      /add column if not exists delivery_email_json jsonb null/i,
    );
    assert.doesNotMatch(migration, /update\s+athena_estimates/i);
    assert.doesNotMatch(migration, /package_json/);
    assert.doesNotMatch(migration, /complete_athena_estimate_generation_job/);
    assert.doesNotMatch(migration, /create or replace function/i);

    const completion = read(
      "supabase/migrations/20260809000003_athena_estimate_prospect_target.sql",
    );
    assert.match(
      completion,
      /create or replace function complete_athena_estimate_generation_job\(\s*p_job_id uuid,\s*p_claim_token uuid,\s*p_package_json jsonb,\s*p_prospect_generation_context_json jsonb default null/i,
    );

    const jobService = read(
      "services/estimate/estimateGenerationJobs/estimateGenerationJobService.ts",
    );
    assert.match(jobService, /p_job_id: input\.jobId/);
    assert.match(jobService, /p_claim_token: input\.claimToken/);
    assert.match(jobService, /p_package_json: input\.packageJson/);
    assert.match(
      jobService,
      /p_prospect_generation_context_json:\s*input\.prospectGenerationContextJson \?\? null/,
    );
    assert.doesNotMatch(jobService, /delivery_email_json|deliveryEmail/);
  });

  it("persists the generated email after Ready and leaves package_json unchanged", async () => {
    const row = memoryRow();
    const packageBefore = structuredClone(row.package_json);
    const requestBefore = structuredClone(row.request_json);
    const prospectBefore = row.prospect_generation_context_json;
    const db = memoryDb(row);

    await persistGeneratedEstimateDeliveryEmailIfAbsent(
      {
        estimateId: row.id,
        licenseeAccountId: row.licensee_account_id,
        deliveryEmail: email(),
      },
      { db },
    );

    assert.deepEqual(row.delivery_email_json, {
      schemaVersion: "estimate_delivery_email_v1",
      language: "en",
      generated: {
        subject: "Website rebuild proposal for Northwind",
        body: "The recommended investment is 18,000 USD.",
      },
      edited: null,
      editedAt: null,
    });
    assert.deepEqual(row.package_json, packageBefore);
    assert.deepEqual(row.request_json, requestBefore);
    assert.equal(row.prospect_generation_context_json, prospectBefore);
    assert.equal(row.status, "Ready");
  });

  it("leaves the column null when deliveryEmail is null and still allows Ready", async () => {
    const row = memoryRow();
    const db = memoryDb(row);
    await persistGeneratedEstimateDeliveryEmailIfAbsent(
      {
        estimateId: row.id,
        licenseeAccountId: row.licensee_account_id,
        deliveryEmail: null,
      },
      { db },
    );
    assert.equal(row.delivery_email_json, null);
    assert.equal(db.fromCalls(), 0);
    assert.equal(row.status, "Ready");
  });

  it("writes only while delivery_email_json is null, including a repeated persist", async () => {
    const row = memoryRow();
    const db = memoryDb(row);
    const first = email();
    const second = email({
      subject: "Replacement subject that must not win",
      body: "Replacement body 18,000 USD.",
    });

    await persistGeneratedEstimateDeliveryEmailIfAbsent(
      {
        estimateId: row.id,
        licenseeAccountId: row.licensee_account_id,
        deliveryEmail: first,
      },
      { db },
    );
    const stored = structuredClone(row.delivery_email_json);
    await persistGeneratedEstimateDeliveryEmailIfAbsent(
      {
        estimateId: row.id,
        licenseeAccountId: row.licensee_account_id,
        deliveryEmail: second,
      },
      { db },
    );

    assert.deepEqual(row.delivery_email_json, stored);
    assert.equal(
      (row.delivery_email_json as { generated: { subject: string } }).generated
        .subject,
      first.subject,
    );

    const otherLicensee = memoryRow();
    const otherDb = memoryDb(otherLicensee);
    await persistGeneratedEstimateDeliveryEmailIfAbsent(
      {
        estimateId: otherLicensee.id,
        licenseeAccountId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        deliveryEmail: first,
      },
      { db: otherDb },
    );
    assert.equal(otherLicensee.delivery_email_json, null);

    const processing = memoryRow();
    processing.status = "Processing";
    const processingDb = memoryDb(processing);
    await persistGeneratedEstimateDeliveryEmailIfAbsent(
      {
        estimateId: processing.id,
        licenseeAccountId: processing.licensee_account_id,
        deliveryEmail: first,
      },
      { db: processingDb },
    );
    assert.equal(processing.delivery_email_json, null);
  });

  it("does not throw when the email write fails", async () => {
    const failingDb = {
      from() {
        return {
          update() {
            const builder = {
              eq() {
                return builder;
              },
              is() {
                return builder;
              },
              then(
                _resolve: (value: unknown) => void,
                reject?: (reason: unknown) => void,
              ) {
                reject?.(new Error("delivery email update failed"));
              },
            };
            return builder;
          },
        };
      },
    };

    await assert.doesNotReject(() =>
      persistGeneratedEstimateDeliveryEmailIfAbsent(
        {
          estimateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          licenseeAccountId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          deliveryEmail: email(),
        },
        { db: failingDb },
      ),
    );
  });

  it("keeps a Ready package when the email is null, missing, or malformed", () => {
    const historical = mapAthenaEstimateRow(baseRow());
    const historicalDetail = toPublicAthenaEstimateDetail(historical, true);
    assert.equal(historical.package_json?.schemaVersion, "estimate_v1");
    assert.equal(historical.delivery_email_json, null);
    assert.equal(historicalDetail.package?.schemaVersion, "estimate_v1");
    assert.equal(historicalDetail.deliveryEmail, null);

    const omitted = { ...baseRow() };
    delete omitted.delivery_email_json;
    const omittedDetail = toPublicAthenaEstimateDetail(
      mapAthenaEstimateRow(omitted),
      true,
    );
    assert.equal(omittedDetail.package?.recommendedClientPrice.amount, 18000);
    assert.equal(omittedDetail.deliveryEmail, null);

    for (const malformed of [
      { schemaVersion: "estimate_v0" },
      { schemaVersion: "estimate_delivery_email_v1", language: "en" },
      "not-an-object",
      [],
      {
        schemaVersion: "estimate_delivery_email_v1",
        language: "en",
        generated: {
          subject: "Generated subject",
          body: "Generated body",
        },
        edited: { subject: "Only a subject" },
        editedAt: null,
      },
    ]) {
      const estimate = mapAthenaEstimateRow(
        baseRow({ delivery_email_json: malformed }),
      );
      const detail = toPublicAthenaEstimateDetail(estimate, true);
      assert.equal(estimate.package_json?.schemaVersion, "estimate_v1");
      assert.equal(estimate.delivery_email_json, null);
      assert.ok(detail.package);
      assert.equal(detail.deliveryEmail, null);
      assert.equal("delivery_email_json" in detail, false);
      assert.equal("generated" in detail, false);
      assert.equal("editedAt" in detail, false);
    }
  });

  it("maps generated text, then edited text, on the detail DTO only", () => {
    const generatedRecord = buildGeneratedEstimateDeliveryEmailRecord(
      email({ language: "fr", subject: "Sujet généré", body: "Corps généré" }),
    );
    const generated = mapAthenaEstimateRow(
      baseRow({ delivery_email_json: generatedRecord }),
    );
    const generatedDetail = toPublicAthenaEstimateDetail(generated, true);
    const generatedSummary = toPublicAthenaEstimateSummary(generated, true);
    assert.deepEqual(generatedDetail.deliveryEmail, {
      subject: "Sujet généré",
      body: "Corps généré",
      language: "fr",
      edited: false,
    });
    assert.equal("deliveryEmail" in generatedSummary, false);
    assert.equal("schemaVersion" in (generatedDetail.deliveryEmail ?? {}), false);

    const edited = mapAthenaEstimateRow(
      baseRow({
        delivery_email_json: {
          ...generatedRecord,
          edited: { subject: "Sujet revu", body: "Corps revu" },
          editedAt: "2026-10-10T12:00:00.000Z",
        },
      }),
    );
    const editedDetail = toPublicAthenaEstimateDetail(edited, false);
    assert.deepEqual(editedDetail.deliveryEmail, {
      subject: "Sujet revu",
      body: "Corps revu",
      language: "fr",
      edited: true,
    });
    assert.equal(editedDetail.package?.schemaVersion, "estimate_v1");
    assert.equal(
      "delivery_email_json" in (editedDetail as unknown as Record<string, unknown>),
      false,
    );

    const processing = toPublicAthenaEstimateDetail(
      mapAthenaEstimateRow(
        baseRow({
          status: "Processing",
          package_json: null,
          delivery_email_json: generatedRecord,
        }),
      ),
      true,
    );
    assert.equal(processing.package, null);
    assert.equal(processing.deliveryEmail, null);
  });

  it("keeps Master detail access and cross-Licensee isolation on the existing routes", () => {
    const detail = read("app/api/licensee/estimate/[id]/route.ts");
    assert.match(detail, /auth\.getUser/);
    assert.match(detail, /if \(!user\?\.id\)/);
    assert.match(detail, /401/);
    assert.match(detail, /UNAUTHORIZED/);
    assert.match(detail, /getAthenaEstimateDetailForMaster/);
    assert.doesNotMatch(detail, /delivery_email_json/);

    const list = read("app/api/licensee/estimate/route.ts");
    assert.match(list, /auth\.getUser/);
    assert.match(list, /401/);
    assert.match(list, /listAthenaEstimatesForMaster/);

    const orchestration = read(
      "services/estimate/athenaEstimateOrchestration.ts",
    );
    const getStart = orchestration.indexOf(
      "export async function getAthenaEstimateDetailForMaster",
    );
    const getEnd = orchestration.indexOf(
      "export async function regenerateAthenaEstimate",
      getStart,
    );
    const getFn = orchestration.slice(getStart, getEnd);
    assert.match(getFn, /requireLicenseeMasterAccount/);
    assert.match(
      getFn,
      /getAthenaEstimateByIdForLicensee\(\s*input\.estimateId,\s*masterAccount\.id/,
    );
    assert.doesNotMatch(getFn, /delivery_email_json/);

    const service = read("services/estimate/athenaEstimateService.ts");
    assert.match(
      service,
      /export async function getAthenaEstimateByIdForLicensee\([\s\S]*?\.eq\("licensee_account_id", licenseeAccountId\)/,
    );
    assert.match(
      service,
      /persistGeneratedEstimateDeliveryEmailIfAbsent[\s\S]*?\.eq\("licensee_account_id", input\.licenseeAccountId\)[\s\S]*?\.is\("delivery_email_json", null\)/,
    );
    assert.equal(
      existsSync(join(ROOT, "app/api/public/estimate")),
      false,
    );
  });

  it("persists after Ready completion, ignores a null email, and survives a write failure without a second model call", async () => {
    const readyPackage = samplePackage();
    const generated = email();
    let pipelineCalls = 0;
    const stored: EstimateDeliveryEmailV1[] = [];
    const ops = jobOps();

    const first = await executeClaimedEstimateGenerationJob(
      "worker-1",
      { job: claimedJob(queuedEstimate()), claimToken: "claim-token" },
      {
        deps: {
          getEstimate: async () => queuedEstimate(),
          resolveMasterUserId: async () => "master-1",
          assertOwnsSubAccount: async () => ({
            licenseeAccountId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            organizationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            relationshipId: "rel",
          }),
          getMethodology: async () => ({
            configKey: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
            revisionId: "rev-1",
            instructionText: "Price from Athena evidence.",
            configured: true as const,
            updatedAt: "2026-08-09T00:00:00.000Z",
            updatedBy: null,
          }),
          runPipeline: async () => {
            pipelineCalls += 1;
            return {
              package: readyPackage,
              deliveryEmail: generated,
              context: {} as never,
            };
          },
          jobOps: ops.ops,
          persistGeneratedDeliveryEmail: async (input) => {
            if (input.deliveryEmail) stored.push(input.deliveryEmail);
          },
        },
      },
    );

    assert.equal(first, "completed");
    assert.equal(pipelineCalls, 1);
    assert.equal(ops.fails.length, 0);
    assert.equal(ops.completes.length, 1);
    assert.equal(ops.completes[0], readyPackage);
    assert.deepEqual(stored, [generated]);
    assert.deepEqual(
      buildGeneratedEstimateDeliveryEmailRecord(stored[0]!),
      buildGeneratedEstimateDeliveryEmailRecord(generated),
    );

    const repeated = await executeClaimedEstimateGenerationJob(
      "worker-1",
      { job: claimedJob(queuedEstimate()), claimToken: "claim-token" },
      {
        deps: {
          getEstimate: async () =>
            queuedEstimate({
              status: "Ready",
              package_json: readyPackage,
            }),
          runPipeline: async () => {
            pipelineCalls += 1;
            throw new Error("Ready completion must not generate again");
          },
          jobOps: ops.ops,
          persistGeneratedDeliveryEmail: async (input) => {
            if (input.deliveryEmail) stored.push(input.deliveryEmail);
          },
        },
      },
    );

    assert.equal(repeated, "completed");
    assert.equal(pipelineCalls, 1);
    assert.equal(stored.length, 1);
    assert.equal(ops.fails.length, 0);
    assert.equal(ops.completes[1], readyPackage);

    const nullOps = jobOps();
    let nullPersistCalls = 0;
    const nullStatus = await executeClaimedEstimateGenerationJob(
      "worker-1",
      { job: claimedJob(queuedEstimate()), claimToken: "claim-token" },
      {
        deps: {
          getEstimate: async () => queuedEstimate(),
          resolveMasterUserId: async () => "master-1",
          assertOwnsSubAccount: async () => ({
            licenseeAccountId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            organizationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            relationshipId: "rel",
          }),
          getMethodology: async () => ({
            configKey: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
            revisionId: "rev-1",
            instructionText: "Price from Athena evidence.",
            configured: true as const,
            updatedAt: "2026-08-09T00:00:00.000Z",
            updatedBy: null,
          }),
          runPipeline: async () => ({
            package: readyPackage,
            deliveryEmail: null,
            context: {} as never,
          }),
          jobOps: nullOps.ops,
          persistGeneratedDeliveryEmail: async (input) => {
            nullPersistCalls += 1;
            assert.equal(input.deliveryEmail, null);
          },
        },
      },
    );
    assert.equal(nullStatus, "completed");
    assert.equal(nullPersistCalls, 1);
    assert.equal(nullOps.fails.length, 0);
    assert.equal(nullOps.completes[0], readyPackage);

    const failedWriteOps = jobOps();
    const failedWrite = await executeClaimedEstimateGenerationJob(
      "worker-1",
      { job: claimedJob(queuedEstimate()), claimToken: "claim-token" },
      {
        deps: {
          getEstimate: async () => queuedEstimate(),
          resolveMasterUserId: async () => "master-1",
          assertOwnsSubAccount: async () => ({
            licenseeAccountId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            organizationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            relationshipId: "rel",
          }),
          getMethodology: async () => ({
            configKey: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
            revisionId: "rev-1",
            instructionText: "Price from Athena evidence.",
            configured: true as const,
            updatedAt: "2026-08-09T00:00:00.000Z",
            updatedBy: null,
          }),
          runPipeline: async () => ({
            package: readyPackage,
            deliveryEmail: generated,
            context: {} as never,
          }),
          jobOps: failedWriteOps.ops,
          persistGeneratedDeliveryEmail: async () => {
            throw new Error("email column write failed");
          },
        },
      },
    );
    assert.equal(failedWrite, "completed");
    assert.equal(failedWriteOps.fails.length, 0);
    assert.equal(failedWriteOps.completes.length, 1);

    const pipeline = read("services/estimate/estimateGenerationPipeline.ts");
    assert.equal(pipeline.match(/await generate\(/g)?.length, 1);
    const executor = read(
      "services/estimate/estimateGenerationJobs/estimateGenerationJobExecutor.ts",
    );
    assert.match(executor, /packageJson: result\.package/);
    assert.doesNotMatch(executor, /generateReview\(/);
    assert.equal(executor.match(/await generate\(/g)?.length ?? 0, 0);
    assert.doesNotMatch(executor, /\.from\("athena_estimates"\)\.update/);
    const worker = read("workers/athenaWorker.ts");
    assert.match(worker, /claimAndExecuteNextEstimateGenerationJob/);
    assert.doesNotMatch(
      worker,
      /delivery_email_json|deliveryEmail|estimateDeliveryEmail|persistGeneratedEstimateDeliveryEmail/,
    );
    for (const file of [
      "services/clientQuote/clientQuoteSeed.ts",
      "services/clientQuote/pdf/renderClientQuotePdf.ts",
      "services/clientQuote/pdf/clientQuotePdfFormat.ts",
    ]) {
      assert.doesNotMatch(
        read(file),
        /delivery_email_json|estimate_delivery_email|deliveryEmail/,
      );
    }
  });
});

function memoryRow(): MemoryRow {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    licensee_account_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    status: "Ready",
    package_json: samplePackage(),
    request_json: { projectNeed: "Rebuild the marketing site" },
    prospect_generation_context_json: { schemaVersion: "estimate_prospect_context_v1" },
    delivery_email_json: null,
  };
}
