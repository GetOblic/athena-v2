/**
 * Organization-scoped Free Convert Opportunities reservation authority.
 * Server-only. /prospects reads; only the Prospect create / worker paths mutate.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  resolveFreeConvertStatus,
  type FreeConvertStatus,
} from "@/lib/organization/freeConvert";
import { FreeConvertGenerationError } from "@/lib/organization/freeConvertGeneration";

export const FREE_CONVERT_AUTHORITY_RPCS = {
  reserve: "reserve_athena_free_convert",
  bind: "bind_athena_free_convert_prospect",
  release: "release_athena_free_convert",
  consume: "consume_athena_free_convert",
} as const;

export const FREE_CONVERT_AUTHORITY_COLUMNS =
  "free_convert_status, free_convert_prospect_id, free_convert_reserved_at, free_convert_reservation_token";

export type FreeConvertAuthority = {
  status: FreeConvertStatus;
  prospectId: string | null;
  reservedAt: string | null;
  reservationToken: string | null;
};

export type ReserveFreeConvertSuccess = {
  reservationToken: string;
  recovered: boolean;
  prospectId: string | null;
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

function asNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export async function loadFreeConvertAuthority(
  organizationId: string,
): Promise<FreeConvertAuthority> {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select(FREE_CONVERT_AUTHORITY_COLUMNS)
    .eq("id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("[ATHENA_FREE_CONVERT] load_failed", {
      organizationId,
      error: error.message,
    });
    throw new Error("Failed to load Free Convert Opportunities state.");
  }

  return {
    status: resolveFreeConvertStatus(data?.free_convert_status),
    prospectId: asNullableString(data?.free_convert_prospect_id),
    reservedAt: asNullableString(data?.free_convert_reserved_at),
    reservationToken: asNullableString(data?.free_convert_reservation_token),
  };
}

export async function reserveFreeConvert(
  organizationId: string,
): Promise<ReserveFreeConvertSuccess> {
  const { data, error } = await supabaseAdmin.rpc(
    FREE_CONVERT_AUTHORITY_RPCS.reserve,
    { p_organization_id: organizationId },
  );

  if (error) {
    console.error("[ATHENA_FREE_CONVERT] reserve_failed", {
      organizationId,
      error: error.message,
    });
    throw new Error("Failed to reserve Free Convert Opportunities.");
  }

  const row = unwrapRpcRow(data);
  if (asBoolean(row?.already_consumed)) {
    throw new FreeConvertGenerationError("FREE_CONVERT_CONSUMED");
  }
  if (asBoolean(row?.already_reserved) || !asBoolean(row?.reserved)) {
    throw new FreeConvertGenerationError("FREE_CONVERT_CONFLICT");
  }

  const reservationToken = asNullableString(row?.reservation_token);
  if (!reservationToken) {
    throw new FreeConvertGenerationError("FREE_CONVERT_CONFLICT");
  }

  return {
    reservationToken,
    recovered: asBoolean(row?.recovered),
    prospectId: asNullableString(row?.prospect_id),
  };
}

export async function bindFreeConvertProspect(input: {
  organizationId: string;
  reservationToken: string;
  prospectId: string;
}): Promise<void> {
  const { data, error } = await supabaseAdmin.rpc(
    FREE_CONVERT_AUTHORITY_RPCS.bind,
    {
      p_organization_id: input.organizationId,
      p_reservation_token: input.reservationToken,
      p_prospect_id: input.prospectId,
    },
  );

  if (error) {
    console.error("[ATHENA_FREE_CONVERT] bind_failed", {
      organizationId: input.organizationId,
      prospectId: input.prospectId,
      error: error.message,
    });
    throw new FreeConvertGenerationError("FREE_CONVERT_CONFLICT");
  }

  const row = unwrapRpcRow(data);
  if (!asBoolean(row?.bound)) {
    throw new FreeConvertGenerationError("FREE_CONVERT_CONFLICT");
  }
}

export async function releaseFreeConvertIfReserved(input: {
  organizationId: string;
  prospectId?: string | null;
  reservationToken?: string | null;
}): Promise<void> {
  const { error } = await supabaseAdmin.rpc(FREE_CONVERT_AUTHORITY_RPCS.release, {
    p_organization_id: input.organizationId,
    p_prospect_id: input.prospectId ?? null,
    p_reservation_token: input.reservationToken ?? null,
  });

  if (error) {
    console.error("[ATHENA_FREE_CONVERT] release_failed", {
      organizationId: input.organizationId,
      prospectId: input.prospectId,
      error: error.message,
    });
  }
}

export async function consumeFreeConvertIfReserved(input: {
  organizationId: string;
  prospectId: string;
}): Promise<void> {
  const { error } = await supabaseAdmin.rpc(FREE_CONVERT_AUTHORITY_RPCS.consume, {
    p_organization_id: input.organizationId,
    p_prospect_id: input.prospectId,
  });

  if (error) {
    console.error("[ATHENA_FREE_CONVERT] consume_failed", {
      organizationId: input.organizationId,
      prospectId: input.prospectId,
      error: error.message,
    });
  }
}
