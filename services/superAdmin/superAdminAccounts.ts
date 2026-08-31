import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  createConfirmedAuthUser,
  findAuthUserByEmail,
} from "@/services/licensee/licenseeAuthUserLookup";
import { isLicenseeMasterUser } from "@/services/licensee/licenseeIdentity";
import {
  assertAccountAccessActive,
  ensureAccountAccessActive,
  getAccountAccessStatus,
  banAuthUser,
  isAuthUserBanned,
  setAccountAccessDeactivated,
  unbanAuthUser,
  type AccountAccessStatusValue,
} from "@/services/superAdmin/accountAccessStatus";
import { logSuperAdminAudit } from "@/services/superAdmin/superAdminAuditLog";
import {
  isGetOblicSuperAdminUser,
  requireGetOblicSuperAdmin,
} from "@/services/superAdmin/superAdminIdentity";
import {
  OrganizationLanguageInvalidError,
  parseOrganizationLanguage,
  type OrganizationLanguage,
} from "@/services/organizationLanguage";
import {
  getOrganizationMembership,
  provisionTenantForAuthenticatedUserDetailed,
} from "@/services/organizationService";

export class SuperAdminOperationError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SuperAdminOperationError";
    this.code = code;
  }
}

export type ManageableAccountType = "athena" | "licensee";

export type ManageableAccount = {
  userId: string;
  email: string;
  accountType: ManageableAccountType;
  displayName: string;
  organizationId: string | null;
  licenseeAccountId: string | null;
  status: AccountAccessStatusValue;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeBusinessName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/**
 * Bounded internal rollback for a failed Super Admin create operation.
 * NEVER deletes a pre-existing Auth user or organization.
 * Not a product deletion capability — compensating cleanup only.
 */
async function cleanupFailedCreateResources(input: {
  authUserCreated: boolean;
  authUserId: string | null;
  organizationCreated: boolean;
  organizationId: string | null;
}): Promise<void> {
  const leftovers: string[] = [];

  if (input.organizationCreated && input.organizationId) {
    const { error } = await supabaseAdmin
      .from("organizations")
      .delete()
      .eq("id", input.organizationId);
    if (error) {
      leftovers.push(`organizationId=${input.organizationId}`);
      console.error(
        "[GETOBLIC_SUPER_ADMIN] failed create: newly-created organization cleanup failed",
        {
          leftoverOrganizationId: input.organizationId,
          error: error.message,
        },
      );
    }
  }

  if (input.authUserCreated && input.authUserId) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(
      input.authUserId,
    );
    if (error) {
      leftovers.push(`authUserId=${input.authUserId}`);
      console.error(
        "[GETOBLIC_SUPER_ADMIN] failed create: newly-created auth user cleanup failed",
        {
          leftoverAuthUserId: input.authUserId,
          error: error.message,
        },
      );
    }
  }

  if (leftovers.length > 0) {
    throw new SuperAdminOperationError(
      "CREATE_CLEANUP_FAILED",
      `Account creation failed and compensating cleanup could not finish. Leftover: ${leftovers.join(", ")}. Retry after inspecting these identifiers.`,
    );
  }
}

async function rejectRoleOverlap(input: {
  userId: string;
  email: string;
  intendedRole: "athena" | "licensee";
}): Promise<void> {
  if (await isGetOblicSuperAdminUser(input.userId)) {
    throw new SuperAdminOperationError(
      "ROLE_OVERLAP_SUPER_ADMIN",
      `This email (${input.email}) is already a GetOblic Super Admin and cannot become a ${
        input.intendedRole === "athena"
          ? "normal Athena account"
          : "Licensee Master"
      }.`,
    );
  }

  if (await isLicenseeMasterUser(input.userId)) {
    if (input.intendedRole === "athena") {
      throw new SuperAdminOperationError(
        "ROLE_OVERLAP_LICENSEE_MASTER",
        `This email (${input.email}) is already a Business Licensee Master and cannot become a normal Athena account.`,
      );
    }
    throw new SuperAdminOperationError(
      "ALREADY_LICENSEE_MASTER",
      `This email (${input.email}) is already a Business Licensee Master.`,
    );
  }

  const membership = await getOrganizationMembership(input.userId);
  if (membership?.organization_id) {
    if (input.intendedRole === "licensee") {
      throw new SuperAdminOperationError(
        "ROLE_OVERLAP_ATHENA_OWNER",
        `This email (${input.email}) already owns a normal Athena organization and cannot become a Licensee Master.`,
      );
    }
    throw new SuperAdminOperationError(
      "ALREADY_ATHENA_OWNER",
      `This email (${input.email}) already owns a normal Athena organization. Athena preserves one-user → one-organization.`,
    );
  }
}

