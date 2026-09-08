import "../getoblicDirectory/getoblicDirectoryTestEnv";

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { GETOBLIC_DIRECTORY_SETTINGS_TABLE } from "../../services/getoblicDirectory/getoblicDirectoryTypes";
import { SuperAdminAccessError } from "../../services/superAdmin/superAdminIdentity";
import {
  assertValidMonthlyAllowance,
  listGetOblicDirectoryAllocationsForSuperAdmin,
  SuperAdminGetOblicDirectoryError,
  updateGetOblicDirectoryAllowanceForSuperAdmin,
} from "../../services/superAdmin/superAdminGetOblicDirectory";

const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);
const ROOT = process.cwd();

const SUPER_ADMIN_USER = "sa-user-1";
const LICENSEE_MASTER_USER = "lm-user-1";
const TENANT_USER = "tenant-user-1";
const LICENSEE_A = "licensee-a";
const LICENSEE_B = "licensee-b";
const ORG_GETOBLIC = "org-getoblic";
const ORG_V2 = "org-v2";
const ORG_OTHER = "org-other-licensee";
const ORG_LIANA = "org-liana";
const ORG_ARBITRARY = "org-arbitrary";

type SettingsRow = {
  organization_id: string;
  monthly_allowance: number;
  wordpress_author_id: number | null;
  getoblic_account_email?: string | null;
  getoblic_account_password_ciphertext?: string | null;
  created_at: string;
  updated_at: string;
  updated_by_user_id: string | null;
};

type EventRow = {
  id: string;
  organization_id: string;
  period_start: string;
};

type LinkRow = {
  id: string;
  organization_id: string;
  relationship_status: string;
};

type Op = {
  op: string;
  table: string;
  values?: Record<string, unknown>;
  options?: Record<string, unknown>;
};

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function defaultSettings(overrides: Partial<SettingsRow> = {}): SettingsRow {
  return {
    organization_id: ORG_GETOBLIC,
    monthly_allowance: 10,
    wordpress_author_id: 42,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    updated_by_user_id: null,
    ...overrides,
  };
}

function baseStore(overrides: {
  superAdmins?: { id: string; user_id: string; email: string }[];
  licenseeAccounts?: {
    id: string;
    user_id: string;
    email: string;
    own_company_organization_id: string | null;
  }[];
  licenseeSubAccounts?: {
    id: string;
    licensee_account_id: string;
    organization_id: string;
    display_name: string | null;
  }[];
  organizations?: { id: string; name: string }[];
  settings?: SettingsRow[];
  events?: EventRow[];
  links?: LinkRow[];
  failSettingsWrite?: boolean;
} = {}) {
  return {
    superAdmins: overrides.superAdmins ?? [
      { id: "sa-1", user_id: SUPER_ADMIN_USER, email: "super@getoblic.com" },
    ],
    licenseeAccounts: overrides.licenseeAccounts ?? [
      {
        id: LICENSEE_A,
        user_id: LICENSEE_MASTER_USER,
        email: "master-a@example.com",
        own_company_organization_id: ORG_GETOBLIC,
      },
      {
        id: LICENSEE_B,
        user_id: "lm-user-2",
        email: "master-b@example.com",
        own_company_organization_id: null,
      },
    ],
    licenseeSubAccounts: overrides.licenseeSubAccounts ?? [
      {
        id: "rel-1",
        licensee_account_id: LICENSEE_A,
        organization_id: ORG_GETOBLIC,
        display_name: "GetOblic HQ",
      },
      {
        id: "rel-2",
        licensee_account_id: LICENSEE_A,
        organization_id: ORG_V2,
        display_name: null,
      },
      {
        id: "rel-3",
        licensee_account_id: LICENSEE_B,
        organization_id: ORG_OTHER,
        display_name: null,
      },
    ],
    organizations: overrides.organizations ?? [
      { id: ORG_GETOBLIC, name: "GetOblic" },
      { id: ORG_V2, name: "V2 Test Client" },
      { id: ORG_OTHER, name: "Other Client" },
      { id: ORG_LIANA, name: "Liana" },
      { id: ORG_ARBITRARY, name: "Standalone Athena" },
    ],
    settings: overrides.settings ?? [],
    events: overrides.events ?? [],
    links: overrides.links ?? [],
    audit: [] as Record<string, unknown>[],
    failSettingsWrite: Boolean(overrides.failSettingsWrite),
  };
}

