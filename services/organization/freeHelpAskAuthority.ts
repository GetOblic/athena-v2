/**
 * Organization-scoped Free Help Ask reservation authority.
 * Server-only. Getting Started conversation POST mutates; page reads consumed count.
 */

import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  FREE_HELP_ASK_LIMIT,
  emptyFreeHelpAskState,
  normalizeFreeHelpAskCount,
  resolveFreeHelpAskPresentation,
  type FreeHelpAskPresentation,
  type FreeHelpAskState,
} from "@/lib/organization/freeHelpAsk";
import { loadFreeProgressionState } from "@/services/organization/freeProgressionState";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

export const FREE_HELP_ASK_AUTHORITY_RPCS = {
  reserve: "reserve_athena_free_help_ask",
  consume: "consume_athena_free_help_ask",
  release: "release_athena_free_help_ask",
} as const;

export const FREE_HELP_ASK_AUTHORITY_COLUMNS =
  "free_help_ask_consumed_count, free_help_ask_reserved_count, free_help_ask_reserved_at";

export type ReserveFreeHelpAskResult =
  | { acquired: true; recovered: boolean }
  | {
      acquired: false;
      reason: "exhausted" | "in_flight";
      consumedCount: number;
      reservedCount: number;
    };

export type FreeHelpAskPageState = {
  presentation: FreeHelpAskPresentation;
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

export async function loadFreeHelpAskAuthority(
  organizationId: string,
): Promise<FreeHelpAskState> {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select(FREE_HELP_ASK_AUTHORITY_COLUMNS)
    .eq("id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("[ATHENA_FREE_HELP_ASK] load_failed", {
      organizationId,
      error: error.message,
    });
    throw new Error("Failed to load Free Help Ask state.");
  }

  if (!data) {
    return emptyFreeHelpAskState();
  }

  return {
    consumedCount: normalizeFreeHelpAskCount(
      data.free_help_ask_consumed_count,
    ),
    reservedCount: normalizeFreeHelpAskCount(
      data.free_help_ask_reserved_count,
    ),
    reservedAt: asNullableTimestampMs(data.free_help_ask_reserved_at),
  };
}

export const loadFreeHelpAskPageState = cache(
  async (): Promise<FreeHelpAskPageState> => {
    const { organizationId } = await requireCurrentOrganizationContext();
    const { athenaPlan } = await loadFreeProgressionState();
    const authority =
      athenaPlan === "free"
        ? await loadFreeHelpAskAuthority(organizationId)
        : emptyFreeHelpAskState();

    return {
      presentation: resolveFreeHelpAskPresentation({
        athenaPlan,
        consumedCount: authority.consumedCount,
      }),
    };
  },
);

export async function reserveFreeHelpAsk(
  organizationId: string,
  limit: number = FREE_HELP_ASK_LIMIT,
): Promise<ReserveFreeHelpAskResult> {
  const { data, error } = await supabaseAdmin.rpc(
    FREE_HELP_ASK_AUTHORITY_RPCS.reserve,
    {
      p_organization_id: organizationId,
      p_limit: limit,
    },
  );

  if (error) {
    console.error("[ATHENA_FREE_HELP_ASK] reserve_failed", {
      organizationId,
      error: error.message,
    });
    throw new Error("Failed to reserve Free Help Ask.");
  }

  const row = unwrapRpcRow(data);
  if (!row) {
    throw new Error("Failed to reserve Free Help Ask.");
  }

  if (asBoolean(row.reserved)) {
    return { acquired: true, recovered: asBoolean(row.recovered) };
  }

  const consumedCount = normalizeFreeHelpAskCount(row.consumed_count);
  const reservedCount = normalizeFreeHelpAskCount(row.reserved_count);
  return {
    acquired: false,
    reason: consumedCount >= limit ? "exhausted" : "in_flight",
    consumedCount,
    reservedCount,
  };
}

export async function consumeFreeHelpAsk(
  organizationId: string,
): Promise<void> {
  const { error } = await supabaseAdmin.rpc(
    FREE_HELP_ASK_AUTHORITY_RPCS.consume,
    { p_organization_id: organizationId },
  );

  if (error) {
    console.error("[ATHENA_FREE_HELP_ASK] consume_failed", {
      organizationId,
      error: error.message,
    });
    throw new Error("Failed to consume Free Help Ask.");
  }
}

export async function releaseFreeHelpAsk(
  organizationId: string,
): Promise<void> {
  const { error } = await supabaseAdmin.rpc(
    FREE_HELP_ASK_AUTHORITY_RPCS.release,
    { p_organization_id: organizationId },
  );

  if (error) {
    console.error("[ATHENA_FREE_HELP_ASK] release_failed", {
      organizationId,
      error: error.message,
    });
  }
}
