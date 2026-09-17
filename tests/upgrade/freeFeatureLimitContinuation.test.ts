/**
 * FREE-15D — contextual Full Athena continuation on completed Free
 * core-feature surfaces. Presentation only.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { SocialCalendarDetail } from "../../components/socialPlanner/SocialCalendarDetail";
import { UpgradeCompletionCard } from "../../components/upgrade/UpgradeCompletionCard";
import { UpgradeUnavailableCard } from "../../components/upgrade/UpgradeUnavailableCard";
import { shouldShowFreeTractionContinuation } from "../../lib/ads/freeTractionPresentation";
import { shouldShowFreeAudienceContinuation } from "../../lib/personas/freeAudiencePresentation";
import { shouldShowFreeConvertContinuation } from "../../lib/prospects/freeConvertPresentation";
import { shouldShowFreeVisibilityContinuation } from "../../lib/seo/freeVisibilityPresentation";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import {
  advertisingUpgradeContent,
  audienceUpgradeContent,
  convertUpgradeContent,
  getoblicDirectoryUpgradeContent,
  socialUpgradeContent,
  visibilityUpgradeContent,
} from "../../lib/upgrade/freeFeatureUpgradePresentation";
import { ORGANIZATION_LANGUAGES } from "../../services/organizationLanguage";
import { toSocialCalendarDetailDto } from "../../services/socialPlanner/socialCalendarDto";
import { mapSocialCalendarRow } from "../../services/socialPlanner/socialCalendarMappers";
import {
  TEST_ORG,
  TEST_PERIOD_END,
  TEST_PERIOD_START,
  buildGenerationContext,
  buildValidatedPackage,
} from "../socialPlanner/socialPlannerGenerationFixtures";

const ROOT = process.cwd();
const STARTER_ID = "da8d96a2-5ea3-4225-bd90-1f18dc3ab7f2";

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
  /pricing|trial|unlimited|unlock everything|all features|checkout|billing|paywall|subscribe|buy now|save %/i;

const AUTHORITY_FILES = [
  "lib/organization/freeAudience.ts",
  "lib/organization/freeVisibility.ts",
  "lib/organization/freeTraction.ts",
  "lib/organization/freeConvert.ts",
  "lib/organization/freeStarter.ts",
  "lib/organization/freeSocialPlannerGeneration.ts",
  "lib/organization/freeAudienceGeneration.ts",
  "lib/organization/freeVisibilityGeneration.ts",
  "lib/organization/freeTractionGeneration.ts",
  "lib/organization/freeConvertGeneration.ts",
  "services/organization/freeAudienceAuthority.ts",
  "services/organization/freeVisibilityAuthority.ts",
  "services/organization/freeTractionAuthority.ts",
  "services/organization/freeConvertAuthority.ts",
  "services/organization/freeStarterAuthority.ts",
  "services/organization/freeAudienceGenerationGuard.ts",
  "services/organization/freeVisibilityGenerationGuard.ts",
  "services/organization/freeTractionGenerationGuard.ts",
  "services/organization/freeConvertGenerationGuard.ts",
  "services/organization/freeSocialPlannerGenerationGuard.ts",
] as const;

const CONTINUATION_KEY_PATHS = [
  "personas.free.continuation.headline",
  "personas.free.continuation.capability1",
  "personas.free.continuation.capability2",
  "personas.free.continuation.capability3",
  "seo.free.continuation.headline",
  "seo.free.continuation.capability1",
  "seo.free.continuation.capability2",
  "seo.free.continuation.capability3",
  "ads.free.continuation.headline",
  "ads.free.continuation.capability1",
  "ads.free.continuation.capability2",
  "ads.free.continuation.capability3",
  "socialPlanner.free.continuation.headline",
  "socialPlanner.free.continuation.capability1",
  "socialPlanner.free.continuation.capability2",
  "socialPlanner.free.continuation.capability3",
  "prospects.free.continuation.headline",
  "prospects.free.continuation.capability1",
  "prospects.free.continuation.capability2",
  "prospects.free.continuation.capability3",
  "prospects.find.methods.directoryContinuation.headline",
  "prospects.find.methods.directoryContinuation.capability1",
  "prospects.find.methods.directoryContinuation.capability2",
  "prospects.find.methods.directoryContinuation.capability3",
] as const;

const AUDIENCE = audienceUpgradeContent({
  continuation: en.personas.free.continuation,
  upgrade: en.upgrade,
});
const VISIBILITY = visibilityUpgradeContent({
  continuation: en.seo.free.continuation,
  upgrade: en.upgrade,
});
const ADVERTISING = advertisingUpgradeContent({
  continuation: en.ads.free.continuation,
  upgrade: en.upgrade,
});
const SOCIAL = socialUpgradeContent({
  continuation: en.socialPlanner.free.continuation,
  upgrade: en.upgrade,
});
const CONVERT = convertUpgradeContent({
  continuation: en.prospects.free.continuation,
  upgrade: en.upgrade,
});
const GETOBLIC = getoblicDirectoryUpgradeContent({
  continuation: en.prospects.find.methods.directoryContinuation,
  upgrade: en.upgrade,
  availabilityLabel: en.prospects.find.methods.directoryUnavailable,
});

function upgradeSection(html: string, variant: string): string {
  const start = html.indexOf(`data-upgrade-variant="${variant}"`);
  assert.ok(start >= 0, `expected ${variant} upgrade surface`);
  const sectionStart = html.lastIndexOf("<section", start);
  const sectionEnd = html.indexOf("</section>", start);
  assert.ok(sectionStart >= 0 && sectionEnd > sectionStart);
  return html.slice(sectionStart, sectionEnd + "</section>".length);
}

function assertNonInteractiveContinuation(html: string, variant = "completion") {
  const surface = upgradeSection(html, variant);
  assert.match(surface, /Continue with Full Athena/);
  assert.match(surface, /data-upgrade-cta-kind="none"/);
  assert.doesNotMatch(surface, /data-upgrade-cta-kind="href"/);
  assert.doesNotMatch(surface, /data-upgrade-cta-kind="handler"/);
  assert.doesNotMatch(surface, /href=/);
  assert.doesNotMatch(surface, /tabindex="/i);
  assert.doesNotMatch(surface, /<button/);
  assert.doesNotMatch(surface, /<a /);
  assert.doesNotMatch(
    html,
    /href="\/pricing"|href="\/checkout"|href="\/billing"|href="\/upgrade"/,
  );
}

function readyStarterCalendar() {
  return toSocialCalendarDetailDto(
    mapSocialCalendarRow({
      id: STARTER_ID,
      organization_id: TEST_ORG,
      user_id: "user-1",
      period_start: TEST_PERIOD_START,
      period_end: TEST_PERIOD_END,
      user_guidance: null,
      generation_mode: "standard",
      source_calendar_id: null,
      root_calendar_id: null,
      version_number: 1,
      status: "Ready",
      generation_stage: "completed",
      package_json: buildValidatedPackage(buildGenerationContext()),
      provenance_json: { plannerKind: "daily_social" },
      calendar_context_json: {},
      revision_context_json: null,
      error_code: null,
      error_message: null,
      created_at: "2026-09-17T00:00:00.000Z",
      updated_at: "2026-09-17T00:00:00.000Z",
    }),
  );
}

describe("FREE-15D audience continuation", () => {
  it("shows consumed Free Audience continuation that describes additional audience creation", () => {
    assert.equal(shouldShowFreeAudienceContinuation("consumed"), true);
    const html = renderToStaticMarkup(
      createElement(UpgradeCompletionCard, AUDIENCE),
    );
    assert.match(html, /data-upgrade-feature="audience"/);
    assert.match(html, /data-upgrade-accent="audience"/);
    assert.match(html, /Build more audiences with Full Athena/);
    assert.match(html, /Create additional audiences for different customer segments/);
    assert.match(html, /Ask Athena to suggest new audiences from your business intelligence/);
    assert.match(html, /import audience data from a CSV/);
    assert.doesNotMatch(html, /delete|replace your audience|remove this audience/i);
    assertNonInteractiveContinuation(html);

    const landing = read("app/personas/page.tsx");
    const importPage = read("app/personas/import/page.tsx");
    const detail = read("app/personas/[id]/page.tsx");
    assert.match(landing, /shouldShowFreeAudienceContinuation\(presentation\)/);
    assert.match(landing, /UpgradeCompletionCard/);
    assert.match(landing, /audienceUpgradeContent/);
    assert.match(importPage, /shouldShowFreeAudienceContinuation\(presentation\)/);
    assert.match(importPage, /UpgradeCompletionCard/);
    assert.doesNotMatch(detail, /audienceUpgradeContent|UpgradeCompletionCard/);
    assert.match(detail, /personaAskUpgradeContent/);
  });

  it("does not render consumed audience continuation while Free Audience is still available", () => {
    assert.equal(shouldShowFreeAudienceContinuation("available"), false);
    assert.equal(shouldShowFreeAudienceContinuation("reserved"), false);
    assert.equal(shouldShowFreeAudienceContinuation("full"), false);
    assert.equal(shouldShowFreeAudienceContinuation("untrained"), false);

    const landing = read("app/personas/page.tsx");
    assert.match(landing, /shouldShowPersonaCreate\(presentation\)/);
    assert.match(landing, /copy\.list\.createCta/);
    assert.match(
      landing,
      /shouldShowFreeAudienceContinuation\(presentation\) \? \(/,
    );
  });
});

describe("FREE-15D visibility continuation", () => {
  it("renders completed Free Visibility continuation from consumed authority only", () => {
    assert.equal(shouldShowFreeVisibilityContinuation("consumed"), true);
    assert.equal(shouldShowFreeVisibilityContinuation("available"), false);
    assert.equal(shouldShowFreeVisibilityContinuation("processing"), false);
    assert.equal(shouldShowFreeVisibilityContinuation("failed"), false);
    assert.equal(shouldShowFreeVisibilityContinuation("full"), false);

    const html = renderToStaticMarkup(
      createElement(UpgradeCompletionCard, VISIBILITY),
    );
    assert.match(html, /data-upgrade-feature="visibility"/);
    assert.match(html, /data-upgrade-accent="visibility"/);
    assert.match(html, /Go deeper into your visibility with Full Athena/);
    assert.match(html, /Continue analyzing how the business appears in search/);
    assert.match(
      html,
      /Create additional Visibility Strategy analyses or regenerate a new version/,
    );
    assert.match(
      html,
      /Use those findings to identify visibility and content opportunities/,
    );
    assert.doesNotMatch(html, /Technical SEO|Website Technical Health/);
    assert.doesNotMatch(html, /publish|media buying/i);
    assertNonInteractiveContinuation(html);

    const landing = read("app/seo/page.tsx");
    const detail = read("app/seo/[id]/page.tsx");
    const create = read("app/seo/new/page.tsx");
    assert.match(landing, /shouldShowFreeVisibilityContinuation\(presentation\)/);
    assert.match(detail, /shouldShowFreeVisibilityContinuation\(presentation\)/);
    assert.doesNotMatch(create, /UpgradeCompletionCard|visibilityUpgradeContent/);
  });
});

describe("FREE-15D advertising continuation", () => {
  it("renders completed Free Advertising continuation from consumed authority only", () => {
    assert.equal(shouldShowFreeTractionContinuation("consumed"), true);
    assert.equal(shouldShowFreeTractionContinuation("available"), false);
    assert.equal(shouldShowFreeTractionContinuation("processing"), false);
    assert.equal(shouldShowFreeTractionContinuation("failed"), false);
    assert.equal(shouldShowFreeTractionContinuation("full"), false);

    const html = renderToStaticMarkup(
      createElement(UpgradeCompletionCard, ADVERTISING),
    );
    assert.match(html, /data-upgrade-feature="advertising"/);
    assert.match(html, /data-upgrade-accent="advertising"/);
    assert.match(html, /Create more campaigns with Full Athena/);
    assert.match(html, /Create additional campaigns for different audiences or offers/);
    assert.match(
      html,
      /Generate new campaign strategy and creative directions for Facebook, Instagram, TikTok and Google Search/,
    );
    assert.match(
      html,
      /Continue using Athena(?:&#x27;|'|’)s business and audience intelligence when building ads/,
    );
    assert.doesNotMatch(html, /publish|media buying|campaign management|Meta Ads|Google Ads integration/i);
    assertNonInteractiveContinuation(html);

    const landing = read("app/ads/page.tsx");
    const detail = read("app/ads/[id]/page.tsx");
    const create = read("app/ads/new/page.tsx");
    assert.match(landing, /shouldShowFreeTractionContinuation\(presentation\)/);
    assert.match(detail, /shouldShowFreeTractionContinuation\(presentation\)/);
    assert.doesNotMatch(create, /UpgradeCompletionCard|advertisingUpgradeContent/);
  });
});

describe("FREE-15D social continuation", () => {
  it("renders consumed Free Social continuation on the starter week only", () => {
    const calendar = readyStarterCalendar();
    const consumed = renderToStaticMarkup(
      createElement(SocialCalendarDetail, {
        calendar,
        onCreateAnotherWeek: () => undefined,
        readOnlyFreeStarter: true,
        messages: en,
      }),
    );
    const full = renderToStaticMarkup(
      createElement(SocialCalendarDetail, {
        calendar,
        onCreateAnotherWeek: () => undefined,
        readOnlyFreeStarter: false,
        messages: en,
      }),
    );

    assert.match(consumed, /data-upgrade-feature="social"/);
    assert.match(consumed, /data-upgrade-accent="social"/);
    assert.match(consumed, /Keep building your content with Full Athena/);
    assert.match(consumed, /Plan additional Daily Social and Evergreen content weeks/);
    assert.match(
      consumed,
      /Generate content for different audiences, themes or business priorities/,
    );
    assert.match(
      consumed,
      /Continue using Athena intelligence to shape future social content/,
    );
    assert.doesNotMatch(consumed, /automatic publishing|schedule to|social account management/i);
    assert.match(consumed, /Your starter week/);
    assert.match(consumed, /Your social week/);
    assertNonInteractiveContinuation(consumed);

    assert.doesNotMatch(full, /data-upgrade-feature="social"/);
    assert.doesNotMatch(full, /Keep building your content with Full Athena/);
    assert.match(full, /Create another week/);
  });
});

describe("FREE-15D convert continuation", () => {
  it("renders consumed Convert continuation that describes additional prospect research", () => {
    assert.equal(shouldShowFreeConvertContinuation("consumed"), true);
    assert.equal(shouldShowFreeConvertContinuation("available"), false);
    assert.equal(shouldShowFreeConvertContinuation("bound"), false);
    assert.equal(shouldShowFreeConvertContinuation("processing"), false);
    assert.equal(shouldShowFreeConvertContinuation("failed"), false);
    assert.equal(shouldShowFreeConvertContinuation("full"), false);

    const html = renderToStaticMarkup(
      createElement(UpgradeCompletionCard, CONVERT),
    );
    assert.match(html, /data-upgrade-feature="convert"/);
    assert.match(html, /data-upgrade-accent="convert"/);
    assert.match(html, /Pursue more opportunities with Full Athena/);
    assert.match(html, /Research additional prospects/);
    assert.match(html, /Build intelligence for more businesses you want to pursue/);
    assert.match(
      html,
      /Continue turning prospect intelligence into outreach and next-step guidance/,
    );
    assert.doesNotMatch(html, /CRM|outbound sending|email blast/i);
    assertNonInteractiveContinuation(html);

    const landing = read("app/prospects/page.tsx");
    const find = read("app/prospects/find/page.tsx");
    const detail = read("app/prospects/[id]/page.tsx");
    assert.match(landing, /shouldShowFreeConvertContinuation\(presentation\)/);
    assert.match(landing, /UpgradeCompletionCard/);
    assert.match(landing, /boundProspectHref/);
    assert.match(landing, /copy\.free\.openBoundProspect/);
    assert.match(find, /copy\.free\.openBoundProspect/);
    assert.match(detail, /ExecutiveIntelligenceWorkspace/);
    assert.doesNotMatch(find, /UpgradeCompletionCard|convertUpgradeContent/);
    assert.doesNotMatch(detail, /UpgradeCompletionCard|convertUpgradeContent/);
  });

  it("uses contextual Full capability presentation for Free GetOblic Directory and stays non-interactive", () => {
    const html = renderToStaticMarkup(
      createElement(UpgradeUnavailableCard, GETOBLIC),
    );
    assert.match(html, /data-upgrade-feature="getoblicDirectory"/);
    assert.match(html, /data-upgrade-accent="convert"/);
    assert.match(html, /data-upgrade-variant="unavailable"/);
    assert.match(html, /Search the GetOblic Directory with Full Athena/);
    assert.match(html, /Discover businesses from the GetOblic Directory/);
    assert.match(html, /Add directory businesses to Athena as opportunities/);
    assert.match(
      html,
      /Research those prospects using Athena(?:&#x27;|'|’)s Convert workflow/,
    );
    assert.match(html, /Available with Full Athena/);
    assertNonInteractiveContinuation(html, "unavailable");

    const methods = read("components/prospects/OpportunityDiscoveryMethods.tsx");
    const unavailable = methods.slice(
      methods.indexOf('data-discovery-available="false"'),
      methods.indexOf("{googleAvailable ? ("),
    );
    assert.match(unavailable, /UpgradeUnavailableCard/);
    assert.match(unavailable, /getoblicDirectoryUpgradeContent/);
    assert.match(unavailable, /directoryContinuation/);
    assert.match(unavailable, /directoryUnavailable/);
    assert.match(unavailable, /aria-disabled="true"/);
    assert.match(unavailable, /aria-describedby=/);
    assert.doesNotMatch(unavailable, /<button/);
    assert.doesNotMatch(unavailable, /<a |href=/);
    assert.doesNotMatch(unavailable, /onClick|onKeyDown/);
    assert.doesNotMatch(unavailable, /tabIndex/);
    assert.match(methods, /googleAvailable \? \(/);
    assert.match(methods, /Find One Business on Google|googleLabel/);
  });
});

describe("FREE-15D available Free, Full, CTA, and authority", () => {
  it("does not displace available Free primary actions with completion upsells", () => {
    const personas = read("app/personas/page.tsx");
    const seo = read("app/seo/page.tsx");
    const ads = read("app/ads/page.tsx");
    const prospects = read("app/prospects/page.tsx");
    const find = read("app/prospects/find/page.tsx");

    assert.match(personas, /showCreate \? \(/);
    assert.match(seo, /showNewAnalysis \? \(/);
    assert.match(ads, /allowCreate=\{showCreate\}/);
    assert.match(prospects, /showFind \? \(/);
    assert.match(find, /googleAvailable=\{shouldOfferGoogleDiscovery\(presentation\)\}/);
    assert.match(personas, /shouldShowFreeAudienceContinuation\(presentation\)/);
    assert.match(seo, /shouldShowFreeVisibilityContinuation\(presentation\)/);
    assert.match(ads, /shouldShowFreeTractionContinuation\(presentation\)/);
    assert.match(prospects, /shouldShowFreeConvertContinuation\(presentation\)/);
  });

  it("Full presentation renders none of the Free continuation surfaces", () => {
    assert.equal(shouldShowFreeAudienceContinuation("full"), false);
    assert.equal(shouldShowFreeVisibilityContinuation("full"), false);
    assert.equal(shouldShowFreeTractionContinuation("full"), false);
    assert.equal(shouldShowFreeConvertContinuation("full"), false);

    const helpers = [
      read("lib/personas/freeAudiencePresentation.ts"),
      read("lib/seo/freeVisibilityPresentation.ts"),
      read("lib/ads/freeTractionPresentation.ts"),
      read("lib/prospects/freeConvertPresentation.ts"),
    ];
    for (const source of helpers) {
      assert.match(source, /return presentation === "consumed"/);
    }

    const calendar = readyStarterCalendar();
    const html = renderToStaticMarkup(
      createElement(SocialCalendarDetail, {
        calendar,
        onCreateAnotherWeek: () => undefined,
        readOnlyFreeStarter: false,
        messages: en,
      }),
    );
    assert.doesNotMatch(html, /data-upgrade-feature=/);
  });

  it("uses action = none everywhere and introduces no href, route, or handler", () => {
    const contents = [AUDIENCE, VISIBILITY, ADVERTISING, SOCIAL, CONVERT];
    for (const content of contents) {
      const html = renderToStaticMarkup(
        createElement(UpgradeCompletionCard, content),
      );
      assertNonInteractiveContinuation(html);
    }
    assertNonInteractiveContinuation(
      renderToStaticMarkup(createElement(UpgradeUnavailableCard, GETOBLIC)),
      "unavailable",
    );

    const presentation = read("lib/upgrade/freeFeatureUpgradePresentation.ts");
    assert.doesNotMatch(presentation, /kind:\s*["']href["']|kind:\s*["']handler["']/);
    assert.doesNotMatch(presentation, /onContinue|href:\s*["']\//);
    assert.doesNotMatch(presentation, /\/pricing|\/checkout|\/billing/);

    const callers = [
      "app/personas/page.tsx",
      "app/personas/import/page.tsx",
      "app/seo/page.tsx",
      "app/seo/[id]/page.tsx",
      "app/ads/page.tsx",
      "app/ads/[id]/page.tsx",
      "app/prospects/page.tsx",
      "components/prospects/OpportunityDiscoveryMethods.tsx",
      "components/socialPlanner/SocialCalendarDetail.tsx",
    ];
    for (const file of callers) {
      const source = read(file);
      assert.doesNotMatch(source, /kind:\s*["']href["']|kind:\s*["']handler["']/, file);
      assert.doesNotMatch(source, /action=\{\{/, file);
      assert.doesNotMatch(source, /\/pricing|\/checkout|\/billing/, file);
    }
  });

  it("leaves existing Free authority constants and guards unchanged", () => {
    for (const file of AUTHORITY_FILES) {
      const source = read(file);
      assert.doesNotMatch(source, /UpgradeCompletionCard|UpgradeUnavailableCard|freeFeatureUpgradePresentation/, file);
    }

    const audience = read("lib/personas/freeAudiencePresentation.ts");
    const visibility = read("lib/seo/freeVisibilityPresentation.ts");
    const ads = read("lib/ads/freeTractionPresentation.ts");
    const convert = read("lib/prospects/freeConvertPresentation.ts");
    assert.match(audience, /shouldShowPersonaCsvImport[\s\S]*return presentation === "full"/);
    assert.match(visibility, /shouldShowSeoTechnicalOption[\s\S]*return presentation === "full"/);
    assert.match(visibility, /shouldShowSeoNewAnalysis[\s\S]*presentation === "full" \|\| presentation === "available"/);
    assert.match(ads, /shouldShowAdsCreate[\s\S]*presentation === "full" \|\| presentation === "available"/);
    assert.match(convert, /shouldOfferGetOblicDiscovery[\s\S]*return presentation === "full"/);
    assert.match(convert, /shouldOfferGoogleDiscovery[\s\S]*presentation === "full" \|\| presentation === "available"/);
  });
});

describe("FREE-15D i18n, accents, and copy discipline", () => {
  it("keeps six-language key parity without pricing or generic marketing language", () => {
    const canonical = collectKeyPaths(en);
    for (const path of CONTINUATION_KEY_PATHS) {
      assert.ok(canonical.includes(path), path);
    }

    for (const language of ORGANIZATION_LANGUAGES) {
      const dictionary = DICTIONARIES[language];
      const paths = collectKeyPaths(dictionary);
      assert.deepEqual(
        CONTINUATION_KEY_PATHS.filter((path) => !paths.includes(path)),
        [],
        `${language} missing FREE-15D keys`,
      );

      const blobs = [
        dictionary.personas.free.continuation,
        dictionary.seo.free.continuation,
        dictionary.ads.free.continuation,
        dictionary.socialPlanner.free.continuation,
        dictionary.prospects.free.continuation,
        dictionary.prospects.find.methods.directoryContinuation,
      ];
      for (const blob of blobs) {
        assert.ok(blob.headline.trim());
        assert.ok(blob.capability1.trim());
        assert.ok(blob.capability2.trim());
        assert.ok(blob.capability3.trim());
        assert.doesNotMatch(JSON.stringify(blob), FORBIDDEN_COPY, language);
        assert.doesNotMatch(JSON.stringify(blob), /\bupgrade\b/i, language);
      }
      assert.equal(
        dictionary.upgrade.continueWithFullAthena.trim().length > 0,
        true,
      );
    }

    assert.notEqual(
      fr.personas.free.continuation.headline,
      en.personas.free.continuation.headline,
    );
    assert.notEqual(
      de.seo.free.continuation.capability1,
      en.seo.free.continuation.capability1,
    );
    assert.notEqual(
      es.ads.free.continuation.headline,
      en.ads.free.continuation.headline,
    );
    assert.notEqual(
      pt.socialPlanner.free.continuation.headline,
      en.socialPlanner.free.continuation.headline,
    );
    assert.notEqual(
      itMessages.prospects.free.continuation.headline,
      en.prospects.free.continuation.headline,
    );
    assert.equal(en.upgrade.continueWithFullAthena, "Continue with Full Athena");
  });

  it("follows established feature accent families", () => {
    assert.equal(AUDIENCE.feature, "audience");
    assert.equal(AUDIENCE.accent, "audience");
    assert.equal(VISIBILITY.feature, "visibility");
    assert.equal(VISIBILITY.accent, "visibility");
    assert.equal(ADVERTISING.feature, "advertising");
    assert.equal(ADVERTISING.accent, "advertising");
    assert.equal(SOCIAL.feature, "social");
    assert.equal(SOCIAL.accent, "social");
    assert.equal(CONVERT.feature, "convert");
    assert.equal(CONVERT.accent, "convert");
    assert.equal(GETOBLIC.feature, "getoblicDirectory");
    assert.equal(GETOBLIC.accent, "convert");

    const html = [
      renderToStaticMarkup(createElement(UpgradeCompletionCard, AUDIENCE)),
      renderToStaticMarkup(createElement(UpgradeCompletionCard, VISIBILITY)),
      renderToStaticMarkup(createElement(UpgradeCompletionCard, ADVERTISING)),
      renderToStaticMarkup(createElement(UpgradeCompletionCard, SOCIAL)),
      renderToStaticMarkup(createElement(UpgradeCompletionCard, CONVERT)),
      renderToStaticMarkup(createElement(UpgradeCompletionCard, GETOBLIC)),
    ].join("\n");
    assert.match(html, /data-upgrade-accent="audience"/);
    assert.match(html, /data-upgrade-accent="visibility"/);
    assert.match(html, /data-upgrade-accent="advertising"/);
    assert.match(html, /data-upgrade-accent="social"/);
    assert.match(html, /data-upgrade-accent="convert"/);
  });
});
