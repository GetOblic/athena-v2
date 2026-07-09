import type { RecommendedDirectionKey } from "@/services/brain/executiveReasoningTypes";
import type { ExecutiveStrategy } from "@/services/brain/executiveCoherence/executiveCoherenceTypes";
import type { MarketingDeliverableRecommendation } from "@/services/brain/executiveCoherence/executiveCoherenceTypes";
import type { ExecutiveUnderstanding } from "@/services/brain/executiveUnderstanding/executiveUnderstandingTypes";
import { ensureExecutiveRecommendation } from "@/services/brain/executiveCoherence/executiveRecommendationContracts";

export const STRATEGIC_BLUEPRINT_SPECS_VERSION = "strategic_blueprint_specs_v5_quality_gate";

export type AssetSophisticationLevel =
  | "beginner"
  | "intermediate"
  | "advanced"
  | "executive";

export type BlueprintProductionSpecification = {
  outputFormat: string;
  pageOrSlideCount: string;
  visualDirection: string;
  editorialDirection: string;
  contentDepth: string;
  brandTone: string;
  ctaObjective: string;
  distributionChannel: string;
  reuseStrategy: string;
};

export type BlueprintGenerationInstructions = {
  recommendedAssetTypes: string[];
  assetTypeGuidance: string;
  layoutExpectations: string;
  sectionHierarchy: string;
  designDirection: string;
  visualStyle: string;
  diagrams: string;
  comparisonTables: string;
  calloutBoxes: string;
  icons: string;
  coverPage: string;
  slideBreakdown: string;
  sceneBreakdown: string;
  webinarFlow: string;
  landingPageSections: string;
  emailSequenceStructure: string;
};

export type ExecutiveBlueprintSpecification = {
  strategicObjective: string;
  businessProblemSolved: string;
  assetSelectionReason: string;
  targetPsychologicalOutcome: string;
  primaryCta: string;
  contentArchitecture: string;
  repurposingOpportunities: string;
  businessKpi: string;
  estimatedProductionEffort: string;
  expectedLifespan: string;
  estimatedRoiCategory: "low" | "medium" | "high";
};

export type StrategyFirstBlueprintSpecification = {
  executiveInitiative: string;
  initiativeCategory: string;
  highestProbabilityAction: string;
  businessObjective: string;
  marketProblem: string;
  strategicHypothesis: string;
  competitiveAdvantage: string;
  customerTransformation: string;
  evidenceSupportingDecision: string[];
  successMetrics: {
    primaryKpi: string;
    secondaryKpis: string[];
  };
  risks: string[];
  expectedRoi: string;
  implementationRoadmap: string[];
};

export type StrategicBlueprintProductionContext = {
  version: string;
  strategyFirst: StrategyFirstBlueprintSpecification;
  assetObjective: string;
  targetAudience: string;
  businessObjective: string;
  buyerStage: string | null;
  primaryPainPoint: string | null;
  coreMessage: string;
  desiredTransformation: string;
  executiveRationale: string;
  supportingEvidence: string[];
  sophisticationLevel: AssetSophisticationLevel;
  strategicAngle: string;
  variationSeed: string;
  preferredAssetType: string;
  recommendedPrimaryDeliverable: MarketingDeliverableRecommendation;
  recommendedSupportingDeliverable: MarketingDeliverableRecommendation | null;
  marketingObjective: string;
  refreshPreserveStrategy: boolean;
  production: BlueprintProductionSpecification;
  generationInstructions: BlueprintGenerationInstructions;
  executiveSpecification: ExecutiveBlueprintSpecification;
};

const DELIVERABLE_STRATEGIC_ANGLES: Record<
  MarketingDeliverableRecommendation,
  string
> = {
  "Educational Guide": "diagnostic_education_playbook",
  "Decision Framework": "decision_framework_matrix",
  "Comparison Resource": "comparison_and_selection_guide",
  "Diagnostic Checklist": "signal_tracking_checklist",
  "Authority Whitepaper": "roi_business_case_asset",
  "Executive Webinar": "executive_intervention_brief",
  "Educational Video": "early_stage_education_asset",
  "Trust-Building Landing Page": "trust_building_nurture_sequence",
  "Multi-step Email Journey": "trust_building_nurture_sequence",
  "Lead Magnet": "community_value_resource",
  "FAQ Resource": "myth_vs_reality_framework",
  "Case Study Collection": "proof_led_conversion_guide",
  "Community Campaign": "awareness_carousel_series",
  "Interactive Assessment": "step_by_step_beginner_path",
  "Downloadable Toolkit": "conversation_starter_toolkit",
  "Educational Workshop": "implementation_roadmap",
};

