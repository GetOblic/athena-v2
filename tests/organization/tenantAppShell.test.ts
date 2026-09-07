import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  isTenantNavActive,
  localizeTenantNav,
  tenantNavDefs,
  tenantNavItems,
} from "../../components/dashboard/tenantNavigation";
import { ORGANIZATION_LANGUAGES } from "../../services/organizationLanguage";
import { getTenantMessages } from "../../lib/tenantI18n/getTenantMessages";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function listTsFiles(dir: string): string[] {
  const absolute = join(ROOT, dir);
  let entries;
  try {
    entries = readdirSync(absolute, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const relative = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTsFiles(relative));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(relative);
    }
  }
  return files;
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

const SHELLED_PAGES = [
  "app/page.tsx",
  "app/identity/page.tsx",
  "app/prospects/page.tsx",
  "app/prospects/import/page.tsx",
  "app/prospects/[id]/page.tsx",
  "app/seo/page.tsx",
  "app/seo/new/page.tsx",
  "app/seo/[id]/page.tsx",
  "app/personas/page.tsx",
  "app/personas/import/page.tsx",
  "app/personas/[id]/page.tsx",
  "app/ads/page.tsx",
  "app/ads/new/page.tsx",
  "app/ads/[id]/page.tsx",
  "app/social-planner/page.tsx",
  "app/social-planner/[id]/page.tsx",
] as const;

const V2_ENGLISH_LABELS = [
  "Home",
  "Define Your Business",
  "Build Visibility",
  "Generate Traction",
  "Convert Opportunities",
  "Athena Inbox",
  "Settings",
  "Getting Started",
  "Intelligence Domains",
  "Discussions",
  "Ads",
  "Social Planner",
  "Opportunities",
  "Briefings",
  "Need help?",
] as const;

const V2_LINK_HREFS = [
  "/",
  "/identity",
  "/seo",
  "/personas",
  "/prospects",
  "/inbox",
  "/getting-started",
  "/intelligence-domains",
  "/discussions",
  "/ads",
  "/social-planner",
  "/opportunities",
  "/briefings",
] as const;

const MORE_TOOLS_HREFS = [
  "/getting-started",
  "/intelligence-domains",
  "/discussions",
  "/ads",
  "/social-planner",
  "/opportunities",
  "/briefings",
] as const;

const FORBIDDEN_HREFS = [
  "/settings",
  "/quote",
  "/licensee",
  "/licensee/quote",
  "/licensee/estimate",
  "/super",
  "/estimate",
] as const;

const ACTIVE_STATE_CASES: Array<{
  path: string;
  expectedKey: string;
}> = [
  { path: "/", expectedKey: "home" },
  { path: "/identity", expectedKey: "defineYourBusiness" },
  { path: "/seo", expectedKey: "buildVisibility" },
  { path: "/seo/new", expectedKey: "buildVisibility" },
  { path: "/seo/abc", expectedKey: "buildVisibility" },
  { path: "/personas", expectedKey: "generateTraction" },
  { path: "/personas/import", expectedKey: "generateTraction" },
  { path: "/personas/abc", expectedKey: "generateTraction" },
  { path: "/prospects", expectedKey: "convertOpportunities" },
  { path: "/prospects/import", expectedKey: "convertOpportunities" },
  { path: "/prospects/abc", expectedKey: "convertOpportunities" },
  { path: "/inbox", expectedKey: "athenaInbox" },
  { path: "/ads", expectedKey: "generateTraction" },
  { path: "/ads/new", expectedKey: "generateTraction" },
  { path: "/ads/abc", expectedKey: "generateTraction" },
  { path: "/social-planner", expectedKey: "generateTraction" },
  { path: "/social-planner/abc", expectedKey: "generateTraction" },
  { path: "/intelligence-domains", expectedKey: "intelligenceDomains" },
  { path: "/communities", expectedKey: "intelligenceDomains" },
  { path: "/communities/abc", expectedKey: "intelligenceDomains" },
  { path: "/discussions", expectedKey: "discussions" },
  { path: "/discussions/abc", expectedKey: "discussions" },
  { path: "/opportunities", expectedKey: "opportunities" },
  { path: "/opportunities/abc", expectedKey: "opportunities" },
  { path: "/briefings", expectedKey: "briefings" },
  { path: "/briefings/abc", expectedKey: "briefings" },
  { path: "/getting-started", expectedKey: "gettingStarted" },
];

function firstActiveKey(currentPath: string): string | undefined {
  return localizeTenantNav(en).find((item) =>
    isTenantNavActive(currentPath, item),
  )?.key;
}

