/**
 * COMMUNITY-INTELLIGENCE-1 Gate 3C — Brave Search adapter.
 * Fake fetch only. No live provider call.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BRAVE_SEARCH_API_BASE_URL_ENV,
  BRAVE_SEARCH_API_KEY_ENV,
  createBraveCommunitySearchProvider,
} from "../../services/communityDiscovery/braveSearchProvider";
import { COMMUNITY_DISCOVERY_SEARCH_LIMIT } from "../../services/communityDiscovery/communityDiscoveryLimits";
import { CommunitySearchError } from "../../services/communityDiscovery/communitySearchProvider";

const SIGNAL = AbortSignal.timeout(1000);

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Brave community search adapter", () => {
  it("sends one bounded web search with the server token kept out of the URL", async () => {
    const calls: Array<{ url: URL; init: RequestInit }> = [];
    const provider = createBraveCommunitySearchProvider({
      apiKey: "server-side-token",
      baseUrl: "https://search.example.com",
      fetchImpl: async (input, init) => {
        calls.push({ url: new URL(String(input)), init: init ?? {} });
        return response({
          web: {
            results: [
              {
                title: "Independent Retailers",
                url: "https://www.facebook.com/groups/independent-retailers",
                description: "Shop owners compare notes.",
                extra_snippets: ["do not keep this"],
                profile: { name: "ignored" },
              },
              {
                title: "Missing URL",
                description: "skipped",
              },
            ],
          },
          news: { results: [{ url: "https://example.com/news" }] },
        });
      },
    });

    const hits = await provider.search({
      query: "site:facebook.com/groups independent retailers",
      limit: 50,
      signal: SIGNAL,
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url.origin, "https://search.example.com");
    assert.equal(calls[0].url.pathname, "/res/v1/web/search");
    assert.equal(
      calls[0].url.searchParams.get("q"),
      "site:facebook.com/groups independent retailers",
    );
    assert.equal(
      calls[0].url.searchParams.get("count"),
      String(COMMUNITY_DISCOVERY_SEARCH_LIMIT),
    );
    assert.equal(calls[0].url.searchParams.get("result_filter"), "web");
    assert.equal(calls[0].url.searchParams.get("offset"), "0");
    assert.equal(calls[0].url.searchParams.get("spellcheck"), "false");
    assert.equal(calls[0].url.searchParams.get("text_decorations"), "false");
    assert.equal(calls[0].url.searchParams.has("server-side-token"), false);
    assert.doesNotMatch(calls[0].url.toString(), /server-side-token/);
    const headers = new Headers(calls[0].init.headers);
    assert.equal(headers.get("X-Subscription-Token"), "server-side-token");
    assert.equal(headers.get("Accept"), "application/json");
    assert.equal(calls[0].init.method, "GET");
    assert.equal(calls[0].init.signal, SIGNAL);
    assert.deepEqual(hits, [
      {
        title: "Independent Retailers",
        url: "https://www.facebook.com/groups/independent-retailers",
        snippet: "Shop owners compare notes.",
      },
    ]);
  });

  it("reads the key and base URL from server environment names", async () => {
    let token = "";
    const provider = createBraveCommunitySearchProvider({
      env: {
        [BRAVE_SEARCH_API_KEY_ENV]: "env-token",
        [BRAVE_SEARCH_API_BASE_URL_ENV]: "https://brave.example.com/",
      },
      fetchImpl: async (_input, init) => {
        token = new Headers(init?.headers).get("X-Subscription-Token") ?? "";
        return response({ web: { results: [] } });
      },
    });

    assert.deepEqual(
      await provider.search({ query: "retail groups", limit: 10, signal: SIGNAL }),
      [],
    );
    assert.equal(token, "env-token");
    assert.equal(BRAVE_SEARCH_API_KEY_ENV, "BRAVE_SEARCH_API_KEY");
    assert.equal(BRAVE_SEARCH_API_BASE_URL_ENV, "BRAVE_SEARCH_API_BASE_URL");
  });

  it("does not call fetch when the server key or base URL is unusable", async () => {
    let called = false;
    const fetchImpl: typeof fetch = async () => {
      called = true;
      return response({});
    };
    const missingKey = createBraveCommunitySearchProvider({
      env: {},
      fetchImpl,
    });
    const httpBase = createBraveCommunitySearchProvider({
      apiKey: "token",
      baseUrl: "http://search.example.com",
      fetchImpl,
    });

    await assert.rejects(
      () => missingKey.search({ query: "retail groups", limit: 1, signal: SIGNAL }),
      (error: unknown) =>
        error instanceof CommunitySearchError && error.code === "unconfigured",
    );
    await assert.rejects(
      () => httpBase.search({ query: "retail groups", limit: 1, signal: SIGNAL }),
      (error: unknown) =>
        error instanceof CommunitySearchError && error.code === "unconfigured",
    );
    assert.equal(called, false);
  });

  it("maps abort and non-OK responses without retrying", async () => {
    let calls = 0;
    const timeoutProvider = createBraveCommunitySearchProvider({
      apiKey: "token",
      fetchImpl: async () => {
        calls += 1;
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
      },
    });
    const unavailableProvider = createBraveCommunitySearchProvider({
      apiKey: "token",
      fetchImpl: async () => {
        calls += 1;
        return response({ message: "no" }, 429);
      },
    });

    await assert.rejects(
      () =>
        timeoutProvider.search({
          query: "retail groups",
          limit: 1,
          signal: SIGNAL,
        }),
      (error: unknown) =>
        error instanceof CommunitySearchError && error.code === "timeout",
    );
    await assert.rejects(
      () =>
        unavailableProvider.search({
          query: "retail groups",
          limit: 1,
          signal: SIGNAL,
        }),
      (error: unknown) =>
        error instanceof CommunitySearchError && error.code === "unavailable",
    );
    assert.equal(calls, 2);
  });

  it("sends Brave page indexes 0, 1, and 2 with count 10", async () => {
    const offsets: string[] = [];
    const provider = createBraveCommunitySearchProvider({
      apiKey: "token",
      fetchImpl: async (input) => {
        const url = new URL(String(input));
        offsets.push(url.searchParams.get("offset") ?? "");
        assert.equal(url.searchParams.get("count"), "10");
        assert.equal(url.searchParams.get("spellcheck"), "false");
        assert.equal(url.searchParams.get("text_decorations"), "false");
        return response({ web: { results: [] } });
      },
    });

    for (const offset of [0, 1, 2, 9]) {
      await provider.search({
        query: "site:facebook.com/groups independent retailers",
        limit: 10,
        offset,
        signal: SIGNAL,
      });
    }

    assert.deepEqual(offsets, ["0", "1", "2", "2"]);
  });
});
