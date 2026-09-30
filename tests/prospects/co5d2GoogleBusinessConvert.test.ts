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
import { GetOblicDirectoryError } from "../../services/getoblicDirectory/getoblicDirectoryErrors";
import {
  MAKE_ASSIGNED_STABILIZATION_ATTEMPT_TIMEOUT_MS,
  MAKE_ASSIGNED_STABILIZATION_MAX_ATTEMPTS,
  MAKE_ASSIGNED_STABILIZATION_RETRY_DELAYS_MS,
} from "../../services/getoblicDirectory/getoblicMakeAssignedListingStabilization";
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
    generated_listing_description: null,
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
    findReusableWebsiteIntelligence: async () => null,
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
    const listingTimeouts: Array<number | undefined> = [];
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
        getListingById: async (id, options) => {
          listingReads.push(id);
          listingTimeouts.push(options?.timeoutMs);
          return port.getListingById(id);
        },
      },
      port,
    );

    assert.equal(makeCalls.length, 1);
    assert.equal(listingReads.length, 1);
    assert.deepEqual(listingTimeouts, [
      MAKE_ASSIGNED_STABILIZATION_ATTEMPT_TIMEOUT_MS,
    ]);
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

  it("reuses website intelligence through the shared GetOblic convert path", async () => {
    const reusable = {
      provider: "deep_v1",
      url: "https://oak.example",
      scraped_at: "2026-08-01T00:00:00.000Z",
      pages_analyzed: 4,
      about: "Google-discovered reusable intelligence",
      services: "Hair",
    };
    const reuseCalls: unknown[] = [];
    const port = convertDeps({
      findReusableWebsiteIntelligence: async (input) => {
        reuseCalls.push(input);
        return reusable;
      },
    });
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
        getListingById: port.getListingById,
      },
      port,
    );

    assert.equal(result.conversion.outcome, "created");
    assert.equal(result.conversion.generation_queued, false);
    assert.equal(reuseCalls.length, 1);
    assert.deepEqual(reuseCalls[0], {
      currentOrganizationId: ORG_A,
      wordpressListingId: LISTING_ID,
      currentWebsite: "https://oak.example",
    });
    assert.deepEqual(port.created[0]?.website_intelligence, reusable);
    assert.equal(port.queued.length, 0);
    assert.doesNotMatch(
      JSON.stringify(result.conversion),
      /source_prospect_id|source_organization_id/,
    );
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
    const delays: number[] = [];
    let reads = 0;
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
            sleep: async (ms) => {
              delays.push(ms);
            },
            getListingById: async (id) => {
              reads += 1;
              return {
                wordpress_listing_id: id,
                status: "publish",
                title: "Oak Street Salon",
                author_id: 99,
                google_id: GOOGLE_ID,
                google_place_url: null,
                knowledge_base: null,
              };
            },
          },
          port,
        ),
      (error: unknown) => {
        assert.ok(error instanceof GoogleBusinessMakeError);
        assert.equal(error.code, "GOOGLE_BUSINESS_AUTHOR_MISMATCH");
        return true;
      },
    );
    assert.equal(reads, MAKE_ASSIGNED_STABILIZATION_MAX_ATTEMPTS);
    assert.deepEqual(delays, [...MAKE_ASSIGNED_STABILIZATION_RETRY_DELAYS_MS]);
    assert.equal(port.created.length, 0);
    assert.equal(port.claimed.length, 0);
  });

  it("fails before convert when the listing google_id does not match the selection", async () => {
    const port = convertDeps();
    const delays: number[] = [];
    let reads = 0;
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
            sleep: async (ms) => {
              delays.push(ms);
            },
            getListingById: async (id) => {
              reads += 1;
              return {
                wordpress_listing_id: id,
                status: "publish",
                title: "Oak Street Salon",
                author_id: 42,
                google_id: "ChIJotherPlace",
                google_place_url: null,
                knowledge_base: null,
              };
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
    assert.equal(reads, 1);
    assert.deepEqual(delays, []);
    assert.equal(port.created.length, 0);
  });

  it("maps a WordPress listing 404 into convert remote_missing without creating a Prospect", async () => {
    const port = convertDeps();
    let preReads = 0;
    let convertReads = 0;
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
        sleep: async () => {},
        getListingById: async () => {
          preReads += 1;
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
          convertReads += 1;
          throw new GetOblicWordpressError(
            "NOT_FOUND",
            "Listing not found.",
            404,
            "LISTING_NOT_FOUND",
          );
        },
      },
    );
    assert.equal(preReads, MAKE_ASSIGNED_STABILIZATION_MAX_ATTEMPTS);
    assert.equal(convertReads, 0);
    assert.equal(result.conversion.outcome, "remote_missing");
    assert.equal(result.conversion.prospect_id, null);
    assert.equal(result.conversion.generation_queued, false);
    assert.equal(port.created.length, 0);
  });

  it("accepts a mapped-author listing in convert and rejects an inventory-pool listing", async () => {
    const directoryTimeouts: Array<number | undefined> = [];
    const mapped = convertDeps({
      getListingById: async (id, options) => {
        directoryTimeouts.push(options?.timeoutMs);
        return {
          wordpress_listing_id: id,
          status: "publish",
          title: "Oak Street Salon",
          author_id: 42,
          google_id: GOOGLE_ID,
          google_place_url: null,
          knowledge_base: null,
        };
      },
    });
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
    assert.deepEqual(directoryTimeouts, [undefined]);
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

type ScriptedRead =
  | { kind: "ok"; listing?: Record<string, unknown> }
  | { kind: "error"; error: unknown };

function publishedListing(overrides: Record<string, unknown> = {}) {
  return {
    status: "publish",
    title: "Oak Street Salon",
    author_id: 42,
    google_id: GOOGLE_ID,
    google_place_url: null,
    knowledge_base: null,
    ...overrides,
  };
}

function scriptedSelection(
  reads: ScriptedRead[],
  convertGetListingById?: GetOblicConvertDependencies["getListingById"],
) {
  const port = convertDeps(
    convertGetListingById ? { getListingById: convertGetListingById } : {},
  );
  const makeCalls: unknown[] = [];
  const delays: number[] = [];
  const timeouts: Array<number | undefined> = [];
  let readCount = 0;
  const run = () =>
    convertGoogleBusinessSelection(
      {
        organizationId: ORG_A,
        payload: validPayload(),
        actorUserId: "user-1",
        actorLicenseeAccountId: null,
      },
      {
        getSettings: port.getSettings,
        addListing: async (input) => {
          makeCalls.push(input);
          return { wordpress_listing_id: LISTING_ID, google_id: GOOGLE_ID };
        },
        sleep: async (ms) => {
          delays.push(ms);
        },
        getListingById: async (id, options) => {
          timeouts.push(options?.timeoutMs);
          const step = reads[readCount];
          readCount += 1;
          if (!step) {
            throw new Error(`unexpected listing read ${readCount}`);
          }
          if (step.kind === "error") {
            throw step.error;
          }
          return {
            wordpress_listing_id: id,
            ...publishedListing(step.listing),
          };
        },
      },
      port,
    );
  return {
    port,
    makeCalls,
    delays,
    timeouts,
    readCount: () => readCount,
    run,
  };
}

function timeoutError(): GetOblicWordpressError {
  return new GetOblicWordpressError(
    "TIMEOUT",
    "GetOblic Directory request timed out.",
    504,
  );
}

describe("CO-5D2 post-Make listing stabilization", () => {
  it("retries a timeout once and still calls Make only once", async () => {
    const script = scriptedSelection([
      { kind: "error", error: timeoutError() },
      { kind: "ok" },
    ]);
    const result = await script.run();
    assert.equal(script.makeCalls.length, 1);
    assert.equal(script.readCount(), 2);
    assert.deepEqual(script.timeouts, [
      MAKE_ASSIGNED_STABILIZATION_ATTEMPT_TIMEOUT_MS,
      MAKE_ASSIGNED_STABILIZATION_ATTEMPT_TIMEOUT_MS,
    ]);
    assert.deepEqual(script.delays, [
      MAKE_ASSIGNED_STABILIZATION_RETRY_DELAYS_MS[0],
    ]);
    assert.equal(result.conversion.outcome, "created");
    assert.equal(script.port.created.length, 1);
    assert.equal(script.port.claimed.length, 1);
    assert.equal(result.conversion.generation_queued, false);
  });

  it("retries a network failure and then creates one Prospect", async () => {
    const script = scriptedSelection([
      {
        kind: "error",
        error: new GetOblicWordpressError("NETWORK", "unavailable", 502),
      },
      { kind: "ok" },
    ]);
    const result = await script.run();
    assert.equal(result.conversion.outcome, "created");
    assert.equal(script.makeCalls.length, 1);
    assert.equal(script.readCount(), 2);
    assert.equal(script.port.created.length, 1);
    assert.equal(script.port.claimed.length, 1);
  });

  it("exhausts repeated timeouts without a Prospect or a second Make call", async () => {
    const script = scriptedSelection([
      { kind: "error", error: timeoutError() },
      { kind: "error", error: timeoutError() },
    ]);
    await assert.rejects(
      () => script.run(),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_REMOTE_TRANSIENT");
        assert.equal(error.status, 504);
        return true;
      },
    );
    assert.equal(script.makeCalls.length, 1);
    assert.equal(script.readCount(), MAKE_ASSIGNED_STABILIZATION_MAX_ATTEMPTS);
    assert.deepEqual(script.delays, [
      ...MAKE_ASSIGNED_STABILIZATION_RETRY_DELAYS_MS,
    ]);
    assert.equal(script.port.created.length, 0);
    assert.equal(script.port.claimed.length, 0);
  });

  it("treats an immediate not-found as eventual consistency and then converts", async () => {
    const script = scriptedSelection([
      {
        kind: "error",
        error: new GetOblicWordpressError(
          "NOT_FOUND",
          "Listing not found.",
          404,
          "LISTING_NOT_FOUND",
        ),
      },
      { kind: "ok" },
    ]);
    const result = await script.run();
    assert.equal(result.conversion.outcome, "created");
    assert.equal(script.makeCalls.length, 1);
    assert.equal(script.readCount(), 2);
    assert.equal(script.port.created.length, 1);
  });

  it("waits for a temporary author and still requires the mapped author", async () => {
    const script = scriptedSelection([
      { kind: "ok", listing: { author_id: 7 } },
      { kind: "ok", listing: { author_id: 42 } },
    ]);
    const result = await script.run();
    assert.equal(result.conversion.outcome, "created");
    assert.equal(script.readCount(), 2);
    assert.equal(script.makeCalls.length, 1);
    assert.equal(script.port.created.length, 1);
    assert.equal(script.port.claimed.length, 1);
    const claimInput = script.port.claimed[0] as {
      verification?: { expectedWordpressAuthorId?: number };
    };
    assert.equal(claimInput.verification?.expectedWordpressAuthorId, 42);
  });

  it("accepts a Google ID that appears on a later read", async () => {
    const script = scriptedSelection([
      { kind: "ok", listing: { google_id: null } },
      { kind: "ok" },
    ]);
    const result = await script.run();
    assert.equal(result.conversion.outcome, "created");
    assert.equal(script.readCount(), 2);
    assert.equal(script.makeCalls.length, 1);
    assert.equal(script.port.created.length, 1);
  });

  it("retries a blank Google ID and rejects a later conflicting ID without converting", async () => {
    const blankThenConflict = scriptedSelection([
      { kind: "ok", listing: { google_id: "" } },
      { kind: "ok", listing: { google_id: "ChIJotherPlace" } },
    ]);
    await assert.rejects(
      () => blankThenConflict.run(),
      (error: unknown) => {
        assert.ok(error instanceof GoogleBusinessMakeError);
        assert.equal(error.code, "GOOGLE_BUSINESS_GOOGLE_ID_MISMATCH");
        return true;
      },
    );
    assert.equal(blankThenConflict.readCount(), 2);
    assert.equal(blankThenConflict.makeCalls.length, 1);
    assert.equal(blankThenConflict.port.created.length, 0);
    assert.equal(blankThenConflict.port.claimed.length, 0);

    const blankExhausted = scriptedSelection([
      { kind: "ok", listing: { google_id: null } },
      { kind: "ok", listing: { google_id: "  " } },
    ]);
    await assert.rejects(
      () => blankExhausted.run(),
      (error: unknown) => {
        assert.ok(error instanceof GoogleBusinessMakeError);
        assert.equal(error.code, "GOOGLE_BUSINESS_GOOGLE_ID_MISMATCH");
        return true;
      },
    );
    assert.equal(
      blankExhausted.readCount(),
      MAKE_ASSIGNED_STABILIZATION_MAX_ATTEMPTS,
    );
    assert.equal(blankExhausted.port.created.length, 0);
  });

  it("does not retry authentication failures or call Make again", async () => {
    const script = scriptedSelection([
      {
        kind: "error",
        error: new GetOblicWordpressError(
          "UNAUTHORIZED",
          "Invalid API key.",
          401,
          "INVALID_API_KEY",
        ),
      },
    ]);
    await assert.rejects(
      () => script.run(),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_REMOTE_AUTH_FAILED");
        return true;
      },
    );
    assert.equal(script.readCount(), 1);
    assert.deepEqual(script.delays, []);
    assert.equal(script.makeCalls.length, 1);
    assert.equal(script.port.created.length, 0);
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
    assert.doesNotMatch(convert, /findReusableWebsiteIntelligence/);
    assert.match(convert, /convertGetOblicDirectoryListing/);
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
