/**
 * Getting Started Conversation API / product context / containment tests.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  ATHENA_CONVERSATION_MODEL,
  ATHENA_REQUEST_ID_HEADER,
  AthenaConversationError,
} from "../../services/athenaConversation/athenaConversationTypes";
import { mapOpenRouterHttpFailure } from "../../services/athenaConversation/athenaConversationOpenRouterErrors";
import {
  validateAthenaConversationRequest,
} from "../../services/athenaConversation/athenaConversationValidation";
import {
  isAutoRetryableFailure,
  postAthenaConversation,
} from "../../services/athenaConversation/athenaConversationClient";
import { assembleGettingStartedConversationContext } from "../../services/gettingStartedConversation/gettingStartedConversationContext";
import {
  GETTING_STARTED_CONVERSATION_SYSTEM_PROMPT,
  buildGettingStartedConversationPrompt,
  gettingStartedPromptContainsNonMutationContract,
  gettingStartedPromptContainsUncertaintyContract,
} from "../../services/gettingStartedConversation/gettingStartedConversationPrompt";
import {
  GETTING_STARTED_PRODUCT_TOPICS,
  formatGettingStartedProductContext,
} from "../../services/gettingStartedConversation/gettingStartedProductContext";
import {
  GETTING_STARTED_CONVERSATION_STORAGE_KEY,
  buildGettingStartedConversationStorageKey,
  buildIdentityConversationStorageKey,
} from "../../services/athenaConversation/athenaConversationStorageKeys";
import { buildConversationScopeFingerprint } from "../../services/athenaConversation/athenaConversationScope";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const GETTING_STARTED_CONTAINMENT_FILES = [
  "services/gettingStartedConversation/gettingStartedConversationService.ts",
  "services/gettingStartedConversation/gettingStartedConversationContext.ts",
  "services/gettingStartedConversation/gettingStartedConversationPrompt.ts",
  "services/gettingStartedConversation/gettingStartedProductContext.ts",
  "services/gettingStartedConversation/gettingStartedConversationTypes.ts",
  "app/api/getting-started/conversation/route.ts",
  "components/getting-started/GettingStartedConversationPanel.tsx",
];

describe("getting started conversation validation", () => {
  it("requires the narrow DTO and rejects client-supplied context", () => {
    assert.throws(
      () =>
        validateAthenaConversationRequest({
          message: "How does Athena work?",
          history: [],
          productContext: "spoofed",
        }),
      (error: unknown) =>
        error instanceof AthenaConversationError &&
        error.message.includes("productContext"),
    );

    assert.throws(
      () =>
        validateAthenaConversationRequest({
          message: "How does Athena work?",
          history: [],
          organizationId: "client-supplied-org",
        }),
      (error: unknown) =>
        error instanceof AthenaConversationError &&
        error.message.includes("organizationId"),
    );

    const request = validateAthenaConversationRequest({
      message: "How does Athena work?",
      history: [],
    });
    assert.equal(request.message, "How does Athena work?");
  });
});

describe("getting started product context", () => {
  it("comes from the server-owned module with verified topics", () => {
    assert.ok(GETTING_STARTED_PRODUCT_TOPICS.length >= 10);
    const formatted = formatGettingStartedProductContext();
    assert.match(formatted, /Train Athena Brain/);
    assert.match(formatted, /Voice/);
    assert.match(formatted, /Business Knowledge/);
    assert.match(formatted, /Homepage learning/);
    assert.match(formatted, /Deep website/);
    assert.match(formatted, /Discussions/);
    assert.match(formatted, /Opportunities/);
    assert.match(formatted, /Briefings/);
    assert.match(formatted, /Deployment Assets/);
    assert.match(formatted, /Strategic Asset Blueprint/);
    assert.match(formatted, /Executive Versions/);
  });

  it("describes import-then-analyze behavior without autonomous market monitoring", () => {
    const formatted = formatGettingStartedProductContext();
    assert.match(formatted, /Users import relevant conversations or discussions/);
    assert.match(formatted, /Athena analyzes that material/);
    assert.match(formatted, /identifies signals and opportunities/);
    assert.match(
      formatted,
      /uses the resulting intelligence to support strategic outputs/,
    );
    assert.match(
      formatted,
      /user supplies or imports the discussion material/,
    );

    assert.doesNotMatch(formatted, /automatically monitors the market/i);
    assert.doesNotMatch(formatted, /Athena monitors the market/i);
    assert.doesNotMatch(formatted, /continuous market monitoring/i);
    assert.doesNotMatch(formatted, /autonomous(?:ly)? monitors?/i);
    assert.doesNotMatch(formatted, /background analysis/i);
    assert.doesNotMatch(formatted, /automatic opportunity discovery/i);
    assert.doesNotMatch(formatted, /imports conversations automatically/i);
  });

  it("assembler loads product context only — no Identity/Prospect/EV/asset bodies", () => {
    const assembled = assembleGettingStartedConversationContext({
      organizationId: "org-1",
      userId: "user-1",
    });
    assert.equal(assembled.sections.length, 1);
    assert.equal(assembled.sections[0]?.type, "ATHENA_PRODUCT_CONTEXT");
    assert.match(assembled.sections[0]?.content ?? "", /Getting Started workflow/);

    const context = read(
      "services/gettingStartedConversation/gettingStartedConversationContext.ts",
    );
    assert.doesNotMatch(context, /getAthenaIdentityByUserId/);
    assert.doesNotMatch(context, /getProspectById/);
    assert.doesNotMatch(context, /getExecutiveVersionById/);
    assert.doesNotMatch(context, /getKnowledgeAssets/);
    assert.doesNotMatch(context, /formatDeepIntelligenceForBrainPrompt/);
    assert.doesNotMatch(context, /readStoredHomepageLearning/);
  });
});

describe("getting started conversation prompts", () => {
  it("includes non-mutation and uncertainty contracts", () => {
    assert.equal(
      gettingStartedPromptContainsNonMutationContract(
        GETTING_STARTED_CONVERSATION_SYSTEM_PROMPT,
      ),
      true,
    );
    assert.equal(
      gettingStartedPromptContainsUncertaintyContract(
        GETTING_STARTED_CONVERSATION_SYSTEM_PROMPT,
      ),
      true,
    );
  });

  it("grounds answers in product context and encodes uncertainty wording", () => {
    const built = buildGettingStartedConversationPrompt({
      assembled: assembleGettingStartedConversationContext({
        organizationId: "org-1",
        userId: "user-1",
      }),
      history: [],
      userMessage: "Does Athena support teleportation?",
    });
    const user = built.messages[built.messages.length - 1];
    assert.match(user.content, /ATHENA_PRODUCT_CONTEXT|Athena product context/);
    assert.match(
      GETTING_STARTED_CONVERSATION_SYSTEM_PROMPT,
      /not documented in the current Athena Getting Started guidance/,
    );
  });
});

describe("getting started gemini + containment source contracts", () => {
  it("uses google/gemini-2.5-flash and authenticated org context", () => {
    assert.equal(ATHENA_CONVERSATION_MODEL, "google/gemini-2.5-flash");
    const route = read("app/api/getting-started/conversation/route.ts");
    assert.match(route, /requireCurrentOrganizationContext/);
    assert.match(route, /UNAUTHORIZED/);
    assert.match(route, /maxDuration\s*=\s*60/);
    assert.match(route, /ATHENA_REQUEST_ID_HEADER/);
    assert.equal(ATHENA_REQUEST_ID_HEADER, "X-Athena-Request-Id");
  });

  it("API route authorization remains required and does not load Identity business context", () => {
    const route = read("app/api/getting-started/conversation/route.ts");
    assert.match(route, /requireCurrentOrganizationContext/);
    assert.match(route, /OrganizationAccessError/);
    assert.match(route, /runGettingStartedConversation/);
    assert.doesNotMatch(route, /getAthenaIdentityByUserId/);
    assert.doesNotMatch(route, /assembleIdentityConversationContext/);
    assert.doesNotMatch(route, /organizationId:\s*body/);

    const service = read(
      "services/gettingStartedConversation/gettingStartedConversationService.ts",
    );
    assert.doesNotMatch(service, /getAthenaIdentityByUserId/);
    assert.doesNotMatch(service, /assembleIdentityConversationContext/);
    assert.match(service, /assembleGettingStartedConversationContext/);
  });

  it("does not import mutation, generation, publication, or worker modules", () => {
    for (const file of GETTING_STARTED_CONTAINMENT_FILES) {
      const source = read(file);
      assert.doesNotMatch(
        source,
        /enqueueGenerationJob|createGenerationJob|publishExecutiveIntelligenceVersion/,
      );
      assert.doesNotMatch(source, /from ["']@\/services\/generationJobs/);
      assert.doesNotMatch(source, /from ["']@\/workers\//);
      assert.doesNotMatch(source, /upsertAthenaIdentity/);
      assert.doesNotMatch(source, /compileMasterIdentityProfile/);
      assert.doesNotMatch(source, /thinkDifferently/i);
      assert.doesNotMatch(source, /from ["']@\/lib\/openrouter/);
    }
  });

  it("normalizes provider errors", () => {
    const rateLimited = mapOpenRouterHttpFailure(429, "gs-1");
    assert.equal(rateLimited.code, "PROVIDER_RATE_LIMITED");
    assert.equal(rateLimited.retryable, true);
  });
});

describe("getting started client retry", () => {
  it("performs exactly one automatic retry for eligible transient failures", async () => {
    let calls = 0;
    const outcome = await postAthenaConversation({
      endpoint: "/api/getting-started/conversation",
      message: "What first?",
      history: [],
      signal: new AbortController().signal,
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) {
          return new Response("<html>bad gateway</html>", {
            status: 502,
            headers: { "Content-Type": "text/html" },
          });
        }
        return new Response(
          JSON.stringify({
            ok: true,
            message: { role: "assistant", content: "Start with Athena Brain." },
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              [ATHENA_REQUEST_ID_HEADER]: "gs-retry",
            },
          },
        );
      },
      sleep: async () => undefined,
    });

    assert.equal(calls, 2);
    assert.equal(outcome.ok, true);
  });

  it("does not auto-retry non-eligible failures", () => {
    assert.equal(
      isAutoRetryableFailure({
        kind: "auth",
        code: "UNAUTHORIZED",
        message: "Authentication required",
        retryable: false,
        requestId: null,
      }),
      false,
    );
  });
});

describe("getting started session isolation", () => {
  it("uses the fixed Getting Started key distinct from Identity fingerprints", () => {
    const identityFingerprint = buildConversationScopeFingerprint({
      scope: "identity",
      organizationId: "org-1",
      userId: "user-1",
    });
    const identityKey = buildIdentityConversationStorageKey(identityFingerprint);
    const gettingStartedKey = buildGettingStartedConversationStorageKey();

    assert.equal(gettingStartedKey, GETTING_STARTED_CONVERSATION_STORAGE_KEY);
    assert.equal(gettingStartedKey, "athena:getting-started-conversation:v1");
    assert.notEqual(identityKey, gettingStartedKey);
    assert.doesNotMatch(gettingStartedKey, /org-1|user-1/);
    assert.match(identityKey, /^athena:identity-conversation:v1:[a-f0-9]{16}$/);
  });
});
