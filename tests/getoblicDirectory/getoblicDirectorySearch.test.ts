import "./getoblicDirectoryTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { GetOblicDirectoryError } from "../../services/getoblicDirectory/getoblicDirectoryErrors";
import {
  searchGetOblicDirectory,
  toPublicGetOblicDirectorySearch,
  type GetOblicDirectorySearchWordpressPort,
} from "../../services/getoblicDirectory/getoblicDirectorySearchService";
import { GetOblicWordpressError } from "../../services/getoblicDirectory/getoblicWordpressTypes";
import { GETOBLIC_INVENTORY_POOL_AUTHOR_ID } from "../../services/getoblicDirectory/getoblicDirectoryTypes";
import type { GetOblicWordpressSearchResponse } from "../../services/getoblicDirectory/getoblicWordpressTypes";

const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);
const ROOT = process.cwd();
const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";
const PROSPECT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PROSPECT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

type LinkRow = {
  id: string;
  organization_id: string;
  prospect_id: string;
  wordpress_listing_id: number;
  relationship_status: string;
};

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function completeLink(
  partial: Pick<
    LinkRow,
    "organization_id" | "prospect_id" | "wordpress_listing_id" | "relationship_status"
  > &
    Partial<LinkRow>,
): Record<string, unknown> {
  return {
    id: partial.id ?? `link-${partial.wordpress_listing_id}`,
    google_id_snapshot: null,
    google_id_is_matchable: false,
    relationship_origin: "linked_existing",
    wordpress_author_id: null,
    allocated_at: null,
    last_verified_at: null,
    last_remote_error: null,
    last_remote_error_at: null,
    kb_push_status: "never",
    kb_last_pushed_executive_version_id: null,
    kb_last_content_sha256: null,
    kb_last_pushed_at: null,
    kb_last_push_error: null,
    kb_last_push_error_at: null,
    created_by_user_id: null,
    created_via_licensee_account_id: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    released_at: null,
    ...partial,
  };
}

function installLinks(links: Record<string, unknown>[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = (table: string) => {
    const filters: Record<string, unknown> = {};
    const matching = () =>
      links.filter((row) =>
        Object.entries(filters).every(([column, expected]) => {
          if (Array.isArray(expected)) {
            return expected.includes(row[column]);
          }
          return row[column] === expected;
        }),
      );
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        filters[column] = values;
        return builder;
      },
      maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
      then(
        resolve: (value: { data: unknown; error: null }) => void,
      ) {
        return Promise.resolve({ data: matching(), error: null }).then(resolve);
      },
    };
    if (table !== "athena_getoblic_listing_links") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      };
    }
    return builder;
  };
}

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = originalFrom;
});

function hit(
  id: number,
  overrides: Partial<GetOblicWordpressSearchResponse["results"][number]> = {},
): GetOblicWordpressSearchResponse["results"][number] {
  return {
    wordpress_listing_id: id,
    title: `Listing ${id}`,
    permalink: `https://getoblic.com/listing/${id}`,
    status: "publish",
    listing_type: "barbershop",
    category: [{ term_id: 50466, slug: "barbershop-cst", name: "Barbershop CST" }],
    location_display: "Dallas, TX",
    lat: 32.79,
    lng: -96.81,
    image: null,
    google_id: null,
    author_id: GETOBLIC_INVENTORY_POOL_AUTHOR_ID,
    ...overrides,
  };
}

function remoteResponse(
  results: GetOblicWordpressSearchResponse["results"],
  pagination: Partial<GetOblicWordpressSearchResponse["pagination"]> = {},
): GetOblicWordpressSearchResponse {
  return {
    query: {
      keywords: "hair salons in Dallas",
      listing_type: "getoblic_global_search_engine",
      page: 0,
      per_page: 6,
    },
    results,
    pagination: {
      page: 0,
      per_page: 6,
      found_posts: results.length,
      max_num_pages: results.length > 0 ? 1 : 0,
      ...pagination,
    },
  };
}

function port(
  response: GetOblicWordpressSearchResponse | (() => Promise<GetOblicWordpressSearchResponse>),
  calls: unknown[] = [],
): GetOblicDirectorySearchWordpressPort {
  return {
    searchWordpressListings: async (request) => {
      calls.push(request);
      if (typeof response === "function") {
        return response();
      }
      return response;
    },
  };
}

