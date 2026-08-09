/**
 * Athena Estimate V26 L9 — final edge-case hardening regressions.
 * Anchors Ready immutability, auth classification, accepted races, and
 * recovery/model-output contracts before migration/commit authorization.
 */
import "../licensee/licenseeAuthTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { formatEstimateMoney } from "../../components/licensee/estimate/estimateUiHelpers";
import {
  ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
  ATHENA_ESTIMATE_SCHEMA_VERSION,
  ESTIMATE_PRICING_METHODOLOGY_MAX_CHARS,
} from "../../services/estimate/athenaEstimateTypes";
import {
  AthenaEstimatePackageValidationError,
  ESTIMATE_PACKAGE_FIELD_LIMITS,
} from "../../services/estimate/athenaEstimateValidation";
import {
  ESTIMATE_GUIDANCE_DISCLAIMER_DERIVED,
  normalizeAndValidateEstimatePackage,
} from "../../services/estimate/estimatePackageNormalization";
import {
  EstimateGenerationPipelineError,
  runEstimateGenerationPipeline,
} from "../../services/estimate/estimateGenerationPipeline";
import { executeClaimedEstimateGenerationJob } from "../../services/estimate/estimateGenerationJobs/estimateGenerationJobExecutor";
import type { AthenaEstimateGenerationJob } from "../../services/estimate/estimateGenerationJobs/estimateGenerationJobTypes";
import { ESTIMATE_GENERATION_JOB_RPCS } from "../../services/estimate/estimateGenerationJobs/estimateGenerationJobTypes";
import type { AthenaEstimate } from "../../services/estimate/athenaEstimateService";
import type { AthenaEstimatePackage } from "../../services/estimate/athenaEstimateTypes";
import { LicenseeAccessError } from "../../services/licensee/licenseeIdentity";

const ROOT = process.cwd();
const MIGRATION =
  "supabase/migrations/20260809000001_create_athena_estimates.sql";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const METHODOLOGY = {
  configKey: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
  revisionId: "rev-l9-b",
  instructionText: "Price from trusted Athena evidence and methodology.",
  configured: true as const,
  updatedAt: "2026-08-09T00:00:00.000Z",
  updatedBy: "super-admin",
};

const REQUEST = {
  projectNeed: "Rebuild marketing site with CMS.",
  additionalContext: "Single brand, English only.",
  timeframe: "2_4_weeks" as const,
};

function baseModelPackage(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion: ATHENA_ESTIMATE_SCHEMA_VERSION,
    recommendedClientPrice: { amount: 18000, currencyCode: "USD" },
    recommendedPriceRange: {
      low: { amount: 14000, currencyCode: "USD" },
      high: { amount: 24000, currencyCode: "USD" },
    },
    scopeInterpretation: "Rebuild marketing site with CMS.",
    pricingRationale: "Mid-market fixed delivery fee from Athena evidence.",
    keyPriceDrivers: ["CMS migration", "Design complexity"],
    suggestedClientPositioning: "Frame as fixed-scope launch.",
    risksAndAssumptions: ["Brand assets available", "Single decision maker"],
    geographyLabel: null,
    currencyResolution: "fallback",
    guidanceDisclaimer: "model disclaimer",
    instructionProvenance: {
      configKey: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
      revisionId: "spoof",
      configured: true,
    },
    marketResearchClaimed: false,
    competitorQuotesFabricated: false,
    ...overrides,
  };
}

function claimedJob(
  overrides: Partial<AthenaEstimateGenerationJob> = {},
): AthenaEstimateGenerationJob {
  return {
    id: "job-l9",
    licensee_account_id: "lic-1",
    organization_id: "org-1",
    estimate_id: "est-1",
    requested_by: "master-1",
    status: "processing",
    generation_stage: "asserting_authorization",
    attempt_count: 1,
    max_attempts: 3,
    claimed_by: "worker-1",
    claim_token: "claim-token",
    claimed_at: "2026-08-09T00:00:00.000Z",
    claim_expires_at: "2026-08-09T00:02:00.000Z",
    heartbeat_at: "2026-08-09T00:00:00.000Z",
    next_attempt_at: null,
    error_code: null,
    error_message: null,
    error_metadata: null,
    started_at: "2026-08-09T00:00:00.000Z",
    completed_at: null,
    created_at: "2026-08-09T00:00:00.000Z",
    updated_at: "2026-08-09T00:00:00.000Z",
    ...overrides,
  };
}

