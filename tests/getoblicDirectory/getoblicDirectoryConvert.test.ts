import "./getoblicDirectoryTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { GetOblicDirectoryError } from "../../services/getoblicDirectory/getoblicDirectoryErrors";
import {
  buildGetOblicProspectProvenance,
  convertGetOblicDirectoryListing,
  GETOBLIC_PROSPECT_SOURCE,
  isDisposableLosingConversionProspect,
  mergeGetOblicWebsiteAttribution,
  resolveGetOblicTrustedBusinessName,
  sanitizeGetOblicConvertObserved,
  toPublicGetOblicConversion,
  type GetOblicConvertDependencies,
} from "../../services/getoblicDirectory/getoblicDirectoryConvertService";
import {
  GETOBLIC_INVENTORY_POOL_AUTHOR_ID,
  type GetOblicListingLink,
} from "../../services/getoblicDirectory/getoblicDirectoryTypes";
import { GetOblicWordpressError } from "../../services/getoblicDirectory/getoblicWordpressTypes";
import type { Prospect } from "../../services/prospects/prospectService";

const ROOT = process.cwd();
const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";
const PROSPECT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PROSPECT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PROSPECT_MANUAL = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const LISTING_ID = 4401;

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
    ...overrides,
  };
}

function deps(
  overrides: Partial<GetOblicConvertDependencies> = {},
): GetOblicConvertDependencies & {
  created: Prospect[];
  claimed: unknown[];
  queued: Prospect[];
  deleted: string[];
} {
  const created: Prospect[] = [];
  const claimed: unknown[] = [];
  const queued: Prospect[] = [];
  const deleted: string[] = [];
  const store: GetOblicConvertDependencies & {
    created: Prospect[];
    claimed: unknown[];
    queued: Prospect[];
    deleted: string[];
  } = {
    created,
    claimed,
    queued,
    deleted,
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
      knowledge_base: "do-not-copy",
    }),
    getProspectById: async (id) =>
      created.find((row) => row.id === id) ?? prospect({ id }),
    findProspectByNameAndCity: async () => null,
    findProspectByWebsite: async () => null,
    findOriginProspectByListingId: async () => null,
    createProspect: async (input) => {
      const row = prospect({
        business_name: input.business_name,
        website: input.website ?? null,
        category: input.category ?? null,
        source: input.source ?? GETOBLIC_PROSPECT_SOURCE,
        status: input.status ?? "Saved",
        google_business_url: input.google_business_url ?? null,
        raw_json: input.raw_json ?? null,
        country: input.country ?? null,
        state: input.state ?? null,
        city: input.city ?? null,
        address: input.address ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        facebook: input.facebook ?? null,
        instagram: input.instagram ?? null,
        linkedin: input.linkedin ?? null,
        whatsapp_number: input.whatsapp_number ?? null,
        timezone: input.timezone ?? null,
      });
      created.push(row);
      return row;
    },
    updateProspect: async (id, _organizationId, input) => {
      const current =
        created.find((row) => row.id === id) ?? prospect({ id });
      const next = prospect({
        ...current,
        ...input,
        id,
      });
      const index = created.findIndex((row) => row.id === id);
      if (index >= 0) created[index] = next;
      return next;
    },
    deleteProspect: async (id) => {
      deleted.push(id);
      const index = created.findIndex((row) => row.id === id);
      if (index >= 0) created.splice(index, 1);
      return true;
    },
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
  return store;
}

function convertInput() {
  return {
    organizationId: ORG_A,
    wordpressListingId: LISTING_ID,
    observed: {
      title: "Acme Salon",
      permalink: "https://getoblic.com/listing/acme",
      listing_type: "getoblic_global_search_engine",
      category: [{ term_id: 9, slug: "hair-salons", name: "Hair Salons" }],
      location_display: "Austin, TX",
      lat: 30.27,
      lng: -97.74,
      google_id: "ChIJ123",
      image: "https://cdn.example.com/acme.jpg",
    },
    actorUserId: "user-1",
    actorLicenseeAccountId: null,
  };
}

