/**
 * Licensee Own-Company Prospect ↔ client conversion domain service.
 *
 * Reuses createLicenseeSubAccount / removeLicenseeSubAccountRelationship.
 * Never moves, copies, or deletes the Prospect. Never mutates GetOblic.
 * Never uses prospects.email as an Athena login identity.
 *
 * First-time provisioning writes a durable provisioning intent BEFORE
 * createLicenseeSubAccount. The conversion row is written only after the
 * client organization and Licensee relationship exist. Intent is consumed
 * only after that conversion is durable.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  LicenseeAccessError,
  getLicenseeAccountsByOwnCompanyOrganizationId,
  type LicenseeAccount,
} from "@/services/licensee/licenseeIdentity";
import { findAuthUserByEmail } from "@/services/licensee/licenseeAuthUserLookup";
import {
  LicenseeOwnCompanyError,
  LicenseeSubAccountCreateError,
  createLicenseeSubAccount,
  removeLicenseeSubAccountRelationship,
  requireLicenseeMasterAccount,
} from "@/services/licensee/licenseeSubAccounts";
import {
  buildProvisionalClientAccountEmailCandidates,
  isGetoblicProvisionalAccountEmail,
  normalizeEmailAddress,
  stableShortProspectId,
} from "@/services/licensee/provisionalClientAccountEmail";
import { getProspectById } from "@/services/prospects/prospectService";
import {
  isGetOblicDerivedProspect,
  organizationOwnsActiveGetOblicClaimForProspect,
} from "@/services/prospects/prospectGetOblicOwnership";

export {
  buildProvisionalClientAccountEmailCandidates,
  normalizeProvisionalEmailLocalPart,
  normalizeEmailAddress,
} from "@/services/licensee/provisionalClientAccountEmail";

export type LicenseeProspectClientConversionStatus = "active" | "reversed";

export type LicenseeProspectClientConversion = {
  id: string;
  prospectId: string;
  sourceOrganizationId: string;
  clientOrganizationId: string;
  licenseeAccountId: string;
  licenseeSubAccountId: string | null;
  status: LicenseeProspectClientConversionStatus;
  clientAccountEmail: string;
  convertedAt: string;
  convertedByUserId: string | null;
  restoredAt: string | null;
  restoredByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LicenseeProspectClientProvisioningIntent = {
  prospectId: string;
  sourceOrganizationId: string;
  licenseeAccountId: string;
  intendedClientAccountEmail: string;
  createdByUserId: string | null;
  createdAt: string;
};

export type PromoteLicenseeProspectToClientInput = {
  prospectId: string;
  sourceOrganizationId: string;
  actingUserId: string;
};

export type PromoteLicenseeProspectToClientResult = {
  conversion: LicenseeProspectClientConversion;
  clientOrganizationId: string;
  clientAccountEmail: string;
  alreadyActive: boolean;
  reattached: boolean;
};

export type ReverseLicenseeProspectClientConversionInput = {
  prospectId: string;
  sourceOrganizationId: string;
  masterUserId: string;
};

export type ReverseLicenseeProspectClientConversionResult = {
  conversion: LicenseeProspectClientConversion;
  clientOrganizationId: string;
  clientAccountEmail: string;
  alreadyReversed: boolean;
};

export class LicenseeProspectClientConversionError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "LicenseeProspectClientConversionError";
    this.code = code;
  }
}

type ConversionRow = {
  id: string;
  prospect_id: string;
  source_organization_id: string;
  client_organization_id: string;
  licensee_account_id: string;
  licensee_sub_account_id: string | null;
  status: string;
  client_account_email: string;
  converted_at: string;
  converted_by_user_id: string | null;
  restored_at: string | null;
  restored_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type IntentRow = {
  prospect_id: string;
  source_organization_id: string;
  licensee_account_id: string;
  intended_client_account_email: string;
  created_by_user_id: string | null;
  created_at: string;
};

type LicenseeRelationshipRow = {
  id: string;
  licensee_account_id: string;
  organization_id: string;
};

type EmailClassification = "available" | "reuse" | "unrelated";

type PartialProvisionClassification =
  | { kind: "needs_provision" }
  | {
      kind: "recoverable";
      organizationId: string;
      relationshipId: string;
    }
  | { kind: "irreconcilable"; error: LicenseeProspectClientConversionError };

const CONVERSION_SELECT =
  "id, prospect_id, source_organization_id, client_organization_id, licensee_account_id, licensee_sub_account_id, status, client_account_email, converted_at, converted_by_user_id, restored_at, restored_by_user_id, created_at, updated_at";

const INTENT_SELECT =
  "prospect_id, source_organization_id, licensee_account_id, intended_client_account_email, created_by_user_id, created_at";

function nowIso(): string {
  return new Date().toISOString();
}

function mapConversionRow(row: ConversionRow): LicenseeProspectClientConversion {
  if (row.status !== "active" && row.status !== "reversed") {
    throw new LicenseeProspectClientConversionError(
      "INVALID_CONVERSION_STATUS",
      "Conversion status is not recognized.",
    );
  }

  return {
    id: row.id,
    prospectId: row.prospect_id,
    sourceOrganizationId: row.source_organization_id,
    clientOrganizationId: row.client_organization_id,
    licenseeAccountId: row.licensee_account_id,
    licenseeSubAccountId: row.licensee_sub_account_id,
    status: row.status,
    clientAccountEmail: normalizeEmailAddress(row.client_account_email),
    convertedAt: row.converted_at,
    convertedByUserId: row.converted_by_user_id,
    restoredAt: row.restored_at,
    restoredByUserId: row.restored_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapIntentRow(row: IntentRow): LicenseeProspectClientProvisioningIntent {
  return {
    prospectId: row.prospect_id,
    sourceOrganizationId: row.source_organization_id,
    licenseeAccountId: row.licensee_account_id,
    intendedClientAccountEmail: normalizeEmailAddress(
      row.intended_client_account_email,
    ),
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
  };
}

function toPromotionResult(
  conversion: LicenseeProspectClientConversion,
  flags: { alreadyActive: boolean; reattached: boolean },
): PromoteLicenseeProspectToClientResult {
  return {
    conversion,
    clientOrganizationId: conversion.clientOrganizationId,
    clientAccountEmail: conversion.clientAccountEmail,
    alreadyActive: flags.alreadyActive,
    reattached: flags.reattached,
  };
}

function resolveClientOrganizationName(
  businessName: string,
  prospectId: string,
): string {
  const normalized = businessName.trim().replace(/\s+/g, " ");
  if (normalized.length >= 2) {
    return normalized;
  }
  return `Prospect ${stableShortProspectId(prospectId)}`;
}

async function loadConversionByProspectId(
  prospectId: string,
): Promise<LicenseeProspectClientConversion | null> {
  const { data, error } = await supabaseAdmin
    .from("licensee_prospect_client_conversions")
    .select(CONVERSION_SELECT)
    .eq("prospect_id", prospectId)
    .maybeSingle();

  if (error) {
    throw new LicenseeProspectClientConversionError(
      "CONVERSION_LOOKUP_FAILED",
      error.message || "Failed to load conversion.",
    );
  }

  return data ? mapConversionRow(data as ConversionRow) : null;
}

async function loadConversionByClientAccountEmail(
  email: string,
): Promise<LicenseeProspectClientConversion | null> {
  const { data, error } = await supabaseAdmin
    .from("licensee_prospect_client_conversions")
    .select(CONVERSION_SELECT)
    .eq("client_account_email", normalizeEmailAddress(email))
    .maybeSingle();

  if (error) {
    throw new LicenseeProspectClientConversionError(
      "CONVERSION_LOOKUP_FAILED",
      error.message || "Failed to load conversion by account email.",
    );
  }

  return data ? mapConversionRow(data as ConversionRow) : null;
}

async function loadConversionByClientOrganizationId(
  clientOrganizationId: string,
): Promise<LicenseeProspectClientConversion | null> {
  const { data, error } = await supabaseAdmin
    .from("licensee_prospect_client_conversions")
    .select(CONVERSION_SELECT)
    .eq("client_organization_id", clientOrganizationId)
    .maybeSingle();

  if (error) {
    throw new LicenseeProspectClientConversionError(
      "CONVERSION_LOOKUP_FAILED",
      error.message || "Failed to load conversion by client organization.",
    );
  }

  return data ? mapConversionRow(data as ConversionRow) : null;
}

async function loadProvisioningIntentByProspectId(
  prospectId: string,
): Promise<LicenseeProspectClientProvisioningIntent | null> {
  const { data, error } = await supabaseAdmin
    .from("licensee_prospect_client_provisioning_intents")
    .select(INTENT_SELECT)
    .eq("prospect_id", prospectId)
    .maybeSingle();

  if (error) {
    throw new LicenseeProspectClientConversionError(
      "INTENT_LOOKUP_FAILED",
      error.message || "Failed to load provisioning intent.",
    );
  }

  return data ? mapIntentRow(data as IntentRow) : null;
}

async function loadProvisioningIntentByEmail(
  email: string,
): Promise<LicenseeProspectClientProvisioningIntent | null> {
  const { data, error } = await supabaseAdmin
    .from("licensee_prospect_client_provisioning_intents")
    .select(INTENT_SELECT)
    .eq("intended_client_account_email", normalizeEmailAddress(email))
    .maybeSingle();

  if (error) {
    throw new LicenseeProspectClientConversionError(
      "INTENT_LOOKUP_FAILED",
      error.message || "Failed to load provisioning intent by email.",
    );
  }

  return data ? mapIntentRow(data as IntentRow) : null;
}

function assertIntentCompatible(
  intent: LicenseeProspectClientProvisioningIntent,
  expected: {
    sourceOrganizationId: string;
    licenseeAccountId: string;
    intendedClientAccountEmail?: string;
  },
): void {
  if (
    intent.sourceOrganizationId !== expected.sourceOrganizationId ||
    intent.licenseeAccountId !== expected.licenseeAccountId
  ) {
    throw new LicenseeProspectClientConversionError(
      "CONFLICTING_PROVISIONING_INTENT",
      "Existing provisioning intent does not match this Licensee or source organization.",
    );
  }

  if (
    expected.intendedClientAccountEmail &&
    intent.intendedClientAccountEmail !==
      normalizeEmailAddress(expected.intendedClientAccountEmail)
  ) {
    throw new LicenseeProspectClientConversionError(
      "CONFLICTING_PROVISIONING_INTENT",
      "Existing provisioning intent reserved a different client account identity.",
    );
  }

  if (!isGetoblicProvisionalAccountEmail(intent.intendedClientAccountEmail)) {
    throw new LicenseeProspectClientConversionError(
      "INVALID_PROVISIONING_IDENTITY",
      "Stored provisioning intent email is not a valid provisional identity.",
    );
  }
}

async function insertProvisioningIntent(input: {
  prospectId: string;
  sourceOrganizationId: string;
  licenseeAccountId: string;
  intendedClientAccountEmail: string;
  createdByUserId: string;
}): Promise<LicenseeProspectClientProvisioningIntent> {
  const email = normalizeEmailAddress(input.intendedClientAccountEmail);
  const { data, error } = await supabaseAdmin
    .from("licensee_prospect_client_provisioning_intents")
    .insert({
      prospect_id: input.prospectId,
      source_organization_id: input.sourceOrganizationId,
      licensee_account_id: input.licenseeAccountId,
      intended_client_account_email: email,
      created_by_user_id: input.createdByUserId,
    })
    .select(INTENT_SELECT)
    .single();

  if (!error && data) {
    return mapIntentRow(data as IntentRow);
  }

  if (error?.code === "23505") {
    const byProspect = await loadProvisioningIntentByProspectId(input.prospectId);
    if (byProspect) {
      assertIntentCompatible(byProspect, {
        sourceOrganizationId: input.sourceOrganizationId,
        licenseeAccountId: input.licenseeAccountId,
        intendedClientAccountEmail: email,
      });
      return byProspect;
    }

    const byEmail = await loadProvisioningIntentByEmail(email);
    if (byEmail && byEmail.prospectId !== input.prospectId) {
      throw new LicenseeProspectClientConversionError(
        "EMAIL_COLLISION",
        "The generated provisional login identity is already reserved by another Prospect.",
      );
    }
  }

  throw new LicenseeProspectClientConversionError(
    "INTENT_WRITE_FAILED",
    error?.message || "Failed to write the provisioning intent.",
  );
}

/**
 * Create the first-provision reservation, or continue the stored one.
 * Must run before createLicenseeSubAccount.
 */
