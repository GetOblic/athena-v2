import "../organization/organizationLanguageTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import {
  buildSuperAdminDashboardView,
  listOrdinaryAthenaAccounts,
} from "../../lib/superAdmin/superAdminDashboardView";
import {
  SuperAdminOperationError,
  createAthenaAccountAsSuperAdmin,
  type ManageableAccount,
} from "../../services/superAdmin/superAdminAccounts";
import { SuperAdminAccessError } from "../../services/superAdmin/superAdminIdentity";

const ROOT = process.cwd();

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

const SUPER_ADMIN_USER_ID = "super-admin-1";
const SUPER_ADMIN_ROW_ID = "super-row-1";
const SUPER_ADMIN_EMAIL = "super@getoblic.com";

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  language?: string;
  athena_plan?: string;
};

type MembershipRow = {
  user_id: string;
  organization_id: string;
  role: string;
};

type CallLog = {
  inserts: Array<{ table: string; values: Record<string, unknown> }>;
  updates: Array<{
    table: string;
    values: Record<string, unknown>;
    filters: Record<string, string>;
  }>;
};

type Fixture = {
  organizations: Record<string, OrganizationRow>;
  memberships: MembershipRow[];
  licenseeAccounts: Record<string, { id: string; user_id: string; email: string }>;
  superAdmins: Record<string, { id: string; user_id: string; email: string }>;
  accessStatus: Record<string, "active" | "deactivated">;
  relationships: Array<{
    licensee_account_id: string;
    organization_id: string;
  }>;
  authUsersByEmail: Record<string, { id: string; email: string }>;
};

const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);
const originalCreateUser = supabaseAdmin.auth.admin.createUser.bind(
  supabaseAdmin.auth.admin,
);
const originalFetch = globalThis.fetch;

function installProvisioningFixture(fixture: Fixture): CallLog {
  const calls: CallLog = { inserts: [], updates: [] };
  let orgSeq = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = (table: string) => {
    const filters: Record<string, string> = {};
    let pendingInsert: Record<string, unknown> | null = null;

    const maybeSingle = async () => {
      if (table === "organization_members") {
        const match = fixture.memberships.find(
          (row) => row.user_id === filters.user_id,
        );
        return { data: match ?? null, error: null };
      }
      if (table === "licensee_accounts") {
        return {
          data: filters.user_id
            ? (fixture.licenseeAccounts[filters.user_id] ?? null)
            : null,
          error: null,
        };
      }
      if (table === "getoblic_super_admins") {
        return {
          data: filters.user_id
            ? (fixture.superAdmins[filters.user_id] ?? null)
            : null,
          error: null,
        };
      }
      if (table === "account_access_status") {
        const status = filters.user_id
          ? fixture.accessStatus[filters.user_id]
          : undefined;
        return { data: status ? { status } : null, error: null };
      }
      return { data: null, error: null };
    };

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
          fixture.organizations[id] = row;
        }
        if (table === "organization_members") {
          fixture.memberships.push({
            user_id: String(values.user_id),
            organization_id: String(values.organization_id),
            role: String(values.role || "owner"),
          });
        }
        if (table === "licensee_sub_accounts") {
          fixture.relationships.push({
            licensee_account_id: String(values.licensee_account_id),
            organization_id: String(values.organization_id),
          });
        }
        calls.inserts.push({ table, values: { ...values } });
        return builder;
      },
      update: (values: Record<string, unknown>) => {
        calls.updates.push({
          table,
          values: { ...values },
          filters: { ...filters },
        });
        return builder;
      },
      upsert: () => builder,
      maybeSingle,
      single: async () => {
        if (table === "organizations" && pendingInsert) {
          const created = Object.values(fixture.organizations).at(-1);
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin.auth.admin as any).createUser = async (attrs: {
    email?: string;
  }) => {
    const email = String(attrs.email || "");
    const existing = fixture.authUsersByEmail[email];
    if (existing) {
      return { data: { user: existing }, error: null };
    }
    const created = { id: `created-user-${email}`, email };
    fixture.authUsersByEmail[email] = created;
    return { data: { user: created }, error: null };
  };

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/auth/v1/admin/users")) {
      const email = url.searchParams.get("email") || "";
      const user = fixture.authUsersByEmail[email];
      return new Response(JSON.stringify({ users: user ? [user] : [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("not mocked", { status: 404 });
  }) as typeof fetch;

  return calls;
}

function restoreMocks() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = originalFrom;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin.auth.admin as any).createUser = originalCreateUser;
  globalThis.fetch = originalFetch;
}