describe("GetOblic directory convert orchestration", () => {
  it("creates one canonical GetOblic Prospect and claims the listing", async () => {
    const port = deps();
    const result = await convertGetOblicDirectoryListing(convertInput(), port);

    assert.equal(result.outcome, "created");
    assert.equal(result.prospect_id, PROSPECT_A);
    assert.equal(result.status, "Saved");
    assert.equal(result.website_ready, false);
    assert.equal(result.generation_queued, false);
    assert.equal(result.allocated, true);
    assert.equal(port.created.length, 1);
    assert.equal(port.created[0].source, GETOBLIC_PROSPECT_SOURCE);
    assert.equal(port.created[0].website, null);
    assert.equal(port.created[0].city, null);
    assert.equal(port.created[0].country, null);
    assert.equal(port.created[0].phone, null);
    assert.equal(port.created[0].category, "Hair Salons");
    assert.equal(
      port.created[0].google_business_url,
      "https://maps.google.com/?cid=1",
    );
    assert.equal(port.claimed.length, 1);
    assert.equal(port.queued.length, 0);
    assert.notEqual(
      port.created[0].website,
      "https://getoblic.com/listing/acme",
    );
    assert.doesNotMatch(JSON.stringify(port.created[0].raw_json), /do-not-copy/);
  });

  it("never treats the listing permalink as a website or parses location_display", async () => {
    const port = deps();
    await convertGetOblicDirectoryListing(convertInput(), port);
    const created = port.created[0];
    assert.equal(created.website, null);
    assert.equal(created.city, null);
    assert.equal(created.state, null);
    assert.equal(created.address, null);
    assert.equal(
      (created.raw_json?.observed as { location_display?: string })
        ?.location_display,
      "Austin, TX",
    );
  });

  it("reuses the same-org linked Prospect without creating another", async () => {
    const existing = prospect({ id: PROSPECT_B, status: "Saved" });
    const port = deps({
      getActiveListingClaim: async () => ({
        found: true,
        organization_id: ORG_A,
        prospect_id: PROSPECT_B,
        relationship_status: "linked",
      }),
      getProspectById: async () => existing,
    });
    const result = await convertGetOblicDirectoryListing(convertInput(), port);
    assert.equal(result.outcome, "already_owned");
    assert.equal(result.prospect_id, PROSPECT_B);
    assert.equal(port.created.length, 0);
    assert.equal(port.claimed.length, 0);
    assert.equal(port.queued.length, 0);
  });

  it("resumes a same-org claiming reservation on the existing Prospect", async () => {
    const existing = prospect({ id: PROSPECT_B, status: "Saved" });
    const port = deps({
      getActiveListingClaim: async () => ({
        found: true,
        organization_id: ORG_A,
        prospect_id: PROSPECT_B,
        relationship_status: "claiming",
      }),
      getProspectById: async () => existing,
    });
    const result = await convertGetOblicDirectoryListing(convertInput(), port);
    assert.equal(result.outcome, "reused");
    assert.equal(result.prospect_id, PROSPECT_B);
    assert.equal(port.created.length, 0);
    assert.equal(port.claimed.length, 1);
    assert.equal(
      (port.claimed[0] as { prospectId?: string }).prospectId,
      PROSPECT_B,
    );
    assert.equal(port.queued.length, 0);
    assert.deepEqual(port.deleted, []);
  });

  it("returns claim_incomplete with the existing Prospect when author mapping fails", async () => {
    const existing = prospect({ id: PROSPECT_B, status: "Saved" });
    const port = deps({
      getActiveListingClaim: async () => ({
        found: true,
        organization_id: ORG_A,
        prospect_id: PROSPECT_B,
        relationship_status: "claiming",
      }),
      getProspectById: async () => existing,
      claimKnownExistingListing: async () => {
        throw new GetOblicDirectoryError(
          "GETOBLIC_WORDPRESS_AUTHOR_UNMAPPED",
          "This organization has no mapped WordPress author.",
        );
      },
    });
    const result = await convertGetOblicDirectoryListing(convertInput(), port);
    assert.equal(result.outcome, "claim_incomplete");
    assert.equal(result.prospect_id, PROSPECT_B);
    assert.equal(port.created.length, 0);
    assert.deepEqual(port.deleted, []);
    assert.equal(result.generation_queued, false);
    assert.equal(result.allocated, false);
  });

  it("blocks other-org listings without leaking their identity", async () => {
    const port = deps({
      getActiveListingClaim: async () => ({
        found: true,
        organization_id: ORG_B,
        prospect_id: PROSPECT_B,
        relationship_status: "linked",
      }),
    });
    const result = await convertGetOblicDirectoryListing(convertInput(), port);
    assert.equal(result.outcome, "unavailable");
    assert.equal(result.prospect_id, null);
    const publicResult = toPublicGetOblicConversion(result);
    assert.doesNotMatch(JSON.stringify(publicResult), new RegExp(ORG_B));
    assert.doesNotMatch(JSON.stringify(publicResult), new RegExp(PROSPECT_B));
    assert.equal(port.created.length, 0);
  });

  it("repeats conversion onto the existing origin Prospect", async () => {
    const existing = prospect();
    const port = deps({
      findOriginProspectByListingId: async () => existing,
    });
    const result = await convertGetOblicDirectoryListing(convertInput(), port);
    assert.equal(result.outcome, "reused");
    assert.equal(result.prospect_id, PROSPECT_A);
    assert.equal(port.created.length, 0);
    assert.equal(port.claimed.length, 1);
  });

  it("resolves a same-org claim race to the winning Prospect", async () => {
    const winner = prospect({ id: PROSPECT_B, business_name: "Winner" });
    let lookups = 0;
    const port = deps({
      claimKnownExistingListing: async () => {
        throw new GetOblicDirectoryError(
          "GETOBLIC_LISTING_CLAIMED_SAME_ORG",
          "claimed",
        );
      },
      getActiveListingClaim: async () => {
        lookups += 1;
        if (lookups === 1) {
          return { found: false };
        }
        return {
          found: true,
          organization_id: ORG_A,
          prospect_id: PROSPECT_B,
          relationship_status: "linked",
        };
      },
      getProspectById: async (id) =>
        id === PROSPECT_B ? winner : prospect({ id }),
    });
    const result = await convertGetOblicDirectoryListing(convertInput(), port);
    assert.equal(result.outcome, "reused");
    assert.equal(result.prospect_id, PROSPECT_B);
    assert.deepEqual(port.deleted, [PROSPECT_A]);
    assert.equal(port.created.some((row) => row.id === PROSPECT_A), false);
  });

  it("does not discard a pre-existing Prospect that loses the same-org claim race", async () => {
    const existing = prospect({ id: PROSPECT_A });
    const winner = prospect({ id: PROSPECT_B, business_name: "Winner" });
    let lookups = 0;
    const port = deps({
      findOriginProspectByListingId: async () => existing,
      claimKnownExistingListing: async () => {
        throw new GetOblicDirectoryError(
          "GETOBLIC_LISTING_CLAIMED_SAME_ORG",
          "claimed",
        );
      },
      getActiveListingClaim: async () => {
        lookups += 1;
        if (lookups === 1) {
          return { found: false };
        }
        return {
          found: true,
          organization_id: ORG_A,
          prospect_id: PROSPECT_B,
          relationship_status: "linked",
        };
      },
      getProspectById: async (id) =>
        id === PROSPECT_B ? winner : existing,
    });
    const result = await convertGetOblicDirectoryListing(convertInput(), port);
    assert.equal(result.outcome, "reused");
    assert.equal(result.prospect_id, PROSPECT_B);
    assert.deepEqual(port.deleted, []);
    assert.equal(port.created.length, 0);
  });

  it("fails closed when directory settings are missing before create", async () => {
    const port = deps({
      getSettings: async () => ({
        configured: false,
        code: "GETOBLIC_DIRECTORY_NOT_CONFIGURED",
      }),
    });
    const result = await convertGetOblicDirectoryListing(convertInput(), port);
    assert.equal(result.outcome, "settings_missing");
    assert.equal(result.prospect_id, null);
    assert.equal(port.created.length, 0);
    assert.equal(port.claimed.length, 0);
  });

  it("discards a thin Prospect created by this request when authoritative capacity rejects", async () => {
    let claimAttempts = 0;
    const port = deps({
      getAllocationUsage: async () => ({
        configured: true,
        listingCapacity: 1,
        currentlyHeld: 0,
        available: 1,
      }),
      claimKnownExistingListing: async () => {
        claimAttempts += 1;
        throw new GetOblicDirectoryError(
          "GETOBLIC_LISTING_CAPACITY_EXCEEDED",
          "This account has reached its GetOblic listing capacity. Release an existing GetOblic listing before adding another.",
        );
      },
    });
    const result = await convertGetOblicDirectoryListing(convertInput(), port);
    assert.equal(result.outcome, "capacity_exceeded");
    assert.equal(result.prospect_id, null);
    assert.equal(result.generation_queued, false);
    assert.equal(result.allocated, false);
    assert.equal(claimAttempts, 1);
    assert.deepEqual(port.deleted, [PROSPECT_A]);
    assert.equal(port.created.length, 0);
    assert.equal(port.queued.length, 0);
  });

  it("does not discard a pre-existing Prospect when authoritative capacity rejects", async () => {
    const existing = prospect({ id: PROSPECT_B });
    const port = deps({
      getAllocationUsage: async () => ({
        configured: true,
        listingCapacity: 1,
        currentlyHeld: 0,
        available: 1,
      }),
      findOriginProspectByListingId: async () => existing,
      claimKnownExistingListing: async () => {
        throw new GetOblicDirectoryError(
          "GETOBLIC_LISTING_CAPACITY_EXCEEDED",
          "This account has reached its GetOblic listing capacity. Release an existing GetOblic listing before adding another.",
        );
      },
    });
    const result = await convertGetOblicDirectoryListing(convertInput(), port);
    assert.equal(result.outcome, "capacity_exceeded");
    assert.equal(result.prospect_id, null);
    assert.equal(port.created.length, 0);
    assert.deepEqual(port.deleted, []);
    assert.equal(port.queued.length, 0);
  });

  it("fails closed when listing capacity is exhausted, even with a historical event or origin Prospect", async () => {
    const port = deps({
      getAllocationUsage: async () => ({
        configured: true,
        listingCapacity: 2,
        currentlyHeld: 2,
        available: 0,
      }),
      hasAlreadyConsumedListing: async () => true,
      findOriginProspectByListingId: async () => prospect({ id: PROSPECT_B }),
    });
    const result = await convertGetOblicDirectoryListing(convertInput(), port);
    assert.equal(result.outcome, "capacity_exceeded");
    assert.equal(port.created.length, 0);
    assert.equal(port.claimed.length, 0);
  });

  it("does not invent a business name when GetOblic title is missing", async () => {
    assert.equal(resolveGetOblicTrustedBusinessName(null, "  "), null);
    const port = deps({
      getListingById: async (id) => ({
        wordpress_listing_id: id,
        status: "publish",
        title: null,
        author_id: GETOBLIC_INVENTORY_POOL_AUTHOR_ID,
        google_id: null,
        google_place_url: null,
        knowledge_base: null,
      }),
    });
    const result = await convertGetOblicDirectoryListing(
      {
        ...convertInput(),
        observed: { title: "" },
      },
      port,
    );
    assert.equal(result.outcome, "needs_business_name");
    assert.equal(port.created.length, 0);
  });

  it("returns a controlled name collision instead of merging by title alone", async () => {
    const other = prospect({
      id: PROSPECT_B,
      raw_json: { wordpress_listing_id: 9999 },
    });
    const port = deps({
      findProspectByNameAndCity: async () => other,
    });
    const result = await convertGetOblicDirectoryListing(convertInput(), port);
    assert.equal(result.outcome, "name_collision");
    assert.equal(result.prospect_id, null);
    assert.equal(port.created.length, 0);
  });

  it("does not queue generation without a website and keeps Saved", async () => {
    const port = deps();
    const result = await convertGetOblicDirectoryListing(convertInput(), port);
    assert.equal(result.status, "Saved");
    assert.equal(result.generation_queued, false);
    assert.equal(port.queued.length, 0);
  });

  it("does not queue generation when a reused Prospect already has a website", async () => {
    const existing = prospect({
      website: "https://acme.example",
      status: "Saved",
    });
    const { port } = reuseStore(existing);
    const result = await convertGetOblicDirectoryListing(convertInput(), port);
    assert.equal(result.outcome, "reused");
    assert.equal(result.website_ready, true);
    assert.equal(result.generation_queued, false);
    assert.equal(result.status, "Saved");
    assert.equal(port.queued.length, 0);
  });

  it("returns prospect_id when claim is incomplete after create", async () => {
    const port = deps({
      claimKnownExistingListing: async (input) => ({
        outcome: "claiming",
        allocated: false,
        link: link({
          prospect_id: input.prospectId,
          relationship_status: "claiming",
        }),
      }),
    });
    const result = await convertGetOblicDirectoryListing(convertInput(), port);
    assert.equal(result.outcome, "claim_incomplete");
    assert.equal(result.prospect_id, PROSPECT_A);
    assert.equal(result.generation_queued, false);
  });

  it("maps remote listing 404 before Prospect creation", async () => {
    const port = deps({
      getListingById: async () => {
        throw new GetOblicWordpressError("NOT_FOUND", "missing", 404);
      },
    });
    const result = await convertGetOblicDirectoryListing(convertInput(), port);
    assert.equal(result.outcome, "remote_missing");
    assert.equal(port.created.length, 0);
  });

  it("merges website attribution without replacing provenance", () => {
    const merged = mergeGetOblicWebsiteAttribution({
      origin: "getoblic_directory",
      wordpress_listing_id: LISTING_ID,
      attribution: {
        business_name: "getoblic_search",
        website: null,
      },
    });
    assert.equal(merged.origin, "getoblic_directory");
    assert.equal(merged.wordpress_listing_id, LISTING_ID);
    assert.equal(
      (merged.attribution as { website?: string }).website,
      "user",
    );
    assert.equal(
      (merged.attribution as { business_name?: string }).business_name,
      "getoblic_search",
    );
  });

  it("forwards search lat/lng into the observed snapshot and drops malformed values", () => {
    const observed = sanitizeGetOblicConvertObserved({
      title: "Acme",
      lat: 30.27,
      lng: "-97.74",
      extra: "ignore",
    });
    assert.equal(observed.lat, 30.27);
    assert.equal(observed.lng, -97.74);
    assert.equal(
      sanitizeGetOblicConvertObserved({ lat: "west", lng: { bad: true } }).lat,
      null,
    );
    assert.equal(
      sanitizeGetOblicConvertObserved({ lat: "west", lng: { bad: true } }).lng,
      null,
    );
  });

  it("builds compact non-secret provenance", () => {
    const provenance = buildGetOblicProspectProvenance({
      wordpressListingId: LISTING_ID,
      observed: {
        title: "Acme Salon",
        permalink: "https://getoblic.com/listing/acme",
        listing_type: "getoblic_global_search_engine",
        category: [{ term_id: 9, slug: "hair-salons", name: "Hair Salons" }],
        location_display: "Austin, TX",
        lat: 30.27,
        lng: -97.74,
        google_id: "ChIJ123",
        google_place_url: null,
        image: null,
      },
      listing: {
        wordpress_listing_id: LISTING_ID,
        status: "publish",
        title: "Acme Salon",
        author_id: 77,
        google_id: "ChIJ123",
        google_place_url: "https://maps.google.com/?cid=1",
        knowledge_base: "secret-notes",
      },
      googleBusinessUrl: "https://maps.google.com/?cid=1",
      category: "Hair Salons",
    });
    assert.equal(provenance.origin, "getoblic_directory");
    assert.doesNotMatch(JSON.stringify(provenance), /secret-notes/);
    assert.doesNotMatch(JSON.stringify(provenance), /author_id/);
  });

  it("rejects an ineligible new Add before Prospect or claim creation", async () => {
    const port = deps({
      getListingById: async (id) => ({
        wordpress_listing_id: id,
        status: "publish",
        title: "Acme Salon",
        author_id: 271520168,
        google_id: "ChIJ123",
        google_place_url: "https://maps.google.com/?cid=1",
        knowledge_base: null,
      }),
    });
    const result = await convertGetOblicDirectoryListing(convertInput(), port);
    assert.equal(result.outcome, "unavailable");
    assert.notEqual(result.outcome, "claim_incomplete");
    assert.equal(result.prospect_id, null);
    assert.equal(port.created.length, 0);
    assert.equal(port.claimed.length, 0);
    assert.deepEqual(port.deleted, []);
  });

  it("keeps same-org linked Open without applying inventory-pool preflight", async () => {
    const existing = prospect({ id: PROSPECT_B, status: "Saved" });
    let listingReads = 0;
    const port = deps({
      getActiveListingClaim: async () => ({
        found: true,
        organization_id: ORG_A,
        prospect_id: PROSPECT_B,
        relationship_status: "linked",
      }),
      getProspectById: async () => existing,
      getListingById: async (id) => {
        listingReads += 1;
        return {
          wordpress_listing_id: id,
          status: "publish",
          title: "Salon Dallas",
          author_id: 271520168,
          google_id: null,
          google_place_url: null,
          knowledge_base: null,
        };
      },
    });
    const result = await convertGetOblicDirectoryListing(convertInput(), port);
    assert.equal(result.outcome, "already_owned");
    assert.equal(result.prospect_id, PROSPECT_B);
    assert.equal(listingReads, 0);
    assert.equal(port.created.length, 0);
    assert.equal(port.claimed.length, 0);
  });

  it("maps claim-time GETOBLIC_LISTING_NOT_CLAIMABLE to unavailable", async () => {
    const port = deps({
      claimKnownExistingListing: async () => {
        throw new GetOblicDirectoryError(
          "GETOBLIC_LISTING_NOT_CLAIMABLE",
          "This listing is not available to claim.",
        );
      },
    });
    const result = await convertGetOblicDirectoryListing(convertInput(), port);
    assert.equal(result.outcome, "unavailable");
    assert.notEqual(result.outcome, "claim_incomplete");
    assert.equal(result.prospect_id, null);
    assert.equal(port.created.length, 1);
    assert.deepEqual(port.deleted, []);
  });
});

