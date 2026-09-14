/**
 * Tenant i18n localizes APPLICATION PRESENTATION only.
 *
 * Do not import this module — or any lib/tenantI18n file — from:
 * workers, generation prompt builders, package writers,
 * Brain compilation, or AI generation services.
 *
 * Phase 1A language separation (do not merge these):
 * 1. Account/UI language → organizations.language → tenantI18n presentation
 * 2. Structural generation keys → canonical English machine contract
 * 3. Asset TYPE display labels → tenantI18n presentation (Phase 1A)
 * 4. Generated asset BODY → model output, stored and rendered verbatim
 * 5. Generated-content language → explicit operator/business context,
 *    never Account Language
 *
 * Do not bind generated-content language to organizations.language.
 * Do not translate structural KEY headings.
 * Do not rewrite generated bodies or post-process them through tenantI18n.
 * Do not infer body language from an English TYPE label.
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
