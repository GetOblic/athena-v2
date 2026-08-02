import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  KEYWORD_THEMES_DISCLAIMER,
  KEYWORD_THEMES_LABEL,
  type AdCampaignPackage,
} from "../../services/ads/adCampaignTypes";
import {
  AdCampaignPackageValidationError,
  isCompleteAdCampaignPackage,
  validateAdCampaignPackage,
} from "../../services/ads/adCampaignValidation";

function validPackage(
  overrides: Partial<AdCampaignPackage> = {},
): AdCampaignPackage {
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
    ...overrides,
  };
}

describe("ad campaign output contract", () => {
  it("requires all six sections with non-empty fields", () => {
    const pkg = validateAdCampaignPackage(validPackage());
    assert.equal(pkg.strategy.campaignName, "Authority Lead Campaign");
    assert.equal(pkg.keywordThemes.label, KEYWORD_THEMES_LABEL);
    assert.ok(pkg.keywordThemes.disclaimer.includes("inferred"));
    assert.equal(isCompleteAdCampaignPackage(pkg), true);
  });

  it("rejects incomplete packages before persistence", () => {
    assert.throws(
      () => validateAdCampaignPackage({ strategy: validPackage().strategy }),
      AdCampaignPackageValidationError,
    );
    assert.throws(
      () =>
        validateAdCampaignPackage(
          validPackage({
            facebook: {
              ...validPackage().facebook,
              headline: "",
            },
          }),
        ),
      AdCampaignPackageValidationError,
    );
  });

  it("enforces keyword label, disclaimer, and metric/trend prohibitions", () => {
    assert.throws(
      () =>
        validateAdCampaignPackage(
          validPackage({
            keywordThemes: {
              ...validPackage().keywordThemes,
              label: "Keywords",
            },
          }),
        ),
      AdCampaignPackageValidationError,
    );

    assert.throws(
      () =>
        validateAdCampaignPackage(
          validPackage({
            keywordThemes: {
              ...validPackage().keywordThemes,
              themes: [
                {
                  theme: "currently trending SaaS keywords",
                  intentClassification: "x",
                  audienceRelevance: "y",
                  suggestedMessageAngle: "z",
                  suggestedLandingPageDirection: "lp",
                },
                ...validPackage().keywordThemes.themes.slice(1),
              ],
            },
          }),
        ),
      /unsupported keyword|trending/i,
    );

    assert.throws(
      () =>
        validateAdCampaignPackage(
          validPackage({
            keywordThemes: {
              ...validPackage().keywordThemes,
              themes: [
                {
                  theme: "high CPC enterprise software volume 12,000",
                  intentClassification: "x",
                  audienceRelevance: "y",
                  suggestedMessageAngle: "z",
                  suggestedLandingPageDirection: "lp",
                },
                ...validPackage().keywordThemes.themes.slice(1),
              ],
            },
          }),
        ),
      AdCampaignPackageValidationError,
    );
  });

  it("requires platform packages to be structurally distinct", () => {
    const base = validPackage();
    const identical = "same copy everywhere for all platforms";
    assert.throws(
      () =>
        validateAdCampaignPackage(
          validPackage({
            facebook: {
              ...base.facebook,
              primaryText: identical,
              headline: identical,
              creativeConcept: identical,
            },
            instagram: {
              ...base.instagram,
              feedCaption: identical,
              openingHook: identical,
              creativeConcept: identical,
            },
          }),
        ),
      /structurally distinct/,
    );
  });
});