describe("GetOblic conversion loser ownership", () => {
  const thinLoser = prospect();

  function disposableInput(
    overrides: Partial<Parameters<typeof isDisposableLosingConversionProspect>[0]> = {},
  ) {
    return {
      createdByThisRequest: true,
      loser: thinLoser,
      winnerId: PROSPECT_B,
      wordpressListingId: LISTING_ID,
      hasActiveGetOblicClaim: false,
      ...overrides,
    };
  }

  it("allows discard only for a thin Prospect this request created", () => {
    assert.equal(isDisposableLosingConversionProspect(disposableInput()), true);
  });

  it("refuses discard without this-request creation evidence", () => {
    assert.equal(
      isDisposableLosingConversionProspect(
        disposableInput({ createdByThisRequest: false }),
      ),
      false,
    );
  });

  it("still discards a conversion-only loser that imported a factual website", () => {
    assert.equal(
      isDisposableLosingConversionProspect(
        disposableInput({
          loser: prospect({ website: "https://imported.example" }),
        }),
      ),
      true,
    );
  });

  it("refuses discard of the canonical winner or a non-thin record", () => {
    assert.equal(
      isDisposableLosingConversionProspect(
        disposableInput({ winnerId: PROSPECT_A }),
      ),
      false,
    );
    assert.equal(
      isDisposableLosingConversionProspect(
        disposableInput({
          loser: prospect({ linked_discussion_id: "disc-1" }),
        }),
      ),
      false,
    );
    assert.equal(
      isDisposableLosingConversionProspect(
        disposableInput({
          loser: prospect({ website_intelligence: { summary: "researched" } }),
        }),
      ),
      false,
    );
    assert.equal(
      isDisposableLosingConversionProspect(
        disposableInput({ loser: prospect({ status: "Ready" }) }),
      ),
      false,
    );
    assert.equal(
      isDisposableLosingConversionProspect(
        disposableInput({ loser: prospect({ source: "manual" }) }),
      ),
      false,
    );
    assert.equal(
      isDisposableLosingConversionProspect(
        disposableInput({ loser: prospect({ source: "csv" }) }),
      ),
      false,
    );
    assert.equal(
      isDisposableLosingConversionProspect(
        disposableInput({
          loser: prospect({ raw_json: { wordpress_listing_id: 9999 } }),
        }),
      ),
      false,
    );
    assert.equal(
      isDisposableLosingConversionProspect(
        disposableInput({ hasActiveGetOblicClaim: true }),
      ),
      false,
    );
  });
});

