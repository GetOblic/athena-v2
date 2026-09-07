import { createBrandLogoSignedUrl } from "@/services/identity/brandLogoStorage";
import { readIdentityExecutiveIntelligence } from "@/services/identity/identityExecutiveIntelligence";
import {
  LicenseeAccessError,
  assertLicenseeOwnsSubAccount,
  getLicenseeAccountByUserId,
  isLicenseeMasterUser,
  type LicenseeAccount,
} from "@/services/licensee/licenseeIdentity";
import {
  createConfirmedAuthUser,
  findAuthUserByEmail,
} from "@/services/licensee/licenseeAuthUserLookup";
import { computeAccountReadiness } from "@/services/licensee/licenseeAccountReadiness";
import {
  LICENSEE_SUB_ACCOUNT_DISPLAY_NAME_MAX_LENGTH,
  LICENSEE_SUB_ACCOUNT_NOTES_MAX_LENGTH,
  shouldAutoDesignateOwnCompany,
  sortLicenseeSubAccountsShared,
  type LicenseeSubAccountListItem,
} from "@/services/licensee/licenseeSubAccountTypes";
import { PERSONA_INTELLIGENCE_PLATFORM } from "@/services/personas/personaBridgeMarker";
import { PROSPECT_INTELLIGENCE_PLATFORM } from "@/services/prospects/prospectBridgeMarker";
import { deepIntelligenceHasUsableContent } from "@/services/websiteLearning/deepScrape/deepWebsiteIntelligence";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  AccountAccessDeniedError,
  assertAccountAccessActive,
} from "@/services/superAdmin/accountAccessStatus";
import {
  SuperAdminAuthorityLookupError,
  isGetOblicSuperAdminUser,
} from "@/services/superAdmin/superAdminIdentity";
import {
  OrganizationLanguageInvalidError,
  parseOrganizationLanguage,
  type OrganizationLanguage,
} from "@/services/organizationLanguage";
import {
  getOrganizationMembership,
  provisionTenantForAuthenticatedUser,
} from "@/services/organizationService";

export {
  LICENSEE_SUB_ACCOUNT_DISPLAY_NAME_MAX_LENGTH,
  LICENSEE_SUB_ACCOUNT_NOTES_MAX_LENGTH,
  resolveLicenseeSubAccountTitle,
  shouldAutoDesignateOwnCompany,
  sortLicenseeSubAccountsForDashboard,
  sortLicenseeSubAccountsShared,
  type LicenseeSubAccountListItem,
  type LicenseeSubAccountOperationalMetrics,
} from "@/services/licensee/licenseeSubAccountTypes";

export { computeAccountReadiness } from "@/services/licensee/licenseeAccountReadiness";

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

/** Domain errors for own-company identity (designation + locked relationship). */
export class LicenseeOwnCompanyError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "LicenseeOwnCompanyError";
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

function normalizeDisplayName(
  displayName: string | null | undefined,
): string | null {
  if (typeof displayName !== "string") {
    return null;
  }
  const trimmed = displayName.trim().replace(/\s+/g, " ");
  return trimmed.length > 0 ? trimmed : null;
}

function incrementCount(
  map: Map<string, number>,
  organizationId: string | null | undefined,
) {
  if (!organizationId) {
    return;
  }
  map.set(organizationId, (map.get(organizationId) ?? 0) + 1);
}

/**
 * Batched activity/status counts for authorized organization IDs.
 * Never writes tenant data. Never uses licensee_account_id as tenant authority.
 */
