import "./socialPlannerTestEnv";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { DEPLOYMENT_ASSET_TYPE_BY_LABEL } from "../../services/assetInteractions/assetInteractionKeys";
import {
  SOCIAL_CALENDAR_PACKAGE_SCHEMA_VERSION,
} from "../../services/socialPlanner/generation/socialCalendarPackageTypes";
import {
  SOCIAL_CALENDAR_EVERGREEN_PACKAGE_SCHEMA_VERSION,
} from "../../services/socialPlanner/generation/socialCalendarEvergreenPackageTypes";
import {
  evergreenFormatForDayIndex,
  planEvergreenWeekFormats,
} from "../../services/socialPlanner/generation/socialPlannerEvergreenRotation";
import {
  isSocialCalendarDailyPackage,
  isSocialCalendarEvergreenPackage,
} from "../../services/socialPlanner/generation/socialCalendarPackageUnion";
import { validateAndNormalizeSocialCalendarEvergreenPackage } from "../../services/socialPlanner/generation/validateSocialCalendarEvergreenPackage";
import { tryParsePersistedSocialCalendarPackage } from "../../services/socialPlanner/socialCalendarPersistedPackage";
import {
  SOCIAL_PLANNER_EVERGREEN_FORMATS,
} from "../../services/socialPlanner/socialPlannerDailyChannels";
import {
  buildGenerationContext,
  buildValidatedPackage,
  testMetadata,
  TEST_PERIOD_END,
  TEST_PERIOD_START,
} from "./socialPlannerGenerationFixtures";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function draftFor(format: string, seed: string): string {
  const body = [
    `${seed} opens with a concrete observation from the Harbor Clinic week.`,
    "Families keep delaying preventive care until a small problem becomes urgent.",
    "This draft explains the pattern, names the practical fix, and gives the manager something they can edit today.",
    "Section one covers the first conversation. Ask what changed since the last visit and listen for the real reason the family waited.",
    "Section two covers the follow-through. Offer one evening slot, one Saturday slot, and a written reminder the parent can keep.",
    "The close invites a next step without sounding like an ad. Name the overdue visit, not a generic 'learn more' line.",
    "Keep the language local, specific, and useful. Mention school calendars, after-work pickups, and the cost of waiting, then stop.",
    "A content manager should be able to paste this, tighten a sentence, and publish. It is not an outline or a prompt.",
  ];
  if (format === "skool_course_idea") {
    body.push(
      "Course name: Preventive Care Confidence.",
      "Learner outcome: Operators can run a calmer first-visit conversation.",
      "Module 1: The delayed-care pattern.",
      "Module 2: The first-visit script.",
      "Module 3: The follow-up habit.",
    );
  }
  return body.join("\n\n");
}

function buildValidEvergreenRaw(context = buildGenerationContext()) {
  const dates = context.calendarContext.period.dates;
  const assignments = planEvergreenWeekFormats(dates);
  return {
    schemaVersion: SOCIAL_CALENDAR_EVERGREEN_PACKAGE_SCHEMA_VERSION,
    plannerKind: "evergreen",
    strategySummary:
      "A durable Harbor Clinic week that rotates Blog, Newsletter, Substack, Reddit, and Skool so the team has usable drafts instead of daily social copy.",
    whyThisWeekWorks:
      "This week teaches one preventive-care idea through six durable formats. Each day gives a manager a working draft they can edit, not a prompt to start from scratch.",
    days: assignments.map((assignment, index) => ({
      date: assignment.date,
      evergreenFormat: assignment.evergreenFormat,
      title: `Harbor draft ${index + 1}: ${assignment.evergreenFormat}`,
      concept: `Angle ${index + 1} for delayed preventive care.`,
      draft: draftFor(assignment.evergreenFormat, `Day ${index + 1}`),
      cta: "Invite the family to book the overdue visit.",
      publishingGuidance: "Publish in the native format. Do not convert this into a daily social post.",
      audience: "Busy parents",
      personaIds: ["persona-parent"],
      topic: `preventive care ${index + 1}`,
      angle: `practical delay pattern ${index + 1}`,
      contentArchetype: "educational",
      primaryObjective: "educate",
      calendarAnchors: [],
      calendarReason: null,
      sourceSignals: [{ type: "brain", id: null }],
    })),
  };
}

function evergreenMetadata() {
  return {
    ...testMetadata(),
    packageSchemaVersion: SOCIAL_CALENDAR_EVERGREEN_PACKAGE_SCHEMA_VERSION,
    plannerKind: "evergreen" as const,
    strategyPromptVersion: "social_planner_evergreen_strategy_v1",
    assetPromptVersion: "social_planner_evergreen_v1",
  };
}

