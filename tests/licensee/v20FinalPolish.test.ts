import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("V20 final polish — header, dashboard UX, remove, notes, snapshot", () => {
  it("header action group keeps Logout and shows Back to Master only via origin check", () => {
    const brand = read("components/branding/AthenaBrandLink.tsx");
    const actions = read("components/auth/AthenaHeaderActions.tsx");
    const back = read("components/licensee/BackToMasterCta.tsx");
    const logout = read("components/auth/LogoutCta.tsx");

    assert.match(brand, /AthenaHeaderActions/);
    assert.doesNotMatch(brand, /BackToMasterCta|LogoutCta/);
    assert.match(actions, /role="group"/);
    assert.match(actions, /justify-end/);
    assert.match(actions, /gap-2\.5/);
    assert.match(actions, /BackToMasterCta/);
    assert.match(actions, /LogoutCta/);
    assert.match(back, /canReturnToMaster/);
    assert.match(back, /if \(!visible\)/);
    assert.match(back, /return null/);
    assert.match(logout, /action="\/api\/auth\/logout"/);
    assert.match(logout, /Log out/);
  });

  it("dashboard search, cards, primary CTA, and empty states render with Athena language", () => {
    const client = read("components/licensee/LicenseeDashboardClient.tsx");
    assert.match(client, /messages\.dashboard\.searchPlaceholder/);
    assert.match(client, /from "lucide-react"/);
    assert.match(client, /<Search className="h-5 w-5" \/>/);
    assert.match(client, /messages\.subAccountCard\.openAthena/);
    assert.match(client, /shadow-xl shadow-orange-500\/25/);
    assert.match(client, /messages\.dashboard\.createCompanyAccount/);
    assert.match(client, /messages\.dashboard\.noMatchTitle/);
    assert.match(client, /SubAccountFallbackIcon/);
    assert.match(client, /messages\.subAccountCard\.masterNote/);
    assert.match(client, /messages\.subAccountCard\.accountSnapshot/);
    assert.match(client, /messages\.common\.remove/);
    assert.match(client, /☆|★/);
  });

  it("Open Athena remains the primary CTA and Pin/Remove stay secondary", () => {
    const client = read("components/licensee/LicenseeDashboardClient.tsx");
    assert.match(
      client,
      /rounded-full bg-\[var\(--athena-orange\)\][\s\S]*messages\.subAccountCard\.openAthena/,
    );
    assert.match(client, /☆|★/);
    assert.match(client, /messages\.common\.pinned/);
    assert.match(client, /messages\.common\.remove/);
    // Pin/Remove live in expanded details; Open Athena remains on the collapsed card.
    const cardStart = client.indexOf("function SubAccountCard");
    const openIndex = client.indexOf("messages.subAccountCard.openAthena", cardStart);
    const expandedIndex = client.indexOf("expanded ? (", cardStart);
    const pinIndex = client.indexOf("messages.common.pinned", cardStart);
    assert.ok(cardStart >= 0);
    assert.ok(openIndex > cardStart && openIndex < expandedIndex);
    assert.ok(pinIndex > expandedIndex);
  });

  it("notes search and snapshot search are client-side only", () => {
    const client = read("components/licensee/LicenseeDashboardClient.tsx");
    assert.match(client, /item\.notes\.toLowerCase\(\)\.includes\(q\)/);
    assert.match(
      client,
      /item\.accountSnapshot\?\.toLowerCase\(\)\.includes\(q\)/,
    );
    assert.match(client, /item\.name\.toLowerCase\(\)\.includes\(q\)/);
    assert.match(
      client,
      /item\.accountEmail\?\.toLowerCase\(\)\.includes\(q\)/,
    );
  });

  it("snapshot resolves existing identity fields and never generates AI", () => {
    const service = read("services/licensee/licenseeSubAccounts.ts");
    assert.match(service, /resolveAccountSnapshot/);
    assert.match(service, /readIdentityExecutiveIntelligence/);
    assert.match(service, /executive_summary/);
    assert.match(service, /about_you/);
    assert.match(service, /Never generates AI summaries/);
    assert.doesNotMatch(service, /generateText|chat\.completions|createCompletion/i);
  });

  it("remove confirmation copy matches product wording", () => {
    const client = read("components/licensee/LicenseeDashboardClient.tsx");
    assert.match(client, /messages\.subAccountCard\.removeTitle/);
    assert.match(client, /interpolateTenantMessage/);
    assert.match(client, /messages\.subAccountCard\.removeBody/);
    assert.match(client, /messages\.subAccountCard\.removeKeepData/);
    assert.match(client, /messages\.subAccountCard\.removeConfirm/);
    assert.match(client, /messages\.common\.cancel/);
  });
});
