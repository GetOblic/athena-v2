/**
 * Prospect capacity contract (300 held Prospects per organization)
 * and GetOblic Add-as-Prospect decoupling from listing claims.
 */

import "../getoblicDirectory/getoblicDirectoryTestEnv";

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { GetOblicDirectoryError } from "../../services/getoblicDirectory/getoblicDirectoryErrors";
import {
  convertGetOblicDirectoryListing,
  convertOutcomeErrorCode,
  convertOutcomeErrorMessage,
  GETOBLIC_PROSPECT_SOURCE,
  type GetOblicConvertDependencies,
} from "../../services/getoblicDirectory/getoblicDirectoryConvertService";
import { GETOBLIC_INVENTORY_POOL_AUTHOR_ID } from "../../services/getoblicDirectory/getoblicDirectoryTypes";
import {
  buildOrganizationProspectCapacity,
  isProspectCapacityExceededError,
  MAX_PROSPECTS_PER_ORGANIZATION,
  PROSPECT_CAPACITY_EXCEEDED_CODE,
  PROSPECT_CAPACITY_EXCEEDED_SQL_MESSAGE,
  ProspectCapacityExceededError,
} from "../../services/prospects/prospectCapacity";
import { PROSPECT_CSV_MAX_DATA_ROWS } from "../../services/prospects/prospectCsv";
import type { Prospect } from "../../services/prospects/prospectService";
import { en } from "../../lib/tenantI18n/messages/en";
import { de } from "../../lib/tenantI18n/messages/de";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";

const ROOT = process.cwd();
const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";
const PROSPECT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const LISTING_ID = 4401;
const CAPACITY_MIGRATION =
  "supabase/migrations/20260916000005_enforce_organization_prospect_capacity.sql";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function prospect(overrides: Partial<Prospect> = {}): Prospect {
  return {
    id: PROSPECT_A,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    organization_id: ORG_A,
    user_id: "user-1",
    community_id: null,
    linked_discussion_id: null,
    business_name: "Acme Salon",
    website: null,
    linkedin: null,
    facebook: null,
    instagram: null,
    industry: null,
    category: "Hair Salons",
    country: null,
    state: null,
    city: null,
    address: null,
    company_size: null,
    revenue: null,
    employee_count: null,
    technologies: null,
    pain_points: null,
    decision_maker: null,
    first_name: null,
    last_name: null,
    external_contact_id: null,
    timezone: null,
    job_title: null,
    email: null,
    phone: null,
    whatsapp_number: null,
    getoblic_type: null,
    google_business_url: null,
    notes: null,
    additional_context: null,
    source: GETOBLIC_PROSPECT_SOURCE,
    status: "Saved",
    lifecycle_status: "New",
    ads_content: null,
    opportunity_score: null,
    priority: 0,
    website_intelligence: null,
    raw_json: {
      origin: "getoblic_directory",
      wordpress_listing_id: LISTING_ID,
    },
    generated_listing_description: null,
    last_activity: null,
    import_batch_id: null,
    ...overrides,
  };
}

