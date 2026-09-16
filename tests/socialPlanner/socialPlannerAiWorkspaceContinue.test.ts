/**
 * AI-2 — Social Planner Continue respects organization AI Workspace preferences.
 * Preference threading only. Global Continue contract is unchanged.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  serializeSocialCalendarAsset,
  serializeSocialCalendarEvergreenDay,
} from "../../components/socialPlanner/socialPlannerAssetCopyText";
import {
  CONTINUE_BLANK_OPEN_FEATURES,
  continueInExternalWorkspace,
} from "../../services/assetContinuation/continueInExternalWorkspace";
import {
  normalizeAiWorkspacePreferences,
  resolveAssetContinuationDestination,
  type AiWorkspaceId,
  type AiWorkspacePreferences,
} from "../../services/assetContinuation/destinationRegistry";
import type { SocialCalendarEvergreenDayV1 } from "../../services/socialPlanner/generation/socialCalendarEvergreenPackageTypes";
import {
  buildGenerationContext,
  buildValidatedPackage,
} from "./socialPlannerGenerationFixtures";

const ROOT = join(process.cwd());

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function prefs(
  preferredAiWorkspace: AiWorkspaceId,
): AiWorkspacePreferences {
  return normalizeAiWorkspacePreferences({
    preferredAiWorkspace,
    preferredImageGenerator: "chatgpt",
  });
}

const WORKSPACE_CASES: Array<{
  id: AiWorkspaceId;
  label: string;
  url: string;
}> = [
  { id: "chatgpt", label: "ChatGPT", url: "https://chatgpt.com/" },
  { id: "gemini", label: "Gemini", url: "https://gemini.google.com/app" },
  { id: "claude", label: "Claude", url: "https://claude.ai/new" },
  { id: "mistral", label: "Mistral", url: "https://chat.mistral.ai/" },
  { id: "grok", label: "Grok", url: "https://grok.com/" },
  { id: "perplexity", label: "Perplexity", url: "https://www.perplexity.ai/" },
];

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

type FakeWindow = {
  closed: boolean;
  opener: Window | null;
  location: { href: string; replace: (url: string) => void };
  close: () => void;
};

function createFakeWindow(): FakeWindow {
  const fake: FakeWindow = {
    closed: false,
    opener: {} as Window,
    location: {
      href: "about:blank",
      replace(url: string) {
        fake.location.href = url;
      },
    },
    close() {
      fake.closed = true;
    },
  };
  return fake;
}

describe("Social Planner AI-2 — server preference resolution", () => {
  it("loads organization AI Workspace preferences on the calendar detail server page", () => {
    const page = read("app/social-planner/[id]/page.tsx");
    assert.match(page, /getOrganizationAiWorkspacePreferences/);
    assert.match(
      page,
      /from "@\/services\/identity\/aiWorkspacePreferences"/,
    );
    assert.match(page, /continuationPreferences/);
    assert.match(
      page,
      /getOrganizationAiWorkspacePreferences\(organizationId\)/,
    );
    assert.match(
      page,
      /continuationPreferences=\{continuationPreferences\}/,
    );
    assert.doesNotMatch(page, /next\/headers/);
    assert.doesNotMatch(page, /supabaseAdmin/);
  });

  it("does not import the server preference service into client Social Planner UI", () => {
    const clientFiles = [
      "components/socialPlanner/SocialPlannerDetailWorkspace.tsx",
      "components/socialPlanner/SocialCalendarDetail.tsx",
      "components/socialPlanner/SocialCalendarDayCard.tsx",
      "components/socialPlanner/SocialCalendarEvergreenDayCard.tsx",
      "components/socialPlanner/SocialPlannerWorkspace.tsx",
      "components/socialPlanner/SocialPlannerHistory.tsx",
      "components/socialPlanner/SocialPlannerHistoryCta.tsx",
      "components/socialPlanner/SocialPlannerHistoryPageWorkspace.tsx",
      "components/socialPlanner/SocialPlannerHistoryRoutePage.tsx",
    ];
    for (const file of clientFiles) {
      const source = read(file);
      assert.doesNotMatch(source, /aiWorkspacePreferences/);
      assert.doesNotMatch(source, /getOrganizationAiWorkspacePreferences/);
      assert.doesNotMatch(source, /next\/headers/);
      assert.doesNotMatch(source, /supabaseAdmin/);
    }
  });
});

describe("Social Planner AI-2 — Daily and Evergreen Continue wiring", () => {
  it("threads continuationPreferences from detail workspace to Daily Continue", () => {
    const workspace = read(
      "components/socialPlanner/SocialPlannerDetailWorkspace.tsx",
    );
    const detail = read("components/socialPlanner/SocialCalendarDetail.tsx");
    const card = read("components/socialPlanner/SocialCalendarDayCard.tsx");
    const copy = read("components/deployment/CopyButton.tsx");

    assert.match(workspace, /continuationPreferences\?: AiWorkspacePreferences/);
    assert.match(
      workspace,
      /continuationPreferences=\{continuationPreferences\}/,
    );
    assert.match(detail, /continuationPreferences=\{continuationPreferences\}/);
    assert.match(card, /continuationPreferences=\{continuationPreferences\}/);
    assert.match(card, /<CopyButton/);
    assert.match(card, /showContinue/);
    assert.match(card, /text=\{assetCopyText\}/);
    assert.match(card, /serializeSocialCalendarAsset\(asset\)/);
    assert.match(copy, /preferences=\{continuationPreferences\}/);
  });

  it("threads continuationPreferences from detail workspace to Evergreen Continue", () => {
    const detail = read("components/socialPlanner/SocialCalendarDetail.tsx");
    const card = read(
      "components/socialPlanner/SocialCalendarEvergreenDayCard.tsx",
    );

    assert.match(detail, /SocialCalendarEvergreenDayCard/);
    assert.match(card, /continuationPreferences=\{continuationPreferences\}/);
    assert.match(card, /<CopyButton/);
    assert.match(card, /showContinue/);
    assert.match(card, /text=\{copyText\}/);
    assert.match(card, /serializeSocialCalendarEvergreenDay\(day\)/);
  });

  it("keeps Daily Continue payload as serializeSocialCalendarAsset", () => {
    const card = read("components/socialPlanner/SocialCalendarDayCard.tsx");
    const serializer = read(
      "components/socialPlanner/socialPlannerAssetCopyText.ts",
    );
    const asset = buildValidatedPackage(buildGenerationContext()).assets[0];
    const text = serializeSocialCalendarAsset(asset);

    assert.match(
      card,
      /const assetCopyText = composeSocialPlannerDayCopyWithBrandDirection/,
    );
    assert.match(card, /serializeSocialCalendarAsset\(asset\)/);
    assert.match(card, /text=\{assetCopyText\}/);
    assert.match(serializer, /export function serializeSocialCalendarAsset/);
    assert.match(text, /Social Copy/);
    assert.equal(text.includes(asset.socialCopy), true);
    assert.match(text, /Production Specification/);
  });

  it("keeps Evergreen Continue payload as serializeSocialCalendarEvergreenDay", () => {
    const card = read(
      "components/socialPlanner/SocialCalendarEvergreenDayCard.tsx",
    );
    const serializer = read(
      "components/socialPlanner/socialPlannerAssetCopyText.ts",
    );
    const text = serializeSocialCalendarEvergreenDay(EVERGREEN_DAY);

    assert.match(
      card,
      /const copyText = composeSocialPlannerDayCopyWithBrandDirection/,
    );
    assert.match(card, /serializeSocialCalendarEvergreenDay\(day\)/);
    assert.match(card, /text=\{copyText\}/);
    assert.match(serializer, /export function serializeSocialCalendarEvergreenDay/);
    assert.match(text, /Title: Why families wait/);
    assert.match(text, /Draft/);
    assert.match(text, /Publishing guidance: Publish as a blog post/);
    assert.doesNotMatch(text, /Social Copy/);
  });
});

describe("Social Planner AI-2 — preferred workspace resolution", () => {
  it("Daily Continue resolves every organization AI Workspace preference", () => {
    for (const workspace of WORKSPACE_CASES) {
      const resolved = resolveAssetContinuationDestination({
        assetType: "carousel",
        preferences: prefs(workspace.id),
      });
      assert.equal(resolved.kind, "ai_workspace");
      assert.equal(resolved.label, workspace.label);
      assert.equal(resolved.url, workspace.url);
    }
  });

  it("Evergreen Continue resolves every organization AI Workspace preference", () => {
    for (const workspace of WORKSPACE_CASES) {
      const resolved = resolveAssetContinuationDestination({
        assetType: "blog_post_idea",
        preferences: prefs(workspace.id),
      });
      assert.equal(resolved.kind, "ai_workspace");
      assert.equal(resolved.label, workspace.label);
      assert.equal(resolved.url, workspace.url);
    }
  });

  it("missing or invalid preferences still resolve ChatGPT", () => {
    for (const preferences of [null, undefined, {}, { preferredAiWorkspace: "unknown" }]) {
      const daily = resolveAssetContinuationDestination({
        assetType: "carousel",
        preferences: preferences as AiWorkspacePreferences | null | undefined,
      });
      const evergreen = resolveAssetContinuationDestination({
        assetType: "blog_post_idea",
        preferences: preferences as AiWorkspacePreferences | null | undefined,
      });
      assert.equal(daily.label, "ChatGPT");
      assert.equal(daily.url, "https://chatgpt.com/");
      assert.equal(evergreen.label, "ChatGPT");
      assert.equal(evergreen.url, "https://chatgpt.com/");
    }
    assert.deepEqual(normalizeAiWorkspacePreferences(null), {
      preferredAiWorkspace: "chatgpt",
      preferredImageGenerator: "chatgpt",
    });
  });
});

describe("Social Planner AI-2 — frozen global Continue contract", () => {
  it("copies the Social Planner payload before navigating and does not encode it into the URL", async () => {
    const asset = buildValidatedPackage(buildGenerationContext()).assets[0];
    const dailyText = serializeSocialCalendarAsset(asset);
    const evergreenText = serializeSocialCalendarEvergreenDay(EVERGREEN_DAY);
    const copied: string[] = [];
    const fake = createFakeWindow();

    const daily = await continueInExternalWorkspace({
      text: dailyText,
      assetType: asset.assetType,
      preferences: prefs("claude"),
      openWindow: () => fake as unknown as Window,
      writeClipboard: async (value) => {
        copied.push(value);
      },
    });

    assert.deepEqual(copied, [dailyText]);
    assert.equal(daily.copied, true);
    assert.equal(daily.opened, true);
    assert.equal(daily.navigatedUrl, "https://claude.ai/new");
    assert.doesNotMatch(daily.navigatedUrl ?? "", /Social Copy|carousel|encodeURIComponent/i);
    assert.equal(fake.location.href.includes(asset.socialCopy), false);

    const evergreenFake = createFakeWindow();
    const evergreen = await continueInExternalWorkspace({
      text: evergreenText,
      assetType: EVERGREEN_DAY.evergreenFormat,
      preferences: prefs("gemini"),
      openWindow: () => evergreenFake as unknown as Window,
      writeClipboard: async (value) => {
        copied.push(value);
      },
    });

    assert.deepEqual(copied, [dailyText, evergreenText]);
    assert.equal(evergreen.navigatedUrl, "https://gemini.google.com/app");
    assert.doesNotMatch(
      evergreen.navigatedUrl ?? "",
      /Why families wait|delay pattern/,
    );
  });

  it("opens about:blank synchronously before clipboard for Social Planner Continue", async () => {
    const openCalls: Array<{ url?: string | URL; clipboardStarted: boolean }> =
      [];
    let clipboardStarted = false;
    let resolveClipboard: (() => void) | null = null;
    const clipboardPromise = new Promise<void>((resolve) => {
      resolveClipboard = resolve;
    });

    const run = continueInExternalWorkspace({
      text: serializeSocialCalendarEvergreenDay(EVERGREEN_DAY),
      assetType: "blog_post_idea",
      preferences: prefs("mistral"),
      openWindow: (url) => {
        openCalls.push({ url, clipboardStarted });
        return createFakeWindow() as unknown as Window;
      },
      writeClipboard: async () => {
        clipboardStarted = true;
        await clipboardPromise;
      },
    });

    await Promise.resolve();
    assert.equal(openCalls.length, 1);
    assert.equal(openCalls[0]?.url, "about:blank");
    assert.equal(openCalls[0]?.clipboardStarted, false);

    resolveClipboard?.();
    const result = await run;
    assert.equal(result.opened, true);
    assert.equal(result.navigatedUrl, "https://chat.mistral.ai/");
  });

  it("does not change destinationRegistry or the global Continue helper", () => {
    const registry = read("services/assetContinuation/destinationRegistry.ts");
    const helper = read(
      "services/assetContinuation/continueInExternalWorkspace.ts",
    );
    const copy = read("components/deployment/CopyButton.tsx");
    const clipboard = read("lib/clipboard.ts");

    assert.match(registry, /chatgpt: "https:\/\/chatgpt.com\/"/);
    assert.match(registry, /gemini: "https:\/\/gemini.google.com\/app"/);
    assert.match(registry, /claude: "https:\/\/claude.ai\/new"/);
    assert.match(registry, /mistral: "https:\/\/chat.mistral.ai\/"/);
    assert.match(registry, /grok: "https:\/\/grok.com\/"/);
    assert.match(registry, /perplexity: "https:\/\/www.perplexity.ai\/"/);
    assert.doesNotMatch(registry, /encodeURIComponent|social-planner|Social Planner/);
    assert.match(helper, /about:blank/);
    assert.match(helper, /writeClipboard/);
    assert.match(helper, /resolveAssetContinuationDestination/);
    assert.match(helper, /CONTINUE_BLANK_OPEN_FEATURES/);
    assert.doesNotMatch(helper, /social-planner|serializeSocialCalendar/);
    assert.match(copy, /writeClipboardText/);
    assert.match(copy, /ContinueButton/);
    assert.doesNotMatch(copy, /social-planner/);
    assert.doesNotMatch(clipboard, /continueInExternalWorkspace|destinationRegistry/);
    assert.equal(CONTINUE_BLANK_OPEN_FEATURES, "noopener,noreferrer");
  });
});

describe("Social Planner AI-2 — non-interference", () => {
  it("does not change SP-6 history routes or fetch merely to pass preferences", () => {
    const historyFiles = [
      "app/social-planner/page.tsx",
      "app/social-planner/history/daily/page.tsx",
      "app/social-planner/history/evergreen/page.tsx",
      "components/socialPlanner/SocialPlannerHistory.tsx",
      "components/socialPlanner/SocialPlannerHistoryCta.tsx",
      "components/socialPlanner/SocialPlannerHistoryPageWorkspace.tsx",
      "components/socialPlanner/SocialPlannerHistoryRoutePage.tsx",
      "components/socialPlanner/SocialPlannerWorkspace.tsx",
    ];
    for (const file of historyFiles) {
      const source = read(file);
      assert.doesNotMatch(source, /continuationPreferences/);
      assert.doesNotMatch(source, /getOrganizationAiWorkspacePreferences/);
    }
  });

  it("does not change Daily or Evergreen generation, worker, Brain, or model routing", () => {
    const frozen = [
      "services/socialPlanner/generation/dispatchSocialPlannerGeneration.ts",
      "services/socialPlanner/generation/generateEvergreenSocialCalendarPackage.ts",
      "services/socialPlanner/generation/socialPlannerGenerationService.ts",
      "services/socialPlanner/generation/socialPlannerGenerationPrompts.ts",
      "services/socialPlanner/generation/socialPlannerEvergreenGenerationPrompts.ts",
      "services/socialPlanner/generation/validateSocialCalendarPackage.ts",
      "services/socialPlanner/generation/validateSocialCalendarEvergreenPackage.ts",
      "services/socialPlanner/socialCalendarGenerationJobs/socialCalendarGenerationJobExecutor.ts",
      "lib/llm/modelRouting.ts",
    ];
    for (const file of frozen) {
      const source = read(file);
      assert.doesNotMatch(source, /continuationPreferences/);
      assert.doesNotMatch(source, /getOrganizationAiWorkspacePreferences/);
      assert.doesNotMatch(source, /continueInExternalWorkspace/);
      assert.doesNotMatch(source, /destinationRegistry/);
    }

    const routing = read("lib/llm/modelRouting.ts");
    assert.doesNotMatch(routing, /ai_workspace|ContinueButton|destinationRegistry/);

    const identity = read("components/identity/AiWorkspacePreferencesSection.tsx");
    assert.doesNotMatch(identity, /social-planner|Social Planner/);
  });
});
