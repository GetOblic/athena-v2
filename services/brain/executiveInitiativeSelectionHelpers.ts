import type { MarketingDeliverableRecommendation } from "@/services/brain/executiveCoherence/executiveCoherenceTypes";
import { ensureExecutiveRecommendation } from "@/services/brain/executiveCoherence/executiveRecommendationContracts";
import type { AthenaBrainContext } from "@/services/brain/brainContextTypes";
import type {
  BusinessBeforeContentAssessment,
  EvaluatedInitiativeCandidate,
  ExecutiveInitiativeCategory,
  ExecutiveInitiativeSelection,
  ImplementationStrategy,
  InitiativeCandidate,
  InitiativeEvaluationScores,
  InitiativeSelectionTrace,
  SelectedExecutiveInitiative,
} from "@/services/brain/executiveUnderstanding/executiveUnderstandingTypes";
import type {
  ExecutiveDecision,
  ExecutiveDecisionDocument,
  ExecutiveDecisionSynthesis,
  ExecutiveIntelligencePipeline,
  ExecutiveReasoning,
  MarketPatternKind,
} from "@/services/brain/executiveReasoningTypes";
import type {
  BusinessUnderstanding,
  ExecutiveSummary,
  MarketUnderstanding,
  OpportunityUnderstanding,
  PriorityUnderstanding,
  StrategicUnderstanding,
} from "@/services/brain/executiveUnderstanding/executiveUnderstandingTypes";

export const EXECUTIVE_INITIATIVE_SELECTION_VERSION = "executive_initiative_selection_v1";

export type ExecutiveInitiativeArchetype = {
  id: string;
  label: string;
  category: ExecutiveInitiativeCategory;
  typicalObjectives: string[];
  expectedOutcomes: string[];
  idealDeploymentChannels: string[];
  businessValue: string;
  authorityValue: string;
  revenueMechanisms: string[];
  reusePotential: "low" | "medium" | "high";
  preferredImplementationTypes: MarketingDeliverableRecommendation[];
  contentRequired: boolean;
};

