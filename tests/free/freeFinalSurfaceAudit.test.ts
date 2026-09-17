/**
 * FREE-15G — final Athena Free surface audit.
 * Integration-level invariants only. Does not duplicate product-slice suites.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { shouldShowAdsCreate } from "../../lib/ads/freeTractionPresentation";
import { shouldShowFreeFirstSessionHome } from "../../lib/home/freeFirstSessionHome";
import { shouldShowFreeTrainedHomeContinuation } from "../../lib/home/freeTrainedHome";
import { isFreeHelpAskComposerOpen } from "../../lib/organization/freeHelpAsk";
import { isFreeIdentityAskComposerOpen } from "../../lib/organization/freeIdentityAsk";
import { isFreePersonaAskComposerOpen } from "../../lib/organization/freePersonaAsk";
import { resolveConsumedFreeSocialCreateRedirect } from "../../lib/organization/freeStarter";
import { isFreeUntrained } from "../../lib/organization/freeUntrained";
import { shouldShowPersonaCreate } from "../../lib/personas/freeAudiencePresentation";
import { shouldShowProspectCreate } from "../../lib/prospects/freeConvertPresentation";
import { shouldShowSeoNewAnalysis } from "../../lib/seo/freeVisibilityPresentation";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import {
  resolveUpgradeCtaAction,
  isUpgradeCtaActionInteractive,
} from "../../lib/upgrade/upgradePresentation";
import { shouldShowGlobalFullAthenaInvite } from "../../lib/upgrade/upgradeChromePresentation";
import { ORGANIZATION_LANGUAGES } from "../../services/organizationLanguage";

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

const FREE_SHELL_PAGES = [
  "app/page.tsx",
  "app/identity/page.tsx",
  "app/getting-started/page.tsx",
  "app/seo/page.tsx",
  "app/seo/new/page.tsx",
  "app/seo/[id]/page.tsx",
  "app/ads/page.tsx",
  "app/ads/new/page.tsx",
  "app/ads/[id]/page.tsx",
  "app/personas/page.tsx",
  "app/personas/import/page.tsx",
  "app/personas/[id]/page.tsx",
  "app/prospects/page.tsx",
  "app/prospects/find/page.tsx",
  "app/prospects/import/page.tsx",
  "app/prospects/[id]/page.tsx",
  "app/social-planner/page.tsx",
  "app/social-planner/[id]/page.tsx",
  "components/socialPlanner/SocialPlannerHistoryRoutePage.tsx",
] as const;

const CONSUMED_CREATE_PAGES = [
  "app/seo/new/page.tsx",
  "app/ads/new/page.tsx",
  "app/prospects/import/page.tsx",
  "app/social-planner/page.tsx",
] as const;

const ASK_PROVIDER_ROUTES = [
  "app/api/identity/deep-scrape/route.ts",
  "services/identityConversation/identityConversationService.ts",
  "services/gettingStartedConversation/gettingStartedConversationService.ts",
  "services/personaConversation/personaConversationService.ts",
] as const;

const LOCKED_WORKFLOW_FILES = [
  "components/seo/SeoReportGenerateForm.tsx",
  "components/personas/PersonaCsvImport.tsx",
  "components/prospects/ProspectImportForms.tsx",
  "components/prospects/OpportunityDiscoveryMethods.tsx",
] as const;

const UPGRADE_COMPONENT_FILES = [
  "components/upgrade/UpgradeSurface.tsx",
  "components/upgrade/UpgradeHint.tsx",
  "components/upgrade/UpgradeCompletionCard.tsx",
  "components/upgrade/UpgradeExhaustedNotice.tsx",
  "components/upgrade/UpgradeUnavailableCard.tsx",
  "components/upgrade/UpgradeSidebarInvite.tsx",
  "components/upgrade/UpgradeInlineCTA.tsx",
  "lib/upgrade/upgradePresentation.ts",
  "lib/upgrade/upgradeChromePresentation.ts",
  "lib/upgrade/freeAskUpgradePresentation.ts",
  "lib/upgrade/freeFeatureUpgradePresentation.ts",
  "lib/upgrade/freeSecondaryUpgradePresentation.ts",
] as const;

const GENERATION_GUARD_ROUTES = [
  "app/api/seo/route.ts",
  "app/api/ads/route.ts",
  "app/api/personas/route.ts",
  "app/api/personas/generate/route.ts",
  "app/api/prospects/route.ts",
  "app/api/prospects/from-google-business/route.ts",
  "app/api/social-planner/route.ts",
  "app/api/social-planner/evergreen/route.ts",
] as const;

const REJECTED_UX =
  /Keep going|Upgrade now|Unlock everything|all features|unlimited|limited time|credits remaining|quota exhausted/i;

const PRICING_UX = /trial|subscribe|discount|checkout|billing/i;

describe("FREE-15G untrained Free has no premature upgrade pressure", () => {
  it("hides global continuation and first-session Home upgrade family", () => {
    assert.equal(
      shouldShowGlobalFullAthenaInvite({
        athenaPlan: "free",
        defineKind: "needs_setup",
      }),
      false,
    );
    assert.equal(
      shouldShowFreeFirstSessionHome({
        athenaPlan: "free",
        defineKind: "needs_setup",
      }),
      true,
    );
    assert.equal(
      shouldShowFreeTrainedHomeContinuation({
        athenaPlan: "free",
        defineKind: "needs_setup",
      }),
      false,
    );

    const firstSession = read("components/home/FreeFirstSessionHome.tsx");
    const page = read("app/page.tsx");
    const firstSessionBlock = page.slice(
      page.indexOf("shouldShowFreeFirstSessionHome({"),
      page.indexOf("shouldShowFreeStarterExperience({"),
    );
    assert.match(firstSessionBlock, /<FreeFirstSessionHome/);
    assert.doesNotMatch(firstSessionBlock, /FreeTrainedHome|UpgradeCompletionCard/);
    assert.doesNotMatch(firstSession, /UpgradeCompletionCard|UpgradeSidebarInvite/);
    assert.doesNotMatch(firstSession, /upgrade|paywall|quota|pricing/i);
  });
});

describe("FREE-15G trained Free has global continuation", () => {
  it("shows chrome invite once trained and wires Free surfaces to shell plan", () => {
    assert.equal(
      shouldShowGlobalFullAthenaInvite({
        athenaPlan: "free",
        defineKind: "ready",
      }),
      true,
    );
    assert.equal(
      shouldShowGlobalFullAthenaInvite({
        athenaPlan: "free",
        defineKind: "in_progress",
      }),
      true,
    );

    for (const file of FREE_SHELL_PAGES) {
      const source = read(file);
      assert.match(source, /<(TenantAppShell)/, file);
      assert.match(
        source,
        /\{\.\.\.freeProgression\}|athenaPlan=\{|defineKind=\{/,
        file,
      );
    }

    const socialCreate = read("app/social-planner/page.tsx");
    const socialDetail = read("app/social-planner/[id]/page.tsx");
    const socialHistory = read(
      "components/socialPlanner/SocialPlannerHistoryRoutePage.tsx",
    );
    assert.match(socialCreate, /\{\.\.\.freeProgression\}/);
    assert.match(socialDetail, /defineKind=\{freeProgression\.defineKind\}/);
    assert.match(socialHistory, /\{\.\.\.freeProgression\}/);
  });
});

describe("FREE-15G remaining Free value stays primary", () => {
  it("keeps create/open actions available until the slot is used", () => {
    assert.equal(shouldShowSeoNewAnalysis("available"), true);
    assert.equal(shouldShowPersonaCreate("available"), true);
    assert.equal(shouldShowAdsCreate("available"), true);
    assert.equal(shouldShowProspectCreate("available"), true);
    assert.equal(
      resolveConsumedFreeSocialCreateRedirect({
        athenaPlan: "free",
        starterStatus: "available",
        starterCalendarId: null,
      }),
      null,
    );
  });
});

describe("FREE-15G consumed artifacts remain reachable and create routes stay contained", () => {
  it("keeps consumed create closed while artifacts stay open", () => {
    assert.equal(shouldShowSeoNewAnalysis("consumed"), false);
    assert.equal(shouldShowPersonaCreate("consumed"), false);
    assert.equal(shouldShowAdsCreate("consumed"), false);
    assert.equal(shouldShowProspectCreate("consumed"), false);
    assert.equal(
      resolveConsumedFreeSocialCreateRedirect({
        athenaPlan: "free",
        starterStatus: "consumed",
        starterCalendarId: "da8d96a2-5ea3-4225-bd90-1f18dc3ab7f2",
      }),
      "/social-planner/da8d96a2-5ea3-4225-bd90-1f18dc3ab7f2",
    );

    for (const file of CONSUMED_CREATE_PAGES) {
      const source = read(file);
      assert.match(
        source,
        /redirect\(|presentation === "consumed"|resolveConsumedFreeSocialCreateRedirect/,
        file,
      );
    }

    const personasImport = read("app/personas/import/page.tsx");
    assert.match(personasImport, /presentation === "consumed"/);
    assert.match(personasImport, /PersonaImportForms/);
    assert.equal(
      (personasImport.match(/copy\.free\.reservedNote/g) ?? []).length,
      1,
    );
    const findPage = read("app/prospects/find/page.tsx");
    assert.match(findPage, /canAddProspect/);
    assert.match(findPage, /shouldOfferGoogleDiscovery/);
  });
});

describe("FREE-15G Ask surfaces stop after consumption", () => {
  it("closes composers when exhausted and keeps Full open", () => {
    assert.equal(isFreeIdentityAskComposerOpen("exhausted"), false);
    assert.equal(isFreeHelpAskComposerOpen("exhausted"), false);
    assert.equal(isFreePersonaAskComposerOpen("exhausted"), false);
    assert.equal(isFreeIdentityAskComposerOpen("full"), true);
    assert.equal(isFreeHelpAskComposerOpen("full"), true);
    assert.equal(isFreePersonaAskComposerOpen("full"), true);

    for (const file of [
      "components/identity/IdentityConversationPanel.tsx",
      "components/getting-started/GettingStartedConversationPanel.tsx",
      "components/personas/PersonaConversationPanel.tsx",
    ]) {
      const source = read(file);
      assert.match(source, /action=\{\{\s*kind:\s*"none"\s*\}\}/, file);
    }
  });
});

describe("FREE-15G secondary locked methods never mount denied workflows", () => {
  it("keeps Technical SEO, CSV, and GetOblic Directory behind locked presentation", () => {
    const seoForm = read("components/seo/SeoReportGenerateForm.tsx");
    assert.match(seoForm, /allowTechnical/);
    assert.match(seoForm, /UpgradeHint/);
    assert.match(seoForm, /technicalSeoUpgradeContent/);

    const personaCsv = read("components/personas/PersonaCsvImport.tsx");
    assert.match(personaCsv, /!available \? \([\s\S]*UpgradeHint/);
    assert.match(personaCsv, /personaCsvUpgradeContent/);

    const prospectForms = read("components/prospects/ProspectImportForms.tsx");
    assert.match(prospectForms, /showCsvLocked/);
    assert.match(prospectForms, /prospectCsvUpgradeContent/);

    const discovery = read(
      "components/prospects/OpportunityDiscoveryMethods.tsx",
    );
    const findPage = read("app/prospects/find/page.tsx");
    assert.match(findPage, /shouldOfferGetOblicDiscovery/);
    assert.match(discovery, /directoryAvailable/);
    assert.match(discovery, /UpgradeUnavailableCard/);
    assert.match(discovery, /getoblicDirectoryUpgradeContent/);
    assert.match(
      discovery,
      /directoryAvailable \? \([\s\S]*GetOblicOpportunityDiscovery/,
    );

    for (const file of LOCKED_WORKFLOW_FILES) {
      assert.doesNotMatch(read(file), /kind:\s*["']href["']/, file);
    }
  });
});

describe("FREE-15G Full has no Free upgrade presentation and stays reachable", () => {
  it("treats Full as product, not Free chrome", () => {
    assert.equal(isFreeUntrained({ athenaPlan: "full", defineKind: "needs_setup" }), false);
    assert.equal(
      shouldShowGlobalFullAthenaInvite({
        athenaPlan: "full",
        defineKind: "ready",
      }),
      false,
    );
    assert.equal(shouldShowSeoNewAnalysis("full"), true);
    assert.equal(shouldShowPersonaCreate("full"), true);
    assert.equal(shouldShowAdsCreate("full"), true);
    assert.equal(shouldShowProspectCreate("full"), true);
    assert.equal(
      resolveConsumedFreeSocialCreateRedirect({
        athenaPlan: "full",
        starterStatus: "consumed",
        starterCalendarId: "da8d96a2-5ea3-4225-bd90-1f18dc3ab7f2",
      }),
      null,
    );
  });
});

describe("FREE-15G CTA destination stays reserved and upgrade UI does not infer entitlement", () => {
  it("keeps FREE-15 action none and presentation-only upgrade modules", () => {
    assert.deepEqual(resolveUpgradeCtaAction(), { kind: "none" });
    assert.deepEqual(resolveUpgradeCtaAction(null), { kind: "none" });
    assert.equal(isUpgradeCtaActionInteractive({ kind: "none" }), false);

    for (const file of UPGRADE_COMPONENT_FILES) {
      const source = read(file);
      assert.doesNotMatch(source, /resolveAthenaPlan|loadFreeProgressionState/, file);
      assert.doesNotMatch(source, /from\("organizations"\)|createClient/, file);
      assert.doesNotMatch(source, /\/pricing|\/checkout|\/billing/, file);
    }

    const inlineCta = read("components/upgrade/UpgradeInlineCTA.tsx");
    assert.match(inlineCta, /resolved\.kind === "none"/);
  });
});

describe("FREE-15G i18n parity and rejected wording", () => {
  it("keeps upgrade + Free keys aligned across six locales", () => {
    const english = collectKeyPaths(en);
    const upgradeAndFree = english.filter(
      (path) =>
        path === "upgrade" ||
        path.startsWith("upgrade.") ||
        /(^|\.)free(\.|$)/.test(path),
    );
    assert.ok(upgradeAndFree.length > 40);

    for (const language of ORGANIZATION_LANGUAGES) {
      const paths = collectKeyPaths(DICTIONARIES[language]);
      assert.deepEqual(
        upgradeAndFree.filter((path) => !paths.includes(path)),
        [],
        `${language} missing Free/upgrade keys`,
      );
    }

    assert.equal(en.upgrade.sidebarEyebrow, "ATHENA FREE");
    assert.equal(en.upgrade.sidebarHeadline, "Unlock the full power of Athena");
    assert.equal(
      en.upgrade.sidebarSupportingText,
      "Access the complete Intelligence OS and continue beyond Free limits.",
    );
    assert.equal(en.upgrade.continueWithFullAthena, "Continue with Full Athena");
  });

  it("keeps rejected and pricing wording out of tenant Free/upgrade copy", () => {
    for (const language of ORGANIZATION_LANGUAGES) {
      const messages = DICTIONARIES[language];
      const surfaces = [
        messages.upgrade,
        messages.dashboard.freeProgression,
        messages.identity.page,
        messages.seo.free,
        messages.personas.free,
        messages.ads.free,
        messages.socialPlanner.freeStarterWeek,
        messages.prospects.free,
        messages.gettingStarted,
      ];
      for (const surface of surfaces) {
        const serialized = JSON.stringify(surface);
        assert.doesNotMatch(serialized, REJECTED_UX, language);
        assert.doesNotMatch(serialized, PRICING_UX, language);
        assert.doesNotMatch(serialized, /Unlock everything|Upgrade now/i, language);
      }
    }
  });
});

describe("FREE-15G server authority remains the backstop", () => {
  it("keeps generation routes guarded before provider work", () => {
    for (const file of GENERATION_GUARD_ROUTES) {
      const source = read(file);
      assert.match(source, /assertCurrentFree/, file);
    }
    for (const file of ASK_PROVIDER_ROUTES) {
      assert.doesNotMatch(read(file), /weaken|bypassFree|skipFree/i, file);
    }
  });
});
