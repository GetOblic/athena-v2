/**
 * Athena Estimate V26 L7 — Licensee Master UI / product surface.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { dashboardNavItems } from "../../components/dashboard/DashboardSidebar";
import {
  ESTIMATE_TIMEFRAME_OPTIONS,
  ESTIMATE_POLL_INTERVAL_MS,
} from "../../components/licensee/estimate/estimateUiHelpers";
import {
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

function samplePackage(
  overrides: Partial<AthenaEstimatePackage> = {},
): AthenaEstimatePackage {
  return {
    schemaVersion: ATHENA_ESTIMATE_SCHEMA_VERSION,
    recommendedClientPrice: { amount: 18000, currencyCode: "USD" },
    recommendedPriceRange: {
      low: { amount: 14000, currencyCode: "USD" },
      high: { amount: 24000, currencyCode: "USD" },
    },
    scopeInterpretation: "Website rebuild with CMS.",
    pricingRationale: "Mid-market delivery complexity.",
    keyPriceDrivers: ["Scope", "Complexity", "Timeline"],
    suggestedClientPositioning: "Fixed-scope launch.",
    risksAndAssumptions: ["Assets available", "One decision maker"],
    geographyLabel: null,
    currencyResolution: "fallback",
    guidanceDisclaimer: "Guidance disclaimer.",
    instructionProvenance: {
      configKey: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
      revisionId: "rev-1",
      configured: true,
    },
    marketResearchClaimed: false,
    competitorQuotesFabricated: false,
    ...overrides,
  };
}

describe("Athena Estimate L7 — Licensee Master UI", () => {
  it("1/2. Estimate dashboard card appears; Quote card remains unchanged", () => {
    const client = read("components/licensee/LicenseeDashboardClient.tsx");
    assert.match(client, /Athena Estimate/);
    assert.match(client, /href="\/licensee\/estimate"/);
    assert.match(
      client,
      /Know what to charge your client — using Athena’s knowledge of/,
    );
    assert.match(client, /Athena Quote/);
    assert.match(client, /href="\/licensee\/quote"/);
    assert.match(
      client,
      /Submit client work for private GetOblic fulfillment pricing/,
    );
  });

  it("3. Estimate absent from ordinary tenant sidebar", () => {
    const labels = dashboardNavItems.map((item) => item.label);
    const hrefs = dashboardNavItems.map((item) => item.href);
    assert.ok(!labels.includes("Athena Estimate"));
    assert.ok(!hrefs.includes("/licensee/estimate"));
    assert.ok(!hrefs.includes("/estimate"));
  });

  it("4/31. /licensee/estimate uses canonical Master guard; ordinary users redirected", () => {
    const page = read("app/licensee/estimate/page.tsx");
    assert.match(page, /createSupabaseServerClient/);
    assert.match(page, /auth\.getUser/);
    assert.match(page, /getLicenseeAccountByUserId/);
    assert.match(page, /isAccountAccessActive/);
    assert.match(page, /This Master account has been deactivated/);
    assert.match(page, /LICENSEE_MASTER_MARKER_COOKIE/);
    assert.match(page, /master-marker\?action=refresh/);
    assert.match(page, /redirect\("\/licensee\/login"\)/);
    assert.match(page, /master-marker\?action=clear/);
    assert.doesNotMatch(page, /DashboardSidebar/);
    assert.doesNotMatch(page, /requireCurrentOrganization/);
  });

  it("5/6. sub-account selector from Master list only; no arbitrary org search", () => {
    const page = read("app/licensee/estimate/page.tsx");
    const client = read(
      "components/licensee/estimate/LicenseeEstimateClient.tsx",
    );
    assert.match(page, /listLicenseeSubAccountsForMaster/);
    assert.match(client, /resolveLicenseeSubAccountTitle/);
    assert.match(client, /subAccounts\.map/);
    assert.doesNotMatch(client, /type="search".*organization|organization search/i);
    assert.doesNotMatch(client, /\/api\/organizations/);
  });

  it("7/8. required project field + exact timeframe options", () => {
    const client = read(
      "components/licensee/estimate/LicenseeEstimateClient.tsx",
    );
    const helpers = read(
      "components/licensee/estimate/estimateUiHelpers.ts",
    );
    assert.match(client, /ESTIMATE_PROJECT_NEED_MIN_LENGTH/);
    assert.match(client, /Describe what the client needs/);
    assert.deepEqual(
      ESTIMATE_TIMEFRAME_OPTIONS.map((o) => o.value),
      ["asap", "2_4_weeks", "1_3_months", "flexible"],
    );
    assert.deepEqual(
      ESTIMATE_TIMEFRAME_OPTIONS.map((o) => o.label),
      ["ASAP", "2–4 weeks", "1–3 months", "Flexible"],
    );
    assert.match(helpers, /ASAP/);
    assert.match(helpers, /2–4 weeks/);
  });

  it("9/10. create POST uses approved payload only; enters queued/processing UX", () => {
    const client = read(
      "components/licensee/estimate/LicenseeEstimateClient.tsx",
    );
    assert.match(client, /fetch\("\/api\/licensee\/estimate"/);
    assert.match(client, /method: "POST"/);
    assert.match(client, /organizationId/);
    assert.match(client, /projectNeed/);
    assert.match(client, /additionalContext/);
    assert.match(client, /timeframe/);
    assert.doesNotMatch(client, /licenseeAccountId|package_json|instructionText/);
    assert.match(client, /Estimate queued|Generating Estimate/);
    assert.match(client, /startPolling/);
  });

  it("11/12/13. polling stops on Ready/Failed and cleans up on unmount", () => {
    const client = read(
      "components/licensee/estimate/LicenseeEstimateClient.tsx",
    );
    assert.equal(ESTIMATE_POLL_INTERVAL_MS, 5_000);
    assert.match(client, /ESTIMATE_POLL_INTERVAL_MS/);
    assert.match(client, /status === "Ready"/);
    assert.match(client, /status === "Processing Failed"/);
    assert.match(client, /stopPolling/);
    assert.match(client, /clearInterval/);
    assert.match(client, /cancelled = true/);
    assert.match(client, /stopPolling\(\)/);
  });

  it("14-19. Ready renders seven sections + price/range/geo/disclaimer; hides internals", () => {
    const client = read(
      "components/licensee/estimate/LicenseeEstimateClient.tsx",
    );
    assert.match(client, /Recommended Client Price/);
    assert.match(client, /Recommended range/);
    assert.match(client, /Scope Interpretation/);
    assert.match(client, /Pricing Rationale/);
    assert.match(client, /Key Price Drivers/);
    assert.match(client, /Suggested Client Positioning/);
    assert.match(client, /Risks & Assumptions/);
    assert.match(client, /geographyLabel/);
    assert.match(client, /currencyResolution === "fallback"/);
    assert.match(client, /guidanceDisclaimer/);
    assert.doesNotMatch(client, /marketResearchClaimed/);
    assert.doesNotMatch(client, /competitorQuotesFabricated/);
    assert.doesNotMatch(client, /instructionProvenance|revisionId|methodology/);
    assert.doesNotMatch(client, /JSON\.stringify\(pkg\)/);
  });

  it("20/21. history newest-first; historical Ready opens via GET detail (no regenerate)", () => {
    const client = read(
      "components/licensee/estimate/LicenseeEstimateClient.tsx",
    );
    assert.match(client, /new Date\(b\.createdAt\)\.getTime\(\) - new Date\(a\.createdAt\)\.getTime/);
    assert.match(client, /openHistoryItem/);
    assert.match(
      client,
      /fetch\(`\/api\/licensee\/estimate\/\$\{id\}`/,
    );
    assert.doesNotMatch(
      client,
      /openHistoryItem[\s\S]{0,400}regenerate/,
    );
  });

  it("22-24. disconnected badge; Ready remains visible; regenerate unavailable", () => {
    const client = read(
      "components/licensee/estimate/LicenseeEstimateClient.tsx",
    );
    assert.match(client, /No longer connected/);
    assert.match(client, /!item\.relationshipConnected/);
    assert.match(
      client,
      /Regeneration unavailable — this client is no longer connected/,
    );
    assert.match(
      client,
      /if \(!activeEstimate\.relationshipConnected\) return;/,
    );
  });

  it("25-27. connected regenerate uses correct route; switches to NEW id; history refreshed", () => {
    const client = read(
      "components/licensee/estimate/LicenseeEstimateClient.tsx",
    );
    assert.match(
      client,
      /\/api\/licensee\/estimate\/\$\{activeEstimate\.id\}\/regenerate/,
    );
    assert.match(client, /setActiveEstimate\(payload\.estimate\)/);
    assert.match(client, /startPolling\(payload\.estimate\.id\)/);
    assert.match(client, /void refreshHistory\(\)/);
  });

  it("28. create-another resets active form/result without destroying history", () => {
    const client = read(
      "components/licensee/estimate/LicenseeEstimateClient.tsx",
    );
    assert.match(client, /Create Another Estimate/);
    assert.match(client, /handleCreateAnother/);
    assert.match(client, /setActiveEstimate\(null\)/);
    assert.match(client, /resetFormFields/);
    assert.doesNotMatch(client, /setHistory\(\[\]\)/);
  });

  it("29/30. Quote cross-link only to /licensee/quote; no Estimate→Quote/GHL transfer", () => {
    const client = read(
      "components/licensee/estimate/LicenseeEstimateClient.tsx",
    );
    assert.match(client, /Want GetOblic to fulfill this project\?/);
    assert.match(client, /Request a Fulfillment Quote/);
    assert.match(client, /href="\/licensee\/quote"/);
    assert.doesNotMatch(client, /go\.getoblic\.com|NQfn7tnDbGyyq9JVei6Q/);
    assert.doesNotMatch(client, /prefill|transferEstimate|quotePayload/i);
  });

  it("32. responsive product structure exists", () => {
    const page = read("app/licensee/estimate/page.tsx");
    const client = read(
      "components/licensee/estimate/LicenseeEstimateClient.tsx",
    );
    assert.match(page, /max-w-5xl/);
    assert.match(client, /md:grid-cols-3/);
    assert.match(client, /md:text-5xl/);
    assert.equal(existsSync(join(ROOT, "app/licensee/estimate/page.tsx")), true);
    assert.equal(
      existsSync(
        join(ROOT, "components/licensee/estimate/LicenseeEstimateClient.tsx"),
      ),
      true,
    );
  });

  it("history summary exposes Ready recommended price without package body", () => {
    const ready: AthenaEstimate = {
      id: "est-1",
      licensee_account_id: "lic-1",
      organization_id: "org-1",
      requested_by: "master-1",
      organization_name_snapshot: "Acme",
      prospect_id: null,
      prospect_business_name_snapshot: null,
      prospect_generation_context_json: null,
      request_json: { projectNeed: "Rebuild site" },
      status: "Ready",
      generation_stage: "completed",
      package_json: samplePackage({
        recommendedClientPrice: { amount: 22000, currencyCode: "EUR" },
        geographyLabel: "France",
        currencyResolution: "derived",
      }),
      error_code: null,
      error_message: null,
      currency_code: "EUR",
      geography_label: "France",
      currency_resolution: "derived",
      instruction_config_key: ATHENA_ESTIMATE_INSTRUCTION_CONFIG_KEY,
      instruction_revision_id: "rev-1",
      instruction_configured: true,
      created_at: "2026-08-09T12:00:00.000Z",
      updated_at: "2026-08-09T12:05:00.000Z",
    };
    const summary = toPublicAthenaEstimateSummary(ready, true);
    assert.deepEqual(summary.recommendedClientPrice, {
      amount: 22000,
      currencyCode: "EUR",
    });
    assert.equal(
      "package" in (summary as unknown as Record<string, unknown>),
      false,
    );
  });
});