export const EXECUTIVE_INITIATIVE_LIBRARY: ExecutiveInitiativeArchetype[] = [
  {
    id: "career_readiness_assessment",
    label: "Career Readiness Assessment",
    category: "diagnostic_assessment",
    typicalObjectives: ["Qualify buyer readiness", "Surface hidden capability gaps"],
    expectedOutcomes: ["Higher-intent pipeline", "Reduced unqualified inquiries"],
    idealDeploymentChannels: ["community", "landing_page", "email"],
    businessValue: "Converts curiosity into qualified demand with measurable readiness signals.",
    authorityValue: "Positions operator as diagnostic authority, not content publisher.",
    revenueMechanisms: ["lead_qualification", "consultation_booking", "program_enrollment"],
    reusePotential: "high",
    preferredImplementationTypes: ["Interactive Assessment", "Diagnostic Checklist"],
    contentRequired: true,
  },
  {
    id: "graduate_business_launch_framework",
    label: "Graduate Business Launch Framework",
    category: "sales_enablement",
    typicalObjectives: ["Reduce post-graduation failure", "Accelerate revenue for alumni"],
    expectedOutcomes: ["Higher graduate success rate", "Stronger referral loop"],
    idealDeploymentChannels: ["email", "community", "workshop"],
    businessValue: "Transforms training completion into business outcomes — the hidden buyer fear.",
    authorityValue: "Differentiates on graduate outcomes, not curriculum length.",
    revenueMechanisms: ["upsell_services", "referrals", "retention"],
    reusePotential: "high",
    preferredImplementationTypes: ["Decision Framework", "Downloadable Toolkit"],
    contentRequired: true,
  },
  {
    id: "industry_training_transparency_standard",
    label: "Industry Training Transparency Standard",
    category: "industry_standard_creation",
    typicalObjectives: ["Set market evaluation criteria", "Reduce buyer confusion"],
    expectedOutcomes: ["Category leadership", "Reduced price-only comparison"],
    idealDeploymentChannels: ["community", "linkedin", "whitepaper"],
    businessValue: "Reframes market conversation around standards the operator defines.",
    authorityValue: "Creates defensible category authority competitors cannot easily copy.",
    revenueMechanisms: ["premium_positioning", "partnership_inbound", "media_citations"],
    reusePotential: "high",
    preferredImplementationTypes: ["Authority Whitepaper", "Decision Framework"],
    contentRequired: true,
  },
  {
    id: "program_evaluation_scorecard",
    label: "Program Evaluation Scorecard",
    category: "diagnostic_assessment",
    typicalObjectives: ["Help buyers compare programs objectively", "Reduce decision paralysis"],
    expectedOutcomes: ["Shorter sales cycles", "Higher trust at consideration stage"],
    idealDeploymentChannels: ["community", "landing_page"],
    businessValue: "Guides evaluation toward operator strengths without hard selling.",
    authorityValue: "Becomes reference tool buyers share — compounding distribution.",
    revenueMechanisms: ["consultation_booking", "program_enrollment"],
    reusePotential: "high",
    preferredImplementationTypes: ["Interactive Assessment", "Comparison Resource"],
    contentRequired: true,
  },
  {
    id: "student_success_diagnostic",
    label: "Student Success Diagnostic",
    category: "customer_success",
    typicalObjectives: ["Identify at-risk students early", "Improve completion outcomes"],
    expectedOutcomes: ["Higher NPS", "Lower refund risk"],
    idealDeploymentChannels: ["email", "onboarding", "community"],
    businessValue: "Proactive success intervention reduces churn and reputation damage.",
    authorityValue: "Demonstrates operator invests in outcomes, not just enrollment.",
    revenueMechanisms: ["retention", "upsell_coaching", "referrals"],
    reusePotential: "medium",
    preferredImplementationTypes: ["Diagnostic Checklist", "Interactive Assessment"],
    contentRequired: false,
  },
  {
    id: "business_readiness_index",
    label: "Business Readiness Index",
    category: "diagnostic_assessment",
    typicalObjectives: ["Quantify launch readiness", "Create benchmarkable self-assessment"],
    expectedOutcomes: ["Lead magnet with high perceived value", "Data-driven follow-up"],
    idealDeploymentChannels: ["landing_page", "community", "email"],
    businessValue: "Index-based tools create recurring reference value and list growth.",
    authorityValue: "Proprietary index becomes cited industry metric over time.",
    revenueMechanisms: ["lead_generation", "consultation_booking", "premium_tier"],
    reusePotential: "high",
    preferredImplementationTypes: ["Interactive Assessment", "Lead Magnet"],
    contentRequired: true,
  },
  {
    id: "curriculum_trust_framework",
    label: "Curriculum Trust Framework",
    category: "curriculum_redesign",
    typicalObjectives: ["Make curriculum defensible", "Address adequacy objections"],
    expectedOutcomes: ["Reduced 'is this enough?' objections", "Higher conversion confidence"],
    idealDeploymentChannels: ["community", "sales_conversations", "faq"],
    businessValue: "Reframes curriculum as structured business preparation, not content volume.",
    authorityValue: "Transparent framework builds trust competitors hide behind marketing.",
    revenueMechanisms: ["conversion_improvement", "premium_positioning"],
    reusePotential: "high",
    preferredImplementationTypes: ["Decision Framework", "FAQ Resource"],
    contentRequired: true,
  },
  {
    id: "market_diagnostic",
    label: "Market Diagnostic",
    category: "market_education",
    typicalObjectives: ["Educate on market realities", "Correct misconceptions"],
    expectedOutcomes: ["Better-qualified leads", "Reduced support burden"],
    idealDeploymentChannels: ["community", "social", "email"],
    businessValue: "Diagnostic education reduces unqualified demand before sales contact.",
    authorityValue: "Operator becomes go-to market interpreter.",
    revenueMechanisms: ["lead_qualification", "consultation_booking"],
    reusePotential: "medium",
    preferredImplementationTypes: ["Diagnostic Checklist", "Educational Guide"],
    contentRequired: true,
  },
  {
    id: "competitive_comparison_framework",
    label: "Competitive Comparison Framework",
    category: "competitive_differentiation",
    typicalObjectives: ["Guide fair comparison", "Highlight differentiated value"],
    expectedOutcomes: ["Win consideration-stage buyers", "Reduce price objections"],
    idealDeploymentChannels: ["community", "sales_enablement"],
    businessValue: "Structured comparison prevents buyers from defaulting to cheapest option.",
    authorityValue: "Confidence to compare openly signals market leadership.",
    revenueMechanisms: ["conversion_improvement", "premium_positioning"],
    reusePotential: "high",
    preferredImplementationTypes: ["Comparison Resource", "Decision Framework"],
    contentRequired: true,
  },
  {
    id: "authority_report",
    label: "Authority Report",
    category: "thought_leadership",
    typicalObjectives: ["Publish definitive market analysis", "Attract inbound interest"],
    expectedOutcomes: ["Media citations", "Partnership inbound", "Premium perception"],
    idealDeploymentChannels: ["linkedin", "email", "partnerships"],
    businessValue: "Research-grade asset compounds authority over months, not days.",
    authorityValue: "Definitive report becomes category reference document.",
    revenueMechanisms: ["inbound_leads", "partnerships", "premium_positioning"],
    reusePotential: "high",
    preferredImplementationTypes: ["Authority Whitepaper", "Educational Guide"],
    contentRequired: true,
  },
  {
    id: "certification_framework",
    label: "Certification Framework",
    category: "certification",
    typicalObjectives: ["Create credentialed pathway", "Increase program perceived value"],
    expectedOutcomes: ["Premium pricing justification", "Alumni differentiation"],
    idealDeploymentChannels: ["website", "sales", "community"],
    businessValue: "Certification creates tangible credential buyers can show employers/clients.",
    authorityValue: "Operator sets certification standard for the category.",
    revenueMechanisms: ["premium_pricing", "certification_fees", "renewals"],
    reusePotential: "high",
    preferredImplementationTypes: ["Decision Framework", "Educational Workshop"],
    contentRequired: false,
  },
  {
    id: "objection_handling_system",
    label: "Objection Handling System",
    category: "objection_handling",
    typicalObjectives: ["Preempt recurring objections", "Equip sales/community teams"],
    expectedOutcomes: ["Higher close rate", "Consistent messaging"],
    idealDeploymentChannels: ["sales", "community", "internal"],
    businessValue: "Systematic objection handling reduces lost deals from unaddressed fears.",
    authorityValue: "Transparency on objections builds more trust than ignoring them.",
    revenueMechanisms: ["conversion_improvement", "sales_efficiency"],
    reusePotential: "high",
    preferredImplementationTypes: ["FAQ Resource", "Case Study Collection"],
    contentRequired: true,
  },
  {
    id: "positioning_refinement",
    label: "Positioning Refinement Initiative",
    category: "positioning_refinement",
    typicalObjectives: ["Clarify unique market position", "Reduce generic messaging"],
    expectedOutcomes: ["Higher differentiation perception", "Better-fit leads"],
    idealDeploymentChannels: ["website", "community", "sales"],
    businessValue: "Sharper positioning reduces wasted marketing spend on wrong audience.",
    authorityValue: "Distinct positioning makes operator memorable in crowded market.",
    revenueMechanisms: ["conversion_improvement", "premium_positioning"],
    reusePotential: "medium",
    preferredImplementationTypes: ["Trust-Building Landing Page", "Authority Whitepaper"],
    contentRequired: true,
  },
  {
    id: "partnership_ecosystem",
    label: "Partnership Ecosystem",
    category: "partnership_opportunity",
    typicalObjectives: ["Expand reach through aligned partners", "Create referral network"],
    expectedOutcomes: ["Lower CAC", "Market expansion"],
    idealDeploymentChannels: ["direct_outreach", "events", "community"],
    businessValue: "Partnerships create leverage unavailable through content alone.",
    authorityValue: "Ecosystem builder status elevates operator above single-vendor competitors.",
    revenueMechanisms: ["referrals", "revenue_share", "market_expansion"],
    reusePotential: "medium",
    preferredImplementationTypes: ["Case Study Collection", "Educational Guide"],
    contentRequired: false,
  },
  {
    id: "onboarding_redesign",
    label: "Onboarding Redesign",
    category: "process_improvement",
    typicalObjectives: ["Reduce time-to-value", "Improve early retention"],
    expectedOutcomes: ["Higher completion rates", "Earlier success stories"],
    idealDeploymentChannels: ["product", "email", "community"],
    businessValue: "Process improvement often outperforms content for retention and referrals.",
    authorityValue: "Operational excellence becomes proof of program quality.",
    revenueMechanisms: ["retention", "referrals", "upsell"],
    reusePotential: "medium",
    preferredImplementationTypes: ["Diagnostic Checklist", "Multi-step Email Journey"],
    contentRequired: false,
  },
  {
    id: "pricing_strategy_review",
    label: "Pricing Strategy Review",
    category: "pricing_strategy",
    typicalObjectives: ["Align pricing with value delivered", "Reduce price objections"],
    expectedOutcomes: ["Improved margins", "Better buyer fit"],
    idealDeploymentChannels: ["sales", "internal"],
    businessValue: "Pricing changes can multiply revenue faster than any content asset.",
    authorityValue: "Value-based pricing signals confidence and market leadership.",
    revenueMechanisms: ["revenue_expansion", "margin_improvement"],
    reusePotential: "low",
    preferredImplementationTypes: ["Decision Framework", "Comparison Resource"],
    contentRequired: false,
  },
  {
    id: "community_activation",
    label: "Community Activation",
    category: "community_building",
    typicalObjectives: ["Activate existing community", "Generate peer proof"],
    expectedOutcomes: ["Organic referrals", "Reduced support load"],
    idealDeploymentChannels: ["community", "social"],
    businessValue: "Activated community creates compounding social proof and referrals.",
    authorityValue: "Thriving community demonstrates real graduate/buyer success.",
    revenueMechanisms: ["referrals", "retention", "organic_leads"],
    reusePotential: "medium",
    preferredImplementationTypes: ["Community Campaign", "Case Study Collection"],
    contentRequired: true,
  },
  {
    id: "ai_workflow_assistant",
    label: "AI Workflow Assistant",
    category: "ai_workflow",
    typicalObjectives: ["Automate repetitive buyer guidance", "Scale personalized support"],
    expectedOutcomes: ["Lower support cost", "24/7 buyer engagement"],
    idealDeploymentChannels: ["website", "community", "onboarding"],
    businessValue: "Software leverage can outperform static content for recurring buyer questions.",
    authorityValue: "AI tooling signals innovation leadership in the category.",
    revenueMechanisms: ["conversion_improvement", "retention", "premium_tier"],
    reusePotential: "high",
    preferredImplementationTypes: ["Interactive Assessment", "FAQ Resource"],
    contentRequired: false,
  },
  {
    id: "trust_framework",
    label: "Trust Framework",
    category: "trust_building",
    typicalObjectives: ["Make trust claims verifiable", "Reduce perceived risk"],
    expectedOutcomes: ["Higher conversion at decision stage", "Lower refund rates"],
    idealDeploymentChannels: ["website", "sales", "community"],
    businessValue: "Structured trust reduces the #1 conversion blocker in high-ticket education.",
    authorityValue: "Published trust framework sets industry transparency bar.",
    revenueMechanisms: ["conversion_improvement", "premium_positioning"],
    reusePotential: "high",
    preferredImplementationTypes: ["Trust-Building Landing Page", "Case Study Collection"],
    contentRequired: true,
  },
  {
    id: "implementation_roadmap",
    label: "Implementation Roadmap",
    category: "sales_enablement",
    typicalObjectives: ["Show path from purchase to outcome", "Reduce buyer uncertainty"],
    expectedOutcomes: ["Shorter decision cycles", "Higher confidence at close"],
    idealDeploymentChannels: ["sales", "email", "community"],
    businessValue: "Roadmap makes abstract promise concrete — critical for high-ticket decisions.",
    authorityValue: "Detailed roadmap signals operational maturity competitors lack.",
    revenueMechanisms: ["conversion_improvement", "upsell"],
    reusePotential: "high",
    preferredImplementationTypes: ["Decision Framework", "Educational Guide"],
    contentRequired: true,
  },
];

