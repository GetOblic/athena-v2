import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CopyButton } from "../../components/deployment/CopyButton";
import { SocialPlannerCopyableField } from "../../components/socialPlanner/SocialCalendarProductionSpec";
import { serializeSocialCalendarAsset } from "../../components/socialPlanner/socialPlannerAssetCopyText";
import {
  buildSocialCalendarCreateBody,
  mapSocialPlannerApiError,
  socialPlannerCreateBodyKeys,
} from "../../components/socialPlanner/socialPlannerClient";
import {
  addCalendarDays,
  formatSocialPlannerCreatedDate,
  formatSocialPlannerDayHeader,
  formatSocialPlannerPeriodLabel,
  formatWeekRangePreview,
} from "../../components/socialPlanner/socialPlannerDates";
import {
  socialPlannerAssetTypeLabel,
  socialPlannerGenerationModeLabel,
  socialPlannerHistoryStatusLabel,
  socialPlannerObjectiveLabel,
  socialPlannerPlatformLabel,
  socialPlannerStageLabel,
} from "../../components/socialPlanner/socialPlannerLabels";
import { interpolateTenantMessage } from "../../lib/tenantI18n/interpolate";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import { getAdsCopyChrome } from "../../lib/tenantI18n/adsPresentation";
import { getAssetCopyChrome } from "../../lib/tenantI18n/opportunityPresentation";
import { getSeoCopyChrome } from "../../lib/tenantI18n/seoPresentation";
import {
  getLocalizedSocialPlannerAssetTypeLabel,
  getLocalizedSocialPlannerGenerationModeLabel,
  getLocalizedSocialPlannerHistoryStatusLabel,
  getLocalizedSocialPlannerObjectiveLabel,
  getLocalizedSocialPlannerPlatformLabel,
  getLocalizedSocialPlannerStageLabel,
  getLocalizedSocialPlannerStatusLabel,
  getSocialPlannerCopyChrome,
  getSocialPlannerErrorChrome,
} from "../../lib/tenantI18n/socialPlannerPresentation";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import {
  ORGANIZATION_LANGUAGES,
  type OrganizationLanguage,
} from "../../services/organizationLanguage";
import { ASSET_USAGE_TAGS } from "../../services/assetInteractions/assetUsageTags";
import { SOCIAL_CALENDAR_STATUSES } from "../../services/socialPlanner/socialCalendarTypes";
import { SOCIAL_PLANNER_ASSET_TYPES } from "../../services/socialPlanner/generation/socialCalendarPackageTypes";
import { buildSocialCalendarHistorySearchCorpus } from "../../services/socialPlanner/socialCalendarHistorySearch";
import {
  buildGenerationContext,
  buildValidatedPackage,
} from "../socialPlanner/socialPlannerGenerationFixtures";

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

const DICTIONARIES: Record<OrganizationLanguage, TenantMessages> = {
  en,
  fr,
  es,
  it: itMessages,
  de,
  pt,
};

const STORED_GUIDANCE = "User-entered Social Planner guidance must remain verbatim.";
const STORED_SOCIAL_COPY = "Generated social copy must remain verbatim.";
const STORED_CONCEPT = "Generated concept must remain verbatim.";
const ARBITRARY_ERROR = "WORKER_SOCIAL_TIMEOUT: upstream model 503";
const WHOLE_ASSET_TRACKING = {
  sourceType: "social_calendar" as const,
  sourceId: "cal-l3-ready",
  executiveVersionId: null,
  assetType: "social_day_2026-08-24",
};

