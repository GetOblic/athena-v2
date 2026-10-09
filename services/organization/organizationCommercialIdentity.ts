/**
 * Persist organization commercial identity for the signed-in tenant.
 * Narrow payload: quotation contact fields only.
 * organizations.name stays the display name.
 * Website stays on athena_identity.website.
 * Logo, brand colors, font, language, and slug are not written here.
 *
 * Requires the EST-QUOTE foundation columns. Do not apply that migration
 * from this module.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  ORGANIZATION_COMMERCIAL_FIELDS,
  normalizeOptionalCommercialText,
  type OrganizationCommercialField,
  type OrganizationCommercialIdentityInput,
} from "@/services/organization/commercialIdentity";
import {
  getOrganizationById,
  type Organization,
} from "@/services/organizationService";

export class OrganizationCommercialIdentityNotFoundError extends Error {
  constructor(message = "Organization not found.") {
    super(message);
    this.name = "OrganizationCommercialIdentityNotFoundError";
  }
}

export type OrganizationCommercialIdentity = {
  organization_id: string;
  name: string;
} & Record<OrganizationCommercialField, string | null>;

function toOrganizationCommercialIdentity(
  organization: Organization,
): OrganizationCommercialIdentity {
  const identity = {
    organization_id: organization.id,
    name: organization.name,
  } as OrganizationCommercialIdentity;

  for (const field of ORGANIZATION_COMMERCIAL_FIELDS) {
    identity[field] = normalizeOptionalCommercialText(organization[field]);
  }

  return identity;
}

export async function getOrganizationCommercialIdentity(
  organizationId: string,
): Promise<OrganizationCommercialIdentity | null> {
  const organization = await getOrganizationById(organizationId);
  if (!organization) return null;
  return toOrganizationCommercialIdentity(organization);
}

/**
 * Replace submitted commercial fields on one already-authorized organization.
 * Callers must pass the session organization id. This function does not
 * resolve a Licensee Master to another tenant.
 */
export async function updateOrganizationCommercialIdentity(input: {
  organizationId: string;
} & OrganizationCommercialIdentityInput): Promise<OrganizationCommercialIdentity> {
  const organizationId = input.organizationId.trim();
  if (!organizationId) {
    throw new OrganizationCommercialIdentityNotFoundError();
  }

  const existing = await getOrganizationById(organizationId);
  if (!existing) {
    throw new OrganizationCommercialIdentityNotFoundError();
  }

  const payload: Record<string, string | null> = {};
  for (const field of ORGANIZATION_COMMERCIAL_FIELDS) {
    if (input[field] !== undefined) {
      payload[field] = normalizeOptionalCommercialText(input[field]);
    }
  }

  if (Object.keys(payload).length === 0) {
    return toOrganizationCommercialIdentity(existing);
  }

  const { data, error } = await supabaseAdmin
    .from("organizations")
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", organizationId)
    .select("*")
    .single();

  if (error || !data) {
    console.error("[COMMERCIAL_IDENTITY] organization_update_failed", error);
    throw new Error("Could not save business information.");
  }

  return toOrganizationCommercialIdentity(data as Organization);
}
