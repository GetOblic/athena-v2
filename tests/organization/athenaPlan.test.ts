import "./organizationLanguageTestEnv";

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import {
  ATHENA_PLAN_LABELS,
  ATHENA_PLANS,
  AthenaPlanInvalidError,
  DEFAULT_ATHENA_PLAN,
  athenaPlanBadgeLabel,
  athenaPlanLabel,
  isAthenaPlan,
  parseAthenaPlan,
  resolveAthenaPlanValue,
} from "../../services/athenaPlan";
import {
  provisionTenantForAuthenticatedUser,
  resolveAthenaPlan,
  type ProvisionTenantOptions,
} from "../../services/organizationService";

const ROOT = process.cwd();
const ATHENA_PLAN_MIGRATION =
  "supabase/migrations/20260916000004_add_organization_athena_plan.sql";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function sliceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end >= 0, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

function listFiles(dir: string, extensions: RegExp): string[] {
  const absolute = join(ROOT, dir);
  let entries;
  try {
    entries = readdirSync(absolute, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const relative = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name === ".next" ||
        entry.name === "dist"
      ) {
        continue;
      }
      files.push(...listFiles(relative, extensions));
    } else if (extensions.test(entry.name)) {
      files.push(relative);
    }
  }
  return files;
}

const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  language?: string;
  athena_plan?: string;
};

type CallLog = {
  inserts: Array<{ table: string; values: Record<string, unknown> }>;
};

function installOrganizationFixture(rows: Record<string, OrganizationRow>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = (table: string) => {
    const filters: Record<string, string> = {};
    const builder = {
      select: () => builder,
      eq: (column: string, value: string) => {
        filters[column] = value;
        return builder;
      },
      maybeSingle: async () => {
        if (table !== "organizations") {
          return { data: null, error: null };
        }
        const id = filters.id;
        return { data: id ? (rows[id] ?? null) : null, error: null };
      },
    };
    return builder;
  };
}

function installProvisioningFixture(rows: Record<string, OrganizationRow>): CallLog {
  const calls: CallLog = { inserts: [] };
  let orgSeq = 0;
  const memberships: Array<{ user_id: string; organization_id: string }> = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = (table: string) => {
    const filters: Record<string, string> = {};
    let pendingInsert: Record<string, unknown> | null = null;

    const builder = {
      select: () => builder,
      eq: (column: string, value: string) => {
        filters[column] = value;
        return builder;
      },
      insert: (values: Record<string, unknown>) => {
        pendingInsert = values;
        if (table === "organizations") {
          orgSeq += 1;
          const id = `created-org-${orgSeq}`;
          const row: OrganizationRow = {
            id,
            name: String(values.name || ""),
            slug: String(values.slug || ""),
          };
          if ("language" in values) {
            row.language = String(values.language);
          }
          if ("athena_plan" in values) {
            row.athena_plan = String(values.athena_plan);
          }
          rows[id] = row;
        }
        if (table === "organization_members") {
          memberships.push({
            user_id: String(values.user_id),
            organization_id: String(values.organization_id),
          });
        }
        calls.inserts.push({ table, values: { ...values } });
        return builder;
      },
      maybeSingle: async () => {
        if (table === "organization_members") {
          const match = memberships.find((row) => row.user_id === filters.user_id);
          return { data: match ?? null, error: null };
        }
        if (table === "licensee_accounts" || table === "getoblic_super_admins") {
          return { data: null, error: null };
        }
        return { data: null, error: null };
      },
      single: async () => {
        if (table === "organizations" && pendingInsert) {
          const created = Object.values(rows).at(-1);
          return {
            data: created ?? null,
            error: created ? null : { message: "insert failed" },
          };
        }
        return { data: null, error: { message: "unexpected single" } };
      },
    };

    return builder;
  };

  return calls;
}

function restoreSupabaseAdmin() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = originalFrom;
}