describe("Social Planner Evergreen package contract", () => {
  it("keeps the exact six accepted formats and excludes Daily destinations", () => {
    assert.deepEqual([...SOCIAL_PLANNER_EVERGREEN_FORMATS], [
      DEPLOYMENT_ASSET_TYPE_BY_LABEL.BLOG_POST_IDEA,
      DEPLOYMENT_ASSET_TYPE_BY_LABEL.NEWSLETTER_IDEA,
      DEPLOYMENT_ASSET_TYPE_BY_LABEL.SUBSTACK_POST,
      DEPLOYMENT_ASSET_TYPE_BY_LABEL.REDDIT_POST,
      DEPLOYMENT_ASSET_TYPE_BY_LABEL.SKOOL_POST,
      DEPLOYMENT_ASSET_TYPE_BY_LABEL.SKOOL_COURSE_IDEA,
    ]);
    assert.equal(
      (SOCIAL_PLANNER_EVERGREEN_FORMATS as readonly string[]).includes(
        DEPLOYMENT_ASSET_TYPE_BY_LABEL.SUBSTACK_NOTE,
      ),
      false,
    );
    for (const excluded of [
      "instagram",
      "facebook",
      "linkedin",
      "tiktok",
      "youtube_shorts",
      "x",
      "threads",
      "youtube",
    ]) {
      assert.equal(
        (SOCIAL_PLANNER_EVERGREEN_FORMATS as readonly string[]).includes(excluded),
        false,
      );
    }
  });

  it("rotates the six formats deterministically across seven days", () => {
    const dates = [
      "2026-05-10",
      "2026-05-11",
      "2026-05-12",
      "2026-05-13",
      "2026-05-14",
      "2026-05-15",
      "2026-05-16",
    ];
    const planned = planEvergreenWeekFormats(dates);
    assert.deepEqual(
      planned.map((entry) => entry.evergreenFormat),
      [
        "blog_post_idea",
        "newsletter_idea",
        "substack_post",
        "reddit_post",
        "skool_post",
        "skool_course_idea",
        "blog_post_idea",
      ],
    );
    assert.equal(evergreenFormatForDayIndex(0), "blog_post_idea");
    assert.equal(evergreenFormatForDayIndex(6), "blog_post_idea");
    assert.notEqual(TEST_PERIOD_START, TEST_PERIOD_END);
  });

  it("validates a complete Evergreen package and rejects Daily fields or outline-only drafts", () => {
    const context = buildGenerationContext();
    const assigned = planEvergreenWeekFormats(context.calendarContext.period.dates);
    const valid = validateAndNormalizeSocialCalendarEvergreenPackage({
      raw: buildValidEvergreenRaw(context),
      context,
      metadata: evergreenMetadata(),
      assignedFormats: assigned,
    });
    assert.equal(valid.schemaVersion, SOCIAL_CALENDAR_EVERGREEN_PACKAGE_SCHEMA_VERSION);
    assert.equal(valid.plannerKind, "evergreen");
    assert.equal(valid.days.length, 7);
    assert.deepEqual(
      valid.days.map((day) => day.evergreenFormat),
      assigned.map((entry) => entry.evergreenFormat),
    );
    assert.equal(isSocialCalendarEvergreenPackage(valid), true);
    assert.equal(isSocialCalendarDailyPackage(valid), false);

    assert.throws(() =>
      validateAndNormalizeSocialCalendarEvergreenPackage({
        raw: {
          ...buildValidEvergreenRaw(context),
          days: assigned.map((assignment, index) => ({
            ...buildValidEvergreenRaw(context).days[index],
            evergreenFormat:
              assignment.evergreenFormat === "blog_post_idea"
                ? "newsletter_idea"
                : assignment.evergreenFormat,
          })),
        },
        context,
        metadata: evergreenMetadata(),
        assignedFormats: assigned,
      }),
    );

    assert.throws(() =>
      validateAndNormalizeSocialCalendarEvergreenPackage({
        raw: {
          ...buildValidEvergreenRaw(context),
          days: assigned.map((assignment, index) => ({
            ...buildValidEvergreenRaw(context).days[index],
            draft: "Write a blog about preventive care.",
            evergreenFormat: assignment.evergreenFormat,
          })),
        },
        context,
        metadata: evergreenMetadata(),
        assignedFormats: assigned,
      }),
    );
  });

  it("keeps historical Daily package v1 readable and does not mutate it", () => {
    const context = buildGenerationContext();
    const daily = buildValidatedPackage(context);
    assert.equal(daily.schemaVersion, SOCIAL_CALENDAR_PACKAGE_SCHEMA_VERSION);
    const persisted = tryParsePersistedSocialCalendarPackage(daily);
    assert.ok(persisted);
    assert.equal(isSocialCalendarDailyPackage(persisted), true);
    assert.equal(isSocialCalendarEvergreenPackage(persisted), false);
    assert.equal("days" in persisted, false);
    assert.equal(Array.isArray(persisted.assets), true);

    const evergreen = validateAndNormalizeSocialCalendarEvergreenPackage({
      raw: buildValidEvergreenRaw(context),
      context,
      metadata: evergreenMetadata(),
      assignedFormats: planEvergreenWeekFormats(context.calendarContext.period.dates),
    });
    const persistedEvergreen = tryParsePersistedSocialCalendarPackage(evergreen);
    assert.ok(persistedEvergreen);
    assert.equal(isSocialCalendarEvergreenPackage(persistedEvergreen), true);
    assert.equal(isSocialCalendarDailyPackage(persistedEvergreen), false);
  });

  it("does not call generateDeploymentAssets or persist into suggested_cta", () => {
    const files = [
      "services/socialPlanner/generation/socialCalendarEvergreenPackageTypes.ts",
      "services/socialPlanner/generation/socialPlannerEvergreenRotation.ts",
      "services/socialPlanner/generation/validateSocialCalendarEvergreenPackage.ts",
      "services/socialPlanner/generation/socialCalendarPackageUnion.ts",
    ];
    for (const file of files) {
      const source = read(file);
      assert.doesNotMatch(source, /generateDeploymentAssets/);
      assert.doesNotMatch(source, /suggested_cta/);
      assert.doesNotMatch(source, /athena_evergreen_calendars/);
    }
  });
});