describe("GetOblic directory search service", () => {
  it("validates the accepted request contract", async () => {
    await assert.rejects(
      () =>
        searchGetOblicDirectory({
          organizationId: ORG_A,
          keywords: "",
        }),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_SEARCH_INVALID_REQUEST");
        assert.equal(error.status, 400);
        return true;
      },
    );

    await assert.rejects(
      () =>
        searchGetOblicDirectory({
          organizationId: ORG_A,
          keywords: { $where: "1=1" },
        }),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_SEARCH_INVALID_REQUEST");
        return true;
      },
    );

    await assert.rejects(
      () =>
        searchGetOblicDirectory({
          organizationId: ORG_A,
          keywords: "hair",
          listing_type: "NOT A TYPE",
        }),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_SEARCH_INVALID_REQUEST");
        return true;
      },
    );

    await assert.rejects(
      () =>
        searchGetOblicDirectory({
          organizationId: ORG_A,
          keywords: "hair",
          page: -1,
        }),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_SEARCH_INVALID_REQUEST");
        return true;
      },
    );

    await assert.rejects(
      () =>
        searchGetOblicDirectory({
          organizationId: ORG_A,
          keywords: "hair",
          per_page: 0,
        }),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_SEARCH_INVALID_REQUEST");
        return true;
      },
    );

    await assert.rejects(
      () =>
        searchGetOblicDirectory({
          organizationId: ORG_A,
          keywords: "hair",
          per_page: 21,
        }),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_SEARCH_INVALID_REQUEST");
        return true;
      },
    );
  });

  it("overlays AVAILABLE, OWNED_BY_THIS_ORG, and UNAVAILABLE in one batch", async () => {
    installLinks([
      completeLink({
        organization_id: ORG_A,
        prospect_id: PROSPECT_A,
        wordpress_listing_id: 100,
        relationship_status: "linked",
      }),
      completeLink({
        organization_id: ORG_B,
        prospect_id: PROSPECT_B,
        wordpress_listing_id: 200,
        relationship_status: "linked",
      }),
    ]);

    const result = await searchGetOblicDirectory(
      {
        organizationId: ORG_A,
        keywords: "hair salons in Dallas",
        listing_type: "getoblic_global_search_engine",
        page: 0,
        per_page: 6,
      },
      port(remoteResponse([hit(100), hit(200), hit(300)], { found_posts: 16, max_num_pages: 3 })),
    );

    assert.equal(result.found_posts, 16);
    assert.equal(result.max_num_pages, 3);
    assert.equal(result.results[0]?.athena_claim_status, "OWNED_BY_THIS_ORG");
    assert.equal(result.results[1]?.athena_claim_status, "UNAVAILABLE");
    assert.equal(result.results[2]?.athena_claim_status, "AVAILABLE");
    assert.notEqual(result.results[0]?.athena_claim_status, "INCOMPLETE_FOR_THIS_ORG");
    const publicSearch = toPublicGetOblicDirectorySearch(result);
    const serialized = JSON.stringify(publicSearch);
    assert.doesNotMatch(serialized, /organization_id/);
    assert.doesNotMatch(serialized, new RegExp(ORG_B));
    assert.doesNotMatch(serialized, new RegExp(PROSPECT_A));
    assert.doesNotMatch(serialized, new RegExp(PROSPECT_B));
    assert.doesNotMatch(serialized, /OWNED_BY_THIS_PROSPECT/);
    assert.doesNotMatch(serialized, /author_id/);
    assert.doesNotMatch(serialized, /271519816/);
  });

  it("classifies live inventory-pool ownership independently of public payload", async () => {
    installLinks([
      completeLink({
        id: "link-dallas",
        organization_id: ORG_A,
        prospect_id: PROSPECT_A,
        wordpress_listing_id: 179011,
        relationship_status: "linked",
      }),
      completeLink({
        id: "link-tuli",
        organization_id: ORG_A,
        prospect_id: PROSPECT_A,
        wordpress_listing_id: 546506,
        relationship_status: "linked",
      }),
      completeLink({
        id: "link-miami",
        organization_id: ORG_A,
        prospect_id: PROSPECT_A,
        wordpress_listing_id: 653470,
        relationship_status: "linked",
      }),
      completeLink({
        organization_id: ORG_A,
        prospect_id: PROSPECT_B,
        wordpress_listing_id: 100,
        relationship_status: "claiming",
      }),
    ]);

    const result = await searchGetOblicDirectory(
      {
        organizationId: ORG_A,
        keywords: "hair salons in Dallas",
      },
      port(
        remoteResponse([
          hit(179011, { author_id: 271520168, title: "Salon Dallas" }),
          hit(546506, { author_id: 271520168, title: "TULI" }),
          hit(653470, { author_id: 271520168, title: "Salon Miami" }),
          hit(200, { author_id: 99 }),
          hit(100),
          hit(300),
          hit(400, { author_id: null }),
        ]),
      ),
    );

    assert.equal(result.results[0]?.athena_claim_status, "OWNED_BY_THIS_ORG");
    assert.equal(result.results[1]?.athena_claim_status, "OWNED_BY_THIS_ORG");
    assert.equal(result.results[2]?.athena_claim_status, "OWNED_BY_THIS_ORG");
    assert.equal(result.results[3]?.athena_claim_status, "UNAVAILABLE");
    assert.equal(result.results[4]?.athena_claim_status, "INCOMPLETE_FOR_THIS_ORG");
    assert.equal(result.results[5]?.athena_claim_status, "AVAILABLE");
    assert.equal(result.results[6]?.athena_claim_status, "UNAVAILABLE");
    const publicSearch = toPublicGetOblicDirectorySearch(result);
    const serialized = JSON.stringify(publicSearch);
    assert.doesNotMatch(serialized, /author_id/);
    assert.doesNotMatch(serialized, /271519816/);
    assert.doesNotMatch(serialized, /271520168/);
    for (const row of publicSearch.results) {
      assert.equal("author_id" in row, false);
    }
  });

  it("overlays same-org claiming as incomplete, not owned", async () => {
    installLinks([
      completeLink({
        organization_id: ORG_A,
        prospect_id: PROSPECT_A,
        wordpress_listing_id: 100,
        relationship_status: "claiming",
      }),
    ]);

    const result = await searchGetOblicDirectory(
      {
        organizationId: ORG_A,
        keywords: "hair salons in Dallas",
      },
      port(remoteResponse([hit(100)])),
    );

    assert.equal(result.results[0]?.athena_claim_status, "INCOMPLETE_FOR_THIS_ORG");
    assert.notEqual(result.results[0]?.athena_claim_status, "OWNED_BY_THIS_ORG");
  });

  it("overlays same-org remote_missing as incomplete, not owned", async () => {
    installLinks([
      completeLink({
        organization_id: ORG_A,
        prospect_id: PROSPECT_A,
        wordpress_listing_id: 100,
        relationship_status: "remote_missing",
      }),
    ]);

    const result = await searchGetOblicDirectory(
      {
        organizationId: ORG_A,
        keywords: "hair salons in Dallas",
      },
      port(remoteResponse([hit(100)])),
    );

    assert.equal(result.results[0]?.athena_claim_status, "INCOMPLETE_FOR_THIS_ORG");
    assert.notEqual(result.results[0]?.athena_claim_status, "OWNED_BY_THIS_ORG");
  });

  it("returns empty results without creating claims or prospects", async () => {
    installLinks([]);
    const calls: unknown[] = [];
    const result = await searchGetOblicDirectory(
      {
        organizationId: ORG_A,
        keywords: "zzzxqnotarealbusiness999",
      },
      port(remoteResponse([], { found_posts: 0, max_num_pages: 0 }), calls),
    );
    assert.deepEqual(result.results, []);
    assert.equal(result.found_posts, 0);
    assert.equal(calls.length, 1);
  });

  it("maps WordPress backend failures without leaking the API key", async () => {
    installLinks([]);
    process.env.ATHENA_V2_DIRECTORY_API_KEY = "super-secret-directory-key";
    await assert.rejects(
      () =>
        searchGetOblicDirectory(
          {
            organizationId: ORG_A,
            keywords: "hair",
          },
          {
            searchWordpressListings: async () => {
              throw new GetOblicWordpressError(
                "REMOTE_ERROR",
                "upstream failed super-secret-directory-key",
                502,
              );
            },
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_REMOTE_TRANSIENT");
        assert.equal(error.status, 502);
        assert.doesNotMatch(error.message, /super-secret-directory-key/);
        return true;
      },
    );
  });

  it("maps WordPress auth failures to GETOBLIC_REMOTE_AUTH_FAILED", async () => {
    installLinks([]);
    await assert.rejects(
      () =>
        searchGetOblicDirectory(
          {
            organizationId: ORG_A,
            keywords: "hair",
          },
          {
            searchWordpressListings: async () => {
              throw new GetOblicWordpressError(
                "UNAUTHORIZED",
                "Invalid API key.",
                403,
                "INVALID_API_KEY",
              );
            },
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_REMOTE_AUTH_FAILED");
        assert.equal(error.status, 503);
        return true;
      },
    );
  });
});

