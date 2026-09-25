/**
 * Read-only GetOblic author for the authenticated Licensee Master's Own Company.
 * Caller supplies the already-authoritative own_company_organization_id.
 * Does not create WordPress users, write settings, or read Prospect listings.
 */

import { readLicenseeUsefulLinksAuthorId } from "@/lib/licensee/licenseeUsefulLinksPresentation";
import { getGetOblicDirectorySettings } from "@/services/getoblicDirectory/getoblicDirectoryService";
import type { GetOblicDirectorySettingsResult } from "@/services/getoblicDirectory/getoblicDirectoryTypes";

export type LicenseeUsefulLinksSettingsReader = (
  organizationId: string,
) => Promise<GetOblicDirectorySettingsResult>;

export async function resolveLicenseeUsefulLinksAuthor(
  ownCompanyOrganizationId: string | null | undefined,
  getSettings: LicenseeUsefulLinksSettingsReader = getGetOblicDirectorySettings,
): Promise<number | null> {
  const ownCompanyId =
    typeof ownCompanyOrganizationId === "string"
      ? ownCompanyOrganizationId.trim()
      : "";
  if (!ownCompanyId) {
    return null;
  }

  try {
    const result = await getSettings(ownCompanyId);
    if (!result.configured) {
      return null;
    }
    return readLicenseeUsefulLinksAuthorId(result.settings.wordpress_author_id);
  } catch {
    console.error("[LICENSEE_USEFUL_LINKS] settings_read_failed");
    return null;
  }
}