const WEBINAR_HEAVY_CATEGORIES: ExecutiveInitiativeCategory[] = [
  "market_education",
  "thought_leadership",
];

const CONTENT_ONLY_CATEGORIES: ExecutiveInitiativeCategory[] = [
  "market_education",
  "thought_leadership",
];

const ELIMINATION_THRESHOLD = 42;
const DIVERSITY_SCORE_GAP = 12;
const WEBINAR_BIAS_PENALTY = 28;
const REPEAT_INITIATIVE_PENALTY = 18;

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeStage(buyerStage: string | null | undefined): string {
  const stage = (buyerStage ?? "aware").toLowerCase();
  if (stage.includes("unaware")) return "unaware";
  if (stage.includes("high_intent") || stage.includes("high intent")) return "high_intent";
  if (stage.includes("decision")) return "decision";
  if (stage.includes("consideration")) return "consideration";
  if (stage.includes("aware")) return "aware";
  return "aware";
}

function archetypesForPattern(pattern: MarketPatternKind): ExecutiveInitiativeArchetype[] {
  switch (pattern) {
    case "curriculum_opportunity":
      return EXECUTIVE_INITIATIVE_LIBRARY.filter((a) =>
        ["curriculum_redesign", "certification", "customer_success"].includes(a.category),
      );
    case "misconception":
      return EXECUTIVE_INITIATIVE_LIBRARY.filter((a) =>
        ["market_education", "objection_handling", "trust_building"].includes(a.category),
      );
    case "competitive_weakness":
      return EXECUTIVE_INITIATIVE_LIBRARY.filter((a) =>
        ["competitive_differentiation", "positioning_refinement"].includes(a.category),
      );
    case "positioning_opportunity":
      return EXECUTIVE_INITIATIVE_LIBRARY.filter((a) =>
        ["positioning_refinement", "thought_leadership", "industry_standard_creation"].includes(
          a.category,
        ),
      );
    case "product_opportunity":
      return EXECUTIVE_INITIATIVE_LIBRARY.filter((a) =>
        ["product_improvement", "process_improvement", "ai_workflow"].includes(a.category),
      );
    case "reputation_opportunity":
      return EXECUTIVE_INITIATIVE_LIBRARY.filter((a) =>
        ["trust_building", "customer_success", "community_building"].includes(a.category),
      );
    case "emerging_opportunity":
      return EXECUTIVE_INITIATIVE_LIBRARY.filter((a) =>
        ["diagnostic_assessment", "market_education", "partnership_opportunity"].includes(
          a.category,
        ),
      );
    default:
      return EXECUTIVE_INITIATIVE_LIBRARY.filter((a) =>
        ["diagnostic_assessment", "sales_enablement", "objection_handling"].includes(a.category),
      );
  }
}

function archetypesForPsychology(input: {
  coreFear: string | null;
  desiredTransformation: string | null;
  hiddenMotivation: string | null;
}): ExecutiveInitiativeArchetype[] {
  const combined = [input.coreFear, input.desiredTransformation, input.hiddenMotivation]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    combined.includes("business") ||
    combined.includes("launch") ||
    combined.includes("income") ||
    combined.includes("client")
  ) {
    return EXECUTIVE_INITIATIVE_LIBRARY.filter((a) =>
      [
        "graduate_business_launch_framework",
        "business_readiness_index",
        "career_readiness_assessment",
        "implementation_roadmap",
      ].includes(a.id),
    );
  }
  if (
    combined.includes("enough") ||
    combined.includes("adequate") ||
    combined.includes("curriculum") ||
    combined.includes("training")
  ) {
    return EXECUTIVE_INITIATIVE_LIBRARY.filter((a) =>
      [
        "curriculum_trust_framework",
        "program_evaluation_scorecard",
        "industry_training_transparency_standard",
      ].includes(a.id),
    );
  }
  if (combined.includes("trust") || combined.includes("scam") || combined.includes("risk")) {
    return EXECUTIVE_INITIATIVE_LIBRARY.filter((a) =>
      ["trust_framework", "objection_handling_system", "student_success_diagnostic"].includes(a.id),
    );
  }
  return [];
}

function collectRecentInitiativeUsage(context: AthenaBrainContext): string[] {
  const recent: string[] = [];
  const deployment = context.executiveMemory.patternKnowledge.mostCommonDeploymentType;
  const recommendation = context.executiveMemory.patternKnowledge.mostCommonRecommendation;

  if (deployment === "webinar") recent.push("market_education");
  if (recommendation?.toLowerCase().includes("webinar")) recent.push("market_education");

  for (const asset of context.knowledgeMemory.assets.slice(0, 5)) {
    const assetType = (asset.assetType ?? "").toLowerCase();
    const title = (asset.title ?? "").toLowerCase();
    if (assetType.includes("webinar") || title.includes("webinar")) {
      recent.push("market_education");
    }
    if (title.includes("assessment") || title.includes("scorecard")) {
      recent.push("diagnostic_assessment");
    }
    if (title.includes("framework") || title.includes("roadmap")) {
      recent.push("sales_enablement");
    }
  }

  return [...new Set(recent)];
}

