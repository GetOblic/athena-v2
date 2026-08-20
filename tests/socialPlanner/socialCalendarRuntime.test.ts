import "./socialPlannerTestEnv";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SOCIAL_PLANNER_SOCIAL_MEMORY_SCHEMA_VERSION } from "../../services/socialPlanner/diversity/socialPlannerSocialMemoryTypes";
import { SOCIAL_PLANNER_DIVERSITY_ALGORITHM_VERSION } from "../../services/socialPlanner/diversity/socialPlannerSocialMemoryTypes";
import {
  SocialCalendarPackageValidationError,
  SocialPlannerGenerationError,
  SocialPlannerSocialMemoryError,
} from "../../services/socialPlanner/generation/socialPlannerGenerationErrors";
import { SocialPlannerIntelligenceError } from "../../services/socialPlanner/intelligence/socialPlannerIntelligenceTypes";
import {
  classifySocialCalendarExecutorError,
  executeClaimedSocialCalendarGenerationJob,
} from "../../services/socialPlanner/socialCalendarGenerationJobs/socialCalendarGenerationJobExecutor";
import type { AthenaSocialCalendarGenerationJob } from "../../services/socialPlanner/socialCalendarGenerationJobs/socialCalendarGenerationJobTypes";
import { mapSocialCalendarRow } from "../../services/socialPlanner/socialCalendarMappers";
import { buildFrozenSocialCalendarProvenance } from "../../services/socialPlanner/socialCalendarProvenance";
import type { SocialCalendar } from "../../services/socialPlanner/socialCalendarTypes";
import {
  TEST_ORG,
  TEST_PERIOD_END,
  TEST_PERIOD_START,
  buildGenerationContext,
  buildValidatedPackage,
} from "./socialPlannerGenerationFixtures";

function jobRow(): AthenaSocialCalendarGenerationJob {
  return {
    id: "job-1",
    organization_id: TEST_ORG,
    calendar_id: "cal-1",
    status: "processing",
    generation_stage: "queued",
    attempt_count: 1,
    max_attempts: 3,
    claimed_by: "worker-1",
    claim_token: "token-1",
    claimed_at: "2026-08-20T00:00:00.000Z",
    claim_expires_at: "2026-08-20T00:02:00.000Z",
    heartbeat_at: "2026-08-20T00:00:00.000Z",
    next_attempt_at: null,
    error_code: null,
    error_message: null,
    error_metadata: null,
    requested_by: "user-1",
    started_at: "2026-08-20T00:00:00.000Z",
    completed_at: null,
    created_at: "2026-08-20T00:00:00.000Z",
    updated_at: "2026-08-20T00:00:00.000Z",
  };
}

function calendarRecord(
  overrides: Partial<Record<string, unknown>> = {},
): SocialCalendar {
  return mapSocialCalendarRow({
    id: "cal-1",
    organization_id: TEST_ORG,
    user_id: "user-1",
    period_start: TEST_PERIOD_START,
    period_end: TEST_PERIOD_END,
    user_guidance: null,
    generation_mode: "standard",
    source_calendar_id: null,
    root_calendar_id: null,
    version_number: 1,
    status: "Processing",
    generation_stage: "queued",
    package_json: null,
    provenance_json: {},
    calendar_context_json: {},
    error_code: null,
    error_message: null,
    created_at: "2026-08-20T00:00:00.000Z",
    updated_at: "2026-08-20T00:00:00.000Z",
    ...overrides,
  });
}

