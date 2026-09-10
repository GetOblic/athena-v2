/**
 * /social-planner presentation contracts.
 * Does not change create payload, search, pagination, or generation.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { SocialPlannerHistory } from "../../components/socialPlanner/SocialPlannerHistory";
import { TractionPageHeader } from "../../components/traction/TractionPageHeader";
import { TractionSiblingNav } from "../../components/traction/TractionSiblingNav";
import { ATHENA_INTELLIGENCE_ROW_OUTLINE_CLASS } from "../../components/ui/athenaIntelligenceRow";
import {
  SOCIAL_COMPOSER_SURFACE,
  SOCIAL_FIELD_CLASS,
  SOCIAL_OPEN_ACTION_CLASS,
  SOCIAL_PAGE_HEADER_ICON,
  SOCIAL_PRIMARY_CLASS,
  SOCIAL_SEARCH_FIELD_CLASS,
  SOCIAL_SEARCH_SURFACE,
  SOCIAL_TEXTAREA_CLASS,
  SOCIAL_WEEK_CARD_CLASS,
  SOCIAL_WEEK_ICON_CLASS,
  socialPlannerHistoryStatusClass,
} from "../../lib/socialPlanner/socialPlannerPagePresentation";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import { ORGANIZATION_LANGUAGES } from "../../services/organizationLanguage";
import type { SocialCalendarListItemDto } from "../../services/socialPlanner/socialCalendarDto";

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

function listItem(
  overrides: Partial<SocialCalendarListItemDto> = {},
): SocialCalendarListItemDto {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    periodStart: "2026-08-24",
    periodEnd: "2026-08-30",
    status: "Ready",
    generationMode: "standard",
    generationStage: "finalizing",
    versionNumber: 1,
    sourceCalendarId: null,
    rootCalendarId: null,
    strategySummary: "A balanced family-care week with education.",
    whyThisWeekWorks: "This week balances authority and personality.",
    assetCount: 7,
    assetTypes: ["carousel", "talking_head_video"],
    families: [],
    modelsUsed: "Claude Sonnet 4 + Gemini 2.5 Flash",
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
    error: null,
    ...overrides,
  };
}

describe("/social-planner library presentation", () => {
  it("adds a Social-owned MessagesSquare header well and keeps TractionPageHeader defaults", () => {
    const page = read("app/social-planner/page.tsx");
    const header = read("components/traction/TractionPageHeader.tsx");
    assert.match(page, /<MessagesSquare /);
    assert.match(page, /SOCIAL_PAGE_HEADER_ICON/);
    assert.match(page, /TractionPageHeader/);
    assert.match(page, /copy\.eyebrow/);
    assert.match(page, /copy\.title/);
    assert.match(page, /copy\.subtitle/);
    assert.doesNotMatch(page, /action=\{/);
    assert.doesNotMatch(page, /copy\.traction\.helper/);
    assert.match(SOCIAL_PAGE_HEADER_ICON, /56,189,248/);
    assert.match(SOCIAL_PAGE_HEADER_ICON, /232,121,189/);
    assert.doesNotMatch(header, /MessagesSquare|SOCIAL_PAGE_HEADER_ICON/);
    assert.match(
      header,
      /text-xs font-semibold uppercase tracking-\[0\.35em\] text-\[var\(--athena-orange\)\]/,
    );

    const defaultHeader = renderToStaticMarkup(
      createElement(TractionPageHeader, {
        eyebrow: "Generate Traction",
        title: "Social Content",
        subtitle: "Plan one week of social content.",
      }),
    );
    assert.match(defaultHeader, /Social Content/);
    assert.doesNotMatch(defaultHeader, /MessagesSquare|cyan-200/);
  });

  it("keeps TractionSiblingNav unchanged and Social Content current", () => {
    const page = read("app/social-planner/page.tsx");
    const nav = read("components/traction/TractionSiblingNav.tsx");
    assert.match(page, /href: "\/personas"/);
    assert.match(page, /href: "\/ads"/);
    assert.match(page, /href: "\/social-planner"/);
    assert.match(page, /current: true/);
    assert.doesNotMatch(page, /help:/);
    assert.match(nav, /MessagesSquare/);
    assert.match(nav, /sm:grid-cols-3/);
    assert.doesNotMatch(nav, /socialPlannerPagePresentation|SOCIAL_PAGE_HEADER/);

    const html = renderToStaticMarkup(
      createElement(TractionSiblingNav, {
        links: [
          { href: "/personas", label: "Audiences" },
          { href: "/ads", label: "Advertising" },
          { href: "/social-planner", label: "Social Content", current: true },
        ],
      }),
    );
    assert.match(html, /Audiences/);
    assert.match(html, /Advertising/);
    assert.match(html, /Social Content/);
    assert.doesNotMatch(html, /href="\/social-planner"/);
  });

  it("keeps the week composer inline with date, guidance, and Generate this week", () => {
    const form = read("components/socialPlanner/SocialPlannerCreateForm.tsx");
    const workspace = read("components/socialPlanner/SocialPlannerWorkspace.tsx");
    assert.match(workspace, /<SocialPlannerCreateForm/);
    assert.match(form, /id="social-planner-composer"/);
    assert.match(form, /SOCIAL_COMPOSER_SURFACE/);
    assert.match(form, /<Sparkles /);
    assert.match(form, /copy\.selectWeek/);
    assert.match(form, /type="date"/);
    assert.match(form, /required/);
    assert.match(form, /copy\.weekStarts/);
    assert.match(form, /copy\.optionalDirection/);
    assert.match(form, /SOCIAL_CALENDAR_USER_GUIDANCE_MAX_CHARS/);
    assert.match(form, /copy\.generateMyWeek/);
    assert.match(form, /copy\.starting/);
    assert.match(form, /SOCIAL_PRIMARY_CLASS/);
    assert.match(form, /submitting/);
    assert.doesNotMatch(form, /AthenaCollapsibleSection|defaultOpen/);
    assert.doesNotMatch(form, /step=|multi-step|wizard/i);
    assert.doesNotMatch(form, /score|readiness|engagement/i);
    assert.match(SOCIAL_COMPOSER_SURFACE, /255,102,0/);
    assert.match(SOCIAL_COMPOSER_SURFACE, /56,189,248/);
    assert.match(SOCIAL_FIELD_CLASS, /bg-black\/25/);
    assert.match(SOCIAL_TEXTAREA_CLASS, /min-h-\[140px\]/);
    assert.match(SOCIAL_PRIMARY_CLASS, /athena-orange/);
  });

  it("replaces the search field with a Social-owned toolbar and no new filters", () => {
    const workspace = read("components/socialPlanner/SocialPlannerWorkspace.tsx");
    assert.match(workspace, /SOCIAL_SEARCH_SURFACE/);
    assert.match(workspace, /SOCIAL_SEARCH_FIELD_CLASS/);
    assert.match(workspace, /copy\.searchPlaceholder/);
    assert.match(workspace, /<Search/);
    assert.match(workspace, /setPage\(1\)/);
    assert.match(workspace, /void loadHistory\(value, 1\)/);
    assert.doesNotMatch(workspace, /status filter|platform filter|date filter/i);
    assert.doesNotMatch(workspace, /view toggle|view mode|Import Prospects/);
    assert.doesNotMatch(workspace, /<select/);
    assert.match(SOCIAL_SEARCH_SURFACE, /56,189,248/);
    assert.match(SOCIAL_SEARCH_FIELD_CLASS, /pl-10/);
  });

  it("uses a compact Social week card and drops the shared orange intelligence outline", () => {
    const history = read("components/socialPlanner/SocialPlannerHistory.tsx");
    assert.match(history, /SOCIAL_WEEK_CARD_CLASS/);
    assert.match(history, /SOCIAL_WEEK_ICON_CLASS/);
    assert.match(history, /<CalendarDays /);
    assert.match(history, /strategySummary/);
    assert.match(history, /whyThisWeekWorks/);
    assert.match(history, /\{calendar\.modelsUsed\}/);
    assert.match(history, /line-clamp-2 text-sm leading-6 text-white\/55/);
    assert.match(history, /line-clamp-2 text-sm leading-6 text-white\/40/);
    assert.match(history, /text-white\/55/);
    assert.match(history, /copy\.openCalendar/);
    assert.match(history, /SOCIAL_OPEN_ACTION_CLASS/);
    assert.match(history, /<ArrowRight /);
    assert.match(history, /href=\{`\/social-planner\/\$\{calendar\.id\}`\}/);
    assert.doesNotMatch(history, /ATHENA_INTELLIGENCE_ROW_OUTLINE_CLASS/);
    assert.doesNotMatch(history, /255,102,0,0\.18/);
    assert.doesNotMatch(history, /recommendedPlatforms|whoThisIsFor|productionSpec/);
    assert.doesNotMatch(history, /Instagram|TikTok|Facebook/);
    assert.doesNotMatch(history, /Publish|Schedule|Traction Score|readiness/i);
    assert.match(SOCIAL_WEEK_CARD_CLASS, /56,189,248/);
    assert.match(SOCIAL_WEEK_CARD_CLASS, /232,121,189/);
    assert.match(SOCIAL_WEEK_ICON_CLASS, /cyan-200/);
    assert.doesNotMatch(SOCIAL_OPEN_ACTION_CLASS, /athena-orange\)\] px|bg-\[var\(--athena-orange\)\]/);
    assert.match(ATHENA_INTELLIGENCE_ROW_OUTLINE_CLASS, /255,102,0/);
  });

  it("preserves history status semantics and demotes generation-mode badges", () => {
    const history = read("components/socialPlanner/SocialPlannerHistory.tsx");
    assert.match(history, /getLocalizedSocialPlannerHistoryStatusLabel/);
    assert.match(history, /socialPlannerHistoryStatusClass/);
    assert.match(history, /generationMode !== "standard"/);
    assert.match(history, /versionNumber > 1/);
    assert.match(socialPlannerHistoryStatusClass("Ready"), /emerald/);
    assert.match(socialPlannerHistoryStatusClass("Processing Failed"), /rose/);
    assert.match(socialPlannerHistoryStatusClass("Queued"), /167,139,250/);
    assert.match(socialPlannerHistoryStatusClass("Processing"), /255,102,0/);

    const ready = renderToStaticMarkup(
      createElement(SocialPlannerHistory, {
        calendars: [listItem()],
        pagination: {
          page: 1,
          limit: 25,
          total: 1,
          totalPages: 1,
          hasMore: false,
        },
        search: "",
        onPageChange() {},
        messages: en,
      }),
    );
    assert.match(ready, /Ready/);
    assert.match(ready, /A balanced family-care week with education/);
    assert.match(ready, /This week balances authority and personality/);
    assert.match(ready, /Claude Sonnet 4 \+ Gemini 2\.5 Flash/);
    assert.match(ready, /Open this week/);
    assert.doesNotMatch(ready, /Publish|Schedule|Draft|Engagement/);

    const generating = renderToStaticMarkup(
      createElement(SocialPlannerHistory, {
        calendars: [listItem({ status: "Queued", strategySummary: null })],
        pagination: {
          page: 1,
          limit: 25,
          total: 1,
          totalPages: 1,
          hasMore: false,
        },
        search: "",
        onPageChange() {},
        messages: en,
      }),
    );
    assert.match(generating, /Generating/);
    assert.doesNotMatch(generating, />Queued</);

    const failed = renderToStaticMarkup(
      createElement(SocialPlannerHistory, {
        calendars: [listItem({ status: "Processing Failed" })],
        pagination: {
          page: 1,
          limit: 25,
          total: 1,
          totalPages: 1,
          hasMore: false,
        },
        search: "",
        onPageChange() {},
        messages: en,
      }),
    );
    assert.match(failed, /Failed/);
    assert.doesNotMatch(failed, /Processing Failed/);
  });

  it("modernizes search-empty and keeps true empty absent", () => {
    const history = read("components/socialPlanner/SocialPlannerHistory.tsx");
    assert.match(history, /SOCIAL_EMPTY_SEARCH_CLASS/);
    assert.match(history, /<CalendarSearch /);
    assert.match(history, /copy\.noSearchMatch/);
    assert.match(
      history,
      /if \(!hasSearch && pagination\.total === 0 && calendars\.length === 0\) \{\s*return null;/,
    );

    const searchEmpty = renderToStaticMarkup(
      createElement(SocialPlannerHistory, {
        calendars: [],
        pagination: {
          page: 1,
          limit: 25,
          total: 0,
          totalPages: 0,
          hasMore: false,
        },
        search: "zzz-no-match",
        onPageChange() {},
        messages: en,
      }),
    );
    assert.match(searchEmpty, /No weeks match your search/);

    const trueEmpty = renderToStaticMarkup(
      createElement(SocialPlannerHistory, {
        calendars: [],
        pagination: {
          page: 1,
          limit: 25,
          total: 0,
          totalPages: 0,
          hasMore: false,
        },
        search: "",
        onPageChange() {},
        messages: en,
      }),
    );
    assert.equal(trueEmpty, "");
  });

  it("keeps pagination Previous / Next secondary and unchanged in behavior", () => {
    const history = read("components/socialPlanner/SocialPlannerHistory.tsx");
    assert.match(history, /copy\.previous/);
    assert.match(history, /copy\.next/);
    assert.match(history, /disabled=\{pagination\.page <= 1\}/);
    assert.match(history, /disabled=\{pagination\.page >= pagination\.totalPages\}/);
    assert.match(history, /showPagination = pagination\.total > pagination\.limit/);
    assert.match(history, /formatSocialPlannerShowingLabel/);
    assert.doesNotMatch(history, /pageNumbers|Load more|type="number"/);
  });

  it("aligns list chrome meaning across six locales without adding score keys", () => {
    assert.equal(en.socialPlanner.generateMyWeek, "Generate this week");
    assert.equal(en.socialPlanner.historyTitle, "Previous weeks");
    assert.equal(en.socialPlanner.openCalendar, "Open this week");
    assert.equal(en.socialPlanner.title, "Social Content");
    assert.equal(fr.socialPlanner.generateMyWeek, "Générer cette semaine");
    assert.equal(es.socialPlanner.openCalendar, "Abrir esta semana");
    assert.equal(itMessages.socialPlanner.historyTitle, "Settimane precedenti");
    assert.equal(de.socialPlanner.generateMyWeek, "Diese Woche generieren");
    assert.equal(pt.socialPlanner.openCalendar, "Abrir esta semana");
    const canonical = collectKeyPaths(en);
    assert.ok(canonical.includes("socialPlanner.traction.helper"));
    assert.ok(!canonical.includes("socialPlanner.score"));
    assert.ok(!canonical.includes("socialPlanner.readiness"));
    for (const language of ORGANIZATION_LANGUAGES) {
      const paths = collectKeyPaths(DICTIONARIES[language]);
      assert.ok(paths.includes("socialPlanner.generateMyWeek"), language);
      assert.ok(paths.includes("socialPlanner.historyTitle"), language);
      assert.ok(paths.includes("socialPlanner.openCalendar"), language);
      assert.ok(!paths.includes("socialPlanner.score"), language);
    }
    assert.notEqual(fr.socialPlanner.generateMyWeek, en.socialPlanner.generateMyWeek);
    assert.notEqual(de.socialPlanner.title, en.socialPlanner.title);
  });

  it("does not invent publishing, scheduling, scores, or platform chrome", () => {
    const files = [
      "app/social-planner/page.tsx",
      "components/socialPlanner/SocialPlannerWorkspace.tsx",
      "components/socialPlanner/SocialPlannerCreateForm.tsx",
      "components/socialPlanner/SocialPlannerHistory.tsx",
      "lib/socialPlanner/socialPlannerPagePresentation.ts",
    ];
    for (const file of files) {
      const source = read(file);
      assert.doesNotMatch(source, /Publish|Schedule|Draft status|Approval/);
      assert.doesNotMatch(source, /Engagement score|Social score|Readiness score|Traction Score/);
      assert.doesNotMatch(source, /platform picker|persona picker|status filter/i);
    }
  });

  it("does not change shared component defaults or accepted Ads / Personas surfaces", () => {
    const header = read("components/traction/TractionPageHeader.tsx");
    const nav = read("components/traction/TractionSiblingNav.tsx");
    const collapsible = read("components/ui/AthenaCollapsibleSection.tsx");
    const copyButton = read("components/deployment/CopyButton.tsx");
    const confirm = read("components/ui/ConfirmDeleteControl.tsx");
    const shell = read("components/dashboard/TenantAppShell.tsx");
    const row = read("components/ui/athenaIntelligenceRow.ts");
    assert.match(header, /text-\[var\(--athena-orange\)\]/);
    assert.doesNotMatch(header, /SOCIAL_|MessagesSquare/);
    assert.match(nav, /FAMILY_FROM_HREF/);
    assert.doesNotMatch(nav, /SOCIAL_PAGE_HEADER|socialPlannerPagePresentation/);
    assert.match(collapsible, /tone = "default"/);
    assert.match(collapsible, /defaultOpen = false/);
    assert.doesNotMatch(copyButton, /socialPlannerPagePresentation/);
    assert.doesNotMatch(confirm, /socialPlannerPagePresentation/);
    assert.doesNotMatch(shell, /socialPlannerPagePresentation/);
    assert.match(row, /export const ATHENA_INTELLIGENCE_ROW_OUTLINE_CLASS/);
    assert.match(read("app/ads/new/page.tsx"), /AD_CREATE_HEADER_ICON_WELL/);
    assert.match(read("components/ads/AdCampaignGenerateForm.tsx"), /AD_CREATE_BRIEF_SURFACE/);
    assert.match(read("app/personas/page.tsx"), /PERSONA_HEADER_CREATE_CLASS/);
    assert.match(read("lib/personas/personaPagePresentation.ts"), /PERSONA_CARD_SURFACE_CLASS/);
  });
});