function buildCandidateFromArchetype(input: {
  archetype: ExecutiveInitiativeArchetype;
  index: number;
  intelligence: ExecutiveIntelligencePipeline;
  context: AthenaBrainContext;
  source: InitiativeCandidate["source"];
}): InitiativeCandidate {
  const { archetype, intelligence, context } = input;
  const hidden = intelligence.hiddenProblem.hiddenMarketProblem;
  const psychology = intelligence.buyerPsychology;
  const pattern = intelligence.executiveCognition.marketPatternClassification.primaryPattern;

  const whyChangesBusiness = `${archetype.businessValue} Addresses: ${hidden.slice(0, 120)}.`;
  const expectedLeverage =
    archetype.reusePotential === "high"
      ? "High — compounds authority and revenue over multiple cycles."
      : archetype.reusePotential === "medium"
        ? "Moderate — meaningful near-term impact with selective reuse."
        : "Targeted — immediate tactical leverage with limited reuse.";

  const revenueImpact =
    archetype.revenueMechanisms.includes("conversion_improvement")
      ? "Direct conversion improvement on current pipeline."
      : archetype.revenueMechanisms.includes("premium_pricing")
        ? "Enables premium positioning and margin expansion."
        : "Indirect revenue through qualification, retention, or referrals.";

  const authorityImpact = archetype.authorityValue;
  const implementationEffort =
    archetype.contentRequired ? ("medium" as const) : ("low" as const);
  const timeHorizon =
    archetype.reusePotential === "high" ? ("long_term" as const) : ("near_term" as const);
  const risk =
    archetype.category === "pricing_strategy"
      ? ("medium" as const)
      : archetype.contentRequired
        ? ("low" as const)
        : ("low" as const);

  const evidenceFromDiscussion = uniqueStrings([
    hidden,
    psychology.coreFear,
    psychology.desiredTransformation,
    intelligence.contrarianThinking.overlookedOpportunity,
    `Market pattern: ${pattern}`,
    context.discussionMemory.focus?.discussion?.title,
  ]).slice(0, 4);

  const customerTransformation =
    psychology.desiredTransformation ??
    `Buyers move from uncertainty to confident ${archetype.typicalObjectives[0]?.toLowerCase() ?? "decision"}.`;

  return {
    id: `${archetype.id}_${input.index}`,
    label: archetype.label,
    category: archetype.category,
    archetypeId: archetype.id,
    strategicDirection: `${archetype.category}_initiative`,
    source: input.source,
    whyChangesBusiness,
    expectedLeverage,
    revenueImpact,
    authorityImpact,
    implementationEffort,
    timeHorizon,
    risk,
    evidenceFromDiscussion,
    expectedCustomerTransformation: customerTransformation,
    contentRequired: archetype.contentRequired,
    preferredImplementationTypes: archetype.preferredImplementationTypes,
  };
}

export function generateInitiativeCandidates(input: {
  context: AthenaBrainContext;
  executiveReasoning: ExecutiveReasoning;
}): InitiativeCandidate[] {
  const intelligence = input.executiveReasoning.executiveIntelligence;
  const pattern = intelligence.executiveCognition.marketPatternClassification.primaryPattern;
  const psychology = intelligence.buyerPsychology;
  const direction = input.executiveReasoning.recommendedDirection.primary;

  const patternArchetypes = archetypesForPattern(pattern);
  const psychologyArchetypes = archetypesForPsychology(psychology);
  const directionArchetypes =
    direction === "consultative" || direction === "sales_first"
      ? EXECUTIVE_INITIATIVE_LIBRARY.filter((a) =>
          ["sales_enablement", "competitive_differentiation", "objection_handling"].includes(
            a.category,
          ),
        )
      : direction === "educational"
        ? EXECUTIVE_INITIATIVE_LIBRARY.filter((a) =>
            ["diagnostic_assessment", "market_education", "trust_building"].includes(a.category),
          )
        : EXECUTIVE_INITIATIVE_LIBRARY.filter((a) =>
            ["process_improvement", "customer_success", "retention_improvement"].includes(
              a.category,
            ),
          );

  const poolIds = uniqueStrings([
    ...psychologyArchetypes.map((a) => a.id),
    ...patternArchetypes.map((a) => a.id),
    ...directionArchetypes.map((a) => a.id),
    "career_readiness_assessment",
    "program_evaluation_scorecard",
    "business_readiness_index",
    "curriculum_trust_framework",
    "competitive_comparison_framework",
    "objection_handling_system",
    "implementation_roadmap",
    "trust_framework",
    "onboarding_redesign",
    "ai_workflow_assistant",
    "positioning_refinement",
    "authority_report",
    "industry_training_transparency_standard",
    "graduate_business_launch_framework",
    "student_success_diagnostic",
    "certification_framework",
    "partnership_ecosystem",
    "pricing_strategy_review",
    "community_activation",
    "market_diagnostic",
  ]);

  const archetypes = poolIds
    .map((id) => EXECUTIVE_INITIATIVE_LIBRARY.find((a) => a.id === id))
    .filter((a): a is ExecutiveInitiativeArchetype => Boolean(a))
    .slice(0, 14);

  return archetypes.map((archetype, index) => {
    const source: InitiativeCandidate["source"] =
      psychologyArchetypes.some((a) => a.id === archetype.id)
        ? "buyer_psychology"
        : patternArchetypes.some((a) => a.id === archetype.id)
          ? "market_pattern"
          : directionArchetypes.some((a) => a.id === archetype.id)
            ? "strategic_direction"
            : "initiative_library";
    return buildCandidateFromArchetype({
      archetype,
      index,
      intelligence,
      context: input.context,
      source,
    });
  });
}