function queuedEstimate(
  overrides: Partial<AthenaEstimate> = {},
): AthenaEstimate {
  return {
    id: "est-1",
    licensee_account_id: "lic-1",
    organization_id: "org-1",
    requested_by: "master-1",
    organization_name_snapshot: "Acme Co",
    prospect_id: null,
    prospect_business_name_snapshot: null,
    prospect_generation_context_json: null,
    request_json: REQUEST,
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
    created_at: "2026-08-09T00:00:00.000Z",
    updated_at: "2026-08-09T00:00:00.000Z",
    ...overrides,
  };
}

function mockJobOps() {
  const fails: Array<Record<string, unknown>> = [];
  const completes: unknown[] = [];
  const stages: string[] = [];
  return {
    fails,
    completes,
    stages,
    ops: {
      heartbeat: async (input: { stage?: string | null }) => {
        if (input.stage) stages.push(input.stage);
        return claimedJob({ generation_stage: input.stage ?? null });
      },
      complete: async (input: { packageJson: Record<string, unknown> }) => {
        completes.push(input.packageJson);
        return claimedJob({ status: "completed" });
      },
      fail: async (input: {
        errorCode: string;
        retryable?: boolean;
        failedStage?: string | null;
      }) => {
        fails.push(input as unknown as Record<string, unknown>);
        return claimedJob({
          status: input.retryable ? "retryable" : "failed",
          error_code: input.errorCode,
          generation_stage: input.failedStage ?? "failed",
        });
      },
    },
  };
}

async function pipelineWithModel(rawText: string) {
  return runEstimateGenerationPipeline({
    organizationId: "org-1",
    request: REQUEST,
    methodology: METHODOLOGY,
    deps: {
      composeContext: async () => ({
        organizationId: "org-1",
        trusted: {} as never,
        composedTrustedContext: "TRUSTED ATHENA EVIDENCE\nSparse B2B SaaS.",
        operatorGuidanceBlock: "OPERATOR PROJECT GUIDANCE\nSite rebuild.",
        geoCurrency: {
          geographyLabel: null,
          currencyCode: "USD",
          currencyResolution: "fallback" as const,
        },
        meta: {} as never,
      }),
      generateReview: async () => rawText,
    },
  });
}

