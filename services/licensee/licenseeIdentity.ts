import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  resolveOrganizationLanguageValue,
  type OrganizationLanguage,
} from "@/services/organizationLanguage";
import { readStoredFeeUsd } from "@/services/superAdmin/superAdminLicenseeCommercialFeeTypes";
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
  /**
   * Licensee Master UI language and creation default for future sub-accounts.
   * Does not override language of existing tenant organizations.
   */
  default_language: OrganizationLanguage;
  /** Super Admin-configured unit rate. Display-only on /licensee. */
  licenseeMonthlyFeeUsd: number;
  /** Super Admin-configured unit rate. Display-only on /licensee. */
  subAccountMonthlyFeeUsd: number;
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

function mapLicenseeAccountRow(data: {
  id: unknown;
  user_id: unknown;
  email: unknown;
  own_company_organization_id: unknown;
  default_language?: unknown;
  licensee_monthly_fee_usd?: unknown;
  sub_account_monthly_fee_usd?: unknown;
}): LicenseeAccount {
  return {
    id: data.id as string,
    user_id: data.user_id as string,
    email: data.email as string,
    own_company_organization_id:
      typeof data.own_company_organization_id === "string"
        ? data.own_company_organization_id
        : null,
    default_language: resolveOrganizationLanguageValue(data.default_language),
    licenseeMonthlyFeeUsd: readStoredFeeUsd(data.licensee_monthly_fee_usd),
    subAccountMonthlyFeeUsd: readStoredFeeUsd(data.sub_account_monthly_fee_usd),
  };
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
    .select("id, user_id, email, own_company_organization_id, default_language, licensee_monthly_fee_usd, sub_account_monthly_fee_usd")
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

  return mapLicenseeAccountRow(data);
}

export async function getLicenseeAccountById(
  licenseeAccountId: string,
): Promise<LicenseeAccount | null> {
  const id = licenseeAccountId.trim();
  if (!id) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("licensee_accounts")
    .select("id, user_id, email, own_company_organization_id, default_language, licensee_monthly_fee_usd, sub_account_monthly_fee_usd")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (isMissingLicenseeRelationError(error)) {
      return null;
    }
    console.error("licensee_accounts id fetch failed:", error);
    return null;
  }

  if (!data) {
    return null;
  }

  return mapLicenseeAccountRow(data);
}

/**
 * Write-authority Own Company lookup. Returns every LicenseeAccount whose
 * own_company_organization_id equals this org. Does not use .single() /
 * .maybeSingle() so 0 and >1 remain distinguishable.
 *
 * Presentation helper isLicenseeOwnCompanyOrganization() must not be used
 * as conversion authorization.
 */
export async function getLicenseeAccountsByOwnCompanyOrganizationId(
  organizationId: string,
): Promise<LicenseeAccount[]> {
  const id = organizationId.trim();
  if (!id) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from("licensee_accounts")
    .select("id, user_id, email, own_company_organization_id, default_language, licensee_monthly_fee_usd, sub_account_monthly_fee_usd")
    .eq("own_company_organization_id", id);

  if (error) {
    if (isMissingLicenseeRelationError(error)) {
      return [];
    }
    console.error("licensee_accounts own-company write lookup failed:", error);
    throw new LicenseeAccessError(
      error.message || "Failed to resolve Licensee Own Company account.",
    );
  }

  return (data ?? []).map((row) => mapLicenseeAccountRow(row));
}

/**
 * Own-Company identity for a trusted Athena organization id.
 * True only when licensee_accounts.own_company_organization_id equals this org.
 * Presentation/eligibility only — not a substitute for conversion authorization.
 */
export async function isLicenseeOwnCompanyOrganization(
  organizationId: string,
): Promise<boolean> {
  const id = organizationId.trim();
  if (!id) {
    return false;
  }

  const { data, error } = await supabaseAdmin
    .from("licensee_accounts")
    .select("id")
    .eq("own_company_organization_id", id)
    .maybeSingle();

  if (error) {
    if (isMissingLicenseeRelationError(error)) {
      return false;
    }
    console.error("licensee_accounts own-company lookup failed:", error);
    return false;
  }

  return Boolean(data?.id);
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

/**
 * Read-only controlling Licensee for a tenant organization.
 * One LicenseeAccount per licensee_sub_accounts row, in row order, not deduped.
 * Applies to managed clients and to the Licensee Own Company organization.
 * Returns null when the lookup fails or a relationship row cannot be resolved.
 * Returns [] when the organization has no Licensee relationship.
 * Callers fail closed unless the result length is exactly one.
 */
export async function listControllingLicenseeAccountsForOrganization(
  organizationId: string,
): Promise<LicenseeAccount[] | null> {
  const id = organizationId.trim();
  if (!id) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from("licensee_sub_accounts")
    .select("licensee_account_id")
    .eq("organization_id", id);

  if (error) {
    if (!isMissingLicenseeRelationError(error)) {
      console.error(
        "licensee_sub_accounts controlling licensee lookup failed:",
        error,
      );
    }
    return null;
  }

  const accounts: LicenseeAccount[] = [];
  for (const row of data ?? []) {
    const licenseeAccountId =
      typeof row.licensee_account_id === "string"
        ? row.licensee_account_id.trim()
        : "";
    if (!licenseeAccountId) {
      return null;
    }
    const account = await getLicenseeAccountById(licenseeAccountId);
    if (!account) {
      return null;
    }
    accounts.push(account);
  }

  return accounts;
}