describe("Social Planner L6 executor", () => {
  it("classifies retryable provider failures and permanent validation failures", () => {
    const retryable = classifySocialCalendarExecutorError(
      new SocialPlannerGenerationError({
        code: "PROVIDER_FAILURE",
        message: "OpenRouter timeout",
        stage: "assets",
        retryable: true,
      }),
    );
    assert.equal(retryable.retryable, true);
    assert.equal(retryable.code, "PROVIDER_FAILURE");

    const network = classifySocialCalendarExecutorError(
      new Error("fetch failed: econnreset"),
    );
    assert.equal(network.retryable, true);

    const deterministic = classifySocialCalendarExecutorError(
      new SocialPlannerGenerationError({
        code: "HISTORICAL_DIVERSITY_REPAIR_FAILED",
        message: "Still repeated recent combinations.",
        stage: "diversity_repair",
        retryable: false,
      }),
    );
    assert.equal(deterministic.retryable, false);

    const tenant = classifySocialCalendarExecutorError(
      new SocialPlannerSocialMemoryError({
        reason: "FOREIGN_ORGANIZATION",
        message: "Foreign organization history.",
        retryable: false,
      }),
    );
    assert.equal(tenant.retryable, false);

    const intelligence = classifySocialCalendarExecutorError(
      new SocialPlannerIntelligenceError(
        "CROSS_TENANT_CONTAMINATION",
        "Foreign row.",
      ),
    );
    assert.equal(intelligence.retryable, false);

    const packageValidation = classifySocialCalendarExecutorError(
      new SocialCalendarPackageValidationError("structural", [
        "assets[0].productionSpec.slides must be an array.",
        "assets[0].productionSpec.visualDirection is required.",
      ]),
    );
    assert.equal(packageValidation.retryable, false);
    assert.equal(packageValidation.code, "PACKAGE_VALIDATION_FAILED");
    assert.deepEqual(packageValidation.failures, [
      "assets[0].productionSpec.slides must be an array.",
      "assets[0].productionSpec.visualDirection is required.",
    ]);
  });

  it("loads the calendar, composes L3, generates once, and completes with three payloads", async () => {
    const context = buildGenerationContext();
    const socialPackage = buildValidatedPackage(context);
    const calls: string[] = [];
    let completed: Record<string, unknown> | null = null;

    const status = await executeClaimedSocialCalendarGenerationJob(
      "worker-1",
      { job: jobRow(), claimToken: "token-1" },
      {
        deps: {
          getCalendar: async () => calendarRecord(),
          loadGeographyEvidence: async () => ({
            executiveGeographicReach: "United States",
          }),
          composeIntelligence: async () => {
            calls.push("compose");
            return context;
          },
          generate: async () => {
            calls.push("generate");
            return {
              package: socialPackage,
              generationProvenance: {
                ...socialPackage.generationMetadata,
                socialMemorySchemaVersion:
                  SOCIAL_PLANNER_SOCIAL_MEMORY_SCHEMA_VERSION,
                diversityAlgorithmVersion:
                  SOCIAL_PLANNER_DIVERSITY_ALGORITHM_VERSION,
                historicalDiversityCheckVersion:
                  SOCIAL_PLANNER_DIVERSITY_ALGORITHM_VERSION,
                historicalCalendarsConsidered: 2,
                historicalAssetsConsidered: 14,
                highestHistoricalSimilarity: 0.2,
                weekHistoricalSimilarity: 0.1,
                historicalDiversityRepairUsed: false,
                diversityRepairPromptVersion: null,
              },
              socialMemory: {
                schemaVersion: SOCIAL_PLANNER_SOCIAL_MEMORY_SCHEMA_VERSION,
                organizationId: TEST_ORG,
                calendarsConsidered: 2,
                calendarsIncluded: 2,
                historicalAssets: [],
                historicalWeeks: [],
                recencyWindow: {
                  maxCalendars: 10,
                  maxAssets: 70,
                  composedTextMaxChars: 8000,
                },
                diagnostics: {
                  calendarsConsidered: 2,
                  calendarsIncluded: 2,
                  assetsIncluded: 14,
                  earliestHistoricalCreatedAt: null,
                  latestHistoricalCreatedAt: null,
                  malformedPackagesSkipped: 0,
                  invalidFingerprintRowsSkipped: 0,
                  memoryCharacterCount: 0,
                  truncated: false,
                },
                composedText: "",
              },
              historicalDiversity: {
                accepted: true,
                overallScore: 0.2,
                highestAssetSimilarity: 0.2,
                weekSimilarity: 0.1,
                violations: [],
                warnings: [],
                comparisons: [],
              },
            };
          },
          historyLoader: {
            async listReadyCalendars() {
              calls.push("history");
              return [];
            },
          },
          heartbeat: async ({ stage }) => {
            calls.push(`heartbeat:${stage ?? ""}`);
            return jobRow();
          },
          complete: async (input) => {
            completed = input as unknown as Record<string, unknown>;
            calls.push("complete");
            return { ...jobRow(), status: "completed" };
          },
          fail: async () => {
            calls.push("fail");
            return { ...jobRow(), status: "failed" };
          },
        },
      },
    );

    assert.equal(status, "completed");
    assert.deepEqual(
      calls.filter((entry) => entry === "generate"),
      ["generate"],
    );
    assert.ok(calls.includes("compose"));
    assert.ok(completed);
    assert.equal(
      (completed.packageJson as { schemaVersion?: string }).schemaVersion,
      "social_calendar_package_v1",
    );
    assert.equal(
      (completed.calendarContextJson as { schemaVersion?: string }).schemaVersion,
      "social_calendar_context_v1",
    );
    assert.equal(
      (completed.provenanceJson as { generationMode?: string }).generationMode,
      "standard",
    );
    assert.equal("socialMemory" in (completed.provenanceJson as object), false);
    assert.equal("composedText" in (completed.provenanceJson as object), false);
    assert.ok(!calls.includes("fail"));
  });

  it("does not regenerate a Ready calendar and completes with frozen payloads", async () => {
    const context = buildGenerationContext();
    const socialPackage = buildValidatedPackage(context);
    const frozenContext = context.calendarContext;
    const frozenProvenance = buildFrozenSocialCalendarProvenance({
      context,
      calendarContext: frozenContext,
      generationProvenance: {
        ...socialPackage.generationMetadata,
        socialMemorySchemaVersion: SOCIAL_PLANNER_SOCIAL_MEMORY_SCHEMA_VERSION,
        diversityAlgorithmVersion: SOCIAL_PLANNER_DIVERSITY_ALGORITHM_VERSION,
        historicalDiversityCheckVersion: SOCIAL_PLANNER_DIVERSITY_ALGORITHM_VERSION,
        historicalCalendarsConsidered: 1,
        historicalAssetsConsidered: 7,
        highestHistoricalSimilarity: 0.1,
        weekHistoricalSimilarity: 0.1,
        historicalDiversityRepairUsed: false,
        diversityRepairPromptVersion: null,
      },
    });
    let generateCalls = 0;
    let completePayload: Record<string, unknown> | null = null;

    const status = await executeClaimedSocialCalendarGenerationJob(
      "worker-1",
      { job: jobRow(), claimToken: "token-1" },
      {
        deps: {
          getCalendar: async () =>
            calendarRecord({
              status: "Ready",
              package_json: socialPackage,
              calendar_context_json: frozenContext,
              provenance_json: frozenProvenance,
            }),
          composeIntelligence: async () => {
            throw new Error("compose should not run for Ready calendars");
          },
          generate: async () => {
            generateCalls += 1;
            throw new Error("generate should not run for Ready calendars");
          },
          heartbeat: async () => jobRow(),
          complete: async (input) => {
            completePayload = input as unknown as Record<string, unknown>;
            return { ...jobRow(), status: "completed" };
          },
          fail: async () => ({ ...jobRow(), status: "failed" }),
        },
      },
    );

    assert.equal(status, "completed");
    assert.equal(generateCalls, 0);
    assert.equal(completePayload?.packageJson, socialPackage);
    assert.equal(completePayload?.calendarContextJson, frozenContext);
    assert.equal(completePayload?.provenanceJson, frozenProvenance);
  });

  it("fails closed on missing calendar or unsupported generation mode", async () => {
    const missing = await executeClaimedSocialCalendarGenerationJob(
      "worker-1",
      { job: jobRow(), claimToken: "token-1" },
      {
        deps: {
          getCalendar: async () => null,
          heartbeat: async () => jobRow(),
          complete: async () => jobRow(),
          fail: async (input) => ({
            ...jobRow(),
            status: "failed",
            error_code: input.errorCode,
          }),
        },
      },
    );
    assert.equal(missing, "failed");

    const unsupported = await executeClaimedSocialCalendarGenerationJob(
      "worker-1",
      { job: jobRow(), claimToken: "token-1" },
      {
        deps: {
          getCalendar: async () =>
            calendarRecord({ generation_mode: "conversation_revision" }),
          heartbeat: async () => jobRow(),
          complete: async () => jobRow(),
          fail: async (input) => ({
            ...jobRow(),
            status: input.retryable ? "retryable" : "failed",
            error_code: input.errorCode,
          }),
        },
      },
    );
    assert.equal(unsupported, "failed");
  });

  it("marks provider failures retryable and deterministic failures permanent", async () => {
    const retryable = await executeClaimedSocialCalendarGenerationJob(
      "worker-1",
      { job: jobRow(), claimToken: "token-1" },
      {
        deps: {
          getCalendar: async () => calendarRecord(),
          loadGeographyEvidence: async () => ({}),
          composeIntelligence: async () => buildGenerationContext(),
          generate: async () => {
            throw new SocialPlannerGenerationError({
              code: "PROVIDER_FAILURE",
              message: "temporary provider failure",
              stage: "assets",
              retryable: true,
            });
          },
          heartbeat: async () => jobRow(),
          complete: async () => jobRow(),
          fail: async (input) => ({
            ...jobRow(),
            status: input.retryable ? "retryable" : "failed",
            error_code: input.errorCode,
          }),
        },
      },
    );
    assert.equal(retryable, "retryable");

    const permanent = await executeClaimedSocialCalendarGenerationJob(
      "worker-1",
      { job: jobRow(), claimToken: "token-1" },
      {
        deps: {
          getCalendar: async () => calendarRecord(),
          loadGeographyEvidence: async () => ({}),
          composeIntelligence: async () => buildGenerationContext(),
          generate: async () => {
            throw new SocialPlannerGenerationError({
              code: "PACKAGE_VALIDATION_FAILED",
              message: "deterministic package failure",
              stage: "validation",
              retryable: false,
            });
          },
          heartbeat: async () => jobRow(),
          complete: async () => jobRow(),
          fail: async (input) => ({
            ...jobRow(),
            status: input.retryable ? "retryable" : "failed",
            error_code: input.errorCode,
          }),
        },
      },
    );
    assert.equal(permanent, "failed");
  });

  it("persists bounded validation failures in error_metadata and worker logs", async () => {
    const failures = [
      "assets[0].productionSpec.slides must be an array.",
      "assets[0].productionSpec.visualDirection is required.",
    ];
    let failInput: Record<string, unknown> | null = null;
    const logs: unknown[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      logs.push(args);
    };

    try {
      const status = await executeClaimedSocialCalendarGenerationJob(
        "worker-1",
        { job: jobRow(), claimToken: "token-1" },
        {
          deps: {
            getCalendar: async () => calendarRecord(),
            loadGeographyEvidence: async () => ({}),
            composeIntelligence: async () => buildGenerationContext(),
            generate: async () => {
              throw new SocialPlannerGenerationError({
                code: "REPAIR_VALIDATION_FAILED",
                message: failures[0],
                stage: "repair_validation",
                retryable: false,
                failures,
              });
            },
            heartbeat: async () => jobRow(),
            complete: async () => jobRow(),
            fail: async (input) => {
              failInput = input as unknown as Record<string, unknown>;
              return {
                ...jobRow(),
                status: "failed",
                error_code: input.errorCode,
                error_message: input.errorMessage,
                error_metadata: input.errorMetadata ?? null,
              };
            },
          },
        },
      );

      assert.equal(status, "failed");
      assert.ok(failInput);
      assert.equal(failInput.errorCode, "REPAIR_VALIDATION_FAILED");
      assert.equal(failInput.errorMessage, failures[0]);
      assert.deepEqual(failInput.errorMetadata, { failures });
      const executeFailed = logs.find(
        (entry) =>
          Array.isArray(entry) &&
          entry[0] === "[ATHENA_SOCIAL_PLANNER_JOBS] execute_failed",
      ) as unknown[] | undefined;
      assert.ok(executeFailed);
      const payload = executeFailed[1] as Record<string, unknown>;
      assert.equal(payload.code, "REPAIR_VALIDATION_FAILED");
      assert.equal(payload.message, failures[0]);
      assert.deepEqual(payload.failures, failures);
      assert.equal("prompt" in payload, false);
      assert.doesNotMatch(JSON.stringify(payload), /generateReview|systemPrompt/);
    } finally {
      console.error = originalError;
    }
  });

  it("builds compact provenance without dumping L3 context or Social Memory", () => {
    const context = buildGenerationContext();
    const socialPackage = buildValidatedPackage(context);
    const provenance = buildFrozenSocialCalendarProvenance({
      context,
      calendarContext: context.calendarContext,
      generationProvenance: {
        ...socialPackage.generationMetadata,
        socialMemorySchemaVersion: SOCIAL_PLANNER_SOCIAL_MEMORY_SCHEMA_VERSION,
        diversityAlgorithmVersion: SOCIAL_PLANNER_DIVERSITY_ALGORITHM_VERSION,
        historicalDiversityCheckVersion: SOCIAL_PLANNER_DIVERSITY_ALGORITHM_VERSION,
        historicalCalendarsConsidered: 3,
        historicalAssetsConsidered: 21,
        highestHistoricalSimilarity: 0.31,
        weekHistoricalSimilarity: 0.22,
        historicalDiversityRepairUsed: true,
        diversityRepairPromptVersion: "social_planner_diversity_repair_v1",
      },
    });

    assert.equal(provenance.generationMode, "standard");
    assert.equal(provenance.historicalCalendarsConsidered, 3);
    assert.equal(provenance.holidayProvider, "date-holidays");
    assert.equal("composedText" in provenance, false);
    assert.equal("socialMemory" in provenance, false);
    assert.equal("calendarContext" in provenance, false);
  });
});