export type CreateAthenaAccountResult = {
  userId: string;
  email: string;
  organizationId: string;
  authUserCreated: boolean;
};

/**
 * Create a normal Athena owner account.
 * Never creates Licensee Master relationships.
 * On failure, cleans up only resources created by this operation.
 */
export async function createAthenaAccountAsSuperAdmin(input: {
  actorUserId: string;
  email: string;
  organizationName: string;
  language?: unknown;
}): Promise<CreateAthenaAccountResult> {
  const actor = await requireGetOblicSuperAdmin(input.actorUserId);
  const email = normalizeEmail(input.email);
  const organizationName = normalizeBusinessName(input.organizationName);

  if (!email || !email.includes("@")) {
    throw new SuperAdminOperationError(
      "INVALID_EMAIL",
      "A valid email is required.",
    );
  }

  if (!organizationName || organizationName.length < 2) {
    throw new SuperAdminOperationError(
      "INVALID_ORGANIZATION_NAME",
      "Organization / business name is required.",
    );
  }

  let language: OrganizationLanguage | undefined;
  if (
    input.language !== undefined &&
    input.language !== null &&
    String(input.language).trim() !== ""
  ) {
    try {
      language = parseOrganizationLanguage(input.language);
    } catch (error) {
      if (error instanceof OrganizationLanguageInvalidError) {
        throw new SuperAdminOperationError(
          "INVALID_LANGUAGE",
          "A supported Account Language is required.",
        );
      }
      throw error;
    }
  }

  let authUser: { id: string; email: string } | null =
    await findAuthUserByEmail(email);
  let authUserCreated = false;
  let organizationCreated = false;
  let organizationId: string | null = null;

  try {
    if (!authUser) {
      try {
        authUser = await createConfirmedAuthUser(email);
        authUserCreated = true;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to create auth user.";
        authUser = await findAuthUserByEmail(email);
        if (!authUser) {
          throw new SuperAdminOperationError("AUTH_USER_CREATE_FAILED", message);
        }
        // Pre-existing user found after concurrent create — never mark as created.
        authUserCreated = false;
      }
    }

    await rejectRoleOverlap({
      userId: authUser.id,
      email,
      intendedRole: "athena",
    });

    const provisioned = await provisionTenantForAuthenticatedUserDetailed(
      authUser.id,
      email,
      {
        organizationName,
        ...(language ? { language } : {}),
      },
    );
    organizationId = provisioned.organizationId;
    organizationCreated = provisioned.organizationCreated;

    const membership = await getOrganizationMembership(authUser.id);
    if (
      !membership?.organization_id ||
      membership.organization_id !== organizationId ||
      membership.role !== "owner"
    ) {
      throw new SuperAdminOperationError(
        "MEMBERSHIP_MISMATCH",
        "Organization membership could not be verified after provisioning.",
      );
    }

    await ensureAccountAccessActive({
      userId: authUser.id,
      updatedBy: actor.user_id,
    });

    await logSuperAdminAudit({
      actorUserId: actor.user_id,
      action: "create_athena_account",
      targetUserId: authUser.id,
      targetEmail: email,
      accountType: "athena",
      metadata: { organizationId, organizationName, authUserCreated },
      success: true,
    });

    return {
      userId: authUser.id,
      email,
      organizationId,
      authUserCreated,
    };
  } catch (error) {
    // Console-audit failure; then bounded cleanup of resources this op created.
    await logSuperAdminAudit({
      actorUserId: actor.user_id,
      action: "create_athena_account",
      targetUserId: authUser?.id ?? null,
      targetEmail: email,
      accountType: "athena",
      success: false,
      reason: error instanceof Error ? error.message : "Create Athena failed.",
    });

    try {
      await cleanupFailedCreateResources({
        authUserCreated,
        authUserId: authUser?.id ?? null,
        organizationCreated,
        organizationId,
      });
    } catch (cleanupError) {
      if (cleanupError instanceof SuperAdminOperationError) {
        throw cleanupError;
      }
      throw error;
    }

    throw error;
  }
}

export type CreateLicenseeMasterResult = {
  userId: string;
  email: string;
  licenseeAccountId: string;
  authUserCreated: boolean;
};

