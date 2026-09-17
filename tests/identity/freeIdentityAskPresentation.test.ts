/**
 * FREE-8 — Identity Ask Athena presentation for Free untrained / available / exhausted.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { AthenaCollapsibleSection } from "../../components/ui/AthenaCollapsibleSection";
import {
  IDENTITY_CONVERSATION_ENDPOINT,
  IDENTITY_CONVERSATION_EXAMPLE_PROMPTS,
  IdentityConversationPanel,
} from "../../components/identity/IdentityConversationPanel";
import { IDENTITY_CARD_SURFACE_CLASS } from "../../components/identity/identityPagePresentation";
import { IDENTITY_TEACH_ATHENA_HREF } from "../../components/identity/identityPagePresentation";
import {
  FREE_IDENTITY_ASK_LIMIT,
  isFreeIdentityAskComposerOpen,
  resolveFreeIdentityAskPresentation,
} from "../../lib/organization/freeIdentityAsk";
import { identityAskUpgradeContent } from "../../lib/upgrade/freeAskUpgradePresentation";
import {
  clearAthenaConversationSession,
  readAthenaConversationSession,
  writeAthenaConversationSession,
} from "../../services/athenaConversation/athenaConversationSession";
import { buildIdentityConversationStorageKey } from "../../services/athenaConversation/athenaConversationStorageKeys";
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
  untrainedTitle: en.identity.page.askAthenaUntrainedTitle,
  untrainedHelper: en.identity.page.askAthenaUntrainedHelper,
  untrainedActionLabel: en.identity.page.askAthenaUntrainedAction,
  exhaustedTitle: en.identity.page.askAthenaExhaustedTitle,
  exhaustedHelper: en.identity.page.askAthenaExhaustedHelper,
};

function renderAsk(presentation: "available" | "untrained" | "exhausted" | "full") {
  return renderToStaticMarkup(
    createElement(
      AthenaCollapsibleSection,
      {
        title: en.identity.conversationTitle,
        summary: en.identity.page.askAthenaSummary,
        defaultOpen: true,
        tone: "identity",
        className: IDENTITY_CARD_SURFACE_CLASS.violet,
      },
      createElement(IdentityConversationPanel, {
        opaqueScope: "abcdef0123456789",
        placeholder: en.identity.conversationPlaceholder,
        inputLabel: en.identity.conversationInputLabel,
        examplePrompts: [
          en.identity.example1,
          en.identity.example2,
          en.identity.example3,
          en.identity.example4,
          en.identity.example5,
          en.identity.example6,
        ],
        ...tenantConversationWrapperChrome(en),
        presentation,
        askCopy: ASK_COPY,
        upgradeContent: identityAskUpgradeContent({
          continuation: en.identity.page.askAthenaContinuation,
          upgrade: en.upgrade,
        }),
      }),
    ),
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

describe("FREE-8 Identity Ask presentation", () => {
  it("keeps the same working Ask UI for trained Free and Full before exhaustion", () => {
    assert.equal(
      resolveFreeIdentityAskPresentation({
        athenaPlan: "free",
        trained: true,
        consumedCount: 0,
      }),
      "available",
    );
    assert.equal(
      resolveFreeIdentityAskPresentation({
        athenaPlan: "free",
        trained: true,
        consumedCount: 2,
      }),
      "available",
    );
    assert.equal(
      resolveFreeIdentityAskPresentation({
        athenaPlan: "full",
        trained: false,
        consumedCount: 3,
      }),
      "full",
    );
    assert.equal(isFreeIdentityAskComposerOpen("available"), true);
    assert.equal(isFreeIdentityAskComposerOpen("full"), true);

    for (const presentation of ["available", "full"] as const) {
      const html = renderAsk(presentation);
      assert.match(html, /<textarea/);
      assert.match(html, /type="submit"/);
      assert.match(html, />Ask Athena</);
      assert.match(html, /Clear conversation/);
      assert.match(html, /Try asking/);
      for (const example of IDENTITY_CONVERSATION_EXAMPLE_PROMPTS) {
        assert.equal(html.includes(example), true, example);
      }
      assert.equal(html.includes("2 remaining"), false);
      assert.equal(html.includes("1 remaining"), false);
      assert.equal(html.includes("upgrade"), false);
      assert.equal(html.includes("pricing"), false);
      assert.equal(IDENTITY_CONVERSATION_ENDPOINT, "/api/identity/conversation");
    }
  });

  it("presents an honest Teach Athena prerequisite for Free + untrained", () => {
    assert.equal(
      resolveFreeIdentityAskPresentation({
        athenaPlan: "free",
        trained: false,
        consumedCount: 0,
      }),
      "untrained",
    );
    assert.equal(isFreeIdentityAskComposerOpen("untrained"), false);
    const html = renderAsk("untrained");
    assert.match(html, /Teach Athena about your business first/);
    assert.match(
      html,
      /Once Athena has learned your business, you can ask what it understands/,
    );
    assert.match(html, /Teach Athena/);
    assert.match(html, new RegExp(IDENTITY_TEACH_ATHENA_HREF));
    assert.doesNotMatch(html, /<textarea/);
    assert.doesNotMatch(html, /type="submit"/);
    assert.equal(html.includes(en.identity.example1), false);
    assert.doesNotMatch(html, /2 remaining|upgrade|pricing|limit exceeded/i);
    assert.match(html, /Clear conversation/);

    const page = read("app/identity/page.tsx");
    assert.match(page, /resolveFreeIdentityAskPresentation/);
    assert.match(page, /IDENTITY_CARD_SURFACE_CLASS\.violet/);
    assert.match(
      read("components/identity/IdentityConversationPanel.tsx"),
      /IdentityTeachAthenaLink/,
    );
  });

  it("keeps history and Clear after exhaustion without a working submit", () => {
    assert.equal(
      resolveFreeIdentityAskPresentation({
        athenaPlan: "free",
        trained: true,
        consumedCount: FREE_IDENTITY_ASK_LIMIT,
      }),
      "exhausted",
    );
    assert.equal(isFreeIdentityAskComposerOpen("exhausted"), false);
    const html = renderAsk("exhausted");
    assert.match(html, /Athena has shown you what it understands/);
    assert.match(html, /Your conversation remains available here/);
    assert.match(html, /Clear conversation/);
    assert.doesNotMatch(html, /<textarea/);
    assert.doesNotMatch(html, /type="submit"/);
    assert.doesNotMatch(html, /2 remaining|pricing|limit exceeded/i);
    assert.match(html, /What does Athena currently understand about my business\?/);

    const panel = read("components/conversation/AthenaConversationPanel.tsx");
    assert.match(panel, /hideComposer/);
    assert.match(panel, /clearConversation/);
    assert.match(panel, /messages\.map/);
    assert.match(panel, /chrome\.copy/);
    assert.doesNotMatch(panel, /resetAsk|consumeAsk|releaseAsk/);
  });

  it("lets available suggestions fill the input and blocks exhausted or untrained submit bypass", () => {
    const available = renderAsk("available");
    assert.match(available, /<button[^>]+type="button"/);
    assert.match(
      read("components/conversation/AthenaConversationPanel.tsx"),
      /setDraft\(example\)/,
    );

    const untrained = renderAsk("untrained");
    assert.doesNotMatch(untrained, /setDraft/);
    assert.doesNotMatch(untrained, /<textarea/);
    assert.doesNotMatch(untrained, /type="submit"/);

    const exhausted = renderAsk("exhausted");
    assert.doesNotMatch(exhausted, /<button[^>]*setDraft/);
    assert.match(exhausted, /<span class="text-left text-sm text-white\/65">/);
    assert.doesNotMatch(exhausted, /type="submit"/);
    assert.match(
      read("components/conversation/AthenaConversationPanel.tsx"),
      /if \(!trimmed \|\| busy \|\| inFlightRef\.current \|\| hideComposer\)/,
    );
  });

  it("clears session history without restoring allowance", () => {
    const key = buildIdentityConversationStorageKey("scope1234567890ab");
    const { api } = memoryStorage();
    writeAthenaConversationSession(api, key, {
      schemaVersion: 1,
      messages: [
        { role: "user", content: "What do you understand?" },
        { role: "assistant", content: "Athena understands this business." },
      ],
      updatedAt: new Date().toISOString(),
    });
    assert.equal(readAthenaConversationSession(api, key)?.messages.length, 2);
    clearAthenaConversationSession(api, key);
    assert.equal(readAthenaConversationSession(api, key), null);

    const panel = read("components/conversation/AthenaConversationPanel.tsx");
    const identity = read("components/identity/IdentityConversationPanel.tsx");
    assert.match(panel, /clearAthenaConversationSession/);
    assert.match(panel, /setMessages\(\[\]\)/);
    assert.doesNotMatch(panel, /consumeAsk|releaseAsk|reserveAsk|reset/);
    assert.doesNotMatch(identity, /consumeAsk|releaseAsk|reserveAsk|resetAsk/);
    assert.doesNotMatch(
      read("lib/organization/freeIdentityAsk.ts"),
      /sessionStorage|clearAthenaConversationSession/,
    );
  });

  it("keeps six-language key parity and avoids pricing copy", () => {
    const required = [
      "identity.page.askAthenaUntrainedTitle",
      "identity.page.askAthenaUntrainedHelper",
      "identity.page.askAthenaUntrainedAction",
      "identity.page.askAthenaExhaustedTitle",
      "identity.page.askAthenaExhaustedHelper",
    ];
    const forbidden = /upgrade|pricing|credit|token|quota|remaining|limit exceeded/i;
    const canonical = collectKeyPaths(en.identity.page);
    for (const language of ORGANIZATION_LANGUAGES) {
      const page = DICTIONARIES[language].identity.page;
      const paths = collectKeyPaths(page);
      assert.deepEqual(paths, canonical, language);
      for (const key of required) {
        const leaf = key.replace("identity.page.", "") as keyof typeof page;
        assert.equal(typeof page[leaf], "string", `${language}.${key}`);
        assert.doesNotMatch(String(page[leaf]), forbidden);
      }
    }
    assert.equal(
      en.identity.page.askAthenaExhaustedTitle,
      "Athena has shown you what it understands.",
    );
    assert.equal(
      en.identity.page.askAthenaExhaustedHelper,
      "Your conversation remains available here.",
    );
  });
});
