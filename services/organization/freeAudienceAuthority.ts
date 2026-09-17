/**
 * Organization-scoped Free Audience reservation authority.
 * Server-only. /personas reads; only audience create / persist paths mutate.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  resolveFreeAudienceStatus,
  type FreeAudienceStatus,
} from "@/lib/organization/freeAudience";
import { FreeAudienceGenerationError } from "@/lib/organization/freeAudienceGeneration";

export const FREE_AUDIENCE_AUTHORITY_RPCS = {
  reserve: "reserve_athena_free_audience",
  bind: "bind_athena_free_audience_persona",
  release: "release_athena_free_audience",
  consume: "consume_athena_free_audience",
} as const;

export const FREE_AUDIENCE_AUTHORITY_COLUMNS =
  "free_audience_status, free_audience_persona_id, free_audience_reserved_at, free_audience_reservation_token";

export type FreeAudienceAuthority = {
  status: FreeAudienceStatus;
  personaId: string | null;
  reservedAt: string | null;
  reservationToken: string | null;
};

export type ReserveFreeAudienceSuccess = {
  reservationToken: string;
  recovered: boolean;
  personaId: string | null;
  reused?: boolean;
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

export async function loadFreeAudienceAuthority(
  organizationId: string,
): Promise<FreeAudienceAuthority> {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select(FREE_AUDIENCE_AUTHORITY_COLUMNS)
    .eq("id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("[ATHENA_FREE_AUDIENCE] load_failed", {
      organizationId,
      error: error.message,
    });
    throw new Error("Failed to load Free Audience state.");
  }

  return {
    status: resolveFreeAudienceStatus(data?.free_audience_status),
    personaId: asNullableString(data?.free_audience_persona_id),
    reservedAt: asNullableString(data?.free_audience_reserved_at),
    reservationToken: asNullableString(data?.free_audience_reservation_token),
  };
}

export async function ensureFreeAudiencePersistReservation(
  organizationId: string,
): Promise<ReserveFreeAudienceSuccess> {
  const current = await loadFreeAudienceAuthority(organizationId);
  if (current.status === "consumed") {
    throw new FreeAudienceGenerationError("FREE_AUDIENCE_CONSUMED");
  }
  if (current.status === "reserved") {
    if (current.personaId) {
      throw new FreeAudienceGenerationError("FREE_AUDIENCE_CONSUMED");
    }
    if (!current.reservationToken) {
      throw new FreeAudienceGenerationError("FREE_AUDIENCE_CONFLICT");
    }
    return {
      reservationToken: current.reservationToken,
      recovered: false,
      personaId: null,
      reused: true,
    };
  }
  return {
    ...(await reserveFreeAudience(organizationId)),
    reused: false,
  };
}

export async function reserveFreeAudience(
  organizationId: string,
): Promise<ReserveFreeAudienceSuccess> {
  const { data, error } = await supabaseAdmin.rpc(
    FREE_AUDIENCE_AUTHORITY_RPCS.reserve,
    { p_organization_id: organizationId },
  );

  if (error) {
    console.error("[ATHENA_FREE_AUDIENCE] reserve_failed", {
      organizationId,
      error: error.message,
    });
    throw new Error("Failed to reserve Free Audience.");
  }

  const row = unwrapRpcRow(data);
  if (asBoolean(row?.already_consumed)) {
    throw new FreeAudienceGenerationError("FREE_AUDIENCE_CONSUMED");
  }
  if (asBoolean(row?.already_reserved) || !asBoolean(row?.reserved)) {
    throw new FreeAudienceGenerationError("FREE_AUDIENCE_CONFLICT");
  }

  const reservationToken = asNullableString(row?.reservation_token);
  if (!reservationToken) {
    throw new FreeAudienceGenerationError("FREE_AUDIENCE_CONFLICT");
  }

  return {
    reservationToken,
    recovered: asBoolean(row?.recovered),
    personaId: asNullableString(row?.persona_id),
  };
}

export async function bindFreeAudiencePersona(input: {
  organizationId: string;
  reservationToken: string;
  personaId: string;
}): Promise<void> {
  const { data, error } = await supabaseAdmin.rpc(
    FREE_AUDIENCE_AUTHORITY_RPCS.bind,
    {
      p_organization_id: input.organizationId,
      p_reservation_token: input.reservationToken,
      p_persona_id: input.personaId,
    },
  );

  if (error) {
    console.error("[ATHENA_FREE_AUDIENCE] bind_failed", {
      organizationId: input.organizationId,
      personaId: input.personaId,
      error: error.message,
    });
    throw new FreeAudienceGenerationError("FREE_AUDIENCE_CONFLICT");
  }

  const row = unwrapRpcRow(data);
  if (!asBoolean(row?.bound)) {
    throw new FreeAudienceGenerationError("FREE_AUDIENCE_CONFLICT");
  }
}

export async function releaseFreeAudienceIfReserved(input: {
  organizationId: string;
  personaId?: string | null;
  reservationToken?: string | null;
}): Promise<void> {
  const { error } = await supabaseAdmin.rpc(FREE_AUDIENCE_AUTHORITY_RPCS.release, {
    p_organization_id: input.organizationId,
    p_persona_id: input.personaId ?? null,
    p_reservation_token: input.reservationToken ?? null,
  });

  if (error) {
    console.error("[ATHENA_FREE_AUDIENCE] release_failed", {
      organizationId: input.organizationId,
      personaId: input.personaId,
      error: error.message,
    });
  }
}

export async function consumeFreeAudienceIfReserved(input: {
  organizationId: string;
  personaId: string;
}): Promise<void> {
  const { error } = await supabaseAdmin.rpc(FREE_AUDIENCE_AUTHORITY_RPCS.consume, {
    p_organization_id: input.organizationId,
    p_persona_id: input.personaId,
  });

  if (error) {
    console.error("[ATHENA_FREE_AUDIENCE] consume_failed", {
      organizationId: input.organizationId,
      personaId: input.personaId,
      error: error.message,
    });
  }
}
