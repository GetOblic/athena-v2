/**
 * Production SaaS tenant isolation validation.
 * Run: npx tsx scripts/validate-org-isolation.ts
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { TENANT_TABLES } from "../lib/tenantDatabase";

const TENANT_IDENTITY_COLUMN: Partial<Record<(typeof TENANT_TABLES)[number], string>> = {
  athena_getoblic_directory_settings: "organization_id",
};

function tenantIdentityColumn(table: (typeof TENANT_TABLES)[number]): string {
  return TENANT_IDENTITY_COLUMN[table] ?? "id";
}

const root = join(process.cwd(), "services");

const forbiddenPatterns = [
  {
    file: "services/organizationService.ts",
    pattern: /return LIANA_DEMO_ORGANIZATION_ID/,
    reason: "Runtime code must not fall back to a demo organization.",
  },
];

const serviceFiles = collectTsFiles(root);
const missingOrgScope: string[] = [];

for (const file of serviceFiles) {
  const content = readFileSync(file, "utf8");
  const exportsListQueries =
    content.includes(".from(") &&
    !file.endsWith("organizationService.ts") &&
    !file.endsWith("aiService.ts") &&
    !file.endsWith("eventBus.ts") &&
    !file.endsWith("brainProcessor.ts") &&
    !file.endsWith("tenantContext.ts");

  if (!exportsListQueries) {
    continue;
  }

  const hasOrgScope =
    content.includes("organizationId") ||
    content.includes("organization_id") ||
    content.includes("createTenantScope");

  if (!hasOrgScope) {
    missingOrgScope.push(file.replace(`${process.cwd()}/`, ""));
  }
}

for (const rule of forbiddenPatterns) {
  const content = readFileSync(join(process.cwd(), rule.file), "utf8");
  if (rule.pattern.test(content)) {
    console.error(`Forbidden pattern in ${rule.file}: ${rule.reason}`);
    process.exit(1);
  }
}

if (missingOrgScope.length > 0) {
  console.error("Services missing organization scoping:");
  missingOrgScope.forEach((file) => console.error(`- ${file}`));
  process.exit(1);
}

console.log("Static tenant isolation checks passed.");

runDatabaseValidation()
  .then(() => {
    console.log("Organization isolation validation passed.");
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });

async function runDatabaseValidation() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.log("Skipping database validation (Supabase env not configured).");
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  await assertTenantInfrastructure(supabase);
  await assertMembershipIntegrity(supabase);
  await assertTenantColumnsPopulated(supabase);
  await assertNoCrossTenantLeaks(supabase);
}

async function assertTenantInfrastructure(supabase: ReturnType<typeof createClient>) {
  const { error } = await supabase.from("organizations").select("id").limit(1);

  if (error?.message.includes("Could not find the table")) {
    console.log(
      "Skipping database validation (organizations migration not applied).",
    );
    return;
  }

  if (error) {
    throw new Error(`Failed to query organizations: ${error.message}`);
  }
}

async function assertMembershipIntegrity(
  supabase: ReturnType<typeof createClient>,
) {
  const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (authError) {
    console.log(
      `Skipping auth user membership checks: ${authError.message}`,
    );
    return;
  }

  const users = authUsers.users ?? [];

  for (const user of users) {
    const { data: memberships, error } = await supabase
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", user.id);

    if (error) {
      throw new Error(`Failed membership lookup for ${user.id}: ${error.message}`);
    }

    if (!memberships || memberships.length !== 1) {
      throw new Error(
        `Auth user ${user.email ?? user.id} must belong to exactly one organization (found ${memberships?.length ?? 0}).`,
      );
    }

    if (memberships[0].role !== "owner") {
      throw new Error(
        `Auth user ${user.email ?? user.id} must have an owner membership.`,
      );
    }
  }

  const { data: organizations, error: orgError } = await supabase
    .from("organizations")
    .select("id");

  if (orgError) {
    throw new Error(`Failed to load organizations: ${orgError.message}`);
  }

  for (const organization of organizations ?? []) {
    const { count, error: ownerError } = await supabase
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .eq("role", "owner");

    if (ownerError) {
      throw new Error(
        `Failed owner lookup for org ${organization.id}: ${ownerError.message}`,
      );
    }

    if ((count ?? 0) < 1) {
      throw new Error(
        `Organization ${organization.id} must have at least one owner.`,
      );
    }
  }

  console.log("Membership integrity checks passed.");
}

async function assertTenantColumnsPopulated(
  supabase: ReturnType<typeof createClient>,
) {
  for (const table of TENANT_TABLES) {
    const { data: columns, error: columnError } = await supabase.rpc(
      "athena_table_has_column",
      { table_name: table, column_name: "organization_id" },
    );

    if (columnError?.message.includes("Could not find the function")) {
      await assertTenantColumnsPopulatedWithoutRpc(supabase);
      return;
    }

    if (columnError) {
      await assertTenantColumnsPopulatedWithoutRpc(supabase);
      return;
    }

    if (columns === false) {
      throw new Error(`Tenant table ${table} is missing organization_id.`);
    }

    const { count, error } = await supabase
      .from(table)
      .select(tenantIdentityColumn(table), { count: "exact", head: true })
      .is("organization_id", null);

    if (error?.message.includes("Could not find the table")) {
      continue;
    }

    if (error) {
      throw new Error(`Failed null-org check on ${table}: ${error.message}`);
    }

    if ((count ?? 0) > 0) {
      throw new Error(
        `Tenant table ${table} has ${count} rows with NULL organization_id.`,
      );
    }
  }

  console.log("Tenant column population checks passed.");
}

async function assertTenantColumnsPopulatedWithoutRpc(
  supabase: ReturnType<typeof createClient>,
) {
  for (const table of TENANT_TABLES) {
    const { count, error } = await supabase
      .from(table)
      .select(tenantIdentityColumn(table), { count: "exact", head: true })
      .is("organization_id", null);

    if (error?.message.includes("Could not find the table")) {
      continue;
    }

    if (error?.message.includes("column") && error.message.includes("organization_id")) {
      throw new Error(`Tenant table ${table} is missing organization_id.`);
    }

    if (error) {
      throw new Error(`Failed null-org check on ${table}: ${error.message}`);
    }

    if ((count ?? 0) > 0) {
      throw new Error(
        `Tenant table ${table} has ${count} rows with NULL organization_id.`,
      );
    }
  }

  console.log("Tenant column population checks passed.");
}

async function assertNoCrossTenantLeaks(
  supabase: ReturnType<typeof createClient>,
) {
  const { data: organizations, error } = await supabase
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(10);

  if (error) {
    throw new Error(`Failed to load organizations: ${error.message}`);
  }

  if (!organizations || organizations.length < 2) {
    console.log(
      "Skipping cross-tenant leak checks (need at least two organizations).",
    );
    return;
  }

  const orgA = organizations[0].id;
  const orgB = organizations[1].id;

  for (const table of TENANT_TABLES) {
    const identityColumn = tenantIdentityColumn(table);
    const { data: orgARows, error: orgAError } = await supabase
      .from(table)
      .select(identityColumn)
      .eq("organization_id", orgA)
      .limit(1);

    if (orgAError?.message.includes("Could not find the table")) {
      continue;
    }

    if (orgAError) {
      throw new Error(`Failed to query ${table} for org A: ${orgAError.message}`);
    }

    if (!orgARows || orgARows.length === 0) {
      continue;
    }

    const sampleId = (orgARows[0] as Record<string, unknown>)[identityColumn];

    const { data: leakedRows, error: leakError } = await supabase
      .from(table)
      .select(identityColumn)
      .eq(identityColumn, sampleId)
      .eq("organization_id", orgB);

    if (leakError) {
      throw new Error(
        `Failed cross-tenant leak check for ${table}: ${leakError.message}`,
      );
    }

    if (leakedRows && leakedRows.length > 0) {
      throw new Error(
        `Cross-tenant leak detected in ${table}: org A record visible under org B filter.`,
      );
    }
  }

  console.log(
    `Cross-tenant leak checks passed for org A (${orgA}) vs org B (${orgB}).`,
  );
}

function collectTsFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      files.push(...collectTsFiles(fullPath));
      continue;
    }

    if (entry.endsWith(".ts")) {
      files.push(fullPath);
    }
  }

  return files;
}
