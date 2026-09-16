/**
 * SP-6 — dedicated Daily / Evergreen history pages.
 * Presentation and routing only. Does not change generation.
 */

import "./socialPlannerTestEnv";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { SocialPlannerHistoryCta } from "../../components/socialPlanner/SocialPlannerHistoryCta";
import { SOCIAL_PLANNER_CALENDAR_ID_RE } from "../../components/socialPlanner/socialPlannerClient";
import {
  SOCIAL_HISTORY_CTA_ACTION_DAILY,
  SOCIAL_HISTORY_CTA_ACTION_EVERGREEN,
  SOCIAL_HISTORY_CTA_DAILY,
  SOCIAL_HISTORY_CTA_EVERGREEN,
  SOCIAL_PRIMARY_CLASS,
} from "../../lib/socialPlanner/socialPlannerPagePresentation";
import {
  socialPlannerHistoryHref,
  socialPlannerWorkspaceHref,
} from "../../lib/socialPlanner/socialPlannerRouting";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import { ORGANIZATION_LANGUAGES } from "../../services/organizationLanguage";
import {
  readSocialCalendarPlannerKind,
  socialCalendarMatchesPlannerHistory,
} from "../../services/socialPlanner/socialCalendarPlannerKind";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function collectKeyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }
  const paths = prefix ? [prefix] : [];
  for (const key of Object.keys(value as object).sort()) {
    const next = prefix ? `${prefix}.${key}` : key;
    paths.push(
      ...collectKeyPaths((value as Record<string, unknown>)[key], next),
    );
  }
  return paths;
}

const DICTIONARIES: Record<string, TenantMessages> = {
  en,
  fr,
  es,
  it: itMessages,
  de,
  pt,
};

const HISTORY_I18N_KEYS = [
  "socialPlanner.historyCtaEyebrowDaily",
  "socialPlanner.historyCtaTitleDaily",
  "socialPlanner.historyCtaBodyDaily",
  "socialPlanner.historyCtaActionDaily",
  "socialPlanner.historyCtaEyebrowEvergreen",
  "socialPlanner.historyCtaTitleEvergreen",
  "socialPlanner.historyCtaBodyEvergreen",
  "socialPlanner.historyCtaActionEvergreen",
  "socialPlanner.historyPageTitleDaily",
  "socialPlanner.historyPageSubtitleDaily",
  "socialPlanner.historyPageTitleEvergreen",
  "socialPlanner.historyPageSubtitleEvergreen",
  "socialPlanner.historyEmptyDaily",
  "socialPlanner.historyEmptyEvergreen",
  "socialPlanner.backToDailyPlanner",
  "socialPlanner.backToEvergreenPlanner",
  "socialPlanner.searchPlaceholderDaily",
  "socialPlanner.searchPlaceholderEvergreen",
] as const;

const FROZEN_GENERATION_FILES = [
  "services/socialPlanner/generation/dispatchSocialPlannerGeneration.ts",
  "services/socialPlanner/generation/generateEvergreenSocialCalendarPackage.ts",
  "services/socialPlanner/generation/socialCalendarEvergreenPackageTypes.ts",
  "services/socialPlanner/generation/socialCalendarPackageTypes.ts",
  "services/socialPlanner/generation/socialCalendarPackageUnion.ts",
  "services/socialPlanner/generation/socialPlannerEvergreenGenerationPrompts.ts",
  "services/socialPlanner/generation/socialPlannerEvergreenRotation.ts",
  "services/socialPlanner/generation/socialPlannerGenerationPrompts.ts",
  "services/socialPlanner/generation/validateSocialCalendarEvergreenPackage.ts",
  "services/socialPlanner/generation/validateSocialCalendarPackage.ts",
  "services/socialPlanner/socialCalendarOrchestration.ts",
  "services/socialPlanner/socialCalendarGenerationJobs/socialCalendarGenerationJobExecutor.ts",
  "app/api/social-planner/route.ts",
  "app/api/social-planner/evergreen/route.ts",
];