function scoreInitiative(input: {
  candidate: InitiativeCandidate;
  context: AthenaBrainContext;
  intelligence: ExecutiveIntelligencePipeline;
  priority: string;
  recentUsage: string[];
}): InitiativeEvaluationScores {
  const { candidate, intelligence, context, priority, recentUsage } = input;
  const quality = intelligence.opportunityQuality;
  const differentiation = intelligence.strategicDifferentiation;
  const isBrainTrained = context.identityMemory.isBrainTrained;
  const stage = normalizeStage(
    context.discussionMemory.focus?.latestAnalysis?.buyer_stage ?? null,
  );
  const archetype = EXECUTIVE_INITIATIVE_LIBRARY.find((a) => a.id === candidate.archetypeId);
  const reusePotential = archetype?.reusePotential ?? "medium";

  let businessLeverage = quality.businessImpact;
  let customerTransformation = quality.psychologicalImportance;
  let strategicDifferentiation =
    differentiation.uniquePositioning.length * 12 +
    differentiation.executiveBrainSignals.length * 10 +
    (isBrainTrained ? 15 : 0);
  let authorityCreation = quality.authorityPositioning;
  let revenuePotential = quality.revenuePotential;
  let marketTiming =
    priority === "immediate_action" ? 85 : priority === "high_intent" ? 70 : 50;
  let defensibility = candidate.timeHorizon === "long_term" ? 70 : 45;
  let scalability = reusePotential === "high" ? 75 : reusePotential === "medium" ? 55 : 40;
  let evidenceStrength =
    candidate.evidenceFromDiscussion.length >= 3
      ? 75
      : candidate.evidenceFromDiscussion.length >= 2
        ? 60
        : 40;
  let longTermCompounding =
    candidate.timeHorizon === "long_term" ? 80 : candidate.implementationEffort === "low" ? 65 : 45;
  let easeOfExecution =
    candidate.implementationEffort === "low" ? 75 : candidate.implementationEffort === "medium" ? 55 : 35;
  let brandAlignment = isBrainTrained ? 70 : 45;
  let opportunityCost = candidate.contentRequired ? 55 : 75;
  let competitiveAdvantage = quality.competitiveDifferentiation;

  if (!candidate.contentRequired) {
    businessLeverage += 15;
    longTermCompounding += 10;
    opportunityCost += 15;
  }

  if (candidate.category === "diagnostic_assessment") {
    customerTransformation += 20;
    revenuePotential += 15;
    if (stage.includes("consideration") || stage.includes("decision")) {
      businessLeverage += 15;
    }
  }

  if (
    candidate.category === "curriculum_redesign" ||
    candidate.category === "industry_standard_creation"
  ) {
    strategicDifferentiation += 20;
    authorityCreation += 25;
    defensibility += 15;
  }

  if (candidate.category === "objection_handling" || candidate.category === "trust_building") {
    customerTransformation += 15;
    if (psychologyMatchesFear(intelligence.buyerPsychology.coreFear)) {
      evidenceStrength += 15;
    }
  }

  if (candidate.category === "process_improvement" || candidate.category === "ai_workflow") {
    businessLeverage += 20;
    scalability += 15;
    easeOfExecution -= 10;
  }

  if (WEBINAR_HEAVY_CATEGORIES.includes(candidate.category)) {
    businessLeverage -= WEBINAR_BIAS_PENALTY;
    strategicDifferentiation -= 15;
    longTermCompounding -= 10;
  }

  if (recentUsage.includes(candidate.category)) {
    businessLeverage -= REPEAT_INITIATIVE_PENALTY;
    strategicDifferentiation -= REPEAT_INITIATIVE_PENALTY;
  }

  if (candidate.label.toLowerCase().includes("webinar")) {
    businessLeverage -= WEBINAR_BIAS_PENALTY;
  }

  const scores: Omit<InitiativeEvaluationScores, "compositeScore"> = {
    businessLeverage: clamp(businessLeverage),
    customerTransformation: clamp(customerTransformation),
    strategicDifferentiation: clamp(strategicDifferentiation),
    authorityCreation: clamp(authorityCreation),
    revenuePotential: clamp(revenuePotential),
    marketTiming: clamp(marketTiming),
    defensibility: clamp(defensibility),
    scalability: clamp(scalability),
    evidenceStrength: clamp(evidenceStrength),
    longTermCompounding: clamp(longTermCompounding),
    easeOfExecution: clamp(easeOfExecution),
    brandAlignment: clamp(brandAlignment),
    opportunityCost: clamp(opportunityCost),
    competitiveAdvantage: clamp(competitiveAdvantage),
  };

  const compositeScore = Math.round(
    scores.businessLeverage * 0.16 +
      scores.customerTransformation * 0.1 +
      scores.strategicDifferentiation * 0.12 +
      scores.authorityCreation * 0.08 +
      scores.revenuePotential * 0.1 +
      scores.marketTiming * 0.06 +
      scores.defensibility * 0.06 +
      scores.scalability * 0.06 +
      scores.evidenceStrength * 0.08 +
      scores.longTermCompounding * 0.08 +
      scores.easeOfExecution * 0.04 +
      scores.brandAlignment * 0.03 +
      scores.opportunityCost * 0.02 +
      scores.competitiveAdvantage * 0.01,
  );

  return { ...scores, compositeScore };
}

function psychologyMatchesFear(coreFear: string | null): boolean {
  if (!coreFear) return false;
  const lower = coreFear.toLowerCase();
  return (
    lower.includes("trust") ||
    lower.includes("risk") ||
    lower.includes("scam") ||
    lower.includes("fail")
  );
}

function eliminateInitiative(input: {
  evaluated: EvaluatedInitiativeCandidate;
  context: AthenaBrainContext;
  intelligence: ExecutiveIntelligencePipeline;
  recentUsage: string[];
  topBusinessInitiativeScore: number;
  priority: string;
}): string | null {
  const { evaluated, intelligence, recentUsage, priority } = input;
  const { candidate, scores } = evaluated;

  if (scores.compositeScore < ELIMINATION_THRESHOLD) {
    return "Low leverage — composite score below executive initiative threshold.";
  }

  if (
    candidate.label.toLowerCase().includes("webinar") ||
    candidate.category === "market_education"
  ) {
    const hasStrongEvidence =
      scores.evidenceStrength >= 65 &&
      scores.businessLeverage >= 60 &&
      priority === "immediate_action";
    if (!hasStrongEvidence && scores.compositeScore < input.topBusinessInitiativeScore - 5) {
      return "Educational/webinar-style initiative objectively inferior to business transformation alternatives.";
    }
  }

  if (
    recentUsage.includes(candidate.category) &&
    scores.compositeScore < 58 &&
    scores.strategicDifferentiation < 55
  ) {
    return "Recently overused initiative category without sufficient advantage to repeat.";
  }

  if (
    CONTENT_ONLY_CATEGORIES.includes(candidate.category) &&
    !candidate.contentRequired &&
    scores.businessLeverage < 50
  ) {
    return "Content-only initiative when business/process transformation scores higher.";
  }

  if (scores.evidenceStrength < 35 && candidate.source === "initiative_library") {
    return "Insufficient discussion evidence for generic library initiative.";
  }

  if (
    candidate.category === "community_building" &&
    scores.businessLeverage < 48 &&
    intelligence.executiveCognition.executiveMemoryComparison.recurringObjections.length === 0
  ) {
    return "Community initiative lacks domain signal support for current discussion.";
  }

  return null;
}

function applyInitiativeDiversitySelection(input: {
  ranked: EvaluatedInitiativeCandidate[];
  recentUsage: string[];
}): { selected: EvaluatedInitiativeCandidate; diversityApplied: boolean } {
  if (input.ranked.length === 0) {
    throw new Error("No ranked executive initiatives available for selection.");
  }

  const [first, second] = input.ranked;
  const firstOverused = input.recentUsage.includes(first.candidate.category);
  const closeSecond =
    second && first.scores.compositeScore - second.scores.compositeScore <= DIVERSITY_SCORE_GAP;

  if (firstOverused && closeSecond && !input.recentUsage.includes(second.candidate.category)) {
    return { selected: second, diversityApplied: true };
  }

  if (firstOverused && input.ranked.length > 2) {
    const alternative = input.ranked.find(
      (entry, index) =>
        index > 0 &&
        !input.recentUsage.includes(entry.candidate.category) &&
        first.scores.compositeScore - entry.scores.compositeScore <= DIVERSITY_SCORE_GAP + 5,
    );
    if (alternative) {
      return { selected: alternative, diversityApplied: true };
    }
  }

  return { selected: first, diversityApplied: false };
}

function buildBusinessBeforeContentAssessment(input: {
  selected: EvaluatedInitiativeCandidate;
  intelligence: ExecutiveIntelligencePipeline;
  eliminated: EvaluatedInitiativeCandidate[];
}): BusinessBeforeContentAssessment {
  const { selected, intelligence, eliminated } = input;
  const contentAlternatives = eliminated.filter((e) =>
    WEBINAR_HEAVY_CATEGORIES.includes(e.candidate.category),
  );

  return {
    businessProblemSolved: intelligence.hiddenProblem.hiddenMarketProblem,
    highestLeverageRationale: `${selected.candidate.label} outranks alternatives because ${selected.candidate.whyChangesBusiness}`,
    businessChangeOutperformsContent: !selected.candidate.contentRequired
      ? "Yes — process, positioning, or tooling change creates greater durable value than publishing content."
      : contentAlternatives.length > 0
        ? "Content serves the initiative — but the initiative itself is the strategic decision, not the format."
        : "Content is required as implementation vehicle, but initiative selection precedes format.",
    contentRequired: selected.candidate.contentRequired,
    alternativeValuePaths: uniqueStrings([
      !selected.candidate.contentRequired ? "process_improvement" : null,
      "positioning_refinement",
      "diagnostic_assessment",
      "curriculum_redesign",
      "ai_workflow",
      "partnership_opportunity",
    ]),
    answeredAt: new Date().toISOString(),
  };
}

