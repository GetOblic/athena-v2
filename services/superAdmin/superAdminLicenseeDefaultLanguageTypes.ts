/**
 * Browser-safe Licensee Default Language contracts.
 * Keep privileged DB / service-role access out of this module.
 * Reuses Athena's existing organization-language contract.
 */

import type { OrganizationLanguage } from "@/services/organizationLanguage";

export const LICENSEE_DEFAULT_LANGUAGE_LABEL = "Default Language";

export type LicenseeDefaultLanguageSetting = {
  licenseeAccountId: string;
  masterEmail: string;
  defaultLanguage: OrganizationLanguage;
};
