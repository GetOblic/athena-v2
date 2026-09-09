/**
 * CO-5D2 Google selection → Make → verified listing → canonical Prospect.
 * Source-contract and mocked Make/WordPress/convert checks. No live remotes.
 */

import "../getoblicDirectory/getoblicDirectoryTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { GOOGLE_BUSINESS_ADD_ACTION } from "../../lib/googlePlaces/googlePlacesTypes";
import { convertGetOblicDirectoryListing } from "../../services/getoblicDirectory/getoblicDirectoryConvertService";
import { GETOBLIC_PROSPECT_SOURCE } from "../../services/getoblicDirectory/getoblicDirectoryConvertService";
import type { GetOblicConvertDependencies } from "../../services/getoblicDirectory/getoblicDirectoryConvertService";
import type { GetOblicListingLink } from "../../services/getoblicDirectory/getoblicDirectoryTypes";
import { GetOblicWordpressError } from "../../services/getoblicDirectory/getoblicWordpressTypes";
import {
  convertGoogleBusinessSelection,
  mergeEmptyListingFromGooglePayload,
  observedSnapshotFromGooglePayload,
} from "../../services/googleBusiness/googleBusinessConvertService";
import { GoogleBusinessMakeError } from "../../services/googleBusiness/googleBusinessMakeTypes";
import type { Prospect } from "../../services/prospects/prospectService";

const ROOT = process.cwd();
const ORG_A = "11111111-1111-1111-1111-111111111111";
const PROSPECT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const LISTING_ID = 8801;
const GOOGLE_ID = "ChIJexamplePlace";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    action: GOOGLE_BUSINESS_ADD_ACTION,
    company_name: "Oak Street Salon",
    google_id: GOOGLE_ID,
    google_url: "https://maps.google.com/?cid=1",
    address: "100 Oak St, Dallas, TX 75201, USA",
    city: "Dallas",
    business_phone: "+1 214-555-0100",
    website: "https://oak.example",
    category: "hair_care",
    ...overrides,
  };
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
    business_name: "Oak Street Salon",
    website: null,
    linkedin: null,
    facebook: null,
    instagram: null,
    industry: null,
    category: null,
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
    last_activity: null,
    import_batch_id: null,
    ...overrides,
  };
}

function link(overrides: Partial<GetOblicListingLink> = {}): GetOblicListingLink {
  return {
    id: "link-1",
    organization_id: ORG_A,
    prospect_id: PROSPECT_A,
    wordpress_listing_id: LISTING_ID,
    google_id_snapshot: GOOGLE_ID,
    google_id_is_matchable: true,
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
    ...overrides,
  };
}

function convertDeps(
  overrides: Partial<GetOblicConvertDependencies> = {},
): GetOblicConvertDependencies & {
  created: Prospect[];
  claimed: unknown[];
  queued: Prospect[];
} {
  const created: Prospect[] = [];
  const claimed: unknown[] = [];
  const queued: Prospect[] = [];
  return {
    created,
    claimed,
    queued,
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
      title: "Oak Street Salon",
      author_id: 42,
      google_id: GOOGLE_ID,
      google_place_url: "https://maps.google.com/?cid=1",
      knowledge_base: "do-not-copy",
      website: "https://oak.example",
      phone: "+1 214-555-0100",
    }),
    getProspectById: async (id) =>
      created.find((row) => row.id === id) ?? prospect({ id }),
    findProspectByNameAndCity: async () => null,
    findProspectByWebsite: async () => null,
    findOriginProspectByListingId: async () => null,
    findReleasedLinkForListing: async () => null,
    createProspect: async (input) => {
      const row = prospect({
        business_name: input.business_name,
        website: input.website ?? null,
        category: input.category ?? null,
        source: input.source ?? GETOBLIC_PROSPECT_SOURCE,
        status: input.status ?? "Saved",
        google_business_url: input.google_business_url ?? null,
        raw_json: input.raw_json ?? null,
        phone: input.phone ?? null,
        address: input.address ?? null,
      });
      created.push(row);
      return row;
    },
    updateProspect: async (id, _organizationId, input) => {
      const current = created.find((row) => row.id === id) ?? prospect({ id });
      const next = prospect({ ...current, ...input, id });
      const index = created.findIndex((row) => row.id === id);
      if (index >= 0) created[index] = next;
      return next;
    },
    deleteProspect: async () => true,
    claimKnownExistingListing: async (input) => {
      claimed.push(input);
      return {
        outcome: "linked" as const,
        allocated: true,
        link: link({
          prospect_id: input.prospectId,
          wordpress_listing_id: Number(input.wordpressListingId),
        }),
      };
    },
    ensureProspectGenerationQueued: async (row) => {
      queued.push(row);
      return { prospect: { ...row, status: "Queued" }, queued: true };
    },
    ...overrides,
  };
}

