import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logSuperAdminAudit } from "@/services/superAdmin/superAdminAuditLog";
import {
  requireGetOblicSuperAdmin,
  type GetOblicSuperAdmin,
} from "@/services/superAdmin/superAdminIdentity";
import {
  LICENSEE_MONTHLY_FEE_LABEL,
  SUB_ACCOUNT_MONTHLY_FEE_LABEL,
  type LicenseeCommercialFeeField,
  type LicenseeCommercialFees,
} from "@/services/superAdmin/superAdminLicenseeCommercialFeeTypes";

export {
  formatLicenseeCommercialFeeUsd,
  LICENSEE_MONTHLY_FEE_LABEL,
  SUB_ACCOUNT_MONTHLY_FEE_LABEL,
  type LicenseeCommercialFeeField,
  type LicenseeCommercialFees,
} from "@/services/superAdmin/superAdminLicenseeCommercialFeeTypes";

export class SuperAdminLicenseeCommercialFeeError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "SuperAdminLicenseeCommercialFeeError";
    this.code = code;
    this.status = status;
  }
}

type LicenseeCommercialFeeRow = {
  id: string;
  user_id: string;
  email: string;
  licensee_monthly_fee_usd: unknown;
  sub_account_monthly_fee_usd: unknown;
};

const FEE_FIELD_LABELS: Record<LicenseeCommercialFeeField, string> = {
  licenseeMonthlyFeeUsd: LICENSEE_MONTHLY_FEE_LABEL,
  subAccountMonthlyFeeUsd: SUB_ACCOUNT_MONTHLY_FEE_LABEL,
};

const INVALID_FEE_MESSAGE = (field: LicenseeCommercialFeeField) =>
  `${FEE_FIELD_LABELS[field]} must be a non-negative USD amount with at most two decimal places.`;

function readStoredFeeUsd(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Object.is(value, -0) ? 0 : Math.round(value * 100) / 100;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Object.is(parsed, -0) ? 0 : Math.round(parsed * 100) / 100;
    }
  }
  return 0;
}

export function parseLicenseeCommercialFeeUsd(
  value: unknown,
  field: LicenseeCommercialFeeField,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SuperAdminLicenseeCommercialFeeError(
      "INVALID_FEE",
      INVALID_FEE_MESSAGE(field),
    );
  }

  if (value < 0) {
    throw new SuperAdminLicenseeCommercialFeeError(
      "INVALID_FEE",
      INVALID_FEE_MESSAGE(field),
    );
  }

  const cents = value * 100;
  if (Math.abs(cents - Math.round(cents)) > 1e-8) {
    throw new SuperAdminLicenseeCommercialFeeError(
      "INVALID_FEE",
      INVALID_FEE_MESSAGE(field),
    );
  }

  const normalized = Math.round(cents) / 100;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function mapLicenseeCommercialFees(
  row: LicenseeCommercialFeeRow,
): LicenseeCommercialFees {
  return {
    licenseeAccountId: row.id,
    masterEmail: row.email,
    licenseeMonthlyFeeUsd: readStoredFeeUsd(row.licensee_monthly_fee_usd),
    subAccountMonthlyFeeUsd: readStoredFeeUsd(row.sub_account_monthly_fee_usd),
  };
}

/**
 * Super Admin read of Licensee-level commercial fees.
 * Defaults to 0.00 when a stored value is missing or unreadable.
 */
export async function listLicenseeCommercialFeesForSuperAdmin(
  actorUserId: string,
): Promise<LicenseeCommercialFees[]> {
  await requireGetOblicSuperAdmin(actorUserId);

  const { data, error } = await supabaseAdmin
    .from("licensee_accounts")
    .select(
      "id, user_id, email, licensee_monthly_fee_usd, sub_account_monthly_fee_usd",
    )
    .order("email", { ascending: true });

  if (error) {
    throw new SuperAdminLicenseeCommercialFeeError(
      "LICENSEE_LIST_FAILED",
      error.message || "Failed to load Licensee commercial fees.",
      500,
    );
  }

  return ((data ?? []) as LicenseeCommercialFeeRow[]).map(
    mapLicenseeCommercialFees,
  );
}

/**
 * Super Admin partial update of Licensee-level commercial fees.
 * Each provided field is validated and written independently.
 * Omitted fields are left unchanged.
 */
