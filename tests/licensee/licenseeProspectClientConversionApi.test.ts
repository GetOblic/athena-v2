import "./licenseeAuthTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import {
  LicenseeConversionManagedRemoveError,
  getActiveClientOrganizationForProspect,
  getActiveConversionForClientOrganization,
  getActiveConversionForRelationshipId,
  getProspectClientConversionState,
  httpStatusForLicenseeProspectClientConversionCode,
  isLicenseeClientOrganizationConversionManaged,
  prospectHasActiveClientConversion,
} from "../../services/licensee/licenseeProspectClientConversionReads";
import { LicenseeAccessError } from "../../services/licensee/licenseeIdentity";
import { removeLicenseeSubAccountRelationship } from "../../services/licensee/licenseeSubAccounts";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const MASTER_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LICENSEE_ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";
const OWN_COMPANY_ORG_ID = "33333333-3333-4333-8333-333333333333";
const CLIENT_ORG_ID = "44444444-4444-4444-8444-444444444444";
const MANUAL_ORG_ID = "77777777-7777-4777-8777-777777777777";
const PROSPECT_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ACTIVE_REL_ID = "66666666-6666-4666-8666-666666666666";
const MANUAL_REL_ID = "88888888-8888-4888-8888-888888888888";

type ConversionRow = {
  prospect_id: string;
  source_organization_id: string;
  client_organization_id: string;
  licensee_account_id: string;
  licensee_sub_account_id: string | null;
  status: string;
};

type RelationshipRow = {
  id: string;
  licensee_account_id: string;
  organization_id: string;
};

type Fixture = {
  conversions: ConversionRow[];
  relationships: RelationshipRow[];
  licenseeByUserId: Record<
    string,
    {
      id: string;
      user_id: string;
      email: string;
      own_company_organization_id: string | null;
    }
  >;
  accessStatusByUserId: Record<string, "active" | "deactivated" | undefined>;
};

const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);

function installFixture(fixture: Fixture) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = (table: string) => {
    const filters: Record<string, string> = {};

    const matchingConversions = () =>
      fixture.conversions.filter((row) => {
        if (filters.prospect_id && row.prospect_id !== filters.prospect_id) {
          return false;
        }
        if (
          filters.source_organization_id &&
          row.source_organization_id !== filters.source_organization_id
        ) {
          return false;
        }
        if (
          filters.client_organization_id &&
          row.client_organization_id !== filters.client_organization_id
        ) {
          return false;
        }
        if (
          filters.licensee_sub_account_id &&
          row.licensee_sub_account_id !== filters.licensee_sub_account_id
        ) {
          return false;
        }
        if (filters.status && row.status !== filters.status) {
          return false;
        }
        return true;
      });

    const builder = {
      select() {
        return builder;
      },
      eq(column: string, value: string) {
        filters[column] = value;
        return builder;
      },
      async maybeSingle() {
        if (table === "licensee_prospect_client_conversions") {
          return { data: matchingConversions()[0] ?? null, error: null };
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
          return { data: match ?? null, error: null };
        }
        if (table === "licensee_accounts") {
          const row = filters.user_id
            ? fixture.licenseeByUserId[filters.user_id]
            : Object.values(fixture.licenseeByUserId).find(
                (item) => item.id === filters.id,
              );
          return { data: row ?? null, error: null };
        }
        if (table === "account_access_status") {
          const status = filters.user_id
            ? fixture.accessStatusByUserId[filters.user_id]
            : undefined;
          return { data: status ? { status } : null, error: null };
        }
        return { data: null, error: null };
      },
      delete() {
        return {
          eq(column: string, value: string) {
            filters[column] = value;
            return {
              eq(column2: string, value2: string) {
                filters[column2] = value2;
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
        };
      },
      then(
        onFulfilled?: (value: { data: unknown; error: unknown }) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        if (table === "licensee_prospect_client_conversions") {
          return Promise.resolve({
            data: matchingConversions(),
            error: null,
          }).then(onFulfilled, onRejected);
        }
        return Promise.resolve({ data: [], error: null }).then(
          onFulfilled,
          onRejected,
        );
      },
    };

    return builder;
  };
}

function restoreSupabaseAdmin() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = originalFrom;
}

function baseFixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    conversions: [
      {
        prospect_id: PROSPECT_A,
        source_organization_id: OWN_COMPANY_ORG_ID,
        client_organization_id: CLIENT_ORG_ID,
        licensee_account_id: LICENSEE_ACCOUNT_ID,
        licensee_sub_account_id: ACTIVE_REL_ID,
        status: "active",
      },
    ],
    relationships: [
      {
        id: ACTIVE_REL_ID,
        licensee_account_id: LICENSEE_ACCOUNT_ID,
        organization_id: CLIENT_ORG_ID,
      },
      {
        id: MANUAL_REL_ID,
        licensee_account_id: LICENSEE_ACCOUNT_ID,
        organization_id: MANUAL_ORG_ID,
      },
    ],
    licenseeByUserId: {
      [MASTER_USER_ID]: {
        id: LICENSEE_ACCOUNT_ID,
        user_id: MASTER_USER_ID,
        email: "master-a@example.com",
        own_company_organization_id: OWN_COMPANY_ORG_ID,
      },
    },
    accessStatusByUserId: {
      [MASTER_USER_ID]: "active",
    },
    ...overrides,
  };
}