async function loadBatchedTenantActivity(organizationIds: string[]): Promise<{
  prospectCounts: Map<string, number>;
  discussionCounts: Map<string, number>;
  personaCounts: Map<string, number>;
  seoReadyOrgs: Set<string>;
  adsReadyOrgs: Set<string>;
}> {
  const prospectCounts = new Map<string, number>();
  const discussionCounts = new Map<string, number>();
  const personaCounts = new Map<string, number>();
  const seoReadyOrgs = new Set<string>();
  const adsReadyOrgs = new Set<string>();

  if (organizationIds.length === 0) {
    return {
      prospectCounts,
      discussionCounts,
      personaCounts,
      seoReadyOrgs,
      adsReadyOrgs,
    };
  }

  const [prospectsResult, discussionsResult, personasResult, seoResult, adsResult] =
    await Promise.all([
      supabaseAdmin
        .from("prospects")
        .select("organization_id")
        .in("organization_id", organizationIds),
      supabaseAdmin
        .from("discussions")
        .select("organization_id")
        .in("organization_id", organizationIds)
        .neq("platform", PROSPECT_INTELLIGENCE_PLATFORM)
        .neq("platform", PERSONA_INTELLIGENCE_PLATFORM),
      supabaseAdmin
        .from("personas")
        .select("organization_id")
        .in("organization_id", organizationIds),
      supabaseAdmin
        .from("seo_reports")
        .select("organization_id, status")
        .in("organization_id", organizationIds),
      supabaseAdmin
        .from("ad_campaigns")
        .select("organization_id, status")
        .in("organization_id", organizationIds),
    ]);

  if (prospectsResult.error) {
    throw new Error(
      prospectsResult.error.message || "Failed to load prospect counts.",
    );
  }
  if (discussionsResult.error) {
    throw new Error(
      discussionsResult.error.message || "Failed to load discussion counts.",
    );
  }
  if (personasResult.error) {
    throw new Error(
      personasResult.error.message || "Failed to load persona counts.",
    );
  }
  if (seoResult.error) {
    throw new Error(seoResult.error.message || "Failed to load SEO readiness.");
  }
  if (adsResult.error) {
    throw new Error(adsResult.error.message || "Failed to load Ads readiness.");
  }

  for (const row of prospectsResult.data ?? []) {
    incrementCount(prospectCounts, row.organization_id as string);
  }
  for (const row of discussionsResult.data ?? []) {
    incrementCount(discussionCounts, row.organization_id as string);
  }
  for (const row of personasResult.data ?? []) {
    incrementCount(personaCounts, row.organization_id as string);
  }
  for (const row of seoResult.data ?? []) {
    if (row.status === "Ready" && typeof row.organization_id === "string") {
      seoReadyOrgs.add(row.organization_id);
    }
  }
  for (const row of adsResult.data ?? []) {
    if (row.status === "Ready" && typeof row.organization_id === "string") {
      adsReadyOrgs.add(row.organization_id);
    }
  }

  return {
    prospectCounts,
    discussionCounts,
    personaCounts,
    seoReadyOrgs,
    adsReadyOrgs,
  };
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
  // Existing-session fail-closed for deactivated Licensee Masters.
  try {
    await assertAccountAccessActive(userId);
  } catch (error) {
    if (error instanceof AccountAccessDeniedError) {
      throw new LicenseeAccessError(error.message);
    }
    throw error;
  }
  return account;
}

/**
 * Dashboard list: only orgs linked through the current Master's relationships.
 * Name/logo from organizations; optional compact snapshot from existing identity text.
 * Operational metrics are batched, organization-scoped, read-only views.
 * Never generates AI summaries. Never mutates tenant intelligence.
 */