function superAdminFixture(): Fixture {
  return {
    organizations: {},
    memberships: [],
    licenseeAccounts: {},
    superAdmins: {
      [SUPER_ADMIN_USER_ID]: {
        id: SUPER_ADMIN_ROW_ID,
        user_id: SUPER_ADMIN_USER_ID,
        email: SUPER_ADMIN_EMAIL,
      },
    },
    accessStatus: {},
    relationships: [],
    authUsersByEmail: {},
  };
}

function sampleAccounts(): ManageableAccount[] {
  return [
    {
      userId: "lm-1",
      email: "master@example.com",
      accountType: "licensee",
      displayName: "master@example.com",
      organizationId: null,
      licenseeAccountId: "lic-1",
      status: "active",
      athenaPlan: "full",
    },
    {
      userId: "ath-full",
      email: "clientv2@getoblic.com",
      accountType: "athena",
      displayName: "V2 Test Client",
      organizationId: "org-full",
      licenseeAccountId: null,
      status: "active",
      athenaPlan: "full",
    },
    {
      userId: "ath-free",
      email: "owner@example.com",
      accountType: "athena",
      displayName: "Acme Studio",
      organizationId: "org-free",
      licenseeAccountId: null,
      status: "deactivated",
      athenaPlan: "free",
    },
  ];
}

afterEach(() => {
  restoreMocks();
});

describe("FREE-1 Super Admin create — Athena plan", () => {
  it("Full creation persists Full through the existing tenant provisioner", async () => {
    const fixture = superAdminFixture();
    const calls = installProvisioningFixture(fixture);

    const result = await createAthenaAccountAsSuperAdmin({
      actorUserId: SUPER_ADMIN_USER_ID,
      email: "full-owner@example.com",
      organizationName: "Berlin Studio",
      language: "de",
      athenaPlan: "full",
    });

    const orgInserts = calls.inserts.filter((row) => row.table === "organizations");
    assert.equal(orgInserts.length, 1);
    assert.equal(orgInserts[0].values.athena_plan, "full");
    assert.equal(orgInserts[0].values.language, "de");
    assert.equal(orgInserts[0].values.name, "Berlin Studio");
    assert.equal(fixture.organizations[result.organizationId]?.athena_plan, "full");
    assert.deepEqual(
      calls.inserts
        .filter((row) => row.table === "organization_members")
        .map((row) => row.values),
      [
        {
          organization_id: result.organizationId,
          user_id: result.userId,
          role: "owner",
        },
      ],
    );
    assert.equal(
      calls.inserts.filter((row) => row.table === "licensee_accounts").length,
      0,
    );
    assert.equal(
      calls.inserts.filter((row) => row.table === "licensee_sub_accounts").length,
      0,
    );

    const audit = calls.inserts.find(
      (row) => row.table === "getoblic_super_admin_audit",
    );
    assert.ok(audit);
    assert.equal(audit.values.account_type, "athena");
    assert.equal(
      (audit.values.metadata as { athenaPlan?: string } | null)?.athenaPlan,
      "full",
    );
  });

  it("Free creation persists Free through the existing tenant provisioner", async () => {
    const fixture = superAdminFixture();
    const calls = installProvisioningFixture(fixture);

    const result = await createAthenaAccountAsSuperAdmin({
      actorUserId: SUPER_ADMIN_USER_ID,
      email: "free-owner@example.com",
      organizationName: "Acme Studio",
      language: "fr",
      athenaPlan: "free",
    });

    const orgInserts = calls.inserts.filter((row) => row.table === "organizations");
    assert.equal(orgInserts.length, 1);
    assert.equal(orgInserts[0].values.athena_plan, "free");
    assert.equal(orgInserts[0].values.language, "fr");
    assert.equal(fixture.organizations[result.organizationId]?.athena_plan, "free");

    const audit = calls.inserts.find(
      (row) => row.table === "getoblic_super_admin_audit",
    );
    assert.ok(audit);
    assert.equal(audit.values.account_type, "athena");
    assert.equal(
      (audit.values.metadata as { athenaPlan?: string } | null)?.athenaPlan,
      "free",
    );
  });

  it("omitted Super Admin plan resolves safely to Full", async () => {
    const fixture = superAdminFixture();
    const calls = installProvisioningFixture(fixture);

    await createAthenaAccountAsSuperAdmin({
      actorUserId: SUPER_ADMIN_USER_ID,
      email: "compat-owner@example.com",
      organizationName: "Compat Studio",
    });

    const orgInserts = calls.inserts.filter((row) => row.table === "organizations");
    assert.equal(orgInserts[0].values.athena_plan, "full");
  });

  it("invalid Super Admin plan is rejected server-side", async () => {
    installProvisioningFixture(superAdminFixture());
    await assert.rejects(
      () =>
        createAthenaAccountAsSuperAdmin({
          actorUserId: SUPER_ADMIN_USER_ID,
          email: "bad-plan@example.com",
          organizationName: "Bad Studio",
          athenaPlan: "premium",
        }),
      (error: unknown) => {
        assert.ok(error instanceof SuperAdminOperationError);
        assert.equal(error.code, "INVALID_ATHENA_PLAN");
        return true;
      },
    );
  });

  it("does not create a parallel Free provisioner and keeps Super Admin authorization", async () => {
    const accounts = read("services/superAdmin/superAdminAccounts.ts");
    const createAthena = sliceBetween(
      accounts,
      "export async function createAthenaAccountAsSuperAdmin",
      "export async function createLicenseeMasterAsSuperAdmin",
    );
    assert.match(createAthena, /requireGetOblicSuperAdmin\(input\.actorUserId\)/);
    assert.match(createAthena, /parseAthenaPlan/);
    assert.match(createAthena, /provisionTenantForAuthenticatedUserDetailed/);
    assert.match(createAthena, /athenaPlan/);
    assert.doesNotMatch(createAthena, /createFreeAthena|provisionFree/);
    assert.doesNotMatch(createAthena, /licensee_accounts|licensee_sub_accounts/);
    assert.match(createAthena, /accountType:\s*"athena"/);

    const route = read("app/api/super/accounts/athena/route.ts");
    assert.match(route, /athenaPlan:\s*body\.athenaPlan/);
    assert.match(route, /createAthenaAccountAsSuperAdmin/);
    assert.doesNotMatch(route, /accountType:\s*body/);

    installProvisioningFixture({
      organizations: {},
      memberships: [],
      licenseeAccounts: {},
      superAdmins: {},
      accessStatus: {},
      relationships: [],
      authUsersByEmail: {},
    });
    await assert.rejects(
      () =>
        createAthenaAccountAsSuperAdmin({
          actorUserId: "not-a-super-admin",
          email: "new-owner@example.com",
          organizationName: "Berlin Studio",
          athenaPlan: "free",
        }),
      SuperAdminAccessError,
    );
  });
});

