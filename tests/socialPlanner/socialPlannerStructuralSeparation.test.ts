import "./socialPlannerTestEnv";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  parseSocialPlannerUrlKind,
  requireSocialPlannerUrlKind,
  socialPlannerWorkspaceHref,
} from "../../lib/socialPlanner/socialPlannerRouting";
import { en } from "../../lib/tenantI18n/messages/en";
import {
  getLocalizedSocialPlannerFailedHeadline,
  getLocalizedSocialPlannerGeneratingHeadline,
  getLocalizedSocialPlannerReadyHeadline,
} from "../../lib/tenantI18n/socialPlannerPresentation";
import {
  SOCIAL_CALENDAR_PACKAGE_SCHEMA_VERSION,
} from "../../services/socialPlanner/generation/socialCalendarPackageTypes";
import {
  SOCIAL_CALENDAR_EVERGREEN_PACKAGE_SCHEMA_VERSION,
} from "../../services/socialPlanner/generation/socialCalendarEvergreenPackageTypes";
import { generateSocialPlannerPackageByKind } from "../../services/socialPlanner/generation/dispatchSocialPlannerGeneration";
import {
  isSocialCalendarDailyPackage,
  isSocialCalendarEvergreenPackage,
  socialCalendarPackageMatchesPlannerKind,
} from "../../services/socialPlanner/generation/socialCalendarPackageUnion";
import { toSocialCalendarDetailDto } from "../../services/socialPlanner/socialCalendarDto";
import {
  SocialCalendarPlannerKindError,
  mergeSocialCalendarPlannerKindProvenance,
  socialCalendarMatchesPlannerHistory,
} from "../../services/socialPlanner/socialCalendarPlannerKind";
import {
  SocialCalendarRequestError,
  normalizeSocialCalendarCreateRequest,
} from "../../services/socialPlanner/socialCalendarRequest";
import { mapSocialCalendarRow } from "../../services/socialPlanner/socialCalendarMappers";
import {
  SOCIAL_PLANNER_EVERGREEN_REPAIR_PROMPT_VERSION,
  SOCIAL_PLANNER_EVERGREEN_STRATEGY_PROMPT_VERSION,
} from "../../services/socialPlanner/generation/socialCalendarEvergreenPackageTypes";
import {
  SOCIAL_PLANNER_REPAIR_PROMPT_VERSION,
} from "../../services/socialPlanner/generation/socialCalendarPackageTypes";
import {
  TEST_ORG,
  TEST_PERIOD_END,
  TEST_PERIOD_START,
  buildGenerationContext,
  buildValidatedPackage,
} from "./socialPlannerGenerationFixtures";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
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
    status: "Ready",
    generation_stage: "finalizing",
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

