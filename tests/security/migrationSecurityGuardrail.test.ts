/**
 * Prospective Athena migration security guardrail (SEC-1B).
 * Scans only migrations newer than 20260916000001_secure_public_data_api.sql.
 * Historical migrations are excluded by cutoff and must not fail this suite.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase/migrations");
const CUTOFF_MIGRATION = "20260916000001_secure_public_data_api.sql";
const SEC1B_MIGRATION = "20260916000002_secure_future_public_objects.sql";

const ALLOWLISTED_CLIENT_TABLE_GRANTS: ReadonlySet<string> = new Set();
const ALLOWLISTED_CLIENT_FUNCTION_GRANTS: ReadonlySet<string> = new Set();
const ALLOWLISTED_POLICY_TABLES: ReadonlySet<string> = new Set();

type SecurityFinding = {
  kind: "table" | "function" | "statement";
  name: string;
  message: string;
};

type MigrationSecurityReport = {
  tables: string[];
  functions: string[];
  findings: SecurityFinding[];
};

type CreatedFunction = {
  name: string;
  header: string;
  securityDefiner: boolean;
  hasFixedSearchPath: boolean;
};

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripDollarQuotedBodies(sql: string): string {
  return sql.replace(/\$([A-Za-z0-9_]*)\$[\s\S]*?\$\1\$/g, "$$$$");
}

function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, "");
}

function normalizeSql(sql: string): string {
  return stripSqlComments(stripDollarQuotedBodies(sql)).replace(/\s+/g, " ");
}

function qualifiedIdent(name: string): string {
  return String.raw`(?:(?:public)\.)?"?${escapeRegExp(name)}"?`;
}

function listProspectiveMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql") && name > CUTOFF_MIGRATION)
    .sort();
}

function extractCreatedTables(sql: string): string[] {
  const tables: string[] = [];
  const pattern =
    /\bcreate\s+(temp(?:orary)?\s+|unlogged\s+)?table(?!space)\s+(?:if\s+not\s+exists\s+)?(?:(?:public)\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi;
  for (const match of sql.matchAll(pattern)) {
    if (match[1] && /^temp/i.test(match[1])) continue;
    tables.push(match[2]);
  }
  return [...new Set(tables)];
}

function extractCreatedFunctions(sql: string): CreatedFunction[] {
  const functions: CreatedFunction[] = [];
  const pattern =
    /\bcreate\s+(?:or\s+replace\s+)?function\s+(?:(?:public)\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s*\(/gi;
  for (const match of sql.matchAll(pattern)) {
    const name = match[1];
    const after = sql.slice(match.index ?? 0);
    const headerMatch = after.match(
      /^[\s\S]*?\bas\s+(?:\$\$|\$[A-Za-z0-9_]*\$|')/i,
    );
    const header = headerMatch ? headerMatch[0] : after.slice(0, 4000);
    const securityDefiner = /\bsecurity\s+definer\b/i.test(header);
    const headerHasSearchPath =
      /\bset\s+search_path\s*(?:=|to)\s*[a-zA-Z_][a-zA-Z0-9_]*/i.test(header);
    const alterHasSearchPath = new RegExp(
      String.raw`\balter\s+function\s+${qualifiedIdent(name)}\b[\s\S]{0,400}?\bset\s+search_path\b`,
      "i",
    ).test(sql);
    functions.push({
      name,
      header,
      securityDefiner,
      hasFixedSearchPath: headerHasSearchPath || alterHasSearchPath,
    });
  }
  return functions;
}

function hasSql(sql: string, pattern: RegExp): boolean {
  return pattern.test(sql);
}

function tableHasEnableRls(sql: string, table: string): boolean {
  return hasSql(
    sql,
    new RegExp(
      String.raw`\balter\s+table\s+${qualifiedIdent(table)}\s+enable\s+row\s+level\s+security\b`,
      "i",
    ),
  );
}

function tableHasRevokeFrom(sql: string, table: string, role: string): boolean {
  return hasSql(
    sql,
    new RegExp(
      String.raw`\brevoke\s+all\s+on\s+table\s+${qualifiedIdent(table)}\s+from\s+${escapeRegExp(role)}\b`,
      "i",
    ),
  );
}

