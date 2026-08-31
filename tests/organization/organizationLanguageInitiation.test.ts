import "./organizationLanguageTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import {
  LicenseeSubAccountCreateError,
  createLicenseeSubAccount,
} from "../../services/licensee/licenseeSubAccounts";
import {
  OrganizationLanguageInvalidError,
  type OrganizationLanguage,
} from "../../services/organizationLanguage";
import {
  provisionTenantForAuthenticatedUser,
  type ProvisionTenantOptions,
} from "../../services/organizationService";
import {
  SuperAdminOperationError,
  createAthenaAccountAsSuperAdmin,
} from "../../services/superAdmin/superAdminAccounts";
import { SuperAdminAccessError } from "../../services/superAdmin/superAdminIdentity";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function sliceBetween(source: string, startMarker: string, endMarker?: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing start marker: ${startMarker}`);
  if (!endMarker) {
    return source.slice(start);
  }
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end >= 0, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

const MASTER_USER_ID = "master-user-1";
const MASTER_ACCOUNT_ID = "licensee-account-1";
const MASTER_EMAIL = "master@example.com";
const SUPER_ADMIN_USER_ID = "super-admin-1";
const SUPER_ADMIN_ROW_ID = "super-row-1";
const SUPER_ADMIN_EMAIL = "super@getoblic.com";
const EXISTING_OWNER_ID = "existing-owner-1";
const EXISTING_ORG_ID = "existing-org-1";

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  language?: string;
};

type MembershipRow = {
  user_id: string;
  organization_id: string;
  role: string;
};

type CallLog = {
  tables: string[];
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
  licenseeAccounts: Record<
    string,
    { id: string; user_id: string; email: string }
  >;
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
  const calls: CallLog = { tables: [], inserts: [], updates: [] };
  let orgSeq = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = (table: string) => {
    calls.tables.push(table);
    const filters: Record<string, string> = {};
    let pendingInsert: Record<string, unknown> | null = null;

    const maybeSingle = async () => {
      if (table === "organization_members") {
        const userId = filters.user_id;
        const match = fixture.memberships.find((row) => row.user_id === userId);
        return { data: match ?? null, error: null };
      }
      if (table === "licensee_accounts") {
        const userId = filters.user_id;
        return {
          data: userId ? (fixture.licenseeAccounts[userId] ?? null) : null,
          error: null,
        };
      }
      if (table === "getoblic_super_admins") {
        const userId = filters.user_id;
        return {
          data: userId ? (fixture.superAdmins[userId] ?? null) : null,
          error: null,
        };
      }
      if (table === "account_access_status") {
        const userId = filters.user_id;
        const status = userId ? fixture.accessStatus[userId] : undefined;
        return { data: status ? { status } : null, error: null };
      }
      if (table === "licensee_sub_accounts") {
        const match = fixture.relationships.find(
          (row) =>
            row.licensee_account_id === filters.licensee_account_id &&
            row.organization_id === filters.organization_id,
        );
        return { data: match ? { id: "rel-1" } : null, error: null };
      }
      if (table === "organizations") {
        const id = filters.id;
        return { data: id ? (fixture.organizations[id] ?? null) : null, error: null };
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
        calls.updates.push({ table, values: { ...values }, filters: { ...filters } });
        return builder;
      },
      upsert: () => builder,
      maybeSingle,
      single: async () => {
        if (table === "organizations" && pendingInsert) {
          const created = Object.values(fixture.organizations).at(-1);
          return { data: created ?? null, error: created ? null : { message: "insert failed" } };
        }
        return { data: null, error: { message: "unexpected single" } };
      },
      then(
        onFulfilled?: (value: { data: unknown; error: unknown }) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        if (table === "organization_members" && !pendingInsert) {
          const userId = filters.user_id;
          const rows = fixture.memberships.filter((row) => row.user_id === userId);
          return Promise.resolve({ data: rows, error: null }).then(
            onFulfilled,
            onRejected,
          );
        }
        return Promise.resolve({ data: null, error: null }).then(
          onFulfilled,
          onRejected,
        );
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

function emptyFixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    organizations: {},
    memberships: [],
    licenseeAccounts: {},
    superAdmins: {},
    accessStatus: {},
    relationships: [],
    authUsersByEmail: {},
    ...overrides,
  };
}

function masterFixture(overrides: Partial<Fixture> = {}): Fixture {
  return emptyFixture({
    licenseeAccounts: {
      [MASTER_USER_ID]: {
        id: MASTER_ACCOUNT_ID,
        user_id: MASTER_USER_ID,
        email: MASTER_EMAIL,
      },
    },
    accessStatus: {
      [MASTER_USER_ID]: "active",
    },
    ...overrides,
  });
}

function superAdminFixture(overrides: Partial<Fixture> = {}): Fixture {
  return emptyFixture({
    superAdmins: {
      [SUPER_ADMIN_USER_ID]: {
        id: SUPER_ADMIN_ROW_ID,
        user_id: SUPER_ADMIN_USER_ID,
        email: SUPER_ADMIN_EMAIL,
      },
    },
    ...overrides,
  });
}

afterEach(() => {
  restoreMocks();
});

describe("V31 L2 account initiation language — provisioning contract", () => {
  it("ProvisionTenantOptions accepts a valid OrganizationLanguage", () => {
    const withLanguage: ProvisionTenantOptions = { language: "fr" };
    const omitted: ProvisionTenantOptions = { organizationName: "Acme" };
    assert.equal(withLanguage.language, "fr");
    assert.equal(omitted.language, undefined);

    const org = read("services/organizationService.ts");
    const optionsType = sliceBetween(
      org,
      "export type ProvisionTenantOptions",
      "async function createOrganizationForUser",
    );
    assert.match(optionsType, /language\?:\s*OrganizationLanguage/);
    assert.match(org, /from "\.\.\/services\/organizationLanguage"|from "@\/services\/organizationLanguage"/);
  });

  it("createOrganizationForUser includes language in the organizations INSERT when supplied", async () => {
    const fixture = emptyFixture();
    const calls = installProvisioningFixture(fixture);

    const organizationId = await provisionTenantForAuthenticatedUser(
      "user-fr",
      "owner@example.com",
      { organizationName: "Studio Lyon", language: "fr" },
    );

    const orgInserts = calls.inserts.filter((row) => row.table === "organizations");
    assert.equal(orgInserts.length, 1);
    assert.equal(orgInserts[0].values.language, "fr");
    assert.equal(orgInserts[0].values.name, "Studio Lyon");
    assert.match(String(orgInserts[0].values.slug), /^studio-lyon-/);
    assert.equal(fixture.organizations[organizationId]?.language, "fr");
    assert.equal(
      calls.updates.filter((row) => row.table === "organizations").length,
      0,
    );
    assert.deepEqual(
      calls.inserts
        .filter((row) => row.table === "organization_members")
        .map((row) => row.values),
      [
        {
          organization_id: organizationId,
          user_id: "user-fr",
          role: "owner",
        },
      ],
    );
  });

  it("createOrganizationForUser omits language when not supplied, preserving DB default behavior", async () => {
    const fixture = emptyFixture();
    const calls = installProvisioningFixture(fixture);

    await provisionTenantForAuthenticatedUser("user-en", "owner@example.com", {
      organizationName: "Default Studio",
    });

    const orgInserts = calls.inserts.filter((row) => row.table === "organizations");
    assert.equal(orgInserts.length, 1);
    assert.equal("language" in orgInserts[0].values, false);
    assert.equal(orgInserts[0].values.name, "Default Studio");
    assert.equal(fixture.organizations["created-org-1"]?.language, undefined);
  });

  it("rejects invalid language before the organizations INSERT", async () => {
    const fixture = emptyFixture();
    const calls = installProvisioningFixture(fixture);

    await assert.rejects(
      () =>
        provisionTenantForAuthenticatedUser("user-bad", "owner@example.com", {
          language: "en-US" as OrganizationLanguage,
        }),
      OrganizationLanguageInvalidError,
    );
    assert.equal(
      calls.inserts.filter((row) => row.table === "organizations").length,
      0,
    );
  });
});

describe("V31 L2 account initiation language — Licensee sub-account creation", () => {
  it("invalid language from the Licensee creation form is rejected server-side", async () => {
    const page = read("app/licensee/sub-accounts/new/page.tsx");
    assert.match(page, /parseOrganizationLanguage\(accountLanguageRaw\)/);
    assert.match(page, /name=["']accountLanguage["']/);
    assert.match(page, /Account Language/);
    assert.match(page, /ORGANIZATION_LANGUAGES/);
    assert.match(page, /ORGANIZATION_LANGUAGE_LABELS/);
    assert.match(page, /DEFAULT_ORGANIZATION_LANGUAGE/);
    assert.doesNotMatch(page, /\["en", "fr", "es", "it", "de", "pt"\]/);

    installProvisioningFixture(masterFixture());
    await assert.rejects(
      () =>
        createLicenseeSubAccount({
          masterUserId: MASTER_USER_ID,
          businessName: "Acme Studio",
          accountEmail: "client@example.com",
          language: "en-US",
        }),
      (error: unknown) => {
        assert.ok(error instanceof LicenseeSubAccountCreateError);
        assert.equal(error.code, "INVALID_LANGUAGE");
        return true;
      },
    );
  });

  it("new Licensee-created sub-account persists the selected language", async () => {
    const fixture = masterFixture();
    const calls = installProvisioningFixture(fixture);

    const result = await createLicenseeSubAccount({
      masterUserId: MASTER_USER_ID,
      businessName: "Paris Studio",
      accountEmail: "paris@example.com",
      language: "fr",
    });

    assert.equal(result.linkedExisting, false);
    assert.equal(result.authUserCreated, true);
    const orgInserts = calls.inserts.filter((row) => row.table === "organizations");
    assert.equal(orgInserts.length, 1);
    assert.equal(orgInserts[0].values.language, "fr");
    assert.equal(orgInserts[0].values.name, "Paris Studio");
    assert.equal(result.organizationId, "created-org-1");
    assert.equal(fixture.organizations[result.organizationId]?.language, "fr");
    assert.equal(
      calls.updates.filter((row) => row.table === "organizations").length,
      0,
    );
  });

  it("link-existing Licensee flow does not overwrite existing organization language", async () => {
    const fixture = masterFixture({
      organizations: {
        [EXISTING_ORG_ID]: {
          id: EXISTING_ORG_ID,
          name: "Existing Studio",
          slug: "existing-studio",
          language: "de",
        },
      },
      memberships: [
        {
          user_id: EXISTING_OWNER_ID,
          organization_id: EXISTING_ORG_ID,
          role: "owner",
        },
      ],
      authUsersByEmail: {
        "existing@example.com": {
          id: EXISTING_OWNER_ID,
          email: "existing@example.com",
        },
      },
    });
    const calls = installProvisioningFixture(fixture);

    const result = await createLicenseeSubAccount({
      masterUserId: MASTER_USER_ID,
      businessName: "Ignored Name",
      accountEmail: "existing@example.com",
      confirmLinkExisting: true,
      language: "fr",
    });

    assert.equal(result.linkedExisting, true);
    assert.equal(result.organizationId, EXISTING_ORG_ID);
    assert.equal(result.authUserCreated, false);
    assert.equal(fixture.organizations[EXISTING_ORG_ID].language, "de");
    assert.equal(
      calls.inserts.filter((row) => row.table === "organizations").length,
      0,
    );
    assert.equal(
      calls.updates.filter((row) => row.table === "organizations").length,
      0,
    );
  });

  it("link-existing flow preserves all existing linkage semantics", async () => {
    const service = read("services/licensee/licenseeSubAccounts.ts");
    const createFn = sliceBetween(
      service,
      "export async function createLicenseeSubAccount",
    );
    assert.match(createFn, /EXISTING_ACCOUNT_REQUIRES_CONFIRMATION/);
    assert.match(createFn, /confirmLinkExisting/);
    assert.match(createFn, /ensureRelationship/);
    assert.match(createFn, /organizationName:\s*businessName/);
    assert.match(createFn, /language:\s*organizationLanguage/);
    assert.doesNotMatch(createFn, /updateOrganizationLanguage/);
    assert.doesNotMatch(createFn, /\.update\(/);

    const fixture = masterFixture({
      organizations: {
        [EXISTING_ORG_ID]: {
          id: EXISTING_ORG_ID,
          name: "Existing Studio",
          slug: "existing-studio",
          language: "it",
        },
      },
      memberships: [
        {
          user_id: EXISTING_OWNER_ID,
          organization_id: EXISTING_ORG_ID,
          role: "owner",
        },
      ],
      authUsersByEmail: {
        "existing@example.com": {
          id: EXISTING_OWNER_ID,
          email: "existing@example.com",
        },
      },
    });
    installProvisioningFixture(fixture);

    await assert.rejects(
      () =>
        createLicenseeSubAccount({
          masterUserId: MASTER_USER_ID,
          businessName: "Existing Studio",
          accountEmail: "existing@example.com",
          language: "pt",
        }),
      (error: unknown) => {
        assert.ok(error instanceof LicenseeSubAccountCreateError);
        assert.equal(error.code, "EXISTING_ACCOUNT_REQUIRES_CONFIRMATION");
        return true;
      },
    );
    assert.equal(fixture.organizations[EXISTING_ORG_ID].language, "it");
    assert.equal(fixture.relationships.length, 0);
  });
});

describe("V31 L2 account initiation language — Super Admin Athena account creation", () => {
  it("ordinary Athena account creation persists selected language", async () => {
    const dashboard = read("components/superAdmin/SuperAdminDashboardClient.tsx");
    const route = read("app/api/super/accounts/athena/route.ts");
    assert.match(dashboard, /Account Language/);
    assert.match(dashboard, /ORGANIZATION_LANGUAGES/);
    assert.match(dashboard, /language:\s*athenaLanguage/);
    assert.doesNotMatch(dashboard, /\["en", "fr", "es", "it", "de", "pt"\]/);
    assert.match(route, /language:\s*body\.language/);
    assert.doesNotMatch(
      read("services/superAdmin/superAdminAccounts.ts").slice(
        read("services/superAdmin/superAdminAccounts.ts").indexOf(
          "export async function createLicenseeMasterAsSuperAdmin",
        ),
        read("services/superAdmin/superAdminAccounts.ts").indexOf(
          "async function resolveManageableAccountTarget",
        ),
      ),
      /parseOrganizationLanguage|Account Language/,
    );

    const fixture = superAdminFixture();
    const calls = installProvisioningFixture(fixture);

    const result = await createAthenaAccountAsSuperAdmin({
      actorUserId: SUPER_ADMIN_USER_ID,
      email: "new-owner@example.com",
      organizationName: "Berlin Studio",
      language: "de",
    });

    assert.equal(result.organizationId, "created-org-1");
    const orgInserts = calls.inserts.filter((row) => row.table === "organizations");
    assert.equal(orgInserts.length, 1);
    assert.equal(orgInserts[0].values.language, "de");
    assert.equal(orgInserts[0].values.name, "Berlin Studio");
    assert.equal(fixture.organizations[result.organizationId]?.language, "de");
  });

  it("invalid Super Admin language is rejected server-side", async () => {
    installProvisioningFixture(superAdminFixture());
    await assert.rejects(
      () =>
        createAthenaAccountAsSuperAdmin({
          actorUserId: SUPER_ADMIN_USER_ID,
          email: "new-owner@example.com",
          organizationName: "Berlin Studio",
          language: "deutsch",
        }),
      (error: unknown) => {
        assert.ok(error instanceof SuperAdminOperationError);
        assert.equal(error.code, "INVALID_LANGUAGE");
        return true;
      },
    );
  });

  it("Super Admin authorization remains unchanged", async () => {
    const accounts = read("services/superAdmin/superAdminAccounts.ts");
    const createAthena = sliceBetween(
      accounts,
      "export async function createAthenaAccountAsSuperAdmin",
      "export async function createLicenseeMasterAsSuperAdmin",
    );
    assert.match(createAthena, /requireGetOblicSuperAdmin\(input\.actorUserId\)/);
    assert.match(createAthena, /parseOrganizationLanguage/);
    assert.ok(
      createAthena.indexOf("requireGetOblicSuperAdmin") <
        createAthena.indexOf("parseOrganizationLanguage"),
    );

    const route = read("app/api/super/accounts/athena/route.ts");
    assert.match(route, /NOT_SUPER_ADMIN/);
    assert.match(route, /createAthenaAccountAsSuperAdmin/);

    installProvisioningFixture(emptyFixture());
    await assert.rejects(
      () =>
        createAthenaAccountAsSuperAdmin({
          actorUserId: "not-a-super-admin",
          email: "new-owner@example.com",
          organizationName: "Berlin Studio",
          language: "fr",
        }),
      SuperAdminAccessError,
    );
  });
});

describe("V31 L2 account initiation language — lazy provisioning and isolation", () => {
  it("lazy auth-callback / requireCurrentOrganizationContext remain compatible without a language", () => {
    const callback = read("app/auth/callback/route.ts");
    assert.match(
      callback,
      /provisionTenantForAuthenticatedUser\(\s*userId,\s*email\s*\)/,
    );
    assert.doesNotMatch(callback, /parseOrganizationLanguage|navigator\.language|accept-language/);

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
    assert.doesNotMatch(
      requireContext,
      /parseOrganizationLanguage|navigator\.language|accept-language|geographic_reach/,
    );
  });

  it("language selection does not trigger Brain compile, Deep Scrape, generation, or workers", () => {
    const createOrg = sliceBetween(
      read("services/organizationService.ts"),
      "async function createOrganizationForUser",
      "export async function getOrganizationMembership",
    );
    const createLicensee = sliceBetween(
      read("services/licensee/licenseeSubAccounts.ts"),
      "export async function createLicenseeSubAccount",
    );
    const createAthena = sliceBetween(
      read("services/superAdmin/superAdminAccounts.ts"),
      "export async function createAthenaAccountAsSuperAdmin",
      "export async function createLicenseeMasterAsSuperAdmin",
    );
    const page = read("app/licensee/sub-accounts/new/page.tsx");
    const identity = read("app/identity/page.tsx");

    for (const source of [createOrg, createLicensee, createAthena, page]) {
      assert.doesNotMatch(source, /compileMasterIdentityProfile/);
      assert.doesNotMatch(source, /deep-scrape|deepScrape|Deep Scrape/i);
      assert.doesNotMatch(
        source,
        /enqueue|generation_jobs|createExecutiveVersion|athenaWorker/i,
      );
      assert.doesNotMatch(source, /updateOrganizationLanguage/);
    }

    assert.doesNotMatch(identity, /name=["']account_language["']/);
    assert.doesNotMatch(identity, /<select[^>]*language/i);
    assert.doesNotMatch(identity, /updateOrganizationLanguage/);
  });
});