async function reserveProvisioningIntent(input: {
  prospectId: string;
  sourceOrganizationId: string;
  licenseeAccountId: string;
  intendedClientAccountEmail: string;
  createdByUserId: string;
}): Promise<LicenseeProspectClientProvisioningIntent> {
  const email = normalizeEmailAddress(input.intendedClientAccountEmail);
  const existing = await loadProvisioningIntentByProspectId(input.prospectId);
  if (existing) {
    assertIntentCompatible(existing, {
      sourceOrganizationId: input.sourceOrganizationId,
      licenseeAccountId: input.licenseeAccountId,
      intendedClientAccountEmail: email,
    });
    return existing;
  }

  return insertProvisioningIntent({
    ...input,
    intendedClientAccountEmail: email,
  });
}

async function consumeProvisioningIntent(prospectId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("licensee_prospect_client_provisioning_intents")
    .delete()
    .eq("prospect_id", prospectId);

  if (error) {
    throw new LicenseeProspectClientConversionError(
      "INTENT_CLEANUP_FAILED",
      error.message || "Failed to consume the provisioning intent.",
    );
  }
}

/**
 * Conversion is authoritative. Cleanup failure must not fail a successful
 * conversion or an already-active idempotent return.
 */
async function tryConsumeProvisioningIntent(prospectId: string): Promise<void> {
  try {
    await consumeProvisioningIntent(prospectId);
  } catch {
    // Durable conversion exists (or is about to be returned). Intent is stale.
  }
}

