import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type GetOblicSuperAdmin = {
  id: string;
  user_id: string;
  email: string;
};

export class SuperAdminAccessError extends Error {
  constructor(message = "GetOblic Super Admin access denied.") {
    super(message);
    this.name = "SuperAdminAccessError";
  }
}

export class SuperAdminProvisionBlockedError extends Error {
  constructor(
    message = "GetOblic Super Admin accounts cannot be provisioned into an Athena organization.",
  ) {
    super(message);
    this.name = "SuperAdminProvisionBlockedError";
  }
}

/**
 * Unexpected getoblic_super_admins lookup failure.
 * Distinct from "no Super Admin row" — callers must fail closed for
 * ordinary Athena / Licensee provisioning exclusion, not treat as ordinary.
 */
export class SuperAdminAuthorityLookupError extends Error {
  constructor(
    message = "GetOblic Super Admin authority could not be verified.",
  ) {
    super(message);
    this.name = "SuperAdminAuthorityLookupError";
  }
}

function isMissingSuperAdminRelationError(error: {
  code?: string;
  message?: string;
} | null): boolean {
  if (!error) {
    return false;
  }

  if (error.code === "PGRST205" || error.code === "42P01") {
    return true;
  }

  const message = error.message?.toLowerCase() || "";
  return message.includes("getoblic_super_admins");
}

/**
 * Super Admin identity: presence of getoblic_super_admins.user_id.
 *
 * - No row → false (ordinary behavior)
 * - Table not yet migrated → false (pre-V24 ordinary flows unchanged)
 * - Unexpected DB/PostgREST error → throws SuperAdminAuthorityLookupError
 *   (fail closed; must NOT be interpreted as "not a Super Admin")
 */
export async function isGetOblicSuperAdminUser(
  userId: string,
): Promise<boolean> {
  const id = userId.trim();
  if (!id) {
    return false;
  }

  const { data, error } = await supabaseAdmin
    .from("getoblic_super_admins")
    .select("id")
    .eq("user_id", id)
    .maybeSingle();

  if (error) {
    if (isMissingSuperAdminRelationError(error)) {
      return false;
    }
    console.error("getoblic_super_admins lookup failed:", error);
    throw new SuperAdminAuthorityLookupError(
      error.message || "GetOblic Super Admin authority could not be verified.",
    );
  }

  return Boolean(data?.id);
}

/**
 * Fetch Super Admin row by auth user id.
 *
 * - No row / missing table → null
 * - Unexpected lookup error → throws SuperAdminAuthorityLookupError
 */
export async function getSuperAdminByUserId(
  userId: string,
): Promise<GetOblicSuperAdmin | null> {
  const id = userId.trim();
  if (!id) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("getoblic_super_admins")
    .select("id, user_id, email")
    .eq("user_id", id)
    .maybeSingle();

  if (error) {
    if (isMissingSuperAdminRelationError(error)) {
      return null;
    }
    console.error("getoblic_super_admins fetch failed:", error);
    throw new SuperAdminAuthorityLookupError(
      error.message || "GetOblic Super Admin authority could not be verified.",
    );
  }

  return (data as GetOblicSuperAdmin | null) ?? null;
}

export async function requireGetOblicSuperAdmin(
  userId: string,
): Promise<GetOblicSuperAdmin> {
  const account = await getSuperAdminByUserId(userId);
  if (!account) {
    throw new SuperAdminAccessError(
      "Authenticated user is not a GetOblic Super Admin.",
    );
  }
  return account;
}
