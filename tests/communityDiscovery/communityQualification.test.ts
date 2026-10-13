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
import { COMMUNITY_DISCOVERY_BUSINESS_CONTEXT_FALLBACK } from "../../services/communityDiscovery/communityDiscoveryBusinessContext";
import {
  classifyCommunityQualificationContent,
  COMMUNITY_QUALIFICATION_DIAGNOSTIC_CODES,
  COMMUNITY_QUALIFICATION_SYSTEM_PROMPT,
  communityAudienceEvidence,
  engagementGuidanceFromQualification,
  explanationFromQualification,
  formatCommunityQualificationDiagnostic,
  qualifyDiscoveredCommunities,
  readyToPasteMessageFromQualification,
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
        assert.match(request.messages[1].content, /Business context:/);
        assert.match(
          request.messages[1].content,
          /No business identity is available/,
        );
        assert.equal(
          request.messages[1].content.match(/Business context:/g)?.length,
          1,
        );
        assert.doesNotMatch(request.messages[1].content, /org-secret/);
        assert.match(COMMUNITY_QUALIFICATION_SYSTEM_PROMPT, /Do not invent group activity/);
        assert.match(COMMUNITY_QUALIFICATION_SYSTEM_PROMPT, /one concise sentence/);
        assert.match(COMMUNITY_QUALIFICATION_SYSTEM_PROMPT, /at most two sentences/);
        assert.doesNotMatch(COMMUNITY_QUALIFICATION_SYSTEM_PROMPT, /three short sentences/);
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
      assert.equal(outcome.engagementGuidance?.size, 0);
      assert.equal(outcome.readyToPasteUnavailable?.size, 0);
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
        assert.equal(request.maxTokens, 1600);
        assert.match(request.messages[0].content, /readyToPasteMessage/);
        assert.match(request.messages[0].content, /engagementGuidance/);
        assert.match(request.messages[0].content, /relevanceExplanation/);
        assert.match(
          request.messages[0].content,
          /Do not invent group rules, member activity, discussion content/,
        );
        assert.match(
          request.messages[0].content,
          /Do not write readyToPasteMessage as an instruction/,
        );
        return JSON.stringify({
          results: [
            {
              canonicalIdentity: CANDIDATE.canonicalIdentity,
              relevanceExplanation:
                "The title and snippet mention independent retailers, which matches the objective.",
              engagementGuidance: "Ask how shop owners compare notes.",
              readyToPasteMessage:
                "Hello, I am looking for independent retailer groups where shop owners compare notes. What has helped you find useful ones?",
            },
            {
              canonicalIdentity: second.canonicalIdentity,
              relevanceExplanation:
                "The title and snippet mention shop owners, which matches the objective.",
              readyToPasteMessage: "We sell candles to these shop owners.",
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
      "Hello, I am looking for independent retailer groups where shop owners compare notes. What has helped you find useful ones?",
    );
    assert.equal(
      outcome.engagementGuidance?.get(CANDIDATE.canonicalIdentity),
      "Ask how shop owners compare notes.",
    );
    assert.equal(
      outcome.readyToPasteUnavailable?.has(CANDIDATE.canonicalIdentity),
      false,
    );
    assert.equal(outcome.explanations.has(second.canonicalIdentity), true);
    assert.equal(outcome.suggestions.has(second.canonicalIdentity), false);
    assert.equal(
      outcome.readyToPasteUnavailable?.has(second.canonicalIdentity),
      true,
    );
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
      explanationFromQualification(
        "Active homeowners who post regularly can use the rules of thumb in the title.",
        evidence,
      ),
      "Active homeowners who post regularly can use the rules of thumb in the title.",
    );
    assert.equal(
      explanationFromQualification("This group is very active.", evidence),
      null,
    );
    assert.equal(
      explanationFromQualification("The group posts regularly.", evidence),
      null,
    );
    assert.equal(
      explanationFromQualification(
        "This group has rules against promotion.",
        evidence,
      ),
      null,
    );
    const objective = "find independent retailer groups";
    const groundedEvidence = `${objective}\n${evidence}`;
    assert.equal(
      readyToPasteMessageFromQualification(
        "Members were discussing rules in a recent post.",
        groundedEvidence,
        objective,
      ),
      null,
    );
    assert.equal(
      readyToPasteMessageFromQualification(
        "Hello, I am looking for independent retailer groups where shop owners compare notes. What has helped you find useful ones?",
        groundedEvidence,
        objective,
      ),
      "Hello, I am looking for independent retailer groups where shop owners compare notes. What has helped you find useful ones?",
    );
  });

  it("rejects imperative guidance, fabricated claims, and unsupported group assertions", () => {
    const objective = "find independent retailer groups";
    const evidence = `${objective}\n${CANDIDATE.title}\n${CANDIDATE.snippet}\n${CANDIDATE.canonicalUrl}`;
    const guidance = "Post a request for recommendations.";
    assert.equal(readyToPasteMessageFromQualification(guidance, evidence, objective), null);
    assert.equal(
      engagementGuidanceFromQualification(guidance, evidence, objective),
      guidance,
    );
    assert.equal(
      readyToPasteMessageFromQualification(
        "Shop owners who compare notes may want to share how they find groups.",
        evidence,
        objective,
      ),
      null,
    );
    assert.equal(
      readyToPasteMessageFromQualification(
        "Our company has 15 years of experience and is award-winning.",
        evidence,
        objective,
      ),
      null,
    );
    assert.equal(
      readyToPasteMessageFromQualification(
        "We sell candles to these shop owners.",
        evidence,
        objective,
      ),
      null,
    );
    assert.equal(
      readyToPasteMessageFromQualification(
        "I saw a recent post where members were discussing the group rules.",
        evidence,
        objective,
      ),
      null,
    );
    assert.equal(
      readyToPasteMessageFromQualification(
        "I joined this group and follow the community guidelines.",
        evidence,
        objective,
      ),
      null,
    );
    assert.equal(
      readyToPasteMessageFromQualification(
        "I'm a homeowner looking for a contractor for my house.",
        evidence,
        objective,
      ),
      null,
    );
    assert.equal(
      readyToPasteMessageFromQualification(
        "I'm a customer looking for independent retailer groups.",
        evidence,
        "homeowners and customers who buy wholesale",
      ),
      null,
    );

    const homeownerObjective = "I am a homeowner looking for kitchen remodel groups";
    const homeownerMessage =
      "I'm a homeowner looking for kitchen remodel ideas. What should I ask before hiring someone?";
    assert.equal(
      readyToPasteMessageFromQualification(
        homeownerMessage,
        `${homeownerObjective}\nKitchen remodelers\nHomeowners compare kitchen notes`,
        homeownerObjective,
      ),
      homeownerMessage,
    );
    assert.equal(
      readyToPasteMessageFromQualification(
        homeownerMessage,
        `${"kitchen remodel groups for homeowners"}\nKitchen remodelers\nHomeowners compare kitchen notes`,
        "kitchen remodel groups for homeowners",
      ),
      null,
    );

    const businessContext = [
      "Products and Services: kitchen remodeling",
      "Positioning: design-build remodeling",
      "Primary Audience: homeowners",
      "Value Proposition: one team for design and construction",
      "Communication Style: plain and specific",
      "Geographic Reach: Austin, Texas",
    ].join("\n");
    const groundedMessage =
      "We offer kitchen remodeling in Austin. What should homeowners ask before the work starts?";
    assert.equal(
      readyToPasteMessageFromQualification(
        groundedMessage,
        `${"reach homeowners"}\nHomeowners Kitchen Ideas\nHomeowners share remodel photos`,
        "reach homeowners who need a kitchen remodel",
        businessContext,
      ),
      groundedMessage,
    );
    assert.equal(
      readyToPasteMessageFromQualification(
        "We are licensed and insured, and we guarantee award-winning results.",
        `${"reach homeowners"}\nHomeowners Kitchen Ideas\nHomeowners share remodel photos`,
        "reach homeowners who need a kitchen remodel",
        businessContext,
      ),
      null,
    );
    assert.equal(
      readyToPasteMessageFromQualification(
        "We offer solar installation in Dallas for these homeowners.",
        `${"reach homeowners"}\nHomeowners Kitchen Ideas\nHomeowners share remodel photos`,
        "reach homeowners who need a kitchen remodel",
        businessContext,
      ),
      null,
    );
    assert.equal(
      readyToPasteMessageFromQualification(
        "Our company is family-owned and based in Dallas.",
        `${"reach homeowners"}\nHomeowners Kitchen Ideas\nHomeowners share remodel photos`,
        "reach homeowners who need a kitchen remodel",
        businessContext,
      ),
      null,
    );
  });

  it("keeps the relevance explanation when the draft is only guidance or invalid", async () => {
    const outcome = await qualifyDiscoveredCommunities({
      objective: "find independent retailer groups",
      candidates: [CANDIDATE],
      signal: SIGNAL,
      complete: async () =>
        JSON.stringify({
          results: [
            {
              canonicalIdentity: CANDIDATE.canonicalIdentity,
              relevanceExplanation:
                "The title and snippet mention independent retailers, which matches the objective.",
              engagementGuidance: "Post a request for recommendations.",
              readyToPasteMessage: "",
            },
          ],
        }),
    });

    assert.equal(outcome.status, "available");
    if (outcome.status !== "available") return;
    assert.match(
      outcome.explanations.get(CANDIDATE.canonicalIdentity) ?? "",
      /independent retailers/,
    );
    assert.equal(outcome.suggestions.has(CANDIDATE.canonicalIdentity), false);
    assert.equal(
      outcome.engagementGuidance?.get(CANDIDATE.canonicalIdentity),
      "Post a request for recommendations.",
    );
    assert.equal(
      outcome.readyToPasteUnavailable?.has(CANDIDATE.canonicalIdentity),
      true,
    );
  });

  it("keeps a valid field when the other field in the same batch is invalid", async () => {
    const byUrl = {
      canonicalIdentity: "url-only-group",
      canonicalUrl: "https://www.facebook.com/groups/url-only-group",
      title: "Homeowners Kitchen Ideas",
      snippet: "Homeowners share remodel photos",
    };
    const invented = {
      canonicalIdentity: "invented-claims",
      canonicalUrl: "https://www.facebook.com/groups/invented-claims",
      title: "Shop Owners",
      snippet: "Shop owners compare notes",
    };
    const businessContext = "Products and Services: kitchen remodeling";
    let calls = 0;
    const outcome = await qualifyDiscoveredCommunities({
      objective: "reach homeowners who need a kitchen remodel",
      businessContext,
      candidates: [CANDIDATE, byUrl, invented],
      signal: SIGNAL,
      complete: async (request) => {
        calls += 1;
        assert.equal(request.maxTokens, 1600);
        assert.match(request.messages[1].content, /kitchen remodeling/);
        assert.equal(
          request.messages[1].content.match(/Business context:/g)?.length,
          1,
        );
        assert.match(
          request.messages[1].content,
          /audienceEvidence: homeowner_or_customer/,
        );
        assert.doesNotMatch(request.messages[1].content, /audienceEvidence: contractor/);
        return JSON.stringify({
          results: [
            {
              canonicalUrl: byUrl.canonicalUrl,
              relevanceExplanation:
                "This group is very active and posts daily, so it must be relevant.",
              readyToPasteMessage:
                "We offer kitchen remodeling. What should homeowners ask before the work starts?",
            },
            {
              canonicalIdentity: CANDIDATE.canonicalIdentity,
              relevanceExplanation:
                "The title and snippet mention independent retailers, which matches the objective.",
              readyToPasteMessage:
                "We guarantee award-winning results and have 15 years of experience.",
            },
            {
              canonicalIdentity: "not-a-discovered-group",
              canonicalUrl: byUrl.canonicalUrl,
              relevanceExplanation:
                "An unknown identity must not be accepted from the URL alone.",
              readyToPasteMessage:
                "We offer kitchen remodeling. This unknown identity should stay unused.",
            },
            {
              canonicalIdentity: invented.canonicalIdentity,
              canonicalUrl: "https://www.facebook.com/groups/someone-else",
              relevanceExplanation:
                "A conflicting URL must not attach this explanation to the group.",
            },
          ],
        });
      },
    });

    assert.equal(calls, 1);
    assert.equal(outcome.status, "available");
    if (outcome.status !== "available") return;
    assert.equal(outcome.explanations.has(byUrl.canonicalIdentity), false);
    assert.match(
      outcome.suggestions.get(byUrl.canonicalIdentity) ?? "",
      /kitchen remodeling/,
    );
    assert.equal(
      outcome.explanations.get(CANDIDATE.canonicalIdentity)?.includes(
        "independent retailers",
      ),
      true,
    );
    assert.equal(outcome.suggestions.has(CANDIDATE.canonicalIdentity), false);
    assert.equal(
      outcome.readyToPasteUnavailable?.has(CANDIDATE.canonicalIdentity),
      true,
    );
    assert.equal(outcome.explanations.has(invented.canonicalIdentity), false);
    assert.equal(outcome.suggestions.has(invented.canonicalIdentity), false);
    assert.equal(outcome.explanations.has("not-a-discovered-group"), false);
  });

  it("names a contractor mismatch from the title and snippet without a score", () => {
    assert.equal(
      communityAudienceEvidence(
        "Homeowners Kitchen Ideas",
        "Homeowners share remodel photos",
      ),
      "homeowner_or_customer",
    );
    assert.equal(
      communityAudienceEvidence(
        "General Contractors Network",
        "Contractors compare bids",
      ),
      "contractor_or_professional",
    );
    assert.equal(
      communityAudienceEvidence("Shop Owners", "Shop owners compare notes"),
      null,
    );
    assert.equal(
      communityAudienceEvidence(
        "Homeowners and Contractors",
        "Homeowners hire contractors",
      ),
      "mixed",
    );
    assert.equal(COMMUNITY_DISCOVERY_BUSINESS_CONTEXT_FALLBACK.includes("score"), false);
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

  it("rejects an objective-only draft when Brain facts are available and keeps one completion", async () => {
    const objective = "find local SEO groups";
    const businessContext = [
      "Business Overview: Austin family dental practice focused on preventive care",
    ].join("\n");
    const evidence = `${objective}\n${CANDIDATE.title}\n${CANDIDATE.snippet}\n${CANDIDATE.canonicalUrl}`;
    const generic =
      "Hello, I am looking for local SEO groups where shop owners compare notes. What has helped you find useful ones?";
    const supported =
      "We are an Austin family dentistry practice focused on prevention. What should we know before talking with shop owners?";
    const genericWords =
      "Our local business services can help this group find more customers.";
    let calls = 0;
    const outcome = await qualifyDiscoveredCommunities({
      objective,
      businessContext,
      candidates: [CANDIDATE],
      signal: SIGNAL,
      complete: async (request) => {
        calls += 1;
        assert.equal(request.maxTokens, 1600);
        assert.match(
          request.messages[0].content,
          /concrete fact or positioning detail/,
        );
        assert.match(request.messages[1].content, /Austin family dental practice/);
        assert.equal(
          request.messages[1].content.match(/Business context:/g)?.length,
          1,
        );
        return JSON.stringify({
          results: [
            {
              canonicalIdentity: CANDIDATE.canonicalIdentity,
              relevanceExplanation:
                "The title and snippet mention independent retailers, which matches the objective.",
              readyToPasteMessage: generic,
            },
          ],
        });
      },
    });

    assert.equal(calls, 1);
    assert.equal(outcome.status, "available");
    if (outcome.status !== "available") return;
    assert.match(
      outcome.explanations.get(CANDIDATE.canonicalIdentity) ?? "",
      /independent retailers/,
    );
    assert.equal(outcome.suggestions.has(CANDIDATE.canonicalIdentity), false);
    assert.equal(
      outcome.readyToPasteUnavailable?.has(CANDIDATE.canonicalIdentity),
      true,
    );
    assert.equal(
      readyToPasteMessageFromQualification(generic, evidence, objective, businessContext),
      null,
    );
    assert.equal(
      readyToPasteMessageFromQualification(
        genericWords,
        evidence,
        objective,
        businessContext,
      ),
      null,
    );
    assert.equal(
      readyToPasteMessageFromQualification(
        supported,
        evidence,
        objective,
        businessContext,
      ),
      supported,
    );
    assert.equal(
      readyToPasteMessageFromQualification(
        "We offer dentistry in Austin.",
        evidence,
        objective,
        businessContext,
      ),
      "We offer dentistry in Austin.",
    );
    assert.equal(
      readyToPasteMessageFromQualification(
        "We welcome families to our Austin dentistry office.",
        evidence,
        objective,
        businessContext,
      ),
      "We welcome families to our Austin dentistry office.",
    );
    assert.equal(
      readyToPasteMessageFromQualification(
        "We are licensed and insured, and we guarantee award-winning dental results.",
        evidence,
        objective,
        businessContext,
      ),
      null,
    );
    assert.equal(
      readyToPasteMessageFromQualification(
        "We offer solar installation in Dallas for these shop owners.",
        evidence,
        objective,
        businessContext,
      ),
      null,
    );
    assert.equal(
      readyToPasteMessageFromQualification(
        generic,
        evidence,
        objective,
        COMMUNITY_DISCOVERY_BUSINESS_CONTEXT_FALLBACK,
      ),
      generic,
    );
    assert.equal(
      readyToPasteMessageFromQualification(
        genericWords,
        evidence,
        objective,
        "Business Overview: local business services",
      ),
      null,
    );
  });

  it("requires an affiliate SEO explanation to name the difference and still accepts a faithful one", () => {
    const objective = "Find local SEO and GEO groups";
    const title = "Affiliate SEO Strategies";
    const snippet = "Campaign managers trade partner offers";
    const evidence = `${objective}\n${title}\n${snippet}\nhttps://www.facebook.com/groups/affiliate-seo-strategies`;
    const source = { objective, title };
    assert.equal(
      explanationFromQualification(
        "This group is relevant because it discusses SEO, which matches the objective.",
        evidence,
        source,
      ),
      null,
    );
    const acknowledged =
      "The listing names affiliate work, a different specialty from local SEO and GEO.";
    assert.equal(
      explanationFromQualification(acknowledged, evidence, source),
      acknowledged,
    );
    assert.equal(
      explanationFromQualification(
        "The title mentions local SEO, which matches the objective.",
        "Find local SEO groups\nLocal SEO Austin\nOwners compare local rankings",
        { objective: "Find local SEO groups", title: "Local SEO Austin" },
      ),
      "The title mentions local SEO, which matches the objective.",
    );
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
              choices: [
                { message: { content: "{\"results\":[]}" }, finish_reason: "stop" },
              ],
              usage: { completion_tokens: 42 },
            }),
            { status: 200 },
          );
        },
      });

      assert.equal(content.content, "{\"results\":[]}");
      assert.equal(content.finishReason, "stop");
      assert.equal(content.completionTokens, 42);
      assert.equal(bodies.length, 1);
      assert.equal(bodies[0].max_tokens, OPENROUTER_BOUNDED_MAX_TOKENS);
      assert.equal(bodies[0].temperature, 0);
      assert.equal(bodies[0].model, getLLMModelRoles().analysis.model);
      assert.equal("reasoning" in bodies[0], false);
      assert.equal(COMMUNITY_DISCOVERY_QUALIFICATION_MAX_TOKENS <= 1600, true);
      assert.equal(OPENROUTER_BOUNDED_MAX_TOKENS <= 1600, true);
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
          error.reason === "transport",
      );
      assert.equal(calls, 1);
    } finally {
      if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = previous;
    }
  });
});

