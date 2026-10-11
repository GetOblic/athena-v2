import type { Opportunity } from "@/services/opportunityService";
import type { AthenaReview } from "@/services/reviewService";

/**
 * Raw organization lists for a single Executive Brain Context build.
 * Absent collections were not loaded successfully and must be queried by the consumer.
 * Present collections, including empty arrays, are reused and must not be queried again.
 */
export type OrganizationReadSnapshot = {
  organizationId: string;
  opportunities?: Opportunity[];
  reviews?: AthenaReview[];
};

export function recordsBelongToOrganization<
  T extends { organization_id?: string | null },
>(records: readonly T[], organizationId: string): boolean {
  return records.every((record) => record.organization_id === organizationId);
}

export function matchingOrganizationReadSnapshot(
  organizationId: string,
  snapshot: OrganizationReadSnapshot | undefined,
): OrganizationReadSnapshot | undefined {
  if (!snapshot || snapshot.organizationId !== organizationId) {
    return undefined;
  }

  return snapshot;
}
