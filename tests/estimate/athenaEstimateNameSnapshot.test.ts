/**
 * Athena Estimate — Licensee-facing organization_name_snapshot source.
 * Creation freezes Master selector title semantics; history reads stored snapshot.
 */
import "../licensee/licenseeAuthTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import {
  toPublicAthenaEstimateDetail,
  toPublicAthenaEstimateSummary,
} from "../../services/estimate/athenaEstimatePublic";
import { mapAthenaEstimateRow } from "../../services/estimate/athenaEstimateMappers";
import { loadOrganizationNameSnapshot } from "../../services/estimate/athenaEstimateService";
import { resolveLicenseeSubAccountTitle } from "../../services/licensee/licenseeSubAccountTypes";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const LICENSEE_A_ID = "11111111-1111-4111-8111-111111111111";
const LICENSEE_B_ID = "22222222-2222-4222-8222-222222222222";
const ORG_ID = "33333333-3333-4333-8333-333333333333";

type Fixture = {
  relationships: Array<{
    licensee_account_id: string;
    organization_id: string;
    display_name: string | null;
  }>;
  organizations: Record<string, { name: string }>;
};

type CallLog = {
  tables: string[];
  relationshipFilters: Array<Record<string, string>>;
};

const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);

function installFixture(fixture: Fixture): CallLog {
  const calls: CallLog = { tables: [], relationshipFilters: [] };

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
      maybeSingle: async () => {
        if (table === "licensee_sub_accounts") {
          calls.relationshipFilters.push({ ...filters });
          const match = fixture.relationships.find(
            (row) =>
              row.licensee_account_id === filters.licensee_account_id &&
              row.organization_id === filters.organization_id,
          );
          return {
            data: match ? { display_name: match.display_name } : null,
            error: null,
          };
        }

        if (table === "organizations") {
          const orgId = filters.id;
          const org = orgId ? fixture.organizations[orgId] : undefined;
          return { data: org ?? null, error: null };
        }

        return { data: null, error: null };
      },
    };
    return builder;
  };

  return calls;
}

function restoreSupabaseAdmin() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = originalFrom;
}

afterEach(() => {
  restoreSupabaseAdmin();
});

