/**
 * Authoritative Athena V2 prospect-capacity contract.
 *
 * This is a held-Prospect limit per organization / sub-account.
 * It is not GetOblic listing capacity, monthly_allowance,
 * athena_getoblic_directory_settings, or listing-link holds.
 *
 * Counted unit: every row in `prospects` for that organization_id.
 * Prospects are hard-deleted; there is no soft-delete / archive filter.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const MAX_PROSPECTS_PER_ORGANIZATION = 300;
export const PROSPECT_CAPACITY_EXCEEDED_CODE = "PROSPECT_CAPACITY_EXCEEDED";
export const PROSPECT_CAPACITY_EXCEEDED_SQLSTATE = "P0001";
export const PROSPECT_CAPACITY_EXCEEDED_SQL_MESSAGE =
  "prospect_capacity_exceeded";

export type OrganizationProspectCapacity = {
  currentCount: number;
  maximum: typeof MAX_PROSPECTS_PER_ORGANIZATION;
  remaining: number;
  reached: boolean;
};

export class ProspectCapacityExceededError extends Error {
  readonly code = PROSPECT_CAPACITY_EXCEEDED_CODE;
  readonly status = 409;

  constructor(
    message = `This account has reached its ${MAX_PROSPECTS_PER_ORGANIZATION}-prospect limit.`,
  ) {
    super(message);
    this.name = "ProspectCapacityExceededError";
  }
}

export function buildOrganizationProspectCapacity(
  currentCount: number,
): OrganizationProspectCapacity {
  const safeCount = Number.isFinite(currentCount)
    ? Math.max(0, Math.trunc(currentCount))
    : 0;
  const remaining = Math.max(MAX_PROSPECTS_PER_ORGANIZATION - safeCount, 0);
  return {
    currentCount: safeCount,
    maximum: MAX_PROSPECTS_PER_ORGANIZATION,
    remaining,
    reached: safeCount >= MAX_PROSPECTS_PER_ORGANIZATION,
  };
}

export async function countOrganizationProspects(
  organizationId: string,
): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("prospects")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export async function getOrganizationProspectCapacity(
  organizationId: string,
): Promise<OrganizationProspectCapacity> {
  const currentCount = await countOrganizationProspects(organizationId);
  return buildOrganizationProspectCapacity(currentCount);
}

export function prospectCapacityExceededMessage(): string {
  return `This account has reached its ${MAX_PROSPECTS_PER_ORGANIZATION}-prospect limit.`;
}

export function isProspectCapacityExceededError(
  error: unknown,
): error is ProspectCapacityExceededError {
  if (error instanceof ProspectCapacityExceededError) {
    return true;
  }
  if (!error || typeof error !== "object") {
    return false;
  }
  const record = error as {
    code?: string;
    message?: string;
    name?: string;
  };
  if (record.name === "ProspectCapacityExceededError") {
    return true;
  }
  if (record.code === PROSPECT_CAPACITY_EXCEEDED_CODE) {
    return true;
  }
  const message = String(record.message ?? "");
  if (message.includes(PROSPECT_CAPACITY_EXCEEDED_SQL_MESSAGE)) {
    return true;
  }
  return (
    record.code === PROSPECT_CAPACITY_EXCEEDED_SQLSTATE &&
    /prospect capacity|prospect_capacity_exceeded/i.test(message)
  );
}
