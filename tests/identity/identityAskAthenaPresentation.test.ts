/**
 * Identity Ask Athena — single-section presentation (no nested card).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import {
  IDENTITY_CONVERSATION_ENDPOINT,
  IDENTITY_CONVERSATION_EXAMPLE_PROMPTS,
  IDENTITY_CONVERSATION_TITLE,
  IdentityConversationPanel,
} from "../../components/identity/IdentityConversationPanel";
import { IDENTITY_CARD_SURFACE_CLASS } from "../../components/identity/identityPagePresentation";
import { AthenaCollapsibleSection } from "../../components/ui/AthenaCollapsibleSection";
import { ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS } from "../../components/ui/athenaExecutiveCard";
import { tenantConversationWrapperChrome } from "../../lib/tenantI18n/conversationChrome";
import { en } from "../../lib/tenantI18n/messages/en";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function renderExpandedAskAthena() {
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
      }),
    ),
  );
}

describe("Identity Ask Athena presentation", () => {
  it("keeps one outer title, one subtitle, and no duplicate inner heading", () => {
    const page = read("app/identity/page.tsx");
    const askAthena = page.slice(
      page.indexOf("const askAthena = ("),
      page.indexOf("const deepScrape"),
    );
    assert.match(askAthena, /title=\{copy\.conversationTitle\}/);
    assert.match(askAthena, /summary=\{copy\.page\.askAthenaSummary\}/);
    assert.match(askAthena, /tone="identity"/);
    assert.match(askAthena, /IDENTITY_CARD_SURFACE_CLASS\.violet/);
    assert.doesNotMatch(askAthena, /title=\{copy\.conversationTitle\}[\s\S]*title=\{copy\.conversationTitle\}/);
    assert.doesNotMatch(askAthena, /conversationDescription/);

    assert.equal(en.identity.conversationTitle, "Ask Athena what it understands");
    assert.equal(
      en.identity.page.askAthenaSummary,
      "Ask what Athena understands. Responses do not change the Brain.",
    );

    const html = renderExpandedAskAthena();
    assert.equal(count(html, en.identity.conversationTitle), 1);
    assert.equal(count(html, en.identity.page.askAthenaSummary), 1);
    assert.equal(html.includes(en.identity.conversationDescription), false);
    assert.equal(html.includes(IDENTITY_CONVERSATION_TITLE), false);
    assert.equal(
      html.includes("Conversation responses do not modify Athena data."),
      false,
    );
    assert.equal(count(html, "<h2"), 1);
  });

  it("does not nest a second large card around the conversation body", () => {
    const conversation = read(
      "components/identity/IdentityConversationPanel.tsx",
    );
    const panel = read("components/conversation/AthenaConversationPanel.tsx");
    assert.match(conversation, /embedded/);
    assert.doesNotMatch(conversation, /AthenaCollapsibleSection/);
    assert.doesNotMatch(conversation, /rounded-\[28px\]/);
    assert.match(panel, /embedded \? \(/);
    assert.match(panel, /AthenaCollapsibleSection/);

    const body = renderToStaticMarkup(
      createElement(IdentityConversationPanel, {
        opaqueScope: "abcdef0123456789",
      }),
    );
    assert.doesNotMatch(body, /rounded-\[28px\]/);
    assert.equal(body.includes(ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS), false);
    assert.doesNotMatch(body, /<h2/);
    assert.doesNotMatch(body, /aria-expanded/);

    const html = renderExpandedAskAthena();
    assert.equal(count(html, "rounded-[28px]"), 1);
    assert.equal(count(html, ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS), 1);
  });

  it("preserves suggestions, textarea, Ask Athena, and Clear conversation", () => {
    const html = renderExpandedAskAthena();
    assert.match(html, /Try asking/);
    for (const example of IDENTITY_CONVERSATION_EXAMPLE_PROMPTS) {
      assert.equal(html.includes(example), true, example);
    }
    assert.match(html, /<textarea/);
    assert.match(html, /id="identity-conversation-input"/);
    assert.match(html, /Ask a question about your business or Athena/);
    assert.match(html, /Enter to send · Shift\+Enter for a new line/);
    assert.match(html, /Clear conversation/);
    assert.match(html, /type="submit"/);
    assert.match(html, />Ask Athena</);
    assert.equal(IDENTITY_CONVERSATION_ENDPOINT, "/api/identity/conversation");

    const conversation = read(
      "components/identity/IdentityConversationPanel.tsx",
    );
    const panel = read("components/conversation/AthenaConversationPanel.tsx");
    assert.match(conversation, /IDENTITY_CONVERSATION_ENDPOINT/);
    assert.match(conversation, /conversationEndpoint=\{IDENTITY_CONVERSATION_ENDPOINT\}/);
    assert.match(panel, /onSubmit=\{handleSubmit\}/);
    assert.match(panel, /onClick=\{clearConversation\}/);
    assert.match(panel, /Enter to send/);
    assert.match(panel, /nativeEvent\.isComposing/);
    assert.match(panel, /event\.key === "Enter" && !event\.shiftKey/);
  });

  it("keeps one shared conversation component and does not reuse Identity generation policy", () => {
    const page = read("app/identity/page.tsx");
    const askAthena = page.slice(
      page.indexOf("const askAthena = ("),
      page.indexOf("const deepScrape"),
    );
    assert.match(askAthena, /<IdentityConversationPanel/);
    assert.equal((page.match(/<IdentityConversationPanel/g) ?? []).length, 1);
    assert.match(askAthena, /presentation=\{askPresentation\}/);
    assert.match(askAthena, /upgradeContent=\{identityAskUpgradeContent/);
    assert.doesNotMatch(askAthena, /pricing|disabled/);
    assert.doesNotMatch(
      page,
      /identityGenerationLocked[\s\S]{0,80}IdentityConversationPanel/,
    );
    assert.doesNotMatch(
      read("app/api/identity/conversation/route.ts"),
      /assertCurrentFreeIdentityGeneration|FreeIdentityGeneration/,
    );
    assert.doesNotMatch(
      read("lib/organization/freeIdentityGeneration.ts"),
      /conversation|Ask Athena|askAthena/,
    );
  });
});
