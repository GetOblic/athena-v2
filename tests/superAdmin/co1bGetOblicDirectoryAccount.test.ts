import "../getoblicDirectory/getoblicDirectoryTestEnv";

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { decryptSecret, encryptSecret } from "../../lib/serverEncryptedSecret";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { GETOBLIC_DIRECTORY_SETTINGS_TABLE } from "../../services/getoblicDirectory/getoblicDirectoryTypes";
import { SuperAdminAccessError } from "../../services/superAdmin/superAdminIdentity";
import {
  listGetOblicDirectoryAllocationsForSuperAdmin,
  SuperAdminGetOblicDirectoryError,
  updateGetOblicDirectoryAccountForSuperAdmin,
  updateGetOblicDirectoryAllowanceForSuperAdmin,
} from "../../services/superAdmin/superAdminGetOblicDirectory";

const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);
const ROOT = process.cwd();
const TEST_ENCRYPTION_KEY = "a".repeat(64);

const SUPER_ADMIN_USER = "sa-user-1";
const LICENSEE_MASTER_USER = "lm-user-1";
const TENANT_USER = "tenant-user-1";
const LICENSEE_A = "licensee-a";
const LICENSEE_B = "licensee-b";
const ORG_GETOBLIC = "org-getoblic";
const ORG_V2 = "org-v2";
const ORG_OTHER = "org-other-licensee";

type SettingsRow = {
  organization_id: string;
  monthly_allowance: number;
  wordpress_author_id: number | null;
  getoblic_account_email: string | null;
  getoblic_account_password_ciphertext: string | null;
  created_at: string;
  updated_at: string;
  updated_by_user_id: string | null;
};

