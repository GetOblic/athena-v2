/**
 * Neutral GetOblic provenance / active-claim reads for Prospect ↔ client
 * conversion. Licensee conversion must not import getoblicDirectory/*.
 */

import {
  GETOBLIC_PROSPECT_PROVENANCE_ORIGIN,
  readGetOblicListingIdentity,
} from "@/services/getoblicDirectory/getoblicDirectoryConvertService";
import { getActiveGetOblicLinkForProspect } from "@/services/getoblicDirectory/getoblicDirectoryService";

export function isGetOblicDerivedProspect(prospect: {
  raw_json?: Record<string, unknown> | null;
}): boolean {
  if (readGetOblicListingIdentity(prospect.raw_json) != null) {
    return true;
  }
  return prospect.raw_json?.origin === GETOBLIC_PROSPECT_PROVENANCE_ORIGIN;
}

export async function organizationOwnsActiveGetOblicClaimForProspect(
  organizationId: string,
  prospectId: string,
): Promise<boolean> {
  const active = await getActiveGetOblicLinkForProspect(
    organizationId,
    prospectId,
  );
  return active != null;
}
