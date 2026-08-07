import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  LicenseeMasterProvisionBlockedError,
  isLicenseeMasterUser,
} from "@/services/licensee/licenseeIdentity";
import {
  AccountAccessDeniedError,
  assertAccountAccessActive,
} from "@/services/superAdmin/accountAccessStatus";
import {
  SuperAdminAuthorityLookupError,
  SuperAdminProvisionBlockedError,
  isGetOblicSuperAdminUser,
} from "@/services/superAdmin/superAdminIdentity";

function isDocumentNavigationRequest(acceptHeader: string | null, secFetchDest: string | null): boolean {
  const dest = (secFetchDest || "").toLowerCase();
  if (dest === "document") {
    return true;
  }

  const accept = (acceptHeader || "").toLowerCase();
  return accept.includes("text/html") && !accept.includes("application/json");
}

export type Organization = {
  id: string;
  name: string;
  slug: string;
  /** Client Brand Identity — organization-level metadata only. */
  brand_logo_storage_path?: string | null;
  brand_profile_picture_storage_path?: string | null;
  brand_primary_color?: string | null;
  brand_secondary_color?: string | null;
  brand_accent_color?: string | null;
  brand_background_color?: string | null;
  brand_font?: string | null;
  /** Navigational Continue destinations — does not affect generation routing. */
  ai_workspace_preferences?: Record<string, unknown> | null;
  /** Most recent human workspace visit — operational metadata only. */
  last_visited_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type OrganizationContext = {
  organizationId: string;
  userId: string;
};

export class OrganizationAccessError extends Error {
  constructor(message = "Organization access denied.") {
    super(message);
    this.name = "OrganizationAccessError";
  }
}

export class OrganizationContextMissingError extends Error {
  constructor(message = "Missing organization context") {
    super(message);
    this.name = "OrganizationContextMissingError";
  }
}

function slugifyOrganizationName(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "workspace";
}

export type ProvisionTenantOptions = {
  /** Optional organization display name (Master Create Sub-account Business Name). */
  organizationName?: string | null;
};

async function createOrganizationForUser(
  userId: string,
  email?: string | null,
  options?: ProvisionTenantOptions,
): Promise<string> {
  const explicitName = options?.organizationName?.trim();
  const baseName =
    explicitName || email?.split("@")[0]?.trim() || "Workspace";
  const organizationName = explicitName || `${baseName}'s Organization`;
  const baseSlug = slugifyOrganizationName(baseName);
  const slug = `${baseSlug}-${userId.slice(0, 8)}`;

  const { data: organization, error: organizationError } = await supabaseAdmin
    .from("organizations")
    .insert({
      name: organizationName,
      slug,
    })
    .select("*")
    .single();

  if (organizationError || !organization) {
    throw new Error(
      organizationError?.message || "Failed to create organization.",
    );
  }

  const { error: memberError } = await supabaseAdmin
    .from("organization_members")
    .insert({
      organization_id: organization.id,
      user_id: userId,
      role: "owner",
    });

  if (memberError) {
    // Bounded internal rollback: only the organization created above.
    const { error: cleanupError } = await supabaseAdmin
      .from("organizations")
      .delete()
      .eq("id", organization.id);

    if (cleanupError) {
      console.error(
        "[ATHENA_PROVISION] membership insert failed and newly-created organization cleanup failed:",
        {
          leftoverOrganizationId: organization.id,
          userId,
          membershipError: memberError.message,
          cleanupError: cleanupError.message,
        },
      );
      throw new Error(
        `Organization membership could not be created and cleanup failed. leftoverOrganizationId=${organization.id}; membershipError=${memberError.message}; cleanupError=${cleanupError.message}`,
      );
    }

    throw new Error(memberError.message);
  }

  return organization.id;
}

export async function getOrganizationMembership(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching organization membership:", error);
    return null;
  }

  return data;
}

export type ProvisionTenantResult = {
  organizationId: string;
  /** True only when this call created a new organizations row. */
  organizationCreated: boolean;
};

/**
 * Provision or resolve tenant membership.
 * Distinguishes newly-created organization vs pre-existing membership.
 * Super Admin authority lookup failure fails closed (does not treat as ordinary).
 */
export async function provisionTenantForAuthenticatedUserDetailed(
  userId: string,
  email?: string | null,
  options?: ProvisionTenantOptions,
): Promise<ProvisionTenantResult> {
  const membership = await getOrganizationMembership(userId);

  if (membership?.organization_id) {
    return {
      organizationId: membership.organization_id,
      organizationCreated: false,
    };
  }

  // Master accounts own relationships only — never auto-create Athena orgs.
  if (await isLicenseeMasterUser(userId)) {
    throw new LicenseeMasterProvisionBlockedError();
  }

  // Super Admin accounts are a separate control plane — never auto-create Athena orgs.
  // Authority lookup errors propagate as SuperAdminAuthorityLookupError (fail closed).
  if (await isGetOblicSuperAdminUser(userId)) {
    throw new SuperAdminProvisionBlockedError();
  }

  const organizationId = await createOrganizationForUser(userId, email, options);
  return {
    organizationId,
    organizationCreated: true,
  };
}

