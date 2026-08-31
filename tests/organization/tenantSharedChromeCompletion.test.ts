/**
 * V31 L3.10.3 — remaining shared ordinary-tenant chrome.
 * Presentation only. Shared components stay tenant-language neutral.
 */

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CollapsiblePromptBlock } from "../../components/assetBlueprints/CollapsiblePromptBlock";
import { CopyButton } from "../../components/deployment/CopyButton";
import { continueInExternalWorkspace } from "../../services/assetContinuation/continueInExternalWorkspace";
import { tenantConversationChrome } from "../../lib/tenantI18n/conversationChrome";
import { interpolateTenantMessage } from "../../lib/tenantI18n/interpolate";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import {
  getAssetCopyChrome,
  getPromptBlockChrome,
  getSharedAssetChrome,
} from "../../lib/tenantI18n/opportunityPresentation";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import {
  ORGANIZATION_LANGUAGES,
  type OrganizationLanguage,
} from "../../services/organizationLanguage";
import { ASSET_USAGE_TAGS } from "../../services/assetInteractions/assetUsageTags";

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

const STORED_PROMPT =
  "Generated prompt body must remain verbatim — do not translate.";
const STORED_USER_MESSAGE = "User question must remain verbatim.";
const STORED_ASSISTANT_MESSAGE = "Assistant reply must remain verbatim.";
const SERVER_ERROR = "Upstream 503 from generation-worker-7.";

describe("V31 L3.10.3 shared chrome — EI Copy / Done / Continue / tags", () => {
  it("Discussion, Persona, and Prospect EI receive localized shared asset chrome", () => {
    const discussionPage = read("app/discussions/[id]/page.tsx");
    const personaPage = read("app/personas/[id]/page.tsx");
    const prospectPage = read("app/prospects/[id]/page.tsx");
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );

    assert.match(discussionPage, /assetChrome=\{getSharedAssetChrome\(messages\)\}/);
    assert.match(personaPage, /assetChrome=\{getSharedAssetChrome\(messages\)\}/);
    assert.match(prospectPage, /assetChrome=\{getSharedAssetChrome\(messages\)\}/);
    assert.match(workspace, /chrome=\{assetChrome\}/);
    assert.equal((workspace.match(/chrome=\{assetChrome\}/g) ?? []).length, 5);

    const french = getSharedAssetChrome(fr);
    assert.equal(french.copy.copy, fr.common.copy);
    assert.equal(french.copy.done, fr.copyChrome.done);
    assert.equal(french.copy.continue, fr.copyChrome.continue);
    assert.equal(french.copy.usageTagLabels?.selected, fr.copyChrome.usageTags.selected);
    assert.equal(french.discussWithAthena, fr.copyChrome.discussWithAthena);
    assert.notEqual(french.copy.done, en.copyChrome.done);
    assert.notEqual(french.copy.continue, en.copyChrome.continue);
    assert.notEqual(french.discussWithAthena, en.copyChrome.discussWithAthena);
  });

  it("keeps shared EI components tenant-neutral", () => {
    for (const file of [
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
      "components/deployment/CopyButton.tsx",
      "components/deployment/ContinueButton.tsx",
      "components/deployment/AssetUsageTagControls.tsx",
      "components/deployment/DeploymentAssets.tsx",
      "components/assetBlueprints/StrategicAssetBlueprint.tsx",
      "components/assetBlueprints/CollapsiblePromptBlock.tsx",
    ]) {
      const source = read(file);
      assert.doesNotMatch(source, /getTenantLocalization|getTenantMessages/);
      assert.doesNotMatch(source, /lib\/tenantI18n/);
    }
  });

  it("keeps clipboard payload exact and interaction tokens canonical", () => {
    const copy = read("components/deployment/CopyButton.tsx");
    assert.match(copy, /writeClipboardText\(value\)/);
    assert.match(copy, /sourceType: tracking\.sourceType/);
    assert.match(copy, /sourceId: tracking\.sourceId/);
    assert.match(copy, /executiveVersionId: tracking\.executiveVersionId/);
    assert.match(copy, /assetType: tracking\.assetType/);
    assert.doesNotMatch(copy, /language:|locale:/);

    const tags = read("components/deployment/AssetUsageTagControls.tsx");
    assert.match(tags, /usageTag: tag/);
    assert.match(tags, /action: wasActive \? "remove" : "add"/);
    for (const token of ASSET_USAGE_TAGS) {
      assert.match(tags, new RegExp(`key=\\{tag\\}`));
      assert.equal(en.copyChrome.usageTags[token].length > 0, true);
    }
    assert.doesNotMatch(tags, /language:|locale:/);

    const html = renderToStaticMarkup(
      createElement(CopyButton, {
        text: STORED_PROMPT,
        chrome: getAssetCopyChrome(fr),
        initiallyDone: true,
      }),
    );
    assert.match(html, />Terminé</);
    assert.doesNotMatch(html, />Done</);
    assert.match(html, />Continuer</);
    assert.doesNotMatch(html, new RegExp(STORED_PROMPT));
  });
});