afterEach(() => {
  restoreSupabaseAdmin();
});

describe("Prospect ↔ client conversion API contracts", () => {
  it("promotion route is a thin org-scoped adapter to the domain service", () => {
    const route = read("app/api/prospects/[id]/convert-to-client/route.ts");
    assert.match(route, /export async function POST/);
    assert.match(route, /requireCurrentOrganizationContext/);
    assert.match(route, /promoteLicenseeProspectToClient/);
    assert.match(route, /prospectId: id/);
    assert.match(route, /sourceOrganizationId: organizationId/);
    assert.match(route, /actingUserId: userId/);
    assert.doesNotMatch(route, /masterUserId/);
    assert.match(route, /alreadyActive/);
    assert.match(route, /reattached/);
    assert.match(route, /clientOrganizationId/);
    assert.match(route, /clientAccountEmail/);
    assert.match(route, /continuityInitialized/);
    assert.match(route, /continuityState/);
    assert.match(route, /LicenseeProspectClientConversionError/);
    assert.match(route, /OrganizationAccessError/);
    assert.match(route, /LicenseeAccessError/);
    assert.match(route, /httpStatusForLicenseeProspectClientConversionCode/);
    assert.doesNotMatch(route, /createLicenseeSubAccount/);
    assert.doesNotMatch(route, /request\.json/);
    assert.doesNotMatch(route, /_request\.json/);
    assert.doesNotMatch(route, /licenseeAccountId/);
    assert.doesNotMatch(route, /accountEmail/);
    assert.doesNotMatch(route, /clientOrganizationId:\s*body/);
    assert.doesNotMatch(route, /sourceOrganizationId:\s*body/);
    assert.doesNotMatch(route, /licenseeAccountId|masterUserId/);
  });

  it("reversal route is Master-authorized and identifies conversion from relationshipId", () => {
    const route = read(
      "app/api/licensee/sub-accounts/restore-to-prospect/route.ts",
    );
    assert.match(route, /export async function POST/);
    assert.match(route, /createSupabaseServerClient/);
    assert.match(route, /auth\.getUser/);
    assert.match(route, /relationshipId/);
    assert.match(route, /getActiveConversionForRelationshipId/);
    assert.match(route, /reverseLicenseeProspectClientConversion/);
    assert.match(route, /CONVERSION_NOT_FOUND/);
    assert.match(route, /alreadyReversed/);
    assert.match(route, /LicenseeAccessError/);
    assert.doesNotMatch(route, /from\("organizations"\)/);
    assert.doesNotMatch(route, /auth\.admin\.deleteUser/);
    assert.doesNotMatch(route, /deleteProspect/);
    assert.doesNotMatch(route, /sourceOrganizationId:\s*body/);
    assert.doesNotMatch(route, /licenseeAccountId/);
    assert.doesNotMatch(route, /removeLicenseeSubAccountRelationship/);
  });

  it("ordinary Remove maps conversion-managed rejection and still delegates to the relationship helper", () => {
    const route = read("app/api/licensee/sub-accounts/remove/route.ts");
    assert.match(route, /removeLicenseeSubAccountRelationship/);
    assert.match(route, /LicenseeConversionManagedRemoveError/);
    assert.match(route, /CONVERSION_MANAGED_ACTIVE|error\.code/);
    assert.doesNotMatch(route, /reverseLicenseeProspectClientConversion/);
    assert.doesNotMatch(route, /allowConversionManagedDetach:\s*true/);
  });

  it("maps typed domain errors to the expected HTTP statuses", () => {
    assert.equal(
      httpStatusForLicenseeProspectClientConversionCode("PROSPECT_NOT_FOUND"),
      404,
    );
    assert.equal(
      httpStatusForLicenseeProspectClientConversionCode("PLAIN_TENANT"),
      403,
    );
    assert.equal(
      httpStatusForLicenseeProspectClientConversionCode("SOURCE_NOT_OWN_COMPANY"),
      403,
    );
    assert.equal(
      httpStatusForLicenseeProspectClientConversionCode(
        "MISSING_LICENSEE_RELATIONSHIP",
      ),
      403,
    );
    assert.equal(
      httpStatusForLicenseeProspectClientConversionCode(
        "AMBIGUOUS_OWN_COMPANY_LICENSEE",
      ),
      409,
    );
    assert.equal(
      httpStatusForLicenseeProspectClientConversionCode(
        "AMBIGUOUS_LICENSEE_RELATIONSHIP",
      ),
      409,
    );
    assert.equal(
      httpStatusForLicenseeProspectClientConversionCode("EMAIL_COLLISION"),
      409,
    );
    assert.equal(
      httpStatusForLicenseeProspectClientConversionCode(
        "UNSAFE_PARTIAL_PROVISION",
      ),
      409,
    );
    assert.equal(
      httpStatusForLicenseeProspectClientConversionCode("WRONG_LICENSEE"),
      403,
    );
    assert.equal(
      httpStatusForLicenseeProspectClientConversionCode("CONVERSION_NOT_FOUND"),
      404,
    );
    assert.equal(
      httpStatusForLicenseeProspectClientConversionCode(
        "OWN_COMPANY_CANNOT_DETACH",
      ),
      409,
    );
    assert.equal(
      httpStatusForLicenseeProspectClientConversionCode(
        "CONVERSION_MANAGED_ACTIVE",
      ),
      409,
    );
    assert.equal(
      httpStatusForLicenseeProspectClientConversionCode("CONVERSION_WRITE_FAILED"),
      500,
    );
    assert.equal(
      httpStatusForLicenseeProspectClientConversionCode(
        "GETOBLIC_OWNERSHIP_REQUIRED",
      ),
      409,
    );
  });
});