/**
 * Create a Business Licensee Master.
 * NEVER creates organization_members or an Athena tenant for the Master.
 * On failure, cleans up only a newly-created Auth user from this operation.
 */
export async function createLicenseeMasterAsSuperAdmin(input: {
  actorUserId: string;
  email: string;
  businessName?: string | null;
}): Promise<CreateLicenseeMasterResult> {
  const actor = await requireGetOblicSuperAdmin(input.actorUserId);
  const email = normalizeEmail(input.email);
  const businessName = input.businessName
    ? normalizeBusinessName(input.businessName)
    : "";

  if (!email || !email.includes("@")) {
    throw new SuperAdminOperationError(
      "INVALID_EMAIL",
      "A valid email is required.",
    );
  }

  let authUser: { id: string; email: string } | null =
    await findAuthUserByEmail(email);
  let authUserCreated = false;

  try {
    if (!authUser) {
      try {
        authUser = await createConfirmedAuthUser(email);
        authUserCreated = true;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to create auth user.";
        authUser = await findAuthUserByEmail(email);
        if (!authUser) {
          throw new SuperAdminOperationError("AUTH_USER_CREATE_FAILED", message);
        }
        authUserCreated = false;
      }
    }

    await rejectRoleOverlap({
      userId: authUser.id,
      email,
      intendedRole: "licensee",
    });

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("licensee_accounts")
      .insert({
        user_id: authUser.id,
        email,
      })
      .select("id, user_id, email")
      .single();

    if (insertError || !inserted?.id) {
      if (insertError?.code === "23505") {
        throw new SuperAdminOperationError(
          "ALREADY_LICENSEE_MASTER",
          `This email (${email}) is already a Business Licensee Master.`,
        );
      }
      throw new SuperAdminOperationError(
        "LICENSEE_CREATE_FAILED",
        insertError?.message || "Failed to create Licensee Master account.",
      );
    }

    await ensureAccountAccessActive({
      userId: authUser.id,
      updatedBy: actor.user_id,
    });

    await logSuperAdminAudit({
      actorUserId: actor.user_id,
      action: "create_licensee_master",
      targetUserId: authUser.id,
      targetEmail: email,
      accountType: "licensee",
      metadata: {
        licenseeAccountId: inserted.id,
        businessName: businessName || null,
        authUserCreated,
      },
      success: true,
    });

    return {
      userId: authUser.id,
      email,
      licenseeAccountId: inserted.id,
      authUserCreated,
    };
  } catch (error) {
    await logSuperAdminAudit({
      actorUserId: actor.user_id,
      action: "create_licensee_master",
      targetUserId: authUser?.id ?? null,
      targetEmail: email,
      accountType: "licensee",
      success: false,
      reason:
        error instanceof Error ? error.message : "Create Licensee Master failed.",
    });

    try {
      await cleanupFailedCreateResources({
        authUserCreated,
        authUserId: authUser?.id ?? null,
        organizationCreated: false,
        organizationId: null,
      });
    } catch (cleanupError) {
      if (cleanupError instanceof SuperAdminOperationError) {
        throw cleanupError;
      }
      throw error;
    }

    throw error;
  }
}

async function resolveManageableAccountTarget(userId: string): Promise<{
  userId: string;
  email: string;
  accountType: ManageableAccountType;
  organizationId: string | null;
  licenseeAccountId: string | null;
}> {
  const id = userId.trim();
  if (!id) {
    throw new SuperAdminOperationError("INVALID_USER", "userId is required.");
  }

  if (await isGetOblicSuperAdminUser(id)) {
    throw new SuperAdminOperationError(
      "SUPER_ADMIN_NOT_MANAGEABLE",
      "Super Admin accounts are not managed through Phase 1 deactivate/reactivate.",
    );
  }

  const { data: licensee, error: licenseeError } = await supabaseAdmin
    .from("licensee_accounts")
    .select("id, user_id, email")
    .eq("user_id", id)
    .maybeSingle();

  if (licenseeError) {
    throw new SuperAdminOperationError(
      "LOOKUP_FAILED",
      licenseeError.message || "Failed to resolve Licensee account.",
    );
  }

  if (licensee?.id) {
    return {
      userId: id,
      email: licensee.email,
      accountType: "licensee",
      organizationId: null,
      licenseeAccountId: licensee.id,
    };
  }

  const membership = await getOrganizationMembership(id);
  if (!membership?.organization_id || membership.role !== "owner") {
    throw new SuperAdminOperationError(
      "ACCOUNT_NOT_FOUND",
      "No manageable Athena or Licensee Master account was found for this user.",
    );
  }

  const { data: authUser, error: authError } =
    await supabaseAdmin.auth.admin.getUserById(id);
  if (authError || !authUser.user?.email) {
    throw new SuperAdminOperationError(
      "AUTH_USER_LOOKUP_FAILED",
      "Target auth user could not be resolved.",
    );
  }

  return {
    userId: id,
    email: authUser.user.email,
    accountType: "athena",
    organizationId: membership.organization_id,
    licenseeAccountId: null,
  };
}

