/**
 * Organization-scoped Free Identity Ask reservation authority.
 * Server-only. Identity conversation POST mutates; page reads consumed count.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  FREE_IDENTITY_ASK_LIMIT,
  emptyFreeIdentityAskState,
  normalizeFreeIdentityAskCount,
  type FreeIdentityAskState,
} from "@/lib/organization/freeIdentityAsk";

export const FREE_IDENTITY_ASK_AUTHORITY_RPCS = {
  reserve: "reserve_athena_free_identity_ask",
  consume: "consume_athena_free_identity_ask",
  release: "release_athena_free_identity_ask",
} as const;

export const FREE_IDENTITY_ASK_AUTHORITY_COLUMNS =
  "free_identity_ask_consumed_count, free_identity_ask_reserved_count, free_identity_ask_reserved_at";

export type ReserveFreeIdentityAskResult =
  | { acquired: true; recovered: boolean }
  | {
      acquired: false;
      reason: "exhausted" | "in_flight";
      consumedCount: number;
      reservedCount: number;
    };

function unwrapRpcRow(data: unknown): Record<string, unknown> | null {
  if (!data) return null;
  if (Array.isArray(data)) {
    return (data[0] as Record<string, unknown> | undefined) ?? null;
  }
  if (typeof data === "object") {
    return data as Record<string, unknown>;
  }
  return null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asNullableTimestampMs(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function loadFreeIdentityAskAuthority(
  organizationId: string,
): Promise<FreeIdentityAskState> {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select(FREE_IDENTITY_ASK_AUTHORITY_COLUMNS)
    .eq("id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("[ATHENA_FREE_IDENTITY_ASK] load_failed", {
      organizationId,
      error: error.message,
    });
    throw new Error("Failed to load Free Identity Ask state.");
  }

  if (!data) {
    return emptyFreeIdentityAskState();
  }

  return {
    consumedCount: normalizeFreeIdentityAskCount(
      data.free_identity_ask_consumed_count,
    ),
    reservedCount: normalizeFreeIdentityAskCount(
      data.free_identity_ask_reserved_count,
    ),
    reservedAt: asNullableTimestampMs(data.free_identity_ask_reserved_at),
  };
}

export async function reserveFreeIdentityAsk(
  organizationId: string,
  limit: number = FREE_IDENTITY_ASK_LIMIT,
): Promise<ReserveFreeIdentityAskResult> {
  const { data, error } = await supabaseAdmin.rpc(
    FREE_IDENTITY_ASK_AUTHORITY_RPCS.reserve,
    {
      p_organization_id: organizationId,
      p_limit: limit,
    },
  );

  if (error) {
    console.error("[ATHENA_FREE_IDENTITY_ASK] reserve_failed", {
      organizationId,
      error: error.message,
    });
    throw new Error("Failed to reserve Free Identity Ask.");
  }

  const row = unwrapRpcRow(data);
  if (!row) {
    throw new Error("Failed to reserve Free Identity Ask.");
  }

  if (asBoolean(row.reserved)) {
    return { acquired: true, recovered: asBoolean(row.recovered) };
  }

  const consumedCount = normalizeFreeIdentityAskCount(row.consumed_count);
  const reservedCount = normalizeFreeIdentityAskCount(row.reserved_count);
  return {
    acquired: false,
    reason: consumedCount >= limit ? "exhausted" : "in_flight",
    consumedCount,
    reservedCount,
  };
}

export async function consumeFreeIdentityAsk(
  organizationId: string,
): Promise<void> {
  const { error } = await supabaseAdmin.rpc(
    FREE_IDENTITY_ASK_AUTHORITY_RPCS.consume,
    { p_organization_id: organizationId },
  );

  if (error) {
    console.error("[ATHENA_FREE_IDENTITY_ASK] consume_failed", {
      organizationId,
      error: error.message,
    });
    throw new Error("Failed to consume Free Identity Ask.");
  }
}

export async function releaseFreeIdentityAsk(
  organizationId: string,
): Promise<void> {
  const { error } = await supabaseAdmin.rpc(
    FREE_IDENTITY_ASK_AUTHORITY_RPCS.release,
    { p_organization_id: organizationId },
  );

  if (error) {
    console.error("[ATHENA_FREE_IDENTITY_ASK] release_failed", {
      organizationId,
      error: error.message,
    });
  }
}
