/**
 * Athena Estimate V26 L5 — generation pipeline, prompts, executor.
 */
import "./../licensee/licenseeAuthTestEnv";

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
  ATHENA_ESTIMATE_SCHEMA_VERSION,
  type AthenaEstimatePackage,
  type EstimateRequest,
} from "../../services/estimate/athenaEstimateTypes";
import type { AthenaEstimate } from "../../services/estimate/athenaEstimateService";
import {
  AthenaEstimatePackageValidationError,
  validateAthenaEstimatePackage,
} from "../../services/estimate/athenaEstimateValidation";
import {
  ESTIMATE_GUIDANCE_DISCLAIMER_DERIVED,
  ESTIMATE_GUIDANCE_DISCLAIMER_FALLBACK,
  normalizeAndValidateEstimatePackage,
} from "../../services/estimate/estimatePackageNormalization";
import {
  EstimateGenerationPipelineError,
  runEstimateGenerationPipeline,
} from "../../services/estimate/estimateGenerationPipeline";
import { executeClaimedEstimateGenerationJob } from "../../services/estimate/estimateGenerationJobs/estimateGenerationJobExecutor";
import type { AthenaEstimateGenerationJob } from "../../services/estimate/estimateGenerationJobs/estimateGenerationJobTypes";
import { ESTIMATE_INSTRUCTION_NOT_CONFIGURED } from "../../services/estimate/estimatePricingMethodologyInstruction";
import { LicenseeAccessError } from "../../services/licensee/licenseeIdentity";
import { buildEstimateUserPrompt } from "../../services/ai/prompts/estimate/estimateUserPrompt";
import { ESTIMATE_SYSTEM_PROMPT } from "../../services/ai/prompts/estimate/estimateSystemPrompt";
import {
  ESTIMATE_GROUNDING_RULES,
  ESTIMATE_SHARED_OUTPUT_RULES,
} from "../../services/ai/prompts/estimate/estimateSharedConstraints";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const REQUEST: EstimateRequest = {
  projectNeed: "Rebuild the marketing site with CMS and analytics.",
  additionalContext: "Need staging + training.",
  timeframe: "1_3_months",
};

const METHODOLOGY = {
  configKey: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
  revisionId: "rev-estimate-method-001",
  instructionText:
    "Price for mid-market delivery complexity with clear contingency.",
  configured: true as const,
  updatedAt: "2026-08-09T00:00:00.000Z",
  updatedBy: "super-admin",
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
    scopeInterpretation:
      "Full marketing site rebuild with CMS migration and analytics setup.",
    pricingRationale:
      "Scope and Athena evidence support a mid-market fixed delivery fee.",
    keyPriceDrivers: [
      "CMS migration volume",
      "Design system complexity",
      "Analytics instrumentation",
      "Stakeholder review cycles",
    ],
    suggestedClientPositioning:
      "Frame as a fixed-scope launch with clear acceptance criteria.",
    risksAndAssumptions: [
      "Assumes brand assets are available",
      "Assumes one primary decision maker",
      "Assumes no custom ecommerce checkout",
    ],
    geographyLabel: null,
    currencyResolution: "fallback",
    guidanceDisclaimer: "model-provided disclaimer that must be overwritten",
    instructionProvenance: {
      configKey: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
      revisionId: "spoofed-revision",
      configured: true,
    },
    marketResearchClaimed: false,
    competitorQuotesFabricated: false,
    ...overrides,
  };
}