describe("GetOblic concurrent conversion persistence", () => {
  function createBarrier(count: number) {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let arrived = 0;
    return async () => {
      arrived += 1;
      if (arrived >= count) {
        release?.();
      }
      await gate;
    };
  }

  function uniqueViolation() {
    const error = new Error("duplicate key value violates unique constraint");
    (error as { code?: string }).code = "23505";
    return error;
  }

  function sharedPersistence(options?: {
    enforceNameCityUnique?: boolean;
    enforceWebsiteUnique?: boolean;
    concurrentCreates?: number;
    seed?: Prospect[];
  }) {
    const prospects = [...(options?.seed ?? [])];
    const links: GetOblicListingLink[] = [];
    const allocations = new Set<string>();
    const deleted: string[] = [];
    let createSeq = 0;
    const waitForPeerCreate = createBarrier(options?.concurrentCreates ?? 2);

    const allocationKey = (organizationId: string, listingId: number) =>
      `${organizationId}:${listingId}`;

    const port = deps({
      findOriginProspectByListingId: async (organizationId, listingId) =>
        prospects.find(
          (row) =>
            row.organization_id === organizationId &&
            row.source === GETOBLIC_PROSPECT_SOURCE &&
            Number(row.raw_json?.wordpress_listing_id) === listingId,
        ) ?? null,
      findProspectByNameAndCity: async (organizationId, name, city) =>
        prospects.find(
          (row) =>
            row.organization_id === organizationId &&
            row.website == null &&
            row.business_name.toLowerCase() === name.toLowerCase() &&
            String(row.city ?? "") === String(city ?? ""),
        ) ?? null,
      findProspectByWebsite: async (organizationId, website) =>
        prospects.find(
          (row) =>
            row.organization_id === organizationId &&
            row.website != null &&
            row.website.toLowerCase() === website.toLowerCase(),
        ) ?? null,
      getProspectById: async (id, organizationId) =>
        prospects.find(
          (row) => row.id === id && row.organization_id === organizationId,
        ) ?? null,
      getActiveListingClaim: async (listingId) => {
        const active = links.find(
          (row) =>
            row.wordpress_listing_id === listingId &&
            (row.relationship_status === "claiming" ||
              row.relationship_status === "linked" ||
              row.relationship_status === "remote_missing"),
        );
        if (!active) return { found: false as const };
        return {
          found: true as const,
          organization_id: active.organization_id,
          prospect_id: active.prospect_id,
          relationship_status: active.relationship_status,
        };
      },
      createProspect: async (input) => {
        await waitForPeerCreate();
        if (options?.enforceWebsiteUnique && input.website) {
          const collision = prospects.find(
            (row) =>
              row.organization_id === input.organization_id &&
              row.website != null &&
              row.website.toLowerCase() === input.website!.toLowerCase(),
          );
          if (collision) {
            throw uniqueViolation();
          }
        }
        if (options?.enforceNameCityUnique) {
          const collision = prospects.find(
            (row) =>
              row.organization_id === input.organization_id &&
              row.website == null &&
              row.business_name.toLowerCase() ===
                input.business_name.toLowerCase() &&
              String(row.city ?? "") === String(input.city ?? ""),
          );
          if (collision) {
            throw uniqueViolation();
          }
        }
        createSeq += 1;
        const row = prospect({
          id: `created-${createSeq}`,
          organization_id: input.organization_id,
          business_name: input.business_name,
          website: input.website ?? null,
          category: input.category ?? null,
          source: input.source ?? GETOBLIC_PROSPECT_SOURCE,
          status: input.status ?? "Saved",
          google_business_url: input.google_business_url ?? null,
          raw_json: input.raw_json ?? null,
          email: input.email ?? null,
          facebook: input.facebook ?? null,
          instagram: input.instagram ?? null,
          linkedin: input.linkedin ?? null,
          whatsapp_number: input.whatsapp_number ?? null,
          timezone: input.timezone ?? null,
        });
        prospects.push(row);
        return row;
      },
      updateProspect: async (id, organizationId, input) => {
        const index = prospects.findIndex(
          (row) => row.id === id && row.organization_id === organizationId,
        );
        if (index < 0) return null;
        const next = prospect({ ...prospects[index], ...input, id });
        prospects[index] = next;
        return next;
      },
      deleteProspect: async (id, organizationId) => {
        const hasActiveLink = links.some(
          (row) =>
            row.prospect_id === id &&
            (row.relationship_status === "claiming" ||
              row.relationship_status === "linked" ||
              row.relationship_status === "remote_missing"),
        );
        if (hasActiveLink) {
          throw new GetOblicDirectoryError(
            "GETOBLIC_LISTING_ACTIVE_CLAIM",
            "active",
          );
        }
        const index = prospects.findIndex(
          (row) => row.id === id && row.organization_id === organizationId,
        );
        if (index < 0) return false;
        deleted.push(id);
        prospects.splice(index, 1);
        return true;
      },
      claimKnownExistingListing: async (input) => {
        const listingId = Number(input.wordpressListingId);
        const existing = links.find(
          (row) =>
            row.wordpress_listing_id === listingId &&
            (row.relationship_status === "claiming" ||
              row.relationship_status === "linked" ||
              row.relationship_status === "remote_missing"),
        );
        if (existing && existing.prospect_id !== input.prospectId) {
          if (existing.organization_id !== input.organizationId) {
            throw new GetOblicDirectoryError(
              "GETOBLIC_LISTING_CLAIMED_OTHER_ORG",
              "other org",
            );
          }
          throw new GetOblicDirectoryError(
            "GETOBLIC_LISTING_CLAIMED_SAME_ORG",
            "same org",
          );
        }
        if (!existing) {
          const createdLink = link({
            id: `link-${input.prospectId}`,
            organization_id: input.organizationId,
            prospect_id: input.prospectId,
            wordpress_listing_id: listingId,
          });
          links.push(createdLink);
          const key = allocationKey(input.organizationId, listingId);
          const allocated = !allocations.has(key);
          if (allocated) allocations.add(key);
          return {
            outcome: "linked" as const,
            allocated,
            link: createdLink,
          };
        }
        return {
          outcome: "linked" as const,
          allocated: false,
          link: existing,
        };
      },
    });

    return { port, prospects, links, allocations, deleted };
  }

  it("leaves one durable Prospect after both creates lose on the listing unique", async () => {
    const manual = prospect({
      id: PROSPECT_MANUAL,
      source: "manual",
      business_name: "Unrelated Manual",
      raw_json: null,
    });
    const store = sharedPersistence({ seed: [manual] });
    const [first, second] = await Promise.all([
      convertGetOblicDirectoryListing(convertInput(), store.port),
      convertGetOblicDirectoryListing(convertInput(), store.port),
    ]);

    const listingProspects = store.prospects.filter(
      (row) =>
        row.source === GETOBLIC_PROSPECT_SOURCE &&
        Number(row.raw_json?.wordpress_listing_id) === LISTING_ID,
    );
    const canonicalId = first.prospect_id;
    assert.ok(canonicalId);
    assert.equal(second.prospect_id, canonicalId);
    assert.equal(listingProspects.length, 1);
    assert.equal(listingProspects[0].id, canonicalId);
    assert.equal(store.links.length, 1);
    assert.equal(store.links[0].prospect_id, canonicalId);
    assert.equal(store.allocations.size, 1);
    assert.equal(store.deleted.length, 1);
    assert.notEqual(store.deleted[0], canonicalId);
    assert.ok(store.prospects.some((row) => row.id === PROSPECT_MANUAL));
    assert.doesNotMatch(JSON.stringify(first), new RegExp(ORG_B));
    assert.doesNotMatch(JSON.stringify(second), new RegExp(ORG_B));

    const retry = await convertGetOblicDirectoryListing(
      convertInput(),
      store.port,
    );
    assert.equal(retry.prospect_id, canonicalId);
    assert.equal(
      store.prospects.filter(
        (row) =>
          row.source === GETOBLIC_PROSPECT_SOURCE &&
          Number(row.raw_json?.wordpress_listing_id) === LISTING_ID,
      ).length,
      1,
    );
    assert.equal(store.links.length, 1);
    assert.equal(store.allocations.size, 1);
  });

  it("reuses the name-unique winner without creating a second Prospect", async () => {
    const store = sharedPersistence({ enforceNameCityUnique: true });
    const [first, second] = await Promise.all([
      convertGetOblicDirectoryListing(convertInput(), store.port),
      convertGetOblicDirectoryListing(convertInput(), store.port),
    ]);

    assert.ok(first.prospect_id);
    assert.equal(second.prospect_id, first.prospect_id);
    assert.equal(
      store.prospects.filter((row) => row.source === GETOBLIC_PROSPECT_SOURCE)
        .length,
      1,
    );
    assert.equal(store.links.length, 1);
    assert.equal(store.allocations.size, 1);
    assert.equal(store.deleted.length, 0);
  });

  it("keeps a distinct GetOblic Prospect when an imported website already belongs to another org Prospect", async () => {
    const existingWebsiteOwner = prospect({
      id: PROSPECT_MANUAL,
      source: "manual",
      business_name: "Unrelated Manual",
      website: "https://acme.example",
      raw_json: null,
    });
    const store = sharedPersistence({
      enforceWebsiteUnique: true,
      concurrentCreates: 1,
      seed: [existingWebsiteOwner],
    });
    store.port.getListingById = async (id) => richListing(id);

    const result = await convertGetOblicDirectoryListing(
      convertInput(),
      store.port,
    );
    assert.equal(result.outcome, "created");
    assert.ok(result.prospect_id);
    assert.notEqual(result.prospect_id, PROSPECT_MANUAL);
    const created = store.prospects.find((row) => row.id === result.prospect_id);
    assert.ok(created);
    assert.equal(created.website, null);
    assert.equal(
      (created.raw_json?.observed as { website?: string }).website,
      "https://acme.example",
    );
    assert.equal(
      (created.raw_json?.attribution as { website?: string }).website,
      "getoblic_listing_detail",
    );
    assert.equal(created.email, "hello@acme.example");
    assert.equal(store.links.length, 1);
    assert.equal(store.allocations.size, 1);
    assert.equal(store.deleted.length, 0);
    assert.ok(store.prospects.some((row) => row.id === PROSPECT_MANUAL));
  });

  it("reuses the same-listing website winner without a second Prospect or second claim", async () => {
    const store = sharedPersistence({ enforceWebsiteUnique: true });
    store.port.getListingById = async (id) => richListing(id);
    const [first, second] = await Promise.all([
      convertGetOblicDirectoryListing(convertInput(), store.port),
      convertGetOblicDirectoryListing(convertInput(), store.port),
    ]);

    assert.ok(first.prospect_id);
    assert.equal(second.prospect_id, first.prospect_id);
    assert.equal(
      store.prospects.filter((row) => row.source === GETOBLIC_PROSPECT_SOURCE)
        .length,
      1,
    );
    assert.equal(store.links.length, 1);
    assert.equal(store.allocations.size, 1);
    assert.equal(
      store.prospects[0]?.website === "https://acme.example" ||
        store.prospects.find((row) => row.id === first.prospect_id)?.website ===
          "https://acme.example",
      true,
    );
  });

  it("discards a conversion-only loser even when it imported a website", async () => {
    const store = sharedPersistence({ enforceWebsiteUnique: true });
    store.port.getListingById = async (id) => richListing(id);
    const [first, second] = await Promise.all([
      convertGetOblicDirectoryListing(convertInput(), store.port),
      convertGetOblicDirectoryListing(convertInput(), store.port),
    ]);

    const listingProspects = store.prospects.filter(
      (row) =>
        row.source === GETOBLIC_PROSPECT_SOURCE &&
        Number(row.raw_json?.wordpress_listing_id) === LISTING_ID,
    );
    assert.ok(first.prospect_id);
    assert.equal(second.prospect_id, first.prospect_id);
    assert.equal(listingProspects.length, 1);
    assert.equal(store.links.length, 1);
    assert.equal(store.allocations.size, 1);
    assert.ok(store.deleted.length <= 1);
  });

  it("discards the other-org create-then-lose Prospect without leaking identity", async () => {
    const store = sharedPersistence();
    const otherInput = {
      ...convertInput(),
      organizationId: ORG_B,
    };
    const [first, second] = await Promise.all([
      convertGetOblicDirectoryListing(convertInput(), store.port),
      convertGetOblicDirectoryListing(otherInput, store.port),
    ]);

    const winner = first.outcome === "unavailable" ? second : first;
    const loser = first.outcome === "unavailable" ? first : second;
    assert.ok(winner.prospect_id);
    assert.equal(loser.outcome, "unavailable");
    assert.equal(loser.prospect_id, null);
    assert.doesNotMatch(JSON.stringify(loser), new RegExp(winner.prospect_id!));
    assert.equal(
      store.prospects.filter(
        (row) => Number(row.raw_json?.wordpress_listing_id) === LISTING_ID,
      ).length,
      1,
    );
    assert.equal(store.links.length, 1);
    assert.equal(store.allocations.size, 1);
    assert.equal(store.deleted.length, 1);
  });
});