describe("FREE-1 Athena plan — domain contract", () => {
  it("contains exactly the two supported plan values and defaults to full", () => {
    assert.deepEqual([...ATHENA_PLANS], ["full", "free"]);
    assert.equal(DEFAULT_ATHENA_PLAN, "full");
    assert.deepEqual(ATHENA_PLAN_LABELS, {
      full: "Full Athena",
      free: "Free Athena",
    });
    assert.equal(athenaPlanLabel("full"), "Full Athena");
    assert.equal(athenaPlanLabel("free"), "Free Athena");
    assert.equal(athenaPlanBadgeLabel("full"), "FULL");
    assert.equal(athenaPlanBadgeLabel("free"), "FREE");
  });

  it("accepts full and free and rejects invalid external input", () => {
    assert.equal(isAthenaPlan("full"), true);
    assert.equal(isAthenaPlan("free"), true);
    assert.equal(parseAthenaPlan("full"), "full");
    assert.equal(parseAthenaPlan("free"), "free");
    assert.equal(parseAthenaPlan(" FULL "), "full");
    assert.equal(parseAthenaPlan("Free"), "free");
    assert.equal(resolveAthenaPlanValue("full"), "full");
    assert.equal(resolveAthenaPlanValue("free"), "free");

    for (const invalid of [
      "premium",
      "athena",
      "licensee",
      "accountType",
      "Full Athena",
      "",
      null,
      undefined,
      1,
    ]) {
      assert.equal(isAthenaPlan(invalid), false);
      assert.throws(() => parseAthenaPlan(invalid), AthenaPlanInvalidError);
    }
  });

  it("omitted or legacy persisted values resolve to full", () => {
    assert.equal(resolveAthenaPlanValue(undefined), "full");
    assert.equal(resolveAthenaPlanValue(null), "full");
    assert.equal(resolveAthenaPlanValue(""), "full");
    assert.equal(resolveAthenaPlanValue("zz"), "full");
    assert.equal(resolveAthenaPlanValue("premium"), "full");
  });

  it("does not introduce entitlements, billing, or Licensee plan terminology", () => {
    const contract = read("services/athenaPlan.ts");
    assert.doesNotMatch(contract, /featureFlags?|quota|paywall|stripe/i);
    assert.doesNotMatch(contract, /licensee_accounts|own_company|accountType|account_type/);
    assert.doesNotMatch(contract, /export (async )?function (check|assert|gate)/);
  });
});

describe("FREE-1 Athena plan — migration contract", () => {
  it("adds organizations.athena_plan as NOT NULL default full with exact CHECK", () => {
    const migration = read(ATHENA_PLAN_MIGRATION);
    assert.match(migration, /alter table organizations/i);
    assert.match(
      migration,
      /add column if not exists athena_plan text not null default 'full'/i,
    );
    assert.match(migration, /organizations_athena_plan_check/);
    assert.match(migration, /check \(athena_plan in \('full', 'free'\)\)/);
    assert.doesNotMatch(migration, /update organizations/i);
    assert.doesNotMatch(migration, /drop column/i);
    assert.doesNotMatch(migration, /licensee_accounts|licensee_sub_accounts/);
    assert.doesNotMatch(migration, /account_access_status|getoblic_super_admins/);
    assert.doesNotMatch(migration, /organization_members/);
    assert.doesNotMatch(migration, /own_company_organization_id/);
  });

  it("is the only migration that introduces athena_plan", () => {
    const migrations = listFiles("supabase/migrations", /\.sql$/);
    const mentioning = migrations.filter((file) =>
      /athena_plan/.test(read(file)),
    );
    assert.deepEqual(mentioning, [ATHENA_PLAN_MIGRATION]);
  });
});

describe("FREE-1 Athena plan — organization resolver", () => {
  afterEach(() => {
    restoreSupabaseAdmin();
  });

  it("resolves a persisted free or full plan from organizations", async () => {
    installOrganizationFixture({
      "org-free": {
        id: "org-free",
        name: "Free Studio",
        slug: "free-studio",
        athena_plan: "free",
      },
      "org-full": {
        id: "org-full",
        name: "Full Studio",
        slug: "full-studio",
        athena_plan: "full",
      },
    });
    assert.equal(await resolveAthenaPlan("org-free"), "free");
    assert.equal(await resolveAthenaPlan("org-full"), "full");
  });

  it("falls back to full for missing organization or pre-migration rows", async () => {
    installOrganizationFixture({
      "org-legacy": {
        id: "org-legacy",
        name: "Legacy",
        slug: "legacy",
      },
    });
    assert.equal(await resolveAthenaPlan("org-legacy"), "full");
    assert.equal(await resolveAthenaPlan("missing"), "full");
  });

  it("reads organizations by organizationId only and is not wired into tenant surfaces", () => {
    const service = read("services/organizationService.ts");
    const resolver = sliceBetween(
      service,
      "export async function resolveAthenaPlan",
      "export async function updateOrganizationLanguage",
    );
    assert.match(resolver, /getOrganizationById/);
    assert.match(resolver, /resolveAthenaPlanValue\(organization\?\.athena_plan\)/);
    assert.doesNotMatch(resolver, /html_language|hreflang|geographic_reach/);
    assert.doesNotMatch(resolver, /sessionStorage|navigator\.language|accept-language/i);

    const context = sliceBetween(
      service,
      "export async function requireCurrentOrganizationContext",
      "export type IngestionOrganizationInput",
    );
    assert.doesNotMatch(context, /athenaPlan|athena_plan|resolveAthenaPlan/);

    const forbiddenRoots = [
      "middleware.ts",
      "lib/supabase/middleware.ts",
      "components/dashboard",
      "app/home",
      "app/identity",
      "app/social-planner",
      "app/seo",
      "app/ads",
      "app/prospects",
      "app/audiences",
    ];
    for (const root of forbiddenRoots) {
      const files = root.endsWith(".ts") ? [root] : listFiles(root, /\.(ts|tsx)$/);
      for (const file of files) {
        const source = read(file);
        assert.doesNotMatch(
          source,
          /athenaPlan|athena_plan|resolveAthenaPlan/,
          `${file} must not consume Athena plan in FREE-1`,
        );
      }
    }
  });
});