function convertDeps(
  overrides: Partial<GetOblicConvertDependencies> = {},
): GetOblicConvertDependencies & { created: Prospect[]; claimed: unknown[] } {
  const created: Prospect[] = [];
  const claimed: unknown[] = [];
  return {
    created,
    claimed,
    getSettings: async () => ({
      configured: true,
      settings: {
        organization_id: ORG_A,
        monthly_allowance: 5,
        wordpress_author_id: 42,
        created_at: "2026-09-01T00:00:00.000Z",
        updated_at: "2026-09-01T00:00:00.000Z",
        updated_by_user_id: null,
      },
    }),
    getAllocationUsage: async () => ({
      configured: true,
      listingCapacity: 5,
      currentlyHeld: 1,
      available: 4,
    }),
    hasAlreadyConsumedListing: async () => false,
    getActiveListingClaim: async () => ({ found: false }),
    getListingById: async (id) => ({
      wordpress_listing_id: id,
      status: "publish",
      title: "Acme Salon",
      author_id: GETOBLIC_INVENTORY_POOL_AUTHOR_ID,
      google_id: "ChIJ123",
      google_place_url: "https://maps.google.com/?cid=1",
      knowledge_base: null,
    }),
    getProspectById: async (id) =>
      created.find((row) => row.id === id) ?? prospect({ id }),
    findProspectByNameAndCity: async () => null,
    findProspectByWebsite: async () => null,
    findOriginProspectByListingId: async () => null,
    findReleasedLinkForListing: async () => null,
    findReusableWebsiteIntelligence: async () => null,
    createProspect: async (input) => {
      const row = prospect({
        business_name: input.business_name,
        source: input.source ?? GETOBLIC_PROSPECT_SOURCE,
        status: input.status ?? "Saved",
        raw_json: input.raw_json ?? null,
      });
      created.push(row);
      return row;
    },
    updateProspect: async (id, organizationId, input) =>
      prospect({ id, organization_id: organizationId, ...input }),
    deleteProspect: async () => true,
    claimKnownExistingListing: async (input) => {
      claimed.push(input);
      return {
        outcome: "linked" as const,
        allocated: true,
        link: {
          id: "link-1",
          organization_id: ORG_A,
          prospect_id: input.prospectId,
          wordpress_listing_id: Number(input.wordpressListingId),
          google_id_snapshot: null,
          google_id_is_matchable: false,
          relationship_origin: "linked_existing",
          relationship_status: "linked",
          wordpress_author_id: 42,
          allocated_at: "2026-09-01T00:00:00.000Z",
          last_verified_at: "2026-09-01T00:00:00.000Z",
          last_remote_error: null,
          last_remote_error_at: null,
          kb_push_status: "never",
          kb_last_pushed_executive_version_id: null,
          kb_last_content_sha256: null,
          kb_last_pushed_at: null,
          kb_last_push_error: null,
          kb_last_push_error_at: null,
          created_by_user_id: "user-1",
          created_via_licensee_account_id: null,
          created_at: "2026-09-01T00:00:00.000Z",
          updated_at: "2026-09-01T00:00:00.000Z",
          released_at: null,
        },
      };
    },
    ensureProspectGenerationQueued: async (row) => ({
      prospect: row,
      queued: false,
    }),
    ...overrides,
  };
}

function convertInput() {
  return {
    organizationId: ORG_A,
    wordpressListingId: LISTING_ID,
    observed: { title: "Acme Salon" },
    actorUserId: "user-1",
    actorLicenseeAccountId: null,
  };
}

