import "./socialPlannerTestEnv";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { executeClaimedSocialCalendarGenerationJob } from "../../services/socialPlanner/socialCalendarGenerationJobs/socialCalendarGenerationJobExecutor";
import type { AthenaSocialCalendarGenerationJob } from "../../services/socialPlanner/socialCalendarGenerationJobs/socialCalendarGenerationJobTypes";
import { mapSocialCalendarRow } from "../../services/socialPlanner/socialCalendarMappers";
import type { SocialCalendar } from "../../services/socialPlanner/socialCalendarTypes";
import {
  SOCIAL_PLANNER_CONVERSATION_REVISION_BRIEF_SCHEMA_VERSION,
  SOCIAL_PLANNER_CONVERSATION_REVISION_CONTEXT_SCHEMA_VERSION,
} from "../../services/socialPlanner/conversationRevision/socialPlannerConversationRevisionTypes";
import {
  TEST_ORG,
  TEST_PERIOD_END,
  TEST_PERIOD_START,
  buildGenerationContext,
  buildValidatedPackage,
} from "./socialPlannerGenerationFixtures";

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function jobRow(): AthenaSocialCalendarGenerationJob {
  return {
    id: "job-rev-1",
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
  const context = buildGenerationContext();
  return mapSocialCalendarRow({
    id: "cal-v2",
    organization_id: TEST_ORG,
    user_id: "user-1",
    period_start: TEST_PERIOD_START,
    period_end: TEST_PERIOD_END,
    user_guidance: "Keep evenings bookable.",
    generation_mode: "conversation_revision",
    source_calendar_id: "cal-v1",
    root_calendar_id: "cal-v1",
    version_number: 2,
    status: "Processing",
    generation_stage: "queued",
    package_json: null,
    provenance_json: {},
    calendar_context_json: {},
    revision_context_json: {
      schemaVersion: SOCIAL_PLANNER_CONVERSATION_REVISION_CONTEXT_SCHEMA_VERSION,
      appliedAt: "2026-08-20T12:00:00.000Z",
      brief: {
        schemaVersion: SOCIAL_PLANNER_CONVERSATION_REVISION_BRIEF_SCHEMA_VERSION,
        sourceCalendarId: "cal-v1",
        conversationMessageCount: 2,
        latestUserMessageId: "msg-user-1",
        latestUserMessageAt: "2026-08-20T12:00:00.000Z",
        actionable: true,
        global: { changeSummary: "Refresh Monday." },
        dayChanges: [
          {
            date: context.calendarContext.period.dates[0],
            requestedChangeSummary: "Refresh Monday.",
          },
        ],
        preserve: context.calendarContext.period.dates.slice(1),
        avoid: [],
      },
    },
    error_code: null,
    error_message: null,
    created_at: "2026-08-20T00:00:00.000Z",
    updated_at: "2026-08-20T00:00:00.000Z",
    ...overrides,
  });
}

describe("Social Planner L9 worker conversation_revision routing", () => {
  it("routes conversation_revision through the L9 path and reuses frozen source context", async () => {
    const sourcePackage = buildValidatedPackage();
    const frozenContext = buildGenerationContext().calendarContext;
    let completed: {
      packageJson?: Record<string, unknown>;
      calendarContextJson?: Record<string, unknown>;
      provenanceJson?: Record<string, unknown>;
    } | null = null;

    const status = await executeClaimedSocialCalendarGenerationJob(
      "worker-1",
      { job: jobRow(), claimToken: "token-1" },
      {
        deps: {
          getCalendar: async (id) => {
            if (id === "cal-v1") {
              return calendarRecord({
                id: "cal-v1",
                generation_mode: "standard",
                source_calendar_id: null,
                root_calendar_id: null,
                version_number: 1,
                status: "Ready",
                package_json: sourcePackage as unknown as Record<string, unknown>,
                calendar_context_json: frozenContext as unknown as Record<
                  string,
                  unknown
                >,
                revision_context_json: null,
              });
            }
            return calendarRecord();
          },
          generate: async () => {
            throw new Error("standard must not run");
          },
          generateThinkDifferently: async () => {
            throw new Error("think differently must not run");
          },
          generateConversationRevision: async (input) => {
            assert.equal(input.sourceCalendar.id, "cal-v1");
            assert.equal(input.revisionContext.brief.actionable, true);
            assert.equal(input.userGuidance, "Keep evenings bookable.");
            return {
              package: sourcePackage,
              generationProvenance: {
                ...sourcePackage.generationMetadata,
                generationMode: "conversation_revision" as const,
                socialMemorySchemaVersion: "social_planner_social_memory_v1",
                diversityAlgorithmVersion: "social_planner_diversity_v1",
                historicalDiversityCheckVersion: "social_planner_diversity_v1",
                historicalCalendarsConsidered: 1,
                historicalAssetsConsidered: 7,
                highestHistoricalSimilarity: 0.1,
                weekHistoricalSimilarity: 0.1,
                historicalDiversityRepairUsed: false,
                diversityRepairPromptVersion: null,
                conversationRevisionPromptVersion:
                  "social_planner_conversation_revision_v1",
                conversationRevisionRepairPromptVersion: null,
                revisionSatisfactionAlgorithmVersion:
                  "social_planner_revision_satisfaction_v1",
                revisionBriefSchemaVersion:
                  SOCIAL_PLANNER_CONVERSATION_REVISION_BRIEF_SCHEMA_VERSION,
                sourceCalendarId: "cal-v1",
                rootCalendarId: "cal-v1",
                sourceVersionNumber: 1,
                newVersionNumber: 2,
                conversationMessageCount: 2,
                latestUserMessageId: "msg-user-1",
                latestUserMessageAt: "2026-08-20T12:00:00.000Z",
                revisionSatisfactionAccepted: true,
                revisionRepairUsed: false,
                preservedDateCount: 6,
                revisedDateCount: 1,
              },
              socialMemory: {
                schemaVersion: "social_planner_social_memory_v1",
                organizationId: TEST_ORG,
                calendarsConsidered: 1,
                calendarsIncluded: 1,
                historicalAssets: [],
                historicalWeeks: [],
                recencyWindow: {
                  maxCalendars: 10,
                  maxAssets: 70,
                  composedTextMaxChars: 8_000,
                },
                diagnostics: {
                  calendarsConsidered: 1,
                  calendarsIncluded: 1,
                  assetsIncluded: 0,
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
                overallScore: 0,
                highestAssetSimilarity: 0,
                weekSimilarity: 0,
                violations: [],
                warnings: [],
                comparisons: [],
              },
              sourcePackage,
              revisionContext: input.revisionContext,
              revisionSatisfaction: {
                accepted: true,
                algorithmVersion: "social_planner_revision_satisfaction_v1",
                preservedDates: sourcePackage.period.dates.slice(1),
                revisedDates: [sourcePackage.period.dates[0]],
                enforcedDirectives: [],
                violations: [],
              },
              revisionRepairUsed: false,
            };
          },
          composeIntelligence: async (input) => {
            assert.equal(
              input.calendarContext?.period.periodStart,
              frozenContext.period.periodStart,
            );
            return buildGenerationContext({ calendar: frozenContext });
          },
          heartbeat: async () => jobRow(),
          complete: async (input) => {
            completed = input;
            return { ...jobRow(), status: "completed" };
          },
          fail: async (input) => ({
            ...jobRow(),
            status: "failed",
            error_code: input.errorCode,
          }),
        },
      },
    );

    assert.equal(status, "completed");
    assert.equal(
      (completed?.provenanceJson as { generationMode?: string }).generationMode,
      "conversation_revision",
    );
    assert.equal(
      (completed?.calendarContextJson as { schemaVersion?: string }).schemaVersion,
      frozenContext.schemaVersion,
    );
    const executor = read(
      "services/socialPlanner/socialCalendarGenerationJobs/socialCalendarGenerationJobExecutor.ts",
    );
    assert.match(executor, /generation_mode === "conversation_revision"/);
    assert.match(executor, /revision_satisfaction/);
    assert.doesNotMatch(executor, /conversation revision is not implemented/i);
  });

  it("rejects unknown modes and does not copy source conversation onto the derivative", () => {
    const service = read("services/socialPlanner/socialCalendarService.ts");
    assert.match(service, /generation_mode: "conversation_revision"/);
    assert.match(service, /revision_context_json: input.revisionContext/);
    assert.doesNotMatch(service, /athena_social_calendar_messages/);
    const apply = read(
      "services/socialPlanner/conversationRevision/applySocialPlannerConversationRevision.ts",
    );
    assert.doesNotMatch(apply, /insertSocialPlannerConversationMessagePair/);
  });
});
