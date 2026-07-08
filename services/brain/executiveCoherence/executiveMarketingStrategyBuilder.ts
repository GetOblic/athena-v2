import type { RecommendedDirectionKey } from "@/services/brain/executiveReasoningTypes";
import type { ExecutiveUnderstanding } from "@/services/brain/executiveUnderstanding/executiveUnderstandingTypes";
import type {
  BuildExecutiveStrategyParams,
  ExecutiveMarketingStrategy,
  ExecutiveStrategy,
  MarketingDeliverableRecommendation,
  MarketingRecommendationIntent,
} from "@/services/brain/executiveCoherence/executiveCoherenceTypes";

export const DELIVERABLE_IMPLEMENTATION: Record<
  MarketingDeliverableRecommendation,
  string
> = {
  "Educational Guide": "pdf_guide",
  "Decision Framework": "framework",
  "Comparison Resource": "pdf_guide",
  "Diagnostic Checklist": "checklist",
  "Authority Whitepaper": "pdf_guide",
  "Executive Webinar": "webinar",
  "Educational Video": "video_script",
  "Trust-Building Landing Page": "landing_page",
  "Multi-step Email Journey": "email_sequence",
  "Lead Magnet": "lead_magnet",
  "FAQ Resource": "faq",
  "Case Study Collection": "pdf_guide",
  "Community Campaign": "carousel",
  "Interactive Assessment": "checklist",
  "Downloadable Toolkit": "lead_magnet",
  "Educational Workshop": "webinar",
};

const SUPPORTING_DELIVERABLES: Partial<
  Record<MarketingDeliverableRecommendation, MarketingDeliverableRecommendation>
> = {
  "Educational Guide": "Community Campaign",
  "Decision Framework": "Educational Video",
  "Comparison Resource": "Diagnostic Checklist",
  "Trust-Building Landing Page": "Multi-step Email Journey",
  "Executive Webinar": "Diagnostic Checklist",
  "Lead Magnet": "Community Campaign",
  "Authority Whitepaper": "Multi-step Email Journey",
  "Educational Workshop": "Downloadable Toolkit",
  "Case Study Collection": "Trust-Building Landing Page",
};

const STAGE_PROGRESSION: Record<
  string,
  { next: string; objective: string; bucket: string }
> = {
  unaware: {
    next: "aware",
    objective: "Build problem awareness and relevance",
    bucket: "awareness",
  },
  aware: {
    next: "consideration",
    objective: "Educate on approach and available options",
    bucket: "education",
  },
  consideration: {
    next: "decision",
    objective: "Support evaluation and comparison",
    bucket: "evaluation",
  },
  decision: {
    next: "high_intent",
    objective: "Build trust and reduce decision risk",
    bucket: "trust",
  },
  high_intent: {
    next: "decision",
    objective: "Support confident purchase or commitment decision",
    bucket: "decision",
  },
};

function normalizeStage(buyerStage: string | null): string {
  const stage = (buyerStage ?? "aware").toLowerCase();
  if (stage.includes("unaware")) return "unaware";
  if (stage.includes("high_intent") || stage.includes("high intent")) {
    return "high_intent";
  }
  if (stage.includes("decision")) return "decision";
  if (stage.includes("consideration")) return "consideration";
  if (stage.includes("aware")) return "aware";
  return "aware";
}

function hashPick<T>(seed: string, options: T[]): T {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return options[hash % options.length] ?? options[0];
}

function selectPrimaryDeliverable(input: {
  direction: RecommendedDirectionKey;
  stageKey: string;
  priority: string;
  seed: string;
}): {
  deliverable: MarketingDeliverableRecommendation;
  intent: MarketingRecommendationIntent;
} {
  const progression = STAGE_PROGRESSION[input.stageKey] ?? STAGE_PROGRESSION.aware;
  const bucket = progression.bucket;

  if (input.direction === "educational") {
    if (bucket === "awareness" || input.stageKey === "unaware") {
      return { deliverable: "Educational Guide", intent: "Educate" };
    }
    if (bucket === "education") {
      return {
        deliverable: "Decision Framework",
        intent: "Support Decision Making",
      };
    }
    return { deliverable: "FAQ Resource", intent: "Educate" };
  }

  if (input.direction === "consultative") {
    if (bucket === "evaluation" || input.stageKey === "consideration") {
      return hashPick(input.seed, [
        {
          deliverable: "Comparison Resource" as const,
          intent: "Compare Options" as const,
        },
        {
          deliverable: "Diagnostic Checklist" as const,
          intent: "Support Decision Making" as const,
        },
      ]);
    }
    return {
      deliverable: "Decision Framework",
      intent: "Support Decision Making",
    };
  }

  if (input.direction === "sales_first") {
    if (
      input.priority === "immediate_action" ||
      input.priority === "high_intent"
    ) {
      return { deliverable: "Case Study Collection", intent: "Convert Prospects" };
    }
    return { deliverable: "Authority Whitepaper", intent: "Increase Authority" };
  }

  if (input.direction === "relationship_first") {
    if (bucket === "trust" || input.stageKey === "decision") {
      return {
        deliverable: "Trust-Building Landing Page",
        intent: "Build Trust",
      };
    }
    return {
      deliverable: "Multi-step Email Journey",
      intent: "Build Trust",
    };
  }

  if (input.direction === "monitor") {
    return hashPick(input.seed, [
      { deliverable: "FAQ Resource" as const, intent: "Educate" as const },
      {
        deliverable: "Community Campaign" as const,
        intent: "Strengthen Community" as const,
      },
    ]);
  }

  if (input.direction === "escalate") {
    return hashPick(input.seed, [
      {
        deliverable: "Executive Webinar" as const,
        intent: "Increase Authority" as const,
      },
      {
        deliverable: "Educational Workshop" as const,
        intent: "Support Decision Making" as const,
      },
    ]);
  }

  return { deliverable: "Lead Magnet", intent: "Generate Leads" };
}

