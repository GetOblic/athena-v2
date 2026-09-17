/**
 * Organization-scoped Free Visibility reservation authority.
 * Server-only. /seo reads; only the Visibility create / worker paths mutate.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  resolveFreeVisibilityStatus,
  type FreeVisibilityStatus,
} from "@/lib/organization/freeVisibility";
import { FreeVisibilityGenerationError } from "@/lib/organization/freeVisibilityGeneration";

export const FREE_VISIBILITY_AUTHORITY_RPCS = {
  reserve: "reserve_athena_free_visibility",
  bind: "bind_athena_free_visibility_report",
  release: "release_athena_free_visibility",
  consume: "consume_athena_free_visibility",
} as const;

export const FREE_VISIBILITY_AUTHORITY_COLUMNS =
  "free_visibility_status, free_visibility_report_id, free_visibility_reserved_at, free_visibility_reservation_token";

export type FreeVisibilityAuthority = {
  status: FreeVisibilityStatus;
  reportId: string | null;
  reservedAt: string | null;
  reservationToken: string | null;
};

export type ReserveFreeVisibilitySuccess = {
  reservationToken: string;
  recovered: boolean;
  reportId: string | null;
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

export async function loadFreeVisibilityAuthority(
  organizationId: string,
): Promise<FreeVisibilityAuthority> {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select(FREE_VISIBILITY_AUTHORITY_COLUMNS)
    .eq("id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("[ATHENA_FREE_VISIBILITY] load_failed", {
      organizationId,
      error: error.message,
    });
    throw new Error("Failed to load Free Visibility state.");
  }

  return {
    status: resolveFreeVisibilityStatus(data?.free_visibility_status),
    reportId: asNullableString(data?.free_visibility_report_id),
    reservedAt: asNullableString(data?.free_visibility_reserved_at),
    reservationToken: asNullableString(data?.free_visibility_reservation_token),
  };
}

export async function reserveFreeVisibility(
  organizationId: string,
): Promise<ReserveFreeVisibilitySuccess> {
  const { data, error } = await supabaseAdmin.rpc(
    FREE_VISIBILITY_AUTHORITY_RPCS.reserve,
    { p_organization_id: organizationId },
  );

  if (error) {
    console.error("[ATHENA_FREE_VISIBILITY] reserve_failed", {
      organizationId,
      error: error.message,
    });
    throw new Error("Failed to reserve Free Visibility.");
  }

  const row = unwrapRpcRow(data);
  if (asBoolean(row?.already_consumed)) {
    throw new FreeVisibilityGenerationError("FREE_VISIBILITY_CONSUMED");
  }
  if (asBoolean(row?.already_reserved) || !asBoolean(row?.reserved)) {
    throw new FreeVisibilityGenerationError("FREE_VISIBILITY_CONFLICT");
  }

  const reservationToken = asNullableString(row?.reservation_token);
  if (!reservationToken) {
    throw new FreeVisibilityGenerationError("FREE_VISIBILITY_CONFLICT");
  }

  return {
    reservationToken,
    recovered: asBoolean(row?.recovered),
    reportId: asNullableString(row?.report_id),
  };
}

export async function bindFreeVisibilityReport(input: {
  organizationId: string;
  reservationToken: string;
  reportId: string;
}): Promise<void> {
  const { data, error } = await supabaseAdmin.rpc(
    FREE_VISIBILITY_AUTHORITY_RPCS.bind,
    {
      p_organization_id: input.organizationId,
      p_reservation_token: input.reservationToken,
      p_report_id: input.reportId,
    },
  );

  if (error) {
    console.error("[ATHENA_FREE_VISIBILITY] bind_failed", {
      organizationId: input.organizationId,
      reportId: input.reportId,
      error: error.message,
    });
    throw new FreeVisibilityGenerationError("FREE_VISIBILITY_CONFLICT");
  }

  const row = unwrapRpcRow(data);
  if (!asBoolean(row?.bound)) {
    throw new FreeVisibilityGenerationError("FREE_VISIBILITY_CONFLICT");
  }
}

export async function releaseFreeVisibilityIfReserved(input: {
  organizationId: string;
  reportId?: string | null;
  reservationToken?: string | null;
}): Promise<void> {
  const { error } = await supabaseAdmin.rpc(FREE_VISIBILITY_AUTHORITY_RPCS.release, {
    p_organization_id: input.organizationId,
    p_report_id: input.reportId ?? null,
    p_reservation_token: input.reservationToken ?? null,
  });

  if (error) {
    console.error("[ATHENA_FREE_VISIBILITY] release_failed", {
      organizationId: input.organizationId,
      reportId: input.reportId,
      error: error.message,
    });
  }
}

export async function consumeFreeVisibilityIfReserved(input: {
  organizationId: string;
  reportId: string;
}): Promise<void> {
  const { error } = await supabaseAdmin.rpc(FREE_VISIBILITY_AUTHORITY_RPCS.consume, {
    p_organization_id: input.organizationId,
    p_report_id: input.reportId,
  });

  if (error) {
    console.error("[ATHENA_FREE_VISIBILITY] consume_failed", {
      organizationId: input.organizationId,
      reportId: input.reportId,
      error: error.message,
    });
  }
}
