import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type LicenseeAccount = {
  id: string;
  user_id: string;
  email: string;
};

export type AuthorizedSubAccountHandoff = {
  licenseeAccountId: string;
  organizationId: string;
  ownerUserId: string;
  ownerEmail: string;
};

export class LicenseeAccessError extends Error {
  constructor(message = "Licensee access denied.") {
    super(message);
    this.name = "LicenseeAccessError";
  }
}

export class LicenseeMasterProvisionBlockedError extends Error {
  constructor(
    message = "Business Licensee Master accounts cannot be provisioned into an Athena organization.",
  ) {
    super(message);
    this.name = "LicenseeMasterProvisionBlockedError";
  }
}

function isMissingLicenseeRelationError(error: {
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
  return (
    message.includes("licensee_accounts") ||
    message.includes("licensee_sub_accounts")
  );
}

/**
 * Master identity: presence of licensee_accounts.user_id.
 * When licensee tables are not yet migrated, returns false so ordinary Athena
 * provisioning remains unchanged.
 */
export async function isLicenseeMasterUser(userId: string): Promise<boolean> {
  const id = userId.trim();
  if (!id) {
    return false;
  }

  const { data, error } = await supabaseAdmin
    .from("licensee_accounts")
    .select("id")
    .eq("user_id", id)
    .maybeSingle();

  if (error) {
    if (isMissingLicenseeRelationError(error)) {
      return false;
    }
    console.error("licensee_accounts master lookup failed:", error);
    return false;
  }

  return Boolean(data?.id);
}

export async function getLicenseeAccountByUserId(
  userId: string,
): Promise<LicenseeAccount | null> {
  const id = userId.trim();
  if (!id) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("licensee_accounts")
    .select("id, user_id, email")
    .eq("user_id", id)
    .maybeSingle();

  if (error) {
    if (isMissingLicenseeRelationError(error)) {
      return null;
    }
    console.error("licensee_accounts fetch failed:", error);
    return null;
  }

  return (data as LicenseeAccount | null) ?? null;
}

/**
 * Server-authoritative Open Athena authorization chain:
 * current Master user → licensee_accounts → licensee_sub_accounts →
 * organization_members owner → auth user email.
 *
 * Never trusts organization_id alone.
 */
export async function resolveAuthorizedSubAccountHandoff(input: {
  masterUserId: string;
  organizationId: string;
}): Promise<AuthorizedSubAccountHandoff> {
  const masterUserId = input.masterUserId.trim();
  const organizationId = input.organizationId.trim();

  if (!masterUserId || !organizationId) {
    throw new LicenseeAccessError("Missing master or organization identity.");
  }

  const licenseeAccount = await getLicenseeAccountByUserId(masterUserId);
  if (!licenseeAccount) {
    throw new LicenseeAccessError("Authenticated user is not a Business Licensee Master.");
  }

  const { data: relationship, error: relationshipError } = await supabaseAdmin
    .from("licensee_sub_accounts")
    .select("id, organization_id")
    .eq("licensee_account_id", licenseeAccount.id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (relationshipError) {
    if (isMissingLicenseeRelationError(relationshipError)) {
      throw new LicenseeAccessError("Licensee relationship tables are not available.");
    }
    throw new LicenseeAccessError(relationshipError.message);
  }

  if (!relationship) {
    throw new LicenseeAccessError("Master does not own this sub-account relationship.");
  }

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("organization_members")
    .select("user_id, role")
    .eq("organization_id", organizationId)
    .eq("role", "owner")
    .maybeSingle();

  if (membershipError || !membership?.user_id) {
    throw new LicenseeAccessError("Sub-account owner membership could not be resolved.");
  }

  const { data: ownerUser, error: ownerError } =
    await supabaseAdmin.auth.admin.getUserById(membership.user_id);

  if (ownerError || !ownerUser.user?.email) {
    throw new LicenseeAccessError("Sub-account owner auth user could not be resolved.");
  }

  return {
    licenseeAccountId: licenseeAccount.id,
    organizationId,
    ownerUserId: membership.user_id,
    ownerEmail: ownerUser.user.email,
  };
}
