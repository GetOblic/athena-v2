/**
 * Identity Conversation UI / page placement / client island tests.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  IDENTITY_CONVERSATION_DESCRIPTION,
  IDENTITY_CONVERSATION_ENDPOINT,
  IDENTITY_CONVERSATION_EXAMPLE_PROMPTS,
  IDENTITY_CONVERSATION_PLACEHOLDER,
  IDENTITY_CONVERSATION_TITLE,
  IdentityConversationPanel,
} from "../../components/identity/IdentityConversationPanel";
import { buildIdentityConversationStorageKey } from "../../services/athenaConversation/athenaConversationStorageKeys";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("identity conversation UI", () => {
  it("panel is present with correct copy and collapsed by default", () => {
    const html = renderToStaticMarkup(
      createElement(IdentityConversationPanel, {
        opaqueScope: "abcdef0123456789",
      }),
    );
    assert.match(html, new RegExp(IDENTITY_CONVERSATION_TITLE));
    assert.match(html, /aria-expanded="false"/);
    assert.equal(IDENTITY_CONVERSATION_DESCRIPTION.includes("positioning"), true);
    assert.equal(
      IDENTITY_CONVERSATION_PLACEHOLDER,
      "Ask a question about your business or Athena…",
    );
    assert.equal(IDENTITY_CONVERSATION_EXAMPLE_PROMPTS.length, 6);
    assert.equal(
      IDENTITY_CONVERSATION_ENDPOINT,
      "/api/identity/conversation",
    );
  });

  it("example prompts match the approved Identity list", () => {
    assert.deepEqual([...IDENTITY_CONVERSATION_EXAMPLE_PROMPTS], [
      "What does Athena currently understand about my business?",
      "How would you describe my positioning and strongest differentiators?",
      "Is anything important missing from my Business Knowledge?",
      "Does my current Voice match how I want clients to perceive the business?",
      "What has Athena learned from my website?",
      "How does Athena use this information?",
    ]);
  });

  it("page mounts the panel after Brand Identity and below Teach Athena", () => {
    const page = read("app/identity/page.tsx");
    assert.match(page, /IdentityConversationPanel/);
    assert.match(page, /buildConversationScopeFingerprint/);
    assert.match(page, /scope:\s*"identity"/);
    assert.doesNotMatch(page, /lg:grid-cols-\[2fr_1fr\]/);

    const panelIndex = page.indexOf("<IdentityConversationPanel");
    const brandIndex = page.indexOf("<BrandIdentitySection");
    const teachIndex = page.indexOf("<IdentityTeachAthenaSection");
    const deepScrapeIndex = page.indexOf("<DeepScrapeWebsiteButton");
    assert.ok(panelIndex > 0);
    assert.ok(teachIndex > 0);
    assert.ok(brandIndex > teachIndex);
    assert.ok(panelIndex > brandIndex);
    assert.ok(deepScrapeIndex > 0);
  });

  it("panel stays outside mutation surfaces", () => {
    const panel = read("components/identity/IdentityConversationPanel.tsx");
    assert.doesNotMatch(panel, /TrainAthenaForm|DeepScrapeWebsiteButton|BrandIdentitySection/);
    assert.doesNotMatch(panel, /upsertAthenaIdentity|saveBrandIdentity/);
  });

  it("generic panel supports thinking state, pending non-persistence, and a11y", () => {
    const panel = read("components/conversation/AthenaConversationPanel.tsx");
    assert.match(panel, /Athena is thinking/);
    assert.match(panel, /data-athena-pending-response/);
    assert.match(panel, /aria-live="polite"/);
    assert.match(panel, /aria-busy=\{pendingResponse \|\| busy\}/);
    assert.match(panel, /disabled=\{busy\}/);
    assert.match(panel, /writeAthenaConversationSession/);
    assert.match(panel, /clearAthenaConversationSession/);
    assert.match(panel, /Enter to send/);
    assert.match(panel, /Support reference/);
    assert.match(panel, /maxLength=\{ATHENA_CONVERSATION_LIMITS\.maxMessageChars\}/);
    assert.match(panel, /nativeEvent\.isComposing/);
    assert.match(panel, /break-words/);
    // Pending response is UI-only; persistence writes `messages` only.
    assert.match(panel, /messages,/);
    assert.doesNotMatch(panel, /pendingResponse.*writeAthenaConversationSession/);
  });

  it("storage key excludes raw user and organization identifiers", () => {
    const key = buildIdentityConversationStorageKey("deadbeefcafebabe");
    assert.match(key, /^athena:identity-conversation:v1:deadbeefcafebabe$/);
    assert.doesNotMatch(key, /organizationId|userId|@[.]/);
    const wrapper = read("components/identity/IdentityConversationPanel.tsx");
    assert.match(wrapper, /opaqueScope/);
    assert.doesNotMatch(wrapper, /organizationId|userId/);
  });
});
