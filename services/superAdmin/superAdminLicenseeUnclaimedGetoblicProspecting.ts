import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logSuperAdminAudit } from "@/services/superAdmin/superAdminAuditLog";
import {
  requireGetOblicSuperAdmin,
  type GetOblicSuperAdmin,
} from "@/services/superAdmin/superAdminIdentity";
import type { LicenseeUnclaimedGetoblicProspectingSetting } from "@/services/superAdmin/superAdminLicenseeUnclaimedGetoblicProspectingTypes";

export type { LicenseeUnclaimedGetoblicProspectingSetting } from "@/services/superAdmin/superAdminLicenseeUnclaimedGetoblicProspectingTypes";

export class SuperAdminLicenseeUnclaimedGetoblicProspectingError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "SuperAdminLicenseeUnclaimedGetoblicProspectingError";
    this.code = code;
    this.status = status;
  }
}

type LicenseeUnclaimedGetoblicProspectingRow = {
  id: string;
  user_id: string;
  email: string;
  allow_unclaimed_getoblic_prospecting: unknown;
};

const INVALID_PERMISSION_MESSAGE =
  "allowUnclaimedGetoblicProspecting must be a boolean.";

/**
 * Exact boolean only. Strings, numbers, null, and omitted values are rejected.
 * Callers that treat absence as false must do that before calling this parser.
 */
export function parseAllowUnclaimedGetoblicProspecting(value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new SuperAdminLicenseeUnclaimedGetoblicProspectingError(
      "INVALID_UNCLAIMED_GETOBLIC_PROSPECTING",
      INVALID_PERMISSION_MESSAGE,
    );
  }
  return value;
}

function readStoredAllowUnclaimedGetoblicProspecting(value: unknown): boolean {
  return value === true;
}

function mapLicenseeUnclaimedGetoblicProspecting(
  row: LicenseeUnclaimedGetoblicProspectingRow,
): LicenseeUnclaimedGetoblicProspectingSetting {
  return {
    licenseeAccountId: row.id,
    masterEmail: row.email,
    allowUnclaimedGetoblicProspecting:
      readStoredAllowUnclaimedGetoblicProspecting(
        row.allow_unclaimed_getoblic_prospecting,
      ),
  };
}

/**
 * Super Admin read of the Licensee unclaimed GetOblic prospecting flag.
 * Only an exact stored true is enabled. Missing or non-boolean values read as false.
 */
export async function listLicenseeUnclaimedGetoblicProspectingForSuperAdmin(
  actorUserId: string,
): Promise<LicenseeUnclaimedGetoblicProspectingSetting[]> {
  await requireGetOblicSuperAdmin(actorUserId);

  const { data, error } = await supabaseAdmin
    .from("licensee_accounts")
    .select("id, user_id, email, allow_unclaimed_getoblic_prospecting")
    .order("email", { ascending: true });

  if (error) {
    throw new SuperAdminLicenseeUnclaimedGetoblicProspectingError(
      "LICENSEE_LIST_FAILED",
      error.message ||
        "Failed to load Licensee unclaimed GetOblic prospecting.",
      500,
    );
  }

  return ((data ?? []) as LicenseeUnclaimedGetoblicProspectingRow[]).map(
    mapLicenseeUnclaimedGetoblicProspecting,
  );
}

/**
 * Super Admin update of licensee_accounts.allow_unclaimed_getoblic_prospecting.
 * Writes only that column and updated_at.
 * The flag may be saved before Own Company designation.
 * Saving it does not grant tenant prospecting by itself.
 */
export async function updateLicenseeUnclaimedGetoblicProspectingForSuperAdmin(input: {
  actorUserId: string;
  licenseeAccountId: string;
  allowUnclaimedGetoblicProspecting: unknown;
}): Promise<{
  superAdmin: GetOblicSuperAdmin;
  setting: LicenseeUnclaimedGetoblicProspectingSetting;
}> {
  const actor = await requireGetOblicSuperAdmin(input.actorUserId);
  const licenseeAccountId = input.licenseeAccountId.trim();

  if (!licenseeAccountId) {
    throw new SuperAdminLicenseeUnclaimedGetoblicProspectingError(
      "ACCOUNT_NOT_FOUND",
      "licenseeAccountId is required.",
    );
  }

  const nextPermission = parseAllowUnclaimedGetoblicProspecting(
    input.allowUnclaimedGetoblicProspecting,
  );

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("licensee_accounts")
    .select("id, user_id, email, allow_unclaimed_getoblic_prospecting")
    .eq("id", licenseeAccountId)
    .maybeSingle();

  if (existingError) {
    throw new SuperAdminLicenseeUnclaimedGetoblicProspectingError(
      "LOOKUP_FAILED",
      existingError.message ||
        "Failed to load Licensee unclaimed GetOblic prospecting.",
      500,
    );
  }

  if (!existing?.id) {
    throw new SuperAdminLicenseeUnclaimedGetoblicProspectingError(
      "ACCOUNT_NOT_FOUND",
      "No Licensee Master was found for this identifier.",
      404,
    );
  }

  const previous = mapLicenseeUnclaimedGetoblicProspecting(
    existing as LicenseeUnclaimedGetoblicProspectingRow,
  );

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("licensee_accounts")
    .update({
      allow_unclaimed_getoblic_prospecting: nextPermission,
      updated_at: new Date().toISOString(),
    })
    .eq("id", licenseeAccountId)
    .select("id, user_id, email, allow_unclaimed_getoblic_prospecting")
    .single();

  if (updateError || !updated?.id) {
    await logSuperAdminAudit({
      actorUserId: actor.user_id,
      action: "update_licensee_unclaimed_getoblic_prospecting",
      targetUserId: String(
        (existing as LicenseeUnclaimedGetoblicProspectingRow).user_id,
      ),
      targetEmail: previous.masterEmail,
      accountType: "licensee",
      metadata: {
        licenseeAccountId,
        previousAllowUnclaimedGetoblicProspecting:
          previous.allowUnclaimedGetoblicProspecting,
        nextAllowUnclaimedGetoblicProspecting: nextPermission,
      },
      success: false,
      reason:
        updateError?.message ||
        "Licensee unclaimed GetOblic prospecting update failed.",
    });
    throw new SuperAdminLicenseeUnclaimedGetoblicProspectingError(
      "PERMISSION_WRITE_FAILED",
      updateError?.message ||
        "Failed to save Licensee unclaimed GetOblic prospecting.",
      500,
    );
  }

  const setting = mapLicenseeUnclaimedGetoblicProspecting(
    updated as LicenseeUnclaimedGetoblicProspectingRow,
  );

  await logSuperAdminAudit({
    actorUserId: actor.user_id,
    action: "update_licensee_unclaimed_getoblic_prospecting",
    targetUserId: String(
      (updated as LicenseeUnclaimedGetoblicProspectingRow).user_id,
    ),
    targetEmail: setting.masterEmail,
    accountType: "licensee",
    metadata: {
      licenseeAccountId,
      previousAllowUnclaimedGetoblicProspecting:
        previous.allowUnclaimedGetoblicProspecting,
      nextAllowUnclaimedGetoblicProspecting:
        setting.allowUnclaimedGetoblicProspecting,
    },
    success: true,
  });

  return { superAdmin: actor, setting };
}
