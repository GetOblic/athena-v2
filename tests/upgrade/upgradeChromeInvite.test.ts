/**
 * FREE-15B — global Full Athena invitation in sidebar + mobile drawer.
 * Presentation only. No product-page rollout, destination, or billing.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { TenantAppShell } from "../../components/dashboard/TenantAppShell";
import { TenantMobileNav } from "../../components/dashboard/TenantMobileNav";
import {
  TenantChromeAfterNav,
  TenantSidebar,
} from "../../components/dashboard/TenantSidebar";
import {
  localizeTenantNav,
  tenantChromeAfterNavClassName,
  tenantNavDefs,
  tenantSidebarFrameClassName,
} from "../../components/dashboard/tenantNavigation";
import type { DefineKind } from "../../lib/home/homeDomainState";
import {
  applyFreeUntrainedNavPresentation,
  freeUntrainedLockedNavCopy,
  isFreeUntrained,
} from "../../lib/organization/freeUntrained";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import {
  resolveGlobalFullAthenaInvite,
  shouldShowGlobalFullAthenaInvite,
} from "../../lib/upgrade/upgradeChromePresentation";
import { upgradeSidebarContent } from "../../lib/upgrade/upgradePresentation";
import { ORGANIZATION_LANGUAGES } from "../../services/organizationLanguage";
import type { AthenaPlan } from "../../services/athenaPlan";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const DICTIONARIES: Record<string, TenantMessages> = {
  en,
  fr,
  es,
  it: itMessages,
  de,
  pt,
};

const DEFINE_KINDS: readonly DefineKind[] = [
  "unknown",
  "needs_setup",
  "in_progress",
  "ready",
];

const PLANS: readonly AthenaPlan[] = ["free", "full"];

const PRODUCT_PAGE_FILES = [
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
  "app/personas/[id]/page.tsx",
  "app/prospects/page.tsx",
  "app/prospects/[id]/page.tsx",
  "app/social-planner/page.tsx",
  "app/social-planner/[id]/page.tsx",
] as const;

const FREE_15D_CONTEXTUAL_PAGES = [
  "app/seo/page.tsx",
  "app/seo/[id]/page.tsx",
  "app/ads/page.tsx",
  "app/ads/[id]/page.tsx",
  "app/personas/page.tsx",
  "app/prospects/page.tsx",
] as const;

const PRODUCT_UPGRADE_COMPONENTS =
  /UpgradeUnavailableCard|UpgradeCompletionCard|UpgradeExhaustedNotice|UpgradeHint/;

const FORBIDDEN_COPY =
  /pricing|trial|unlimited|unlock everything|all features|upgrade now|buy|subscribe|checkout|billing/i;

function renderSidebar(
  athenaPlan?: AthenaPlan,
  defineKind?: DefineKind,
  messages: TenantMessages = en,
) {
  return renderToStaticMarkup(
    createElement(TenantSidebar, {
      currentPath: "/",
      messages,
      athenaPlan,
      defineKind,
    }),
  );
}

function renderShell(
  athenaPlan?: AthenaPlan,
  defineKind?: DefineKind,
  messages: TenantMessages = en,
) {
  return renderToStaticMarkup(
    createElement(
      TenantAppShell,
      {
        currentPath: "/",
        messages,
        athenaPlan,
        defineKind,
      },
      createElement("div", null, "Body"),
    ),
  );
}

function renderMobileDrawerFooter(
  athenaPlan?: AthenaPlan,
  defineKind?: DefineKind,
  messages: TenantMessages = en,
) {
  const items = applyFreeUntrainedNavPresentation(
    localizeTenantNav(messages),
    { athenaPlan, defineKind },
    freeUntrainedLockedNavCopy(messages.nav),
  );
  const help = items.find((item) => item.key === "needHelp");
  return renderToStaticMarkup(
    createElement(TenantChromeAfterNav, {
      help: help
        ? {
            title: help.label,
            subtitle: help.subtitle ?? "",
          }
        : undefined,
      poweredByGetOblic: messages.chrome.poweredByGetOblic,
      invite: resolveGlobalFullAthenaInvite({ athenaPlan, defineKind }, messages.upgrade),
    }),
  );
}

function renderMobileNav(
  athenaPlan?: AthenaPlan,
  defineKind?: DefineKind,
  messages: TenantMessages = en,
) {
  const items = applyFreeUntrainedNavPresentation(
    localizeTenantNav(messages),
    { athenaPlan, defineKind },
    freeUntrainedLockedNavCopy(messages.nav),
  );
  return renderToStaticMarkup(
    createElement(TenantMobileNav, {
      currentPath: "/",
      items,
      tagline: messages.chrome.tagline,
      openMenuLabel: messages.chrome.openMenu,
      closeMenuLabel: messages.chrome.closeMenu,
      mainNavigationLabel: messages.chrome.mainNavigation,
      yourGrowthLabel: messages.nav.yourGrowth,
      utilitiesLabel: messages.nav.utilities,
      moreToolsLabel: messages.nav.moreTools,
      poweredByGetOblic: messages.chrome.poweredByGetOblic,
      athenaPlan,
      fullAthenaInvite: resolveGlobalFullAthenaInvite(
        { athenaPlan, defineKind },
        messages.upgrade,
      ),
    }),
  );
}

function inviteIndex(html: string) {
  return html.indexOf('data-upgrade-variant="sidebar"');
}

function helpIndex(html: string) {
  return html.indexOf("Need help?");
}

function poweredIndex(html: string, label = en.chrome.poweredByGetOblic) {
  return html.indexOf(label);
}

describe("FREE-15B global Full Athena invitation", () => {
  it("shows the invitation only for trained Free organizations", () => {
    for (const athenaPlan of PLANS) {
      for (const defineKind of DEFINE_KINDS) {
        const expected =
          athenaPlan === "free" &&
          defineKind !== "needs_setup" &&
          !isFreeUntrained({ athenaPlan, defineKind });
        assert.equal(
          shouldShowGlobalFullAthenaInvite({ athenaPlan, defineKind }),
          expected,
          `${athenaPlan} + ${defineKind}`,
        );
      }
    }

    assert.equal(shouldShowGlobalFullAthenaInvite({ athenaPlan: "free" }), false);
    assert.equal(
      shouldShowGlobalFullAthenaInvite({ athenaPlan: "free", defineKind: null }),
      false,
    );
    assert.equal(shouldShowGlobalFullAthenaInvite({ defineKind: "ready" }), false);
    assert.equal(shouldShowGlobalFullAthenaInvite({}), false);
  });

  it("reuses shell athenaPlan + defineKind and does not invent trained-state authority", () => {
    const helper = read("lib/upgrade/upgradeChromePresentation.ts");
    assert.match(helper, /isFreeUntrained\(input\)/);
    assert.match(helper, /athenaPlan === "free"/);
    assert.match(helper, /defineKind != null/);
    assert.doesNotMatch(helper, /localStorage|sessionStorage|document\.cookie/);
    assert.doesNotMatch(helper, /user\.email|persona|prospect|audience|starter/i);
    assert.doesNotMatch(helper, /createClient|from\("organizations"\)|supabase/i);
    assert.doesNotMatch(helper, /quota|stripe|checkout|billing/i);

    const sidebar = read("components/dashboard/TenantSidebar.tsx");
    const shell = read("components/dashboard/TenantAppShell.tsx");
    assert.match(sidebar, /resolveGlobalFullAthenaInvite/);
    assert.match(sidebar, /\{ athenaPlan, defineKind \}/);
    assert.match(shell, /resolveGlobalFullAthenaInvite/);
    assert.match(shell, /fullAthenaInvite=\{fullAthenaInvite\}/);
    assert.doesNotMatch(sidebar, /loadFreeProgressionState|resolveAthenaPlan/);
    assert.doesNotMatch(shell, /loadFreeProgressionState|resolveAthenaPlan/);
  });

  it("does not show the invitation for Free + untrained", () => {
    const desktop = renderSidebar("free", "needs_setup");
    const mobile = renderMobileDrawerFooter("free", "needs_setup");
    const shell = renderShell("free", "needs_setup");

    for (const html of [desktop, mobile, shell]) {
      assert.doesNotMatch(html, /data-upgrade-variant="sidebar"/);
      assert.doesNotMatch(html, /Unlock the full power of Athena/);
      assert.doesNotMatch(html, /Keep going with the full Intelligence OS/);
      assert.doesNotMatch(html, /Continue with Full Athena/);
      assert.match(html, /Need help\?/);
      assert.match(html, /Chat with Athena/);
    }
    assert.match(desktop, />FREE</);
    assert.match(shell, />FREE</);
  });

  it("renders the restrained invitation in the desktop sidebar for trained Free", () => {
    const html = renderSidebar("free", "ready");

    assert.match(html, /data-upgrade-variant="sidebar"/);
    assert.match(html, /data-upgrade-accent="chrome"/);
    assert.match(html, /data-upgrade-feature="chrome"/);
    assert.match(html, /ATHENA FREE/);
    assert.match(html, /Unlock the full power of Athena/);
    assert.match(
      html,
      /Access the complete Intelligence OS and continue beyond Free limits\./,
    );
    assert.match(html, /Continue with Full Athena/);

    const eyebrowAt = html.indexOf("ATHENA FREE");
    const headlineAt = html.indexOf("Unlock the full power of Athena");
    const supportingAt = html.indexOf(
      "Access the complete Intelligence OS and continue beyond Free limits.",
    );
    const continuationAt = html.indexOf("Continue with Full Athena");
    assert.ok(eyebrowAt >= 0);
    assert.ok(headlineAt > eyebrowAt);
    assert.ok(supportingAt > headlineAt);
    assert.ok(continuationAt > supportingAt);
    assert.match(html, />FREE</);
    assert.doesNotMatch(html, />FULL</);
    assert.doesNotMatch(html, FORBIDDEN_COPY);
    assert.doesNotMatch(html, /<button/);
    assert.doesNotMatch(html, /href="\/pricing"|href="\/checkout"|href="\/billing"|href="\/upgrade"/);

    const helpAt = helpIndex(html);
    const inviteAt = inviteIndex(html);
    const poweredAt = poweredIndex(html);
    assert.ok(helpAt >= 0);
    assert.ok(inviteAt > helpAt);
    assert.ok(poweredAt > inviteAt);
  });

  it("renders the same invitation in the mobile drawer footer for trained Free", () => {
    const html = renderMobileDrawerFooter("free", "in_progress");
    const mobileSource = read("components/dashboard/TenantMobileNav.tsx");

    assert.match(html, /data-upgrade-variant="sidebar"/);
    assert.match(html, /Need help\?/);
    assert.match(html, /ATHENA FREE/);
    assert.match(html, /Unlock the full power of Athena/);
    assert.match(
      html,
      /Access the complete Intelligence OS and continue beyond Free limits\./,
    );
    assert.match(html, /Continue with Full Athena/);
    assert.doesNotMatch(html, /<button/);
    assert.doesNotMatch(html, /href="\/pricing"|href="\/checkout"|href="\/billing"/);
    assert.ok(helpIndex(html) < inviteIndex(html));
    assert.ok(inviteIndex(html) < poweredIndex(html));

    assert.match(mobileSource, /TenantChromeAfterNav/);
    assert.match(mobileSource, /fullAthenaInvite/);
    assert.doesNotMatch(mobileSource, /isFreeUntrained|needs_setup|resolveAthenaPlan/);
    assert.doesNotMatch(mobileSource, /tenantI18n|getTenantLocalization/);

    const afterNav = mobileSource.indexOf("<TenantChromeAfterNav");
    const navList = mobileSource.indexOf("<TenantNavList");
    assert.ok(navList >= 0);
    assert.ok(afterNav > navList);
  });

  it("keeps Full chrome unchanged and never adds a FULL badge", () => {
    for (const kind of DEFINE_KINDS) {
      const desktop = renderSidebar("full", kind);
      const mobile = renderMobileDrawerFooter("full", kind);
      const shell = renderShell("full", kind);
      for (const html of [desktop, mobile, shell]) {
        assert.doesNotMatch(html, /data-upgrade-variant="sidebar"/);
        assert.doesNotMatch(html, /Unlock the full power of Athena/);
        assert.doesNotMatch(html, /Keep going with the full Intelligence OS/);
        assert.doesNotMatch(html, />FREE</);
        assert.doesNotMatch(html, />FULL</);
        assert.match(html, /Need help\?/);
      }
    }
  });

  it("keeps Need Help, FREE badge, and growth navigation unchanged", () => {
    const trained = renderSidebar("free", "ready");
    const untrained = renderSidebar("free", "needs_setup");
    const full = renderSidebar("full", "ready");

    for (const html of [trained, untrained, full]) {
      assert.match(html, /Need help\?/);
      assert.match(html, /Chat with Athena/);
      assert.match(html, /Define Your Business/);
      assert.match(html, /Build Visibility/);
      assert.match(html, /Generate Traction/);
      assert.match(html, /Convert Opportunities/);
    }

    assert.match(trained, />FREE</);
    assert.match(untrained, />FREE</);
    assert.doesNotMatch(full, />FREE</);
    assert.equal(trained.includes("Teach Athena first"), false);
    assert.equal(untrained.includes("Teach Athena first"), true);

    const items = applyFreeUntrainedNavPresentation(
      localizeTenantNav(en),
      { athenaPlan: "free", defineKind: "ready" },
      freeUntrainedLockedNavCopy(en.nav),
    );
    assert.equal(items.find((item) => item.key === "buildVisibility")?.href, "/seo");
    assert.equal(items.find((item) => item.key === "generateTraction")?.href, "/personas");
    assert.equal(
      items.find((item) => item.key === "convertOpportunities")?.href,
      "/prospects",
    );
    assert.equal(
      tenantNavDefs.some((item) => item.disabled && item.key !== "settings"),
      false,
    );
  });

  it("does not invent a CTA destination or fake a control", () => {
    const invite = resolveGlobalFullAthenaInvite(
      { athenaPlan: "free", defineKind: "ready" },
      en.upgrade,
    );
    assert.deepEqual(invite, upgradeSidebarContent(en.upgrade));

    const desktop = renderSidebar("free", "ready");
    const mobile = renderMobileDrawerFooter("free", "ready");
    const shell = renderShell("free", "ready");
    for (const html of [desktop, mobile]) {
      assert.match(html, /role="note"/);
      assert.match(html, /data-upgrade-cta-kind="none"/);
      assert.match(html, /Continue with Full Athena/);
      assert.doesNotMatch(html, /data-upgrade-cta-kind="href"/);
      assert.doesNotMatch(html, /data-upgrade-cta-kind="handler"/);
      assert.doesNotMatch(html, /tabindex="/);
      assert.doesNotMatch(html, /href="\/pricing"|href="\/checkout"|href="\/upgrade"/);
      assert.doesNotMatch(html, /<button/);
    }
    assert.match(shell, /data-upgrade-variant="sidebar"/);
    assert.match(shell, /data-upgrade-cta-kind="none"/);
    assert.doesNotMatch(shell, /href="\/pricing"|href="\/checkout"|href="\/upgrade"/);

    const chromeFiles = [
      "components/dashboard/TenantSidebar.tsx",
      "components/dashboard/TenantMobileNav.tsx",
      "components/dashboard/TenantAppShell.tsx",
      "lib/upgrade/upgradeChromePresentation.ts",
    ];
    for (const file of chromeFiles) {
      const source = read(file);
      assert.doesNotMatch(source, /\/pricing|\/checkout|\/billing/);
      assert.doesNotMatch(source, /kind:\s*["']href["']|kind:\s*["']handler["']/);
    }
  });

  it("keeps global chrome as the only sidebar invite and leaves non-15D pages free of contextual cards", () => {
    for (const file of PRODUCT_PAGE_FILES) {
      const source = read(file);
      assert.doesNotMatch(source, /UpgradeSidebarInvite/, file);
    }
    for (const file of PRODUCT_PAGE_FILES) {
      if ((FREE_15D_CONTEXTUAL_PAGES as readonly string[]).includes(file)) {
        continue;
      }
      const source = read(file);
      assert.doesNotMatch(source, PRODUCT_UPGRADE_COMPONENTS, file);
    }

    const sidebar = read("components/dashboard/TenantSidebar.tsx");
    const mobile = read("components/dashboard/TenantMobileNav.tsx");
    assert.match(sidebar, /UpgradeSidebarInvite/);
    assert.doesNotMatch(sidebar, PRODUCT_UPGRADE_COMPONENTS);
    assert.doesNotMatch(mobile, PRODUCT_UPGRADE_COMPONENTS);
  });

  it("keeps six-language global chrome copy and does not add pricing language", () => {
    for (const language of ORGANIZATION_LANGUAGES) {
      const copy = DICTIONARIES[language].upgrade;
      assert.equal(typeof copy.sidebarEyebrow, "string");
      assert.equal(typeof copy.sidebarHeadline, "string");
      assert.equal(typeof copy.sidebarSupportingText, "string");
      assert.equal(typeof copy.continueWithFullAthena, "string");
      assert.ok(copy.sidebarEyebrow.trim().length > 0, language);
      assert.ok(copy.sidebarHeadline.trim().length > 0, language);
      assert.ok(copy.sidebarSupportingText.trim().length > 0, language);
      assert.doesNotMatch(copy.sidebarEyebrow, FORBIDDEN_COPY, language);
      assert.doesNotMatch(copy.sidebarHeadline, FORBIDDEN_COPY, language);
      assert.doesNotMatch(copy.sidebarSupportingText, FORBIDDEN_COPY, language);
      assert.doesNotMatch(copy.continueWithFullAthena, FORBIDDEN_COPY, language);
    }

    assert.equal(en.upgrade.sidebarEyebrow, "ATHENA FREE");
    assert.equal(
      en.upgrade.sidebarHeadline,
      "Unlock the full power of Athena",
    );
    assert.equal(
      en.upgrade.sidebarSupportingText,
      "Access the complete Intelligence OS and continue beyond Free limits.",
    );
    assert.equal(en.upgrade.continueWithFullAthena, "Continue with Full Athena");

    const french = renderSidebar("free", "ready", fr);
    assert.match(french, /ATHENA FREE/);
    assert.match(french, /Libérez toute la puissance d(?:'|&#x27;)Athena/);
    assert.match(
      french,
      /Accédez à l(?:'|&#x27;)Intelligence OS complet et continuez au-delà des limites de Free\./,
    );
    assert.match(french, /Continuer avec Full Athena/);
    assert.match(french, /Besoin d(?:'|&#x27;)aide/);
  });

  it("keeps the invitation visually subordinate to Need Help and native to chrome", () => {
    const html = renderSidebar("free", "ready");
    const inviteStart = html.lastIndexOf("<div", html.indexOf('data-upgrade-variant="sidebar"'));
    const invite = html.slice(inviteStart);

    assert.match(html, /Need help\?/);
    assert.match(html, /athena-orange/);
    assert.doesNotMatch(invite, /athena-orange/);
    assert.match(invite, /border-white\/10|bg-white\/\[0\.02\]/);
    assert.doesNotMatch(invite, /animate-|pulse|@keyframes/);
    assert.doesNotMatch(invite, /ShoppingCart|Crown|Rocket/);

    const sidebar = read("components/dashboard/TenantSidebar.tsx");
    const mobile = read("components/dashboard/TenantMobileNav.tsx");
    const shell = read("components/dashboard/TenantAppShell.tsx");
    assert.doesNotMatch(sidebar, /sticky top-0 z-30 banner|UpgradeBanner/);
    assert.doesNotMatch(shell, /UpgradeSidebarInvite/);
    assert.match(mobile, /lg:hidden/);
    assert.doesNotMatch(
      shell.slice(shell.indexOf("<header"), shell.indexOf("</header>")),
      /UpgradeSidebarInvite|data-upgrade-variant/,
    );
  });

  it("does not change tenant shell routing or locked-step hover/focus", () => {
    const sidebar = read("components/dashboard/TenantSidebar.tsx");
    const navigation = read("components/dashboard/tenantNavigation.ts");
    assert.match(sidebar, /showLockedGuidance/);
    assert.match(sidebar, /lockedGrowthNavGuidanceClassName/);
    assert.match(navigation, /group-hover:visible/);
    assert.match(navigation, /group-focus-within:visible/);
    assert.match(navigation, /overflow-y-auto/);
    assert.match(renderSidebar("full", "ready"), /overflow-y-auto/);

    const untrained = renderSidebar("free", "needs_setup");
    assert.match(untrained, /group-hover:visible/);
    assert.match(untrained, /Teach Athena →/);
    assert.doesNotMatch(untrained, /data-upgrade-variant="sidebar"/);

    const mobileClosed = renderMobileNav("free", "ready");
    assert.match(mobileClosed, /aria-controls="tenant-mobile-nav"/);
    assert.match(mobileClosed, /lg:hidden/);
  });
});

describe("FREE-15B sidebar viewport reachability", () => {
  it("gives the desktop sidebar an independent overflow strategy", () => {
    assert.match(tenantSidebarFrameClassName, /h-dvh/);
    assert.match(tenantSidebarFrameClassName, /flex-col/);
    assert.match(tenantSidebarFrameClassName, /overflow-y-auto/);
    assert.match(tenantSidebarFrameClassName, /min-h-0/);
    assert.match(tenantSidebarFrameClassName, /sticky/);
    assert.doesNotMatch(tenantSidebarFrameClassName, /overflow-visible/);
    assert.doesNotMatch(tenantSidebarFrameClassName, /absolute/);
    assert.equal(tenantChromeAfterNavClassName, "mt-auto shrink-0");

    const sidebar = read("components/dashboard/TenantSidebar.tsx");
    const navigation = read("components/dashboard/tenantNavigation.ts");
    const mobile = read("components/dashboard/TenantMobileNav.tsx");
    const shell = read("components/dashboard/TenantAppShell.tsx");

    assert.match(sidebar, /tenantSidebarFrameClassName/);
    assert.match(sidebar, /tenantChromeAfterNavClassName/);
    assert.match(sidebar, /shrink-0 text-sm/);
    assert.match(sidebar, /mb-8 inline-block shrink-0/);
    assert.match(navigation, /overflow-y-auto/);
    assert.match(mobile, /overflow-y-auto/);
    assert.doesNotMatch(shell, /overflow-y-auto/);
  });

  it("keeps the footer stack ordered Need Help → Full Athena → Powered by GetOblic", () => {
    const html = renderSidebar("free", "ready");
    const helpAt = helpIndex(html);
    const inviteAt = inviteIndex(html);
    const poweredAt = poweredIndex(html);

    assert.ok(helpAt >= 0);
    assert.ok(inviteAt > helpAt);
    assert.ok(poweredAt > inviteAt);
    assert.ok(html.includes(tenantSidebarFrameClassName));
    assert.ok(html.includes(tenantChromeAfterNavClassName));
    assert.match(html, /Need help\?/);
    assert.match(html, /Unlock the full power of Athena/);
    assert.match(html, /Powered by GetOblic/);

    const footer = html.slice(html.indexOf(tenantChromeAfterNavClassName));
    assert.ok(helpIndex(footer) >= 0);
    assert.ok(inviteIndex(footer) > helpIndex(footer));
    assert.ok(poweredIndex(footer) > inviteIndex(footer));
    assert.doesNotMatch(footer, /absolute (inset|top-|bottom-)|fixed (inset|bottom-)/);
  });

  it("does not shrink, hide, or restack chrome to fake fold fit", () => {
    const html = renderSidebar("free", "ready");
    const invite = read("components/upgrade/UpgradeSidebarInvite.tsx");

    assert.match(html, /Need help\?/);
    assert.match(html, /Chat with Athena/);
    assert.match(html, /Powered by GetOblic/);
    assert.match(html, />FREE</);
    assert.match(
      html,
      /Access the complete Intelligence OS and continue beyond Free limits\./,
    );
    assert.match(invite, /text-sm font-semibold leading-5 text-white\/85/);
    assert.match(invite, /text-sm leading-6 text-white\/50/);
    assert.doesNotMatch(invite, /text-\[9px\]|text-\[10px\]|line-clamp|truncate|sr-only/);
    assert.doesNotMatch(invite, /absolute inset|fixed bottom/);
  });
});
