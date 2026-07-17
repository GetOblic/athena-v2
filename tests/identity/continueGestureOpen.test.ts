/**
 * ContinueButton user-gesture window open sequence.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONTINUE_BLANK_OPEN_FEATURES,
  continueInExternalWorkspace,
} from "../../services/assetContinuation/continueInExternalWorkspace";
import { resolveAssetContinuationDestination } from "../../services/assetContinuation/destinationRegistry";

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

describe("Continue — preserve user-gesture window opening", () => {
  it("opens about:blank synchronously before clipboard promise resolves", async () => {
    const openCalls: Array<{
      url?: string | URL;
      target?: string;
      features?: string;
      clipboardStarted: boolean;
    }> = [];
    let clipboardStarted = false;
    let resolveClipboard: (() => void) | null = null;

    const clipboardPromise = new Promise<void>((resolve) => {
      resolveClipboard = resolve;
    });

    const run = continueInExternalWorkspace({
      text: "asset body",
      assetType: "hidden_gems",
      openWindow: (url, target, features) => {
        openCalls.push({ url, target, features, clipboardStarted });
        return createFakeWindow() as unknown as Window;
      },
      writeClipboard: async () => {
        clipboardStarted = true;
        await clipboardPromise;
      },
    });

    // Allow the sync open + clipboard start to schedule.
    await Promise.resolve();
    assert.equal(openCalls.length, 1);
    assert.equal(openCalls[0]?.url, "about:blank");
    assert.equal(openCalls[0]?.target, "_blank");
    assert.equal(openCalls[0]?.features, CONTINUE_BLANK_OPEN_FEATURES);
    assert.equal(openCalls[0]?.clipboardStarted, false);
    assert.equal(clipboardStarted, true);

    resolveClipboard?.();
    const result = await run;
    assert.equal(result.opened, true);
    assert.equal(result.openCallCount, 1);
  });

  it("successful copy navigates the opened tab", async () => {
    const fake = createFakeWindow();
    const result = await continueInExternalWorkspace({
      text: "prompt text",
      assetType: "hidden_gems",
      openWindow: () => fake as unknown as Window,
      writeClipboard: async () => undefined,
    });

    assert.equal(result.copied, true);
    assert.equal(result.opened, true);
    assert.equal(result.navigatedUrl, "https://chatgpt.com/");
    assert.equal(fake.location.href, "https://chatgpt.com/");
    assert.equal(fake.opener, null);
    assert.equal(result.toast, "Copied to clipboard. Opening ChatGPT...");
  });

  it("clipboard failure still navigates the opened tab", async () => {
    const fake = createFakeWindow();
    const result = await continueInExternalWorkspace({
      text: "prompt text",
      assetType: "reddit_post",
      openWindow: () => fake as unknown as Window,
      writeClipboard: async () => {
        throw new Error("denied");
      },
    });

    assert.equal(result.copied, false);
    assert.equal(result.opened, true);
    assert.equal(result.navigatedUrl, "https://www.reddit.com/submit");
    assert.equal(fake.location.href, "https://www.reddit.com/submit");
    assert.equal(
      result.toast,
      "Unable to copy automatically. Destination opened.",
    );
  });

  it("blocked popup + successful copy shows blocked-popup toast", async () => {
    const result = await continueInExternalWorkspace({
      text: "prompt text",
      assetType: "hidden_gems",
      openWindow: () => null,
      writeClipboard: async () => undefined,
    });

    assert.equal(result.copied, true);
    assert.equal(result.opened, false);
    assert.equal(result.navigatedUrl, null);
    assert.equal(
      result.toast,
      "Content copied. Your browser blocked the new tab.",
    );
    assert.equal(result.openCallCount, 1);
  });

  it("blocked popup + clipboard failure shows combined failure toast", async () => {
    const result = await continueInExternalWorkspace({
      text: "prompt text",
      assetType: "hidden_gems",
      openWindow: () => null,
      writeClipboard: async () => {
        throw new Error("denied");
      },
    });

    assert.equal(result.copied, false);
    assert.equal(result.opened, false);
    assert.equal(
      result.toast,
      "Unable to copy automatically, and your browser blocked the new tab.",
    );
  });

  it("does not call window.open again after awaiting clipboard", async () => {
    const openUrls: string[] = [];
    let resolveClipboard: (() => void) | null = null;
    const clipboardPromise = new Promise<void>((resolve) => {
      resolveClipboard = resolve;
    });

    const run = continueInExternalWorkspace({
      text: "prompt text",
      assetType: "hidden_gems",
      openWindow: (url) => {
        openUrls.push(String(url));
        return createFakeWindow() as unknown as Window;
      },
      writeClipboard: async () => {
        await clipboardPromise;
      },
    });

    await Promise.resolve();
    assert.deepEqual(openUrls, ["about:blank"]);

    resolveClipboard?.();
    await run;

    assert.deepEqual(openUrls, ["about:blank"]);
  });

  it("closes the blank tab if navigation fails after open", async () => {
    const fake = createFakeWindow();
    fake.location.replace = () => {
      throw new Error("navigation failed");
    };

    const result = await continueInExternalWorkspace({
      text: "prompt text",
      assetType: "hidden_gems",
      openWindow: () => fake as unknown as Window,
      writeClipboard: async () => undefined,
    });

    assert.equal(fake.closed, true);
    assert.equal(result.opened, false);
    assert.match(result.toast, /Unable to open destination/);
  });

  it("existing routing remains unchanged", () => {
    assert.equal(
      resolveAssetContinuationDestination({ assetType: "substack_note" }).url,
      "https://substack.com/home",
    );
    assert.equal(
      resolveAssetContinuationDestination({ assetType: "reddit_post" }).url,
      "https://www.reddit.com/submit",
    );
    assert.equal(
      resolveAssetContinuationDestination({ assetType: "skool_post" }).url,
      "https://www.skool.com/",
    );
    assert.equal(
      resolveAssetContinuationDestination({
        assetType: "blueprint_image_prompt",
        preferences: {
          preferredAiWorkspace: "claude",
          preferredImageGenerator: "midjourney",
        },
      }).url,
      "https://www.midjourney.com/app",
    );
    assert.equal(
      resolveAssetContinuationDestination({
        assetType: "hidden_gems",
        preferences: {
          preferredAiWorkspace: "gemini",
          preferredImageGenerator: "flux",
        },
      }).url,
      "https://gemini.google.com/app",
    );
    assert.equal(
      resolveAssetContinuationDestination({
        assetType: "email_outreach",
        preferences: {
          preferredAiWorkspace: "claude",
          preferredImageGenerator: "flux",
        },
      }).url,
      "https://mail.google.com/mail/u/0/#inbox?compose=new",
    );
  });
});
