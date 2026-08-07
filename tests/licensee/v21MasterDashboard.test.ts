import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  computeAccountReadiness,
} from "../../services/licensee/licenseeAccountReadiness";
import {
  LICENSEE_SUB_ACCOUNT_DISPLAY_NAME_MAX_LENGTH,
  resolveLicenseeSubAccountTitle,
} from "../../services/licensee/licenseeSubAccountTypes";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("V21.1 — OTP login button UX restoration", () => {
  it("shared OTP submit button uses pending/disabled/spinner state", () => {
    const button = read("components/auth/OtpSubmitButton.tsx");
    assert.match(button, /"use client"/);
    assert.match(button, /useFormStatus/);
    assert.match(button, /disabled=\{pending\}/);
    assert.match(button, /aria-busy=\{pending\}/);
    assert.match(button, /animate-spin/);
    assert.match(button, /pendingLabel/);
  });

  it("ordinary and Master login reuse OTP submit UX without changing auth semantics", () => {
    const login = read("app/login/page.tsx");
    const licenseeLogin = read("app/licensee/login/page.tsx");
    const button = read("components/auth/OtpSubmitButton.tsx");

    for (const source of [login, licenseeLogin]) {
      assert.match(source, /OtpSubmitButton/);
      assert.match(source, /shouldCreateUser:\s*false/);
      assert.match(source, /signInWithOtp/);
      assert.match(source, /verifyOtp/);
      assert.doesNotMatch(source, /provisionTenantForAuthenticatedUser/);
    }

    assert.match(login, /Verify code and enter Athena/);
    assert.match(licenseeLogin, /Verify code and enter Master dashboard/);
    assert.match(licenseeLogin, /isLicenseeMasterUser/);
    assert.doesNotMatch(button, /signInWithOtp|verifyOtp|shouldCreateUser/);
  });
});

