import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  AccountAccessDeniedError,
  assertAccountAccessActive,
} from "@/services/superAdmin/accountAccessStatus";

export type LicenseeAccount = {
  id: string;
  user_id: string;
  email: string;
  /** Licensee-scoped own-company identity. Null until designated. */
  own_company_organization_id: string | null;
};

export type AuthorizedLicenseeSubAccountRelationship = {
  licenseeAccountId: string;
  organizationId: string;
  relationshipId: string;
};

export type AuthorizedSubAccountHandoff = {
  licenseeAccountId: string;
  organizationId: string;
  ownerUserId: string;
  ownerEmail: string;
};

export class LicenseeAccessError extends Error {
  /** Optional canonical code (e.g. ACCOUNT_DEACTIVATED) when wrapping typed denials. */
  readonly code?: string;

  constructor(message = "Licensee access denied.", code?: string) {
    super(message);
    this.name = "LicenseeAccessError";
    if (code) this.code = code;
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
    .select("id, user_id, email, own_company_organization_id")
    .eq("user_id", id)
    .maybeSingle();

  if (error) {
    if (isMissingLicenseeRelationError(error)) {
      return null;
    }
    console.error("licensee_accounts fetch failed:", error);
    return null;
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id as string,
    user_id: data.user_id as string,
    email: data.email as string,
    own_company_organization_id:
      typeof data.own_company_organization_id === "string"
        ? data.own_company_organization_id
        : null,
  };
}

/**
 * Master → sub-account relationship authorization (non-impersonating).
 *
 * Canonical chain:
 * current Master user → licensee_accounts → licensee_sub_accounts matching
 * licensee_account_id + organization_id → active Master enforcement.
 *
 * Never trusts organization_id alone.
 * Does not resolve organization owners or perform session handoff.
 */
export async function assertLicenseeOwnsSubAccount(input: {
  masterUserId: string;
  organizationId: string;
}): Promise<AuthorizedLicenseeSubAccountRelationship> {
  const masterUserId = input.masterUserId.trim();
  const organizationId = input.organizationId.trim();

  if (!masterUserId || !organizationId) {
    throw new LicenseeAccessError("Missing master or organization identity.");
  }

  const licenseeAccount = await getLicenseeAccountByUserId(masterUserId);
  if (!licenseeAccount) {
    throw new LicenseeAccessError(
      "Authenticated user is not a Business Licensee Master.",
    );
  }

  const { data: relationship, error: relationshipError } = await supabaseAdmin
    .from("licensee_sub_accounts")
    .select("id, organization_id")
    .eq("licensee_account_id", licenseeAccount.id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (relationshipError) {
    if (isMissingLicenseeRelationError(relationshipError)) {
      throw new LicenseeAccessError(
        "Licensee relationship tables are not available.",
      );
    }
    throw new LicenseeAccessError(relationshipError.message);
  }

  if (!relationship) {
    throw new LicenseeAccessError(
      "Master does not own this sub-account relationship.",
    );
  }

  // Existing Master-operation active-account enforcement (fail closed).
  try {
    await assertAccountAccessActive(masterUserId);
  } catch (error) {
    if (error instanceof AccountAccessDeniedError) {
      throw new LicenseeAccessError(error.message, error.code);
    }
    throw error;
  }

  return {
    licenseeAccountId: licenseeAccount.id,
    organizationId,
    relationshipId: String(relationship.id),
  };
}

/**
 * Server-authoritative Open Athena authorization + handoff identity chain:
 * relationship authorization → organization_members owner → auth user email →
 * owner active check.
 *
 * Never trusts organization_id alone.
 */
export async function resolveAuthorizedSubAccountHandoff(input: {
  masterUserId: string;
  organizationId: string;
}): Promise<AuthorizedSubAccountHandoff> {
  const authorized = await assertLicenseeOwnsSubAccount(input);
  const organizationId = authorized.organizationId;

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("organization_members")
    .select("user_id, role")
    .eq("organization_id", organizationId)
    .eq("role", "owner")
    .maybeSingle();

  if (membershipError || !membership?.user_id) {
    throw new LicenseeAccessError(
      "Sub-account owner membership could not be resolved.",
    );
  }

  const { data: ownerUser, error: ownerError } =
    await supabaseAdmin.auth.admin.getUserById(membership.user_id);

  if (ownerError || !ownerUser.user?.email) {
    throw new LicenseeAccessError(
      "Sub-account owner auth user could not be resolved.",
    );
  }

  // Master Open Athena into a deactivated Athena sub-account fails closed.
  try {
    await assertAccountAccessActive(membership.user_id);
  } catch (error) {
    if (error instanceof AccountAccessDeniedError) {
      throw new LicenseeAccessError(error.message, error.code);
    }
    throw error;
  }

  return {
    licenseeAccountId: authorized.licenseeAccountId,
    organizationId,
    ownerUserId: membership.user_id,
    ownerEmail: ownerUser.user.email,
  };
}