async function loadOwnerMemberships(userId: string): Promise<
  Array<{ organizationId: string; role: string }>
> {
  const { data, error } = await supabaseAdmin
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", userId);

  if (error) {
    throw new LicenseeProspectClientConversionError(
      "MEMBERSHIP_LOOKUP_FAILED",
      error.message || "Could not resolve existing account membership.",
    );
  }

  return (data ?? [])
    .filter((row) => typeof row.organization_id === "string")
    .map((row) => ({
      organizationId: row.organization_id as string,
      role: String(row.role || ""),
    }));
}

async function loadLicenseeRelationshipsForOrganization(
  organizationId: string,
): Promise<LicenseeRelationshipRow[]> {
  const { data, error } = await supabaseAdmin
    .from("licensee_sub_accounts")
    .select("id, licensee_account_id, organization_id")
    .eq("organization_id", organizationId);

  if (error) {
    throw new LicenseeProspectClientConversionError(
      "LICENSEE_RELATIONSHIP_LOOKUP_FAILED",
      error.message || "Failed to resolve Licensee relationships for the organization.",
    );
  }

  return (data ?? []) as LicenseeRelationshipRow[];
}

async function classifyClientAccountEmail(input: {
  email: string;
  prospectId: string;
  reservedClientOrganizationId: string | null;
}): Promise<EmailClassification> {
  const email = normalizeEmailAddress(input.email);
  const existingConversion = await loadConversionByClientAccountEmail(email);

  if (existingConversion) {
    if (existingConversion.prospectId === input.prospectId) {
      return "reuse";
    }
    return "unrelated";
  }

  const reservingIntent = await loadProvisioningIntentByEmail(email);
  if (reservingIntent) {
    if (reservingIntent.prospectId === input.prospectId) {
      return "reuse";
    }
    return "unrelated";
  }

  const authUser = await findAuthUserByEmail(email);
  if (!authUser) {
    return "available";
  }

  const memberships = await loadOwnerMemberships(authUser.id);
  if (memberships.length === 0) {
    // Retry after auth-user create, before organization provision.
    return "available";
  }

  if (
    input.reservedClientOrganizationId &&
    memberships.length === 1 &&
    memberships[0].organizationId === input.reservedClientOrganizationId
  ) {
    return "reuse";
  }

  return "unrelated";
}

async function resolveSafeClientAccountEmail(input: {
  businessName: string;
  prospectId: string;
  licenseeMasterEmail: string;
}): Promise<string> {
  const candidates = buildProvisionalClientAccountEmailCandidates({
    businessName: input.businessName,
    prospectId: input.prospectId,
  });
  const masterEmail = normalizeEmailAddress(input.licenseeMasterEmail);

  const primaryBlockedByMaster = candidates.primary === masterEmail;
  if (!primaryBlockedByMaster) {
    const primaryClass = await classifyClientAccountEmail({
      email: candidates.primary,
      prospectId: input.prospectId,
      reservedClientOrganizationId: null,
    });
    if (primaryClass === "available" || primaryClass === "reuse") {
      return candidates.primary;
    }
  }

  if (candidates.fallback === masterEmail) {
    throw new LicenseeProspectClientConversionError(
      "EMAIL_COLLISION",
      "The generated provisional login identity is already used by an unrelated tenant.",
    );
  }

  const fallbackClass = await classifyClientAccountEmail({
    email: candidates.fallback,
    prospectId: input.prospectId,
    reservedClientOrganizationId: null,
  });
  if (fallbackClass === "available" || fallbackClass === "reuse") {
    return candidates.fallback;
  }

  throw new LicenseeProspectClientConversionError(
    "EMAIL_COLLISION",
    "The generated provisional login identity is already used by an unrelated tenant.",
  );
}

