import { dedupeBriefingsByOpportunity } from "@/lib/canonicalRecords";
import { normalizeBriefingStatus } from "@/lib/briefingStatus";
import { createTenantScope, type TenantTable } from "@/lib/tenantDatabase";
import { getCanonicalBlueprintCount } from "@/services/assetBlueprints/assetBlueprintService";
import { getCanonicalOpportunities } from "@/services/opportunityService";
import { getReviews } from "@/services/reviewService";

async function countTable(table: TenantTable, organizationId: string) {
  const tenant = createTenantScope(organizationId);
  const { count, error } = await tenant
    .from(table)
    .select("*", { count: "exact", head: true });

  if (error) {
    console.error(`Error counting ${table}:`, error);
    return 0;
  }

  return count ?? 0;
}

export type DashboardStats = {
  discussions: number;
  opportunities: number;
  draftBriefings: number;
  approvedBriefings: number;
  strategicBlueprints: number;
};

export async function getDashboardStats(
  organizationId: string,
): Promise<DashboardStats> {
  const [discussions, opportunities, reviews, strategicBlueprints] =
    await Promise.all([
      countTable("discussions", organizationId),
      getCanonicalOpportunities(organizationId),
      getReviews(organizationId),
      getCanonicalBlueprintCount(organizationId),
    ]);

  const canonicalBriefings = dedupeBriefingsByOpportunity(reviews);
  const draftBriefings = canonicalBriefings.filter(
    (briefing) => normalizeBriefingStatus(briefing.status) === "draft",
  ).length;
  const approvedBriefings = canonicalBriefings.filter(
    (briefing) => normalizeBriefingStatus(briefing.status) === "approved",
  ).length;

  return {
    discussions,
    opportunities: opportunities.length,
    draftBriefings,
    approvedBriefings,
    strategicBlueprints,
  };
}
