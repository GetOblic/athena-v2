/**
 * COMMUNITY-INTELLIGENCE-1 Gate 3C — qualification and bounded OpenRouter.
 * Fake completion and fake fetch. No live model call.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getLLMModelRoles, resolveModelForStage } from "../../lib/llm/modelRouting";
import {
  callOpenRouterBounded,
  OPENROUTER_BOUNDED_MAX_TOKENS,
  OpenRouterBoundedCallError,
} from "../../lib/openrouter";
import {
  DEFAULT_COMMUNITY_QUALIFICATION_MODEL,
  resolveCommunityQualificationModel,
} from "../../services/communityDiscovery/communityQualificationModel";
import {
  COMMUNITY_DISCOVERY_QUALIFICATION_MAX_TOKENS,
} from "../../services/communityDiscovery/communityDiscoveryLimits";
import {
  COMMUNITY_QUALIFICATION_SYSTEM_PROMPT,
  explanationFromQualification,
  qualifyDiscoveredCommunities,
  suggestionFromQualification,
} from "../../services/communityDiscovery/communityDiscoveryQualification";

const CANDIDATE = {
  canonicalIdentity: "independent-retailers",
  canonicalUrl: "https://www.facebook.com/groups/independent-retailers",
  title: "Independent Retailers",
  snippet: "Shop owners compare notes",
};
const SIGNAL = AbortSignal.timeout(1000);

describe("community discovery qualification", () => {
  it("explains from the objective and search evidence in one bounded call", async () => {
    let calls = 0;
    const outcome = await qualifyDiscoveredCommunities({
      objective: "find independent retailer groups",
      candidates: [CANDIDATE],
      signal: SIGNAL,
      complete: async (request) => {
        calls += 1;
        assert.equal(request.maxTokens, COMMUNITY_DISCOVERY_QUALIFICATION_MAX_TOKENS);
        assert.equal(request.messages[0].content, COMMUNITY_QUALIFICATION_SYSTEM_PROMPT);
        assert.match(request.messages[1].content, /Shop owners compare notes/);
        assert.doesNotMatch(request.messages[1].content, /org-secret/);
        assert.match(COMMUNITY_QUALIFICATION_SYSTEM_PROMPT, /Do not invent group activity/);
        return JSON.stringify({
          results: [
            {
              canonicalIdentity: CANDIDATE.canonicalIdentity,
              explanation:
                "The title and snippet mention independent retailers, which matches the objective.",
            },
          ],
        });
      },
    });

    assert.equal(calls, 1);
    assert.equal(outcome.status, "available");
    if (outcome.status === "available") {
      assert.equal(
        outcome.explanations.get(CANDIDATE.canonicalIdentity),
        "The title and snippet mention independent retailers, which matches the objective.",
      );
      assert.equal(outcome.suggestions.size, 0);
    }
  });

  it("keeps one bounded call and drops a suggestion that invents facts", async () => {
    const second = {
      canonicalIdentity: "shop-owners",
      canonicalUrl: "https://www.facebook.com/groups/shop-owners",
      title: "Shop Owners",
      snippet: "Shop owners compare notes",
    };
    let calls = 0;
    const outcome = await qualifyDiscoveredCommunities({
      objective: "find independent retailer groups",
      candidates: [CANDIDATE, second],
      signal: SIGNAL,
      complete: async (request) => {
        calls += 1;
        assert.equal(request.maxTokens, COMMUNITY_DISCOVERY_QUALIFICATION_MAX_TOKENS);
        assert.equal(request.maxTokens, 800);
        assert.match(request.messages[0].content, /suggestedContribution/);
        assert.match(
          request.messages[0].content,
          /Do not invent group rules, member activity, discussion content/,
        );
        return JSON.stringify({
          results: [
            {
              canonicalIdentity: CANDIDATE.canonicalIdentity,
              explanation:
                "The title and snippet mention independent retailers, which matches the objective.",
              suggestedContribution:
                "Shop owners who compare notes may want to share how they find groups.",
            },
            {
              canonicalIdentity: second.canonicalIdentity,
              explanation:
                "The title and snippet mention shop owners, which matches the objective.",
              suggestedContribution: "We sell candles to these shop owners.",
            },
          ],
        });
      },
    });

    assert.equal(calls, 1);
    assert.equal(outcome.status, "available");
    if (outcome.status !== "available") return;
    assert.equal(
      outcome.suggestions.get(CANDIDATE.canonicalIdentity),
      "Shop owners who compare notes may want to share how they find groups.",
    );
    assert.equal(outcome.explanations.has(second.canonicalIdentity), true);
    assert.equal(outcome.suggestions.has(second.canonicalIdentity), false);
  });

  it("drops explanations that add facts missing from the evidence", () => {
    const evidence = `${CANDIDATE.title}\n${CANDIDATE.snippet}`;
    assert.equal(
      explanationFromQualification(
        "This group has 5000 members and posts daily.",
        evidence,
      ),
      null,
    );
    assert.equal(
      explanationFromQualification(
        "The snippet says Shop owners compare notes.",
        `${CANDIDATE.snippet} mentions 5000 members`,
      )?.includes("Shop owners compare notes"),
      true,
    );
    assert.equal(
      explanationFromQualification(
        "The snippet mentions 5000 members.",
        "A listing of 5000 members",
      ),
      "The snippet mentions 5000 members.",
    );
    assert.equal(
      suggestionFromQualification(
        "Members were discussing rules in a recent post.",
        evidence,
      ),
      null,
    );
    assert.equal(
      suggestionFromQualification(
        "Shop owners who compare notes may want to share how they find groups.",
        `${evidence}\nfind independent retailer groups`,
      ),
      "Shop owners who compare notes may want to share how they find groups.",
    );
  });

  it("returns qualification unavailable when the bounded model call fails", async () => {
    const outcome = await qualifyDiscoveredCommunities({
      objective: "find independent retailer groups",
      candidates: [CANDIDATE],
      signal: SIGNAL,
      complete: async () => {
        throw new OpenRouterBoundedCallError("unconfigured");
      },
    });

    assert.deepEqual(outcome, { status: "unavailable", reason: "unconfigured" });
  });
});

describe("community qualification model", { concurrency: false }, () => {
  const previous: Record<string, string | undefined> = {};

  function remember(name: string) {
    if (!(name in previous)) previous[name] = process.env[name];
  }

  function restoreEnv() {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }

  it("uses gpt-4.1-nano once and ignores the analysis model", async () => {
    remember("OPENROUTER_API_KEY");
    remember("OPENROUTER_ANALYSIS_MODEL");
    remember("OPENROUTER_COMMUNITY_QUALIFICATION_MODEL");
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    process.env.OPENROUTER_ANALYSIS_MODEL = "anthropic/claude-sonnet-4";
    delete process.env.OPENROUTER_COMMUNITY_QUALIFICATION_MODEL;

    const bodies: Array<Record<string, unknown>> = [];
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  results: [
                    {
                      canonicalIdentity: CANDIDATE.canonicalIdentity,
                      explanation:
                        "The title and snippet mention independent retailers, which matches the objective.",
                    },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      );
    };

    try {
      assert.equal(
        resolveModelForStage("community_intelligence").model,
        "anthropic/claude-sonnet-4",
      );
      assert.deepEqual(resolveCommunityQualificationModel(), {
        status: "configured",
        model: DEFAULT_COMMUNITY_QUALIFICATION_MODEL,
      });
      assert.equal(DEFAULT_COMMUNITY_QUALIFICATION_MODEL, "openai/gpt-4.1-nano");

      const outcome = await qualifyDiscoveredCommunities({
        objective: "find independent retailer groups",
        candidates: [CANDIDATE],
        signal: SIGNAL,
      });

      assert.equal(outcome.status, "available");
      assert.equal(bodies.length, 1);
      assert.equal(bodies[0].model, "openai/gpt-4.1-nano");
      assert.equal(bodies[0].max_tokens, COMMUNITY_DISCOVERY_QUALIFICATION_MAX_TOKENS);
      assert.equal(bodies[0].temperature, 0);
      assert.equal("reasoning" in bodies[0], false);
      assert.equal("models" in bodies[0], false);
      assert.notEqual(bodies[0].model, getLLMModelRoles().analysis.model);
    } finally {
      globalThis.fetch = previousFetch;
      restoreEnv();
    }
  });

  it("does not retry a failed qualification on another model", async () => {
    remember("OPENROUTER_API_KEY");
    remember("OPENROUTER_ANALYSIS_MODEL");
    remember("OPENROUTER_COMMUNITY_QUALIFICATION_MODEL");
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    process.env.OPENROUTER_ANALYSIS_MODEL = "anthropic/claude-sonnet-4";
    process.env.OPENROUTER_COMMUNITY_QUALIFICATION_MODEL = "openai/gpt-4.1-nano";

    const models: string[] = [];
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { model?: string };
      models.push(body.model ?? "");
      return new Response("no", { status: 500 });
    };

    try {
      const outcome = await qualifyDiscoveredCommunities({
        objective: "find independent retailer groups",
        candidates: [CANDIDATE],
        signal: SIGNAL,
      });
      assert.deepEqual(outcome, { status: "unavailable", reason: "error" });
      assert.deepEqual(models, ["openai/gpt-4.1-nano"]);
    } finally {
      globalThis.fetch = previousFetch;
      restoreEnv();
    }
  });

  it("reports qualification unavailable without a request when AI is not configured", async () => {
    remember("OPENROUTER_API_KEY");
    remember("OPENROUTER_COMMUNITY_QUALIFICATION_MODEL");
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_COMMUNITY_QUALIFICATION_MODEL;
    let calls = 0;
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response("no", { status: 500 });
    };

    try {
      const missingKey = await qualifyDiscoveredCommunities({
        objective: "find independent retailer groups",
        candidates: [CANDIDATE],
        signal: SIGNAL,
      });
      assert.deepEqual(missingKey, {
        status: "unavailable",
        reason: "unconfigured",
      });

      process.env.OPENROUTER_API_KEY = "test-openrouter-key";
      process.env.OPENROUTER_COMMUNITY_QUALIFICATION_MODEL = "claude";
      const invalidModel = await qualifyDiscoveredCommunities({
        objective: "find independent retailer groups",
        candidates: [CANDIDATE],
        signal: SIGNAL,
      });
      assert.deepEqual(invalidModel, {
        status: "unavailable",
        reason: "unconfigured",
      });
      assert.equal(resolveCommunityQualificationModel().status, "invalid");
      assert.equal(calls, 0);

      const controller = new AbortController();
      controller.abort();
      process.env.OPENROUTER_COMMUNITY_QUALIFICATION_MODEL = "openai/gpt-4.1-nano";
      const aborted = await qualifyDiscoveredCommunities({
        objective: "find independent retailer groups",
        candidates: [CANDIDATE],
        signal: controller.signal,
      });
      assert.deepEqual(aborted, { status: "unavailable", reason: "timeout" });
      assert.equal(calls, 0);
    } finally {
      globalThis.fetch = previousFetch;
      restoreEnv();
    }
  });
});

describe("bounded OpenRouter completion", () => {
  it("sends one analysis completion and clamps the token cap", async () => {
    const previous = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    const bodies: Array<Record<string, unknown>> = [];
    try {
      const content = await callOpenRouterBounded({
        messages: [{ role: "user", content: "Return JSON" }],
        maxTokens: 5000,
        signal: SIGNAL,
        fetchImpl: async (_input, init) => {
          bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
          return new Response(
            JSON.stringify({
              choices: [{ message: { content: "{\"results\":[]}" } }],
            }),
            { status: 200 },
          );
        },
      });

      assert.equal(content, "{\"results\":[]}");
      assert.equal(bodies.length, 1);
      assert.equal(bodies[0].max_tokens, OPENROUTER_BOUNDED_MAX_TOKENS);
      assert.equal(bodies[0].temperature, 0);
      assert.equal(bodies[0].model, getLLMModelRoles().analysis.model);
      assert.equal("reasoning" in bodies[0], false);
      assert.equal(COMMUNITY_DISCOVERY_QUALIFICATION_MAX_TOKENS <= 800, true);
      assert.equal(OPENROUTER_BOUNDED_MAX_TOKENS <= 1024, true);
    } finally {
      if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = previous;
    }
  });

  it("does not fetch when unconfigured and does not retry a failed response", async () => {
    const previous = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return new Response("no", { status: 500 });
    };
    try {
      await assert.rejects(
        () =>
          callOpenRouterBounded({
            messages: [{ role: "user", content: "hello" }],
            maxTokens: 800,
            signal: SIGNAL,
            fetchImpl,
          }),
        (error: unknown) =>
          error instanceof OpenRouterBoundedCallError &&
          error.reason === "unconfigured",
      );
      assert.equal(calls, 0);

      process.env.OPENROUTER_API_KEY = "test-openrouter-key";
      await assert.rejects(
        () =>
          callOpenRouterBounded({
            messages: [{ role: "user", content: "hello" }],
            maxTokens: 800,
            signal: SIGNAL,
            fetchImpl,
          }),
        (error: unknown) =>
          error instanceof OpenRouterBoundedCallError &&
          error.reason === "unavailable",
      );
      assert.equal(calls, 1);
    } finally {
      if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = previous;
    }
  });
});