function tableHasServiceRoleGrant(sql: string, table: string): boolean {
  return hasSql(
    sql,
    new RegExp(
      String.raw`\bgrant\s+all\s+on\s+table\s+${qualifiedIdent(table)}\s+to\s+service_role\b`,
      "i",
    ),
  );
}

function functionHasRevokeFrom(
  sql: string,
  name: string,
  role: string,
): boolean {
  return hasSql(
    sql,
    new RegExp(
      String.raw`\brevoke\s+(?:all|execute)\s+on\s+function\s+${qualifiedIdent(name)}\s*(?:\([^;]*\))?\s+from\s+${escapeRegExp(role)}\b`,
      "i",
    ),
  );
}

function functionHasServiceRoleExecute(sql: string, name: string): boolean {
  return hasSql(
    sql,
    new RegExp(
      String.raw`\bgrant\s+(?:all|execute)\s+on\s+function\s+${qualifiedIdent(name)}\s*(?:\([^;]*\))?\s+to\s+service_role\b`,
      "i",
    ),
  );
}

function functionHasClientExecute(
  sql: string,
  name: string,
  role: "anon" | "authenticated",
): boolean {
  return hasSql(
    sql,
    new RegExp(
      String.raw`\bgrant\s+(?:all|execute)\s+on\s+function\s+${qualifiedIdent(name)}\s*(?:\([^;]*\))?\s+to\s+${role}\b`,
      "i",
    ),
  );
}

function splitStatements(sql: string): string[] {
  return sql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function clientRolesInGrant(statement: string): Array<"anon" | "authenticated"> {
  const match = statement.match(/\bto\s+([\s\S]+)$/i);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0]?.toLowerCase())
    .filter((role): role is "anon" | "authenticated" =>
      role === "anon" || role === "authenticated",
    );
}

