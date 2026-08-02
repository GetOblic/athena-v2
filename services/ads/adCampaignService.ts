/**
 * Organization-scoped Ad campaign persistence.
 * Ownership always comes from trusted server organizationId — never the client.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { defaultCampaignNameFromBrief } from "@/services/ads/adCampaignBrief";
import { mapAdCampaignRow } from "@/services/ads/adCampaignMappers";
import type {
  AdCampaign,
  AdCampaignBrief,
  AdCampaignGenerationStage,
  AdCampaignStatus,
} from "@/services/ads/adCampaignTypes";

export type { AdCampaign } from "@/services/ads/adCampaignTypes";
export { mapAdCampaignRow } from "@/services/ads/adCampaignMappers";

export class AdCampaignNotFoundError extends Error {
  readonly code = "NOT_FOUND";
  constructor(message = "Ad campaign not found.") {
    super(message);
    this.name = "AdCampaignNotFoundError";
  }
}

export class AdCampaignConflictError extends Error {
  readonly code = "CONFLICT";
  constructor(message: string) {
    super(message);
    this.name = "AdCampaignConflictError";
  }
}

function touch(): string {
  return new Date().toISOString();
}

export async function listAdCampaigns(
  organizationId: string,
): Promise<AdCampaign[]> {
  const { data, error } = await supabaseAdmin
    .from("ad_campaigns")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[ATHENA_ADS] list_failed", {
      organizationId,
      error: error.message,
    });
    throw new Error("Failed to load ad campaigns.");
  }

  return (data ?? []).map((row) =>
    mapAdCampaignRow(row as Record<string, unknown>),
  );
}

export async function getAdCampaignById(
  id: string,
  organizationId: string,
): Promise<AdCampaign | null> {
  const { data, error } = await supabaseAdmin
    .from("ad_campaigns")
    .select("*")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("[ATHENA_ADS] get_failed", {
      id,
      organizationId,
      error: error.message,
    });
    return null;
  }
  if (!data) return null;
  return mapAdCampaignRow(data as Record<string, unknown>);
}

export async function createAdCampaign(input: {
  organizationId: string;
  userId: string | null;
  brief?: AdCampaignBrief;
}): Promise<AdCampaign> {
  const brief = input.brief ?? {};
  const name = defaultCampaignNameFromBrief(brief);
  const now = touch();

  const { data, error } = await supabaseAdmin
    .from("ad_campaigns")
    .insert({
      organization_id: input.organizationId,
      user_id: input.userId,
      name,
      brief_json: brief,
      status: "Queued",
      generation_stage: null,
      package_json: null,
      error_code: null,
      error_message: null,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error("[ATHENA_ADS] create_failed", {
      organizationId: input.organizationId,
      error: error?.message,
    });
    throw new Error("Failed to create ad campaign.");
  }

  return mapAdCampaignRow(data as Record<string, unknown>);
}

export async function markAdCampaignEnqueueFailed(input: {
  campaignId: string;
  organizationId: string;
  errorCode: string;
  errorMessage: string;
}): Promise<void> {
  await supabaseAdmin
    .from("ad_campaigns")
    .update({
      status: "Processing Failed",
      generation_stage: "failed",
      package_json: null,
      error_code: input.errorCode.slice(0, 120),
      error_message: input.errorMessage.slice(0, 1000),
      updated_at: touch(),
    })
    .eq("id", input.campaignId)
    .eq("organization_id", input.organizationId);
}

export async function updateAdCampaignStage(input: {
  campaignId: string;
  organizationId: string;
  stage: AdCampaignGenerationStage;
  status?: AdCampaignStatus;
}): Promise<void> {
  await supabaseAdmin
    .from("ad_campaigns")
    .update({
      generation_stage: input.stage,
      status: input.status ?? "Processing",
      updated_at: touch(),
    })
    .eq("id", input.campaignId)
    .eq("organization_id", input.organizationId);
}

export async function deleteAdCampaign(
  id: string,
  organizationId: string,
): Promise<boolean> {
  const existing = await getAdCampaignById(id, organizationId);
  if (!existing) return false;

  const { error } = await supabaseAdmin
    .from("ad_campaigns")
    .delete()
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (error) {
    console.error("[ATHENA_ADS] delete_failed", {
      id,
      organizationId,
      error: error.message,
    });
    throw new Error("Failed to delete ad campaign.");
  }
  return true;
}
