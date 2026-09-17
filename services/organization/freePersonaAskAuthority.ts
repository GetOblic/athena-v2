/**
 * Organization-scoped Free Persona Ask reservation authority.
 * Server-only. Persona conversation POST mutates; page reads consumed count.
 * Separate from FREE-8, FREE-12, and FREE-13 counters.
 */

import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  FREE_PERSONA_ASK_LIMIT,
  emptyFreePersonaAskState,
  normalizeFreePersonaAskCount,
  resolveFreePersonaAskPresentation,
  type FreePersonaAskPresentation,
  type FreePersonaAskState,
} from "@/lib/organization/freePersonaAsk";
import { loadFreeProgressionState } from "@/services/organization/freeProgressionState";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

export const FREE_PERSONA_ASK_AUTHORITY_RPCS = {
  reserve: "reserve_athena_free_persona_ask",
  consume: "consume_athena_free_persona_ask",
  release: "release_athena_free_persona_ask",
} as const;

export const FREE_PERSONA_ASK_AUTHORITY_COLUMNS =
  "free_persona_ask_consumed_count, free_persona_ask_reserved_count, free_persona_ask_reserved_at";

export type ReserveFreePersonaAskResult =
  | { acquired: true; recovered: boolean }
  | {
      acquired: false;
      reason: "exhausted" | "in_flight";
      consumedCount: number;
      reservedCount: number;
    };

export type FreePersonaAskPageState = {
  presentation: FreePersonaAskPresentation;
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

export async function loadFreePersonaAskAuthority(
  organizationId: string,
): Promise<FreePersonaAskState> {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select(FREE_PERSONA_ASK_AUTHORITY_COLUMNS)
    .eq("id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("[ATHENA_FREE_PERSONA_ASK] load_failed", {
      organizationId,
      error: error.message,
    });
    throw new Error("Failed to load Free Persona Ask state.");
  }

  if (!data) {
    return emptyFreePersonaAskState();
  }

  return {
    consumedCount: normalizeFreePersonaAskCount(
      data.free_persona_ask_consumed_count,
    ),
    reservedCount: normalizeFreePersonaAskCount(
      data.free_persona_ask_reserved_count,
    ),
    reservedAt: asNullableTimestampMs(data.free_persona_ask_reserved_at),
  };
}

export const loadFreePersonaAskPageState = cache(
  async (): Promise<FreePersonaAskPageState> => {
    const { organizationId } = await requireCurrentOrganizationContext();
    const { athenaPlan } = await loadFreeProgressionState();
    const authority =
      athenaPlan === "free"
        ? await loadFreePersonaAskAuthority(organizationId)
        : emptyFreePersonaAskState();

    return {
      presentation: resolveFreePersonaAskPresentation({
        athenaPlan,
        consumedCount: authority.consumedCount,
      }),
    };
  },
);

export async function reserveFreePersonaAsk(
  organizationId: string,
  limit: number = FREE_PERSONA_ASK_LIMIT,
): Promise<ReserveFreePersonaAskResult> {
  const { data, error } = await supabaseAdmin.rpc(
    FREE_PERSONA_ASK_AUTHORITY_RPCS.reserve,
    {
      p_organization_id: organizationId,
      p_limit: limit,
    },
  );

  if (error) {
    console.error("[ATHENA_FREE_PERSONA_ASK] reserve_failed", {
      organizationId,
      error: error.message,
    });
    throw new Error("Failed to reserve Free Persona Ask.");
  }

  const row = unwrapRpcRow(data);
  if (!row) {
    throw new Error("Failed to reserve Free Persona Ask.");
  }

  if (asBoolean(row.reserved)) {
    return { acquired: true, recovered: asBoolean(row.recovered) };
  }

  const consumedCount = normalizeFreePersonaAskCount(row.consumed_count);
  const reservedCount = normalizeFreePersonaAskCount(row.reserved_count);
  return {
    acquired: false,
    reason: consumedCount >= limit ? "exhausted" : "in_flight",
    consumedCount,
    reservedCount,
  };
}

export async function consumeFreePersonaAsk(
  organizationId: string,
): Promise<void> {
  const { error } = await supabaseAdmin.rpc(
    FREE_PERSONA_ASK_AUTHORITY_RPCS.consume,
    { p_organization_id: organizationId },
  );

  if (error) {
    console.error("[ATHENA_FREE_PERSONA_ASK] consume_failed", {
      organizationId,
      error: error.message,
    });
    throw new Error("Failed to consume Free Persona Ask.");
  }
}

export async function releaseFreePersonaAsk(
  organizationId: string,
): Promise<void> {
  const { error } = await supabaseAdmin.rpc(
    FREE_PERSONA_ASK_AUTHORITY_RPCS.release,
    { p_organization_id: organizationId },
  );

  if (error) {
    console.error("[ATHENA_FREE_PERSONA_ASK] release_failed", {
      organizationId,
      error: error.message,
    });
  }
}
