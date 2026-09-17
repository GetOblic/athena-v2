import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import {
  TenantNavList,
  TenantSidebar,
} from "../../components/dashboard/TenantSidebar";
import { TenantAppShell } from "../../components/dashboard/TenantAppShell";
import {
  localizeTenantNav,
  lockedGrowthNavGuidanceClassName,
  tenantNavDefs,
  tenantSidebarFrameClassName,
} from "../../components/dashboard/tenantNavigation";
import { shouldShowFreeFirstSessionHome } from "../../lib/home/freeFirstSessionHome";
import { deriveDefineState } from "../../lib/home/homeDomainState";
import type { DefineKind } from "../../lib/home/homeDomainState";
import {
  IDENTITY_FIELD_ANCHORS,
  IDENTITY_TEACH_ATHENA_HREF,
} from "../../components/identity/identityPagePresentation";
import {
  applyFreeUntrainedNavPresentation,
  FREE_UNTRAINED_LOCKED_NAV_KEYS,
  FREE_UNTRAINED_TEACH_HREF,
  freeUntrainedLockedNavCopy,
  isFreeUntrained,
} from "../../lib/organization/freeUntrained";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { AthenaPlan } from "../../services/athenaPlan";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const DEFINE_KINDS: readonly DefineKind[] = [
  "unknown",
  "needs_setup",
  "in_progress",
  "ready",
];

const PLANS: readonly AthenaPlan[] = ["free", "full"];

const LOCKED_COPY = freeUntrainedLockedNavCopy(en.nav);
const LOCKED_SUBTITLE = en.nav.teachAthenaFirst;
const LOCKED_EXPLANATIONS = {
  buildVisibility: en.nav.buildVisibilityTeachAthena,
  generateTraction: en.nav.generateTractionTeachAthena,
  convertOpportunities: en.nav.convertOpportunitiesTeachAthena,
} as const;

function identityRow(
  partial: {
    aboutYou?: string | null;
    expertise?: string | null;
    website?: string | null;
    brainStatus?: string;
  } = {},
) {
  return {
    greetingName: null,
    aboutYou: partial.aboutYou ?? null,
    expertise: partial.expertise ?? null,
    website: partial.website ?? null,
    brainStatus: partial.brainStatus ?? "pending",
    brainLastUpdated: null,
    lastDeepScrapeAt: null,
  };
}

function presentNav(athenaPlan?: AthenaPlan, defineKind?: DefineKind) {
  return applyFreeUntrainedNavPresentation(
    localizeTenantNav(en),
    { athenaPlan, defineKind },
    LOCKED_COPY,
  );
}

function renderSidebar(
  athenaPlan?: AthenaPlan,
  defineKind?: DefineKind,
  currentPath = "/",
) {
  return renderToStaticMarkup(
    createElement(TenantSidebar, {
      currentPath,
      messages: en,
      athenaPlan,
      defineKind,
    }),
  );
}

function renderShell(
  athenaPlan?: AthenaPlan,
  defineKind?: DefineKind,
  currentPath = "/",
) {
  return renderToStaticMarkup(
    createElement(
      TenantAppShell,
      {
        currentPath,
        messages: en,
        athenaPlan,
        defineKind,
      },
      createElement("div", null, "Body"),
    ),
  );
}

function renderMobileNav(athenaPlan?: AthenaPlan, defineKind?: DefineKind) {
  const items = presentNav(athenaPlan, defineKind);
  return renderToStaticMarkup(
    createElement(TenantNavList, {
      currentPath: "/",
      items,
      yourGrowthLabel: en.nav.yourGrowth,
      utilitiesLabel: en.nav.utilities,
      moreToolsLabel: en.nav.moreTools,
    }),
  );
}

