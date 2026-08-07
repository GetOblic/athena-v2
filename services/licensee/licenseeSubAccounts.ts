import { createBrandLogoSignedUrl } from "@/services/identity/brandLogoStorage";
import { readIdentityExecutiveIntelligence } from "@/services/identity/identityExecutiveIntelligence";
import {
  LicenseeAccessError,
  getLicenseeAccountByUserId,
  isLicenseeMasterUser,
  type LicenseeAccount,
} from "@/services/licensee/licenseeIdentity";
import {
  createConfirmedAuthUser,
  findAuthUserByEmail,
} from "@/services/licensee/licenseeAuthUserLookup";
import {
  LICENSEE_SUB_ACCOUNT_NOTES_MAX_LENGTH,
  type LicenseeSubAccountListItem,
} from "@/services/licensee/licenseeSubAccountTypes";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getOrganizationMembership,
  provisionTenantForAuthenticatedUser,
} from "@/services/organizationService";

export {
  LICENSEE_SUB_ACCOUNT_NOTES_MAX_LENGTH,
  type LicenseeSubAccountListItem,
} from "@/services/licensee/licenseeSubAccountTypes";

/** Compact snapshot display length — existing identity text only, never generated. */
const ACCOUNT_SNAPSHOT_MAX_LENGTH = 240;

export class LicenseeSubAccountCreateError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "LicenseeSubAccountCreateError";
    this.code = code;
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeBusinessName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function truncateCompact(text: string, maxLength: number): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

/**
 * Reuse an existing short identity field only — never generate.
 * Prefer Athena Identity business summary, then about_you.
 */
function resolveAccountSnapshot(identity: {
  about_you?: string | null;
  master_profile?: unknown;
} | null | undefined): string | null {
  if (!identity) {
    return null;
  }

  const masterProfile =
    identity.master_profile && typeof identity.master_profile === "object"
      ? (identity.master_profile as Record<string, unknown>)
      : null;
  const executive = readIdentityExecutiveIntelligence(masterProfile);
  const businessSummary = executive?.executive_summary?.trim();
  if (businessSummary) {
    return truncateCompact(businessSummary, ACCOUNT_SNAPSHOT_MAX_LENGTH);
  }

  const aboutYou =
    typeof identity.about_you === "string" ? identity.about_you.trim() : "";
  if (aboutYou) {
    return truncateCompact(aboutYou, ACCOUNT_SNAPSHOT_MAX_LENGTH);
  }

  return null;
}

function normalizeMasterNotes(notes: string | null | undefined): string {
  if (typeof notes !== "string") {
    return "";
  }
  return notes.replace(/\r\n/g, "\n");
}

export async function requireLicenseeMasterAccount(
  userId: string,
): Promise<LicenseeAccount> {
  const account = await getLicenseeAccountByUserId(userId);
  if (!account) {
    throw new LicenseeAccessError(
      "Authenticated user is not a Business Licensee Master.",
    );
  }
  return account;
}

/**
 * Dashboard list: only orgs linked through the current Master's relationships.
 * Name/logo from organizations; optional compact snapshot from existing identity text.
 * Never generates AI summaries. Never mutates tenant intelligence.
 */
