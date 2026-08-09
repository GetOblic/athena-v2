/**
 * Athena Estimate V26 L12 — Hide UX + Ask Athena UI (Licensee Master only).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { dashboardNavItems } from "../../components/dashboard/DashboardSidebar";
import {
  ESTIMATE_ASK_ATHENA_DISCONNECTED_NOTICE,
  ESTIMATE_ASK_ATHENA_EXAMPLE_PROMPTS,
  ESTIMATE_ASK_ATHENA_IMMUTABLE_NOTICE,
  ESTIMATE_ASK_ATHENA_METHODOLOGY_UNAVAILABLE,
  ESTIMATE_ASK_ATHENA_TITLE,
  EstimateAskAthenaPanel,
} from "../../components/licensee/estimate/EstimateAskAthenaPanel";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Athena Estimate L12 — Hide UX + Ask Athena UI", () => {
  const client = () =>
    read("components/licensee/estimate/LicenseeEstimateClient.tsx");
  const panel = () =>
    read("components/licensee/estimate/EstimateAskAthenaPanel.tsx");

  it("1. Hide action appears in Estimate history", () => {
    const source = client();
    assert.match(source, /data-estimate-hide-action/);
    assert.match(source, /aria-label=\{`Hide Estimate for/);
    assert.match(source, /HideTrashIcon|requestHideEstimate/);
  });

  it("2/3. First click opens one-step confirmation; does not call hide API immediately", () => {
    const source = client();
    assert.match(source, /requestHideEstimate\(item\)/);
    assert.match(source, /setHideTarget\(item\)/);
    assert.match(source, /HideEstimateConfirmDialog/);
    assert.match(source, /data-estimate-hide-confirm/);
    // API call only inside confirmHideEstimate, not requestHideEstimate.
    const requestFn = source.slice(
      source.indexOf("function requestHideEstimate"),
      source.indexOf("function requestHideActiveEstimate"),
    );
    assert.doesNotMatch(requestFn, /fetch\(/);
    assert.match(source, /confirmHideEstimate/);
  });

  it("4. Confirmation copy says not permanently deleted", () => {
    const source = client();
    assert.match(
      source,
      /Hide this Estimate from your history\?/,
    );
    assert.match(
      source,
      /does not\s+permanently delete the record/,
    );
    assert.doesNotMatch(source, /cannot be undone|delete forever|permanently deleted/i);
  });

  it("5/6. Cancel does not call API; Confirm calls POST /hide", () => {
    const source = client();
    assert.match(
      source,
      /onCancel=\{\(\) => \{\s*if \(hiding\) return;\s*setHideTarget\(null\)/,
    );
    assert.match(
      source,
      /fetch\(\s*`\/api\/licensee\/estimate\/\$\{targetId\}\/hide`/,
    );
    assert.match(
      source,
      /method:\s*"POST"/,
    );
    const confirmFn = source.slice(
      source.indexOf("async function confirmHideEstimate"),
      source.indexOf("async function refreshActiveEstimateDetail"),
    );
    assert.match(confirmFn, /\/hide/);
    assert.doesNotMatch(confirmFn, /method:\s*"DELETE"/);
  });

  it("7/8. Successful hide removes from history and clears active result", () => {
    const source = client();
    assert.match(source, /removeEstimateFromVisibleState/);
    assert.match(
      source,
      /setHistory\(\(prev\) => prev\.filter\(\(item\) => item\.id !== estimateId\)\)/,
    );
    assert.match(
      source,
      /setActiveEstimate\(\(prev\) => \(prev\?\.id === estimateId \? null : prev\)\)/,
    );
  });

  it("9. Hiding Processing / active Estimate stops browser polling", () => {
    const source = client();
    const removeFn = source.slice(
      source.indexOf("function removeEstimateFromVisibleState"),
      source.indexOf("async function confirmHideEstimate"),
    );
    assert.match(removeFn, /stopPolling\(\)/);
    assert.match(removeFn, /activeIdRef\.current = null/);

    // In-flight poll must also stop on soft-hide 404 (stale/other-tab race).
    const pollFn = source.slice(
      source.indexOf("const pollDetail = useCallback"),
      source.indexOf("const startPolling = useCallback"),
    );
    assert.match(pollFn, /response\.status === 404/);
    assert.match(pollFn, /NOT_FOUND/);
    assert.match(pollFn, /stopPolling\(\)/);
    assert.match(pollFn, /setActiveEstimate/);
  });

  it("10. Hide failure keeps item visible and restores action", () => {
    const source = client();
    assert.match(source, /Could not hide this Estimate/);
    assert.match(source, /setHiding\(false\)/);
    // Failure path does not call removeEstimateFromVisibleState before return.
    const confirmFn = source.slice(
      source.indexOf("async function confirmHideEstimate"),
      source.indexOf("async function refreshActiveEstimateDetail"),
    );
    assert.match(confirmFn, /if \(!response\.ok \|\| !payload\.ok\)/);
    assert.match(
      confirmFn,
      /if \(!response\.ok \|\| !payload\.ok\) \{\s*setHideError\([\s\S]*?return;/,
    );
  });

  it("11. No DELETE request used for hide", () => {
    const source = client();
    assert.doesNotMatch(source, /method:\s*"DELETE"/);
    assert.doesNotMatch(source, /fetch\([^)]*DELETE/i);
    const hideRoute = read("app/api/licensee/estimate/[id]/hide/route.ts");
    assert.doesNotMatch(hideRoute, /export async function DELETE/);
  });

  it("12. Ask Athena visible only on Ready Estimate", () => {
    const source = client();
    assert.match(source, /EstimateAskAthenaPanel/);
    const readyBlockStart = source.indexOf(
      'activeEstimate?.status === "Ready" && pkg',
    );
    const askIndex = source.indexOf("<EstimateAskAthenaPanel");
    assert.ok(readyBlockStart > 0);
    assert.ok(askIndex > readyBlockStart);
    // Panel is nested inside the Ready package block, before History.
    const historyIndex = source.indexOf("Estimate History");
    assert.ok(askIndex < historyIndex);
  });

  it("13/14/15. Ask Athena absent for Queued / Processing / Processing Failed", () => {
    const source = client();
    const queuedBlock = source.slice(
      source.indexOf("activeEstimate && inFlight"),
      source.indexOf('activeEstimate?.status === "Processing Failed"'),
    );
    assert.doesNotMatch(queuedBlock, /EstimateAskAthenaPanel/);
    const failedBlock = source.slice(
      source.indexOf('activeEstimate?.status === "Processing Failed"'),
      source.indexOf('activeEstimate?.status === "Ready" && pkg'),
    );
    assert.doesNotMatch(failedBlock, /EstimateAskAthenaPanel/);
  });

  it("16/17/18. GET conversation loads history; switch-safe; empty state clean", () => {
    const source = panel();
    assert.match(
      source,
      /fetch\(\s*`\/api\/licensee\/estimate\/\$\{estimateId\}\/conversation`/,
    );
    assert.match(source, /cache:\s*"no-store"/);
    assert.match(source, /key=\{props\.estimateId\}/);
    assert.match(source, /mountedRef/);
    assert.match(source, /controller\.abort/);
    assert.match(source, /Loading conversation/);
    assert.match(source, /data-estimate-conversation-empty/);
    assert.match(source, /No conversation yet for this Estimate/);
  });

  it("19/20/21. send rejects empty; disables duplicate submit; POST body is { message }", () => {
    const source = panel();
    assert.match(source, /!trimmed/);
    assert.match(source, /inFlightRef\.current/);
    assert.match(source, /disabled=\{composerDisabled \|\| !draft\.trim\(\)\}/);
    assert.match(source, /JSON\.stringify\(\{\s*message:\s*trimmed\s*\}\)/);
    assert.doesNotMatch(
      source,
      /JSON\.stringify\(\{\s*message:\s*trimmed\s*,\s*history/,
    );
    assert.doesNotMatch(source, /body: JSON\.stringify\(\{[\s\S]{0,80}history/);
    assert.doesNotMatch(source, /organizationId|package_json|instructionText/);
  });

  it("22. successful send shows user + assistant via durable history refresh", () => {
    const source = panel();
    assert.match(source, /refreshHistoryAfterSend/);
    assert.match(source, /role:\s*"assistant"/);
    assert.match(source, /role:\s*"user"/);
    assert.doesNotMatch(source, /fake assistant|Invented/i);
  });

  it("23. no sessionStorage conversation authority", () => {
    assert.doesNotMatch(panel(), /sessionStorage|localStorage/);
    assert.doesNotMatch(client(), /sessionStorage|localStorage/);
  });

  it("24/25/26. disconnected keeps history readable; disables composer; reconnect permits send", () => {
    const source = panel();
    assert.match(source, /relationshipConnected/);
    assert.match(source, /ESTIMATE_ASK_ATHENA_DISCONNECTED_NOTICE/);
    assert.match(source, /data-estimate-ask-composer=\{/);
    assert.match(
      source,
      /const composerDisabled =\s*!relationshipConnected \|\| busy \|\| loadingHistory/,
    );
    assert.match(
      source,
      /!relationshipConnected \? \([\s\S]*ESTIMATE_ASK_ATHENA_DISCONNECTED_NOTICE/,
    );
    // Composer enables again when detail reports relationshipConnected=true.
    assert.match(source, /relationshipConnected\s*\?\s*"enabled"\s*:\s*"disabled"/);
    assert.equal(
      ESTIMATE_ASK_ATHENA_DISCONNECTED_NOTICE.includes("no longer connected"),
      true,
    );
    assert.equal(
      ESTIMATE_ASK_ATHENA_DISCONNECTED_NOTICE.includes("Historical conversation"),
      true,
    );
  });

  it("27. methodology-unconfigured error shown safely", () => {
    const source = panel();
    assert.match(source, /ESTIMATE_INSTRUCTION_NOT_CONFIGURED/);
    assert.match(source, /ESTIMATE_ASK_ATHENA_METHODOLOGY_UNAVAILABLE/);
    assert.equal(
      ESTIMATE_ASK_ATHENA_METHODOLOGY_UNAVAILABLE.includes("methodology"),
      true,
    );
    assert.doesNotMatch(source, /revisionId|Super Admin|instruction_revision/i);
  });

  it("28/29. 404 hidden race and NOT_READY race handled safely", () => {
    const source = panel();
    assert.match(source, /onUnavailableRef|onEstimateUnavailable/);
    assert.match(source, /onNotReadyRef|onNotReady/);
    assert.match(source, /NOT_FOUND/);
    assert.match(source, /NOT_READY/);
    assert.match(client(), /refreshActiveEstimateDetail/);
    assert.match(client(), /removeEstimateFromVisibleState/);
  });

  it("30. immutable Estimate messaging visible", () => {
    const source = panel();
    assert.match(source, /data-estimate-immutable-notice/);
    assert.match(source, /ESTIMATE_ASK_ATHENA_IMMUTABLE_NOTICE/);
    assert.equal(
      ESTIMATE_ASK_ATHENA_IMMUTABLE_NOTICE.includes("does not change this saved Estimate"),
      true,
    );
    assert.equal(
      ESTIMATE_ASK_ATHENA_IMMUTABLE_NOTICE.includes("Regenerate"),
      true,
    );
    const html = renderToStaticMarkup(
      createElement(EstimateAskAthenaPanel, {
        estimateId: "00000000-0000-4000-8000-000000000001",
        relationshipConnected: true,
      }),
    );
    // Collapsed by default; title remains visible in the disclosure header.
    assert.match(html, new RegExp(ESTIMATE_ASK_ATHENA_TITLE));
    assert.match(html, /aria-expanded="false"/);
  });

  it("31/32. chat does not trigger regeneration or mutate saved price/package", () => {
    const source = panel();
    assert.doesNotMatch(source, /regenerate|recommendedClientPrice|package_json/);
    assert.doesNotMatch(source, /setActiveEstimate|formatEstimateMoney/);
  });

  it("33. prompt starters present/usable", () => {
    assert.equal(ESTIMATE_ASK_ATHENA_EXAMPLE_PROMPTS.length, 5);
    assert.ok(
      ESTIMATE_ASK_ATHENA_EXAMPLE_PROMPTS.includes(
        "Why did you recommend this price?",
      ),
    );
    assert.match(panel(), /ESTIMATE_ASK_ATHENA_EXAMPLE_PROMPTS\.map/);
    assert.match(panel(), /setDraft\(example\)/);
  });

  it("34. history Hide button does not accidentally open row", () => {
    const source = client();
    assert.match(source, /event\.stopPropagation\(\)/);
    assert.match(source, /event\.preventDefault\(\)/);
    assert.match(source, /data-estimate-history-row/);
    // Hide control is a sibling button, not nested inside the open button.
    const rowSlice = source.slice(
      source.indexOf("data-estimate-history-row"),
      source.indexOf("Quote cross-link"),
    );
    assert.match(rowSlice, /data-estimate-hide-action/);
    assert.match(rowSlice, /openHistoryItem/);
  });

  it("35/36. Quote cross-link unchanged; no Estimate data sent to Quote", () => {
    const source = client();
    assert.match(source, /Want GetOblic to fulfill this project\?/);
    assert.match(source, /href="\/licensee\/quote"/);
    assert.match(source, /Estimate data is not transferred/);
    assert.doesNotMatch(source, /prefill|transferEstimate|quotePayload/i);
    assert.doesNotMatch(source, /go\.getoblic\.com|NQfn7tnDbGyyq9JVei6Q/);
  });

  it("37. ordinary tenant nav unchanged", () => {
    const labels = dashboardNavItems.map((item) => item.label);
    const hrefs = dashboardNavItems.map((item) => item.href);
    assert.ok(!labels.includes("Athena Estimate"));
    assert.ok(!hrefs.includes("/licensee/estimate"));
    assert.ok(!hrefs.includes("/estimate"));
  });

  it("38. responsive structural assertions", () => {
    const source = client();
    const ask = panel();
    assert.match(source, /md:flex-row/);
    assert.match(source, /flex-wrap/);
    assert.match(source, /min-w-0/);
    assert.match(ask, /overflow-x-hidden|min-w-0/);
    assert.match(ask, /break-words/);
    assert.equal(
      existsSync(
        join(ROOT, "components/licensee/estimate/EstimateAskAthenaPanel.tsx"),
      ),
      true,
    );
  });

  it("panel mounts only via Ready Estimate client wiring; no Quote/GHL coupling", () => {
    assert.match(client(), /from "@\/components\/licensee\/estimate\/EstimateAskAthenaPanel"/);
    assert.doesNotMatch(panel(), /licensee\/quote|ghl|GoHighLevel/i);
    assert.doesNotMatch(panel(), /supabase|createClient/i);
  });
});