describe("CO-5D2 Google convert orchestration", () => {
  it("calls Make, verifies the WordPress listing, then creates a canonical Prospect", async () => {
    const port = convertDeps();
    const makeCalls: unknown[] = [];
    const listingReads: number[] = [];
    const result = await convertGoogleBusinessSelection(
      {
        organizationId: ORG_A,
        payload: validPayload({ author_id: 999 }),
        actorUserId: "user-1",
        actorLicenseeAccountId: null,
      },
      {
        getSettings: port.getSettings,
        addListing: async (input) => {
          makeCalls.push(input);
          return { wordpress_listing_id: LISTING_ID, google_id: GOOGLE_ID };
        },
        getListingById: async (id) => {
          listingReads.push(id);
          return port.getListingById(id);
        },
      },
      port,
    );

    assert.equal(makeCalls.length, 1);
    assert.equal(listingReads[0], LISTING_ID);
    assert.equal(result.make.wordpress_listing_id, LISTING_ID);
    assert.equal(result.conversion.outcome, "created");
    assert.equal(result.conversion.prospect_id, PROSPECT_A);
    assert.equal(result.conversion.generation_queued, false);
    assert.equal(result.conversion.status, "Saved");
    assert.equal(port.created.length, 1);
    assert.equal(port.created[0]?.source, GETOBLIC_PROSPECT_SOURCE);
    assert.equal(port.queued.length, 0);
    const claimInput = port.claimed[0] as {
      verification?: { mode?: string; expectedWordpressAuthorId?: number };
    };
    assert.equal(claimInput.verification?.mode, "make_assigned");
    assert.equal(claimInput.verification?.expectedWordpressAuthorId, 42);
    assert.doesNotMatch(JSON.stringify(port.created[0]?.raw_json), /do-not-copy/);
  });

  it("fails before convert when Make returns a different google_id", async () => {
    const port = convertDeps();
    await assert.rejects(
      () =>
        convertGoogleBusinessSelection(
          {
            organizationId: ORG_A,
            payload: validPayload(),
            actorUserId: "user-1",
            actorLicenseeAccountId: null,
          },
          {
            getSettings: port.getSettings,
            addListing: async () => ({
              wordpress_listing_id: LISTING_ID,
              google_id: "ChIJotherPlace",
            }),
            getListingById: async () => {
              throw new Error("should not GET listing");
            },
          },
          port,
        ),
      (error: unknown) => {
        assert.ok(error instanceof GoogleBusinessMakeError);
        assert.equal(error.code, "GOOGLE_BUSINESS_GOOGLE_ID_MISMATCH");
        return true;
      },
    );
    assert.equal(port.created.length, 0);
    assert.equal(port.claimed.length, 0);
  });

  it("fails before convert when the listing author is not the mapped org author", async () => {
    const port = convertDeps();
    await assert.rejects(
      () =>
        convertGoogleBusinessSelection(
          {
            organizationId: ORG_A,
            payload: validPayload(),
            actorUserId: "user-1",
            actorLicenseeAccountId: null,
          },
          {
            getSettings: port.getSettings,
            addListing: async () => ({
              wordpress_listing_id: LISTING_ID,
              google_id: GOOGLE_ID,
            }),
            getListingById: async (id) => ({
              wordpress_listing_id: id,
              status: "publish",
              title: "Oak Street Salon",
              author_id: 99,
              google_id: GOOGLE_ID,
              google_place_url: null,
              knowledge_base: null,
            }),
          },
          port,
        ),
      (error: unknown) => {
        assert.ok(error instanceof GoogleBusinessMakeError);
        assert.equal(error.code, "GOOGLE_BUSINESS_AUTHOR_MISMATCH");
        return true;
      },
    );
    assert.equal(port.created.length, 0);
    assert.equal(port.claimed.length, 0);
  });

  it("fails before convert when the listing google_id does not match the selection", async () => {
    const port = convertDeps();
    await assert.rejects(
      () =>
        convertGoogleBusinessSelection(
          {
            organizationId: ORG_A,
            payload: validPayload(),
            actorUserId: "user-1",
            actorLicenseeAccountId: null,
          },
          {
            getSettings: port.getSettings,
            addListing: async () => ({
              wordpress_listing_id: LISTING_ID,
              google_id: GOOGLE_ID,
            }),
            getListingById: async (id) => ({
              wordpress_listing_id: id,
              status: "publish",
              title: "Oak Street Salon",
              author_id: 42,
              google_id: "ChIJotherPlace",
              google_place_url: null,
              knowledge_base: null,
            }),
          },
          port,
        ),
      (error: unknown) => {
        assert.ok(error instanceof GoogleBusinessMakeError);
        assert.equal(error.code, "GOOGLE_BUSINESS_GOOGLE_ID_MISMATCH");
        return true;
      },
    );
    assert.equal(port.created.length, 0);
  });

  it("maps a WordPress listing 404 into convert remote_missing without creating a Prospect", async () => {
    const port = convertDeps();
    const result = await convertGoogleBusinessSelection(
      {
        organizationId: ORG_A,
        payload: validPayload(),
        actorUserId: "user-1",
        actorLicenseeAccountId: null,
      },
      {
        getSettings: port.getSettings,
        addListing: async () => ({
          wordpress_listing_id: LISTING_ID,
          google_id: GOOGLE_ID,
        }),
        getListingById: async () => {
          throw new GetOblicWordpressError(
            "NOT_FOUND",
            "Listing not found.",
            404,
            "LISTING_NOT_FOUND",
          );
        },
      },
      {
        ...port,
        getListingById: async () => {
          throw new GetOblicWordpressError(
            "NOT_FOUND",
            "Listing not found.",
            404,
            "LISTING_NOT_FOUND",
          );
        },
      },
    );
    assert.equal(result.conversion.outcome, "remote_missing");
    assert.equal(result.conversion.prospect_id, null);
    assert.equal(result.conversion.generation_queued, false);
    assert.equal(port.created.length, 0);
  });

  it("accepts a mapped-author listing in convert and rejects an inventory-pool listing", async () => {
    const mapped = convertDeps();
    const created = await convertGetOblicDirectoryListing(
      {
        organizationId: ORG_A,
        wordpressListingId: LISTING_ID,
        observed: observedSnapshotFromGooglePayload(
          validPayload() as Parameters<
            typeof observedSnapshotFromGooglePayload
          >[0],
        ),
        actorUserId: "user-1",
        actorLicenseeAccountId: null,
        listingAuthorPolicy: "mapped_author",
        expectedGoogleId: GOOGLE_ID,
        expectedWordpressAuthorId: 42,
      },
      mapped,
    );
    assert.equal(created.outcome, "created");
    assert.equal(created.generation_queued, false);
    assert.equal(
      (mapped.claimed[0] as { verification?: { mode?: string } }).verification
        ?.mode,
      "make_assigned",
    );

    const pool = convertDeps({
      getListingById: async (id) => ({
        wordpress_listing_id: id,
        status: "publish",
        title: "Oak Street Salon",
        author_id: 271519816,
        google_id: GOOGLE_ID,
        google_place_url: null,
        knowledge_base: null,
      }),
    });
    const rejected = await convertGetOblicDirectoryListing(
      {
        organizationId: ORG_A,
        wordpressListingId: LISTING_ID,
        observed: { title: "Oak Street Salon", google_id: GOOGLE_ID },
        actorUserId: "user-1",
        actorLicenseeAccountId: null,
        listingAuthorPolicy: "mapped_author",
        expectedGoogleId: GOOGLE_ID,
        expectedWordpressAuthorId: 42,
      },
      pool,
    );
    assert.equal(rejected.outcome, "unavailable");
    assert.equal(pool.created.length, 0);
    assert.equal(pool.claimed.length, 0);
  });

  it("fills empty listing fields from the Google payload without inventing values", () => {
    const merged = mergeEmptyListingFromGooglePayload(
      {
        wordpress_listing_id: LISTING_ID,
        status: "publish",
        title: "Oak Street Salon",
        author_id: 42,
        google_id: GOOGLE_ID,
        google_place_url: null,
        knowledge_base: null,
        website: null,
        phone: "already-on-listing",
      },
      validPayload() as Parameters<typeof mergeEmptyListingFromGooglePayload>[1],
    );
    assert.equal(merged.website, "https://oak.example");
    assert.equal(merged.phone, "already-on-listing");
    assert.equal(merged.google_place_url, "https://maps.google.com/?cid=1");
    assert.equal(merged.address, "100 Oak St, Dallas, TX 75201, USA");
  });
});