function hrefsIn(html: string): string[] {
  return [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
}

function itemByKey(items: ReturnType<typeof presentNav>, key: string) {
  const item = items.find((entry) => entry.key === key);
  assert.ok(item, key);
  return item;
}

describe("FREE-4 shared Free + untrained contract", () => {
  it("locks only Free + needs_setup and stays aligned with FREE-3 Home", () => {
    for (const athenaPlan of PLANS) {
      for (const defineKind of DEFINE_KINDS) {
        const expected = athenaPlan === "free" && defineKind === "needs_setup";
        assert.equal(
          isFreeUntrained({ athenaPlan, defineKind }),
          expected,
          `${athenaPlan} + ${defineKind}`,
        );
        assert.equal(
          shouldShowFreeFirstSessionHome({ athenaPlan, defineKind }),
          expected,
          `Home gate drift ${athenaPlan} + ${defineKind}`,
        );
      }
    }
  });

  it("uses deriveDefineState needs_setup, not email/specimen/created_at heuristics", () => {
    const missing = deriveDefineState({ status: "ok", data: null });
    const emptyPending = deriveDefineState({
      status: "ok",
      data: identityRow({ brainStatus: "pending" }),
    });
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
    const unknown = deriveDefineState({ status: "error" });

    assert.equal(missing.kind, "needs_setup");
    assert.equal(emptyPending.kind, "needs_setup");
    assert.equal(trained.kind, "ready");
    assert.equal(started.kind, "in_progress");
    assert.equal(unknown.kind, "unknown");

    assert.equal(
      isFreeUntrained({ athenaPlan: "free", defineKind: missing.kind }),
      true,
    );
    assert.equal(
      isFreeUntrained({ athenaPlan: "free", defineKind: emptyPending.kind }),
      true,
    );
    assert.equal(
      isFreeUntrained({ athenaPlan: "free", defineKind: trained.kind }),
      false,
    );
    assert.equal(
      isFreeUntrained({ athenaPlan: "free", defineKind: started.kind }),
      false,
    );
    assert.equal(
      isFreeUntrained({ athenaPlan: "full", defineKind: missing.kind }),
      false,
    );

    const sources = [
      read("lib/organization/freeUntrained.ts"),
      read("services/organization/freeProgressionState.ts"),
      read("components/dashboard/TenantAppShell.tsx"),
      read("components/dashboard/TenantSidebar.tsx"),
      read("app/seo/layout.tsx"),
      read("app/personas/layout.tsx"),
      read("app/prospects/layout.tsx"),
    ];
    for (const source of sources) {
      assert.doesNotMatch(source, /freesubaccountv2|getoblic\.com/i);
      assert.doesNotMatch(source, /created_at|createdAt/);
      assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie/);
      assert.doesNotMatch(source, /user\.email|organization\.name/);
      assert.doesNotMatch(source, /onboarding_complete|specimen/);
    }
  });
});

