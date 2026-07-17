/**
 * Asset Continue destinations + Identity AI Workspace preferences.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  DEFAULT_AI_WORKSPACE_PREFERENCES,
  normalizeAiWorkspacePreferences,
  resolveAssetContinuationDestination,
} from "../../services/assetContinuation/destinationRegistry";

const ROOT = join(process.cwd());

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Asset Continue — destination registry", () => {
  it("defaults AI workspace and image generator to ChatGPT", () => {
    assert.deepEqual(DEFAULT_AI_WORKSPACE_PREFERENCES, {
      preferredAiWorkspace: "chatgpt",
      preferredImageGenerator: "chatgpt",
    });
    const resolved = resolveAssetContinuationDestination({
      assetType: "hidden_gems",
      preferences: null,
    });
    assert.equal(resolved.label, "ChatGPT");
    assert.equal(resolved.url, "https://chatgpt.com/");
    assert.equal(resolved.kind, "ai_workspace");
  });

  it("routes platform assets to dedicated destinations", () => {
    assert.equal(
      resolveAssetContinuationDestination({ assetType: "substack_note" }).label,
      "Substack",
    );
    assert.equal(
      resolveAssetContinuationDestination({ assetType: "substack_post" }).url,
      "https://substack.com/home",
    );
    assert.equal(
      resolveAssetContinuationDestination({ assetType: "reddit_post" }).url,
      "https://www.reddit.com/submit",
    );
    assert.equal(
      resolveAssetContinuationDestination({ assetType: "skool_post" }).kind,
      "platform",
    );
    assert.equal(
      resolveAssetContinuationDestination({
        assetType: "skool_course_idea",
      }).label,
      "Skool",
    );
  });

  it("routes communication assets to native execution platforms", () => {
    assert.deepEqual(
      resolveAssetContinuationDestination({
        assetType: "personalized_outreach_email",
      }),
      {
        destinationId: "gmail",
        label: "Gmail",
        url: "https://mail.google.com/mail/u/0/#inbox?compose=new",
        kind: "platform",
      },
    );
    assert.equal(
      resolveAssetContinuationDestination({ assetType: "follow_up_email" }).url,
      "https://mail.google.com/mail/u/0/#inbox?compose=new",
    );
    assert.equal(
      resolveAssetContinuationDestination({
        assetType: "linkedin_connection",
      }).url,
      "https://www.linkedin.com/messaging/",
    );
    assert.equal(
      resolveAssetContinuationDestination({
        assetType: "linkedin_follow_up",
      }).label,
      "LinkedIn",
    );
    assert.equal(
      resolveAssetContinuationDestination({
        assetType: "whatsapp_outreach",
      }).url,
      "https://web.whatsapp.com/",
    );
  });

  it("does not inject asset content into destination URLs", () => {
    const registry = read("services/assetContinuation/destinationRegistry.ts");
    assert.doesNotMatch(registry, /encodeURIComponent|body=|text=|message=/);
    const withBody = resolveAssetContinuationDestination({
      assetType: "personalized_outreach_email",
    });
    assert.equal(
      withBody.url,
      "https://mail.google.com/mail/u/0/#inbox?compose=new",
    );
    assert.doesNotMatch(withBody.url, /Hello|subject|to=/i);
  });

  it("routes image/video prompts to preferred image generator", () => {
    const resolved = resolveAssetContinuationDestination({
      assetType: "blueprint_image_prompt",
      preferences: {
        preferredAiWorkspace: "claude",
        preferredImageGenerator: "midjourney",
      },
    });
    assert.equal(resolved.kind, "image_generator");
    assert.equal(resolved.label, "Midjourney");
    assert.equal(resolved.url, "https://www.midjourney.com/app");
  });

  it("applies preferred AI workspace globally for text assets", () => {
    const prefs = normalizeAiWorkspacePreferences({
      preferredAiWorkspace: "gemini",
      preferredImageGenerator: "flux",
    });
    const resolved = resolveAssetContinuationDestination({
      assetType: "knowledge_base_enhancement",
      preferences: prefs,
    });
    assert.equal(resolved.label, "Gemini");
    assert.equal(resolved.url, "https://gemini.google.com/app");
  });

  it("does not hardcode destination URLs in asset cards", () => {
    const block = read("components/assetBlueprints/CollapsiblePromptBlock.tsx");
    const copy = read("components/deployment/CopyButton.tsx");
    const continueBtn = read("components/deployment/ContinueButton.tsx");
    const sequence = read(
      "services/assetContinuation/continueInExternalWorkspace.ts",
    );
    assert.match(continueBtn, /continueInExternalWorkspace/);
    assert.match(sequence, /resolveAssetContinuationDestination/);
    assert.match(sequence, /about:blank/);
    assert.match(sequence, /noopener,noreferrer/);
    assert.doesNotMatch(block, /chatgpt\.com|reddit\.com\/submit/);
    assert.doesNotMatch(copy, /chatgpt\.com|reddit\.com\/submit/);
  });
});

describe("Asset Continue — UI wiring", () => {
  it("Continue appears beside Copy on shared CollapsiblePromptBlock cards", () => {
    const block = read("components/assetBlueprints/CollapsiblePromptBlock.tsx");
    const copy = read("components/deployment/CopyButton.tsx");
    assert.match(block, /showContinue/);
    assert.match(block, /continuationPreferences/);
    assert.match(copy, /ContinueButton/);
    assert.match(copy, /Copied/);
  });

  it("Copy behavior remains on CopyButton writeClipboardText path", () => {
    const copy = read("components/deployment/CopyButton.tsx");
    assert.match(copy, /writeClipboardText/);
    assert.match(copy, /acknowledgeCopied/);
    assert.match(copy, /\/api\/asset-interactions/);
  });

  it("Identity AI Workspace section is registered", () => {
    const page = read("app/identity/page.tsx");
    const section = read(
      "components/identity/AiWorkspacePreferencesSection.tsx",
    );
    assert.match(page, /AiWorkspacePreferencesSection/);
    assert.match(page, /saveAiWorkspacePreferences/);
    assert.match(section, /Preferred AI Workspace/);
    assert.match(section, /Preferred Image Generator/);
  });

  it("migration adds ai_workspace_preferences jsonb only", () => {
    const migration = read(
      "supabase/migrations/20260717000001_add_ai_workspace_preferences.sql",
    );
    assert.match(migration, /ai_workspace_preferences jsonb/);
    assert.doesNotMatch(migration, /athena_identity|master_profile/);
  });

  it("does not change OpenRouter / model routing", () => {
    const routing = read("lib/llm/modelRouting.ts");
    assert.doesNotMatch(routing, /ai_workspace|ContinueButton|destinationRegistry/);
  });
});