describe("GetOblic conversion loser cleanup integrity", () => {
  function sameOrgCreateThenLose(
    overrides: Partial<GetOblicConvertDependencies> = {},
  ) {
    const winner = prospect({ id: PROSPECT_B, business_name: "Winner" });
    let lookups = 0;
    const port = deps({
      claimKnownExistingListing: async () => {
        throw new GetOblicDirectoryError(
          "GETOBLIC_LISTING_CLAIMED_SAME_ORG",
          "claimed",
        );
      },
      getActiveListingClaim: async () => {
        lookups += 1;
        if (lookups === 1) {
          return { found: false };
        }
        return {
          found: true as const,
          organization_id: ORG_A,
          prospect_id: PROSPECT_B,
          relationship_status: "linked" as const,
        };
      },
      getProspectById: async (id, organizationId) => {
        if (id === PROSPECT_B) return winner;
        return (
          port.created.find(
            (row) => row.id === id && row.organization_id === organizationId,
          ) ?? null
        );
      },
      ...overrides,
    });
    return { port, winner };
  }

  it("discards a disposable loser and leaves only the canonical winner", async () => {
    const { port, winner } = sameOrgCreateThenLose();
    const result = await convertGetOblicDirectoryListing(convertInput(), port);
    assert.equal(result.outcome, "reused");
    assert.equal(result.prospect_id, winner.id);
    assert.deepEqual(port.deleted, [PROSPECT_A]);
    assert.equal(
      port.created.some((row) => row.id === PROSPECT_A),
      false,
    );
  });

  it("treats an already-absent loser as canonical success", async () => {
    const { port, winner } = sameOrgCreateThenLose();
    port.deleteProspect = async (id, organizationId) => {
      port.deleted.push(id);
      const index = port.created.findIndex(
        (row) => row.id === id && row.organization_id === organizationId,
      );
      if (index >= 0) port.created.splice(index, 1);
      return false;
    };
    const result = await convertGetOblicDirectoryListing(convertInput(), port);
    assert.equal(result.outcome, "reused");
    assert.equal(result.prospect_id, winner.id);
    assert.equal(
      port.created.some((row) => row.id === PROSPECT_A),
      false,
    );
    assert.equal(port.created.length, 0);
  });

  it("does not delete a loser that acquired the active claim", async () => {
    const claimedLoser = prospect({ id: PROSPECT_A });
    let lookups = 0;
    const port = deps({
      claimKnownExistingListing: async () => {
        throw new GetOblicDirectoryError(
          "GETOBLIC_LISTING_CLAIMED_SAME_ORG",
          "claimed",
        );
      },
      getActiveListingClaim: async () => {
        lookups += 1;
        if (lookups === 1) {
          return { found: false };
        }
        return {
          found: true as const,
          organization_id: ORG_A,
          prospect_id: PROSPECT_A,
          relationship_status: "linked" as const,
        };
      },
      getProspectById: async (id) =>
        id === PROSPECT_A
          ? port.created.find((row) => row.id === id) ?? claimedLoser
          : prospect({ id }),
      deleteProspect: async () => {
        throw new GetOblicDirectoryError(
          "GETOBLIC_LISTING_ACTIVE_CLAIM",
          "active",
        );
      },
    });

    const result = await convertGetOblicDirectoryListing(convertInput(), port);
    assert.equal(result.outcome, "reused");
    assert.equal(result.prospect_id, PROSPECT_A);
    assert.deepEqual(port.deleted, []);
    assert.equal(
      port.created.some((row) => row.id === PROSPECT_A),
      true,
    );
  });

  it("refuses to delete or certify uniqueness when the loser is no longer disposable", async () => {
    const { port } = sameOrgCreateThenLose({
      deleteProspect: async (id) => {
        port.deleted.push(id);
        return true;
      },
    });
    const originalGet = port.getProspectById;
    port.getProspectById = async (id, organizationId) => {
      const row = await originalGet(id, organizationId);
      if (row && id !== PROSPECT_B) {
        return { ...row, website_intelligence: { summary: "mutated" } };
      }
      return row;
    };

    await assert.rejects(
      () => convertGetOblicDirectoryListing(convertInput(), port),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_CONCURRENCY_CONFLICT");
        return true;
      },
    );
    assert.deepEqual(port.deleted, []);
    assert.equal(
      port.created.some((row) => row.id === PROSPECT_A),
      true,
    );
  });

  it("fails the conversion when delete returns false and the loser remains", async () => {
    const { port } = sameOrgCreateThenLose({
      deleteProspect: async () => false,
    });

    await assert.rejects(
      () => convertGetOblicDirectoryListing(convertInput(), port),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_CONCURRENCY_CONFLICT");
        return true;
      },
    );
    assert.deepEqual(port.deleted, []);
    assert.equal(
      port.created.some((row) => row.id === PROSPECT_A),
      true,
    );
    assert.equal(port.created.length, 1);
  });

  it("retries after cleanup failure without creating another Prospect", async () => {
    const { port } = sameOrgCreateThenLose({
      deleteProspect: async () => false,
    });

    await assert.rejects(
      () => convertGetOblicDirectoryListing(convertInput(), port),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_CONCURRENCY_CONFLICT");
        return true;
      },
    );
    assert.equal(port.created.length, 1);
    const leftoverId = port.created[0]?.id;
    assert.ok(leftoverId);

    port.getActiveListingClaim = async () => ({
      found: true as const,
      organization_id: ORG_A,
      prospect_id: PROSPECT_B,
      relationship_status: "linked" as const,
    });
    port.getProspectById = async (id) =>
      id === PROSPECT_B
        ? prospect({ id: PROSPECT_B, business_name: "Winner" })
        : port.created.find((row) => row.id === id) ?? null;
    port.createProspect = async () => {
      throw new Error("must not create another Prospect");
    };

    const retry = await convertGetOblicDirectoryListing(convertInput(), port);
    assert.equal(retry.outcome, "already_owned");
    assert.equal(retry.prospect_id, PROSPECT_B);
    assert.equal(port.created.length, 1);
    assert.equal(port.created[0]?.id, leftoverId);
    assert.deepEqual(port.deleted, []);
  });
});