describe("FREE-4 sidebar and mobile progression", () => {
  it("keeps Home, Define, and Help navigable for Free + needs_setup", () => {
    const items = presentNav("free", "needs_setup");
    const home = itemByKey(items, "home");
    const define = itemByKey(items, "defineYourBusiness");
    const help = itemByKey(items, "needHelp");

    assert.equal(home.disabled, undefined);
    assert.equal(home.href, "/");
    assert.equal(define.disabled, undefined);
    assert.equal(define.href, "/identity");
    assert.equal(help.disabled, undefined);
    assert.equal(help.href, "/getting-started");
  });

  it("keeps Steps 2-4 visible but not navigable for Free + needs_setup", () => {
    const items = presentNav("free", "needs_setup");
    assert.deepEqual([...FREE_UNTRAINED_LOCKED_NAV_KEYS], [
      "buildVisibility",
      "generateTraction",
      "convertOpportunities",
    ]);

    for (const key of FREE_UNTRAINED_LOCKED_NAV_KEYS) {
      const item = itemByKey(items, key);
      assert.equal(item.disabled, true);
      assert.equal(item.href, undefined);
      assert.equal(item.subtitle, LOCKED_SUBTITLE);
      assert.equal(item.lockedHeading, LOCKED_SUBTITLE);
      assert.equal(item.lockedExplanation, LOCKED_EXPLANATIONS[key]);
      assert.equal(item.lockedActionLabel, en.nav.teachAthenaAction);
      assert.equal(item.lockedActionHref, FREE_UNTRAINED_TEACH_HREF);
      assert.equal(item.lockedActionHref, IDENTITY_TEACH_ATHENA_HREF);
      assert.equal(item.lockedActionHref, `/identity#${IDENTITY_FIELD_ANCHORS.teach}`);
      assert.ok(item.stageNumber);
    }

    const desktop = renderSidebar("free", "needs_setup");
    const mobile = renderMobileNav("free", "needs_setup");
    for (const html of [desktop, mobile]) {
      assert.match(html, /Home/);
      assert.match(html, /Define Your Business/);
      assert.match(html, /Build Visibility/);
      assert.match(html, /Generate Traction/);
      assert.match(html, /Convert Opportunities/);
      assert.match(html, /Teach Athena first/);
      assert.equal(hrefsIn(html).includes("/seo"), false);
      assert.equal(hrefsIn(html).includes("/personas"), false);
      assert.equal(hrefsIn(html).includes("/prospects"), false);
      assert.equal(hrefsIn(html).includes("/"), true);
      assert.equal(hrefsIn(html).includes("/identity"), true);
      assert.doesNotMatch(html, /upgrade|premium|subscribe|paywall|unlock/i);
      assert.doesNotMatch(html, /padlock|Full only/i);
    }

    assert.equal(hrefsIn(desktop).includes("/getting-started"), true);
  });

  it("explains each disabled desktop step and points the action to Identity", () => {
    const desktop = renderSidebar("free", "needs_setup");

    assert.match(desktop, /id="locked-growth-buildVisibility"/);
    assert.match(desktop, /id="locked-growth-generateTraction"/);
    assert.match(desktop, /id="locked-growth-convertOpportunities"/);
    assert.match(
      desktop,
      /Athena needs to understand your business before analyzing your visibility\./,
    );
    assert.match(
      desktop,
      /Athena needs to understand your business before creating audiences and content\./,
    );
    assert.match(
      desktop,
      /Athena needs to understand your business before helping you find and pursue opportunities\./,
    );
    assert.match(desktop, /Teach Athena →/);
    assert.match(desktop, /aria-describedby="locked-growth-buildVisibility"/);
    assert.match(desktop, /tabindex="0"/);
    assert.match(desktop, /group-focus-within:visible/);
    assert.match(desktop, /group-hover:visible/);
    assert.ok(desktop.includes(lockedGrowthNavGuidanceClassName.group));
    assert.ok(desktop.includes(lockedGrowthNavGuidanceClassName.panel));
    assert.ok(desktop.includes(tenantSidebarFrameClassName));
    assert.match(desktop, /overflow-y-auto/);
    assert.match(desktop, /h-dvh/);
    assert.match(desktop, /z-20/);
    assert.match(desktop, /pt-1/);
    assert.doesNotMatch(desktop, /mt-1 opacity-0/);
    assert.equal(hrefsIn(desktop).includes("/identity"), true);
    assert.equal(hrefsIn(desktop).includes(IDENTITY_TEACH_ATHENA_HREF), true);
    assert.equal(hrefsIn(desktop).includes("/seo"), false);
    assert.equal(hrefsIn(desktop).includes("/personas"), false);
    assert.equal(hrefsIn(desktop).includes("/prospects"), false);

    const identityHrefs = hrefsIn(desktop).filter((href) => href === "/identity");
    const teachHrefs = hrefsIn(desktop).filter(
      (href) => href === IDENTITY_TEACH_ATHENA_HREF,
    );
    assert.equal(identityHrefs.length, 1);
    assert.equal(teachHrefs.length, 3);
    assert.doesNotMatch(desktop, /availableAfterAthenaLearns|After Athena learns your business/);
    assert.match(
      read("components/dashboard/TenantSidebar.tsx"),
      /IdentityTeachAthenaLink/,
    );
    assert.equal(
      (
        read("components/dashboard/TenantSidebar.tsx").match(
          /<IdentityTeachAthenaLink/g,
        ) ?? []
      ).length,
      1,
    );
  });

  it("keeps the mobile prerequisite readable without hover or blocked hrefs", () => {
    const mobile = renderMobileNav("free", "needs_setup");
    const source = read("components/dashboard/TenantMobileNav.tsx");

    assert.match(mobile, /Teach Athena first/);
    assert.doesNotMatch(mobile, /locked-growth-/);
    assert.doesNotMatch(mobile, /group-focus-within/);
    assert.doesNotMatch(mobile, /Teach Athena →/);
    assert.doesNotMatch(
      mobile,
      /before analyzing your visibility|before creating audiences|before helping you find/,
    );
    assert.equal(hrefsIn(mobile).includes("/seo"), false);
    assert.equal(hrefsIn(mobile).includes("/personas"), false);
    assert.equal(hrefsIn(mobile).includes("/prospects"), false);
    assert.equal(hrefsIn(mobile).includes("/identity"), true);
    assert.doesNotMatch(source, /showLockedGuidance/);
  });

  it("restores normal navigation for trained Free and Full + needs_setup", () => {
    for (const [plan, kind] of [
      ["free", "ready"],
      ["free", "in_progress"],
      ["free", "unknown"],
      ["full", "needs_setup"],
      ["full", "ready"],
    ] as const) {
      const items = presentNav(plan, kind);
      for (const key of FREE_UNTRAINED_LOCKED_NAV_KEYS) {
        const item = itemByKey(items, key);
        assert.notEqual(item.disabled, true, `${plan} + ${kind} ${key}`);
        assert.equal(item.lockedExplanation, undefined, `${plan} + ${kind} ${key}`);
        assert.equal(item.lockedActionHref, undefined, `${plan} + ${kind} ${key}`);
      }
      assert.equal(itemByKey(items, "buildVisibility").href, "/seo");
      assert.equal(itemByKey(items, "generateTraction").href, "/personas");
      assert.equal(itemByKey(items, "convertOpportunities").href, "/prospects");

      const desktop = renderSidebar(plan, kind);
      assert.equal(hrefsIn(desktop).includes("/seo"), true, `${plan} ${kind}`);
      assert.equal(hrefsIn(desktop).includes("/personas"), true);
      assert.equal(hrefsIn(desktop).includes("/prospects"), true);
      assert.doesNotMatch(desktop, /Teach Athena first/);
      assert.doesNotMatch(desktop, /Teach Athena →/);
      assert.doesNotMatch(desktop, /locked-growth-/);
      assert.doesNotMatch(desktop, /After Athena learns your business/);
    }
  });

  it("uses the same overlay for mobile items and does not mutate canonical nav defs", () => {
    const mobile = read("components/dashboard/TenantMobileNav.tsx");
    const shell = read("components/dashboard/TenantAppShell.tsx");
    const sidebar = read("components/dashboard/TenantSidebar.tsx");
    const navigation = read("components/dashboard/tenantNavigation.ts");

    assert.match(shell, /applyFreeUntrainedNavPresentation/);
    assert.match(shell, /items=\{items\}/);
    assert.match(sidebar, /applyFreeUntrainedNavPresentation/);
    assert.match(mobile, /items: LocalizedTenantNavItem\[\]/);
    assert.doesNotMatch(navigation, /athenaPlan|isFreeUntrained|needs_setup|FREE/);
    assert.equal(
      tenantNavDefs.some((item) => item.disabled && item.key !== "settings"),
      false,
    );

    const omitted = presentNav();
    assert.equal(
      omitted.some(
        (item) => item.disabled && item.key !== "settings",
      ),
      false,
    );
  });

  it("keeps the FREE badge and does not add paid-lock chrome", () => {
    const free = renderShell("free", "needs_setup");
    const full = renderShell("full", "needs_setup");

    assert.match(free, />FREE</);
    assert.doesNotMatch(free, />FULL</);
    assert.doesNotMatch(full, />FREE</);
    assert.doesNotMatch(free, /upgrade|premium|subscribe|paywall|quota/i);
    assert.doesNotMatch(
      read("components/dashboard/TenantAppShell.tsx"),
      /requireTenantContext|requireCurrentOrganizationContext/,
    );
    assert.doesNotMatch(
      read("components/dashboard/TenantSidebar.tsx"),
      /requireTenantContext|requireCurrentOrganizationContext/,
    );
  });
});

