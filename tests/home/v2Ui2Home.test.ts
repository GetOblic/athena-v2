import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { HomeAttentionList } from "../../components/home/HomeAttentionList";
import { HomeDomainCard } from "../../components/home/HomeDomainCard";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import { ORGANIZATION_LANGUAGES } from "../../services/organizationLanguage";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function collectLeaves(
  value: unknown,
  prefix = "",
): Array<{ path: string; text: string }> {
  if (typeof value === "string") {
    return prefix ? [{ path: prefix, text: value }] : [];
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  return Object.keys(value as object).flatMap((key) =>
    collectLeaves(
      (value as Record<string, unknown>)[key],
      prefix ? `${prefix}.${key}` : key,
    ),
  );
}

const DICTIONARIES: Record<string, TenantMessages> = {
  en,
  fr,
  es,
  it: itMessages,
  de,
  pt,
};

const HOME_SOURCES = [
  "app/page.tsx",
  "services/home/homeReadService.ts",
  "lib/home/homeDomainState.ts",
  "lib/home/homeAttention.ts",
  "components/home/HomeDomainCard.tsx",
  "components/home/HomeAttentionList.tsx",
] as const;

const FORBIDDEN_HOME_COPY = [
  "Athena recommends",
  "Best next action",
  "You're all caught up",
  "Business Score",
  "Visibility Score",
  "Traction Score",
  "Opportunity Score",
];

describe("V2-UI-2C Home source contract", () => {
  it("keeps TenantAppShell on Home and replaces V1 Home consumers", () => {
    const home = read("app/page.tsx");
    assert.match(home, /<TenantAppShell currentPath="\/" messages=\{messages\}>/);
    assert.match(home, /loadHomeSnapshot\(organizationId, userId\)/);
    assert.match(home, /requireTenantContext/);
    assert.match(home, /getTenantLocalization/);
    assert.match(home, /HomeDomainCard/);
    assert.match(home, /HomeAttentionList/);
    assert.doesNotMatch(home, /TodaysIntelligence/);
    assert.doesNotMatch(home, /getDashboardStats/);
    assert.doesNotMatch(home, /getTodaysIntelligence/);
    assert.doesNotMatch(home, /function Metric/);
    assert.doesNotMatch(home, /function ActionCard/);
  });

  it("does not import control-plane, GetOblic, scrape, or generation paths", () => {
    for (const file of HOME_SOURCES) {
      const source = read(file);
      assert.doesNotMatch(source, /estimate/i, file);
      assert.doesNotMatch(source, /getoblic/i, file);
      assert.doesNotMatch(source, /\/licensee/, file);
      assert.doesNotMatch(source, /\/super/, file);
      assert.doesNotMatch(source, /generateReview/, file);
      assert.doesNotMatch(source, /runSeoGeneration/, file);
      assert.doesNotMatch(source, /deep-scrape/, file);
      assert.doesNotMatch(source, /openai|anthropic|generateText/i, file);
    }
  });

  it("keeps the Home snapshot slim and count-only for audiences and prospects", () => {
    const helper = read("services/home/homeReadService.ts");
    assert.match(
      helper,
      /greeting_name, about_you, expertise, website, brain_status, brain_last_updated, last_deep_scrape_at/,
    );
    assert.match(
      helper,
      /id, name, status, brief_json, created_at, updated_at/,
    );
    assert.match(helper, /createTenantScope\(organizationId\)/);
    assert.match(helper, /\.eq\("user_id", userId\)/);
    assert.match(helper, /count: "exact"/);
    assert.match(helper, /head: true/);
    assert.match(helper, /\.eq\("lifecycle_status", lifecycleStatus\)/);
    assert.doesNotMatch(helper, /package_json/);
    assert.doesNotMatch(helper, /master_profile/);
    assert.doesNotMatch(helper, /website_intelligence/);
    assert.doesNotMatch(helper, /getAthenaIdentityByUserId/);
    assert.doesNotMatch(helper, /getProspects/);
    assert.doesNotMatch(helper, /getPersonas/);
    assert.doesNotMatch(helper, /listSeoReports/);
    assert.doesNotMatch(helper, /mapSeoReportRow/);
    assert.doesNotMatch(helper, /enrichProspect/);
    assert.doesNotMatch(helper, /computeBrainCompletenessScore/);
  });

  it("does not add a client Home island", () => {
    assert.doesNotMatch(read("components/home/HomeDomainCard.tsx"), /"use client"/);
    assert.doesNotMatch(
      read("components/home/HomeAttentionList.tsx"),
      /"use client"/,
    );
    assert.doesNotMatch(read("app/page.tsx"), /"use client"/);
  });
});

describe("V2-UI-2C Home i18n and presentation", () => {
  it("uses Command Center copy and Audience terminology in English", () => {
    assert.equal(en.dashboard.eyebrow, "Command Center");
    assert.equal(
      en.dashboard.subtitle,
      "Here is where your business stands, and what you can work on now.",
    );
    assert.doesNotMatch(en.dashboard.subtitle, /\btoday\b/i);
    assert.match(en.dashboard.traction.statusZero, /audience/i);
    assert.match(en.dashboard.traction.statusOne, /audience/i);
    assert.match(en.dashboard.traction.statusMany, /audiences/i);
    assert.match(en.dashboard.traction.ctaDefineFirst, /audience/i);
    assert.match(en.dashboard.traction.ctaOpen, /audiences/i);

    const homeLeaves = collectLeaves(en.dashboard);
    for (const leaf of homeLeaves) {
      if (!leaf.path.startsWith("define.") && !leaf.path.startsWith("visibility.") && !leaf.path.startsWith("traction.") && !leaf.path.startsWith("convert.") && !leaf.path.startsWith("attention.") && leaf.path !== "eyebrow" && leaf.path !== "subtitle") {
        continue;
      }
      assert.doesNotMatch(leaf.text, /\bPersonas?\b/);
      for (const forbidden of FORBIDDEN_HOME_COPY) {
        assert.doesNotMatch(leaf.text, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      }
    }
  });

  it("keeps six-language Home keys populated and product terms intact", () => {
    for (const language of ORGANIZATION_LANGUAGES) {
      const dash = DICTIONARIES[language].dashboard;
      assert.ok(dash.define.title.trim());
      assert.ok(dash.visibility.title.trim());
      assert.ok(dash.traction.title.trim());
      assert.ok(dash.convert.title.trim());
      assert.ok(dash.attention.empty.trim());
      assert.ok(dash.attention.loadFailed.trim());
      assert.doesNotMatch(dash.attention.empty, /all caught up/i);
      assert.match(dash.define.ctaOpen, /Athena Brain/);
    }
    assert.notEqual(fr.dashboard.eyebrow, en.dashboard.eyebrow);
    assert.notEqual(es.dashboard.subtitle, en.dashboard.subtitle);
  });

  it("renders persisted greeting and report names verbatim", () => {
    const html = renderToStaticMarkup(
      createElement(HomeDomainCard, {
        stageNumber: 2,
        icon: "visibility",
        title: fr.dashboard.visibility.title,
        question: fr.dashboard.visibility.question,
        tone: "ready",
        statusLabel: fr.dashboard.visibility.labelReady,
        statusLine: fr.dashboard.visibility.statusReady,
        details: ["Acme expansion in Lyon · SEO Intelligence · 1 Sep 2026"],
        ctaLabel: fr.dashboard.visibility.ctaReview,
        href: "/seo",
      }),
    );
    assert.match(html, /Acme expansion in Lyon/);
    assert.doesNotMatch(html, /expansion à Lyon/);
  });

  it("renders cautious attention empty copy instead of a caught-up claim", () => {
    const html = renderToStaticMarkup(
      createElement(HomeAttentionList, {
        title: en.dashboard.attention.title,
        intro: en.dashboard.attention.intro,
        items: [],
        emptyLabel: en.dashboard.attention.empty,
      }),
    );
    assert.match(html, /What needs attention/);
    assert.match(
      html,
      /The current checks do not show an open setup or follow-up item/,
    );
    assert.doesNotMatch(html, /all caught up/i);
  });
});
