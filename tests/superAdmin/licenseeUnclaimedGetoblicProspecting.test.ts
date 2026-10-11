import "../getoblicDirectory/getoblicDirectoryTestEnv";

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { buildSuperAdminDashboardView } from "../../lib/superAdmin/superAdminDashboardView";
import {
  SuperAdminOperationError,
  createLicenseeMasterAsSuperAdmin,
} from "../../services/superAdmin/superAdminAccounts";
import type { ManageableAccount } from "../../services/superAdmin/superAdminAccounts";
import { SuperAdminAccessError } from "../../services/superAdmin/superAdminIdentity";
import {
  listLicenseeUnclaimedGetoblicProspectingForSuperAdmin,
  parseAllowUnclaimedGetoblicProspecting,
  SuperAdminLicenseeUnclaimedGetoblicProspectingError,
  updateLicenseeUnclaimedGetoblicProspectingForSuperAdmin,
} from "../../services/superAdmin/superAdminLicenseeUnclaimedGetoblicProspecting";
import {
  UNCLAIMED_GETOBLIC_PROSPECTING_LABEL,
  UNCLAIMED_GETOBLIC_PROSPECTING_SUPPORTING_COPY,
} from "../../services/superAdmin/superAdminLicenseeUnclaimedGetoblicProspectingTypes";

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
const LICENSEE_C = "licensee-c";