async function resolveIntendedClientAccountEmail(input: {
  prospectId: string;
  sourceOrganizationId: string;
  licenseeAccountId: string;
  licenseeMasterEmail: string;
  businessName: string;
  existingIntent: LicenseeProspectClientProvisioningIntent | null;
}): Promise<string> {
  if (input.existingIntent) {
    assertIntentCompatible(input.existingIntent, {
      sourceOrganizationId: input.sourceOrganizationId,
      licenseeAccountId: input.licenseeAccountId,
    });
    return input.existingIntent.intendedClientAccountEmail;
  }

  const selected = await resolveSafeClientAccountEmail({
    businessName: input.businessName,
    prospectId: input.prospectId,
    licenseeMasterEmail: input.licenseeMasterEmail,
  });

  if (!isGetoblicProvisionalAccountEmail(selected)) {
    throw new LicenseeProspectClientConversionError(
      "INVALID_PROVISIONING_IDENTITY",
      "Generated provisional login identity is not valid.",
    );
  }

  return selected;
}

async function reserveSelectedProvisioningIntent(input: {
  prospectId: string;
  sourceOrganizationId: string;
  licenseeAccountId: string;
  createdByUserId: string;
  businessName: string;
  selectedEmail: string;
}): Promise<LicenseeProspectClientProvisioningIntent> {
  try {
    return await reserveProvisioningIntent({
      prospectId: input.prospectId,
      sourceOrganizationId: input.sourceOrganizationId,
      licenseeAccountId: input.licenseeAccountId,
      intendedClientAccountEmail: input.selectedEmail,
      createdByUserId: input.createdByUserId,
    });
  } catch (error) {
    if (
      !(error instanceof LicenseeProspectClientConversionError) ||
      error.code !== "EMAIL_COLLISION"
    ) {
      throw error;
    }

    const candidates = buildProvisionalClientAccountEmailCandidates({
      businessName: input.businessName,
      prospectId: input.prospectId,
    });
    if (input.selectedEmail !== candidates.primary) {
      throw error;
    }

    const fallbackClass = await classifyClientAccountEmail({
      email: candidates.fallback,
      prospectId: input.prospectId,
      reservedClientOrganizationId: null,
    });
    if (fallbackClass !== "available" && fallbackClass !== "reuse") {
      throw error;
    }

    return reserveProvisioningIntent({
      prospectId: input.prospectId,
      sourceOrganizationId: input.sourceOrganizationId,
      licenseeAccountId: input.licenseeAccountId,
      intendedClientAccountEmail: candidates.fallback,
      createdByUserId: input.createdByUserId,
    });
  }
}

function irreconcilable(
  code: string,
  message: string,
): PartialProvisionClassification {
  return {
    kind: "irreconcilable",
    error: new LicenseeProspectClientConversionError(code, message),
  };
}

/**
 * Recover a tenant that this Prospect already partially provisioned.
 * Same-Licensee membership alone is never enough — the durable intent
 * plus structural checks are required.
 */
async function classifyRecoverablePartialProvision(input: {
  prospectId: string;
  sourceOrganizationId: string;
  licenseeAccount: LicenseeAccount;
  intendedEmail: string;
}): Promise<PartialProvisionClassification> {
  const authUser = await findAuthUserByEmail(input.intendedEmail);
  if (!authUser) {
    return { kind: "needs_provision" };
  }

  const memberships = await loadOwnerMemberships(authUser.id);
  if (memberships.length === 0) {
    // Existing retry-after-auth-create path. Continue with the same email.
    return { kind: "needs_provision" };
  }

  if (memberships.length !== 1 || memberships[0].role !== "owner") {
    return irreconcilable(
      "UNSAFE_MEMBERSHIP",
      "Intended identity has an unsafe or ambiguous organization membership and cannot be recovered.",
    );
  }

  const organizationId = memberships[0].organizationId;
  if (
    organizationId === input.sourceOrganizationId ||
    organizationId === input.licenseeAccount.own_company_organization_id
  ) {
    return irreconcilable(
      "OWN_COMPANY_CANNOT_ATTACH",
      "Intended identity resolves to the Licensee Own Company and cannot be recovered as a client tenant.",
    );
  }

  const { data: organization, error: organizationError } = await supabaseAdmin
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .maybeSingle();

  if (organizationError || !organization?.id) {
    return irreconcilable(
      "UNSAFE_PARTIAL_PROVISION",
      "Intended identity membership does not resolve to a usable client organization.",
    );
  }

  const relationships = await loadLicenseeRelationshipsForOrganization(
    organizationId,
  );
  if (relationships.length === 0) {
    return irreconcilable(
      "UNSAFE_PARTIAL_PROVISION",
      "Partially provisioned client organization has no Licensee relationship and cannot be recovered safely.",
    );
  }

  if (relationships.length > 1) {
    return irreconcilable(
      "AMBIGUOUS_LICENSEE_RELATIONSHIP",
      "Intended client organization is related to multiple Licensees.",
    );
  }

  if (relationships[0].licensee_account_id !== input.licenseeAccount.id) {
    return irreconcilable(
      "OTHER_LICENSEE",
      "Intended identity belongs to a client organization of another Licensee.",
    );
  }

  const existingForOrg = await loadConversionByClientOrganizationId(
    organizationId,
  );
  if (existingForOrg && existingForOrg.prospectId !== input.prospectId) {
    return irreconcilable(
      "CONFLICTING_CONVERSION",
      "Intended client organization is already bound to another Prospect conversion.",
    );
  }

  return {
    kind: "recoverable",
    organizationId,
    relationshipId: String(relationships[0].id),
  };
}

async function lookupRelationshipId(input: {
  licenseeAccountId: string;
  organizationId: string;
}): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("licensee_sub_accounts")
    .select("id")
    .eq("licensee_account_id", input.licenseeAccountId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  if (error || !data?.id) {
    throw new LicenseeProspectClientConversionError(
      "RELATIONSHIP_LOOKUP_FAILED",
      error?.message || "Licensee relationship could not be resolved after provisioning.",
    );
  }

  return String(data.id);
}