describe("FREE-1 Super Admin list and view models", () => {
  it("ordinary Athena account view exposes persisted Full/Free independently of access status", () => {
    const accounts = sampleAccounts();
    const ordinary = listOrdinaryAthenaAccounts(accounts);
    assert.equal(ordinary.length, 2);
    assert.equal(
      ordinary.every((account) => account.accountType === "athena"),
      true,
    );
    assert.equal(
      ordinary.some((account) => account.accountType === "licensee"),
      false,
    );

    const view = buildSuperAdminDashboardView({
      accounts,
      directoryAllocations: { groups: [] },
      licenseeCommercialFees: [],
      trendSocialPromptConfigured: false,
      estimateMethodologyConfigured: false,
    });

    assert.equal(view.athenaAccounts.length, 2);
    const full = view.athenaAccounts.find((row) => row.userId === "ath-full");
    const free = view.athenaAccounts.find((row) => row.userId === "ath-free");
    assert.equal(full?.athenaPlan, "full");
    assert.equal(full?.status, "active");
    assert.equal(full?.accountType, "athena");
    assert.equal(free?.athenaPlan, "free");
    assert.equal(free?.status, "deactivated");
    assert.equal(free?.accountType, "athena");
    assert.equal(
      view.athenaAccounts.some((account) => account.accountType === "licensee"),
      false,
    );
  });

  it("list read selects persisted athena_plan and does not infer plan from status or accountType", () => {
    const accounts = read("services/superAdmin/superAdminAccounts.ts");
    const listFn = sliceBetween(
      accounts,
      "export async function listManageableAccountsForSuperAdmin",
      "/** Re-export for route/session guards. */",
    );
    assert.match(listFn, /select\("id, name, athena_plan"\)/);
    assert.match(listFn, /resolveAthenaPlanValue\(org\.athena_plan\)/);
    assert.match(listFn, /accountType:\s*"athena"/);
    assert.match(listFn, /athenaPlan:/);
    assert.doesNotMatch(listFn, /athenaPlan:.*status/);
    assert.doesNotMatch(listFn, /accountType === "free"|account_type === "free"/);

    const view = read("lib/superAdmin/superAdminDashboardView.ts");
    assert.match(
      view,
      /"userId" \| "email" \| "accountType" \| "displayName" \| "status" \| "athenaPlan"/,
    );
  });

  it("Athena Accounts list renders FULL/FREE badges from persisted plan", () => {
    const section = read(
      "components/superAdmin/SuperAdminAthenaAccountsSection.tsx",
    );
    assert.match(section, /athenaPlanBadgeLabel\(account\.athenaPlan\)/);
    assert.match(section, /SUPER_ADMIN_PLAN_BADGE_FULL_CLASS/);
    assert.match(section, /SUPER_ADMIN_PLAN_BADGE_FREE_CLASS/);
    assert.match(section, /account\.status === "deactivated"/);
    assert.doesNotMatch(section, /upgrade|paywall|pricing|billing/i);
  });
});

