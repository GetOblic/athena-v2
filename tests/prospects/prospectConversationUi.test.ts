/**
 * Focused UI/source-contract and client-request tests for Athena Prospect Conversation.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProspectConversationPanel } from "../../components/prospects/ProspectConversationPanel";
import {
  buildDeploymentAssetCards,
  DeploymentAssets,
} from "../../components/deployment/DeploymentAssets";
import { StrategicAssetBlueprint } from "../../components/assetBlueprints/StrategicAssetBlueprint";
import type { AthenaAssetBlueprint } from "../../services/assetBlueprints/assetBlueprintService";
import { BLUEPRINT_ASSET_TYPES } from "../../services/assetInteractions/assetInteractionKeys";
import { UnexpectedServerResponseError } from "../../lib/safeJsonResponse";
import {
  ATHENA_REQUEST_ID_HEADER,
  isAutoRetryableFailure,
  postProspectConversation,
  toUserFacingFailure,
  type ProspectConversationClientFailure,
} from "../../services/prospectConversation/prospectConversationClient";
import { PROSPECT_CONVERSATION_LIMITS } from "../../services/prospectConversation/prospectConversationTypes";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const blueprint: AthenaAssetBlueprint = {
  id: "bp-1",
  discussion_id: "d1",
  opportunity_id: null,
  briefing_id: null,
  user_id: null,
  asset_title: "Guide",
  asset_type: "image",
  business_goal: "Meetings",
  target_audience: "Owners",
  priority: "high",
  estimated_reuse: 3,
  image_prompt: "image body",
  pdf_prompt: "pdf body",
  social_prompt: "social body",
  notes: "notes body",
  status: "ready",
  raw_json: null,
  created_at: "2026-07-18T10:00:00.000Z",
  updated_at: "2026-07-18T10:00:00.000Z",
};

describe("prospect conversation UI placement", () => {
  it("panel is collapsed by default", () => {
    const html = renderToStaticMarkup(
      createElement(ProspectConversationPanel, {
        prospectId: "p1",
        executiveVersionId: null,
        versionState: "none",
        versionLabel: null,
      }),
    );
    assert.match(html, /Ask Athena About This Prospect/);
    assert.match(html, /aria-expanded="false"/);
    assert.doesNotMatch(html, /Conversation responses do not modify/);
  });

  it("panel is mounted through afterBlueprint slot in workspace", () => {
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    assert.match(workspace, /ProspectConversationPanel/);
    assert.match(workspace, /prospectConversationSlot/);
    // Rendered in the afterBlueprint position (before Source Context grid).
    const slotIndex = workspace.indexOf("{prospectConversationSlot}");
    const afterBlueprintIndex = workspace.lastIndexOf("{afterBlueprint}");
    const sourceContextIndex = workspace.lastIndexOf('title={sourceContextTitle}');
    assert.ok(slotIndex > 0);
    assert.ok(afterBlueprintIndex > slotIndex);
    assert.ok(sourceContextIndex > afterBlueprintIndex);
  });

  it("existing Deployment Assets and Strategic Blueprint remain rendered", () => {
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    assert.match(workspace, /DeploymentAssets/);
    assert.match(workspace, /StrategicAssetBlueprint/);
    assert.match(
      workspace,
      /chrome\?\.deploymentAssetsTitle \?\? "Deployment Assets"/,
    );
    assert.match(
      workspace,
      /chrome\?\.strategicBlueprintTitle \?\? "Strategic Asset Blueprint"/,
    );

    const cards = buildDeploymentAssetCards(
      [
        {
          assetKey: "newsletter_idea",
          title: "Newsletter Idea",
          objective: "Newsletter",
          content: "Body",
        },
      ],
      "version-1",
    );
    const deploymentHtml = renderToStaticMarkup(
      createElement(DeploymentAssets, {
        assets: [
          {
            assetKey: "newsletter_idea",
            title: "Newsletter Idea",
            objective: "Newsletter",
            content: "Body",
          },
        ],
        executiveVersionId: "version-1",
      }),
    );
    assert.match(deploymentHtml, /Newsletter Idea/);
    assert.equal(cards[0]?.key, "version-1:newsletter_idea");

    const blueprintHtml = renderToStaticMarkup(
      createElement(StrategicAssetBlueprint, { blueprint }),
    );
    assert.match(blueprintHtml, /Strategic Asset Blueprint/);
    assert.match(blueprintHtml, /Image Prompt/);
  });

  it("Discuss actions pass identifiers only", () => {
    const deployment = read("components/deployment/DeploymentAssets.tsx");
    const block = read("components/assetBlueprints/CollapsiblePromptBlock.tsx");
    const blueprintSource = read(
      "components/assetBlueprints/StrategicAssetBlueprint.tsx",
    );

    assert.match(block, /Discuss with Athena/);
    assert.match(block, /assetKind/);
    assert.match(block, /assetKey/);
    assert.doesNotMatch(
      block,
      /onDiscussWithAthena\?\.\(\{[\s\S]*content:/,
    );

    assert.match(deployment, /onDiscussWithAthena/);
    assert.match(deployment, /executiveVersionId/);
    assert.match(deployment, /Identifiers only/);

    assert.match(blueprintSource, /BLUEPRINT_ASSET_TYPES/);
    assert.match(blueprintSource, /discussAssetKind=\{discussEnabled \? "blueprint"/);
    assert.doesNotMatch(blueprintSource, /image_prompt:\s*imagePromptText/);
  });

  it("switching Executive Versions switches conversation scope", () => {
    const panel = read("components/prospects/ProspectConversationPanel.tsx");
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    assert.match(
      panel,
      /key=\{`prospect-conversation-\$\{props\.prospectId\}-\$\{props\.executiveVersionId \?\? "no-version"\}`\}/,
    );
    assert.match(panel, /readProspectConversationSession/);
    assert.match(workspace, /setConversationAssetReference\(null\)/);
  });

  it("changing asset target does not mutate message history in discuss handler", () => {
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    const handlerStart = workspace.indexOf("function handleDiscussWithAthena");
    const handler = workspace.slice(handlerStart, handlerStart + 1800);
    assert.match(handler, /setConversationAssetReference/);
    assert.match(handler, /Identifiers only/);
    assert.doesNotMatch(handler, /setMessages/);
  });

  it("duplicate sends are prevented while busy", () => {
    const panel = read("components/prospects/ProspectConversationPanel.tsx");
    assert.match(panel, /if \(!trimmed \|\| busy \|\| inFlightRef\.current\)/);
    assert.match(panel, /inFlightRef/);
    assert.match(panel, /disabled=\{busy \|\| !draft\.trim\(\)\}/);
    assert.match(panel, /requestSeqRef/);
    assert.match(panel, /AbortController/);
  });

  it("1. pending Athena response appears while busy", () => {
    const panel = read("components/prospects/ProspectConversationPanel.tsx");
    assert.match(panel, /Athena is thinking…/);
    assert.match(panel, /pendingResponse/);
    assert.match(panel, /setPendingResponse\(true\)/);
    assert.match(panel, /data-athena-pending-response="true"/);
    assert.match(panel, /aria-busy=\{pendingResponse \|\| busy\}/);
    assert.match(panel, /animate-spin/);
  });

  it("2. pending response is not persisted in sessionStorage", () => {
    const panel = read("components/prospects/ProspectConversationPanel.tsx");
    // Only `messages` are written; pending is a separate non-transcript flag.
    assert.match(
      panel,
      /Pending Athena rows are never part of `messages` and are never persisted/,
    );
    const writeStart = panel.indexOf("writeProspectConversationSession(storage, {");
    assert.ok(writeStart > 0);
    const writeBlock = panel.slice(writeStart, writeStart + 280);
    assert.match(writeBlock, /messages,/);
    assert.doesNotMatch(writeBlock, /pendingResponse/);
    assert.doesNotMatch(writeBlock, /Athena is thinking/);
    assert.doesNotMatch(
      panel,
      /messages:\s*\[[\s\S]*Athena is thinking/,
    );
  });

  it("3/4/5. pending response clears on success, terminal error, and abort/unmount", () => {
    const panel = read("components/prospects/ProspectConversationPanel.tsx");
    assert.match(panel, /setPendingResponse\(false\)/);
    assert.match(panel, /abortRef\.current\?\.abort\(\)/);
    assert.match(panel, /lifecycle_abort/);
    // Unmount aborts; pending is not a persisted message and dies with the panel.
    assert.match(
      panel,
      /return \(\) => \{\s*abortRef\.current\?\.abort\(\);/,
    );
  });

  it("6. synchronous in-flight guard blocks rapid double submission", () => {
    const panel = read("components/prospects/ProspectConversationPanel.tsx");
    assert.match(panel, /const inFlightRef = useRef\(false\)/);
    assert.match(panel, /inFlightRef\.current = true/);
    assert.match(panel, /inFlightRef\.current = false/);
    assert.match(panel, /if \(!trimmed \|\| busy \|\| inFlightRef\.current\)/);
  });

  it("13. pending state remains visible during retry backoff", () => {
    const panel = read("components/prospects/ProspectConversationPanel.tsx");
    // One pending flag around the whole postProspectConversation call (includes retry).
    assert.match(panel, /setPendingResponse\(true\)/);
    assert.match(panel, /postProspectConversation\(/);
    assert.doesNotMatch(
      panel,
      /setPendingResponse\(false\).*postProspectConversation/s,
    );
  });

  it("unmount aborts in-flight requests and clear resets asset target", () => {
    const panel = read("components/prospects/ProspectConversationPanel.tsx");
    assert.match(panel, /abortRef\.current\?\.abort\(\)/);
    assert.match(
      panel,
      /return \(\) => \{\s*abortRef\.current\?\.abort\(\);/,
    );
    const clearStart = panel.indexOf("function clearConversation");
    const clearFn = panel.slice(clearStart, clearStart + 500);
    assert.match(clearFn, /setMessages\(\[\]\)/);
    assert.match(clearFn, /setAssetReference\(null\)/);
    assert.match(clearFn, /clearProspectConversationSession/);
  });

  it("workspace supplies selected Executive Version identity to the panel", () => {
    const workspace = read(
      "components/discussions/ExecutiveIntelligenceWorkspace.tsx",
    );
    assert.match(workspace, /executiveVersionId=\{viewModel\.executiveVersionId\}/);
    assert.match(workspace, /versionState=\{conversationVersionState\}/);
    assert.match(workspace, /handleDiscussWithAthena/);
  });

  it("AthenaCollapsibleSection supports controlled open for Discuss coordination", () => {
    const section = read("components/ui/AthenaCollapsibleSection.tsx");
    assert.match(section, /open\?: boolean/);
    assert.match(section, /onOpenChange\?:/);
    assert.match(section, /isControlled/);
  });

  it("blueprint discuss uses canonical asset types", () => {
    assert.equal(
      BLUEPRINT_ASSET_TYPES.image_prompt,
      "blueprint_image_prompt",
    );
    const html = renderToStaticMarkup(
      createElement(StrategicAssetBlueprint, {
        blueprint,
        copyContext: {
          sourceType: "prospect",
          sourceId: "p1",
          executiveVersionId: "v1",
        },
        onDiscussWithAthena: () => undefined,
      }),
    );
    assert.match(html, /Discuss with Athena/);
  });
});

describe("prospect conversation version behavior source contracts", () => {
  it("context assembler uses selected Executive Version snapshot getters", () => {
    const context = read(
      "services/prospectConversation/prospectConversationContext.ts",
    );
    assert.match(context, /getExecutiveVersionById/);
    assert.match(context, /loadLiveExecutiveIntelligence/);
    assert.match(context, /version\.intelligence/);
    assert.match(context, /Asset references require a selected Executive Version/);
    // Does not call publication/restore APIs.
    assert.doesNotMatch(context, /publishExecutiveIntelligenceVersion/);
    assert.doesNotMatch(context, /restoreExecutive/);
  });

  it("foreign prospect / version isolation is organization-scoped", () => {
    const route = read("app/api/prospects/[id]/conversation/route.ts");
    const context = read(
      "services/prospectConversation/prospectConversationContext.ts",
    );
    assert.match(route, /getProspectById\(id,\s*organizationId\)/);
    assert.match(
      context,
      /getExecutiveVersionById\(\s*requestedVersionId,\s*discussionId,\s*organizationId/,
    );
  });
});

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

function htmlResponse(status: number): Response {
  return new Response("<html>bad gateway</html>", {
    status,
    headers: { "Content-Type": "text/html" },
  });
}

describe("prospect conversation client retry and error classification", () => {
  it("7. exactly one automatic retry occurs for a transport failure", async () => {
    let calls = 0;
    const outcome = await postProspectConversation({
      prospectId: "p1",
      message: "hello",
      history: [],
      executiveVersionId: null,
      signal: new AbortController().signal,
      sleep: async () => undefined,
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) {
          throw new TypeError("Failed to fetch");
        }
        return jsonResponse({
          ok: true,
          message: { role: "assistant", content: "ok" },
          context: {
            prospectId: "p1",
            executiveVersionId: null,
            versionState: "none",
            versionLabel: null,
            asset: null,
          },
        });
      },
    });
    assert.equal(calls, 2);
    assert.equal(outcome.ok, true);
  });

  it("8. exactly one automatic retry occurs for approved transient edge statuses", async () => {
    for (const status of [502, 503, 504, 520, 522, 524]) {
      let calls = 0;
      const outcome = await postProspectConversation({
        prospectId: "p1",
        message: "hello",
        history: [],
        executiveVersionId: null,
        signal: new AbortController().signal,
        sleep: async () => undefined,
        fetchImpl: async () => {
          calls += 1;
          if (calls === 1) {
            return htmlResponse(status);
          }
          return jsonResponse({
            ok: true,
            message: { role: "assistant", content: `recovered-${status}` },
            context: {
              prospectId: "p1",
              executiveVersionId: null,
              versionState: "none",
              versionLabel: null,
              asset: null,
            },
          });
        },
      });
      assert.equal(calls, 2, `status ${status} should retry once`);
      assert.equal(outcome.ok, true);
    }
  });

  it("9. no automatic retry occurs for 400, 401, 403, or 404", async () => {
    const cases: Array<{ status: number; code: string; message: string }> = [
      { status: 400, code: "VALIDATION_ERROR", message: "Invalid message." },
      { status: 401, code: "UNAUTHORIZED", message: "Authentication required" },
      { status: 403, code: "FORBIDDEN", message: "Not allowed." },
      { status: 404, code: "NOT_FOUND", message: "Prospect not found." },
    ];

    for (const testCase of cases) {
      let calls = 0;
      const outcome = await postProspectConversation({
        prospectId: "p1",
        message: "hello",
        history: [],
        executiveVersionId: null,
        signal: new AbortController().signal,
        sleep: async () => {
          assert.fail(`should not sleep/retry for ${testCase.status}`);
        },
        fetchImpl: async () => {
          calls += 1;
          return jsonResponse(
            {
              ok: false,
              error: { code: testCase.code, message: testCase.message },
            },
            testCase.status,
          );
        },
      });
      assert.equal(calls, 1, `status ${testCase.status} must not retry`);
      assert.equal(outcome.ok, false);
      if (!outcome.ok) {
        assert.equal(outcome.failure.message, testCase.message);
        assert.equal(outcome.failure.retryable, false);
      }
    }
  });

  it("10. no automatic retry occurs for lifecycle AbortError", async () => {
    let calls = 0;
    const controller = new AbortController();
    controller.abort();
    const outcome = await postProspectConversation({
      prospectId: "p1",
      message: "hello",
      history: [],
      executiveVersionId: null,
      signal: controller.signal,
      sleep: async () => {
        assert.fail("lifecycle abort must not retry");
      },
      fetchImpl: async () => {
        calls += 1;
        const error = new Error("Aborted");
        error.name = "AbortError";
        throw error;
      },
    });
    assert.equal(calls, 1);
    assert.equal(outcome.ok, false);
    if (!outcome.ok) {
      assert.equal(outcome.failure.kind, "lifecycle_abort");
    }
  });

  it("11. automatic retry does not duplicate user or assistant transcript entries", async () => {
    const panel = read("components/prospects/ProspectConversationPanel.tsx");
    // User turn appended once before post; helper retries same payload/history.
    assert.match(panel, /const historyForRequest = messages;/);
    assert.match(
      panel,
      /setMessages\(\(prev\) => \[\.\.\.prev, \{ role: "user", content: trimmed \}\]\)/,
    );
    assert.match(panel, /postProspectConversation\(/);
    const client = read(
      "services/prospectConversation/prospectConversationClient.ts",
    );
    assert.match(client, /exactly one automatic retry/i);
    assert.match(client, /Reuses the same logical request payload/);
  });

  it("12. manual Retry still works after the automatic retry fails", async () => {
    let calls = 0;
    const outcome = await postProspectConversation({
      prospectId: "p1",
      message: "hello",
      history: [],
      executiveVersionId: null,
      signal: new AbortController().signal,
      sleep: async () => undefined,
      fetchImpl: async () => {
        calls += 1;
        throw new TypeError("Failed to fetch");
      },
    });
    assert.equal(calls, 2);
    assert.equal(outcome.ok, false);
    if (!outcome.ok) {
      assert.match(
        outcome.failure.message,
        /Athena could not reach the service/,
      );
    }

    const panel = read("components/prospects/ProspectConversationPanel.tsx");
    assert.match(panel, /retryMessage/);
    assert.match(panel, /onClick=\{\(\) => void sendMessage\(error\.retryMessage!\)\}/);
  });

  it("14. JSON TIMEOUT/provider errors do not become the generic network message", async () => {
    const timeoutOutcome = await postProspectConversation({
      prospectId: "p1",
      message: "hello",
      history: [],
      executiveVersionId: null,
      signal: new AbortController().signal,
      sleep: async () => undefined,
      fetchImpl: async () =>
        jsonResponse(
          {
            ok: false,
            error: {
              code: "TIMEOUT",
              message: "Athena took too long to respond. Please try again.",
              retryable: true,
            },
          },
          504,
        ),
    });
    assert.equal(timeoutOutcome.ok, false);
    if (!timeoutOutcome.ok) {
      assert.equal(timeoutOutcome.failure.code, "TIMEOUT");
      assert.match(
        timeoutOutcome.failure.message,
        /Athena took too long to respond/,
      );
      assert.doesNotMatch(
        timeoutOutcome.failure.message,
        /Network error\. Please try again\./,
      );
    }

    const providerOutcome = await postProspectConversation({
      prospectId: "p1",
      message: "hello",
      history: [],
      executiveVersionId: null,
      signal: new AbortController().signal,
      sleep: async () => undefined,
      fetchImpl: async () =>
        jsonResponse(
          {
            ok: false,
            error: {
              code: "PROVIDER_ERROR",
              message: "Athena returned an empty response.",
            },
          },
          500,
        ),
    });
    assert.equal(providerOutcome.ok, false);
    if (!providerOutcome.ok) {
      assert.equal(providerOutcome.failure.code, "PROVIDER_ERROR");
      assert.equal(
        providerOutcome.failure.message,
        "Athena returned an empty response.",
      );
      assert.doesNotMatch(
        providerOutcome.failure.message,
        /Network error\. Please try again\./,
      );
    }
  });

  it("15. unexpected non-JSON response gets the correct temporary-service copy", () => {
    const failure = toUserFacingFailure({
      kind: "unexpected_edge",
      code: "UNEXPECTED_HTTP_502",
      message: "raw",
      retryable: true,
      httpStatus: 502,
      requestId: "req-1",
    });
    assert.equal(
      failure.message,
      "Athena encountered a temporary service issue. Please try again.",
    );
    assert.ok(UnexpectedServerResponseError);
  });

  it("16. client timeout receives timeout-specific copy", () => {
    const failure = toUserFacingFailure({
      kind: "timeout",
      code: "CLIENT_TIMEOUT",
      message: "ignored",
      retryable: true,
      requestId: null,
    });
    assert.equal(
      failure.message,
      "Athena took too long to respond. Please try again.",
    );
    assert.equal(
      PROSPECT_CONVERSATION_LIMITS.clientRequestTimeoutMs >= 55_000,
      true,
    );
    assert.equal(
      PROSPECT_CONVERSATION_LIMITS.clientRequestTimeoutMs <= 58_000,
      true,
    );
  });

  it("auto-retry policy matrix matches approved transient classes", () => {
    const retryable: ProspectConversationClientFailure[] = [
      {
        kind: "transport",
        code: "TRANSPORT_ERROR",
        message: "x",
        retryable: true,
        requestId: null,
      },
      {
        kind: "unexpected_edge",
        code: "UNEXPECTED_HTTP_503",
        message: "x",
        retryable: true,
        httpStatus: 503,
        requestId: null,
      },
      {
        kind: "timeout",
        code: "TIMEOUT",
        message: "x",
        retryable: true,
        requestId: null,
      },
      {
        kind: "server",
        code: "PROVIDER_RATE_LIMITED",
        message: "x",
        retryable: true,
        requestId: null,
      },
      {
        kind: "server",
        code: "PROVIDER_ERROR",
        message: "x",
        retryable: true,
        requestId: null,
      },
    ];
    for (const failure of retryable) {
      assert.equal(isAutoRetryableFailure(failure), true);
    }

    const nonRetryable: ProspectConversationClientFailure[] = [
      {
        kind: "server",
        code: "VALIDATION_ERROR",
        message: "x",
        retryable: false,
        httpStatus: 400,
        requestId: null,
      },
      {
        kind: "auth",
        code: "UNAUTHORIZED",
        message: "Authentication required",
        retryable: false,
        httpStatus: 401,
        requestId: null,
      },
      {
        kind: "lifecycle_abort",
        code: "ABORTED",
        message: "",
        retryable: false,
        requestId: null,
      },
      {
        kind: "server",
        code: "RATE_LIMITED",
        message: "already in progress",
        retryable: false,
        httpStatus: 429,
        requestId: null,
      },
      {
        kind: "unexpected_edge",
        code: "UNEXPECTED_HTTP_500",
        message: "x",
        retryable: false,
        httpStatus: 500,
        requestId: null,
      },
    ];
    for (const failure of nonRetryable) {
      assert.equal(isAutoRetryableFailure(failure), false);
    }
  });

  it("18. request ID response header is retained after terminal failure", async () => {
    const outcome = await postProspectConversation({
      prospectId: "p1",
      message: "hello",
      history: [],
      executiveVersionId: null,
      signal: new AbortController().signal,
      sleep: async () => undefined,
      fetchImpl: async () =>
        jsonResponse(
          {
            ok: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid message.",
            },
          },
          400,
          { [ATHENA_REQUEST_ID_HEADER]: "req-support-1" },
        ),
    });
    assert.equal(outcome.ok, false);
    if (!outcome.ok) {
      assert.equal(outcome.failure.requestId, "req-support-1");
    }

    const panel = read("components/prospects/ProspectConversationPanel.tsx");
    assert.match(panel, /Support reference:/);
    assert.match(panel, /error\.requestId/);
  });
});
