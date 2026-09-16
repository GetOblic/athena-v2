import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  buildSuperAdminDashboardView,
  DEFAULT_SUPER_ADMIN_DOMAIN,
  listOrdinaryAthenaAccounts,
  SUPER_ADMIN_DOMAIN_ITEMS,
} from "../../lib/superAdmin/superAdminDashboardView";
import type { ManageableAccount } from "../../services/superAdmin/superAdminAccounts";
import type {
  SuperAdminGetOblicDirectoryAllocationModel,
  SuperAdminGetOblicDirectoryAllocationRow,
} from "../../services/superAdmin/superAdminGetOblicDirectory";
import type { LicenseeCommercialFees } from "../../services/superAdmin/superAdminLicenseeCommercialFeeTypes";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function walkSourceFiles(relativeDir: string): string[] {
  const abs = join(ROOT, relativeDir);
  const entries = readdirSync(abs, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relative = join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name === "tests" ||
        entry.name === ".next" ||
        entry.name === "dist"
      ) {
        continue;
      }
      files.push(...walkSourceFiles(relative));
      continue;
    }
    if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      files.push(relative);
    }
  }
  return files;
}

const SUPER_PRESENTATION_FILES = [
  "lib/superAdmin/superAdminPresentation.ts",
  "lib/superAdmin/superAdminDashboardView.ts",
  "components/superAdmin/SuperAdminDomainNav.tsx",
  "components/superAdmin/SuperAdminOverviewSection.tsx",
  "components/superAdmin/SuperAdminLicenseeDirectory.tsx",
  "components/superAdmin/SuperAdminLicenseeCard.tsx",
  "components/superAdmin/SuperAdminSubAccountCard.tsx",
  "components/superAdmin/SuperAdminAthenaAccountsSection.tsx",
  "components/superAdmin/SuperAdminCreateAccountPanel.tsx",
  "components/superAdmin/SuperAdminSystemConfiguration.tsx",
  "components/superAdmin/SuperAdminFlashNotices.tsx",
] as const;

function sampleSubAccount(
  overrides: Partial<SuperAdminGetOblicDirectoryAllocationRow> = {},
): SuperAdminGetOblicDirectoryAllocationRow {
  return {
    licenseeAccountId: "lic-1",
    organizationId: "org-1",
    organizationName: "North Clinic",
    displayAlias: null,
    isOwnCompany: true,
    configured: true,
    listingCapacity: 3,
    currentlyHeld: 1,
    available: 2,
    getoblicAccountEmail: "owner@getoblic.com",
    wordpressUserId: 12,
    ...overrides,
  };
}

function sampleAccounts(): ManageableAccount[] {
  return [
    {
      userId: "lm-1",
      email: "master-a@example.com",
      accountType: "licensee",
      displayName: "master-a@example.com",
      organizationId: null,
      licenseeAccountId: "lic-1",
      status: "active",
      athenaPlan: "full",
    },
    {
      userId: "lm-2",
      email: "master-empty@example.com",
      accountType: "licensee",
      displayName: "master-empty@example.com",
      organizationId: null,
      licenseeAccountId: "lic-empty",
      status: "deactivated",
      athenaPlan: "full",
    },
    {
      userId: "ath-1",
      email: "owner@example.com",
      accountType: "athena",
      displayName: "Ordinary Studio",
      organizationId: "org-athena",
      licenseeAccountId: null,
      status: "active",
      athenaPlan: "full",
    },
  ];
}

function sampleDirectory(): SuperAdminGetOblicDirectoryAllocationModel {
  return {
    groups: [
      {
        licenseeAccountId: "lic-1",
        masterEmail: "master-a@example.com",
        ownCompanyOrganizationId: "org-1",
        subAccounts: [
          sampleSubAccount(),
          sampleSubAccount({
            organizationId: "org-2",
            organizationName: "South Clinic",
            isOwnCompany: false,
            configured: false,
            listingCapacity: null,
            currentlyHeld: null,
            available: null,
            getoblicAccountEmail: null,
            wordpressUserId: null,
          }),
        ],
      },
      {
        licenseeAccountId: "lic-empty",
        masterEmail: "master-empty@example.com",
        ownCompanyOrganizationId: null,
        subAccounts: [],
      },
    ],
  };
}