const STRATEGIC_ANGLES: Record<RecommendedDirectionKey, string[]> = {
  educational: [
    "diagnostic_education_playbook",
    "myth_vs_reality_framework",
    "step_by_step_beginner_path",
  ],
  consultative: [
    "decision_framework_matrix",
    "implementation_roadmap",
    "comparison_and_selection_guide",
  ],
  sales_first: [
    "roi_business_case_asset",
    "proof_led_conversion_guide",
    "executive_briefing_one_pager",
  ],
  relationship_first: [
    "trust_building_nurture_sequence",
    "community_value_resource",
    "conversation_starter_toolkit",
  ],
  monitor: [
    "signal_tracking_checklist",
    "early_stage_education_asset",
    "awareness_carousel_series",
  ],
  escalate: [
    "urgency_driven_action_plan",
    "risk_mitigation_playbook",
    "executive_intervention_brief",
  ],
};

const ANGLE_PREFERRED_TYPES: Record<string, string> = {
  diagnostic_education_playbook: "pdf_guide",
  myth_vs_reality_framework: "carousel",
  step_by_step_beginner_path: "checklist",
  decision_framework_matrix: "framework",
  implementation_roadmap: "pdf_guide",
  comparison_and_selection_guide: "pdf_guide",
  roi_business_case_asset: "pdf_guide",
  proof_led_conversion_guide: "case_study",
  executive_briefing_one_pager: "pdf_guide",
  trust_building_nurture_sequence: "email_sequence",
  community_value_resource: "lead_magnet",
  conversation_starter_toolkit: "checklist",
  signal_tracking_checklist: "checklist",
  early_stage_education_asset: "pdf_guide",
  awareness_carousel_series: "carousel",
  urgency_driven_action_plan: "checklist",
  risk_mitigation_playbook: "pdf_guide",
  executive_intervention_brief: "pdf_guide",
};

const SOPHISTICATION_DEPTH: Record<AssetSophisticationLevel, string> = {
  beginner: "Foundational explanations, plain language, minimal jargon, short sections, quick wins.",
  intermediate:
    "Applied guidance with examples, moderate terminology, actionable frameworks, 2-3 decision points.",
  advanced:
    "Deep tactical detail, domain terminology, trade-off analysis, implementation nuance, proof points.",
  executive:
    "Concise strategic framing, business impact focus, decision-ready summaries, minimal fluff, ROI-oriented.",
};

