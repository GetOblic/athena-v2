import "./licenseeAuthTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { LicenseeAccessError } from "../../services/licensee/licenseeIdentity";
import {
  LicenseeOwnCompanyError,
  designateLicenseeOwnCompany,
  removeLicenseeSubAccountRelationship,
} from "../../services/licensee/licenseeSubAccounts";
import {
  shouldAutoDesignateOwnCompany,
  sortLicenseeSubAccountsForDashboard,
  sortLicenseeSubAccountsShared,
  type LicenseeSubAccountListItem,
} from "../../services/licensee/licenseeSubAccountTypes";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const MASTER_A_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MASTER_B_USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LICENSEE_A_ID = "11111111-1111-4111-8111-111111111111";
const LICENSEE_B_ID = "22222222-2222-4222-8222-222222222222";
const ORG_A = "33333333-3333-4333-8333-333333333333";
const ORG_B = "44444444-4444-4444-8444-444444444444";
const ORG_FOREIGN = "77777777-7777-4777-8777-777777777777";
const REL_A = "55555555-5555-4555-8555-555555555555";
const REL_B = "66666666-6666-4666-8666-666666666666";
const REL_FOREIGN = "88888888-8888-4888-8888-888888888888";

type LicenseeRow = {
  id: string;
  user_id: string;
  email: string;
  own_company_organization_id: string | null;
};

type RelationshipRow = {
  id: string;
  licensee_account_id: string;
  organization_id: string;
  pinned?: boolean;
  pinned_at?: string | null;
};

type Fixture = {
  licenseeByUserId: Record<string, LicenseeRow>;
  relationships: RelationshipRow[];
  accessStatusByUserId: Record<string, "active" | "deactivated" | undefined>;
};

type CallLog = {
  tables: string[];
  updates: Array<{ table: string; values: Record<string, unknown> }>;
  deletes: Array<{ table: string; filters: Record<string, string> }>;
};

const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);

function installFixture(fixture: Fixture): CallLog {
  const calls: CallLog = { tables: [], updates: [], deletes: [] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = (table: string) => {
    calls.tables.push(table);
    const filters: Record<string, string> = {};
    let nullFilter: string | null = null;

    const builder = {
      select: () => builder,
      eq: (column: string, value: string) => {
        filters[column] = value;
        return builder;
      },
      is: (column: string, value: null) => {
        if (value === null) {
          nullFilter = column;
        }
        return builder;
      },
      maybeSingle: async () => {
        if (table === "licensee_accounts") {
          const userId = filters.user_id;
          const id = filters.id;
          const row = userId
            ? fixture.licenseeByUserId[userId]
            : Object.values(fixture.licenseeByUserId).find(
                (item) => item.id === id,
              );
          return { data: row ?? null, error: null };
        }

        if (table === "licensee_sub_accounts") {
          const match = fixture.relationships.find((row) => {
            if (filters.id && row.id !== filters.id) return false;
            if (
              filters.licensee_account_id &&
              row.licensee_account_id !== filters.licensee_account_id
            ) {
              return false;
            }
            if (
              filters.organization_id &&
              row.organization_id !== filters.organization_id
            ) {
              return false;
            }
            return true;
          });
          return {
            data: match
              ? {
                  id: match.id,
                  licensee_account_id: match.licensee_account_id,
                  organization_id: match.organization_id,
                }
              : null,
            error: null,
          };
        }

        if (table === "account_access_status") {
          const status = filters.user_id
            ? fixture.accessStatusByUserId[filters.user_id]
            : undefined;
          return { data: status ? { status } : null, error: null };
        }

        return { data: null, error: null };
      },
      single: async () => builder.maybeSingle(),
      update: (values: Record<string, unknown>) => {
        calls.updates.push({ table, values });
        return {
          eq: (column: string, value: string) => {
            filters[column] = value;
            return {
              is: (columnName: string, value: null) => {
                if (value === null) nullFilter = columnName;
                return {
                  select: () => ({
                    maybeSingle: async () => {
                      if (table !== "licensee_accounts") {
                        return { data: null, error: null };
                      }
                      const row = Object.values(fixture.licenseeByUserId).find(
                        (item) => item.id === filters.id,
                      );
                      if (!row) return { data: null, error: null };
                      if (
                        nullFilter === "own_company_organization_id" &&
                        row.own_company_organization_id !== null
                      ) {
                        return { data: null, error: null };
                      }
                      row.own_company_organization_id = String(
                        values.own_company_organization_id,
                      );
                      return { data: { id: row.id }, error: null };
                    },
                  }),
                };
              },
            };
          },
        };
      },
      delete: () => ({
        eq: (column: string, value: string) => {
          filters[column] = value;
          return {
            eq: (column2: string, value2: string) => {
              filters[column2] = value2;
              calls.deletes.push({ table, filters: { ...filters } });
              if (table === "licensee_sub_accounts") {
                const index = fixture.relationships.findIndex(
                  (row) =>
                    row.id === filters.id &&
                    row.licensee_account_id === filters.licensee_account_id,
                );
                if (index >= 0) {
                  fixture.relationships.splice(index, 1);
                }
              }
              return Promise.resolve({ error: null });
            },
          };
        },
      }),
    };

    return builder;
  };

  return calls;
}

function restoreSupabaseAdmin() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = originalFrom;
}

function baseFixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    licenseeByUserId: {
      [MASTER_A_USER_ID]: {
        id: LICENSEE_A_ID,
        user_id: MASTER_A_USER_ID,
        email: "master-a@example.com",
        own_company_organization_id: null,
      },
      [MASTER_B_USER_ID]: {
        id: LICENSEE_B_ID,
        user_id: MASTER_B_USER_ID,
        email: "master-b@example.com",
        own_company_organization_id: ORG_FOREIGN,
      },
    },
    relationships: [
      {
        id: REL_A,
        licensee_account_id: LICENSEE_A_ID,
        organization_id: ORG_A,
      },
      {
        id: REL_B,
        licensee_account_id: LICENSEE_A_ID,
        organization_id: ORG_B,
      },
      {
        id: REL_FOREIGN,
        licensee_account_id: LICENSEE_B_ID,
        organization_id: ORG_FOREIGN,
      },
    ],
    accessStatusByUserId: {
      [MASTER_A_USER_ID]: "active",
      [MASTER_B_USER_ID]: "active",
    },
    ...overrides,
  };
}

function listItem(
  overrides: Partial<LicenseeSubAccountListItem> &
    Pick<LicenseeSubAccountListItem, "name" | "organizationId">,
): LicenseeSubAccountListItem {
  return {
    relationshipId: overrides.relationshipId ?? overrides.organizationId,
    organizationId: overrides.organizationId,
    name: overrides.name,
    displayName: overrides.displayName ?? null,
    logoPreviewUrl: null,
    pinned: overrides.pinned ?? false,
    pinnedAt: overrides.pinnedAt ?? null,
    isOwnCompany: overrides.isOwnCompany ?? false,
    accountEmail: null,
    notes: "",
    accountSnapshot: null,
    metrics: {
      prospectCount: 0,
      discussionCount: 0,
      personaCount: 0,
      brainReady: false,
      websiteIntelligenceReady: false,
      seoReady: false,
      adsReady: false,
      lastVisitedAt: null,
      accountReadinessPercent: 0,
    },
  };
}

afterEach(() => {
  restoreSupabaseAdmin();
});

