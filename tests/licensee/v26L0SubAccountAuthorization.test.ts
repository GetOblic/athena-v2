import "./licenseeAuthTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import {
  LicenseeAccessError,
  assertLicenseeOwnsSubAccount,
  resolveAuthorizedSubAccountHandoff,
} from "../../services/licensee/licenseeIdentity";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const MASTER_A_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MASTER_B_USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LICENSEE_A_ID = "11111111-1111-4111-8111-111111111111";
const LICENSEE_B_ID = "22222222-2222-4222-8222-222222222222";
const ORG_RELATED = "33333333-3333-4333-8333-333333333333";
const ORG_UNRELATED = "44444444-4444-4444-8444-444444444444";
const RELATIONSHIP_ID = "55555555-5555-4555-8555-555555555555";
const OWNER_USER_ID = "66666666-6666-4666-8666-666666666666";
const OWNER_EMAIL = "owner@example.com";

type TableResult = {
  data: Record<string, unknown> | null;
  error: { code?: string; message?: string } | null;
};

type Fixture = {
  licenseeByUserId: Record<string, { id: string; user_id: string; email: string }>;
  relationships: Array<{
    id: string;
    licensee_account_id: string;
    organization_id: string;
  }>;
  accessStatusByUserId: Record<string, "active" | "deactivated" | undefined>;
  ownersByOrganizationId: Record<string, { user_id: string; role: string }>;
  authUsersById: Record<string, { email: string }>;
};

type CallLog = {
  tables: string[];
  getUserByIdCalls: string[];
};

const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);
const originalGetUserById = supabaseAdmin.auth.admin.getUserById.bind(
  supabaseAdmin.auth.admin,
);

function installFixture(fixture: Fixture): CallLog {
  const calls: CallLog = { tables: [], getUserByIdCalls: [] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = (table: string) => {
    calls.tables.push(table);

    const filters: Record<string, string> = {};
    const builder = {
      select: () => builder,
      eq: (column: string, value: string) => {
        filters[column] = value;
        return builder;
      },
      maybeSingle: async (): Promise<TableResult> => {
        if (table === "licensee_accounts") {
          const userId = filters.user_id;
          const row = userId ? fixture.licenseeByUserId[userId] : undefined;
          return { data: row ?? null, error: null };
        }

        if (table === "licensee_sub_accounts") {
          const match = fixture.relationships.find(
            (row) =>
              row.licensee_account_id === filters.licensee_account_id &&
              row.organization_id === filters.organization_id,
          );
          return {
            data: match
              ? { id: match.id, organization_id: match.organization_id }
              : null,
            error: null,
          };
        }

        if (table === "account_access_status") {
          const userId = filters.user_id;
          const status = userId
            ? fixture.accessStatusByUserId[userId]
            : undefined;
          return {
            data: status ? { status } : null,
            error: null,
          };
        }

        if (table === "organization_members") {
          const orgId = filters.organization_id;
          const role = filters.role;
          const owner = orgId ? fixture.ownersByOrganizationId[orgId] : undefined;
          if (!owner || (role && owner.role !== role)) {
            return { data: null, error: null };
          }
          return { data: owner, error: null };
        }

        return { data: null, error: null };
      },
    };

    return builder;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin.auth.admin as any).getUserById = async (userId: string) => {
    calls.getUserByIdCalls.push(userId);
    const user = fixture.authUsersById[userId];
    if (!user) {
      return { data: { user: null }, error: { message: "not found" } };
    }
    return { data: { user: { id: userId, email: user.email } }, error: null };
  };

  return calls;
}

function restoreSupabaseAdmin() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = originalFrom;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin.auth.admin as any).getUserById = originalGetUserById;
}

function baseFixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    licenseeByUserId: {
      [MASTER_A_USER_ID]: {
        id: LICENSEE_A_ID,
        user_id: MASTER_A_USER_ID,
        email: "master-a@example.com",
      },
      [MASTER_B_USER_ID]: {
        id: LICENSEE_B_ID,
        user_id: MASTER_B_USER_ID,
        email: "master-b@example.com",
      },
    },
    relationships: [
      {
        id: RELATIONSHIP_ID,
        licensee_account_id: LICENSEE_A_ID,
        organization_id: ORG_RELATED,
      },
    ],
    accessStatusByUserId: {
      [MASTER_A_USER_ID]: "active",
      [MASTER_B_USER_ID]: "active",
      [OWNER_USER_ID]: "active",
    },
    ownersByOrganizationId: {
      [ORG_RELATED]: { user_id: OWNER_USER_ID, role: "owner" },
    },
    authUsersById: {
      [OWNER_USER_ID]: { email: OWNER_EMAIL },
    },
    ...overrides,
  };
}

afterEach(() => {
  restoreSupabaseAdmin();
});

describe("V26 L0 — assertLicenseeOwnsSubAccount relationship authorization", () => {
  it("authorized Master + related organization succeeds with minimal relationship identity", async () => {
    const calls = installFixture(baseFixture());

    const result = await assertLicenseeOwnsSubAccount({
      masterUserId: MASTER_A_USER_ID,
      organizationId: ORG_RELATED,
    });

    assert.deepEqual(result, {
      licenseeAccountId: LICENSEE_A_ID,
      organizationId: ORG_RELATED,
      relationshipId: RELATIONSHIP_ID,
    });
    assert.ok(calls.tables.includes("licensee_accounts"));
    assert.ok(calls.tables.includes("licensee_sub_accounts"));
    assert.equal(calls.getUserByIdCalls.length, 0);
    assert.ok(!calls.tables.includes("organization_members"));
  });

  it("authorized Master + unrelated organization fails closed", async () => {
    installFixture(baseFixture());

    await assert.rejects(
      () =>
        assertLicenseeOwnsSubAccount({
          masterUserId: MASTER_A_USER_ID,
          organizationId: ORG_UNRELATED,
        }),
      (error: unknown) =>
        error instanceof LicenseeAccessError &&
        error.message === "Master does not own this sub-account relationship.",
    );
  });

  it("organizationId alone cannot authorize access", async () => {
    installFixture({
      ...baseFixture(),
      licenseeByUserId: {},
    });

    await assert.rejects(
      () =>
        assertLicenseeOwnsSubAccount({
          masterUserId: MASTER_A_USER_ID,
          organizationId: ORG_RELATED,
        }),
      (error: unknown) =>
        error instanceof LicenseeAccessError &&
        error.message ===
          "Authenticated user is not a Business Licensee Master.",
    );
  });

  it("different Master cannot authorize another Master's relationship", async () => {
    installFixture(baseFixture());

    await assert.rejects(
      () =>
        assertLicenseeOwnsSubAccount({
          masterUserId: MASTER_B_USER_ID,
          organizationId: ORG_RELATED,
        }),
      (error: unknown) =>
        error instanceof LicenseeAccessError &&
        error.message === "Master does not own this sub-account relationship.",
    );
  });

  it("deactivated Master remains rejected according to existing Master access semantics", async () => {
    installFixture({
      ...baseFixture(),
      accessStatusByUserId: {
        [MASTER_A_USER_ID]: "deactivated",
        [OWNER_USER_ID]: "active",
      },
    });

    await assert.rejects(
      () =>
        assertLicenseeOwnsSubAccount({
          masterUserId: MASTER_A_USER_ID,
          organizationId: ORG_RELATED,
        }),
      (error: unknown) =>
        error instanceof LicenseeAccessError &&
        error.message === "This account has been deactivated." &&
        error.code === "ACCOUNT_DEACTIVATED",
    );
  });

  it("new helper does not perform owner or session handoff", async () => {
    const identity = read("services/licensee/licenseeIdentity.ts");
    const helperStart = identity.indexOf(
      "export async function assertLicenseeOwnsSubAccount",
    );
    assert.ok(helperStart >= 0);
    const helperClose = identity.indexOf(
      "\n}\n\n/**\n * Server-authoritative Open Athena authorization + handoff identity chain:",
      helperStart,
    );
    assert.ok(helperClose > helperStart);
    const helperBody = identity.slice(helperStart, helperClose + 2);

    assert.doesNotMatch(helperBody, /organization_members/);
    assert.doesNotMatch(helperBody, /getUserById/);
    assert.doesNotMatch(helperBody, /generateLink|verifyOtp|establishSupabaseSession/);
    assert.doesNotMatch(helperBody, /LICENSEE_.*COOKIE|master-marker|MasterMarker/i);
    assert.doesNotMatch(helperBody, /ownerUserId|ownerEmail/);

    const calls = installFixture(baseFixture());
    await assertLicenseeOwnsSubAccount({
      masterUserId: MASTER_A_USER_ID,
      organizationId: ORG_RELATED,
    });
    assert.equal(calls.getUserByIdCalls.length, 0);
    assert.ok(!calls.tables.includes("organization_members"));
  });
});

