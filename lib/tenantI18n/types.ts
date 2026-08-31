/**
 * Tenant i18n localizes APPLICATION PRESENTATION only.
 *
 * Do not import this module — or any lib/tenantI18n file — from:
 * workers, generation prompt builders, package writers,
 * Brain compilation, or AI generation services.
 *
 * Language codes and autonyms remain owned by services/organizationLanguage.ts.
 * Look up strings with typed property access (messages.nav.dashboard).
 * A generic t() helper is intentionally omitted.
 */
import type { en } from "./messages/en";

type WidenLeafStrings<T> = T extends string
  ? string
  : T extends object
    ? { [K in keyof T]: WidenLeafStrings<T[K]> }
    : T;

/**
 * Canonical tenant dictionary shape: identical nested keys to English,
 * with leaf values widened to string so translations need not match
 * English literal text.
 */
export type TenantMessages = WidenLeafStrings<typeof en>;

export type TenantStatusKey = keyof TenantMessages["status"];