function richListing(id: number) {
  return {
    wordpress_listing_id: id,
    status: "publish",
    title: "Acme Salon",
    author_id: GETOBLIC_INVENTORY_POOL_AUTHOR_ID,
    google_id: "ChIJ123",
    google_place_url: "https://maps.google.com/?cid=1",
    knowledge_base: "do-not-copy",
    phone: "512-555-0100",
    whatsapp: "+15125550100",
    address: "100 Congress Ave",
    region: { term_id: 44, slug: "austin", name: "Austin" },
    lat: 30.267,
    lng: -97.743,
    timezone: "America/Chicago",
    work_hours: { Mon: [["09:00", "17:00"]] },
    text_hours: "Mon-Fri 9-5",
    tagline: "Downtown cuts",
    description: "A neighborhood salon.",
    cover: "https://cdn.example.com/cover.jpg",
    gallery: ["https://cdn.example.com/1.jpg", "https://cdn.example.com/2.jpg"],
    image: "https://cdn.example.com/acme.jpg",
    listing_type: "barbershop",
    category: [{ term_id: 9, slug: "hair-salons", name: "Hair Salons" }],
    tags: [{ term_id: 3, slug: "color", name: "Color" }],
    website: "https://acme.example",
    email: "hello@acme.example",
    facebook: "https://facebook.com/acme",
    instagram: "https://instagram.com/acme",
    linkedin: "https://linkedin.com/company/acme",
    social: [{ network: "youtube", url: "https://youtube.com/@acme" }],
  };
}

