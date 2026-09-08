import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveModelForStage } from "../../lib/llm/modelRouting";
import type { AdsOrganizationContext } from "../../services/ads/adsContextComposer";
import {
  KEYWORD_THEMES_DISCLAIMER,
  KEYWORD_THEMES_LABEL,
  type AdCampaignGenerationStage,
  type AdCampaignPackage,
} from "../../services/ads/adCampaignTypes";
import {
  AdsGenerationPipelineError,
  runAdsGenerationPipeline,
} from "../../services/ads/adsGenerationPipeline";

function validPackage(): AdCampaignPackage {
  return {
    strategy: {
      campaignName: "Authority Lead Campaign",
      objective: "Generate qualified consult bookings",
      audience: "Growth-stage founders",
      coreOfferOrMessage: "Clarity before scale",
      positioningAngle: "Operator-led diagnosis",
      primaryValueProposition: "Turn scattered demand into booked work",
      ctaDirection: "Book a strategy call",
      landingPageDirection: "Service landing with proof",
      rationale: "Brain shows recurring demand for structured diagnosis.",
      briefMode: "inferred",
    },
    facebook: {
      primaryText: "Founders stall when messaging fragments.",
      headline: "Clarity before scale",
      description: "Book a focused strategy call.",
      ctaRecommendation: "Book Now",
      audienceDirection: "Founders scaling past referrals",
      creativeConcept: "Whiteboard before/after clarity",
      imagePrompt: "Clean desk, founder reviewing a one-page plan",
    },
    instagram: {
      feedCaption: "Your offer is fine. Your signal is muddy.",
      openingHook: "Stop posting random authority.",
      reelOrStoryScript: "Hook → pain → one diagnostic CTA",
      onScreenText: "Clarity before scale",
      cta: "Link in bio → strategy call",
      hashtagDirection: null,
      creativeConcept: "Vertical talking-head with diagram overlay",
      imageOrShortVideoPrompt: "Vertical reel of founder sketching a funnel",
    },
    tiktok: {
      openingHook: "If your ads feel generic, watch this.",
      shortVideoScript: "Call out scattered messaging, show the fix.",
      sceneDirection: "Fast cuts, desk, one whiteboard beat",
      onScreenText: "Fix the offer signal",
      caption: "Clarity before scale — book the call",
      cta: "Comment CALL for the link",
      creatorOrProductionDirection: "Native creator tone, no corporate VO",
    },
    googleSearch: {
      campaignTheme: "Strategy call demand capture",
      adGroupThemes: ["Consulting diagnosis", "Offer clarity"],
      headlines: ["Book a strategy call", "Clarify your offer", "Operator-led plan"],
      descriptions: [
        "Turn scattered demand into booked consults.",
        "Practical diagnosis for scaling founders.",
      ],
      sitelinkIdeas: ["How it works", "Case proof"],
      calloutIdeas: ["Operator-led", "No fluff"],
      structuredSnippetIdeas: [
        "Services: Audit, Strategy, Coaching",
        "Types: Diagnosis, Messaging, Pipeline",
      ],
      negativeKeywordSuggestions: ["free templates", "internships"],
      landingPageDirection: "Service page with booking CTA",
    },
    keywordThemes: {
      label: KEYWORD_THEMES_LABEL,
      themes: [
        {
          theme: "offer clarity consulting",
          intentClassification: "commercial investigation",
          audienceRelevance: "Founders refining positioning",
          suggestedMessageAngle: "Clarity before scale",
          suggestedLandingPageDirection: "Consulting service page",
          negativeKeywordTheme: "free course",
        },
        {
          theme: "strategy call for founders",
          intentClassification: "transactional",
          audienceRelevance: "Ready-to-book operators",
          suggestedMessageAngle: "Book diagnosis",
          suggestedLandingPageDirection: "Booking page",
        },
        {
          theme: "business messaging audit",
          intentClassification: "problem-aware",
          audienceRelevance: "Teams with inconsistent messaging",
          suggestedMessageAngle: "Audit the signal",
          suggestedLandingPageDirection: "Audit offer page",
        },
      ],
      disclaimer: KEYWORD_THEMES_DISCLAIMER,
    },
  };
}

