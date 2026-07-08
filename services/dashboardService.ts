import { dedupeBriefingsByOpportunity } from "@/lib/canonicalRecords";
import { createTenantScope, type TenantTable } from "@/lib/tenantDatabase";
import { getCanonicalOpportunities } from "@/services/opportunityService";
import { getReviews } from "@/services/reviewService";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

async function countCanonicalAssetBlueprints(organizationId: string) {
  const { data, error } = await supabaseAdmin
    .from("athena_asset_blueprints")
    .select("id, briefing_id, opportunity_id, discussion_id, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error counting asset blueprints:", error);
    return 0;
  }

  const seen = new Set<string>();

  for (const blueprint of data ?? []) {
    const key =
      blueprint.briefing_id ??
      blueprint.opportunity_id ??
      (blueprint.discussion_id
        ? `discussion:${blueprint.discussion_id}`
        : blueprint.id);
    seen.add(key);
  }

  return seen.size;
}

export async function getDashboardStats(organizationId: string) {
  const [discussions, opportunities, reviews, assetBlueprints] =
    await Promise.all([
      countTable("discussions", organizationId),
      getCanonicalOpportunities(organizationId),
      getReviews(organizationId),
      countCanonicalAssetBlueprints(organizationId),
    ]);

  const briefings = dedupeBriefingsByOpportunity(reviews).length;

  return {
    discussions,
    opportunities: opportunities.length,
    briefings,
    assetBlueprints,
  };
}
