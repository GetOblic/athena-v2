import type {
  MarketingDeliverableRecommendation,
  MarketingRecommendationIntent,
} from "@/services/brain/executiveCoherence/executiveCoherenceTypes";

export type MarketingRecommendationContract = {
  intent: MarketingRecommendationIntent;
  purpose: string;
  whenToUse: string[];
  complements: MarketingDeliverableRecommendation[];
};

export const MARKETING_RECOMMENDATION_CONTRACTS: Record<
  MarketingRecommendationIntent,
  MarketingRecommendationContract
> = {
  Educate: {
    intent: "Educate",
    purpose: "Close knowledge gaps and move the buyer one step forward.",
    whenToUse: [
      "Buyer is early-stage or unaware of options",
      "Discussion reveals confusion or incomplete understanding",
      "Executive approach is educational",
    ],
    complements: ["Educational Guide", "FAQ Resource", "Educational Video"],
  },
  "Build Trust": {
    intent: "Build Trust",
    purpose: "Establish credibility before asking for commitment.",
    whenToUse: [
      "Sparse relationship history",
      "Buyer needs proof before advancing",
      "Relationship-first strategy is active",
    ],
    complements: [
      "Trust-Building Landing Page",
      "Case Study Collection",
      "Authority Whitepaper",
    ],
  },
  "Compare Options": {
    intent: "Compare Options",
    purpose: "Help the buyer evaluate alternatives with clarity.",
    whenToUse: [
      "Buyer is in consideration or evaluation",
      "Competitors or alternatives are present",
      "Consultative strategy requires decision support",
    ],
    complements: ["Comparison Resource", "Decision Framework", "Diagnostic Checklist"],
  },
  "Reduce Risk": {
    intent: "Reduce Risk",
    purpose: "Address objections and lower perceived downside.",
    whenToUse: [
      "Risk signals are elevated",
      "Buyer hesitates due to uncertainty",
      "High-stakes or complex decisions",
    ],
    complements: ["Diagnostic Checklist", "FAQ Resource", "Interactive Assessment"],
  },
  "Increase Authority": {
    intent: "Increase Authority",
    purpose: "Position the business as the definitive expert.",
    whenToUse: [
      "Market differentiation is required",
      "Buyer needs proof of expertise",
      "Authority positioning supports the opportunity",
    ],
    complements: ["Authority Whitepaper", "Executive Webinar", "Educational Workshop"],
  },
  "Generate Leads": {
    intent: "Generate Leads",
    purpose: "Capture permission to continue the conversation.",
    whenToUse: [
      "Audience is interested but not ready to buy",
      "Lead magnet fits the pain point",
      "Nurture is preferable to direct conversion",
    ],
    complements: ["Lead Magnet", "Downloadable Toolkit", "Interactive Assessment"],
  },
  "Convert Prospects": {
    intent: "Convert Prospects",
    purpose: "Move qualified prospects to a defined next action.",
    whenToUse: [
      "Buyer shows high intent",
      "Priority is immediate or high intent",
      "Sales-first strategy is justified",
    ],
    complements: ["Trust-Building Landing Page", "Case Study Collection", "Executive Webinar"],
  },
  "Retain Customers": {
    intent: "Retain Customers",
    purpose: "Deepen value and reduce churn through ongoing education.",
    whenToUse: [
      "Existing customer signals in discussion",
      "Post-purchase support or expansion opportunity",
    ],
    complements: ["Educational Workshop", "Downloadable Toolkit", "Multi-step Email Journey"],
  },
  "Strengthen Community": {
    intent: "Strengthen Community",
    purpose: "Engage the community with value-led participation.",
    whenToUse: [
      "Community channel is primary",
      "Monitor or relationship-first strategy",
      "Public discussion is the conversion path",
    ],
    complements: ["Community Campaign", "Educational Video", "FAQ Resource"],
  },
  "Support Decision Making": {
    intent: "Support Decision Making",
    purpose: "Provide frameworks that enable a confident decision.",
    whenToUse: [
      "Buyer is evaluating options",
      "Consultative or sales-first approach",
      "Decision stage or high intent",
    ],
    complements: ["Decision Framework", "Comparison Resource", "Diagnostic Checklist"],
  },
};

export function getMarketingRecommendationContract(
  intent: MarketingRecommendationIntent,
): MarketingRecommendationContract {
  return MARKETING_RECOMMENDATION_CONTRACTS[intent];
}

export function formatMarketingRecommendationForPrompt(input: {
  primaryIntent: MarketingRecommendationIntent;
  supportingIntent: MarketingRecommendationIntent | null;
  primaryDeliverable: MarketingDeliverableRecommendation;
  supportingDeliverable: MarketingDeliverableRecommendation | null;
}): string {
  const primary = getMarketingRecommendationContract(input.primaryIntent);
  const supporting = input.supportingIntent
    ? getMarketingRecommendationContract(input.supportingIntent)
    : null;

  const sections = [
    "EXECUTIVE MARKETING RECOMMENDATION:",
    "",
    "This defines WHAT should happen next from a marketing perspective.",
    "Do not independently choose a different marketing direction.",
    "",
    `- Primary deliverable: ${input.primaryDeliverable}`,
    `- Primary intent: ${primary.intent} — ${primary.purpose}`,
    input.supportingDeliverable && supporting
      ? `- Supporting deliverable: ${input.supportingDeliverable}`
      : "- Supporting deliverable: none",
    input.supportingDeliverable && supporting
      ? `- Supporting intent: ${supporting.intent} — ${supporting.purpose}`
      : "",
    "",
    "INSTRUCTIONS:",
    "Blueprint and generation outputs must execute this marketing recommendation.",
    "Improve execution quality without changing strategic direction unless refresh guidance says otherwise.",
  ];

  return sections.filter(Boolean).join("\n").trim();
}

export function listMarketingRecommendationIntents(): MarketingRecommendationIntent[] {
  return Object.keys(MARKETING_RECOMMENDATION_CONTRACTS) as MarketingRecommendationIntent[];
}