export async function updateLicenseeCommercialFeesForSuperAdmin(input: {
  actorUserId: string;
  licenseeAccountId: string;
  licenseeMonthlyFeeUsd?: unknown;
  subAccountMonthlyFeeUsd?: unknown;
}): Promise<{
  superAdmin: GetOblicSuperAdmin;
  fees: LicenseeCommercialFees;
}> {
  const actor = await requireGetOblicSuperAdmin(input.actorUserId);
  const licenseeAccountId = input.licenseeAccountId.trim();

  if (!licenseeAccountId) {
    throw new SuperAdminLicenseeCommercialFeeError(
      "ACCOUNT_NOT_FOUND",
      "licenseeAccountId is required.",
    );
  }

  const hasLicenseeFee = input.licenseeMonthlyFeeUsd !== undefined;
  const hasSubAccountFee = input.subAccountMonthlyFeeUsd !== undefined;

  if (!hasLicenseeFee && !hasSubAccountFee) {
    throw new SuperAdminLicenseeCommercialFeeError(
      "NO_FEE_FIELDS",
      "At least one commercial fee field is required.",
    );
  }

  const nextLicenseeFee = hasLicenseeFee
    ? parseLicenseeCommercialFeeUsd(
        input.licenseeMonthlyFeeUsd,
        "licenseeMonthlyFeeUsd",
      )
    : undefined;
  const nextSubAccountFee = hasSubAccountFee
    ? parseLicenseeCommercialFeeUsd(
        input.subAccountMonthlyFeeUsd,
        "subAccountMonthlyFeeUsd",
      )
    : undefined;

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("licensee_accounts")
    .select(
      "id, user_id, email, licensee_monthly_fee_usd, sub_account_monthly_fee_usd",
    )
    .eq("id", licenseeAccountId)
    .maybeSingle();

  if (existingError) {
    throw new SuperAdminLicenseeCommercialFeeError(
      "LOOKUP_FAILED",
      existingError.message || "Failed to load Licensee commercial fees.",
      500,
    );
  }

  if (!existing?.id) {
    throw new SuperAdminLicenseeCommercialFeeError(
      "ACCOUNT_NOT_FOUND",
      "No Licensee Master was found for this identifier.",
      404,
    );
  }

  const previous = mapLicenseeCommercialFees(existing as LicenseeCommercialFeeRow);
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  const updatedFields: LicenseeCommercialFeeField[] = [];

  if (nextLicenseeFee !== undefined) {
    patch.licensee_monthly_fee_usd = nextLicenseeFee;
    updatedFields.push("licenseeMonthlyFeeUsd");
  }
  if (nextSubAccountFee !== undefined) {
    patch.sub_account_monthly_fee_usd = nextSubAccountFee;
    updatedFields.push("subAccountMonthlyFeeUsd");
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("licensee_accounts")
    .update(patch)
    .eq("id", licenseeAccountId)
    .select(
      "id, user_id, email, licensee_monthly_fee_usd, sub_account_monthly_fee_usd",
    )
    .single();

  if (updateError || !updated?.id) {
    await logSuperAdminAudit({
      actorUserId: actor.user_id,
      action: "update_licensee_commercial_fees",
      targetUserId: String((existing as LicenseeCommercialFeeRow).user_id),
      targetEmail: previous.masterEmail,
      accountType: "licensee",
      metadata: {
        licenseeAccountId,
        previousLicenseeMonthlyFeeUsd: previous.licenseeMonthlyFeeUsd,
        previousSubAccountMonthlyFeeUsd: previous.subAccountMonthlyFeeUsd,
        updatedFields,
      },
      success: false,
      reason: updateError?.message || "Licensee commercial fee update failed.",
    });
    throw new SuperAdminLicenseeCommercialFeeError(
      "FEE_WRITE_FAILED",
      updateError?.message || "Failed to save Licensee commercial fees.",
      500,
    );
  }

  const fees = mapLicenseeCommercialFees(updated as LicenseeCommercialFeeRow);

  await logSuperAdminAudit({
    actorUserId: actor.user_id,
    action: "update_licensee_commercial_fees",
    targetUserId: String((updated as LicenseeCommercialFeeRow).user_id),
    targetEmail: fees.masterEmail,
    accountType: "licensee",
    metadata: {
      licenseeAccountId,
      previousLicenseeMonthlyFeeUsd: previous.licenseeMonthlyFeeUsd,
      previousSubAccountMonthlyFeeUsd: previous.subAccountMonthlyFeeUsd,
      nextLicenseeMonthlyFeeUsd: fees.licenseeMonthlyFeeUsd,
      nextSubAccountMonthlyFeeUsd: fees.subAccountMonthlyFeeUsd,
      updatedFields,
    },
    success: true,
  });

  return { superAdmin: actor, fees };
}
