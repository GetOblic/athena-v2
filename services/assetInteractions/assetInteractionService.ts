/**
 * Durable per-user asset copy + usage-tag tracking.
 * Never mutates Executive Version snapshots.
 * Never feeds Brain, prompts, generation, routing, or publication.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  resolveExecutiveVersionScopeId,
  type AssetInteractionSourceType,
} from "@/services/assetInteractions/assetInteractionKeys";
import {
  ASSET_USAGE_TAGS,
  COPIED_INTERACTION_TYPE,
  isAssetUsageTag,
  type AssetUsageTag,
} from "@/services/assetInteractions/assetUsageTags";

export type AssetCopyInteraction = {
  asset_type: string;
  interaction_count: number;
  first_occurred_at: string;
  last_occurred_at: string;
  done: true;
};

/** Compatible GET shape: done from copied; tags from usage-tag rows. */
export type AssetInteractionState = {
  asset_type: string;
  done: boolean;
  tags: AssetUsageTag[];
  interaction_count: number;
  first_occurred_at: string | null;
  last_occurred_at: string | null;
};

export function isUniqueViolation(
  error: { code?: string; message?: string } | null,
): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  return /duplicate key|unique constraint/i.test(error.message ?? "");
}

function toCopyInteraction(row: {
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

async function lookupByType(input: {
  organizationId: string;
  userId: string;
  sourceType: AssetInteractionSourceType;
  sourceId: string;
  versionId: string;
  assetType: string;
  interactionType: string;
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
    .eq("interaction_type", input.interactionType)
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

  return toCopyInteraction(data);
}

/**
 * List Done + usage tags per asset for one workspace version.
 * Backward compatible: consumers may still read `.done` only.
 */
export async function listAssetInteractions(input: {
  organizationId: string;
  userId: string;
  sourceType: AssetInteractionSourceType;
  sourceId: string;
  executiveVersionId?: string | null;
}): Promise<Record<string, AssetInteractionState>> {
  const versionId = resolveExecutiveVersionScopeId(input.executiveVersionId);

  const { data, error } = await supabaseAdmin
    .from("athena_asset_interactions")
    .select(
      "asset_type, interaction_type, interaction_count, first_occurred_at, last_occurred_at",
    )
    .eq("organization_id", input.organizationId)
    .eq("user_id", input.userId)
    .eq("source_type", input.sourceType)
    .eq("source_id", input.sourceId)
    .eq("executive_version_id", versionId);

  if (error) {
    console.error("[ASSET_INTERACTIONS] list_failed", error);
    throw error;
  }

  const result: Record<string, AssetInteractionState> = {};

  for (const row of data ?? []) {
    const assetType = String(row.asset_type ?? "").trim();
    if (!assetType) continue;

    const current = result[assetType] ?? {
      asset_type: assetType,
      done: false,
      tags: [],
      interaction_count: 0,
      first_occurred_at: null,
      last_occurred_at: null,
    };

    if (row.interaction_type === COPIED_INTERACTION_TYPE) {
      current.done = true;
      current.interaction_count = Number(row.interaction_count ?? 1);
      current.first_occurred_at = row.first_occurred_at ?? null;
      current.last_occurred_at = row.last_occurred_at ?? null;
    } else if (isAssetUsageTag(row.interaction_type)) {
      if (!current.tags.includes(row.interaction_type)) {
        current.tags = [...current.tags, row.interaction_type];
      }
    }

    result[assetType] = current;
  }

  for (const state of Object.values(result)) {
    state.tags = ASSET_USAGE_TAGS.filter((tag) => state.tags.includes(tag));
  }

  return result;
}

/** @deprecated Prefer listAssetInteractions — kept for existing copy-only callers. */
export async function listAssetCopyInteractions(input: {
  organizationId: string;
  userId: string;
  sourceType: AssetInteractionSourceType;
  sourceId: string;
  executiveVersionId?: string | null;
}): Promise<Record<string, AssetCopyInteraction>> {
  const all = await listAssetInteractions(input);
  const result: Record<string, AssetCopyInteraction> = {};
  for (const [assetType, state] of Object.entries(all)) {
    if (!state.done) continue;
    result[assetType] = {
      asset_type: assetType,
      interaction_count: state.interaction_count || 1,
      first_occurred_at: state.first_occurred_at ?? new Date(0).toISOString(),
      last_occurred_at: state.last_occurred_at ?? new Date(0).toISOString(),
      done: true,
    };
  }
  return result;
}

/**
 * Record a successful clipboard copy. Idempotent under the unique constraint.
 * Concurrent inserts that hit 23505 are resolved by bumping the existing row.
 * Does not create usage tags.
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

  const existing = await lookupByType({
    organizationId: input.organizationId,
    userId: input.userId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    versionId,
    assetType,
    interactionType: COPIED_INTERACTION_TYPE,
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
      interaction_type: COPIED_INTERACTION_TYPE,
      first_occurred_at: now,
      last_occurred_at: now,
      interaction_count: 1,
      updated_at: now,
    })
    .select("asset_type, interaction_count, first_occurred_at, last_occurred_at")
    .single();

  if (!error && data) {
    return toCopyInteraction(data);
  }

  if (isUniqueViolation(error)) {
    console.log("[ASSET_INTERACTIONS] duplicate_resolved_idempotently", {
      organizationId: input.organizationId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      assetType,
      versionId,
    });

    const raced = await lookupByType({
      organizationId: input.organizationId,
      userId: input.userId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      versionId,
      assetType,
      interactionType: COPIED_INTERACTION_TYPE,
    });

    if (raced.error) {
      console.error(
        "[ASSET_INTERACTIONS] lookup_after_conflict_failed",
        raced.error,
      );
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

/** Add one usage tag idempotently. Never creates or toggles copied. */
export async function addAssetUsageTag(input: {
  organizationId: string;
  userId: string;
  sourceType: AssetInteractionSourceType;
  sourceId: string;
  executiveVersionId?: string | null;
  assetType: string;
  usageTag: AssetUsageTag;
}): Promise<AssetInteractionState> {
  const versionId = resolveExecutiveVersionScopeId(input.executiveVersionId);
  const assetType = input.assetType.trim();
  if (!assetType) {
    throw new Error("assetType is required.");
  }
  if (!isAssetUsageTag(input.usageTag)) {
    throw new Error("Unsupported usage tag.");
  }

  const existing = await lookupByType({
    organizationId: input.organizationId,
    userId: input.userId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    versionId,
    assetType,
    interactionType: input.usageTag,
  });

  if (existing.error) {
    console.error("[ASSET_INTERACTIONS] tag_lookup_failed", existing.error);
    throw existing.error;
  }

  if (!existing.data) {
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin.from("athena_asset_interactions").insert({
      organization_id: input.organizationId,
      user_id: input.userId,
      source_type: input.sourceType,
      source_id: input.sourceId,
      executive_version_id: versionId,
      asset_type: assetType,
      interaction_type: input.usageTag,
      first_occurred_at: now,
      last_occurred_at: now,
      interaction_count: 1,
      updated_at: now,
    });

    if (error && !isUniqueViolation(error)) {
      console.error("[ASSET_INTERACTIONS] tag_insert_failed", error);
      throw error;
    }
  }

  const all = await listAssetInteractions({
    organizationId: input.organizationId,
    userId: input.userId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    executiveVersionId: input.executiveVersionId,
  });

  return (
    all[assetType] ?? {
      asset_type: assetType,
      done: false,
      tags: [input.usageTag],
      interaction_count: 0,
      first_occurred_at: null,
      last_occurred_at: null,
    }
  );
}

/** Remove one usage-tag row only. Never removes copied. */
export async function removeAssetUsageTag(input: {
  organizationId: string;
  userId: string;
  sourceType: AssetInteractionSourceType;
  sourceId: string;
  executiveVersionId?: string | null;
  assetType: string;
  usageTag: AssetUsageTag;
}): Promise<AssetInteractionState> {
  const versionId = resolveExecutiveVersionScopeId(input.executiveVersionId);
  const assetType = input.assetType.trim();
  if (!assetType) {
    throw new Error("assetType is required.");
  }
  if (!isAssetUsageTag(input.usageTag)) {
    throw new Error("Unsupported usage tag.");
  }

  const { error } = await supabaseAdmin
    .from("athena_asset_interactions")
    .delete()
    .eq("organization_id", input.organizationId)
    .eq("user_id", input.userId)
    .eq("source_type", input.sourceType)
    .eq("source_id", input.sourceId)
    .eq("executive_version_id", versionId)
    .eq("asset_type", assetType)
    .eq("interaction_type", input.usageTag);

  if (error) {
    console.error("[ASSET_INTERACTIONS] tag_delete_failed", error);
    throw error;
  }

  const all = await listAssetInteractions({
    organizationId: input.organizationId,
    userId: input.userId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    executiveVersionId: input.executiveVersionId,
  });

  return (
    all[assetType] ?? {
      asset_type: assetType,
      done: false,
      tags: [],
      interaction_count: 0,
      first_occurred_at: null,
      last_occurred_at: null,
    }
  );
}
