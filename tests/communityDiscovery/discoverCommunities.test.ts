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
import {
  COMMUNITY_DISCOVERY_BUSINESS_CONTEXT_FALLBACK,
  formatCommunityDiscoveryBusinessContext,
  readBusinessContextWithinBudget,
  readCommunityDiscoveryBusinessContext,
  type OrganizationIdentityTable,
} from "../../services/communityDiscovery/communityDiscoveryBusinessContext";
import { qualifyDiscoveredCommunities } from "../../services/communityDiscovery/communityDiscoveryQualification";
import { specificFacebookGroupEvidenceSnippet } from "../../services/communityDiscovery/publicCommunityName";
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

const NO_IDENTITY = async () => COMMUNITY_DISCOVERY_BUSINESS_CONTEXT_FALLBACK;

async function discover(input: {
  hits?: CommunitySearchHit[];
  organizationId?: string;
  objective?: unknown;
  qualify?: typeof qualifyDiscoveredCommunities;
  readBusinessContext?: (organizationId: string) => Promise<string>;
  identityReadTimeoutMs?: number;
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
    readBusinessContext: input.readBusinessContext ?? NO_IDENTITY,
    identityReadTimeoutMs: input.identityReadTimeoutMs,
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
        readBusinessContext: NO_IDENTITY,
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
                  relevanceExplanation:
                    "The title and snippet mention independent retailers, which matches the objective.",
                  engagementGuidance: "Ask how shop owners compare notes.",
                  readyToPasteMessage:
                    "Hello, I am looking for independent retailer groups where shop owners compare notes. What has helped you find useful ones?",
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
        grounded.discovery.results[0].qualification.explanation.includes(
          "independent retailers",
        ),
        true,
      );
      assert.equal(
        grounded.discovery.results[0].qualification.engagementGuidance,
        "Ask how shop owners compare notes.",
      );
      assert.equal(
        grounded.discovery.results[0].qualification.suggestedContribution,
        "Hello, I am looking for independent retailer groups where shop owners compare notes. What has helped you find useful ones?",
      );
      assert.equal(
        "readyToPasteUnavailable" in grounded.discovery.results[0].qualification,
        false,
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
    assert.equal(
      "engagementGuidance" in failed.discovery.results[0].qualification,
      false,
    );
  });

  it("keeps the explanation when the model returns guidance instead of a message", async () => {
    const guided = await discover({
      hits: [hit(GROUP_URL, "Independent Retailers", "Shop owners compare notes")],
      qualify: (request) =>
        qualifyDiscoveredCommunities({
          ...request,
          complete: async () =>
            JSON.stringify({
              results: [
                {
                  canonicalIdentity: GROUP_ID,
                  relevanceExplanation:
                    "The title and snippet mention independent retailers, which matches the objective.",
                  engagementGuidance: "Post a request for recommendations.",
                  readyToPasteMessage: "Post a request for recommendations.",
                },
              ],
            }),
        }),
    });

    assert.equal(guided.discovery.results[0].qualification.status, "available");
    if (guided.discovery.results[0].qualification.status !== "available") return;
    assert.match(
      guided.discovery.results[0].qualification.explanation,
      /independent retailers/,
    );
    assert.equal(
      guided.discovery.results[0].qualification.engagementGuidance,
      "Post a request for recommendations.",
    );
    assert.equal(
      "suggestedContribution" in guided.discovery.results[0].qualification,
      false,
    );
    assert.equal(
      guided.discovery.results[0].qualification.readyToPasteUnavailable,
      true,
    );
  });

  it("suppresses generic Facebook directory snippets that do not describe the group", async () => {
    assert.equal(
      specificFacebookGroupEvidenceSnippet(
        "Log in to Facebook to start sharing and connecting with your friends, family and people you know.",
        "Independent Retailers",
      ),
      "",
    );
    assert.equal(
      specificFacebookGroupEvidenceSnippet(
        "See posts, photos and more on Facebook.",
        "Independent Retailers",
      ),
      "",
    );
    assert.equal(
      specificFacebookGroupEvidenceSnippet(
        "Facebook Groups | Independent Retailers | Public group · 12,345 members",
        "Independent Retailers",
      ),
      "",
    );
    assert.equal(
      specificFacebookGroupEvidenceSnippet(
        "Shop owners compare notes. See posts, photos and more on Facebook.",
        "Independent Retailers",
      ),
      "Shop owners compare notes",
    );
    assert.equal(
      specificFacebookGroupEvidenceSnippet(
        "Log in to Facebook to start sharing and connecting with your friends, family, and people you know.",
        "Independent Retailers",
      ),
      "",
    );
    assert.equal(
      specificFacebookGroupEvidenceSnippet(
        "Log in or sign up for Facebook to connect with friends, family and people you know. Shop owners compare notes on winter buying.",
        "Independent Retailers",
      ),
      "Shop owners compare notes on winter buying",
    );
    assert.equal(
      specificFacebookGroupEvidenceSnippet(
        "Homeowners share kitchen remodel photos before hiring. Public group · 12,345 members",
        "Kitchen Remodel Ideas",
      ),
      "Homeowners share kitchen remodel photos before hiring",
    );
    assert.equal(
      specificFacebookGroupEvidenceSnippet(
        "Popular groups. Find communities for you. Over 1 billion people use Facebook Groups to connect with communities of people who share their interests.",
        "Independent Retailers",
      ),
      "",
    );
    assert.equal(
      specificFacebookGroupEvidenceSnippet(
        "Shop owners compare notes on winter buying. Popular groups. Find communities for you. Over 1 billion people use Facebook to connect with communities of people who share their interests.",
        "Independent Retailers",
      ),
      "Shop owners compare notes on winter buying",
    );
    assert.equal(
      specificFacebookGroupEvidenceSnippet(
        "Homeowners share kitchen remodel photos before hiring. Popular groups Find communities for you Over 2 billion people use Facebook Groups.",
        "Kitchen Remodel Ideas",
      ),
      "Homeowners share kitchen remodel photos before hiring",
    );

    let qualifiedSnippet = "unset";
    const { discovery } = await discover({
      hits: [
        hit(
          GROUP_URL,
          "Independent Retailers",
          "Log in to Facebook to start sharing and connecting with your friends, family and people you know. Shop owners compare notes.",
        ),
      ],
      qualify: async (request) => {
        qualifiedSnippet = request.candidates[0]?.snippet ?? "";
        return {
          status: "available",
          explanations: new Map([
            [
              request.candidates[0]?.canonicalIdentity ?? "",
              "The title and snippet mention independent retailers, which matches the objective.",
            ],
          ]),
          suggestions: new Map(),
        };
      },
    });

    assert.equal(qualifiedSnippet, "Shop owners compare notes");
    assert.equal(discovery.results[0]?.evidence.snippet, "Shop owners compare notes");
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
          readBusinessContext: NO_IDENTITY,
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
          readBusinessContext: NO_IDENTITY,
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
          readBusinessContext: NO_IDENTITY,
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
        readBusinessContext: NO_IDENTITY,
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
      readBusinessContext: NO_IDENTITY,
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
        readBusinessContext: NO_IDENTITY,
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
        readBusinessContext: NO_IDENTITY,
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

  it("reads identity once per search and keeps business context out of the catalog", async () => {
    const secret = "quartz-countertop-studio";
    let reads = 0;
    let seenContext = "";
    const { db, discovery, qualifyCalls } = await discover({
      hits: tenHits(),
      readBusinessContext: async (organizationId) => {
        reads += 1;
        assert.equal(organizationId, ORG_A);
        return `Products and Services: ${secret}`;
      },
      qualify: async (request) => {
        seenContext = request.businessContext ?? "";
        assert.equal(request.candidates.length, 10);
        return {
          status: "available",
          explanations: new Map(
            request.candidates.map((candidate) => [
              candidate.canonicalIdentity,
              "The title and snippet mention independent retailers, which matches the objective.",
            ]),
          ),
          suggestions: new Map(),
        };
      },
    });

    assert.equal(reads, 1);
    assert.equal(qualifyCalls, 1);
    assert.match(seenContext, new RegExp(secret));
    assert.equal(JSON.stringify(discovery).includes(secret), false);
    assert.equal(JSON.stringify(db.upserts).includes(secret), false);
    assert.equal(
      JSON.stringify(db.rows("athena_public_communities")).includes(secret),
      false,
    );
    assert.equal(
      db.queries.some((query) => query.table === "athena_identity"),
      false,
    );

    let missedReads = 0;
    await discover({
      hits: [hit("https://www.reddit.com/r/retail", "Reddit")],
      readBusinessContext: async () => {
        missedReads += 1;
        return COMMUNITY_DISCOVERY_BUSINESS_CONTEXT_FALLBACK;
      },
    });
    assert.equal(missedReads, 1);

    let rejectedReads = 0;
    await assert.rejects(
      () =>
        discoverFacebookGroups({
          organizationId: ORG_A,
          objective: "no",
          provider: provider([], []),
          catalog: createSupabasePublicCommunityCatalog(
            createCommunityDiscoveryDbFake(),
          ),
          readBusinessContext: async () => {
            rejectedReads += 1;
            return secret;
          },
        }),
      (error: unknown) =>
        error instanceof CommunityDiscoveryRequestError &&
        error.code === "INVALID_OBJECTIVE",
    );
    assert.equal(rejectedReads, 0);
  });

  it("keeps a contractor group when the audience does not match", async () => {
    const contractorUrl = "https://www.facebook.com/groups/general-contractors";
    const { discovery } = await discover({
      objective: "reach homeowners who need a kitchen remodel",
      hits: [
        hit(
          "https://www.facebook.com/groups/homeowners-kitchen",
          "Homeowners Kitchen Ideas",
          "Homeowners share remodel photos",
        ),
        hit(contractorUrl, "General Contractors Network", "Contractors compare bids"),
      ],
      qualify: (request) =>
        qualifyDiscoveredCommunities({
          ...request,
          complete: async (prompt) => {
            assert.match(prompt.messages[1].content, /audienceEvidence: homeowner_or_customer/);
            assert.match(
              prompt.messages[1].content,
              /audienceEvidence: contractor_or_professional/,
            );
            assert.doesNotMatch(prompt.messages[1].content, /relevance score|member count/i);
            return JSON.stringify({
              results: [
                {
                  canonicalIdentity: "homeowners-kitchen",
                  relevanceExplanation:
                    "The title and snippet mention homeowners sharing remodel photos, which matches the objective.",
                },
                {
                  canonicalIdentity: "general-contractors",
                  relevanceExplanation:
                    "The title and snippet describe contractors, while the objective is homeowners. This is a professional group rather than a customer community.",
                },
              ],
            });
          },
        }),
    });

    assert.equal(discovery.results.length, 2);
    const contractor = discovery.results.find(
      (result) => result.canonicalUrl === contractorUrl,
    );
    assert.ok(contractor);
    assert.equal(contractor?.qualification.status, "available");
    if (contractor?.qualification.status !== "available") return;
    assert.match(contractor.qualification.explanation ?? "", /contractors/);
    assert.equal(JSON.stringify(contractor).includes("score"), false);
    assert.equal(JSON.stringify(discovery).includes("members"), false);
  });

  it("keeps an affiliate SEO group discoverable when the explanation ignores the specialty", async () => {
    const queries: CommunitySearchQuery[] = [];
    const affiliateUrl = "https://www.facebook.com/groups/affiliate-seo-strategies";
    const { discovery, qualifyCalls } = await discover({
      queries,
      objective: "Find local SEO and GEO groups",
      hits: [
        hit(
          affiliateUrl,
          "Affiliate SEO Strategies",
          "Campaign managers trade partner offers",
        ),
      ],
      qualify: (request) =>
        qualifyDiscoveredCommunities({
          ...request,
          complete: async () =>
            JSON.stringify({
              results: [
                {
                  canonicalIdentity: "affiliate-seo-strategies",
                  relevanceExplanation:
                    "This group is relevant because it discusses SEO, which matches the objective.",
                },
              ],
            }),
        }),
    });

    assert.equal(queries.length, 1);
    assert.equal(qualifyCalls, 1);
    assert.equal(discovery.results.length, 1);
    assert.equal(discovery.results[0]?.canonicalUrl, affiliateUrl);
    assert.equal(discovery.results[0]?.qualification.status, "unavailable");
    assert.equal(
      JSON.stringify(discovery.results[0]?.qualification).includes(
        "discusses SEO",
      ),
      false,
    );
  });

  it("uses one organization identity row and ignores another tenant", async () => {
    const calls: Array<{ columns: string; limit: number; order: string }> = [];
    const secret = "org-b-private-brain-secret";
    const profile = {
      executive_intelligence: {
        executive_summary: "Secret summary about a private client list",
        business_model: {
          business_overview: "Austin family dental practice",
          products_and_services: "Kitchen remodeling",
          positioning: "Design-build remodeling",
          primary_audience: "Homeowners",
          value_proposition: "One team for design and construction",
          communication_style: "Plain and specific",
          geographic_reach: "Austin, Texas",
          trust_signals: "Do not leak trust signal essay",
        },
        hidden_signals: [{ finding: secret, why_it_matters: secret }],
      },
      website_intelligence: { secret },
    };
    const opener = (organizationId: string): OrganizationIdentityTable => ({
      select(columns) {
        return {
          order(column) {
            return {
              limit(count) {
                calls.push({ columns, limit: count, order: column });
                const row =
                  organizationId === ORG_A
                    ? { organization_id: ORG_A, master_profile: profile }
                    : {
                        organization_id: "org-b",
                        master_profile: {
                          executive_intelligence: {
                            executive_summary: secret,
                            business_model: { products_and_services: secret },
                          },
                        },
                      };
                return Promise.resolve({
                  data: [row, { organization_id: "org-b", master_profile: { secret } }],
                  error: null,
                });
              },
            };
          },
        };
      },
    });

    const context = await readCommunityDiscoveryBusinessContext(ORG_A, opener);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.columns, "organization_id, master_profile");
    assert.equal(calls[0]?.limit, 1);
    assert.equal(calls[0]?.order, "updated_at");
    assert.match(context, /Business Overview: Austin family dental practice/);
    assert.match(context, /Products and Services: Kitchen remodeling/);
    assert.match(context, /Geographic Reach: Austin, Texas/);
    assert.match(context, /Communication Style: Plain and specific/);
    assert.doesNotMatch(context, new RegExp(secret));
    assert.doesNotMatch(context, /trust signal|Secret summary|website_intelligence/i);

    const foreign = await readCommunityDiscoveryBusinessContext("org-a", () => ({
      select() {
        return {
          order() {
            return {
              limit() {
                return Promise.resolve({
                  data: [
                    {
                      organization_id: "org-b",
                      master_profile: profile,
                    },
                  ],
                  error: null,
                });
              },
            };
          },
        };
      },
    }));
    assert.equal(foreign, COMMUNITY_DISCOVERY_BUSINESS_CONTEXT_FALLBACK);

    const missing = formatCommunityDiscoveryBusinessContext(null);
    assert.equal(missing, COMMUNITY_DISCOVERY_BUSINESS_CONTEXT_FALLBACK);
    const partial = formatCommunityDiscoveryBusinessContext({
      executive_intelligence: {
        business_model: { geographic_reach: "Austin, Texas" },
      },
    });
    assert.equal(partial, "Geographic Reach: Austin, Texas");
    const overviewOnly = formatCommunityDiscoveryBusinessContext({
      executive_intelligence: {
        business_model: {
          business_overview: "Austin family dental practice focused on preventive care",
          trust_signals: "Do not leak trust signal essay",
        },
      },
    });
    assert.equal(
      overviewOnly,
      "Business Overview: Austin family dental practice focused on preventive care",
    );
    const normalizedOverview = formatCommunityDiscoveryBusinessContext({
      executive_intelligence: {
        executive_summary: "Usable summary",
        business_model: {
          business_overview: "Austin family dental practice focused on preventive care",
          trust_signals: "Do not leak trust signal essay",
        },
      },
    });
    assert.equal(normalizedOverview, overviewOnly);
    const boundedOverview = formatCommunityDiscoveryBusinessContext({
      executive_intelligence: {
        executive_summary: "Usable summary",
        business_model: {
          business_overview: "Austin ".repeat(80),
          products_and_services: "Kitchen ".repeat(80),
          positioning: "Design ".repeat(80),
          primary_audience: "Homeowners ".repeat(40),
          value_proposition: "One team ".repeat(40),
          communication_style: "Plain ".repeat(40),
          geographic_reach: "Austin Texas ".repeat(40),
          trust_signals: "Do not leak trust signal essay",
        },
      },
    });
    assert.ok(boundedOverview.startsWith("Business Overview:"));
    assert.ok(boundedOverview.length <= 900);
    assert.doesNotMatch(boundedOverview, /trust signal/i);

    const timed = await readBusinessContextWithinBudget({
      organizationId: ORG_A,
      timeoutMs: 20,
      read: () => new Promise(() => undefined),
    });
    assert.equal(timed, COMMUNITY_DISCOVERY_BUSINESS_CONTEXT_FALLBACK);
  });
});