describe("Athena Estimate organization_name_snapshot Licensee title source", () => {
  it("display name GetOblic + org name team's Organization → snapshot GetOblic", async () => {
    installFixture({
      relationships: [
        {
          licensee_account_id: LICENSEE_A_ID,
          organization_id: ORG_ID,
          display_name: "GetOblic",
        },
      ],
      organizations: {
        [ORG_ID]: { name: "team's Organization" },
      },
    });

    const snapshot = await loadOrganizationNameSnapshot({
      licenseeAccountId: LICENSEE_A_ID,
      organizationId: ORG_ID,
    });

    assert.equal(snapshot, "GetOblic");
    assert.equal(
      resolveLicenseeSubAccountTitle({
        displayName: "GetOblic",
        name: "team's Organization",
      }),
      "GetOblic",
    );
  });

  it("null display name → organization name", async () => {
    installFixture({
      relationships: [
        {
          licensee_account_id: LICENSEE_A_ID,
          organization_id: ORG_ID,
          display_name: null,
        },
      ],
      organizations: {
        [ORG_ID]: { name: "team's Organization" },
      },
    });

    assert.equal(
      await loadOrganizationNameSnapshot({
        licenseeAccountId: LICENSEE_A_ID,
        organizationId: ORG_ID,
      }),
      "team's Organization",
    );
  });

  it("empty/whitespace display name → organization name", async () => {
    for (const display_name of ["", "   ", "\t\n"]) {
      installFixture({
        relationships: [
          {
            licensee_account_id: LICENSEE_A_ID,
            organization_id: ORG_ID,
            display_name,
          },
        ],
        organizations: {
          [ORG_ID]: { name: "team's Organization" },
        },
      });

      assert.equal(
        await loadOrganizationNameSnapshot({
          licenseeAccountId: LICENSEE_A_ID,
          organizationId: ORG_ID,
        }),
        "team's Organization",
      );
    }
  });

  it("another Master's alias for the same organization cannot leak into this Master's Estimate", async () => {
    const calls = installFixture({
      relationships: [
        {
          licensee_account_id: LICENSEE_A_ID,
          organization_id: ORG_ID,
          display_name: null,
        },
        {
          licensee_account_id: LICENSEE_B_ID,
          organization_id: ORG_ID,
          display_name: "Other Master Alias",
        },
      ],
      organizations: {
        [ORG_ID]: { name: "team's Organization" },
      },
    });

    const snapshot = await loadOrganizationNameSnapshot({
      licenseeAccountId: LICENSEE_A_ID,
      organizationId: ORG_ID,
    });

    assert.equal(snapshot, "team's Organization");
    assert.notEqual(snapshot, "Other Master Alias");
    assert.deepEqual(calls.relationshipFilters, [
      {
        licensee_account_id: LICENSEE_A_ID,
        organization_id: ORG_ID,
      },
    ]);
  });

  it("fails closed when authorized relationship cannot be resolved", async () => {
    installFixture({
      relationships: [
        {
          licensee_account_id: LICENSEE_B_ID,
          organization_id: ORG_ID,
          display_name: "Other Master Alias",
        },
      ],
      organizations: {
        [ORG_ID]: { name: "team's Organization" },
      },
    });

    await assert.rejects(
      () =>
        loadOrganizationNameSnapshot({
          licenseeAccountId: LICENSEE_A_ID,
          organizationId: ORG_ID,
        }),
      (error: unknown) =>
        error instanceof Error &&
        error.message ===
          "Authorized Licensee relationship could not be resolved for Estimate name snapshot.",
    );
  });

  it("historical stored snapshot remains unchanged / read as stored", () => {
    const ready = mapAthenaEstimateRow({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      licensee_account_id: LICENSEE_A_ID,
      organization_id: ORG_ID,
      requested_by: null,
      organization_name_snapshot: "team's Organization",
      request_json: { projectNeed: "Need a new site" },
      status: "Ready",
      generation_stage: "completed",
      package_json: null,
      error_code: null,
      error_message: null,
      currency_code: "USD",
      geography_label: "United States",
      currency_resolution: "derived",
      instruction_config_key: null,
      instruction_revision_id: null,
      instruction_configured: false,
      created_at: "2026-08-09T00:00:00.000Z",
      updated_at: "2026-08-09T00:00:00.000Z",
    });

    const detail = toPublicAthenaEstimateDetail(ready, false);
    const summary = toPublicAthenaEstimateSummary(ready, true);

    assert.equal(detail.organizationNameSnapshot, "team's Organization");
    assert.equal(summary.organizationNameSnapshot, "team's Organization");
    assert.equal(ready.organization_name_snapshot, "team's Organization");

    const publicMapper = read("services/estimate/athenaEstimatePublic.ts");
    assert.match(
      publicMapper,
      /organizationNameSnapshot:\s*estimate\.organization_name_snapshot/,
    );
    assert.doesNotMatch(publicMapper, /resolveLicenseeSubAccountTitle/);
    assert.doesNotMatch(publicMapper, /loadOrganizationNameSnapshot/);

    const client = read(
      "components/licensee/estimate/LicenseeEstimateClient.tsx",
    );
    assert.match(client, /organizationNameSnapshot/);
    assert.doesNotMatch(
      client,
      /resolveLicenseeSubAccountTitle\(\s*\{\s*displayName/,
    );
  });

  it("create path scopes snapshot to authorized relationship; auth semantics unchanged", () => {
    const service = read("services/estimate/athenaEstimateService.ts");
    assert.match(service, /resolveLicenseeSubAccountTitle/);
    assert.match(
      service,
      /eq\("licensee_account_id", licenseeAccountId\)/,
    );
    assert.match(service, /eq\("organization_id", organizationId\)/);
    assert.match(
      service,
      /Authorized Licensee relationship could not be resolved for Estimate name snapshot/,
    );

    const orchestration = read(
      "services/estimate/athenaEstimateOrchestration.ts",
    );
    assert.match(
      orchestration,
      /loadOrganizationNameSnapshot\(\{\s*licenseeAccountId,\s*organizationId,\s*\}\)/,
    );
    assert.match(orchestration, /assertLicenseeOwnsSubAccount/);

    // Create ownership assert remains; list/get remain history-readable without re-assert.
    const getStart = orchestration.indexOf(
      "export async function getAthenaEstimateDetailForMaster",
    );
    const getEnd = orchestration.indexOf(
      "return toPublicAthenaEstimateDetail(estimate, relationshipConnected);",
      getStart,
    );
    const getFn = orchestration.slice(getStart, getEnd);
    assert.doesNotMatch(getFn, /assertLicenseeOwnsSubAccount/);
    assert.doesNotMatch(getFn, /loadOrganizationNameSnapshot/);

    const listStart = orchestration.indexOf(
      "export async function listAthenaEstimatesForMaster",
    );
    const listEnd = orchestration.indexOf(
      "export async function getAthenaEstimateDetailForMaster",
    );
    const listFn = orchestration.slice(listStart, listEnd);
    assert.doesNotMatch(listFn, /assertLicenseeOwnsSubAccount/);
    assert.doesNotMatch(listFn, /loadOrganizationNameSnapshot/);

    const identity = read("services/licensee/licenseeIdentity.ts");
    const helperStart = identity.indexOf(
      "export async function assertLicenseeOwnsSubAccount",
    );
    const helperClose = identity.indexOf(
      "\n}\n\n/**\n * Server-authoritative Open Athena authorization + handoff identity chain:",
      helperStart,
    );
    const helperBody = identity.slice(helperStart, helperClose + 2);
    assert.doesNotMatch(helperBody, /display_name/);
    assert.doesNotMatch(helperBody, /organization_name_snapshot/);
  });
});
