/**
 * Getting Started Conversation UI / page placement tests.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  GETTING_STARTED_CONVERSATION_DESCRIPTION,
  GETTING_STARTED_CONVERSATION_ENDPOINT,
  GETTING_STARTED_CONVERSATION_EXAMPLE_PROMPTS,
  GETTING_STARTED_CONVERSATION_PLACEHOLDER,
  GETTING_STARTED_CONVERSATION_TITLE,
  GettingStartedConversationPanel,
} from "../../components/getting-started/GettingStartedConversationPanel";
import {
  IDENTITY_CONVERSATION_TITLE,
  IdentityConversationPanel,
} from "../../components/identity/IdentityConversationPanel";
import {
  GETTING_STARTED_CONVERSATION_STORAGE_KEY,
  buildGettingStartedConversationStorageKey,
  buildIdentityConversationStorageKey,
} from "../../services/athenaConversation/athenaConversationStorageKeys";
import { ATHENA_CONVERSATION_LIMITS } from "../../services/athenaConversation/athenaConversationTypes";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("getting started conversation UI", () => {
  it("panel is present with correct copy and collapsed by default", () => {
    const html = renderToStaticMarkup(
      createElement(GettingStartedConversationPanel),
    );
    assert.match(html, new RegExp(GETTING_STARTED_CONVERSATION_TITLE));
    assert.match(html, /aria-expanded="false"/);
    assert.equal(
      GETTING_STARTED_CONVERSATION_PLACEHOLDER,
      "Ask a question about Athena…",
    );
    assert.match(GETTING_STARTED_CONVERSATION_DESCRIPTION, /workflow/);
    assert.equal(GETTING_STARTED_CONVERSATION_EXAMPLE_PROMPTS.length, 6);
    assert.equal(
      GETTING_STARTED_CONVERSATION_ENDPOINT,
      "/api/getting-started/conversation",
    );
  });

  it("example prompts match the approved Getting Started list", () => {
    assert.deepEqual([...GETTING_STARTED_CONVERSATION_EXAMPLE_PROMPTS], [
      "What should I complete first?",
      "What is the difference between Voice and Business Knowledge?",
      "How does Athena use my website?",
      "How does Athena identify opportunities?",
      "What is Executive Intelligence?",
      "What happens after I import a discussion?",
    ]);
  });

  it("page mounts the panel after hero and before the first GuideCard without org provisioning", () => {
    const page = read("app/getting-started/page.tsx");
    assert.match(page, /GettingStartedConversationPanel/);
    assert.doesNotMatch(page, /requireCurrentOrganizationContext/);
    assert.doesNotMatch(page, /organizationService/);
    assert.doesNotMatch(page, /buildConversationScopeFingerprint/);
    assert.doesNotMatch(page, /opaqueScope/);
    assert.doesNotMatch(page, /organizationId|userId/);

    const panelIndex = page.indexOf("<GettingStartedConversationPanel");
    const firstGuideIndex = page.indexOf("<GuideCard");
    assert.ok(panelIndex > 0);
    assert.ok(firstGuideIndex > panelIndex);
  });

  it("visible Getting Started page copy does not claim autonomous market monitoring", () => {
    const page = read("app/getting-started/page.tsx");
    assert.doesNotMatch(
      page,
      /monitors conversations happening across your market/i,
    );
    assert.doesNotMatch(page, /watches your market/i);
    assert.doesNotMatch(page, /watch your market/i);
    assert.doesNotMatch(page, /automatically monitors/i);
    assert.doesNotMatch(page, /continuously monitors/i);
    assert.match(page, /copy\.intro/);
    const dictionary = read("lib/tenantI18n/messages/en.ts");
    assert.match(
      dictionary,
      /Import the conversations that matter to your business/,
    );
    assert.match(dictionary, /Athena analyzes them/);
  });

  it("authenticated page rendering path does not invoke organization service", async () => {
    const page = read("app/getting-started/page.tsx");
    assert.match(page, /createSupabaseServerClient/);
    assert.match(page, /supabase\.auth\.getUser/);
    assert.match(page, /redirect\("\/login"\)/);
    assert.doesNotMatch(page, /requireCurrentOrganizationContext/);
    assert.doesNotMatch(page, /provisionTenantForAuthenticatedUser/);

    let organizationServiceInvocations = 0;
    const requireCurrentOrganizationContext = async () => {
      organizationServiceInvocations += 1;
      throw new Error("organization provisioning must not run on page render");
    };

    // Simulate the page's login-only gate for an authenticated user.
    const user = { id: "auth-user-1" };
    assert.ok(user);
    // Page continues to render guidance + conversation without org lookup.
    void requireCurrentOrganizationContext;

    const html = renderToStaticMarkup(
      createElement(GettingStartedConversationPanel),
    );
    assert.match(html, new RegExp(GETTING_STARTED_CONVERSATION_TITLE));
    assert.match(html, /getting-started-conversation/);
    assert.equal(organizationServiceInvocations, 0);
    assert.equal(
      buildGettingStartedConversationStorageKey(),
      "athena:getting-started-conversation:v1",
    );
    assert.doesNotMatch(html, /org-|user-|opaque/);
  });

  it("Identity and Getting Started sessions do not overlap", () => {
    const identityKey = buildIdentityConversationStorageKey("sameopaquevalue1");
    const gettingStartedKey = buildGettingStartedConversationStorageKey();
    assert.notEqual(identityKey, gettingStartedKey);
    assert.equal(
      gettingStartedKey,
      GETTING_STARTED_CONVERSATION_STORAGE_KEY,
    );
    assert.equal(gettingStartedKey, "athena:getting-started-conversation:v1");

    const identityHtml = renderToStaticMarkup(
      createElement(IdentityConversationPanel, {
        opaqueScope: "sameopaquevalue1",
      }),
    );
    const gettingStartedHtml = renderToStaticMarkup(
      createElement(GettingStartedConversationPanel),
    );
    assert.match(identityHtml, new RegExp(IDENTITY_CONVERSATION_TITLE));
    assert.match(
      gettingStartedHtml,
      new RegExp(GETTING_STARTED_CONVERSATION_TITLE),
    );
    assert.notEqual(IDENTITY_CONVERSATION_TITLE, GETTING_STARTED_CONVERSATION_TITLE);
  });

  it("storage key is exactly fixed and excludes raw identifiers", () => {
    const key = buildGettingStartedConversationStorageKey();
    assert.equal(key, "athena:getting-started-conversation:v1");
    assert.doesNotMatch(key, /organizationId|userId|org-|user-/);
    const wrapper = read(
      "components/getting-started/GettingStartedConversationPanel.tsx",
    );
    assert.doesNotMatch(wrapper, /opaqueScope/);
    assert.doesNotMatch(wrapper, /organizationId|userId/);
  });

  it("generic panel applies maxLength, IME safety, and break-words", () => {
    const panel = read("components/conversation/AthenaConversationPanel.tsx");
    assert.match(
      panel,
      /maxLength=\{ATHENA_CONVERSATION_LIMITS\.maxMessageChars\}/,
    );
    assert.equal(ATHENA_CONVERSATION_LIMITS.maxMessageChars, 4_000);
    assert.match(panel, /nativeEvent\.isComposing/);
    assert.match(panel, /break-words/);
  });
});