export async function provisionTenantForAuthenticatedUser(
  userId: string,
  email?: string | null,
  options?: ProvisionTenantOptions,
): Promise<string> {
  const result = await provisionTenantForAuthenticatedUserDetailed(
    userId,
    email,
    options,
  );
  return result.organizationId;
}

export async function resolveOrganizationIdForUser(
  userId: string,
  email?: string | null,
  options?: ProvisionTenantOptions,
): Promise<string> {
  // Session-based org resolution must fail closed for deactivated accounts
  // before any provision/access of organization data.
  await assertAccountAccessActive(userId);
  return provisionTenantForAuthenticatedUser(userId, email, options);
}

export async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id ?? null;
}

export async function requireCurrentOrganizationId(): Promise<string> {
  const context = await requireCurrentOrganizationContext();
  return context.organizationId;
}

/**
 * Record a human visit to an Athena organization workspace.
 * Scoped to one organization id only — never touches other tenants.
 */
export async function touchOrganizationLastVisitedAt(
  organizationId: string,
): Promise<void> {
  const id = organizationId.trim();
  if (!id) {
    return;
  }

  const { error } = await supabaseAdmin
    .from("organizations")
    .update({ last_visited_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("Failed to update organization last_visited_at:", error);
  }
}

export async function requireCurrentOrganizationContext(): Promise<OrganizationContext> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    throw new OrganizationAccessError("Authentication required.");
  }

  const requestHeaders = await headers();
  const isDocumentNavigation = isDocumentNavigationRequest(
    requestHeaders.get("accept"),
    requestHeaders.get("sec-fetch-dest"),
  );

  // Existing-session fail-closed: deactivated Athena users cannot continue.
  try {
    await assertAccountAccessActive(user.id);
  } catch (error) {
    if (error instanceof AccountAccessDeniedError) {
      if (isDocumentNavigation) {
        redirect(
          `/login?message=${encodeURIComponent("This account has been deactivated.")}`,
        );
      }
      throw new OrganizationAccessError(error.message);
    }
    throw error;
  }

  try {
    if (await isGetOblicSuperAdminUser(user.id)) {
      // Super Admin sessions must not enter Athena tenant context.
      if (isDocumentNavigation) {
        redirect("/super");
      }
      throw new SuperAdminProvisionBlockedError();
    }
  } catch (error) {
    if (error instanceof SuperAdminAuthorityLookupError) {
      // Fail closed: authority lookup failure must not continue as ordinary Athena.
      throw new OrganizationAccessError(error.message);
    }
    throw error;
  }

  if (await isLicenseeMasterUser(user.id)) {
    // Master sessions must not enter Athena tenant context.
    // Document navigations redirect to the Master dashboard; API callers get 403.
    if (isDocumentNavigation) {
      redirect("/licensee");
    }
    throw new LicenseeMasterProvisionBlockedError();
  }

  const organizationId = await provisionTenantForAuthenticatedUser(
    user.id,
    user.email,
  );

  // Human HTML workspace entry only — skips API polling, handoff JSON, workers.
  if (isDocumentNavigation) {
    await touchOrganizationLastVisitedAt(organizationId);
  }

  return {
    organizationId,
    userId: user.id,
  };
}

export type IngestionOrganizationInput = {
  userId?: string | null;
  organizationId?: string | null;
  ingestionKey?: string | null;
};

function isValidOrganizationBoundIngestionKey(
  organizationId: string,
  ingestionKey: string,
): boolean {
  const expectedKey = process.env.ATHENA_INGESTION_KEY?.trim();
  const expectedOrgId = process.env.ATHENA_INGESTION_ORGANIZATION_ID?.trim();

  if (!expectedKey || !expectedOrgId) {
    return false;
  }

  return ingestionKey === expectedKey && organizationId === expectedOrgId;
}

export async function resolveOrganizationIdForIngestion(
  input: IngestionOrganizationInput,
): Promise<string> {
  if (input.userId) {
    await assertAccountAccessActive(input.userId);
    return provisionTenantForAuthenticatedUser(input.userId);
  }

  const organizationId = input.organizationId?.trim();
  const ingestionKey = input.ingestionKey?.trim();

  if (
    organizationId &&
    ingestionKey &&
    isValidOrganizationBoundIngestionKey(organizationId, ingestionKey)
  ) {
    const { data, error } = await supabaseAdmin
      .from("organizations")
      .select("id")
      .eq("id", organizationId)
      .maybeSingle();

    if (error || !data) {
      throw new OrganizationContextMissingError();
    }

    return organizationId;
  }

  throw new OrganizationContextMissingError();
}

export function belongsToOrganization<T extends { organization_id?: string | null }>(
  record: T | null | undefined,
  organizationId: string,
): record is T & { organization_id: string } {
  return Boolean(record && record.organization_id === organizationId);
}

/** Load a single organization by id. Returns null when missing. */
export async function getOrganizationById(
  organizationId: string,
): Promise<Organization | null> {
  const id = organizationId.trim();
  if (!id) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Error fetching organization:", error);
    return null;
  }

  return data as Organization | null;
}
