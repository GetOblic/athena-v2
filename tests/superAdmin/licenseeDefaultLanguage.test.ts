import "../getoblicDirectory/getoblicDirectoryTestEnv";

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import {
  DEFAULT_ORGANIZATION_LANGUAGE,
  ORGANIZATION_LANGUAGES,
} from "../../services/organizationLanguage";
import { SuperAdminOperationError } from "../../services/superAdmin/superAdminAccounts";
import { SuperAdminAccessError } from "../../services/superAdmin/superAdminIdentity";
import { createLicenseeMasterAsSuperAdmin } from "../../services/superAdmin/superAdminAccounts";
import {
  listLicenseeDefaultLanguagesForSuperAdmin,
  parseLicenseeDefaultLanguage,
  SuperAdminLicenseeDefaultLanguageError,
  updateLicenseeDefaultLanguageForSuperAdmin,
} from "../../services/superAdmin/superAdminLicenseeDefaultLanguage";

const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);
const originalCreateUser = supabaseAdmin.auth.admin.createUser.bind(
  supabaseAdmin.auth.admin,
);
const originalFetch = globalThis.fetch;
const ROOT = process.cwd();

const SUPER_ADMIN_USER = "sa-user-1";
const LICENSEE_MASTER_USER = "lm-user-1";
const TENANT_USER = "tenant-user-1";
const LICENSEE_A = "licensee-a";
const LICENSEE_B = "licensee-b";

type LicenseeAccountRow = {
  id: string;
  user_id: string;
  email: string;
  default_language?: string;
  licensee_monthly_fee_usd?: number;
  sub_account_monthly_fee_usd?: number;
};

type OrganizationRow = {
  id: string;
  language: string;
};

type Op = {
  op: string;
  table: string;
  values?: Record<string, unknown>;
};

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function walkSourceFiles(relativeDir: string): string[] {
  const abs = join(ROOT, relativeDir);
  const entries = readdirSync(abs, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relative = join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name === "tests" ||
        entry.name === ".next" ||
        entry.name === "dist"
      ) {
        continue;
      }
      files.push(...walkSourceFiles(relative));
      continue;
    }
    if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      files.push(relative);
    }
  }
  return files;
}

function baseStore(
  overrides: {
    superAdmins?: { id: string; user_id: string; email: string }[];
    licenseeAccounts?: LicenseeAccountRow[];
    organizations?: OrganizationRow[];
    failLanguageWrite?: boolean;
    authUsersByEmail?: Record<string, { id: string; email: string }>;
  } = {},
) {
  return {
    superAdmins: overrides.superAdmins ?? [
      { id: "sa-1", user_id: SUPER_ADMIN_USER, email: "super@getoblic.com" },
    ],
    licenseeAccounts: overrides.licenseeAccounts ?? [
      {
        id: LICENSEE_A,
        user_id: LICENSEE_MASTER_USER,
        email: "master-a@example.com",
        default_language: "en",
      },
      {
        id: LICENSEE_B,
        user_id: "lm-user-2",
        email: "master-b@example.com",
      },
    ],
    organizations: overrides.organizations ?? [
      { id: "org-existing-1", language: "de" },
      { id: "org-existing-2", language: "it" },
    ],
    memberships: [] as Array<{
      user_id: string;
      organization_id: string;
      role: string;
    }>,
    audit: [] as Record<string, unknown>[],
    failLanguageWrite: Boolean(overrides.failLanguageWrite),
    authUsersByEmail: overrides.authUsersByEmail ?? {},
  };
}