export async function listLicenseeSubAccountsForMaster(
  masterUserId: string,
): Promise<LicenseeSubAccountListItem[]> {
  const licenseeAccount = await requireLicenseeMasterAccount(masterUserId);

  const { data: relationships, error } = await supabaseAdmin
    .from("licensee_sub_accounts")
    .select("id, organization_id, pinned, pinned_at, notes, created_at")
    .eq("licensee_account_id", licenseeAccount.id);

  if (error) {
    throw new Error(error.message || "Failed to load sub-accounts.");
  }

  if (!relationships?.length) {
    return [];
  }

  const organizationIds = relationships.map((row) => row.organization_id);

  const { data: organizations, error: orgError } = await supabaseAdmin
    .from("organizations")
    .select("id, name, brand_logo_storage_path")
    .in("id", organizationIds);

  if (orgError) {
    throw new Error(orgError.message || "Failed to load organizations.");
  }

  const orgById = new Map(
    (organizations ?? []).map((org) => [org.id as string, org]),
  );

  const { data: memberships, error: memberError } = await supabaseAdmin
    .from("organization_members")
    .select("organization_id, user_id, role")
    .in("organization_id", organizationIds)
    .eq("role", "owner");

  if (memberError) {
    throw new Error(memberError.message || "Failed to load account emails.");
  }

  const ownerByOrg = new Map(
    (memberships ?? []).map((row) => [row.organization_id as string, row.user_id as string]),
  );

  const { data: identities, error: identityError } = await supabaseAdmin
    .from("athena_identity")
    .select("organization_id, about_you, master_profile")
    .in("organization_id", organizationIds);

  if (identityError) {
    throw new Error(identityError.message || "Failed to load account snapshots.");
  }

  const identityByOrg = new Map(
    (identities ?? []).map((row) => [row.organization_id as string, row]),
  );

  const emailByUserId = new Map<string, string>();
  await Promise.all(
    [...new Set(ownerByOrg.values())].map(async (userId) => {
      const { data, error: userError } =
        await supabaseAdmin.auth.admin.getUserById(userId);
      if (!userError && data.user?.email) {
        emailByUserId.set(userId, data.user.email);
      }
    }),
  );

  const items: LicenseeSubAccountListItem[] = [];

  for (const relationship of relationships) {
    const org = orgById.get(relationship.organization_id);
    if (!org) {
      continue;
    }

    const logoPath =
      typeof org.brand_logo_storage_path === "string"
        ? org.brand_logo_storage_path.trim()
        : "";
    const logoPreviewUrl = logoPath
      ? await createBrandLogoSignedUrl(logoPath, org.id)
      : null;

    const ownerUserId = ownerByOrg.get(org.id) ?? null;
    const identity = identityByOrg.get(org.id) ?? null;

    items.push({
      relationshipId: relationship.id,
      organizationId: org.id,
      name: org.name,
      logoPreviewUrl,
      pinned: Boolean(relationship.pinned),
      pinnedAt: relationship.pinned_at ?? null,
      accountEmail: ownerUserId
        ? emailByUserId.get(ownerUserId) ?? null
        : null,
      notes: normalizeMasterNotes(relationship.notes),
      accountSnapshot: resolveAccountSnapshot(identity),
    });
  }

  items.sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  return items;
}

export async function setLicenseeSubAccountPinned(input: {
  masterUserId: string;
  relationshipId: string;
  pinned: boolean;
}): Promise<{ relationshipId: string; pinned: boolean; pinnedAt: string | null }> {
  const licenseeAccount = await requireLicenseeMasterAccount(input.masterUserId);
  const relationshipId = input.relationshipId.trim();
  if (!relationshipId) {
    throw new LicenseeAccessError("Missing relationship id.");
  }

  const { data: relationship, error: lookupError } = await supabaseAdmin
    .from("licensee_sub_accounts")
    .select("id, licensee_account_id")
    .eq("id", relationshipId)
    .maybeSingle();

  if (lookupError) {
    throw new LicenseeAccessError(lookupError.message);
  }

  if (!relationship || relationship.licensee_account_id !== licenseeAccount.id) {
    throw new LicenseeAccessError(
      "Master does not own this sub-account relationship.",
    );
  }

  const pinnedAt = input.pinned ? new Date().toISOString() : null;

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("licensee_sub_accounts")
    .update({
      pinned: input.pinned,
      pinned_at: pinnedAt,
    })
    .eq("id", relationshipId)
    .eq("licensee_account_id", licenseeAccount.id)
    .select("id, pinned, pinned_at")
    .single();

  if (updateError || !updated) {
    throw new Error(updateError?.message || "Failed to update pin state.");
  }

  return {
    relationshipId: updated.id,
    pinned: Boolean(updated.pinned),
    pinnedAt: updated.pinned_at ?? null,
  };
}

/**
 * Update private Master notes on the relationship row only.
 * Does not touch Athena tenant data.
 */