describe("V2-LIC-1 — persistence / types", () => {
  it("1/2/3. migration adds nullable own_company_organization_id FK without backfill", () => {
    const migration = read(
      "supabase/migrations/20260907000001_add_licensee_own_company_organization.sql",
    );
    assert.match(migration, /alter table licensee_accounts/);
    assert.match(
      migration,
      /add column if not exists own_company_organization_id uuid null/,
    );
    assert.match(migration, /references organizations\(id\) on delete set null/);
    assert.match(migration, /Not backfilled/);
    assert.doesNotMatch(migration, /update\s+licensee_accounts/i);
    assert.doesNotMatch(migration, /is_own_company/);
    assert.doesNotMatch(migration, /alter table licensee_sub_accounts/i);
  });

  it("identity type and Master fetch include the governing FK", () => {
    const identity = read("services/licensee/licenseeIdentity.ts");
    assert.match(identity, /own_company_organization_id:\s*string \| null/);
    assert.match(
      identity,
      /select\("id, user_id, email, own_company_organization_id"\)/,
    );
  });
});

describe("V2-LIC-1 — first-account auto-designation", () => {
  it("4/5/6. auto-designate only when FK is null and relationship count was zero", () => {
    assert.equal(
      shouldAutoDesignateOwnCompany({
        ownCompanyOrganizationId: null,
        existingRelationshipCount: 0,
      }),
      true,
    );
    assert.equal(
      shouldAutoDesignateOwnCompany({
        ownCompanyOrganizationId: null,
        existingRelationshipCount: 1,
      }),
      false,
    );
    assert.equal(
      shouldAutoDesignateOwnCompany({
        ownCompanyOrganizationId: ORG_A,
        existingRelationshipCount: 0,
      }),
      false,
    );

    const service = read("services/licensee/licenseeSubAccounts.ts");
    const helperStart = service.indexOf(
      "async function maybeAutoDesignateFirstOwnCompany",
    );
    const helperEnd = service.indexOf(
      "export async function getLicenseeOwnCompanySetupState",
      helperStart,
    );
    const createStart = service.indexOf(
      "export async function createLicenseeSubAccount",
    );
    const createFn = service.slice(createStart);
    const helperFn = service.slice(helperStart, helperEnd);
    assert.match(createFn, /countLicenseeSubAccountRelationships/);
    assert.ok(
      createFn.indexOf("existingRelationshipCount") <
        createFn.indexOf("await ensureRelationship"),
    );
    assert.ok(
      createFn.indexOf("await ensureRelationship") <
        createFn.indexOf("maybeAutoDesignateFirstOwnCompany"),
    );
    assert.match(helperFn, /shouldAutoDesignateOwnCompany/);
    assert.doesNotMatch(createFn, /pinned:\s*true/);
    assert.doesNotMatch(helperFn, /pinned_at/);
  });
});