describe("FREE-4 direct growth-route protection", () => {
  it("protects the SEO, Ads, Personas, and Prospects families through one server guard", () => {
    const guard = read("services/organization/freeProgressionState.ts");
    const redirectFn = guard.slice(
      guard.indexOf("export async function redirectIfFreeUntrainedGrowthRoute"),
    );
    assert.match(guard, /export async function redirectIfFreeUntrainedGrowthRoute/);
    assert.match(redirectFn, /isFreeUntrained\(state\)/);
    assert.match(redirectFn, /redirect\("\/identity"\)/);
    assert.match(guard, /resolveAthenaPlan\(organizationId\)/);
    assert.match(guard, /loadHomeDefineResult\(organizationId, userId\)/);
    assert.match(guard, /deriveDefineState\(defineResult\)\.kind/);
    assert.doesNotMatch(redirectFn, /cookies\(|document\.cookie/);
    assert.doesNotMatch(redirectFn, /entitlement|quota|upgrade|featureFlag/i);

    for (const file of [
      "app/seo/layout.tsx",
      "app/ads/layout.tsx",
      "app/personas/layout.tsx",
      "app/prospects/layout.tsx",
    ]) {
      const source = read(file);
      assert.match(source, /redirectIfFreeUntrainedGrowthRoute/);
      assert.doesNotMatch(source, /middleware/);
    }
  });

  it("does not add FREE-4 blocks on Identity, Help, Home, or middleware", () => {
    assert.doesNotMatch(
      read("app/identity/page.tsx"),
      /redirectIfFreeUntrainedGrowthRoute/,
    );
    assert.doesNotMatch(
      read("app/getting-started/page.tsx"),
      /redirectIfFreeUntrainedGrowthRoute/,
    );
    assert.doesNotMatch(read("app/page.tsx"), /redirectIfFreeUntrainedGrowthRoute/);
    assert.doesNotMatch(
      read("middleware.ts"),
      /isFreeUntrained|redirectIfFreeUntrainedGrowthRoute|athena_plan/,
    );
    assert.doesNotMatch(
      read("lib/supabase/middleware.ts"),
      /isFreeUntrained|redirectIfFreeUntrainedGrowthRoute|athena_plan/,
    );
    assert.doesNotMatch(
      read("services/tenantContext.ts"),
      /isFreeUntrained|redirectIfFreeUntrainedGrowthRoute/,
    );
    assert.doesNotMatch(
      read("services/licensee/licenseeSubAccounts.ts"),
      /isFreeUntrained|redirectIfFreeUntrainedGrowthRoute/,
    );
  });

  it("does not invent a second untrained definition or a generic entitlement engine", () => {
    const helper = read("lib/organization/freeUntrained.ts");
    const sharedFn = helper.slice(helper.indexOf("export function isFreeUntrained"));
    const sharedFnEnd = sharedFn.indexOf("export function applyFreeUntrainedNavPresentation");
    const isFreeUntrainedFn = sharedFn.slice(0, sharedFnEnd);
    assert.match(isFreeUntrainedFn, /athenaPlan === "free"/);
    assert.match(isFreeUntrainedFn, /defineKind === "needs_setup"/);
    assert.doesNotMatch(
      isFreeUntrainedFn,
      /visibility|traction|convert|capacity|pipeline/,
    );
    assert.doesNotMatch(isFreeUntrainedFn, /entitlement|quota|featureFlag|upgrade/i);

    const homeHelper = read("lib/home/freeFirstSessionHome.ts");
    assert.match(homeHelper, /isFreeUntrained\(input\)/);
  });
});

describe("FREE-4 Home / Identity / Help sidebar consistency", () => {
  const TENANT_PAGES = [
    { path: "/", file: "app/page.tsx" },
    { path: "/identity", file: "app/identity/page.tsx" },
    { path: "/getting-started", file: "app/getting-started/page.tsx" },
  ] as const;

  function lockedGuidance(html: string) {
    return {
      buildVisibility: html.includes(LOCKED_EXPLANATIONS.buildVisibility),
      generateTraction: html.includes(LOCKED_EXPLANATIONS.generateTraction),
      convertOpportunities: html.includes(
        LOCKED_EXPLANATIONS.convertOpportunities,
      ),
      teachFirst: html.includes(LOCKED_SUBTITLE),
      teachAction: html.includes(en.nav.teachAthenaAction),
      teachHrefs: hrefsIn(html).filter(
        (href) => href === IDENTITY_TEACH_ATHENA_HREF,
      ).length,
      blockedSeo: hrefsIn(html).includes("/seo"),
      blockedPersonas: hrefsIn(html).includes("/personas"),
      blockedProspects: hrefsIn(html).includes("/prospects"),
      hover: html.includes(lockedGrowthNavGuidanceClassName.group),
      focus: html.includes("group-focus-within:visible"),
      frame: html.includes(tenantSidebarFrameClassName),
    };
  }

  it("renders the same Free-untrained guidance on Home, Identity, and Help", () => {
    const expected = lockedGuidance(renderSidebar("free", "needs_setup", "/"));

    assert.equal(expected.buildVisibility, true);
    assert.equal(expected.generateTraction, true);
    assert.equal(expected.convertOpportunities, true);
    assert.equal(expected.teachFirst, true);
    assert.equal(expected.teachAction, true);
    assert.equal(expected.teachHrefs, 3);
    assert.equal(expected.blockedSeo, false);
    assert.equal(expected.blockedPersonas, false);
    assert.equal(expected.blockedProspects, false);
    assert.equal(expected.hover, true);
    assert.equal(expected.focus, true);
    assert.equal(expected.frame, true);

    for (const { path } of TENANT_PAGES) {
      const desktop = lockedGuidance(
        renderSidebar("free", "needs_setup", path),
      );
      const shell = lockedGuidance(renderShell("free", "needs_setup", path));
      assert.deepEqual(desktop, expected, `sidebar ${path}`);
      assert.deepEqual(shell, expected, `shell ${path}`);
    }
  });

  it("does not suppress explanations when Identity is the current route", () => {
    const identity = renderSidebar("free", "needs_setup", "/identity");
    assert.match(identity, /aria-current="page"/);
    assert.match(identity, /id="locked-growth-buildVisibility"/);
    assert.match(identity, /id="locked-growth-generateTraction"/);
    assert.match(identity, /id="locked-growth-convertOpportunities"/);
    assert.match(identity, /Teach Athena →/);
    assert.equal(hrefsIn(identity).includes(IDENTITY_TEACH_ATHENA_HREF), true);

    const sidebar = read("components/dashboard/TenantSidebar.tsx");
    const itemFn = sidebar.slice(sidebar.indexOf("function TenantNavItem"));
    const guidanceFirst = itemFn.indexOf(
      "showLockedGuidance && item.lockedExplanation",
    );
    const currentPathActive = itemFn.indexOf("isTenantNavActive(currentPath");
    assert.ok(guidanceFirst >= 0);
    assert.ok(currentPathActive >= 0);
    assert.ok(
      itemFn.indexOf("LockedGrowthNavItem") <
        itemFn.indexOf("return (\n    <Link"),
    );
  });

  it("uses one shared overlay and hover contract rather than page-specific sidebars", () => {
    const navigation = read("components/dashboard/tenantNavigation.ts");
    const helper = read("lib/organization/freeUntrained.ts");
    const sidebar = read("components/dashboard/TenantSidebar.tsx");
    const shell = read("components/dashboard/TenantAppShell.tsx");

    assert.match(navigation, /export const lockedGrowthNavGuidanceClassName/);
    assert.match(navigation, /export const tenantSidebarFrameClassName/);
    assert.match(sidebar, /lockedGrowthNavGuidanceClassName/);
    assert.match(sidebar, /tenantSidebarFrameClassName/);
    assert.match(sidebar, /applyFreeUntrainedNavPresentation/);
    assert.match(shell, /applyFreeUntrainedNavPresentation/);
    assert.match(helper, /href: undefined/);

    for (const { file } of TENANT_PAGES) {
      const source = read(file);
      assert.match(source, /TenantAppShell/);
      assert.doesNotMatch(source, /HomeFreeSidebar|IdentityFreeSidebar|HelpFreeSidebar/);
      assert.doesNotMatch(source, /LockedGrowthNavItem|lockedGrowthNavGuidanceClassName/);
      assert.doesNotMatch(source, /applyFreeUntrainedNavPresentation/);
    }

    assert.match(read("app/page.tsx"), /athenaPlan=\{athenaPlan\}/);
    assert.match(read("app/page.tsx"), /defineKind=\{define\.kind\}/);
    assert.match(read("app/identity/page.tsx"), /\{\.\.\.freeProgression\}/);
    assert.match(read("app/getting-started/page.tsx"), /\{\.\.\.freeProgression\}/);
    assert.match(read("app/seo/page.tsx"), /\{\.\.\.freeProgression\}/);
    assert.match(read("app/seo/new/page.tsx"), /\{\.\.\.freeProgression\}/);
    assert.match(read("app/seo/[id]/page.tsx"), /\{\.\.\.freeProgression\}/);
    assert.doesNotMatch(
      read("components/identity/identityTeachAthenaDeepLink.tsx"),
      /showLockedGuidance|LockedGrowthNavItem/,
    );
  });

  it("keeps the same mobile contract on Home, Identity, and Help", () => {
    const expected = renderMobileNav("free", "needs_setup");
    for (const { path } of TENANT_PAGES) {
      const items = presentNav("free", "needs_setup");
      const html = renderToStaticMarkup(
        createElement(TenantNavList, {
          currentPath: path,
          items,
          yourGrowthLabel: en.nav.yourGrowth,
          utilitiesLabel: en.nav.utilities,
          moreToolsLabel: en.nav.moreTools,
        }),
      );
      assert.match(html, /Teach Athena first/);
      assert.doesNotMatch(html, /locked-growth-/);
      assert.doesNotMatch(html, /group-hover:visible/);
      assert.doesNotMatch(html, /Teach Athena →/);
      assert.equal(hrefsIn(html).includes("/seo"), false);
      assert.equal(hrefsIn(html).includes("/personas"), false);
      assert.equal(hrefsIn(html).includes("/prospects"), false);
      assert.equal(hrefsIn(html).includes("/identity"), true);
      assert.equal(
        html.includes("Teach Athena first"),
        expected.includes("Teach Athena first"),
      );
    }
  });
});

describe("FREE-4 TenantMobileNav source contract", () => {
  it("receives already-presented items from the shell and does not query plan itself", () => {
    const mobile = read("components/dashboard/TenantMobileNav.tsx");
    assert.match(mobile, /items: LocalizedTenantNavItem\[\]/);
    assert.doesNotMatch(mobile, /applyFreeUntrainedNavPresentation|isFreeUntrained/);
    assert.doesNotMatch(mobile, /requireTenantContext|resolveAthenaPlan|needs_setup/);
    assert.match(read("components/dashboard/TenantAppShell.tsx"), /items=\{items\}/);
    assert.match(
      read("components/dashboard/TenantMobileNav.tsx"),
      /<TenantNavList/,
    );
  });
});

describe("FREE-4 guided disabled-step copy", () => {
  it("keeps six-language key parity for the Teach Athena nav contract", () => {
    const dictionaries = { en, fr, es, it: itMessages, de, pt } as const;
    const keys = [
      "teachAthenaFirst",
      "teachAthenaAction",
      "buildVisibilityTeachAthena",
      "generateTractionTeachAthena",
      "convertOpportunitiesTeachAthena",
    ] as const;

    for (const [language, messages] of Object.entries(dictionaries)) {
      for (const key of keys) {
        const value = messages.nav[key];
        assert.equal(typeof value, "string", `${language} ${key}`);
        assert.ok(value.trim().length > 0, `${language} ${key} empty`);
      }
      assert.equal(
        "availableAfterAthenaLearns" in messages.nav,
        false,
        `${language} kept dead availableAfterAthenaLearns`,
      );
    }

    assert.notEqual(fr.nav.teachAthenaFirst, en.nav.teachAthenaFirst);
    assert.notEqual(es.nav.teachAthenaAction, en.nav.teachAthenaAction);
    assert.notEqual(
      itMessages.nav.buildVisibilityTeachAthena,
      en.nav.buildVisibilityTeachAthena,
    );
    assert.notEqual(
      de.nav.generateTractionTeachAthena,
      en.nav.generateTractionTeachAthena,
    );
    assert.notEqual(
      pt.nav.convertOpportunitiesTeachAthena,
      en.nav.convertOpportunitiesTeachAthena,
    );
  });
});
