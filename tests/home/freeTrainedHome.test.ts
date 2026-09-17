/**
 * FREE-15F — trained Free Home progression and Intelligence OS continuation.
 * Presentation only. Existing Free authority remains authoritative.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { FreeFirstSessionHome } from "../../components/home/FreeFirstSessionHome";
import { FreeTrainedHome } from "../../components/home/FreeTrainedHome";
import { presentFreeStarterHome } from "../../lib/home/freeStarterHome";
import { shouldShowFreeFirstSessionHome } from "../../lib/home/freeFirstSessionHome";
import { shouldShowFreeStarterExperience } from "../../lib/home/freeStarterHome";
import {
  deriveFreeTrainedHomeStory,
  mapFreePresentationToHomeStatus,
  presentFreeTrainedHome,
  shouldShowFreeTrainedHomeContinuation,
  type FreeTrainedHomeInput,
} from "../../lib/home/freeTrainedHome";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import { ORGANIZATION_LANGUAGES } from "../../services/organizationLanguage";

const ROOT = process.cwd();
const STARTER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REPORT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PERSONA_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CAMPAIGN_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PROSPECT_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

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

const FORBIDDEN_COPY =
  /keep going|upgrade now|unlock everything|unlimited|all features|don't miss out|you(?:'re| are) out of|your trial|pricing|discount|subscribe|buy now|quota|limit reached|exhausted|spent|remaining credits/i;

const AUTHORITY_FILES = [
  "lib/organization/freeAudience.ts",
  "lib/organization/freeVisibility.ts",
  "lib/organization/freeTraction.ts",
  "lib/organization/freeConvert.ts",
  "lib/organization/freeStarter.ts",
  "services/organization/freeAudienceAuthority.ts",
  "services/organization/freeVisibilityAuthority.ts",
  "services/organization/freeTractionAuthority.ts",
  "services/organization/freeConvertAuthority.ts",
  "services/organization/freeStarterAuthority.ts",
  "services/organization/freeProgressionState.ts",
] as const;

const FROZEN_FEATURE_PAGES = [
  "app/seo/page.tsx",
  "app/seo/[id]/page.tsx",
  "app/ads/page.tsx",
  "app/ads/[id]/page.tsx",
  "app/personas/page.tsx",
  "app/prospects/page.tsx",
  "app/getting-started/page.tsx",
  "app/identity/page.tsx",
] as const;

function baseInput(
  overrides: Partial<FreeTrainedHomeInput> = {},
): FreeTrainedHomeInput {
  return {
    athenaPlan: "free",
    defineKind: "ready",
    visibilityPresentation: "available",
    visibilityReportId: null,
    audiencePresentation: "available",
    audiencePersonaId: null,
    advertisingPresentation: "available",
    advertisingCampaignId: null,
    starter: presentFreeStarterHome({ starterStatus: "available" }),
    convertPresentation: "available",
    convertProspectId: null,
    copy: en.dashboard.freeProgression,
    upgrade: en.upgrade,
    ...overrides,
  };
}

function renderTrained(input: FreeTrainedHomeInput = baseInput()) {
  const view = presentFreeTrainedHome(input);
  return {
    view,
    html: renderToStaticMarkup(
      createElement(FreeTrainedHome, {
        starter: presentFreeStarterHome({
          starterStatus:
            input.starter.kind === "ready"
              ? "consumed"
              : input.starter.kind === "creating"
                ? "reserved"
                : input.starter.kind === "failed"
                  ? "reserved"
                  : "available",
          calendarId: input.starter.calendarId,
          calendarStatus:
            input.starter.kind === "ready"
              ? "Ready"
              : input.starter.kind === "failed"
                ? "Processing Failed"
                : input.starter.kind === "creating"
                  ? "Queued"
                  : null,
        }),
        view,
        messages: en,
      }),
    ),
  };
}

describe("FREE-15F Home progression presentation", () => {
  it("keeps untrained Free on the first-session Home with no Full Athena continuation", () => {
    assert.equal(
      shouldShowFreeFirstSessionHome({
        athenaPlan: "free",
        defineKind: "needs_setup",
      }),
      true,
    );
    assert.equal(
      shouldShowFreeStarterExperience({
        athenaPlan: "free",
        defineKind: "needs_setup",
      }),
      false,
    );
    assert.equal(
      shouldShowFreeTrainedHomeContinuation({
        athenaPlan: "free",
        defineKind: "needs_setup",
      }),
      false,
    );

    const html = renderToStaticMarkup(createElement(FreeFirstSessionHome));
    assert.match(html, /data-home-surface="free-first-session"/);
    assert.doesNotMatch(html, /data-home-surface="free-trained"/);
    assert.doesNotMatch(html, /data-upgrade-variant="completion"/);
    assert.doesNotMatch(html, /Continue with Full Athena/);
    assert.doesNotMatch(html, /Your Intelligence OS can go further/);
    assert.doesNotMatch(html, /Expand what your Intelligence OS can do/);
  });

  it("gives trained Free a progression-aware continuation from existing presentations", () => {
    const { view, html } = renderTrained();
    assert.equal(view.story, "remaining");
    assert.equal(view.continuationProminence, "secondary");
    assert.ok(view.continuation);
    assert.equal(view.continuation?.feature, "identity");
    assert.equal(view.continuation?.accent, "chrome");
    assert.match(html, /data-home-surface="free-trained"/);
    assert.match(html, /data-free-trained-story="remaining"/);
    assert.match(html, /data-upgrade-variant="completion"/);
    assert.match(html, /data-home-continuation="secondary"/);
    assert.match(html, /Athena knows your business/);
    assert.match(html, /Expand what your Intelligence OS can do/);
  });

  it("keeps an available Free capability as the primary next action", () => {
    const remaining = presentFreeTrainedHome(baseInput());
    assert.equal(remaining.primaryNext?.id, "visibility");
    assert.equal(remaining.primaryNext?.href, "/seo/new");
    assert.equal(remaining.primaryNext?.mode, "link");

    const audienceNext = presentFreeTrainedHome(
      baseInput({
        visibilityPresentation: "consumed",
        visibilityReportId: REPORT_ID,
      }),
    );
    assert.equal(audienceNext.story, "remaining");
    assert.equal(audienceNext.primaryNext?.id, "audience");
    assert.equal(audienceNext.primaryNext?.href, "/personas");
    assert.match(
      renderTrained(
        baseInput({
          visibilityPresentation: "consumed",
          visibilityReportId: REPORT_ID,
        }),
      ).html,
      /data-free-trained-primary="audience"/,
    );
  });

  it("represents consumed capabilities as delivered value, not available work", () => {
    const view = presentFreeTrainedHome(
      baseInput({
        visibilityPresentation: "consumed",
        visibilityReportId: REPORT_ID,
      }),
    );
    assert.equal(view.capabilities.visibility.status, "delivered");
    assert.match(
      view.capabilities.visibility.statusLine,
      /has created your Visibility Strategy/,
    );
    assert.doesNotMatch(view.capabilities.visibility.statusLine, FORBIDDEN_COPY);
    assert.notEqual(view.capabilities.visibility.ctaLabel, "Create your visibility analysis");
    assert.equal(view.capabilities.visibility.href, `/seo/${REPORT_ID}`);

    const html = renderTrained(
      baseInput({
        visibilityPresentation: "consumed",
        visibilityReportId: REPORT_ID,
      }),
    ).html;
    assert.match(html, /data-free-trained-capability="visibility"/);
    assert.match(html, /data-free-trained-status="delivered"/);
    assert.doesNotMatch(html, /quota|exhausted|limit reached|remaining credits/i);
  });

  it("keeps generated artifacts navigable from existing bound identifiers", () => {
    const view = presentFreeTrainedHome(
      baseInput({
        visibilityPresentation: "consumed",
        visibilityReportId: REPORT_ID,
        audiencePresentation: "consumed",
        audiencePersonaId: PERSONA_ID,
        advertisingPresentation: "consumed",
        advertisingCampaignId: CAMPAIGN_ID,
        starter: presentFreeStarterHome({
          starterStatus: "consumed",
          calendarId: STARTER_ID,
          calendarStatus: "Ready",
        }),
        convertPresentation: "consumed",
        convertProspectId: PROSPECT_ID,
      }),
    );

    assert.equal(view.capabilities.visibility.href, `/seo/${REPORT_ID}`);
    assert.equal(view.capabilities.audience.href, `/personas/${PERSONA_ID}`);
    assert.equal(view.capabilities.advertising.href, `/ads/${CAMPAIGN_ID}`);
    assert.equal(view.capabilities.social.href, `/social-planner/${STARTER_ID}`);
    assert.equal(view.capabilities.convert.href, `/prospects/${PROSPECT_ID}`);

    const html = renderTrained(
      baseInput({
        visibilityPresentation: "consumed",
        visibilityReportId: REPORT_ID,
        audiencePresentation: "consumed",
        audiencePersonaId: PERSONA_ID,
        advertisingPresentation: "consumed",
        advertisingCampaignId: CAMPAIGN_ID,
        starter: presentFreeStarterHome({
          starterStatus: "consumed",
          calendarId: STARTER_ID,
          calendarStatus: "Ready",
        }),
        convertPresentation: "consumed",
        convertProspectId: PROSPECT_ID,
      }),
    ).html;
    assert.match(html, new RegExp(`href="/seo/${REPORT_ID}"`));
    assert.match(html, new RegExp(`href="/personas/${PERSONA_ID}"`));
    assert.match(html, new RegExp(`href="/ads/${CAMPAIGN_ID}"`));
    assert.match(html, new RegExp(`href="/social-planner/${STARTER_ID}"`));
    assert.match(html, new RegExp(`href="/prospects/${PROSPECT_ID}"`));
    assert.match(html, /href="\/identity"/);
  });

  it("does not claim Free is complete while a major capability remains available", () => {
    const view = presentFreeTrainedHome(
      baseInput({
        visibilityPresentation: "consumed",
        visibilityReportId: REPORT_ID,
        audiencePresentation: "available",
        advertisingPresentation: "consumed",
        advertisingCampaignId: CAMPAIGN_ID,
        starter: presentFreeStarterHome({
          starterStatus: "consumed",
          calendarId: STARTER_ID,
          calendarStatus: "Ready",
        }),
        convertPresentation: "available",
      }),
    );
    assert.equal(view.story, "mixed");
    assert.equal(view.primaryNext?.id, "audience");
    assert.equal(view.continuationProminence, "secondary");
    assert.match(view.body, /more Free experiences are still open/);
    assert.doesNotMatch(view.body, /is in place/);
    assert.equal(
      deriveFreeTrainedHomeStory([
        "delivered",
        "available",
        "delivered",
        "delivered",
        "available",
      ]),
      "mixed",
    );
  });

  it("elevates the Full continuation once major Free experiences are consumed", () => {
    const view = presentFreeTrainedHome(
      baseInput({
        visibilityPresentation: "consumed",
        visibilityReportId: REPORT_ID,
        audiencePresentation: "consumed",
        audiencePersonaId: PERSONA_ID,
        advertisingPresentation: "consumed",
        advertisingCampaignId: CAMPAIGN_ID,
        starter: presentFreeStarterHome({
          starterStatus: "consumed",
          calendarId: STARTER_ID,
          calendarStatus: "Ready",
        }),
        convertPresentation: "consumed",
        convertProspectId: PROSPECT_ID,
      }),
    );
    assert.equal(view.story, "consumed");
    assert.equal(view.primaryNext, null);
    assert.equal(view.continuationProminence, "elevated");
    assert.equal(
      view.continuation?.headline,
      en.dashboard.freeProgression.continuationConsumedHeadline,
    );
    const html = renderTrained(
      baseInput({
        visibilityPresentation: "consumed",
        visibilityReportId: REPORT_ID,
        audiencePresentation: "consumed",
        audiencePersonaId: PERSONA_ID,
        advertisingPresentation: "consumed",
        advertisingCampaignId: CAMPAIGN_ID,
        starter: presentFreeStarterHome({
          starterStatus: "consumed",
          calendarId: STARTER_ID,
          calendarStatus: "Ready",
        }),
        convertPresentation: "consumed",
        convertProspectId: PROSPECT_ID,
      }),
    ).html;
    assert.match(html, /data-home-continuation="elevated"/);
    assert.match(html, /Your Intelligence OS can go further/);
    assert.doesNotMatch(html, /data-free-trained-primary=/);
  });

  it("keeps the sidebar invitation and Home continuation as distinct presentations", () => {
    const sidebar = en.upgrade.sidebarHeadline;
    const home = en.dashboard.freeProgression;
    assert.equal(sidebar, "Unlock the full power of Athena");
    assert.notEqual(home.continuationRemainingHeadline, sidebar);
    assert.notEqual(home.continuationMixedHeadline, sidebar);
    assert.notEqual(home.continuationConsumedHeadline, sidebar);
    assert.notEqual(home.continuationRemainingSupporting, en.upgrade.sidebarSupportingText);

    const html = renderTrained().html;
    assert.match(html, /data-upgrade-variant="completion"/);
    assert.doesNotMatch(html, /data-upgrade-variant="sidebar"/);
    assert.doesNotMatch(html, /Unlock the full power of Athena/);
  });

  it("uses the existing FREE-15A completion family without a new upgrade framework", () => {
    const home = read("components/home/FreeTrainedHome.tsx");
    const helper = read("lib/home/freeTrainedHome.ts");
    assert.match(home, /UpgradeCompletionCard/);
    assert.doesNotMatch(home, /UpgradeSidebarInvite/);
    assert.match(helper, /createUpgradeCapabilities/);
    assert.match(helper, /feature: "identity"/);
    assert.match(helper, /accent: "chrome"/);
    assert.doesNotMatch(helper, /UPGRADE_FEATURE_KEYS/);
  });

  it("does not invent new entitlement inference or progression persistence", () => {
    const helper = read("lib/home/freeTrainedHome.ts");
    const loader = read("services/home/freeTrainedHomeReadService.ts");
    const page = read("app/page.tsx");

    assert.match(helper, /mapFreePresentationToHomeStatus/);
    assert.match(helper, /presentation === "consumed"/);
    assert.doesNotMatch(helper, /localStorage|sessionStorage|document\.cookie/);
    assert.doesNotMatch(helper, /stripe|checkout|billing/);
    assert.doesNotMatch(helper, /remaining credits|limit reached/);
    assert.doesNotMatch(helper, /from\("organizations"\)|supabase|rpc\(/);

    assert.match(loader, /loadFreeVisibilityPageState/);
    assert.match(loader, /loadFreeAudiencePageState/);
    assert.match(loader, /loadFreeTractionPageState/);
    assert.match(loader, /loadFreeConvertPageState/);
    assert.match(loader, /loadFreeStarterHomeView/);
    assert.doesNotMatch(loader, /reserveFree|consumeFree|releaseFree|bindFree|insert\(|rpc\(/);

    assert.match(page, /loadFreeTrainedHomeView/);
    assert.doesNotMatch(page, /localStorage|sessionStorage/);
    assert.equal(mapFreePresentationToHomeStatus("available"), "available");
    assert.equal(mapFreePresentationToHomeStatus("consumed"), "delivered");
    assert.equal(mapFreePresentationToHomeStatus("processing"), "processing");
    assert.equal(mapFreePresentationToHomeStatus("failed"), "failed");
  });

  it("leaves Full Home as the operational dashboard", () => {
    assert.equal(
      shouldShowFreeStarterExperience({
        athenaPlan: "full",
        defineKind: "ready",
      }),
      false,
    );
    assert.equal(
      shouldShowFreeTrainedHomeContinuation({
        athenaPlan: "full",
        defineKind: "ready",
      }),
      false,
    );

    const page = read("app/page.tsx");
    const operational = page.slice(page.indexOf("const visibility = deriveVisibilityState"));
    assert.match(operational, /HomePriorityList/);
    assert.match(operational, /HomeBusinessReadiness/);
    assert.doesNotMatch(operational, /FreeTrainedHome|UpgradeCompletionCard|freeProgression/);
    assert.doesNotMatch(operational, /Athena Free|Continue with Full Athena/);
  });

  it("does not let historical Free consumption change Full presentation", () => {
    const helper = read("lib/home/freeTrainedHome.ts");
    assert.match(helper, /isFreeTrained\(input\)/);
    assert.doesNotMatch(helper, /athenaPlan === "full"/);
    const full = presentFreeTrainedHome(
      baseInput({
        athenaPlan: "full",
        visibilityPresentation: "consumed",
        audiencePresentation: "consumed",
        advertisingPresentation: "consumed",
        convertPresentation: "consumed",
        starter: presentFreeStarterHome({
          starterStatus: "consumed",
          calendarId: STARTER_ID,
          calendarStatus: "Ready",
        }),
      }),
    );
    assert.equal(full.continuation, null);
    assert.equal(shouldShowFreeTrainedHomeContinuation({ athenaPlan: "full", defineKind: "ready" }), false);
  });

  it("keeps the Home continuation CTA as none with no destination", () => {
    const { view, html } = renderTrained(
      baseInput({
        visibilityPresentation: "consumed",
        audiencePresentation: "consumed",
        advertisingPresentation: "consumed",
        convertPresentation: "consumed",
        starter: presentFreeStarterHome({
          starterStatus: "consumed",
          calendarId: STARTER_ID,
          calendarStatus: "Ready",
        }),
      }),
    );
    assert.equal(view.continuation?.ctaLabel, en.upgrade.continueWithFullAthena);
    assert.match(html, /data-upgrade-cta-kind="none"/);
    assert.doesNotMatch(html, /data-upgrade-cta-kind="href"/);
    assert.doesNotMatch(html, /data-upgrade-cta-kind="handler"/);
    assert.doesNotMatch(html, /href="\/pricing"|href="\/checkout"|href="\/billing"|href="\/upgrade"/);

    const trained = read("components/home/FreeTrainedHome.tsx");
    const helper = read("lib/home/freeTrainedHome.ts");
    assert.doesNotMatch(trained, /kind:\s*["']href["']|kind:\s*["']handler["']/);
    assert.doesNotMatch(helper, /kind:\s*["']href["']|kind:\s*["']handler["']/);
    assert.doesNotMatch(trained, /\/pricing|\/checkout|\/billing/);
  });

  it("does not add a second Full Athena card to Getting Started", () => {
    const page = read("app/getting-started/page.tsx");
    const view = read("components/getting-started/HelpCenterView.tsx");
    assert.doesNotMatch(page, /UpgradeCompletionCard|homeUpgradeContent|dashboard\.freeProgression/);
    assert.match(view, /helpAskUpgradeContent/);
    assert.match(view, /copy\.footer\.title/);
    assert.match(view, /href="\/"/);
    assert.match(view, /href="\/identity"/);
    assert.equal(en.gettingStarted.footer.title, "Ready to continue?");
    assert.match(en.gettingStarted.footer.body, /Use Home when you want the next live action/);
  });

  it("keeps exact six-language freeProgression key parity", () => {
    const english = collectKeyPaths(en.dashboard.freeProgression);
    for (const language of ORGANIZATION_LANGUAGES) {
      const copy = DICTIONARIES[language].dashboard.freeProgression;
      assert.deepEqual(collectKeyPaths(copy), english, language);
      for (const path of english) {
        const value = path.split(".").reduce<unknown>((current, key) => {
          return (current as Record<string, unknown>)[key];
        }, copy);
        assert.equal(typeof value, "string", `${language}.${path}`);
        assert.ok(String(value).trim().length > 0, `${language}.${path}`);
        assert.doesNotMatch(String(value), FORBIDDEN_COPY, `${language}.${path}`);
      }
      assert.match(copy.trainedTitle, /Athena/);
      assert.match(copy.continuationRemainingHeadline, /Intelligence OS|Full Athena/);
      assert.match(copy.capability1, /Athena/);
    }
    assert.notEqual(
      fr.dashboard.freeProgression.trainedTitle,
      en.dashboard.freeProgression.trainedTitle,
    );
    assert.notEqual(
      es.dashboard.freeProgression.consumedTitle,
      en.dashboard.freeProgression.consumedTitle,
    );
  });

  it("does not claim unsupported product capabilities", () => {
    const copy = en.dashboard.freeProgression;
    const blob = [
      copy.capability1,
      copy.capability2,
      copy.capability3,
      copy.continuationRemainingHeadline,
      copy.continuationMixedHeadline,
      copy.continuationConsumedHeadline,
      copy.continuationRemainingSupporting,
      copy.continuationMixedSupporting,
      copy.continuationConsumedSupporting,
    ].join("\n");
    assert.doesNotMatch(
      blob,
      /publish|media buying|schedul|CRM|outbound|Search Console|Analytics|Semrush|Ahrefs|crawl|unlimited/i,
    );
  });

  it("preserves desktop and mobile structural contracts", () => {
    const html = renderTrained().html;
    const page = read("app/page.tsx");
    const trained = read("components/home/FreeTrainedHome.tsx");

    assert.match(html, /data-free-trained-progression/);
    assert.match(html, /data-home-continuation="secondary"/);
    assert.ok(
      html.indexOf("data-free-trained-progression") <
        html.indexOf("data-home-continuation="),
    );
    assert.match(trained, /md:grid-cols-2/);
    assert.doesNotMatch(trained, /min-w-\[|w-screen|overflow-x-scroll/);
    assert.doesNotMatch(page, /UpgradeSidebarInvite/);
    assert.match(html, /data-free-starter-variant="section"/);
  });

  it("does not change frozen feature continuations or authority files", () => {
    for (const file of AUTHORITY_FILES) {
      const source = read(file);
      assert.doesNotMatch(source, /freeTrainedHome|UpgradeCompletionCard|freeProgression/);
    }
    for (const file of FROZEN_FEATURE_PAGES) {
      const source = read(file);
      assert.doesNotMatch(source, /presentFreeTrainedHome|FreeTrainedHome|homeUpgradeContent/);
    }
  });
});