/**
 * Promotion write-authority: resolve the Licensee from the trusted Own
 * Company organization, then validate the existing relationship, then
 * require the internally resolved Master. The acting tenant user is never
 * treated as Master.
 */
async function resolvePromotionOwnCompanyLicenseeContext(input: {
  sourceOrganizationId: string;
}): Promise<{
  licenseeAccount: LicenseeAccount;
  sourceRelationshipId: string;
  resolvedMasterUserId: string;
}> {
  const designatedAccounts = await getLicenseeAccountsByOwnCompanyOrganizationId(
    input.sourceOrganizationId,
  );

  if (designatedAccounts.length === 0) {
    throw new LicenseeProspectClientConversionError(
      "SOURCE_NOT_OWN_COMPANY",
      "Prospect conversion is permitted only from the Licensee Own Company organization.",
    );
  }

  if (designatedAccounts.length > 1) {
    throw new LicenseeProspectClientConversionError(
      "AMBIGUOUS_OWN_COMPANY_LICENSEE",
      "Source organization is designated as Own Company for more than one Licensee.",
    );
  }

  const designated = designatedAccounts[0];
  const sourceRelationshipId = await requireExistingOwnCompanyRelationship({
    sourceOrganizationId: input.sourceOrganizationId,
    licenseeAccountId: designated.id,
  });

  const resolvedMaster = await requireLicenseeMasterAccount(designated.user_id);
  if (resolvedMaster.id !== designated.id) {
    throw new LicenseeProspectClientConversionError(
      "WRONG_LICENSEE",
      "Resolved Licensee Master does not match the designated Own Company Licensee.",
    );
  }

  return {
    licenseeAccount: resolvedMaster,
    sourceRelationshipId,
    resolvedMasterUserId: resolvedMaster.user_id,
  };
}

async function requireExistingOwnCompanyRelationship(input: {
  sourceOrganizationId: string;
  licenseeAccountId: string;
}): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("licensee_sub_accounts")
    .select("id, licensee_account_id, organization_id")
    .eq("organization_id", input.sourceOrganizationId);

  if (error) {
    throw new LicenseeProspectClientConversionError(
      "LICENSEE_RELATIONSHIP_LOOKUP_FAILED",
      error.message || "Failed to resolve Licensee relationship for the source organization.",
    );
  }

  const relationships = data ?? [];
  if (relationships.length === 0) {
    throw new LicenseeProspectClientConversionError(
      "MISSING_LICENSEE_RELATIONSHIP",
      "Source organization has no Licensee relationship.",
    );
  }

  if (relationships.length > 1) {
    throw new LicenseeProspectClientConversionError(
      "AMBIGUOUS_LICENSEE_RELATIONSHIP",
      "Source organization has an ambiguous Licensee relationship.",
    );
  }

  const relationship = relationships[0];
  if (relationship.licensee_account_id !== input.licenseeAccountId) {
    throw new LicenseeProspectClientConversionError(
      "WRONG_LICENSEE",
      "Source organization relationship does not belong to the designated Own Company Licensee.",
    );
  }

  return String(relationship.id);
}

/**
 * Reversal write-authority: authenticated Master remains the caller.
 * Do not use this path for Prospect-page tenant promotion.
 */
async function resolveOwnCompanyLicenseeContext(input: {
  sourceOrganizationId: string;
  masterUserId: string;
}): Promise<{
  licenseeAccount: LicenseeAccount;
  sourceRelationshipId: string;
}> {
  const licenseeAccount = await requireLicenseeMasterAccount(input.masterUserId);

  const { data, error } = await supabaseAdmin
    .from("licensee_sub_accounts")
    .select("id, licensee_account_id, organization_id")
    .eq("organization_id", input.sourceOrganizationId);

  if (error) {
    throw new LicenseeProspectClientConversionError(
      "LICENSEE_RELATIONSHIP_LOOKUP_FAILED",
      error.message || "Failed to resolve Licensee relationship for the source organization.",
    );
  }

  const relationships = data ?? [];
  if (relationships.length === 0) {
    throw new LicenseeProspectClientConversionError(
      "PLAIN_TENANT",
      "Source organization is not a Licensee Own Company.",
    );
  }

  if (relationships.length > 1) {
    throw new LicenseeProspectClientConversionError(
      "AMBIGUOUS_LICENSEE_RELATIONSHIP",
      "Source organization has an ambiguous Licensee relationship.",
    );
  }

  const relationship = relationships[0];
  if (relationship.licensee_account_id !== licenseeAccount.id) {
    throw new LicenseeProspectClientConversionError(
      "WRONG_LICENSEE",
      "Source organization does not belong to this Licensee Master.",
    );
  }

  if (
    !licenseeAccount.own_company_organization_id ||
    licenseeAccount.own_company_organization_id !== input.sourceOrganizationId
  ) {
    throw new LicenseeProspectClientConversionError(
      "SOURCE_NOT_OWN_COMPANY",
      "Prospect conversion is permitted only from the Licensee Own Company organization.",
    );
  }

  return {
    licenseeAccount,
    sourceRelationshipId: String(relationship.id),
  };
}

async function insertActiveConversion(input: {
  prospectId: string;
  sourceOrganizationId: string;
  clientOrganizationId: string;
  licenseeAccountId: string;
  licenseeSubAccountId: string;
  clientAccountEmail: string;
  convertedByUserId: string;
}): Promise<LicenseeProspectClientConversion> {
  const timestamp = nowIso();
  const { data, error } = await supabaseAdmin
    .from("licensee_prospect_client_conversions")
    .insert({
      prospect_id: input.prospectId,
      source_organization_id: input.sourceOrganizationId,
      client_organization_id: input.clientOrganizationId,
      licensee_account_id: input.licenseeAccountId,
      licensee_sub_account_id: input.licenseeSubAccountId,
      status: "active",
      client_account_email: normalizeEmailAddress(input.clientAccountEmail),
      converted_at: timestamp,
      converted_by_user_id: input.convertedByUserId,
      restored_at: null,
      restored_by_user_id: null,
      created_at: timestamp,
      updated_at: timestamp,
    })
    .select(CONVERSION_SELECT)
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      const existing = await loadConversionByProspectId(input.prospectId);
      if (existing?.status === "active") {
        return existing;
      }
    }
    throw new LicenseeProspectClientConversionError(
      "CONVERSION_WRITE_FAILED",
      error?.message || "Failed to write the active conversion.",
    );
  }

  return mapConversionRow(data as ConversionRow);
}

