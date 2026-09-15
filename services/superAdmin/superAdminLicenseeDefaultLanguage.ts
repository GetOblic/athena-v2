import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  OrganizationLanguageInvalidError,
  parseOrganizationLanguage,
  resolveOrganizationLanguageValue,
  type OrganizationLanguage,
} from "@/services/organizationLanguage";
import { logSuperAdminAudit } from "@/services/superAdmin/superAdminAuditLog";
import {
  requireGetOblicSuperAdmin,
  type GetOblicSuperAdmin,
} from "@/services/superAdmin/superAdminIdentity";
import {
  LICENSEE_DEFAULT_LANGUAGE_LABEL,
  type LicenseeDefaultLanguageSetting,
} from "@/services/superAdmin/superAdminLicenseeDefaultLanguageTypes";

export {
  LICENSEE_DEFAULT_LANGUAGE_LABEL,
  type LicenseeDefaultLanguageSetting,
} from "@/services/superAdmin/superAdminLicenseeDefaultLanguageTypes";

export class SuperAdminLicenseeDefaultLanguageError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "SuperAdminLicenseeDefaultLanguageError";
    this.code = code;
    this.status = status;
  }
}

type LicenseeDefaultLanguageRow = {
  id: string;
  user_id: string;
  email: string;
  default_language: unknown;
};

const INVALID_LANGUAGE_MESSAGE = `A supported ${LICENSEE_DEFAULT_LANGUAGE_LABEL} is required.`;

export function parseLicenseeDefaultLanguage(
  value: unknown,
): OrganizationLanguage {
  try {
    return parseOrganizationLanguage(value);
  } catch (error) {
    if (error instanceof OrganizationLanguageInvalidError) {
      throw new SuperAdminLicenseeDefaultLanguageError(
        "INVALID_LANGUAGE",
        INVALID_LANGUAGE_MESSAGE,
      );
    }
    throw error;
  }
}

function mapLicenseeDefaultLanguage(
  row: LicenseeDefaultLanguageRow,
): LicenseeDefaultLanguageSetting {
  return {
    licenseeAccountId: row.id,
    masterEmail: row.email,
    defaultLanguage: resolveOrganizationLanguageValue(row.default_language),
  };
}

/**
 * Super Admin read of Licensee Master default language.
 * Falls back to English when a stored value is missing or unreadable.
 */
export async function listLicenseeDefaultLanguagesForSuperAdmin(
  actorUserId: string,
): Promise<LicenseeDefaultLanguageSetting[]> {
  await requireGetOblicSuperAdmin(actorUserId);

  const { data, error } = await supabaseAdmin
    .from("licensee_accounts")
    .select("id, user_id, email, default_language")
    .order("email", { ascending: true });

  if (error) {
    throw new SuperAdminLicenseeDefaultLanguageError(
      "LICENSEE_LIST_FAILED",
      error.message || "Failed to load Licensee default languages.",
      500,
    );
  }

  return ((data ?? []) as LicenseeDefaultLanguageRow[]).map(
    mapLicenseeDefaultLanguage,
  );
}

/**
 * Super Admin update of Licensee Master default language.
 * Writes only licensee_accounts.default_language.
 * Never updates organizations.language or existing sub-accounts.
 */
export async function updateLicenseeDefaultLanguageForSuperAdmin(input: {
  actorUserId: string;
  licenseeAccountId: string;
  defaultLanguage: unknown;
}): Promise<{
  superAdmin: GetOblicSuperAdmin;
  setting: LicenseeDefaultLanguageSetting;
}> {
  const actor = await requireGetOblicSuperAdmin(input.actorUserId);
  const licenseeAccountId = input.licenseeAccountId.trim();

  if (!licenseeAccountId) {
    throw new SuperAdminLicenseeDefaultLanguageError(
      "ACCOUNT_NOT_FOUND",
      "licenseeAccountId is required.",
    );
  }

  const nextLanguage = parseLicenseeDefaultLanguage(input.defaultLanguage);

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("licensee_accounts")
    .select("id, user_id, email, default_language")
    .eq("id", licenseeAccountId)
    .maybeSingle();

  if (existingError) {
    throw new SuperAdminLicenseeDefaultLanguageError(
      "LOOKUP_FAILED",
      existingError.message || "Failed to load Licensee default language.",
      500,
    );
  }

  if (!existing?.id) {
    throw new SuperAdminLicenseeDefaultLanguageError(
      "ACCOUNT_NOT_FOUND",
      "No Licensee Master was found for this identifier.",
      404,
    );
  }

  const previous = mapLicenseeDefaultLanguage(
    existing as LicenseeDefaultLanguageRow,
  );

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("licensee_accounts")
    .update({
      default_language: nextLanguage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", licenseeAccountId)
    .select("id, user_id, email, default_language")
    .single();

  if (updateError || !updated?.id) {
    await logSuperAdminAudit({
      actorUserId: actor.user_id,
      action: "update_licensee_default_language",
      targetUserId: String((existing as LicenseeDefaultLanguageRow).user_id),
      targetEmail: previous.masterEmail,
      accountType: "licensee",
      metadata: {
        licenseeAccountId,
        previousDefaultLanguage: previous.defaultLanguage,
        nextDefaultLanguage: nextLanguage,
      },
      success: false,
      reason: updateError?.message || "Licensee default language update failed.",
    });
    throw new SuperAdminLicenseeDefaultLanguageError(
      "LANGUAGE_WRITE_FAILED",
      updateError?.message || "Failed to save Licensee default language.",
      500,
    );
  }

  const setting = mapLicenseeDefaultLanguage(
    updated as LicenseeDefaultLanguageRow,
  );

  await logSuperAdminAudit({
    actorUserId: actor.user_id,
    action: "update_licensee_default_language",
    targetUserId: String((updated as LicenseeDefaultLanguageRow).user_id),
    targetEmail: setting.masterEmail,
    accountType: "licensee",
    metadata: {
      licenseeAccountId,
      previousDefaultLanguage: previous.defaultLanguage,
      nextDefaultLanguage: setting.defaultLanguage,
    },
    success: true,
  });

  return { superAdmin: actor, setting };
}