describe("FREE-1 Athena plan — ordinary provisioning default", () => {
  afterEach(() => {
    restoreSupabaseAdmin();
  });

  it("omitted plan leaves athena_plan off the INSERT so the database default remains Full", async () => {
    const rows: Record<string, OrganizationRow> = {};
    const calls = installProvisioningFixture(rows);
    const omitted: ProvisionTenantOptions = { organizationName: "Default Studio" };
    assert.equal(omitted.athenaPlan, undefined);

    await provisionTenantForAuthenticatedUser("user-default", "owner@example.com", {
      organizationName: "Default Studio",
    });

    const orgInserts = calls.inserts.filter((row) => row.table === "organizations");
    assert.equal(orgInserts.length, 1);
    assert.equal("athena_plan" in orgInserts[0].values, false);
    assert.equal(orgInserts[0].values.name, "Default Studio");
  });

  it("explicit free persists athena_plan = free through the existing provisioner", async () => {
    const rows: Record<string, OrganizationRow> = {};
    const calls = installProvisioningFixture(rows);

    await provisionTenantForAuthenticatedUser("user-free", "owner@example.com", {
      organizationName: "Free Studio",
      athenaPlan: "free",
    });

    const orgInserts = calls.inserts.filter((row) => row.table === "organizations");
    assert.equal(orgInserts.length, 1);
    assert.equal(orgInserts[0].values.athena_plan, "free");
    assert.equal(rows["created-org-1"]?.athena_plan, "free");
  });

  it("rejects invalid plan before the organizations INSERT", async () => {
    const rows: Record<string, OrganizationRow> = {};
    const calls = installProvisioningFixture(rows);

    await assert.rejects(
      () =>
        provisionTenantForAuthenticatedUser("user-bad", "owner@example.com", {
          athenaPlan: "premium" as "full",
        }),
      AthenaPlanInvalidError,
    );
    assert.equal(
      calls.inserts.filter((row) => row.table === "organizations").length,
      0,
    );
  });

  it("Licensee sub-account and lazy/recovery provisioning do not write Free", () => {
    const licensee = read("services/licensee/licenseeSubAccounts.ts");
    const createFn = licensee.slice(
      licensee.indexOf("export async function createLicenseeSubAccount"),
    );
    assert.match(createFn, /organizationName:\s*businessName/);
    assert.match(createFn, /language:\s*organizationLanguage/);
    assert.doesNotMatch(createFn, /athenaPlan|athena_plan/);

    const callback = read("app/auth/callback/route.ts");
    assert.match(
      callback,
      /provisionTenantForAuthenticatedUser\(\s*userId,\s*email\s*\)/,
    );
    assert.doesNotMatch(callback, /athenaPlan|athena_plan/);

    const org = read("services/organizationService.ts");
    const requireContext = sliceBetween(
      org,
      "export async function requireCurrentOrganizationContext",
      "export type IngestionOrganizationInput",
    );
    assert.match(
      requireContext,
      /provisionTenantForAuthenticatedUser\(\s*user\.id,\s*user\.email,?\s*\)/,
    );
    assert.doesNotMatch(requireContext, /athenaPlan|athena_plan/);
  });
});