describe("CO-5D2 source contracts", () => {
  it("routes Google add through convertGoogleBusinessSelection and returns conversion", () => {
    const route = read("app/api/prospects/from-google-business/route.ts");
    assert.match(route, /convertGoogleBusinessSelection/);
    assert.match(route, /toPublicGetOblicConversion/);
    assert.match(route, /generation_queued|publicConversion/);
    assert.match(route, /requireCurrentOrganizationContext/);
    assert.doesNotMatch(route, /assignWordpressListingAuthor/);
    assert.doesNotMatch(route, /ensureProspectGenerationQueued/);
    assert.doesNotMatch(route, /body\.organizationId/);
    assert.doesNotMatch(route, /body\.author_id/);
    assert.doesNotMatch(route, /OpenRouter|openrouter/i);
  });

  it("never POSTs WordPress /author after Make assignment", () => {
    const convert = read(
      "services/googleBusiness/googleBusinessConvertService.ts",
    );
    const claim = read(
      "services/getoblicDirectory/getoblicDirectoryClaimService.ts",
    );
    assert.match(convert, /listingAuthorPolicy: "mapped_author"/);
    assert.match(convert, /expectedWordpressAuthorId/);
    assert.match(convert, /getListingById/);
    assert.doesNotMatch(convert, /assignWordpressListingAuthor/);
    assert.doesNotMatch(convert, /ensureProspectGenerationQueued/);
    assert.doesNotMatch(convert, /OpenRouter|openrouter/i);
    assert.match(claim, /mode === "make_assigned"/);
    assert.match(claim, /acquireMakeAssignedClaim/);
    const makeAssigned = claim.slice(
      claim.indexOf("async function acquireMakeAssignedClaim"),
    );
    assert.doesNotMatch(
      makeAssigned.slice(0, 1200),
      /assignAuthor\(|assignListingAuthor/,
    );
    assert.match(makeAssigned, /relationship_status: "linked"/);
  });

  it("redirects the Google method to the canonical Prospect and shows advisory capacity", () => {
    const google = read("components/prospects/GoogleBusinessDiscovery.tsx");
    const methods = read(
      "components/prospects/OpportunityDiscoveryMethods.tsx",
    );
    assert.match(google, /router\.push\(`\/prospects\/\$\{prospectId\}`\)/);
    assert.match(google, /listingCapacityReached/);
    assert.match(google, /conversion\?\.prospect_id/);
    assert.match(google, /generation_queued/);
    assert.doesNotMatch(google, /assignWordpressListingAuthor/);
    assert.doesNotMatch(google, /from-getoblic/);
    assert.match(methods, /listingCapacityReached=\{listingCapacityReached\}/);
  });
});
