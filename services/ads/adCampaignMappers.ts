/**
 * Pure Ad campaign row/package mappers (no Supabase imports).
 */

import { normalizeAdCampaignBrief } from "@/services/ads/adCampaignBrief";
import { isCompleteAdCampaignPackage } from "@/services/ads/adCampaignValidation";
import {
  isAdCampaignGenerationStage,
  isAdCampaignStatus,
  type AdCampaign,
  type AdCampaignBrief,
  type AdCampaignPackage,
  type AdCampaignStatus,
} from "@/services/ads/adCampaignTypes";

function mapBrief(value: unknown): AdCampaignBrief {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  try {
    return normalizeAdCampaignBrief(value);
  } catch {
    return {};
  }
}

function mapPackage(
  value: unknown,
  status: AdCampaignStatus,
): AdCampaignPackage | null {
  if (status !== "Ready") {
    return null;
  }
  if (!isCompleteAdCampaignPackage(value)) {
    return null;
  }
  return value;
}

export function mapAdCampaignRow(row: Record<string, unknown>): AdCampaign {
  const statusRaw = String(row.status ?? "Queued");
  const status: AdCampaignStatus = isAdCampaignStatus(statusRaw)
    ? statusRaw
    : "Queued";
  const stageRaw = row.generation_stage;
  const generation_stage =
    stageRaw == null || stageRaw === ""
      ? null
      : isAdCampaignGenerationStage(stageRaw)
        ? stageRaw
        : null;

  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    user_id: (row.user_id as string | null) ?? null,
    name: String(row.name ?? "Untitled Ad Campaign"),
    brief_json: mapBrief(row.brief_json),
    status,
    generation_stage,
    package_json: mapPackage(row.package_json, status),
    error_code: (row.error_code as string | null) ?? null,
    error_message: (row.error_message as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}