describe("Social Planner SP-6 dedicated history pages", () => {
  it("workspace Daily and Evergreen CTAs replace the inline previous-week collection", () => {
    const workspace = read("components/socialPlanner/SocialPlannerWorkspace.tsx");
    const cta = read("components/socialPlanner/SocialPlannerHistoryCta.tsx");
    const page = read("app/social-planner/page.tsx");

    assert.match(workspace, /<SocialPlannerHistoryCta/);
    assert.match(cta, /data-social-planner-history-cta=\{plannerKind\}/);
    assert.match(cta, /copy\.historyCtaActionDaily/);
    assert.match(cta, /copy\.historyCtaActionEvergreen/);
    assert.match(cta, /socialPlannerHistoryHref\(plannerKind\)/);
    assert.equal(
      socialPlannerHistoryHref("daily_social"),
      "/social-planner/history/daily",
    );
    assert.equal(
      socialPlannerHistoryHref("evergreen"),
      "/social-planner/history/evergreen",
    );

    assert.doesNotMatch(workspace, /<SocialPlannerHistory[\s>]/);
    assert.doesNotMatch(workspace, /fetchSocialCalendarHistory/);
    assert.doesNotMatch(workspace, /copy\.historyTitleDaily/);
    assert.doesNotMatch(workspace, /copy\.historyTitleEvergreen/);
    assert.doesNotMatch(workspace, /copy\.searchPlaceholderDaily/);
    assert.doesNotMatch(workspace, /SOCIAL_SEARCH_SURFACE/);
    assert.doesNotMatch(page, /listSocialCalendars/);
    assert.doesNotMatch(page, /initialCalendars/);

    const daily = renderToStaticMarkup(
      createElement(SocialPlannerHistoryCta, {
        plannerKind: "daily_social",
        messages: en,
      }),
    );
    assert.match(daily, /href="\/social-planner\/history\/daily"/);
    assert.match(daily, /View Daily History/);
    assert.match(daily, /Browse your Daily Social Media weeks/);
    assert.doesNotMatch(daily, /Previous Daily Social Weeks/);
    assert.doesNotMatch(daily, /Open this week/);

    const evergreen = renderToStaticMarkup(
      createElement(SocialPlannerHistoryCta, {
        plannerKind: "evergreen",
        messages: en,
      }),
    );
    assert.match(evergreen, /href="\/social-planner\/history\/evergreen"/);
    assert.match(evergreen, /View Evergreen History/);
    assert.match(evergreen, /Browse your Evergreen Content weeks/);
    assert.doesNotMatch(evergreen, /Previous Evergreen Weeks/);
    assert.doesNotMatch(evergreen, /Open this week/);
  });

  it("adds static Daily and Evergreen history routes that do not collide with detail", () => {
    assert.equal(
      existsSync(join(ROOT, "app/social-planner/history/daily/page.tsx")),
      true,
    );
    assert.equal(
      existsSync(join(ROOT, "app/social-planner/history/evergreen/page.tsx")),
      true,
    );
    assert.equal(
      existsSync(join(ROOT, "app/social-planner/[id]/page.tsx")),
      true,
    );
    assert.equal(existsSync(join(ROOT, "app/social-planner/history/[id]")), false);
    assert.equal(existsSync(join(ROOT, "app/social-planner/history/[kind]")), false);

    const dailyPage = read("app/social-planner/history/daily/page.tsx");
    const evergreenPage = read("app/social-planner/history/evergreen/page.tsx");
    const detailPage = read("app/social-planner/[id]/page.tsx");
    const routing = read("lib/socialPlanner/socialPlannerRouting.ts");

    assert.match(dailyPage, /plannerKind="daily_social"/);
    assert.match(evergreenPage, /plannerKind="evergreen"/);
    assert.match(detailPage, /params: Promise<\{ id: string \}>/);
    assert.match(detailPage, /SOCIAL_PLANNER_CALENDAR_ID_RE\.test\(id\)/);
    assert.match(routing, /SOCIAL_PLANNER_HISTORY_PATH/);
    assert.match(routing, /resolve before the dynamic calendar detail route/);
    assert.equal(SOCIAL_PLANNER_CALENDAR_ID_RE.test("history"), false);
    assert.equal(SOCIAL_PLANNER_CALENDAR_ID_RE.test("daily"), false);
    assert.equal(SOCIAL_PLANNER_CALENDAR_ID_RE.test("evergreen"), false);
    assert.equal(
      SOCIAL_PLANNER_CALENDAR_ID_RE.test(
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      ),
      true,
    );
  });

  it("Daily history includes daily_social and missing plannerKind, and excludes evergreen", () => {
    assert.equal(
      socialCalendarMatchesPlannerHistory("daily_social", "daily_social"),
      true,
    );
    assert.equal(
      socialCalendarMatchesPlannerHistory(
        readSocialCalendarPlannerKind({}),
        "daily_social",
      ),
      true,
    );
    assert.equal(
      socialCalendarMatchesPlannerHistory(
        readSocialCalendarPlannerKind(null),
        "daily_social",
      ),
      true,
    );
    assert.equal(
      socialCalendarMatchesPlannerHistory("evergreen", "daily_social"),
      false,
    );

    const historyRoute = read(
      "components/socialPlanner/SocialPlannerHistoryRoutePage.tsx",
    );
    const dailyPage = read("app/social-planner/history/daily/page.tsx");
    assert.match(dailyPage, /plannerKind="daily_social"/);
    assert.match(
      historyRoute,
      /listSocialCalendars\(organizationId, \{\s*search: "",\s*page: 1,\s*limit: SOCIAL_CALENDAR_HISTORY_PAGE_SIZE,\s*plannerKind,/,
    );
  });

  it("Evergreen history includes only explicit evergreen", () => {
    assert.equal(
      socialCalendarMatchesPlannerHistory("evergreen", "evergreen"),
      true,
    );
    assert.equal(
      socialCalendarMatchesPlannerHistory("daily_social", "evergreen"),
      false,
    );
    assert.equal(
      socialCalendarMatchesPlannerHistory(
        readSocialCalendarPlannerKind({}),
        "evergreen",
      ),
      false,
    );
    assert.equal(
      socialCalendarMatchesPlannerHistory(
        readSocialCalendarPlannerKind(null),
        "evergreen",
      ),
      false,
    );

    const evergreenPage = read("app/social-planner/history/evergreen/page.tsx");
    assert.match(evergreenPage, /plannerKind="evergreen"/);
    assert.doesNotMatch(evergreenPage, /daily_social/);
  });

  it("search stays scoped to the already-filtered planner family", () => {
    const historyPage = read(
      "components/socialPlanner/SocialPlannerHistoryPageWorkspace.tsx",
    );
    assert.match(
      historyPage,
      /fetchSocialCalendarHistory\(\s*\{\s*search: nextSearch,\s*page: nextPage,\s*limit,\s*plannerKind,/,
    );
    assert.match(historyPage, /copy\.searchPlaceholderDaily/);
    assert.match(historyPage, /copy\.searchPlaceholderEvergreen/);
    assert.equal(
      en.socialPlanner.searchPlaceholderDaily,
      "Search Daily Social Media weeks...",
    );
    assert.equal(
      en.socialPlanner.searchPlaceholderEvergreen,
      "Search Evergreen Content weeks...",
    );
  });

  it("history back links return to the matching planner workspace", () => {
    const historyRoute = read(
      "components/socialPlanner/SocialPlannerHistoryRoutePage.tsx",
    );
    assert.match(
      historyRoute,
      /socialPlannerWorkspaceHref\(\{\s*planner: plannerKind\s*\}\)/,
    );
    assert.match(historyRoute, /copy\.backToDailyPlanner/);
    assert.match(historyRoute, /copy\.backToEvergreenPlanner/);
    assert.equal(
      socialPlannerWorkspaceHref({ planner: "daily_social" }),
      "/social-planner?planner=daily",
    );
    assert.equal(
      socialPlannerWorkspaceHref({ planner: "evergreen" }),
      "/social-planner?planner=evergreen",
    );
  });

  it("Open this week still targets the existing calendar detail route", () => {
    const history = read("components/socialPlanner/SocialPlannerHistory.tsx");
    assert.match(history, /href=\{`\/social-planner\/\$\{calendar\.id\}`\}/);
    assert.doesNotMatch(history, /\/social-planner\/history\//);
    assert.doesNotMatch(history, /target="_blank"/);
  });

  it("keeps Audience CTA, planner tabs, and generation CTAs unchanged", () => {
    const audience = read("app/personas/[id]/page.tsx");
    const tabs = read("components/socialPlanner/SocialPlannerTabs.tsx");
    const form = read("components/socialPlanner/SocialPlannerCreateForm.tsx");

    assert.match(
      audience,
      /href=\{`\/social-planner\?personaId=\$\{persona\.id\}`\}/,
    );
    assert.doesNotMatch(audience, /social-planner\/history/);
    assert.doesNotMatch(audience, /historyCtaAction/);

    assert.match(tabs, /data-planner-kind="daily_social"/);
    assert.match(tabs, /data-planner-kind="evergreen"/);
    assert.match(tabs, /socialPlannerWorkspaceHref\(\{\s*planner: "daily"/);
    assert.match(tabs, /socialPlannerWorkspaceHref\(\{\s*planner: "evergreen"/);
    assert.match(tabs, /copy\.plannerKinds\.dailySocial/);
    assert.match(tabs, /copy\.plannerKinds\.evergreen/);

    assert.equal(en.socialPlanner.generateDailyWeek, "Generate Daily Social Week");
    assert.equal(
      en.socialPlanner.generateEvergreenWeek,
      "Generate Evergreen Week",
    );
    assert.equal(en.socialPlanner.selectWeekDaily, "Plan a Daily Social week");
    assert.equal(en.socialPlanner.selectWeekEvergreen, "Plan an Evergreen week");
    assert.match(form, /copy\.generateDailyWeek/);
    assert.match(form, /copy\.generateEvergreenWeek/);
    assert.match(form, /copy\.selectWeekDaily/);
    assert.match(form, /copy\.selectWeekEvergreen/);
    assert.match(form, /SOCIAL_PRIMARY_CLASS/);
    assert.match(SOCIAL_PRIMARY_CLASS, /athena-orange/);
  });

  it("history CTAs stay secondary cyan\/violet navigation, not orange generation", () => {
    const cta = read("components/socialPlanner/SocialPlannerHistoryCta.tsx");
    assert.match(cta, /SOCIAL_HISTORY_CTA_DAILY/);
    assert.match(cta, /SOCIAL_HISTORY_CTA_EVERGREEN/);
    assert.doesNotMatch(cta, /SOCIAL_PRIMARY_CLASS/);
    assert.match(SOCIAL_HISTORY_CTA_DAILY, /56,189,248/);
    assert.doesNotMatch(SOCIAL_HISTORY_CTA_DAILY, /255,102,0/);
    assert.match(SOCIAL_HISTORY_CTA_EVERGREEN, /167,139,250/);
    assert.doesNotMatch(SOCIAL_HISTORY_CTA_EVERGREEN, /255,102,0/);
    assert.doesNotMatch(SOCIAL_HISTORY_CTA_ACTION_DAILY, /athena-orange/);
    assert.doesNotMatch(SOCIAL_HISTORY_CTA_ACTION_EVERGREEN, /athena-orange/);
  });

  it("keeps SP-6 i18n key parity across six locales", () => {
    const canonical = collectKeyPaths(en);
    for (const key of HISTORY_I18N_KEYS) {
      assert.ok(canonical.includes(key), key);
    }
    for (const language of ORGANIZATION_LANGUAGES) {
      const paths = collectKeyPaths(DICTIONARIES[language]);
      for (const key of HISTORY_I18N_KEYS) {
        assert.ok(paths.includes(key), `${language}:${key}`);
      }
    }
    assert.notEqual(
      fr.socialPlanner.historyCtaActionDaily,
      en.socialPlanner.historyCtaActionDaily,
    );
    assert.notEqual(
      de.socialPlanner.historyPageTitleEvergreen,
      en.socialPlanner.historyPageTitleEvergreen,
    );
  });

  it("does not touch generation, worker, or schema contracts", () => {
    const historyFiles = [
      "app/social-planner/page.tsx",
      "app/social-planner/history/daily/page.tsx",
      "app/social-planner/history/evergreen/page.tsx",
      "components/socialPlanner/SocialPlannerWorkspace.tsx",
      "components/socialPlanner/SocialPlannerHistoryCta.tsx",
      "components/socialPlanner/SocialPlannerHistoryPageWorkspace.tsx",
      "components/socialPlanner/SocialPlannerHistoryRoutePage.tsx",
      "lib/socialPlanner/socialPlannerRouting.ts",
      "lib/socialPlanner/socialPlannerPagePresentation.ts",
    ];
    for (const file of historyFiles) {
      const source = read(file);
      assert.doesNotMatch(source, /dispatchSocialPlannerGeneration/);
      assert.doesNotMatch(source, /generateEvergreenSocialCalendarPackage/);
      assert.doesNotMatch(source, /validateSocialCalendarPackage/);
      assert.doesNotMatch(source, /socialPlannerEvergreenGenerationPrompts/);
      assert.doesNotMatch(source, /socialCalendarGenerationJobExecutor/);
      assert.doesNotMatch(source, /from\("athena_social_calendars"\)/);
    }
    for (const file of FROZEN_GENERATION_FILES) {
      const source = read(file);
      assert.doesNotMatch(source, /socialPlannerHistoryHref/);
      assert.doesNotMatch(source, /SocialPlannerHistoryCta/);
      assert.doesNotMatch(source, /history\/daily/);
    }
  });
});
