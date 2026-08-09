/**
 * Pure Athena Estimate row mappers (no Supabase imports).
 */

import { normalizeEstimateRequest } from "@/services/estimate/athenaEstimateRequest";
import { validateEstimateProspectGenerationContext } from "@/services/estimate/athenaEstimateProspectContext";
import {
  isAthenaEstimateCurrencyResolution,
  isAthenaEstimateStatus,
  type AthenaEstimate,
  type AthenaEstimatePackage,
  type AthenaEstimateStatus,
  type EstimateProspectGenerationContextV1,
  type EstimateRequest,
} from "@/services/estimate/athenaEstimateTypes";
import { validateAthenaEstimatePackage } from "@/services/estimate/athenaEstimateValidation";

function mapRequest(value: unknown): EstimateRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { projectNeed: "Unavailable" };
  }
  try {
    return normalizeEstimateRequest(value);
  } catch {
    const raw = value as Record<string, unknown>;
    const projectNeed =
      typeof raw.projectNeed === "string" && raw.projectNeed.trim()
        ? raw.projectNeed.trim()
        : "Unavailable";
    return { projectNeed };
  }
}

function mapPackage(
  value: unknown,
  status: AthenaEstimateStatus,
): AthenaEstimatePackage | null {
  if (status !== "Ready") {
    return null;
  }
  try {
    return validateAthenaEstimatePackage(value);
  } catch {
    return null;
  }
}

function mapProspectGenerationContext(
  value: unknown,
): EstimateProspectGenerationContextV1 | null {
  if (value == null) return null;
  try {
    return validateEstimateProspectGenerationContext(value);
  } catch {
    return null;
  }
}

function mapNullableTrimmedString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function mapAthenaEstimateRow(
  row: Record<string, unknown>,
): AthenaEstimate {
  const statusRaw = String(row.status ?? "Queued");
  const status: AthenaEstimateStatus = isAthenaEstimateStatus(statusRaw)
    ? statusRaw
    : "Queued";

  const stageRaw = row.generation_stage;
  const generation_stage =
    stageRaw == null || stageRaw === ""
      ? null
      : String(stageRaw);

  const currencyResolutionRaw = row.currency_resolution;
  const currency_resolution =
    currencyResolutionRaw == null || currencyResolutionRaw === ""
      ? null
      : isAthenaEstimateCurrencyResolution(currencyResolutionRaw)
        ? currencyResolutionRaw
        : null;

  return {
    id: String(row.id),
    licensee_account_id: String(row.licensee_account_id),
    organization_id: String(row.organization_id),
    requested_by: (row.requested_by as string | null) ?? null,
    organization_name_snapshot: String(
      row.organization_name_snapshot ?? "Organization",
    ),
    prospect_id: mapNullableTrimmedString(row.prospect_id),
    prospect_business_name_snapshot: mapNullableTrimmedString(
      row.prospect_business_name_snapshot,
    ),
    prospect_generation_context_json: mapProspectGenerationContext(
      row.prospect_generation_context_json,
    ),
    request_json: mapRequest(row.request_json),
    status,
    generation_stage,
    package_json: mapPackage(row.package_json, status),
    error_code: (row.error_code as string | null) ?? null,
    error_message: (row.error_message as string | null) ?? null,
    currency_code: (row.currency_code as string | null) ?? null,
    geography_label: (row.geography_label as string | null) ?? null,
    currency_resolution,
    instruction_config_key:
      (row.instruction_config_key as string | null) ?? null,
    instruction_revision_id:
      (row.instruction_revision_id as string | null) ?? null,
    instruction_configured: Boolean(row.instruction_configured ?? false),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}
