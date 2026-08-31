import {
  requireCurrentOrganizationContext,
  resolveOrganizationLanguage,
} from "@/services/organizationService";
import { toFormattingLocale, type TenantFormattingLocale } from "./format";
import { getTenantMessages } from "./getTenantMessages";
import type { TenantMessages } from "./types";
import type { OrganizationLanguage } from "@/services/organizationLanguage";

export type TenantLocalization = {
  language: OrganizationLanguage;
  locale: TenantFormattingLocale;
  messages: TenantMessages;
};

/**
 * Server-authoritative tenant localization.
 *
 * authenticated organization → organizations.language → tenant messages.
 * Does not accept organizationId from Client input.
 * Does not read browser locale, cookies, request language headers, or URL prefixes.
 *
 * This is the only new direct consumer of resolveOrganizationLanguage.
 */
export async function getTenantLocalization(): Promise<TenantLocalization> {
  const { organizationId } = await requireCurrentOrganizationContext();
  const language = await resolveOrganizationLanguage(organizationId);
  return {
    language,
    locale: toFormattingLocale(language),
    messages: getTenantMessages(language),
  };
}