describe("GetOblic directory search source contract", () => {
  it("requires tenant auth and derives organization server-side", () => {
    const route = read("app/api/getoblic-directory/search/route.ts");
    assert.match(route, /export const runtime = "nodejs"/);
    assert.match(route, /export const dynamic = "force-dynamic"/);
    assert.match(route, /requireCurrentOrganizationContext/);
    assert.match(route, /searchGetOblicDirectory/);
    assert.match(route, /Cache-Control": "no-store"/);
    assert.doesNotMatch(route, /params\.get\("organization_id"\)/);
    assert.doesNotMatch(route, /body\.organizationId/);
    assert.doesNotMatch(route, /ATHENA_V2_DIRECTORY_API_KEY/);
    assert.doesNotMatch(route, /NEXT_PUBLIC_ATHENA_V2_DIRECTORY/);
    assert.doesNotMatch(route, /elasticsearch/i);
    assert.doesNotMatch(route, /WP_Query/);
    assert.doesNotMatch(route, /claimKnownExistingListing/);
    assert.doesNotMatch(route, /consumeGetOblicListingAllocation/);
    assert.doesNotMatch(route, /putWordpressListingKnowledgeBase/);
  });

  it("keeps the WordPress client server-only and does not pass through query DSL", () => {
    const client = read("services/getoblicDirectory/getoblicWordpressClient.ts");
    const service = read(
      "services/getoblicDirectory/getoblicDirectorySearchService.ts",
    );
    assert.match(client, /never import this module from client/);
    assert.match(client, /\/listings\/search\?/);
    assert.match(client, /ATHENA_V2_DIRECTORY_API_KEY/);
    assert.doesNotMatch(client, /NEXT_PUBLIC_ATHENA_V2_DIRECTORY/);
    assert.doesNotMatch(client, /ELASTIC/);
    assert.doesNotMatch(client, /ep_host/);
    assert.doesNotMatch(service, /claimKnownExistingListing/);
    assert.doesNotMatch(service, /resolveOrCreateWordpressUser/);
    assert.doesNotMatch(service, /assignWordpressListingAuthor/);
    assert.doesNotMatch(service, /putWordpressListingKnowledgeBase/);
    assert.doesNotMatch(service, /consumeGetOblicListingAllocation/);
    assert.doesNotMatch(service, /OWNED_BY_THIS_PROSPECT/);
    assert.doesNotMatch(service, /createProspect/);
    assert.match(service, /hit\.author_id/);
    assert.doesNotMatch(service, /author_id: hit\.author_id/);
    assert.doesNotMatch(service, /271519816/);
  });

  it("does not add UI, migrations, or Elastic credentials", () => {
    const route = read("app/api/getoblic-directory/search/route.ts");
    assert.doesNotMatch(route, /from "next\/link"/);
    assert.doesNotMatch(route, /useState/);
    const service = read(
      "services/getoblicDirectory/getoblicDirectorySearchService.ts",
    );
    assert.doesNotMatch(service, /9200/);
    assert.doesNotMatch(service, /getobliccom-post-1/);
  });
});
