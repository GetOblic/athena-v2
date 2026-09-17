/**
 * FREE-15C — contextual Full Athena continuation on exhausted Free Ask surfaces.
 * Presentation only. Identity Ask, Help Ask, and Persona Ask.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { GettingStartedConversationPanel } from "../../components/getting-started/GettingStartedConversationPanel";
import { IdentityConversationPanel } from "../../components/identity/IdentityConversationPanel";
import { PersonaConversationPanel } from "../../components/personas/PersonaConversationPanel";
import { tenantConversationWrapperChrome } from "../../lib/tenantI18n/conversationChrome";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import {
  helpAskUpgradeContent,
  identityAskUpgradeContent,
  personaAskUpgradeContent,
} from "../../lib/upgrade/freeAskUpgradePresentation";
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

const FORBIDDEN_COPY =
  /pricing|trial|unlimited|unlock everything|all features|checkout|billing|paywall|quota|1\/1|upgrade now|get more/i;

const IDENTITY_ASK_COPY = {
  untrainedTitle: en.identity.page.askAthenaUntrainedTitle,
  untrainedHelper: en.identity.page.askAthenaUntrainedHelper,
  untrainedActionLabel: en.identity.page.askAthenaUntrainedAction,
  exhaustedTitle: en.identity.page.askAthenaExhaustedTitle,
  exhaustedHelper: en.identity.page.askAthenaExhaustedHelper,
};

const HELP_ASK_COPY = {
  exhaustedTitle: en.gettingStarted.conversationExhaustedTitle,
  exhaustedHelper: en.gettingStarted.conversationExhaustedHelper,
};

const IDENTITY_UPGRADE = identityAskUpgradeContent({
  continuation: en.identity.page.askAthenaContinuation,
  upgrade: en.upgrade,
});

const HELP_UPGRADE = helpAskUpgradeContent({
  continuation: en.gettingStarted.conversationContinuation,
  upgrade: en.upgrade,
});

const PERSONA_UPGRADE = personaAskUpgradeContent({
  continuation: en.personas.conversation.continuation,
  upgrade: en.upgrade,
});

function renderIdentity(presentation: "available" | "untrained" | "exhausted" | "full") {
  return renderToStaticMarkup(
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
      askCopy: IDENTITY_ASK_COPY,
      upgradeContent: IDENTITY_UPGRADE,
    }),
  );
}

function renderHelp(presentation: "available" | "exhausted" | "full") {
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
      askCopy: HELP_ASK_COPY,
      upgradeContent: HELP_UPGRADE,
      open: true,
    }),
  );
}

function renderPersona(presentation: "available" | "exhausted" | "full") {
  return renderToStaticMarkup(
    createElement(PersonaConversationPanel, {
      personaId: "persona-1",
      executiveVersionId: "ev-1",
      versionState: "current",
      versionLabel: "Current Executive Version",
      chrome: en.personas.conversation,
      presentation,
      upgradeContent: PERSONA_UPGRADE,
      open: true,
    }),
  );
}

function upgradeSection(html: string): string {
  const start = html.indexOf('data-upgrade-variant="exhausted"');
  assert.ok(start >= 0, "expected exhausted upgrade surface");
  const sectionStart = html.lastIndexOf("<section", start);
  const sectionEnd = html.indexOf("</section>", start);
  assert.ok(sectionStart >= 0 && sectionEnd > sectionStart);
  return html.slice(sectionStart, sectionEnd + "</section>".length);
}

function assertNonInteractiveContinuation(html: string) {
  const surface = upgradeSection(html);
  assert.match(surface, /Continue with Full Athena/);
  assert.match(surface, /data-upgrade-cta-kind="none"/);
  assert.doesNotMatch(surface, /data-upgrade-cta-kind="href"/);
  assert.doesNotMatch(surface, /data-upgrade-cta-kind="handler"/);
  assert.doesNotMatch(surface, /href=/);
  assert.doesNotMatch(surface, /tabindex="/i);
  assert.doesNotMatch(surface, /<button/);
  assert.doesNotMatch(surface, /<a /);
  assert.doesNotMatch(html, /href="\/pricing"|href="\/checkout"|href="\/billing"|href="\/upgrade"/);
}

describe("FREE-15C exhausted Ask continuation", () => {
  it("renders Identity Ask exhausted continuation after delivered value", () => {
    const html = renderIdentity("exhausted");

    assert.match(html, /data-upgrade-feature="identityAsk"/);
    assert.match(html, /data-upgrade-accent="identity"/);
    assert.match(html, /data-upgrade-variant="exhausted"/);
    assert.match(html, /Keep exploring what Athena understands/);
    assert.match(
      html,
      /Continue asking Athena grounded questions about your business and the intelligence in Athena Brain/,
    );
    assert.match(
      html,
      /Ask more questions about what Athena understands about your business/,
    );
    assert.match(
      html,
      /Explore Athena Brain and current business intelligence in greater depth/,
    );
    assert.match(
      html,
      /Continue using grounded answers from your existing Athena context/,
    );
    assert.doesNotMatch(html, /Unlock the full power of Athena/);
    assert.doesNotMatch(html, /Deep Scrape|retrain|Retrain/);
    assertNonInteractiveContinuation(html);

    assert.match(html, /Athena has shown you what it understands/);
    assert.match(html, /Your conversation remains available here/);
    assert.match(html, /What does Athena currently understand about my business\?/);

    const successAt = html.indexOf("Athena has shown you what it understands");
    const valueAt = html.indexOf(
      "What does Athena currently understand about my business?",
    );
    const continuationAt = html.indexOf("Keep exploring what Athena understands");
    const ctaAt = html.indexOf("Continue with Full Athena");
    assert.ok(successAt >= 0 && valueAt > successAt);
    assert.ok(continuationAt > valueAt);
    assert.ok(ctaAt > continuationAt);

    assert.doesNotMatch(html, /<textarea/);
    assert.doesNotMatch(html, /type="submit"/);
    assert.match(html, /<span class="text-left text-sm text-white\/65">/);
    assert.doesNotMatch(html, FORBIDDEN_COPY);
    assert.match(html, /athena-success/);
    assert.match(html, /role="note"/);
    assert.match(html, /<h3 /);
  });

  it("renders Help Ask exhausted continuation after delivered value", () => {
    const html = renderHelp("exhausted");

    assert.match(html, /data-upgrade-feature="helpAsk"/);
    assert.match(html, /data-upgrade-accent="help"/);
    assert.match(html, /Keep asking Athena how the Intelligence OS works/);
    assert.match(html, /Ask more questions about Athena features and workflows/);
    assert.match(
      html,
      /Get guidance as you move between Athena Brain, Visibility, Audiences, Social Content and Convert Opportunities/,
    );
    assert.match(
      html,
      /Continue using Athena for contextual product guidance/,
    );
    assert.doesNotMatch(html, /Unlock the full power of Athena/);
    assert.doesNotMatch(html, /support SLA|human support|concierge/i);
    assertNonInteractiveContinuation(html);

    assert.match(html, /Athena has answered your question/);
    assert.match(html, /Your conversation remains available here/);
    assert.match(html, /What should I complete first\?/);

    const successAt = html.indexOf("Athena has answered your question");
    const valueAt = html.indexOf("What should I complete first?");
    const continuationAt = html.indexOf(
      "Keep asking Athena how the Intelligence OS works",
    );
    assert.ok(successAt >= 0 && valueAt > successAt);
    assert.ok(continuationAt > valueAt);

    assert.doesNotMatch(html, /<textarea/);
    assert.doesNotMatch(html, /type="submit"/);
    assert.match(html, /<span class="text-left text-sm text-white\/65">/);
    assert.doesNotMatch(html, FORBIDDEN_COPY);
    assert.match(html, /255,102,0/);
    assert.match(html, /role="note"/);
  });

  it("renders Persona Ask exhausted continuation after delivered value", () => {
    const html = renderPersona("exhausted");

    assert.match(html, /data-upgrade-feature="personaAsk"/);
    assert.match(html, /data-upgrade-accent="audience"/);
    assert.match(html, /Continue exploring this audience with Full Athena/);
    assert.match(html, /Ask more grounded questions about this audience/);
    assert.match(html, /Explore motivations, objections and buying behavior/);
    assert.match(
      html,
      /Refine messaging, channels and customer-experience decisions using the intelligence Athena already built/,
    );
    assert.doesNotMatch(html, /Unlock the full power of Athena/);
    assert.doesNotMatch(
      html,
      /regenerate audience intelligence|refresh intelligence|Deep Scrape|add observations/i,
    );
    assertNonInteractiveContinuation(html);

    assert.match(html, /Athena has answered your audience question/);
    assert.match(html, /Your conversation remains available here/);
    assert.match(html, /What motivates this audience most strongly\?/);
    assert.match(html, /No questions yet/);

    const successAt = html.indexOf("Athena has answered your audience question");
    const valueAt = html.indexOf("What motivates this audience most strongly?");
    const transcriptAt = html.indexOf("No questions yet");
    const continuationAt = html.indexOf(
      "Continue exploring this audience with Full Athena",
    );
    assert.ok(successAt >= 0 && valueAt > successAt);
    assert.ok(transcriptAt > valueAt);
    assert.ok(continuationAt > transcriptAt);

    assert.doesNotMatch(html, /<textarea/);
    assert.doesNotMatch(html, /type="submit"/);
    assert.match(html, /<span class="rounded-full border border-white\/10/);
    assert.doesNotMatch(html, FORBIDDEN_COPY);
    assert.match(html, /167,139,250/);
    assert.match(html, /role="note"/);
  });

  it("does not show exhausted continuation for available Free or Full", () => {
    for (const presentation of ["available", "full"] as const) {
      const identity = renderIdentity(presentation);
      const help = renderHelp(presentation);
      const persona = renderPersona(presentation);

      for (const html of [identity, help, persona]) {
        assert.doesNotMatch(html, /data-upgrade-variant="exhausted"/);
        assert.doesNotMatch(html, /data-athena-ask-continuation/);
        assert.doesNotMatch(html, /Keep exploring what Athena understands/);
        assert.doesNotMatch(html, /Keep asking Athena how the Intelligence OS works/);
        assert.doesNotMatch(
          html,
          /Continue exploring this audience with Full Athena/,
        );
        assert.match(html, /<textarea/);
        assert.match(html, /type="submit"/);
      }
    }

    const untrained = renderIdentity("untrained");
    assert.doesNotMatch(untrained, /data-upgrade-variant="exhausted"/);
    assert.doesNotMatch(untrained, /Keep exploring what Athena understands/);
  });

  it("keeps semantic accents distinct across the three Ask surfaces", () => {
    const identity = renderIdentity("exhausted");
    const help = renderHelp("exhausted");
    const persona = renderPersona("exhausted");

    assert.match(identity, /data-upgrade-accent="identity"/);
    assert.match(help, /data-upgrade-accent="help"/);
    assert.match(persona, /data-upgrade-accent="audience"/);
    assert.notEqual(
      identity.match(/data-upgrade-accent="[^"]+"/)?.[0],
      help.match(/data-upgrade-accent="[^"]+"/)?.[0],
    );
    assert.notEqual(
      help.match(/data-upgrade-accent="[^"]+"/)?.[0],
      persona.match(/data-upgrade-accent="[^"]+"/)?.[0],
    );
    assert.match(identity, /athena-success/);
    assert.doesNotMatch(help, /athena-success/);
    assert.doesNotMatch(persona, /athena-success/);
  });

  it("reuses UpgradeExhaustedNotice and does not invent destinations", () => {
    const identityPanel = read("components/identity/IdentityConversationPanel.tsx");
    const helpPanel = read(
      "components/getting-started/GettingStartedConversationPanel.tsx",
    );
    const personaPanel = read("components/personas/PersonaConversationPanel.tsx");
    const helper = read("lib/upgrade/freeAskUpgradePresentation.ts");

    for (const source of [identityPanel, helpPanel, personaPanel]) {
      assert.match(source, /UpgradeExhaustedNotice/);
      assert.match(source, /kind:\s*["']none["']/);
      assert.doesNotMatch(source, /\/pricing|\/checkout|\/billing/);
      assert.doesNotMatch(source, /kind:\s*["']href["']|kind:\s*["']handler["']/);
    }

    assert.match(helper, /feature:\s*["']identityAsk["']/);
    assert.match(helper, /feature:\s*["']helpAsk["']/);
    assert.match(helper, /feature:\s*["']personaAsk["']/);
    assert.doesNotMatch(helper, /athenaPlan|reserve_|consumedCount|supabase/i);
    assert.match(
      read("app/identity/page.tsx"),
      /identityAskUpgradeContent/,
    );
    assert.match(read("app/getting-started/page.tsx"), /upgradeCopy=\{messages\.upgrade\}/);
    assert.match(
      read("app/personas/[id]/page.tsx"),
      /personaAskUpgradeContent/,
    );
    assert.doesNotMatch(
      read("app/identity/page.tsx"),
      /UpgradeExhaustedNotice/,
    );
    assert.doesNotMatch(
      read("app/getting-started/page.tsx"),
      /UpgradeExhaustedNotice/,
    );
    assert.doesNotMatch(
      read("app/personas/[id]/page.tsx"),
      /UpgradeExhaustedNotice/,
    );
  });

  it("does not change Ask authority, reservations, or provider paths", () => {
    const files = [
      "lib/organization/freeIdentityAsk.ts",
      "lib/organization/freeHelpAsk.ts",
      "lib/organization/freePersonaAsk.ts",
      "lib/organization/freeIdentityAskReservation.ts",
      "lib/organization/freeHelpAskReservation.ts",
      "lib/organization/freePersonaAskReservation.ts",
      "services/organization/freeIdentityAskAuthority.ts",
      "services/organization/freeHelpAskAuthority.ts",
      "services/organization/freePersonaAskAuthority.ts",
      "services/identityConversation/identityConversationService.ts",
      "services/gettingStartedConversation/gettingStartedConversationService.ts",
      "services/personaConversation/personaConversationService.ts",
    ];
    for (const file of files) {
      const source = read(file);
      assert.doesNotMatch(source, /UpgradeExhaustedNotice|freeAskUpgradePresentation/);
      assert.doesNotMatch(source, /continueWithFullAthena/);
    }
  });

  it("keeps six-language feature continuation parity without pricing language", () => {
    const identityCanonical = collectKeyPaths(en.identity.page.askAthenaContinuation);
    const helpCanonical = collectKeyPaths(en.gettingStarted.conversationContinuation);
    const personaCanonical = collectKeyPaths(en.personas.conversation.continuation);

    assert.deepEqual(identityCanonical, [
      "capability1",
      "capability2",
      "capability3",
      "headline",
      "supportingText",
    ]);
    assert.deepEqual(helpCanonical, [
      "capability1",
      "capability2",
      "capability3",
      "headline",
    ]);
    assert.deepEqual(personaCanonical, [
      "capability1",
      "capability2",
      "capability3",
      "headline",
    ]);

    for (const language of ORGANIZATION_LANGUAGES) {
      const copy = DICTIONARIES[language];
      assert.deepEqual(
        collectKeyPaths(copy.identity.page.askAthenaContinuation),
        identityCanonical,
        language,
      );
      assert.deepEqual(
        collectKeyPaths(copy.gettingStarted.conversationContinuation),
        helpCanonical,
        language,
      );
      assert.deepEqual(
        collectKeyPaths(copy.personas.conversation.continuation),
        personaCanonical,
        language,
      );

      const leaves = [
        ...Object.values(copy.identity.page.askAthenaContinuation),
        ...Object.values(copy.gettingStarted.conversationContinuation),
        ...Object.values(copy.personas.conversation.continuation),
      ];
      for (const leaf of leaves) {
        assert.doesNotMatch(leaf, FORBIDDEN_COPY, language);
        assert.doesNotMatch(leaf, /unlimited|all features|upgrade/i, language);
      }
    }

    assert.equal(
      en.identity.page.askAthenaContinuation.headline,
      "Keep exploring what Athena understands",
    );
    assert.equal(
      en.gettingStarted.conversationContinuation.headline,
      "Keep asking Athena how the Intelligence OS works",
    );
    assert.equal(
      en.personas.conversation.continuation.headline,
      "Continue exploring this audience with Full Athena",
    );
    assert.equal(en.upgrade.continueWithFullAthena, "Continue with Full Athena");
    assert.equal(en.upgrade.fullAthena, "Full Athena");
  });
});