function analyzeMigrationSql(sql: string): MigrationSecurityReport {
  const scanned = normalizeSql(sql);
  const tables = extractCreatedTables(scanned);
  const functions = extractCreatedFunctions(scanned);
  const findings: SecurityFinding[] = [];

  for (const table of tables) {
    if (!tableHasEnableRls(scanned, table)) {
      findings.push({
        kind: "table",
        name: table,
        message: `table ${table} missing ENABLE ROW LEVEL SECURITY`,
      });
    }
    if (!tableHasRevokeFrom(scanned, table, "public")) {
      findings.push({
        kind: "table",
        name: table,
        message: `table ${table} missing REVOKE ALL from public`,
      });
    }
    if (!tableHasRevokeFrom(scanned, table, "anon")) {
      findings.push({
        kind: "table",
        name: table,
        message: `table ${table} missing REVOKE ALL from anon`,
      });
    }
    if (!tableHasRevokeFrom(scanned, table, "authenticated")) {
      findings.push({
        kind: "table",
        name: table,
        message: `table ${table} missing REVOKE ALL from authenticated`,
      });
    }
    if (!tableHasServiceRoleGrant(scanned, table)) {
      findings.push({
        kind: "table",
        name: table,
        message: `table ${table} missing GRANT ALL to service_role`,
      });
    }
  }

  for (const fn of functions) {
    if (!functionHasRevokeFrom(scanned, fn.name, "public")) {
      findings.push({
        kind: "function",
        name: fn.name,
        message: `function ${fn.name} missing REVOKE from public`,
      });
    }
    if (!functionHasRevokeFrom(scanned, fn.name, "anon")) {
      findings.push({
        kind: "function",
        name: fn.name,
        message: `function ${fn.name} missing REVOKE from anon`,
      });
    }
    if (!functionHasRevokeFrom(scanned, fn.name, "authenticated")) {
      findings.push({
        kind: "function",
        name: fn.name,
        message: `function ${fn.name} missing REVOKE from authenticated`,
      });
    }
    if (!functionHasServiceRoleExecute(scanned, fn.name)) {
      findings.push({
        kind: "function",
        name: fn.name,
        message: `function ${fn.name} missing GRANT EXECUTE to service_role`,
      });
    }
    if (fn.securityDefiner && !fn.hasFixedSearchPath) {
      findings.push({
        kind: "function",
        name: fn.name,
        message: `SECURITY DEFINER function ${fn.name} missing fixed search_path`,
      });
    }
    if (
      functionHasClientExecute(scanned, fn.name, "authenticated") &&
      !ALLOWLISTED_CLIENT_FUNCTION_GRANTS.has(fn.name)
    ) {
      findings.push({
        kind: "function",
        name: fn.name,
        message: `function ${fn.name} grants EXECUTE to authenticated`,
      });
    }
    if (
      functionHasClientExecute(scanned, fn.name, "anon") &&
      !ALLOWLISTED_CLIENT_FUNCTION_GRANTS.has(fn.name)
    ) {
      findings.push({
        kind: "function",
        name: fn.name,
        message: `function ${fn.name} grants EXECUTE to anon`,
      });
    }
  }

  for (const statement of splitStatements(scanned)) {
    if (/^\s*create\s+policy\b/i.test(statement)) {
      const policyTable = statement.match(
        /\bon\s+(?:(?:public)\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/i,
      )?.[1];
      if (policyTable && ALLOWLISTED_POLICY_TABLES.has(policyTable)) continue;
      findings.push({
        kind: "statement",
        name: policyTable ?? "unknown",
        message: `CREATE POLICY is not allowed${policyTable ? ` on ${policyTable}` : ""}`,
      });
      continue;
    }

    if (!/^\s*grant\b/i.test(statement) && !/^\s*alter\s+default\s+privileges\b/i.test(statement)) {
      continue;
    }
    if (!/\bgrant\b/i.test(statement)) continue;

    const roles = clientRolesInGrant(statement);
    if (roles.length === 0) continue;

    const tableName = statement.match(
      /\bon\s+table\s+(?:(?:public)\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/i,
    )?.[1];
    const functionName = statement.match(
      /\bon\s+function\s+(?:(?:public)\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/i,
    )?.[1];

    for (const role of roles) {
      if (tableName && ALLOWLISTED_CLIENT_TABLE_GRANTS.has(tableName)) continue;
      if (functionName && ALLOWLISTED_CLIENT_FUNCTION_GRANTS.has(functionName)) {
        continue;
      }
      findings.push({
        kind: "statement",
        name: tableName ?? functionName ?? "unknown",
        message: `GRANT to ${role} is not allowed${
          tableName || functionName ? ` on ${tableName ?? functionName}` : ""
        }`,
      });
    }
  }

  return { tables, functions: functions.map((fn) => fn.name), findings };
}

function messagesOf(report: MigrationSecurityReport): string[] {
  return report.findings.map((finding) => finding.message);
}

function assertClean(sql: string): MigrationSecurityReport {
  const report = analyzeMigrationSql(sql);
  assert.deepEqual(report.findings, []);
  return report;
}

function assertFinding(sql: string, expected: string): void {
  const report = analyzeMigrationSql(sql);
  assert.ok(
    messagesOf(report).some((message) => message.includes(expected)),
    `expected finding containing ${JSON.stringify(expected)}, got ${JSON.stringify(messagesOf(report))}`,
  );
}

const SECURE_TABLE = `
create table if not exists future_secure_table (
  id uuid primary key
);

alter table future_secure_table enable row level security;
revoke all on table future_secure_table from public;
revoke all on table future_secure_table from anon;
revoke all on table future_secure_table from authenticated;
grant all on table future_secure_table to service_role;
`;

const SECURE_FUNCTION = `
create or replace function future_secure_rpc(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  null;
end;
$$;

revoke all on function future_secure_rpc(uuid) from public;
revoke all on function future_secure_rpc(uuid) from anon;
revoke all on function future_secure_rpc(uuid) from authenticated;
grant execute on function future_secure_rpc(uuid) to service_role;
`;

describe("migration security guardrail — detector self-test", () => {
  it("PASS: secure table", () => {
    const report = assertClean(SECURE_TABLE);
    assert.deepEqual(report.tables, ["future_secure_table"]);
  });

  it("FAIL: table missing RLS", () => {
    assertFinding(
      SECURE_TABLE.replace(
        /alter table future_secure_table enable row level security;\n/,
        "",
      ),
      "missing ENABLE ROW LEVEL SECURITY",
    );
  });

  it("FAIL: table missing anon revoke", () => {
    assertFinding(
      SECURE_TABLE.replace(
        /revoke all on table future_secure_table from anon;\n/,
        "",
      ),
      "missing REVOKE ALL from anon",
    );
  });

  it("FAIL: table missing authenticated revoke", () => {
    assertFinding(
      SECURE_TABLE.replace(
        /revoke all on table future_secure_table from authenticated;\n/,
        "",
      ),
      "missing REVOKE ALL from authenticated",
    );
  });

  it("FAIL: table missing service_role grant", () => {
    assertFinding(
      SECURE_TABLE.replace(
        /grant all on table future_secure_table to service_role;\n/,
        "",
      ),
      "missing GRANT ALL to service_role",
    );
  });

  it("FAIL: table with CREATE POLICY", () => {
    assertFinding(
      `${SECURE_TABLE}
create policy future_client_select on future_secure_table
  for select to authenticated using (true);
`,
      "CREATE POLICY is not allowed on future_secure_table",
    );
  });

  it("PASS: secure SECURITY DEFINER function with search_path and execute lockdown", () => {
    const report = assertClean(SECURE_FUNCTION);
    assert.deepEqual(report.functions, ["future_secure_rpc"]);
  });

  it("FAIL: SECURITY DEFINER function without fixed search_path", () => {
    assertFinding(
      SECURE_FUNCTION.replace(/set search_path = public\n/, ""),
      "missing fixed search_path",
    );
  });

  it("FAIL: function with authenticated EXECUTE", () => {
    assertFinding(
      `${SECURE_FUNCTION}
grant execute on function future_secure_rpc(uuid) to authenticated;
`,
      "grants EXECUTE to authenticated",
    );
  });

  it("does not treat commented security statements as satisfying the table contract", () => {
    const report = analyzeMigrationSql(`
create table if not exists commented_only_table (
  id uuid primary key
);

-- alter table commented_only_table enable row level security;
-- revoke all on table commented_only_table from public;
-- revoke all on table commented_only_table from anon;
-- revoke all on table commented_only_table from authenticated;
-- grant all on table commented_only_table to service_role;
`);
    assert.ok(
      messagesOf(report).some((message) =>
        message.includes("missing ENABLE ROW LEVEL SECURITY"),
      ),
    );
    assert.ok(
      messagesOf(report).some((message) =>
        message.includes("missing REVOKE ALL from anon"),
      ),
    );
  });

  it("does not treat commented CREATE POLICY or client GRANT as a violation", () => {
    assertClean(`
${SECURE_TABLE}
-- create policy sneaky on future_secure_table for select to authenticated using (true);
-- grant select on table future_secure_table to anon;
`);
  });
});

describe("migration security guardrail — prospective scope", () => {
  it("excludes the SEC-1 cutoff and all older migrations", () => {
    const files = listProspectiveMigrationFiles();
    assert.ok(!files.includes(CUTOFF_MIGRATION));
    assert.equal(
      files.some((name) => name <= CUTOFF_MIGRATION),
      false,
    );
    assert.ok(files.includes(SEC1B_MIGRATION));
    assert.equal(
      files.some((name) => name.startsWith("20260915")),
      false,
    );
  });

  it("does not fail current historical create-table migrations because they are out of scope", () => {
    const historical = read(
      "supabase/migrations/20260915000001_create_licensee_prospect_client_conversions.sql",
    );
    const historicalReport = analyzeMigrationSql(historical);
    assert.ok(historicalReport.tables.length > 0);
    assert.ok(
      messagesOf(historicalReport).some((message) =>
        message.includes("missing ENABLE ROW LEVEL SECURITY"),
      ),
      "detector must still recognize historical tables as insecure if analyzed directly",
    );
    assert.equal(
      listProspectiveMigrationFiles().includes(
        "20260915000001_create_licensee_prospect_client_conversions.sql",
      ),
      false,
    );
  });

  it("passes every prospective migration currently in the repository", () => {
    for (const name of listProspectiveMigrationFiles()) {
      const report = analyzeMigrationSql(read(`supabase/migrations/${name}`));
      assert.deepEqual(report.findings, [], name);
    }
  });
});

describe("SEC-1B future default privileges — static source contract", () => {
  const sql = read(`supabase/migrations/${SEC1B_MIGRATION}`);
  const scanned = normalizeSql(sql);

  function countDefaultPrivilege(
    objectType: "tables" | "sequences" | "functions",
    action: "revoke" | "grant",
    role: string,
    privilege = action === "grant" && objectType === "functions" ? "execute" : objectType === "functions" ? "execute" : "all",
  ): number {
    const grantPrivilege = objectType === "functions" ? privilege : action === "grant" ? "all" : privilege;
    return [
      ...scanned.matchAll(
        new RegExp(
          String.raw`alter default privileges for role postgres in schema public ${action} ${grantPrivilege} on ${objectType} ${
            action === "revoke" ? "from" : "to"
          } ${escapeRegExp(role)}`,
          "gi",
        ),
      ),
    ].length;
  }

  it("contains exactly 4 table, 4 sequence, and 4 function default privilege statements for postgres/public", () => {
    assert.equal(countDefaultPrivilege("tables", "revoke", "public"), 1);
    assert.equal(countDefaultPrivilege("tables", "revoke", "anon"), 1);
    assert.equal(countDefaultPrivilege("tables", "revoke", "authenticated"), 1);
    assert.equal(countDefaultPrivilege("tables", "grant", "service_role"), 1);

    assert.equal(countDefaultPrivilege("sequences", "revoke", "public"), 1);
    assert.equal(countDefaultPrivilege("sequences", "revoke", "anon"), 1);
    assert.equal(countDefaultPrivilege("sequences", "revoke", "authenticated"), 1);
    assert.equal(countDefaultPrivilege("sequences", "grant", "service_role"), 1);

    assert.equal(countDefaultPrivilege("functions", "revoke", "public"), 1);
    assert.equal(countDefaultPrivilege("functions", "revoke", "anon"), 1);
    assert.equal(countDefaultPrivilege("functions", "revoke", "authenticated"), 1);
    assert.equal(countDefaultPrivilege("functions", "grant", "service_role"), 1);

    assert.equal(
      [...scanned.matchAll(/\balter default privileges\b/gi)].length,
      12,
    );
  });

  it("targets postgres in public only and does not touch supabase_admin or existing objects", () => {
    assert.match(sql, /for role postgres/i);
    assert.match(sql, /in schema public/i);
    assert.doesNotMatch(scanned, /supabase_admin/);
    assert.doesNotMatch(scanned, /for role (?!postgres\b)\w+/i);
    assert.doesNotMatch(scanned, /in schema (?!public\b)\w+/i);
    assert.doesNotMatch(scanned, /\balter table\b/i);
    assert.doesNotMatch(scanned, /\benable row level security\b/i);
    assert.doesNotMatch(scanned, /\bcreate policy\b/i);
    assert.doesNotMatch(scanned, /\bcreate table\b/i);
    assert.doesNotMatch(scanned, /\bcreate (?:or replace )?function\b/i);
    assert.doesNotMatch(scanned, /\b(insert|update|delete|truncate)\b/i);
    assert.doesNotMatch(scanned, /\bdrop\b/i);
    assert.doesNotMatch(scanned, /\bbegin\b|\bcommit\b/i);
    assert.doesNotMatch(scanned, /\bauth\./i);
    assert.doesNotMatch(scanned, /\bstorage\./i);
    assert.match(sql, /does not enable rls/i);
    assert.match(sql, /does not alter existing/i);
  });

  it("keeps the client-grant and policy allowlists empty", () => {
    assert.equal(ALLOWLISTED_CLIENT_TABLE_GRANTS.size, 0);
    assert.equal(ALLOWLISTED_CLIENT_FUNCTION_GRANTS.size, 0);
    assert.equal(ALLOWLISTED_POLICY_TABLES.size, 0);
  });
});
