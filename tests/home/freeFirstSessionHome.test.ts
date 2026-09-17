import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { FreeFirstSessionHome } from "../../components/home/FreeFirstSessionHome";
import { tenantNavDefs } from "../../components/dashboard/tenantNavigation";
import { shouldShowFreeFirstSessionHome } from "../../lib/home/freeFirstSessionHome";
import { deriveDefineState } from "../../lib/home/homeDomainState";
import type { DefineKind } from "../../lib/home/homeDomainState";
import type { AthenaPlan } from "../../services/athenaPlan";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function identityRow(
  partial: {
    greetingName?: string | null;
    aboutYou?: string | null;
    expertise?: string | null;
    website?: string | null;
    brainStatus?: string;
  } = {},
) {
  return {
    greetingName: partial.greetingName ?? null,
    aboutYou: partial.aboutYou ?? null,
    expertise: partial.expertise ?? null,
    website: partial.website ?? null,
    brainStatus: partial.brainStatus ?? "pending",
    brainLastUpdated: null,
    lastDeepScrapeAt: null,
  };
}

const DEFINE_KINDS: readonly DefineKind[] = [
  "unknown",
  "needs_setup",
  "in_progress",
  "ready",
];

const PLANS: readonly AthenaPlan[] = ["free", "full"];