describe("V2-UI-1B tenant app shell — navigation contract", () => {
  it("keeps English V2 labels and stage subtitles", () => {
    const localized = localizeTenantNav(en);
    assert.deepEqual(
      localized.map((item) => item.label),
      [...V2_ENGLISH_LABELS],
    );
    assert.deepEqual(
      tenantNavItems.map((item) => item.label),
      [...V2_ENGLISH_LABELS],
    );
    assert.equal(en.nav.home, "Home");
    assert.equal(en.nav.yourGrowth, "Your Growth");
    assert.equal(en.nav.defineYourBusiness, "Define Your Business");
    assert.equal(en.nav.athenaBrain, "Athena Brain");
    assert.equal(en.nav.buildVisibility, "Build Visibility");
    assert.equal(en.nav.buildVisibilitySubtitle, "Be found on Google");
    assert.equal(en.nav.generateTraction, "Generate Traction");
    assert.equal(en.nav.generateTractionSubtitle, "Reach the right audience");
    assert.equal(en.nav.convertOpportunities, "Convert Opportunities");
    assert.equal(en.nav.convertOpportunitiesSubtitle, "Win more customers");
    assert.equal(en.nav.athenaInbox, "Athena Inbox");
    assert.equal(en.nav.settings, "Settings");
    assert.equal(en.nav.settingsHint, "Coming later");
    assert.equal(en.nav.moreTools, "More tools");
    assert.equal(en.nav.needHelp, "Need help?");
    assert.equal(en.nav.chatWithAthena, "Chat with Athena");
  });

  it("preserves V2 hrefs and order across all six languages", () => {
    const englishHrefs = localizeTenantNav(en)
      .map((item) => item.href)
      .filter((href): href is string => Boolean(href));
    assert.deepEqual(englishHrefs, [...V2_LINK_HREFS]);
    assert.deepEqual(
      tenantNavItems
        .map((item) => item.href)
        .filter((href): href is string => Boolean(href)),
      [...V2_LINK_HREFS],
    );
    assert.deepEqual(
      tenantNavDefs
        .map((item) => ("href" in item ? item.href : undefined))
        .filter((href): href is string => Boolean(href)),
      [...V2_LINK_HREFS],
    );
    for (const language of ORGANIZATION_LANGUAGES) {
      const localized = localizeTenantNav(getTenantMessages(language));
      assert.deepEqual(
        localized
          .map((item) => item.href)
          .filter((href): href is string => Boolean(href)),
        englishHrefs,
        `${language} hrefs drifted`,
      );
      assert.deepEqual(
        localized.map((item) => item.key),
        tenantNavDefs.map((item) => item.key),
        `${language} keys drifted`,
      );
    }
  });

  it("keeps More tools legacy destinations practically accessible", () => {
    const moreHrefs = localizeTenantNav(en)
      .filter((item) => item.section === "more")
      .map((item) => item.href);
    assert.deepEqual(moreHrefs, [...MORE_TOOLS_HREFS]);
  });

  it("matches nested and alias active states without Home stealing other routes", () => {
    for (const { path, expectedKey } of ACTIVE_STATE_CASES) {
      assert.equal(firstActiveKey(path), expectedKey, path);
    }
    assert.equal(firstActiveKey("/identity"), "defineYourBusiness");
    assert.notEqual(firstActiveKey("/identity"), "home");
    assert.equal(isTenantNavActive("/identity", { href: "/", exact: true }), false);
    assert.equal(isTenantNavActive("/", { href: "/", exact: true }), true);
    const traction = localizeTenantNav(en).find(
      (item) => item.key === "generateTraction",
    );
    const ads = localizeTenantNav(en).find((item) => item.key === "ads");
    const social = localizeTenantNav(en).find(
      (item) => item.key === "socialPlanner",
    );
    assert.ok(traction);
    assert.deepEqual(traction.alsoActiveFor, ["/ads", "/social-planner"]);
    assert.equal(isTenantNavActive("/ads", traction), true);
    assert.equal(isTenantNavActive("/ads/new", traction), true);
    assert.equal(isTenantNavActive("/social-planner", traction), true);
    assert.equal(isTenantNavActive("/ads", ads ?? {}), true);
    assert.equal(isTenantNavActive("/social-planner", social ?? {}), true);
    assert.equal(isTenantNavActive("/personas", ads ?? {}), false);
  });

  it("never matches Settings or Help", () => {
    const settings = localizeTenantNav(en).find((item) => item.key === "settings");
    const help = localizeTenantNav(en).find((item) => item.key === "needHelp");
    assert.ok(settings);
    assert.ok(help);
    assert.equal(settings.href, undefined);
    assert.equal(help.href, undefined);
    assert.equal(isTenantNavActive("/settings", settings), false);
    assert.equal(isTenantNavActive("/identity", settings), false);
    assert.equal(isTenantNavActive("/help", help), false);
    assert.equal(isTenantNavActive("/", help), false);
  });
});