function sampleFees(): LicenseeCommercialFees[] {
  return [
    {
      licenseeAccountId: "lic-1",
      masterEmail: "master-a@example.com",
      licenseeMonthlyFeeUsd: 10.5,
      subAccountMonthlyFeeUsd: 4,
    },
  ];
}

describe("Super Admin dashboard presentation — information architecture", () => {
  it("keeps four Super-only domains on /super with Overview as default", () => {
    assert.deepEqual(
      SUPER_ADMIN_DOMAIN_ITEMS.map((item) => item.id),
      ["overview", "licensees", "athena-accounts", "system-configuration"],
    );
    assert.equal(DEFAULT_SUPER_ADMIN_DOMAIN, "overview");
    const page = read("app/super/page.tsx");
    const nav = read("components/superAdmin/SuperAdminDomainNav.tsx");
    const client = read("components/superAdmin/SuperAdminDashboardClient.tsx");
    assert.doesNotMatch(page, /TenantAppShell|TenantSidebar|dashboardNavItems/);
    assert.doesNotMatch(nav, /TenantAppShell|TenantSidebar|dashboardNavItems/);
    assert.doesNotMatch(client, /TenantAppShell|TenantSidebar|dashboardNavItems/);
    assert.match(page, /max-w-\[88rem\]/);
    assert.doesNotMatch(page, /max-w-6xl/);
    assert.match(client, /DEFAULT_SUPER_ADMIN_DOMAIN/);
    assert.match(nav, /SUPER_ADMIN_DOMAIN_ITEMS/);
    assert.match(read("lib/superAdmin/superAdminDashboardView.ts"), /label: "Overview"/);
    assert.match(read("lib/superAdmin/superAdminDashboardView.ts"), /label: "Licensees"/);
    assert.match(read("lib/superAdmin/superAdminDashboardView.ts"), /label: "Athena Accounts"/);
    assert.match(
      read("lib/superAdmin/superAdminDashboardView.ts"),
      /label: "System Configuration"/,
    );
  });

  it("joins Licensees by licenseeAccountId and keeps a zero-sub-account Licensee visible and manageable", () => {
    const view = buildSuperAdminDashboardView({
      accounts: sampleAccounts(),
      directoryAllocations: sampleDirectory(),
      licenseeCommercialFees: sampleFees(),
      licenseeDefaultLanguages: [
        {
          licenseeAccountId: "lic-1",
          masterEmail: "master-a@example.com",
          defaultLanguage: "fr",
        },
      ],
      trendSocialPromptConfigured: true,
      estimateMethodologyConfigured: false,
    });

    assert.equal(view.licensees.length, 2);
    assert.deepEqual(
      view.licensees.map((row) => row.licenseeAccountId),
      ["lic-1", "lic-empty"],
    );

    const populated = view.licensees[0];
    assert.equal(populated?.userId, "lm-1");
    assert.equal(populated?.licenseeMonthlyFeeUsd, 10.5);
    assert.equal(populated?.subAccountMonthlyFeeUsd, 4);
    assert.equal(populated?.defaultLanguage, "fr");
    assert.equal(populated?.subAccountCount, 2);
    assert.equal(populated?.hasOwnCompany, true);
    assert.equal(populated?.getoblicRollup.configuredCount, 1);
    assert.equal(populated?.getoblicRollup.unconfiguredCount, 1);

    const empty = view.licensees[1];
    assert.ok(empty);
    assert.equal(empty.subAccountCount, 0);
    assert.equal(empty.userId, "lm-2");
    assert.equal(empty.status, "deactivated");
    assert.equal(empty.licenseeMonthlyFeeUsd, 0);
    assert.equal(empty.subAccountMonthlyFeeUsd, 0);
    assert.equal(empty.defaultLanguage, "en");
    assert.equal(empty.getoblicRollup.label, "No GetOblic organizations");
    assert.equal(view.overview.licenseesWithZeroSubAccounts, 1);
  });

  it("filters Athena Accounts to ordinary accounts and keeps Licensee Masters out of that domain", () => {
    const accounts = sampleAccounts();
    const ordinary = listOrdinaryAthenaAccounts(accounts);
    assert.equal(ordinary.length, 1);
    assert.equal(ordinary[0]?.accountType, "athena");
    assert.equal(
      ordinary.some((account) => account.accountType === "licensee"),
      false,
    );

    const view = buildSuperAdminDashboardView({
      accounts,
      directoryAllocations: sampleDirectory(),
      licenseeCommercialFees: sampleFees(),
      trendSocialPromptConfigured: false,
      estimateMethodologyConfigured: false,
    });
    assert.equal(view.athenaAccounts.length, 1);
    assert.equal(view.athenaAccounts[0]?.userId, "ath-1");
    assert.equal(view.athenaAccounts[0]?.accountType, "athena");
    assert.equal(view.athenaAccounts[0]?.athenaPlan, "full");
    assert.equal(view.overview.ordinaryAthenaAccounts, 1);
    assert.equal(view.overview.licenseeMasters, 2);
    assert.equal(view.overview.getoblicUnconfigured, 1);
    assert.equal(view.overview.trendSocialPromptConfigured, false);
  });
});

