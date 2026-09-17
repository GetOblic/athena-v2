import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { FreeStarterHome } from "../../components/home/FreeStarterHome";
import { shouldShowFreeFirstSessionHome } from "../../lib/home/freeFirstSessionHome";
import {
  presentFreeStarterHome,
  shouldShowFreeStarterExperience,
} from "../../lib/home/freeStarterHome";
import { deriveFreeStarterHomeKind } from "../../lib/organization/freeStarter";
import { en } from "../../lib/tenantI18n/messages/en";
import { de } from "../../lib/tenantI18n/messages/de";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import { SOCIAL_PLANNER_DETAIL_POLL_MS } from "../../components/socialPlanner/socialPlannerClient";
import { serializeSocialCalendarAsset } from "../../components/socialPlanner/socialPlannerAssetCopyText";
import { buildValidatedPackage } from "../socialPlanner/socialPlannerGenerationFixtures";
import type { TenantMessages } from "../../lib/tenantI18n/types";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const DICTIONARIES: TenantMessages[] = [en, fr, es, de, pt, itMessages];

describe("FREE-5 trained Free Home — state machine", () => {
  it("keeps FREE-3 welcome only for Free + needs_setup", () => {
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
  });

  it("renders A/B/C/D for trained Free and leaves Full on operational Home", () => {
    assert.equal(
      shouldShowFreeStarterExperience({
        athenaPlan: "free",
        defineKind: "ready",
      }),
      true,
    );
    assert.equal(
      shouldShowFreeStarterExperience({
        athenaPlan: "full",
        defineKind: "ready",
      }),
      false,
    );
    assert.equal(
      deriveFreeStarterHomeKind({
        starterStatus: "available",
      }),
      "available",
    );
    assert.equal(
      deriveFreeStarterHomeKind({
        starterStatus: "reserved",
        calendarStatus: "Queued",
      }),
      "creating",
    );
    assert.equal(
      deriveFreeStarterHomeKind({
        starterStatus: "consumed",
        calendarStatus: "Ready",
      }),
      "ready",
    );
    assert.equal(
      deriveFreeStarterHomeKind({
        starterStatus: "available",
        calendarStatus: "Processing Failed",
      }),
      "failed",
    );
  });
});

describe("FREE-5 trained Free Home — presentation", () => {
  it("renders the ready reward surface with one create CTA", () => {
    const view = presentFreeStarterHome({ starterStatus: "available" });
    const html = renderToStaticMarkup(
      createElement(FreeStarterHome, {
        initialView: view,
        messages: en,
      }),
    );
    assert.match(html, /data-home-surface="free-starter"/);
    assert.match(html, /data-free-starter-kind="available"/);
    assert.match(html, /Athena is ready/);
    assert.match(html, /Athena knows your business/);
    assert.match(html, /Create my first content/);
    assert.match(html, /data-free-starter-cta="create"/);
    assert.doesNotMatch(html, /Opportunity pipeline|GetOblic listing capacity/i);
    assert.doesNotMatch(html, /Business readiness/);
    assert.doesNotMatch(html, /Teach Athena about my business/);
  });

  it("previews only the first Daily asset and links the full week", () => {
    const socialPackage = buildValidatedPackage();
    const view = presentFreeStarterHome({
      starterStatus: "consumed",
      calendarId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      calendarStatus: "Ready",
      socialPackage,
    });
    assert.equal(view.firstAsset?.assetType, socialPackage.assets[0].assetType);
    assert.equal(
      view.firstAsset?.serializedCopy,
      serializeSocialCalendarAsset(socialPackage.assets[0]),
    );
    assert.equal(view.weekHref, "/social-planner/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    assert.equal(socialPackage.assets.length, 7);

    const html = renderToStaticMarkup(
      createElement(FreeStarterHome, {
        initialView: view,
        messages: en,
      }),
    );
    assert.match(html, /data-free-starter-preview="first-asset"/);
    assert.match(html, /href="\/social-planner\/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"/);
    assert.match(html, /View full week/);
    assert.doesNotMatch(html, /Ask Athena/);
    assert.doesNotMatch(html, /Think Differently/);
    assert.doesNotMatch(html, /Create another week/);
  });

  it("does not generate on Home render or page load", () => {
    const home = read("app/page.tsx");
    const readService = read("services/home/freeStarterHomeReadService.ts");
    const helper = read("lib/home/freeStarterHome.ts");
    const welcome = read("components/home/FreeFirstSessionHome.tsx");

    assert.match(home, /loadFreeTrainedHomeView/);
    assert.match(home, /shouldShowFreeStarterExperience/);
    assert.match(readService, /loadFreeStarterAuthority/);
    assert.match(readService, /getSocialCalendarById/);
    assert.doesNotMatch(readService, /\.insert\(|reserveFreeStarter|createSocialCalendar|rpc\(/);
    assert.doesNotMatch(helper, /fetch\(|reserveFreeStarter|createSocialCalendar/);
    assert.doesNotMatch(home, /createDailySocialCalendarWithJob|reserveFreeStarter\(/);
    assert.doesNotMatch(welcome, /free-starter|Create my first content/);
    assert.equal(htmlHasGenerate(read("components/home/FreeStarterHome.tsx")), false);
  });

  it("reuses the existing 3-second Social Planner poll", () => {
    const client = read("components/home/FreeStarterHome.tsx");
    assert.match(client, /fetchSocialCalendarDetail/);
    assert.match(client, /SOCIAL_PLANNER_DETAIL_POLL_MS/);
    assert.equal(SOCIAL_PLANNER_DETAIL_POLL_MS, 3_000);
    assert.doesNotMatch(client, /setInterval\([^\n]+, 1000\)/);
    assert.doesNotMatch(client, /SocialPlannerDetailWorkspace/);
  });
});

describe("FREE-5 Home i18n", () => {
  it("keeps exact freeStarter key parity across six languages", () => {
    const englishKeys = Object.keys(en.dashboard.freeStarter).sort();
    for (const dictionary of DICTIONARIES) {
      assert.deepEqual(
        Object.keys(dictionary.dashboard.freeStarter).sort(),
        englishKeys,
      );
      for (const key of englishKeys) {
        const value =
          dictionary.dashboard.freeStarter[
            key as keyof typeof dictionary.dashboard.freeStarter
          ];
        assert.ok(value.trim().length > 0, key);
      }
      assert.match(dictionary.dashboard.freeStarter.eyebrow, /Athena/);
      assert.match(dictionary.dashboard.freeStarter.readyTitle, /Athena/);
    }
    assert.notEqual(fr.dashboard.freeStarter.createCta, en.dashboard.freeStarter.createCta);
    assert.notEqual(es.dashboard.freeStarter.resultTitle, en.dashboard.freeStarter.resultTitle);
  });
});

function htmlHasGenerate(source: string): boolean {
  return /createDailySocialCalendarWithJob|generateText|OpenRouter|deep-scrape/.test(
    source,
  );
}