describe("V2-UI-1B tenant app shell — isolation and leakage", () => {
  it("is imported only from the migrated tenant pages", () => {
    const hits: string[] = [];
    for (const dir of ["app", "components"]) {
      for (const file of listTsFiles(dir)) {
        if (
          file === "components/dashboard/TenantAppShell.tsx" ||
          file === "components/dashboard/TenantSidebar.tsx" ||
          file === "components/dashboard/TenantMobileNav.tsx" ||
          file === "components/dashboard/tenantNavigation.ts"
        ) {
          continue;
        }
        const source = read(file);
        if (
          /TenantAppShell|tenantNavigation|TenantSidebar|TenantMobileNav/.test(
            source,
          )
        ) {
          hits.push(file);
        }
      }
    }
    assert.deepEqual(hits.sort(), [...SHELLED_PAGES].sort());
  });

  it("does not appear on Licensee, Super, login, Quote, or Estimate surfaces", () => {
    const surfaces = [
      "app/licensee",
      "app/super",
      "app/login",
      "app/quote",
      "components/licensee",
      "components/superAdmin",
    ];
    for (const dir of surfaces) {
      for (const file of listTsFiles(dir)) {
        const source = read(file);
        assert.doesNotMatch(source, /TenantAppShell|tenantNavigation/);
        assert.doesNotMatch(source, /tenantI18n|getTenantLocalization/);
      }
    }
  });

  it("does not leak Quote, Estimate, Super, or Settings routes into V2 hrefs", () => {
    const hrefs = localizeTenantNav(en)
      .map((item) => item.href)
      .filter((href): href is string => Boolean(href));
    for (const forbidden of FORBIDDEN_HREFS) {
      assert.equal(hrefs.includes(forbidden), false, forbidden);
    }
    const navigation = read("components/dashboard/tenantNavigation.ts");
    assert.doesNotMatch(navigation, /href: "\/settings"/);
    assert.doesNotMatch(navigation, /href: "\/quote"/);
    assert.doesNotMatch(navigation, /href: "\/super"/);
    assert.doesNotMatch(navigation, /href: "\/licensee/);
    const sidebar = read("components/dashboard/TenantSidebar.tsx");
    const mobile = read("components/dashboard/TenantMobileNav.tsx");
    const shell = read("components/dashboard/TenantAppShell.tsx");
    for (const source of [sidebar, mobile, shell, navigation]) {
      assert.doesNotMatch(source, /<Link href="\/settings"/);
      assert.doesNotMatch(source, /href: "\/settings"/);
    }
  });

  it("preserves AthenaHeaderActions handoff and keeps Back to Master out of dictionaries", () => {
    const shell = read("components/dashboard/TenantAppShell.tsx");
    const actions = read("components/auth/AthenaHeaderActions.tsx");
    const sidebar = read("components/dashboard/TenantSidebar.tsx");
    const mobile = read("components/dashboard/TenantMobileNav.tsx");
    assert.match(shell, /AthenaHeaderActions/);
    assert.match(shell, /logoutLabel=\{messages\.chrome\.logOut\}/);
    assert.match(shell, /sessionActionsLabel=\{messages\.chrome\.sessionActions\}/);
    assert.match(actions, /BackToMasterCta/);
    assert.doesNotMatch(sidebar, /LogoutCta|BackToMasterCta|AthenaBrandLink/);
    assert.doesNotMatch(mobile, /LogoutCta|BackToMasterCta|AthenaBrandLink/);
    for (const language of ORGANIZATION_LANGUAGES) {
      const paths = collectKeyPaths(DICTIONARIES[language]);
      assert.equal(
        paths.some((path) => /backToMaster|returnToMaster/i.test(path)),
        false,
      );
    }
  });
});

describe("V2-UI-1B tenant app shell — localization and page integration", () => {
  it("adds required shell keys to all six dictionaries", () => {
    const required = [
      "nav.home",
      "nav.yourGrowth",
      "nav.defineYourBusiness",
      "nav.buildVisibility",
      "nav.buildVisibilitySubtitle",
      "nav.generateTraction",
      "nav.generateTractionSubtitle",
      "nav.convertOpportunities",
      "nav.convertOpportunitiesSubtitle",
      "nav.utilities",
      "nav.athenaInbox",
      "nav.settings",
      "nav.settingsHint",
      "nav.moreTools",
      "nav.needHelp",
      "nav.chatWithAthena",
      "chrome.openMenu",
      "chrome.closeMenu",
      "chrome.mainNavigation",
    ];
    const canonical = collectKeyPaths(en);
    for (const path of required) {
      assert.ok(canonical.includes(path), path);
    }
    for (const language of ORGANIZATION_LANGUAGES) {
      const paths = collectKeyPaths(DICTIONARIES[language]);
      assert.deepEqual(
        required.filter((path) => !paths.includes(path)),
        [],
        `${language} missing shell keys`,
      );
    }
    assert.notEqual(fr.nav.home, en.nav.home);
    assert.notEqual(es.nav.defineYourBusiness, en.nav.defineYourBusiness);
    assert.notEqual(itMessages.nav.buildVisibility, en.nav.buildVisibility);
    assert.notEqual(de.nav.generateTraction, en.nav.generateTraction);
    assert.notEqual(pt.nav.convertOpportunities, en.nav.convertOpportunities);
    assert.equal(fr.nav.athenaBrain, "Athena Brain");
    assert.equal(de.nav.athenaInbox, "Athena Inbox");
  });

  it("wraps Home, Identity, Prospects, and Build Visibility pages and removes old chrome", () => {
    const home = read("app/page.tsx");
    const identity = read("app/identity/page.tsx");
    const prospects = read("app/prospects/page.tsx");
    const seo = read("app/seo/page.tsx");
    const seoNew = read("app/seo/new/page.tsx");
    const seoDetail = read("app/seo/[id]/page.tsx");
    assert.match(home, /<TenantAppShell currentPath="\/" messages=\{messages\}>/);
    assert.match(
      identity,
      /<TenantAppShell currentPath="\/identity" messages=\{messages\}>/,
    );
    assert.match(
      prospects,
      /<TenantAppShell currentPath="\/prospects" messages=\{messages\}>/,
    );
    const prospectImport = read("app/prospects/import/page.tsx");
    const prospectDetail = read("app/prospects/[id]/page.tsx");
    assert.match(
      prospectImport,
      /<TenantAppShell currentPath="\/prospects\/import" messages=\{messages\}>/,
    );
    assert.match(
      prospectDetail,
      /<TenantAppShell currentPath=\{`\/prospects\/\$\{id\}`\} messages=\{messages\}>/,
    );
    assert.match(seo, /<TenantAppShell currentPath="\/seo" messages=\{messages\}>/);
    assert.match(
      seoNew,
      /<TenantAppShell currentPath="\/seo\/new" messages=\{messages\}>/,
    );
    assert.match(
      seoDetail,
      /<TenantAppShell currentPath=\{`\/seo\/\$\{id\}`\} messages=\{messages\}>/,
    );
    for (const source of [
      home,
      identity,
      prospects,
      prospectImport,
      prospectDetail,
      seo,
      seoNew,
      seoDetail,
    ]) {
      assert.doesNotMatch(source, /AthenaBrandLink/);
      assert.doesNotMatch(source, /DashboardSidebar/);
    }
    assert.doesNotMatch(identity, /TenantBackLink/);
    assert.doesNotMatch(prospects, /TenantBackLink/);
    assert.doesNotMatch(prospectImport, /TenantBackLink/);
    assert.doesNotMatch(prospectDetail, /TenantBackLink/);
    assert.doesNotMatch(seo, /TenantBackLink/);
    assert.doesNotMatch(seoNew, /TenantBackLink/);
    assert.doesNotMatch(seoDetail, /TenantBackLink/);
    assert.match(home, /HomeDomainCard/);
    assert.match(home, /HomeAttentionList/);
    assert.doesNotMatch(home, /TodaysIntelligence/);
    assert.match(identity, /IdentityConversationPanel/);
    assert.match(prospects, /ProspectsLibraryClient/);
  });
});

describe("V2-UI-1B tenant app shell — mobile source contract", () => {
  it("keeps TenantMobileNav as the only new client island and does not resolve language", () => {
    const mobile = read("components/dashboard/TenantMobileNav.tsx");
    const shell = read("components/dashboard/TenantAppShell.tsx");
    const sidebar = read("components/dashboard/TenantSidebar.tsx");
    const navigation = read("components/dashboard/tenantNavigation.ts");
    assert.match(mobile, /"use client"/);
    assert.doesNotMatch(shell, /"use client"/);
    assert.doesNotMatch(sidebar, /"use client"/);
    assert.doesNotMatch(navigation, /"use client"/);
    assert.match(mobile, /role="dialog"/);
    assert.match(mobile, /aria-modal="true"/);
    assert.match(mobile, /aria-expanded/);
    assert.match(mobile, /aria-controls="tenant-mobile-nav"/);
    assert.match(mobile, /id="tenant-mobile-nav"/);
    assert.doesNotMatch(mobile, /tenantI18n/);
    assert.doesNotMatch(mobile, /getTenantLocalization|getTenantMessages/);
    assert.doesNotMatch(mobile, /resolveOrganizationLanguage/);
    assert.doesNotMatch(mobile, /navigator\.language/);
    assert.match(mobile, /items: LocalizedTenantNavItem\[\]/);
    assert.match(mobile, /openMenuLabel/);
    assert.match(mobile, /closeMenuLabel/);
    assert.match(shell, /items=\{items\}/);
    assert.match(shell, /openMenuLabel=\{messages\.chrome\.openMenu\}/);
  });
});