describe("prospect capacity contract", () => {
  it("treats 300 as the single held-Prospect maximum and counts all rows", () => {
    assert.equal(MAX_PROSPECTS_PER_ORGANIZATION, 300);
    assert.deepEqual(buildOrganizationProspectCapacity(0), {
      currentCount: 0,
      maximum: 300,
      remaining: 300,
      reached: false,
    });
    assert.equal(buildOrganizationProspectCapacity(299).remaining, 1);
    assert.equal(buildOrganizationProspectCapacity(299).reached, false);
    assert.equal(buildOrganizationProspectCapacity(300).remaining, 0);
    assert.equal(buildOrganizationProspectCapacity(300).reached, true);
    assert.equal(buildOrganizationProspectCapacity(301).reached, true);
  });

  it("does not confuse the 500-row CSV file limit with the 300 held-Prospect limit", () => {
    assert.equal(PROSPECT_CSV_MAX_DATA_ROWS, 500);
    assert.notEqual(
      PROSPECT_CSV_MAX_DATA_ROWS,
      MAX_PROSPECTS_PER_ORGANIZATION,
    );
    const csv = read("services/prospects/prospectCsv.ts");
    const capacity = read("services/prospects/prospectCapacity.ts");
    assert.match(csv, /PROSPECT_CSV_MAX_DATA_ROWS = 500/);
    assert.match(capacity, /every row in `prospects`/);
    assert.match(capacity, /no soft-delete/);
    assert.doesNotMatch(capacity, /\.from\("athena_getoblic/);
  });

  it("maps trigger and typed errors without treating listing capacity as prospect capacity", () => {
    assert.equal(
      isProspectCapacityExceededError(new ProspectCapacityExceededError()),
      true,
    );
    assert.equal(
      isProspectCapacityExceededError({
        code: "P0001",
        message: PROSPECT_CAPACITY_EXCEEDED_SQL_MESSAGE,
      }),
      true,
    );
    assert.equal(
      isProspectCapacityExceededError(
        new GetOblicDirectoryError(
          "GETOBLIC_LISTING_CAPACITY_EXCEEDED",
          "listing",
        ),
      ),
      false,
    );
    assert.notEqual(
      convertOutcomeErrorCode("prospect_capacity_exceeded"),
      convertOutcomeErrorCode("capacity_exceeded"),
    );
    assert.equal(
      convertOutcomeErrorCode("prospect_capacity_exceeded"),
      PROSPECT_CAPACITY_EXCEEDED_CODE,
    );
    assert.match(
      convertOutcomeErrorMessage("prospect_capacity_exceeded"),
      new RegExp(String(MAX_PROSPECTS_PER_ORGANIZATION)),
    );
    assert.doesNotMatch(
      convertOutcomeErrorMessage("prospect_capacity_exceeded"),
      /listing capacity/i,
    );
    assert.match(
      convertOutcomeErrorMessage("capacity_exceeded"),
      /listing capacity/i,
    );
  });
});

describe("prospect capacity SQL race-safety", () => {
  it("adds a BEFORE INSERT trigger that locks the organization and rejects #301", () => {
    assert.equal(existsSync(join(ROOT, CAPACITY_MIGRATION)), true);
    const migration = read(CAPACITY_MIGRATION);
    assert.match(migration, /organization_prospect_capacity_limit\(\)/);
    assert.match(migration, /select 300;/);
    assert.match(migration, /enforce_organization_prospect_capacity/);
    assert.match(migration, /before insert on prospects/i);
    assert.match(migration, /for update/);
    assert.match(
      migration,
      /from prospects[\s\S]*organization_id = NEW\.organization_id/,
    );
    assert.match(migration, /v_count >= v_limit/);
    assert.match(migration, /prospect_capacity_exceeded/);
    assert.doesNotMatch(migration, /athena_getoblic_listing_links/);
    assert.doesNotMatch(migration, /monthly_allowance/);
    assert.doesNotMatch(migration, /deleted_at|archived/);
    const capacity = read("services/prospects/prospectCapacity.ts");
    assert.match(
      capacity,
      new RegExp(`MAX_PROSPECTS_PER_ORGANIZATION = ${MAX_PROSPECTS_PER_ORGANIZATION}`),
    );
    assert.match(
      migration,
      new RegExp(`select ${MAX_PROSPECTS_PER_ORGANIZATION};`),
    );
  });
});

describe("server-side create paths obey the same 300 cap", () => {
  it("enforces capacity inside createProspect and the manual / CSV APIs", () => {
    const service = read("services/prospects/prospectService.ts");
    const manual = read("app/api/prospects/route.ts");
    const csv = read("app/api/prospects/import/route.ts");
    const importer = read("services/prospects/prospectImporter.ts");
    assert.match(service, /getOrganizationProspectCapacity/);
    assert.match(service, /ProspectCapacityExceededError/);
    assert.match(service, /isProspectCapacityExceededError/);
    assert.match(manual, /PROSPECT_CAPACITY_EXCEEDED/);
    assert.match(manual, /,\s*409/);
    assert.match(importer, /capacitySkipped/);
    assert.match(importer, /getProspectCapacity/);
    assert.match(csv, /capacitySkipped/);
    assert.match(csv, /PROSPECT_CSV_MAX_DATA_ROWS|validateProspectCsvDataRowLimit/);
  });

  it("lets an organization with 0 or 299 Prospects create, and blocks #301", async () => {
    const { importProspectsFromRows } = await import(
      "../../services/prospects/prospectImporter"
    );
    const created: string[] = [];

    async function importOne(currentCount: number) {
      created.length = 0;
      return importProspectsFromRows({
        organizationId: ORG_A,
        userId: "user-1",
        getProspectCapacity: async () =>
          buildOrganizationProspectCapacity(currentCount),
        findDuplicate: async () => null,
        createProspect: async (input) => {
          const capacity = buildOrganizationProspectCapacity(
            currentCount + created.length,
          );
          if (capacity.reached) {
            throw new ProspectCapacityExceededError();
          }
          created.push(input.business_name);
          return prospect({
            id: `p-${created.length}`,
            business_name: input.business_name,
          });
        },
        ensureQueued: async (row) => ({
          prospect: row,
          queued: true,
          jobId: "job-1",
        }),
        records: [
          {
            sourceRowNumber: 2,
            fields: { business_name: "First", website: "first.example" },
          },
        ],
      });
    }

    const first = await importOne(0);
    assert.equal(first.imported, 1);
    assert.equal(first.capacitySkipped, 0);
    const threeHundredth = await importOne(299);
    assert.equal(threeHundredth.imported, 1);
    assert.equal(threeHundredth.capacitySkipped, 0);
    const blocked = await importOne(300);
    assert.equal(blocked.imported, 0);
    assert.equal(blocked.capacitySkipped, 1);
    assert.match(
      blocked.invalidRowDetails[0]?.reason ?? "",
      new RegExp(String(MAX_PROSPECTS_PER_ORGANIZATION)),
    );
  });

  it("stops a 50-row CSV at remaining slots when the org already holds 290 Prospects", async () => {
    const { importProspectsFromRows } = await import(
      "../../services/prospects/prospectImporter"
    );
    const created: string[] = [];
    const records = Array.from({ length: 50 }, (_, index) => ({
      sourceRowNumber: index + 2,
      fields: {
        business_name: `Clinic ${index + 1}`,
        website: `clinic${index + 1}.example`,
      },
    }));
    assert.ok(records.length < PROSPECT_CSV_MAX_DATA_ROWS);

    const summary = await importProspectsFromRows({
      organizationId: ORG_A,
      userId: "user-1",
      getProspectCapacity: async () => buildOrganizationProspectCapacity(290),
      findDuplicate: async () => null,
      createProspect: async (input) => {
        created.push(input.business_name);
        return prospect({
          id: `p-${created.length}`,
          business_name: input.business_name,
          website: (input.website as string | null) ?? null,
        });
      },
      ensureQueued: async (row) => ({
        prospect: row,
        queued: true,
        jobId: `job-${row.id}`,
      }),
      records,
    });

    assert.equal(summary.imported, 10);
    assert.equal(summary.capacitySkipped, 40);
    assert.equal(summary.duplicates, 0);
    assert.equal(created.length, 10);
  });

  it("does not consume a slot for duplicates and keeps org isolation", async () => {
    const { importProspectsFromRows } = await import(
      "../../services/prospects/prospectImporter"
    );
    const created: Array<{ org: string; name: string }> = [];
    const summary = await importProspectsFromRows({
      organizationId: ORG_A,
      userId: "user-1",
      getProspectCapacity: async (organizationId) => {
        assert.equal(organizationId, ORG_A);
        return buildOrganizationProspectCapacity(299);
      },
      findDuplicate: async (_organizationId, website) => {
        if (website === "https://dup.example") {
          return prospect({ id: "existing", website });
        }
        return null;
      },
      createProspect: async (input) => {
        created.push({
          org: input.organization_id,
          name: input.business_name,
        });
        return prospect({
          id: "new",
          organization_id: input.organization_id,
          business_name: input.business_name,
        });
      },
      ensureQueued: async (row) => ({
        prospect: row,
        queued: true,
        jobId: "job-1",
      }),
      records: [
        {
          sourceRowNumber: 2,
          fields: { business_name: "Dup", website: "dup.example" },
        },
        {
          sourceRowNumber: 3,
          fields: { business_name: "New", website: "new.example" },
        },
      ],
    });

    assert.equal(summary.imported, 1);
    assert.equal(summary.duplicates, 1);
    assert.equal(summary.capacitySkipped, 0);
    assert.deepEqual(created, [{ org: ORG_A, name: "New" }]);
    assert.notEqual(ORG_A, ORG_B);
  });
});

describe("GetOblic Add as Prospect is decoupled from listing entitlement", () => {
  it("creates a GetOblic Prospect at 0 and 299, and blocks #301", async () => {
    const first = await convertGetOblicDirectoryListing(
      convertInput(),
      convertDeps(),
    );
    assert.equal(first.outcome, "created");
    assert.equal(first.prospect_id, PROSPECT_A);

    const blocked = await convertGetOblicDirectoryListing(
      convertInput(),
      convertDeps({
        createProspect: async () => {
          throw new ProspectCapacityExceededError();
        },
      }),
    );
    assert.equal(blocked.outcome, "prospect_capacity_exceeded");
    assert.equal(blocked.prospect_id, null);
    assert.equal(
      convertOutcomeErrorCode(blocked.outcome),
      "PROSPECT_CAPACITY_EXCEEDED",
    );
  });

  it("does not require directory settings or listingCapacity to add as Prospect", async () => {
    const missingSettings = await convertGetOblicDirectoryListing(
      convertInput(),
      convertDeps({
        getSettings: async () => ({
          configured: false,
          code: "GETOBLIC_DIRECTORY_NOT_CONFIGURED",
        }),
        getAllocationUsage: async () => ({
          configured: false,
          code: "GETOBLIC_DIRECTORY_NOT_CONFIGURED",
        }),
        claimKnownExistingListing: async () => {
          throw new GetOblicDirectoryError(
            "GETOBLIC_DIRECTORY_NOT_CONFIGURED",
            "GetOblic Directory is not configured for this organization.",
          );
        },
      }),
    );
    assert.equal(missingSettings.outcome, "created");
    assert.equal(missingSettings.allocated, false);
    assert.ok(missingSettings.prospect_id);

    const zeroListingCapacity = await convertGetOblicDirectoryListing(
      convertInput(),
      convertDeps({
        getAllocationUsage: async () => ({
          configured: true,
          listingCapacity: 0,
          currentlyHeld: 0,
          available: 0,
        }),
        claimKnownExistingListing: async () => {
          throw new GetOblicDirectoryError(
            "GETOBLIC_LISTING_CAPACITY_EXCEEDED",
            "This account has reached its GetOblic listing capacity. Release an existing GetOblic listing before adding another.",
          );
        },
      }),
    );
    assert.equal(zeroListingCapacity.outcome, "created");
    assert.equal(zeroListingCapacity.allocated, false);
    assert.notEqual(zeroListingCapacity.outcome, "prospect_capacity_exceeded");
    assert.notEqual(zeroListingCapacity.outcome, "capacity_exceeded");
  });

  it("reuses an existing Prospect without consuming another slot", async () => {
    const existing = prospect({ id: PROSPECT_A });
    const port = convertDeps({
      findOriginProspectByListingId: async () => existing,
      createProspect: async () => {
        throw new Error("must not create");
      },
      claimKnownExistingListing: async () => {
        throw new GetOblicDirectoryError(
          "GETOBLIC_LISTING_CAPACITY_EXCEEDED",
          "listing",
        );
      },
    });
    const result = await convertGetOblicDirectoryListing(convertInput(), port);
    assert.equal(result.outcome, "reused");
    assert.equal(result.prospect_id, PROSPECT_A);
    assert.equal(result.allocated, false);
    assert.equal(port.created.length, 0);
  });

  it("keeps listing claim protected on the dedicated claim path", () => {
    const claim = read(
      "services/getoblicDirectory/getoblicDirectoryClaimService.ts",
    );
    const convert = read(
      "services/getoblicDirectory/getoblicDirectoryConvertService.ts",
    );
    assert.match(claim, /requireDirectorySettings/);
    assert.match(claim, /reserveGetOblicListingCapacity/);
    assert.match(claim, /GETOBLIC_DIRECTORY_NOT_CONFIGURED/);
    assert.match(claim, /GETOBLIC_LISTING_CAPACITY_EXCEEDED/);
    assert.match(convert, /claimKnownExistingListing/);
    assert.doesNotMatch(
      convert,
      /if \(!settings\.configured\) \{\s*return emptyResult\("settings_missing"\)/,
    );
  });
});

describe("prospect capacity UI and compatibility", () => {
  it("gates /prospects/find Add as Prospect on prospect capacity only", () => {
    const page = read("app/prospects/find/page.tsx");
    const discovery = read(
      "components/prospects/GetOblicOpportunityDiscovery.tsx",
    );
    const methods = read(
      "components/prospects/OpportunityDiscoveryMethods.tsx",
    );
    const google = read("components/prospects/GoogleBusinessDiscovery.tsx");
    assert.match(page, /getOrganizationProspectCapacity/);
    assert.match(page, /prospectCapacityReached/);
    assert.match(discovery, /prospectCapacityReached &&/);
    assert.doesNotMatch(discovery, /listingCapacityReached &&/);
    assert.doesNotMatch(discovery, /notConfigured \|\|/);
    assert.match(methods, /listingCapacityReached=\{listingCapacityReached\}/);
    assert.match(google, /listingCapacityReached/);
    assert.match(google, /prospectCapacityReached/);
    assert.match(
      en.prospects.find.prospectCapacityReached,
      new RegExp(String(MAX_PROSPECTS_PER_ORGANIZATION)),
    );
    assert.doesNotMatch(
      en.prospects.find.prospectCapacityReached,
      /listing capacity/i,
    );
    for (const messages of [en, fr, es, itMessages, de, pt]) {
      assert.ok(messages.prospects.find.prospectCapacityReached);
      assert.ok(messages.prospects.find.listingCapacityReached);
    }
  });

  it("does not change Prospect → client conversion or invent a second Prospect model", () => {
    const licensee = read(
      "services/licensee/licenseeProspectClientConversion.ts",
    );
    const capacity = read("services/prospects/prospectCapacity.ts");
    assert.doesNotMatch(licensee, /createProspect/);
    assert.doesNotMatch(licensee, /MAX_PROSPECTS_PER_ORGANIZATION/);
    assert.doesNotMatch(capacity, /create table/i);
    assert.doesNotMatch(capacity, /athena_plan|freeUntrained|FREE-2/);
  });
});
