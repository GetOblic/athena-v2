/**
 * Pure SEO report row/package mappers (no Supabase imports).
 */

import { normalizeSeoReportBrief } from "@/services/seo/seoReportBrief";
import { resolveSeoGenerationType } from "@/services/seo/seoGenerationType";
import { validateSeoIntelligencePackage } from "@/services/seo/seoReportValidation";
import { validateSeoTechnicalPackage } from "@/services/seo/seoTechnicalValidation";
import {
  isSeoReportGenerationStage,
  isSeoReportStatus,
  type SeoReport,
  type SeoReportBrief,
  type SeoReportPackage,
  type SeoReportStatus,
} from "@/services/seo/seoReportTypes";

function mapBrief(value: unknown): SeoReportBrief {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { generationType: "intelligence" };
  }
  try {
    return normalizeSeoReportBrief(value);
  } catch {
    return { generationType: "intelligence" };
  }
}

function mapPackage(
  value: unknown,
  status: SeoReportStatus,
  brief: SeoReportBrief,
): SeoReportPackage | null {
  if (status !== "Ready") {
    return null;
  }
  try {
    const generationType = resolveSeoGenerationType({
      brief,
      package: value,
    });
    if (generationType === "technical") {
      return validateSeoTechnicalPackage(value);
    }
    // Normalize so legacy Ready packages gain generationType + empty websitePagesAnalyzed.
    return validateSeoIntelligencePackage(value);
  } catch {
    return null;
  }
}

export function mapSeoReportRow(row: Record<string, unknown>): SeoReport {
  const statusRaw = String(row.status ?? "Queued");
  const status: SeoReportStatus = isSeoReportStatus(statusRaw)
    ? statusRaw
    : "Queued";
  const stageRaw = row.generation_stage;
  const generation_stage =
    stageRaw == null || stageRaw === ""
      ? null
      : isSeoReportGenerationStage(stageRaw)
        ? stageRaw
        : null;

  const brief_json = mapBrief(row.brief_json);

  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    user_id: (row.user_id as string | null) ?? null,
    name: String(row.name ?? "Untitled SEO Report"),
    brief_json,
    status,
    generation_stage,
    package_json: mapPackage(row.package_json, status, brief_json),
    error_code: (row.error_code as string | null) ?? null,
    error_message: (row.error_message as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}
