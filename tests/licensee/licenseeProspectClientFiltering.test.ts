import "./licenseeAuthTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import {
  excludeActivelyConvertedProspects,
  listActiveConvertedProspectIdsForOrganization,
} from "../../services/licensee/licenseeProspectClientConversionReads";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const OWN_COMPANY_ORG_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_ORG_ID = "99999999-9999-4999-8999-999999999999";
const ACTIVE_PROSPECT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REVERSED_PROSPECT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const NONE_PROSPECT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);

function installConversionRows(
  rows: Array<{
    prospect_id: string;
    source_organization_id: string;
    status: string;
  }>,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = (table: string) => {
    const filters: Record<string, string> = {};
    const builder = {
      select() {
        return builder;
      },
      eq(column: string, value: string) {
        filters[column] = value;
        return builder;
      },
      then(
        onFulfilled?: (value: { data: unknown; error: unknown }) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        if (table !== "licensee_prospect_client_conversions") {
          return Promise.resolve({ data: [], error: null }).then(
            onFulfilled,
            onRejected,
          );
        }
        const data = rows.filter((row) => {
          if (
            filters.source_organization_id &&
            row.source_organization_id !== filters.source_organization_id
          ) {
            return false;
          }
          if (filters.status && row.status !== filters.status) {
            return false;
          }
          return true;
        });
        return Promise.resolve({ data, error: null }).then(
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

afterEach(() => {
  restoreSupabaseAdmin();
});

describe("active Prospect conversion filtering", () => {
  it("hides active conversions and keeps reversed / none visible", () => {
    const visible = excludeActivelyConvertedProspects(
      [
        { id: ACTIVE_PROSPECT },
        { id: REVERSED_PROSPECT },
        { id: NONE_PROSPECT },
      ],
      new Set([ACTIVE_PROSPECT]),
    );
    assert.deepEqual(
      visible.map((row) => row.id),
      [REVERSED_PROSPECT, NONE_PROSPECT],
    );
  });

  it("loads active converted Prospect ids once per organization", async () => {
    installConversionRows([
      {
        prospect_id: ACTIVE_PROSPECT,
        source_organization_id: OWN_COMPANY_ORG_ID,
        status: "active",
      },
      {
        prospect_id: REVERSED_PROSPECT,
        source_organization_id: OWN_COMPANY_ORG_ID,
        status: "reversed",
      },
      {
        prospect_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        source_organization_id: OTHER_ORG_ID,
        status: "active",
      },
    ]);

    const ids =
      await listActiveConvertedProspectIdsForOrganization(OWN_COMPANY_ORG_ID);
    assert.deepEqual([...ids], [ACTIVE_PROSPECT]);
  });

  it("applies organization-scoped exclusion on the Prospect Library path only", () => {
    const enrichment = read("services/prospects/prospectLibraryEnrichment.ts");
    const shared = read("services/prospects/prospectService.ts");
    const page = read("app/prospects/page.tsx");
    const estimate = read("services/estimate/athenaEstimateOrchestration.ts");
    const ads = read("services/ads/adsContextComposer.ts");
    const social = read(
      "services/socialPlanner/intelligence/socialPlannerIntelligenceSources.ts",
    );
    const visibility = read(
      "services/prospects/prospectActiveConversionVisibility.ts",
    );

    assert.match(enrichment, /listActiveConvertedProspectIdsForOrganization/);
    assert.match(enrichment, /excludeActivelyConvertedProspects/);
    assert.match(enrichment, /excludeReleasedOnlyGetOblicProspectsFromLibrary/);
    assert.match(enrichment, /getProspects\(organizationId\)/);
    assert.match(page, /loadProspectsForLibrary/);
    assert.match(visibility, /listActiveConvertedProspectIdsForOrganization/);
    assert.doesNotMatch(
      shared.slice(
        shared.indexOf("export async function getProspects"),
        shared.indexOf("export async function getProspectById"),
      ),
      /licensee_prospect_client_conversions/,
    );
    assert.match(estimate, /getProspects\(organizationId\)/);
    assert.match(ads, /getProspects\(organizationId\)/);
    assert.match(
      social,
      /getProspects\(assertOrganizationId\(organizationId\)\)/,
    );
  });

  it("applies the same organization-scoped exclusion on the Home pipeline", () => {
    const home = read("services/home/homeReadService.ts");
    assert.match(home, /listActiveConvertedProspectIdsForOrganization/);
    assert.match(home, /excludeActivelyConvertedProspects/);
    assert.match(home, /excludeReleasedOnlyGetOblicProspectsFromLibrary/);
    assert.match(home, /prospectActiveConversionVisibility/);
    assert.doesNotMatch(home, /\/licensee/);
    assert.doesNotMatch(home, /getProspects\(/);
    assert.doesNotMatch(home, /loadProspectsForLibrary/);
    assert.doesNotMatch(home, /for \(const prospect of/);
  });

  it("leaves direct Prospect detail addressable after conversion-state load", () => {
    const detail = read("app/prospects/[id]/page.tsx");
    const reads = read(
      "services/licensee/licenseeProspectClientConversionReads.ts",
    );
    const authorizedStart = detail.indexOf("if (!prospect)");
    const authorizedBody = detail.slice(authorizedStart);
    assert.match(detail, /getProspectById/);
    assert.match(authorizedBody, /getProspectClientConversionState\(prospect\.id\)/);
    assert.doesNotMatch(detail, /notFound\(/);
    assert.doesNotMatch(detail, /redirect\(/);
    assert.match(reads, /export async function getProspectClientConversionState/);
    assert.match(reads, /status: "none"/);
    assert.match(reads, /status: "active"/);
    assert.match(reads, /status: "reversed"/);
  });
});