function installStore(store: ReturnType<typeof baseStore>): { ops: Op[] } {
  const ops: Op[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = (table: string) => {
    const filters: Record<string, unknown> = {};
    let countHead = false;
    let orderBy: { column: string; ascending: boolean } | null = null;
    let pendingInsert: Record<string, unknown> | null = null;
    let pendingUpsert: {
      values: Record<string, unknown>;
      options?: { onConflict?: string };
    } | null = null;

    const rowsForTable = (): Record<string, unknown>[] => {
      if (table === "getoblic_super_admins") {
        return store.superAdmins as unknown as Record<string, unknown>[];
      }
      if (table === "licensee_accounts") {
        return store.licenseeAccounts as unknown as Record<string, unknown>[];
      }
      if (table === "licensee_sub_accounts") {
        return store.licenseeSubAccounts as unknown as Record<string, unknown>[];
      }
      if (table === "organizations") {
        return store.organizations as unknown as Record<string, unknown>[];
      }
      if (table === GETOBLIC_DIRECTORY_SETTINGS_TABLE) {
        return store.settings as unknown as Record<string, unknown>[];
      }
      if (table === "athena_getoblic_listing_allocation_events") {
        return store.events as unknown as Record<string, unknown>[];
      }
      if (table === "athena_getoblic_listing_links") {
        return store.links as unknown as Record<string, unknown>[];
      }
      if (table === "getoblic_super_admin_audit") {
        return store.audit;
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
      const inserted = pendingInsert;
      pendingInsert = null;
      return { data: inserted, error: null };
    };

    const applyUpsert = () => {
      ops.push({
        op: "upsert",
        table,
        values: pendingUpsert?.values,
        options: pendingUpsert?.options,
      });
      if (store.failSettingsWrite) {
        pendingUpsert = null;
        return { data: null, error: { message: "settings write failed" } };
      }
      const values = pendingUpsert?.values ?? {};
      const organizationId = String(values.organization_id ?? "");
      const existing = store.settings.find(
        (row) => row.organization_id === organizationId,
      );
      if (existing) {
        if (Object.hasOwn(values, "monthly_allowance")) {
          existing.monthly_allowance = Number(values.monthly_allowance);
        }
        if (Object.hasOwn(values, "updated_at")) {
          existing.updated_at = String(values.updated_at);
        }
        if (Object.hasOwn(values, "updated_by_user_id")) {
          existing.updated_by_user_id = (values.updated_by_user_id as string) ?? null;
        }
        if (Object.hasOwn(values, "wordpress_author_id")) {
          existing.wordpress_author_id =
            (values.wordpress_author_id as number | null) ?? null;
        }
        pendingUpsert = null;
        return { data: { ...existing }, error: null };
      }

      const created: SettingsRow = {
        organization_id: organizationId,
        monthly_allowance: Number(values.monthly_allowance),
        wordpress_author_id: Object.hasOwn(values, "wordpress_author_id")
          ? ((values.wordpress_author_id as number | null) ?? null)
          : null,
        created_at: String(values.created_at ?? new Date().toISOString()),
        updated_at: String(values.updated_at ?? new Date().toISOString()),
        updated_by_user_id: (values.updated_by_user_id as string) ?? null,
      };
      store.settings.push(created);
      pendingUpsert = null;
      return { data: { ...created }, error: null };
    };

    const builder = {
      select(_columns?: string, options?: { count?: string; head?: boolean }) {
        countHead = Boolean(options?.head && options.count === "exact");
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
      upsert(
        values: Record<string, unknown>,
        options?: { onConflict?: string },
      ) {
        pendingUpsert = { values, options };
        return builder;
      },
      async maybeSingle() {
        if (pendingInsert) return applyInsert();
        if (pendingUpsert) return applyUpsert();
        return { data: matchingRows()[0] ?? null, error: null };
      },
      async single() {
        if (pendingInsert) return applyInsert();
        if (pendingUpsert) return applyUpsert();
        return { data: matchingRows()[0] ?? null, error: null };
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
        if (pendingUpsert) {
          return Promise.resolve(applyUpsert()).then(resolve as never);
        }
        const matched = matchingRows();
        return Promise.resolve({
          data: countHead ? null : matched,
          count: matched.length,
          error: null,
        }).then(resolve);
      },
    };

    return builder;
  };

  return { ops };
}

function restoreSupabaseAdmin() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = originalFrom;
}

afterEach(() => {
  restoreSupabaseAdmin();
});

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

describe("CO-1A Super Admin GetOblic listing allocation — read", () => {
  it("1. Super Admin read lists Licensee sub-accounts independently", async () => {
    const store = baseStore();
    const { ops } = installStore(store);

    const model =
      await listGetOblicDirectoryAllocationsForSuperAdmin(SUPER_ADMIN_USER);

    assert.equal(model.groups.length, 2);
    assert.equal(model.groups[0]?.masterEmail, "master-a@example.com");
    assert.equal(model.groups[0]?.subAccounts.length, 2);
    assert.equal(model.groups[0]?.subAccounts[0]?.organizationName, "GetOblic");
    assert.equal(model.groups[0]?.subAccounts[0]?.displayAlias, "GetOblic HQ");
    assert.equal(
      model.groups[0]?.subAccounts[1]?.organizationName,
      "V2 Test Client",
    );
    assert.equal(model.groups[1]?.masterEmail, "master-b@example.com");

    assert.equal(
      ops.some((op) => op.table === "athena_identity"),
      false,
    );
    assert.equal(
      ops.some((op) => op.op === "upsert" || op.op === "insert"),
      false,
    );
    assert.doesNotMatch(
      read("services/superAdmin/superAdminGetOblicDirectory.ts"),
      /listLicenseeSubAccountsForMaster/,
    );
  });

  it("2. Missing settings returns configured=false, not allowance=0", async () => {
    installStore(baseStore());
    const model =
      await listGetOblicDirectoryAllocationsForSuperAdmin(SUPER_ADMIN_USER);
    const row = model.groups[0]?.subAccounts.find(
      (item) => item.organizationId === ORG_V2,
    );
    assert.ok(row);
    assert.equal(row?.configured, false);
    assert.equal(row?.listingCapacity, null);
    assert.equal(row?.currentlyHeld, null);
    assert.equal(row?.available, null);
  });

  it("3. Own-company organization is identified correctly", async () => {
    installStore(baseStore());
    const model =
      await listGetOblicDirectoryAllocationsForSuperAdmin(SUPER_ADMIN_USER);
    const own = model.groups[0]?.subAccounts.find(
      (item) => item.organizationId === ORG_GETOBLIC,
    );
    const other = model.groups[0]?.subAccounts.find(
      (item) => item.organizationId === ORG_V2,
    );
    assert.equal(own?.isOwnCompany, true);
    assert.equal(other?.isOwnCompany, false);
    assert.equal(model.groups[0]?.ownCompanyOrganizationId, ORG_GETOBLIC);
  });

  it("4. Non-Licensee organizations are excluded", async () => {
    installStore(baseStore());
    const model =
      await listGetOblicDirectoryAllocationsForSuperAdmin(SUPER_ADMIN_USER);
    const organizationIds = model.groups.flatMap((group) =>
      group.subAccounts.map((row) => row.organizationId),
    );
    assert.equal(organizationIds.includes(ORG_LIANA), false);
    assert.equal(organizationIds.includes(ORG_ARBITRARY), false);
    assert.equal(
      model.groups.some((group) =>
        group.subAccounts.some((row) => row.organizationName === "Liana"),
      ),
      false,
    );
  });
});

describe("CO-1A Super Admin GetOblic listing allocation — write", () => {
  it("5. Super Admin can create the first settings row", async () => {
    const store = baseStore();
    const { ops } = installStore(store);

    const result = await updateGetOblicDirectoryAllowanceForSuperAdmin({
      actorUserId: SUPER_ADMIN_USER,
      licenseeAccountId: LICENSEE_A,
      organizationId: ORG_V2,
      listingCapacity: 10,
    });

    assert.equal(result.allocation.configured, true);
    assert.equal(result.allocation.listingCapacity, 10);
    assert.equal(store.settings.length, 1);
    assert.equal(store.settings[0]?.organization_id, ORG_V2);
    assert.equal(store.settings[0]?.monthly_allowance, 10);
    const upsert = ops.find(
      (op) => op.op === "upsert" && op.table === GETOBLIC_DIRECTORY_SETTINGS_TABLE,
    );
    assert.ok(upsert);
    assert.equal(upsert?.options?.onConflict, "organization_id");
    assert.deepEqual(Object.keys(upsert?.values ?? {}).sort(), [
      "monthly_allowance",
      "organization_id",
      "updated_at",
      "updated_by_user_id",
    ]);
    assert.equal(Object.hasOwn(upsert?.values ?? {}, "wordpress_author_id"), false);
  });

  it("6/7. Super Admin can update an existing allowance and preserve wordpress_author_id", async () => {
    const store = baseStore({
      settings: [defaultSettings({ monthly_allowance: 4, wordpress_author_id: 42 })],
    });
    const { ops } = installStore(store);

    const result = await updateGetOblicDirectoryAllowanceForSuperAdmin({
      actorUserId: SUPER_ADMIN_USER,
      licenseeAccountId: LICENSEE_A,
      organizationId: ORG_GETOBLIC,
      listingCapacity: 12,
    });

    assert.equal(result.allocation.configured, true);
    assert.equal(result.allocation.listingCapacity, 12);
    assert.equal(store.settings[0]?.monthly_allowance, 12);
    assert.equal(store.settings[0]?.wordpress_author_id, 42);
    const upsert = ops.find(
      (op) => op.op === "upsert" && op.table === GETOBLIC_DIRECTORY_SETTINGS_TABLE,
    );
    assert.equal(Object.hasOwn(upsert?.values ?? {}, "wordpress_author_id"), false);
  });

  it("8. Updating one sub-account does not modify another", async () => {
    const store = baseStore({
      settings: [
        defaultSettings({ monthly_allowance: 4, wordpress_author_id: 42 }),
        defaultSettings({
          organization_id: ORG_V2,
          monthly_allowance: 8,
          wordpress_author_id: 99,
        }),
      ],
    });
    installStore(store);

    await updateGetOblicDirectoryAllowanceForSuperAdmin({
      actorUserId: SUPER_ADMIN_USER,
      licenseeAccountId: LICENSEE_A,
      organizationId: ORG_GETOBLIC,
      listingCapacity: 15,
    });

    assert.equal(store.settings[0]?.organization_id, ORG_GETOBLIC);
    assert.equal(store.settings[0]?.monthly_allowance, 15);
    assert.equal(store.settings[1]?.organization_id, ORG_V2);
    assert.equal(store.settings[1]?.monthly_allowance, 8);
    assert.equal(store.settings[1]?.wordpress_author_id, 99);
  });

  it("9. 0 is accepted and remains configured", async () => {
    const store = baseStore();
    installStore(store);

    const result = await updateGetOblicDirectoryAllowanceForSuperAdmin({
      actorUserId: SUPER_ADMIN_USER,
      licenseeAccountId: LICENSEE_A,
      organizationId: ORG_V2,
      listingCapacity: 0,
    });

    assert.equal(result.allocation.configured, true);
    assert.equal(result.allocation.listingCapacity, 0);
    assert.equal(store.settings[0]?.monthly_allowance, 0);

    const listed =
      await listGetOblicDirectoryAllocationsForSuperAdmin(SUPER_ADMIN_USER);
    const row = listed.groups[0]?.subAccounts.find(
      (item) => item.organizationId === ORG_V2,
    );
    assert.equal(row?.configured, true);
    assert.equal(row?.listingCapacity, 0);
  });

  it("10-13. Negative, float, blank/null, and numeric string are rejected", () => {
    assert.throws(
      () => assertValidMonthlyAllowance(-1),
      (error: unknown) => {
        assert.ok(error instanceof SuperAdminGetOblicDirectoryError);
        assert.equal(error.code, "INVALID_CAPACITY");
        return true;
      },
    );
    assert.throws(
      () => assertValidMonthlyAllowance(1.5),
      (error: unknown) => {
        assert.ok(error instanceof SuperAdminGetOblicDirectoryError);
        assert.equal(error.code, "INVALID_CAPACITY");
        return true;
      },
    );
    assert.throws(
      () => assertValidMonthlyAllowance(null),
      (error: unknown) => {
        assert.ok(error instanceof SuperAdminGetOblicDirectoryError);
        assert.equal(error.code, "INVALID_CAPACITY");
        return true;
      },
    );
    assert.throws(
      () => assertValidMonthlyAllowance(""),
      (error: unknown) => {
        assert.ok(error instanceof SuperAdminGetOblicDirectoryError);
        assert.equal(error.code, "INVALID_CAPACITY");
        return true;
      },
    );
    assert.throws(
      () => assertValidMonthlyAllowance(Number.NaN),
      (error: unknown) => {
        assert.ok(error instanceof SuperAdminGetOblicDirectoryError);
        assert.equal(error.code, "INVALID_CAPACITY");
        return true;
      },
    );
    assert.throws(
      () => assertValidMonthlyAllowance("10"),
      (error: unknown) => {
        assert.ok(error instanceof SuperAdminGetOblicDirectoryError);
        assert.equal(error.code, "INVALID_CAPACITY");
        return true;
      },
    );
  });

  it("10-13. Service write rejects invalid allowances before persistence", async () => {
    const store = baseStore();
    installStore(store);

    for (const listingCapacity of [-1, 1.5, null, "", Number.NaN, "10"]) {
      await assert.rejects(
        () =>
          updateGetOblicDirectoryAllowanceForSuperAdmin({
            actorUserId: SUPER_ADMIN_USER,
            licenseeAccountId: LICENSEE_A,
            organizationId: ORG_V2,
            listingCapacity,
          }),
        (error: unknown) => {
          assert.ok(error instanceof SuperAdminGetOblicDirectoryError);
          assert.equal(error.code, "INVALID_CAPACITY");
          return true;
        },
      );
    }

    assert.equal(store.settings.length, 0);
  });

  it("14. Organization must belong to the supplied Licensee", async () => {
    installStore(baseStore());
    await assert.rejects(
      () =>
        updateGetOblicDirectoryAllowanceForSuperAdmin({
          actorUserId: SUPER_ADMIN_USER,
          licenseeAccountId: LICENSEE_A,
          organizationId: ORG_OTHER,
          listingCapacity: 5,
        }),
      (error: unknown) => {
        assert.ok(error instanceof SuperAdminGetOblicDirectoryError);
        assert.equal(error.code, "RELATIONSHIP_NOT_FOUND");
        assert.equal(error.status, 404);
        return true;
      },
    );
  });

  it("15. Arbitrary organization cannot be configured", async () => {
    installStore(baseStore());
    await assert.rejects(
      () =>
        updateGetOblicDirectoryAllowanceForSuperAdmin({
          actorUserId: SUPER_ADMIN_USER,
          licenseeAccountId: LICENSEE_A,
          organizationId: ORG_ARBITRARY,
          listingCapacity: 5,
        }),
      (error: unknown) => {
        assert.ok(error instanceof SuperAdminGetOblicDirectoryError);
        assert.equal(error.code, "RELATIONSHIP_NOT_FOUND");
        return true;
      },
    );
  });
});

describe("CO-1A Super Admin GetOblic listing allocation — authorization and audit", () => {
  it("16. Licensee Master cannot use the Super Admin service", async () => {
    installStore(baseStore());
    await assert.rejects(
      () => listGetOblicDirectoryAllocationsForSuperAdmin(LICENSEE_MASTER_USER),
      (error: unknown) => {
        assert.ok(error instanceof SuperAdminAccessError);
        return true;
      },
    );
    await assert.rejects(
      () =>
        updateGetOblicDirectoryAllowanceForSuperAdmin({
          actorUserId: LICENSEE_MASTER_USER,
          licenseeAccountId: LICENSEE_A,
          organizationId: ORG_GETOBLIC,
          listingCapacity: 5,
        }),
      (error: unknown) => {
        assert.ok(error instanceof SuperAdminAccessError);
        return true;
      },
    );
  });

  it("17. Tenant user cannot use the Super Admin service", async () => {
    installStore(baseStore());
    await assert.rejects(
      () => listGetOblicDirectoryAllocationsForSuperAdmin(TENANT_USER),
      (error: unknown) => {
        assert.ok(error instanceof SuperAdminAccessError);
        return true;
      },
    );
    await assert.rejects(
      () =>
        updateGetOblicDirectoryAllowanceForSuperAdmin({
          actorUserId: TENANT_USER,
          licenseeAccountId: LICENSEE_A,
          organizationId: ORG_GETOBLIC,
          listingCapacity: 5,
        }),
      (error: unknown) => {
        assert.ok(error instanceof SuperAdminAccessError);
        return true;
      },
    );
  });

  it("18/19. Successful update writes an audit entry with previous and next allowance", async () => {
    const store = baseStore({
      settings: [defaultSettings({ monthly_allowance: 4 })],
    });
    installStore(store);

    await updateGetOblicDirectoryAllowanceForSuperAdmin({
      actorUserId: SUPER_ADMIN_USER,
      licenseeAccountId: LICENSEE_A,
      organizationId: ORG_GETOBLIC,
      listingCapacity: 9,
    });

    assert.equal(store.audit.length, 1);
    assert.equal(store.audit[0]?.action, "update_getoblic_directory_allowance");
    assert.equal(store.audit[0]?.actor_user_id, SUPER_ADMIN_USER);
    const metadata = store.audit[0]?.metadata as Record<string, unknown>;
    assert.equal(metadata.licenseeAccountId, LICENSEE_A);
    assert.equal(metadata.organizationId, ORG_GETOBLIC);
    assert.equal(metadata.previousAllowance, 4);
    assert.equal(metadata.nextAllowance, 9);
    assert.equal(Object.hasOwn(metadata, "wordpress_author_id"), false);
  });

  it("18/19. First configuration audits previousAllowance as null", async () => {
    const store = baseStore();
    installStore(store);

    await updateGetOblicDirectoryAllowanceForSuperAdmin({
      actorUserId: SUPER_ADMIN_USER,
      licenseeAccountId: LICENSEE_A,
      organizationId: ORG_V2,
      listingCapacity: 3,
    });

    const metadata = store.audit[0]?.metadata as Record<string, unknown>;
    assert.equal(metadata.previousAllowance, null);
    assert.equal(metadata.nextAllowance, 3);
  });
});

describe("CO-1A Super Admin GetOblic listing allocation — usage and contracts", () => {
  it("lists currently held active listings for a configured organization", async () => {
    installStore(
      baseStore({
        settings: [defaultSettings({ monthly_allowance: 10 })],
        links: [
          { id: "l1", organization_id: ORG_GETOBLIC, relationship_status: "linked" },
          { id: "l2", organization_id: ORG_GETOBLIC, relationship_status: "claiming" },
          {
            id: "l3",
            organization_id: ORG_GETOBLIC,
            relationship_status: "released",
          },
          { id: "l4", organization_id: ORG_V2, relationship_status: "linked" },
        ],
      }),
    );

    const model =
      await listGetOblicDirectoryAllocationsForSuperAdmin(SUPER_ADMIN_USER);
    const row = model.groups[0]?.subAccounts.find(
      (item) => item.organizationId === ORG_GETOBLIC,
    );
    assert.equal(row?.configured, true);
    assert.equal(row?.listingCapacity, 10);
    assert.equal(row?.currentlyHeld, 2);
    assert.equal(row?.available, 8);
  });

  it("20. Existing GetOblic search behavior remains settings-independent", () => {
    const search = read(
      "services/getoblicDirectory/getoblicDirectorySearchService.ts",
    );
    assert.doesNotMatch(search, /getGetOblicDirectorySettings/);
    assert.doesNotMatch(search, /getGetOblicAllocationUsage/);
    assert.doesNotMatch(search, /monthly_allowance/);
    assert.doesNotMatch(
      search,
      /listGetOblicDirectoryAllocationsForSuperAdmin|updateGetOblicDirectoryAllowanceForSuperAdmin/,
    );
  });

  it("21. Existing conversion still fails closed when settings are missing", () => {
    const convert = read(
      "services/getoblicDirectory/getoblicDirectoryConvertService.ts",
    );
    assert.match(convert, /settings_missing/);
    assert.match(convert, /GETOBLIC_DIRECTORY_NOT_CONFIGURED/);
    assert.match(convert, /getSettings/);
  });

  it("22. Existing claim still uses settings and reserves capacity in SQL", () => {
    const claim = read(
      "services/getoblicDirectory/getoblicDirectoryClaimService.ts",
    );
    assert.match(claim, /getGetOblicDirectorySettings/);
    assert.match(claim, /RESERVE_GETOBLIC_LISTING_CAPACITY_RPC/);
    assert.match(claim, /reserveGetOblicListingCapacity/);
    assert.match(claim, /reserve_getoblic_listing_capacity/);
    assert.doesNotMatch(claim, /updateGetOblicDirectoryAllowanceForSuperAdmin/);
    assert.doesNotMatch(claim, /monthly_allowance:\s/);
  });

  it("23. No code path other than this Super Admin service becomes a new writer of monthly_allowance", () => {
    const writer = read("services/superAdmin/superAdminGetOblicDirectory.ts");
    const allowanceStart = writer.indexOf(
      "export async function updateGetOblicDirectoryAllowanceForSuperAdmin",
    );
    const accountStart = writer.indexOf(
      "export async function updateGetOblicDirectoryAccountForSuperAdmin",
    );
    assert.ok(allowanceStart >= 0);
    assert.ok(accountStart > allowanceStart);
    const allowanceWriter = writer.slice(allowanceStart, accountStart);
    assert.match(allowanceWriter, /monthly_allowance: listingCapacity/);
    assert.match(allowanceWriter, /onConflict: "organization_id"/);
    assert.doesNotMatch(allowanceWriter, /wordpress_author_id:/);

    const roots = ["services", "app", "components", "lib"];
    for (const root of roots) {
      for (const file of walkSourceFiles(root)) {
        if (file === "services/superAdmin/superAdminGetOblicDirectory.ts") {
          continue;
        }
        const source = read(file);
        if (!source.includes("monthly_allowance")) {
          continue;
        }
        assert.doesNotMatch(
          source,
          /\.(upsert|insert)\([\s\S]{0,500}monthly_allowance/,
          `${file} must not write monthly_allowance`,
        );
      }
    }
  });

  it("24. No migration is added", () => {
    const migrations = readdirSync(join(ROOT, "supabase/migrations"));
    assert.equal(
      migrations.some(
        (file) =>
          file.startsWith("20260908") ||
          /super_admin.*getoblic|getoblic.*allocation.*super/i.test(file),
      ),
      false,
    );
    assert.ok(
      migrations.includes("20260906000001_create_athena_getoblic_directory.sql"),
    );
    assert.ok(
      migrations.includes("20260906000002_consume_getoblic_listing_allocation.sql"),
    );
  });

  it("25. No WordPress or OpenRouter calls are introduced", () => {
    const files = [
      "services/superAdmin/superAdminGetOblicDirectory.ts",
      "app/api/super/getoblic-directory/settings/route.ts",
      "app/super/page.tsx",
      "components/superAdmin/SuperAdminDashboardClient.tsx",
    ];
    for (const file of files) {
      const source = read(file);
      assert.doesNotMatch(source, /openrouter|OPENROUTER/i);
      assert.doesNotMatch(source, /getoblicWordpressClient|searchWordpressListings/);
      assert.doesNotMatch(source, /wp-json|wordpress\.com|ATHENA_V2_DIRECTORY_API_KEY/);
    }
  });
});

describe("CO-1A Super Admin GetOblic listing allocation — surface contracts", () => {
  it("API route follows existing Super Admin authorization and error envelope", () => {
    const route = read("app/api/super/getoblic-directory/settings/route.ts");
    assert.match(route, /export async function PUT/);
    assert.match(route, /createSupabaseServerClient/);
    assert.match(route, /updateGetOblicDirectoryAllowanceForSuperAdmin/);
    assert.match(route, /typeof body\.listingCapacity !== "number"/);
    assert.match(route, /INVALID_CAPACITY/);
    assert.match(route, /UNAUTHORIZED/);
    assert.match(route, /NOT_SUPER_ADMIN/);
    assert.match(route, /ACCOUNT_NOT_FOUND/);
    assert.match(route, /SETTINGS_WRITE_FAILED/);
    assert.match(route, /SuperAdminAccessError/);
    assert.doesNotMatch(route, /export async function GET/);
    assert.doesNotMatch(route, /listLicenseeSubAccountsForMaster/);
  });

  it("Super Admin page SSR-loads allocations without tenant intelligence", () => {
    const page = read("app/super/page.tsx");
    assert.match(page, /listGetOblicDirectoryAllocationsForSuperAdmin/);
    assert.match(page, /initialDirectoryAllocations/);
    assert.doesNotMatch(page, /listLicenseeSubAccountsForMaster/);
    assert.doesNotMatch(page, /athena_identity|logoPreview|accountReadiness|impersonat/i);
    assert.doesNotMatch(page, /wordpress_author_id/);
  });

  it("dashboard section implements the Super Admin allocation UI states", () => {
    const dashboard = read(
      "components/superAdmin/SuperAdminDashboardClient.tsx",
    );
    assert.match(dashboard, /GetOblic Listing Capacity/);
    assert.match(
      dashboard,
      /Concurrent GetOblic listing capacity per Licensee sub-account\.\s+Licensee Masters and tenant users cannot change this\./,
    );
    assert.match(dashboard, /Not configured/);
    assert.match(
      dashboard,
      /Conversions are blocked until listing capacity is set\./,
    );
    assert.match(dashboard, /Configured/);
    assert.match(dashboard, /New GetOblic conversions are blocked\./);
    assert.match(dashboard, /currently held of/);
    assert.match(dashboard, /GetOblic listing capacity/);
    assert.match(dashboard, /Own company/);
    assert.match(dashboard, /saveDirectoryAllowance/);
    assert.match(dashboard, /\/api\/super\/getoblic-directory\/settings/);
    assert.doesNotMatch(dashboard, /Save all|bulk-save|bulkSave/i);
    assert.doesNotMatch(dashboard, /wordpress_author_id/);
    assert.doesNotMatch(dashboard, /loginAs|login-as|Impersonate/);
    assert.doesNotMatch(
      dashboard,
      /athena_identity|logoPreview|accountReadiness|prospectCount/,
    );
  });

  it("audit action is registered on the existing Super Admin audit mechanism", () => {
    const audit = read("services/superAdmin/superAdminAuditLog.ts");
    assert.match(audit, /update_getoblic_directory_allowance/);
    assert.match(audit, /getoblic_super_admin_audit/);
  });
});