describe("qualification diagnostics", () => {
  const SECRET = "SECRET_OBJECTIVE_DO_NOT_LOG";
  const GENERATED = "SECRET_GENERATED_EXPLANATION_TEXT";
  const PASTE =
    "Hello, I am looking for independent retailer groups where shop owners compare notes. What has helped you find useful ones?";

  async function qualifyWith(
    content: string | { content: string; finishReason: string; completionTokens: number },
    lines: string[],
  ) {
    const previous = console.info;
    console.info = (...args: unknown[]) => {
      lines.push(args.map((part) => String(part)).join(" "));
    };
    try {
      return await qualifyDiscoveredCommunities({
        objective: `find independent retailer groups ${SECRET}`,
        candidates: [CANDIDATE],
        signal: SIGNAL,
        complete: async () => content,
      });
    } finally {
      console.info = previous;
    }
  }

  it("keeps a valid contribution when the explanation is rejected", async () => {
    const lines: string[] = [];
    const outcome = await qualifyWith(
      JSON.stringify({
        results: [
          {
            canonicalIdentity: CANDIDATE.canonicalIdentity,
            canonicalUrl: CANDIDATE.canonicalUrl,
            relevanceExplanation: `This group is very active and posts daily. ${GENERATED}`,
            readyToPasteMessage: PASTE,
          },
        ],
      }),
      lines,
    );

    assert.equal(outcome.status, "available");
    if (outcome.status !== "available") return;
    assert.equal(outcome.explanations.has(CANDIDATE.canonicalIdentity), false);
    assert.equal(outcome.suggestions.get(CANDIDATE.canonicalIdentity), PASTE);
    assert.match(lines.join("\n"), /explanation_rejected=1/);
    assert.doesNotMatch(lines.join("\n"), new RegExp(SECRET));
    assert.doesNotMatch(lines.join("\n"), new RegExp(GENERATED));
    assert.doesNotMatch(lines.join("\n"), /facebook\.com/);
  });

  it("logs only closed codes, finish_reason, and completion tokens", async () => {
    const lines: string[] = [];
    const outcome = await qualifyWith(
      {
        content: JSON.stringify({
          results: [
            {
              canonicalIdentity: "not-the-candidate",
              relevanceExplanation: "The title mentions retailers.",
              readyToPasteMessage: "We sell candles to these shop owners.",
            },
            {
              canonicalIdentity: CANDIDATE.canonicalIdentity,
              canonicalUrl: "https://www.facebook.com/groups/someone-else",
              relevanceExplanation:
                "The title and snippet mention independent retailers, which matches the objective.",
              readyToPasteMessage: PASTE,
            },
            {
              canonicalIdentity: CANDIDATE.canonicalIdentity,
              relevanceExplanation:
                "The title and snippet mention independent retailers, which matches the objective.",
              readyToPasteMessage: "We sell candles to these shop owners.",
            },
            {
              canonicalIdentity: CANDIDATE.canonicalIdentity,
              relevanceExplanation:
                "The title and snippet mention independent retailers, which matches the objective.",
              readyToPasteMessage: PASTE,
            },
          ],
        }),
        finishReason: "stop",
        completionTokens: 80,
      },
      lines,
    );

    assert.equal(outcome.status, "available");
    const line = lines.find((entry) => entry.startsWith("[ATHENA_COMMUNITY_QUALIFICATION]"));
    assert.ok(line);
    assert.match(line, /finish_reason=stop/);
    assert.match(line, /completion_tokens=80/);
    assert.match(line, /identity_mismatch=/);
    assert.match(line, /duplicate_identity=1/);
    assert.match(line, /contribution_rejected=1/);
    assert.doesNotMatch(line, /objective|snippet|prompt|http|SECRET|candles/i);
    for (const code of COMMUNITY_QUALIFICATION_DIAGNOSTIC_CODES) {
      assert.equal(typeof code, "string");
    }
    const safe = formatCommunityQualificationDiagnostic({
      codes: ["malformed_json", "not_a_code", SECRET],
      finishReason: "length\nSECRET",
      completionTokens: 12.8,
    });
    assert.match(safe, /malformed_json=1/);
    assert.match(safe, /finish_reason=none/);
    assert.match(safe, /completion_tokens=12/);
    assert.doesNotMatch(safe, /SECRET|not_a_code/);
  });

  it("distinguishes a truncated payload from malformed JSON", () => {
    assert.equal(
      classifyCommunityQualificationContent('{"results":[', "length"),
      "truncated_response",
    );
    assert.equal(
      classifyCommunityQualificationContent("not json at all", "stop"),
      "malformed_json",
    );
    assert.equal(
      classifyCommunityQualificationContent('{"nope":true}', "stop"),
      "schema_failure",
    );
    assert.equal(
      classifyCommunityQualificationContent('{"nope":true}', "length"),
      "truncated_response",
    );
    assert.equal(classifyCommunityQualificationContent("   ", "stop"), "empty_response");
    assert.equal(
      classifyCommunityQualificationContent('{"results":[]}', "stop"),
      null,
    );
  });
});
