import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { HomePriorityList } from "../../components/home/HomePriorityList";
import { HomeDomainCard } from "../../components/home/HomeDomainCard";
import { HomeGetOblicCapacity } from "../../components/home/HomeGetOblicCapacity";
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
  "lib/home/homePipeline.ts",
  "lib/home/homePresentation.ts",
  "components/home/HomeDomainCard.tsx",
  "components/home/HomePriorityList.tsx",
  "components/home/HomeOpportunityPipeline.tsx",
  "components/home/HomeGetOblicCapacity.tsx",
  "components/home/HomeBusinessReadiness.tsx",
] as const;

const FORBIDDEN_HOME_COPY = [
  "Athena recommends",
  "Best next action",
  "You're all caught up",
  "Business Score",
  "Visibility Score",
  "Traction Score",
  "Opportunity Score",
  "Conversion Rate",
  "pipeline health",
  "monthly allowance",
  "used this month",
];

describe("V2 Home source contract", () => {
  it("keeps TenantAppShell on Home and uses the command-center surfaces", () => {
    const home = read("app/page.tsx");
    assert.match(home, /<TenantAppShell currentPath="\/" messages=\{messages\}>/);
    assert.match(home, /loadHomeSnapshot\(organizationId, userId\)/);
    assert.match(home, /requireTenantContext/);
    assert.match(home, /getTenantLocalization/);
    assert.match(home, /HomePriorityList/);
    assert.match(home, /HomeOpportunityPipeline/);
    assert.match(home, /HomeGetOblicCapacity/);
    assert.match(home, /HomeBusinessReadiness/);
    assert.doesNotMatch(home, /TodaysIntelligence/);
    assert.doesNotMatch(home, /getDashboardStats/);
    assert.doesNotMatch(home, /getTodaysIntelligence/);
    assert.doesNotMatch(home, /function Metric/);
    assert.doesNotMatch(home, /function ActionCard/);
    assert.doesNotMatch(home, /Goals/);
  });

  it("does not import control-plane, scrape, or generation paths", () => {
    for (const file of HOME_SOURCES) {
      const source = read(file);
      assert.doesNotMatch(source, /estimate/i, file);
      assert.doesNotMatch(source, /\/licensee/, file);
      assert.doesNotMatch(source, /\/super/, file);
      assert.doesNotMatch(source, /generateReview/, file);
      assert.doesNotMatch(source, /runSeoGeneration/, file);
      assert.doesNotMatch(source, /deep-scrape/, file);
      assert.doesNotMatch(source, /openai|anthropic|generateText/i, file);
    }
  });

  it("keeps the Home snapshot slim and batched", () => {
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
    assert.match(helper, /excludeReleasedOnlyGetOblicProspectsFromLibrary/);
    assert.match(helper, /getGetOblicListingCapacity/);
    assert.match(helper, /getGetOblicProspectLinkPresence/);
    assert.match(helper, /getGenerationJobStateForDiscussions/);
    assert.match(helper, /resolveProspectDisplayStatus/);
    assert.match(helper, /computeProspectIntelligenceCompleteness/);
    assert.doesNotMatch(helper, /getActiveGenerationJobForDiscussion/);
    assert.doesNotMatch(helper, /getLatestGenerationJobForDiscussion/);
    assert.doesNotMatch(helper, /countProspects/);
    assert.doesNotMatch(helper, /select\("\*"\)/);
    assert.doesNotMatch(helper, /package_json/);
    assert.doesNotMatch(helper, /master_profile/);
    assert.doesNotMatch(helper, /getAthenaIdentityByUserId/);
    assert.doesNotMatch(helper, /getProspects\(/);
    assert.doesNotMatch(helper, /loadProspectsForLibrary/);
    assert.doesNotMatch(helper, /enrichProspectsForLibrary/);
    assert.doesNotMatch(helper, /from\("opportunities"\)/);
    assert.doesNotMatch(helper, /getPersonas/);
    assert.doesNotMatch(helper, /listSeoReports/);
    assert.doesNotMatch(helper, /mapSeoReportRow/);
    assert.doesNotMatch(helper, /computeBrainCompletenessScore/);
  });

  it("adds a read-only batched generation-job helper", () => {
    const jobs = read("services/generationJobs/generationJobService.ts");
    assert.match(jobs, /export async function getGenerationJobStateForDiscussions/);
    assert.match(
      jobs,
      /HOME_JOB_STATE_COLUMNS =\n  "discussion_id, status, current_stage, created_at"/,
    );
    const helperStart = jobs.indexOf(
      "export async function getGenerationJobStateForDiscussions",
    );
    const helperEnd = jobs.indexOf("export async function getGenerationJobById");
    const helper = jobs.slice(helperStart, helperEnd);
    assert.match(helper, /\.select\(HOME_JOB_STATE_COLUMNS\)/);
    assert.doesNotMatch(helper, /\.insert\(/);
    assert.doesNotMatch(helper, /\.update\(/);
    assert.doesNotMatch(helper, /\.upsert\(/);
    assert.doesNotMatch(helper, /createGenerationJob/);
  });

  it("does not add a client Home island", () => {
    assert.doesNotMatch(read("components/home/HomeDomainCard.tsx"), /"use client"/);
    assert.doesNotMatch(
      read("components/home/HomePriorityList.tsx"),
      /"use client"/,
    );
    assert.doesNotMatch(read("app/page.tsx"), /"use client"/);
  });

  it("does not invent commercial outcome copy in Home sources", () => {
    for (const file of HOME_SOURCES) {
      const source = read(file);
      assert.doesNotMatch(source, /Revenue/, file);
      assert.doesNotMatch(source, /Customers/, file);
      assert.doesNotMatch(source, /Conversion Rate/, file);
      assert.doesNotMatch(source, /Opportunity Score/, file);
      assert.doesNotMatch(source, /Visibility Score/, file);
      assert.doesNotMatch(source, /Traction Score/, file);
      assert.doesNotMatch(source, /monthly allowance/, file);
      assert.doesNotMatch(source, /used this month/, file);
      assert.doesNotMatch(source, /Goals & Progress/, file);
    }
  });
});

describe("V2 Home i18n and presentation", () => {
  it("uses Command Center copy and Audience terminology in English", () => {
    assert.equal(en.dashboard.eyebrow, "Command Center");
    assert.equal(
      en.dashboard.subtitle,
      "Keep a healthy pipeline and continuously move the best opportunities forward.",
    );
    assert.equal(en.dashboard.next.title, "Athena — What to do next");
    assert.doesNotMatch(en.dashboard.subtitle, /\btoday\b/i);
    assert.match(en.dashboard.traction.statusZero, /audience/i);
    assert.match(en.dashboard.traction.statusOne, /audience/i);
    assert.match(en.dashboard.traction.statusMany, /audiences/i);
    assert.match(en.dashboard.traction.ctaDefineFirst, /audience/i);
    assert.match(en.dashboard.traction.ctaOpen, /audiences/i);
    assert.match(en.dashboard.next.defineFirstAudience.body, /audience/i);

    const homeLeaves = collectLeaves(en.dashboard);
    for (const leaf of homeLeaves) {
      if (
        !leaf.path.startsWith("define.") &&
        !leaf.path.startsWith("visibility.") &&
        !leaf.path.startsWith("traction.") &&
        !leaf.path.startsWith("convert.") &&
        !leaf.path.startsWith("next.") &&
        !leaf.path.startsWith("pipeline.") &&
        !leaf.path.startsWith("capacity.") &&
        !leaf.path.startsWith("readiness.") &&
        leaf.path !== "eyebrow" &&
        leaf.path !== "subtitle"
      ) {
        continue;
      }
      assert.doesNotMatch(leaf.text, /\bPersonas?\b/);
      assert.doesNotMatch(leaf.text, /\bRevenue\b/);
      assert.doesNotMatch(leaf.text, /\bCustomers\b/);
      assert.doesNotMatch(leaf.text, /Conversion Rate/);
      assert.doesNotMatch(leaf.text, /Goals/);
      for (const forbidden of FORBIDDEN_HOME_COPY) {
        assert.doesNotMatch(
          leaf.text,
          new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        );
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
      assert.ok(dash.next.empty.trim());
      assert.ok(dash.next.loadFailed.trim());
      assert.ok(dash.pipeline.title.trim());
      assert.ok(dash.capacity.title.trim());
      assert.ok(dash.readiness.title.trim());
      assert.doesNotMatch(dash.next.empty, /all caught up/i);
      assert.match(dash.define.ctaOpen, /Athena Brain/);
      assert.match(dash.capacity.title, /GetOblic/);
    }
    assert.notEqual(fr.dashboard.eyebrow, en.dashboard.eyebrow);
    assert.notEqual(es.dashboard.subtitle, en.dashboard.subtitle);
    assert.notEqual(fr.dashboard.next.title, en.dashboard.next.title);
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

  it("renders cautious next-action empty copy instead of a caught-up claim", () => {
    const html = renderToStaticMarkup(
      createElement(HomePriorityList, {
        title: en.dashboard.next.title,
        intro: en.dashboard.next.intro,
        items: [],
        emptyLabel: en.dashboard.next.empty,
      }),
    );
    assert.match(html, /Athena — What to do next/);
    assert.match(
      html,
      /No operational next step is clear from the current workspace state/,
    );
    assert.doesNotMatch(html, /all caught up/i);
  });

  it("renders unconfigured GetOblic capacity without fake zeros", () => {
    const html = renderToStaticMarkup(
      createElement(HomeGetOblicCapacity, {
        state: { kind: "unconfigured" },
        messages: en.dashboard.capacity,
      }),
    );
    assert.match(html, /not configured/);
    assert.doesNotMatch(html, /data-home-capacity-available/);
    assert.doesNotMatch(html, /monthly allowance/i);
    assert.doesNotMatch(html, /used this month/i);
  });
});
