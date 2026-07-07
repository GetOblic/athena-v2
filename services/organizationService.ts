import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const LIANA_DEMO_ORGANIZATION_ID =
  "a0000000-0000-4000-8000-000000000001";

export const LIANA_DEMO_ORGANIZATION_SLUG = "liana";

export type Organization = {
  id: string;
  name: string;
  slug: string;
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

export async function resolveOrganizationIdForUser(
  userId: string,
  email?: string | null,
): Promise<string> {
  const membership = await getOrganizationMembership(userId);

  if (membership?.organization_id) {
    return membership.organization_id;
  }

  return createOrganizationForUser(userId, email);
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

  const organizationId = await resolveOrganizationIdForUser(
    user.id,
    user.email,
  );

  return {
    organizationId,
    userId: user.id,
  };
}

export async function resolveOrganizationIdForIngestion(
  userId: string | null,
): Promise<string> {
  if (userId) {
    return resolveOrganizationIdForUser(userId);
  }

  return LIANA_DEMO_ORGANIZATION_ID;
}

export function belongsToOrganization<T extends { organization_id?: string | null }>(
  record: T | null | undefined,
  organizationId: string,
): record is T & { organization_id: string } {
  return Boolean(record && record.organization_id === organizationId);
}
