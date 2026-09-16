/**
 * Super Admin dashboard view-model.
 * Joins already-loaded Super Admin data. No queries. No privileged I/O.
 */

import type { ManageableAccount } from "@/services/superAdmin/superAdminAccounts";
import type {
  SuperAdminGetOblicDirectoryAllocationModel,
  SuperAdminGetOblicDirectoryAllocationRow,
  SuperAdminGetOblicDirectoryLicenseeGroup,
} from "@/services/superAdmin/superAdminGetOblicDirectory";
import type { OrganizationLanguage } from "@/services/organizationLanguage";
import { DEFAULT_ORGANIZATION_LANGUAGE } from "@/services/organizationLanguage";
import type { LicenseeCommercialFees } from "@/services/superAdmin/superAdminLicenseeCommercialFeeTypes";
import type { LicenseeDefaultLanguageSetting } from "@/services/superAdmin/superAdminLicenseeDefaultLanguageTypes";

export const SUPER_ADMIN_DOMAIN_IDS = [
  "overview",
  "licensees",
  "athena-accounts",
  "system-configuration",
] as const;

export type SuperAdminDomainId = (typeof SUPER_ADMIN_DOMAIN_IDS)[number];

export const DEFAULT_SUPER_ADMIN_DOMAIN: SuperAdminDomainId = "overview";

export const SUPER_ADMIN_DOMAIN_ITEMS: ReadonlyArray<{
  id: SuperAdminDomainId;
  label: string;
}> = [
  { id: "overview", label: "Overview" },
  { id: "licensees", label: "Licensees" },
  { id: "athena-accounts", label: "Athena Accounts" },
  { id: "system-configuration", label: "System Configuration" },
];

export type SuperAdminSubAccountView = SuperAdminGetOblicDirectoryAllocationRow;

export type SuperAdminGetOblicRollup = {
  configuredCount: number;
  unconfiguredCount: number;
  capacityZeroCount: number;
  label: string;
};

export type SuperAdminLicenseeView = {
  licenseeAccountId: string;
  masterEmail: string;
  userId: string | null;
  status: ManageableAccount["status"] | null;
  displayName: string;
  hasOwnCompany: boolean;
  ownCompanyOrganizationId: string | null;
  subAccountCount: number;
  licenseeMonthlyFeeUsd: number;
  subAccountMonthlyFeeUsd: number;
  defaultLanguage: OrganizationLanguage;
  getoblicRollup: SuperAdminGetOblicRollup;
  subAccounts: SuperAdminSubAccountView[];
};

export type SuperAdminOverviewCounts = {
  licenseeMasters: number;
  ordinaryAthenaAccounts: number;
  activeAccounts: number;
  deactivatedAccounts: number;
  licenseesWithZeroSubAccounts: number;
  getoblicUnconfigured: number;
  getoblicCapacityZero: number;
  trendSocialPromptConfigured: boolean;
  estimateMethodologyConfigured: boolean;
};

export type SuperAdminAthenaAccountView = Pick<
  ManageableAccount,
  "userId" | "email" | "accountType" | "displayName" | "status" | "athenaPlan"
>;

export type SuperAdminDashboardView = {
  licensees: SuperAdminLicenseeView[];
  athenaAccounts: SuperAdminAthenaAccountView[];
  overview: SuperAdminOverviewCounts;
};

export function superAdminAllocationKey(row: {
  licenseeAccountId: string;
  organizationId: string;
}): string {
  return `${row.licenseeAccountId}:${row.organizationId}`;
}

export function listOrdinaryAthenaAccounts(
  accounts: ManageableAccount[],
): ManageableAccount[] {
  return accounts.filter((account) => account.accountType === "athena");
}

export function buildGetOblicRollup(
  subAccounts: SuperAdminSubAccountView[],
): SuperAdminGetOblicRollup {
  let configuredCount = 0;
  let unconfiguredCount = 0;
  let capacityZeroCount = 0;

  for (const row of subAccounts) {
    if (!row.configured) {
      unconfiguredCount += 1;
      continue;
    }
    configuredCount += 1;
    if (row.listingCapacity === 0) {
      capacityZeroCount += 1;
    }
  }

  return {
    configuredCount,
    unconfiguredCount,
    capacityZeroCount,
    label: formatGetOblicRollupLabel({
      subAccountCount: subAccounts.length,
      configuredCount,
      unconfiguredCount,
      capacityZeroCount,
    }),
  };
}

export function formatGetOblicRollupLabel(input: {
  subAccountCount: number;
  configuredCount: number;
  unconfiguredCount: number;
  capacityZeroCount: number;
}): string {
  if (input.subAccountCount === 0) {
    return "No GetOblic organizations";
  }

  const parts: string[] = [];
  if (input.configuredCount > 0) {
    parts.push(
      input.configuredCount === 1
        ? "1 configured"
        : `${input.configuredCount} configured`,
    );
  }
  if (input.unconfiguredCount > 0) {
    parts.push(
      input.unconfiguredCount === 1
        ? "1 unconfigured"
        : `${input.unconfiguredCount} unconfigured`,
    );
  }
  if (input.capacityZeroCount > 0) {
    parts.push(
      input.capacityZeroCount === 1
        ? "1 capacity zero"
        : `${input.capacityZeroCount} capacity zero`,
    );
  }
  return parts.join(" · ");
}