describe("V21.2 — Master display name", () => {
  it("migration adds relationship-only display_name", () => {
    const migration = read(
      "supabase/migrations/20260807000003_add_licensee_sub_account_display_name.sql",
    );
    assert.match(migration, /add column if not exists display_name/);
    assert.match(migration, /alter table licensee_sub_accounts/);
    assert.doesNotMatch(migration, /alter table organizations/);
    assert.doesNotMatch(migration, /alter table athena_identity/);
    assert.doesNotMatch(migration, /prospect_count|readiness|brain_status/);
  });

  it("display name update is Master-owned and never writes organizations.name", () => {
    const service = read("services/licensee/licenseeSubAccounts.ts");
    const route = read("app/api/licensee/sub-accounts/display-name/route.ts");
    const start = service.indexOf(
      "export async function setLicenseeSubAccountDisplayName",
    );
    const end = service.indexOf(
      "export async function setLicenseeSubAccountNotes",
      start,
    );
    const fn = service.slice(start, end);

    assert.match(fn, /display_name:\s*displayName/);
    assert.match(fn, /licensee_account_id !== licenseeAccount\.id/);
    assert.match(fn, /LICENSEE_SUB_ACCOUNT_DISPLAY_NAME_MAX_LENGTH/);
    assert.doesNotMatch(fn, /from\("organizations"\)/);
    assert.doesNotMatch(fn, /from\("athena_identity"\)/);
    assert.match(route, /setLicenseeSubAccountDisplayName/);
    assert.match(route, /jsonError\(403/);
    assert.equal(LICENSEE_SUB_ACCOUNT_DISPLAY_NAME_MAX_LENGTH, 120);
  });

  it("card title prefers Master display name and search includes both names", () => {
    assert.equal(
      resolveLicenseeSubAccountTitle({
        displayName: "VIP — Beautiful Mind",
        name: "Beautiful Mind Health",
      }),
      "VIP — Beautiful Mind",
    );
    assert.equal(
      resolveLicenseeSubAccountTitle({
        displayName: null,
        name: "Beautiful Mind Health",
      }),
      "Beautiful Mind Health",
    );

    const client = read("components/licensee/LicenseeDashboardClient.tsx");
    assert.match(client, /item\.displayName\?\.toLowerCase\(\)\.includes\(q\)/);
    assert.match(client, /item\.name\.toLowerCase\(\)\.includes\(q\)/);
    assert.match(client, /item\.notes\.toLowerCase\(\)\.includes\(q\)/);
    assert.match(
      client,
      /item\.accountSnapshot\?\.toLowerCase\(\)\.includes\(q\)/,
    );
  });
});

describe("V21.2 — operational metrics and readiness", () => {
  it("list batches tenant-scoped metric reads through authorized organization IDs", () => {
    const service = read("services/licensee/licenseeSubAccounts.ts");
    assert.match(service, /loadBatchedTenantActivity/);
    assert.match(service, /from\("prospects"\)/);
    assert.match(service, /from\("discussions"\)/);
    assert.match(service, /from\("personas"\)/);
    assert.match(service, /from\("seo_reports"\)/);
    assert.match(service, /from\("ad_campaigns"\)/);
    assert.match(service, /brain_status === "ready"/);
    assert.match(service, /deepIntelligenceHasUsableContent/);
    assert.match(service, /status === "Ready"/);
    assert.match(service, /last_visited_at/);
    assert.match(service, /lastVisitedAt/);
    assert.doesNotMatch(service, /last_sign_in_at/);
    assert.match(service, /\.in\("organization_id", organizationIds\)/);
    assert.match(service, /\.eq\("licensee_account_id", licenseeAccount\.id\)/);
    const batchStart = service.indexOf("async function loadBatchedTenantActivity");
    const batchEnd = service.indexOf(
      "export async function requireLicenseeMasterAccount",
      batchStart,
    );
    const batchFn = service.slice(batchStart, batchEnd);
    assert.match(batchFn, /from\("prospects"\)/);
    assert.doesNotMatch(batchFn, /licensee_account_id/);
    assert.doesNotMatch(service, /openai|anthropic|generateText|composePrompt/i);
  });

  it("Account Readiness is deterministic with equal-weight existing signals", () => {
    const none = computeAccountReadiness({
      brainReady: false,
      websiteIntelligenceReady: false,
      seoReady: false,
      adsReady: false,
      hasPersonas: false,
      hasProspects: false,
    });
    assert.equal(none.percent, 0);
    assert.equal(none.totalCount, 6);

    const partial = computeAccountReadiness({
      brainReady: true,
      websiteIntelligenceReady: true,
      seoReady: true,
      adsReady: false,
      hasPersonas: false,
      hasProspects: false,
    });
    assert.equal(partial.percent, 50);

    const full = computeAccountReadiness({
      brainReady: true,
      websiteIntelligenceReady: true,
      seoReady: true,
      adsReady: true,
      hasPersonas: true,
      hasProspects: true,
    });
    assert.equal(full.percent, 100);

    const readiness = read("services/licensee/licenseeAccountReadiness.ts");
    assert.doesNotMatch(readiness, /openai|anthropic|llm|generate/i);
  });

  it("dashboard collapses cards by default and keeps Open Athena visible", () => {
    const client = read("components/licensee/LicenseeDashboardClient.tsx");
    assert.match(client, /useState\(false\)/);
    assert.match(client, /Details/);
    assert.match(client, /Hide details/);
    assert.match(client, /Account Readiness/);
    assert.match(client, /Last Visit/);
    assert.match(client, /Master Display Name/);
    assert.match(client, /StatusChip/);
    assert.match(client, /Open Athena →/);

    const cardStart = client.indexOf("function SubAccountCard");
    const expandedBlock = client.indexOf("expanded ? (", cardStart);
    const openAthena = client.indexOf("Open Athena →", cardStart);
    assert.ok(cardStart >= 0);
    assert.ok(expandedBlock > cardStart);
    assert.ok(openAthena > cardStart && openAthena < expandedBlock);
  });

  it("discussion counts exclude prospect/persona bridge platforms", () => {
    const service = read("services/licensee/licenseeSubAccounts.ts");
    assert.match(service, /PROSPECT_INTELLIGENCE_PLATFORM/);
    assert.match(service, /PERSONA_INTELLIGENCE_PLATFORM/);
  });

  it("remove remains relationship-only", () => {
    const service = read("services/licensee/licenseeSubAccounts.ts");
    const start = service.indexOf(
      "export async function removeLicenseeSubAccountRelationship",
    );
    const end = service.indexOf(
      "async function assertMembershipSafeForLink",
      start,
    );
    const removeFn = service.slice(start, end);
    assert.match(removeFn, /\.delete\(\)/);
    assert.doesNotMatch(removeFn, /from\("organizations"\)/);
    assert.doesNotMatch(removeFn, /auth\.admin\.deleteUser/);
  });
});

describe("V21.3 — Last Visit (organization.last_visited_at)", () => {
  it("migration adds organizations.last_visited_at without auth backfill", () => {
    const migration = read(
      "supabase/migrations/20260807000004_add_organization_last_visited_at.sql",
    );
    assert.match(migration, /alter table organizations/);
    assert.match(migration, /add column if not exists last_visited_at timestamptz null/);
    assert.doesNotMatch(migration, /update\s+organizations/i);
    assert.doesNotMatch(migration, /from\s+auth\.users/i);
    assert.doesNotMatch(migration, /licensee_sub_accounts/);
  });

  it("human document workspace entry updates Last Visit for that organization only", () => {
    const orgService = read("services/organizationService.ts");
    const touchStart = orgService.indexOf(
      "export async function touchOrganizationLastVisitedAt",
    );
    const requireStart = orgService.indexOf(
      "export async function requireCurrentOrganizationContext",
    );
    const touchFn = orgService.slice(touchStart, requireStart);
    const requireFn = orgService.slice(requireStart);

    assert.match(touchFn, /last_visited_at:\s*new Date\(\)\.toISOString\(\)/);
    assert.match(touchFn, /\.eq\("id", id\)/);
    assert.doesNotMatch(touchFn, /licensee_account_id|licensee_sub_accounts/);

    assert.match(requireFn, /isDocumentNavigationRequest/);
    assert.match(requireFn, /touchOrganizationLastVisitedAt\(organizationId\)/);
    assert.ok(
      requireFn.indexOf("isDocumentNavigation") <
        requireFn.indexOf("touchOrganizationLastVisitedAt"),
    );
  });

  it("Master Open Athena lands on document workspace entry that records Last Visit", () => {
    const handoffRoute = read("app/api/licensee/handoff/route.ts");
    const home = read("app/page.tsx");
    const client = read("components/licensee/LicenseeDashboardClient.tsx");

    assert.match(handoffRoute, /redirectTo:\s*"\/"/);
    assert.match(handoffRoute, /requireCurrentOrganizationContext/);
    assert.match(home, /requireTenantContext/);
    assert.match(client, /window\.location\.href\s*=\s*payload\.redirectTo/);
  });

  it("Master dashboard list reads tenant Last Visit and does not write it", () => {
    const service = read("services/licensee/licenseeSubAccounts.ts");
    const page = read("app/licensee/page.tsx");
    const listStart = service.indexOf(
      "export async function listLicenseeSubAccountsForMaster",
    );
    const listEnd = service.indexOf(
      "export async function setLicenseeSubAccountPinned",
      listStart,
    );
    const listFn = service.slice(listStart, listEnd);

    assert.match(page, /listLicenseeSubAccountsForMaster/);
    assert.match(listFn, /last_visited_at/);
    assert.match(listFn, /lastVisitedAt/);
    assert.doesNotMatch(listFn, /last_sign_in_at/);
    assert.doesNotMatch(listFn, /touchOrganizationLastVisitedAt/);
    assert.doesNotMatch(listFn, /last_visited_at:\s/);
    assert.doesNotMatch(page, /touchOrganizationLastVisitedAt/);
    assert.doesNotMatch(page, /last_visited_at/);
  });

  it("auth.last_sign_in_at is no longer the displayed Last Visit source", () => {
    const types = read("services/licensee/licenseeSubAccountTypes.ts");
    const client = read("components/licensee/LicenseeDashboardClient.tsx");
    const service = read("services/licensee/licenseeSubAccounts.ts");

    assert.match(types, /lastVisitedAt:\s*string \| null/);
    assert.doesNotMatch(types, /latestAthenaAccessAt/);
    assert.match(client, /Last Visit/);
    assert.match(client, /formatLastVisit\(item\.metrics\.lastVisitedAt\)/);
    assert.match(client, /Never visited/);
    assert.doesNotMatch(client, /Latest Athena Access|Never logged in|latestAthenaAccessAt/);
    assert.doesNotMatch(service, /last_sign_in_at|latestAthenaAccessAt/);
  });

  it("worker and background generation paths do not touch Last Visit", () => {
    const worker = read("workers/athenaWorker.ts");
    const jobs = read("services/generationJobs/generationJobService.ts");
    assert.doesNotMatch(worker, /touchOrganizationLastVisitedAt|last_visited_at/);
    assert.doesNotMatch(jobs, /touchOrganizationLastVisitedAt|last_visited_at/);
  });
});