describe("Social Planner SP-4 structural separation", () => {
  it("Daily and Evergreen URLs identify the active planner and preserve personaId", () => {
    assert.deepEqual(parseSocialPlannerUrlKind(undefined), {
      kind: "daily",
      plannerKind: "daily_social",
    });
    assert.deepEqual(parseSocialPlannerUrlKind("daily"), {
      kind: "daily",
      plannerKind: "daily_social",
    });
    assert.deepEqual(parseSocialPlannerUrlKind("evergreen"), {
      kind: "evergreen",
      plannerKind: "evergreen",
    });
    assert.deepEqual(parseSocialPlannerUrlKind("weekly"), { kind: "invalid" });
    assert.throws(
      () => requireSocialPlannerUrlKind("weekly"),
      SocialCalendarPlannerKindError,
    );

    const personaId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    assert.equal(
      socialPlannerWorkspaceHref({ planner: "daily", personaId }),
      `/social-planner?planner=daily&personaId=${personaId}`,
    );
    assert.equal(
      socialPlannerWorkspaceHref({ planner: "evergreen", personaId }),
      `/social-planner?planner=evergreen&personaId=${personaId}`,
    );
    assert.equal(
      socialPlannerWorkspaceHref({ planner: "evergreen" }),
      "/social-planner?planner=evergreen",
    );

    const page = read("app/social-planner/page.tsx");
    const tabs = read("components/socialPlanner/SocialPlannerTabs.tsx");
    assert.match(page, /parseSocialPlannerUrlKind\(params\.planner\)/);
    assert.match(page, /personaId/);
    assert.match(page, /copy\.invalidPlanner/);
    assert.match(tabs, /socialPlannerWorkspaceHref\(\{\s*planner: "daily"/);
    assert.match(tabs, /socialPlannerWorkspaceHref\(\{\s*planner: "evergreen"/);
    assert.match(tabs, /personaId/);
    assert.doesNotMatch(
      read("app/personas/[id]/page.tsx"),
      /planner=daily|planner=evergreen/,
    );
    assert.match(
      read("app/personas/[id]/page.tsx"),
      /href=\{`\/social-planner\?personaId=\$\{persona\.id\}`\}/,
    );
  });

  it("create entry points freeze planner family and reject client plannerKind", () => {
    const dailyRoute = read("app/api/social-planner/route.ts");
    const evergreenRoute = read("app/api/social-planner/evergreen/route.ts");
    const orchestration = read(
      "services/socialPlanner/socialCalendarOrchestration.ts",
    );
    assert.match(dailyRoute, /createDailySocialCalendarWithJob/);
    assert.doesNotMatch(dailyRoute, /createEvergreenSocialCalendarWithJob/);
    assert.match(evergreenRoute, /createEvergreenSocialCalendarWithJob/);
    assert.doesNotMatch(evergreenRoute, /createDailySocialCalendarWithJob/);
    assert.match(orchestration, /plannerKind: "daily_social"/);
    assert.match(orchestration, /plannerKind: "evergreen"/);
    assert.equal(
      existsSync(join(ROOT, "app/api/social-planner/evergreen/route.ts")),
      true,
    );

    assert.throws(
      () =>
        normalizeSocialCalendarCreateRequest({
          periodStart: TEST_PERIOD_START,
          plannerKind: "evergreen",
        }),
      SocialCalendarRequestError,
    );
    const dailyBody = normalizeSocialCalendarCreateRequest({
      periodStart: TEST_PERIOD_START,
    });
    assert.equal("plannerKind" in dailyBody, false);

    const client = read("components/socialPlanner/socialPlannerClient.ts");
    const workspace = read("components/socialPlanner/SocialPlannerWorkspace.tsx");
    assert.match(client, /\/api\/social-planner\/evergreen/);
    assert.match(workspace, /createDailySocialCalendarRequest/);
    assert.match(workspace, /createEvergreenSocialCalendarRequest/);
    assert.doesNotMatch(client, /body\.plannerKind/);
  });

  it("generation dispatch never crosses planner families", async () => {
    const dispatch = read(
      "services/socialPlanner/generation/dispatchSocialPlannerGeneration.ts",
    );
    assert.match(dispatch, /if \(input\.plannerKind === "daily_social"\)/);
    assert.match(dispatch, /if \(input\.plannerKind === "evergreen"\)/);
    assert.match(dispatch, /Daily generation cannot consume an Evergreen source package/);
    assert.match(dispatch, /Evergreen generation cannot consume a Daily source package/);

    const dailyPackage = buildValidatedPackage(buildGenerationContext());
    await assert.rejects(
      () =>
        generateSocialPlannerPackageByKind({
          plannerKind: "daily_social",
          context: buildGenerationContext(),
          generationMode: "standard",
          sourcePackage: {
            schemaVersion: SOCIAL_CALENDAR_EVERGREEN_PACKAGE_SCHEMA_VERSION,
          } as never,
        }),
      /Daily generation cannot consume an Evergreen source package/,
    );
    await assert.rejects(
      () =>
        generateSocialPlannerPackageByKind({
          plannerKind: "evergreen",
          context: buildGenerationContext(),
          generationMode: "standard",
          sourcePackage: dailyPackage,
        }),
      /Evergreen generation cannot consume a Daily source package/,
    );
    assert.equal(isSocialCalendarDailyPackage(dailyPackage), true);
    assert.equal(isSocialCalendarEvergreenPackage(dailyPackage), false);
  });

  it("packages and detail fail closed on schema/kind mismatch", () => {
    const dailyPackage = buildValidatedPackage(buildGenerationContext());
    const evergreenPackage = {
      schemaVersion: SOCIAL_CALENDAR_EVERGREEN_PACKAGE_SCHEMA_VERSION,
      plannerKind: "evergreen",
    };
    assert.equal(
      socialCalendarPackageMatchesPlannerKind(dailyPackage, "daily_social"),
      true,
    );
    assert.equal(
      socialCalendarPackageMatchesPlannerKind(dailyPackage, "evergreen"),
      false,
    );
    assert.equal(
      socialCalendarPackageMatchesPlannerKind(evergreenPackage, "evergreen"),
      true,
    );
    assert.equal(
      socialCalendarPackageMatchesPlannerKind(evergreenPackage, "daily_social"),
      false,
    );

    const evergreenWithDaily = toSocialCalendarDetailDto(
      calendarRow({
        provenance_json: { plannerKind: "evergreen" },
        package_json: dailyPackage,
      }),
    );
    assert.equal(evergreenWithDaily.plannerKind, "evergreen");
    assert.equal(evergreenWithDaily.package, null);
    assert.equal(evergreenWithDaily.packageUnavailable, true);

    const dailyWithEvergreen = toSocialCalendarDetailDto(
      calendarRow({
        provenance_json: { plannerKind: "daily_social" },
        package_json: evergreenPackage,
      }),
    );
    assert.equal(dailyWithEvergreen.plannerKind, "daily_social");
    assert.equal(dailyWithEvergreen.package, null);
    assert.equal(dailyWithEvergreen.packageUnavailable, true);

    const detail = read("components/socialPlanner/SocialCalendarDetail.tsx");
    assert.match(detail, /calendar\.plannerKind === "evergreen" && !isEvergreen/);
    assert.match(detail, /getLocalizedSocialPlannerReadyHeadline/);
    assert.doesNotMatch(
      read("components/socialPlanner/SocialCalendarEvergreenDayCard.tsx"),
      /recommendedPlatforms|socialCopy/,
    );
  });

  it("repair contracts stay family-specific and keep the Evergreen sourceSignals enum", () => {
    const dailyPrompts = read(
      "services/socialPlanner/generation/socialPlannerGenerationPrompts.ts",
    );
    const evergreenPrompts = read(
      "services/socialPlanner/generation/socialPlannerEvergreenGenerationPrompts.ts",
    );
    assert.match(dailyPrompts, /SOCIAL_PLANNER_REPAIR_PROMPT_VERSION/);
    assert.match(evergreenPrompts, /SOCIAL_PLANNER_EVERGREEN_REPAIR_PROMPT_VERSION/);
    assert.equal(
      SOCIAL_PLANNER_REPAIR_PROMPT_VERSION.startsWith("social_planner_repair_"),
      true,
    );
    assert.equal(
      SOCIAL_PLANNER_EVERGREEN_REPAIR_PROMPT_VERSION,
      "social_planner_evergreen_repair_v1",
    );
    assert.match(evergreenPrompts, /SOCIAL_PLANNER_EVERGREEN_STRATEGY_PROMPT_VERSION/);
    assert.equal(
      SOCIAL_PLANNER_EVERGREEN_STRATEGY_PROMPT_VERSION,
      "social_planner_evergreen_strategy_v1",
    );
    assert.match(
      evergreenPrompts,
      /sourceSignals\.type must be one of the allowed values/,
    );
    assert.match(
      evergreenPrompts,
      /Never invent sourceSignals\.type values/,
    );
    assert.match(evergreenPrompts, /Not recommendedPlatforms/);
    assert.match(evergreenPrompts, /Never generate Daily socialCopy or recommendedPlatforms/);
    assert.doesNotMatch(dailyPrompts, /evergreenFormat/);
  });

  it("tab history keeps Daily and Evergreen streams separate", () => {
    assert.equal(
      socialCalendarMatchesPlannerHistory("daily_social", "daily_social"),
      true,
    );
    assert.equal(
      socialCalendarMatchesPlannerHistory("evergreen", "daily_social"),
      false,
    );
    assert.equal(
      socialCalendarMatchesPlannerHistory("evergreen", "evergreen"),
      true,
    );
    assert.equal(
      socialCalendarMatchesPlannerHistory("daily_social", "evergreen"),
      false,
    );

    const service = read("services/socialPlanner/socialCalendarService.ts");
    const history = read("components/socialPlanner/SocialPlannerHistory.tsx");
    const historyRoute = read(
      "components/socialPlanner/SocialPlannerHistoryRoutePage.tsx",
    );
    const workspace = read("components/socialPlanner/SocialPlannerWorkspace.tsx");
    assert.match(service, /socialCalendarMatchesPlannerHistory/);
    assert.match(service, /normalizeSocialCalendarHistoryPlannerKind/);
    assert.match(workspace, /plannerKind,/);
    assert.match(historyRoute, /plannerKind,/);
    assert.match(history, /copy\.historyTitleDaily/);
    assert.match(history, /copy\.historyTitleEvergreen/);
    assert.match(history, /SOCIAL_WEEK_CARD_EVERGREEN_CLASS/);
  });

  it("presentation names the active planner for generating, ready, and failed states", () => {
    assert.equal(
      getLocalizedSocialPlannerGeneratingHeadline(en, "daily_social"),
      "Athena is planning your social week…",
    );
    assert.equal(
      getLocalizedSocialPlannerGeneratingHeadline(en, "evergreen"),
      "Athena is planning your evergreen week…",
    );
    assert.equal(
      getLocalizedSocialPlannerReadyHeadline(en, "daily_social"),
      "Your social week",
    );
    assert.equal(
      getLocalizedSocialPlannerReadyHeadline(en, "evergreen"),
      "Your evergreen week",
    );
    assert.equal(
      getLocalizedSocialPlannerFailedHeadline(en, "daily_social"),
      "This Daily Social Media week could not be completed.",
    );
    assert.equal(
      getLocalizedSocialPlannerFailedHeadline(en, "evergreen"),
      "This Evergreen Content week could not be completed.",
    );
    assert.equal(en.socialPlanner.generateDailyWeek, "Generate Daily Social Week");
    assert.equal(en.socialPlanner.generateEvergreenWeek, "Generate Evergreen Week");
    assert.match(
      read("components/socialPlanner/SocialPlannerCreateForm.tsx"),
      /copy\.generateDailyWeek/,
    );
    assert.match(
      read("components/socialPlanner/SocialPlannerCreateForm.tsx"),
      /copy\.generateEvergreenWeek/,
    );
  });

  it("lineage preserves the source planner family and never downgrades Evergreen", () => {
    const service = read("services/socialPlanner/socialCalendarService.ts");
    assert.match(service, /lineageSocialCalendarQueuedProvenance/);
    assert.deepEqual(
      mergeSocialCalendarPlannerKindProvenance(
        { generationMode: "standard", plannerKind: "daily_social" },
        { plannerKind: "evergreen" },
      ),
      { generationMode: "standard", plannerKind: "evergreen" },
    );
    assert.deepEqual(
      mergeSocialCalendarPlannerKindProvenance(
        { generationMode: "standard" },
        { plannerKind: "evergreen" },
      ),
      { generationMode: "standard", plannerKind: "evergreen" },
    );
    assert.deepEqual(
      mergeSocialCalendarPlannerKindProvenance(
        { generationMode: "standard" },
        {},
      ),
      { generationMode: "standard", plannerKind: "daily_social" },
    );

    const executor = read(
      "services/socialPlanner/socialCalendarGenerationJobs/socialCalendarGenerationJobExecutor.ts",
    );
    assert.match(executor, /PACKAGE_PLANNER_KIND_MISMATCH/);
    assert.match(executor, /socialCalendarPackageMatchesPlannerKind/);
  });

  it("does not add a Social Planner schema migration", () => {
    const orchestration = read(
      "services/socialPlanner/socialCalendarOrchestration.ts",
    );
    assert.doesNotMatch(orchestration, /athena_evergreen_calendars/);
    assert.doesNotMatch(
      read("services/socialPlanner/socialCalendarService.ts"),
      /athena_evergreen_calendars/,
    );
    assert.equal(SOCIAL_CALENDAR_PACKAGE_SCHEMA_VERSION, "social_calendar_package_v1");
    assert.equal(
      SOCIAL_CALENDAR_EVERGREEN_PACKAGE_SCHEMA_VERSION,
      "social_calendar_evergreen_package_v1",
    );
  });
});