function queuedEstimate(
  overrides: Partial<AthenaEstimate> = {},
): AthenaEstimate {
  return {
    id: "est-11111111-1111-4111-8111-111111111111",
    licensee_account_id: "lic-22222222-2222-4222-8222-222222222222",
    organization_id: "org-33333333-3333-4333-8333-333333333333",
    requested_by: "master-44444444-4444-4444-8444-444444444444",
    organization_name_snapshot: "Acme Co",
    request_json: REQUEST,
    status: "Queued",
    generation_stage: "assembling_context",
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

function claimedJob(
  overrides: Partial<AthenaEstimateGenerationJob> = {},
): AthenaEstimateGenerationJob {
  const estimate = queuedEstimate();
  return {
    id: "job-55555555-5555-4555-8555-555555555555",
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
    ...overrides,
  };
}

function mockJobOps() {
  const stages: string[] = [];
  const fails: Array<Record<string, unknown>> = [];
  const completes: Array<Record<string, unknown>> = [];
  return {
    stages,
    fails,
    completes,
    ops: {
      heartbeat: async (input: { stage?: string | null }) => {
        if (input.stage) stages.push(String(input.stage));
        return claimedJob({
          generation_stage: input.stage ?? "asserting_authorization",
        });
      },
      complete: async (input: { packageJson: Record<string, unknown> }) => {
        completes.push(input.packageJson);
        return claimedJob({ status: "completed", generation_stage: "completed" });
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

describe("Athena Estimate L5 — generation pipeline + prompts + executor", () => {
  it("1/2. executor re-asserts relationship before context; RELATIONSHIP_REMOVED skips context", async () => {
    const jobOps = mockJobOps();
    let composeCalled = false;
    let assertCalled = false;

    const status = await executeClaimedEstimateGenerationJob(
      "worker-1",
      { job: claimedJob(), claimToken: "claim-token" },
      {
        deps: {
          getEstimate: async () => queuedEstimate(),
          resolveMasterUserId: async () => "master-1",
          assertOwnsSubAccount: async () => {
            assertCalled = true;
            throw new LicenseeAccessError("relationship removed");
          },
          getMethodology: async () => METHODOLOGY,
          runPipeline: async () => {
            composeCalled = true;
            throw new Error("pipeline must not run");
          },
          jobOps: jobOps.ops,
        },
      },
    );

    assert.equal(assertCalled, true);
    assert.equal(composeCalled, false);
    assert.equal(status, "failed");
    assert.equal(jobOps.fails[0]?.errorCode, "RELATIONSHIP_REMOVED");
    assert.equal(jobOps.fails[0]?.retryable, false);
    assert.ok(jobOps.stages.includes("asserting_authorization"));
    assert.equal(jobOps.completes.length, 0);
  });

  it("3/4. missing methodology fails ESTIMATE_INSTRUCTION_NOT_CONFIGURED; provenance uses revision", async () => {
    const jobOps = mockJobOps();
    let pipelineCalled = false;

    const missing = await executeClaimedEstimateGenerationJob(
      "worker-1",
      { job: claimedJob(), claimToken: "claim-token" },
      {
        deps: {
          getEstimate: async () => queuedEstimate(),
          resolveMasterUserId: async () => "master-1",
          assertOwnsSubAccount: async () => ({
            licenseeAccountId: "lic",
            organizationId: "org",
            relationshipId: "rel",
          }),
          getMethodology: async () => ({
            ...METHODOLOGY,
            configured: false,
            instructionText: "",
            revisionId: null,
          }),
          runPipeline: async () => {
            pipelineCalled = true;
            throw new Error("must not run");
          },
          jobOps: jobOps.ops,
        },
      },
    );

    assert.equal(missing, "failed");
    assert.equal(pipelineCalled, false);
    assert.equal(
      jobOps.fails[0]?.errorCode,
      ESTIMATE_INSTRUCTION_NOT_CONFIGURED,
    );
    assert.equal(jobOps.fails[0]?.retryable, false);

    const normalized = normalizeAndValidateEstimatePackage({
      raw: baseModelPackage({
        instructionProvenance: {
          configKey: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
          revisionId: "attacker-revision",
          configured: true,
        },
      }),
      geoCurrency: {
        geographyLabel: null,
        currencyCode: "USD",
        currencyResolution: "fallback",
      },
      methodology: METHODOLOGY,
    });
    assert.equal(
      normalized.instructionProvenance.revisionId,
      METHODOLOGY.revisionId,
    );
    assert.equal(
      normalized.instructionProvenance.configKey,
      "estimate_pricing_methodology",
    );
    assert.equal(normalized.instructionProvenance.configured, true);
  });

  it("5/6/7. prompt blocks distinct; composer reused; currency/geo fixed in user prompt", () => {
    const userPrompt = buildEstimateUserPrompt({
      trustedContext: "TRUSTED ATHENA EVIDENCE\nClient is a B2B SaaS firm.",
      operatorGuidanceBlock:
        "OPERATOR PROJECT GUIDANCE\nRebuild marketing site.",
      methodologyInstructionText: "Use value-based mid-market pricing.",
      methodologyRevisionId: "rev-1",
      geoCurrency: {
        geographyLabel: "United Kingdom",
        currencyCode: "GBP",
        currencyResolution: "derived",
      },
      request: REQUEST,
    });

    assert.match(userPrompt, /GETOBLIC ESTIMATE PRICING METHODOLOGY/);
    assert.match(userPrompt, /TRUSTED ATHENA EVIDENCE/);
    assert.match(userPrompt, /OPERATOR PROJECT GUIDANCE/);
    assert.match(userPrompt, /currencyCode: GBP/);
    assert.match(userPrompt, /currencyResolution: derived/);
    assert.match(userPrompt, /"United Kingdom"/);

    const methodologyIdx = userPrompt.indexOf(
      "GETOBLIC ESTIMATE PRICING METHODOLOGY",
    );
    const trustedIdx = userPrompt.indexOf("TRUSTED ATHENA EVIDENCE");
    const operatorIdx = userPrompt.indexOf("OPERATOR PROJECT GUIDANCE");
    assert.ok(methodologyIdx > 0 && trustedIdx > methodologyIdx);
    assert.ok(operatorIdx > trustedIdx);

    assert.match(ESTIMATE_SYSTEM_PROMPT, /commercial pricing-intelligence/);
    assert.match(ESTIMATE_GROUNDING_RULES, /TRUSTED ATHENA EVIDENCE/);
    assert.match(ESTIMATE_SHARED_OUTPUT_RULES, /Never fabricate competitor/);

    const pipeline = read("services/estimate/estimateGenerationPipeline.ts");
    assert.match(pipeline, /composeEstimateOrganizationContext/);
    assert.doesNotMatch(pipeline, /getBrainSnapshot|listPersonas|listSeoReports/);
    assert.match(pipeline, /athenaStage: "estimate_package"/);
    assert.match(pipeline, /generateReview/);
  });

  it("8. valid model JSON produces accepted Estimate package", async () => {
    const result = await runEstimateGenerationPipeline({
      organizationId: "org-1",
      request: REQUEST,
      methodology: METHODOLOGY,
      deps: {
        composeContext: async () => ({
          organizationId: "org-1",
          trusted: {} as never,
          composedTrustedContext: "TRUSTED ATHENA EVIDENCE\nB2B SaaS.",
          operatorGuidanceBlock: "OPERATOR PROJECT GUIDANCE\nSite rebuild.",
          geoCurrency: {
            geographyLabel: "United States",
            currencyCode: "USD",
            currencyResolution: "derived" as const,
          },
          meta: {} as never,
        }),
        generateReview: async () =>
          JSON.stringify(
            baseModelPackage({
              geographyLabel: "United States",
              currencyResolution: "derived",
              recommendedClientPrice: { amount: 18000, currencyCode: "EUR" },
              recommendedPriceRange: {
                low: { amount: 14000, currencyCode: "EUR" },
                high: { amount: 24000, currencyCode: "EUR" },
              },
            }),
          ),
      },
    });

    assert.equal(result.package.schemaVersion, "estimate_v1");
    assert.equal(result.package.recommendedClientPrice.currencyCode, "USD");
    assert.equal(result.package.currencyResolution, "derived");
    assert.equal(result.package.geographyLabel, "United States");
    assert.equal(
      result.package.guidanceDisclaimer,
      ESTIMATE_GUIDANCE_DISCLAIMER_DERIVED,
    );
    assert.equal(
      result.package.instructionProvenance.revisionId,
      METHODOLOGY.revisionId,
    );
    assert.equal(result.package.marketResearchClaimed, false);
    assert.ok(validateAthenaEstimatePackage(result.package));
  });

  it("9/10/11/12. malformed JSON, missing section, non-positive price, inverted range rejected", async () => {
    await assert.rejects(
      () =>
        runEstimateGenerationPipeline({
          organizationId: "org-1",
          request: REQUEST,
          methodology: METHODOLOGY,
          deps: {
            composeContext: async () => ({
              organizationId: "org-1",
              trusted: {} as never,
              composedTrustedContext: "trusted",
              operatorGuidanceBlock: "OPERATOR PROJECT GUIDANCE\nx",
              geoCurrency: {
                geographyLabel: null,
                currencyCode: "USD",
                currencyResolution: "fallback" as const,
              },
              meta: {} as never,
            }),
            generateReview: async () => "not-json{{{",
          },
        }),
      (error: unknown) =>
        error instanceof EstimateGenerationPipelineError &&
        error.code === "ESTIMATE_INVALID_MODEL_OUTPUT",
    );

    assert.throws(
      () =>
        normalizeAndValidateEstimatePackage({
          raw: baseModelPackage({ pricingRationale: undefined }),
          geoCurrency: {
            geographyLabel: null,
            currencyCode: "USD",
            currencyResolution: "fallback",
          },
          methodology: METHODOLOGY,
        }),
      AthenaEstimatePackageValidationError,
    );

    assert.throws(
      () =>
        normalizeAndValidateEstimatePackage({
          raw: baseModelPackage({
            recommendedClientPrice: { amount: 0, currencyCode: "USD" },
          }),
          geoCurrency: {
            geographyLabel: null,
            currencyCode: "USD",
            currencyResolution: "fallback",
          },
          methodology: METHODOLOGY,
        }),
      AthenaEstimatePackageValidationError,
    );

    assert.throws(
      () =>
        normalizeAndValidateEstimatePackage({
          raw: baseModelPackage({
            recommendedPriceRange: {
              low: { amount: 20000, currencyCode: "USD" },
              high: { amount: 10000, currencyCode: "USD" },
            },
          }),
          geoCurrency: {
            geographyLabel: null,
            currencyCode: "USD",
            currencyResolution: "fallback",
          },
          methodology: METHODOLOGY,
        }),
      AthenaEstimatePackageValidationError,
    );
  });

  it("13/14/15/16. currency/geo/provenance normalized; forbidden flags forced false", () => {
    const pkg = normalizeAndValidateEstimatePackage({
      raw: baseModelPackage({
        recommendedClientPrice: { amount: 18000, currencyCode: "JPY" },
        recommendedPriceRange: {
          low: { amount: 14000, currencyCode: "JPY" },
          high: { amount: 24000, currencyCode: "JPY" },
        },
        geographyLabel: "Japan",
        currencyResolution: "derived",
        instructionProvenance: {
          configKey: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
          revisionId: "spoof",
          configured: false,
        },
        marketResearchClaimed: true,
        competitorQuotesFabricated: true,
      }),
      geoCurrency: {
        geographyLabel: "France",
        currencyCode: "EUR",
        currencyResolution: "derived",
      },
      methodology: METHODOLOGY,
    });

    assert.equal(pkg.recommendedClientPrice.currencyCode, "EUR");
    assert.equal(pkg.recommendedPriceRange.low.currencyCode, "EUR");
    assert.equal(pkg.recommendedPriceRange.high.currencyCode, "EUR");
    assert.equal(pkg.geographyLabel, "France");
    assert.equal(pkg.currencyResolution, "derived");
    assert.equal(pkg.instructionProvenance.revisionId, METHODOLOGY.revisionId);
    assert.equal(pkg.instructionProvenance.configured, true);
    assert.equal(pkg.marketResearchClaimed, false);
    assert.equal(pkg.competitorQuotesFabricated, false);
    assert.equal(pkg.guidanceDisclaimer, ESTIMATE_GUIDANCE_DISCLAIMER_DERIVED);
  });

  it("17/18. live market research and fabricated competitor/database claims rejected", () => {
    assert.throws(
      () =>
        normalizeAndValidateEstimatePackage({
          raw: baseModelPackage({
            pricingRationale:
              "Price based on live market research conducted this week.",
          }),
          geoCurrency: {
            geographyLabel: null,
            currencyCode: "USD",
            currencyResolution: "fallback",
          },
          methodology: METHODOLOGY,
        }),
      /forbidden market-research/,
    );

    assert.throws(
      () =>
        normalizeAndValidateEstimatePackage({
          raw: baseModelPackage({
            suggestedClientPositioning:
              "We obtained real competitor quotes from a proprietary pricing database.",
          }),
          geoCurrency: {
            geographyLabel: null,
            currencyCode: "USD",
            currencyResolution: "fallback",
          },
          methodology: METHODOLOGY,
        }),
      /forbidden market-research/,
    );
  });

  it("19/20. fallback geography → USD + null + fallback disclaimer; derived preserves currency", () => {
    const fallback = normalizeAndValidateEstimatePackage({
      raw: baseModelPackage(),
      geoCurrency: {
        geographyLabel: null,
        currencyCode: "USD",
        currencyResolution: "fallback",
      },
      methodology: METHODOLOGY,
    });
    assert.equal(fallback.currencyResolution, "fallback");
    assert.equal(fallback.geographyLabel, null);
    assert.equal(fallback.recommendedClientPrice.currencyCode, "USD");
    assert.equal(
      fallback.guidanceDisclaimer,
      ESTIMATE_GUIDANCE_DISCLAIMER_FALLBACK,
    );

    const derived = normalizeAndValidateEstimatePackage({
      raw: baseModelPackage({
        geographyLabel: "Canada",
        currencyResolution: "derived",
        recommendedClientPrice: { amount: 18000, currencyCode: "CAD" },
        recommendedPriceRange: {
          low: { amount: 14000, currencyCode: "CAD" },
          high: { amount: 24000, currencyCode: "CAD" },
        },
      }),
      geoCurrency: {
        geographyLabel: "Canada",
        currencyCode: "CAD",
        currencyResolution: "derived",
      },
      methodology: METHODOLOGY,
    });
    assert.equal(derived.currencyResolution, "derived");
    assert.equal(derived.geographyLabel, "Canada");
    assert.equal(derived.recommendedClientPrice.currencyCode, "CAD");
    assert.equal(
      derived.guidanceDisclaimer,
      ESTIMATE_GUIDANCE_DISCLAIMER_DERIVED,
    );
  });

  it("21/22. Ready Estimate cannot be overwritten; regenerate remains new-row only", async () => {
    const readyPackage = normalizeAndValidateEstimatePackage({
      raw: baseModelPackage({
        geographyLabel: "United States",
        currencyResolution: "derived",
      }),
      geoCurrency: {
        geographyLabel: "United States",
        currencyCode: "USD",
        currencyResolution: "derived",
      },
      methodology: METHODOLOGY,
    });

    const jobOps = mockJobOps();
    const status = await executeClaimedEstimateGenerationJob(
      "worker-1",
      { job: claimedJob(), claimToken: "claim-token" },
      {
        deps: {
          getEstimate: async () =>
            queuedEstimate({
              status: "Ready",
              package_json: readyPackage as AthenaEstimatePackage,
            }),
          runPipeline: async () => {
            throw new Error("must not regenerate Ready package");
          },
          jobOps: jobOps.ops,
        },
      },
    );

    assert.equal(status, "completed");
    assert.equal(jobOps.completes.length, 1);
    assert.deepEqual(jobOps.completes[0], readyPackage);
    assert.equal(jobOps.fails.length, 0);

    const orchestration = read(
      "services/estimate/athenaEstimateOrchestration.ts",
    );
    const regenerateRoute = read(
      "app/api/licensee/estimate/[id]/regenerate/route.ts",
    );
    assert.match(orchestration, /regenerateAthenaEstimate/);
    assert.match(
      orchestration,
      /const created = await createAthenaEstimateWithJob/,
    );
    assert.match(regenerateRoute, /regenerateAthenaEstimate/);
    assert.match(
      read("services/estimate/athenaEstimateTypes.ts"),
      /ReadyAthenaEstimateImmutableError/,
    );
    assert.match(
      read(
        "services/estimate/estimateGenerationJobs/estimateGenerationJobExecutor.ts",
      ),
      /Ready Estimates are immutable/,
    );
  });

  it("23/24. OpenRouter transient failure retryable; auth/config terminal", async () => {
    const jobOps = mockJobOps();
    const retryable = await executeClaimedEstimateGenerationJob(
      "worker-1",
      { job: claimedJob(), claimToken: "claim-token" },
      {
        deps: {
          getEstimate: async () => queuedEstimate(),
          resolveMasterUserId: async () => "master-1",
          assertOwnsSubAccount: async () => ({
            licenseeAccountId: "lic",
            organizationId: "org",
            relationshipId: "rel",
          }),
          getMethodology: async () => METHODOLOGY,
          runPipeline: async () => {
            throw new EstimateGenerationPipelineError({
              code: "ESTIMATE_GENERATION_FAILED",
              message: "OpenRouter timeout / network 503",
              stage: "generating_estimate",
              retryable: true,
            });
          },
          jobOps: jobOps.ops,
        },
      },
    );
    assert.equal(retryable, "retryable");
    assert.equal(jobOps.fails[0]?.errorCode, "ESTIMATE_GENERATION_FAILED");
    assert.equal(jobOps.fails[0]?.retryable, true);

    const jobOps2 = mockJobOps();
    const terminal = await executeClaimedEstimateGenerationJob(
      "worker-1",
      { job: claimedJob(), claimToken: "claim-token" },
      {
        deps: {
          getEstimate: async () => queuedEstimate(),
          resolveMasterUserId: async () => "master-1",
          assertOwnsSubAccount: async () => {
            throw new LicenseeAccessError("gone");
          },
          getMethodology: async () => METHODOLOGY,
          jobOps: jobOps2.ops,
        },
      },
    );
    assert.equal(terminal, "failed");
    assert.equal(jobOps2.fails[0]?.retryable, false);
  });

  it("25/26. stage/heartbeat progression and completion only via durable complete path", async () => {
    const jobOps = mockJobOps();
    const stagesSeen: string[] = [];

    const status = await executeClaimedEstimateGenerationJob(
      "worker-1",
      { job: claimedJob(), claimToken: "claim-token" },
      {
        deps: {
          getEstimate: async () => queuedEstimate(),
          resolveMasterUserId: async () => "master-1",
          assertOwnsSubAccount: async () => ({
            licenseeAccountId: "lic",
            organizationId: "org",
            relationshipId: "rel",
          }),
          getMethodology: async () => METHODOLOGY,
          runPipeline: async (input) => {
            await input.onStage?.("assembling_context");
            await input.onStage?.("generating_estimate");
            await input.onStage?.("validating");
            stagesSeen.push("pipeline");
            const pkg = normalizeAndValidateEstimatePackage({
              raw: baseModelPackage({
                geographyLabel: null,
                currencyResolution: "fallback",
              }),
              geoCurrency: {
                geographyLabel: null,
                currencyCode: "USD",
                currencyResolution: "fallback",
              },
              methodology: input.methodology,
            });
            return {
              package: pkg,
              context: {
                organizationId: "org",
                trusted: {} as never,
                composedTrustedContext: "trusted",
                operatorGuidanceBlock: "OPERATOR PROJECT GUIDANCE",
                geoCurrency: {
                  geographyLabel: null,
                  currencyCode: "USD",
                  currencyResolution: "fallback" as const,
                },
                meta: {} as never,
              },
            };
          },
          jobOps: jobOps.ops,
        },
      },
    );

    assert.equal(status, "completed");
    assert.equal(stagesSeen.length, 1);
    assert.ok(jobOps.stages.includes("asserting_authorization"));
    assert.ok(jobOps.stages.includes("loading_instruction"));
    assert.ok(jobOps.stages.includes("assembling_context"));
    assert.ok(jobOps.stages.includes("generating_estimate"));
    assert.ok(jobOps.stages.includes("validating"));
    assert.equal(jobOps.completes.length, 1);
    assert.equal(
      (jobOps.completes[0] as AthenaEstimatePackage).schemaVersion,
      "estimate_v1",
    );

    const executor = read(
      "services/estimate/estimateGenerationJobs/estimateGenerationJobExecutor.ts",
    );
    assert.match(executor, /completeEstimateGenerationJobWithClaim|jobOps\.complete/);
    assert.doesNotMatch(executor, /\.from\("athena_estimates"\)\.update/);
  });

  it("27/28. no tenant intelligence writes; no web/search/external pricing APIs", () => {
    const pipeline = read("services/estimate/estimateGenerationPipeline.ts");
    const executor = read(
      "services/estimate/estimateGenerationJobs/estimateGenerationJobExecutor.ts",
    );
    const promptsDir = "services/ai/prompts/estimate";
    assert.equal(existsSync(join(ROOT, promptsDir)), true);

    for (const src of [pipeline, executor]) {
      assert.doesNotMatch(
        src,
        /\bweb\.run\b|\bserpapi\b|\bsemrush\b|\bahrefs\b|\bexchangerate\b/i,
      );
      assert.doesNotMatch(
        src,
        /insertBrain|upsertPersona|writeSeoReport|from\("personas"\)\.insert/i,
      );
    }

    const routing = read("lib/llm/modelRouting.ts");
    assert.match(routing, /estimate_package/);
    assert.match(routing, /premiumStrategicOutput/);

    // L7 owns Master UI; L5 generation must not add tenant Estimate routes.
    assert.equal(existsSync(join(ROOT, "app/estimate")), false);
  });

  it("happy-path executor: relationship before methodology before pipeline", async () => {
    const order: string[] = [];
    const jobOps = mockJobOps();

    const status = await executeClaimedEstimateGenerationJob(
      "worker-1",
      { job: claimedJob(), claimToken: "claim-token" },
      {
        deps: {
          getEstimate: async () => {
            order.push("estimate");
            return queuedEstimate();
          },
          resolveMasterUserId: async () => {
            order.push("resolveMaster");
            return "master-1";
          },
          assertOwnsSubAccount: async () => {
            order.push("assert");
            return {
              licenseeAccountId: "lic",
              organizationId: "org",
              relationshipId: "rel",
            };
          },
          getMethodology: async () => {
            order.push("methodology");
            return METHODOLOGY;
          },
          runPipeline: async () => {
            order.push("pipeline");
            const pkg = normalizeAndValidateEstimatePackage({
              raw: baseModelPackage(),
              geoCurrency: {
                geographyLabel: null,
                currencyCode: "USD",
                currencyResolution: "fallback",
              },
              methodology: METHODOLOGY,
            });
            return {
              package: pkg,
              context: {
                organizationId: "org",
                trusted: {} as never,
                composedTrustedContext: "trusted",
                operatorGuidanceBlock: "OPERATOR PROJECT GUIDANCE",
                geoCurrency: {
                  geographyLabel: null,
                  currencyCode: "USD",
                  currencyResolution: "fallback" as const,
                },
                meta: {} as never,
              },
            };
          },
          jobOps: jobOps.ops,
        },
      },
    );

    assert.equal(status, "completed");
    assert.deepEqual(order, [
      "estimate",
      "resolveMaster",
      "assert",
      "methodology",
      "pipeline",
    ]);
  });
});