function installStore(store: ReturnType<typeof baseStore>): { ops: Op[] } {
  const ops: Op[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = (table: string) => {
    const filters: Record<string, unknown> = {};
    let orderBy: { column: string; ascending: boolean } | null = null;
    let pendingInsert: Record<string, unknown> | null = null;
    let pendingUpdate: Record<string, unknown> | null = null;
    let pendingUpsert: Record<string, unknown> | null = null;

    const rowsForTable = (): Record<string, unknown>[] => {
      if (table === "getoblic_super_admins") {
        return store.superAdmins as unknown as Record<string, unknown>[];
      }
      if (table === "licensee_accounts") {
        return store.licenseeAccounts as unknown as Record<string, unknown>[];
      }
      if (table === "organizations") {
        return store.organizations as unknown as Record<string, unknown>[];
      }
      if (table === "organization_members") {
        return store.memberships as unknown as Record<string, unknown>[];
      }
      if (table === "getoblic_super_admin_audit") {
        return store.audit;
      }
      if (table === "account_access_status") {
        return [];
      }
      return [];
    };

    const matchingRows = () => {
      let matched = rowsForTable().filter((row) =>
        Object.entries(filters).every(([column, expected]) => {
          if (Array.isArray(expected)) {
            return expected.includes(row[column]);
          }
          return row[column] === expected;
        }),
      );
      if (orderBy) {
        matched = [...matched].sort((a, b) => {
          const left = String(a[orderBy.column] ?? "");
          const right = String(b[orderBy.column] ?? "");
          return orderBy.ascending
            ? left.localeCompare(right)
            : right.localeCompare(left);
        });
      }
      return matched;
    };

    const applyInsert = () => {
      ops.push({ op: "insert", table, values: pendingInsert ?? undefined });
      if (table === "getoblic_super_admin_audit" && pendingInsert) {
        store.audit.push(pendingInsert);
      }
      if (table === "licensee_accounts" && pendingInsert) {
        const row: LicenseeAccountRow = {
          id: `created-licensee-${store.licenseeAccounts.length + 1}`,
          user_id: String(pendingInsert.user_id),
          email: String(pendingInsert.email),
          default_language:
            typeof pendingInsert.default_language === "string"
              ? pendingInsert.default_language
              : "en",
        };
        store.licenseeAccounts.push(row);
        pendingInsert = null;
        return { data: row, error: null };
      }
      if (table === "organizations") {
        pendingInsert = null;
        return { data: null, error: { message: "organizations insert blocked" } };
      }
      const inserted = pendingInsert;
      pendingInsert = null;
      return { data: inserted, error: null };
    };

    const applyUpdate = () => {
      ops.push({ op: "update", table, values: pendingUpdate ?? undefined });
      if (table === "organizations") {
        pendingUpdate = null;
        return { data: null, error: { message: "organizations update blocked" } };
      }
      if (store.failLanguageWrite) {
        pendingUpdate = null;
        return { data: null, error: { message: "language write failed" } };
      }
      const matched = matchingRows();
      if (pendingUpdate) {
        for (const row of matched) {
          Object.assign(row, pendingUpdate);
        }
      }
      const updated = matched[0] ?? null;
      pendingUpdate = null;
      return { data: updated, error: updated ? null : { message: "not found" } };
    };

    const builder = {
      select() {
        return builder;
      },
      eq(column: string, value: unknown) {
        filters[column] = value;
        return builder;
      },
      in(column: string, values: unknown[]) {
        filters[column] = values;
        return builder;
      },
      order(column: string, options?: { ascending?: boolean }) {
        orderBy = { column, ascending: options?.ascending !== false };
        return builder;
      },
      insert(values: Record<string, unknown> | Record<string, unknown>[]) {
        pendingInsert = Array.isArray(values) ? (values[0] ?? null) : values;
        return builder;
      },
      update(values: Record<string, unknown>) {
        pendingUpdate = values;
        return builder;
      },
      upsert(values: Record<string, unknown>) {
        pendingUpsert = values;
        ops.push({ op: "upsert", table, values });
        return builder;
      },
      async maybeSingle() {
        if (pendingInsert) return applyInsert();
        if (pendingUpdate) return applyUpdate();
        if (pendingUpsert) {
          pendingUpsert = null;
          return { data: { status: "active" }, error: null };
        }
        return { data: matchingRows()[0] ?? null, error: null };
      },
      async single() {
        if (pendingInsert) return applyInsert();
        if (pendingUpdate) return applyUpdate();
        if (pendingUpsert) {
          pendingUpsert = null;
          return { data: { status: "active" }, error: null };
        }
        const matched = matchingRows()[0] ?? null;
        return {
          data: matched,
          error: matched ? null : { message: "not found" },
        };
      },
      then(
        resolve: (value: {
          data: unknown;
          count: number;
          error: null;
        }) => void,
      ) {
        if (pendingInsert) {
          return Promise.resolve(applyInsert()).then(resolve as never);
        }
        if (pendingUpdate) {
          return Promise.resolve(applyUpdate()).then(resolve as never);
        }
        if (pendingUpsert) {
          pendingUpsert = null;
          return Promise.resolve({
            data: { status: "active" },
            count: 1,
            error: null,
          }).then(resolve as never);
        }
        const matched = matchingRows();
        return Promise.resolve({
          data: matched,
          count: matched.length,
          error: null,
        }).then(resolve);
      },
    };

    return builder;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin.auth.admin as any).createUser = async (attrs: {
    email?: string;
  }) => {
    const email = String(attrs.email || "");
    const existing = store.authUsersByEmail[email];
    if (existing) {
      return { data: { user: existing }, error: null };
    }
    const created = { id: `created-user-${email}`, email };
    store.authUsersByEmail[email] = created;
    return { data: { user: created }, error: null };
  };

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/auth/v1/admin/users")) {
      const email = url.searchParams.get("email") || "";
      const user = store.authUsersByEmail[email];
      return new Response(JSON.stringify({ users: user ? [user] : [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("not mocked", { status: 404 });
  }) as typeof fetch;

  return { ops };
}

function restoreMocks() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = originalFrom;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin.auth.admin as any).createUser = originalCreateUser;
  globalThis.fetch = originalFetch;
}

afterEach(() => {
  restoreMocks();
});

describe("Licensee Default Language — persistence / contract", () => {
  it("defaults to en and uses the existing six-language CHECK", () => {
    const migration = read(
      "supabase/migrations/20260915000003_add_licensee_default_language.sql",
    );
    assert.match(
      migration,
      /add column if not exists default_language text not null default 'en'/,
    );
    assert.match(migration, /licensee_accounts_default_language_check/);
    assert.match(
      migration,
      /check \(default_language in \('en', 'fr', 'es', 'it', 'de', 'pt'\)\)/,
    );
    assert.match(migration, /future Licensee sub-accounts/);
    assert.match(migration, /Does not override existing organizations/);
    assert.doesNotMatch(migration, /update\s+organizations/i);
    assert.doesNotMatch(migration, /athena_getoblic_directory_settings/);
    assert.doesNotMatch(migration, /licensee_monthly_fee_usd/);
    assert.doesNotMatch(migration, /create table/i);
    assert.deepEqual([...ORGANIZATION_LANGUAGES], [
      "en",
      "fr",
      "es",
      "it",
      "de",
      "pt",
    ]);
    assert.equal(DEFAULT_ORGANIZATION_LANGUAGE, "en");
  });

  it("application code reuses the existing organization-language contract", () => {
    const service = read(
      "services/superAdmin/superAdminLicenseeDefaultLanguage.ts",
    );
    const identity = read("services/licensee/licenseeIdentity.ts");
    const accounts = read("services/superAdmin/superAdminAccounts.ts");
    const subAccounts = read("services/licensee/licenseeSubAccounts.ts");
    const conversion = read(
      "services/licensee/licenseeProspectClientConversion.ts",
    );

    assert.match(service, /parseOrganizationLanguage/);
    assert.match(service, /resolveOrganizationLanguageValue/);
    assert.doesNotMatch(service, /\["en", "fr", "es", "it", "de", "pt"\]/);
    assert.match(identity, /resolveOrganizationLanguageValue/);
    assert.match(accounts, /parseOrganizationLanguage/);
    assert.match(subAccounts, /resolveOrganizationLanguageValue/);
    assert.match(conversion, /language:\s*input\.licenseeAccount\.default_language/);
    assert.equal(
      parseLicenseeDefaultLanguage(" FR "),
      "fr",
    );
  });
});

describe("Licensee Default Language — Super Admin create", () => {
  it("Create Licensee defaults to English when omitted", async () => {
    const store = baseStore();
    const { ops } = installStore(store);

    const result = await createLicenseeMasterAsSuperAdmin({
      actorUserId: SUPER_ADMIN_USER,
      email: "new-master@example.com",
    });

    assert.equal(result.email, "new-master@example.com");
    const insert = ops.find(
      (op) => op.op === "insert" && op.table === "licensee_accounts",
    );
    assert.ok(insert);
    assert.equal(insert?.values?.default_language, "en");
    assert.equal(
      ops.filter((op) => op.table === "organizations").length,
      0,
    );
  });

  it("selected Default Language reaches Master creation", async () => {
    const store = baseStore();
    const { ops } = installStore(store);

    await createLicenseeMasterAsSuperAdmin({
      actorUserId: SUPER_ADMIN_USER,
      email: "paris-master@example.com",
      defaultLanguage: "fr",
    });

    const insert = ops.find(
      (op) => op.op === "insert" && op.table === "licensee_accounts",
    );
    assert.equal(insert?.values?.default_language, "fr");
    assert.equal(
      ops.filter((op) => op.op === "insert" && op.table === "organizations")
        .length,
      0,
    );
  });

  it("invalid language is rejected server-side before Master insert", async () => {
    const store = baseStore();
    const { ops } = installStore(store);

    await assert.rejects(
      () =>
        createLicenseeMasterAsSuperAdmin({
          actorUserId: SUPER_ADMIN_USER,
          email: "bad-master@example.com",
          defaultLanguage: "en-US",
        }),
      (error: unknown) => {
        assert.ok(error instanceof SuperAdminOperationError);
        assert.equal(error.code, "INVALID_LANGUAGE");
        return true;
      },
    );
    assert.equal(
      ops.filter((op) => op.table === "licensee_accounts" && op.op === "insert")
        .length,
      0,
    );
  });
});

describe("Licensee Default Language — Super Admin update", () => {
  it("existing Licensees expose editable Default Language and persist at Master level", async () => {
    const store = baseStore();
    const { ops } = installStore(store);

    const listed = await listLicenseeDefaultLanguagesForSuperAdmin(
      SUPER_ADMIN_USER,
    );
    assert.equal(listed.length, 2);
    assert.equal(listed[0]?.defaultLanguage, "en");
    assert.equal(listed[1]?.defaultLanguage, "en");

    const result = await updateLicenseeDefaultLanguageForSuperAdmin({
      actorUserId: SUPER_ADMIN_USER,
      licenseeAccountId: LICENSEE_A,
      defaultLanguage: "es",
    });

    assert.equal(result.setting.defaultLanguage, "es");
    assert.equal(store.licenseeAccounts[0]?.default_language, "es");
    const update = ops.find(
      (op) => op.op === "update" && op.table === "licensee_accounts",
    );
    assert.ok(update);
    assert.equal(update?.values?.default_language, "es");
    assert.equal(
      ops.filter((op) => op.table === "organizations").length,
      0,
    );
    assert.equal(store.organizations[0]?.language, "de");
    assert.equal(store.organizations[1]?.language, "it");
  });

  it("rejects invalid language and does not write organizations", async () => {
    const store = baseStore();
    const { ops } = installStore(store);

    await assert.rejects(
      () =>
        updateLicenseeDefaultLanguageForSuperAdmin({
          actorUserId: SUPER_ADMIN_USER,
          licenseeAccountId: LICENSEE_A,
          defaultLanguage: "deutsch",
        }),
      (error: unknown) => {
        assert.ok(error instanceof SuperAdminLicenseeDefaultLanguageError);
        assert.equal(error.code, "INVALID_LANGUAGE");
        return true;
      },
    );
    assert.equal(ops.filter((op) => op.op === "update").length, 0);
    assert.equal(store.licenseeAccounts[0]?.default_language, "en");
    assert.equal(store.organizations[0]?.language, "de");
  });

  it("rejects Licensee Masters and tenants from the write path", async () => {
    installStore(baseStore());
    await assert.rejects(
      () =>
        updateLicenseeDefaultLanguageForSuperAdmin({
          actorUserId: LICENSEE_MASTER_USER,
          licenseeAccountId: LICENSEE_A,
          defaultLanguage: "fr",
        }),
      SuperAdminAccessError,
    );
    await assert.rejects(
      () =>
        updateLicenseeDefaultLanguageForSuperAdmin({
          actorUserId: TENANT_USER,
          licenseeAccountId: LICENSEE_A,
          defaultLanguage: "fr",
        }),
      SuperAdminAccessError,
    );
  });
});

describe("Licensee Default Language — future-only invariant", () => {
  it("changing Master default does not update existing organizations", async () => {
    const store = baseStore();
    const { ops } = installStore(store);

    await updateLicenseeDefaultLanguageForSuperAdmin({
      actorUserId: SUPER_ADMIN_USER,
      licenseeAccountId: LICENSEE_A,
      defaultLanguage: "pt",
    });

    assert.deepEqual(
      store.organizations.map((row) => row.language),
      ["de", "it"],
    );
    assert.equal(
      ops.filter((op) => op.table === "organizations").length,
      0,
    );

    const service = read(
      "services/superAdmin/superAdminLicenseeDefaultLanguage.ts",
    );
    assert.doesNotMatch(service, /from\("organizations"\)/);
    assert.doesNotMatch(service, /updateOrganizationLanguage/);
  });
});

describe("Licensee Default Language — isolation", () => {
  it("Default Language is absent from SuperAdminSubAccountCard", () => {
    const subAccountCard = read(
      "components/superAdmin/SuperAdminSubAccountCard.tsx",
    );
    assert.doesNotMatch(subAccountCard, /Default Language/);
    assert.doesNotMatch(subAccountCard, /defaultLanguage/);
    assert.doesNotMatch(subAccountCard, /ORGANIZATION_LANGUAGES/);
    assert.doesNotMatch(subAccountCard, /default_language/);
  });

  it("surfaces Default Language on the Licensee card and Create Licensee form", () => {
    const card = read("components/superAdmin/SuperAdminLicenseeCard.tsx");
    const client = read(
      "components/superAdmin/SuperAdminDashboardClient.tsx",
    );
    const page = read("app/super/page.tsx");
    const route = read("app/api/super/accounts/licensee/default-language/route.ts");

    assert.match(card, /LICENSEE_DEFAULT_LANGUAGE_LABEL/);
    assert.match(card, /ORGANIZATION_LANGUAGE_LABELS/);
    assert.match(card, /organizationLanguageLabel/);
    assert.match(client, /defaultLanguage: licenseeDefaultLanguage/);
    assert.match(client, /LICENSEE_DEFAULT_LANGUAGE_LABEL/);
    assert.match(client, /\/api\/super\/accounts\/licensee\/default-language/);
    assert.match(page, /listLicenseeDefaultLanguagesForSuperAdmin/);
    assert.match(route, /updateLicenseeDefaultLanguageForSuperAdmin/);
    assert.match(route, /export async function PATCH/);
    assert.doesNotMatch(route, /from\("organizations"\)/);
  });

  it("/licensee chrome is not localized by this field", () => {
    const licenseePage = read("app/licensee/page.tsx");
    const licenseeLogin = read("app/licensee/login/page.tsx");
    for (const source of [licenseePage, licenseeLogin]) {
      assert.doesNotMatch(source, /default_language/);
      assert.doesNotMatch(source, /getTenantLocalization/);
      assert.doesNotMatch(source, /resolveOrganizationLanguage/);
    }
  });

  it("ordinary Super Admin Athena creation remains unchanged", () => {
    const accounts = read("services/superAdmin/superAdminAccounts.ts");
    const start = accounts.indexOf(
      "export async function createAthenaAccountAsSuperAdmin",
    );
    const end = accounts.indexOf(
      "export async function createLicenseeMasterAsSuperAdmin",
      start,
    );
    const createAthena = accounts.slice(start, end);
    assert.match(createAthena, /parseOrganizationLanguage/);
    assert.match(createAthena, /Account Language/);
    assert.doesNotMatch(createAthena, /default_language/);
    assert.doesNotMatch(createAthena, /LICENSEE_DEFAULT_LANGUAGE_LABEL/);
  });

  it("does not introduce a second supported-language contract", () => {
    const files = [
      "services/superAdmin/superAdminLicenseeDefaultLanguage.ts",
      "services/superAdmin/superAdminLicenseeDefaultLanguageTypes.ts",
      "services/licensee/licenseeIdentity.ts",
      "services/superAdmin/superAdminAccounts.ts",
      "app/licensee/sub-accounts/new/page.tsx",
      "components/superAdmin/SuperAdminLicenseeCard.tsx",
      "components/superAdmin/SuperAdminDashboardClient.tsx",
    ];
    for (const file of files) {
      const source = read(file);
      assert.doesNotMatch(source, /\["en", "fr", "es", "it", "de", "pt"\]/);
    }
  });

  it("keeps Default Language off Licensee portal and commercial-fee / GetOblic writers", () => {
    const commercial = read(
      "services/superAdmin/superAdminLicenseeCommercialFees.ts",
    );
    const directory = read(
      "services/superAdmin/superAdminGetOblicDirectory.ts",
    );
    assert.doesNotMatch(commercial, /default_language/);
    assert.doesNotMatch(directory, /default_language/);

    const licenseeRoots = [
      "app/licensee",
      "components/licensee",
      "app/api/licensee",
    ];
    for (const root of licenseeRoots) {
      for (const file of walkSourceFiles(root)) {
        if (file === "app/licensee/sub-accounts/new/page.tsx") {
          continue;
        }
        const source = read(file);
        assert.doesNotMatch(
          source,
          /updateLicenseeDefaultLanguageForSuperAdmin|LICENSEE_DEFAULT_LANGUAGE_LABEL/,
          `${file} must not expose Super Admin Default Language controls`,
        );
      }
    }
  });
});
