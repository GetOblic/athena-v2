/**
 * Gate 47B — Brave page continuation.
 * Fake provider and catalog. No live Brave or model call.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createCommunityDiscoveryLedger } from "../../services/communityDiscovery/communityDiscoveryLedger";
import { CommunityDiscoveryRequestError } from "../../services/communityDiscovery/communityDiscoveryErrors";
import { readCommunityDiscoveryAction } from "../../services/communityDiscovery/communityDiscoveryQuery";
import { createSupabasePublicCommunityCatalog } from "../../services/communityDiscovery/communityDiscoveryPersistence";
import { discoverFacebookGroups } from "../../services/communityDiscovery/discoverCommunities";
import { COMMUNITY_DISCOVERY_BUSINESS_CONTEXT_FALLBACK } from "../../services/communityDiscovery/communityDiscoveryBusinessContext";
import { CommunitySearchError } from "../../services/communityDiscovery/communitySearchProvider";
import type {
  CommunitySearchHit,
  CommunitySearchProvider,
  CommunitySearchQuery,
} from "../../services/communityDiscovery/communitySearchProvider";
import { createCommunityDiscoveryDbFake } from "./communityDiscoveryDbFake";

const ORG_A = "org-a";
const ORG_B = "org-b";
const OBJECTIVE = "find independent retailer groups";
const NOW = new Date("2026-10-13T12:00:00.000Z");

function hit(identity: string): CommunitySearchHit {
  return {
    title: `Retail ${identity}`,
    url: `https://www.facebook.com/groups/${identity}`,
    snippet: "Independent retailers compare shop ideas",
  };
}

function page(start: number, count = 10): CommunitySearchHit[] {
  return Array.from({ length: count }, (_, index) =>
    hit(`retail-group-${String(start + index).padStart(2, "0")}`),
  );
}

function identityLookupSizes(db: ReturnType<typeof createCommunityDiscoveryDbFake>): number[] {
  return db.queries.flatMap((query) => {
    if (query.table !== "athena_public_communities") return [];
    const match = query.filters.find(
      (filter) => filter.type === "in" && filter.column === "canonical_identity",
    );
    return match && match.type === "in" ? [match.values.length] : [];
  });
}

async function run(input: {
  hits: CommunitySearchHit[] | ((query: CommunitySearchQuery) => Promise<CommunitySearchHit[]>);
  ledger: ReturnType<typeof createCommunityDiscoveryLedger>;
  organizationId?: string;
  objective?: string;
  continuationToken?: string | null;
  queries: CommunitySearchQuery[];
  qualifyCalls: { count: number };
  db?: ReturnType<typeof createCommunityDiscoveryDbFake>;
}) {
  const db = input.db ?? createCommunityDiscoveryDbFake();
  const provider: CommunitySearchProvider = {
    providerId: "brave_search",
    async search(query) {
      input.queries.push(query);
      if (typeof input.hits === "function") return input.hits(query);
      return input.hits;
    },
  };
  const discovery = await discoverFacebookGroups({
    organizationId: input.organizationId ?? ORG_A,
    objective: input.objective ?? OBJECTIVE,
    continuationToken: input.continuationToken,
    ledger: input.ledger,
    now: NOW,
    provider,
    catalog: createSupabasePublicCommunityCatalog(db),
    readBusinessContext: async () => COMMUNITY_DISCOVERY_BUSINESS_CONTEXT_FALLBACK,
    qualify: async (request) => {
      input.qualifyCalls.count += 1;
      return {
        status: "available" as const,
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
  return { db, discovery };
}

describe("community discovery continuation", () => {
  it("requests Brave offsets 0, 1, and 2 and blocks a fourth call", async () => {
    const ledger = createCommunityDiscoveryLedger();
    const queries: CommunitySearchQuery[] = [];
    const qualifyCalls = { count: 0 };
    let token: string | null = null;
    const db = createCommunityDiscoveryDbFake();

    for (let pageIndex = 0; pageIndex < 3; pageIndex += 1) {
      const sent = token;
      const { discovery } = await run({
        hits: page(pageIndex * 10 + 1),
        ledger,
        continuationToken: token,
        queries,
        qualifyCalls,
        db,
      });
      assert.equal(queries[pageIndex]?.offset, pageIndex);
      assert.equal(queries[pageIndex]?.query, `site:facebook.com/groups ${OBJECTIVE}`);
      assert.equal(discovery.results.length, 10);
      assert.equal(qualifyCalls.count, pageIndex + 1);
      if (pageIndex < 2) {
        assert.equal(discovery.continuation.moreAvailable, true);
        assert.equal(discovery.continuation.exhausted, false);
        assert.ok(discovery.continuation.token);
        token = discovery.continuation.token;
      } else {
        assert.equal(discovery.continuation.moreAvailable, false);
        assert.equal(discovery.continuation.exhausted, true);
        token = sent;
      }
    }

    const before = queries.length;
    const fourth = await run({
      hits: page(100),
      ledger,
      continuationToken: token,
      queries,
      qualifyCalls,
      db,
    });
    assert.equal(queries.length, before);
    assert.equal(fourth.discovery.continuation.exhausted, true);
    assert.equal(fourth.discovery.results.length, 0);
    assert.equal(qualifyCalls.count, 3);
  });

  it("skips qualification when a continuation page is only duplicates", async () => {
    const ledger = createCommunityDiscoveryLedger();
    const queries: CommunitySearchQuery[] = [];
    const qualifyCalls = { count: 0 };
    const db = createCommunityDiscoveryDbFake();
    const firstHits = page(1, 10);
    const first = await run({
      hits: firstHits,
      ledger,
      queries,
      qualifyCalls,
      db,
    });
    assert.equal(qualifyCalls.count, 1);
    assert.deepEqual(identityLookupSizes(db), [10]);
    assert.ok(first.discovery.continuation.token);

    const second = await run({
      hits: firstHits.slice(0, 2),
      ledger,
      continuationToken: first.discovery.continuation.token,
      queries,
      qualifyCalls,
      db,
    });
    assert.equal(queries.map((query) => query.offset).join(","), "0,1");
    assert.equal(qualifyCalls.count, 1);
    assert.deepEqual(identityLookupSizes(db), [10]);
    assert.equal(second.discovery.results.length, 0);
    assert.equal(second.discovery.continuation.exhausted, true);
  });

  it("does not repeat offset 0 on a refresh without a continuation token", async () => {
    const ledger = createCommunityDiscoveryLedger();
    const queries: CommunitySearchQuery[] = [];
    const qualifyCalls = { count: 0 };
    const first = await run({
      hits: page(1, 2),
      ledger,
      queries,
      qualifyCalls,
    });
    assert.equal(first.discovery.recovery, null);
    assert.ok(first.discovery.continuation.sessionToken);

    const refresh = await run({
      hits: page(50),
      ledger,
      queries,
      qualifyCalls,
    });
    assert.equal(queries.length, 1);
    assert.equal(queries[0]?.offset, 0);
    assert.equal(refresh.discovery.recovery, "active");
    assert.equal(refresh.discovery.results.length, 0);
    assert.equal(qualifyCalls.count, 1);

    const restored = ledger.restore({
      organizationId: ORG_A,
      sessionToken: first.discovery.continuation.sessionToken ?? "",
    });
    assert.equal(restored, "active");
    assert.equal(
      ledger.restore({ organizationId: ORG_B, sessionToken: first.discovery.continuation.sessionToken ?? "" }),
      "lost",
    );
  });

  it("stops two concurrent continuations from consuming the same page", async () => {
    const ledger = createCommunityDiscoveryLedger();
    const queries: CommunitySearchQuery[] = [];
    const qualifyCalls = { count: 0 };
    const first = await run({
      hits: page(1),
      ledger,
      queries,
      qualifyCalls,
    });
    const token = first.discovery.continuation.token;
    assert.ok(token);

    let releaseSearch: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseSearch = resolve;
    });
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const calls: number[] = [];
    const db = createCommunityDiscoveryDbFake();
    const provider: CommunitySearchProvider = {
      providerId: "brave_search",
      async search(query) {
        calls.push(query.offset ?? -1);
        started();
        await gate;
        return page(20);
      },
    };
    const shared = {
      organizationId: ORG_A,
      objective: OBJECTIVE,
      continuationToken: token,
      ledger,
      now: NOW,
      provider,
      catalog: createSupabasePublicCommunityCatalog(db),
      readBusinessContext: async () => COMMUNITY_DISCOVERY_BUSINESS_CONTEXT_FALLBACK,
      qualify: async () => {
        qualifyCalls.count += 1;
        return {
          status: "available" as const,
          explanations: new Map<string, string>(),
          suggestions: new Map<string, string>(),
        };
      },
    };
    const pending = discoverFacebookGroups(shared);
    await ready;
    await assert.rejects(
      () => discoverFacebookGroups(shared),
      (error: unknown) =>
        error instanceof CommunityDiscoveryRequestError &&
        error.code === "CONTINUATION_IN_FLIGHT",
    );
    releaseSearch();
    const completed = await pending;
    assert.deepEqual(calls, [1]);
    assert.equal(completed.results.length, 10);
    assert.equal(qualifyCalls.count, 2);
  });

  it("keeps the same offset after a failed continuation and does not replace prior results", async () => {
    const ledger = createCommunityDiscoveryLedger();
    const queries: CommunitySearchQuery[] = [];
    const qualifyCalls = { count: 0 };
    const db = createCommunityDiscoveryDbFake();
    const first = await run({
      hits: page(1, 10),
      ledger,
      queries,
      qualifyCalls,
      db,
    });
    const prior = first.discovery.results.map((result) => result.canonicalIdentity);
    let attempts = 0;
    await assert.rejects(
      () =>
        run({
          hits: async () => {
            attempts += 1;
            throw new CommunitySearchError("unavailable");
          },
          ledger,
          continuationToken: first.discovery.continuation.token,
          queries,
          qualifyCalls,
          db,
        }),
      (error: unknown) =>
        error instanceof CommunityDiscoveryRequestError &&
        error.code === "PROVIDER_UNAVAILABLE",
    );
    const retried = await run({
      hits: page(30, 10),
      ledger,
      continuationToken: first.discovery.continuation.token,
      queries,
      qualifyCalls,
      db,
    });
    assert.equal(attempts, 1);
    assert.deepEqual(
      queries.map((query) => query.offset),
      [0, 1, 1],
    );
    assert.equal(qualifyCalls.count, 2);
    assert.deepEqual(identityLookupSizes(db), [10, 10]);
    assert.notDeepEqual(
      retried.discovery.results.map((result) => result.canonicalIdentity),
      prior,
    );
    assert.equal(
      prior.every(
        (identity) =>
          !retried.discovery.results.some((result) => result.canonicalIdentity === identity),
      ),
      true,
    );
  });

  it("expires the ledger, bounds its memory, and does not store the objective", async () => {
    let now = 1_000;
    const ledger = createCommunityDiscoveryLedger({
      ttlMs: 50,
      maxEntries: 2,
      now: () => now,
    });
    const queries: CommunitySearchQuery[] = [];
    const qualifyCalls = { count: 0 };
    await run({
      hits: [hit("first-group")],
      ledger,
      queries,
      qualifyCalls,
    });
    assert.equal(JSON.stringify(ledger.debug()).includes(OBJECTIVE), false);
    assert.equal(JSON.stringify(ledger.debug()).includes("snippet"), false);

    now += 51;
    await run({
      hits: [hit("after-expiry")],
      ledger,
      queries,
      qualifyCalls,
    });
    assert.deepEqual(
      queries.map((query) => query.offset),
      [0, 0],
    );

    const crowded = createCommunityDiscoveryLedger({ maxEntries: 2, now: () => 5_000 });
    for (const organizationId of ["org-1", "org-2", "org-3"]) {
      await run({
        hits: [hit(organizationId)],
        ledger: crowded,
        organizationId,
        queries: [],
        qualifyCalls: { count: 0 },
      });
    }
    assert.ok(crowded.size() <= 2);

    const foreignQueries: CommunitySearchQuery[] = [];
    const foreign = createCommunityDiscoveryLedger();
    const owned = await run({
      hits: page(1),
      ledger: foreign,
      queries: foreignQueries,
      qualifyCalls: { count: 0 },
    });
    await assert.rejects(
      () =>
        run({
          hits: page(40),
          ledger: foreign,
          organizationId: ORG_B,
          continuationToken: owned.discovery.continuation.token,
          queries: foreignQueries,
          qualifyCalls: { count: 0 },
        }),
      (error: unknown) =>
        error instanceof CommunityDiscoveryRequestError &&
        error.code === "INVALID_CONTINUATION",
    );
    assert.equal(foreignQueries.length, 1);
    assert.equal(foreignQueries[0]?.offset, 0);
  });

  it("ignores a client offset and restores without choosing a Brave page", () => {
    const action = readCommunityDiscoveryAction({
      objective: OBJECTIVE,
      continuationToken: "server-token",
      offset: 2,
    });
    assert.deepEqual(action, {
      kind: "discover",
      objective: OBJECTIVE,
      continuationToken: "server-token",
    });
    assert.equal("offset" in action, false);
    assert.deepEqual(readCommunityDiscoveryAction({ restore: true, sessionToken: "abc" }), {
      kind: "restore",
      sessionToken: "abc",
    });
    const source = readFileSync(
      join(process.cwd(), "services/communityDiscovery/communityDiscoveryLedger.ts"),
      "utf8",
    );
    assert.match(source, /not distributed/i);
    assert.doesNotMatch(source, /snippet|master_profile|businessContext/);
  });
});
