import "./socialPlannerTestEnv";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { DEPLOYMENT_ASSET_TYPE_BY_LABEL } from "../../services/assetInteractions/assetInteractionKeys";
import {
  SOCIAL_PLANNER_ASSET_TYPES,
  SOCIAL_PLANNER_DAILY_CHANNELS,
  SOCIAL_PLANNER_DAILY_COMMUNITY_CHANNELS,
  SOCIAL_PLANNER_PACKAGE_LIMITS,
  SOCIAL_PLANNER_PLATFORMS,
} from "../../services/socialPlanner/generation/socialCalendarPackageTypes";
import {
  buildSocialPlannerAssetPrompt,
  buildSocialPlannerPackageOutputContract,
  buildSocialPlannerRepairPrompt,
  buildSocialPlannerStrategyPrompt,
} from "../../services/socialPlanner/generation/socialPlannerGenerationPrompts";
import { validateAndNormalizeSocialCalendarPackage } from "../../services/socialPlanner/generation/validateSocialCalendarPackage";
import {
  SOCIAL_PLANNER_DAILY_EXCLUDED_EVERGREEN_FORMATS,
  SOCIAL_PLANNER_EVERGREEN_FORMATS,
  isSocialPlannerDailyChannel,
} from "../../services/socialPlanner/socialPlannerDailyChannels";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import { ORGANIZATION_LANGUAGES } from "../../services/organizationLanguage";
import {
  buildGenerationContext,
  buildValidPackageRaw,
  buildValidStrategyRaw,
  testMetadata,
} from "./socialPlannerGenerationFixtures";

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

const PERSONA_IMPORT_PATHS = [
  "app/personas/import/page.tsx",
  "components/personas/PersonaCreationBlock.tsx",
  "components/personas/PersonaCsvImport.tsx",
  "components/personas/PersonaGenerateForm.tsx",
  "components/personas/PersonaImportForms.tsx",
  "components/personas/personaFormFields.ts",
  "lib/personas/personaImportPresentation.ts",
  "tests/personas/personaImportPresentation.test.ts",
];