describe("V2-LIC-1 — explicit designation", () => {
  it("7. Licensee can designate an owned sub-account when unset", async () => {
    const fixture = baseFixture();
    const calls = installFixture(fixture);

    const result = await designateLicenseeOwnCompany({
      masterUserId: MASTER_A_USER_ID,
      relationshipId: REL_A,
    });

    assert.deepEqual(result, {
      relationshipId: REL_A,
      organizationId: ORG_A,
      alreadyDesignated: false,
    });
    assert.equal(
      fixture.licenseeByUserId[MASTER_A_USER_ID].own_company_organization_id,
      ORG_A,
    );
    assert.ok(
      calls.updates.every(
        (update) =>
          !Object.prototype.hasOwnProperty.call(update.values, "pinned") &&
          !Object.prototype.hasOwnProperty.call(update.values, "pinned_at"),
      ),
    );
    assert.equal(calls.deletes.length, 0);
  });

  it("8. cannot designate another Licensee's organization", async () => {
    installFixture(baseFixture());

    await assert.rejects(
      () =>
        designateLicenseeOwnCompany({
          masterUserId: MASTER_A_USER_ID,
          relationshipId: REL_FOREIGN,
        }),
      (error: unknown) =>
        error instanceof LicenseeAccessError &&
        error.message === "Master does not own this sub-account relationship.",
    );
  });

  it("9. cannot replace an already-set different own company", async () => {
    installFixture(
      baseFixture({
        licenseeByUserId: {
          [MASTER_A_USER_ID]: {
            id: LICENSEE_A_ID,
            user_id: MASTER_A_USER_ID,
            email: "master-a@example.com",
            own_company_organization_id: ORG_A,
          },
          [MASTER_B_USER_ID]: {
            id: LICENSEE_B_ID,
            user_id: MASTER_B_USER_ID,
            email: "master-b@example.com",
            own_company_organization_id: ORG_FOREIGN,
          },
        },
      }),
    );

    await assert.rejects(
      () =>
        designateLicenseeOwnCompany({
          masterUserId: MASTER_A_USER_ID,
          relationshipId: REL_B,
        }),
      (error: unknown) =>
        error instanceof LicenseeOwnCompanyError &&
        error.code === "OWN_COMPANY_ALREADY_DESIGNATED",
    );
  });

  it("10. same-org designation is idempotent", async () => {
    const fixture = baseFixture({
      licenseeByUserId: {
        [MASTER_A_USER_ID]: {
          id: LICENSEE_A_ID,
          user_id: MASTER_A_USER_ID,
          email: "master-a@example.com",
          own_company_organization_id: ORG_A,
        },
        [MASTER_B_USER_ID]: {
          id: LICENSEE_B_ID,
          user_id: MASTER_B_USER_ID,
          email: "master-b@example.com",
          own_company_organization_id: ORG_FOREIGN,
        },
      },
    });
    const calls = installFixture(fixture);

    const result = await designateLicenseeOwnCompany({
      masterUserId: MASTER_A_USER_ID,
      relationshipId: REL_A,
    });

    assert.equal(result.alreadyDesignated, true);
    assert.equal(result.organizationId, ORG_A);
    assert.equal(calls.updates.length, 0);
  });
});

describe("V2-LIC-1 — removal protection", () => {
  it("11. own-company relationship cannot be removed", async () => {
    const fixture = baseFixture({
      licenseeByUserId: {
        [MASTER_A_USER_ID]: {
          id: LICENSEE_A_ID,
          user_id: MASTER_A_USER_ID,
          email: "master-a@example.com",
          own_company_organization_id: ORG_A,
        },
        [MASTER_B_USER_ID]: {
          id: LICENSEE_B_ID,
          user_id: MASTER_B_USER_ID,
          email: "master-b@example.com",
          own_company_organization_id: ORG_FOREIGN,
        },
      },
    });
    const calls = installFixture(fixture);

    await assert.rejects(
      () =>
        removeLicenseeSubAccountRelationship({
          masterUserId: MASTER_A_USER_ID,
          relationshipId: REL_A,
        }),
      (error: unknown) =>
        error instanceof LicenseeOwnCompanyError &&
        error.code === "OWN_COMPANY_RELATIONSHIP_LOCKED",
    );
    assert.equal(calls.deletes.length, 0);
    assert.equal(fixture.relationships.some((row) => row.id === REL_A), true);
    assert.equal(
      fixture.licenseeByUserId[MASTER_A_USER_ID].own_company_organization_id,
      ORG_A,
    );
  });

  it("12. normal client relationship removal still works", async () => {
    const fixture = baseFixture({
      licenseeByUserId: {
        [MASTER_A_USER_ID]: {
          id: LICENSEE_A_ID,
          user_id: MASTER_A_USER_ID,
          email: "master-a@example.com",
          own_company_organization_id: ORG_A,
        },
        [MASTER_B_USER_ID]: {
          id: LICENSEE_B_ID,
          user_id: MASTER_B_USER_ID,
          email: "master-b@example.com",
          own_company_organization_id: ORG_FOREIGN,
        },
      },
    });
    installFixture(fixture);

    const result = await removeLicenseeSubAccountRelationship({
      masterUserId: MASTER_A_USER_ID,
      relationshipId: REL_B,
    });

    assert.deepEqual(result, {
      relationshipId: REL_B,
      organizationId: ORG_B,
    });
    assert.equal(fixture.relationships.some((row) => row.id === REL_B), false);
    assert.equal(
      fixture.licenseeByUserId[MASTER_A_USER_ID].own_company_organization_id,
      ORG_A,
    );
  });
});