export async function listLicenseeSubAccountsForMaster(
  masterUserId: string,
): Promise<LicenseeSubAccountListItem[]> {
  const licenseeAccount = await requireLicenseeMasterAccount(masterUserId);

  const { data: relationships, error } = await supabaseAdmin
    .from("licensee_sub_accounts")
    .select(
      "id, organization_id, pinned, pinned_at, notes, display_name, created_at",
    )
    .eq("licensee_account_id", licenseeAccount.id);

  if (error) {
    throw new Error(error.message || "Failed to load sub-accounts.");
  }

  if (!relationships?.length) {
    return [];
  }

  const organizationIds = relationships.map((row) => row.organization_id);

  const [
    { data: organizations, error: orgError },
    { data: memberships, error: memberError },
    { data: identities, error: identityError },
    activity,
  ] = await Promise.all([
    supabaseAdmin
      .from("organizations")
      .select("id, name, brand_logo_storage_path, last_visited_at")
      .in("id", organizationIds),
    supabaseAdmin
      .from("organization_members")
      .select("organization_id, user_id, role")
      .in("organization_id", organizationIds)
      .eq("role", "owner"),
    supabaseAdmin
      .from("athena_identity")
      .select(
        "organization_id, about_you, master_profile, brain_status, website_intelligence",
      )
      .in("organization_id", organizationIds),
    loadBatchedTenantActivity(organizationIds),
  ]);

  if (orgError) {
    throw new Error(orgError.message || "Failed to load organizations.");
  }
  if (memberError) {
    throw new Error(memberError.message || "Failed to load account emails.");
  }
  if (identityError) {
    throw new Error(identityError.message || "Failed to load account snapshots.");
  }

  const orgById = new Map(
    (organizations ?? []).map((org) => [org.id as string, org]),
  );

  const ownerByOrg = new Map(
    (memberships ?? []).map((row) => [
      row.organization_id as string,
      row.user_id as string,
    ]),
  );

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
    const prospectCount = activity.prospectCounts.get(org.id) ?? 0;
    const discussionCount = activity.discussionCounts.get(org.id) ?? 0;
    const personaCount = activity.personaCounts.get(org.id) ?? 0;
    const brainReady = identity?.brain_status === "ready";
    const websiteIntelligenceReady = deepIntelligenceHasUsableContent(
      identity?.website_intelligence,
    );
    const seoReady = activity.seoReadyOrgs.has(org.id);
    const adsReady = activity.adsReadyOrgs.has(org.id);
    const readiness = computeAccountReadiness({
      brainReady,
      websiteIntelligenceReady,
      seoReady,
      adsReady,
      hasPersonas: personaCount > 0,
      hasProspects: prospectCount > 0,
    });

    items.push({
      relationshipId: relationship.id,
      organizationId: org.id,
      name: org.name,
      displayName: normalizeDisplayName(relationship.display_name),
      logoPreviewUrl,
      pinned: Boolean(relationship.pinned),
      pinnedAt: relationship.pinned_at ?? null,
      isOwnCompany:
        org.id === licenseeAccount.own_company_organization_id,
      accountEmail: ownerUserId
        ? emailByUserId.get(ownerUserId) ?? null
        : null,
      notes: normalizeMasterNotes(relationship.notes),
      accountSnapshot: resolveAccountSnapshot(identity),
      metrics: {
        prospectCount,
        discussionCount,
        personaCount,
        brainReady,
        websiteIntelligenceReady,
        seoReady,
        adsReady,
        lastVisitedAt:
          typeof org.last_visited_at === "string" ? org.last_visited_at : null,
        accountReadinessPercent: readiness.percent,
      },
    });
  }

  // Shared pinned-then-alphabetical order. Estimate default-selects [0].
  // Own-company-first ordering is a Licensee dashboard presentation rule only.
  return sortLicenseeSubAccountsShared(items);
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
 * Update Master-only display name on the relationship row only.
 * Does not touch organizations.name or Athena tenant branding.
 */
