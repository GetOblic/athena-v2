/**
 * Library intelligence freshness is current executive version generated_at.
 * Never substitute prospect.updated_at, scraped_at, or job created_at.
 */

import { formatTenantDate } from "@/lib/tenantI18n/format";
import type { OrganizationLanguage } from "@/services/organizationLanguage";

export function readProspectLibraryGeneratedAt(
  value: unknown,
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const time = new Date(trimmed).getTime();
  return Number.isFinite(time) ? trimmed : null;
}

export function formatProspectLibraryIntelligenceDate(
  generatedAt: string | null | undefined,
  language: OrganizationLanguage,
  label: string,
): string | null {
  const resolved = readProspectLibraryGeneratedAt(generatedAt);
  if (!resolved) return null;
  const formatted = formatTenantDate(resolved, language);
  if (!formatted) return null;
  return `${label} · ${formatted}`;
}
