/**
 * FREE-15D Social create-workspace containment.
 * Presentation/routing only. Consumed Free leaves /social-planner
 * before the creation workspace mounts.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { SocialCalendarDetail } from "../../components/socialPlanner/SocialCalendarDetail";
import {
  resolveConsumedFreeSocialCreateRedirect,
} from "../../lib/organization/freeStarter";
import { evaluateFreeSocialPlannerGeneration } from "../../lib/organization/freeSocialPlannerGeneration";
import { en } from "../../lib/tenantI18n/messages/en";
import { toSocialCalendarDetailDto } from "../../services/socialPlanner/socialCalendarDto";
import { mapSocialCalendarRow } from "../../services/socialPlanner/socialCalendarMappers";
import {
  TEST_ORG,
  TEST_PERIOD_END,
  TEST_PERIOD_START,
  buildGenerationContext,
  buildValidatedPackage,
} from "./socialPlannerGenerationFixtures";

const ROOT = process.cwd();
const STARTER_ID = "da8d96a2-5ea3-4225-bd90-1f18dc3ab7f2";
const PERSONA_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const CONSUMED_ENTRY_FORMS = [
  "/social-planner",
  "/social-planner?planner=daily",
  "/social-planner?planner=daily_social",
  `/social-planner?personaId=${PERSONA_ID}`,
  "/social-planner?planner=evergreen",
  `/social-planner?planner=evergreen&personaId=${PERSONA_ID}`,
] as const;

const COST_ROUTES = [
  "app/api/social-planner/route.ts",
  "app/api/social-planner/evergreen/route.ts",
] as const;

const AUTHORITY_FILES = [
  "lib/organization/freeSocialPlannerGeneration.ts",
  "services/organization/freeSocialPlannerGenerationGuard.ts",
  "app/api/social-planner/route.ts",
  "app/api/social-planner/evergreen/route.ts",
] as const;

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function readyStarterCalendar() {
  return toSocialCalendarDetailDto(
    mapSocialCalendarRow({
      id: STARTER_ID,
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
      generation_stage: "completed",
      package_json: buildValidatedPackage(buildGenerationContext()),
      provenance_json: { plannerKind: "daily_social" },
      calendar_context_json: {},
      revision_context_json: null,
      error_code: null,
      error_message: null,
      created_at: "2026-09-17T00:00:00.000Z",
      updated_at: "2026-09-17T00:00:00.000Z",
    }),
  );
}

describe("consumed Free Social create redirect", () => {
  it("redirects consumed Free to the bound starter detail for every create entry form", () => {
    const destination = resolveConsumedFreeSocialCreateRedirect({
      athenaPlan: "free",
      starterStatus: "consumed",
      starterCalendarId: STARTER_ID,
    });
    assert.equal(destination, `/social-planner/${STARTER_ID}`);

    for (const _entry of CONSUMED_ENTRY_FORMS) {
      assert.equal(
        resolveConsumedFreeSocialCreateRedirect({
          athenaPlan: "free",
          starterStatus: "consumed",
          starterCalendarId: STARTER_ID,
        }),
        `/social-planner/${STARTER_ID}`,
      );
    }
  });

  it("falls back to Home when consumed Free has no valid bound calendar id", () => {
    assert.equal(
      resolveConsumedFreeSocialCreateRedirect({
        athenaPlan: "free",
        starterStatus: "consumed",
        starterCalendarId: null,
      }),
      "/",
    );
    assert.equal(
      resolveConsumedFreeSocialCreateRedirect({
        athenaPlan: "free",
        starterStatus: "consumed",
        starterCalendarId: "   ",
      }),
      "/",
    );
  });

  it("does not redirect available, reserved, or Full create workspaces", () => {
    assert.equal(
      resolveConsumedFreeSocialCreateRedirect({
        athenaPlan: "free",
        starterStatus: "available",
        starterCalendarId: null,
      }),
      null,
    );
    assert.equal(
      resolveConsumedFreeSocialCreateRedirect({
        athenaPlan: "free",
        starterStatus: "reserved",
        starterCalendarId: STARTER_ID,
      }),
      null,
    );
    assert.equal(
      resolveConsumedFreeSocialCreateRedirect({
        athenaPlan: "full",
        starterStatus: "consumed",
        starterCalendarId: STARTER_ID,
      }),
      null,
    );
    assert.equal(
      resolveConsumedFreeSocialCreateRedirect({
        athenaPlan: "full",
        starterStatus: "available",
        starterCalendarId: null,
      }),
      null,
    );
  });
});

describe("/social-planner authoritative create gate", () => {
  it("gates from plan + starter authority before the workspace, ignoring query inputs", () => {
    const page = read("app/social-planner/page.tsx");
    const workspace = read("components/socialPlanner/SocialPlannerWorkspace.tsx");

    assert.match(page, /loadFreeProgressionState\(\)/);
    assert.match(page, /loadFreeStarterAuthority\(organizationId\)/);
    assert.match(page, /resolveConsumedFreeSocialCreateRedirect\(\{/);
    assert.match(page, /starterStatus: starter\.status/);
    assert.match(page, /SOCIAL_PLANNER_CALENDAR_ID_RE\.test\(starter\.calendarId\)/);
    assert.match(page, /if \(consumedCreatePath\) \{\s*redirect\(consumedCreatePath\);/);

    const gateIdx = page.indexOf("resolveConsumedFreeSocialCreateRedirect({");
    const redirectIdx = page.indexOf("redirect(consumedCreatePath)");
    const paramsIdx = page.indexOf("const params = searchParams");
    const plannerIdx = page.indexOf("parseSocialPlannerUrlKind(params.planner)");
    const personaIdx = page.indexOf(
      "await resolveSocialPlannerTargetAudienceView",
    );
    const workspaceIdx = page.indexOf("<SocialPlannerWorkspace");
    assert.ok(gateIdx >= 0 && redirectIdx > gateIdx);
    assert.ok(paramsIdx > redirectIdx);
    assert.ok(plannerIdx > redirectIdx);
    assert.ok(personaIdx > redirectIdx);
    assert.ok(workspaceIdx > redirectIdx);
    assert.match(workspace, /<SocialPlannerCreateForm/);

    assert.doesNotMatch(
      page.slice(0, workspaceIdx),
      /SocialPlannerCreateForm/,
    );
    assert.doesNotMatch(page, /listSocialCalendars|getSocialCalendarById/);
    assert.doesNotMatch(page, /calendars\.length|history\.length/);
    assert.doesNotMatch(page, /UpgradeCompletionCard|socialUpgradeContent/);
    assert.doesNotMatch(page, /evaluateFreeSocialPlannerGeneration/);
    assert.doesNotMatch(page, /assertCurrentFreeSocialPlannerGeneration/);
    assert.doesNotMatch(page, /createDailySocialCalendarWithJob|createEvergreenSocialCalendarWithJob/);
    assert.doesNotMatch(page, /reserveFreeStarter|consumeFreeStarter|releaseFreeStarter/);
    assert.doesNotMatch(page, /enqueueGenerationJob|generationJobExecutor/);
    assert.doesNotMatch(page, /openai|anthropic|gemini|provider/i);
  });

  it("keeps available Free and Full on the creation workspace, including Evergreen and personaId", () => {
    const page = read("app/social-planner/page.tsx");
    const workspace = read("components/socialPlanner/SocialPlannerWorkspace.tsx");
    const tabs = read("components/socialPlanner/SocialPlannerTabs.tsx");

    assert.match(page, /<SocialPlannerWorkspace/);
    assert.match(page, /plannerKind=\{plannerParse\.plannerKind\}/);
    assert.match(page, /targetAudience=\{targetAudience\}/);
    assert.match(page, /parseSocialPlannerUrlKind\(params\.planner\)/);
    assert.match(
      page,
      /typeof params\.personaId === "string" \? params\.personaId : null/,
    );
    assert.match(workspace, /<SocialPlannerCreateForm/);
    assert.match(tabs, /socialPlannerWorkspaceHref\(\{\s*planner: "evergreen"/);
    assert.match(tabs, /personaId/);
    assert.doesNotMatch(page, /athenaPlan=\{athenaPlan\}/);
    assert.match(page, /\{\.\.\.freeProgression\}/);
    assert.doesNotMatch(page, /UpgradeCompletionCard|UpgradeUnavailableCard/);
  });

  it("leaves consumed starter detail on the accepted FREE-15D continuation", () => {
    const detailPage = read("app/social-planner/[id]/page.tsx");
    const detail = read("components/socialPlanner/SocialCalendarDetail.tsx");
    const html = renderToStaticMarkup(
      createElement(SocialCalendarDetail, {
        calendar: readyStarterCalendar(),
        onCreateAnotherWeek: () => undefined,
        readOnlyFreeStarter: true,
        messages: en,
      }),
    );

    assert.match(detailPage, /isFreeConsumedStarterCalendarView/);
    assert.match(detailPage, /readOnlyFreeStarter=\{readOnlyFreeStarter\}/);
    assert.match(detail, /socialUpgradeContent/);
    assert.match(html, /Keep building your content with Full Athena/);
    assert.match(html, /data-upgrade-feature="social"/);
  });

  it("does not change Free Social POST authority", () => {
    for (const file of AUTHORITY_FILES) {
      const source = read(file);
      assert.doesNotMatch(source, /resolveConsumedFreeSocialCreateRedirect/, file);
      assert.doesNotMatch(source, /UpgradeCompletionCard/, file);
    }
    for (const file of COST_ROUTES) {
      const source = read(file);
      assert.match(source, /assertCurrentFreeSocialPlannerGeneration/);
    }
    assert.equal(
      evaluateFreeSocialPlannerGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        starterStatus: "consumed",
      }).allow,
      false,
    );
    assert.deepEqual(
      evaluateFreeSocialPlannerGeneration({
        athenaPlan: "full",
        defineKind: "ready",
        starterStatus: "consumed",
      }),
      { allow: true },
    );
  });
});
