/**
 * Licensee Master localization.
 *
 * Authority is the already-resolved LicenseeAccount.default_language.
 * Must not use tenant-org localization or current-organization context.
 *
 * Reuses the shared tenant catalogs and formatting helpers only.
 */
import { toFormattingLocale, type TenantFormattingLocale } from "@/lib/tenantI18n/format";
import { getTenantMessages } from "@/lib/tenantI18n/getTenantMessages";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { OrganizationLanguage } from "@/services/organizationLanguage";

export type LicenseeMessages = TenantMessages["licensee"];

export type LicenseeLocalization = {
  language: OrganizationLanguage;
  locale: TenantFormattingLocale;
  messages: LicenseeMessages;
};

export function getLicenseeLocalization(
  language: OrganizationLanguage,
): LicenseeLocalization {
  const catalog = getTenantMessages(language);
  return {
    language,
    locale: toFormattingLocale(language),
    messages: catalog.licensee,
  };
}