function buildSelectedInitiative(input: {
  selected: EvaluatedInitiativeCandidate;
  ranked: EvaluatedInitiativeCandidate[];
  eliminated: EvaluatedInitiativeCandidate[];
  intelligence: ExecutiveIntelligencePipeline;
  diversityApplied: boolean;
}): SelectedExecutiveInitiative {
  const archetype = EXECUTIVE_INITIATIVE_LIBRARY.find(
    (a) => a.id === input.selected.candidate.archetypeId,
  );
  const topAlternatives = input.ranked
    .filter((e) => e.candidate.id !== input.selected.candidate.id)
    .slice(0, 4);

  const whyNotAlternatives = [
    ...topAlternatives.map(
      (alt) =>
        `${alt.candidate.label}: score ${alt.scores.compositeScore} vs ${input.selected.scores.compositeScore} — ${alt.eliminationReason ?? "lower executive leverage"}`,
    ),
    ...input.eliminated.slice(0, 3).map(
      (rej) =>
        `${rej.candidate.label}: rejected — ${rej.eliminationReason ?? "eliminated"}`,
    ),
  ].slice(0, 6);

  const whyDefeatsAll = `Selected after evaluating ${input.ranked.length + input.eliminated.length} competing business initiatives. ${input.selected.candidate.label} achieves highest composite leverage (${input.selected.scores.compositeScore}) across business transformation, customer outcome, and long-term compounding dimensions.${input.diversityApplied ? " Diversity safeguard applied." : ""}`;

  return {
    initiativeLabel: input.selected.candidate.label,
    initiativeCategory: input.selected.candidate.category,
    archetypeId: input.selected.candidate.archetypeId,
    whyThisInitiative: whyDefeatsAll,
    whyNotAlternatives,
    whyNow:
      input.intelligence.executiveCognition.executiveReflection.whatMattersMost ??
      input.intelligence.contrarianThinking.strategicReframe,
    expectedBusinessOutcome: input.selected.candidate.whyChangesBusiness,
    expectedCustomerOutcome: input.selected.candidate.expectedCustomerTransformation,
    expectedAuthorityOutcome: input.selected.candidate.authorityImpact,
    expectedReuse:
      archetype?.reusePotential === "high"
        ? "High reuse across sales, community, and onboarding."
        : "Targeted reuse within current market cycle.",
    primarySuccessMetric:
      input.intelligence.buyerPsychology.primarySuccessMetric ??
      "Qualified buyer progression and conversion confidence",
    secondarySuccessMetric:
      input.intelligence.buyerPsychology.decisionTrigger ?? "Reduced objection cycle length",
    strategicConfidence: input.selected.scores.compositeScore,
    implementationApproach: inferImplementationApproach(input.selected.candidate),
    timeHorizon: input.selected.candidate.timeHorizon,
    revenueImpact: input.selected.candidate.revenueImpact,
    riskLevel: input.selected.candidate.risk,
    evidenceFromDiscussion: input.selected.candidate.evidenceFromDiscussion,
    decisionMatrixSummary: formatDecisionMatrixSummary(input.selected.scores),
  };
}

function formatDecisionMatrixSummary(scores: InitiativeEvaluationScores): string {
  return [
    `Business leverage: ${scores.businessLeverage}`,
    `Customer transformation: ${scores.customerTransformation}`,
    `Differentiation: ${scores.strategicDifferentiation}`,
    `Authority: ${scores.authorityCreation}`,
    `Revenue potential: ${scores.revenuePotential}`,
    `Long-term compounding: ${scores.longTermCompounding}`,
    `Evidence strength: ${scores.evidenceStrength}`,
  ].join("; ");
}

function inferImplementationApproach(candidate: InitiativeCandidate): string {
  if (!candidate.contentRequired) {
    return `Execute ${candidate.label} as business/process change first; content supports only where necessary.`;
  }
  const primary = candidate.preferredImplementationTypes[0];
  return `Implement ${candidate.label} via ${primary ?? "structured deployment asset"} — content is implementation, not strategy.`;
}

function deriveImplementationDeliverable(
  candidate: InitiativeCandidate,
): MarketingDeliverableRecommendation {
  const preferred = candidate.preferredImplementationTypes[0];
  if (preferred && !preferred.includes("Webinar") && !preferred.includes("Workshop")) {
    return preferred;
  }
  const nonWebinar = candidate.preferredImplementationTypes.find(
    (d) => !d.includes("Webinar") && !d.includes("Workshop"),
  );
  return nonWebinar ?? "Interactive Assessment";
}

export function buildImplementationStrategy(input: {
  selectedInitiative: SelectedExecutiveInitiative;
  candidate: InitiativeCandidate;
  intelligence: ExecutiveIntelligencePipeline;
}): ImplementationStrategy {
  const deliverable = deriveImplementationDeliverable(input.candidate);
  const archetype = EXECUTIVE_INITIATIVE_LIBRARY.find(
    (a) => a.id === input.selectedInitiative.archetypeId,
  );

  return {
    initiativeLabel: input.selectedInitiative.initiativeLabel,
    initiativeCategory: input.selectedInitiative.initiativeCategory,
    businessObjective: input.selectedInitiative.expectedBusinessOutcome,
    implementationDeliverable: deliverable,
    contentRequired: input.candidate.contentRequired,
    deploymentApproach: input.selectedInitiative.implementationApproach,
    channels: archetype?.idealDeploymentChannels ?? ["community", "email"],
    revenueMechanisms: archetype?.revenueMechanisms ?? ["conversion_improvement"],
    rationale: `Implementation of ${input.selectedInitiative.initiativeLabel} — assets express this initiative, not independent strategy.`,
  };
}

