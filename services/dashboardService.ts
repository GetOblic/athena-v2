import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function countTable(table: string, organizationId: string) {
  const { count, error } = await supabaseAdmin
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  if (error) {
    console.error(`Error counting ${table}:`, error);
    return 0;
  }

  return count ?? 0;
}

export async function getDashboardStats(organizationId: string) {
  const [discussions, opportunities, briefings, assetBlueprints] =
    await Promise.all([
      countTable("discussions", organizationId),
      countTable("opportunities", organizationId),
      countTable("athena_reviews", organizationId),
      countTable("athena_asset_blueprints", organizationId),
    ]);

  return {
    discussions,
    opportunities,
    briefings,
    assetBlueprints,
  };
}