async function reactivateConversion(input: {
  conversionId: string;
  licenseeSubAccountId: string;
  convertedByUserId: string;
}): Promise<LicenseeProspectClientConversion> {
  const { data, error } = await supabaseAdmin
    .from("licensee_prospect_client_conversions")
    .update({
      status: "active",
      licensee_sub_account_id: input.licenseeSubAccountId,
      converted_by_user_id: input.convertedByUserId,
      restored_at: null,
      restored_by_user_id: null,
      updated_at: nowIso(),
    })
    .eq("id", input.conversionId)
    .select(CONVERSION_SELECT)
    .single();

  if (error || !data) {
    throw new LicenseeProspectClientConversionError(
      "CONVERSION_WRITE_FAILED",
      error?.message || "Failed to reactivate the conversion.",
    );
  }

  return mapConversionRow(data as ConversionRow);
}

async function markConversionReversed(input: {
  conversionId: string;
  restoredByUserId: string;
}): Promise<LicenseeProspectClientConversion> {
  const timestamp = nowIso();
  const { data, error } = await supabaseAdmin
    .from("licensee_prospect_client_conversions")
    .update({
      status: "reversed",
      licensee_sub_account_id: null,
      restored_at: timestamp,
      restored_by_user_id: input.restoredByUserId,
      updated_at: timestamp,
    })
    .eq("id", input.conversionId)
    .select(CONVERSION_SELECT)
    .single();

  if (error || !data) {
    throw new LicenseeProspectClientConversionError(
      "CONVERSION_WRITE_FAILED",
      error?.message || "Failed to mark the conversion reversed.",
    );
  }

  return mapConversionRow(data as ConversionRow);
}

async function provisionClientSubAccount(input: {
  masterUserId: string;
  businessName: string;
  accountEmail: string;
  confirmLinkExisting: boolean;
}): Promise<{ organizationId: string; authUserCreated: boolean }> {
  try {
    const result = await createLicenseeSubAccount({
      masterUserId: input.masterUserId,
      businessName: input.businessName,
      accountEmail: input.accountEmail,
      confirmLinkExisting: input.confirmLinkExisting,
    });
    return {
      organizationId: result.organizationId,
      authUserCreated: result.authUserCreated,
    };
  } catch (error) {
    if (error instanceof LicenseeSubAccountCreateError) {
      throw error;
    }
    const message =
      error instanceof Error ? error.message : "Sub-account provisioning failed.";
    throw new LicenseeProspectClientConversionError(
      "PROVISIONING_FAILED",
      message,
    );
  }
}

function mapProvisioningIdentityError(
  error: LicenseeSubAccountCreateError,
): LicenseeProspectClientConversionError {
  if (
    error.code === "INVALID_EMAIL" ||
    error.code === "MASTER_EMAIL_REJECTED" ||
    error.code === "SUPER_ADMIN_EMAIL_REJECTED"
  ) {
    return new LicenseeProspectClientConversionError(
      "INVALID_PROVISIONING_IDENTITY",
      error.message,
    );
  }
  return new LicenseeProspectClientConversionError(
    "PROVISIONING_FAILED",
    error.message,
  );
}

/**
 * Provision only after the intent is durable. Never switch emails here —
 * the reserved intended identity is authoritative for this Prospect.
 */
async function provisionAfterReservedIntent(input: {
  masterUserId: string;
  businessName: string;
  accountEmail: string;
  prospectId: string;
  sourceOrganizationId: string;
  licenseeAccount: LicenseeAccount;
}): Promise<{ organizationId: string; accountEmail: string }> {
  try {
    const result = await provisionClientSubAccount({
      masterUserId: input.masterUserId,
      businessName: input.businessName,
      accountEmail: input.accountEmail,
      confirmLinkExisting: false,
    });
    return {
      organizationId: result.organizationId,
      accountEmail: input.accountEmail,
    };
  } catch (error) {
    const raced = await loadConversionByProspectId(input.prospectId);
    if (raced?.status === "active") {
      return {
        organizationId: raced.clientOrganizationId,
        accountEmail: raced.clientAccountEmail,
      };
    }

    if (
      error instanceof LicenseeSubAccountCreateError &&
      error.code === "EXISTING_ACCOUNT_REQUIRES_CONFIRMATION"
    ) {
      const recovered = await classifyRecoverablePartialProvision({
        prospectId: input.prospectId,
        sourceOrganizationId: input.sourceOrganizationId,
        licenseeAccount: input.licenseeAccount,
        intendedEmail: input.accountEmail,
      });
      if (recovered.kind === "recoverable") {
        return {
          organizationId: recovered.organizationId,
          accountEmail: input.accountEmail,
        };
      }
      if (recovered.kind === "irreconcilable") {
        throw recovered.error;
      }
      throw new LicenseeProspectClientConversionError(
        "EMAIL_COLLISION",
        "The generated provisional login identity is already used by an unrelated tenant.",
      );
    }

    if (error instanceof LicenseeSubAccountCreateError) {
      throw mapProvisioningIdentityError(error);
    }
    throw error;
  }
}