export function allocationSecondaryCopy(
  row: SuperAdminSubAccountView,
): string {
  if (!row.configured) {
    return "Conversions are blocked until listing capacity is set.";
  }
  if (row.listingCapacity === 0) {
    return "New GetOblic conversions are blocked.";
  }
  const held = row.currentlyHeld ?? 0;
  const capacity = row.listingCapacity ?? 0;
  const usage = `${held} currently held of ${capacity}`;
  return row.available == null ? usage : `${usage} · ${row.available} available`;
}

export function buildSuperAdminLicenseeViews(input: {
  groups: SuperAdminGetOblicDirectoryLicenseeGroup[];
  accounts: ManageableAccount[];
  fees: LicenseeCommercialFees[];
  defaultLanguages?: LicenseeDefaultLanguageSetting[];
}): SuperAdminLicenseeView[] {
  const accountByLicenseeId = new Map<string, ManageableAccount>();
  for (const account of input.accounts) {
    if (account.accountType !== "licensee" || !account.licenseeAccountId) {
      continue;
    }
    accountByLicenseeId.set(account.licenseeAccountId, account);
  }

  const feesByLicenseeId = new Map(
    input.fees.map((row) => [row.licenseeAccountId, row]),
  );
  const languagesByLicenseeId = new Map(
    (input.defaultLanguages ?? []).map((row) => [row.licenseeAccountId, row]),
  );

  return input.groups.map((group) => {
    const account = accountByLicenseeId.get(group.licenseeAccountId) ?? null;
    const fees = feesByLicenseeId.get(group.licenseeAccountId);
    const language = languagesByLicenseeId.get(group.licenseeAccountId);
    return {
      licenseeAccountId: group.licenseeAccountId,
      masterEmail: group.masterEmail,
      userId: account?.userId ?? null,
      status: account?.status ?? null,
      displayName: account?.displayName ?? group.masterEmail,
      hasOwnCompany: Boolean(group.ownCompanyOrganizationId),
      ownCompanyOrganizationId: group.ownCompanyOrganizationId,
      subAccountCount: group.subAccounts.length,
      licenseeMonthlyFeeUsd: fees?.licenseeMonthlyFeeUsd ?? 0,
      subAccountMonthlyFeeUsd: fees?.subAccountMonthlyFeeUsd ?? 0,
      defaultLanguage:
        language?.defaultLanguage ?? DEFAULT_ORGANIZATION_LANGUAGE,
      getoblicRollup: buildGetOblicRollup(group.subAccounts),
      subAccounts: group.subAccounts,
    };
  });
}

export function buildSuperAdminOverviewCounts(input: {
  licensees: SuperAdminLicenseeView[];
  accounts: ManageableAccount[];
  trendSocialPromptConfigured: boolean;
  estimateMethodologyConfigured: boolean;
}): SuperAdminOverviewCounts {
  const athenaAccounts = listOrdinaryAthenaAccounts(input.accounts);
  let getoblicUnconfigured = 0;
  let getoblicCapacityZero = 0;

  for (const licensee of input.licensees) {
    getoblicUnconfigured += licensee.getoblicRollup.unconfiguredCount;
    getoblicCapacityZero += licensee.getoblicRollup.capacityZeroCount;
  }

  return {
    licenseeMasters: input.licensees.length,
    ordinaryAthenaAccounts: athenaAccounts.length,
    activeAccounts: input.accounts.filter((account) => account.status === "active")
      .length,
    deactivatedAccounts: input.accounts.filter(
      (account) => account.status === "deactivated",
    ).length,
    licenseesWithZeroSubAccounts: input.licensees.filter(
      (licensee) => licensee.subAccountCount === 0,
    ).length,
    getoblicUnconfigured,
    getoblicCapacityZero,
    trendSocialPromptConfigured: input.trendSocialPromptConfigured,
    estimateMethodologyConfigured: input.estimateMethodologyConfigured,
  };
}

export function buildSuperAdminDashboardView(input: {
  accounts: ManageableAccount[];
  directoryAllocations: SuperAdminGetOblicDirectoryAllocationModel;
  licenseeCommercialFees: LicenseeCommercialFees[];
  licenseeDefaultLanguages?: LicenseeDefaultLanguageSetting[];
  trendSocialPromptConfigured: boolean;
  estimateMethodologyConfigured: boolean;
}): SuperAdminDashboardView {
  const licensees = buildSuperAdminLicenseeViews({
    groups: input.directoryAllocations.groups,
    accounts: input.accounts,
    fees: input.licenseeCommercialFees,
    defaultLanguages: input.licenseeDefaultLanguages,
  });

  return {
    licensees,
    athenaAccounts: listOrdinaryAthenaAccounts(input.accounts),
    overview: buildSuperAdminOverviewCounts({
      licensees,
      accounts: input.accounts,
      trendSocialPromptConfigured: input.trendSocialPromptConfigured,
      estimateMethodologyConfigured: input.estimateMethodologyConfigured,
    }),
  };
}
