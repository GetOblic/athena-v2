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
