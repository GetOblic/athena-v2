/**
 * Organization-scoped Free starter reservation authority.
 * Server-only. Home reads; only the starter create / worker paths mutate.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  resolveFreeStarterStatus,
  type FreeStarterStatus,
} from "@/lib/organization/freeStarter";
import { FreeSocialPlannerGenerationError } from "@/lib/organization/freeSocialPlannerGeneration";

export const FREE_STARTER_AUTHORITY_RPCS = {
  reserve: "reserve_athena_free_starter",
  bind: "bind_athena_free_starter_calendar",
  release: "release_athena_free_starter",
  consume: "consume_athena_free_starter",
} as const;

export const FREE_STARTER_AUTHORITY_COLUMNS =
  "free_starter_status, free_starter_calendar_id, free_starter_reserved_at, free_starter_reservation_token";

export type FreeStarterAuthority = {
  status: FreeStarterStatus;
  calendarId: string | null;
  reservedAt: string | null;
  reservationToken: string | null;
};

export type ReserveFreeStarterSuccess = {
  reservationToken: string;
  recovered: boolean;
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

export async function loadFreeStarterAuthority(
  organizationId: string,
): Promise<FreeStarterAuthority> {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select(FREE_STARTER_AUTHORITY_COLUMNS)
    .eq("id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("[ATHENA_FREE_STARTER] load_failed", {
      organizationId,
      error: error.message,
    });
    throw new Error("Failed to load Free starter state.");
  }

  return {
    status: resolveFreeStarterStatus(data?.free_starter_status),
    calendarId: asNullableString(data?.free_starter_calendar_id),
    reservedAt: asNullableString(data?.free_starter_reserved_at),
    reservationToken: asNullableString(data?.free_starter_reservation_token),
  };
}

export async function reserveFreeStarter(
  organizationId: string,
): Promise<ReserveFreeStarterSuccess> {
  const { data, error } = await supabaseAdmin.rpc(
    FREE_STARTER_AUTHORITY_RPCS.reserve,
    { p_organization_id: organizationId },
  );

  if (error) {
    console.error("[ATHENA_FREE_STARTER] reserve_failed", {
      organizationId,
      error: error.message,
    });
    throw new Error("Failed to reserve Free starter.");
  }

  const row = unwrapRpcRow(data);
  if (asBoolean(row?.already_consumed)) {
    throw new FreeSocialPlannerGenerationError("FREE_STARTER_CONSUMED");
  }
  if (asBoolean(row?.already_reserved) || !asBoolean(row?.reserved)) {
    throw new FreeSocialPlannerGenerationError("FREE_STARTER_CONFLICT");
  }

  const reservationToken = asNullableString(row?.reservation_token);
  if (!reservationToken) {
    throw new FreeSocialPlannerGenerationError("FREE_STARTER_CONFLICT");
  }

  return {
    reservationToken,
    recovered: asBoolean(row?.recovered),
  };
}

export async function bindFreeStarterCalendar(input: {
  organizationId: string;
  reservationToken: string;
  calendarId: string;
}): Promise<void> {
  const { data, error } = await supabaseAdmin.rpc(
    FREE_STARTER_AUTHORITY_RPCS.bind,
    {
      p_organization_id: input.organizationId,
      p_reservation_token: input.reservationToken,
      p_calendar_id: input.calendarId,
    },
  );

  if (error) {
    console.error("[ATHENA_FREE_STARTER] bind_failed", {
      organizationId: input.organizationId,
      calendarId: input.calendarId,
      error: error.message,
    });
    throw new FreeSocialPlannerGenerationError("FREE_STARTER_CONFLICT");
  }

  const row = unwrapRpcRow(data);
  if (!asBoolean(row?.bound)) {
    throw new FreeSocialPlannerGenerationError("FREE_STARTER_CONFLICT");
  }
}

export async function releaseFreeStarterIfReserved(input: {
  organizationId: string;
  calendarId?: string | null;
  reservationToken?: string | null;
}): Promise<void> {
  const { error } = await supabaseAdmin.rpc(FREE_STARTER_AUTHORITY_RPCS.release, {
    p_organization_id: input.organizationId,
    p_calendar_id: input.calendarId ?? null,
    p_reservation_token: input.reservationToken ?? null,
  });

  if (error) {
    console.error("[ATHENA_FREE_STARTER] release_failed", {
      organizationId: input.organizationId,
      calendarId: input.calendarId,
      error: error.message,
    });
  }
}

export async function consumeFreeStarterIfReserved(input: {
  organizationId: string;
  calendarId: string;
}): Promise<void> {
  const { error } = await supabaseAdmin.rpc(FREE_STARTER_AUTHORITY_RPCS.consume, {
    p_organization_id: input.organizationId,
    p_calendar_id: input.calendarId,
  });

  if (error) {
    console.error("[ATHENA_FREE_STARTER] consume_failed", {
      organizationId: input.organizationId,
      calendarId: input.calendarId,
      error: error.message,
    });
  }
}