describe("V2-LIC-1 — pin non-interference and dashboard order", () => {
  it("13/14. pin persistence and API remain unchanged; designation does not write pin", () => {
    const service = read("services/licensee/licenseeSubAccounts.ts");
    const pinStart = service.indexOf(
      "export async function setLicenseeSubAccountPinned",
    );
    const pinEnd = service.indexOf(
      "export async function setLicenseeSubAccountDisplayName",
      pinStart,
    );
    const pinFn = service.slice(pinStart, pinEnd);
    assert.match(pinFn, /pinned:\s*input\.pinned/);
    assert.match(pinFn, /pinned_at:\s*pinnedAt/);
    assert.doesNotMatch(pinFn, /own_company_organization_id/);

    const designateStart = service.indexOf(
      "export async function designateLicenseeOwnCompany",
    );
    const designateFn = service.slice(designateStart);
    assert.match(designateFn, /own_company_organization_id/);
    assert.doesNotMatch(
      designateFn.slice(0, designateFn.indexOf("async function persistOwnCompanyIfUnset") > 0
        ? designateFn.length
        : designateFn.length),
      /pinned:\s*true|pinned_at:\s*new Date/,
    );
  });

  it("15/16. dashboard order is own company → pinned clients → remaining, alpha within groups", () => {
    const zebraPinned = listItem({
      name: "Zebra Client",
      organizationId: "z",
      pinned: true,
    });
    const acmePinned = listItem({
      name: "Acme Client",
      organizationId: "a",
      pinned: true,
    });
    const ownCompany = listItem({
      name: "GetOblic Studio",
      organizationId: "own",
      isOwnCompany: true,
      pinned: false,
    });
    const beta = listItem({
      name: "Beta Client",
      organizationId: "b",
    });
    const delta = listItem({
      name: "Delta Client",
      organizationId: "d",
    });

    const dashboard = sortLicenseeSubAccountsForDashboard([
      beta,
      zebraPinned,
      ownCompany,
      delta,
      acmePinned,
    ]);
    assert.deepEqual(
      dashboard.map((item) => item.name),
      [
        "GetOblic Studio",
        "Acme Client",
        "Zebra Client",
        "Beta Client",
        "Delta Client",
      ],
    );

    const shared = sortLicenseeSubAccountsShared([
      beta,
      zebraPinned,
      ownCompany,
      delta,
      acmePinned,
    ]);
    assert.deepEqual(
      shared.map((item) => item.name),
      [
        "Acme Client",
        "Zebra Client",
        "Beta Client",
        "Delta Client",
        "GetOblic Studio",
      ],
    );
  });
});

