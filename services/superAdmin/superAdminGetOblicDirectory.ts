import { EncryptedSecretError, encryptSecret } from "@/lib/serverEncryptedSecret";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getGetOblicAllocationUsage,
  getGetOblicDirectorySettings,
} from "@/services/getoblicDirectory/getoblicDirectoryService";
import { GETOBLIC_DIRECTORY_SETTINGS_TABLE } from "@/services/getoblicDirectory/getoblicDirectoryTypes";
import { logSuperAdminAudit } from "@/services/superAdmin/superAdminAuditLog";
import {
  requireGetOblicSuperAdmin,
  type GetOblicSuperAdmin,
} from "@/services/superAdmin/superAdminIdentity";

const SUPER_ADMIN_DIRECTORY_ACCOUNT_COLUMNS =
  "getoblic_account_email, getoblic_account_password_ciphertext, wordpress_author_id" as const;

export class SuperAdminGetOblicDirectoryError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "SuperAdminGetOblicDirectoryError";
    this.code = code;
    this.status = status;
  }
}

export type SuperAdminGetOblicDirectoryAllocationRow = {
  licenseeAccountId: string;
  organizationId: string;
  organizationName: string;
  displayAlias: string | null;
  isOwnCompany: boolean;
  configured: boolean;
  monthlyAllowance: number | null;
  usedThisMonth: number | null;
  remainingThisMonth: number | null;
  periodStart: string | null;
  getoblicAccountEmail: string | null;
  wordpressUserId: number | null;
  hasGetOblicPassword: boolean;
};

export type SuperAdminGetOblicDirectoryLicenseeGroup = {
  licenseeAccountId: string;
  masterEmail: string;
  ownCompanyOrganizationId: string | null;
  subAccounts: SuperAdminGetOblicDirectoryAllocationRow[];
};

export type SuperAdminGetOblicDirectoryAllocationModel = {
  groups: SuperAdminGetOblicDirectoryLicenseeGroup[];
};

type LicenseeAccountRow = {
  id: string;
  email: string;
  own_company_organization_id: string | null;
};

type LicenseeSubAccountRow = {
  id: string;
  licensee_account_id: string;
  organization_id: string;
  display_name: string | null;
};

type OrganizationRow = {
  id: string;
  name: string;
};

export function assertValidMonthlyAllowance(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SuperAdminGetOblicDirectoryError(
      "INVALID_ALLOWANCE",
      "monthlyAllowance must be a non-negative integer.",
      400,
    );
  }

  if (!Number.isInteger(value) || value < 0) {
    throw new SuperAdminGetOblicDirectoryError(
      "INVALID_ALLOWANCE",
      "monthlyAllowance must be a non-negative integer.",
      400,
    );
  }

  return value;
}

export function assertValidGetOblicAccountEmail(value: unknown): string {
  if (typeof value !== "string") {
    throw new SuperAdminGetOblicDirectoryError(
      "INVALID_EMAIL",
      "email must be a valid GetOblic.com account email.",
      400,
    );
  }

  const trimmed = value.trim();
  if (trimmed.length <= 3 || !trimmed.includes("@")) {
    throw new SuperAdminGetOblicDirectoryError(
      "INVALID_EMAIL",
      "email must be a valid GetOblic.com account email.",
      400,
    );
  }

  return trimmed;
}

export function assertValidWordpressUserId(value: unknown): number {
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    value = Number(value.trim());
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SuperAdminGetOblicDirectoryError(
      "INVALID_WORDPRESS_USER_ID",
      "wordpressUserId must be a positive integer.",
      400,
    );
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw new SuperAdminGetOblicDirectoryError(
      "INVALID_WORDPRESS_USER_ID",
      "wordpressUserId must be a positive integer.",
      400,
    );
  }

  return value;
}

function readPasswordInput(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (typeof value !== "string") {
    throw new SuperAdminGetOblicDirectoryError(
      "PASSWORD_REQUIRED",
      "password must be a string.",
      400,
    );
  }
  return value;
}

