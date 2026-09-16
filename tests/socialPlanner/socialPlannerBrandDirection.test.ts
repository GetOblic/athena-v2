/**
 * SP-7 — Brand Direction on every generated Social Planner day.
 * Presentation + whole-day Copy/Continue composition only.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { SocialCalendarDayCard } from "../../components/socialPlanner/SocialCalendarDayCard";
import { SocialCalendarEvergreenDayCard } from "../../components/socialPlanner/SocialCalendarEvergreenDayCard";
import { SocialPlannerBrandDirection } from "../../components/socialPlanner/SocialPlannerBrandDirection";
import {
  composeSocialPlannerDayCopyWithBrandDirection,
  serializeSocialCalendarAsset,
  serializeSocialCalendarEvergreenDay,
} from "../../components/socialPlanner/socialPlannerAssetCopyText";
import {
  formatBlueprintBrandDirectionSuffix,
  toBlueprintBrandDirectionInput,
} from "../../services/identity/blueprintBrandDirection";
import type { SocialCalendarEvergreenDayV1 } from "../../services/socialPlanner/generation/socialCalendarEvergreenPackageTypes";
import {
  buildGenerationContext,
  buildValidatedPackage,
} from "./socialPlannerGenerationFixtures";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const FULL_BRAND = {
  primaryColor: "#FF6600",
  secondaryColor: "#1A1A1A",
  accentColor: "#F4F1EA",
  backgroundColor: "#0B0B0F",
  font: "geist",
};

const PARTIAL_BRAND = {
  primaryColor: "#112233",
  font: "arial",
};

const EVERGREEN_DAY: SocialCalendarEvergreenDayV1 = {
  date: "2026-05-10",
  weekday: "Sunday",
  evergreenFormat: "blog_post_idea",
  title: "Why families wait",
  concept: "Delayed preventive care",
  draft: "A usable blog draft about delayed preventive care.",
  cta: "Book the overdue visit.",
  publishingGuidance: "Publish as a blog post.",
  audience: "Busy parents",
  personaIds: ["persona-parent"],
  topic: "preventive care",
  angle: "delay pattern",
  calendarAnchors: [],
  calendarReason: null,
  sourceSignals: [],
  creativeFingerprint: {
    evergreenFormat: "blog_post_idea",
    contentArchetype: "educational",
    topic: "preventive care",
    angle: "delay pattern",
    hookType: "statement",
    hookNormalized: "why families wait",
    objective: "educate",
    audience: "busy parents",
    personaIds: ["persona-parent"],
    ctaType: "book",
    calendarAnchorIds: [],
  },
};

const TRACKING = {
  sourceType: "social_calendar" as const,
  sourceId: "cal-sp7",
  executiveVersionId: null,
  assetType: "social_day_2026-05-10",
};

const CLIENT_FILES = [
  "components/socialPlanner/SocialPlannerDetailWorkspace.tsx",
  "components/socialPlanner/SocialCalendarDetail.tsx",
  "components/socialPlanner/SocialCalendarDayCard.tsx",
  "components/socialPlanner/SocialCalendarEvergreenDayCard.tsx",
  "components/socialPlanner/SocialPlannerBrandDirection.tsx",
  "components/socialPlanner/socialPlannerAssetCopyText.ts",
];

const FROZEN_GENERATION = [
  "services/socialPlanner/generation/dispatchSocialPlannerGeneration.ts",
  "services/socialPlanner/generation/generateEvergreenSocialCalendarPackage.ts",
  "services/socialPlanner/generation/socialPlannerGenerationService.ts",
  "services/socialPlanner/generation/socialPlannerGenerationPrompts.ts",
  "services/socialPlanner/generation/socialPlannerEvergreenGenerationPrompts.ts",
  "services/socialPlanner/generation/validateSocialCalendarPackage.ts",
  "services/socialPlanner/generation/validateSocialCalendarEvergreenPackage.ts",
  "services/socialPlanner/generation/socialCalendarPackageTypes.ts",
  "services/socialPlanner/generation/socialCalendarEvergreenPackageTypes.ts",
  "services/socialPlanner/socialCalendarGenerationJobs/socialCalendarGenerationJobExecutor.ts",
];

const HISTORY_FILES = [
  "app/social-planner/page.tsx",
  "app/social-planner/history/daily/page.tsx",
  "app/social-planner/history/evergreen/page.tsx",
  "components/socialPlanner/SocialPlannerHistory.tsx",
  "components/socialPlanner/SocialPlannerHistoryCta.tsx",
  "components/socialPlanner/SocialPlannerHistoryPageWorkspace.tsx",
  "components/socialPlanner/SocialPlannerHistoryRoutePage.tsx",
  "components/socialPlanner/SocialPlannerWorkspace.tsx",
];

describe("SP-7 Brand Direction — data and server load", () => {
  it("loads canonical organization Brand Direction on the Social Planner detail page", () => {
    const page = read("app/social-planner/[id]/page.tsx");
    assert.match(page, /getOrganizationBrandIdentity/);
    assert.match(page, /from "@\/services\/identity\/brandIdentityService"/);
    assert.match(page, /toBlueprintBrandDirectionInput/);
    assert.match(page, /from "@\/services\/identity\/blueprintBrandDirection"/);
    assert.match(page, /getOrganizationBrandIdentity\(organizationId\)/);
    assert.match(page, /\[BRAND_DIRECTION\] social_planner_load_failed/);
    assert.match(page, /brandDirection=\{brandDirection\}/);
    assert.equal(
      (page.match(/getOrganizationBrandIdentity\(/g) ?? []).length,
      1,
    );
    assert.doesNotMatch(page, /next\/headers/);
    assert.doesNotMatch(page, /supabaseAdmin/);
  });

  it("maps organization brand through the existing Athena input contract", () => {
    const input = toBlueprintBrandDirectionInput({
      organization_id: "org-1",
      brand_logo_storage_path: null,
      brand_profile_picture_storage_path: null,
      brand_primary_color: "#FF6600",
      brand_secondary_color: "#1A1A1A",
      brand_accent_color: "#F4F1EA",
      brand_background_color: "#0B0B0F",
      brand_font: "geist",
    });
    assert.deepEqual(input, FULL_BRAND);
    assert.equal(toBlueprintBrandDirectionInput(null), null);
  });

  it("does not import server-only brand services into Social Planner client modules", () => {
    for (const file of CLIENT_FILES) {
      const source = read(file);
      assert.doesNotMatch(source, /brandIdentityService/);
      assert.doesNotMatch(source, /getOrganizationBrandIdentity/);
      assert.doesNotMatch(source, /next\/headers/);
      assert.doesNotMatch(source, /supabaseAdmin/);
    }
  });
});

describe("SP-7 Brand Direction — Daily presentation and copy", () => {
  it("threads Brand Direction into the Daily day card and expanded presentation", () => {
    const workspace = read(
      "components/socialPlanner/SocialPlannerDetailWorkspace.tsx",
    );
    const detail = read("components/socialPlanner/SocialCalendarDetail.tsx");
    const card = read("components/socialPlanner/SocialCalendarDayCard.tsx");
    const adapter = read(
      "components/socialPlanner/SocialPlannerBrandDirection.tsx",
    );

    assert.match(workspace, /brandDirection\?: BlueprintBrandDirectionInput/);
    assert.match(workspace, /brandDirection=\{brandDirection\}/);
    assert.match(detail, /brandDirection=\{brandDirection\}/);
    assert.match(card, /brandDirection=\{brandDirection\}/);
    assert.match(card, /<SocialPlannerBrandDirection/);
    assert.match(adapter, /formatBlueprintBrandDirectionSuffix/);
    assert.match(adapter, /data-brand-direction/);
    assert.equal((card.match(/<SocialPlannerBrandDirection/g) ?? []).length, 1);
  });

  it("keeps Daily Brand Direction inside the expanded panel only", () => {
    const card = read("components/socialPlanner/SocialCalendarDayCard.tsx");
    const returnStart = card.indexOf("return (");
    const expandedStart = card.indexOf("{open ?", returnStart);
    const header = card.slice(returnStart, expandedStart);
    const expanded = card.slice(expandedStart);
    assert.doesNotMatch(header, /<SocialPlannerBrandDirection/);
    assert.match(expanded, /<SocialPlannerBrandDirection brandDirection=\{brandDirection\} \/>/);
    assert.match(card, /SOCIAL_DETAIL_DEFAULT_OPEN\.day/);
  });

  it("renders exactly one Daily Brand Direction block when expanded and none when collapsed", () => {
    const asset = buildValidatedPackage(buildGenerationContext()).assets[0];
    const collapsed = renderToStaticMarkup(
      createElement(SocialCalendarDayCard, {
        asset,
        tracking: TRACKING,
        brandDirection: FULL_BRAND,
      }),
    );
    assert.doesNotMatch(collapsed, /data-brand-direction/);
    assert.doesNotMatch(collapsed, /Brand direction:/);

    const block = renderToStaticMarkup(
      createElement(SocialPlannerBrandDirection, {
        brandDirection: FULL_BRAND,
      }),
    );
    assert.match(block, /data-brand-direction/);
    assert.match(block, /Brand direction:/);
    assert.match(block, /Primary color: #FF6600/);
    assert.equal((block.match(/data-brand-direction/g) ?? []).length, 1);
    assert.equal((block.match(/Brand direction:/g) ?? []).length, 1);
  });

  it("enriches whole-day Daily Copy and Continue with the same Brand Direction payload", () => {
    const card = read("components/socialPlanner/SocialCalendarDayCard.tsx");
    const asset = buildValidatedPackage(buildGenerationContext()).assets[0];
    const serialized = serializeSocialCalendarAsset(asset);
    const enriched = composeSocialPlannerDayCopyWithBrandDirection(
      serialized,
      FULL_BRAND,
    );
    const suffix = formatBlueprintBrandDirectionSuffix(FULL_BRAND);

    assert.match(card, /composeSocialPlannerDayCopyWithBrandDirection/);
    assert.match(card, /serializeSocialCalendarAsset\(asset\)/);
    assert.match(card, /text=\{assetCopyText\}/);
    assert.match(card, /showContinue/);
    assert.doesNotMatch(serialized, /Brand direction:/);
    assert.ok(enriched.startsWith(serialized));
    assert.ok(enriched.endsWith(suffix));
    assert.equal((enriched.match(/Brand direction:/g) ?? []).length, 1);
    assert.equal(
      composeSocialPlannerDayCopyWithBrandDirection(enriched, FULL_BRAND),
      enriched,
    );
  });

  it("keeps Daily field-level Copy field-only", () => {
    const spec = read("components/socialPlanner/SocialCalendarProductionSpec.tsx");
    const card = read("components/socialPlanner/SocialCalendarDayCard.tsx");
    assert.match(spec, /<CopyButton\s+text=\{value\}/);
    assert.match(spec, /showContinue=\{false\}/);
    assert.doesNotMatch(spec, /composeSocialPlannerDayCopyWithBrandDirection/);
    assert.doesNotMatch(spec, /composeBlueprintPromptWithBrandDirection/);
    assert.doesNotMatch(spec, /brandDirection/);
    assert.match(card, /<SocialPlannerCopyableField\s+label=\{copy\.socialCopy\}/);
    assert.match(card, /value=\{asset\.socialCopy\}/);
    assert.match(card, /value=\{asset\.cta\}/);
  });
});

describe("SP-7 Brand Direction — Evergreen presentation and copy", () => {
  it("threads Brand Direction into the Evergreen day card and expanded presentation", () => {
    const detail = read("components/socialPlanner/SocialCalendarDetail.tsx");
    const card = read(
      "components/socialPlanner/SocialCalendarEvergreenDayCard.tsx",
    );
    assert.match(detail, /SocialCalendarEvergreenDayCard/);
    assert.match(card, /brandDirection=\{brandDirection\}/);
    assert.match(card, /<SocialPlannerBrandDirection/);
    assert.equal((card.match(/<SocialPlannerBrandDirection/g) ?? []).length, 1);
  });

  it("keeps Evergreen Brand Direction inside the expanded panel only", () => {
    const card = read(
      "components/socialPlanner/SocialCalendarEvergreenDayCard.tsx",
    );
    const returnStart = card.indexOf("return (");
    const expandedStart = card.indexOf("{open ?", returnStart);
    const header = card.slice(returnStart, expandedStart);
    const expanded = card.slice(expandedStart);
    assert.doesNotMatch(header, /<SocialPlannerBrandDirection/);
    assert.match(
      expanded,
      /<SocialPlannerBrandDirection brandDirection=\{brandDirection\} \/>/,
    );
  });

  it("renders exactly one Evergreen Brand Direction block when present", () => {
    const collapsed = renderToStaticMarkup(
      createElement(SocialCalendarEvergreenDayCard, {
        day: EVERGREEN_DAY,
        tracking: TRACKING,
        brandDirection: FULL_BRAND,
      }),
    );
    assert.doesNotMatch(collapsed, /data-brand-direction/);
    assert.doesNotMatch(collapsed, /Brand direction:/);

    const block = renderToStaticMarkup(
      createElement(SocialPlannerBrandDirection, {
        brandDirection: FULL_BRAND,
      }),
    );
    assert.equal((block.match(/data-brand-direction/g) ?? []).length, 1);
  });

  it("enriches whole-day Evergreen Copy and Continue with the same Brand Direction payload", () => {
    const card = read(
      "components/socialPlanner/SocialCalendarEvergreenDayCard.tsx",
    );
    const serialized = serializeSocialCalendarEvergreenDay(EVERGREEN_DAY);
    const enriched = composeSocialPlannerDayCopyWithBrandDirection(
      serialized,
      FULL_BRAND,
    );
    const suffix = formatBlueprintBrandDirectionSuffix(FULL_BRAND);

    assert.match(card, /composeSocialPlannerDayCopyWithBrandDirection/);
    assert.match(card, /serializeSocialCalendarEvergreenDay\(day\)/);
    assert.match(card, /text=\{copyText\}/);
    assert.match(card, /showContinue/);
    assert.doesNotMatch(serialized, /Brand direction:/);
    assert.ok(enriched.startsWith(serialized));
    assert.ok(enriched.endsWith(suffix));
    assert.equal((enriched.match(/Brand direction:/g) ?? []).length, 1);
  });

  it("keeps Evergreen field-level Copy field-only", () => {
    const card = read(
      "components/socialPlanner/SocialCalendarEvergreenDayCard.tsx",
    );
    const spec = read("components/socialPlanner/SocialCalendarProductionSpec.tsx");
    assert.match(card, /value=\{day\.draft\}/);
    assert.match(card, /value=\{day\.cta\}/);
    assert.match(card, /value=\{day\.publishingGuidance\}/);
    assert.doesNotMatch(spec, /brandDirection/);
  });
});

describe("SP-7 Brand Direction — missing data", () => {
  it("does not invent values and does not break Daily or Evergreen when Brand Direction is missing", () => {
    const asset = buildValidatedPackage(buildGenerationContext()).assets[0];
    const serializedDaily = serializeSocialCalendarAsset(asset);
    const serializedEvergreen = serializeSocialCalendarEvergreenDay(EVERGREEN_DAY);

    assert.equal(
      composeSocialPlannerDayCopyWithBrandDirection(serializedDaily, null),
      serializedDaily,
    );
    assert.equal(
      composeSocialPlannerDayCopyWithBrandDirection(serializedDaily, {}),
      serializedDaily,
    );
    assert.equal(
      composeSocialPlannerDayCopyWithBrandDirection(serializedEvergreen, null),
      serializedEvergreen,
    );
    assert.equal(formatBlueprintBrandDirectionSuffix(null), "");
    assert.equal(formatBlueprintBrandDirectionSuffix({}), "");

    const partial = formatBlueprintBrandDirectionSuffix(PARTIAL_BRAND);
    assert.match(partial, /Primary color: #112233/);
    assert.match(partial, /Font: Arial/);
    assert.doesNotMatch(partial, /Secondary color:/);
    assert.doesNotMatch(partial, /null|undefined|#000000|Geist/);

    const missingDaily = renderToStaticMarkup(
      createElement(SocialCalendarDayCard, {
        asset,
        tracking: TRACKING,
        brandDirection: null,
      }),
    );
    const missingEvergreen = renderToStaticMarkup(
      createElement(SocialCalendarEvergreenDayCard, {
        day: EVERGREEN_DAY,
        tracking: TRACKING,
        brandDirection: null,
      }),
    );
    const hidden = renderToStaticMarkup(
      createElement(SocialPlannerBrandDirection, { brandDirection: null }),
    );
    assert.doesNotMatch(missingDaily, /data-brand-direction/);
    assert.doesNotMatch(missingEvergreen, /data-brand-direction/);
    assert.equal(hidden, "");
    assert.match(missingDaily, /social-planner-day-/);
    assert.match(missingEvergreen, /social-planner-day-/);
  });
});

describe("SP-7 Brand Direction — lineage and non-interference", () => {
  it("reopened history, Think Differently, and conversation revision share the detail Brand Direction path", () => {
    const history = read("components/socialPlanner/SocialPlannerHistory.tsx");
    const workspace = read(
      "components/socialPlanner/SocialPlannerDetailWorkspace.tsx",
    );
    const page = read("app/social-planner/[id]/page.tsx");
    assert.match(history, /href=\{`\/social-planner\/\$\{calendar\.id\}`\}/);
    assert.match(workspace, /router\.push\(`\/social-planner\/\$\{created\.id\}`\)/);
    assert.match(page, /getOrganizationBrandIdentity/);
    assert.match(page, /brandDirection=\{brandDirection\}/);
    assert.doesNotMatch(history, /brandDirection|Brand Direction|getOrganizationBrandIdentity/);
  });

  it("does not change Daily/Evergreen generation, packages, or the worker", () => {
    for (const file of FROZEN_GENERATION) {
      const source = read(file);
      assert.doesNotMatch(source, /brandDirection/);
      assert.doesNotMatch(source, /composeBlueprintPromptWithBrandDirection/);
      assert.doesNotMatch(source, /getOrganizationBrandIdentity/);
      assert.doesNotMatch(source, /SocialPlannerBrandDirection/);
    }
  });

  it("does not change AI-2 destination preference wiring, CHIME-2, SP-6 history, or global Copy/Continue", () => {
    const page = read("app/social-planner/[id]/page.tsx");
    const workspace = read(
      "components/socialPlanner/SocialPlannerDetailWorkspace.tsx",
    );
    const chime = read(
      "components/socialPlanner/SocialPlannerDetailWorkspace.tsx",
    );
    const copy = read("components/deployment/CopyButton.tsx");
    const continueButton = read("components/deployment/ContinueButton.tsx");

    assert.match(page, /getOrganizationAiWorkspacePreferences/);
    assert.match(page, /continuationPreferences=\{continuationPreferences\}/);
    assert.match(workspace, /continuationPreferences=\{continuationPreferences\}/);
    assert.match(workspace, /useBackgroundActionCompletionSound/);
    assert.match(chime, /completionSound\.observe/);
    assert.doesNotMatch(copy, /social-planner|brandDirection|Social Planner/);
    assert.doesNotMatch(
      continueButton,
      /social-planner|brandDirection|Social Planner/,
    );

    for (const file of HISTORY_FILES) {
      const source = read(file);
      assert.doesNotMatch(source, /brandDirection/);
      assert.doesNotMatch(source, /getOrganizationBrandIdentity/);
      assert.doesNotMatch(source, /SocialPlannerBrandDirection/);
    }
  });
});