type Op = {
  op: string;
  table: string;
  values?: Record<string, unknown>;
  select?: string;
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

function defaultSettings(overrides: Partial<SettingsRow> = {}): SettingsRow {
  return {
    organization_id: ORG_GETOBLIC,
    monthly_allowance: 10,
    wordpress_author_id: null,
    getoblic_account_email: null,
    getoblic_account_password_ciphertext: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    updated_by_user_id: null,
    ...overrides,
  };
}

function baseStore(
  overrides: {
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
    failSettingsWrite?: boolean;
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
    ],
    settings: overrides.settings ?? [],
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
    let pendingUpdate: Record<string, unknown> | null = null;
    let selectedColumns = "";

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
        return [];
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
          existing.updated_by_user_id =
            (values.updated_by_user_id as string) ?? null;
        }
        pendingUpsert = null;
        return { data: { ...existing }, error: null };
      }
      const created: SettingsRow = {
        organization_id: organizationId,
        monthly_allowance: Number(values.monthly_allowance),
        wordpress_author_id: null,
        getoblic_account_email: null,
        getoblic_account_password_ciphertext: null,
        created_at: String(values.created_at ?? new Date().toISOString()),
        updated_at: String(values.updated_at ?? new Date().toISOString()),
        updated_by_user_id: (values.updated_by_user_id as string) ?? null,
      };
      store.settings.push(created);
      pendingUpsert = null;
      return { data: { ...created }, error: null };
    };

    const applyUpdate = () => {
      ops.push({
        op: "update",
        table,
        values: pendingUpdate ?? undefined,
        select: selectedColumns,
      });
      if (store.failSettingsWrite) {
        pendingUpdate = null;
        return { data: null, error: { message: "settings write failed" } };
      }
      const values = pendingUpdate ?? {};
      const existing = matchingRows()[0] as SettingsRow | undefined;
      if (!existing) {
        pendingUpdate = null;
        return { data: null, error: null };
      }
      if (Object.hasOwn(values, "getoblic_account_email")) {
        existing.getoblic_account_email =
          (values.getoblic_account_email as string | null) ?? null;
      }
      if (Object.hasOwn(values, "getoblic_account_password_ciphertext")) {
        existing.getoblic_account_password_ciphertext =
          (values.getoblic_account_password_ciphertext as string | null) ??
          null;
      }
      if (Object.hasOwn(values, "wordpress_author_id")) {
        existing.wordpress_author_id =
          (values.wordpress_author_id as number | null) ?? null;
      }
      if (Object.hasOwn(values, "monthly_allowance")) {
        existing.monthly_allowance = Number(values.monthly_allowance);
      }
      if (Object.hasOwn(values, "updated_at")) {
        existing.updated_at = String(values.updated_at);
      }
      if (Object.hasOwn(values, "updated_by_user_id")) {
        existing.updated_by_user_id =
          (values.updated_by_user_id as string) ?? null;
      }
      pendingUpdate = null;
      return { data: { ...existing }, error: null };
    };

    const builder = {
      select(columns?: string, options?: { count?: string; head?: boolean }) {
        selectedColumns = columns ?? "";
        countHead = Boolean(options?.head && options.count === "exact");
        ops.push({ op: "select", table, select: selectedColumns });
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
      update(values: Record<string, unknown>) {
        pendingUpdate = values;
        return builder;
      },
      async maybeSingle() {
        if (pendingInsert) return applyInsert();
        if (pendingUpsert) return applyUpsert();
        if (pendingUpdate) return applyUpdate();
        return { data: matchingRows()[0] ?? null, error: null };
      },
      async single() {
        if (pendingInsert) return applyInsert();
        if (pendingUpsert) return applyUpsert();
        if (pendingUpdate) return applyUpdate();
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
        if (pendingUpdate) {
          return Promise.resolve(applyUpdate()).then(resolve as never);
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

function assertSafeDto(value: unknown) {
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(serialized, /getoblic_account_password_ciphertext/);
  assert.doesNotMatch(serialized, /ATHENA_SECRET_ENCRYPTION_KEY/);
  assert.doesNotMatch(serialized, /"password"\s*:/);
  if (value && typeof value === "object") {
    assert.equal(
      Object.hasOwn(value as object, "getoblic_account_password_ciphertext"),
      false,
    );
    assert.equal(Object.hasOwn(value as object, "password"), false);
  }
}

before(() => {
  process.env.ATHENA_SECRET_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
});

beforeEach(() => {
  process.env.ATHENA_SECRET_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
});

afterEach(() => {
  restoreSupabaseAdmin();
  process.env.ATHENA_SECRET_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
});

describe("CO-1B Super Admin GetOblic.com account — authorization", () => {
  it("Super Admin is allowed to save an account", async () => {
    const store = baseStore({
      settings: [defaultSettings({ monthly_allowance: 300 })],
    });
    const { ops } = installStore(store);

    const result = await updateGetOblicDirectoryAccountForSuperAdmin({
      actorUserId: SUPER_ADMIN_USER,
      licenseeAccountId: LICENSEE_A,
      organizationId: ORG_GETOBLIC,
      email: "owner@getoblic.com",
      password: "first-password",
      wordpressUserId: 271519816,
    });

    assert.equal(result.allocation.getoblicAccountEmail, "owner@getoblic.com");
    assert.equal(result.allocation.wordpressUserId, 271519816);
    assert.equal(result.allocation.hasGetOblicPassword, true);
    assert.equal(
      ops.some(
        (op) =>
          op.op === "update" && op.table === GETOBLIC_DIRECTORY_SETTINGS_TABLE,
      ),
      true,
    );
    assertSafeDto(result.allocation);
  });

  it("Licensee Master is forbidden", async () => {
    installStore(baseStore({ settings: [defaultSettings()] }));
    await assert.rejects(
      () =>
        updateGetOblicDirectoryAccountForSuperAdmin({
          actorUserId: LICENSEE_MASTER_USER,
          licenseeAccountId: LICENSEE_A,
          organizationId: ORG_GETOBLIC,
          email: "owner@getoblic.com",
          password: "secret",
          wordpressUserId: 12,
        }),
      (error: unknown) => {
        assert.ok(error instanceof SuperAdminAccessError);
        return true;
      },
    );
  });

  it("tenant user is forbidden", async () => {
    installStore(baseStore({ settings: [defaultSettings()] }));
    await assert.rejects(
      () =>
        updateGetOblicDirectoryAccountForSuperAdmin({
          actorUserId: TENANT_USER,
          licenseeAccountId: LICENSEE_A,
          organizationId: ORG_GETOBLIC,
          email: "owner@getoblic.com",
          password: "secret",
          wordpressUserId: 12,
        }),
      (error: unknown) => {
        assert.ok(error instanceof SuperAdminAccessError);
        return true;
      },
    );
  });

  it("rejects a wrong Licensee / organization relationship", async () => {
    installStore(baseStore({ settings: [defaultSettings()] }));
    await assert.rejects(
      () =>
        updateGetOblicDirectoryAccountForSuperAdmin({
          actorUserId: SUPER_ADMIN_USER,
          licenseeAccountId: LICENSEE_A,
          organizationId: ORG_OTHER,
          email: "owner@getoblic.com",
          password: "secret",
          wordpressUserId: 12,
        }),
      (error: unknown) => {
        assert.ok(error instanceof SuperAdminGetOblicDirectoryError);
        assert.equal(error.code, "RELATIONSHIP_NOT_FOUND");
        return true;
      },
    );
  });

  it("rejects a missing settings row", async () => {
    const store = baseStore({ settings: [] });
    installStore(store);
    await assert.rejects(
      () =>
        updateGetOblicDirectoryAccountForSuperAdmin({
          actorUserId: SUPER_ADMIN_USER,
          licenseeAccountId: LICENSEE_A,
          organizationId: ORG_GETOBLIC,
          email: "owner@getoblic.com",
          password: "secret",
          wordpressUserId: 12,
        }),
      (error: unknown) => {
        assert.ok(error instanceof SuperAdminGetOblicDirectoryError);
        assert.equal(error.code, "SETTINGS_NOT_CONFIGURED");
        return true;
      },
    );
    assert.equal(store.settings.length, 0);
  });
});

describe("CO-1B Super Admin GetOblic.com account — write", () => {
  it("first account save requires a password", async () => {
    const store = baseStore({ settings: [defaultSettings()] });
    installStore(store);
    await assert.rejects(
      () =>
        updateGetOblicDirectoryAccountForSuperAdmin({
          actorUserId: SUPER_ADMIN_USER,
          licenseeAccountId: LICENSEE_A,
          organizationId: ORG_GETOBLIC,
          email: "owner@getoblic.com",
          password: "",
          wordpressUserId: 12,
        }),
      (error: unknown) => {
        assert.ok(error instanceof SuperAdminGetOblicDirectoryError);
        assert.equal(error.code, "PASSWORD_REQUIRED");
        return true;
      },
    );
    assert.equal(store.settings[0]?.getoblic_account_email, null);
  });

  it("stores a valid email and WordPress user ID", async () => {
    const store = baseStore({ settings: [defaultSettings()] });
    installStore(store);

    const result = await updateGetOblicDirectoryAccountForSuperAdmin({
      actorUserId: SUPER_ADMIN_USER,
      licenseeAccountId: LICENSEE_A,
      organizationId: ORG_GETOBLIC,
      email: "  owner@getoblic.com  ",
      password: "first-password",
      wordpressUserId: 88,
    });

    assert.equal(store.settings[0]?.getoblic_account_email, "owner@getoblic.com");
    assert.equal(store.settings[0]?.wordpress_author_id, 88);
    assert.equal(result.allocation.getoblicAccountEmail, "owner@getoblic.com");
    assert.equal(result.allocation.wordpressUserId, 88);
  });

  it("encrypts the password before persistence in v1 format", async () => {
    const store = baseStore({ settings: [defaultSettings()] });
    const { ops } = installStore(store);
    const plaintext = "first-password";

    await updateGetOblicDirectoryAccountForSuperAdmin({
      actorUserId: SUPER_ADMIN_USER,
      licenseeAccountId: LICENSEE_A,
      organizationId: ORG_GETOBLIC,
      email: "owner@getoblic.com",
      password: plaintext,
      wordpressUserId: 12,
    });

    const update = ops.find(
      (op) =>
        op.op === "update" && op.table === GETOBLIC_DIRECTORY_SETTINGS_TABLE,
    );
    const ciphertext = String(
      update?.values?.getoblic_account_password_ciphertext ?? "",
    );
    assert.ok(ciphertext);
    assert.notEqual(ciphertext, plaintext);
    assert.match(ciphertext, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.equal(decryptSecret(ciphertext), plaintext);
    assert.equal(store.settings[0]?.getoblic_account_password_ciphertext, ciphertext);
    assert.doesNotMatch(JSON.stringify(update?.values ?? {}), /first-password/);
  });

  it("blank password preserves existing ciphertext", async () => {
    const existing = encryptSecret("keep-this-password");
    const store = baseStore({
      settings: [
        defaultSettings({
          getoblic_account_email: "old@getoblic.com",
          getoblic_account_password_ciphertext: existing,
          wordpress_author_id: 7,
        }),
      ],
    });
    const { ops } = installStore(store);

    await updateGetOblicDirectoryAccountForSuperAdmin({
      actorUserId: SUPER_ADMIN_USER,
      licenseeAccountId: LICENSEE_A,
      organizationId: ORG_GETOBLIC,
      email: "new@getoblic.com",
      password: "",
      wordpressUserId: 9,
    });

    const update = ops.find(
      (op) =>
        op.op === "update" && op.table === GETOBLIC_DIRECTORY_SETTINGS_TABLE,
    );
    assert.equal(
      Object.hasOwn(update?.values ?? {}, "getoblic_account_password_ciphertext"),
      false,
    );
    assert.equal(store.settings[0]?.getoblic_account_password_ciphertext, existing);
    assert.equal(store.settings[0]?.getoblic_account_email, "new@getoblic.com");
    assert.equal(store.settings[0]?.wordpress_author_id, 9);
  });

  it("replacement password changes ciphertext", async () => {
    const existing = encryptSecret("old-password");
    const store = baseStore({
      settings: [
        defaultSettings({
          getoblic_account_email: "owner@getoblic.com",
          getoblic_account_password_ciphertext: existing,
          wordpress_author_id: 7,
        }),
      ],
    });
    installStore(store);

    await updateGetOblicDirectoryAccountForSuperAdmin({
      actorUserId: SUPER_ADMIN_USER,
      licenseeAccountId: LICENSEE_A,
      organizationId: ORG_GETOBLIC,
      email: "owner@getoblic.com",
      password: "replacement-password",
      wordpressUserId: 7,
    });

    const next = store.settings[0]?.getoblic_account_password_ciphertext;
    assert.ok(next);
    assert.notEqual(next, existing);
    assert.match(String(next), /^v1\./);
    assert.equal(decryptSecret(String(next)), "replacement-password");
  });

  it("preserves monthly_allowance including zero", async () => {
    const store = baseStore({
      settings: [defaultSettings({ monthly_allowance: 0 })],
    });
    const { ops } = installStore(store);

    const result = await updateGetOblicDirectoryAccountForSuperAdmin({
      actorUserId: SUPER_ADMIN_USER,
      licenseeAccountId: LICENSEE_A,
      organizationId: ORG_GETOBLIC,
      email: "owner@getoblic.com",
      password: "first-password",
      wordpressUserId: 12,
    });

    const update = ops.find(
      (op) =>
        op.op === "update" && op.table === GETOBLIC_DIRECTORY_SETTINGS_TABLE,
    );
    assert.equal(Object.hasOwn(update?.values ?? {}, "monthly_allowance"), false);
    assert.equal(store.settings[0]?.monthly_allowance, 0);
    assert.equal(result.allocation.monthlyAllowance, 0);
    assert.equal(result.allocation.configured, true);
  });

  it("preserves a non-zero monthly_allowance", async () => {
    const store = baseStore({
      settings: [defaultSettings({ monthly_allowance: 300 })],
    });
    installStore(store);

    const result = await updateGetOblicDirectoryAccountForSuperAdmin({
      actorUserId: SUPER_ADMIN_USER,
      licenseeAccountId: LICENSEE_A,
      organizationId: ORG_GETOBLIC,
      email: "owner@getoblic.com",
      password: "first-password",
      wordpressUserId: 12,
    });

    assert.equal(store.settings[0]?.monthly_allowance, 300);
    assert.equal(result.allocation.monthlyAllowance, 300);
  });

  it("does not upsert a missing settings row", async () => {
    const store = baseStore({ settings: [] });
    const { ops } = installStore(store);
    await assert.rejects(() =>
      updateGetOblicDirectoryAccountForSuperAdmin({
        actorUserId: SUPER_ADMIN_USER,
        licenseeAccountId: LICENSEE_A,
        organizationId: ORG_V2,
        email: "owner@getoblic.com",
        password: "secret",
        wordpressUserId: 12,
      }),
    );
    assert.equal(
      ops.some(
        (op) =>
          op.table === GETOBLIC_DIRECTORY_SETTINGS_TABLE &&
          (op.op === "upsert" || op.op === "insert"),
      ),
      false,
    );
  });
});

describe("CO-1B Super Admin GetOblic.com account — safe DTO and audit", () => {
  it("response omits ciphertext and plaintext password", async () => {
    const store = baseStore({ settings: [defaultSettings()] });
    installStore(store);

    const result = await updateGetOblicDirectoryAccountForSuperAdmin({
      actorUserId: SUPER_ADMIN_USER,
      licenseeAccountId: LICENSEE_A,
      organizationId: ORG_GETOBLIC,
      email: "owner@getoblic.com",
      password: "first-password",
      wordpressUserId: 12,
    });

    assertSafeDto(result);
    assertSafeDto(result.allocation);
    assert.equal(result.allocation.hasGetOblicPassword, true);
    assert.equal(
      Object.hasOwn(result.allocation, "getoblicAccountEmail"),
      true,
    );
  });

  it("list DTO contains hasGetOblicPassword only", async () => {
    const store = baseStore({
      settings: [
        defaultSettings({
          getoblic_account_email: "owner@getoblic.com",
          getoblic_account_password_ciphertext: encryptSecret("hidden"),
          wordpress_author_id: 42,
        }),
      ],
    });
    installStore(store);

    const model =
      await listGetOblicDirectoryAllocationsForSuperAdmin(SUPER_ADMIN_USER);
    const row = model.groups[0]?.subAccounts.find(
      (item) => item.organizationId === ORG_GETOBLIC,
    );
    assert.ok(row);
    assert.equal(row?.getoblicAccountEmail, "owner@getoblic.com");
    assert.equal(row?.wordpressUserId, 42);
    assert.equal(row?.hasGetOblicPassword, true);
    assertSafeDto(row);
    assertSafeDto(model);
  });

  it("audit contains passwordChanged only and never secrets", async () => {
    const store = baseStore({ settings: [defaultSettings()] });
    installStore(store);

    await updateGetOblicDirectoryAccountForSuperAdmin({
      actorUserId: SUPER_ADMIN_USER,
      licenseeAccountId: LICENSEE_A,
      organizationId: ORG_GETOBLIC,
      email: "owner@getoblic.com",
      password: "first-password",
      wordpressUserId: 12,
    });

    assert.equal(store.audit.length, 1);
    assert.equal(store.audit[0]?.action, "update_getoblic_directory_account");
    const metadata = store.audit[0]?.metadata as Record<string, unknown>;
    assert.equal(metadata.licenseeAccountId, LICENSEE_A);
    assert.equal(metadata.organizationId, ORG_GETOBLIC);
    assert.equal(metadata.email, "owner@getoblic.com");
    assert.equal(metadata.wordpressUserId, 12);
    assert.equal(metadata.passwordChanged, true);
    assert.equal(Object.hasOwn(metadata, "password"), false);
    assert.equal(
      Object.hasOwn(metadata, "getoblic_account_password_ciphertext"),
      false,
    );
    assert.doesNotMatch(JSON.stringify(store.audit[0]), /first-password/);
    assert.doesNotMatch(JSON.stringify(store.audit[0]), /v1\./);
  });

  it("blank password audit records passwordChanged=false", async () => {
    const store = baseStore({
      settings: [
        defaultSettings({
          getoblic_account_email: "owner@getoblic.com",
          getoblic_account_password_ciphertext: encryptSecret("hidden"),
          wordpress_author_id: 12,
        }),
      ],
    });
    installStore(store);

    await updateGetOblicDirectoryAccountForSuperAdmin({
      actorUserId: SUPER_ADMIN_USER,
      licenseeAccountId: LICENSEE_A,
      organizationId: ORG_GETOBLIC,
      email: "owner@getoblic.com",
      password: "",
      wordpressUserId: 12,
    });

    const metadata = store.audit[0]?.metadata as Record<string, unknown>;
    assert.equal(metadata.passwordChanged, false);
  });
});

describe("CO-1B secret boundary and claim path", () => {
  it("tenant settings select explicitly excludes credential columns", () => {
    const service = read(
      "services/getoblicDirectory/getoblicDirectoryService.ts",
    );
    assert.match(
      service,
      /DIRECTORY_SETTINGS_TENANT_COLUMNS =\s*"organization_id, monthly_allowance, wordpress_author_id, created_at, updated_at, updated_by_user_id"/,
    );
    const settingsFn = service.slice(
      service.indexOf("export async function getGetOblicDirectorySettings"),
      service.indexOf("export async function getActiveGetOblicLinkForProspect"),
    );
    assert.match(settingsFn, /select\(DIRECTORY_SETTINGS_TENANT_COLUMNS\)/);
    assert.doesNotMatch(settingsFn, /select\("\*"\)/);
    assert.doesNotMatch(settingsFn, /getoblic_account_email/);
    assert.doesNotMatch(settingsFn, /getoblic_account_password_ciphertext/);
  });

  it("tenant-facing types omit credential fields", () => {
    const types = read("services/getoblicDirectory/getoblicDirectoryTypes.ts");
    assert.doesNotMatch(types, /getoblic_account_email/);
    assert.doesNotMatch(types, /getoblic_account_password_ciphertext/);
    assert.doesNotMatch(types, /getoblicAccountEmail/);
    assert.doesNotMatch(types, /hasGetOblicPassword/);
  });

  it("no tenant or Licensee API exposes the new credential fields", () => {
    const blocked = [
      "getoblic_account_email",
      "getoblic_account_password_ciphertext",
      "getoblicAccountEmail",
      "hasGetOblicPassword",
      "ATHENA_SECRET_ENCRYPTION_KEY",
    ];
    const skip = new Set([
      "services/superAdmin/superAdminGetOblicDirectory.ts",
      "services/superAdmin/superAdminAuditLog.ts",
      "app/api/super/getoblic-directory/account/route.ts",
      "components/superAdmin/SuperAdminDashboardClient.tsx",
      "lib/serverEncryptedSecret.ts",
    ]);
    for (const root of ["app", "components", "services"]) {
      for (const file of walkSourceFiles(root)) {
        if (skip.has(file) || file.startsWith("app/api/super/")) {
          continue;
        }
        const source = read(file);
        for (const token of blocked) {
          assert.equal(
            source.includes(token),
            false,
            `${file} must not expose ${token}`,
          );
        }
      }
    }
  });

  it("mapped wordpress_author_id skips resolve-or-create and continues assignment", () => {
    const claim = read(
      "services/getoblicDirectory/getoblicDirectoryClaimService.ts",
    );
    const resolver = claim.slice(
      claim.indexOf("async function resolveWordpressAuthorId"),
      claim.indexOf("async function resolveOrganizationOwnerEmail"),
    );
    assert.match(
      resolver,
      /if \(input\.settings\.wordpress_author_id != null\)/,
    );
    assert.match(resolver, /return input\.settings\.wordpress_author_id;/);
    const resolveCall = resolver.indexOf("resolveOrCreateWordpressUser");
    const mappedReturn = resolver.indexOf(
      "return input.settings.wordpress_author_id;",
    );
    assert.ok(mappedReturn >= 0);
    assert.ok(resolveCall > mappedReturn);
  });

  it("unmapped author resolution remains in the claim path", () => {
    const claim = read(
      "services/getoblicDirectory/getoblicDirectoryClaimService.ts",
    );
    assert.match(claim, /resolveOrCreateWordpressUser/);
    assert.match(claim, /GETOBLIC_WORDPRESS_AUTHOR_UNMAPPED/);
    assert.match(claim, /persistOrganizationWordpressAuthorId/);
  });
});

describe("CO-1B Super Admin surface contracts", () => {
  it("account API is PATCH-only and returns a safe allocation DTO", () => {
    const route = read("app/api/super/getoblic-directory/account/route.ts");
    assert.match(route, /export async function PATCH/);
    assert.match(route, /updateGetOblicDirectoryAccountForSuperAdmin/);
    assert.match(route, /UNAUTHORIZED/);
    assert.match(route, /NOT_SUPER_ADMIN/);
    assert.match(route, /SuperAdminAccessError/);
    assert.doesNotMatch(route, /export async function GET/);
    assert.doesNotMatch(route, /export async function PUT/);
    assert.doesNotMatch(route, /export async function POST/);
    assert.doesNotMatch(route, /decryptSecret/);
    assert.doesNotMatch(route, /password:\s*result/);
    assert.match(route, /\{ ok: true, allocation: result\.allocation \}/);
  });

  it("dashboard adds GetOblic.com account fields without snake_case secrets", () => {
    const dashboard = read(
      "components/superAdmin/SuperAdminDashboardClient.tsx",
    );
    assert.match(dashboard, /GetOblic\.com account/);
    assert.match(dashboard, /Save Account/);
    assert.match(dashboard, /WordPress User ID/);
    assert.match(dashboard, /Leave blank to keep current password/);
    assert.match(
      dashboard,
      /Monthly listing allowance must be[\s\S]*configured first/,
    );
    assert.match(dashboard, /saveDirectoryAccount/);
    assert.match(dashboard, /\/api\/super\/getoblic-directory\/account/);
    assert.match(dashboard, /method: "PATCH"/);
    assert.doesNotMatch(dashboard, /wordpress_author_id/);
    assert.doesNotMatch(dashboard, /getoblic_account_email/);
    assert.doesNotMatch(dashboard, /getoblic_account_password_ciphertext/);
    assert.doesNotMatch(dashboard, /decryptSecret|encryptSecret/);
  });

  it("audit action is registered and allowance writer remains unchanged", async () => {
    const audit = read("services/superAdmin/superAdminAuditLog.ts");
    assert.match(audit, /update_getoblic_directory_account/);

    const store = baseStore({
      settings: [
        defaultSettings({
          monthly_allowance: 5,
          wordpress_author_id: 42,
          getoblic_account_email: "owner@getoblic.com",
          getoblic_account_password_ciphertext: encryptSecret("hidden"),
        }),
      ],
    });
    const { ops } = installStore(store);
    await updateGetOblicDirectoryAllowanceForSuperAdmin({
      actorUserId: SUPER_ADMIN_USER,
      licenseeAccountId: LICENSEE_A,
      organizationId: ORG_GETOBLIC,
      monthlyAllowance: 8,
    });
    const upsert = ops.find(
      (op) =>
        op.op === "upsert" && op.table === GETOBLIC_DIRECTORY_SETTINGS_TABLE,
    );
    assert.equal(Object.hasOwn(upsert?.values ?? {}, "wordpress_author_id"), false);
    assert.equal(store.settings[0]?.wordpress_author_id, 42);
    assert.equal(store.settings[0]?.getoblic_account_email, "owner@getoblic.com");
    assert.equal(store.settings[0]?.monthly_allowance, 8);
  });

  it("migration file is additive and was not executed by this suite", () => {
    const migration = read(
      "supabase/migrations/20260909000001_add_getoblic_directory_account_credentials.sql",
    );
    assert.match(migration, /getoblic_account_email text/);
    assert.match(migration, /getoblic_account_password_ciphertext text/);
    assert.match(migration, /getoblic_account_email is null/);
    assert.match(migration, /char_length\(btrim\(getoblic_account_email\)\) > 3/);
    assert.doesNotMatch(migration, /provisioning|lifecycle|vault/i);
    assert.doesNotMatch(migration, /supabase migration up/i);
  });
});