type LicenseeAccountRow = {
  id: string;
  user_id: string;
  email: string;
  default_language?: string;
  allow_unclaimed_getoblic_prospecting?: boolean;
  own_company_organization_id?: string | null;
  licensee_monthly_fee_usd?: number;
  sub_account_monthly_fee_usd?: number;
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
  if (!existsSync(abs)) {
    return [];
  }
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
    failPermissionWrite?: boolean;
  } = {},
) {
  return {
    superAdmins: [
      { id: "sa-1", user_id: SUPER_ADMIN_USER, email: "super@getoblic.com" },
    ],
    licenseeAccounts: [
      {
        id: LICENSEE_A,
        user_id: LICENSEE_MASTER_USER,
        email: "master-a@example.com",
        default_language: "fr",
        allow_unclaimed_getoblic_prospecting: false,
        own_company_organization_id: "org-own",
        licensee_monthly_fee_usd: 12.5,
        sub_account_monthly_fee_usd: 3,
      },
      {
        id: LICENSEE_B,
        user_id: "lm-user-2",
        email: "master-b@example.com",
        default_language: "de",
        allow_unclaimed_getoblic_prospecting: true,
        own_company_organization_id: null,
        licensee_monthly_fee_usd: 1,
        sub_account_monthly_fee_usd: 2,
      },
      {
        id: LICENSEE_C,
        user_id: "lm-user-3",
        email: "master-c@example.com",
        default_language: "en",
        own_company_organization_id: null,
        licensee_monthly_fee_usd: 0,
        sub_account_monthly_fee_usd: 0,
      },
    ] as LicenseeAccountRow[],
    memberships: [] as Array<{
      user_id: string;
      organization_id: string;
      role: string;
    }>,
    audit: [] as Record<string, unknown>[],
    failPermissionWrite: Boolean(overrides.failPermissionWrite),
    authUsersByEmail: {} as Record<string, { id: string; email: string }>,
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
        const inserted = pendingInsert;
        pendingInsert = null;
        return { data: inserted, error: null };
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
          allow_unclaimed_getoblic_prospecting:
            pendingInsert.allow_unclaimed_getoblic_prospecting === true,
          own_company_organization_id:
            typeof pendingInsert.own_company_organization_id === "string"
              ? pendingInsert.own_company_organization_id
              : null,
        };
        store.licenseeAccounts.push(row);
        pendingInsert = null;
        return { data: row, error: null };
      }
      const inserted = pendingInsert;
      pendingInsert = null;
      return { data: inserted, error: null };
    };

    const applyUpdate = () => {
      ops.push({ op: "update", table, values: pendingUpdate ?? undefined });
      if (store.failPermissionWrite && table === "licensee_accounts") {
        pendingUpdate = null;
        return { data: null, error: { message: "permission write failed" } };
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
      delete() {
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

function licenseeInserts(ops: Op[]) {
  return ops.filter(
    (op) => op.op === "insert" && op.table === "licensee_accounts",
  );
}

function sliceBetween(source: string, start: string, end?: string): string {
  const startIndex = source.indexOf(start);
  assert.ok(startIndex >= 0, `missing start: ${start}`);
  const endIndex = end ? source.indexOf(end, startIndex) : source.length;
  assert.ok(endIndex > startIndex, `missing end: ${end ?? "EOF"}`);
  return source.slice(startIndex, endIndex);
}

afterEach(() => {
  restoreMocks();
});

describe("unclaimed GetOblic prospecting — exact boolean", () => {
  it("accepts only an exact boolean", () => {
    assert.equal(parseAllowUnclaimedGetoblicProspecting(true), true);
    assert.equal(parseAllowUnclaimedGetoblicProspecting(false), false);
    for (const value of ["true", "false", 1, 0, null, undefined, "", "yes"]) {
      assert.throws(
        () => parseAllowUnclaimedGetoblicProspecting(value),
        (error: unknown) => {
          assert.ok(
            error instanceof SuperAdminLicenseeUnclaimedGetoblicProspectingError,
          );
          assert.equal(error.code, "INVALID_UNCLAIMED_GETOBLIC_PROSPECTING");
          return true;
        },
      );
    }
  });
});

describe("unclaimed GetOblic prospecting — Licensee creation", () => {
  it("defaults the permission to false when the field is absent", async () => {
    const store = baseStore();
    const { ops } = installStore(store);

    const result = await createLicenseeMasterAsSuperAdmin({
      actorUserId: SUPER_ADMIN_USER,
      email: "new-master@example.com",
      businessName: "North Studio",
      defaultLanguage: "fr",
    });

    const insert = licenseeInserts(ops)[0];
    assert.ok(insert);
    assert.equal(insert.values?.email, "new-master@example.com");
    assert.equal(insert.values?.default_language, "fr");
    assert.equal(insert.values?.allow_unclaimed_getoblic_prospecting, false);
    assert.equal("own_company_organization_id" in (insert.values ?? {}), false);
    assert.equal("licensee_monthly_fee_usd" in (insert.values ?? {}), false);
    assert.equal("sub_account_monthly_fee_usd" in (insert.values ?? {}), false);
    assert.equal(
      ops.filter((op) => op.table === "organizations").length,
      0,
    );

    const audit = store.audit.find(
      (row) => row.action === "create_licensee_master",
    ) as { metadata?: Record<string, unknown>; target_email?: string };
    assert.equal(audit?.target_email, "new-master@example.com");
    assert.equal(audit?.metadata?.businessName, "North Studio");
    assert.equal(audit?.metadata?.defaultLanguage, "fr");
    assert.equal(audit?.metadata?.allowUnclaimedGetoblicProspecting, false);
    assert.equal(audit?.metadata?.licenseeAccountId, result.licenseeAccountId);
  });

  it("persists an explicit true without creating an Own Company", async () => {
    const store = baseStore();
    const { ops } = installStore(store);

    await createLicenseeMasterAsSuperAdmin({
      actorUserId: SUPER_ADMIN_USER,
      email: "enabled-master@example.com",
      defaultLanguage: "en",
      allowUnclaimedGetoblicProspecting: true,
    });

    const insert = licenseeInserts(ops)[0];
    assert.equal(insert?.values?.allow_unclaimed_getoblic_prospecting, true);
    assert.equal(insert?.values?.default_language, "en");
    assert.equal("own_company_organization_id" in (insert?.values ?? {}), false);
    const audit = store.audit[0]?.metadata as Record<string, unknown>;
    assert.equal(audit.allowUnclaimedGetoblicProspecting, true);
    assert.equal(audit.defaultLanguage, "en");
  });

  it("persists an explicit false", async () => {
    const store = baseStore();
    const { ops } = installStore(store);

    await createLicenseeMasterAsSuperAdmin({
      actorUserId: SUPER_ADMIN_USER,
      email: "disabled-master@example.com",
      allowUnclaimedGetoblicProspecting: false,
    });

    const insert = licenseeInserts(ops)[0];
    assert.equal(insert?.values?.allow_unclaimed_getoblic_prospecting, false);
    assert.equal(insert?.values?.default_language, "en");
    const audit = store.audit[0]?.metadata as Record<string, unknown>;
    assert.equal(audit.allowUnclaimedGetoblicProspecting, false);
  });

  it("rejects a nonboolean creation payload before insert", async () => {
    const store = baseStore();
    const { ops } = installStore(store);

    for (const value of ["true", 1, null, "false"]) {
      await assert.rejects(
        () =>
          createLicenseeMasterAsSuperAdmin({
            actorUserId: SUPER_ADMIN_USER,
            email: "bad-master@example.com",
            allowUnclaimedGetoblicProspecting: value,
          }),
        (error: unknown) => {
          assert.ok(error instanceof SuperAdminOperationError);
          assert.equal(error.code, "INVALID_UNCLAIMED_GETOBLIC_PROSPECTING");
          return true;
        },
      );
    }

    assert.equal(licenseeInserts(ops).length, 0);
    assert.equal(store.audit.length, 0);
  });

  it("allows only a Super Admin to create the Licensee", async () => {
    const store = baseStore();
    const { ops } = installStore(store);

    for (const actorUserId of [LICENSEE_MASTER_USER, TENANT_USER]) {
      await assert.rejects(
        () =>
          createLicenseeMasterAsSuperAdmin({
            actorUserId,
            email: "blocked-master@example.com",
            allowUnclaimedGetoblicProspecting: true,
          }),
        SuperAdminAccessError,
      );
    }

    assert.equal(licenseeInserts(ops).length, 0);
  });
});

describe("unclaimed GetOblic prospecting — Super Admin PATCH", () => {
  it("saves true and false and audits the previous and next values", async () => {
    const store = baseStore();
    const { ops } = installStore(store);

    const enabled = await updateLicenseeUnclaimedGetoblicProspectingForSuperAdmin({
      actorUserId: SUPER_ADMIN_USER,
      licenseeAccountId: LICENSEE_A,
      allowUnclaimedGetoblicProspecting: true,
    });
    assert.equal(enabled.setting.allowUnclaimedGetoblicProspecting, true);
    assert.equal(enabled.setting.licenseeAccountId, LICENSEE_A);
    assert.equal(enabled.setting.masterEmail, "master-a@example.com");

    const disabled = await updateLicenseeUnclaimedGetoblicProspectingForSuperAdmin({
      actorUserId: SUPER_ADMIN_USER,
      licenseeAccountId: LICENSEE_A,
      allowUnclaimedGetoblicProspecting: false,
    });
    assert.equal(disabled.setting.allowUnclaimedGetoblicProspecting, false);

    const updates = ops.filter(
      (op) => op.op === "update" && op.table === "licensee_accounts",
    );
    assert.equal(updates.length, 2);
    assert.deepEqual(Object.keys(updates[0]?.values ?? {}).sort(), [
      "allow_unclaimed_getoblic_prospecting",
      "updated_at",
    ]);
    assert.equal(updates[0]?.values?.allow_unclaimed_getoblic_prospecting, true);
    assert.equal(updates[1]?.values?.allow_unclaimed_getoblic_prospecting, false);

    assert.equal(store.audit.length, 2);
    const [first, second] = store.audit;
    assert.equal(first?.action, "update_licensee_unclaimed_getoblic_prospecting");
    assert.equal(first?.target_user_id, LICENSEE_MASTER_USER);
    assert.equal(first?.target_email, "master-a@example.com");
    assert.equal(first?.account_type, "licensee");
    const firstMetadata = first?.metadata as Record<string, unknown>;
    assert.equal(firstMetadata.licenseeAccountId, LICENSEE_A);
    assert.equal(firstMetadata.previousAllowUnclaimedGetoblicProspecting, false);
    assert.equal(firstMetadata.nextAllowUnclaimedGetoblicProspecting, true);
    const secondMetadata = second?.metadata as Record<string, unknown>;
    assert.equal(secondMetadata.previousAllowUnclaimedGetoblicProspecting, true);
    assert.equal(secondMetadata.nextAllowUnclaimedGetoblicProspecting, false);
  });

  it("rejects a nonboolean PATCH payload and does not write", async () => {
    const store = baseStore();
    const { ops } = installStore(store);

    for (const value of ["true", 1, null, undefined, "false"]) {
      await assert.rejects(
        () =>
          updateLicenseeUnclaimedGetoblicProspectingForSuperAdmin({
            actorUserId: SUPER_ADMIN_USER,
            licenseeAccountId: LICENSEE_A,
            allowUnclaimedGetoblicProspecting: value,
          }),
        (error: unknown) => {
          assert.ok(
            error instanceof SuperAdminLicenseeUnclaimedGetoblicProspectingError,
          );
          assert.equal(error.code, "INVALID_UNCLAIMED_GETOBLIC_PROSPECTING");
          return true;
        },
      );
    }

    assert.equal(ops.filter((op) => op.op === "update").length, 0);
    assert.equal(
      store.licenseeAccounts[0]?.allow_unclaimed_getoblic_prospecting,
      false,
    );
  });

  it("denies a non-Super Admin", async () => {
    const store = baseStore();
    const { ops } = installStore(store);

    for (const actorUserId of [LICENSEE_MASTER_USER, TENANT_USER]) {
      await assert.rejects(
        () =>
          updateLicenseeUnclaimedGetoblicProspectingForSuperAdmin({
            actorUserId,
            licenseeAccountId: LICENSEE_A,
            allowUnclaimedGetoblicProspecting: true,
          }),
        SuperAdminAccessError,
      );
    }

    assert.equal(ops.filter((op) => op.op === "update").length, 0);
    assert.equal(
      store.licenseeAccounts[0]?.allow_unclaimed_getoblic_prospecting,
      false,
    );
  });

  it("does not alter Own Company, fees, or language", async () => {
    const store = baseStore();
    installStore(store);

    await updateLicenseeUnclaimedGetoblicProspectingForSuperAdmin({
      actorUserId: SUPER_ADMIN_USER,
      licenseeAccountId: LICENSEE_A,
      allowUnclaimedGetoblicProspecting: true,
    });

    const updated = store.licenseeAccounts[0];
    assert.equal(updated?.allow_unclaimed_getoblic_prospecting, true);
    assert.equal(updated?.own_company_organization_id, "org-own");
    assert.equal(updated?.default_language, "fr");
    assert.equal(updated?.licensee_monthly_fee_usd, 12.5);
    assert.equal(updated?.sub_account_monthly_fee_usd, 3);
    assert.equal(
      store.licenseeAccounts[1]?.allow_unclaimed_getoblic_prospecting,
      true,
    );
    assert.equal(store.licenseeAccounts[1]?.own_company_organization_id, null);
    assert.equal(store.licenseeAccounts[1]?.default_language, "de");
  });

  it("can be saved before Own Company exists and still grants no designation", async () => {
    const store = baseStore();
    const { ops } = installStore(store);

    const result = await updateLicenseeUnclaimedGetoblicProspectingForSuperAdmin({
      actorUserId: SUPER_ADMIN_USER,
      licenseeAccountId: LICENSEE_B,
      allowUnclaimedGetoblicProspecting: false,
    });

    assert.equal(result.setting.allowUnclaimedGetoblicProspecting, false);
    assert.equal(store.licenseeAccounts[1]?.own_company_organization_id, null);
    const update = ops.find(
      (op) => op.op === "update" && op.table === "licensee_accounts",
    );
    assert.equal("own_company_organization_id" in (update?.values ?? {}), false);
    assert.equal(
      ops.filter((op) => op.table === "organizations").length,
      0,
    );
  });

  it("reads a missing stored value as false for Super Admin only", async () => {
    const store = baseStore();
    installStore(store);

    const listed = await listLicenseeUnclaimedGetoblicProspectingForSuperAdmin(
      SUPER_ADMIN_USER,
    );
    assert.deepEqual(
      listed.map((row) => [
        row.licenseeAccountId,
        row.allowUnclaimedGetoblicProspecting,
      ]),
      [
        [LICENSEE_A, false],
        [LICENSEE_B, true],
        [LICENSEE_C, false],
      ],
    );

    await assert.rejects(
      () =>
        listLicenseeUnclaimedGetoblicProspectingForSuperAdmin(TENANT_USER),
      SuperAdminAccessError,
    );
  });
});

describe("unclaimed GetOblic prospecting — view model", () => {
  function licenseeAccount(): ManageableAccount {
    return {
      userId: "lm-1",
      email: "master@example.com",
      accountType: "licensee",
      displayName: "master@example.com",
      organizationId: null,
      licenseeAccountId: "lic-1",
      status: "active",
      athenaPlan: "full",
    };
  }

  it("keeps the permission server-authoritative and separate from Own Company, fees, and language", () => {
    const omitted = buildSuperAdminDashboardView({
      accounts: [licenseeAccount()],
      directoryAllocations: {
        groups: [
          {
            licenseeAccountId: "lic-1",
            masterEmail: "master@example.com",
            ownCompanyOrganizationId: "org-1",
            subAccounts: [],
          },
        ],
      },
      licenseeCommercialFees: [
        {
          licenseeAccountId: "lic-1",
          masterEmail: "master@example.com",
          licenseeMonthlyFeeUsd: 10,
          subAccountMonthlyFeeUsd: 4,
        },
      ],
      licenseeDefaultLanguages: [
        {
          licenseeAccountId: "lic-1",
          masterEmail: "master@example.com",
          defaultLanguage: "fr",
        },
      ],
      trendSocialPromptConfigured: false,
      estimateMethodologyConfigured: false,
    });
    assert.equal(omitted.licensees[0]?.allowUnclaimedGetoblicProspecting, false);
    assert.equal(omitted.licensees[0]?.hasOwnCompany, true);
    assert.equal(omitted.licensees[0]?.defaultLanguage, "fr");
    assert.equal(omitted.licensees[0]?.licenseeMonthlyFeeUsd, 10);
    assert.equal(omitted.licensees[0]?.subAccountMonthlyFeeUsd, 4);

    const enabledWithoutOwnCompany = buildSuperAdminDashboardView({
      accounts: [licenseeAccount()],
      directoryAllocations: {
        groups: [
          {
            licenseeAccountId: "lic-1",
            masterEmail: "master@example.com",
            ownCompanyOrganizationId: null,
            subAccounts: [],
          },
        ],
      },
      licenseeCommercialFees: [],
      licenseeUnclaimedGetoblicProspecting: [
        {
          licenseeAccountId: "lic-1",
          masterEmail: "master@example.com",
          allowUnclaimedGetoblicProspecting: true,
        },
      ],
      trendSocialPromptConfigured: false,
      estimateMethodologyConfigured: false,
    });
    assert.equal(
      enabledWithoutOwnCompany.licensees[0]?.allowUnclaimedGetoblicProspecting,
      true,
    );
    assert.equal(enabledWithoutOwnCompany.licensees[0]?.hasOwnCompany, false);
    assert.equal(enabledWithoutOwnCompany.licensees[0]?.defaultLanguage, "en");
    assert.equal(enabledWithoutOwnCompany.licensees[0]?.licenseeMonthlyFeeUsd, 0);
  });
});

describe("unclaimed GetOblic prospecting — Super Admin UI contract", () => {
  it("defaults the Create Licensee checkbox off and keeps the edit state server-backed", () => {
    assert.equal(
      UNCLAIMED_GETOBLIC_PROSPECTING_LABEL,
      "Allow unclaimed GetOblic prospecting",
    );
    assert.equal(
      UNCLAIMED_GETOBLIC_PROSPECTING_SUPPORTING_COPY,
      "Internal GetOblic access. Allows the Licensee's Own Company to add unlimited unclaimed Prospects and send Description or Knowledge Base without claiming listings.",
    );

    const client = read("components/superAdmin/SuperAdminDashboardClient.tsx");
    const card = read("components/superAdmin/SuperAdminLicenseeCard.tsx");
    const directory = read(
      "components/superAdmin/SuperAdminLicenseeDirectory.tsx",
    );
    const page = read("app/super/page.tsx");

    assert.match(
      client,
      /const \[allowUnclaimedGetoblicProspecting, setAllowUnclaimedGetoblicProspecting\] =\s*useState\(false\)/,
    );
    assert.match(client, /checked=\{allowUnclaimedGetoblicProspecting\}/);
    assert.match(client, /setAllowUnclaimedGetoblicProspecting\(false\)/);
    assert.match(client, /UNCLAIMED_GETOBLIC_PROSPECTING_LABEL/);
    assert.match(client, /UNCLAIMED_GETOBLIC_PROSPECTING_SUPPORTING_COPY/);
    assert.match(
      client,
      /allowUnclaimedGetoblicProspecting,\s*\}\);/,
    );
    const athenaFields = sliceBetween(
      client,
      "const athenaCreateFields",
      "const licenseeCreateFields",
    );
    assert.doesNotMatch(athenaFields, /allowUnclaimedGetoblicProspecting/);
    assert.match(
      sliceBetween(client, "const licenseeCreateFields", "return ("),
      /type="checkbox"/,
    );

    assert.match(card, /checked=\{allowUnclaimedGetoblicProspectingDraft\}/);
    assert.match(card, /UNCLAIMED_GETOBLIC_PROSPECTING_LABEL/);
    assert.match(card, /UNCLAIMED_GETOBLIC_PROSPECTING_SUPPORTING_COPY/);
    assert.match(
      card,
      /licensee\.allowUnclaimedGetoblicProspecting\s*\?\s*"Enabled"\s*:\s*"Disabled"/,
    );
    assert.doesNotMatch(
      card,
      /allowUnclaimedGetoblicProspectingDraft\s*\?\s*"Enabled"/,
    );
    assert.match(card, /onSaveAllowUnclaimedGetoblicProspecting/);
    assert.match(directory, /allowUnclaimedGetoblicProspectingDrafts\[/);
    assert.match(page, /listLicenseeUnclaimedGetoblicProspectingForSuperAdmin/);
    assert.match(
      client,
      /\/api\/super\/accounts\/licensee\/unclaimed-getoblic-prospecting/,
    );
    assert.match(
      client,
      /allowUnclaimedGetoblicProspecting: nextAllow/,
    );
  });

  it("does not let the client checkbox authorize tenant prospecting", () => {
    const client = read("components/superAdmin/SuperAdminDashboardClient.tsx");
    const view = read("lib/superAdmin/superAdminDashboardView.ts");
    const service = read(
      "services/superAdmin/superAdminLicenseeUnclaimedGetoblicProspecting.ts",
    );
    const route = read(
      "app/api/super/accounts/licensee/unclaimed-getoblic-prospecting/route.ts",
    );
    const subAccountCard = read(
      "components/superAdmin/SuperAdminSubAccountCard.tsx",
    );

    assert.match(
      view,
      /permission\?\.allowUnclaimedGetoblicProspecting === true/,
    );
    assert.match(client, /licenseeUnclaimedGetoblicProspecting,/);
    assert.doesNotMatch(
      client,
      /unclaimedGetoblicProspecting:\s*allowUnclaimedGetoblicProspectingDrafts/,
    );
    assert.doesNotMatch(client, /acquire_unclaimed_getoblic_prospect/);
    assert.doesNotMatch(service, /acquire_unclaimed_getoblic_prospect/);
    assert.doesNotMatch(route, /Boolean\(body\.allowUnclaimedGetoblicProspecting\)/);
    assert.doesNotMatch(route, /export async function POST/);
    assert.match(route, /export async function PATCH/);
    assert.match(route, /NOT_SUPER_ADMIN/);
    assert.match(
      route,
      /updateLicenseeUnclaimedGetoblicProspectingForSuperAdmin/,
    );
    assert.doesNotMatch(subAccountCard, /allowUnclaimedGetoblicProspecting/);

    const createRoute = read("app/api/super/accounts/licensee/route.ts");
    assert.match(createRoute, /export async function POST/);
    assert.match(
      createRoute,
      /allowUnclaimedGetoblicProspecting:\s*body\.allowUnclaimedGetoblicProspecting/,
    );
    assert.doesNotMatch(
      createRoute,
      /Boolean\(body\.allowUnclaimedGetoblicProspecting\)/,
    );

    for (const root of [
      "app/licensee",
      "components/licensee",
      "services/licensee",
      "services/prospects",
      "services/getoblicDirectory",
      "app/campus",
      "components/campus",
    ]) {
      for (const file of walkSourceFiles(root)) {
        const source = read(file);
        assert.doesNotMatch(
          source,
          /updateLicenseeUnclaimedGetoblicProspectingForSuperAdmin|allowUnclaimedGetoblicProspecting/,
          `${file} must not take client authority for this permission`,
        );
      }
    }
  });

  it("leaves fees, language, and Own Company writers unchanged", () => {
    const service = read(
      "services/superAdmin/superAdminLicenseeUnclaimedGetoblicProspecting.ts",
    );
    const accounts = read("services/superAdmin/superAdminAccounts.ts");
    const createMaster = sliceBetween(
      accounts,
      "export async function createLicenseeMasterAsSuperAdmin",
      "async function resolveManageableAccountTarget",
    );
    assert.match(createMaster, /requireGetOblicSuperAdmin\(input\.actorUserId\)/);
    assert.match(createMaster, /default_language: defaultLanguage/);
    assert.doesNotMatch(createMaster, /own_company_organization_id/);
    assert.doesNotMatch(createMaster, /from\("organizations"\)/);
    assert.doesNotMatch(createMaster, /licensee_monthly_fee_usd/);
    assert.doesNotMatch(createMaster, /sub_account_monthly_fee_usd/);
    assert.doesNotMatch(service, /default_language/);
    assert.doesNotMatch(service, /licensee_monthly_fee_usd/);
    assert.doesNotMatch(service, /sub_account_monthly_fee_usd/);
    assert.doesNotMatch(service, /own_company_organization_id/);
    assert.doesNotMatch(
      read("services/superAdmin/superAdminLicenseeCommercialFees.ts"),
      /allow_unclaimed_getoblic_prospecting/,
    );
    assert.doesNotMatch(
      read("services/superAdmin/superAdminLicenseeDefaultLanguage.ts"),
      /allow_unclaimed_getoblic_prospecting/,
    );
    assert.match(
      read("services/superAdmin/superAdminAuditLog.ts"),
      /update_licensee_unclaimed_getoblic_prospecting/,
    );
    const previousMatches = service.match(
      /previousAllowUnclaimedGetoblicProspecting/g,
    );
    assert.ok(previousMatches && previousMatches.length >= 2);
  });
});
