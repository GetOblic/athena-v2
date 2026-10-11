/**
 * Server mode for GetOblic Directory acquisition.
 *
 * The current organization comes from the caller, which must be the
 * session organization. This module does not read cookies, browser flags,
 * or request body organization ids.
 *
 * licensee_own_company_unclaimed_getoblic_authorized(uuid) is the database
 * contract: true only for the single Own Company Licensee with
 * allow_unclaimed_getoblic_prospecting, one controlling relationship, and
 * an active Master.
 *
 * ordinary: the contract is false. Existing claim behavior remains.
 * unclaimed: the contract is true. Directory adds do not claim.
 * refused: the contract cannot be read as a boolean. Fail closed.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const LICENSEE_OWN_COMPANY_UNCLAIMED_GETOBLIC_AUTHORIZED_RPC =
  "licensee_own_company_unclaimed_getoblic_authorized" as const;

export type UnclaimedGetoblicDirectoryMode =
  | "ordinary"
  | "unclaimed"
  | "refused";

export async function resolveUnclaimedGetoblicDirectoryMode(
  organizationId: string,
): Promise<UnclaimedGetoblicDirectoryMode> {
  const id = organizationId.trim();
  if (!id) {
    return "refused";
  }

  const { data, error } = await supabaseAdmin.rpc(
    LICENSEE_OWN_COMPANY_UNCLAIMED_GETOBLIC_AUTHORIZED_RPC,
    { p_organization_id: id },
  );

  if (error) {
    console.error("Unclaimed GetOblic directory mode lookup failed:", error);
    return "refused";
  }
  if (data === true) {
    return "unclaimed";
  }
  if (data === false) {
    return "ordinary";
  }
  return "refused";
}
