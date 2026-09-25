/**
 * Read-only Licensee Own Company GetOblic author for Prospect Funnel CTAs.
 * Does not create WordPress users or write settings.
 */

import { readGetOblicFunnelPositiveInteger } from "@/lib/prospects/getOblicFunnelPresentation";
import { getGetOblicDirectorySettings } from "@/services/getoblicDirectory/getoblicDirectoryService";
import {
  getLicenseeAccountsByOwnCompanyOrganizationId,
  listControllingLicenseeAccountsForOrganization,
} from "@/services/licensee/licenseeIdentity";
import type { OrganizationLanguage } from "@/services/organizationLanguage";

export type LicenseeOwnCompanyGetOblicAuthor = {
  authorId: number;
  licenseeDefaultLanguage: OrganizationLanguage;
};

export async function resolveLicenseeOwnCompanyGetOblicAuthorId(
  organizationId: string,
): Promise<LicenseeOwnCompanyGetOblicAuthor | null> {
  const organization = organizationId.trim();
  if (!organization) {
    return null;
  }

  try {
    const controlling =
      await listControllingLicenseeAccountsForOrganization(organization);
    if (!controlling || controlling.length !== 1) {
      return null;
    }

    const licensee = controlling[0];
    if (!licensee) {
      return null;
    }
    const ownCompanyId = licensee.own_company_organization_id?.trim() ?? "";
    if (!ownCompanyId || !licensee.id) {
      return null;
    }

    const designated =
      await getLicenseeAccountsByOwnCompanyOrganizationId(ownCompanyId);
    if (designated.length !== 1 || designated[0]?.id !== licensee.id) {
      return null;
    }
    if ((designated[0]?.own_company_organization_id?.trim() ?? "") !== ownCompanyId) {
      return null;
    }

    const settings = await getGetOblicDirectorySettings(ownCompanyId);
    if (!settings.configured) {
      return null;
    }
    const authorId = readGetOblicFunnelPositiveInteger(
      settings.settings.wordpress_author_id,
    );
    if (authorId == null) {
      return null;
    }
    return {
      authorId,
      licenseeDefaultLanguage: licensee.default_language,
    };
  } catch (error) {
    console.error("[GETOBLIC_FUNNEL] author_resolution_failed", error);
    return null;
  }
}