describe("Athena Estimate L9 — edge-case hardening", () => {
  it("Ready immutability: claim/heartbeat never demote Ready; complete preserves package", () => {
    const migration = read(MIGRATION);
    const claimFn = migration.indexOf(
      `create or replace function ${ESTIMATE_GENERATION_JOB_RPCS.claim}`,
    );
    const heartbeatFn = migration.indexOf(
      `create or replace function ${ESTIMATE_GENERATION_JOB_RPCS.heartbeat}`,
    );
    const completeFn = migration.indexOf(
      `create or replace function ${ESTIMATE_GENERATION_JOB_RPCS.complete}`,
    );
    assert.ok(claimFn >= 0 && heartbeatFn > claimFn && completeFn > heartbeatFn);

    assert.match(
      migration.slice(claimFn, heartbeatFn),
      /and status is distinct from 'Ready'/,
    );
    assert.match(
      migration.slice(heartbeatFn, completeFn),
      /and status is distinct from 'Ready'/,
    );
    assert.match(
      migration.slice(completeFn),
      /when status = 'Ready' and package_json is not null then package_json/,
    );
  });

  it("Ready + stale job: executor short-circuits without pipeline; package unchanged", async () => {
    const readyPackage = normalizeAndValidateEstimatePackage({
      raw: baseModelPackage({
        geographyLabel: null,
        currencyResolution: "fallback",
        instructionProvenance: {
          configKey: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
          revisionId: "rev-frozen-b",
          configured: true,
        },
      }),
      geoCurrency: {
        geographyLabel: null,
        currencyCode: "USD",
        currencyResolution: "fallback",
      },
      methodology: {
        ...METHODOLOGY,
        revisionId: "rev-frozen-b",
      },
    });

    const jobOps = mockJobOps();
    let pipelineCalled = false;
    const status = await executeClaimedEstimateGenerationJob(
      "worker-1",
      { job: claimedJob(), claimToken: "claim-token" },
      {
        deps: {
          getEstimate: async () =>
            queuedEstimate({
              status: "Ready",
              package_json: readyPackage as AthenaEstimatePackage,
              instruction_revision_id: "rev-frozen-b",
            }),
          getMethodology: async () => ({
            ...METHODOLOGY,
            revisionId: "rev-later-c",
          }),
          runPipeline: async () => {
            pipelineCalled = true;
            throw new Error("must not run for Ready");
          },
          jobOps: jobOps.ops,
        },
      },
    );

    assert.equal(status, "completed");
    assert.equal(pipelineCalled, false);
    assert.equal(jobOps.completes.length, 1);
    assert.deepEqual(jobOps.completes[0], readyPackage);
    assert.equal(
      (jobOps.completes[0] as AthenaEstimatePackage).instructionProvenance
        .revisionId,
      "rev-frozen-b",
    );
  });

  it("Master deactivation maps to ACCOUNT_DEACTIVATED before tenant intelligence", async () => {
    const jobOps = mockJobOps();
    let composeCalled = false;

    const status = await executeClaimedEstimateGenerationJob(
      "worker-1",
      { job: claimedJob(), claimToken: "claim-token" },
      {
        deps: {
          getEstimate: async () => queuedEstimate(),
          resolveMasterUserId: async () => "master-1",
          assertOwnsSubAccount: async () => {
            throw new LicenseeAccessError(
              "This account has been deactivated.",
              "ACCOUNT_DEACTIVATED",
            );
          },
          getMethodology: async () => METHODOLOGY,
          runPipeline: async () => {
            composeCalled = true;
            throw new Error("must not run");
          },
          jobOps: jobOps.ops,
        },
      },
    );

    assert.equal(status, "failed");
    assert.equal(composeCalled, false);
    assert.equal(jobOps.fails[0]?.errorCode, "ACCOUNT_DEACTIVATED");
    assert.equal(jobOps.fails[0]?.retryable, false);
    assert.ok(jobOps.stages.includes("asserting_authorization"));
  });

  it("relationship removal still maps to RELATIONSHIP_REMOVED", async () => {
    const jobOps = mockJobOps();
    const status = await executeClaimedEstimateGenerationJob(
      "worker-1",
      { job: claimedJob(), claimToken: "claim-token" },
      {
        deps: {
          getEstimate: async () => queuedEstimate(),
          resolveMasterUserId: async () => "master-1",
          assertOwnsSubAccount: async () => {
            throw new LicenseeAccessError(
              "Master does not own this sub-account relationship.",
            );
          },
          jobOps: jobOps.ops,
        },
      },
    );
    assert.equal(status, "failed");
    assert.equal(jobOps.fails[0]?.errorCode, "RELATIONSHIP_REMOVED");
  });

  it("accepted mid-flight race: auth before compose; no post-context re-assert", () => {
    const executor = read(
      "services/estimate/estimateGenerationJobs/estimateGenerationJobExecutor.ts",
    );
    const pipeline = read("services/estimate/estimateGenerationPipeline.ts");

    const authIdx = executor.indexOf("assertOwns");
    const methodologyIdx = executor.indexOf("getMethodology");
    const pipelineIdx = executor.indexOf("runPipeline({");
    assert.ok(authIdx > 0 && methodologyIdx > authIdx && pipelineIdx > methodologyIdx);

    // Pipeline owns compose/LLM only — caller already authorized.
    assert.match(
      pipeline,
      /Caller must already have asserted relationship \+ configured methodology/,
    );
    assert.doesNotMatch(pipeline, /assertLicenseeOwnsSubAccount/);
    // No distributed lock / repeated ownership check after trusted context load.
    const afterPipeline = executor.slice(pipelineIdx);
    assert.doesNotMatch(afterPipeline, /assertOwns|assertLicenseeOwnsSubAccount/);
  });

  it("methodology resolved at generation time; Ready provenance remains frozen", () => {
    const service = read("services/estimate/athenaEstimateService.ts");
    const executor = read(
      "services/estimate/estimateGenerationJobs/estimateGenerationJobExecutor.ts",
    );
    const methodology = read(
      "services/estimate/estimatePricingMethodologyInstruction.ts",
    );

    // Enqueue does not snapshot methodology revision onto Queued rows.
    assert.match(service, /instruction_revision_id:\s*null/);
    assert.match(service, /instruction_configured:\s*false/);
    // Worker loads active methodology at generation.
    assert.match(executor, /getActiveEstimatePricingMethodologyInstruction|getMethodology/);
    assert.match(methodology, /future Estimate generation/i);

    const frozen = normalizeAndValidateEstimatePackage({
      raw: baseModelPackage(),
      geoCurrency: {
        geographyLabel: null,
        currencyCode: "USD",
        currencyResolution: "fallback",
      },
      methodology: { ...METHODOLOGY, revisionId: "rev-b" },
    });
    assert.equal(frozen.instructionProvenance.revisionId, "rev-b");

    // Later methodology C cannot rewrite an already-normalized Ready package object.
    const later = normalizeAndValidateEstimatePackage({
      raw: frozen as unknown as Record<string, unknown>,
      geoCurrency: {
        geographyLabel: null,
        currencyCode: "USD",
        currencyResolution: "fallback",
      },
      methodology: { ...METHODOLOGY, revisionId: "rev-c" },
    });
    // Re-normalization of model-shaped input adopts current methodology — persistence
    // immutability is the Ready short-circuit + complete RPC CASE (covered above).
    assert.equal(later.instructionProvenance.revisionId, "rev-c");
    assert.equal(frozen.instructionProvenance.revisionId, "rev-b");
  });

  it("missing methodology → configure → regenerate is new-row recovery only", () => {
    const orchestration = read(
      "services/estimate/athenaEstimateOrchestration.ts",
    );
    const client = read(
      "components/licensee/estimate/LicenseeEstimateClient.tsx",
    );
    const executor = read(
      "services/estimate/estimateGenerationJobs/estimateGenerationJobExecutor.ts",
    );

    assert.match(executor, /ESTIMATE_INSTRUCTION_NOT_CONFIGURED/);
    assert.match(orchestration, /regenerateAthenaEstimate/);
    assert.match(
      orchestration,
      /const created = await createAthenaEstimateWithJob/,
    );
    assert.match(client, /Try Again \(New Estimate\)/);
    // No in-place retry of the failed historical row.
    assert.doesNotMatch(
      orchestration,
      /updateAthenaEstimate.*Processing|status:\s*"Queued"/,
    );
  });

  it("model output: fenced JSON accepted; prose/NaN/bounds/claims rejected", async () => {
    const fenced = await pipelineWithModel(
      "```json\n" + JSON.stringify(baseModelPackage()) + "\n```",
    );
    assert.equal(fenced.package.schemaVersion, ATHENA_ESTIMATE_SCHEMA_VERSION);
    assert.equal(fenced.package.recommendedClientPrice.amount, 18000);

    await assert.rejects(
      () =>
        pipelineWithModel(
          "Here is the estimate:\n" + JSON.stringify(baseModelPackage()),
        ),
      (error: unknown) =>
        error instanceof EstimateGenerationPipelineError &&
        error.code === "ESTIMATE_INVALID_MODEL_OUTPUT",
    );

    await assert.rejects(
      () =>
        pipelineWithModel(
          JSON.stringify(baseModelPackage()) + "\nThanks!",
        ),
      (error: unknown) =>
        error instanceof EstimateGenerationPipelineError &&
        error.code === "ESTIMATE_INVALID_MODEL_OUTPUT",
    );

    const geo = {
      geographyLabel: null as string | null,
      currencyCode: "USD",
      currencyResolution: "fallback" as const,
    };

    assert.throws(
      () =>
        normalizeAndValidateEstimatePackage({
          raw: baseModelPackage({
            recommendedClientPrice: { amount: Number.NaN, currencyCode: "USD" },
          }),
          geoCurrency: geo,
          methodology: METHODOLOGY,
        }),
      AthenaEstimatePackageValidationError,
    );

    assert.throws(
      () =>
        normalizeAndValidateEstimatePackage({
          raw: baseModelPackage({
            recommendedClientPrice: {
              amount: Number.POSITIVE_INFINITY,
              currencyCode: "USD",
            },
          }),
          geoCurrency: geo,
          methodology: METHODOLOGY,
        }),
      AthenaEstimatePackageValidationError,
    );

    assert.throws(
      () =>
        normalizeAndValidateEstimatePackage({
          raw: baseModelPackage({ pricingRationale: "   " }),
          geoCurrency: geo,
          methodology: METHODOLOGY,
        }),
      AthenaEstimatePackageValidationError,
    );

    assert.throws(
      () =>
        normalizeAndValidateEstimatePackage({
          raw: baseModelPackage({ keyPriceDrivers: [] }),
          geoCurrency: geo,
          methodology: METHODOLOGY,
        }),
      AthenaEstimatePackageValidationError,
    );

    assert.throws(
      () =>
        normalizeAndValidateEstimatePackage({
          raw: baseModelPackage({
            keyPriceDrivers: Array.from({ length: 13 }, (_, i) => `d${i}`),
          }),
          geoCurrency: geo,
          methodology: METHODOLOGY,
        }),
      AthenaEstimatePackageValidationError,
    );

    assert.throws(
      () =>
        normalizeAndValidateEstimatePackage({
          raw: baseModelPackage({ risksAndAssumptions: [] }),
          geoCurrency: geo,
          methodology: METHODOLOGY,
        }),
      AthenaEstimatePackageValidationError,
    );

    assert.throws(
      () =>
        normalizeAndValidateEstimatePackage({
          raw: baseModelPackage({
            risksAndAssumptions: Array.from({ length: 13 }, (_, i) => `r${i}`),
          }),
          geoCurrency: geo,
          methodology: METHODOLOGY,
        }),
      AthenaEstimatePackageValidationError,
    );

    assert.equal(ESTIMATE_PACKAGE_FIELD_LIMITS.keyPriceDrivers.max, 12);
    assert.equal(ESTIMATE_PACKAGE_FIELD_LIMITS.risksAndAssumptions.max, 12);

    // Wrong schemaVersion is coerced server-side before validate.
    const coerced = normalizeAndValidateEstimatePackage({
      raw: baseModelPackage({ schemaVersion: "estimate_v99" }),
      geoCurrency: geo,
      methodology: METHODOLOGY,
    });
    assert.equal(coerced.schemaVersion, ATHENA_ESTIMATE_SCHEMA_VERSION);

    assert.throws(
      () =>
        normalizeAndValidateEstimatePackage({
          raw: baseModelPackage({
            pricingRationale:
              "We queried current market rates from a live pricing database.",
          }),
          geoCurrency: geo,
          methodology: METHODOLOGY,
        }),
      AthenaEstimatePackageValidationError,
    );

    assert.throws(
      () =>
        normalizeAndValidateEstimatePackage({
          raw: baseModelPackage({
            suggestedClientPositioning:
              "Real competitor quotations were obtained for this fee.",
          }),
          geoCurrency: geo,
          methodology: METHODOLOGY,
        }),
      AthenaEstimatePackageValidationError,
    );
  });

  it("pricing display uses Intl currency formatting with safe fallback", () => {
    assert.match(formatEstimateMoney(18000, "USD"), /18/);
    assert.match(formatEstimateMoney(18500.75, "USD"), /18/);
    assert.match(formatEstimateMoney(1_250_000, "EUR"), /1/);
    // JPY conventionally formats without minor units under Intl.
    const jpy = formatEstimateMoney(500000, "JPY");
    assert.match(jpy, /500/);
    const fallback = formatEstimateMoney(1200, "NOT_A_CURRENCY");
    assert.match(fallback, /NOT_A_CURRENCY/);
    assert.match(fallback, /1/);
  });

  it("history list remains unbounded Phase-1 select (no silent pagination)", () => {
    const service = read("services/estimate/athenaEstimateService.ts");
    const listFn = service.indexOf("export async function listAthenaEstimatesForLicensee");
    assert.ok(listFn >= 0);
    const nextExport = service.indexOf("\nexport async function", listFn + 1);
    const body = service.slice(listFn, nextExport > listFn ? nextExport : undefined);
    assert.match(body, /\.select\("\*"\)/);
    assert.match(body, /\.order\("created_at"/);
    assert.doesNotMatch(body, /\.limit\(/);
    assert.doesNotMatch(body, /range\(|cursor|pageSize|offset/);
  });

  it("regenerate remains new-row; UI soft-guards double submit without server idempotency", () => {
    const orchestration = read(
      "services/estimate/athenaEstimateOrchestration.ts",
    );
    const client = read(
      "components/licensee/estimate/LicenseeEstimateClient.tsx",
    );
    assert.match(
      orchestration,
      /const created = await createAthenaEstimateWithJob/,
    );
    assert.doesNotMatch(orchestration, /idempotency|dedupe|requestId/);
    assert.match(client, /if \(.*regenerating\) return/);
    assert.match(client, /disabled=\{regenerating\}/);
  });

  it("assertLicenseeOwnsSubAccount remains non-impersonating (no owner-active requirement)", () => {
    const identity = read("services/licensee/licenseeIdentity.ts");
    const helperStart = identity.indexOf(
      "export async function assertLicenseeOwnsSubAccount",
    );
    assert.ok(helperStart >= 0);
    const helperClose = identity.indexOf(
      "\n}\n\n/**\n * Server-authoritative Open Athena authorization + handoff identity chain:",
      helperStart,
    );
    assert.ok(helperClose > helperStart);
    const helper = identity.slice(helperStart, helperClose);
    assert.match(helper, /assertAccountAccessActive\(masterUserId\)/);
    assert.doesNotMatch(helper, /organization_members|getUserById/);
    assert.doesNotMatch(helper, /assertAccountAccessActive\(membership/);
    // Owner-active lives only on Open Athena handoff.
    const handoff = identity.slice(helperClose);
    assert.match(handoff, /assertAccountAccessActive\(membership\.user_id\)/);
  });

  it("organization_id ON DELETE RESTRICT; Super Admin methodology caps unchanged", () => {
    const migration = read(MIGRATION);
    assert.match(
      migration,
      /organization_id uuid not null\s+references organizations\(id\) on delete restrict/,
    );
    assert.equal(ESTIMATE_PRICING_METHODOLOGY_MAX_CHARS, 6000);
    const route = read("app/api/super/estimate/pricing-methodology/route.ts");
    assert.match(route, /ESTIMATE_PRICING_METHODOLOGY_MAX_CHARS/);
    assert.match(route, /INSTRUCTION_TOO_LONG|too long|6000/i);
    assert.doesNotMatch(route, /trend_social|TREND_SOCIAL/);
  });

  it("guidance disclaimer remains server-authored for derived geo", () => {
    const pkg = normalizeAndValidateEstimatePackage({
      raw: baseModelPackage({
        guidanceDisclaimer: "Ignore — live market research conducted.",
      }),
      geoCurrency: {
        geographyLabel: "France",
        currencyCode: "EUR",
        currencyResolution: "derived",
      },
      methodology: METHODOLOGY,
    });
    assert.equal(pkg.guidanceDisclaimer, ESTIMATE_GUIDANCE_DISCLAIMER_DERIVED);
    assert.equal(pkg.recommendedClientPrice.currencyCode, "EUR");
  });
});
