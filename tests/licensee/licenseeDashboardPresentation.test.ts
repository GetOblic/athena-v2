import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  buildLicenseePlanView,
  formatLicenseePlanMonthlyFee,
  formatLicenseePlanSubAccountFee,
  LICENSEE_PLAN_LANGUAGE_LABEL,
  LICENSEE_PLAN_LANGUAGE_SUPPORT,
  LICENSEE_PLAN_LICENSEE_FEE_LABEL,
  LICENSEE_PLAN_SUB_ACCOUNT_FEE_LABEL,
  LICENSEE_PLAN_TITLE,
} from "../../lib/licensee/licenseeDashboardPresentation";
import { organizationLanguageLabel } from "../../services/organizationLanguage";
import { formatLicenseeCommercialFeeUsd } from "../../services/superAdmin/superAdminLicenseeCommercialFeeTypes";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Licensee dashboard presentation — language and fees", () => {
  it("uses canonical organization language labels without a second map", () => {
    const presentation = read("lib/licensee/licenseeDashboardPresentation.ts");
    const plan = read("components/licensee/LicenseePlanSection.tsx");

    assert.equal(organizationLanguageLabel("en"), "English");
    assert.equal(organizationLanguageLabel("fr"), "Français");
    assert.equal(organizationLanguageLabel("es"), "Español");
    assert.equal(organizationLanguageLabel("it"), "Italiano");
    assert.equal(organizationLanguageLabel("de"), "Deutsch");
    assert.equal(organizationLanguageLabel("pt"), "Português");

    assert.equal(
      buildLicenseePlanView({
        defaultLanguage: "fr",
        licenseeMonthlyFeeUsd: 0,
        subAccountMonthlyFeeUsd: 0,
      }).defaultLanguageLabel,
      "Français",
    );
    assert.equal(
      buildLicenseePlanView({
        defaultLanguage: "en",
        licenseeMonthlyFeeUsd: 0,
        subAccountMonthlyFeeUsd: 0,
      }).defaultLanguageLabel,
      "English",
    );

    assert.match(presentation, /organizationLanguageLabel/);
    assert.doesNotMatch(presentation, /\["en", "fr", "es", "it", "de", "pt"\]/);
    assert.doesNotMatch(presentation, /ORGANIZATION_LANGUAGE_LABELS\s*=/);
    assert.doesNotMatch(plan, /\["en", "fr", "es", "it", "de", "pt"\]/);
    assert.doesNotMatch(presentation, /identityPagePresentation|SUPER_ADMIN_/);
    assert.doesNotMatch(plan, /identityPagePresentation|SUPER_ADMIN_|TenantAppShell/);
  });

  it("formats zero and nonzero unit rates through the shared commercial fee formatter", () => {
    assert.equal(formatLicenseeCommercialFeeUsd(0), "$0.00");
    assert.equal(formatLicenseeCommercialFeeUsd(10.5), "$10.50");
    assert.equal(formatLicenseePlanMonthlyFee(0), "$0.00 / month");
    assert.equal(
      formatLicenseePlanSubAccountFee(0),
      "$0.00 / month per active sub-account",
    );
    assert.equal(formatLicenseePlanMonthlyFee(10.5), "$10.50 / month");
    assert.equal(
      formatLicenseePlanSubAccountFee(10.5),
      "$10.50 / month per active sub-account",
    );

    const view = buildLicenseePlanView({
      defaultLanguage: "de",
      licenseeMonthlyFeeUsd: 0,
      subAccountMonthlyFeeUsd: 10.5,
    });
    assert.equal(view.licenseeFeeDisplay, "$0.00 / month");
    assert.equal(
      view.subAccountFeeDisplay,
      "$10.50 / month per active sub-account",
    );
    assert.equal(view.languageSupport, LICENSEE_PLAN_LANGUAGE_SUPPORT);
    assert.equal(view.defaultLanguageLabel, "Deutsch");

    const presentation = read("lib/licensee/licenseeDashboardPresentation.ts");
    assert.match(presentation, /formatLicenseeCommercialFeeUsd/);
    assert.doesNotMatch(presentation, /toLocaleString\(/);
    assert.doesNotMatch(presentation, /Intl\.NumberFormat/);
    assert.doesNotMatch(presentation, /\$\{\s*value\.toFixed/);
  });

  it("exposes the three Licensee Plan metric headings", () => {
    assert.equal(LICENSEE_PLAN_TITLE, "Your Licensee Plan");
    assert.equal(LICENSEE_PLAN_LANGUAGE_LABEL, "Default Language");
    assert.equal(LICENSEE_PLAN_LICENSEE_FEE_LABEL, "Licensee Fee");
    assert.equal(LICENSEE_PLAN_SUB_ACCOUNT_FEE_LABEL, "Sub-account Fee");
    assert.equal(
      LICENSEE_PLAN_LANGUAGE_SUPPORT,
      "Default for new sub-accounts",
    );
  });
});
