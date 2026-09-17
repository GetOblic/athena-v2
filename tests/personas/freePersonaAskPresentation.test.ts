/**
 * FREE-14 — Persona / Audience Ask presentation for Free available / exhausted.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { PersonaConversationPanel } from "../../components/personas/PersonaConversationPanel";
import { PersonaDetailHeader } from "../../components/personas/PersonaDetailHeader";
import {
  FREE_PERSONA_ASK_LIMIT,
  isFreePersonaAskComposerOpen,
  resolveFreePersonaAskPresentation,
} from "../../lib/organization/freePersonaAsk";
import { personaAskUpgradeContent } from "../../lib/upgrade/freeAskUpgradePresentation";
import {
  clearPersonaConversationSession,
  readPersonaConversationSession,
  writePersonaConversationSession,
} from "../../services/personaConversation/personaConversationSession";
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

function renderAsk(presentation: "available" | "exhausted" | "full") {
  return renderToStaticMarkup(
    createElement(PersonaConversationPanel, {
      personaId: "persona-1",
      executiveVersionId: "ev-1",
      versionState: "current",
      versionLabel: "Current Executive Version",
      chrome: en.personas.conversation,
      presentation,
      upgradeContent: personaAskUpgradeContent({
        continuation: en.personas.conversation.continuation,
        upgrade: en.upgrade,
      }),
      open: true,
    }),
  );
}

function renderHeader(canInitiateAsk: boolean) {
  return renderToStaticMarkup(
    createElement(PersonaDetailHeader, {
      backLabel: "Back",
      eyebrow: "Audience",
      title: "Urban Millennials",
      intelligenceLabel: "Ready",
      intelligenceStatus: "Ready",
      discussLabel: "Discuss with Athena",
      observationLabel: "Add observation",
      intelligenceGroupLabel: "Intelligence",
      audienceToolsGroupLabel: "Audience tools",
      intelligenceActions: null,
      audienceToolsActions: null,
      utilityActions: null,
      destructiveAction: null,
      canInitiateAsk,
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
    } as Storage,
    storage,
  };
}

describe("FREE-14 Persona Ask presentation", () => {
  it("keeps Discuss, composer, starter chips, and nested Discuss for available Free and Full", () => {
    assert.equal(
      resolveFreePersonaAskPresentation({
        athenaPlan: "free",
        consumedCount: 0,
      }),
      "available",
    );
    assert.equal(
      resolveFreePersonaAskPresentation({
        athenaPlan: "full",
        consumedCount: 1,
      }),
      "full",
    );
    assert.equal(isFreePersonaAskComposerOpen("available"), true);
    assert.equal(isFreePersonaAskComposerOpen("full"), true);

    for (const presentation of ["available", "full"] as const) {
      const html = renderAsk(presentation);
      assert.match(html, /<textarea/);
      assert.match(html, /type="submit"/);
      assert.match(html, /Ask Athena about this audience/);
      assert.match(html, />Send</);
      assert.match(html, /What motivates this audience most strongly\?/);
      assert.doesNotMatch(html, /<span[^>]*>What motivates this audience/);
      assert.equal(html.includes("1 remaining"), false);
      assert.equal(html.includes("upgrade"), false);
      assert.equal(html.includes("pricing"), false);
    }

    const availableHeader = renderHeader(true);
    assert.match(availableHeader, /Discuss with Athena/);
    assert.match(availableHeader, /data-persona-header-action="discuss"/);
  });

  it("hides the composer after Free consumption and keeps readable history chrome", () => {
    assert.equal(
      resolveFreePersonaAskPresentation({
        athenaPlan: "free",
        consumedCount: FREE_PERSONA_ASK_LIMIT,
      }),
      "exhausted",
    );
    assert.equal(isFreePersonaAskComposerOpen("exhausted"), false);
    const html = renderAsk("exhausted");
    assert.match(html, /Athena has answered your audience question/);
    assert.match(html, /Your conversation remains available here/);
    assert.match(html, /Clear/);
    assert.doesNotMatch(html, /<textarea/);
    assert.doesNotMatch(html, /type="submit"/);
    assert.doesNotMatch(html, /1 remaining|pricing|limit exceeded/i);
    assert.match(html, /What motivates this audience most strongly\?/);
    assert.match(html, /<span/);

    const panel = read("components/personas/PersonaConversationPanel.tsx");
    assert.match(panel, /composerOpen/);
    assert.match(panel, /if \(!composerOpen/);
    assert.match(panel, /messages\.map/);
    assert.doesNotMatch(panel, /resetAsk|consumeAsk|releaseAsk/);
  });

  it("does not let header Discuss or nested Discuss initiate another Ask after consumption", () => {
    const header = read("components/personas/PersonaDetailHeader.tsx");
    assert.match(header, /canInitiateAsk/);
    assert.match(header, /if \(canInitiateAsk\)/);

    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    assert.match(workspace, /canInitiatePersonaAsk/);
    assert.match(workspace, /if \(!canInitiatePersonaAsk\)/);
    const handler = workspace.slice(
      workspace.indexOf("function handleDiscussWithAthena"),
    );
    const personaBranch = handler.slice(
      handler.indexOf("if (isPersona)"),
      handler.indexOf("setConversationAssetReference"),
    );
    assert.match(personaBranch, /if \(!canInitiatePersonaAsk\)/);
    assert.ok(
      personaBranch.indexOf("if (!canInitiatePersonaAsk)") <
        personaBranch.indexOf("setPersonaConversationAssetReference"),
    );

    const page = read("app/personas/[id]/page.tsx");
    assert.match(page, /canInitiateAsk=\{canInitiateAsk\}/);
    assert.match(page, /personaAskPresentation=\{freePersonaAsk.presentation\}/);
    assert.match(page, /presentation=\{freePersonaAsk.presentation\}/);
  });

  it("clears session history without restoring allowance", () => {
    const { api } = memoryStorage();
    writePersonaConversationSession(api, {
      personaId: "persona-1",
      executiveVersionId: "ev-1",
      messages: [
        { role: "user", content: "What motivates this Persona?" },
        { role: "assistant", content: "Convenience and trust." },
      ],
      assetReference: null,
    });
    assert.equal(
      readPersonaConversationSession(api, {
        personaId: "persona-1",
        executiveVersionId: "ev-1",
      })?.messages.length,
      2,
    );
    clearPersonaConversationSession(api, {
      personaId: "persona-1",
      executiveVersionId: "ev-1",
    });
    assert.equal(
      readPersonaConversationSession(api, {
        personaId: "persona-1",
        executiveVersionId: "ev-1",
      }),
      null,
    );

    const panel = read("components/personas/PersonaConversationPanel.tsx");
    assert.match(panel, /clearPersonaConversationSession/);
    assert.match(panel, /setMessages\(\[\]\)/);
    assert.doesNotMatch(panel, /consumeAsk|releaseAsk|reserveAsk|resetAsk/);
    assert.doesNotMatch(
      read("lib/organization/freePersonaAsk.ts"),
      /sessionStorage|clearPersonaConversationSession/,
    );
    assert.match(
      read("app/personas/[id]/page.tsx"),
      /loadFreePersonaAskPageState/,
    );
    assert.match(
      read("services/organization/freePersonaAskAuthority.ts"),
      /free_persona_ask_consumed_count/,
    );
  });

  it("does not restore entitlement from browser presentation state", () => {
    const policy = read("lib/organization/freePersonaAsk.ts");
    const page = read("app/personas/[id]/page.tsx");
    const authority = read(
      "services/organization/freePersonaAskAuthority.ts",
    );
    assert.doesNotMatch(policy, /localStorage|sessionStorage|document\.cookie/);
    assert.match(page, /loadFreePersonaAskPageState/);
    assert.match(authority, /loadFreePersonaAskAuthority/);
    assert.match(authority, /resolveFreePersonaAskPresentation/);
    assert.doesNotMatch(authority, /sessionStorage|localStorage/);
    assert.equal(
      resolveFreePersonaAskPresentation({
        athenaPlan: "free",
        consumedCount: 1,
      }),
      "exhausted",
    );
  });

  it("keeps six-language key parity and avoids pricing copy", () => {
    const required = [
      "personas.conversation.exhaustedTitle",
      "personas.conversation.exhaustedHelper",
    ];
    const forbidden =
      /upgrade|pricing|credit|token|quota|remaining|limit exceeded/i;
    const canonical = collectKeyPaths(en.personas.conversation);
    for (const language of ORGANIZATION_LANGUAGES) {
      const copy = DICTIONARIES[language].personas.conversation;
      const paths = collectKeyPaths(copy);
      assert.deepEqual(paths, canonical, language);
      assert.equal(typeof copy.exhaustedTitle, "string", language);
      assert.equal(typeof copy.exhaustedHelper, "string", language);
      assert.doesNotMatch(copy.exhaustedTitle, forbidden);
      assert.doesNotMatch(copy.exhaustedHelper, forbidden);
    }
    assert.equal(
      en.personas.conversation.exhaustedTitle,
      "Athena has answered your audience question.",
    );
    assert.equal(
      en.personas.conversation.exhaustedHelper,
      "Your conversation remains available here.",
    );
    assert.equal(required.length, 2);
  });
});
