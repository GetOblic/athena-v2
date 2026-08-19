import "./socialPlannerTestEnv";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { SOCIAL_PLANNER_SOCIAL_MEMORY_SCHEMA_VERSION } from "../../services/socialPlanner/diversity/socialPlannerSocialMemoryTypes";
import { SOCIAL_PLANNER_DIVERSITY_ALGORITHM_VERSION } from "../../services/socialPlanner/diversity/socialPlannerSocialMemoryTypes";
import { executeClaimedSocialCalendarGenerationJob } from "../../services/socialPlanner/socialCalendarGenerationJobs/socialCalendarGenerationJobExecutor";
import type { AthenaSocialCalendarGenerationJob } from "../../services/socialPlanner/socialCalendarGenerationJobs/socialCalendarGenerationJobTypes";
import { mapSocialCalendarRow } from "../../services/socialPlanner/socialCalendarMappers";
import type { SocialCalendar } from "../../services/socialPlanner/socialCalendarTypes";
import {
  TEST_ORG,
  TEST_PERIOD_END,
  TEST_PERIOD_START,
  buildAlternatePackageRaw,
  buildGenerationContext,
  buildValidatedPackage,
} from "./socialPlannerGenerationFixtures";
import { SOCIAL_PLANNER_SOURCE_DIVERGENCE_ALGORITHM_VERSION } from "../../services/socialPlanner/thinkDifferently/socialPlannerThinkDifferentlyTypes";

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function jobRow(): AthenaSocialCalendarGenerationJob {
  return {
    id: "job-td-1",
    organization_id: TEST_ORG,
    calendar_id: "cal-v2",
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
    id: "cal-v2",
    organization_id: TEST_ORG,
    user_id: "user-1",
    period_start: TEST_PERIOD_START,
    period_end: TEST_PERIOD_END,
    user_guidance: "Focus this week on our new laser treatment.",
    generation_mode: "think_differently",
    source_calendar_id: "cal-v1",
    root_calendar_id: "cal-v1",
    version_number: 2,
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

describe("Social Planner L8 worker mode routing", () => {
  it("routes think_differently through the L8 path and reuses frozen source context", async () => {
    const context = buildGenerationContext();
    const sourcePackage = buildValidatedPackage(context);
    const candidate = buildValidatedPackage(context, buildAlternatePackageRaw(context));
    const frozenContext = context.calendarContext;
    const calendars = new Map<string, SocialCalendar>([
      [
        "cal-v2",
        calendarRecord(),
      ],
      [
        "cal-v1",
        calendarRecord({
          id: "cal-v1",
          generation_mode: "standard",
          source_calendar_id: null,
          root_calendar_id: null,
          version_number: 1,
          status: "Ready",
          package_json: sourcePackage as unknown as Record<string, unknown>,
          calendar_context_json: frozenContext as unknown as Record<string, unknown>,
        }),
      ],
    ]);
    let completed: Record<string, unknown> | null = null;
    let composeInput: Record<string, unknown> | null = null;
    let standardGenerate = 0;
    let thinkGenerate = 0;

    const status = await executeClaimedSocialCalendarGenerationJob(
      "worker-1",
      { job: jobRow(), claimToken: "token-1" },
      {
        deps: {
          getCalendar: async (id) => calendars.get(id) ?? null,
          composeIntelligence: async (input) => {
            composeInput = input as unknown as Record<string, unknown>;
            return {
              ...context,
              calendarContext: input.calendarContext ?? context.calendarContext,
            };
          },
          generate: async () => {
            standardGenerate += 1;
            throw new Error("standard path must not run");
          },
          generateThinkDifferently: async (input) => {
            thinkGenerate += 1;
            assert.equal(input.sourcePackage.schemaVersion, sourcePackage.schemaVersion);
            assert.equal(input.userGuidance, "Focus this week on our new laser treatment.");
            assert.equal(input.derivativeVersionNumber, 2);
            return {
              package: candidate,
              generationProvenance: {
                ...candidate.generationMetadata,
                generationMode: "think_differently" as const,
                socialMemorySchemaVersion: SOCIAL_PLANNER_SOCIAL_MEMORY_SCHEMA_VERSION,
                diversityAlgorithmVersion: SOCIAL_PLANNER_DIVERSITY_ALGORITHM_VERSION,
                historicalDiversityCheckVersion: SOCIAL_PLANNER_DIVERSITY_ALGORITHM_VERSION,
                historicalCalendarsConsidered: 1,
                historicalAssetsConsidered: 7,
                highestHistoricalSimilarity: 0.2,
                weekHistoricalSimilarity: 0.1,
                historicalDiversityRepairUsed: false,
                diversityRepairPromptVersion: null,
                thinkDifferentlyPromptVersion: "social_planner_think_differently_v1",
                thinkDifferentlyRepairPromptVersion: null,
                sourceDivergenceAlgorithmVersion:
                  SOCIAL_PLANNER_SOURCE_DIVERGENCE_ALGORITHM_VERSION,
                sourceCalendarId: "cal-v1",
                rootCalendarId: "cal-v1",
                sourceVersionNumber: 1,
                newVersionNumber: 2,
                sourceWeekSimilarity: 0.3,
                highestSourceAssetSimilarity: 0.25,
                sourceDivergenceRepairUsed: false,
              },
              socialMemory: {
                schemaVersion: SOCIAL_PLANNER_SOCIAL_MEMORY_SCHEMA_VERSION,
                organizationId: TEST_ORG,
                calendarsConsidered: 1,
                calendarsIncluded: 1,
                historicalAssets: [],
                historicalWeeks: [],
                recencyWindow: {
                  maxCalendars: 10,
                  maxAssets: 70,
                  composedTextMaxChars: 8000,
                },
                diagnostics: {
                  calendarsConsidered: 1,
                  calendarsIncluded: 1,
                  assetsIncluded: 7,
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
              sourcePackage,
              sourceNegativeContext: {
                schemaVersion: "social_planner_source_negative_v1",
                period: sourcePackage.period,
                strategySummary: sourcePackage.strategySummary,
                weeklyCreativeDirection: sourcePackage.whyThisWeekWorks,
                weekFingerprint: sourcePackage.weekFingerprint,
                days: [],
              },
              sourceDivergence: {
                accepted: true,
                sourceWeekSimilarity: 0.3,
                highestSourceAssetSimilarity: 0.25,
                formatChangeScore: 0.5,
                archetypeChangeScore: 0.5,
                topicTreatmentChangeScore: 0.5,
                hookChangeScore: 1,
                materiallyDifferentDays: 7,
                days: [],
                violations: [],
              },
              sourceDivergenceRepairUsed: false,
            };
          },
          heartbeat: async () => jobRow(),
          complete: async (input) => {
            completed = input as unknown as Record<string, unknown>;
            return { ...jobRow(), status: "completed" };
          },
          fail: async () => ({ ...jobRow(), status: "failed" }),
        },
      },
    );

    assert.equal(status, "completed");
    assert.equal(standardGenerate, 0);
    assert.equal(thinkGenerate, 1);
    assert.equal(
      (composeInput?.calendarContext as { schemaVersion?: string } | undefined)
        ?.schemaVersion,
      frozenContext.schemaVersion,
    );
    assert.equal("periodStart" in (composeInput ?? {}), false);
    assert.equal(
      (completed?.provenanceJson as { generationMode?: string }).generationMode,
      "think_differently",
    );
    assert.equal(
      (completed?.provenanceJson as { sourceCalendarId?: string }).sourceCalendarId,
      "cal-v1",
    );
    assert.equal(
      (completed?.calendarContextJson as { schemaVersion?: string }).schemaVersion,
      frozenContext.schemaVersion,
    );
    assert.equal(
      (completed?.packageJson as { schemaVersion?: string }).schemaVersion,
      candidate.schemaVersion,
    );
  });

  it("does not route unknown modes to standard and keeps Think Differently isolated", async () => {
    const failed = await executeClaimedSocialCalendarGenerationJob(
      "worker-1",
      { job: jobRow(), claimToken: "token-1" },
      {
        deps: {
          getCalendar: async () =>
            calendarRecord({ generation_mode: "regenerate" }),
          generate: async () => {
            throw new Error("standard must not run");
          },
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
    assert.equal(failed, "failed");

    const executor = read(
      "services/socialPlanner/socialCalendarGenerationJobs/socialCalendarGenerationJobExecutor.ts",
    );
    assert.match(executor, /generationMode: "standard"/);
    assert.match(executor, /generation_mode === "think_differently"/);
    assert.match(executor, /generation_mode === "conversation_revision"/);
    assert.match(executor, /UNSUPPORTED_GENERATION_MODE/);
    assert.doesNotMatch(executor, /thinkDifferentlyWorkflow/);
  });

  it("fails permanently on missing, foreign, or unusable source calendars", async () => {
    const missing = await executeClaimedSocialCalendarGenerationJob(
      "worker-1",
      { job: jobRow(), claimToken: "token-1" },
      {
        deps: {
          getCalendar: async (id) =>
            id === "cal-v2" ? calendarRecord() : null,
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
  });

  it("does not overwrite a Ready derivative or touch the source calendar", async () => {
    const context = buildGenerationContext();
    const socialPackage = buildValidatedPackage(context);
    let generateCalls = 0;
    const status = await executeClaimedSocialCalendarGenerationJob(
      "worker-1",
      { job: jobRow(), claimToken: "token-1" },
      {
        deps: {
          getCalendar: async () =>
            calendarRecord({
              status: "Ready",
              package_json: socialPackage as unknown as Record<string, unknown>,
              calendar_context_json: context.calendarContext as unknown as Record<
                string,
                unknown
              >,
              provenance_json: { generationMode: "think_differently" },
            }),
          generateThinkDifferently: async () => {
            generateCalls += 1;
            throw new Error("must not regenerate");
          },
          heartbeat: async () => jobRow(),
          complete: async (input) => {
            assert.equal(input.packageJson, socialPackage);
            return { ...jobRow(), status: "completed" };
          },
          fail: async () => jobRow(),
        },
      },
    );
    assert.equal(status, "completed");
    assert.equal(generateCalls, 0);
  });
});
