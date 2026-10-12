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

  it("places Commercial Tools before search and separates GetOblic from client sales", () => {
    const client = read("components/licensee/LicenseeDashboardClient.tsx");
    const commercial = client.indexOf("messages.dashboard.commercialToolsTitle");
    const getOblic = client.indexOf("messages.dashboard.getOblicServicesTitle");
    const quote = client.indexOf('href="/licensee/quote"');
    const clientSales = client.indexOf("messages.dashboard.clientSalesTitle");
    const estimate = client.indexOf('href="/licensee/estimate"');
    const clientQuotes = client.indexOf('href="/licensee/client-quotes"');
    const invoices = client.indexOf('href="/licensee/invoices"');
    const search = client.indexOf("messages.dashboard.searchPlaceholder");
    const create = client.indexOf("messages.dashboard.createSubAccount");
    const notice = client.indexOf("{notice ?");
    const myCompany = client.indexOf("messages.dashboard.myCompany");

    assert.ok(commercial >= 0 && commercial < getOblic);
    assert.ok(getOblic < quote && quote < clientSales);
    assert.ok(
      clientSales < estimate && estimate < clientQuotes && clientQuotes < invoices,
    );
    assert.ok(invoices < search && search < create);
    assert.ok(create < notice && notice < myCompany);

    const getOblicBlock = client.slice(getOblic, clientSales);
    const salesBlock = client.slice(clientSales, search);
    assert.match(getOblicBlock, /href="\/licensee\/quote"/);
    assert.match(getOblicBlock, /LICENSEE_QUOTE_CARD_CLASS/);
    assert.match(getOblicBlock, /LICENSEE_ICON_WELL\.violet/);
    assert.match(getOblicBlock, /<FileText /);
    assert.match(getOblicBlock, /messages\.dashboard\.quoteTitle/);
    assert.match(getOblicBlock, /messages\.dashboard\.quoteDescription/);
    assert.match(getOblicBlock, /messages\.common\.open/);
    assert.doesNotMatch(
      getOblicBlock,
      /href="\/licensee\/(estimate|client-quotes|invoices)"/,
    );

    assert.doesNotMatch(salesBlock, /href="\/licensee\/quote"/);
    assert.match(salesBlock, /grid min-w-0 grid-cols-1 gap-4 md:grid-cols-3/);
    assert.doesNotMatch(salesBlock, /overflow-x|min-w-max|whitespace-nowrap/);
    assert.match(salesBlock, /LICENSEE_ESTIMATE_CARD_CLASS/);
    assert.match(salesBlock, /LICENSEE_ICON_WELL\.cyan/);
    assert.match(salesBlock, /<Calculator /);
    assert.match(salesBlock, /messages\.dashboard\.estimateTitle/);
    assert.match(salesBlock, /LICENSEE_CLIENT_QUOTES_CARD_CLASS/);
    assert.match(salesBlock, /LICENSEE_ICON_WELL\.warm/);
    assert.match(salesBlock, /<Receipt /);
    assert.match(salesBlock, /messages\.dashboard\.clientQuotesTitle/);
    assert.match(salesBlock, /LICENSEE_INVOICES_CARD_CLASS/);
    assert.match(salesBlock, /LICENSEE_ICON_WELL\.green/);
    assert.match(salesBlock, /<Banknote /);
    assert.match(salesBlock, /messages\.dashboard\.invoicesTitle/);
    assert.match(salesBlock, /data-licensee-nav="invoices"/);
    assert.equal((salesBlock.match(/<ClientFlowChevron \/>/g) ?? []).length, 2);
    assert.ok(
      salesBlock.lastIndexOf("<ClientFlowChevron />") <
        salesBlock.indexOf('href="/licensee/invoices"'),
    );

    const chevron = client.slice(
      client.indexOf("function ClientFlowChevron"),
      client.indexOf("function EmptyState"),
    );
    assert.match(chevron, /<ChevronRight/);
    assert.match(chevron, /aria-hidden="true"/);
    assert.match(chevron, /\bhidden\b/);
    assert.match(chevron, /md:block/);
    assert.doesNotMatch(chevron, /<Link|<button|<a[\s>]/);
    assert.equal((client.match(/<Plus\b/g) ?? []).length, 1);
    assert.match(client, /messages\.dashboard\.pinned/);
    assert.match(client, /messages\.dashboard\.allSubAccounts/);
  });
});