async function reattachStoredClient(input: {
  masterUserId: string;
  licenseeAccountId: string;
  businessName: string;
  conversion: LicenseeProspectClientConversion;
}): Promise<string> {
  const storedEmail = normalizeEmailAddress(input.conversion.clientAccountEmail);
  if (!isGetoblicProvisionalAccountEmail(storedEmail)) {
    throw new LicenseeProspectClientConversionError(
      "INVALID_PROVISIONING_IDENTITY",
      "Stored client account email is not a valid provisional identity.",
    );
  }

  const existingRelationshipId = await supabaseAdmin
    .from("licensee_sub_accounts")
    .select("id")
    .eq("licensee_account_id", input.licenseeAccountId)
    .eq("organization_id", input.conversion.clientOrganizationId)
    .maybeSingle()
    .then(({ data, error }) => {
      if (error) {
        throw new LicenseeProspectClientConversionError(
          "RELATIONSHIP_LOOKUP_FAILED",
          error.message || "Failed to look up the stored client relationship.",
        );
      }
      return data?.id ? String(data.id) : null;
    });

  if (existingRelationshipId) {
    return existingRelationshipId;
  }

  const classification = await classifyClientAccountEmail({
    email: storedEmail,
    prospectId: input.conversion.prospectId,
    reservedClientOrganizationId: input.conversion.clientOrganizationId,
  });
  if (classification === "unrelated") {
    throw new LicenseeProspectClientConversionError(
      "EMAIL_COLLISION",
      "Stored provisional identity now belongs to an unrelated tenant.",
    );
  }

  try {
    const result = await provisionClientSubAccount({
      masterUserId: input.masterUserId,
      businessName: input.businessName,
      accountEmail: storedEmail,
      confirmLinkExisting: true,
    });
    if (result.organizationId !== input.conversion.clientOrganizationId) {
      throw new LicenseeProspectClientConversionError(
        "CLIENT_ORGANIZATION_MISMATCH",
        "Re-conversion would attach a different organization than the stored client tenant.",
      );
    }
  } catch (error) {
    if (error instanceof LicenseeProspectClientConversionError) {
      throw error;
    }
    if (
      error instanceof LicenseeSubAccountCreateError &&
      error.code === "DUPLICATE_RELATIONSHIP"
    ) {
      return lookupRelationshipId({
        licenseeAccountId: input.licenseeAccountId,
        organizationId: input.conversion.clientOrganizationId,
      });
    }
    if (error instanceof LicenseeSubAccountCreateError) {
      throw mapProvisioningIdentityError(error);
    }
    throw error;
  }

  return lookupRelationshipId({
    licenseeAccountId: input.licenseeAccountId,
    organizationId: input.conversion.clientOrganizationId,
  });
}

async function finishFirstConversion(input: {
  prospectId: string;
  sourceOrganizationId: string;
  clientOrganizationId: string;
  licenseeAccountId: string;
  clientAccountEmail: string;
  convertedByUserId: string;
}): Promise<LicenseeProspectClientConversion> {
  const relationshipId = await lookupRelationshipId({
    licenseeAccountId: input.licenseeAccountId,
    organizationId: input.clientOrganizationId,
  });

  const conversion = await insertActiveConversion({
    prospectId: input.prospectId,
    sourceOrganizationId: input.sourceOrganizationId,
    clientOrganizationId: input.clientOrganizationId,
    licenseeAccountId: input.licenseeAccountId,
    licenseeSubAccountId: relationshipId,
    clientAccountEmail: input.clientAccountEmail,
    convertedByUserId: input.convertedByUserId,
  });

  await tryConsumeProvisioningIntent(input.prospectId);
  return conversion;
}

async function requireGetOblicOwnershipForConversion(
  prospect: { id: string; raw_json?: Record<string, unknown> | null },
  organizationId: string,
): Promise<void> {
  if (!isGetOblicDerivedProspect(prospect)) {
    return;
  }

  const owned = await organizationOwnsActiveGetOblicClaimForProspect(
    organizationId,
    prospect.id,
  );
  if (owned) {
    return;
  }

  throw new LicenseeProspectClientConversionError(
    "GETOBLIC_OWNERSHIP_REQUIRED",
    "This GetOblic Prospect cannot be converted because this organization no longer owns an active GetOblic listing claim.",
  );
}

/**
 * Convert an Own-Company Prospect into a Licensee-managed client.
 * Does not accept a Licensee-supplied login email. Does not use prospect.email.
 */
