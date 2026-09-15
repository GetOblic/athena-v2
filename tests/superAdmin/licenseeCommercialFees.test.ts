import "../getoblicDirectory/getoblicDirectoryTestEnv";

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { SuperAdminAccessError } from "../../services/superAdmin/superAdminIdentity";
import {
  formatLicenseeCommercialFeeUsd,
  listLicenseeCommercialFeesForSuperAdmin,
  parseLicenseeCommercialFeeUsd,
  SuperAdminLicenseeCommercialFeeError,
  updateLicenseeCommercialFeesForSuperAdmin,
} from "../../services/superAdmin/superAdminLicenseeCommercialFees";

const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);
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
  licensee_monthly_fee_usd: number;
  sub_account_monthly_fee_usd: number;
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

function baseStore(overrides: {
  superAdmins?: { id: string; user_id: string; email: string }[];
  licenseeAccounts?: LicenseeAccountRow[];
  failFeeWrite?: boolean;
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
        licensee_monthly_fee_usd: 0,
        sub_account_monthly_fee_usd: 0,
      },
      {
        id: LICENSEE_B,
        user_id: "lm-user-2",
        email: "master-b@example.com",
        licensee_monthly_fee_usd: 0,
        sub_account_monthly_fee_usd: 0,
      },
    ],
    audit: [] as Record<string, unknown>[],
    failFeeWrite: Boolean(overrides.failFeeWrite),
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

    const rowsForTable = (): Record<string, unknown>[] => {
      if (table === "getoblic_super_admins") {
        return store.superAdmins as unknown as Record<string, unknown>[];
      }
      if (table === "licensee_accounts") {
        return store.licenseeAccounts as unknown as Record<string, unknown>[];
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

    const applyUpdate = () => {
      ops.push({ op: "update", table, values: pendingUpdate ?? undefined });
      if (store.failFeeWrite) {
        pendingUpdate = null;
        return { data: null, error: { message: "fee write failed" } };
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
      async maybeSingle() {
        if (pendingInsert) return applyInsert();
        if (pendingUpdate) return applyUpdate();
        return { data: matchingRows()[0] ?? null, error: null };
      },
      async single() {
        if (pendingInsert) return applyInsert();
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
        if (pendingUpdate) {
          return Promise.resolve(applyUpdate()).then(resolve as never);
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

  return { ops };
}

function restoreSupabaseAdmin() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = originalFrom;
}

afterEach(() => {
  restoreSupabaseAdmin();
});

describe("Super Admin Licensee commercial fees — validation", () => {
  it("accepts zero and two-decimal USD values", () => {
    assert.equal(parseLicenseeCommercialFeeUsd(0, "licenseeMonthlyFeeUsd"), 0);
    assert.equal(parseLicenseeCommercialFeeUsd(0.0, "subAccountMonthlyFeeUsd"), 0);
    assert.equal(
      parseLicenseeCommercialFeeUsd(10.5, "licenseeMonthlyFeeUsd"),
      10.5,
    );
    assert.equal(
      parseLicenseeCommercialFeeUsd(19.99, "subAccountMonthlyFeeUsd"),
      19.99,
    );
    assert.equal(formatLicenseeCommercialFeeUsd(0), "$0.00");
    assert.equal(formatLicenseeCommercialFeeUsd(10.5), "$10.50");
  });

  it("rejects invalid types, null, NaN, Infinity, negatives, and extra decimals", () => {
    const invalid = [
      "10",
      "10.00",
      null,
      true,
      {},
      [],
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -0.01,
      -1,
      1.234,
      10.001,
    ];

    for (const value of invalid) {
      assert.throws(
        () => parseLicenseeCommercialFeeUsd(value, "licenseeMonthlyFeeUsd"),
        (error: unknown) => {
          assert.ok(error instanceof SuperAdminLicenseeCommercialFeeError);
          assert.equal(error.code, "INVALID_FEE");
          return true;
        },
      );
    }
  });
});

describe("Super Admin Licensee commercial fees — read", () => {
  it("defaults existing Licensees to 0.00", async () => {
    installStore(baseStore());
    const rows = await listLicenseeCommercialFeesForSuperAdmin(SUPER_ADMIN_USER);
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.licenseeMonthlyFeeUsd, 0);
    assert.equal(rows[0]?.subAccountMonthlyFeeUsd, 0);
    assert.equal(rows[1]?.licenseeMonthlyFeeUsd, 0);
    assert.equal(rows[1]?.subAccountMonthlyFeeUsd, 0);
  });

  it("rejects Licensee Masters and tenants from the read path", async () => {
    installStore(baseStore());
    await assert.rejects(
      () => listLicenseeCommercialFeesForSuperAdmin(LICENSEE_MASTER_USER),
      (error: unknown) => {
        assert.ok(error instanceof SuperAdminAccessError);
        return true;
      },
    );
    await assert.rejects(
      () => listLicenseeCommercialFeesForSuperAdmin(TENANT_USER),
      (error: unknown) => {
        assert.ok(error instanceof SuperAdminAccessError);
        return true;
      },
    );
  });
});

describe("Super Admin Licensee commercial fees — write", () => {
  it("rejects Licensee Masters and tenants from the write path", async () => {
    installStore(baseStore());
    await assert.rejects(
      () =>
        updateLicenseeCommercialFeesForSuperAdmin({
          actorUserId: LICENSEE_MASTER_USER,
          licenseeAccountId: LICENSEE_A,
          licenseeMonthlyFeeUsd: 10,
        }),
      (error: unknown) => {
        assert.ok(error instanceof SuperAdminAccessError);
        return true;
      },
    );
    await assert.rejects(
      () =>
        updateLicenseeCommercialFeesForSuperAdmin({
          actorUserId: TENANT_USER,
          licenseeAccountId: LICENSEE_A,
          subAccountMonthlyFeeUsd: 5,
        }),
      (error: unknown) => {
        assert.ok(error instanceof SuperAdminAccessError);
        return true;
      },
    );
  });

  it("accepts zero and does not write the omitted fee field", async () => {
    const store = baseStore({
      licenseeAccounts: [
        {
          id: LICENSEE_A,
          user_id: LICENSEE_MASTER_USER,
          email: "master-a@example.com",
          licensee_monthly_fee_usd: 12.5,
          sub_account_monthly_fee_usd: 4,
        },
      ],
    });
    const { ops } = installStore(store);

    const result = await updateLicenseeCommercialFeesForSuperAdmin({
      actorUserId: SUPER_ADMIN_USER,
      licenseeAccountId: LICENSEE_A,
      subAccountMonthlyFeeUsd: 0,
    });

    assert.equal(result.fees.licenseeMonthlyFeeUsd, 12.5);
    assert.equal(result.fees.subAccountMonthlyFeeUsd, 0);
    const update = ops.find((op) => op.op === "update");
    assert.ok(update);
    assert.equal(update?.values?.licensee_monthly_fee_usd, undefined);
    assert.equal(update?.values?.sub_account_monthly_fee_usd, 0);
  });

  it("updates one fee without resetting the other", async () => {
    const store = baseStore();
    installStore(store);

    const first = await updateLicenseeCommercialFeesForSuperAdmin({
      actorUserId: SUPER_ADMIN_USER,
      licenseeAccountId: LICENSEE_A,
      licenseeMonthlyFeeUsd: 10.5,
    });
    assert.equal(first.fees.licenseeMonthlyFeeUsd, 10.5);
    assert.equal(first.fees.subAccountMonthlyFeeUsd, 0);

    const second = await updateLicenseeCommercialFeesForSuperAdmin({
      actorUserId: SUPER_ADMIN_USER,
      licenseeAccountId: LICENSEE_A,
      subAccountMonthlyFeeUsd: 25,
    });
    assert.equal(second.fees.licenseeMonthlyFeeUsd, 10.5);
    assert.equal(second.fees.subAccountMonthlyFeeUsd, 25);
    assert.equal(store.licenseeAccounts[0]?.licensee_monthly_fee_usd, 10.5);
    assert.equal(store.licenseeAccounts[0]?.sub_account_monthly_fee_usd, 25);
  });

  it("rejects invalid, negative, and extra-decimal writes before touching storage", async () => {
    const store = baseStore();
    const { ops } = installStore(store);

    await assert.rejects(
      () =>
        updateLicenseeCommercialFeesForSuperAdmin({
          actorUserId: SUPER_ADMIN_USER,
          licenseeAccountId: LICENSEE_A,
          licenseeMonthlyFeeUsd: -1,
        }),
      (error: unknown) => {
        assert.ok(error instanceof SuperAdminLicenseeCommercialFeeError);
        assert.equal(error.code, "INVALID_FEE");
        return true;
      },
    );
    await assert.rejects(
      () =>
        updateLicenseeCommercialFeesForSuperAdmin({
          actorUserId: SUPER_ADMIN_USER,
          licenseeAccountId: LICENSEE_A,
          subAccountMonthlyFeeUsd: 1.234,
        }),
      (error: unknown) => {
        assert.ok(error instanceof SuperAdminLicenseeCommercialFeeError);
        assert.equal(error.code, "INVALID_FEE");
        return true;
      },
    );
    await assert.rejects(
      () =>
        updateLicenseeCommercialFeesForSuperAdmin({
          actorUserId: SUPER_ADMIN_USER,
          licenseeAccountId: LICENSEE_A,
          licenseeMonthlyFeeUsd: "10.00",
        }),
      (error: unknown) => {
        assert.ok(error instanceof SuperAdminLicenseeCommercialFeeError);
        assert.equal(error.code, "INVALID_FEE");
        return true;
      },
    );
    await assert.rejects(
      () =>
        updateLicenseeCommercialFeesForSuperAdmin({
          actorUserId: SUPER_ADMIN_USER,
          licenseeAccountId: LICENSEE_A,
        }),
      (error: unknown) => {
        assert.ok(error instanceof SuperAdminLicenseeCommercialFeeError);
        assert.equal(error.code, "NO_FEE_FIELDS");
        return true;
      },
    );

    assert.equal(
      ops.some((op) => op.op === "update" && op.table === "licensee_accounts"),
      false,
    );
    assert.equal(store.licenseeAccounts[0]?.licensee_monthly_fee_usd, 0);
    assert.equal(store.licenseeAccounts[0]?.sub_account_monthly_fee_usd, 0);
    assert.equal(store.audit.length, 0);
  });

  it("writes a success audit with previous, next, and updated fields", async () => {
    const store = baseStore({
      licenseeAccounts: [
        {
          id: LICENSEE_A,
          user_id: LICENSEE_MASTER_USER,
          email: "master-a@example.com",
          licensee_monthly_fee_usd: 3,
          sub_account_monthly_fee_usd: 7.25,
        },
      ],
    });
    installStore(store);

    await updateLicenseeCommercialFeesForSuperAdmin({
      actorUserId: SUPER_ADMIN_USER,
      licenseeAccountId: LICENSEE_A,
      licenseeMonthlyFeeUsd: 8,
    });

    assert.equal(store.audit.length, 1);
    assert.equal(store.audit[0]?.action, "update_licensee_commercial_fees");
    assert.equal(store.audit[0]?.actor_user_id, SUPER_ADMIN_USER);
    assert.equal(store.audit[0]?.target_user_id, LICENSEE_MASTER_USER);
    assert.equal(store.audit[0]?.target_email, "master-a@example.com");
    assert.equal(store.audit[0]?.account_type, "licensee");
    const metadata = store.audit[0]?.metadata as Record<string, unknown>;
    assert.equal(metadata.licenseeAccountId, LICENSEE_A);
    assert.equal(metadata.previousLicenseeMonthlyFeeUsd, 3);
    assert.equal(metadata.previousSubAccountMonthlyFeeUsd, 7.25);
    assert.equal(metadata.nextLicenseeMonthlyFeeUsd, 8);
    assert.equal(metadata.nextSubAccountMonthlyFeeUsd, 7.25);
    assert.deepEqual(metadata.updatedFields, ["licenseeMonthlyFeeUsd"]);
  });
});

describe("Super Admin Licensee commercial fees — contracts", () => {
  it("migration adds non-negative USD defaults without touching GetOblic tables", () => {
    const migration = read(
      "supabase/migrations/20260915000002_add_licensee_commercial_fees.sql",
    );
    assert.match(
      migration,
      /add column if not exists licensee_monthly_fee_usd numeric\(12,2\) not null default 0/,
    );
    assert.match(
      migration,
      /add column if not exists sub_account_monthly_fee_usd numeric\(12,2\) not null default 0/,
    );
    assert.match(
      migration,
      /licensee_accounts_licensee_monthly_fee_usd_chk/,
    );
    assert.match(
      migration,
      /licensee_accounts_sub_account_monthly_fee_usd_chk/,
    );
    assert.match(migration, /check \(licensee_monthly_fee_usd >= 0\)/);
    assert.match(migration, /check \(sub_account_monthly_fee_usd >= 0\)/);
    assert.doesNotMatch(migration, /billing/i);
    assert.doesNotMatch(migration, /athena_getoblic_directory_settings/);
    assert.doesNotMatch(migration, /reserve_getoblic_listing_capacity/);
    assert.doesNotMatch(migration, /monthly_allowance/);
    assert.doesNotMatch(migration, /update\s+licensee_accounts/i);
    assert.doesNotMatch(migration, /create table/i);
    assert.doesNotMatch(migration, /create policy/i);
  });

  it("Licensee Master creation remains identity-only and does not set fees", () => {
    const accounts = read("services/superAdmin/superAdminAccounts.ts");
    const start = accounts.indexOf(
      "export async function createLicenseeMasterAsSuperAdmin",
    );
    const end = accounts.indexOf(
      "async function resolveManageableAccountTarget",
      start,
    );
    const createMaster = accounts.slice(start, end);
    assert.match(
      createMaster,
      /\.insert\(\{\s*user_id: authUser\.id,\s*email,\s*default_language: defaultLanguage,\s*\}\)/,
    );
    assert.doesNotMatch(createMaster, /licensee_monthly_fee_usd/);
    assert.doesNotMatch(createMaster, /sub_account_monthly_fee_usd/);
    assert.doesNotMatch(createMaster, /organization_members/);
    assert.doesNotMatch(createMaster, /provisionTenantForAuthenticatedUser/);
    assert.doesNotMatch(createMaster, /from\("organizations"\)/);
    assert.doesNotMatch(createMaster, /athena_getoblic_directory_settings/);
    assert.doesNotMatch(createMaster, /monthly_allowance/);

    const route = read("app/api/super/accounts/licensee/route.ts");
    assert.match(route, /export async function POST/);
    assert.doesNotMatch(route, /export async function PATCH/);
    assert.doesNotMatch(route, /licensee_monthly_fee_usd|sub_account_monthly_fee_usd/);
    assert.doesNotMatch(route, /updateLicenseeCommercialFeesForSuperAdmin/);
  });

  it("keeps GetOblic capacity writer and directory settings untouched", () => {
    const directory = read("services/superAdmin/superAdminGetOblicDirectory.ts");
    const settingsRoute = read(
      "app/api/super/getoblic-directory/settings/route.ts",
    );
    const commercial = read(
      "services/superAdmin/superAdminLicenseeCommercialFees.ts",
    );
    assert.match(
      directory,
      /export async function updateGetOblicDirectoryAllowanceForSuperAdmin/,
    );
    assert.match(directory, /monthly_allowance: listingCapacity/);
    assert.doesNotMatch(directory, /licensee_monthly_fee_usd/);
    assert.doesNotMatch(directory, /sub_account_monthly_fee_usd/);
    assert.doesNotMatch(directory, /updateLicenseeCommercialFeesForSuperAdmin/);
    assert.doesNotMatch(settingsRoute, /licensee_monthly_fee_usd/);
    assert.doesNotMatch(settingsRoute, /commercial-fees/);
    assert.doesNotMatch(commercial, /monthly_allowance/);
    assert.doesNotMatch(commercial, /athena_getoblic_directory_settings/);
    assert.doesNotMatch(commercial, /reserve_getoblic_listing_capacity/);
    assert.doesNotMatch(commercial, /listLicenseeSubAccountsForMaster/);
  });

  it("commercial-fee route is Super Admin only and uses the focused service", () => {
    const route = read(
      "app/api/super/accounts/licensee/commercial-fees/route.ts",
    );
    assert.match(route, /export async function PATCH/);
    assert.match(route, /createSupabaseServerClient/);
    assert.match(route, /updateLicenseeCommercialFeesForSuperAdmin/);
    assert.match(route, /UNAUTHORIZED/);
    assert.match(route, /NOT_SUPER_ADMIN/);
    assert.match(route, /ACCOUNT_NOT_FOUND/);
    assert.match(route, /SuperAdminAccessError/);
    assert.doesNotMatch(route, /export async function GET/);
    assert.doesNotMatch(route, /export async function POST/);
    assert.doesNotMatch(route, /listLicenseeSubAccountsForMaster/);
    assert.doesNotMatch(route, /updateGetOblicDirectoryAllowanceForSuperAdmin/);
  });

  it("surfaces fees at Licensee Master/group level and never on GetOblic cards or Licensee UI", () => {
    const dashboard = read(
      "components/superAdmin/SuperAdminDashboardClient.tsx",
    );
    const licenseeCard = read(
      "components/superAdmin/SuperAdminLicenseeCard.tsx",
    );
    const subAccountCard = read(
      "components/superAdmin/SuperAdminSubAccountCard.tsx",
    );
    const feeTypes = read(
      "services/superAdmin/superAdminLicenseeCommercialFeeTypes.ts",
    );
    const page = read("app/super/page.tsx");
    assert.match(page, /listLicenseeCommercialFeesForSuperAdmin/);
    assert.match(page, /initialLicenseeCommercialFees/);
    assert.match(licenseeCard, /LICENSEE_MONTHLY_FEE_LABEL/);
    assert.match(licenseeCard, /SUB_ACCOUNT_MONTHLY_FEE_LABEL/);
    assert.match(dashboard, /Licensee Monthly Fee saved/);
    assert.match(dashboard, /Sub-Account Monthly Fee saved/);
    assert.match(licenseeCard, /formatLicenseeCommercialFeeUsd\(0\)\} is valid/);
    assert.match(dashboard, /superAdminLicenseeCommercialFeeTypes/);
    assert.doesNotMatch(dashboard, /superAdminLicenseeCommercialFees/);
    assert.doesNotMatch(dashboard, /supabaseAdmin/);
    assert.doesNotMatch(licenseeCard, /supabaseAdmin/);
    assert.doesNotMatch(subAccountCard, /supabaseAdmin/);
    assert.doesNotMatch(feeTypes, /supabaseAdmin/);
    assert.doesNotMatch(feeTypes, /superAdminIdentity|superAdminAuditLog/);
    assert.match(dashboard, /\/api\/super\/accounts\/licensee\/commercial-fees/);
    assert.match(dashboard, /saveLicenseeCommercialFee/);
    assert.doesNotMatch(dashboard, /\bbilling\b/);
    assert.doesNotMatch(page, /\bbilling\b/);
    assert.match(licenseeCard, /Licensee commercial configuration/);
    assert.doesNotMatch(subAccountCard, /Licensee Monthly Fee/);
    assert.doesNotMatch(subAccountCard, /Sub-Account Monthly Fee/);
    assert.doesNotMatch(subAccountCard, /commercial-fees/);

    const licenseeRoots = [
      "app/licensee",
      "components/licensee",
      "services/licensee",
      "app/api/licensee",
    ];
    for (const root of licenseeRoots) {
      for (const file of walkSourceFiles(root)) {
        const source = read(file);
        assert.doesNotMatch(
          source,
          /licensee_monthly_fee_usd|sub_account_monthly_fee_usd|updateLicenseeCommercialFeesForSuperAdmin|Licensee Monthly Fee|Sub-Account Monthly Fee/,
          `${file} must not expose Licensee commercial fees`,
        );
      }
    }
  });

  it("keeps commercial-fee writes Super-only and does not invent billing product language", () => {
    const page = read("app/super/page.tsx");
    const dashboard = read(
      "components/superAdmin/SuperAdminDashboardClient.tsx",
    );
    const licenseeCard = read(
      "components/superAdmin/SuperAdminLicenseeCard.tsx",
    );
    assert.match(licenseeCard, /GetOblic Listing Capacity/);
    assert.doesNotMatch(dashboard, /invoice|payment processing|sub-account charge/i);
    assert.doesNotMatch(page, /invoice|payment processing/i);
    assert.doesNotMatch(licenseeCard, /invoice|payment processing/i);
  });
});
