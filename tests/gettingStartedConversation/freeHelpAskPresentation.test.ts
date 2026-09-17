/**
 * FREE-12 — Help / Chat with Athena presentation for Free available / exhausted.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import {
  GETTING_STARTED_CONVERSATION_ENDPOINT,
  GETTING_STARTED_CONVERSATION_EXAMPLE_PROMPTS,
  GettingStartedConversationPanel,
} from "../../components/getting-started/GettingStartedConversationPanel";
import { HelpCenterView } from "../../components/getting-started/HelpCenterView";
import {
  FREE_HELP_ASK_LIMIT,
  isFreeHelpAskComposerOpen,
  resolveFreeHelpAskPresentation,
} from "../../lib/organization/freeHelpAsk";
import { helpAskUpgradeContent } from "../../lib/upgrade/freeAskUpgradePresentation";
import {
  clearAthenaConversationSession,
  readAthenaConversationSession,
  writeAthenaConversationSession,
} from "../../services/athenaConversation/athenaConversationSession";
import { buildGettingStartedConversationStorageKey } from "../../services/athenaConversation/athenaConversationStorageKeys";
import { tenantConversationWrapperChrome } from "../../lib/tenantI18n/conversationChrome";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import { ORGANIZATION_LANGUAGES } from "../../services/organizationLanguage";

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

const ASK_COPY = {
  exhaustedTitle: en.gettingStarted.conversationExhaustedTitle,
  exhaustedHelper: en.gettingStarted.conversationExhaustedHelper,
};

function renderAsk(presentation: "available" | "exhausted" | "full") {
  return renderToStaticMarkup(
    createElement(GettingStartedConversationPanel, {
      title: en.gettingStarted.conversationTitle,
      description: en.gettingStarted.conversationDescription,
      placeholder: en.gettingStarted.conversationPlaceholder,
      inputLabel: en.gettingStarted.conversationInputLabel,
      examplePrompts: [
        en.gettingStarted.example1,
        en.gettingStarted.example2,
        en.gettingStarted.example3,
        en.gettingStarted.example4,
        en.gettingStarted.example5,
        en.gettingStarted.example6,
      ],
      ...tenantConversationWrapperChrome(en),
      presentation,
      askCopy: ASK_COPY,
      upgradeContent: helpAskUpgradeContent({
        continuation: en.gettingStarted.conversationContinuation,
        upgrade: en.upgrade,
      }),
      open: true,
    }),
  );
}

function memoryStorage() {
  const storage = new Map<string, string>();
  return {
    api: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    } satisfies Pick<Storage, "getItem" | "setItem" | "removeItem">,
    storage,
  };
}

describe("FREE-12 Help Ask presentation", () => {
  it("keeps the working Help composer for available Free and Full", () => {
    assert.equal(
      resolveFreeHelpAskPresentation({
        athenaPlan: "free",
        consumedCount: 0,
      }),
      "available",
    );
    assert.equal(
      resolveFreeHelpAskPresentation({
        athenaPlan: "full",
        consumedCount: 1,
      }),
      "full",
    );
    assert.equal(isFreeHelpAskComposerOpen("available"), true);
    assert.equal(isFreeHelpAskComposerOpen("full"), true);

    for (const presentation of ["available", "full"] as const) {
      const html = renderAsk(presentation);
      assert.match(html, /<textarea/);
      assert.match(html, /type="submit"/);
      assert.match(html, />Ask Athena</);
      assert.match(html, /Clear conversation/);
      assert.match(html, /Try asking/);
      for (const example of GETTING_STARTED_CONVERSATION_EXAMPLE_PROMPTS) {
        assert.equal(html.includes(example), true, example);
      }
      assert.equal(html.includes("1 remaining"), false);
      assert.equal(html.includes("upgrade"), false);
      assert.equal(html.includes("pricing"), false);
      assert.equal(
        GETTING_STARTED_CONVERSATION_ENDPOINT,
        "/api/getting-started/conversation",
      );
    }
  });

  it("hides the composer after Free consumption and keeps readable history chrome", () => {
    assert.equal(
      resolveFreeHelpAskPresentation({
        athenaPlan: "free",
        consumedCount: FREE_HELP_ASK_LIMIT,
      }),
      "exhausted",
    );
    assert.equal(isFreeHelpAskComposerOpen("exhausted"), false);
    const html = renderAsk("exhausted");
    assert.match(html, /Athena has answered your question/);
    assert.match(html, /Your conversation remains available here/);
    assert.match(html, /Clear conversation/);
    assert.doesNotMatch(html, /<textarea/);
    assert.doesNotMatch(html, /type="submit"/);
    assert.doesNotMatch(html, /1 remaining|pricing|limit exceeded/i);
    assert.match(html, /What should I complete first\?/);

    const panel = read("components/conversation/AthenaConversationPanel.tsx");
    assert.match(panel, /hideComposer/);
    assert.match(panel, /clearConversation/);
    assert.match(panel, /messages\.map/);
    assert.match(panel, /chrome\.copy/);
    assert.doesNotMatch(panel, /resetAsk|consumeAsk|releaseAsk/);
  });

  it("keeps Help Center Ask destination and sidebar entry unchanged", () => {
    const html = renderToStaticMarkup(
      createElement(HelpCenterView, {
        copy: en.gettingStarted,
        initialTopicId: "ask",
        conversationChrome: tenantConversationWrapperChrome(en),
        conversationPresentation: "available",
      }),
    );
    assert.match(html, /Ask Athena how to use Athena/);
    assert.match(html, /data-help-ask-destination=""/);
    assert.match(html, /<textarea/);

    const nav = read("components/dashboard/tenantNavigation.ts");
    assert.match(nav, /key: "needHelp"/);
    assert.match(nav, /href: "\/getting-started"/);
    assert.match(nav, /subtitleKey: "chatWithAthena"/);
    assert.equal(en.nav.needHelp, "Need help?");
    assert.equal(en.nav.chatWithAthena, "Chat with Athena");
  });

  it("clears session history without restoring allowance", () => {
    const key = buildGettingStartedConversationStorageKey();
    const { api } = memoryStorage();
    writeAthenaConversationSession(api, key, {
      schemaVersion: 1,
      messages: [
        { role: "user", content: "What should I complete first?" },
        { role: "assistant", content: "Start with Athena Brain." },
      ],
      updatedAt: new Date().toISOString(),
    });
    assert.equal(readAthenaConversationSession(api, key)?.messages.length, 2);
    clearAthenaConversationSession(api, key);
    assert.equal(readAthenaConversationSession(api, key), null);

    const panel = read("components/conversation/AthenaConversationPanel.tsx");
    const help = read(
      "components/getting-started/GettingStartedConversationPanel.tsx",
    );
    assert.match(panel, /clearAthenaConversationSession/);
    assert.match(panel, /setMessages\(\[\]\)/);
    assert.doesNotMatch(panel, /consumeAsk|releaseAsk|reserveAsk|reset/);
    assert.doesNotMatch(help, /consumeAsk|releaseAsk|reserveAsk|resetAsk/);
    assert.doesNotMatch(
      read("lib/organization/freeHelpAsk.ts"),
      /sessionStorage|clearAthenaConversationSession/,
    );
    assert.match(
      read("app/getting-started/page.tsx"),
      /loadFreeHelpAskPageState/,
    );
    assert.match(
      read("services/organization/freeHelpAskAuthority.ts"),
      /free_help_ask_consumed_count/,
    );
  });

  it("does not restore entitlement from browser presentation state", () => {
    const policy = read("lib/organization/freeHelpAsk.ts");
    const page = read("app/getting-started/page.tsx");
    const authority = read("services/organization/freeHelpAskAuthority.ts");
    assert.doesNotMatch(policy, /localStorage|sessionStorage|document\.cookie/);
    assert.match(page, /loadFreeHelpAskPageState/);
    assert.match(authority, /loadFreeHelpAskAuthority/);
    assert.match(authority, /resolveFreeHelpAskPresentation/);
    assert.doesNotMatch(authority, /sessionStorage|localStorage/);
    assert.equal(
      resolveFreeHelpAskPresentation({
        athenaPlan: "free",
        consumedCount: 1,
      }),
      "exhausted",
    );
  });

  it("keeps six-language key parity and avoids pricing copy", () => {
    const required = [
      "gettingStarted.conversationExhaustedTitle",
      "gettingStarted.conversationExhaustedHelper",
    ];
    const forbidden = /upgrade|pricing|credit|token|quota|remaining|limit exceeded/i;
    const canonical = collectKeyPaths(en.gettingStarted);
    for (const language of ORGANIZATION_LANGUAGES) {
      const copy = DICTIONARIES[language].gettingStarted;
      const paths = collectKeyPaths(copy);
      assert.deepEqual(paths, canonical, language);
      for (const key of required) {
        const leaf = key.replace("gettingStarted.", "") as keyof typeof copy;
        assert.equal(typeof copy[leaf], "string", `${language}.${key}`);
        assert.doesNotMatch(String(copy[leaf]), forbidden);
      }
    }
    assert.equal(
      en.gettingStarted.conversationExhaustedTitle,
      "Athena has answered your question.",
    );
    assert.equal(
      en.gettingStarted.conversationExhaustedHelper,
      "Your conversation remains available here.",
    );
  });
});