describe("Super Admin dashboard presentation — contracts", () => {
  it("does not pre-expand Licensees, sub-accounts, or creation panels", () => {
    const client = read("components/superAdmin/SuperAdminDashboardClient.tsx");
    const licenseeCard = read(
      "components/superAdmin/SuperAdminLicenseeCard.tsx",
    );
    const subAccountCard = read(
      "components/superAdmin/SuperAdminSubAccountCard.tsx",
    );
    const createPanel = read(
      "components/superAdmin/SuperAdminCreateAccountPanel.tsx",
    );
    const system = read(
      "components/superAdmin/SuperAdminSystemConfiguration.tsx",
    );

    assert.match(licenseeCard, /useState\(false\)/);
    assert.match(subAccountCard, /useState\(false\)/);
    assert.match(createPanel, /useState\(false\)/);
    assert.doesNotMatch(client, /expandedLicensees/);
    assert.doesNotMatch(client, /groups\[0\]\?\.licenseeAccountId/);
    assert.doesNotMatch(client, /\[first\]: true/);
    assert.match(system, /defaultOpen=\{false\}/);
    assert.doesNotMatch(system, /defaultOpen=\{true\}/);
  });

  it("keeps fees Licensee-level, access on userId, and GetOblic writes organization-scoped", () => {
    const client = read("components/superAdmin/SuperAdminDashboardClient.tsx");
    const licenseeCard = read(
      "components/superAdmin/SuperAdminLicenseeCard.tsx",
    );
    const subAccountCard = read(
      "components/superAdmin/SuperAdminSubAccountCard.tsx",
    );

    assert.match(licenseeCard, /Licensee commercial configuration/);
    assert.match(licenseeCard, /LICENSEE_MONTHLY_FEE_LABEL/);
    assert.match(licenseeCard, /SUB_ACCOUNT_MONTHLY_FEE_LABEL/);
    assert.match(client, /Licensee Monthly Fee saved/);
    assert.match(client, /Sub-Account Monthly Fee saved/);
    assert.doesNotMatch(subAccountCard, /Licensee Monthly Fee/);
    assert.doesNotMatch(subAccountCard, /Sub-Account Monthly Fee/);
    assert.doesNotMatch(subAccountCard, /Default Language/);
    assert.doesNotMatch(subAccountCard, /commercial-fees/);
    assert.doesNotMatch(subAccountCard, /default-language/);
    assert.match(client, /postJson\(`\/api\/super\/accounts\/\$\{action\}`, \{ userId \}\)/);
    assert.match(
      client,
      /licenseeAccountId: row\.licenseeAccountId,\s+organizationId: row\.organizationId,\s+listingCapacity/,
    );
    assert.match(
      client,
      /licenseeAccountId: row\.licenseeAccountId,\s+organizationId: row\.organizationId,\s+email,\s+wordpressUserId/,
    );
    assert.match(subAccountCard, /const accountDisabled = !row\.configured/);
    assert.match(subAccountCard, /disabled=\{accountDisabled\}/);
    assert.doesNotMatch(client, /Save all|bulk-save|bulkSave/i);
    assert.doesNotMatch(licenseeCard, /Save all|bulk-save|bulkSave/i);
    assert.doesNotMatch(subAccountCard, /Save all|bulk-save|bulkSave/i);
  });

  it("does not introduce password UI, TenantAppShell, or privileged imports in Super presentation files", () => {
    const page = read("app/super/page.tsx");
    const client = read("components/superAdmin/SuperAdminDashboardClient.tsx");
    assert.doesNotMatch(page, /TenantAppShell|TenantSidebar/);
    assert.doesNotMatch(page, /identityPagePresentation/);
    assert.doesNotMatch(client, /supabaseAdmin/);
    assert.doesNotMatch(client, /type="password"|Password/);

    for (const file of SUPER_PRESENTATION_FILES) {
      const source = read(file);
      assert.doesNotMatch(source, /supabaseAdmin/, `${file} imports supabaseAdmin`);
      assert.doesNotMatch(source, /type="password"/, `${file} has password UI`);
      assert.doesNotMatch(source, /identityPagePresentation/);
      assert.doesNotMatch(source, /TenantAppShell|TenantSidebar/);
    }

    const licenseeRoots = [
      "app/licensee",
      "components/licensee",
      "services/licensee",
      "app/api/licensee",
    ];
    for (const root of licenseeRoots) {
      for (const file of walkSourceFiles(root)) {
        const source = read(file);
        assert.doesNotMatch(
          source,
          /updateLicenseeCommercialFeesForSuperAdmin|\/api\/super\/accounts\/licensee\/commercial-fees|saveLicenseeCommercialFee/,
          `${file} must not expose Super Admin commercial-fee writes`,
        );
      }
    }
  });

  it("preserves Super Admin create payloads and GetOblic account field copy", () => {
    const client = read("components/superAdmin/SuperAdminDashboardClient.tsx");
    const createPanel = read(
      "components/superAdmin/SuperAdminCreateAccountPanel.tsx",
    );
    const directory = read(
      "components/superAdmin/SuperAdminLicenseeDirectory.tsx",
    );
    const athena = read(
      "components/superAdmin/SuperAdminAthenaAccountsSection.tsx",
    );
    const subAccountCard = read(
      "components/superAdmin/SuperAdminSubAccountCard.tsx",
    );

    assert.match(client, /\/api\/super\/accounts\/athena/);
    assert.match(client, /organizationName: athenaOrgName/);
    assert.match(client, /language:\s*athenaLanguage/);
    assert.match(client, /athenaPlan,/);
    assert.match(client, /\/api\/super\/accounts\/licensee/);
    assert.match(client, /businessName: licenseeName \|\| undefined/);
    assert.match(client, /defaultLanguage: licenseeDefaultLanguage/);
    assert.match(client, /router\.refresh\(\)/);
    assert.match(createPanel, /useState\(false\)/);
    assert.match(directory, /Create Licensee Master/);
    assert.match(athena, /Create Athena Account/);
    assert.match(subAccountCard, /GetOblic\.com account/);
    assert.match(subAccountCard, /WordPress User ID/);
    assert.match(subAccountCard, /Save Account/);
  });
});