describe("FREE-1 Super Admin create UX", () => {
  it("adds a Full/Free selector without redesigning /super or reusing accountType", () => {
    const client = read("components/superAdmin/SuperAdminDashboardClient.tsx");
    assert.match(client, /Account Type/);
    assert.match(client, /ATHENA_PLAN_LABELS/);
    assert.match(client, /DEFAULT_ATHENA_PLAN/);
    assert.match(client, /athenaPlan,/);
    assert.match(client, /setAthenaPlan\(DEFAULT_ATHENA_PLAN\)/);
    assert.match(client, /language:\s*athenaLanguage/);
    assert.doesNotMatch(client, /accountType:\s*athenaPlan|account_type:\s*athenaPlan/);

    const createAthena = sliceBetween(
      client,
      "async function createAthena",
      "async function createLicensee",
    );
    const createFields = sliceBetween(
      client,
      "const athenaCreateFields",
      "const licenseeCreateFields",
    );
    assert.doesNotMatch(createAthena, /upgrade|paywall|Stripe/i);
    assert.doesNotMatch(createFields, /upgrade|paywall|Stripe/i);

    const route = read("app/api/super/accounts/athena/route.ts");
    assert.match(route, /athenaPlan:\s*body\.athenaPlan/);
    assert.doesNotMatch(route, /accountType:\s*body/);
  });
});

describe("FREE-1 deactivate / reactivate non-interference", () => {
  it("does not change athena_plan", () => {
    const accounts = read("services/superAdmin/superAdminAccounts.ts");
    const deactivateFn = sliceBetween(
      accounts,
      "export async function deactivateAccountAsSuperAdmin",
      "export async function reactivateAccountAsSuperAdmin",
    );
    const reactivateFn = sliceBetween(
      accounts,
      "export async function reactivateAccountAsSuperAdmin",
      "export async function listManageableAccountsForSuperAdmin",
    );
    assert.doesNotMatch(deactivateFn, /athena_plan|athenaPlan/);
    assert.doesNotMatch(reactivateFn, /athena_plan|athenaPlan/);
    assert.doesNotMatch(deactivateFn, /from\("organizations"\)/);
    assert.doesNotMatch(reactivateFn, /from\("organizations"\)/);
  });
});

describe("FREE-1 Super Admin / Licensee / auth non-interference", () => {
  it("does not modify Licensee, auth, or tenant-isolation contracts", () => {
    const licenseeFiles = [
      "services/licensee/licenseeSubAccounts.ts",
      "services/licensee/licenseeIdentity.ts",
      "services/licensee/licenseeSessionHandoff.ts",
      "app/api/licensee/handoff/route.ts",
    ];
    for (const file of licenseeFiles) {
      assert.doesNotMatch(read(file), /athenaPlan|athena_plan/);
    }

    assert.doesNotMatch(read("middleware.ts"), /athenaPlan|athena_plan/);
    assert.doesNotMatch(
      read("lib/supabase/middleware.ts"),
      /athenaPlan|athena_plan/,
    );
    assert.doesNotMatch(
      read("services/superAdmin/accountAccessStatus.ts"),
      /athenaPlan|athena_plan/,
    );

    const createMaster = sliceBetween(
      read("services/superAdmin/superAdminAccounts.ts"),
      "export async function createLicenseeMasterAsSuperAdmin",
      "async function resolveManageableAccountTarget",
    );
    assert.doesNotMatch(createMaster, /athenaPlan|athena_plan/);
  });
});
