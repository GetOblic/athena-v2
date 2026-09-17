/**
 * Organization-scoped Free Traction reservation authority.
 * Server-only. /ads reads; only the Ads create / worker paths mutate.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  resolveFreeTractionStatus,
  type FreeTractionStatus,
} from "@/lib/organization/freeTraction";
import { FreeTractionGenerationError } from "@/lib/organization/freeTractionGeneration";

export const FREE_TRACTION_AUTHORITY_RPCS = {
  reserve: "reserve_athena_free_traction",
  bind: "bind_athena_free_traction_campaign",
  release: "release_athena_free_traction",
  consume: "consume_athena_free_traction",
} as const;

export const FREE_TRACTION_AUTHORITY_COLUMNS =
  "free_traction_status, free_traction_campaign_id, free_traction_reserved_at, free_traction_reservation_token";

export type FreeTractionAuthority = {
  status: FreeTractionStatus;
  campaignId: string | null;
  reservedAt: string | null;
  reservationToken: string | null;
};

export type ReserveFreeTractionSuccess = {
  reservationToken: string;
  recovered: boolean;
  campaignId: string | null;
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

export async function loadFreeTractionAuthority(
  organizationId: string,
): Promise<FreeTractionAuthority> {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select(FREE_TRACTION_AUTHORITY_COLUMNS)
    .eq("id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("[ATHENA_FREE_TRACTION] load_failed", {
      organizationId,
      error: error.message,
    });
    throw new Error("Failed to load Free Traction state.");
  }

  return {
    status: resolveFreeTractionStatus(data?.free_traction_status),
    campaignId: asNullableString(data?.free_traction_campaign_id),
    reservedAt: asNullableString(data?.free_traction_reserved_at),
    reservationToken: asNullableString(data?.free_traction_reservation_token),
  };
}

export async function reserveFreeTraction(
  organizationId: string,
): Promise<ReserveFreeTractionSuccess> {
  const { data, error } = await supabaseAdmin.rpc(
    FREE_TRACTION_AUTHORITY_RPCS.reserve,
    { p_organization_id: organizationId },
  );

  if (error) {
    console.error("[ATHENA_FREE_TRACTION] reserve_failed", {
      organizationId,
      error: error.message,
    });
    throw new Error("Failed to reserve Free Traction.");
  }

  const row = unwrapRpcRow(data);
  if (asBoolean(row?.already_consumed)) {
    throw new FreeTractionGenerationError("FREE_TRACTION_CONSUMED");
  }
  if (asBoolean(row?.already_reserved) || !asBoolean(row?.reserved)) {
    throw new FreeTractionGenerationError("FREE_TRACTION_CONFLICT");
  }

  const reservationToken = asNullableString(row?.reservation_token);
  if (!reservationToken) {
    throw new FreeTractionGenerationError("FREE_TRACTION_CONFLICT");
  }

  return {
    reservationToken,
    recovered: asBoolean(row?.recovered),
    campaignId: asNullableString(row?.campaign_id),
  };
}

export async function bindFreeTractionCampaign(input: {
  organizationId: string;
  reservationToken: string;
  campaignId: string;
}): Promise<void> {
  const { data, error } = await supabaseAdmin.rpc(
    FREE_TRACTION_AUTHORITY_RPCS.bind,
    {
      p_organization_id: input.organizationId,
      p_reservation_token: input.reservationToken,
      p_campaign_id: input.campaignId,
    },
  );

  if (error) {
    console.error("[ATHENA_FREE_TRACTION] bind_failed", {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      error: error.message,
    });
    throw new FreeTractionGenerationError("FREE_TRACTION_CONFLICT");
  }

  const row = unwrapRpcRow(data);
  if (!asBoolean(row?.bound)) {
    throw new FreeTractionGenerationError("FREE_TRACTION_CONFLICT");
  }
}

export async function releaseFreeTractionIfReserved(input: {
  organizationId: string;
  campaignId?: string | null;
  reservationToken?: string | null;
}): Promise<void> {
  const { error } = await supabaseAdmin.rpc(FREE_TRACTION_AUTHORITY_RPCS.release, {
    p_organization_id: input.organizationId,
    p_campaign_id: input.campaignId ?? null,
    p_reservation_token: input.reservationToken ?? null,
  });

  if (error) {
    console.error("[ATHENA_FREE_TRACTION] release_failed", {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      error: error.message,
    });
  }
}

export async function consumeFreeTractionIfReserved(input: {
  organizationId: string;
  campaignId: string;
}): Promise<void> {
  const { error } = await supabaseAdmin.rpc(FREE_TRACTION_AUTHORITY_RPCS.consume, {
    p_organization_id: input.organizationId,
    p_campaign_id: input.campaignId,
  });

  if (error) {
    console.error("[ATHENA_FREE_TRACTION] consume_failed", {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      error: error.message,
    });
  }
}