describe("V31 L3.9 tenant social planner — list chrome", () => {
  it("keeps English Social Planner chrome canonical", () => {
    assert.equal(en.socialPlanner.title, "Social Planner");
    assert.equal(en.socialPlanner.eyebrow, "Social Planner");
    assert.equal(
      en.socialPlanner.subtitle,
      "Plan your next seven social assets with one push.",
    );
    assert.equal(en.socialPlanner.generateMyWeek, "Generate My Week");
    assert.equal(en.socialPlanner.openCalendar, "Open Calendar");
    const page = read("app/social-planner/page.tsx");
    assert.match(page, /getTenantLocalization/);
    assert.match(page, /TenantBackLink/);
    assert.match(page, /copy\.title/);
    assert.equal((page.match(/getTenantLocalization\(\)/g) ?? []).length, 1);
  });

  it("localizes Social Planner list chrome in all five non-English languages", () => {
    for (const [language, dictionary] of Object.entries(DICTIONARIES) as Array<
      [OrganizationLanguage, TenantMessages]
    >) {
      if (language === "en") continue;
      assert.notEqual(
        dictionary.socialPlanner.subtitle,
        en.socialPlanner.subtitle,
      );
      assert.notEqual(
        dictionary.socialPlanner.generateMyWeek,
        en.socialPlanner.generateMyWeek,
      );
      assert.equal(dictionary.socialPlanner.title, "Social Planner");
    }
    assert.match(fr.socialPlanner.generateMyWeek, /semaine/i);
    assert.match(es.socialPlanner.openCalendar, /calendario/i);
    assert.match(itMessages.socialPlanner.historyTitle, /calendari/i);
    assert.match(de.socialPlanner.selectWeek, /Woche/i);
    assert.match(pt.socialPlanner.noSearchMatch, /calend/i);
  });

  it("keeps stored guidance and generated summaries verbatim", () => {
    const form = read("components/socialPlanner/SocialPlannerCreateForm.tsx");
    const history = read("components/socialPlanner/SocialPlannerHistory.tsx");
    const detail = read("components/socialPlanner/SocialCalendarDetail.tsx");
    assert.match(form, /userGuidance: guidance/);
    assert.match(history, /\{calendar\.strategySummary\}/);
    assert.match(history, /\{calendar\.whyThisWeekWorks\}/);
    assert.match(detail, /\{socialPackage\.strategySummary\}/);
    assert.match(detail, /\{socialPackage\.whyThisWeekWorks\}/);
    assert.doesNotMatch(form, /translateGuidance|localizeGuidance/);
    assert.doesNotMatch(fr.socialPlanner.guidancePlaceholder, new RegExp(STORED_GUIDANCE));
  });
});

describe("V31 L3.9 tenant social planner — generate chrome", () => {
  it("localizes generate chrome and keeps request bodies language-free", () => {
    const form = read("components/socialPlanner/SocialPlannerCreateForm.tsx");
    const client = read("components/socialPlanner/socialPlannerClient.ts");
    assert.match(form, /copy\.generateMyWeek/);
    assert.match(form, /buildSocialCalendarCreateBody/);
    const body = buildSocialCalendarCreateBody({
      periodStart: "2026-08-23",
      periodEnd: "2026-08-29",
      userGuidance: STORED_GUIDANCE,
    });
    assert.deepEqual(socialPlannerCreateBodyKeys(body), [
      "periodEnd",
      "periodStart",
      "userGuidance",
    ]);
    assert.equal(body.userGuidance, STORED_GUIDANCE);
    assert.equal("language" in body, false);
    assert.doesNotMatch(form, /language:/);
    assert.doesNotMatch(client, /language:/);
    assert.doesNotMatch(form, /navigator\.language/);
  });
});

describe("V31 L3.9 tenant social planner — detail chrome and content boundary", () => {
  it("localizes application chrome around verbatim generated Social Planner content", () => {
    const detail = read("components/socialPlanner/SocialCalendarDetail.tsx");
    const card = read("components/socialPlanner/SocialCalendarDayCard.tsx");
    assert.match(detail, /copy\.yourSocialWeek/);
    assert.match(detail, /copy\.whyThisWeekWorks/);
    assert.match(card, /\{asset\.concept\}/);
    assert.match(card, /\{asset\.audience\}/);
    assert.match(card, /\{asset\.hook\}/);
    assert.match(card, /previewSocialCopy\(asset\.socialCopy\)/);
    assert.match(card, /value=\{asset\.socialCopy\}/);
    assert.match(card, /value=\{asset\.cta\}/);
    assert.doesNotMatch(detail, /translateConcept|localizeSocialCopy/);
    assert.doesNotMatch(card, /translateHook|localizeCaption/);
  });

  it("keeps historical version content and lineage identifiers unchanged", () => {
    const history = read("components/socialPlanner/SocialPlannerHistory.tsx");
    const types = read("services/socialPlanner/socialCalendarTypes.ts");
    assert.match(history, /calendar\.versionNumber/);
    assert.match(history, /formatSocialPlannerVersionLabel/);
    assert.match(types, /package_json/);
    assert.match(types, /source_calendar_id/);
    assert.match(types, /root_calendar_id/);
    assert.match(types, /version_number/);
    assert.doesNotMatch(history, /translatePackage|localizeVersionContent/);
    assert.doesNotMatch(read("app/social-planner/[id]/page.tsx"), /version navigator/i);
  });
});