describe("active conversion read helpers", () => {
  it("answers prospect, client-org, and relationship lookups without N+1 callers", async () => {
    installFixture(baseFixture());

    const state = await getProspectClientConversionState(PROSPECT_A);
    assert.deepEqual(state, {
      status: "active",
      clientOrganizationId: CLIENT_ORG_ID,
      conversionManaged: true,
    });
    assert.equal(await prospectHasActiveClientConversion(PROSPECT_A), true);
    assert.equal(
      await getActiveClientOrganizationForProspect(PROSPECT_A),
      CLIENT_ORG_ID,
    );
    assert.equal(
      await isLicenseeClientOrganizationConversionManaged(CLIENT_ORG_ID),
      true,
    );
    assert.equal(
      await isLicenseeClientOrganizationConversionManaged(MANUAL_ORG_ID),
      false,
    );

    const byOrg = await getActiveConversionForClientOrganization(CLIENT_ORG_ID);
    const byRel = await getActiveConversionForRelationshipId(ACTIVE_REL_ID);
    assert.equal(byOrg?.prospectId, PROSPECT_A);
    assert.equal(byRel?.prospectId, PROSPECT_A);
    assert.equal(byRel?.sourceOrganizationId, OWN_COMPANY_ORG_ID);
  });

  it("treats reversed conversions as visible / not conversion-managed for Remove", async () => {
    installFixture(
      baseFixture({
        conversions: [
          {
            prospect_id: PROSPECT_A,
            source_organization_id: OWN_COMPANY_ORG_ID,
            client_organization_id: CLIENT_ORG_ID,
            licensee_account_id: LICENSEE_ACCOUNT_ID,
            licensee_sub_account_id: null,
            status: "reversed",
          },
        ],
      }),
    );

    const state = await getProspectClientConversionState(PROSPECT_A);
    assert.equal(state.status, "reversed");
    assert.equal(state.clientOrganizationId, CLIENT_ORG_ID);
    assert.equal(await prospectHasActiveClientConversion(PROSPECT_A), false);
    assert.equal(
      await isLicenseeClientOrganizationConversionManaged(CLIENT_ORG_ID),
      false,
    );
    assert.equal(await getActiveConversionForRelationshipId(ACTIVE_REL_ID), null);
  });

  it("returns none when no conversion exists", async () => {
    installFixture(baseFixture({ conversions: [] }));
    assert.deepEqual(await getProspectClientConversionState(PROSPECT_A), {
      status: "none",
      clientOrganizationId: null,
      conversionManaged: false,
    });
  });
});

describe("ordinary Remove protection", () => {
  it("blocks ordinary Remove for an active conversion-managed client", async () => {
    const fixture = baseFixture();
    installFixture(fixture);

    await assert.rejects(
      () =>
        removeLicenseeSubAccountRelationship({
          masterUserId: MASTER_USER_ID,
          relationshipId: ACTIVE_REL_ID,
        }),
      (error: unknown) =>
        error instanceof LicenseeConversionManagedRemoveError &&
        error.code === "CONVERSION_MANAGED_ACTIVE",
    );
    assert.equal(
      fixture.relationships.some((row) => row.id === ACTIVE_REL_ID),
      true,
    );
  });

  it("still removes a manually created sub-account", async () => {
    const fixture = baseFixture();
    installFixture(fixture);

    const result = await removeLicenseeSubAccountRelationship({
      masterUserId: MASTER_USER_ID,
      relationshipId: MANUAL_REL_ID,
    });
    assert.deepEqual(result, {
      relationshipId: MANUAL_REL_ID,
      organizationId: MANUAL_ORG_ID,
    });
    assert.equal(
      fixture.relationships.some((row) => row.id === MANUAL_REL_ID),
      false,
    );
  });

  it("does not treat a foreign Master as the owner", async () => {
    installFixture(baseFixture());
    await assert.rejects(
      () =>
        removeLicenseeSubAccountRelationship({
          masterUserId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          relationshipId: MANUAL_REL_ID,
        }),
      (error: unknown) => error instanceof LicenseeAccessError,
    );
  });
});
