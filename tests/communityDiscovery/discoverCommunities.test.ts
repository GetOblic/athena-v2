/**
 * COMMUNITY-INTELLIGENCE-1 Gate 3C — discovery orchestration.
 * Fake provider, catalog, and qualifier. No live provider or model call.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OpenRouterBoundedCallError } from "../../lib/openrouter";
import {
  createSupabasePublicCommunityCatalog,
  type PublicCommunityCatalog,
  type PublicCommunityRecord,
} from "../../services/communityDiscovery/communityDiscoveryPersistence";
import { CommunityDiscoveryRequestError } from "../../services/communityDiscovery/communityDiscoveryErrors";
import {
  discoverFacebookGroups,
  type CommunityDiscoveryResponse,
} from "../../services/communityDiscovery/discoverCommunities";
import { qualifyDiscoveredCommunities } from "../../services/communityDiscovery/communityDiscoveryQualification";
import type { CommunitySearchHit } from "../../services/communityDiscovery/communitySearchProvider";
import { CommunitySearchError } from "../../services/communityDiscovery/communitySearchProvider";
import type { CommunitySearchProvider } from "../../services/communityDiscovery/communitySearchProvider";
import type { CommunitySearchQuery } from "../../services/communityDiscovery/communitySearchProvider";
import { createCommunityDiscoveryDbFake } from "./communityDiscoveryDbFake";

const ORG_A = "org-a";
const ORG_B = "org-b";
const NOW = new Date("2026-10-12T12:00:00.000Z");
const GROUP_ID = "123456789012345";
const GROUP_URL = `https://www.facebook.com/groups/${GROUP_ID}`;
const OBJECTIVE = "find independent retailer groups";

function tenHits(): CommunitySearchHit[] {
  return Array.from({ length: 10 }, (_, index) => {
    const identity = `retail-group-${String(index + 1).padStart(2, "0")}`;
    return hit(
      `https://www.facebook.com/groups/${identity}`,
      `Retail Group ${index + 1}`,
      "Independent retailers compare shop ideas",
    );
  });
}

function identityLookupSizes(
  db: ReturnType<typeof createCommunityDiscoveryDbFake>,
): number[] {
  return db.queries.flatMap((query) => {
    if (query.table !== "athena_public_communities") return [];
    const match = query.filters.find(
      (filter) =>
        filter.type === "in" && filter.column === "canonical_identity",
    );
    return match && match.type === "in" ? [match.values.length] : [];
  });
}

function hit(
  url: string,
  title: string,
  snippet = "Independent retailers compare shop ideas",
): CommunitySearchHit {
  return { title, url, snippet };
}

function provider(
  hits: CommunitySearchHit[] | (() => Promise<CommunitySearchHit[]>),
  queries: CommunitySearchQuery[],
): CommunitySearchProvider {
  return {
    providerId: "brave_search",
    async search(query) {
      queries.push(query);
      return typeof hits === "function" ? hits() : hits;
    },
  };
}

async function discover(input: {
  hits?: CommunitySearchHit[];
  organizationId?: string;
  objective?: unknown;
  qualify?: typeof qualifyDiscoveredCommunities;
  failWrites?: boolean;
  seed?: Record<string, unknown>;
  queries?: CommunitySearchQuery[];
}): Promise<{
  db: ReturnType<typeof createCommunityDiscoveryDbFake>;
  discovery: CommunityDiscoveryResponse;
  qualifyCalls: number;
}> {
  const db = createCommunityDiscoveryDbFake();
  if (input.seed) db.seed("athena_public_communities", input.seed);
  if (input.failWrites) db.failWrites = true;
  const queries = input.queries ?? [];
  let qualifyCalls = 0;
  const discovery = await discoverFacebookGroups({
    organizationId: input.organizationId ?? ORG_A,
    objective: input.objective === undefined ? OBJECTIVE : input.objective,
    now: NOW,
    provider: provider(input.hits ?? [], queries),
    catalog: createSupabasePublicCommunityCatalog(db),
    qualify: async (request) => {
      qualifyCalls += 1;
      if (!input.qualify) {
        return {
          status: "available",
          explanations: new Map(
            request.candidates.map((candidate) => [
              candidate.canonicalIdentity,
              "The title and snippet mention independent retailers, which matches the objective.",
            ]),
          ),
        };
      }
      return input.qualify(request);
    },
  });
  return { db, discovery, qualifyCalls };
}

describe("Facebook Group discovery", () => {
  it("returns one canonical group, persists public_url identity, and does not save it", async () => {
    const queries: CommunitySearchQuery[] = [];
    const { db, discovery, qualifyCalls } = await discover({
      queries,
      hits: [
        hit(
          `https://m.facebook.com/groups/${GROUP_ID}/about?ref=share`,
          "  Independent   Retailers \n",
          "Independent retailers compare shop ideas",
        ),
        hit(GROUP_URL, "Duplicate listing", "same group"),
        hit("https://www.facebook.com/groups/search?q=retail", "Search", "listing"),
        hit("https://www.facebook.com/retailers", "A page", "not a group"),
        hit("https://www.reddit.com/r/retail", "Reddit", "not facebook"),
        hit(
          "https://www.facebook.com/groups/shop-owners",
          "Shop Owners",
          "Independent retailers compare shop ideas",
        ),
      ],
    });

    assert.equal(queries.length, 1);
    assert.equal(queries[0].query, `site:facebook.com/groups ${OBJECTIVE}`);
    assert.equal(queries[0].limit, 10);
    assert.equal(qualifyCalls, 1);
    assert.equal(discovery.platform, "facebook_groups");
    assert.equal(discovery.searchProvider, "brave_search");
    assert.equal(discovery.qualification.status, "available");
    assert.equal(discovery.results.length, 2);
    assert.equal(discovery.results[0].canonicalIdentity, GROUP_ID);
    assert.equal(discovery.results[0].canonicalUrl, GROUP_URL);
    assert.equal(discovery.results[0].displayName, "Independent Retailers");
    assert.equal(discovery.results[0].source, "public_url");
    assert.equal(discovery.results[0].sourcedAt, NOW.toISOString());
    assert.equal(discovery.results[0].catalog, "created");
    assert.equal(discovery.results[0].evidence.title, "Independent Retailers");
    assert.equal(discovery.results[0].qualification.status, "available");
    assert.deepEqual(
      Object.keys(discovery.results[0]).sort(),
      [
        "canonicalIdentity",
        "canonicalUrl",
        "catalog",
        "displayName",
        "evidence",
        "platform",
        "qualification",
        "source",
        "sourcedAt",
      ],
    );

    const publicRows = db.rows("athena_public_communities");
    assert.equal(publicRows.length, 2);
    assert.deepEqual(Object.keys(publicRows[0]).sort(), [
      "canonical_identity",
      "canonical_url",
      "created_at",
      "display_name",
      "id",
      "platform",
      "source",
      "sourced_at",
      "suppressed_at",
      "suppression_state",
      "updated_at",
    ]);
    assert.equal(publicRows[0].source, "public_url");
    assert.equal("organization_id" in publicRows[0], false);
    assert.equal("snippet" in publicRows[0], false);
    assert.equal("notes" in publicRows[0], false);
    assert.equal(db.rows("athena_organization_communities").length, 0);
    assert.equal(db.upserts.length, 1);
    assert.equal(db.upserts[0].options.ignoreDuplicates, true);
    assert.equal(db.upserts[0].options.onConflict, "platform,canonical_identity");
  });

  it("reuses an existing catalog identity and skips a suppressed one", async () => {
    const db = createCommunityDiscoveryDbFake();
    db.seed("athena_public_communities", {
      id: "11111111-1111-4111-8111-111111111111",
      platform: "facebook_groups",
      canonical_identity: GROUP_ID,
      canonical_url: GROUP_URL,
      display_name: "Catalog Name",
      source: "public_url",
      sourced_at: "2020-01-01T00:00:00.000Z",
      suppression_state: "active",
      suppressed_at: null,
      created_at: "2020-01-01T00:00:00.000Z",
      updated_at: "2020-01-01T00:00:00.000Z",
    });
    db.seed("athena_public_communities", {
      id: "22222222-2222-4222-8222-222222222222",
      platform: "facebook_groups",
      canonical_identity: "hidden-group",
      canonical_url: "https://www.facebook.com/groups/hidden-group",
      display_name: "Hidden Group",
      source: "public_url",
      sourced_at: "2020-01-01T00:00:00.000Z",
      suppression_state: "suppressed",
      suppressed_at: "2020-02-01T00:00:00.000Z",
    });
    const hits = [
      hit(GROUP_URL, "Different Search Title"),
      hit("https://www.facebook.com/groups/hidden-group", "Hidden Group"),
    ];
    const catalog = createSupabasePublicCommunityCatalog(db);
    const run = (organizationId: string) =>
      discoverFacebookGroups({
        organizationId,
        objective: OBJECTIVE,
        now: NOW,
        provider: provider(hits, []),
        catalog,
        qualify: async (request) => ({
          status: "available",
          explanations: new Map(
            request.candidates.map((candidate) => [
              candidate.canonicalIdentity,
              "The title and snippet mention independent retailers, which matches the objective.",
            ]),
          ),
        }),
      });

    const first = await run(ORG_A);
    const second = await run(ORG_B);

    assert.equal(first.results.length, 1);
    assert.equal(first.results[0].catalog, "reused");
    assert.equal(first.results[0].displayName, "Catalog Name");
    assert.equal(first.results[0].sourcedAt, "2020-01-01T00:00:00.000Z");
    assert.equal(first.results[0].evidence.title, "Different Search Title");
    assert.equal(second.results.length, 1);
    assert.equal(second.results[0].canonicalIdentity, GROUP_ID);
    assert.equal(db.rows("athena_public_communities").length, 2);
    assert.equal(
      db.rows("athena_public_communities").find((row) => row.canonical_identity === GROUP_ID)
        ?.display_name,
      "Catalog Name",
    );
    assert.equal(db.rows("athena_organization_communities").length, 0);
    assert.equal(db.upserts.length, 0);
  });

  it("keeps discovery results when qualification fails or invents unsupported facts", async () => {
    const timeout = await discover({
      hits: [hit(GROUP_URL, "Independent Retailers")],
      qualify: (request) =>
        qualifyDiscoveredCommunities({
          ...request,
          complete: async () => {
            throw new OpenRouterBoundedCallError("timeout");
          },
        }),
    });
    const invented = await discover({
      hits: [hit(GROUP_URL, "Independent Retailers", "Shop owners compare notes")],
      qualify: (request) =>
        qualifyDiscoveredCommunities({
          ...request,
          complete: async () =>
            JSON.stringify({
              results: [
                {
                  canonicalIdentity: GROUP_ID,
                  explanation: "This group has 5000 members and is very active.",
                },
              ],
            }),
        }),
    });

    assert.equal(timeout.discovery.results.length, 1);
    assert.equal(timeout.discovery.qualification.status, "unavailable");
    if (timeout.discovery.qualification.status === "unavailable") {
      assert.equal(timeout.discovery.qualification.reason, "timeout");
    }
    assert.equal(timeout.discovery.results[0].qualification.status, "unavailable");
    assert.equal(invented.discovery.results.length, 1);
    assert.equal(invented.discovery.results[0].canonicalUrl, GROUP_URL);
    assert.equal(invented.discovery.qualification.status, "available");
    assert.equal(invented.discovery.results[0].qualification.status, "unavailable");
    if (invented.discovery.results[0].qualification.status === "unavailable") {
      assert.equal(
        invented.discovery.results[0].qualification.reason,
        "not_provided",
      );
    }
    assert.equal(
      JSON.stringify(invented.discovery).includes("5000"),
      false,
    );
  });

  it("returns a grounded suggestion from the same qualification call and omits it on failure", async () => {
    const grounded = await discover({
      hits: [hit(GROUP_URL, "Independent Retailers", "Shop owners compare notes")],
      qualify: (request) =>
        qualifyDiscoveredCommunities({
          ...request,
          complete: async () =>
            JSON.stringify({
              results: [
                {
                  canonicalIdentity: GROUP_ID,
                  explanation:
                    "The title and snippet mention independent retailers, which matches the objective.",
                  suggestedContribution:
                    "Shop owners who compare notes may want to share how they find groups.",
                },
              ],
            }),
        }),
    });
    const failed = await discover({
      hits: [hit(GROUP_URL, "Independent Retailers", "Shop owners compare notes")],
      qualify: (request) =>
        qualifyDiscoveredCommunities({
          ...request,
          complete: async () => {
            throw new OpenRouterBoundedCallError("timeout");
          },
        }),
    });

    assert.equal(grounded.qualifyCalls, 1);
    assert.equal(grounded.discovery.results[0].qualification.status, "available");
    if (grounded.discovery.results[0].qualification.status === "available") {
      assert.equal(
        grounded.discovery.results[0].qualification.suggestedContribution,
        "Shop owners who compare notes may want to share how they find groups.",
      );
    }
    assert.equal(
      JSON.stringify(grounded.db.upserts).includes("suggestedContribution"),
      false,
    );
    assert.equal(failed.discovery.results.length, 1);
    assert.equal(failed.discovery.results[0].qualification.status, "unavailable");
    assert.equal(
      "suggestedContribution" in failed.discovery.results[0].qualification,
      false,
    );
  });

  it("rejects an invalid objective or a failed provider before writing the catalog", async () => {
    const queries: CommunitySearchQuery[] = [];
    const db = createCommunityDiscoveryDbFake();
    const catalog = createSupabasePublicCommunityCatalog(db);
    const search = provider([], queries);

    await assert.rejects(
      () =>
        discoverFacebookGroups({
          organizationId: ORG_A,
          objective: "ok\nretail",
          provider: search,
          catalog,
        }),
      (error: unknown) =>
        error instanceof CommunityDiscoveryRequestError &&
        error.code === "INVALID_OBJECTIVE" &&
        error.status === 400,
    );
    await assert.rejects(
      () =>
        discoverFacebookGroups({
          organizationId: " ",
          objective: OBJECTIVE,
          provider: search,
          catalog,
        }),
      (error: unknown) =>
        error instanceof CommunityDiscoveryRequestError &&
        error.code === "INVALID_REQUEST",
    );
    await assert.rejects(
      () =>
        discoverFacebookGroups({
          organizationId: ORG_A,
          objective: OBJECTIVE,
          provider: {
            providerId: "brave_search",
            search: async () => {
              throw new CommunitySearchError("timeout");
            },
          },
          catalog,
        }),
      (error: unknown) =>
        error instanceof CommunityDiscoveryRequestError &&
        error.code === "PROVIDER_TIMEOUT" &&
        error.status === 504,
    );

    assert.equal(queries.length, 0);
    assert.equal(db.rows("athena_public_communities").length, 0);
    assert.equal(db.upserts.length, 0);
  });

  it("does not persist a URL that is not the normalized group identity", async () => {
    const db = createCommunityDiscoveryDbFake();
    const catalog = createSupabasePublicCommunityCatalog(db);
    await assert.rejects(
      () =>
        catalog.insertMissing([
          {
            platform: "facebook_groups",
            canonicalIdentity: GROUP_ID,
            canonicalUrl: "https://www.facebook.com/groups/other-group",
            displayName: "Other",
            sourcedAt: NOW.toISOString(),
          },
        ]),
      (error: unknown) =>
        error instanceof CommunityDiscoveryRequestError &&
        error.code === "PERSISTENCE_UNAVAILABLE",
    );
    assert.equal(db.rows("athena_public_communities").length, 0);
  });

  it("does not qualify or write when search returns no groups", async () => {
    let qualified = false;
    const { db, discovery } = await discover({
      hits: [hit("https://www.reddit.com/r/retail", "Reddit")],
      qualify: async () => {
        qualified = true;
        return { status: "unavailable", reason: "error" };
      },
    });

    assert.equal(qualified, false);
    assert.deepEqual(discovery.results, []);
    assert.deepEqual(discovery.qualification, {
      status: "unavailable",
      reason: "not_needed",
    });
    assert.equal(db.upserts.length, 0);
  });

  it("uses two catalog round trips for ten new groups and one when they already exist", async () => {
    const db = createCommunityDiscoveryDbFake();
    const catalog = createSupabasePublicCommunityCatalog(db);
    const hits = tenHits();
    let qualifyCalls = 0;
    const run = () =>
      discoverFacebookGroups({
        organizationId: ORG_A,
        objective: OBJECTIVE,
        now: NOW,
        provider: provider(hits, []),
        catalog,
        qualify: async (request) => {
          qualifyCalls += 1;
          assert.equal(request.candidates.length, 10);
          return {
            status: "available" as const,
            explanations: new Map(
              request.candidates.map((candidate) => [
                candidate.canonicalIdentity,
                "The title and snippet mention independent retailers, which matches the objective.",
              ]),
            ),
          };
        },
      });

    const created = await run();
    assert.equal(created.results.length, 10);
    assert.equal(
      created.results.every((result) => result.catalog === "created"),
      true,
    );
    assert.equal(qualifyCalls, 1);
    assert.deepEqual(identityLookupSizes(db), [10]);
    assert.equal(db.upserts.length, 1);
    assert.equal(Array.isArray(db.upserts[0].values), true);
    assert.equal((db.upserts[0].values as unknown[]).length, 10);
    assert.equal(db.upserts[0].options.ignoreDuplicates, true);

    const reused = await run();
    assert.equal(reused.results.length, 10);
    assert.equal(
      reused.results.every((result) => result.catalog === "reused"),
      true,
    );
    assert.equal(qualifyCalls, 2);
    assert.deepEqual(identityLookupSizes(db), [10, 10]);
    assert.equal(db.upserts.length, 1);
    assert.equal(db.rows("athena_public_communities").length, 10);
  });

  it("re-reads only identities omitted from the insert representation", async () => {
    const lookups: string[][] = [];
    let inserts = 0;
    const catalog: PublicCommunityCatalog = {
      async findByIdentities(_platform, identities) {
        lookups.push([...identities]);
        if (lookups.length === 1) return [];
        return identities.map(
          (identity, index): PublicCommunityRecord => ({
            id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
            platform: "facebook_groups",
            canonicalIdentity: identity,
            canonicalUrl: `https://www.facebook.com/groups/${identity}`,
            displayName: `Retail Group ${index + 1}`,
            source: "public_url",
            sourcedAt: NOW.toISOString(),
            suppressionState: "active",
          }),
        );
      },
      async insertMissing(rows) {
        inserts += 1;
        assert.equal(rows.length, 10);
        return [];
      },
    };

    const discovery = await discoverFacebookGroups({
      organizationId: ORG_A,
      objective: OBJECTIVE,
      now: NOW,
      provider: provider(tenHits(), []),
      catalog,
      qualify: async () => ({ status: "unavailable", reason: "unconfigured" }),
    });

    assert.equal(inserts, 1);
    assert.equal(lookups.length, 2);
    assert.equal(lookups[0].length, 10);
    assert.deepEqual(lookups[1], lookups[0]);
    assert.equal(discovery.results.length, 10);
    assert.deepEqual(discovery.qualification, {
      status: "unavailable",
      reason: "unconfigured",
    });
  });

  it("keeps ten results when qualification is unconfigured or the model call fails", async () => {
    const previousKey = process.env.OPENROUTER_API_KEY;
    const previousModel = process.env.OPENROUTER_COMMUNITY_QUALIFICATION_MODEL;
    const previousAnalysis = process.env.OPENROUTER_ANALYSIS_MODEL;
    const previousFetch = globalThis.fetch;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_COMMUNITY_QUALIFICATION_MODEL;
    const hits = tenHits();
    const search = () =>
      discoverFacebookGroups({
        organizationId: ORG_A,
        objective: OBJECTIVE,
        now: NOW,
        provider: provider(hits, []),
        catalog: createSupabasePublicCommunityCatalog(
          createCommunityDiscoveryDbFake(),
        ),
      });

    try {
      const missingKey = await search();
      assert.equal(missingKey.results.length, 10);
      assert.deepEqual(missingKey.qualification, {
        status: "unavailable",
        reason: "unconfigured",
      });
      assert.equal(
        missingKey.results.every(
          (result) =>
            result.qualification.status === "unavailable" &&
            result.qualification.reason === "unconfigured",
        ),
        true,
      );

      process.env.OPENROUTER_API_KEY = "test-openrouter-key";
      process.env.OPENROUTER_COMMUNITY_QUALIFICATION_MODEL = "claude";
      const invalidModel = await search();
      assert.equal(invalidModel.results.length, 10);
      assert.deepEqual(invalidModel.qualification, {
        status: "unavailable",
        reason: "unconfigured",
      });

      process.env.OPENROUTER_ANALYSIS_MODEL = "anthropic/claude-sonnet-4";
      process.env.OPENROUTER_COMMUNITY_QUALIFICATION_MODEL =
        "openai/gpt-4.1-nano";
      const models: string[] = [];
      globalThis.fetch = async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as { model?: string };
        models.push(body.model ?? "");
        return new Response("no", { status: 502 });
      };
      const failed = await search();
      assert.deepEqual(models, ["openai/gpt-4.1-nano"]);
      assert.equal(failed.results.length, 10);
      assert.deepEqual(failed.qualification, {
        status: "unavailable",
        reason: "error",
      });
    } finally {
      globalThis.fetch = previousFetch;
      if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = previousKey;
      if (previousModel === undefined) {
        delete process.env.OPENROUTER_COMMUNITY_QUALIFICATION_MODEL;
      } else {
        process.env.OPENROUTER_COMMUNITY_QUALIFICATION_MODEL = previousModel;
      }
      if (previousAnalysis === undefined) {
        delete process.env.OPENROUTER_ANALYSIS_MODEL;
      } else process.env.OPENROUTER_ANALYSIS_MODEL = previousAnalysis;
    }
  });

  it("lets concurrent searches each qualify once and keeps one catalog row", async () => {
    const db = createCommunityDiscoveryDbFake();
    const catalog = createSupabasePublicCommunityCatalog(db);
    const hits = tenHits();
    let searches = 0;
    let qualifyCalls = 0;
    const run = () =>
      discoverFacebookGroups({
        organizationId: ORG_A,
        objective: OBJECTIVE,
        now: NOW,
        provider: {
          providerId: "brave_search",
          async search() {
            searches += 1;
            return hits;
          },
        },
        catalog,
        qualify: async (request) => {
          qualifyCalls += 1;
          return {
            status: "available" as const,
            explanations: new Map(
              request.candidates.map((candidate) => [
                candidate.canonicalIdentity,
                "The title and snippet mention independent retailers, which matches the objective.",
              ]),
            ),
          };
        },
      });

    const [first, second] = await Promise.all([run(), run()]);
    assert.equal(searches, 2);
    assert.equal(qualifyCalls, 2);
    assert.equal(first.results.length, 10);
    assert.equal(second.results.length, 10);
    assert.equal(db.rows("athena_public_communities").length, 10);
  });
});
