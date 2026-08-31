/**
 * V31 L3.11 — PersonaConversationPanel deterministic transport fallback.
 * Presentation only. Request body and stored messages stay unchanged.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { PERSONA_CONVERSATION_NETWORK_FALLBACK } from "../../services/personaConversation/personaConversationClient";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import {
  ORGANIZATION_LANGUAGES,
  type OrganizationLanguage,
} from "../../services/organizationLanguage";

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

const DICTIONARIES: Record<OrganizationLanguage, TenantMessages> = {
  en,
  fr,
  es,
  it: itMessages,
  de,
  pt,
};

const SERVER_ERROR = "Upstream 503 from generation-worker-7.";

describe("V31 L3.11 Persona conversation transport fallback", () => {
  it("localizes the deterministic transport fallback through Persona chrome", () => {
    const panel = read("components/personas/PersonaConversationPanel.tsx");
    const client = read(
      "services/personaConversation/personaConversationClient.ts",
    );
    const page = read("app/personas/[id]/page.tsx");

    assert.equal(
      PERSONA_CONVERSATION_NETWORK_FALLBACK,
      "Network error talking to Athena.",
    );
    assert.match(client, /PERSONA_CONVERSATION_NETWORK_FALLBACK/);
    assert.match(client, /error instanceof Error/);
    assert.match(panel, /chrome\?\.transportFailed/);
    assert.match(panel, /PERSONA_CONVERSATION_NETWORK_FALLBACK/);
    assert.match(panel, /failure\.kind === "transport"/);
    assert.match(page, /chrome=\{copy\.conversation\}/);
    assert.doesNotMatch(panel, /getTenantLocalization|lib\/tenantI18n\/getTenant/);
    assert.doesNotMatch(panel, /language:|locale:/);
    assert.doesNotMatch(client, /language:|locale:/);

    assert.equal(
      en.personas.conversation.transportFailed,
      "Athena could not reach the service. Please try again.",
    );
    assert.notEqual(
      fr.personas.conversation.transportFailed,
      en.personas.conversation.transportFailed,
    );
    assert.equal(
      fr.personas.conversation.transportFailed,
      fr.conversation.transportFailed,
    );
    for (const language of ORGANIZATION_LANGUAGES) {
      assert.match(DICTIONARIES[language].personas.conversation.athena, /Athena/);
      assert.ok(
        DICTIONARIES[language].personas.conversation.transportFailed.trim()
          .length > 0,
      );
    }
  });

  it("keeps arbitrary server errors and conversation messages verbatim", () => {
    const panel = read("components/personas/PersonaConversationPanel.tsx");
    const client = read(
      "services/personaConversation/personaConversationClient.ts",
    );
    assert.match(panel, /\{message\.content\}/);
    assert.match(panel, /outcome\.failure\.message/);
    assert.match(client, /error instanceof UnexpectedServerResponseError/);
    assert.match(client, /message: error\.message/);
    assert.match(client, /payload\.error\?\.message/);
    assert.equal(SERVER_ERROR, "Upstream 503 from generation-worker-7.");
    assert.doesNotMatch(
      client,
      /body: JSON\.stringify\(\{[\s\S]*language:|body: JSON\.stringify\(\{[\s\S]*locale:/,
    );
  });

  it("keeps all six dictionaries structurally identical after the fallback key", () => {
    const canonical = collectKeyPaths(en);
    assert.ok(canonical.includes("personas.conversation.transportFailed"));
    for (const language of ORGANIZATION_LANGUAGES) {
      assert.deepEqual(collectKeyPaths(DICTIONARIES[language]), canonical);
    }
  });
});