function normalizeDisplayAlias(
  displayName: string | null | undefined,
): string | null {
  if (typeof displayName !== "string") {
    return null;
  }
  const trimmed = displayName.trim().replace(/\s+/g, " ");
  return trimmed.length > 0 ? trimmed : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Super Admin read of monthly GetOblic listing allowances.
 *
 * Independent of the Master dashboard sub-account loader — that path pulls
 * tenant intelligence and uses Master authorization. This path is
 * Super-Admin-only and returns a small allocation DTO only.
 *
 * Missing settings row remains unconfigured (not allowance 0).
 * Does not create settings rows.
 */
export async function listGetOblicDirectoryAllocationsForSuperAdmin(
  actorUserId: string,
): Promise<SuperAdminGetOblicDirectoryAllocationModel> {
  await requireGetOblicSuperAdmin(actorUserId);

  const { data: licenseeRows, error: licenseeError } = await supabaseAdmin
    .from("licensee_accounts")
    .select("id, email, own_company_organization_id")
    .order("email", { ascending: true });

  if (licenseeError) {
    throw new SuperAdminGetOblicDirectoryError(
      "LICENSEE_LIST_FAILED",
      licenseeError.message || "Failed to load Licensee Masters.",
      500,
    );
  }

  const licensees = (licenseeRows ?? []) as LicenseeAccountRow[];
  if (licensees.length === 0) {
    return { groups: [] };
  }

  const licenseeIds = licensees.map((row) => row.id);
  const { data: relationshipRows, error: relationshipError } =
    await supabaseAdmin
      .from("licensee_sub_accounts")
      .select("id, licensee_account_id, organization_id, display_name")
      .in("licensee_account_id", licenseeIds);

  if (relationshipError) {
    throw new SuperAdminGetOblicDirectoryError(
      "SUB_ACCOUNT_LIST_FAILED",
      relationshipError.message || "Failed to load Licensee sub-accounts.",
      500,
    );
  }

  const relationships = (relationshipRows ?? []) as LicenseeSubAccountRow[];
  const organizationIds = [
    ...new Set(relationships.map((row) => row.organization_id)),
  ];

  const { data: organizationRows, error: organizationError } =
    organizationIds.length > 0
      ? await supabaseAdmin
          .from("organizations")
          .select("id, name")
          .in("id", organizationIds)
      : { data: [], error: null };

  if (organizationError) {
    throw new SuperAdminGetOblicDirectoryError(
      "ORGANIZATION_LIST_FAILED",
      organizationError.message || "Failed to load organizations.",
      500,
    );
  }

  const organizationById = new Map(
    ((organizationRows ?? []) as OrganizationRow[]).map((org) => [org.id, org]),
  );

  const groups: SuperAdminGetOblicDirectoryLicenseeGroup[] = [];

  for (const licensee of licensees) {
    const licenseeRelationships = relationships.filter(
      (row) => row.licensee_account_id === licensee.id,
    );
    const subAccounts: SuperAdminGetOblicDirectoryAllocationRow[] = [];

    for (const relationship of licenseeRelationships) {
      const organization = organizationById.get(relationship.organization_id);
      if (!organization) {
        continue;
      }

      subAccounts.push(
        await buildAllocationRow({
          licenseeAccountId: licensee.id,
          organizationId: organization.id,
          organizationName: organization.name,
          displayAlias: normalizeDisplayAlias(relationship.display_name),
          isOwnCompany:
            organization.id === licensee.own_company_organization_id,
        }),
      );
    }

    subAccounts.sort((a, b) =>
      a.organizationName.localeCompare(b.organizationName),
    );

    groups.push({
      licenseeAccountId: licensee.id,
      masterEmail: licensee.email,
      ownCompanyOrganizationId: licensee.own_company_organization_id,
      subAccounts,
    });
  }

  return { groups };
}

export async function updateGetOblicDirectoryAllowanceForSuperAdmin(input: {
  actorUserId: string;
  licenseeAccountId: string;
  organizationId: string;
  monthlyAllowance: unknown;
}): Promise<{
  superAdmin: GetOblicSuperAdmin;
  allocation: SuperAdminGetOblicDirectoryAllocationRow;
}> {
  const actor = await requireGetOblicSuperAdmin(input.actorUserId);
  const monthlyAllowance = assertValidMonthlyAllowance(input.monthlyAllowance);
  const { licenseeAccountId, organizationId, licensee, relationship, organization } =
    await requireLicenseeOrganizationRelationship({
      licenseeAccountId: input.licenseeAccountId,
      organizationId: input.organizationId,
    });

  const previous = await getGetOblicDirectorySettings(organizationId);
  const previousAllowance = previous.configured
    ? previous.settings.monthly_allowance
    : null;

  const now = new Date().toISOString();
  const upsertPayload = {
    organization_id: organizationId,
    monthly_allowance: monthlyAllowance,
    updated_at: now,
    updated_by_user_id: actor.user_id,
  };

  const { data: upserted, error: upsertError } = await supabaseAdmin
    .from(GETOBLIC_DIRECTORY_SETTINGS_TABLE)
    .upsert(upsertPayload, { onConflict: "organization_id" })
    .select(
      "organization_id, monthly_allowance, wordpress_author_id, created_at, updated_at, updated_by_user_id",
    )
    .single();

  if (upsertError || !upserted) {
    await logSuperAdminAudit({
      actorUserId: actor.user_id,
      action: "update_getoblic_directory_allowance",
      metadata: {
        licenseeAccountId,
        organizationId,
        previousAllowance,
        nextAllowance: monthlyAllowance,
      },
      success: false,
      reason: upsertError?.message || "GetOblic directory allowance update failed.",
    });
    throw new SuperAdminGetOblicDirectoryError(
      "SETTINGS_WRITE_FAILED",
      upsertError?.message || "Failed to save GetOblic listing allowance.",
      500,
    );
  }

  const allocation = await buildAllocationRow({
    licenseeAccountId,
    organizationId,
    organizationName: String(organization.name ?? ""),
    displayAlias: normalizeDisplayAlias(
      (relationship as LicenseeSubAccountRow).display_name,
    ),
    isOwnCompany:
      organizationId ===
      ((licensee as LicenseeAccountRow).own_company_organization_id ?? null),
  });

  await logSuperAdminAudit({
    actorUserId: actor.user_id,
    action: "update_getoblic_directory_allowance",
    metadata: {
      licenseeAccountId,
      organizationId,
      previousAllowance,
      nextAllowance: monthlyAllowance,
    },
    success: true,
  });

  return { superAdmin: actor, allocation };
}

export async function updateGetOblicDirectoryAccountForSuperAdmin(input: {
  actorUserId: string;
  licenseeAccountId: string;
  organizationId: string;
  email: unknown;
  password: unknown;
  wordpressUserId: unknown;
}): Promise<{
  superAdmin: GetOblicSuperAdmin;
  allocation: SuperAdminGetOblicDirectoryAllocationRow;
}> {
  const actor = await requireGetOblicSuperAdmin(input.actorUserId);
  const email = assertValidGetOblicAccountEmail(input.email);
  const wordpressUserId = assertValidWordpressUserId(input.wordpressUserId);
  const password = readPasswordInput(input.password);
  const { licenseeAccountId, organizationId, licensee, relationship, organization } =
    await requireLicenseeOrganizationRelationship({
      licenseeAccountId: input.licenseeAccountId,
      organizationId: input.organizationId,
    });

  const { data: existing, error: existingError } = await supabaseAdmin
    .from(GETOBLIC_DIRECTORY_SETTINGS_TABLE)
    .select(
      "organization_id, monthly_allowance, wordpress_author_id, getoblic_account_email, getoblic_account_password_ciphertext, created_at, updated_at, updated_by_user_id",
    )
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (existingError) {
    throw new SuperAdminGetOblicDirectoryError(
      "SETTINGS_NOT_CONFIGURED",
      existingError.message || "Failed to load GetOblic directory settings.",
      500,
    );
  }

  if (!existing) {
    throw new SuperAdminGetOblicDirectoryError(
      "SETTINGS_NOT_CONFIGURED",
      "Monthly listing allowance must be configured before saving a GetOblic.com account.",
      409,
    );
  }

  const existingCiphertext = readString(
    (existing as { getoblic_account_password_ciphertext?: unknown })
      .getoblic_account_password_ciphertext,
  );
  const hasExistingPassword = Boolean(existingCiphertext);
  const passwordChanged = password.length > 0;

  if (!hasExistingPassword && !passwordChanged) {
    throw new SuperAdminGetOblicDirectoryError(
      "PASSWORD_REQUIRED",
      "password is required the first time a GetOblic.com account is saved.",
      400,
    );
  }

  let nextCiphertext: string | undefined;
  if (passwordChanged) {
    try {
      nextCiphertext = encryptSecret(password);
    } catch (error) {
      if (error instanceof EncryptedSecretError) {
        throw new SuperAdminGetOblicDirectoryError(
          "SETTINGS_WRITE_FAILED",
          error.message,
          500,
        );
      }
      throw error;
    }
  }

  const now = new Date().toISOString();
  const updatePayload: Record<string, unknown> = {
    getoblic_account_email: email,
    wordpress_author_id: wordpressUserId,
    updated_at: now,
    updated_by_user_id: actor.user_id,
  };
  if (nextCiphertext !== undefined) {
    updatePayload.getoblic_account_password_ciphertext = nextCiphertext;
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from(GETOBLIC_DIRECTORY_SETTINGS_TABLE)
    .update(updatePayload)
    .eq("organization_id", organizationId)
    .select(
      "organization_id, monthly_allowance, wordpress_author_id, getoblic_account_email, created_at, updated_at, updated_by_user_id",
    )
    .single();

  if (updateError || !updated) {
    await logSuperAdminAudit({
      actorUserId: actor.user_id,
      action: "update_getoblic_directory_account",
      metadata: {
        licenseeAccountId,
        organizationId,
        email,
        wordpressUserId,
        passwordChanged,
      },
      success: false,
      reason: updateError?.message || "GetOblic directory account update failed.",
    });
    throw new SuperAdminGetOblicDirectoryError(
      "SETTINGS_WRITE_FAILED",
      updateError?.message || "Failed to save GetOblic.com account.",
      500,
    );
  }

  const allocation = await buildAllocationRow({
    licenseeAccountId,
    organizationId,
    organizationName: String(organization.name ?? ""),
    displayAlias: normalizeDisplayAlias(
      (relationship as LicenseeSubAccountRow).display_name,
    ),
    isOwnCompany:
      organizationId ===
      ((licensee as LicenseeAccountRow).own_company_organization_id ?? null),
  });

  await logSuperAdminAudit({
    actorUserId: actor.user_id,
    action: "update_getoblic_directory_account",
    metadata: {
      licenseeAccountId,
      organizationId,
      email,
      wordpressUserId,
      passwordChanged,
    },
    success: true,
  });

  return { superAdmin: actor, allocation };
}

async function requireLicenseeOrganizationRelationship(input: {
  licenseeAccountId: string;
  organizationId: string;
}): Promise<{
  licenseeAccountId: string;
  organizationId: string;
  licensee: LicenseeAccountRow;
  relationship: LicenseeSubAccountRow;
  organization: OrganizationRow;
}> {
  const licenseeAccountId = readString(input.licenseeAccountId)?.trim() ?? "";
  const organizationId = readString(input.organizationId)?.trim() ?? "";

  if (!licenseeAccountId || !organizationId) {
    throw new SuperAdminGetOblicDirectoryError(
      "ACCOUNT_NOT_FOUND",
      "licenseeAccountId and organizationId are required.",
      400,
    );
  }

  const { data: licensee, error: licenseeError } = await supabaseAdmin
    .from("licensee_accounts")
    .select("id, email, own_company_organization_id")
    .eq("id", licenseeAccountId)
    .maybeSingle();

  if (licenseeError) {
    throw new SuperAdminGetOblicDirectoryError(
      "ACCOUNT_NOT_FOUND",
      licenseeError.message || "Failed to resolve Licensee account.",
      500,
    );
  }

  if (!licensee?.id) {
    throw new SuperAdminGetOblicDirectoryError(
      "ACCOUNT_NOT_FOUND",
      "Licensee account was not found.",
      404,
    );
  }

  const { data: relationship, error: relationshipError } = await supabaseAdmin
    .from("licensee_sub_accounts")
    .select("id, licensee_account_id, organization_id, display_name")
    .eq("licensee_account_id", licenseeAccountId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (relationshipError) {
    throw new SuperAdminGetOblicDirectoryError(
      "RELATIONSHIP_NOT_FOUND",
      relationshipError.message || "Failed to resolve Licensee sub-account.",
      500,
    );
  }

  if (!relationship?.id) {
    throw new SuperAdminGetOblicDirectoryError(
      "RELATIONSHIP_NOT_FOUND",
      "Organization is not a sub-account of the supplied Licensee.",
      404,
    );
  }

  const { data: organization, error: organizationError } = await supabaseAdmin
    .from("organizations")
    .select("id, name")
    .eq("id", organizationId)
    .maybeSingle();

  if (organizationError) {
    throw new SuperAdminGetOblicDirectoryError(
      "ORGANIZATION_NOT_FOUND",
      organizationError.message || "Failed to resolve organization.",
      500,
    );
  }

  if (!organization?.id) {
    throw new SuperAdminGetOblicDirectoryError(
      "ORGANIZATION_NOT_FOUND",
      "Organization was not found.",
      404,
    );
  }

  return {
    licenseeAccountId,
    organizationId,
    licensee: licensee as LicenseeAccountRow,
    relationship: relationship as LicenseeSubAccountRow,
    organization: organization as OrganizationRow,
  };
}

async function loadSuperAdminDirectoryAccountFields(organizationId: string): Promise<{
  getoblicAccountEmail: string | null;
  wordpressUserId: number | null;
  hasGetOblicPassword: boolean;
}> {
  const empty = {
    getoblicAccountEmail: null,
    wordpressUserId: null,
    hasGetOblicPassword: false,
  };

  const { data, error } = await supabaseAdmin
    .from(GETOBLIC_DIRECTORY_SETTINGS_TABLE)
    .select(SUPER_ADMIN_DIRECTORY_ACCOUNT_COLUMNS)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) {
    return empty;
  }

  const row = data as {
    getoblic_account_email?: unknown;
    getoblic_account_password_ciphertext?: unknown;
    wordpress_author_id?: unknown;
  };

  return {
    getoblicAccountEmail: readString(row.getoblic_account_email)?.trim() || null,
    wordpressUserId: readPositiveInteger(row.wordpress_author_id),
    hasGetOblicPassword: Boolean(readString(row.getoblic_account_password_ciphertext)),
  };
}

function readPositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

async function buildAllocationRow(input: {
  licenseeAccountId: string;
  organizationId: string;
  organizationName: string;
  displayAlias: string | null;
  isOwnCompany: boolean;
}): Promise<SuperAdminGetOblicDirectoryAllocationRow> {
  const account = await loadSuperAdminDirectoryAccountFields(
    input.organizationId,
  );
  const settings = await getGetOblicDirectorySettings(input.organizationId);
  if (!settings.configured) {
    return {
      licenseeAccountId: input.licenseeAccountId,
      organizationId: input.organizationId,
      organizationName: input.organizationName,
      displayAlias: input.displayAlias,
      isOwnCompany: input.isOwnCompany,
      configured: false,
      monthlyAllowance: null,
      usedThisMonth: null,
      remainingThisMonth: null,
      periodStart: null,
      ...account,
    };
  }

  const usage = await getGetOblicAllocationUsage(input.organizationId);
  if (!usage.configured) {
    return {
      licenseeAccountId: input.licenseeAccountId,
      organizationId: input.organizationId,
      organizationName: input.organizationName,
      displayAlias: input.displayAlias,
      isOwnCompany: input.isOwnCompany,
      configured: false,
      monthlyAllowance: null,
      usedThisMonth: null,
      remainingThisMonth: null,
      periodStart: null,
      ...account,
    };
  }

  return {
    licenseeAccountId: input.licenseeAccountId,
    organizationId: input.organizationId,
    organizationName: input.organizationName,
    displayAlias: input.displayAlias,
    isOwnCompany: input.isOwnCompany,
    configured: true,
    monthlyAllowance: usage.monthly_allowance,
    usedThisMonth: usage.used,
    remainingThisMonth: usage.remaining,
    periodStart: usage.period_start,
    ...account,
  };
}