describe("FREE-3 first-session Home — state authority", () => {
  it("shows the welcome surface only for Free + needs_setup", () => {
    for (const athenaPlan of PLANS) {
      for (const defineKind of DEFINE_KINDS) {
        const expected = athenaPlan === "free" && defineKind === "needs_setup";
        assert.equal(
          shouldShowFreeFirstSessionHome({ athenaPlan, defineKind }),
          expected,
          `${athenaPlan} + ${defineKind}`,
        );
      }
    }
  });

  it("treats a missing identity row as the authoritative untrained Home state", () => {
    const define = deriveDefineState({ status: "ok", data: null });
    assert.equal(define.kind, "needs_setup");
    assert.equal(
      shouldShowFreeFirstSessionHome({
        athenaPlan: "free",
        defineKind: define.kind,
      }),
      true,
    );
    assert.equal(
      shouldShowFreeFirstSessionHome({
        athenaPlan: "full",
        defineKind: define.kind,
      }),
      false,
    );
  });

  it("treats an empty pending identity row as untrained, not an empty pipeline", () => {
    const define = deriveDefineState({
      status: "ok",
      data: identityRow({ brainStatus: "pending" }),
    });
    assert.equal(define.kind, "needs_setup");
    assert.equal(
      shouldShowFreeFirstSessionHome({
        athenaPlan: "free",
        defineKind: define.kind,
      }),
      true,
    );
  });

  it("does not use first-session Home once Brain is trained or setup has started", () => {
    const trained = deriveDefineState({
      status: "ok",
      data: identityRow({
        aboutYou: "voice",
        expertise: "knowledge",
        website: "https://example.com",
        brainStatus: "ready",
      }),
    });
    const started = deriveDefineState({
      status: "ok",
      data: identityRow({
        website: "https://example.com",
        brainStatus: "pending",
      }),
    });
    const training = deriveDefineState({
      status: "ok",
      data: identityRow({ brainStatus: "processing" }),
    });
    const unknown = deriveDefineState({ status: "error" });

    assert.equal(trained.kind, "ready");
    assert.equal(started.kind, "in_progress");
    assert.equal(training.kind, "in_progress");
    assert.equal(unknown.kind, "unknown");

    for (const defineKind of [
      trained.kind,
      started.kind,
      training.kind,
      unknown.kind,
    ]) {
      assert.equal(
        shouldShowFreeFirstSessionHome({
          athenaPlan: "free",
          defineKind,
        }),
        false,
      );
      assert.equal(
        shouldShowFreeFirstSessionHome({
          athenaPlan: "full",
          defineKind,
        }),
        false,
      );
    }
  });

  it("does not infer first-session from email, specimen, created_at, or empty downstream domains", () => {
    const helper = read("lib/home/freeFirstSessionHome.ts");
    const home = read("app/page.tsx");
    const welcome = read("components/home/FreeFirstSessionHome.tsx");
    for (const source of [helper, home, welcome]) {
      assert.doesNotMatch(source, /freesubaccountv2|getoblic\.com/i);
      assert.doesNotMatch(source, /created_at|createdAt/);
      assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie/);
      assert.doesNotMatch(source, /onboarding_complete|firstVisit|first_visit/);
      assert.doesNotMatch(source, /audienceCount|workingCount|seo_reports/);
      assert.doesNotMatch(source, /user\.email|organization\.name/);
    }

    const helperFn = helper.slice(
      helper.indexOf("export function shouldShowFreeFirstSessionHome"),
    );
    assert.match(helperFn, /isFreeUntrained\(input\)/);
    assert.doesNotMatch(helperFn, /visibility|traction|convert|capacity|pipeline/);
    const shared = read("lib/organization/freeUntrained.ts");
    const sharedFn = shared.slice(shared.indexOf("export function isFreeUntrained"));
    assert.match(sharedFn, /athenaPlan === "free"/);
    assert.match(sharedFn, /defineKind === "needs_setup"/);

    const gate = home.slice(
      home.indexOf("shouldShowFreeFirstSessionHome"),
      home.indexOf("const visibility = deriveVisibilityState"),
    );
    assert.match(home, /shouldShowFreeFirstSessionHome\(\{/);
    assert.match(home, /defineKind: define\.kind/);
    assert.doesNotMatch(gate, /snapshot\.visibility|snapshot\.traction|snapshot\.convert|snapshot\.capacity/);
  });
});

describe("FREE-3 first-session Home — presentation", () => {
  it("renders the welcome surface with one Identity CTA and three value previews", () => {
    const html = renderToStaticMarkup(createElement(FreeFirstSessionHome));

    assert.match(html, /data-home-surface="free-first-session"/);
    assert.match(html, /Athena Free/);
    assert.match(html, /Meet Athena\./);
    assert.match(
      html,
      /Athena learns how your business works, who you serve, and how you communicate/,
    );
    assert.match(html, /Teach Athena about my business/);
    assert.match(html, /data-free-first-session-cta="identity"/);
    assert.match(html, /href="\/identity"/);
    assert.match(html, /This begins by teaching Athena about your business/);
    assert.match(html, /Create content/);
    assert.match(html, /Build visibility/);
    assert.match(html, /Find opportunities/);

    assert.doesNotMatch(html, /Athena — What to do next/);
    assert.doesNotMatch(html, /Opportunity pipeline|opportunity pipeline/i);
    assert.doesNotMatch(html, /GetOblic listing capacity/);
    assert.doesNotMatch(html, /Business readiness/);
    assert.doesNotMatch(html, /upgrade|paywall|quota|pricing/i);
    assert.doesNotMatch(html, />FULL</);
    assert.doesNotMatch(html, /padlock|locked|disabled/i);
    assert.doesNotMatch(html, /href="\/seo"/);
    assert.doesNotMatch(html, /href="\/personas"/);
    assert.doesNotMatch(html, /href="\/prospects"/);
    assert.equal(html.includes("<button"), false);
  });

  it("navigates the primary CTA to /identity only and does not generate", () => {
    const welcome = read("components/home/FreeFirstSessionHome.tsx");
    const helper = read("lib/home/freeFirstSessionHome.ts");

    assert.match(welcome, /href=\{IDENTITY_HREF\}/);
    assert.match(welcome, /const IDENTITY_HREF = "\/identity"/);
    assert.doesNotMatch(welcome, /href="\/identity\?/);
    assert.doesNotMatch(welcome, /"use client"/);
    assert.doesNotMatch(welcome, /fetch\(|OpenRouter|Gemini|openai|anthropic/i);
    assert.doesNotMatch(welcome, /trainAthena|runSeo|deep-scrape|generateText/i);
    assert.doesNotMatch(welcome, /from ["']@\/services\//);
    const helperFn = helper.slice(
      helper.indexOf("export function shouldShowFreeFirstSessionHome"),
    );
    assert.doesNotMatch(helperFn, /fetch\(|generateText|trainAthena|deep-scrape/i);

    const html = renderToStaticMarkup(createElement(FreeFirstSessionHome));
    const hrefMatches = [...html.matchAll(/href="([^"]+)"/g)].map(
      (match) => match[1],
    );
    assert.deepEqual(hrefMatches, ["/identity"]);
  });
});

describe("FREE-3 first-session Home — page composition", () => {
  it("keeps operational Home for every state except Free + untrained", () => {
    const home = read("app/page.tsx");
    const firstSessionStart = home.indexOf("shouldShowFreeFirstSessionHome({");
    const starterStart = home.indexOf("shouldShowFreeStarterExperience({");
    const firstSessionEnd = home.indexOf("const visibility = deriveVisibilityState");
    const firstSessionBlock = home.slice(firstSessionStart, starterStart);
    const starterBlock = home.slice(starterStart, firstSessionEnd);
    const operationalBlock = home.slice(firstSessionEnd);

    assert.match(firstSessionBlock, /<FreeFirstSessionHome \/>/);
    assert.doesNotMatch(firstSessionBlock, /HomePriorityList/);
    assert.doesNotMatch(firstSessionBlock, /FreeStarterHome|FreeTrainedHome/);
    assert.match(starterBlock, /<FreeTrainedHome/);
    assert.doesNotMatch(starterBlock, /HomePriorityList/);
    assert.doesNotMatch(firstSessionBlock, /HomeOpportunityPipeline/);
    assert.doesNotMatch(firstSessionBlock, /HomeGetOblicCapacity/);
    assert.doesNotMatch(firstSessionBlock, /HomeBusinessReadiness/);

    assert.match(operationalBlock, /HomePriorityList/);
    assert.match(operationalBlock, /HomeOpportunityPipeline/);
    assert.match(operationalBlock, /HomeGetOblicCapacity/);
    assert.match(operationalBlock, /HomeBusinessReadiness/);
    assert.doesNotMatch(operationalBlock, /FreeFirstSessionHome/);
    assert.doesNotMatch(operationalBlock, /FreeStarterHome|FreeTrainedHome/);
    assert.doesNotMatch(operationalBlock, /Meet Athena/);
    assert.match(operationalBlock, /athenaPlan=\{athenaPlan\}/);
    assert.match(operationalBlock, /defineKind=\{define\.kind\}/);
  });

  it("does not fork Identity, add a second Home route, or start generation from Home", () => {
    const home = read("app/page.tsx");
    assert.match(home, /loadHomeSnapshot\(organizationId, userId\)/);
    assert.match(home, /resolveAthenaPlan\(organizationId\)/);
    assert.doesNotMatch(home, /redirect\("\/identity"\)/);
    assert.doesNotMatch(home, /\/identity\?/);
    assert.doesNotMatch(home, /runSeoGeneration|deep-scrape|generateText|createGenerationJob/);
    assert.doesNotMatch(home, /onboarding_complete|athena_plan === "free"/);
    assert.doesNotMatch(read("app/identity/page.tsx"), /FreeFirstSessionHome|shouldShowFreeFirstSessionHome/);
  });
});

describe("FREE-3 first-session Home — chrome and nav regression", () => {
  it("leaves tenant navigation definitions unchanged", () => {
    const navigation = read("components/dashboard/tenantNavigation.ts");
    assert.doesNotMatch(navigation, /athenaPlan|athena_plan|FREE|FULL/);
    assert.doesNotMatch(navigation, /FreeFirstSessionHome|shouldShowFreeFirstSessionHome/);

    const keys = tenantNavDefs.map((item) => item.key);
    assert.deepEqual(keys, [
      "home",
      "defineYourBusiness",
      "buildVisibility",
      "generateTraction",
      "convertOpportunities",
      "athenaInbox",
      "settings",
      "gettingStarted",
      "intelligenceDomains",
      "discussions",
      "ads",
      "socialPlanner",
      "opportunities",
      "briefings",
      "needHelp",
    ]);
    assert.equal(
      tenantNavDefs.find((item) => item.key === "home")?.href,
      "/",
    );
    assert.equal(
      tenantNavDefs.find((item) => item.key === "defineYourBusiness")?.href,
      "/identity",
    );
    assert.equal(
      tenantNavDefs.find((item) => item.key === "needHelp")?.href,
      "/getting-started",
    );
    assert.equal(
      tenantNavDefs.some((item) => item.disabled && item.key !== "settings"),
      false,
    );
  });

  it("does not change FREE-2 chrome files or Licensee / middleware / auth", () => {
    const chromeFiles = [
      "components/dashboard/TenantAppShell.tsx",
      "components/dashboard/TenantSidebar.tsx",
      "components/dashboard/TenantMobileNav.tsx",
    ];
    for (const file of chromeFiles) {
      const source = read(file);
      assert.doesNotMatch(source, /FreeFirstSessionHome|shouldShowFreeFirstSessionHome/);
      assert.doesNotMatch(source, /needs_setup/);
    }

    assert.doesNotMatch(
      read("middleware.ts"),
      /FreeFirstSessionHome|shouldShowFreeFirstSessionHome/,
    );
    assert.doesNotMatch(
      read("lib/supabase/middleware.ts"),
      /FreeFirstSessionHome|shouldShowFreeFirstSessionHome/,
    );
    assert.doesNotMatch(
      read("services/tenantContext.ts"),
      /FreeFirstSessionHome|shouldShowFreeFirstSessionHome/,
    );
    assert.doesNotMatch(
      read("app/auth/callback/route.ts"),
      /FreeFirstSessionHome|shouldShowFreeFirstSessionHome/,
    );
    assert.doesNotMatch(
      read("services/licensee/licenseeSubAccounts.ts"),
      /FreeFirstSessionHome|shouldShowFreeFirstSessionHome/,
    );
  });
});