function buildStrategicRationale(input: {
  understanding: ExecutiveUnderstanding;
  primaryIntent: MarketingRecommendationIntent;
  deliverable: MarketingDeliverableRecommendation;
  progressionObjective: string;
}): string[] {
  const rationale: string[] = [input.progressionObjective];
  const painPoint = input.understanding.marketUnderstanding.painPoints[0];

  if (painPoint) {
    rationale.push(`Addresses primary pain point: ${painPoint}`);
  }

  if (input.primaryIntent === "Educate") {
    rationale.push("Education gap identified — lead with value before conversion.");
  }
  if (input.primaryIntent === "Build Trust") {
    rationale.push("Trust building required before advancing the opportunity.");
  }
  if (input.primaryIntent === "Compare Options") {
    rationale.push("Decision support needed — comparison reduces evaluation friction.");
  }
  if (input.primaryIntent === "Increase Authority") {
    rationale.push("Authority positioning supports market differentiation.");
  }
  if (input.primaryIntent === "Convert Prospects") {
    rationale.push("High-intent signals justify conversion-focused recommendation.");
  }
  if (input.primaryIntent === "Strengthen Community") {
    rationale.push("Community engagement reinforces relationship-first strategy.");
  }

  if (input.understanding.businessUnderstanding.homepageUnderstanding?.trim()) {
    rationale.push(
      "Homepage knowledge aligns the recommendation to published positioning.",
    );
  }

  if (input.understanding.metadata.memoryEnriched) {
    rationale.push("Historical executive memory supports this recommendation.");
  } else if (input.understanding.metadata.learningEnriched) {
    rationale.push("Validated executive learning supports this recommendation.");
  } else {
    rationale.push(
      "Recommendation based on current intelligence — sufficient for strong judgment.",
    );
  }

  rationale.push(
    `Primary deliverable ${input.deliverable} best supports the business objective.`,
  );

  return rationale;
}

function buildObjectives(input: {
  intent: MarketingRecommendationIntent;
  progressionObjective: string;
  understanding: ExecutiveUnderstanding;
}): {
  educationalObjective: string;
  trustObjective: string;
  conversionObjective: string;
  marketingObjective: string;
} {
  const painPoint =
    input.understanding.marketUnderstanding.painPoints[0] ??
    "the audience's primary challenge";

  return {
    marketingObjective: input.progressionObjective,
    educationalObjective:
      input.intent === "Educate" || input.intent === "Support Decision Making"
        ? `Help the audience understand ${painPoint} and the path forward.`
        : "Provide enough education to support the recommended next step.",
    trustObjective:
      input.intent === "Build Trust" || input.intent === "Reduce Risk"
        ? "Demonstrate credibility and reduce perceived risk before asking for commitment."
        : "Maintain credible, non-salesy positioning throughout the asset.",
    conversionObjective:
      input.intent === "Convert Prospects" || input.intent === "Generate Leads"
        ? "Drive one clear next action aligned to buyer stage and executive priority."
        : "Advance the buyer one meaningful stage without premature hard selling.",
  };
}

