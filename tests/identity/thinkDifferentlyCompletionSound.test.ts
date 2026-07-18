/**
 * Think Differently completion-chime wiring — isolated hotfix coverage.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  BACKGROUND_ACTION_ACTIVE_STATUSES,
  createBackgroundActionCompletionObserver,
} from "../../lib/completionSound/backgroundActionCompletion";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

/**
 * Mirrors DiscussionRegenerationProvider.markCompleted sound+toast coupling.
 */
function simulateMarkCompleted(
  observer: ReturnType<typeof createBackgroundActionCompletionObserver>,
  state: { toastShown: boolean },
): { played: boolean; showedToast: boolean } {
  let played = false;
  if (!state.toastShown) {
    state.toastShown = true;
    const previous = observer.getPreviousStatus();
    if (!previous || !BACKGROUND_ACTION_ACTIVE_STATUSES.has(previous)) {
      observer.observe("processing");
    }
    played = observer.observe("completed");
    return { played, showedToast: true };
  }
  return { played: false, showedToast: false };
}

describe("Think Differently completion chime — click unlock", () => {
  it("1. Discussion Think Differently unlocks synchronously before startThinkDifferently", () => {
    const button = read("components/discussions/ThinkDifferentlyButton.tsx");
    assert.match(button, /unlockCompletionSound/);
    assert.match(button, /onClick=\{\(\) => \{/);
    // Unlock precedes the async start call in source order inside onClick.
    const onClick = button.slice(button.indexOf("onClick="));
    const unlockIdx = onClick.indexOf("unlockCompletionSound()");
    const startIdx = onClick.indexOf("void startThinkDifferently()");
    assert.ok(unlockIdx >= 0 && startIdx > unlockIdx);
  });

  it("1b. Prospect Think Differently unlocks synchronously before queueAction await", () => {
    const prospect = read(
      "components/prospects/ProspectRefreshIntelligenceButton.tsx",
    );
    const tdHandlerStart = prospect.indexOf(
      'void queueAction("think_differently")',
    );
    const tdClick = prospect.slice(tdHandlerStart - 200, tdHandlerStart + 40);
    assert.match(tdClick, /unlockCompletionSound\(\)/);
    assert.ok(
      tdClick.indexOf("unlockCompletionSound()") <
        tdClick.indexOf('void queueAction("think_differently")'),
    );

    // queueAction itself still unlocks before its first await (shared path).
    const queueFn = prospect.slice(prospect.indexOf("async function queueAction"));
    const unlockInQueue = queueFn.indexOf("unlockCompletionSound()");
    const firstAwait = queueFn.indexOf("await ");
    assert.ok(unlockInQueue >= 0 && firstAwait > unlockInQueue);
  });
});

describe("Think Differently completion chime — active + completion", () => {
  it("2. Think Differently observes active state when queued/processing", () => {
    const provider = read(
      "components/discussions/DiscussionRegenerationProvider.tsx",
    );
    assert.match(provider, /completionSound\.observe\("processing"\)/);
    assert.match(
      provider,
      /startThinkDifferently[\s\S]*queueGeneration\([\s\S]*think_differently/,
    );
    // Shared beginGeneration arms processing for both GI and TD.
    const begin = provider.slice(
      provider.indexOf("const beginGeneration"),
      provider.indexOf("const resumeIfNeeded"),
    );
    assert.match(begin, /completionSound\.observe\("processing"\)/);
  });

  it("3. Confirmed completion triggers exactly one play even if prior active state was lost", () => {
    let plays = 0;
    const observer = createBackgroundActionCompletionObserver({
      play: () => {
        plays += 1;
      },
    });
    const state = { toastShown: false };

    // Simulate remount: no prior active observation.
    assert.equal(observer.getPreviousStatus(), null);
    const first = simulateMarkCompleted(observer, state);
    assert.equal(first.showedToast, true);
    assert.equal(first.played, true);
    assert.equal(plays, 1);
  });

  it("4. Repeated terminal completion does not replay", () => {
    let plays = 0;
    const observer = createBackgroundActionCompletionObserver({
      play: () => {
        plays += 1;
      },
    });
    const state = { toastShown: false };

    observer.observe("processing");
    assert.equal(simulateMarkCompleted(observer, state).played, true);
    assert.equal(plays, 1);

    // Second markCompleted is gated — no second toast/chime.
    assert.equal(simulateMarkCompleted(observer, state).played, false);
    assert.equal(simulateMarkCompleted(observer, state).showedToast, false);
    assert.equal(plays, 1);

    // Extra completed observes also do not replay.
    assert.equal(observer.observe("completed"), false);
    assert.equal(plays, 1);
  });

  it("5. Failed or cancelled Think Differently jobs do not play", () => {
    let plays = 0;
    const observer = createBackgroundActionCompletionObserver({
      play: () => {
        plays += 1;
      },
    });
    observer.observe("processing");
    assert.equal(observer.observe("failed"), false);
    assert.equal(observer.observe("cancelled"), false);
    assert.equal(plays, 0);

    const provider = read(
      "components/discussions/DiscussionRegenerationProvider.tsx",
    );
    assert.match(provider, /completionSound\.observe\("failed"\)/);
    assert.doesNotMatch(
      provider.slice(
        provider.indexOf('jobStatus === "failed"'),
        provider.indexOf("isFullPipelineRegenerationComplete"),
      ),
      /observe\("completed"\)/,
    );
  });

  it("6. Toast and sound are sibling effects of the same markCompleted gate", () => {
    const provider = read(
      "components/discussions/DiscussionRegenerationProvider.tsx",
    );
    const markCompleted = provider.slice(
      provider.indexOf("const markCompleted"),
      provider.indexOf("const startPolling"),
    );
    assert.match(markCompleted, /!completionToastShownRef\.current/);
    assert.match(markCompleted, /setShowToast\(true\)/);
    assert.match(markCompleted, /completionSound\.observe\("completed"\)/);
    // No unguarded completed observe outside the toast gate.
    const afterGateClose = markCompleted.split("setShowToast(true)")[1] ?? "";
    assert.doesNotMatch(afterGateClose, /observe\("completed"\)/);
  });
});

describe("Think Differently completion chime — Standard isolation", () => {
  it("7. Generate Intelligence click path remains unchanged (no button-level unlock)", () => {
    const analyze = read("components/discussions/AnalyzeDiscussionButton.tsx");
    assert.match(analyze, /onClick=\{\(\) => void startRegeneration\(\)\}/);
    assert.doesNotMatch(analyze, /unlockCompletionSound/);

    const prospect = read(
      "components/prospects/ProspectRefreshIntelligenceButton.tsx",
    );
    const giClick = prospect.slice(
      prospect.indexOf('queueAction("generate_intelligence")') - 80,
      prospect.indexOf('queueAction("generate_intelligence")') + 50,
    );
    // GI still uses the simple void queueAction click (unlock stays inside queueAction).
    assert.match(giClick, /void queueAction\("generate_intelligence"\)/);
    assert.doesNotMatch(
      giClick,
      /unlockCompletionSound\(\);\s*void queueAction\("generate_intelligence"\)/,
    );
  });

  it("8. Discussion and Prospect Think Differently paths are both covered", () => {
    const header = read("components/discussions/DiscussionHeaderActions.tsx");
    assert.match(header, /ThinkDifferentlyButton/);

    const discussionButton = read(
      "components/discussions/ThinkDifferentlyButton.tsx",
    );
    assert.match(discussionButton, /startThinkDifferently/);
    assert.match(discussionButton, /unlockCompletionSound/);

    const prospect = read(
      "components/prospects/ProspectRefreshIntelligenceButton.tsx",
    );
    assert.match(prospect, /think-differently/);
    assert.match(prospect, /queueAction\("think_differently"\)/);
    assert.match(prospect, /unlockCompletionSound/);

    const provider = read(
      "components/discussions/DiscussionRegenerationProvider.tsx",
    );
    assert.match(provider, /\/think-differently/);
    assert.match(provider, /markCompleted/);
  });
});
