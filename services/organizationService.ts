import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

async function createOrganizationForUser(
  userId: string,
  email?: string | null,
): Promise<string> {
  const baseName = email?.split("@")[0]?.trim() || "Workspace";
  const baseSlug = slugifyOrganizationName(baseName);
  const slug = `${baseSlug}-${userId.slice(0, 8)}`;

  const { data: organization, error: organizationError } = await supabaseAdmin
    .from("organizations")
    .insert({
      name: `${baseName}'s Organization`,
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

export async function provisionTenantForAuthenticatedUser(
  userId: string,
  email?: string | null,
): Promise<string> {
  const membership = await getOrganizationMembership(userId);

  if (membership?.organization_id) {
    return membership.organization_id;
  }

  return createOrganizationForUser(userId, email);
}

export async function resolveOrganizationIdForUser(
  userId: string,
  email?: string | null,
): Promise<string> {
  return provisionTenantForAuthenticatedUser(userId, email);
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

export async function requireCurrentOrganizationContext(): Promise<OrganizationContext> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    throw new OrganizationAccessError("Authentication required.");
  }

  const organizationId = await provisionTenantForAuthenticatedUser(
    user.id,
    user.email,
  );

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