describe("Social Planner Daily Social Media contract", () => {
  it("Daily universe includes the nine accepted destinations and excludes Evergreen-only formats", () => {
    assert.deepEqual([...SOCIAL_PLANNER_PLATFORMS], [
      "instagram",
      "facebook",
      "linkedin",
      "tiktok",
      "youtube_shorts",
      "x",
      "threads",
    ]);
    assert.deepEqual([...SOCIAL_PLANNER_DAILY_COMMUNITY_CHANNELS], [
      DEPLOYMENT_ASSET_TYPE_BY_LABEL.SKOOL_POST,
      DEPLOYMENT_ASSET_TYPE_BY_LABEL.SUBSTACK_NOTE,
    ]);
    assert.deepEqual([...SOCIAL_PLANNER_DAILY_CHANNELS], [
      "instagram",
      "facebook",
      "linkedin",
      "tiktok",
      "youtube_shorts",
      "x",
      "threads",
      "skool_post",
      "substack_note",
    ]);
    assert.equal(isSocialPlannerDailyChannel("skool_post"), true);
    assert.equal(isSocialPlannerDailyChannel("substack_note"), true);
    for (const excluded of SOCIAL_PLANNER_DAILY_EXCLUDED_EVERGREEN_FORMATS) {
      assert.equal(isSocialPlannerDailyChannel(excluded), false);
    }
    assert.deepEqual([...SOCIAL_PLANNER_EVERGREEN_FORMATS], [
      "blog_post_idea",
      "newsletter_idea",
      "substack_post",
      "reddit_post",
      "skool_post",
      "skool_course_idea",
    ]);
    assert.equal(
      SOCIAL_PLANNER_DAILY_CHANNELS.includes(
        DEPLOYMENT_ASSET_TYPE_BY_LABEL.SUBSTACK_NOTE,
      ),
      true,
    );
    assert.equal(
      (SOCIAL_PLANNER_EVERGREEN_FORMATS as readonly string[]).includes(
        DEPLOYMENT_ASSET_TYPE_BY_LABEL.SUBSTACK_NOTE,
      ),
      false,
    );
    assert.equal(SOCIAL_PLANNER_PACKAGE_LIMITS.platformsMin, 1);
    assert.equal(SOCIAL_PLANNER_PACKAGE_LIMITS.platformsMax, 9);
  });

  it("keeps production-format diversity and does not overload assetType with Blog/Newsletter", () => {
    assert.ok(SOCIAL_PLANNER_ASSET_TYPES.includes("image"));
    assert.ok(SOCIAL_PLANNER_ASSET_TYPES.includes("carousel"));
    assert.ok(SOCIAL_PLANNER_ASSET_TYPES.includes("talking_head_video"));
    assert.ok(SOCIAL_PLANNER_ASSET_TYPES.includes("poll"));
    assert.equal(
      (SOCIAL_PLANNER_ASSET_TYPES as readonly string[]).includes("blog_post_idea"),
      false,
    );
    assert.equal(
      (SOCIAL_PLANNER_ASSET_TYPES as readonly string[]).includes("newsletter_idea"),
      false,
    );
  });

  it("Daily prompt no longer instructs 1-3 network rotation", () => {
    const context = buildGenerationContext();
    const strategy = buildValidStrategyRaw(context);
    const assetPrompt = buildSocialPlannerAssetPrompt({
      context,
      userGuidance: null,
      strategy: strategy as never,
    });
    const contract = buildSocialPlannerPackageOutputContract();
    const strategyPrompt = buildSocialPlannerStrategyPrompt({
      context,
      userGuidance: null,
    });
    const repairPrompt = buildSocialPlannerRepairPrompt({
      context,
      userGuidance: null,
      strategy: strategy as never,
      invalidPackage: {},
      failures: ["recommendedPlatforms too narrow"],
    });

    for (const prompt of [assetPrompt, contract, strategyPrompt, repairPrompt]) {
      assert.doesNotMatch(prompt, /Choose 1-3 native fits/);
      assert.doesNotMatch(prompt, /Do not recommend every platform for every asset/);
      assert.doesNotMatch(prompt, /recommendedPlatforms: 1-3 of/);
    }
    assert.match(assetPrompt, /one coherent content idea/);
    assert.match(assetPrompt, /one canonical socialCopy/);
    assert.match(assetPrompt, /skool_post/);
    assert.match(assetPrompt, /substack_note/);
    assert.match(assetPrompt, /Do not invent a 1-3 network rotation/);
    assert.match(assetPrompt, /preferredChannels/);
    assert.match(assetPrompt, /production-format diversity/);
    assert.match(contract, /skool_post, substack_note/);
  });

  it("validator accepts historical 1-3 platform packages and Daily community channels", () => {
    const context = buildGenerationContext();
    const historical = buildValidPackageRaw(context);
    const historicalValidated = validateAndNormalizeSocialCalendarPackage({
      raw: historical,
      context,
      userGuidance: null,
      metadata: testMetadata(),
    });
    assert.ok(
      historicalValidated.assets.every(
        (asset) =>
          asset.recommendedPlatforms.length >= 1 &&
          asset.recommendedPlatforms.length <= 3,
      ),
    );

    const broad = buildValidPackageRaw(
      context,
      context.calendarContext.period.dates.map(() => ({
        recommendedPlatforms: [...SOCIAL_PLANNER_DAILY_CHANNELS],
      })),
    );
    const broadValidated = validateAndNormalizeSocialCalendarPackage({
      raw: broad,
      context,
      userGuidance: null,
      metadata: testMetadata(),
    });
    assert.ok(
      broadValidated.assets.every(
        (asset) => asset.recommendedPlatforms.length === 9,
      ),
    );
    assert.ok(
      broadValidated.assets[0].recommendedPlatforms.includes("skool_post"),
    );
    assert.ok(
      broadValidated.assets[0].recommendedPlatforms.includes("substack_note"),
    );

    const evergreenLeak = buildValidPackageRaw(
      context,
      context.calendarContext.period.dates.map(() => ({
        recommendedPlatforms: ["instagram", "blog_post_idea"],
      })),
    );
    assert.throws(() =>
      validateAndNormalizeSocialCalendarPackage({
        raw: evergreenLeak,
        context,
        userGuidance: null,
        metadata: testMetadata(),
      }),
    );
  });

  it("keeps targeted Audience and anonymized Prospect contracts", () => {
    const prompts = read(
      "services/socialPlanner/generation/socialPlannerGenerationPrompts.ts",
    );
    assert.match(prompts, /preferredChannels/);
    assert.match(prompts, /PRIMARY TARGET AUDIENCE/);
    assert.match(prompts, /Prospects are pattern intelligence only/);
    assert.doesNotMatch(prompts, /prospectId/);
    assert.doesNotMatch(prompts, /generateDeploymentAssets/);

    const page = read("app/social-planner/page.tsx");
    assert.match(page, /personaId/);
    assert.doesNotMatch(page, /prospectId/);

    const form = read("components/socialPlanner/SocialPlannerCreateForm.tsx");
    assert.doesNotMatch(form, /prospectId/);

    const request = read("services/socialPlanner/socialCalendarRequest.ts");
    assert.doesNotMatch(request, /prospectId/);
  });

  it("does not introduce generateDeploymentAssets or fork Skool/Substack generation workflows", () => {
    const files = [
      "services/socialPlanner/generation/socialPlannerGenerationPrompts.ts",
      "services/socialPlanner/generation/socialPlannerGenerationService.ts",
      "services/socialPlanner/socialCalendarGenerationJobs/socialCalendarGenerationJobExecutor.ts",
      "services/socialPlanner/socialCalendarOrchestration.ts",
      "components/socialPlanner/SocialPlannerCreateForm.tsx",
    ];
    for (const file of files) {
      assert.doesNotMatch(read(file), /generateDeploymentAssets/);
      assert.doesNotMatch(read(file), /SKOOL_POST_GENERATION_RULES/);
      assert.doesNotMatch(read(file), /SUBSTACK_NOTE_GENERATION_RULES/);
    }
  });

  it("keeps six-language planner-kind key parity", () => {
    const required = [
      "socialPlanner.plannerKinds.dailySocial",
      "socialPlanner.plannerKinds.evergreen",
      "socialPlanner.plannerKindDailyHelp",
      "socialPlanner.plannerKindEvergreenHelp",
      "socialPlanner.plannerKindEvergreenSoon",
      "socialPlanner.planningWeekDaily",
      "socialPlanner.planningWeekEvergreen",
      "socialPlanner.stages.generationDaily",
      "socialPlanner.stages.generationEvergreen",
      "socialPlanner.evergreenFormats.blogPost",
      "socialPlanner.draft",
    ];
    const canonical = collectKeyPaths(en);
    for (const language of ORGANIZATION_LANGUAGES) {
      const paths = collectKeyPaths(DICTIONARIES[language]);
      for (const key of required) {
        assert.ok(canonical.includes(key), key);
        assert.ok(paths.includes(key), `${language}:${key}`);
      }
    }
    assert.notEqual(
      fr.socialPlanner.plannerKinds.dailySocial,
      en.socialPlanner.plannerKinds.dailySocial,
    );
  });

  it("does not touch isolated persona-import dirty paths", () => {
    const socialFiles = [
      "services/socialPlanner/socialCalendarPlannerKind.ts",
      "services/socialPlanner/socialPlannerDailyChannels.ts",
      "services/socialPlanner/generation/socialPlannerGenerationPrompts.ts",
      "components/socialPlanner/SocialPlannerCreateForm.tsx",
    ];
    for (const file of socialFiles) {
      const source = read(file);
      for (const isolated of PERSONA_IMPORT_PATHS) {
        assert.doesNotMatch(source, new RegExp(isolated.replace(/\./g, "\\.")));
        assert.doesNotMatch(source, /personaImportPresentation/);
      }
    }
  });
});
