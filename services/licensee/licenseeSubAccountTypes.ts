/** Shared Master dashboard types/constants — safe for client components. */

/** Private Master note length cap (relationship-only). */
export const LICENSEE_SUB_ACCOUNT_NOTES_MAX_LENGTH = 2000;

/** Master-only display name length cap (relationship-only). */
export const LICENSEE_SUB_ACCOUNT_DISPLAY_NAME_MAX_LENGTH = 120;

export type LicenseeSubAccountOperationalMetrics = {
  prospectCount: number;
  discussionCount: number;
  personaCount: number;
  brainReady: boolean;
  websiteIntelligenceReady: boolean;
  seoReady: boolean;
  adsReady: boolean;
  /** organizations.last_visited_at — human workspace visit, not auth last_sign_in_at. */
  lastVisitedAt: string | null;
  accountReadinessPercent: number;
};

export type LicenseeSubAccountListItem = {
  relationshipId: string;
  organizationId: string;
  /** Athena organization / business name (tenant-owned). */
  name: string;
  /** Master-only alias; null when unset. Does not change organizations.name. */
  displayName: string | null;
  logoPreviewUrl: string | null;
  pinned: boolean;
  pinnedAt: string | null;
  /**
   * Derived presentation flag:
   * organization_id === licensee_accounts.own_company_organization_id.
   * Not a second persisted identity source.
   */
  isOwnCompany: boolean;
  accountEmail: string | null;
  notes: string;
  /** Existing Athena Identity summary when available; omitted when none. */
  accountSnapshot: string | null;
  metrics: LicenseeSubAccountOperationalMetrics;
};

/** Card title: Master display name when set, else organization name. */
export function resolveLicenseeSubAccountTitle(
  item: Pick<LicenseeSubAccountListItem, "displayName" | "name">,
): string {
  const alias = item.displayName?.trim();
  return alias || item.name;
}

/**
 * Shared server / Estimate list order: pinned first, then alphabetical title.
 * Do not change — Estimate default-selects subAccounts[0] from this order.
 */
export function sortLicenseeSubAccountsShared(
  items: LicenseeSubAccountListItem[],
): LicenseeSubAccountListItem[] {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }
    return resolveLicenseeSubAccountTitle(a).localeCompare(
      resolveLicenseeSubAccountTitle(b),
      undefined,
      { sensitivity: "base" },
    );
  });
}

/**
 * Licensee dashboard presentation only:
 * My Company → other pinned clients → remaining, alpha within groups.
 * Must not be used by Estimate or other shared list consumers.
 */
export function sortLicenseeSubAccountsForDashboard(
  items: LicenseeSubAccountListItem[],
): LicenseeSubAccountListItem[] {
  return [...items].sort((a, b) => {
    if (a.isOwnCompany !== b.isOwnCompany) {
      return a.isOwnCompany ? -1 : 1;
    }
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }
    return resolveLicenseeSubAccountTitle(a).localeCompare(
      resolveLicenseeSubAccountTitle(b),
      undefined,
      { sensitivity: "base" },
    );
  });
}

/** First newly created relationship may auto-designate only in this state. */
export function shouldAutoDesignateOwnCompany(input: {
  ownCompanyOrganizationId: string | null | undefined;
  existingRelationshipCount: number;
}): boolean {
  return (
    !input.ownCompanyOrganizationId && input.existingRelationshipCount === 0
  );
}
