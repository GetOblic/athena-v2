import "./socialPlannerTestEnv";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  SOCIAL_CALENDAR_GENERATION_MODES,
  isSocialCalendarGenerationMode,
} from "../../services/socialPlanner/socialCalendarTypes";
import {
  SOCIAL_CALENDAR_DEFAULT_PLANNER_KIND,
  SOCIAL_CALENDAR_IMPLEMENTED_PLANNER_KINDS,
  SOCIAL_CALENDAR_PLANNER_KINDS,
  SocialCalendarPlannerKindError,
  assertSocialCalendarPlannerKindImplemented,
  buildSocialCalendarQueuedProvenance,
  isSocialCalendarPlannerKind,
  lineageSocialCalendarQueuedProvenance,
  mergeSocialCalendarPlannerKindProvenance,
  normalizeSocialCalendarCreatePlannerKind,
  readSocialCalendarPlannerKind,
  resolveSocialCalendarPlannerKind,
} from "../../services/socialPlanner/socialCalendarPlannerKind";
import {
  SocialCalendarRequestError,
  normalizeSocialCalendarCreateRequest,
} from "../../services/socialPlanner/socialCalendarRequest";
import {
  toSocialCalendarDetailDto,
  toSocialCalendarListItemDto,
} from "../../services/socialPlanner/socialCalendarDto";
import { SOCIAL_CALENDAR_LIBRARY_SELECT } from "../../services/socialPlanner/socialCalendarService";
import { SOCIAL_CALENDAR_EVERGREEN_PACKAGE_SCHEMA_VERSION } from "../../services/socialPlanner/generation/socialCalendarEvergreenPackageTypes";
import { getLocalizedSocialPlannerPlannerKindLabel } from "../../lib/tenantI18n/socialPlannerPresentation";
import { en } from "../../lib/tenantI18n/messages/en";
import { executeClaimedSocialCalendarGenerationJob } from "../../services/socialPlanner/socialCalendarGenerationJobs/socialCalendarGenerationJobExecutor";
import type { AthenaSocialCalendarGenerationJob } from "../../services/socialPlanner/socialCalendarGenerationJobs/socialCalendarGenerationJobTypes";
import { mapSocialCalendarRow } from "../../services/socialPlanner/socialCalendarMappers";
import { readSocialPlannerTargetPersonaId } from "../../services/socialPlanner/socialPlannerTargetPersona";
import {
  TEST_ORG,
  TEST_PERIOD_END,
  TEST_PERIOD_START,
  buildGenerationContext,
} from "./socialPlannerGenerationFixtures";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const TARGET_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function jobRow(
  overrides: Partial<AthenaSocialCalendarGenerationJob> = {},
): AthenaSocialCalendarGenerationJob {
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
    ...overrides,
  };
}

function calendarRow(overrides: Record<string, unknown> = {}) {
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
    status: "Queued",
    generation_stage: "queued",
    package_json: null,
    provenance_json: {},
    calendar_context_json: {},
    revision_context_json: null,
    error_code: null,
    error_message: null,
    created_at: "2026-08-20T00:00:00.000Z",
    updated_at: "2026-08-20T00:00:00.000Z",
    ...overrides,
  });
}