export async function promoteLicenseeProspectToClient(
  input: PromoteLicenseeProspectToClientInput,
): Promise<PromoteLicenseeProspectToClientResult> {
  const prospectId = input.prospectId.trim();
  const sourceOrganizationId = input.sourceOrganizationId.trim();
  const actingUserId = input.actingUserId.trim();

  if (!prospectId || !sourceOrganizationId || !actingUserId) {
    throw new LicenseeProspectClientConversionError(
      "INVALID_INPUT",
      "Prospect id, source organization, and acting user are required.",
    );
  }

  const prospect = await getProspectById(prospectId, sourceOrganizationId);
  if (!prospect) {
    throw new LicenseeProspectClientConversionError(
      "PROSPECT_NOT_FOUND",
      "Prospect does not exist in the source organization.",
    );
  }

  const { licenseeAccount, resolvedMasterUserId } =
    await resolvePromotionOwnCompanyLicenseeContext({
      sourceOrganizationId,
    });

  const existing = await loadConversionByProspectId(prospectId);
  if (existing) {
    if (existing.sourceOrganizationId !== sourceOrganizationId) {
      throw new LicenseeProspectClientConversionError(
        "ACTIVE_CONVERSION_ELSEWHERE",
        "This Prospect is already bound to a conversion in another source organization.",
      );
    }
    if (existing.licenseeAccountId !== licenseeAccount.id) {
      throw new LicenseeProspectClientConversionError(
        "WRONG_LICENSEE",
        "This Prospect conversion belongs to a different Licensee.",
      );
    }
    if (existing.status === "active") {
      await tryConsumeProvisioningIntent(prospectId);
      return toPromotionResult(existing, {
        alreadyActive: true,
        reattached: false,
      });
    }
  }

  await requireGetOblicOwnershipForConversion(prospect, sourceOrganizationId);

  if (existing) {

    const relationshipId = await reattachStoredClient({
      masterUserId: resolvedMasterUserId,
      licenseeAccountId: licenseeAccount.id,
      businessName: resolveClientOrganizationName(
        prospect.business_name,
        prospectId,
      ),
      conversion: existing,
    });

    const reactivated = await reactivateConversion({
      conversionId: existing.id,
      licenseeSubAccountId: relationshipId,
      convertedByUserId: actingUserId,
    });

    await tryConsumeProvisioningIntent(prospectId);
    return toPromotionResult(reactivated, {
      alreadyActive: false,
      reattached: true,
    });
  }

  const existingIntent = await loadProvisioningIntentByProspectId(prospectId);
  const intendedEmail = await resolveIntendedClientAccountEmail({
    prospectId,
    sourceOrganizationId,
    licenseeAccountId: licenseeAccount.id,
    licenseeMasterEmail: licenseeAccount.email,
    businessName: prospect.business_name,
    existingIntent,
  });

  const reservedIntent = await reserveSelectedProvisioningIntent({
    prospectId,
    sourceOrganizationId,
    licenseeAccountId: licenseeAccount.id,
    createdByUserId: actingUserId,
    businessName: prospect.business_name,
    selectedEmail: intendedEmail,
  });
  const reservedEmail = reservedIntent.intendedClientAccountEmail;

  const recovered = await classifyRecoverablePartialProvision({
    prospectId,
    sourceOrganizationId,
    licenseeAccount,
    intendedEmail: reservedEmail,
  });

  if (recovered.kind === "irreconcilable") {
    throw recovered.error;
  }

  if (recovered.kind === "recoverable") {
    const conversion = await finishFirstConversion({
      prospectId,
      sourceOrganizationId,
      clientOrganizationId: recovered.organizationId,
      licenseeAccountId: licenseeAccount.id,
      clientAccountEmail: reservedEmail,
      convertedByUserId: actingUserId,
    });
    return toPromotionResult(conversion, {
      alreadyActive: false,
      reattached: false,
    });
  }

  const provisioned = await provisionAfterReservedIntent({
    masterUserId: resolvedMasterUserId,
    businessName: resolveClientOrganizationName(
      prospect.business_name,
      prospectId,
    ),
    accountEmail: reservedEmail,
    prospectId,
    sourceOrganizationId,
    licenseeAccount,
  });

  const raced = await loadConversionByProspectId(prospectId);
  if (raced?.status === "active") {
    await tryConsumeProvisioningIntent(prospectId);
    return toPromotionResult(raced, {
      alreadyActive: true,
      reattached: false,
    });
  }

  const conversion = await finishFirstConversion({
    prospectId,
    sourceOrganizationId,
    clientOrganizationId: provisioned.organizationId,
    licenseeAccountId: licenseeAccount.id,
    clientAccountEmail: provisioned.accountEmail,
    convertedByUserId: actingUserId,
  });

  return toPromotionResult(conversion, {
    alreadyActive: false,
    reattached: false,
  });
}

/**
 * Detach the Licensee relationship only. Client org, auth user, membership,
 * and provisional identity remain for later reattachment.
 */
export async function reverseLicenseeProspectClientConversion(
  input: ReverseLicenseeProspectClientConversionInput,
): Promise<ReverseLicenseeProspectClientConversionResult> {
  const prospectId = input.prospectId.trim();
  const sourceOrganizationId = input.sourceOrganizationId.trim();
  const masterUserId = input.masterUserId.trim();

  if (!prospectId || !sourceOrganizationId || !masterUserId) {
    throw new LicenseeProspectClientConversionError(
      "INVALID_INPUT",
      "Prospect id, source organization, and Master user are required.",
    );
  }

  const { licenseeAccount } = await resolveOwnCompanyLicenseeContext({
    sourceOrganizationId,
    masterUserId,
  });

  const existing = await loadConversionByProspectId(prospectId);
  if (!existing) {
    throw new LicenseeProspectClientConversionError(
      "CONVERSION_NOT_FOUND",
      "No conversion exists for this Prospect.",
    );
  }

  if (existing.sourceOrganizationId !== sourceOrganizationId) {
    throw new LicenseeProspectClientConversionError(
      "WRONG_SOURCE_ORGANIZATION",
      "Conversion does not belong to this source organization.",
    );
  }

  if (existing.licenseeAccountId !== licenseeAccount.id) {
    throw new LicenseeProspectClientConversionError(
      "WRONG_LICENSEE",
      "This Prospect conversion belongs to a different Licensee.",
    );
  }

  if (existing.status === "reversed") {
    return {
      conversion: existing,
      clientOrganizationId: existing.clientOrganizationId,
      clientAccountEmail: existing.clientAccountEmail,
      alreadyReversed: true,
    };
  }

  if (
    licenseeAccount.own_company_organization_id &&
    existing.clientOrganizationId === licenseeAccount.own_company_organization_id
  ) {
    throw new LicenseeProspectClientConversionError(
      "OWN_COMPANY_CANNOT_DETACH",
      "Your company account cannot be detached from the Master dashboard.",
    );
  }

  if (existing.licenseeSubAccountId) {
    try {
      await removeLicenseeSubAccountRelationship({
        masterUserId,
        relationshipId: existing.licenseeSubAccountId,
        allowConversionManagedDetach: true,
      });
    } catch (error) {
      if (error instanceof LicenseeOwnCompanyError) {
        throw new LicenseeProspectClientConversionError(
          "OWN_COMPANY_CANNOT_DETACH",
          error.message,
        );
      }
      if (error instanceof LicenseeAccessError) {
        const stillThere = await supabaseAdmin
          .from("licensee_sub_accounts")
          .select("id")
          .eq("id", existing.licenseeSubAccountId)
          .maybeSingle();
        if (stillThere.data?.id) {
          throw new LicenseeProspectClientConversionError(
            "RELATIONSHIP_DETACH_FAILED",
            error.message,
          );
        }
      } else {
        throw error;
      }
    }
  }

  const reversed = await markConversionReversed({
    conversionId: existing.id,
    restoredByUserId: masterUserId,
  });

  return {
    conversion: reversed,
    clientOrganizationId: reversed.clientOrganizationId,
    clientAccountEmail: reversed.clientAccountEmail,
    alreadyReversed: false,
  };
}