describe("V31 L3.9 tenant social planner — status and tokens", () => {
  it("keeps English status labels canonical and localizes presentation only", () => {
    assert.deepEqual([...SOCIAL_CALENDAR_STATUSES], [
      "Queued",
      "Processing",
      "Ready",
      "Processing Failed",
    ]);
    assert.equal(en.socialPlanner.status.ready, "Ready");
    assert.equal(getLocalizedSocialPlannerStatusLabel(en, "Queued"), "Queued");
    assert.equal(
      getLocalizedSocialPlannerStatusLabel(fr, "Queued"),
      fr.socialPlanner.status.queued,
    );
    assert.equal(
      getLocalizedSocialPlannerStatusLabel(es, "Ready"),
      es.socialPlanner.status.ready,
    );
    assert.equal(
      getLocalizedSocialPlannerStatusLabel(itMessages, "Processing Failed"),
      itMessages.socialPlanner.status.processingFailed,
    );
    assert.equal(
      getLocalizedSocialPlannerHistoryStatusLabel(de, "Processing"),
      de.socialPlanner.status.generating,
    );
    assert.equal(
      getLocalizedSocialPlannerStatusLabel(fr, "Custom Token"),
      "Custom Token",
    );
    assert.equal(socialPlannerHistoryStatusLabel("Ready"), "Ready");
    assert.equal(socialPlannerHistoryStatusLabel("Queued"), "Generating");
  });

  it("maps structured stages without parsing English worker labels", () => {
    assert.equal(
      getLocalizedSocialPlannerStageLabel(en, "queued"),
      "Preparing your calendar",
    );
    assert.equal(
      getLocalizedSocialPlannerStageLabel(fr, "queued"),
      fr.socialPlanner.stages.queued,
    );
    assert.equal(getLocalizedSocialPlannerStageLabel(fr, "unknown_stage"), null);
    assert.equal(socialPlannerStageLabel("unknown_stage"), null);
    const status = read("components/socialPlanner/SocialPlannerStatus.tsx");
    assert.match(status, /getLocalizedSocialPlannerStageLabel/);
    assert.doesNotMatch(status, /stageLabel\.includes\(|parseStage/);
  });

  it("localizes asset-type and objective presentation without changing tokens", () => {
    assert.ok(SOCIAL_PLANNER_ASSET_TYPES.includes("talking_head_video"));
    assert.equal(
      socialPlannerAssetTypeLabel("talking_head_video"),
      "Talking Head Video",
    );
    assert.equal(
      getLocalizedSocialPlannerAssetTypeLabel(en, "talking_head_video"),
      "Talking Head Video",
    );
    assert.equal(
      getLocalizedSocialPlannerAssetTypeLabel(fr, "talking_head_video"),
      fr.socialPlanner.assetTypes.talkingHeadVideo,
    );
    assert.notEqual(
      fr.socialPlanner.assetTypes.talkingHeadVideo,
      en.socialPlanner.assetTypes.talkingHeadVideo,
    );
    assert.equal(
      getLocalizedSocialPlannerObjectiveLabel(es, "build_authority"),
      es.socialPlanner.objectives.buildAuthority,
    );
    assert.equal(
      socialPlannerObjectiveLabel("build_authority"),
      "Build Authority",
    );
    assert.equal(
      getLocalizedSocialPlannerAssetTypeLabel(fr, "unknown_custom_type"),
      socialPlannerAssetTypeLabel("unknown_custom_type"),
    );
  });

  it("keeps platform names and Think Differently unchanged", () => {
    assert.equal(socialPlannerPlatformLabel("instagram"), "Instagram");
    assert.equal(getLocalizedSocialPlannerPlatformLabel("instagram"), "Instagram");
    assert.equal(getLocalizedSocialPlannerPlatformLabel("x"), "X");
    assert.equal(getLocalizedSocialPlannerPlatformLabel("youtube_shorts"), "YouTube Shorts");
    assert.equal(
      socialPlannerGenerationModeLabel("think_differently"),
      "Think Differently",
    );
    for (const dictionary of Object.values(DICTIONARIES)) {
      assert.equal(
        dictionary.socialPlanner.thinkDifferently,
        "Think Differently",
      );
      assert.equal(
        dictionary.socialPlanner.generationModes.thinkDifferently,
        "Think Differently",
      );
    }
    assert.equal(
      getLocalizedSocialPlannerGenerationModeLabel(fr, "think_differently"),
      "Think Differently",
    );
  });
});

describe("V31 L3.9 tenant social planner — calendar dates", () => {
  it("keeps English date helpers exact and localizes presentation by locale argument", () => {
    assert.equal(
      formatWeekRangePreview("2026-08-23", "2026-08-29"),
      "Sun Aug 23 → Sat Aug 29",
    );
    assert.equal(
      formatSocialPlannerPeriodLabel("2026-08-23", "2026-08-29"),
      "August 23–29, 2026",
    );
    assert.equal(
      formatSocialPlannerDayHeader("Monday", "2026-08-24"),
      "MONDAY · AUG 24",
    );
    assert.notEqual(
      formatWeekRangePreview("2026-08-23", "2026-08-29", "fr-FR"),
      formatWeekRangePreview("2026-08-23", "2026-08-29"),
    );
    assert.notEqual(
      formatSocialPlannerPeriodLabel("2026-08-23", "2026-08-29", "fr-FR"),
      formatSocialPlannerPeriodLabel("2026-08-23", "2026-08-29"),
    );
    assert.match(
      formatSocialPlannerCreatedDate("2026-08-20T15:04:00.000Z", "fr-FR"),
      /2026/,
    );
  });

  it("preserves date-only no-UTC-rollover and stored YYYY-MM-DD values", () => {
    assert.equal(addCalendarDays("2026-08-23", 6), "2026-08-29");
    assert.equal(addCalendarDays("2026-02-26", 6), "2026-03-04");
    const french = formatSocialPlannerDayHeader("", "2026-08-24", "fr-FR");
    assert.match(french, /24/);
    assert.doesNotMatch(french, /23/);
    const form = read("components/socialPlanner/SocialPlannerCreateForm.tsx");
    assert.match(form, /type="date"/);
    assert.match(form, /periodStart: start/);
    assert.doesNotMatch(form, /timezone|timeZone/);
  });
});

describe("V31 L3.9 tenant social planner — copy, interactions, generation", () => {
  it("localizes copy chrome while keeping serialized clipboard text English and exact", () => {
    const asset = buildValidatedPackage(buildGenerationContext()).assets[0];
    const text = serializeSocialCalendarAsset(asset);
    assert.match(text, /Social Copy/);
    assert.match(text, /Asset Type:/);
    assert.equal(text.includes(asset.socialCopy), true);
    assert.match(text, new RegExp(asset.concept.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const english = renderToStaticMarkup(
      createElement(CopyButton, {
        text: STORED_SOCIAL_COPY,
        tracking: null,
        showContinue: false,
      }),
    );
    assert.match(english, />Copy</);
    const french = renderToStaticMarkup(
      createElement(CopyButton, {
        text: STORED_SOCIAL_COPY,
        tracking: null,
        showContinue: false,
        chrome: getSocialPlannerCopyChrome(fr),
      }),
    );
    assert.match(french, />Copier</);
    assert.doesNotMatch(french, />Copy</);
    const serializer = read("components/socialPlanner/socialPlannerAssetCopyText.ts");
    assert.doesNotMatch(serializer, /tenantI18n/);
    const card = read("components/socialPlanner/SocialCalendarDayCard.tsx");
    assert.match(card, /chrome=\{copyChrome\}/);
    assert.match(card, /serializeSocialCalendarAsset\(asset\)/);
    assert.match(card, /showContinue/);
  });

  it("keeps interaction source_type and source_id identity unchanged", () => {
    const detail = read("components/socialPlanner/SocialCalendarDetail.tsx");
    assert.match(detail, /sourceType: "social_calendar"/);
    assert.match(detail, /sourceId: calendar\.id/);
    assert.match(detail, /buildSocialCalendarAssetInteractionType/);
    assert.match(detail, /\/api\/asset-interactions/);
    assert.doesNotMatch(detail, /sourceType: copy|sourceId: messages/);
  });

  it("does not add language to generation requests, prompts, or workers", () => {
    const body = buildSocialCalendarCreateBody({
      periodStart: "2026-08-23",
      periodEnd: "2026-08-29",
      userGuidance: STORED_GUIDANCE,
    });
    assert.equal("language" in body, false);
    const hits: string[] = [];
    for (const dir of [
      "workers",
      "services/socialPlanner/generation",
      "services/socialPlanner/thinkDifferently",
      "services/socialPlanner/conversationRevision",
    ]) {
      for (const file of listTsFiles(dir)) {
        if (/tenantI18n|lib\/tenantI18n/.test(read(file))) {
          hits.push(file);
        }
      }
    }
    assert.deepEqual(hits, []);
  });
});

describe("V31 L3.9 tenant social planner — errors and search", () => {
  it("preserves arbitrary server errors and localizes only fallbacks", () => {
    assert.equal(
      mapSocialPlannerApiError(400, { message: ARBITRARY_ERROR }, ""),
      ARBITRARY_ERROR,
    );
    assert.equal(
      mapSocialPlannerApiError(404, null, ""),
      "This calendar could not be found.",
    );
    assert.equal(
      mapSocialPlannerApiError(404, null, "", getSocialPlannerErrorChrome(fr)),
      fr.socialPlanner.notFound,
    );
    assert.equal(
      mapSocialPlannerApiError(500, { code: "DETAIL_FAILED" }, ""),
      "Something went wrong. Please try again.",
    );
    const detail = read("components/socialPlanner/SocialCalendarDetail.tsx");
    assert.match(detail, /calendar\.error\?\.message \|\| copy\.generationFailedTryAgain/);
    assert.doesNotMatch(detail, /translateError|localizeErrorMessage/);
    assert.doesNotMatch(fr.socialPlanner.failedToStart, new RegExp(ARBITRARY_ERROR));
  });

  it("keeps search corpus English and does not translate filter values", () => {
    const workspace = read("components/socialPlanner/SocialPlannerWorkspace.tsx");
    const client = read("components/socialPlanner/socialPlannerClient.ts");
    assert.match(workspace, /search: nextSearch/);
    assert.match(client, /params\.set\("search"/);
    const corpus = buildSocialCalendarHistorySearchCorpus({
      id: "cal-1",
      periodStart: "2026-08-23",
      periodEnd: "2026-08-29",
      status: "Ready",
      generationMode: "standard",
      generationStage: "completed",
      versionNumber: 1,
      sourceCalendarId: null,
      rootCalendarId: null,
      strategySummary: STORED_CONCEPT,
      whyThisWeekWorks: STORED_SOCIAL_COPY,
      assetCount: 7,
      assetTypes: ["carousel"],
      families: ["multi_frame"],
      modelsUsed: null,
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
      error: null,
    });
    assert.match(corpus, /August 23/);
    assert.match(corpus, /Carousel/);
    assert.match(corpus, new RegExp(STORED_CONCEPT));
    assert.doesNotMatch(corpus, /Août|août/);
    const search = read("services/socialPlanner/socialCalendarHistorySearch.ts");
    assert.doesNotMatch(search, /tenantI18n/);
  });
});

describe("V31 L3.9 tenant social planner — durable tag presentation", () => {
  it("reaches whole-asset tag controls and localizes French labels", () => {
    const card = read("components/socialPlanner/SocialCalendarDayCard.tsx");
    const detail = read("components/socialPlanner/SocialCalendarDetail.tsx");
    assert.match(card, /tracking=\{tracking\}/);
    assert.match(card, /chrome=\{copyChrome\}/);
    assert.match(card, /getSocialPlannerCopyChrome/);
    assert.match(detail, /sourceType: "social_calendar"/);
    assert.match(detail, /sourceId: calendar\.id/);

    const english = renderToStaticMarkup(
      createElement(CopyButton, {
        text: STORED_SOCIAL_COPY,
        tracking: WHOLE_ASSET_TRACKING,
        initiallyDone: true,
      }),
    );
    assert.match(english, />Done</);
    assert.match(english, />Selected</);
    assert.match(english, />Scheduled</);
    assert.match(english, />Sent</);
    assert.match(english, />Published</);
    assert.match(english, />Used</);

    const french = renderToStaticMarkup(
      createElement(CopyButton, {
        text: STORED_SOCIAL_COPY,
        tracking: WHOLE_ASSET_TRACKING,
        initiallyDone: true,
        chrome: getSocialPlannerCopyChrome(fr),
      }),
    );
    assert.match(french, />Terminé</);
    assert.match(french, />Sélectionné</);
    assert.match(french, />Planifié</);
    assert.match(french, />Envoyé</);
    assert.match(french, />Publié</);
    assert.match(french, />Utilisé</);
    assert.doesNotMatch(french, />Done</);
    assert.doesNotMatch(french, />Selected</);
    assert.doesNotMatch(french, />Scheduled</);
    assert.doesNotMatch(french, />Sent</);
    assert.doesNotMatch(french, />Published</);
    assert.doesNotMatch(french, />Used</);
  });

  it("keeps canonical usageTag tokens and does not submit localized labels", () => {
    const chrome = getSocialPlannerCopyChrome(fr);
    assert.deepEqual(ASSET_USAGE_TAGS, [
      "selected",
      "scheduled",
      "sent",
      "published",
      "used",
    ]);
    assert.deepEqual(Object.keys(chrome.usageTagLabels ?? {}), [
      "selected",
      "scheduled",
      "sent",
      "published",
      "used",
    ]);
    assert.equal(chrome.usageTagLabels?.selected, fr.copyChrome.usageTags.selected);
    assert.notEqual(chrome.usageTagLabels?.selected, "selected");

    const controls = read("components/deployment/AssetUsageTagControls.tsx");
    assert.match(controls, /usageTag: tag,/);
    assert.match(controls, /ASSET_USAGE_TAGS\.map/);
    assert.match(controls, /Could not save tag/);
    assert.doesNotMatch(controls, /usageTag: labels/);
    assert.doesNotMatch(controls, /usageTag: ASSET_USAGE_TAG_LABELS/);
    assert.doesNotMatch(controls, /tenantI18n|copyChrome/);
    assert.doesNotMatch(controls, /payload\.error|payload\.message|Error\.message/);

    const copy = read("components/deployment/CopyButton.tsx");
    assert.match(copy, /labels=\{labels\.usageTagLabels\}/);
    assert.match(copy, /saveFailed=\{labels\.saveTagFailed\}/);
    assert.doesNotMatch(copy, /tenantI18n|getTenantLocalization|navigator\.language/);
    assert.match(
      copy,
      /sourceType: "discussion" \| "prospect" \| "social_calendar"/,
    );
  });

  it("keeps es/it/de/pt usage-tag keys structurally aligned", () => {
    const canonical = collectKeyPaths(en.copyChrome);
    assert.ok(canonical.includes("saveTagFailed"));
    assert.ok(canonical.includes("usageTags.selected"));
    assert.ok(canonical.includes("usageTags.scheduled"));
    assert.ok(canonical.includes("usageTags.sent"));
    assert.ok(canonical.includes("usageTags.published"));
    assert.ok(canonical.includes("usageTags.used"));
    for (const dictionary of [es, itMessages, de, pt]) {
      assert.deepEqual(collectKeyPaths(dictionary.copyChrome), canonical);
      assert.ok(dictionary.copyChrome.saveTagFailed.trim());
      assert.notEqual(dictionary.copyChrome.saveTagFailed, en.copyChrome.saveTagFailed);
      for (const tag of ASSET_USAGE_TAGS) {
        assert.ok(dictionary.copyChrome.usageTags[tag].trim());
        assert.notEqual(
          dictionary.copyChrome.usageTags[tag],
          en.copyChrome.usageTags[tag],
        );
      }
    }
    assert.equal(fr.copyChrome.usageTags.selected, "Sélectionné");
    assert.equal(fr.copyChrome.saveTagFailed, "Impossible d’enregistrer l’étiquette.");
  });

  it("keeps field Copy clipboard-only with no tag controls or interaction write", () => {
    const spec = read(
      "components/socialPlanner/SocialCalendarProductionSpec.tsx",
    );
    const fieldCopies = spec.match(/<CopyButton[\s\S]*?\/>/g) ?? [];
    assert.ok(fieldCopies.length >= 2);
    for (const block of fieldCopies) {
      assert.match(block, /tracking=\{null\}/);
      assert.match(block, /showContinue=\{false\}/);
    }
    assert.doesNotMatch(spec, /initiallyDone|initiallyTags/);
    assert.doesNotMatch(spec, /AssetUsageTagControls/);

    const field = renderToStaticMarkup(
      createElement(SocialPlannerCopyableField, {
        label: "Social Copy",
        value: STORED_SOCIAL_COPY,
        chrome: getSocialPlannerCopyChrome(fr),
      }),
    );
    assert.match(field, />Copier</);
    assert.match(field, new RegExp(STORED_SOCIAL_COPY));
    assert.doesNotMatch(field, />Sélectionné</);
    assert.doesNotMatch(field, />Selected</);
    assert.doesNotMatch(field, />Terminé</);
    assert.doesNotMatch(field, />Done</);
    assert.doesNotMatch(field, />Continuer</);
  });

  it("shares usage-tag labels through getAssetCopyChrome while keeping English defaults when omitted", () => {
    const shared = renderToStaticMarkup(
      createElement(CopyButton, {
        text: STORED_SOCIAL_COPY,
        tracking: WHOLE_ASSET_TRACKING,
        initiallyDone: true,
        chrome: getAssetCopyChrome(fr),
      }),
    );
    assert.match(shared, />Terminé</);
    assert.match(shared, />Sélectionné</);
    assert.match(shared, />Planifié</);
    assert.doesNotMatch(shared, />Selected</);

    const omitted = renderToStaticMarkup(
      createElement(CopyButton, {
        text: STORED_SOCIAL_COPY,
        tracking: WHOLE_ASSET_TRACKING,
        initiallyDone: true,
      }),
    );
    assert.match(omitted, />Selected</);
    assert.match(omitted, />Scheduled</);

    assert.equal(
      getAssetCopyChrome(fr).usageTagLabels?.selected,
      fr.copyChrome.usageTags.selected,
    );
    assert.equal(getAssetCopyChrome(fr).saveTagFailed, fr.copyChrome.saveTagFailed);
    assert.equal(
      getAdsCopyChrome(es).usageTagLabels?.selected,
      es.copyChrome.usageTags.selected,
    );
    assert.equal(
      getSeoCopyChrome(de).usageTagLabels?.selected,
      de.copyChrome.usageTags.selected,
    );
    assert.equal(
      getSocialPlannerCopyChrome(fr).saveTagFailed,
      fr.copyChrome.saveTagFailed,
    );
  });

  it("does not change clipboard payload, serializer isolation, or generation language", () => {
    const asset = buildValidatedPackage(buildGenerationContext()).assets[0];
    const text = serializeSocialCalendarAsset(asset);
    assert.equal(text.includes(asset.socialCopy), true);
    assert.equal(text.includes(asset.concept), true);
    const serializer = read(
      "components/socialPlanner/socialPlannerAssetCopyText.ts",
    );
    assert.doesNotMatch(serializer, /tenantI18n/);
    const body = buildSocialCalendarCreateBody({
      periodStart: "2026-08-23",
      periodEnd: "2026-08-29",
      userGuidance: STORED_GUIDANCE,
    });
    assert.equal("language" in body, false);
  });
});

describe("V31 L3.9 tenant social planner — boundaries", () => {
  it("does not change Ads, SEO, Opportunity, Briefing, Persona, Prospect, or Discussion chrome", () => {
    for (const file of [
      "app/ads/page.tsx",
      "app/seo/page.tsx",
      "app/opportunities/page.tsx",
      "app/briefings/page.tsx",
      "app/personas/page.tsx",
      "app/prospects/page.tsx",
      "app/discussions/page.tsx",
    ]) {
      assert.doesNotMatch(read(file), /messages\.socialPlanner/);
    }
  });

  it("does not add Client resolvers, providers, or browser locale authority", () => {
    assert.equal(
      existsSync(
        join(ROOT, "components/tenantI18n/TenantLocalizationProvider.tsx"),
      ),
      false,
    );
    for (const file of [
      "components/socialPlanner/SocialPlannerWorkspace.tsx",
      "components/socialPlanner/SocialPlannerDetailWorkspace.tsx",
      "components/socialPlanner/SocialCalendarDetail.tsx",
    ]) {
      const source = read(file);
      assert.doesNotMatch(source, /getTenantLocalization/);
      assert.doesNotMatch(source, /resolveOrganizationLanguage/);
      assert.doesNotMatch(source, /navigator\.language/);
      assert.doesNotMatch(source, /document\.cookie/);
    }
  });

  it("leaves Licensee, Super Admin, and login unchanged", () => {
    for (const file of [
      "app/login/page.tsx",
      "app/licensee/page.tsx",
      "app/super/page.tsx",
    ]) {
      assert.doesNotMatch(read(file), /messages\.socialPlanner/);
      assert.doesNotMatch(read(file), /getTenantLocalization/);
    }
  });

  it("keeps all six dictionaries structurally complete after L3.9 expansion", () => {
    const canonical = collectKeyPaths(en);
    assert.ok(canonical.includes("socialPlanner.generateMyWeek"));
    assert.ok(canonical.includes("socialPlanner.status.processingFailed"));
    assert.ok(canonical.includes("socialPlanner.assetTypes.talkingHeadVideo"));
    assert.ok(canonical.includes("socialPlanner.stages.queued"));
    for (const language of ORGANIZATION_LANGUAGES) {
      const paths = collectKeyPaths(DICTIONARIES[language]);
      assert.deepEqual(
        canonical.filter((path) => !paths.includes(path)),
        [],
        `${language} missing keys`,
      );
      assert.deepEqual(
        paths.filter((path) => !canonical.includes(path)),
        [],
        `${language} extra keys`,
      );
    }
  });

  it("preserves locked product terms", () => {
    for (const dictionary of Object.values(DICTIONARIES)) {
      assert.equal(dictionary.socialPlanner.title, "Social Planner");
      assert.equal(dictionary.socialPlanner.eyebrow, "Social Planner");
      assert.equal(dictionary.socialPlanner.thinkDifferently, "Think Differently");
      assert.match(dictionary.socialPlanner.askAthenaTitle, /Ask Athena/);
      assert.match(dictionary.socialPlanner.selectWeekHelp, /Athena/);
    }
  });

  it("does not regress L3.5 / L3.6 / L3.7 / L3.8 delivery or shared-component isolation", () => {
    assert.match(read("app/discussions/[id]/page.tsx"), /messages\.discussions\.executive/);
    assert.match(read("app/personas/page.tsx"), /messages\.personas/);
    assert.match(read("app/prospects/page.tsx"), /messages\.prospects/);
    assert.match(read("app/opportunities/page.tsx"), /messages\.opportunities/);
    assert.match(read("app/briefings/page.tsx"), /messages\.briefings/);
    assert.match(read("app/ads/page.tsx"), /messages\.ads/);
    assert.match(read("app/seo/page.tsx"), /messages\.seo/);
    for (const file of [
      "components/deployment/CopyButton.tsx",
      "components/deployment/AssetUsageTagControls.tsx",
      "components/deployment/ContinueButton.tsx",
      "components/ui/ConfirmDeleteControl.tsx",
      "components/ui/AthenaCollapsibleSection.tsx",
    ]) {
      assert.doesNotMatch(read(file), /tenantI18n|getTenantLocalization/);
    }
  });
});

describe("V31 L3.9 tenant social planner — interpolation", () => {
  it("keeps interpolated stored values verbatim inside localized templates", () => {
    const named = interpolateTenantMessage(fr.socialPlanner.calendarOpportunity, {
      label: STORED_CONCEPT,
    });
    assert.match(named, new RegExp(STORED_CONCEPT));
    assert.match(named, /Opportunité/);
  });
});