function reuseStore(existing: Prospect) {
  const store = [existing];
  const port = deps({
    findOriginProspectByListingId: async () => store[0] ?? null,
    getProspectById: async (id) => store.find((row) => row.id === id) ?? null,
    getListingById: async (id) => richListing(id),
    updateProspect: async (id, _organizationId, input) => {
      const index = store.findIndex((row) => row.id === id);
      if (index < 0) return null;
      const next = {
        ...store[index],
        ...input,
        id,
      };
      store[index] = next;
      return next;
    },
  });
  return { port, store };
}

describe("GetOblic CO-4 rich listing import", () => {
  it("imports phone, address, category, and Google Business URL onto a new Prospect", async () => {
    const port = deps({
      getListingById: async (id) => richListing(id),
    });
    const result = await convertGetOblicDirectoryListing(convertInput(), port);
    assert.equal(result.outcome, "created");
    assert.equal(result.status, "Saved");
    assert.equal(result.generation_queued, false);
    assert.equal(port.created[0].phone, "512-555-0100");
    assert.equal(port.created[0].address, "100 Congress Ave");
    assert.equal(port.created[0].category, "Hair Salons");
    assert.equal(
      port.created[0].google_business_url,
      "https://maps.google.com/?cid=1",
    );
    assert.equal(port.created[0].website, "https://acme.example");
    assert.equal(port.created[0].email, "hello@acme.example");
    assert.equal(port.created[0].facebook, "https://facebook.com/acme");
    assert.equal(port.created[0].instagram, "https://instagram.com/acme");
    assert.equal(port.created[0].linkedin, "https://linkedin.com/company/acme");
    assert.equal(port.created[0].whatsapp_number, "+15125550100");
    assert.equal(port.created[0].timezone, "America/Chicago");
    assert.equal(port.created[0].city, null);
    assert.equal(port.queued.length, 0);
  });

  it("preserves additional factual fields in raw_json and never copies knowledge_base", async () => {
    const port = deps({
      getListingById: async (id) => richListing(id),
    });
    await convertGetOblicDirectoryListing(convertInput(), port);
    const raw = JSON.stringify(port.created[0].raw_json);
    assert.doesNotMatch(raw, /do-not-copy/);
    assert.doesNotMatch(raw, /knowledge_base/);
    const observed = port.created[0].raw_json?.observed as Record<string, unknown>;
    assert.equal(observed.wordpress_listing_id, LISTING_ID);
    assert.equal(observed.phone, "512-555-0100");
    assert.equal(observed.whatsapp, "+15125550100");
    assert.equal(observed.address, "100 Congress Ave");
    assert.equal(observed.tagline, "Downtown cuts");
    assert.equal(observed.description, "A neighborhood salon.");
    assert.equal(observed.timezone, "America/Chicago");
    assert.equal(observed.text_hours, "Mon-Fri 9-5");
    assert.deepEqual(observed.gallery, [
      "https://cdn.example.com/1.jpg",
      "https://cdn.example.com/2.jpg",
    ]);
    assert.equal(
      (observed.region as { name?: string } | null)?.name,
      "Austin",
    );
    assert.equal(port.created[0].city, null);
    const attribution = port.created[0].raw_json?.attribution as {
      phone?: string;
      address?: string;
      category?: string;
      google_business_url?: string;
      website?: string | null;
      email?: string | null;
      facebook?: string | null;
      instagram?: string | null;
      linkedin?: string | null;
      whatsapp?: string | null;
      timezone?: string | null;
      business_name?: string;
    };
    assert.equal(attribution.business_name, "getoblic_listing_detail");
    assert.equal(attribution.phone, "getoblic_listing_detail");
    assert.equal(attribution.address, "getoblic_listing_detail");
    assert.equal(attribution.category, "getoblic_listing_detail");
    assert.equal(attribution.google_business_url, "getoblic_listing_detail");
    assert.equal(attribution.website, "getoblic_listing_detail");
    assert.equal(attribution.email, "getoblic_listing_detail");
    assert.equal(attribution.facebook, "getoblic_listing_detail");
    assert.equal(attribution.instagram, "getoblic_listing_detail");
    assert.equal(attribution.linkedin, "getoblic_listing_detail");
    assert.equal(attribution.whatsapp, "getoblic_listing_detail");
    assert.equal(attribution.timezone, "getoblic_listing_detail");
    assert.equal(observed.website, "https://acme.example");
    assert.equal(observed.email, "hello@acme.example");
    assert.equal(observed.facebook, "https://facebook.com/acme");
    assert.equal(observed.instagram, "https://instagram.com/acme");
    assert.equal(observed.linkedin, "https://linkedin.com/company/acme");
    assert.deepEqual(observed.social, [
      { network: "youtube", url: "https://youtube.com/@acme" },
    ]);
  });

  it("never treats the listing permalink as website", async () => {
    const port = deps({
      getListingById: async (id) => ({
        ...richListing(id),
        website: "https://getoblic.com/listing/acme",
      }),
    });
    await convertGetOblicDirectoryListing(convertInput(), port);
    assert.equal(port.created[0].website, null);
    assert.notEqual(
      port.created[0].website,
      "https://getoblic.com/listing/acme",
    );
    assert.equal(
      (port.created[0].raw_json?.observed as { permalink?: string }).permalink,
      "https://getoblic.com/listing/acme",
    );
  });

  it("does not overwrite an existing Prospect phone or address", async () => {
    const existing = prospect({
      phone: "user-phone",
      address: "User Address",
      category: "User Category",
      website: "https://user-site.example",
      email: "user@example.com",
      facebook: "https://facebook.com/user",
      instagram: "https://instagram.com/user",
      linkedin: "https://linkedin.com/in/user",
      whatsapp_number: "+15550001111",
      timezone: "America/Denver",
      notes: "keep-me",
      website_intelligence: { summary: "researched" },
      raw_json: {
        origin: "getoblic_directory",
        wordpress_listing_id: LISTING_ID,
        user_marker: true,
      },
    });
    const { port, store } = reuseStore(existing);
    const result = await convertGetOblicDirectoryListing(convertInput(), port);
    assert.equal(result.outcome, "reused");
    assert.equal(store[0].phone, "user-phone");
    assert.equal(store[0].address, "User Address");
    assert.equal(store[0].category, "User Category");
    assert.equal(store[0].website, "https://user-site.example");
    assert.equal(store[0].email, "user@example.com");
    assert.equal(store[0].facebook, "https://facebook.com/user");
    assert.equal(store[0].instagram, "https://instagram.com/user");
    assert.equal(store[0].linkedin, "https://linkedin.com/in/user");
    assert.equal(store[0].whatsapp_number, "+15550001111");
    assert.equal(store[0].timezone, "America/Denver");
    assert.equal(store[0].notes, "keep-me");
    assert.deepEqual(store[0].website_intelligence, { summary: "researched" });
    assert.equal(
      (store[0].raw_json as { user_marker?: boolean }).user_marker,
      true,
    );
    assert.equal(result.generation_queued, false);
    assert.equal(port.queued.length, 0);
  });

  it("fills empty phone and address on an existing Prospect", async () => {
    const existing = prospect({
      phone: null,
      address: "  ",
      category: null,
      google_business_url: null,
      website: null,
      email: null,
      facebook: null,
      instagram: null,
      linkedin: null,
      whatsapp_number: null,
      timezone: null,
    });
    const { port, store } = reuseStore(existing);
    const result = await convertGetOblicDirectoryListing(convertInput(), port);
    assert.equal(result.outcome, "reused");
    assert.equal(store[0].phone, "512-555-0100");
    assert.equal(store[0].address, "100 Congress Ave");
    assert.equal(store[0].category, "Hair Salons");
    assert.equal(store[0].google_business_url, "https://maps.google.com/?cid=1");
    assert.equal(store[0].website, "https://acme.example");
    assert.equal(store[0].email, "hello@acme.example");
    assert.equal(store[0].facebook, "https://facebook.com/acme");
    assert.equal(store[0].instagram, "https://instagram.com/acme");
    assert.equal(store[0].linkedin, "https://linkedin.com/company/acme");
    assert.equal(store[0].whatsapp_number, "+15125550100");
    assert.equal(store[0].timezone, "America/Chicago");
    assert.equal(store[0].city, null);
    assert.equal(result.generation_queued, false);
    assert.equal(port.queued.length, 0);
  });

  it("preserves search lat/lng in provenance when detail coordinates are absent", async () => {
    const port = deps({
      getListingById: async (id) => ({
        ...richListing(id),
        lat: null,
        lng: null,
      }),
    });
    await convertGetOblicDirectoryListing(convertInput(), port);
    const observed = port.created[0].raw_json?.observed as {
      lat?: number | null;
      lng?: number | null;
    };
    assert.equal(observed.lat, 30.27);
    assert.equal(observed.lng, -97.74);
  });

  it("does not queue generation for a new or reused GetOblic import", async () => {
    const createdPort = deps({
      getListingById: async (id) => richListing(id),
    });
    const created = await convertGetOblicDirectoryListing(
      convertInput(),
      createdPort,
    );
    assert.equal(created.generation_queued, false);
    assert.equal(createdPort.queued.length, 0);

    const existing = prospect({
      website: "https://already-has-a-site.example",
      status: "Saved",
    });
    const { port } = reuseStore(existing);
    const reused = await convertGetOblicDirectoryListing(convertInput(), port);
    assert.equal(reused.generation_queued, false);
    assert.equal(reused.website_ready, true);
    assert.equal(port.queued.length, 0);
  });
});