/**
 * Deactivate with idempotent DB+Auth reconciliation.
 * Does not early-return on account_access_status alone.
 * Retains auth identity, org, membership, licensee rows, and tenant data.
 * Never deletes.
 */
export async function deactivateAccountAsSuperAdmin(input: {
  actorUserId: string;
  targetUserId: string;
}): Promise<{
  userId: string;
  email: string;
  accountType: ManageableAccountType;
}> {
  const actor = await requireGetOblicSuperAdmin(input.actorUserId);
  const target = await resolveManageableAccountTarget(input.targetUserId);

  try {
    // Ensure DB status is deactivated (continue even if already deactivated).
    const current = await getAccountAccessStatus(target.userId);
    if (current !== "deactivated") {
      await setAccountAccessDeactivated({
        userId: target.userId,
        updatedBy: actor.user_id,
      });
    }

    // Ensure Auth ban (continue even if DB was already deactivated).
    if (!(await isAuthUserBanned(target.userId))) {
      await banAuthUser(target.userId);
    }

    const dbStatus = await getAccountAccessStatus(target.userId);
    const banned = await isAuthUserBanned(target.userId);
    if (dbStatus !== "deactivated" || !banned) {
      throw new SuperAdminOperationError(
        "RECONCILE_INCOMPLETE",
        "Deactivate reconciliation did not converge to DB=deactivated and Auth=banned. Retry the same action.",
      );
    }

    await logSuperAdminAudit({
      actorUserId: actor.user_id,
      action: "deactivate_account",
      targetUserId: target.userId,
      targetEmail: target.email,
      accountType: target.accountType,
      metadata: {
        organizationId: target.organizationId,
        licenseeAccountId: target.licenseeAccountId,
        reconciled: true,
      },
      success: true,
    });

    return {
      userId: target.userId,
      email: target.email,
      accountType: target.accountType,
    };
  } catch (error) {
    // Failed reconciliation: console-audited only (no durable insert on failure).
    await logSuperAdminAudit({
      actorUserId: actor.user_id,
      action: "deactivate_account",
      targetUserId: target.userId,
      targetEmail: target.email,
      accountType: target.accountType,
      success: false,
      reason: error instanceof Error ? error.message : "Deactivate failed.",
    });
    throw error;
  }
}

/**
 * Reactivate with idempotent DB+Auth reconciliation.
 * Does not early-return on account_access_status alone.
 * Does not recreate data because nothing was deleted.
 */
export async function reactivateAccountAsSuperAdmin(input: {
  actorUserId: string;
  targetUserId: string;
}): Promise<{
  userId: string;
  email: string;
  accountType: ManageableAccountType;
}> {
  const actor = await requireGetOblicSuperAdmin(input.actorUserId);
  const target = await resolveManageableAccountTarget(input.targetUserId);

  try {
    // Ensure DB status is active (idempotent upsert; continue even if already active).
    await ensureAccountAccessActive({
      userId: target.userId,
      updatedBy: actor.user_id,
    });

    // Ensure Auth unban (continue even if DB was already active).
    if (await isAuthUserBanned(target.userId)) {
      await unbanAuthUser(target.userId);
    }

    const dbStatus = await getAccountAccessStatus(target.userId);
    const banned = await isAuthUserBanned(target.userId);
    if (dbStatus !== "active" || banned) {
      throw new SuperAdminOperationError(
        "RECONCILE_INCOMPLETE",
        "Reactivate reconciliation did not converge to DB=active and Auth=unbanned. Retry the same action.",
      );
    }

    await logSuperAdminAudit({
      actorUserId: actor.user_id,
      action: "reactivate_account",
      targetUserId: target.userId,
      targetEmail: target.email,
      accountType: target.accountType,
      metadata: {
        organizationId: target.organizationId,
        licenseeAccountId: target.licenseeAccountId,
        reconciled: true,
      },
      success: true,
    });

    return {
      userId: target.userId,
      email: target.email,
      accountType: target.accountType,
    };
  } catch (error) {
    await logSuperAdminAudit({
      actorUserId: actor.user_id,
      action: "reactivate_account",
      targetUserId: target.userId,
      targetEmail: target.email,
      accountType: target.accountType,
      success: false,
      reason: error instanceof Error ? error.message : "Reactivate failed.",
    });
    throw error;
  }
}