export function syncIntelligenceWithInitiativeSelection(input: {
  intelligence: ExecutiveIntelligencePipeline;
  initiativeSelection: ExecutiveInitiativeSelection;
  organizationId: string;
}): ExecutiveIntelligencePipeline {
  const { intelligence, initiativeSelection } = input;
  const selected = initiativeSelection.selectedInitiative;
  const implementation = initiativeSelection.implementationStrategy;
  const deliverable = implementation.implementationDeliverable;

  const updatedDecisionDocument: ExecutiveDecisionDocument = {
    ...intelligence.executiveDecisionSynthesis.selectedDecision.decisionDocument,
    businessObjective: selected.expectedBusinessOutcome,
    businessOpportunity: selected.initiativeLabel,
    recommendedAssetType: deliverable,
    assetSelectionReason: `Asset implements executive initiative "${selected.initiativeLabel}" — ${implementation.rationale}`,
    successMetric: selected.primarySuccessMetric,
  };

  const updatedDecision: ExecutiveDecision = {
    ...intelligence.executiveDecisionSynthesis.selectedDecision,
    chosenStrategy: deliverable,
    chosenStrategyLabel: selected.initiativeLabel,
    whyThisStrategy: selected.whyThisInitiative,
    whyNotAlternatives: selected.whyNotAlternatives,
    whyNow: selected.whyNow,
    expectedBusinessOutcome: selected.expectedBusinessOutcome,
    expectedCustomerOutcome: selected.expectedCustomerOutcome,
    expectedAuthorityOutcome: selected.expectedAuthorityOutcome,
    expectedReuse: selected.expectedReuse,
    primarySuccessMetric: selected.primarySuccessMetric,
    secondarySuccessMetric: selected.secondarySuccessMetric,
    strategicConfidence: selected.strategicConfidence,
    deploymentApproach: implementation.deploymentApproach,
    decisionDocument: updatedDecisionDocument,
  };

  const updatedSynthesis: ExecutiveDecisionSynthesis = {
    ...intelligence.executiveDecisionSynthesis,
    selectedDecision: updatedDecision,
    decisionTrace: {
      ...intelligence.executiveDecisionSynthesis.decisionTrace,
      chosenStrategy: deliverable,
      businessObjective: selected.expectedBusinessOutcome,
      expectedOutcome: selected.expectedCustomerOutcome,
      decisionConfidence: selected.strategicConfidence,
    },
  };

  return {
    ...intelligence,
    suggestedOpportunityTitle: selected.initiativeLabel,
    assetStrategy: {
      ...intelligence.assetStrategy,
      selectedAssetType: deliverable,
      selectionRationale: uniqueStrings([
        ...intelligence.assetStrategy.selectionRationale,
        selected.whyThisInitiative,
        `Initiative-first: ${selected.initiativeLabel}`,
      ]),
      alternativeAssetsConsidered: initiativeSelection.ranked
        .slice(1, 4)
        .map((e) => e.candidate.label),
      diversityAdjustment: initiativeSelection.decisionTrace.diversityApplied
        ? "Initiative diversity safeguard applied."
        : intelligence.assetStrategy.diversityAdjustment,
    },
    executiveRecommendation: ensureExecutiveRecommendation(
      intelligence.executiveRecommendation,
      {
        initiativeLabel: selected.initiativeLabel,
        rationale: implementation.rationale,
        businessOutcome: selected.expectedBusinessOutcome,
        assetType: deliverable,
        whyNow: selected.whyNow,
      },
    ),
    executiveDecisionSynthesis: updatedSynthesis,
    executiveCognition: {
      ...intelligence.executiveCognition,
      executiveDecisionDocument: updatedDecisionDocument,
      strategicCritic: {
        ...intelligence.executiveCognition.strategicCritic,
        finalAssetType: deliverable,
        assetRevised: deliverable !== intelligence.executiveCognition.strategicCritic.finalAssetType,
        strategistWouldApprove: true,
        critiqueNotes: uniqueStrings([
          ...intelligence.executiveCognition.strategicCritic.critiqueNotes,
          `Initiative selection chose ${selected.initiativeLabel} over ${initiativeSelection.candidatesGenerated - 1} alternatives.`,
        ]),
      },
    },
  };
}

export function buildExecutiveInitiativeSelection(input: {
  context: AthenaBrainContext;
  executiveReasoning: ExecutiveReasoning;
  executiveSummary: ExecutiveSummary;
  businessUnderstanding: BusinessUnderstanding;
  marketUnderstanding: MarketUnderstanding;
  strategicUnderstanding: StrategicUnderstanding;
  opportunityUnderstanding: OpportunityUnderstanding;
  priorityUnderstanding: PriorityUnderstanding;
}): ExecutiveInitiativeSelection {
  const intelligence = input.executiveReasoning.executiveIntelligence;
  const recentUsage = collectRecentInitiativeUsage(input.context);

  const candidates = generateInitiativeCandidates({
    context: input.context,
    executiveReasoning: input.executiveReasoning,
  });

  const evaluated: EvaluatedInitiativeCandidate[] = candidates.map((candidate) => {
    const scores = scoreInitiative({
      candidate,
      context: input.context,
      intelligence,
      priority: input.priorityUnderstanding.level,
      recentUsage,
    });
    return {
      candidate,
      scores,
      status: "ranked" as const,
      eliminationReason: null,
    };
  });

  const prelimTop = [...evaluated].sort(
    (a, b) => b.scores.compositeScore - a.scores.compositeScore,
  )[0]?.scores.compositeScore ?? 0;

  const eliminated: EvaluatedInitiativeCandidate[] = [];
  const surviving: EvaluatedInitiativeCandidate[] = [];

  for (const entry of evaluated) {
    const reason = eliminateInitiative({
      evaluated: entry,
      context: input.context,
      intelligence,
      recentUsage,
      topBusinessInitiativeScore: prelimTop,
      priority: input.priorityUnderstanding.level,
    });
    if (reason) {
      eliminated.push({ ...entry, status: "eliminated", eliminationReason: reason });
    } else {
      surviving.push(entry);
    }
  }

  const ranked = surviving.sort((a, b) => b.scores.compositeScore - a.scores.compositeScore);
  const { selected: selectedEvaluated, diversityApplied } = applyInitiativeDiversitySelection({
    ranked: ranked.length > 0 ? ranked : evaluated.sort((a, b) => b.scores.compositeScore - a.scores.compositeScore),
    recentUsage,
  });

  const selectedInitiative = buildSelectedInitiative({
    selected: selectedEvaluated,
    ranked,
    eliminated,
    intelligence,
    diversityApplied,
  });

  const businessBeforeContent = buildBusinessBeforeContentAssessment({
    selected: selectedEvaluated,
    intelligence,
    eliminated,
  });

  const implementationStrategy = buildImplementationStrategy({
    selectedInitiative,
    candidate: selectedEvaluated.candidate,
    intelligence,
  });

  const decisionTrace: InitiativeSelectionTrace = {
    organizationId: input.context.organization.id,
    timestamp: new Date().toISOString(),
    chosenInitiative: selectedInitiative.initiativeLabel,
    chosenCategory: selectedInitiative.initiativeCategory,
    rejectedInitiatives: eliminated.map((e) => ({
      initiative: e.candidate.label,
      category: e.candidate.category,
      reason: e.eliminationReason ?? "Outranked.",
    })),
    decisionConfidence: selectedInitiative.strategicConfidence,
    businessObjective: selectedInitiative.expectedBusinessOutcome,
    expectedOutcome: selectedInitiative.expectedCustomerOutcome,
    diversityApplied,
    candidateCount: candidates.length,
    eliminatedCount: eliminated.length,
    webinarBiasChecked: true,
  };

  return {
    selectionVersion: EXECUTIVE_INITIATIVE_SELECTION_VERSION,
    candidatesGenerated: candidates.length,
    possibilities: [...ranked, ...eliminated],
    eliminated,
    ranked,
    selectedInitiative,
    implementationStrategy,
    businessBeforeContent,
    decisionTrace,
  };
}