describe("V26 L0 — resolveAuthorizedSubAccountHandoff preserves handoff behavior", () => {
  it("still resolves owner, applies owner active checks, and returns existing DTO", async () => {
    const calls = installFixture(baseFixture());

    const result = await resolveAuthorizedSubAccountHandoff({
      masterUserId: MASTER_A_USER_ID,
      organizationId: ORG_RELATED,
    });

    assert.deepEqual(result, {
      licenseeAccountId: LICENSEE_A_ID,
      organizationId: ORG_RELATED,
      ownerUserId: OWNER_USER_ID,
      ownerEmail: OWNER_EMAIL,
    });
    assert.ok(calls.tables.includes("organization_members"));
    assert.deepEqual(calls.getUserByIdCalls, [OWNER_USER_ID]);
    assert.ok(calls.tables.includes("account_access_status"));
  });

  it("still fails closed for unauthorized relationships before owner resolution", async () => {
    const calls = installFixture(baseFixture());

    await assert.rejects(
      () =>
        resolveAuthorizedSubAccountHandoff({
          masterUserId: MASTER_A_USER_ID,
          organizationId: ORG_UNRELATED,
        }),
      (error: unknown) =>
        error instanceof LicenseeAccessError &&
        error.message === "Master does not own this sub-account relationship.",
    );
    assert.equal(calls.getUserByIdCalls.length, 0);
    assert.ok(!calls.tables.includes("organization_members"));
  });

  it("still rejects deactivated sub-account owners", async () => {
    // Open Athena handoff path only — Estimate assert does not require owner-active.
    installFixture({
      ...baseFixture(),
      accessStatusByUserId: {
        [MASTER_A_USER_ID]: "active",
        [OWNER_USER_ID]: "deactivated",
      },
    });

    await assert.rejects(
      () =>
        resolveAuthorizedSubAccountHandoff({
          masterUserId: MASTER_A_USER_ID,
          organizationId: ORG_RELATED,
        }),
      (error: unknown) =>
        error instanceof LicenseeAccessError &&
        error.message === "This account has been deactivated." &&
        error.code === "ACCOUNT_DEACTIVATED",
    );
  });

  it("handoff extracts relationship authorization through assertLicenseeOwnsSubAccount", () => {
    const identity = read("services/licensee/licenseeIdentity.ts");
    assert.match(identity, /export async function assertLicenseeOwnsSubAccount/);
    assert.match(
      identity,
      /const authorized = await assertLicenseeOwnsSubAccount\(input\)/,
    );
    assert.match(identity, /assertAccountAccessActive\(masterUserId\)/);
    assert.match(identity, /assertAccountAccessActive\(membership\.user_id\)/);
    assert.match(identity, /licensee_account_id/);
    assert.match(identity, /organization_id/);
    assert.match(identity, /relationshipId/);
    assert.match(identity, /ownerUserId/);
    assert.match(identity, /ownerEmail/);
  });
});
