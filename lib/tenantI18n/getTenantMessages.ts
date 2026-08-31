import type { OrganizationLanguage } from "@/services/organizationLanguage";
import { de } from "./messages/de";
import { en } from "./messages/en";
import { es } from "./messages/es";
import { fr } from "./messages/fr";
import { it } from "./messages/it";
import { pt } from "./messages/pt";
import type { TenantMessages } from "./types";

const TENANT_MESSAGES: Record<OrganizationLanguage, TenantMessages> = {
  en,
  fr,
  es,
  it,
  de,
  pt,
};

/**
 * Resolve the tenant presentation dictionary from OrganizationLanguage.
 * No browser, cookie, Accept-Language, geography, or URL fallback.
 *
 * Callers read typed properties (messages.nav.dashboard).
 * A generic t() helper is intentionally omitted.
 */
export function getTenantMessages(
  language: OrganizationLanguage,
): TenantMessages {
  return TENANT_MESSAGES[language] ?? en;
}