describe("Social Planner plannerKind foundation", () => {
  it("accepts daily_social and knows evergreen without changing generation_mode", () => {
    assert.deepEqual(SOCIAL_CALENDAR_PLANNER_KINDS, [
      "daily_social",
      "evergreen",
    ]);
    assert.equal(isSocialCalendarPlannerKind("daily_social"), true);
    assert.equal(isSocialCalendarPlannerKind("evergreen"), true);
    assert.equal(isSocialCalendarPlannerKind("standard"), false);
    assert.deepEqual(SOCIAL_CALENDAR_GENERATION_MODES, [
      "standard",
      "think_differently",
      "conversation_revision",
    ]);
    assert.equal(isSocialCalendarGenerationMode("daily_social"), false);
    assert.equal(isSocialCalendarGenerationMode("evergreen"), false);
    assert.deepEqual(SOCIAL_CALENDAR_IMPLEMENTED_PLANNER_KINDS, [
      "daily_social",
      "evergreen",
    ]);
  });

  it("create entry points freeze plannerKind and reject it on the shared request body", () => {
    assert.equal(
      normalizeSocialCalendarCreatePlannerKind("daily_social"),
      "daily_social",
    );
    assert.equal(normalizeSocialCalendarCreatePlannerKind("evergreen"), "evergreen");
    const created = normalizeSocialCalendarCreateRequest({
      periodStart: TEST_PERIOD_START,
    });
    assert.equal("plannerKind" in created, false);
    assert.equal(created.generationMode, "standard");
    assert.throws(
      () =>
        normalizeSocialCalendarCreateRequest({
          periodStart: TEST_PERIOD_START,
          plannerKind: "evergreen",
        }),
      (error: unknown) =>
        error instanceof SocialCalendarRequestError &&
        error.code === "UNSUPPORTED_FIELD",
    );
    assert.throws(
      () => normalizeSocialCalendarCreatePlannerKind(undefined),
      (error: unknown) =>
        error instanceof SocialCalendarPlannerKindError &&
        error.code === "INVALID_PLANNER_KIND",
    );
    assert.throws(
      () => normalizeSocialCalendarCreatePlannerKind("weekly"),
      (error: unknown) =>
        error instanceof SocialCalendarPlannerKindError &&
        error.code === "INVALID_PLANNER_KIND",
    );
  });

  it("history and detail preserve in-flight Evergreen from provenance without a package", () => {
    assert.match(SOCIAL_CALENDAR_LIBRARY_SELECT, /provenance_json/);
    const libraryKeys = new Set(
      SOCIAL_CALENDAR_LIBRARY_SELECT.split(", ").map((key) => key.trim()),
    );
    const evergreenQueued = {
      id: "cal-evergreen-inflight",
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
      generation_stage: "generation",
      package_json: null,
      provenance_json: { plannerKind: "evergreen" },
      calendar_context_json: {},
      revision_context_json: null,
      error_code: null,
      error_message: null,
      created_at: "2026-08-20T00:00:00.000Z",
      updated_at: "2026-08-20T00:00:00.000Z",
    };
    const historyRow = Object.fromEntries(
      Object.entries(evergreenQueued).filter(([key]) => libraryKeys.has(key)),
    );
    const history = toSocialCalendarListItemDto(mapSocialCalendarRow(historyRow));
    const detail = toSocialCalendarDetailDto(
      mapSocialCalendarRow(evergreenQueued),
    );
    assert.equal(history.plannerKind, "evergreen");
    assert.equal(detail.plannerKind, "evergreen");
    assert.equal(
      getLocalizedSocialPlannerPlannerKindLabel(en, history.plannerKind),
      "Evergreen Content",
    );

    const missingKind = toSocialCalendarListItemDto(
      mapSocialCalendarRow({
        ...evergreenQueued,
        status: "Queued",
        provenance_json: {},
      }),
    );
    assert.equal(missingKind.plannerKind, "daily_social");
    assert.equal(
      getLocalizedSocialPlannerPlannerKindLabel(en, missingKind.plannerKind),
      "Daily Social Media",
    );

    const readyEvergreen = toSocialCalendarListItemDto(
      calendarRow({
        status: "Ready",
        provenance_json: { plannerKind: "evergreen" },
        package_json: {
          schemaVersion: SOCIAL_CALENDAR_EVERGREEN_PACKAGE_SCHEMA_VERSION,
          plannerKind: "evergreen",
        },
      }),
    );
    assert.equal(readyEvergreen.plannerKind, "evergreen");

    const readyHistoricalDaily = toSocialCalendarListItemDto(
      calendarRow({
        status: "Ready",
        provenance_json: {},
        package_json: { schemaVersion: "social_calendar_package_v1" },
      }),
    );
    assert.equal(readyHistoricalDaily.plannerKind, "daily_social");
  });

  it("missing historical plannerKind resolves daily_social", () => {
    assert.equal(resolveSocialCalendarPlannerKind(undefined), "daily_social");
    assert.equal(resolveSocialCalendarPlannerKind(null), "daily_social");
    assert.equal(resolveSocialCalendarPlannerKind(""), "daily_social");
    assert.equal(resolveSocialCalendarPlannerKind("unknown"), "daily_social");
    assert.equal(readSocialCalendarPlannerKind({}), "daily_social");
    assert.equal(readSocialCalendarPlannerKind(null), "daily_social");
    assert.equal(
      readSocialCalendarPlannerKind({ plannerKind: "evergreen" }),
      "evergreen",
    );
    const historical = toSocialCalendarDetailDto(calendarRow());
    assert.equal(historical.plannerKind, "daily_social");
  });

  it("provenance persists daily_social and lineage preserves source kind", () => {
    const queued = buildSocialCalendarQueuedProvenance({
      plannerKind: "daily_social",
      targetPersonaId: TARGET_ID,
    });
    assert.deepEqual(queued, {
      plannerKind: "daily_social",
      targetPersonaId: TARGET_ID,
    });

    const provenance = read("services/socialPlanner/socialCalendarProvenance.ts");
    assert.match(provenance, /plannerKind: SocialCalendarPlannerKind/);
    assert.match(provenance, /plannerKind,/);

    const preserved = lineageSocialCalendarQueuedProvenance(
      { plannerKind: "daily_social", targetPersonaId: TARGET_ID },
      readSocialPlannerTargetPersonaId,
    );
    assert.deepEqual(preserved, {
      plannerKind: "daily_social",
      targetPersonaId: TARGET_ID,
    });

    const historicalLineage = lineageSocialCalendarQueuedProvenance(
      {},
      readSocialPlannerTargetPersonaId,
    );
    assert.deepEqual(historicalLineage, { plannerKind: "daily_social" });

    assert.deepEqual(
      lineageSocialCalendarQueuedProvenance(
        { plannerKind: "evergreen" },
        readSocialPlannerTargetPersonaId,
      ),
      { plannerKind: "evergreen" },
    );

    assert.deepEqual(
      mergeSocialCalendarPlannerKindProvenance(
        { generationMode: "think_differently" },
        { plannerKind: "daily_social" },
      ),
      {
        generationMode: "think_differently",
        plannerKind: "daily_social",
      },
    );
  });

  it("evergreen never reaches Daily generation", async () => {
    assert.doesNotThrow(() =>
      assertSocialCalendarPlannerKindImplemented("evergreen"),
    );
    assert.doesNotThrow(() =>
      assertSocialCalendarPlannerKindImplemented("daily_social"),
    );

    const executor = read(
      "services/socialPlanner/socialCalendarGenerationJobs/socialCalendarGenerationJobExecutor.ts",
    );
    assert.match(executor, /plannerKind === "evergreen"/);
    assert.match(executor, /generateEvergreen/);
    assert.doesNotMatch(executor, /generateDeploymentAssets\(/);

    let dailyGenerateCalls = 0;
    let evergreenGenerateCalls = 0;
    const failed = await executeClaimedSocialCalendarGenerationJob(
      "worker-1",
      { job: jobRow(), claimToken: "token-1" },
      {
        deps: {
          getCalendar: async () =>
            calendarRow({
              status: "Processing",
              provenance_json: { plannerKind: "evergreen" },
            }),
          composeIntelligence: async () => buildGenerationContext(),
          loadGeographyEvidence: async () => ({
            executiveGeographicReach: null,
            deepWebsiteContactInformation: null,
          }),
          generate: async () => {
            dailyGenerateCalls += 1;
            throw new Error("Daily generation must not run for evergreen");
          },
          generateEvergreen: async () => {
            evergreenGenerateCalls += 1;
            throw new Error("stop after evergreen branch");
          },
          heartbeat: async () => jobRow(),
          complete: async () => {
            throw new Error("complete must not run");
          },
          fail: async (input) => ({
            ...jobRow(),
            status: "failed",
            error_code: input.errorCode,
          }),
        },
      },
    );
    assert.equal(failed, "failed");
    assert.equal(dailyGenerateCalls, 0);
    assert.equal(evergreenGenerateCalls, 1);
  });

  it("daily never reaches Evergreen generation", async () => {
    let dailyGenerateCalls = 0;
    let evergreenGenerateCalls = 0;
    const failed = await executeClaimedSocialCalendarGenerationJob(
      "worker-1",
      { job: jobRow(), claimToken: "token-1" },
      {
        deps: {
          getCalendar: async () =>
            calendarRow({
              status: "Processing",
              provenance_json: { plannerKind: "daily_social" },
            }),
          composeIntelligence: async () => buildGenerationContext(),
          loadGeographyEvidence: async () => ({
            executiveGeographicReach: null,
            deepWebsiteContactInformation: null,
          }),
          generate: async () => {
            dailyGenerateCalls += 1;
            throw new Error("stop after daily branch");
          },
          generateEvergreen: async () => {
            evergreenGenerateCalls += 1;
            throw new Error("Evergreen generation must not run for daily_social");
          },
          heartbeat: async () => jobRow(),
          complete: async () => {
            throw new Error("complete must not run");
          },
          fail: async (input) => ({
            ...jobRow(),
            status: "failed",
            error_code: input.errorCode,
          }),
        },
      },
    );
    assert.equal(failed, "failed");
    assert.equal(dailyGenerateCalls, 1);
    assert.equal(evergreenGenerateCalls, 0);
  });

  it("completion freeze writes plannerKind and historical missing kind stays daily_social", () => {
    const provenance = read("services/socialPlanner/socialCalendarProvenance.ts");
    assert.match(provenance, /plannerKind: SocialCalendarPlannerKind/);
    assert.match(
      provenance,
      /const plannerKind = input\.plannerKind \?\? SOCIAL_CALENDAR_DEFAULT_PLANNER_KIND/,
    );
    const executor = read(
      "services/socialPlanner/socialCalendarGenerationJobs/socialCalendarGenerationJobExecutor.ts",
    );
    assert.match(executor, /readSocialCalendarPlannerKind\(calendar\.provenance_json\)/);
    assert.match(executor, /mergeSocialCalendarPlannerKindProvenance/);
    assert.match(
      executor,
      /buildFrozenSocialCalendarProvenance\(\{[\s\S]*plannerKind,/,
    );
    const historical = toSocialCalendarDetailDto(
      calendarRow({
        provenance_json: {
          generationMode: "standard",
          packageSchemaVersion: "social_calendar_package_v1",
        },
      }),
    );
    assert.equal(historical.plannerKind, "daily_social");
  });

  it("Think Differently and conversation revision preserve plannerKind from source", () => {
    const service = read("services/socialPlanner/socialCalendarService.ts");
    assert.match(service, /lineageSocialCalendarQueuedProvenance/);
    assert.match(service, /readSocialPlannerTargetPersonaId/);
    assert.doesNotMatch(
      service,
      /generation_mode: "daily_social"|generation_mode: "evergreen"/,
    );

    const orchestration = read(
      "services/socialPlanner/socialCalendarOrchestration.ts",
    );
    assert.match(
      orchestration,
      /assertSocialCalendarPlannerKindImplemented/,
    );
  });

  it("plannerKind stays browser-safe and does not import server persona resolution", () => {
    const source = read("services/socialPlanner/socialCalendarPlannerKind.ts");
    assert.doesNotMatch(
      source,
      /from ["']@\/services\/socialPlanner\/socialPlannerTargetPersona["']/,
    );
    assert.doesNotMatch(source, /from ["']@\/services\/organizationService["']/);
    assert.doesNotMatch(
      source,
      /from ["']@\/services\/brain\/brainContextBuilder["']/,
    );
    assert.doesNotMatch(source, /from ["']next\/headers["']/);
    assert.doesNotMatch(source, /from ["']@\/lib\/supabase\/server["']/);
    assert.match(
      source,
      /from ["']@\/lib\/socialPlanner\/socialPlannerTargetPresentation["']/,
    );
  });

  it("does not add planner kind to generation_mode or require a migration", () => {
    const types = read("services/socialPlanner/socialCalendarTypes.ts");
    assert.match(types, /"standard"/);
    assert.match(types, /"think_differently"/);
    assert.match(types, /"conversation_revision"/);
    assert.doesNotMatch(types, /daily_social|evergreen/);

    const request = read("services/socialPlanner/socialCalendarRequest.ts");
    assert.doesNotMatch(request, /generationMode !== "daily_social"/);
  });
});
