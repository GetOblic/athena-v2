/**
 * One-way Prospect → Client commercial identity handoff.
 *
 * After a client organization id exists, copy only blank commercial fields.
 * Does not write organizations.name, slug, language, brand, logo, or Brain.
 * Does not write athena_identity or the authentication email.
 * prospects.email maps to organizations.business_email only.
 *
 * A failed write must not roll back conversion. Callers catch and continue.
 * Retry is one fill-empty pass: already-filled fields are left alone.
 *
 * Requires the EST-QUOTE foundation columns. This module does not apply SQL.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildBlankCommercialIdentityFill } from "@/services/organization/commercialIdentity";
import { getOrganizationById } from "@/services/organizationService";

export const COMMERCIAL_IDENTITY_HYDRATION_FAILED =
  "COMMERCIAL_IDENTITY_HYDRATION_FAILED";

export type LicenseeProspectClientCommercialHydrationState =
  | "filled"
  | "noop"
  | "incomplete";

export async function hydrateLicenseeProspectClientCommercialIdentity(input: {
  clientOrganizationId: string;
  prospect: object | null | undefined;
}): Promise<LicenseeProspectClientCommercialHydrationState> {
  const clientOrganizationId = input.clientOrganizationId.trim();
  if (!clientOrganizationId) return "incomplete";

  const organization = await getOrganizationById(clientOrganizationId);
  if (!organization) return "incomplete";

  const fill = buildBlankCommercialIdentityFill(input.prospect, organization);
  if (Object.keys(fill).length === 0) return "noop";

  const { error } = await supabaseAdmin
    .from("organizations")
    .update({
      ...fill,
      updated_at: new Date().toISOString(),
    })
    .eq("id", clientOrganizationId);

  if (error) {
    throw new Error(error.message || "Could not hydrate commercial identity.");
  }

  return "filled";
}
