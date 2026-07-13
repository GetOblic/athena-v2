/**
 * Durable per-user asset copy interaction tracking.
 * Never mutates Executive Version snapshots.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  resolveExecutiveVersionScopeId,
  type AssetInteractionSourceType,
} from "@/services/assetInteractions/assetInteractionKeys";

export type AssetCopyInteraction = {
  asset_type: string;
  interaction_count: number;
  first_occurred_at: string;
  last_occurred_at: string;
  done: true;
};

export async function listAssetCopyInteractions(input: {
  organizationId: string;
  userId: string;
  sourceType: AssetInteractionSourceType;
  sourceId: string;
  executiveVersionId?: string | null;
}): Promise<Record<string, AssetCopyInteraction>> {
  const versionId = resolveExecutiveVersionScopeId(input.executiveVersionId);

  const { data, error } = await supabaseAdmin
    .from("athena_asset_interactions")
    .select(
      "asset_type, interaction_count, first_occurred_at, last_occurred_at",
    )
    .eq("organization_id", input.organizationId)
    .eq("user_id", input.userId)
    .eq("source_type", input.sourceType)
    .eq("source_id", input.sourceId)
    .eq("executive_version_id", versionId)
    .eq("interaction_type", "copied");

  if (error) {
    console.error("[ASSET_INTERACTIONS] list_failed", error);
    throw error;
  }

  const result: Record<string, AssetCopyInteraction> = {};
  for (const row of data ?? []) {
    result[row.asset_type] = {
      asset_type: row.asset_type,
      interaction_count: row.interaction_count,
      first_occurred_at: row.first_occurred_at,
      last_occurred_at: row.last_occurred_at,
      done: true,
    };
  }
  return result;
}

export async function recordAssetCopyInteraction(input: {
  organizationId: string;
  userId: string;
  sourceType: AssetInteractionSourceType;
  sourceId: string;
  executiveVersionId?: string | null;
  assetType: string;
}): Promise<AssetCopyInteraction> {
  const versionId = resolveExecutiveVersionScopeId(input.executiveVersionId);
  const assetType = input.assetType.trim();
  if (!assetType) {
    throw new Error("assetType is required.");
  }

  const existing = await supabaseAdmin
    .from("athena_asset_interactions")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("user_id", input.userId)
    .eq("source_type", input.sourceType)
    .eq("source_id", input.sourceId)
    .eq("executive_version_id", versionId)
    .eq("asset_type", assetType)
    .eq("interaction_type", "copied")
    .maybeSingle();

  if (existing.error) {
    console.error("[ASSET_INTERACTIONS] lookup_failed", existing.error);
    throw existing.error;
  }

  const now = new Date().toISOString();

  if (existing.data) {
    const nextCount = Number(existing.data.interaction_count ?? 1) + 1;
    const { data, error } = await supabaseAdmin
      .from("athena_asset_interactions")
      .update({
        interaction_count: nextCount,
        last_occurred_at: now,
        updated_at: now,
      })
      .eq("id", existing.data.id)
      .eq("organization_id", input.organizationId)
      .select("asset_type, interaction_count, first_occurred_at, last_occurred_at")
      .single();

    if (error) {
      console.error("[ASSET_INTERACTIONS] update_failed", error);
      throw error;
    }

    return {
      asset_type: data.asset_type,
      interaction_count: data.interaction_count,
      first_occurred_at: data.first_occurred_at,
      last_occurred_at: data.last_occurred_at,
      done: true,
    };
  }

  const { data, error } = await supabaseAdmin
    .from("athena_asset_interactions")
    .insert({
      organization_id: input.organizationId,
      user_id: input.userId,
      source_type: input.sourceType,
      source_id: input.sourceId,
      executive_version_id: versionId,
      asset_type: assetType,
      interaction_type: "copied",
      first_occurred_at: now,
      last_occurred_at: now,
      interaction_count: 1,
      updated_at: now,
    })
    .select("asset_type, interaction_count, first_occurred_at, last_occurred_at")
    .single();

  if (error) {
    console.error("[ASSET_INTERACTIONS] insert_failed", error);
    throw error;
  }

  return {
    asset_type: data.asset_type,
    interaction_count: data.interaction_count,
    first_occurred_at: data.first_occurred_at,
    last_occurred_at: data.last_occurred_at,
    done: true,
  };
}
