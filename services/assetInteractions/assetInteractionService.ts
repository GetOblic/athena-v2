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

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  return /duplicate key|unique constraint/i.test(error.message ?? "");
}

function toInteraction(row: {
  asset_type: string;
  interaction_count: number;
  first_occurred_at: string;
  last_occurred_at: string;
}): AssetCopyInteraction {
  return {
    asset_type: row.asset_type,
    interaction_count: row.interaction_count,
    first_occurred_at: row.first_occurred_at,
    last_occurred_at: row.last_occurred_at,
    done: true,
  };
}

async function lookupInteraction(input: {
  organizationId: string;
  userId: string;
  sourceType: AssetInteractionSourceType;
  sourceId: string;
  versionId: string;
  assetType: string;
}) {
  return supabaseAdmin
    .from("athena_asset_interactions")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("user_id", input.userId)
    .eq("source_type", input.sourceType)
    .eq("source_id", input.sourceId)
    .eq("executive_version_id", input.versionId)
    .eq("asset_type", input.assetType)
    .eq("interaction_type", "copied")
    .maybeSingle();
}

async function bumpInteraction(input: {
  organizationId: string;
  rowId: string;
  currentCount: number;
  now: string;
}): Promise<AssetCopyInteraction> {
  const nextCount = Math.max(1, Number(input.currentCount ?? 1)) + 1;
  const { data, error } = await supabaseAdmin
    .from("athena_asset_interactions")
    .update({
      interaction_count: nextCount,
      last_occurred_at: input.now,
      updated_at: input.now,
    })
    .eq("id", input.rowId)
    .eq("organization_id", input.organizationId)
    .select("asset_type, interaction_count, first_occurred_at, last_occurred_at")
    .single();

  if (error) {
    console.error("[ASSET_INTERACTIONS] update_failed", error);
    throw error;
  }

  return toInteraction(data);
}

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
    result[row.asset_type] = toInteraction(row);
  }
  return result;
}

/**
 * Record a successful clipboard copy. Idempotent under the unique constraint
 * (organization, user, source, version, asset, interaction_type).
 * Concurrent inserts that hit 23505 are resolved by bumping the existing row.
 */
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

  const existing = await lookupInteraction({
    organizationId: input.organizationId,
    userId: input.userId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    versionId,
    assetType,
  });

  if (existing.error) {
    console.error("[ASSET_INTERACTIONS] lookup_failed", existing.error);
    throw existing.error;
  }

  const now = new Date().toISOString();

  if (existing.data) {
    return bumpInteraction({
      organizationId: input.organizationId,
      rowId: existing.data.id,
      currentCount: existing.data.interaction_count,
      now,
    });
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

  if (!error && data) {
    return toInteraction(data);
  }

  if (isUniqueViolation(error)) {
    console.log("[ASSET_INTERACTIONS] duplicate_resolved_idempotently", {
      organizationId: input.organizationId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      assetType,
      versionId,
    });

    const raced = await lookupInteraction({
      organizationId: input.organizationId,
      userId: input.userId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      versionId,
      assetType,
    });

    if (raced.error) {
      console.error("[ASSET_INTERACTIONS] lookup_after_conflict_failed", raced.error);
      throw raced.error;
    }

    if (raced.data) {
      return bumpInteraction({
        organizationId: input.organizationId,
        rowId: raced.data.id,
        currentCount: raced.data.interaction_count,
        now,
      });
    }
  }

  console.error("[ASSET_INTERACTIONS] insert_failed", error);
  throw error ?? new Error("Could not record asset interaction.");
}
