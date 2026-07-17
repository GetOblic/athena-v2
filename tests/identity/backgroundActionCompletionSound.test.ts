/**
 * Background action completion sound — transition rules + call-site wiring.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  createBackgroundActionCompletionObserver,
  shouldPlayCompletionSound,
} from "../../lib/completionSound/backgroundActionCompletion";
import { playCompletionSound } from "../../lib/completionSound/playCompletionSound";

const ROOT = join(process.cwd());

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Background action completion sound — transitions", () => {
  it("1. active → completed plays once", () => {
    let plays = 0;
    const observer = createBackgroundActionCompletionObserver({
      play: () => {
        plays += 1;
      },
    });

    assert.equal(observer.observe("processing"), false);
    assert.equal(observer.observe("completed"), true);
    assert.equal(plays, 1);
  });

  it("2. active → completed followed by completed does not replay", () => {
    let plays = 0;
    const observer = createBackgroundActionCompletionObserver({
      play: () => {
        plays += 1;
      },
    });

    observer.observe("queued");
    assert.equal(observer.observe("completed"), true);
    assert.equal(observer.observe("completed"), false);
    assert.equal(observer.observe("completed"), false);
    assert.equal(plays, 1);
  });

  it("3. initial completed state does not play", () => {
    let plays = 0;
    const observer = createBackgroundActionCompletionObserver({
      play: () => {
        plays += 1;
      },
    });

    assert.equal(observer.observe("completed"), false);
    assert.equal(plays, 0);
  });

  it("4. idle → completed does not play unless an active state was observed", () => {
    assert.equal(shouldPlayCompletionSound(null, "completed"), false);
    assert.equal(shouldPlayCompletionSound("idle", "completed"), false);
    assert.equal(shouldPlayCompletionSound("ready", "completed"), false);

    let plays = 0;
    const observer = createBackgroundActionCompletionObserver({
      play: () => {
        plays += 1;
      },
    });
    observer.observe(null);
    observer.observe("completed");
    assert.equal(plays, 0);
  });

  it("5. active → failed does not play", () => {
    let plays = 0;
    const observer = createBackgroundActionCompletionObserver({
      play: () => {
        plays += 1;
      },
    });
    observer.observe("processing");
    assert.equal(observer.observe("failed"), false);
    assert.equal(plays, 0);
  });

  it("6. active → cancelled does not play", () => {
    let plays = 0;
    const observer = createBackgroundActionCompletionObserver({
      play: () => {
        plays += 1;
      },
    });
    observer.observe("running");
    assert.equal(observer.observe("cancelled"), false);
    assert.equal(observer.observe("canceled"), false);
    assert.equal(plays, 0);
  });

  it("7. rerender / repeated observe of same active status does not replay", () => {
    let plays = 0;
    const observer = createBackgroundActionCompletionObserver({
      play: () => {
        plays += 1;
      },
    });
    observer.observe("generating");
    observer.observe("generating");
    observer.observe("completed");
    observer.observe("completed");
    assert.equal(plays, 1);
  });

  it("8. audio playback failure does not break completion handling", async () => {
    const observer = createBackgroundActionCompletionObserver({
      play: () => {
        throw new Error("audio blocked");
      },
    });

    observer.observe("scraping");
    assert.doesNotThrow(() => {
      assert.equal(observer.observe("success"), true);
    });

    await assert.doesNotReject(async () => {
      await playCompletionSound();
    });
  });

  it("recognizes deep-scrape and generation active aliases", () => {
    assert.equal(
      shouldPlayCompletionSound("awaiting_follow_on", "completed"),
      true,
    );
    assert.equal(shouldPlayCompletionSound("retryable", "ready"), true);
    assert.equal(shouldPlayCompletionSound("training", "succeeded"), true);
    assert.equal(shouldPlayCompletionSound("importing", "complete"), true);
  });
});

describe("Background action completion sound — call sites", () => {
  it("9. relevant background-action call sites are wired", () => {
    const provider = read(
      "components/discussions/DiscussionRegenerationProvider.tsx",
    );
    const identityDeep = read("components/identity/DeepScrapeWebsiteButton.tsx");
    const prospectDeep = read(
      "components/prospects/ProspectDeepScrapeWebsiteButton.tsx",
    );
    const community = read(
      "components/communities/GenerateCommunityIntelligenceButton.tsx",
    );
    const review = read("components/opportunities/GenerateReviewButton.tsx");

    assert.match(provider, /useBackgroundActionCompletionSound/);
    assert.match(provider, /completionSound\.observe\("processing"\)/);
    assert.match(provider, /completionSound\.observe\("completed"\)/);
    assert.match(provider, /completionSound\.observe\("failed"\)/);

    assert.match(identityDeep, /useBackgroundActionCompletionSound/);
    assert.match(identityDeep, /completionSound\.observe\(payload\.job\.status\)/);
    assert.match(prospectDeep, /useBackgroundActionCompletionSound/);
    assert.match(prospectDeep, /completionSound\.observe\(payload\.job\.status\)/);

    assert.match(community, /observe\("generating"\)/);
    assert.match(community, /observe\("completed"\)/);
    assert.match(review, /observe\("generating"\)/);
    assert.match(review, /observe\("completed"\)/);
  });

  it("10. no worker or server-side dependency is introduced", () => {
    const play = read("lib/completionSound/playCompletionSound.ts");
    const observer = read(
      "lib/completionSound/backgroundActionCompletion.ts",
    );
    const worker = read("scripts/buildAthenaWorker.mjs");

    assert.match(play, /AudioContext/);
    assert.doesNotMatch(play, /supabaseAdmin|openrouter|generationJob/i);
    assert.doesNotMatch(observer, /supabaseAdmin|openrouter|from\("jobs"\)/i);
    assert.doesNotMatch(worker, /completionSound|playCompletionSound/);
  });
});
