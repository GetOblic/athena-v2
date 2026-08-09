/**
 * Athena Estimate V27 L16 — Prospect Estimate Licensee Master UX.
 *
 * Mix of:
 * - pure helper behavior tests
 * - source-contract / static wiring assertions (no RTL in this suite)
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  ESTIMATE_POLL_INTERVAL_MS,
  ESTIMATE_PROSPECT_NONE_OPTION_LABEL,
  ESTIMATE_PROSPECT_REMOVED_LABEL,
  ESTIMATE_PROSPECT_REMOVED_REGENERATE_MESSAGE,
  ESTIMATE_PROSPECT_UNAVAILABLE_REGENERATE_MESSAGE,
  ESTIMATE_REQUEST_FIELD_LIMITS,
  ESTIMATE_TIMEFRAME_OPTIONS,
  estimateHasProspectTarget,
  formatEstimateHistoryPrimaryLabel,
} from "../../components/licensee/estimate/estimateUiHelpers";
import {
  toPublicAthenaEstimateDetail,
  toPublicAthenaEstimateSummary,
} from "../../services/estimate/athenaEstimatePublic";
import {
  ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
  ATHENA_ESTIMATE_SCHEMA_VERSION,
  type AthenaEstimate,
  type AthenaEstimatePackage,
} from "../../services/estimate/athenaEstimateTypes";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function samplePackage(): AthenaEstimatePackage {
  return {
    schemaVersion: ATHENA_ESTIMATE_SCHEMA_VERSION,
    recommendedClientPrice: { amount: 12000, currencyCode: "USD" },
    recommendedPriceRange: {
      low: { amount: 9000, currencyCode: "USD" },
      high: { amount: 15000, currencyCode: "USD" },
    },
    scopeInterpretation: "Website rebuild.",
    pricingRationale: "Mid-market delivery.",
    keyPriceDrivers: ["Scope", "Timeline"],
    suggestedClientPositioning: "Fixed scope.",
    risksAndAssumptions: ["Assets available"],
    geographyLabel: "United States",
    currencyResolution: "derived",
    guidanceDisclaimer: "Guidance only.",
    instructionProvenance: {
      configKey: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
      revisionId: "rev-1",
      configured: true,
    },
    marketResearchClaimed: false,
    competitorQuotesFabricated: false,
  };
}

function baseEstimate(
  overrides: Partial<AthenaEstimate> = {},
): AthenaEstimate {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    licensee_account_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    organization_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    requested_by: "master-1",
    organization_name_snapshot: "Acme Sub-account",
    prospect_id: null,
    prospect_business_name_snapshot: null,
    prospect_generation_context_json: null,
    request_json: { projectNeed: "Rebuild the marketing site" },
    status: "Ready",
    generation_stage: "completed",
    package_json: samplePackage(),
    error_code: null,
    error_message: null,
    currency_code: "USD",
    geography_label: "United States",
    currency_resolution: "derived",
    instruction_config_key: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
    instruction_revision_id: "rev-1",
    instruction_configured: true,
    created_at: "2026-08-09T12:00:00.000Z",
    updated_at: "2026-08-09T12:00:00.000Z",
    ...overrides,
  };
}

describe("Athena Estimate L16 — Prospect Licensee Master UX", () => {
  const client = () =>
    read("components/licensee/estimate/LicenseeEstimateClient.tsx");
  const selector = () =>
    read("components/licensee/estimate/EstimateProspectSelect.tsx");
  const helpers = () =>
    read("components/licensee/estimate/estimateUiHelpers.ts");
  const askPanel = () =>
    read("components/licensee/estimate/EstimateAskAthenaPanel.tsx");

  it("1. Prospect selector appears after organization selector (source contract)", () => {
    const source = client();
    const orgIdx = source.indexOf('id="estimate-organization"');
    const prospectIdx = source.indexOf("<EstimateProspectSelect");
    assert.ok(orgIdx > 0);
    assert.ok(prospectIdx > orgIdx);
    assert.equal(
      existsSync(
        join(ROOT, "components/licensee/estimate/EstimateProspectSelect.tsx"),
      ),
      true,
    );
  });

  it("2. Default is org-only / no Prospect (helper + source)", () => {
    assert.equal(
      ESTIMATE_PROSPECT_NONE_OPTION_LABEL,
      "No prospect — estimate for this client",
    );
    const selectSource = selector();
    assert.match(selectSource, /ESTIMATE_PROSPECT_NONE_OPTION_LABEL/);
    assert.match(selectSource, /value=\{value \?\? ""\}/);
    const clientSource = client();
    assert.match(clientSource, /useState<string \| null>\(null\)/);
    assert.match(
      clientSource,
      /if \(prospectId\) body\.prospectId = prospectId/,
    );
  });

  it("3/4/6. Prospect list loads for selected org; businessName only; org change refetch", () => {
    const selectSource = selector();
    assert.match(
      selectSource,
      /\/api\/licensee\/estimate\/prospects\?organizationId=/,
    );
    assert.match(selectSource, /encodeURIComponent\(orgId\)/);
    assert.match(selectSource, /businessName/);
    assert.doesNotMatch(selectSource, /email|phone|whatsapp|website_intelligence/);
    assert.doesNotMatch(selectSource, /\/api\/prospects\//);
    assert.match(selectSource, /\[organizationId\]/);
    assert.match(client(), /setOrganizationId\(event\.target\.value\)/);
    assert.match(client(), /setProspectId\(null\)/);
  });

  it("5/7. Org change clears Prospect; stale responses aborted (source contract)", () => {
    const selectSource = selector();
    const clientSource = client();
    // Parent clears selection + remounts selector on org change (race-safe).
    assert.match(clientSource, /key=\{organizationId\}/);
    assert.match(clientSource, /setProspectId\(null\)/);
    assert.match(selectSource, /AbortController/);
    assert.match(selectSource, /controller\.abort\(\)/);
    assert.match(selectSource, /signal:\s*controller\.signal/);
    assert.match(selectSource, /controller\.signal\.aborted/);
  });

  it("8/9/10. Loading disables selector; empty/error preserve org-only", () => {
    const selectSource = selector();
    assert.match(
      selectSource,
      /disabled \|\| loading \|\| status === "error"/,
    );
    assert.match(selectSource, /Loading Prospects/);
    assert.match(selectSource, /No Prospects in this sub-account/);
    assert.match(
      selectSource,
      /Could not load Prospects for this sub-account/,
    );
    // Generate remains available — create button not gated on Prospect load.
    const clientSource = client();
    assert.match(
      clientSource,
      /disabled=\{submitting \|\| subAccounts\.length === 0\}/,
    );
    assert.doesNotMatch(
      clientSource,
      /disabled=\{submitting \|\| .*prospect/,
    );
  });

  it("11/12/13. Create payload: prospectId when targeted; omitted for org-only; no snapshots", () => {
    const clientSource = client();
    const submitStart = clientSource.indexOf("async function handleSubmit");
    const submitEnd = clientSource.indexOf(
      "async function openHistoryItem",
      submitStart,
    );
    const submitFn = clientSource.slice(submitStart, submitEnd);
    assert.match(submitFn, /if \(prospectId\) body\.prospectId = prospectId/);
    assert.doesNotMatch(submitFn, /prospectBusinessNameSnapshot/);
    assert.doesNotMatch(submitFn, /prospect_generation_context/);
    assert.doesNotMatch(submitFn, /composedText|website_intelligence/);
    assert.doesNotMatch(submitFn, /prospectId:\s*null/);
  });

  it("14. Existing request fields unchanged", () => {
    const clientSource = client();
    assert.match(clientSource, /estimate-project-need/);
    assert.match(clientSource, /estimate-additional-context/);
    assert.match(clientSource, /estimate-timeframe/);
    assert.equal(ESTIMATE_REQUEST_FIELD_LIMITS.projectNeed > 0, true);
    assert.ok(ESTIMATE_TIMEFRAME_OPTIONS.length >= 4);
  });

  it("15/16/17. Active Estimate display hierarchy (source + helpers)", () => {
    const clientSource = client();
    assert.match(clientSource, /data-estimate-target-display="prospect"/);
    assert.match(clientSource, /data-estimate-target-display="organization"/);
    assert.match(clientSource, /Estimate for/);
    assert.match(clientSource, /prospectBusinessNameSnapshot/);
    assert.match(clientSource, /via\s*\{/);
    assert.match(clientSource, /organizationNameSnapshot/);

    assert.equal(
      formatEstimateHistoryPrimaryLabel({
        organizationNameSnapshot: "Acme Sub-account",
        prospectBusinessNameSnapshot: null,
      }),
      "Acme Sub-account",
    );
    assert.equal(
      formatEstimateHistoryPrimaryLabel({
        organizationNameSnapshot: "Acme Sub-account",
        prospectBusinessNameSnapshot: "ABC Dental",
      }),
      "ABC Dental",
    );
  });

  it("18/19/20. History org-only unchanged; Prospect uses frozen snapshot; rename-safe", () => {
    const orgOnly = toPublicAthenaEstimateSummary(baseEstimate(), true);
    assert.equal(
      formatEstimateHistoryPrimaryLabel(orgOnly),
      "Acme Sub-account",
    );
    assert.equal(estimateHasProspectTarget(orgOnly), false);

    const prospect = toPublicAthenaEstimateSummary(
      baseEstimate({
        prospect_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        prospect_business_name_snapshot: "ABC Dental",
      }),
      true,
    );
    assert.equal(formatEstimateHistoryPrimaryLabel(prospect), "ABC Dental");
    assert.equal(prospect.prospectBusinessNameSnapshot, "ABC Dental");
    // Rename after create does not rewrite the frozen snapshot on the DTO.
    assert.notEqual(prospect.prospectBusinessNameSnapshot, "Renamed Dental");

    const clientSource = client();
    assert.match(clientSource, /formatEstimateHistoryPrimaryLabel\(item\)/);
    assert.match(clientSource, /via \{item\.organizationNameSnapshot\}/);
  });

  it("21/22/23/24/25. Removed Prospect UX: badge, openable Ready, hide ok, regenerate blocked", () => {
    const removed = toPublicAthenaEstimateDetail(
      baseEstimate({
        prospect_id: null,
        prospect_business_name_snapshot: "ABC Dental",
        status: "Ready",
        package_json: samplePackage(),
      }),
      true,
    );
    assert.equal(removed.prospectRemoved, true);
    assert.equal(removed.package?.schemaVersion, "estimate_v1");
    assert.equal(
      formatEstimateHistoryPrimaryLabel(removed),
      "ABC Dental",
    );

    assert.equal(ESTIMATE_PROSPECT_REMOVED_LABEL, "Prospect removed");
    const clientSource = client();
    assert.match(clientSource, /ESTIMATE_PROSPECT_REMOVED_LABEL/);
    assert.match(clientSource, /data-estimate-prospect-removed/);
    assert.match(
      clientSource,
      /ESTIMATE_PROSPECT_REMOVED_REGENERATE_MESSAGE/,
    );
    assert.match(
      clientSource,
      /data-estimate-regenerate-unavailable="prospect-removed"/,
    );
    assert.match(clientSource, /if \(activeEstimate\.prospectRemoved\)/);
    // Hide remains available for active estimate regardless of Prospect state.
    assert.match(clientSource, /requestHideActiveEstimate/);
    assert.doesNotMatch(
      clientSource,
      /requestHideActiveEstimate[\s\S]{0,200}prospectRemoved/,
    );
  });

  it("26/27. Active Prospect regenerate available; 409 handled clearly", () => {
    const clientSource = client();
    assert.match(clientSource, /data-estimate-regenerate-action/);
    assert.match(
      clientSource,
      /!activeEstimate\.prospectRemoved \?/,
    );
    assert.match(
      clientSource,
      /activeEstimate\.prospectRemoved \?\s*\(/,
    );
    const regenStart = clientSource.indexOf("async function handleRegenerate");
    const regenFn = clientSource.slice(
      regenStart,
      clientSource.indexOf("function requestHideEstimate", regenStart),
    );
    assert.match(regenFn, /response\.status === 409/);
    assert.match(regenFn, /PROSPECT_TARGET_UNAVAILABLE/);
    assert.match(
      regenFn,
      /ESTIMATE_PROSPECT_UNAVAILABLE_REGENERATE_MESSAGE/,
    );
    assert.equal(
      ESTIMATE_PROSPECT_REMOVED_REGENERATE_MESSAGE.includes("cannot be regenerated"),
      true,
    );
    assert.equal(
      ESTIMATE_PROSPECT_UNAVAILABLE_REGENERATE_MESSAGE.includes(
        "no longer available",
      ),
      true,
    );
  });

  it("28/29. Polling remains Estimate-status based; hide clears polling", () => {
    const clientSource = client();
    assert.equal(ESTIMATE_POLL_INTERVAL_MS, 5_000);
    assert.match(clientSource, /isInFlightStatus/);
    assert.match(clientSource, /startPolling/);
    assert.match(clientSource, /stopPolling/);
    assert.doesNotMatch(clientSource, /poll.*prospect|prospect.*poll/i);
    assert.match(
      clientSource,
      /removeEstimateFromVisibleState[\s\S]*stopPolling/,
    );
  });

  it("30/31. Ask Athena availability unchanged; no L16 Ask Athena wiring", () => {
    const clientSource = client();
    assert.match(
      clientSource,
      /<EstimateAskAthenaPanel[\s\S]{0,120}estimateId=\{activeEstimate\.id\}/,
    );
    assert.match(
      clientSource,
      /relationshipConnected=\{activeEstimate\.relationshipConnected\}/,
    );
    // Ask Athena props remain Ready/relationship only — no Prospect props.
    const askStart = clientSource.indexOf("<EstimateAskAthenaPanel");
    const askBlock = clientSource.slice(askStart, askStart + 350);
    assert.doesNotMatch(askBlock, /prospectId|prospectRemoved|prospectBusiness/);

    const panel = askPanel();
    assert.doesNotMatch(panel, /prospect_generation_context/);
    assert.doesNotMatch(panel, /composeEstimateProspectGenerationContext/);
    assert.doesNotMatch(
      panel,
      /prospectBusinessNameSnapshot|prospectRemoved/,
    );

    const conversation = read(
      "services/estimateConversation/estimateConversationContext.ts",
    );
    // L17: server-side freeze is allowed; live Prospect compose / fetch is not.
    assert.match(conversation, /prospect_generation_context_json/);
    assert.doesNotMatch(conversation, /composeEstimateProspectGenerationContext/);
    assert.doesNotMatch(conversation, /getProspectById/);
  });

  it("32. Full generation context never rendered/exposed", () => {
    const clientSource = client();
    const selectSource = selector();
    assert.doesNotMatch(clientSource, /prospect_generation_context/);
    assert.doesNotMatch(clientSource, /composedText|EstimateProspectGenerationContext/);
    assert.doesNotMatch(selectSource, /prospect_generation_context|composedText/);
    assert.doesNotMatch(helpers(), /prospect_generation_context/);

    const detail = toPublicAthenaEstimateDetail(
      baseEstimate({
        prospect_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        prospect_business_name_snapshot: "ABC Dental",
        prospect_generation_context_json: {
          schemaVersion: "estimate_prospect_context_v1",
          prospectId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          businessName: "ABC Dental",
          capturedAt: "2026-08-09T12:00:00.000Z",
          composedText: "secret freeze",
          available: {
            profile: true,
            notesOrAdditionalContext: false,
            adsContent: false,
            websiteIntelligence: false,
            executiveIntelligence: false,
            strategicAssetBlueprint: false,
          },
          sources: { linkedDiscussionId: null, executiveVersionId: null },
        },
      }),
      true,
    );
    assert.equal(
      "prospectGenerationContext" in
        (detail as unknown as Record<string, unknown>),
      false,
    );
    assert.equal(
      "prospect_generation_context_json" in
        (detail as unknown as Record<string, unknown>),
      false,
    );
  });

  it("37. Quote/SEO/Ads non-interference markers", () => {
    assert.doesNotMatch(
      read("app/licensee/quote/page.tsx"),
      /EstimateProspectSelect|listAthenaEstimateProspectsForMaster/,
    );
    assert.doesNotMatch(
      read("services/seo/seoContextComposer.ts"),
      /EstimateProspectSelect/,
    );
    assert.equal(
      existsSync(join(ROOT, "app/api/licensee/estimate/prospects/route.ts")),
      true,
    );
  });
});