function mockContext(): AdsOrganizationContext {
  return {
    organizationId: "org-ads-json",
    briefMode: "inferred",
    brief: {},
    brainIdentityBlock: "",
    organizationIntelligenceBlock: "",
    prospectsBlock: "",
    personasBlock: "",
    operatorGuidanceBlock: "",
    composedPromptContext: "ORG CONTEXT",
    meta: {
      prospectCount: 0,
      personaCount: 0,
      brainAvailable: false,
      totalChars: 11,
    },
  };
}

type StageScript = string | string[] | unknown;

function adsStageFromMeta(meta?: { stage?: string }): string {
  const stage = meta?.stage ?? "";
  return stage.startsWith("ads.") ? stage.slice(4) : stage;
}

function scriptedGenerate(responses: Record<string, StageScript>) {
  const counts: Record<string, number> = {};
  const generateReview = (async (
    _prompt: string,
    meta?: { stage?: string },
  ) => {
    const stage = adsStageFromMeta(meta);
    counts[stage] = (counts[stage] ?? 0) + 1;
    const queued = responses[stage];
    if (Array.isArray(queued)) {
      return queued[Math.min(counts[stage] - 1, queued.length - 1)];
    }
    return queued;
  }) as never;

  return { counts, generateReview };
}

function defaultStageResponses(
  overrides: Record<string, StageScript> = {},
): Record<string, StageScript> {
  const pkg = validPackage();
  return {
    strategy: JSON.stringify(pkg.strategy),
    facebook: JSON.stringify(pkg.facebook),
    instagram: JSON.stringify(pkg.instagram),
    tiktok: JSON.stringify(pkg.tiktok),
    google_search: JSON.stringify(pkg.googleSearch),
    keyword_themes: JSON.stringify(pkg.keywordThemes),
    ...overrides,
  };
}

async function runPipeline(input: {
  responses?: Record<string, StageScript>;
  onStage?: (stage: AdCampaignGenerationStage) => void;
}) {
  const script = scriptedGenerate(defaultStageResponses(input.responses));
  const stages: AdCampaignGenerationStage[] = [];
  const result = await runAdsGenerationPipeline({
    organizationId: "org-ads-json",
    onStage: (stage) => {
      stages.push(stage);
      input.onStage?.(stage);
    },
    deps: {
      composeContext: async () => mockContext(),
      generateReview: script.generateReview,
    },
  });
  return { result, counts: script.counts, stages };
}

async function rejectPipeline(responses: Record<string, StageScript>) {
  const script = scriptedGenerate(defaultStageResponses(responses));
  const stages: AdCampaignGenerationStage[] = [];
  let caught: unknown;
  try {
    await runAdsGenerationPipeline({
      organizationId: "org-ads-json",
      onStage: (stage) => {
        stages.push(stage);
      },
      deps: {
        composeContext: async () => mockContext(),
        generateReview: script.generateReview,
      },
    });
  } catch (error) {
    caught = error;
  }
  return { error: caught, counts: script.counts, stages };
}

const FORBIDDEN_METADATA_KEYS = [
  "prompt",
  "composedPromptContext",
  "systemPrompt",
  "organization",
  "brain",
  "OPENROUTER_API_KEY",
  "claimToken",
  "authorization",
  "apiKey",
  "authorizationHeaders",
];

const REQUIRED_MALFORMED_KEYS = [
  "stage",
  "errorCode",
  "parseCategory",
  "contentShape",
  "contentLength",
  "startsWithFence",
  "containsFence",
  "firstNonWhitespace",
  "lastNonWhitespace",
  "braceDepthAtEnd",
  "looksTruncated",
  "routedAthenaStage",
  "routedRole",
  "routedModel",
  "reasoningProfile",
  "innerAttempt",
  "innerAttemptMax",
];

