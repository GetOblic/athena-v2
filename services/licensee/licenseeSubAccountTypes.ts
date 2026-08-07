/** Shared Master dashboard types/constants — safe for client components. */

/** Private Master note length cap (relationship-only). */
export const LICENSEE_SUB_ACCOUNT_NOTES_MAX_LENGTH = 2000;

export type LicenseeSubAccountListItem = {
  relationshipId: string;
  organizationId: string;
  name: string;
  logoPreviewUrl: string | null;
  pinned: boolean;
  pinnedAt: string | null;
  accountEmail: string | null;
  notes: string;
  /** Existing Athena Identity summary when available; omitted when none. */
  accountSnapshot: string | null;
};