/**
 * List manageable Athena owners and Licensee Masters for the Super Admin UI.
 * Excludes Super Admin identities. Does not mutate tenant intelligence.
 */
export async function listManageableAccountsForSuperAdmin(
  actorUserId: string,
): Promise<ManageableAccount[]> {
  await requireGetOblicSuperAdmin(actorUserId);

  const [
    { data: licenseeRows, error: licenseeError },
    { data: memberships, error: membershipError },
    { data: statusRows, error: statusError },
  ] = await Promise.all([
    supabaseAdmin
      .from("licensee_accounts")
      .select("id, user_id, email, created_at")
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("organization_members")
      .select("user_id, organization_id, role")
      .eq("role", "owner"),
    supabaseAdmin.from("account_access_status").select("user_id, status"),
  ]);

  if (licenseeError) {
    throw new Error(licenseeError.message || "Failed to load Licensee accounts.");
  }
  if (membershipError) {
    throw new Error(
      membershipError.message || "Failed to load Athena organization owners.",
    );
  }
  if (statusError) {
    throw new Error(
      statusError.message || "Failed to load account access status.",
    );
  }

  const statusByUser = new Map(
    (statusRows ?? []).map((row) => [
      row.user_id as string,
      row.status === "deactivated"
        ? ("deactivated" as const)
        : ("active" as const),
    ]),
  );

  const licenseeUserIds = new Set(
    (licenseeRows ?? []).map((row) => row.user_id as string),
  );

  const { data: superAdmins } = await supabaseAdmin
    .from("getoblic_super_admins")
    .select("user_id");
  const superAdminUserIds = new Set(
    (superAdmins ?? []).map((row) => row.user_id as string),
  );

  const athenaMemberships = (memberships ?? []).filter(
    (row) =>
      row.user_id &&
      !licenseeUserIds.has(row.user_id as string) &&
      !superAdminUserIds.has(row.user_id as string),
  );

  const organizationIds = [
    ...new Set(
      athenaMemberships
        .map((row) => row.organization_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const { data: organizations, error: orgError } =
    organizationIds.length > 0
      ? await supabaseAdmin
          .from("organizations")
          .select("id, name")
          .in("id", organizationIds)
      : { data: [], error: null };

  if (orgError) {
    throw new Error(orgError.message || "Failed to load organizations.");
  }

  const orgNameById = new Map(
    (organizations ?? []).map((org) => [org.id as string, org.name as string]),
  );

  const accounts: ManageableAccount[] = [];

  for (const row of licenseeRows ?? []) {
    const userId = row.user_id as string;
    if (superAdminUserIds.has(userId)) {
      continue;
    }
    accounts.push({
      userId,
      email: row.email as string,
      accountType: "licensee",
      displayName: row.email as string,
      organizationId: null,
      licenseeAccountId: row.id as string,
      status: statusByUser.get(userId) ?? "active",
    });
  }

  const emailByUserId = new Map<string, string>();
  await Promise.all(
    athenaMemberships.map(async (row) => {
      const userId = row.user_id as string;
      const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (!error && data.user?.email) {
        emailByUserId.set(userId, data.user.email);
      }
    }),
  );

  for (const row of athenaMemberships) {
    const userId = row.user_id as string;
    const email = emailByUserId.get(userId);
    if (!email) {
      continue;
    }
    const organizationId = row.organization_id as string;
    accounts.push({
      userId,
      email,
      accountType: "athena",
      displayName: orgNameById.get(organizationId) || email,
      organizationId,
      licenseeAccountId: null,
      status: statusByUser.get(userId) ?? "active",
    });
  }

  accounts.sort((a, b) => {
    if (a.accountType !== b.accountType) {
      return a.accountType === "athena" ? -1 : 1;
    }
    return a.email.localeCompare(b.email);
  });

  return accounts;
}

/** Re-export for route/session guards. */
export { assertAccountAccessActive };