describe("Ads generation pipeline JSON hardening", () => {
  it("1. valid plain JSON objects across the pipeline complete", async () => {
    const { result, counts, stages } = await runPipeline({});
    assert.equal(result.package.strategy.campaignName, "Authority Lead Campaign");
    assert.equal(result.package.googleSearch.campaignTheme, "Strategy call demand capture");
    assert.equal(counts.strategy, 1);
    assert.equal(counts.facebook, 1);
    assert.equal(counts.instagram, 1);
    assert.equal(counts.tiktok, 1);
    assert.equal(counts.google_search, 1);
    assert.equal(counts.keyword_themes, 1);
    assert.deepEqual(stages, [
      "assembling_context",
      "strategy",
      "facebook",
      "instagram",
      "tiktok",
      "google_search",
      "keyword_themes",
      "validating",
      "completed",
    ]);
  });

  it("2. google_search valid fenced JSON with a leading newline parses", async () => {
    const fenced = `\n\`\`\`json\n${JSON.stringify(validPackage().googleSearch)}\n\`\`\`\n`;
    const { result, counts } = await runPipeline({
      responses: { google_search: fenced },
    });
    assert.equal(result.package.googleSearch.campaignTheme, "Strategy call demand capture");
    assert.equal(counts.google_search, 1);
  });

  it("3. google_search malformed syntax twice is terminal syntax_error", async () => {
    const { error, counts } = await rejectPipeline({
      google_search: ['{ "campaignTheme": }', '{ "campaignTheme": }'],
    });
    assert.ok(error instanceof AdsGenerationPipelineError);
    assert.equal(error.code, "MALFORMED_JSON");
    assert.equal(error.retryable, false);
    assert.equal(
      error.message,
      "Ads generation produced malformed JSON at stage google_search.",
    );
    assert.equal(error.metadata?.parseCategory, "syntax_error");
    assert.equal(counts.google_search, 2);
  });

  it("4. google_search top-level array twice is terminal json_array", async () => {
    const { error, counts } = await rejectPipeline({
      google_search: ["[1,2]", "[{\"campaignTheme\":\"x\"}]"],
    });
    assert.ok(error instanceof AdsGenerationPipelineError);
    assert.equal(error.code, "MALFORMED_JSON");
    assert.equal(error.retryable, false);
    assert.equal(error.metadata?.parseCategory, "json_array");
    assert.equal(counts.google_search, 2);
  });

  it("5. google_search empty/whitespace twice is empty_content", async () => {
    const { error } = await rejectPipeline({
      google_search: ["   \n\t  ", ""],
    });
    assert.ok(error instanceof AdsGenerationPipelineError);
    assert.equal(error.metadata?.parseCategory, "empty_content");
    assert.equal(error.retryable, false);
  });

  it("6. google_search truncated object twice is truncated", async () => {
    const { error } = await rejectPipeline({
      google_search: ['{"campaignTheme":"Strategy call demand capture"', '{"campaignTheme":"x"'],
    });
    assert.ok(error instanceof AdsGenerationPipelineError);
    assert.equal(error.metadata?.parseCategory, "truncated");
    assert.equal(error.metadata?.looksTruncated, true);
    assert.ok((error.metadata?.braceDepthAtEnd ?? 0) > 0);
    assert.equal(error.retryable, false);
  });

  it("7. google_search first malformed then valid completes", async () => {
    const { result, counts } = await runPipeline({
      responses: {
        google_search: [
          "{ not-json",
          JSON.stringify(validPackage().googleSearch),
        ],
      },
    });
    assert.equal(result.package.googleSearch.campaignTheme, "Strategy call demand capture");
    assert.equal(counts.google_search, 2);
  });

  it("8. google_search malformed twice makes exactly two provider calls", async () => {
    const { error, counts } = await rejectPipeline({
      google_search: ["not-json{{{", "still-not-json{{{"],
    });
    assert.ok(error instanceof AdsGenerationPipelineError);
    assert.equal(error.code, "MALFORMED_JSON");
    assert.equal(counts.google_search, 2);
    assert.equal(counts.keyword_themes, undefined);
  });

  it("9. diagnostic metadata is bounded and does not store secrets", async () => {
    const longPrefix = "X".repeat(200);
    const longSuffix = "Y".repeat(200);
    const { error } = await rejectPipeline({
      google_search: [
        `${longPrefix}{"campaignTheme":\n${longSuffix}`,
        `${longPrefix}{"campaignTheme":\n${longSuffix}`,
      ],
    });
    assert.ok(error instanceof AdsGenerationPipelineError);
    const metadata = error.metadata;
    assert.ok(metadata);
    for (const key of REQUIRED_MALFORMED_KEYS) {
      assert.ok(key in metadata, `missing ${key}`);
    }
    assert.equal(metadata.errorCode, "MALFORMED_JSON");
    assert.equal(metadata.stage, "google_search");
    assert.equal(metadata.innerAttempt, 2);
    assert.equal(metadata.innerAttemptMax, 2);
    assert.equal(metadata.routedAthenaStage, "ad_platform_assets");
    const route = resolveModelForStage("ad_platform_assets");
    assert.equal(metadata.routedRole, route.role);
    assert.equal(metadata.routedModel, route.model);
    assert.equal(metadata.reasoningProfile, "BALANCED");
    assert.ok((metadata.head?.length ?? 0) <= 80);
    assert.ok((metadata.tail?.length ?? 0) <= 80);
    if ((metadata.head?.length ?? 0) + (metadata.tail?.length ?? 0) > 0) {
      assert.ok(
        (metadata.head?.length ?? 0) + (metadata.tail?.length ?? 0) <= 160,
      );
    }
    assert.equal(typeof metadata.omittedMiddle, "boolean");
    assert.equal("finishReason" in metadata, false);
    assert.equal("prompt" in metadata, false);
    for (const key of FORBIDDEN_METADATA_KEYS) {
      assert.equal(key in metadata, false, `forbidden key ${key}`);
    }
    const serialized = JSON.stringify(metadata);
    assert.doesNotMatch(serialized, /ORG CONTEXT|OPENROUTER_API_KEY|claimToken/);
    assert.doesNotMatch(error.message, /parseCategory|braceDepth|excerpt/);
  });

  it("10. earlier successful stages are not regenerated during google_search retry", async () => {
    const { error, counts, stages } = await rejectPipeline({
      google_search: ["not-json", "still-not-json"],
    });
    assert.ok(error instanceof AdsGenerationPipelineError);
    assert.equal(counts.strategy, 1);
    assert.equal(counts.facebook, 1);
    assert.equal(counts.instagram, 1);
    assert.equal(counts.tiktok, 1);
    assert.equal(counts.google_search, 2);
    assert.equal(counts.keyword_themes, undefined);
    assert.deepEqual(
      stages.filter((stage) => stage !== "assembling_context"),
      ["strategy", "facebook", "instagram", "tiktok", "google_search"],
    );
    assert.equal(stages.filter((stage) => stage === "google_search").length, 1);
  });

  it("11. final package validation still executes and is not inner-retried", async () => {
    const { error, counts } = await rejectPipeline({
      google_search: JSON.stringify({ campaignTheme: "incomplete only" }),
    });
    assert.ok(error instanceof AdsGenerationPipelineError);
    assert.equal(error.code, "INVALID_PACKAGE");
    assert.equal(error.stage, "validating");
    assert.equal(error.retryable, true);
    assert.equal(counts.google_search, 1);
    assert.equal(counts.keyword_themes, 1);
  });

  it("12. a single JSON object surrounded by benign prose parses", async () => {
    const { result, counts } = await runPipeline({
      responses: {
        google_search: `Here is the Google Search package:\n${JSON.stringify(validPackage().googleSearch)}\nHope this helps!`,
      },
    });
    assert.equal(result.package.googleSearch.campaignTheme, "Strategy call demand capture");
    assert.equal(counts.google_search, 1);
  });

  it("13. multiple JSON objects remain a failure", async () => {
    const one = JSON.stringify(validPackage().googleSearch);
    const { error } = await rejectPipeline({
      google_search: [`${one}\n${one}`, `${one} and also ${one}`],
    });
    assert.ok(error instanceof AdsGenerationPipelineError);
    assert.equal(error.metadata?.parseCategory, "multiple_json_values");
    assert.equal(error.retryable, false);
  });

  it("14. trailing-comma repair follows the narrow approved behavior", async () => {
    const withComma = JSON.stringify(validPackage().googleSearch).replace(
      /}$/,
      ",}",
    );
    const { result, counts } = await runPipeline({
      responses: { google_search: withComma },
    });
    assert.equal(result.package.googleSearch.campaignTheme, "Strategy call demand capture");
    assert.equal(counts.google_search, 1);
  });

  it("15. smart-quote repair follows the Social Planner precedent", async () => {
    const google = validPackage().googleSearch;
    const q = "\u201C";
    const u = "\u201D";
    const smartQuoted = `{ ${q}campaignTheme${u}: ${q}${google.campaignTheme}${u}, ${q}adGroupThemes${u}: [${q}Consulting diagnosis${u}, ${q}Offer clarity${u}], ${q}headlines${u}: [${q}Book a strategy call${u}, ${q}Clarify your offer${u}, ${q}Operator-led plan${u}], ${q}descriptions${u}: [${q}Turn scattered demand into booked consults.${u}, ${q}Practical diagnosis for scaling founders.${u}], ${q}sitelinkIdeas${u}: [${q}How it works${u}, ${q}Case proof${u}], ${q}calloutIdeas${u}: [${q}Operator-led${u}, ${q}No fluff${u}], ${q}structuredSnippetIdeas${u}: [${q}Services: Audit, Strategy, Coaching${u}, ${q}Types: Diagnosis, Messaging, Pipeline${u}], ${q}negativeKeywordSuggestions${u}: [${q}free templates${u}, ${q}internships${u}], ${q}landingPageDirection${u}: ${q}${google.landingPageDirection}${u} }`;
    const { result, counts } = await runPipeline({
      responses: { google_search: smartQuoted },
    });
    assert.equal(result.package.googleSearch.campaignTheme, google.campaignTheme);
    assert.equal(counts.google_search, 1);
  });

  it("16. non-object primitives remain a failure", async () => {
    const { error } = await rejectPipeline({
      google_search: ['"just-a-string"', "42"],
    });
    assert.ok(error instanceof AdsGenerationPipelineError);
    assert.equal(error.metadata?.parseCategory, "not_object");
    assert.equal(error.retryable, false);
  });

  it("non-string provider content remains unexpected_content_shape", async () => {
    const { error, counts } = await rejectPipeline({
      google_search: [{ not: "a string" }, { still: "not a string" }],
    });
    assert.ok(error instanceof AdsGenerationPipelineError);
    assert.equal(error.metadata?.parseCategory, "unexpected_content_shape");
    assert.equal(error.retryable, false);
    assert.equal(counts.google_search, 2);
  });

  it("does not apply inner retry to LLM_CALL_FAILED", async () => {
    const script = scriptedGenerate(
      defaultStageResponses({
        google_search: JSON.stringify(validPackage().googleSearch),
      }),
    );
    const generateReview = (async (
      prompt: string,
      meta?: { stage?: string },
    ) => {
      if (adsStageFromMeta(meta) === "google_search") {
        throw new Error("OpenRouter API error: 503 unavailable");
      }
      return script.generateReview(prompt, meta);
    }) as never;

    await assert.rejects(
      () =>
        runAdsGenerationPipeline({
          organizationId: "org-ads-json",
          deps: {
            composeContext: async () => mockContext(),
            generateReview,
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof AdsGenerationPipelineError);
        assert.equal(error.code, "LLM_CALL_FAILED");
        assert.equal(error.retryable, true);
        assert.equal(error.stage, "google_search");
        return true;
      },
    );
  });
});
