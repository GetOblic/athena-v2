import { createTenantScope, type TenantTable } from "@/lib/tenantDatabase";

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