describe("GetOblic directory convert source contract", () => {
  it("owns conversion on a dedicated tenant-scoped route", () => {
    const route = read("app/api/prospects/from-getoblic/route.ts");
    assert.match(route, /requireCurrentOrganizationContext/);
    assert.match(route, /convertGetOblicDirectoryListing/);
    assert.doesNotMatch(route, /body\.organizationId/);
    assert.doesNotMatch(route, /body\.organization_id/);
    assert.doesNotMatch(route, /putWordpressListingKnowledgeBase/);
    assert.doesNotMatch(route, /syncGetOblicListingKnowledgeBase/);
    assert.doesNotMatch(route, /OpenRouter|openrouter/i);
    assert.doesNotMatch(route, /google.?places/i);
  });

  it("does not write Knowledge Base, call Google Places, or spend LLM tokens", () => {
    const service = read(
      "services/getoblicDirectory/getoblicDirectoryConvertService.ts",
    );
    assert.match(service, /claimKnownExistingListing/);
    assert.match(service, /createProspect/);
    assert.doesNotMatch(service, /syncGetOblicListingKnowledgeBase/);
    assert.doesNotMatch(service, /putWordpressListingKnowledgeBase/);
    assert.doesNotMatch(service, /google.?places/i);
    assert.doesNotMatch(service, /OpenRouter|openrouter/i);
    assert.doesNotMatch(service, /knowledge_base:/);
    assert.match(service, /ensureProspectGenerationQueued/);
    assert.doesNotMatch(
      service,
      /await args\.dependencies\.ensureProspectGenerationQueued/,
    );
    assert.match(service, /generationQueued: false/);
    assert.match(service, /normalizeWebsiteUrl\(prospect\.website\)/);
  });

  it("does not add a second Prospect model or a migration", () => {
    const service = read(
      "services/getoblicDirectory/getoblicDirectoryConvertService.ts",
    );
    assert.doesNotMatch(service, /type GetOblicProspect\b/);
    assert.doesNotMatch(service, /create table/i);
    assert.doesNotMatch(service, /from\("getoblic_prospects"\)/);
  });
});