export async function setLicenseeSubAccountNotes(input: {
  masterUserId: string;
  relationshipId: string;
  notes: string;
}): Promise<{ relationshipId: string; notes: string }> {
  const licenseeAccount = await requireLicenseeMasterAccount(input.masterUserId);
  const relationshipId = input.relationshipId.trim();
  if (!relationshipId) {
    throw new LicenseeAccessError("Missing relationship id.");
  }

  const notes = normalizeMasterNotes(input.notes);
  if (notes.length > LICENSEE_SUB_ACCOUNT_NOTES_MAX_LENGTH) {
    throw new LicenseeSubAccountCreateError(
      "NOTES_TOO_LONG",
      `Master notes cannot exceed ${LICENSEE_SUB_ACCOUNT_NOTES_MAX_LENGTH} characters.`,
    );
  }

  const { data: relationship, error: lookupError } = await supabaseAdmin
    .from("licensee_sub_accounts")
    .select("id, licensee_account_id")
    .eq("id", relationshipId)
    .maybeSingle();

  if (lookupError) {
    throw new LicenseeAccessError(lookupError.message);
  }

  if (!relationship || relationship.licensee_account_id !== licenseeAccount.id) {
    throw new LicenseeAccessError(
      "Master does not own this sub-account relationship.",
    );
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("licensee_sub_accounts")
    .update({ notes })
    .eq("id", relationshipId)
    .eq("licensee_account_id", licenseeAccount.id)
    .select("id, notes")
    .single();

  if (updateError || !updated) {
    throw new Error(updateError?.message || "Failed to save Master notes.");
  }

  return {
    relationshipId: updated.id,
    notes: normalizeMasterNotes(updated.notes),
  };
}

/**
 * Remove only the Master ↔ organization relationship row.
 * Never deletes auth users, organizations, members, or tenant intelligence.
 */
export async function removeLicenseeSubAccountRelationship(input: {
  masterUserId: string;
  relationshipId: string;
}): Promise<{ relationshipId: string; organizationId: string }> {
  const licenseeAccount = await requireLicenseeMasterAccount(input.masterUserId);
  const relationshipId = input.relationshipId.trim();
  if (!relationshipId) {
    throw new LicenseeAccessError("Missing relationship id.");
  }

  const { data: relationship, error: lookupError } = await supabaseAdmin
    .from("licensee_sub_accounts")
    .select("id, licensee_account_id, organization_id")
    .eq("id", relationshipId)
    .maybeSingle();

  if (lookupError) {
    throw new LicenseeAccessError(lookupError.message);
  }

  if (!relationship || relationship.licensee_account_id !== licenseeAccount.id) {
    throw new LicenseeAccessError(
      "Master does not own this sub-account relationship.",
    );
  }

  const { error: deleteError } = await supabaseAdmin
    .from("licensee_sub_accounts")
    .delete()
    .eq("id", relationshipId)
    .eq("licensee_account_id", licenseeAccount.id);

  if (deleteError) {
    throw new Error(deleteError.message || "Failed to remove sub-account.");
  }

  return {
    relationshipId,
    organizationId: relationship.organization_id,
  };
}

async function assertMembershipSafeForLink(userId: string): Promise<{
  organizationId: string;
  role: string;
}> {
  const { data, error } = await supabaseAdmin
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", userId);

  if (error) {
    throw new LicenseeSubAccountCreateError(
      "MEMBERSHIP_LOOKUP_FAILED",
      "Could not resolve existing account membership. No changes were made.",
    );
  }

  if (!data || data.length === 0) {
    throw new LicenseeSubAccountCreateError(
      "NO_MEMBERSHIP",
      "EXISTING_WITHOUT_ORG",
    );
  }

  if (data.length !== 1) {
    throw new LicenseeSubAccountCreateError(
      "AMBIGUOUS_MEMBERSHIP",
      "This email has an ambiguous organization membership state. No changes were made.",
    );
  }

  const membership = data[0];
  if (membership.role !== "owner" || !membership.organization_id) {
    throw new LicenseeSubAccountCreateError(
      "INVALID_MEMBERSHIP",
      "This email does not have a valid owner membership for a normal Athena account.",
    );
  }

  return {
    organizationId: membership.organization_id,
    role: membership.role,
  };
}

async function ensureRelationship(input: {
  licenseeAccountId: string;
  organizationId: string;
}): Promise<void> {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("licensee_sub_accounts")
    .select("id")
    .eq("licensee_account_id", input.licenseeAccountId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  if (existingError) {
    throw new LicenseeSubAccountCreateError(
      "RELATIONSHIP_LOOKUP_FAILED",
      existingError.message,
    );
  }

  if (existing?.id) {
    throw new LicenseeSubAccountCreateError(
      "DUPLICATE_RELATIONSHIP",
      "This Athena account is already linked to your Master dashboard.",
    );
  }

  const { error: insertError } = await supabaseAdmin
    .from("licensee_sub_accounts")
    .insert({
      licensee_account_id: input.licenseeAccountId,
      organization_id: input.organizationId,
      pinned: false,
      pinned_at: null,
    });

  if (insertError) {
    if (insertError.code === "23505") {
      throw new LicenseeSubAccountCreateError(
        "DUPLICATE_RELATIONSHIP",
        "This Athena account is already linked to your Master dashboard.",
      );
    }
    throw new LicenseeSubAccountCreateError(
      "RELATIONSHIP_CREATE_FAILED",
      insertError.message,
    );
  }
}

export type CreateLicenseeSubAccountResult = {
  organizationId: string;
  relationshipCreated: true;
  authUserCreated: boolean;
  linkedExisting: boolean;
};

/**
 * Create or link a normal Athena sub-account under the current Master.
 * Never silently hijacks an existing account without confirmLinkExisting.
 */
export async function createLicenseeSubAccount(input: {
  masterUserId: string;
  businessName: string;
  accountEmail: string;
  confirmLinkExisting?: boolean;
}): Promise<CreateLicenseeSubAccountResult> {
  const licenseeAccount = await requireLicenseeMasterAccount(input.masterUserId);
  const businessName = normalizeBusinessName(input.businessName);
  const accountEmail = normalizeEmail(input.accountEmail);

  if (!businessName || businessName.length < 2) {
    throw new LicenseeSubAccountCreateError(
      "INVALID_BUSINESS_NAME",
      "Business Name is required.",
    );
  }

  if (!accountEmail || !accountEmail.includes("@")) {
    throw new LicenseeSubAccountCreateError(
      "INVALID_EMAIL",
      "A valid Account Email is required.",
    );
  }

  if (accountEmail === licenseeAccount.email.trim().toLowerCase()) {
    throw new LicenseeSubAccountCreateError(
      "MASTER_EMAIL_REJECTED",
      "A Master email cannot be used as a sub-account email.",
    );
  }

  let authUser = await findAuthUserByEmail(accountEmail);
  let authUserCreated = false;

  if (authUser && (await isLicenseeMasterUser(authUser.id))) {
    throw new LicenseeSubAccountCreateError(
      "MASTER_EMAIL_REJECTED",
      "A Master email cannot be used as a sub-account email.",
    );
  }

  if (!authUser) {
    try {
      authUser = await createConfirmedAuthUser(accountEmail);
      authUserCreated = true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create auth user.";
      // Concurrent create — re-lookup once.
      authUser = await findAuthUserByEmail(accountEmail);
      if (!authUser) {
        throw new LicenseeSubAccountCreateError("AUTH_USER_CREATE_FAILED", message);
      }
      if (await isLicenseeMasterUser(authUser.id)) {
        throw new LicenseeSubAccountCreateError(
          "MASTER_EMAIL_REJECTED",
          "A Master email cannot be used as a sub-account email.",
        );
      }
    }
  }

  let organizationId: string | null = null;
  let linkedExisting = false;

  try {
    const membership = await assertMembershipSafeForLink(authUser.id);
    linkedExisting = true;
    organizationId = membership.organizationId;

    if (!input.confirmLinkExisting) {
      const { data: org } = await supabaseAdmin
        .from("organizations")
        .select("name")
        .eq("id", organizationId)
        .maybeSingle();

      throw new LicenseeSubAccountCreateError(
        "EXISTING_ACCOUNT_REQUIRES_CONFIRMATION",
        `This email already owns an Athena account${
          org?.name ? ` (“${org.name}”)` : ""
        }. Confirm to link it to this Master without creating a second organization.`,
      );
    }
  } catch (error) {
    if (
      error instanceof LicenseeSubAccountCreateError &&
      error.code === "NO_MEMBERSHIP"
    ) {
      try {
        organizationId = await provisionTenantForAuthenticatedUser(
          authUser.id,
          accountEmail,
          { organizationName: businessName },
        );
      } catch (provisionError) {
        const message =
          provisionError instanceof Error
            ? provisionError.message
            : "Organization provisioning failed.";
        throw new LicenseeSubAccountCreateError(
          authUserCreated
            ? "PROVISION_FAILED_AFTER_AUTH_CREATE"
            : "PROVISION_FAILED",
          authUserCreated
            ? `Auth user was created but organization provisioning failed: ${message}. Retry create with the same email to continue provisioning safely. The auth user was not deleted.`
            : `Organization provisioning failed: ${message}`,
        );
      }
    } else {
      throw error;
    }
  }

  if (!organizationId) {
    throw new LicenseeSubAccountCreateError(
      "ORG_RESOLVE_FAILED",
      "Could not resolve a sub-account organization.",
    );
  }

  // Defense: membership unique model — re-check single owner membership.
  const verified = await getOrganizationMembership(authUser.id);
  if (!verified?.organization_id || verified.organization_id !== organizationId) {
    throw new LicenseeSubAccountCreateError(
      "MEMBERSHIP_MISMATCH",
      "Organization membership could not be verified after provisioning.",
    );
  }

  await ensureRelationship({
    licenseeAccountId: licenseeAccount.id,
    organizationId,
  });

  return {
    organizationId,
    relationshipCreated: true,
    authUserCreated,
    linkedExisting,
  };
}