function inferHighestProbabilityAction(input: {
  initiative: {
    initiativeLabel: string;
    initiativeCategory: string;
    whyThisInitiative: string;
  };
  implementation: {
    implementationDeliverable: string;
    deploymentApproach: string;
  };
  marketing: { recommendedPrimaryDeliverable: string; marketingObjective: string };
  hiddenProblem: string;
}): string {
  const deliverable = input.implementation.implementationDeliverable.toLowerCase();
  const category = input.initiative.initiativeCategory;

  if (deliverable.includes("assessment") || category === "diagnostic_assessment") {
    return `Deploy ${input.initiative.initiativeLabel} as an interactive diagnostic — highest probability action to win this opportunity by converting uncertainty into qualified demand.`;
  }
  if (deliverable.includes("comparison") || category === "competitive_differentiation") {
    return `Publish a competitive implementation comparison — buyers need proof, not another guide.`;
  }
  if (deliverable.includes("case study") || category === "trust_building") {
    return `Lead with proof-led case analysis addressing: ${input.hiddenProblem.slice(0, 100)}`;
  }
  if (category === "process_improvement" || category === "ai_workflow") {
    return `Execute business/process change first via ${input.initiative.initiativeLabel} — outperforms content-only approaches.`;
  }
  if (deliverable.includes("framework") || deliverable.includes("checklist")) {
    return `Ship a decision-ready ${input.implementation.implementationDeliverable} tied to ${input.marketing.marketingObjective.toLowerCase()}.`;
  }

  return `${input.initiative.initiativeLabel}: ${input.initiative.whyThisInitiative.slice(0, 160)}`;
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function resolveSophisticationLevel(input: {
  buyerStage: string | null;
  priorityLevel: string;
}): AssetSophisticationLevel {
  const stage = (input.buyerStage ?? "").toLowerCase();

  if (
    input.priorityLevel === "immediate_action" ||
    input.priorityLevel === "high_intent"
  ) {
    return "executive";
  }

  if (stage.includes("high_intent") || stage.includes("decision")) {
    return "advanced";
  }

  if (stage.includes("consideration")) {
    return "intermediate";
  }

  if (stage.includes("unaware") || stage.includes("aware")) {
    return "beginner";
  }

  return "intermediate";
}

export function resolveStrategicAngleFromMarketing(
  executiveStrategy: ExecutiveStrategy,
): string {
  const deliverable =
    executiveStrategy.marketingStrategy.recommendedPrimaryDeliverable;
  return (
    DELIVERABLE_STRATEGIC_ANGLES[deliverable] ??
    resolveStrategicAngleFromDirection(executiveStrategy.recommendedApproach)
  );
}

function resolveStrategicAngleFromDirection(direction: string): string {
  const angles =
    STRATEGIC_ANGLES[direction as RecommendedDirectionKey] ??
    STRATEGIC_ANGLES.consultative;
  return angles[0] ?? "decision_framework_matrix";
}

export function resolveStrategicAngle(
  understanding: ExecutiveUnderstanding,
): string {
  const direction = understanding.strategicUnderstanding.recommendedDirection;
  const angles =
    STRATEGIC_ANGLES[direction as RecommendedDirectionKey] ??
    STRATEGIC_ANGLES.consultative;
  const seed =
    understanding.metadata.understandingFingerprint ||
    understanding.metadata.discussionId ||
    understanding.metadata.organizationId;
  const index = hashString(seed) % angles.length;
  return angles[index] ?? angles[0];
}

function resolveDistributionChannel(
  understanding: ExecutiveUnderstanding,
): string {
  const deployment =
    understanding.strategicUnderstanding.recommendedDeploymentDirection;

  if (deployment.toLowerCase().includes("community")) {
    return "Community discussion, organic social, and direct follow-up.";
  }

  if (deployment.toLowerCase().includes("educational")) {
    return "Lead magnet, email nurture, and educational social distribution.";
  }

  return "Multi-channel: community, email, LinkedIn, and retargetable content library.";
}

function buildGenerationInstructions(input: {
  understanding: ExecutiveUnderstanding;
  strategicAngle: string;
  sophisticationLevel: AssetSophisticationLevel;
  preferredAssetType: string;
}): BlueprintGenerationInstructions {
  const { understanding, strategicAngle, sophisticationLevel, preferredAssetType } =
    input;
  const terminology = understanding.marketUnderstanding.recurringTerminology
    .slice(0, 6)
    .join(", ");
  const painPoint =
    understanding.marketUnderstanding.painPoints[0] ?? "the primary audience pain point";

  const assetTypeGuidance = [
    `Primary recommended format: ${preferredAssetType}.`,
    `Strategic angle: ${strategicAngle.replace(/_/g, " ")}.`,
    `Sophistication: ${sophisticationLevel}.`,
    "Blueprints must describe executable assets, not abstract content ideas.",
    "Every prompt field must be paste-ready for downstream AI tools.",
  ].join(" ");

  return {
    recommendedAssetTypes: [
      preferredAssetType,
      "pdf_guide",
      "carousel",
      "checklist",
      "framework",
      "lead_magnet",
      "email_sequence",
      "landing_page",
      "video_script",
      "webinar",
    ],
    assetTypeGuidance,
    layoutExpectations:
      preferredAssetType === "carousel"
        ? "Vertical 4:5 or square 1:1 carousel with one idea per slide, strong hook slide, proof slide, CTA slide."
        : preferredAssetType === "landing_page"
          ? "Hero, problem agitation, solution framework, proof, FAQ, CTA, footer trust strip."
          : preferredAssetType === "email_sequence"
            ? "5-email arc: value intro, pain amplification, framework reveal, proof, CTA."
            : "Cover, executive summary, 3-5 structured sections, visual break, checklist/worksheet, CTA page.",
    sectionHierarchy:
      sophisticationLevel === "executive"
        ? "Executive summary → business impact → recommended action → proof → CTA."
        : sophisticationLevel === "beginner"
          ? "Hook → plain-language problem → simple steps → quick win → next step CTA."
          : "Hook → context → framework → application → examples → objections → CTA.",
    designDirection:
      "Professional, credible, modern, whitespace-rich, scannable headings, no stock-photo clichés.",
    visualStyle:
      "Clean editorial layout with branded accent color, icon-led section headers, diagram-friendly spacing.",
    diagrams:
      "Include at least one process diagram or decision flow mapped to the core message and buyer stage.",
    comparisonTables:
      painPoint.includes("vs") || strategicAngle.includes("comparison")
        ? "Include a comparison table contrasting current state vs desired transformation."
        : "Include a before/after or option comparison table where it clarifies the decision.",
    calloutBoxes:
      "Use callout boxes for key insights, warnings, and executive takeaways tied to supporting evidence.",
    icons:
      "Use consistent iconography for steps, benefits, risks, and actions; avoid decorative-only icons.",
    coverPage:
      "Cover must state asset title, audience, transformation promise, and brand voice in one glance.",
    slideBreakdown:
      preferredAssetType === "carousel"
        ? "Slide 1 hook, Slide 2 pain, Slide 3 insight, Slide 4 framework, Slide 5 proof, Slide 6 CTA."
        : "If social/carousel output is requested, provide slide-by-slide headlines and copy blocks.",
    sceneBreakdown:
      preferredAssetType === "video_script"
        ? "Scene 1 hook (0-5s), Scene 2 problem, Scene 3 insight, Scene 4 proof, Scene 5 CTA."
        : "If video is requested, provide timed scene beats with on-screen text and voiceover notes.",
    webinarFlow:
      preferredAssetType === "webinar"
        ? "Intro → credibility → problem framing → teaching framework → live example → Q&A → offer CTA."
        : "If webinar is requested, provide agenda, teaching beats, engagement prompts, and conversion CTA.",
    landingPageSections:
      preferredAssetType === "landing_page"
        ? "Hero promise, pain section, transformation framework, proof, offer, FAQ, primary CTA."
        : "If landing page is requested, provide section copy blocks and CTA placement guidance.",
    emailSequenceStructure:
      preferredAssetType === "email_sequence"
        ? "Email 1 value hook, Email 2 pain story, Email 3 framework, Email 4 proof, Email 5 CTA."
        : "If email sequence is requested, provide subject lines, preview text, body copy blocks, and CTA per email.",
  };
}

export function buildStrategicBlueprintProductionContext(
  understanding: ExecutiveUnderstanding,
  executiveStrategy: ExecutiveStrategy,
): StrategicBlueprintProductionContext {
  const marketing = executiveStrategy.marketingStrategy;
  const strategicAngle = resolveStrategicAngleFromMarketing(executiveStrategy);
  const sophisticationLevel = resolveSophisticationLevel({
    buyerStage: understanding.marketUnderstanding.buyerStage,
    priorityLevel: understanding.priorityUnderstanding.level,
  });
  const preferredAssetType = marketing.preferredImplementationType || "pdf_guide";
  const primaryPainPoint =
    understanding.marketUnderstanding.painPoints[0] ?? null;
  const coreMessage =
    understanding.strategicUnderstanding.primaryExecutiveObjective ||
    "Advance the executive initiative with measurable business impact.";
  const desiredTransformation = [
    marketing.buyerProgressionGoal?.transitionObjective ??
      "Move the buyer to the next meaningful stage.",
    marketing.buyerProgressionGoal?.currentStage &&
    marketing.buyerProgressionGoal?.desiredNextStage
      ? `Move from ${marketing.buyerProgressionGoal.currentStage} to ${marketing.buyerProgressionGoal.desiredNextStage}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  const executiveRationale = [
    ...(marketing.strategicRationale ?? []),
    understanding.strategicUnderstanding.recommendedExecutiveAction,
  ]
    .filter(Boolean)
    .join(" ");
  const supportingEvidence = (understanding.supportingEvidence?.entries ?? []).map(
    (entry) => `${entry.label}: ${entry.detail}`,
  );

  const variationSeed = [
    understanding.metadata.organizationId,
    understanding.metadata.discussionId ?? "",
    marketing.marketingFingerprint,
    strategicAngle,
    sophisticationLevel,
    primaryPainPoint ?? "",
    understanding.metadata.understandingFingerprint,
  ].join("|");

  const brandTone = [
    understanding.businessUnderstanding.voice ?? "Professional and credible",
    sophisticationLevel === "executive" ? "decision-oriented" : "helpful",
    understanding.strategicUnderstanding.recommendedDirection,
  ].join(", ");

  const production: BlueprintProductionSpecification = {
    outputFormat: preferredAssetType.replace(/_/g, " "),
    pageOrSlideCount:
      preferredAssetType === "carousel"
        ? "6-8 slides"
        : preferredAssetType === "checklist"
          ? "1-2 pages"
          : preferredAssetType === "email_sequence"
            ? "5 emails"
            : preferredAssetType === "landing_page"
              ? "1 scrolling page, 6-7 sections"
              : preferredAssetType === "video_script"
                ? "60-90 second script"
                : "8-12 pages",
    visualDirection:
      "Editorial, modern, credible, branded, diagram-friendly, conversion-aware.",
    editorialDirection:
      SOPHISTICATION_DEPTH[sophisticationLevel] +
      (terminologyFrom(understanding)
        ? ` Use domain terminology where appropriate: ${terminologyFrom(understanding)}.`
        : ""),
    contentDepth: SOPHISTICATION_DEPTH[sophisticationLevel],
    brandTone,
    ctaObjective: marketing.conversionObjective || "Drive one clear next action.",
    distributionChannel: resolveDistributionChannel(understanding),
    reuseStrategy: `Repurpose across ${resolveDistributionChannel(understanding)} Estimated reuse: adapt core asset into social, email, and community formats.`,
  };

  const generationInstructions = buildGenerationInstructions({
    understanding,
    strategicAngle,
    sophisticationLevel,
    preferredAssetType,
  });

  const intelligence = understanding.executiveIntelligence;
  const decision = intelligence?.executiveDecisionSynthesis?.selectedDecision;
  const decisionDocument = decision?.decisionDocument;
  const initiative = understanding.executiveInitiativeSelection;
  const selected = initiative?.selectedInitiative;
  const implementation = initiative?.implementationStrategy;
  const marketingRecommendation = ensureExecutiveRecommendation(
    marketing.executiveRecommendation,
    {
      initiativeLabel: selected?.initiativeLabel,
      rationale: selected?.whyThisInitiative,
      businessOutcome: selected?.expectedBusinessOutcome,
      targetAudience: understanding.marketUnderstanding.buyerStage ?? undefined,
      assetType: marketing.recommendedPrimaryDeliverable,
      whyNow: selected?.whyNow,
    },
  );

  const hiddenProblem =
    decisionDocument?.hiddenMarketProblem ??
    intelligence?.hiddenProblem?.hiddenMarketProblem ??
    primaryPainPoint ??
    "Unresolved market problem from current discussion intelligence.";

  const highestProbabilityAction = inferHighestProbabilityAction({
    initiative: {
      initiativeLabel: selected?.initiativeLabel ?? "Executive initiative",
      initiativeCategory: selected?.initiativeCategory ?? "market_education",
      whyThisInitiative:
        selected?.whyThisInitiative ?? marketingRecommendation.whyThisAsset,
    },
    implementation: {
      implementationDeliverable:
        implementation?.implementationDeliverable ?? preferredAssetType,
      deploymentApproach:
        implementation?.deploymentApproach ?? "Multi-channel executive deployment.",
    },
    marketing: {
      recommendedPrimaryDeliverable: marketing.recommendedPrimaryDeliverable,
      marketingObjective: marketing.marketingObjective,
    },
    hiddenProblem,
  });

  const strategyFirst: StrategyFirstBlueprintSpecification = {
    executiveInitiative: selected?.initiativeLabel ?? "Executive initiative",
    initiativeCategory: selected?.initiativeCategory ?? "market_education",
    highestProbabilityAction,
    businessObjective:
      selected?.expectedBusinessOutcome ??
      marketing.businessObjective ??
      coreMessage,
    marketProblem: hiddenProblem,
    strategicHypothesis:
      intelligence?.contrarianThinking?.strategicReframe ??
      "Strategic hypothesis derived from current executive intelligence.",
    competitiveAdvantage:
      decisionDocument?.competitiveAdvantage ??
      intelligence?.strategicDifferentiation?.differentiationStatement ??
      "Differentiated executive positioning.",
    customerTransformation:
      selected?.expectedCustomerOutcome ??
      decision?.expectedCustomerOutcome ??
      desiredTransformation,
    evidenceSupportingDecision:
      selected?.evidenceFromDiscussion?.length
        ? selected.evidenceFromDiscussion
        : supportingEvidence.length
          ? supportingEvidence
          : ["Current discussion and business identity"],
    successMetrics: {
      primaryKpi: selected?.primarySuccessMetric ?? "Qualified pipeline progression",
      secondaryKpis: [selected?.secondarySuccessMetric ?? "Engagement quality"].filter(
        Boolean,
      ) as string[],
    },
    risks: [
      selected?.riskLevel === "high"
        ? "High execution risk — validate assumptions before full deployment."
        : selected?.riskLevel === "medium"
          ? "Moderate risk — monitor early signals before scaling."
          : "Low risk — standard deployment safeguards apply.",
      initiative?.businessBeforeContent?.contentRequired
        ? "Content dependency — ensure implementation asset matches initiative scope."
        : "Business-change initiative — content is secondary to process/positioning execution.",
    ],
    expectedRoi:
      marketingRecommendation.estimatedReusePotential === "high"
        ? "High expected ROI — initiative compounds across sales, community, and retention."
        : marketingRecommendation.estimatedReusePotential === "medium"
          ? "Moderate ROI within current market cycle."
          : "Targeted ROI — near-term tactical impact.",
    implementationRoadmap: [
      `1. Launch ${selected?.initiativeLabel ?? "the executive initiative"} as the executive north star.`,
      `2. Deploy ${implementation?.implementationDeliverable ?? preferredAssetType} as implementation vehicle.`,
      `3. Measure ${selected?.primarySuccessMetric ?? "primary success metric"}.`,
      `4. Iterate based on ${selected?.secondarySuccessMetric ?? "secondary success signals"}.`,
    ],
  };

  const executiveSpecification: ExecutiveBlueprintSpecification = {
    strategicObjective: strategyFirst.businessObjective,
    businessProblemSolved: strategyFirst.marketProblem,
    assetSelectionReason: `Production implements initiative "${strategyFirst.executiveInitiative}" — ${implementation?.rationale ?? marketingRecommendation.whyThisAsset}`,
    targetPsychologicalOutcome:
      decision?.expectedCustomerOutcome ??
      selected?.expectedCustomerOutcome ??
      "Increase buyer confidence and readiness to act.",
    primaryCta:
      decisionDocument?.generationObjectives?.callToActionObjective ??
      marketing.conversionObjective ??
      "Take the recommended next step.",
    contentArchitecture:
      generationInstructions.sectionHierarchy +
      " " +
      generationInstructions.layoutExpectations,
    repurposingOpportunities: production.reuseStrategy,
    businessKpi: decisionDocument?.successMetric ?? selected?.primarySuccessMetric ?? "Pipeline progression",
    estimatedProductionEffort: marketingRecommendation.estimatedEffort,
    expectedLifespan:
      marketingRecommendation.estimatedReusePotential === "high"
        ? "6-12 months with quarterly refresh"
        : marketingRecommendation.estimatedReusePotential === "medium"
          ? "3-6 months with minor updates"
          : "Single campaign cycle with limited reuse",
    estimatedRoiCategory:
      marketingRecommendation.estimatedReusePotential === "high"
        ? "high"
        : marketingRecommendation.estimatedReusePotential === "medium"
          ? "medium"
          : "low",
  };

  return {
    version: STRATEGIC_BLUEPRINT_SPECS_VERSION,
    strategyFirst,
    assetObjective: coreMessage,
    targetAudience: buildTargetAudienceLabel(understanding, sophisticationLevel),
    businessObjective: marketing.businessObjective,
    buyerStage: understanding.marketUnderstanding.buyerStage,
    primaryPainPoint,
    coreMessage,
    desiredTransformation,
    executiveRationale,
    supportingEvidence,
    sophisticationLevel,
    strategicAngle,
    variationSeed,
    preferredAssetType,
    recommendedPrimaryDeliverable: marketing.recommendedPrimaryDeliverable,
    recommendedSupportingDeliverable: marketing.recommendedSupportingDeliverable,
    marketingObjective: marketing.marketingObjective,
    refreshPreserveStrategy: marketing.refreshGuidance.preserveStrategy,
    production,
    generationInstructions,
    executiveSpecification,
  };
}

function terminologyFrom(understanding: ExecutiveUnderstanding): string {
  return understanding.marketUnderstanding.recurringTerminology
    .slice(0, 6)
    .join(", ");
}

function buildTargetAudienceLabel(
  understanding: ExecutiveUnderstanding,
  sophisticationLevel: AssetSophisticationLevel,
): string {
  const stage = understanding.marketUnderstanding.buyerStage ?? "prospective buyers";
  const positioning =
    understanding.businessUnderstanding.positioning ?? "the operator's audience";

  return `${stage} audience (${sophisticationLevel} level) aligned to ${positioning}`;
}

export function formatStrategicBlueprintProductionSpecsForPrompt(
  context: StrategicBlueprintProductionContext,
): string {
  const sections = [
    "ATHENA STRATEGIC ASSET PRODUCTION SPECIFICATIONS:",
    "",
    "Strategy first. Production second. The blueprint describes a business initiative before asset specifications.",
    "",
    "EXECUTIVE INITIATIVE (STRATEGY — MUST LEAD ALL OUTPUT):",
    `- Initiative: ${context.strategyFirst.executiveInitiative}`,
    `- Category: ${context.strategyFirst.initiativeCategory}`,
    `- Highest-probability action to win: ${context.strategyFirst.highestProbabilityAction}`,
    `- Business objective: ${context.strategyFirst.businessObjective}`,
    `- Market problem: ${context.strategyFirst.marketProblem}`,
    `- Strategic hypothesis: ${context.strategyFirst.strategicHypothesis}`,
    `- Competitive advantage: ${context.strategyFirst.competitiveAdvantage}`,
    `- Customer transformation: ${context.strategyFirst.customerTransformation}`,
    `- Evidence: ${context.strategyFirst.evidenceSupportingDecision.join("; ") || "From current discussion intelligence."}`,
    `- Primary KPI: ${context.strategyFirst.successMetrics.primaryKpi}`,
    `- Secondary KPIs: ${context.strategyFirst.successMetrics.secondaryKpis.join("; ")}`,
    `- Risks: ${context.strategyFirst.risks.join("; ")}`,
    `- Expected ROI: ${context.strategyFirst.expectedRoi}`,
    `- Implementation roadmap: ${context.strategyFirst.implementationRoadmap.join(" → ")}`,
    "",
    "These specifications are deterministic and must be followed exactly.",
    "Do not produce generic marketing advice. Produce executable asset specifications.",
    "",
    "IMPLEMENTATION ASSET STRATEGY:",
    `- Marketing recommendation: ${context.recommendedPrimaryDeliverable}`,
    context.recommendedSupportingDeliverable
      ? `- Supporting recommendation: ${context.recommendedSupportingDeliverable}`
      : "- Supporting recommendation: none",
    `- Marketing objective: ${context.marketingObjective}`,
    `- Asset objective: ${context.assetObjective}`,
    `- Business objective: ${context.businessObjective}`,
    `- Target audience: ${context.targetAudience}`,
    `- Buyer stage: ${context.buyerStage ?? "Unknown"}`,
    `- Primary pain point: ${context.primaryPainPoint ?? "Derived from current discussion intelligence"}`,
    `- Core message: ${context.coreMessage}`,
    `- Desired transformation: ${context.desiredTransformation}`,
    `- Executive rationale: ${context.executiveRationale}`,
    `- Strategic angle: ${context.strategicAngle.replace(/_/g, " ")}`,
    `- Sophistication level: ${context.sophisticationLevel}`,
    `- Preferred asset type: ${context.preferredAssetType}`,
    `- Applied asset standard: ${context.preferredAssetType.replace(/_/g, " ")} (from Executive Marketing Strategy)`,
    context.refreshPreserveStrategy
      ? "- Refresh: improve execution quality; preserve marketing recommendation"
      : "- Refresh: strategic direction updated per Executive Marketing Strategy",
    `- Variation seed: ${context.variationSeed}`,
    "",
    "SUPPORTING EVIDENCE:",
    ...(context.supportingEvidence.length
      ? context.supportingEvidence.map((entry) => `- ${entry}`)
      : ["- Current discussion and business identity (historical evidence not required)."]),
    "",
    "PRODUCTION SPECIFICATIONS:",
    `- Output format: ${context.production.outputFormat}`,
    `- Pages/slides/screens: ${context.production.pageOrSlideCount}`,
    `- Visual direction: ${context.production.visualDirection}`,
    `- Editorial direction: ${context.production.editorialDirection}`,
    `- Content depth: ${context.production.contentDepth}`,
    `- Brand tone: ${context.production.brandTone}`,
    `- CTA objective: ${context.production.ctaObjective}`,
    `- Distribution channel: ${context.production.distributionChannel}`,
    `- Reuse strategy: ${context.production.reuseStrategy}`,
    "",
    "EXECUTIVE SPECIFICATION (senior strategist instructions):",
    `- Strategic objective: ${context.executiveSpecification.strategicObjective}`,
    `- Business problem solved: ${context.executiveSpecification.businessProblemSolved}`,
    `- Why this asset was selected: ${context.executiveSpecification.assetSelectionReason}`,
    `- Target psychological outcome: ${context.executiveSpecification.targetPsychologicalOutcome}`,
    `- Primary CTA: ${context.executiveSpecification.primaryCta}`,
    `- Content architecture: ${context.executiveSpecification.contentArchitecture}`,
    `- Repurposing opportunities: ${context.executiveSpecification.repurposingOpportunities}`,
    `- Business KPI: ${context.executiveSpecification.businessKpi}`,
    `- Estimated production effort: ${context.executiveSpecification.estimatedProductionEffort}`,
    `- Expected lifespan: ${context.executiveSpecification.expectedLifespan}`,
    `- Estimated ROI category: ${context.executiveSpecification.estimatedRoiCategory}`,
    "",
    "AI GENERATION INSTRUCTIONS:",
    `- Asset type guidance: ${context.generationInstructions.assetTypeGuidance}`,
    `- Layout expectations: ${context.generationInstructions.layoutExpectations}`,
    `- Section hierarchy: ${context.generationInstructions.sectionHierarchy}`,
    `- Design direction: ${context.generationInstructions.designDirection}`,
    `- Visual style: ${context.generationInstructions.visualStyle}`,
    `- Diagrams: ${context.generationInstructions.diagrams}`,
    `- Comparison tables: ${context.generationInstructions.comparisonTables}`,
    `- Callout boxes: ${context.generationInstructions.calloutBoxes}`,
    `- Icons: ${context.generationInstructions.icons}`,
    `- Cover page: ${context.generationInstructions.coverPage}`,
    `- Slide breakdown: ${context.generationInstructions.slideBreakdown}`,
    `- Scene breakdown: ${context.generationInstructions.sceneBreakdown}`,
    `- Webinar flow: ${context.generationInstructions.webinarFlow}`,
    `- Landing page sections: ${context.generationInstructions.landingPageSections}`,
    `- Email sequence structure: ${context.generationInstructions.emailSequenceStructure}`,
    "",
    "INSTRUCTIONS:",
    "Generate production-ready prompts another AI can execute immediately.",
    "Align fully with Executive Understanding and Executive Marketing Strategy above.",
    "Do not independently choose a different marketing deliverable.",
    "Materially differentiate this blueprint from generic templates using the strategic angle.",
  ];

  return sections.join("\n").trim();
}

export function formatStrategicBlueprintProductionSpecsCompactForPrompt(
  context: StrategicBlueprintProductionContext,
  options?: { blueprintSelection?: boolean },
): string {
  const lines = [
    "PRODUCTION CONTEXT:",
    `- Initiative: ${context.strategyFirst.executiveInitiative}`,
    `- Market problem: ${context.strategyFirst.marketProblem}`,
    `- Strategic angle: ${context.strategicAngle.replace(/_/g, " ")}`,
    `- Primary pain: ${context.primaryPainPoint ?? "From discussion"}`,
    `- Core message: ${context.coreMessage}`,
  ];

  if (!options?.blueprintSelection) {
    lines.push(
      `- Deliverable hint: ${context.recommendedPrimaryDeliverable}`,
      `- Output format hint: ${context.production.outputFormat}`,
    );
  }

  lines.push(
    `- CTA objective: ${context.production.ctaObjective}`,
    `- Sophistication: ${context.sophisticationLevel}`,
    "Choose the strongest asset format after evaluating buyer uncertainty, objection, commercial objective, conversion mechanism, and reusable value.",
  );

  return lines.join("\n");
}
