/**
 * FREE-6 — consumed Free starter week is a readable, non-generative result.
 * Presentation only. Does not change FREE-5 reservation, generation, or packages.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { SocialCalendarDetail } from "../../components/socialPlanner/SocialCalendarDetail";
import { isFreeConsumedStarterCalendarView } from "../../lib/organization/freeStarter";
import { SOCIAL_DETAIL_FREE_STARTER_NOTE } from "../../lib/socialPlanner/socialPlannerDetailPresentation";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";
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
const OTHER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const COST_ROUTES = [
  "app/api/social-planner/route.ts",
  "app/api/social-planner/evergreen/route.ts",
  "app/api/social-planner/[id]/think-differently/route.ts",
  "app/api/social-planner/[id]/conversation/apply/route.ts",
  "app/api/social-planner/[id]/conversation/route.ts",
] as const;

const DICTIONARIES: TenantMessages[] = [en, fr, es, de, pt, itMessages];

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function readyDetail(id = STARTER_ID) {
  const socialPackage = buildValidatedPackage(buildGenerationContext());
  const calendar = toSocialCalendarDetailDto(
    mapSocialCalendarRow({
      id,
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
      package_json: socialPackage,
      provenance_json: { plannerKind: "daily_social" },
      calendar_context_json: {},
      revision_context_json: null,
      error_code: null,
      error_message: null,
      created_at: "2026-09-17T00:00:00.000Z",
      updated_at: "2026-09-17T00:00:00.000Z",
    }),
  );
  return { calendar, socialPackage };
}

function renderDetail(input: {
  readOnlyFreeStarter?: boolean;
  calendarId?: string;
  onThinkDifferently?: () => void;
}) {
  const { calendar, socialPackage } = readyDetail(input.calendarId);
  const html = renderToStaticMarkup(
    createElement(SocialCalendarDetail, {
      calendar,
      onCreateAnotherWeek: () => undefined,
      onThinkDifferently: input.onThinkDifferently,
      onApplySuggestions:
        input.readOnlyFreeStarter === true ? undefined : () => undefined,
      readOnlyFreeStarter: input.readOnlyFreeStarter,
      messages: en,
    }),
  );
  return { html, calendar, socialPackage };
}

describe("FREE-6 starter calendar view authority", () => {
  it("requires free + consumed + the exact bound starter calendar", () => {
    assert.equal(
      isFreeConsumedStarterCalendarView({
        athenaPlan: "free",
        starterStatus: "consumed",
        starterCalendarId: STARTER_ID,
        currentCalendarId: STARTER_ID,
      }),
      true,
    );
    assert.equal(
      isFreeConsumedStarterCalendarView({
        athenaPlan: "free",
        starterStatus: "consumed",
        starterCalendarId: STARTER_ID,
        currentCalendarId: OTHER_ID,
      }),
      false,
    );
    assert.equal(
      isFreeConsumedStarterCalendarView({
        athenaPlan: "full",
        starterStatus: "consumed",
        starterCalendarId: STARTER_ID,
        currentCalendarId: STARTER_ID,
      }),
      false,
    );
    assert.equal(
      isFreeConsumedStarterCalendarView({
        athenaPlan: "free",
        starterStatus: "reserved",
        starterCalendarId: STARTER_ID,
        currentCalendarId: STARTER_ID,
      }),
      false,
    );
    assert.equal(
      isFreeConsumedStarterCalendarView({
        athenaPlan: "free",
        starterStatus: "available",
        starterCalendarId: null,
        currentCalendarId: STARTER_ID,
      }),
      false,
    );
    assert.equal(
      isFreeConsumedStarterCalendarView({
        athenaPlan: "free",
        starterStatus: "consumed",
        starterCalendarId: STARTER_ID,
        currentCalendarId: null,
      }),
      false,
    );
  });

  it("restores Full presentation when only athena_plan changes", () => {
    const consumedStarter = {
      starterStatus: "consumed" as const,
      starterCalendarId: STARTER_ID,
      currentCalendarId: STARTER_ID,
    };
    assert.equal(
      isFreeConsumedStarterCalendarView({
        athenaPlan: "free",
        ...consumedStarter,
      }),
      true,
    );
    assert.equal(
      isFreeConsumedStarterCalendarView({
        athenaPlan: "full",
        ...consumedStarter,
      }),
      false,
    );
  });
});

describe("FREE-6 consumed starter presentation", () => {
  it("keeps the seven generated assets and local Copy/Continue", () => {
    const { html, calendar, socialPackage } = renderDetail({
      readOnlyFreeStarter: true,
    });

    assert.equal(calendar.packageUnavailable, false);
    assert.equal(calendar.package?.assets?.length, 7);
    assert.equal(socialPackage.assets.length, 7);
    assert.deepEqual(calendar.package, socialPackage);
    assert.equal(calendar.generationMode, "standard");

    for (const asset of socialPackage.assets) {
      assert.match(html, new RegExp(`id="social-planner-day-${asset.date}"`));
      assert.match(html, new RegExp(asset.concept.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }

    assert.match(html, /data-day-navigation/);
    assert.match(html, />Copy</);
    assert.match(html, />Continue</);
    assert.match(html, /data-free-starter-week/);
    assert.match(html, /Your starter week/);
    assert.match(html, /Athena Free/);
    assert.match(html, /Your social week/);
    assert.doesNotMatch(html, /paywall|subscription|pricing/i);
    assert.match(SOCIAL_DETAIL_FREE_STARTER_NOTE, /border-white\/10/);
  });

  it("hides Athena-cost controls on desktop and mobile without fake disabled buttons", () => {
    const { html } = renderDetail({
      readOnlyFreeStarter: true,
      onThinkDifferently: () => undefined,
    });

    assert.doesNotMatch(html, /Try another approach/);
    assert.doesNotMatch(html, /Create another week/);
    assert.doesNotMatch(html, /Ask Athena about this day/);
    assert.doesNotMatch(html, /Ask Athena about this week/);
    assert.doesNotMatch(html, /Apply Athena/);
    assert.doesNotMatch(html, /data-ask-athena-slot/);
    assert.doesNotMatch(html, /data-ready-actions/);
    assert.doesNotMatch(html, /\sdisabled(="[^"]*")?[\s>]/);
    assert.doesNotMatch(html, /sm:only|md:hidden.*Ask Athena|lg:flex.*thinkDifferently/);

    const dayCard = read("components/socialPlanner/SocialCalendarDayCard.tsx");
    const evergreen = read(
      "components/socialPlanner/SocialCalendarEvergreenDayCard.tsx",
    );
    assert.doesNotMatch(dayCard, /sm:.*onDiscussWithAthena|md:.*discussWithAthena/);
    assert.doesNotMatch(evergreen, /sm:.*onDiscussWithAthena|md:.*discussWithAthena/);
  });

  it("does not apply starter presentation to another Free calendar", () => {
    const { html } = renderDetail({
      readOnlyFreeStarter: false,
      calendarId: OTHER_ID,
      onThinkDifferently: () => undefined,
    });

    assert.doesNotMatch(html, /data-free-starter-week/);
    assert.doesNotMatch(html, /Your starter week/);
    assert.match(html, /Try another approach/);
    assert.match(html, /Create another week/);
    assert.match(html, /Ask Athena about this day/);
    assert.match(html, /Ask Athena about this week/);
    assert.match(html, />Copy</);
    assert.match(html, />Continue</);
    assert.equal((html.match(/id="social-planner-day-/g) ?? []).length, 7);
  });

  it("keeps Full controls on the same calendar when read-only authority is off", () => {
    const starter = renderDetail({
      readOnlyFreeStarter: true,
      onThinkDifferently: () => undefined,
    });
    const full = renderDetail({
      readOnlyFreeStarter: false,
      onThinkDifferently: () => undefined,
    });

    assert.equal(starter.calendar.id, full.calendar.id);
    assert.deepEqual(starter.calendar.package, full.calendar.package);
    assert.match(full.html, /Try another approach/);
    assert.match(full.html, /Ask Athena about this week/);
    assert.doesNotMatch(full.html, /data-free-starter-week/);
    assert.doesNotMatch(full.html, /Your starter week/);
  });
});

describe("FREE-6 wiring and FREE-5 gate regression", () => {
  it("loads persisted org plan + starter identity on the canonical detail route", () => {
    const page = read("app/social-planner/[id]/page.tsx");
    const workspace = read(
      "components/socialPlanner/SocialPlannerDetailWorkspace.tsx",
    );
    const home = read("components/home/FreeStarterHome.tsx");

    assert.match(page, /isFreeConsumedStarterCalendarView/);
    assert.match(page, /resolveAthenaPlan\(organizationId\)/);
    assert.match(page, /loadFreeStarterAuthority\(organizationId\)/);
    assert.match(page, /readOnlyFreeStarter=\{readOnlyFreeStarter\}/);
    assert.match(page, /athenaPlan=\{athenaPlan\}/);
    assert.match(page, /defineKind=\{freeProgression\.defineKind\}/);
    assert.match(page, /copy\.backToHome/);
    assert.match(page, /href=\{\s*readOnlyFreeStarter\s*\?\s*"\/"/);
    assert.match(page, /socialPlannerWorkspaceHref/);
    assert.match(page, /copy\.backToSocialPlanner/);
    assert.doesNotMatch(page, /reserveFreeStarter|consumeFreeStarter|releaseFreeStarter/);
    assert.doesNotMatch(page, /createFreeStarterDailySocialCalendar/);

    assert.match(workspace, /readOnlyFreeStarter/);
    assert.match(workspace, /!readOnlyFreeStarter &&/);
    assert.match(home, /view\.weekHref/);
    assert.match(home, /copy\.viewWeek/);
  });

  it("leaves FREE-5 generation POST gates unchanged", () => {
    for (const file of COST_ROUTES) {
      const source = read(file);
      assert.match(source, /assertCurrentFreeSocialPlannerGeneration/);
      assert.match(source, /FreeSocialPlannerGenerationError/);
    }

    const conversation = read(
      "app/api/social-planner/[id]/conversation/route.ts",
    );
    const getFn = conversation.slice(
      conversation.indexOf("export async function GET"),
      conversation.indexOf("export async function POST"),
    );
    const postFn = conversation.slice(
      conversation.indexOf("export async function POST"),
    );
    assert.doesNotMatch(getFn, /assertCurrentFreeSocialPlannerGeneration/);
    assert.match(postFn, /assertCurrentFreeSocialPlannerGeneration/);

    const detailApi = read("app/api/social-planner/[id]/route.ts");
    assert.doesNotMatch(detailApi, /assertCurrentFreeSocialPlannerGeneration/);
  });

  it("keeps six-language parity for starter-week copy", () => {
    const englishKeys = Object.keys(en.socialPlanner.freeStarterWeek).sort();
    for (const dictionary of DICTIONARIES) {
      assert.deepEqual(
        Object.keys(dictionary.socialPlanner.freeStarterWeek).sort(),
        englishKeys,
      );
      for (const key of englishKeys) {
        const value =
          dictionary.socialPlanner.freeStarterWeek[
            key as keyof typeof dictionary.socialPlanner.freeStarterWeek
          ];
        assert.ok(value.trim().length > 0, key);
      }
      assert.match(dictionary.socialPlanner.freeStarterWeek.eyebrow, /Athena/);
      assert.match(dictionary.socialPlanner.backToHome, /\S/);
    }
    assert.notEqual(
      fr.socialPlanner.freeStarterWeek.title,
      en.socialPlanner.freeStarterWeek.title,
    );
    assert.notEqual(
      es.socialPlanner.backToHome,
      en.socialPlanner.backToHome,
    );
    assert.equal(en.socialPlanner.backToHome, "Back to Home");
    assert.equal(en.socialPlanner.freeStarterWeek.title, "Your starter week");
  });
});
