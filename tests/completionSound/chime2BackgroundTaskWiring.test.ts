/**
 * CHIME-2 — V1 completion-chime wiring for Ads, SEO, Estimate,
 * Social Planner, and Persona worker generation.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createBackgroundActionCompletionObserver } from "../../lib/completionSound/backgroundActionCompletion";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function unlockIndex(source: string): number {
  const unlock = source.indexOf("unlockCompletionSound()");
  const observerUnlock = source.indexOf("completionSound.unlock()");
  if (unlock >= 0 && observerUnlock >= 0) return Math.min(unlock, observerUnlock);
  return unlock >= 0 ? unlock : observerUnlock;
}

function firstAwaitIndex(source: string): number {
  return source.indexOf("await ");
}

function assertUnlockBeforeAwait(source: string, label: string) {
  const unlockIdx = unlockIndex(source);
  const awaitIdx = firstAwaitIndex(source);
  assert.ok(unlockIdx >= 0, `${label} must unlock completion audio`);
  assert.ok(awaitIdx > unlockIdx, `${label} must unlock before the first await`);
}

function collectFiles(relativeDir: string, suffixes: string[]): string[] {
  const abs = join(ROOT, relativeDir);
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full);
        continue;
      }
      if (suffixes.some((suffix) => entry.endsWith(suffix))) {
        found.push(full);
      }
    }
  };
  walk(abs);
  return found;
}

const adsForm = () => read("components/ads/AdCampaignGenerateForm.tsx");
const adsPanel = () => read("components/ads/AdCampaignStatusPanel.tsx");
const adsDetail = () => read("components/ads/AdCampaignDetailView.tsx");
const seoForm = () => read("components/seo/SeoReportGenerateForm.tsx");
const seoPanel = () => read("components/seo/SeoReportStatusPanel.tsx");
const seoDetail = () => read("components/seo/SeoReportDetailView.tsx");
const seoTechnical = () =>
  read("components/seo/SeoTechnicalReportDetailView.tsx");
const estimate = () =>
  read("components/licensee/estimate/LicenseeEstimateClient.tsx");
const estimateAsk = () =>
  read("components/licensee/estimate/EstimateAskAthenaPanel.tsx");
const plannerWorkspace = () =>
  read("components/socialPlanner/SocialPlannerWorkspace.tsx");
const plannerDetail = () =>
  read("components/socialPlanner/SocialPlannerDetailWorkspace.tsx");
const plannerAsk = () =>
  read("components/socialPlanner/SocialPlannerAskAthenaPanel.tsx");
const plannerHistoryWorkspace = () =>
  read("components/socialPlanner/SocialPlannerHistoryPageWorkspace.tsx");
const plannerHistory = () =>
  read("components/socialPlanner/SocialPlannerHistory.tsx");
const plannerHistoryCta = () =>
  read("components/socialPlanner/SocialPlannerHistoryCta.tsx");
const plannerDailyCard = () =>
  read("components/socialPlanner/SocialCalendarDayCard.tsx");
const plannerEvergreenCard = () =>
  read("components/socialPlanner/SocialCalendarEvergreenDayCard.tsx");
const personaButton = () =>
  read("components/personas/PersonaGenerateIntelligenceButton.tsx");
const personaProgress = () =>
  read("components/personas/PersonaGenerationProgress.tsx");
const personaGenerateForm = () =>
  read("components/personas/PersonaGenerateForm.tsx");

describe("CHIME-2 — canonical primitive reuse", () => {
  it("1-3. reuses the existing player and does not add an audio asset or AudioContext", () => {
    const play = read("lib/completionSound/playCompletionSound.ts");
    assert.match(play, /MASTER_GAIN = 0.07/);
    assert.match(play, /TONE_PEAK = 0.18/);
    assert.match(play, /659\.25/);
    assert.match(play, /880/);
    assert.match(play, /export function unlockCompletionSound/);
    assert.match(play, /export async function playCompletionSound/);
    assert.doesNotMatch(play, /\.mp3|\.wav|\.ogg|new Audio\(/);

    const adapters = [
      adsForm(),
      adsPanel(),
      adsDetail(),
      seoForm(),
      seoPanel(),
      seoDetail(),
      seoTechnical(),
      estimate(),
      plannerWorkspace(),
      plannerDetail(),
      personaButton(),
    ].join("\n");
    assert.match(adapters, /completionSound\/playCompletionSound|completionSound\/useBackgroundActionCompletionSound/);
    assert.doesNotMatch(adapters, /new AudioContext|webkitAudioContext|\.mp3|\.wav|\.ogg/);
  });

  it("4-5. workers and job executors contain zero completion-sound imports", () => {
    const worker = read("workers/athenaWorker.ts");
    assert.doesNotMatch(worker, /completionSound|playCompletionSound|unlockCompletionSound/);

    const executors = [
      "services/generationJobs/generationJobExecutor.ts",
      "services/ads/adsGenerationJobs/adGenerationJobExecutor.ts",
      "services/seo/seoGenerationJobs/seoGenerationJobExecutor.ts",
      "services/estimate/estimateGenerationJobs/estimateGenerationJobExecutor.ts",
      "services/socialPlanner/socialCalendarGenerationJobs/socialCalendarGenerationJobExecutor.ts",
    ];
    for (const file of executors) {
      assert.doesNotMatch(
        read(file),
        /completionSound|playCompletionSound|unlockCompletionSound/,
        file,
      );
    }
  });
});

describe("CHIME-2 — Ads", () => {
  it("6. generate gesture unlocks before the request", () => {
    const submit = adsForm().slice(adsForm().indexOf("async function handleSubmit"));
    assertUnlockBeforeAwait(submit, "Ads generate");
  });

  it("7. retry/regenerate gestures unlock", () => {
    const panel = adsPanel();
    const retry = panel.slice(panel.indexOf("async function handleRetryGenerate"));
    const regenerate = panel.slice(panel.indexOf("async function handleRegenerate"));
    assertUnlockBeforeAwait(retry, "Ads retry");
    assertUnlockBeforeAwait(regenerate, "Ads status regenerate");
    assertUnlockBeforeAwait(
      adsDetail().slice(adsDetail().indexOf("async function handleRegenerate")),
      "Ads ready regenerate",
    );
  });

  it("8-10. status panel observes active→Ready once; Ready mount and failure stay silent", () => {
    const panel = adsPanel();
    assert.match(panel, /useBackgroundActionCompletionSound/);
    assert.match(panel, /completionSound\.observe\(status\)/);
    assert.match(panel, /completionSound\.observe\(payload\.status\)/);

    const refreshIdx = panel.indexOf("router.refresh()");
    const observeIdx = panel.indexOf("completionSound.observe(payload.status)");
    assert.ok(observeIdx >= 0 && observeIdx < refreshIdx);

    let plays = 0;
    const observer = createBackgroundActionCompletionObserver({
      play: () => {
        plays += 1;
      },
    });
    assert.equal(observer.observe("Ready"), false);
    assert.equal(plays, 0);
    observer.reset();
    observer.observe("Queued");
    observer.observe("Processing");
    assert.equal(observer.observe("Ready"), true);
    assert.equal(observer.observe("Ready"), false);
    assert.equal(plays, 1);
    observer.reset();
    observer.observe("Processing");
    assert.equal(observer.observe("Processing Failed"), false);
    assert.equal(plays, 1);
  });
});

describe("CHIME-2 — SEO", () => {
  it("11. generate gesture unlocks before the request", () => {
    assertUnlockBeforeAwait(
      seoForm().slice(seoForm().indexOf("async function handleGenerate")),
      "SEO generate",
    );
  });

  it("12. retry/regenerate gestures unlock", () => {
    const panel = seoPanel();
    assertUnlockBeforeAwait(
      panel.slice(panel.indexOf("async function handleRetryGenerate")),
      "SEO retry",
    );
    assertUnlockBeforeAwait(
      panel.slice(panel.indexOf("async function handleRegenerate")),
      "SEO status regenerate",
    );
    assertUnlockBeforeAwait(
      seoDetail().slice(seoDetail().indexOf("async function handleRegenerate")),
      "SEO ready regenerate",
    );
    assertUnlockBeforeAwait(
      seoTechnical().slice(
        seoTechnical().indexOf("async function handleRegenerate"),
      ),
      "SEO technical regenerate",
    );
  });

  it("13-15. status panel observes active→Ready once; Ready mount and failure stay silent", () => {
    const panel = seoPanel();
    assert.match(panel, /useBackgroundActionCompletionSound/);
    assert.match(panel, /completionSound\.observe\(status\)/);
    assert.match(panel, /completionSound\.observe\(payload\.status\)/);
    const refreshIdx = panel.indexOf("router.refresh()");
    const observeIdx = panel.indexOf("completionSound.observe(payload.status)");
    assert.ok(observeIdx >= 0 && observeIdx < refreshIdx);

    let plays = 0;
    const observer = createBackgroundActionCompletionObserver({
      play: () => {
        plays += 1;
      },
    });
    assert.equal(observer.observe("Ready"), false);
    observer.observe("Processing");
    assert.equal(observer.observe("Ready"), true);
    assert.equal(observer.observe("Ready"), false);
    observer.observe("Processing");
    assert.equal(observer.observe("Processing Failed"), false);
    assert.equal(plays, 1);
  });
});

describe("CHIME-2 — Estimate", () => {
  it("16-17. create and regenerate unlock before their requests", () => {
    const source = estimate();
    assertUnlockBeforeAwait(
      source.slice(source.indexOf("async function handleSubmit")),
      "Estimate create",
    );
    assertUnlockBeforeAwait(
      source.slice(source.indexOf("async function handleRegenerate")),
      "Estimate regenerate",
    );
  });

  it("18-21. polling observes active→Ready; Ready open, Ask Athena, and hide stay silent", () => {
    const source = estimate();
    assert.match(source, /useBackgroundActionCompletionSound/);
    assert.match(source, /completionSound\.observe\(payload\.estimate\.status\)/);
    assert.match(source, /completionSound\.reset\(\)/);
    assert.equal(source.match(/useBackgroundActionCompletionSound\(\)/g)?.length, 1);

    const hideFn = source.slice(source.indexOf("async function confirmHideEstimate"));
    assert.doesNotMatch(hideFn, /unlockCompletionSound|completionSound\.unlock|observe\(/);
    assert.doesNotMatch(estimateAsk(), /completionSound|unlockCompletionSound|playCompletionSound/);

    const openFn = source.slice(
      source.indexOf("async function openHistoryItem"),
      source.indexOf("async function handleRegenerate"),
    );
    assert.doesNotMatch(openFn, /unlockCompletionSound|completionSound\.unlock/);

    let plays = 0;
    const observer = createBackgroundActionCompletionObserver({
      play: () => {
        plays += 1;
      },
    });
    assert.equal(observer.observe("Ready"), false);
    observer.reset();
    observer.observe("Queued");
    assert.equal(observer.observe("Ready"), true);
    assert.equal(plays, 1);
  });
});

describe("CHIME-2 — Social Planner", () => {
  it("22-23. Daily and Evergreen create unlock through the shared workspace handler", () => {
    const workspace = plannerWorkspace();
    assert.match(workspace, /createDailySocialCalendarRequest/);
    assert.match(workspace, /createEvergreenSocialCalendarRequest/);
    assertUnlockBeforeAwait(
      workspace.slice(workspace.indexOf("async function handleCreate")),
      "Social Planner create",
    );
  });

  it("24-27. one detail observer handles both families; Ready/failed mounts stay silent", () => {
    const detail = plannerDetail();
    assert.match(detail, /useBackgroundActionCompletionSound/);
    assert.equal(detail.match(/useBackgroundActionCompletionSound\(\)/g)?.length, 1);
    assert.match(detail, /completionSound\.observe\(detailStatus\)/);
    assert.match(detail, /completionSound\.observe\(result\.value\.status\)/);
    assert.doesNotMatch(plannerDailyCard(), /completionSound|unlockCompletionSound/);
    assert.doesNotMatch(plannerEvergreenCard(), /completionSound|unlockCompletionSound/);

    let plays = 0;
    const observer = createBackgroundActionCompletionObserver({
      play: () => {
        plays += 1;
      },
    });
    assert.equal(observer.observe("Ready"), false);
    observer.observe("Queued");
    observer.observe("Processing");
    assert.equal(observer.observe("Ready"), true);
    assert.equal(observer.observe("Ready"), false);
    observer.reset();
    observer.observe("Processing");
    assert.equal(observer.observe("Processing Failed"), false);
    assert.equal(plays, 1);
  });

  it("28-30. Think Differently and Apply unlock; Ask Athena conversation does not", () => {
    const detail = plannerDetail();
    assertUnlockBeforeAwait(
      detail.slice(detail.indexOf("async function handleThinkDifferently")),
      "Social Planner Think Differently",
    );
    assertUnlockBeforeAwait(
      detail.slice(detail.indexOf("async function handleApplySuggestions")),
      "Social Planner Apply",
    );
    assert.doesNotMatch(
      plannerAsk(),
      /completionSound|unlockCompletionSound|playCompletionSound/,
    );
  });

  it("31-34. SP-6 history and day cards cannot chime; one calendar is one observer", () => {
    assert.doesNotMatch(
      plannerHistoryWorkspace(),
      /completionSound|unlockCompletionSound|playCompletionSound/,
    );
    assert.doesNotMatch(
      plannerHistory(),
      /completionSound|unlockCompletionSound|playCompletionSound/,
    );
    assert.doesNotMatch(
      plannerHistoryCta(),
      /completionSound|unlockCompletionSound|playCompletionSound/,
    );
    assert.doesNotMatch(
      read("app/social-planner/history/daily/page.tsx"),
      /completionSound|unlockCompletionSound|playCompletionSound/,
    );
    assert.doesNotMatch(
      read("app/social-planner/history/evergreen/page.tsx"),
      /completionSound|unlockCompletionSound|playCompletionSound/,
    );
    assert.doesNotMatch(
      read("components/socialPlanner/SocialPlannerHistoryRoutePage.tsx"),
      /completionSound|unlockCompletionSound|playCompletionSound/,
    );
    assert.equal(
      plannerDetail().match(/useBackgroundActionCompletionSound\(\)/g)?.length,
      1,
    );
  });
});

describe("CHIME-2 — Persona", () => {
  it("35-37. worker generate, refresh, and Think Differently unlock on the shared queueAction", () => {
    const button = personaButton();
    assertUnlockBeforeAwait(
      button.slice(button.indexOf("async function queueAction")),
      "Persona queueAction",
    );
    assert.match(button, /queueAction\("generate_intelligence"\)/);
    assert.match(button, /queueAction\("think_differently"\)/);
    assert.match(button, /data-persona-header-action="refresh"/);
    assert.match(button, /data-persona-header-action="think-differently"/);
  });

  it("38-40. exactly one Persona completion observer; Ready mount silent", () => {
    assert.match(personaButton(), /useBackgroundActionCompletionSound/);
    assert.equal(
      personaButton().match(/useBackgroundActionCompletionSound\(\)/g)?.length,
      1,
    );
    assert.doesNotMatch(
      personaProgress(),
      /completionSound|unlockCompletionSound|playCompletionSound/,
    );
    assert.match(personaButton(), /completionSound\.observe\("processing"\)/);
    assert.match(personaButton(), /completionSound\.observe\(observed\)/);

    const refreshFn = personaButton().slice(
      personaButton().indexOf("const refreshStatus"),
    );
    const observeIdx = refreshFn.indexOf("completionSound.observe(observed)");
    const refreshIdx = refreshFn.indexOf("router.refresh()");
    assert.ok(observeIdx >= 0 && observeIdx < refreshIdx);

    let plays = 0;
    const observer = createBackgroundActionCompletionObserver({
      play: () => {
        plays += 1;
      },
    });
    assert.equal(observer.observe("Ready"), false);
    observer.observe("processing");
    assert.equal(observer.observe("completed"), true);
    assert.equal(observer.observe("Ready"), false);
    assert.equal(plays, 1);
  });

  it("41. candidate-generation review step does not chime", () => {
    const form = personaGenerateForm();
    assert.match(form, /\/api\/personas\/generate/);
    assert.doesNotMatch(
      form,
      /completionSound|unlockCompletionSound|playCompletionSound/,
    );
  });
});

describe("CHIME-2 — non-interference", () => {
  it("42-46. Continue, Copy, AI-2, and SP-6 history stay intact", () => {
    const continueBtn = read("components/deployment/ContinueButton.tsx");
    const copyBtn = read("components/deployment/CopyButton.tsx");
    const registry = read(
      "services/assetContinuation/destinationRegistry.ts",
    );
    const continueLib = read(
      "services/assetContinuation/continueInExternalWorkspace.ts",
    );
    assert.doesNotMatch(
      continueBtn,
      /completionSound|unlockCompletionSound|playCompletionSound/,
    );
    assert.doesNotMatch(
      copyBtn,
      /completionSound|unlockCompletionSound|playCompletionSound/,
    );
    assert.match(registry, /normalizeAiWorkspacePreferences/);
    assert.match(continueLib, /continueInExternalWorkspace/);
    assert.match(plannerDetail(), /continuationPreferences/);
    assert.match(plannerDailyCard(), /continuationPreferences/);
    assert.match(plannerWorkspace(), /SocialPlannerHistoryCta/);
    assert.match(
      plannerHistoryWorkspace(),
      /isSocialPlannerInFlight/,
    );
  });

  it("47-50. no generation, validator, worker, or schema changes", () => {
    const forbidden = /completionSound|playCompletionSound|unlockCompletionSound/;
    const generationTouched = [
      ...collectFiles("services/ads", [".ts"]),
      ...collectFiles("services/seo", [".ts"]),
      ...collectFiles("services/estimate", [".ts"]),
      ...collectFiles("services/socialPlanner", [".ts"]),
      ...collectFiles("services/personas", [".ts"]),
    ];
    for (const file of generationTouched) {
      assert.doesNotMatch(readFileSync(file, "utf8"), forbidden, file);
    }
    assert.doesNotMatch(read("workers/athenaWorker.ts"), forbidden);
    for (const file of collectFiles("supabase/migrations", [".sql"])) {
      assert.doesNotMatch(readFileSync(file, "utf8"), forbidden, file);
    }
  });

  it("existing wired features keep a single observer and are not re-wired here", () => {
    const frozen = [
      "components/discussions/DiscussionRegenerationProvider.tsx",
      "components/identity/DeepScrapeWebsiteButton.tsx",
      "components/prospects/ProspectDeepScrapeWebsiteButton.tsx",
      "components/personas/PersonaDeepScrapeWebsiteButton.tsx",
      "components/communities/GenerateCommunityIntelligenceButton.tsx",
      "components/opportunities/GenerateReviewButton.tsx",
      "components/identity/TrainAthenaSubmitButton.tsx",
    ];
    for (const file of frozen) {
      const source = read(file);
      const observers = source.match(/useBackgroundActionCompletionSound\(\)/g) ?? [];
      if (file.endsWith("TrainAthenaSubmitButton.tsx")) {
        assert.equal(observers.length, 0);
        continue;
      }
      assert.ok(observers.length <= 1, file);
    }
  });
});
