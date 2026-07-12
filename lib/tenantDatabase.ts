import type { PostgrestFilterBuilder } from "@supabase/postgrest-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const TENANT_TABLES = [
  "communities",
  "discussions",
  "athena_discussion_analysis",
  "athena_discussion_updates",
  "opportunities",
  "athena_reviews",
  "athena_asset_blueprints",
  "athena_community_intelligence",
  "athena_production_intelligence",
  "knowledge_assets",
  "athena_identity",
  "knowledge_asset_links",
  "identity_documents",
  "prospects",
] as const;

export type TenantTable = (typeof TENANT_TABLES)[number];

type TenantQueryBuilder = {
  select: (
    columns?: string,
    options?: { count?: "exact"; head?: boolean },
  ) => PostgrestFilterBuilder<any, any, any, any[], TenantTable, unknown, "GET">;
  update: (
    values: Record<string, unknown>,
  ) => PostgrestFilterBuilder<any, any, any, null, TenantTable, unknown, "PATCH">;
  insert: (
    values: Record<string, unknown> | Record<string, unknown>[],
  ) => ReturnType<ReturnType<typeof supabaseAdmin.from>["insert"]>;
};

export type TenantScope = {
  organizationId: string;
  from: (table: TenantTable) => TenantQueryBuilder;
  insert: <T extends Record<string, unknown>>(
    table: TenantTable,
    row: T,
  ) => ReturnType<ReturnType<typeof supabaseAdmin.from>["insert"]>;
};

export function createTenantScope(organizationId: string): TenantScope {
  if (!organizationId.trim()) {
    throw new Error("Tenant scope requires a non-empty organizationId.");
  }

  return {
    organizationId,
    from(table: TenantTable): TenantQueryBuilder {
      return {
        select(columns = "*", options) {
          return supabaseAdmin
            .from(table)
            .select(columns, options)
            .eq("organization_id", organizationId);
        },
        update(values) {
          return supabaseAdmin
            .from(table)
            .update(values)
            .eq("organization_id", organizationId);
        },
        insert(values) {
          const rows = Array.isArray(values) ? values : [values];
          return supabaseAdmin.from(table).insert(
            rows.map((row) => ({
              ...row,
              organization_id: organizationId,
            })),
          );
        },
      };
    },
    insert<T extends Record<string, unknown>>(table: TenantTable, row: T) {
      return supabaseAdmin.from(table).insert({
        ...row,
        organization_id: organizationId,
      });
    },
  };
}

export function assertTenantRecord<T extends { organization_id?: string | null }>(
  record: T | null | undefined,
  organizationId: string,
): record is T & { organization_id: string } {
  return Boolean(record && record.organization_id === organizationId);
}