export function buildExecutiveMarketingStrategy(input: {
  executiveStrategyBase: Omit<ExecutiveStrategy, "marketingStrategy">;
  executiveUnderstanding: ExecutiveUnderstanding;
  previousMarketingStrategy?: ExecutiveMarketingStrategy | null;
}): ExecutiveMarketingStrategy {
  const { executiveStrategyBase: base, executiveUnderstanding: understanding } =
    input;
  const stageKey = normalizeStage(understanding.marketUnderstanding.buyerStage);
  const progression = STAGE_PROGRESSION[stageKey] ?? STAGE_PROGRESSION.aware;
  const seed = [
    base.metadata.strategyFingerprint,
    stageKey,
    base.recommendedApproach,
    base.communicationPriority,
  ].join("|");

  const selection = selectPrimaryDeliverable({
    direction: base.recommendedApproach as RecommendedDirectionKey,
    stageKey,
    priority: base.communicationPriority,
    seed,
  });

  const supportingDeliverable =
    SUPPORTING_DELIVERABLES[selection.deliverable] ?? null;
  const supportingIntent = supportingDeliverable
    ? selection.intent === "Educate"
      ? "Strengthen Community"
      : "Build Trust"
    : null;

  const objectives = buildObjectives({
    intent: selection.intent,
    progressionObjective: progression.objective,
    understanding,
  });

  const strategicRationale = buildStrategicRationale({
    understanding,
    primaryIntent: selection.intent,
    deliverable: selection.deliverable,
    progressionObjective: progression.objective,
  });

  const candidate: ExecutiveMarketingStrategy = {
    businessObjective: base.primaryObjective,
    marketingObjective: objectives.marketingObjective,
    recommendedPrimaryDeliverable: selection.deliverable,
    recommendedSupportingDeliverable: supportingDeliverable,
    buyerProgressionGoal: {
      currentStage: stageKey,
      desiredNextStage: progression.next,
      transitionObjective: progression.objective,
    },
    educationalObjective: objectives.educationalObjective,
    trustObjective: objectives.trustObjective,
    conversionObjective: objectives.conversionObjective,
    executivePriority: base.communicationPriority,
    recommendationConfidence: base.confidence,
    strategicRationale,
    primaryIntent: selection.intent,
    supportingIntent,
    preferredImplementationType: DELIVERABLE_IMPLEMENTATION[selection.deliverable],
    supportingImplementationType: supportingDeliverable
      ? DELIVERABLE_IMPLEMENTATION[supportingDeliverable]
      : null,
    marketingFingerprint: [
      selection.deliverable,
      supportingDeliverable ?? "",
      selection.intent,
      stageKey,
      base.recommendedApproach,
    ].join("|"),
    refreshGuidance: {
      preserveStrategy: true,
      refreshMode: "improve_execution",
      changeJustification: null,
    },
  };

  if (!input.previousMarketingStrategy) {
    return candidate;
  }

  return applyMarketingStrategyRefresh({
    candidate,
    previous: input.previousMarketingStrategy,
    understanding,
  });
}

export function applyMarketingStrategyRefresh(input: {
  candidate: ExecutiveMarketingStrategy;
  previous: ExecutiveMarketingStrategy;
  understanding: ExecutiveUnderstanding;
}): ExecutiveMarketingStrategy {
  const { candidate, previous, understanding } = input;
  const priorityEscalated =
    previous.executivePriority !== candidate.executivePriority &&
    (candidate.executivePriority === "immediate_action" ||
      candidate.executivePriority === "high_intent");
  const materiallyStronger =
    priorityEscalated ||
    (candidate.recommendationConfidence >= previous.recommendationConfidence + 15 &&
      candidate.recommendedPrimaryDeliverable !==
        previous.recommendedPrimaryDeliverable);

  if (
    !materiallyStronger &&
    previous.marketingFingerprint === candidate.marketingFingerprint
  ) {
    return {
      ...previous,
      recommendationConfidence: Math.max(
        previous.recommendationConfidence,
        candidate.recommendationConfidence,
      ),
      refreshGuidance: {
        preserveStrategy: true,
        refreshMode: "improve_execution",
        changeJustification: null,
      },
    };
  }

  if (!materiallyStronger) {
    return {
      ...previous,
      recommendationConfidence: Math.max(
        previous.recommendationConfidence,
        candidate.recommendationConfidence,
      ),
      refreshGuidance: {
        preserveStrategy: true,
        refreshMode: "improve_execution",
        changeJustification: null,
      },
    };
  }

  return {
    ...candidate,
    refreshGuidance: {
      preserveStrategy: false,
      refreshMode: "change_direction",
      changeJustification: priorityEscalated
        ? "Executive priority escalated — stronger marketing direction recommended."
        : `Deterministic re-evaluation concluded ${candidate.recommendedPrimaryDeliverable} is materially stronger than ${previous.recommendedPrimaryDeliverable}.`,
    },
    strategicRationale: [
      ...candidate.strategicRationale,
      understanding.metadata.learningEnriched
        ? "Executive learning influenced the updated recommendation."
        : "Updated recommendation reflects changed executive signals.",
    ],
  };
}

export function buildExecutiveMarketingStrategyFromParams(
  params: BuildExecutiveStrategyParams & {
    executiveStrategyBase: Omit<ExecutiveStrategy, "marketingStrategy">;
    previousMarketingStrategy?: ExecutiveMarketingStrategy | null;
  },
): ExecutiveMarketingStrategy {
  return buildExecutiveMarketingStrategy({
    executiveStrategyBase: params.executiveStrategyBase,
    executiveUnderstanding: params.executiveUnderstanding,
    previousMarketingStrategy: params.previousMarketingStrategy,
  });
}
