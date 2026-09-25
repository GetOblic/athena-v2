import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Licensee dashboard plan — read-only surface", () => {
  it("renders all three plan metrics and stays read-only", () => {
    const plan = read("components/licensee/LicenseePlanSection.tsx");
    const page = read("app/licensee/page.tsx");

    assert.match(plan, /Your Licensee Plan|LICENSEE_PLAN_TITLE/);
    assert.match(plan, /LICENSEE_PLAN_LANGUAGE_LABEL/);
    assert.match(plan, /LICENSEE_PLAN_LICENSEE_FEE_LABEL/);
    assert.match(plan, /LICENSEE_PLAN_SUB_ACCOUNT_FEE_LABEL/);
    assert.match(plan, /Languages/);
    assert.match(plan, /Wallet/);
    assert.match(plan, /Building2/);
    assert.match(page, /LicenseePlanSection/);
    assert.match(page, /buildLicenseePlanView/);

    assert.doesNotMatch(plan, /<input/);
    assert.doesNotMatch(plan, /<select/);
    assert.doesNotMatch(plan, /\bSave\b/);
    assert.doesNotMatch(plan, /\bEdit\b/);
    assert.doesNotMatch(plan, /onChange=/);
    assert.doesNotMatch(page, /<LicenseePlanSection[\s\S]*<input/);
  });

  it("does not import Super Admin mutation routes or pass the raw Master record client-side", () => {
    const plan = read("components/licensee/LicenseePlanSection.tsx");
    const page = read("app/licensee/page.tsx");
    const client = read("components/licensee/LicenseeDashboardClient.tsx");
    const identity = read("services/licensee/licenseeIdentity.ts");

    for (const source of [plan, page, client]) {
      assert.doesNotMatch(source, /updateLicenseeCommercialFeesForSuperAdmin/);
      assert.doesNotMatch(source, /\/api\/super\/accounts\/licensee/);
      assert.doesNotMatch(source, /superAdminLicenseeCommercialFees/);
      assert.doesNotMatch(source, /updateLicenseeDefaultLanguageForSuperAdmin/);
      assert.doesNotMatch(source, /LICENSEE_DEFAULT_LANGUAGE_LABEL/);
    }

    assert.doesNotMatch(
      page,
      /<LicenseeDashboardClient[\s\S]*licenseeAccount/,
    );
    assert.match(page, /buildLicenseePlanView\(/);
    assert.match(page, /defaultLanguage: licenseeAccount\.default_language/);
    assert.match(page, /licenseeMonthlyFeeUsd: licenseeAccount\.licenseeMonthlyFeeUsd/);
    assert.match(page, /subAccountMonthlyFeeUsd: licenseeAccount\.subAccountMonthlyFeeUsd/);
    assert.match(page, /getLicenseeLocalization/);
    assert.match(
      identity,
      /select\("id, user_id, email, own_company_organization_id, default_language, licensee_monthly_fee_usd, sub_account_monthly_fee_usd"\)/,
    );
    assert.match(identity, /licenseeMonthlyFeeUsd: readStoredFeeUsd/);
    assert.match(identity, /subAccountMonthlyFeeUsd: readStoredFeeUsd/);
    assert.doesNotMatch(identity, /updateLicenseeCommercialFeesForSuperAdmin/);
  });

  it("keeps sub-account cards collapsed and Open Athena on the collapsed card", () => {
    const client = read("components/licensee/LicenseeDashboardClient.tsx");
    const cardStart = client.indexOf("function SubAccountCard");
    const expandedBlock = client.indexOf("expanded ? (", cardStart);
    const openAthena = client.indexOf(
      "messages.subAccountCard.openAthena",
      cardStart,
    );
    const pinIndex = client.indexOf(
      "messages.common.pinned",
      cardStart,
    );

    assert.match(client, /useState\(false\)/);
    assert.ok(cardStart >= 0);
    assert.ok(expandedBlock > cardStart);
    assert.ok(openAthena > cardStart && openAthena < expandedBlock);
    assert.ok(pinIndex > expandedBlock);
    assert.match(client, /messages\.common\.details/);
    assert.match(client, /messages\.common\.hideDetails/);
  });

  it("preserves existing dashboard anchors after the visual refresh", () => {
    const client = read("components/licensee/LicenseeDashboardClient.tsx");
    const page = read("app/licensee/page.tsx");

    assert.match(page, /messages\.brand\.athenaBusinessLicensee/);
    assert.match(page, /messages\.common\.logout/);
    assert.match(page, /LicenseePlanSection/);
    assert.match(client, /messages\.dashboard\.searchPlaceholder/);
    assert.match(client, /messages\.dashboard\.createSubAccount/);
    assert.match(client, /messages\.dashboard\.estimateTitle/);
    assert.match(client, /href="\/licensee\/estimate"/);
    assert.match(client, /messages\.dashboard\.quoteTitle/);
    assert.match(client, /href="\/licensee\/quote"/);
    assert.match(client, /messages\.dashboard\.myCompany/);
    assert.match(client, /messages\.dashboard\.pinned/);
    assert.match(client, /messages\.dashboard\.allSubAccounts/);
    assert.match(client, /messages\.subAccountCard\.openAthena/);
    assert.match(client, /messages\.subAccountCard\.masterNote/);
    assert.match(client, /messages\.dashboard\.createCompanyAccount/);
  });

  it("places Useful Links after the plan and before search", () => {
    const page = read("app/licensee/page.tsx");
    const client = read("components/licensee/LicenseeDashboardClient.tsx");
    const plan = page.indexOf("<LicenseePlanSection");
    const links = page.indexOf("<LicenseeUsefulLinksCard");
    const dashboard = page.indexOf("<LicenseeDashboardClient");

    assert.ok(plan >= 0);
    assert.ok(links > plan);
    assert.ok(dashboard > links);
    assert.match(page, /messages\.brand\.athenaBusinessLicensee/);
    assert.match(client, /messages\.dashboard\.searchPlaceholder/);
    assert.match(client, /href="\/licensee\/estimate"/);
    assert.match(client, /href="\/licensee\/quote"/);
    assert.match(client, /messages\.dashboard\.myCompany/);
    assert.match(client, /messages\.dashboard\.pinned/);
    assert.match(client, /messages\.dashboard\.allSubAccounts/);
    assert.doesNotMatch(client, /LicenseeUsefulLinksCard|\/licensee\/useful-links/);
  });
});