export function formatExecutiveInitiativeSelectionForPrompt(
  selection: ExecutiveInitiativeSelection,
): string {
  const selected = selection.selectedInitiative;
  const impl = selection.implementationStrategy;
  const gate = selection.businessBeforeContent;

  return [
    "EXECUTIVE INITIATIVE SELECTION (CANONICAL — DO NOT OVERRIDE):",
    "",
    "Strategy is the decision. Content is the implementation.",
    "All outputs must express this executive initiative — not independent asset choices.",
    "",
    `Selected initiative: ${selected.initiativeLabel} (${selected.initiativeCategory})`,
    `Why this initiative: ${selected.whyThisInitiative}`,
    `Why not alternatives: ${selected.whyNotAlternatives.join(" | ")}`,
    `Why now: ${selected.whyNow}`,
    `Expected business outcome: ${selected.expectedBusinessOutcome}`,
    `Expected customer outcome: ${selected.expectedCustomerOutcome}`,
    `Expected authority outcome: ${selected.expectedAuthorityOutcome}`,
    `Primary KPI: ${selected.primarySuccessMetric}`,
    `Secondary KPI: ${selected.secondarySuccessMetric}`,
    `Decision matrix: ${selected.decisionMatrixSummary}`,
    `Strategic confidence: ${selected.strategicConfidence}`,
    "",
    "IMPLEMENTATION STRATEGY (derived from initiative — not independent):",
    `- Implementation deliverable: ${impl.implementationDeliverable}`,
    `- Content required: ${impl.contentRequired ? "yes" : "no — business change first"}`,
    `- Deployment approach: ${impl.deploymentApproach}`,
    `- Channels: ${impl.channels.join(", ")}`,
    "",
    "BUSINESS BEFORE CONTENT (answered internally):",
    `- Business problem: ${gate.businessProblemSolved}`,
    `- Highest leverage rationale: ${gate.highestLeverageRationale}`,
    `- Business change vs content: ${gate.businessChangeOutperformsContent}`,
    `- Content required: ${gate.contentRequired}`,
    `- Alternative value paths considered: ${gate.alternativeValuePaths.join(", ")}`,
    "",
    selection.eliminated.length > 0
      ? `Rejected initiatives: ${selection.eliminated
          .slice(0, 4)
          .map((e) => `${e.candidate.label} (${e.eliminationReason})`)
          .join("; ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildSampleExecutiveInitiativeSelection(): ExecutiveInitiativeSelection {
  const mockCandidate: InitiativeCandidate = {
    id: "career_readiness_assessment_0",
    label: "Career Readiness Assessment",
    category: "diagnostic_assessment",
    archetypeId: "career_readiness_assessment",
    strategicDirection: "diagnostic_assessment_initiative",
    source: "buyer_psychology",
    whyChangesBusiness: "Converts curiosity into qualified demand.",
    expectedLeverage: "High — compounds authority and revenue.",
    revenueImpact: "Lead qualification and enrollment improvement.",
    authorityImpact: "Diagnostic authority positioning.",
    implementationEffort: "medium",
    timeHorizon: "long_term",
    risk: "low",
    evidenceFromDiscussion: ["Buyers fear business failure post-training"],
    expectedCustomerTransformation: "Confident career launch readiness.",
    contentRequired: true,
    preferredImplementationTypes: ["Interactive Assessment"],
  };

  const mockScores: InitiativeEvaluationScores = {
    businessLeverage: 78,
    customerTransformation: 82,
    strategicDifferentiation: 75,
    authorityCreation: 70,
    revenuePotential: 72,
    marketTiming: 65,
    defensibility: 68,
    scalability: 74,
    evidenceStrength: 71,
    longTermCompounding: 80,
    easeOfExecution: 58,
    brandAlignment: 65,
    opportunityCost: 60,
    competitiveAdvantage: 70,
    compositeScore: 74,
  };

  const evaluated: EvaluatedInitiativeCandidate = {
    candidate: mockCandidate,
    scores: mockScores,
    status: "ranked",
    eliminationReason: null,
  };

  const rejected: EvaluatedInitiativeCandidate = {
    candidate: {
      ...mockCandidate,
      id: "market_education_webinar",
      label: "Educational Webinar Series",
      category: "market_education",
      archetypeId: "market_diagnostic",
    },
    scores: { ...mockScores, compositeScore: 38, businessLeverage: 35 },
    status: "eliminated",
    eliminationReason: "Educational/webinar-style initiative objectively inferior to business transformation alternatives.",
  };

  const selectedInitiative: SelectedExecutiveInitiative = {
    initiativeLabel: "Career Readiness Assessment",
    initiativeCategory: "diagnostic_assessment",
    archetypeId: "career_readiness_assessment",
    whyThisInitiative: "Highest-leverage business initiative after multi-candidate evaluation.",
    whyNotAlternatives: ["Educational Webinar Series: rejected — low leverage"],
    whyNow: "Buyer psychology signals readiness gap, not content hunger.",
    expectedBusinessOutcome: "Qualified pipeline with readiness signals.",
    expectedCustomerOutcome: "Confident career launch readiness.",
    expectedAuthorityOutcome: "Diagnostic authority positioning.",
    expectedReuse: "High reuse across sales and community.",
    primarySuccessMetric: "Assessment completion and consultation booking rate",
    secondarySuccessMetric: "Objection reduction on business-readiness concerns",
    strategicConfidence: 74,
    implementationApproach: "Interactive assessment deployment with community and landing page.",
    timeHorizon: "long_term",
    revenueImpact: "Lead qualification improvement.",
    riskLevel: "low",
    evidenceFromDiscussion: ["Buyers fear business failure post-training"],
    decisionMatrixSummary: "Business leverage: 78; Customer transformation: 82",
  };

  return {
    selectionVersion: EXECUTIVE_INITIATIVE_SELECTION_VERSION,
    candidatesGenerated: 12,
    possibilities: [evaluated, rejected],
    eliminated: [rejected],
    ranked: [evaluated],
    selectedInitiative,
    implementationStrategy: {
      initiativeLabel: "Career Readiness Assessment",
      initiativeCategory: "diagnostic_assessment",
      businessObjective: "Qualified pipeline with readiness signals.",
      implementationDeliverable: "Interactive Assessment",
      contentRequired: true,
      deploymentApproach: "Assessment-first deployment.",
      channels: ["community", "landing_page"],
      revenueMechanisms: ["lead_qualification"],
      rationale: "Assessment implements initiative — not independent strategy.",
    },
    businessBeforeContent: {
      businessProblemSolved: "Buyers fear technical competence alone will not create business success.",
      highestLeverageRationale: "Assessment converts fear into actionable readiness data.",
      businessChangeOutperformsContent: "Content serves the initiative — initiative is the decision.",
      contentRequired: true,
      alternativeValuePaths: ["diagnostic_assessment", "process_improvement"],
      answeredAt: new Date().toISOString(),
    },
    decisionTrace: {
      organizationId: "sample-org",
      timestamp: new Date().toISOString(),
      chosenInitiative: "Career Readiness Assessment",
      chosenCategory: "diagnostic_assessment",
      rejectedInitiatives: [
        {
          initiative: "Educational Webinar Series",
          category: "market_education",
          reason: "Objectively inferior to business transformation alternative.",
        },
      ],
      decisionConfidence: 74,
      businessObjective: "Qualified pipeline.",
      expectedOutcome: "Confident buyers.",
      diversityApplied: false,
      candidateCount: 12,
      eliminatedCount: 1,
      webinarBiasChecked: true,
    },
  };
}