export async function setLicenseeSubAccountDisplayName(input: {
  masterUserId: string;
  relationshipId: string;
  displayName: string;
}): Promise<{ relationshipId: string; displayName: string | null }> {
  const licenseeAccount = await requireLicenseeMasterAccount(input.masterUserId);
  const relationshipId = input.relationshipId.trim();
  if (!relationshipId) {
    throw new LicenseeAccessError("Missing relationship id.");
  }

  const displayName = normalizeDisplayName(input.displayName);
  if (
    displayName &&
    displayName.length > LICENSEE_SUB_ACCOUNT_DISPLAY_NAME_MAX_LENGTH
  ) {
    throw new LicenseeSubAccountCreateError(
      "DISPLAY_NAME_TOO_LONG",
      `Master display name cannot exceed ${LICENSEE_SUB_ACCOUNT_DISPLAY_NAME_MAX_LENGTH} characters.`,
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
    .update({ display_name: displayName })
    .eq("id", relationshipId)
    .eq("licensee_account_id", licenseeAccount.id)
    .select("id, display_name")
    .single();

  if (updateError || !updated) {
    throw new Error(updateError?.message || "Failed to save Master display name.");
  }

  return {
    relationshipId: updated.id,
    displayName: normalizeDisplayName(updated.display_name),
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

  if (
    licenseeAccount.own_company_organization_id &&
    relationship.organization_id === licenseeAccount.own_company_organization_id
  ) {
    throw new LicenseeOwnCompanyError(
      "OWN_COMPANY_RELATIONSHIP_LOCKED",
      "Your company account cannot be removed from the Master dashboard.",
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

async function countLicenseeSubAccountRelationships(
  licenseeAccountId: string,
): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("licensee_sub_accounts")
    .select("id", { count: "exact", head: true })
    .eq("licensee_account_id", licenseeAccountId);

  if (error) {
    throw new LicenseeSubAccountCreateError(
      "RELATIONSHIP_LOOKUP_FAILED",
      error.message,
    );
  }

  return count ?? 0;
}

/**
 * Write own-company identity only when currently unset.
 * Never writes pinned / pinned_at. Never mutates organizations.
 */
async function persistOwnCompanyIfUnset(input: {
  licenseeAccountId: string;
  organizationId: string;
}): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("licensee_accounts")
    .update({ own_company_organization_id: input.organizationId })
    .eq("id", input.licenseeAccountId)
    .is("own_company_organization_id", null)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new LicenseeOwnCompanyError(
      "OWN_COMPANY_PERSIST_FAILED",
      error.message || "Failed to designate My Company.",
    );
  }

  return Boolean(data?.id);
}

/**
 * Explicit Licensee Master designation of an owned sub-account as My Company.
 * Idempotent when the same organization is already designated.
 * Rejects replacement of a different designation.
 */
export async function designateLicenseeOwnCompany(input: {
  masterUserId: string;
  relationshipId: string;
}): Promise<{
  relationshipId: string;
  organizationId: string;
  alreadyDesignated: boolean;
}> {
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

  await assertLicenseeOwnsSubAccount({
    masterUserId: input.masterUserId,
    organizationId: relationship.organization_id,
  });

  const current = licenseeAccount.own_company_organization_id;
  if (current === relationship.organization_id) {
    return {
      relationshipId: relationship.id,
      organizationId: relationship.organization_id,
      alreadyDesignated: true,
    };
  }

  if (current) {
    throw new LicenseeOwnCompanyError(
      "OWN_COMPANY_ALREADY_DESIGNATED",
      "My Company is already designated and cannot be changed from this dashboard.",
    );
  }

  const designated = await persistOwnCompanyIfUnset({
    licenseeAccountId: licenseeAccount.id,
    organizationId: relationship.organization_id,
  });

  if (!designated) {
    const latest = await getLicenseeAccountByUserId(input.masterUserId);
    if (latest?.own_company_organization_id === relationship.organization_id) {
      return {
        relationshipId: relationship.id,
        organizationId: relationship.organization_id,
        alreadyDesignated: true,
      };
    }
    throw new LicenseeOwnCompanyError(
      "OWN_COMPANY_ALREADY_DESIGNATED",
      "My Company is already designated and cannot be changed from this dashboard.",
    );
  }

  return {
    relationshipId: relationship.id,
    organizationId: relationship.organization_id,
    alreadyDesignated: false,
  };
}

/**
 * First-account auto-designation after the relationship exists.
 * No-op unless FK is null and the relationship count before create was zero.
 */
async function maybeAutoDesignateFirstOwnCompany(input: {
  licenseeAccountId: string;
  organizationId: string;
  ownCompanyOrganizationId: string | null;
  existingRelationshipCount: number;
}): Promise<void> {
  if (
    !shouldAutoDesignateOwnCompany({
      ownCompanyOrganizationId: input.ownCompanyOrganizationId,
      existingRelationshipCount: input.existingRelationshipCount,
    })
  ) {
    return;
  }

  await persistOwnCompanyIfUnset({
    licenseeAccountId: input.licenseeAccountId,
    organizationId: input.organizationId,
  });
}

export async function getLicenseeOwnCompanySetupState(masterUserId: string): Promise<{
  ownCompanyOrganizationId: string | null;
  relationshipCount: number;
  isFirstCompanySetup: boolean;
}> {
  const licenseeAccount = await requireLicenseeMasterAccount(masterUserId);
  const relationshipCount = await countLicenseeSubAccountRelationships(
    licenseeAccount.id,
  );
  const ownCompanyOrganizationId = licenseeAccount.own_company_organization_id;
  return {
    ownCompanyOrganizationId,
    relationshipCount,
    isFirstCompanySetup: shouldAutoDesignateOwnCompany({
      ownCompanyOrganizationId,
      existingRelationshipCount: relationshipCount,
    }),
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
  /** Validated and persisted only when a new organization is created. */
  language?: unknown;
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

  const existingRelationshipCount = await countLicenseeSubAccountRelationships(
    licenseeAccount.id,
  );

  let organizationLanguage: OrganizationLanguage | undefined;
  if (
    input.language !== undefined &&
    input.language !== null &&
    String(input.language).trim() !== ""
  ) {
    try {
      organizationLanguage = parseOrganizationLanguage(input.language);
    } catch (error) {
      if (error instanceof OrganizationLanguageInvalidError) {
        throw new LicenseeSubAccountCreateError(
          "INVALID_LANGUAGE",
          "A supported Account Language is required.",
        );
      }
      throw error;
    }
  }

  let authUser = await findAuthUserByEmail(accountEmail);
  let authUserCreated = false;

  if (authUser && (await isLicenseeMasterUser(authUser.id))) {
    throw new LicenseeSubAccountCreateError(
      "MASTER_EMAIL_REJECTED",
      "A Master email cannot be used as a sub-account email.",
    );
  }

  if (authUser) {
    try {
      if (await isGetOblicSuperAdminUser(authUser.id)) {
        throw new LicenseeSubAccountCreateError(
          "SUPER_ADMIN_EMAIL_REJECTED",
          "A GetOblic Super Admin email cannot be used as a sub-account email.",
        );
      }
    } catch (error) {
      if (error instanceof LicenseeSubAccountCreateError) {
        throw error;
      }
      if (error instanceof SuperAdminAuthorityLookupError) {
        throw new LicenseeSubAccountCreateError(
          "SUPER_ADMIN_LOOKUP_FAILED",
          "Super Admin authority could not be verified. Sub-account creation denied.",
        );
      }
      throw error;
    }
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
      try {
        if (await isGetOblicSuperAdminUser(authUser.id)) {
          throw new LicenseeSubAccountCreateError(
            "SUPER_ADMIN_EMAIL_REJECTED",
            "A GetOblic Super Admin email cannot be used as a sub-account email.",
          );
        }
      } catch (lookupError) {
        if (lookupError instanceof LicenseeSubAccountCreateError) {
          throw lookupError;
        }
        if (lookupError instanceof SuperAdminAuthorityLookupError) {
          throw new LicenseeSubAccountCreateError(
            "SUPER_ADMIN_LOOKUP_FAILED",
            "Super Admin authority could not be verified. Sub-account creation denied.",
          );
        }
        throw lookupError;
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
          {
            organizationName: businessName,
            ...(organizationLanguage
              ? { language: organizationLanguage }
              : {}),
          },
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

  await maybeAutoDesignateFirstOwnCompany({
    licenseeAccountId: licenseeAccount.id,
    organizationId,
    ownCompanyOrganizationId: licenseeAccount.own_company_organization_id,
    existingRelationshipCount,
  });

  return {
    organizationId,
    relationshipCreated: true,
    authUserCreated,
    linkedExisting,
  };
}