describe("V2-LIC-1 — Estimate / handoff / authorization / UI", () => {
  it("17/18. shared Estimate list order and default-selection remain unchanged", () => {
    const service = read("services/licensee/licenseeSubAccounts.ts");
    const estimate = read(
      "components/licensee/estimate/LicenseeEstimateClient.tsx",
    );
    const estimatePage = read("app/licensee/estimate/page.tsx");
    const listStart = service.indexOf(
      "export async function listLicenseeSubAccountsForMaster",
    );
    const listEnd = service.indexOf(
      "export async function setLicenseeSubAccountPinned",
      listStart,
    );
    const listFn = service.slice(listStart, listEnd);

    assert.match(listFn, /sortLicenseeSubAccountsShared/);
    assert.doesNotMatch(listFn, /sortLicenseeSubAccountsForDashboard/);
    assert.match(listFn, /isOwnCompany/);
    assert.match(estimatePage, /listLicenseeSubAccountsForMaster/);
    assert.match(estimate, /subAccounts\[0\]\?\.organizationId/);
    assert.doesNotMatch(estimate, /isOwnCompany|sortLicenseeSubAccountsForDashboard/);
  });

  it("19/20. own-company Open Athena still uses existing handoff", () => {
    const client = read("components/licensee/LicenseeDashboardClient.tsx");
    const handoff = read("app/api/licensee/handoff/route.ts");
    assert.match(client, /fetch\("\/api\/licensee\/handoff"/);
    assert.match(client, /action: "open_sub_account"/);
    assert.match(client, /organizationId/);
    assert.match(handoff, /open_sub_account/);
    assert.match(handoff, /handoffMasterToSubAccount/);
    assert.doesNotMatch(client, /isOwnCompany[\s\S]{0,80}handoff/);
  });

  it("21-25. dashboard renders My Company distinctly and empty/unset states", () => {
    const client = read("components/licensee/LicenseeDashboardClient.tsx");
    const create = read("app/licensee/sub-accounts/new/page.tsx");

    assert.match(client, /My Company/);
    assert.match(client, /LockIcon/);
    assert.match(client, /sortLicenseeSubAccountsForDashboard/);
    assert.match(client, /item\.isOwnCompany/);
    assert.match(client, /Set as My Company/);
    assert.match(client, /Which account is your company\?/);
    assert.match(
      client,
      /Choose the account you use to run your own GetOblic business/,
    );
    assert.match(client, /Create your company account/);
    assert.match(client, /title="Pinned"/);
    assert.match(client, /title="All Sub-accounts"/);

    const cardStart = client.indexOf("function SubAccountCard");
    const pinIndex = client.indexOf('item.pinned ? "Pinned" : "Pin"', cardStart);
    const removeIndex = client.indexOf("Remove", pinIndex);
    const ownCompanyGuard = client.indexOf("item.isOwnCompany", cardStart);
    assert.ok(ownCompanyGuard > cardStart);
    assert.ok(pinIndex > ownCompanyGuard);
    assert.ok(removeIndex > pinIndex);
    assert.match(
      client.slice(cardStart),
      /item\.isOwnCompany \? \([\s\S]*Locked company identity/,
    );

    assert.match(create, /isFirstCompanySetup/);
    assert.match(create, /Create your company account/);
    assert.match(create, /Create Sub-account/);
    assert.match(create, /getLicenseeOwnCompanySetupState/);
  });

  it("authorization uses existing Master + relationship checks", () => {
    const service = read("services/licensee/licenseeSubAccounts.ts");
    const route = read("app/api/licensee/sub-accounts/own-company/route.ts");
    const designateStart = service.indexOf(
      "export async function designateLicenseeOwnCompany",
    );
    const designateFn = service.slice(
      designateStart,
      service.indexOf(
        "async function maybeAutoDesignateFirstOwnCompany",
        designateStart,
      ),
    );
    assert.match(designateFn, /requireLicenseeMasterAccount/);
    assert.match(designateFn, /assertLicenseeOwnsSubAccount/);
    assert.match(designateFn, /licensee_account_id !== licenseeAccount\.id/);
    assert.match(route, /designateLicenseeOwnCompany/);
    assert.match(route, /jsonError\(403/);
    assert.doesNotMatch(designateFn, /from\("organizations"\)\.update/);
    assert.doesNotMatch(designateFn, /from\("organization_members"\)/);
  });
});

describe("V2-LIC-1 — strict non-interference", () => {
  it("26/27/28. Quote, GetOblic, and tenant V2 shell stay outside this change", () => {
    const quote = read("app/licensee/quote/page.tsx");
    const estimatePage = read("app/licensee/estimate/page.tsx");
    const sidebar = read("components/dashboard/DashboardSidebar.tsx");

    assert.match(quote, /getLicenseeAccountByUserId/);
    assert.match(quote, /Back to Master dashboard/);
    assert.doesNotMatch(quote, /own_company|isOwnCompany|My Company/);
    assert.doesNotMatch(estimatePage, /own_company|isOwnCompany|My Company/);
    assert.doesNotMatch(sidebar, /My Company|own_company_organization_id/);
    assert.doesNotMatch(sidebar, /\/licensee\/quote|\/licensee\/estimate/);
  });
});