describe("V31 L3.10.3 shared chrome — Continue toasts", () => {
  it("localizes deterministic Continue toast chrome without changing sequencing", async () => {
    const sequence = read(
      "services/assetContinuation/continueInExternalWorkspace.ts",
    );
    assert.match(sequence, /writeClipboard\(value\)/);
    assert.match(sequence, /navigateOpenedTab\(openedWindow, destinationUrl\)/);
    assert.doesNotMatch(sequence, /tenantI18n|getTenantLocalization|getAssetCopyChrome/);
    assert.doesNotMatch(sequence, /language:|locale:/);

    const toasts = fr.copyChrome.continueToasts;
    const fake = {
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

    const result = await continueInExternalWorkspace({
      text: STORED_PROMPT,
      assetType: "hidden_gems",
      toasts,
      openWindow: () => fake as unknown as Window,
      writeClipboard: async (value) => {
        assert.equal(value, STORED_PROMPT);
      },
    });

    assert.equal(result.copied, true);
    assert.equal(result.opened, true);
    assert.equal(result.navigatedUrl, "https://chatgpt.com/");
    assert.equal(
      result.toast,
      interpolateTenantMessage(toasts.copiedOpening, { destination: "ChatGPT" }),
    );
    assert.notEqual(result.toast, "Copied to clipboard. Opening ChatGPT...");
  });

  it("keeps English toast defaults and does not translate arbitrary errors", async () => {
    const result = await continueInExternalWorkspace({
      text: STORED_PROMPT,
      assetType: "hidden_gems",
      openWindow: () => null,
      writeClipboard: async () => undefined,
    });
    assert.equal(
      result.toast,
      "Content copied. Your browser blocked the new tab.",
    );

    const continueButton = read("components/deployment/ContinueButton.tsx");
    assert.match(continueButton, /showToast\(result\.toast\)/);
    assert.doesNotMatch(continueButton, /payload\.error|Error\.message/);
    assert.equal(SERVER_ERROR, "Upstream 503 from generation-worker-7.");
  });
});

describe("V31 L3.10.3 shared chrome — CollapsiblePromptBlock", () => {
  it("localizes Discuss with Athena and empty-prompt chrome with English defaults", () => {
    const promptChrome = getPromptBlockChrome(fr);
    const localized = renderToStaticMarkup(
      createElement(CollapsiblePromptBlock, {
        label: "Image Prompt",
        text: STORED_PROMPT,
        defaultOpen: true,
        discussAssetKind: "deployment",
        assetType: "image_prompt",
        onDiscussWithAthena: () => undefined,
        discussWithAthenaLabel: promptChrome.discussWithAthena,
        emptyPromptLabel: promptChrome.noPromptGeneratedYet,
        copyChrome: getAssetCopyChrome(fr),
      }),
    );
    assert.match(localized, new RegExp(fr.copyChrome.discussWithAthena));
    assert.doesNotMatch(localized, />Discuss with Athena</);
    assert.match(localized, new RegExp(STORED_PROMPT));
    assert.match(localized, />Copier</);

    const empty = renderToStaticMarkup(
      createElement(CollapsiblePromptBlock, {
        label: "Image Prompt",
        text: "",
        defaultOpen: true,
        emptyPromptLabel: promptChrome.noPromptGeneratedYet,
      }),
    );
    assert.match(empty, new RegExp(fr.copyChrome.noPromptGeneratedYet));
    assert.doesNotMatch(empty, /No prompt generated yet/);

    const englishDefault = renderToStaticMarkup(
      createElement(CollapsiblePromptBlock, {
        label: "Image Prompt",
        text: "",
        defaultOpen: true,
      }),
    );
    assert.match(englishDefault, /No prompt generated yet\./);

    const block = read("components/assetBlueprints/CollapsiblePromptBlock.tsx");
    assert.match(block, /discussWithAthenaLabel = "Discuss with Athena"/);
    assert.match(block, /emptyPromptLabel = "No prompt generated yet\."/);
    assert.doesNotMatch(block, /tenantI18n|getTenantLocalization/);
  });
});

describe("V31 L3.10.3 shared chrome — Persona EI version label", () => {
  it("localizes Persona version presentation without changing lineage", () => {
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    const personaPage = read("app/personas/[id]/page.tsx");
    assert.match(personaPage, /conversationChrome=\{copy\.conversation\}/);
    assert.match(
      workspace,
      /conversationChrome\?\.currentExecutiveVersion/,
    );
    assert.match(
      workspace,
      /conversationChrome\?\.archivedExecutiveVersion/,
    );
    assert.match(workspace, /viewModel\.isCurrent/);
    assert.match(workspace, /formatVersionGeneratedAt/);
    assert.doesNotMatch(workspace, /version_number \+/);
    assert.equal(
      fr.personas.conversation.currentExecutiveVersion,
      "Version exécutive actuelle",
    );
    assert.notEqual(
      fr.personas.conversation.archivedExecutiveVersion,
      en.personas.conversation.archivedExecutiveVersion,
    );
    assert.equal(
      en.personas.conversation.currentExecutiveVersion,
      "Current Executive Version",
    );
  });
});

describe("V31 L3.10.3 shared chrome — conversation transport fallback", () => {
  it("localizes the deterministic transport fallback and keeps messages verbatim", () => {
    const panel = read("components/conversation/AthenaConversationPanel.tsx");
    const helper = read("lib/tenantI18n/conversationChrome.ts");
    assert.match(panel, /chrome\.transportFailed/);
    assert.match(
      panel,
      /Athena could not reach the service\. Please try again\./,
    );
    assert.match(helper, /transportFailed: messages\.conversation\.transportFailed/);
    assert.match(panel, /\{message\.content\}/);
    assert.match(panel, /role: "user", content: trimmed/);
    assert.match(panel, /content: outcome\.result\.message\.content/);
    assert.doesNotMatch(panel, /language:|locale:/);
    assert.doesNotMatch(panel, /getTenantLocalization|lib\/tenantI18n/);

    const chrome = tenantConversationChrome(fr);
    assert.equal(chrome.transportFailed, fr.conversation.transportFailed);
    assert.notEqual(
      chrome.transportFailed,
      en.conversation.transportFailed,
    );
    assert.equal(STORED_USER_MESSAGE, "User question must remain verbatim.");
    assert.equal(
      STORED_ASSISTANT_MESSAGE,
      "Assistant reply must remain verbatim.",
    );
    assert.equal(SERVER_ERROR, "Upstream 503 from generation-worker-7.");
  });
});

describe("V31 L3.10.3 shared chrome — dictionary and isolation", () => {
  it("keeps all six dictionaries structurally identical for new keys", () => {
    const canonical = collectKeyPaths(en);
    assert.ok(canonical.includes("copyChrome.discussWithAthena"));
    assert.ok(canonical.includes("copyChrome.noPromptGeneratedYet"));
    assert.ok(canonical.includes("copyChrome.continueToasts.copiedOpening"));
    assert.ok(canonical.includes("conversation.transportFailed"));
    assert.ok(canonical.includes("personas.conversation.transportFailed"));
    assert.ok(
      canonical.includes("personas.conversation.currentExecutiveVersion"),
    );
    assert.ok(
      canonical.includes("personas.conversation.archivedExecutiveVersion"),
    );
    for (const language of ORGANIZATION_LANGUAGES) {
      assert.deepEqual(collectKeyPaths(DICTIONARIES[language]), canonical);
    }
    assert.equal(en.copyChrome.discussWithAthena, "Discuss with Athena");
    assert.match(fr.copyChrome.discussWithAthena, /Athena/);
    assert.match(es.copyChrome.discussWithAthena, /Athena/);
    assert.match(itMessages.copyChrome.discussWithAthena, /Athena/);
    assert.match(de.copyChrome.discussWithAthena, /Athena/);
    assert.match(pt.copyChrome.discussWithAthena, /Athena/);
  });

  it("does not start L3.11 and leaves Licensee / Super / login unchanged", () => {
    assert.doesNotMatch(
      read("app/login/page.tsx"),
      /getTenantLocalization|getSharedAssetChrome/,
    );
    assert.doesNotMatch(
      read("app/licensee/page.tsx"),
      /getTenantLocalization|getSharedAssetChrome/,
    );
    assert.doesNotMatch(
      read("app/super/page.tsx"),
      /getTenantLocalization|getSharedAssetChrome/,
    );
    assert.equal(
      existsSync(join(ROOT, "components/tenantI18n/TenantLocalizationProvider.tsx")),
      false,
    );
    for (const file of listTsFiles("workers")) {
      assert.doesNotMatch(read(file), /tenantI18n|lib\/tenantI18n/);
    }
  });
});
