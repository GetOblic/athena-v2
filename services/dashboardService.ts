import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function countTable(table: string, userId: string) {
  const { count, error } = await supabaseAdmin
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) {
    console.error(`Error counting ${table}:`, error);
    return 0;
  }

  return count ?? 0;
}

export async function getDashboardStats(userId: string) {
  const [discussions, opportunities, briefings, assetBlueprints] =
    await Promise.all([
      countTable("discussions", userId),
      countTable("opportunities", userId),
      countTable("athena_reviews", userId),
      countTable("athena_asset_blueprints", userId),
    ]);

  return {
    discussions,
    opportunities,
    briefings,
    assetBlueprints,
  };
}
