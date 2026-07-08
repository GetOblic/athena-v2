import type { OpportunityPriorityKey } from "@/lib/opportunityPriority";
import type { MarketingDeliverableRecommendation } from "@/services/brain/executiveCoherence/executiveCoherenceTypes";
import {
  extractAudienceSignalsFromMasterProfile,
  extractTerminologyFromMasterProfile,
} from "@/services/brain/masterProfileHelpers";
import {
  buildExecutiveCognitionLayers,
  formatExecutiveCognitionForPrompt,
} from "@/services/brain/executiveCognitionHelpers";
import {
  buildExecutiveDecisionSynthesis,
  buildSampleExecutiveDecisionSynthesis,
  formatExecutiveDecisionSynthesisForPrompt,
} from "@/services/brain/executiveDecisionSynthesisHelpers";
import type {
  AssetStrategyAssessment,
  BuyerPsychologyAssessment,
  ContrarianThinkingAssessment,
  ExecutiveIntelligencePipeline,
  ExecutiveRecommendation,
  HiddenProblemAssessment,
  MarketUnderstandingAssessment,
  OpportunityQualityDimensions,
  PriorityAssessment,
  RecommendedDirection,
  StrategicDifferentiationAssessment,
} from "@/services/brain/executiveReasoningTypes";
import type { ExecutiveReasoningSourceContext } from "@/services/brain/executiveReasoningTypes";
import type { RecommendedDirectionKey } from "@/services/brain/executiveReasoningTypes";

export const EXECUTIVE_INTELLIGENCE_VERSION = "executive_initiative_selection_v1";

const OVERUSED_DELIVERABLES: MarketingDeliverableRecommendation[] = [
  "Executive Webinar",
  "Educational Guide",
  "Community Campaign",
];

const PLATFORM_DELIVERABLE_PREFERENCES: Record<
  string,
  MarketingDeliverableRecommendation[]
> = {
  reddit: [
    "Decision Framework",
    "Diagnostic Checklist",
    "Comparison Resource",
    "Educational Guide",
    "FAQ Resource",
    "Interactive Assessment",
  ],
  facebook: [
    "Community Campaign",
    "Educational Video",
    "FAQ Resource",
    "Multi-step Email Journey",
    "Educational Workshop",
  ],
  linkedin: [
    "Authority Whitepaper",
    "Case Study Collection",
    "Educational Guide",
    "Decision Framework",
    "Comparison Resource",
  ],
  instagram: [
    "Community Campaign",
    "Educational Video",
    "Diagnostic Checklist",
    "Downloadable Toolkit",
    "Lead Magnet",
  ],
};

const DIRECTION_DELIVERABLES: Record<
  RecommendedDirectionKey,
  MarketingDeliverableRecommendation[]
> = {
  educational: [
    "Educational Guide",
    "FAQ Resource",
    "Decision Framework",
    "Diagnostic Checklist",
    "Interactive Assessment",
  ],
  consultative: [
    "Decision Framework",
    "Comparison Resource",
    "Diagnostic Checklist",
    "Case Study Collection",
    "Interactive Assessment",
  ],
  sales_first: [
    "Case Study Collection",
    "Authority Whitepaper",
    "Trust-Building Landing Page",
    "Downloadable Toolkit",
  ],
  relationship_first: [
    "Multi-step Email Journey",
    "Trust-Building Landing Page",
    "Community Campaign",
    "Educational Workshop",
  ],
  monitor: [
    "FAQ Resource",
    "Diagnostic Checklist",
    "Educational Video",
    "Lead Magnet",
  ],
  escalate: [
    "Educational Workshop",
    "Executive Webinar",
    "Case Study Collection",
    "Authority Whitepaper",
  ],
};

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

function hashPick<T>(seed: string, options: T[]): T {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return options[hash % options.length] ?? options[0];
}

function compactText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readProfileStrings(
  profile: Record<string, unknown> | null,
  paths: string[][],
): string[] {
  if (!profile) return [];
  const values: string[] = [];
  for (const path of paths) {
    let current: unknown = profile;
    for (const segment of path) {
      if (!current || typeof current !== "object") {
        current = undefined;
        break;
      }
      current = (current as Record<string, unknown>)[segment];
    }
    if (typeof current === "string" && current.trim()) {
      values.push(current.trim());
    } else if (Array.isArray(current)) {
      values.push(
        ...current
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean),
      );
    }
  }
  return values;
}

export function normalizeDiscussionPlatform(platform: string | null | undefined): string {
  const normalized = (platform ?? "").toLowerCase();
  if (normalized.includes("reddit")) return "reddit";
  if (normalized.includes("facebook")) return "facebook";
  if (normalized.includes("linkedin")) return "linkedin";
  if (normalized.includes("instagram")) return "instagram";
  return "community";
}

function collectDiscussionText(context: ExecutiveReasoningSourceContext): string {
  const focus = context.discussionMemory.focus?.discussion;
  const analysis = context.discussionMemory.focus?.latestAnalysis;
  const thread = context.discussionMemory.focus?.threadUpdates ?? [];

  return uniqueStrings([
    focus?.title,
    focus?.summary,
    focus?.ai_notes,
    analysis?.summary,
    analysis?.pain_points,
    analysis?.opportunity_reason,
    ...thread.slice(-5).map((update) => update.body),
  ]).join(" ");
}

function inferDiscussionMaturity(
  context: ExecutiveReasoningSourceContext,
): MarketUnderstandingAssessment["discussionMaturity"] {
  const threadCount = context.discussionMemory.focus?.threadUpdates.length ?? 0;
  const analysisCount = context.executiveMemory.metadata.analysisCount;
  const textLength = collectDiscussionText(context).length;

  if (threadCount >= 4 || textLength >= 1200 || analysisCount >= 5) {
    return "mature";
  }
  if (threadCount >= 1 || textLength >= 400 || analysisCount >= 2) {
    return "developing";
  }
  return "early";
}

function inferSurfaceTopic(text: string, title: string | null): string {
  const combined = `${title ?? ""} ${text}`.toLowerCase();
  if (/training|course|certification|days|weeks|program/.test(combined)) {
    return "training program adequacy and career preparation";
  }
  if (/business|launch|clients|marketing|pricing/.test(combined)) {
    return "business launch and client acquisition readiness";
  }
  if (/trust|scam|quality|competence|credential/.test(combined)) {
    return "provider credibility and market trust";
  }
  if (/support|mentor|community|after/.test(combined)) {
    return "post-training support and ongoing guidance";
  }
  return title?.trim() || "market conversation about buyer readiness";
}

export function buildMarketUnderstandingAssessment(
  context: ExecutiveReasoningSourceContext,
): MarketUnderstandingAssessment {
  const focus = context.discussionMemory.focus?.discussion;
  const focusDomain = focus?.community_id
    ? context.domainMemory.domains.find((domain) => domain.id === focus.community_id)
    : context.domainMemory.domains[0];
  const text = collectDiscussionText(context);
  const platform = normalizeDiscussionPlatform(focus?.platform);

  const marketPattern =
    focusDomain?.emergingTrends?.trim() ||
    context.marketEvidence[0]?.value ||
    context.executiveMemory.patternKnowledge.mostCommonOpportunityReason ||
    null;

  return {
    marketPattern,
    industryContext:
      focusDomain?.market?.trim() ||
      focusDomain?.athenaUnderstanding?.trim() ||
      context.snapshot.marketSummary ||
      null,
    discussionMaturity: inferDiscussionMaturity(context),
    platform,
    surfaceTopic: inferSurfaceTopic(text, focus?.title ?? null),
  };
}

function inferHiddenProblem(input: {
  surfaceTopic: string;
  text: string;
  objections: string[];
  painPoints: string[];
  audienceSignals: ReturnType<typeof extractAudienceSignalsFromMasterProfile>;
}): HiddenProblemAssessment {
  const combined = `${input.text} ${input.objections.join(" ")} ${input.painPoints.join(" ")}`.toLowerCase();
  let hiddenMarketProblem =
    "Buyers are evaluating providers based on confidence they can succeed after training, not just technical curriculum length.";
  let surfaceInterpretation = "People need better training information.";
  let foundationalInsight =
    "The purchase driver is business launch confidence, not course duration alone.";

  if (/day|week|month|duration|long enough|short/.test(combined)) {
    hiddenMarketProblem =
      "The market increasingly distrusts short-format education because students fear technical competence alone will not create a successful business.";
    surfaceInterpretation = "People are debating whether training duration is sufficient.";
    foundationalInsight =
      "Course duration is not the real purchase driver — students are buying confidence they can launch successfully.";
  } else if (/business|launch|client|income|marketing/.test(combined)) {
    hiddenMarketProblem =
      "Career changers fear investing in education that teaches technique without business systems, mentorship, or post-training support.";
    surfaceInterpretation = "People need business guidance after training.";
    foundationalInsight =
      "Business launch confidence and long-term support are becoming primary purchase drivers over curriculum features.";
  } else if (/trust|scam|quality|competence|before\/after/.test(combined)) {
    hiddenMarketProblem =
      "Market skepticism is rising because buyers cannot distinguish credible clinical expertise from low-quality short-course providers.";
    surfaceInterpretation = "People question provider quality and credibility.";
    foundationalInsight =
      "Clinical credibility and restorative expertise are becoming competitive moats in a market flooded with quick certifications.";
  } else if (/support|mentor|community|after|alone/.test(combined)) {
    hiddenMarketProblem =
      "Students fear being abandoned after certification without mentorship, community, or practical business guidance.";
    surfaceInterpretation = "People want more support after training.";
    foundationalInsight =
      "Long-term student support and institution-level education are becoming stronger differentiators than initial course content.";
  } else if (input.audienceSignals.commonObjections[0]) {
    hiddenMarketProblem = `Underlying market tension: ${input.audienceSignals.commonObjections[0]}`;
    surfaceInterpretation = `Surface discussion about ${input.surfaceTopic}.`;
    foundationalInsight =
      "The explicit conversation masks a deeper buyer confidence and trust problem.";
  }

  const signalStrength =
    (input.objections.length > 0 ? 20 : 0) +
    (input.painPoints.length > 0 ? 20 : 0) +
    (input.text.length > 200 ? 25 : 10) +
    (input.audienceSignals.commonObjections.length > 0 ? 15 : 0);

  return {
    hiddenMarketProblem,
    surfaceInterpretation,
    foundationalInsight,
    confidence: Math.min(95, Math.max(35, signalStrength + 20)),
  };
}

export function buildHiddenProblemAssessment(
  context: ExecutiveReasoningSourceContext,
  marketUnderstanding: MarketUnderstandingAssessment,
): HiddenProblemAssessment {
  const text = collectDiscussionText(context);
  const objections = [
    ...context.marketEvidence
      .filter((entry) => entry.category === "objection")
      .slice(0, 5)
      .map((entry) => entry.value),
    ...extractAudienceSignalsFromMasterProfile(context.identityMemory.masterProfile)
      .commonObjections,
  ];
  const painPoints = context.executiveMemory.painPointKnowledge
    .slice(0, 5)
    .map((entry) => entry.painPoint);
  const audienceSignals = extractAudienceSignalsFromMasterProfile(
    context.identityMemory.masterProfile,
  );

  return inferHiddenProblem({
    surfaceTopic: marketUnderstanding.surfaceTopic ?? "market discussion",
    text,
    objections,
    painPoints,
    audienceSignals,
  });
}

function inferBuyerStage(context: ExecutiveReasoningSourceContext): string {
  return (
    context.discussionMemory.focus?.latestAnalysis?.buyer_stage ??
    "aware"
  ).toLowerCase();
}

export function buildBuyerPsychologyAssessment(
  context: ExecutiveReasoningSourceContext,
  hiddenProblem: HiddenProblemAssessment,
): BuyerPsychologyAssessment {
  const stage = inferBuyerStage(context);
  const objections = [
    ...context.marketEvidence
      .filter((entry) => entry.category === "objection")
      .slice(0, 5)
      .map((entry) => entry.value),
    ...extractAudienceSignalsFromMasterProfile(context.identityMemory.masterProfile)
      .commonObjections,
  ];
  const audienceSignals = extractAudienceSignalsFromMasterProfile(
    context.identityMemory.masterProfile,
  );
  const primaryObjection = objections[0] ?? audienceSignals.commonObjections[0] ?? null;
  const primaryQuestion = audienceSignals.commonQuestions[0] ?? null;

  const coreFear =
    stage.includes("decision") || stage.includes("high_intent")
      ? "Making an expensive mistake or choosing the wrong provider."
      : stage.includes("consideration")
        ? "Investing time and money without proof of real-world success."
        : "Starting a career change without confidence the path actually works.";

  const desiredTransformation =
    stage.includes("decision") || stage.includes("high_intent")
      ? "Confident commitment to a provider that de-risks the decision."
      : "Clarity on whether this career path is viable and supported long-term.";

  return {
    coreFear,
    desiredTransformation,
    emotionalBlocker:
      primaryObjection ??
      "Distrust that surface marketing claims match real graduate outcomes.",
    decisionTrigger:
      primaryQuestion ??
      "Evidence that graduates successfully launch and sustain a business.",
    trustRequirement:
      "Clinical credibility, transparent outcomes, and non-salesy expertise-led guidance.",
    perceivedRisk:
      hiddenProblem.hiddenMarketProblem.includes("distrust")
        ? "Choosing a low-quality provider that leaves them unprepared."
        : "Wasting money on training that does not translate to income.",
    hiddenMotivation:
      "Seeking identity transformation and professional legitimacy, not just a skill certificate.",
    missingConfidence:
      hiddenProblem.foundationalInsight.includes("confidence")
        ? "Confidence that technical training translates into business success."
        : "Confidence that this provider uniquely de-risks their career transition.",
    urgencySource:
      stage.includes("high_intent") || stage.includes("decision")
        ? "Active evaluation window — buyer is comparing options now."
        : "Growing market skepticism creating pressure to decide before bad providers dominate.",
    primarySuccessMetric:
      stage.includes("decision") || stage.includes("high_intent")
        ? "Signed enrollment or booked consultation."
        : "Reduced uncertainty and increased trust in a credible path forward.",
  };
}

export function buildStrategicDifferentiationAssessment(
  context: ExecutiveReasoningSourceContext,
  hiddenProblem: HiddenProblemAssessment,
): StrategicDifferentiationAssessment {
  const profile = context.identityMemory.masterProfile;
  const businessKnowledge = context.executiveMemory.businessKnowledge;
  const expertise = compactText(context.identityMemory.expertise);
  const positioning = compactText(context.identityMemory.aboutYou);
  const terminology = extractTerminologyFromMasterProfile(profile);
  const audienceSignals = extractAudienceSignalsFromMasterProfile(profile);

  const profileDifferentiators = readProfileStrings(profile, [
    ["expertise", "differentiators"],
    ["expertise", "unique_advantages"],
    ["persona", "differentiation"],
    ["business", "differentiators"],
    ["methodology"],
  ]);

  const executiveBrainSignals = uniqueStrings([
    expertise ? `Expertise: ${expertise}` : null,
    positioning ? `Positioning: ${positioning.slice(0, 180)}` : null,
    businessKnowledge.homepageLearning?.slice(0, 180) ??
      context.identityMemory.homepageLearning?.slice(0, 180) ??
      null,
    ...terminology.slice(0, 6).map((term) => `Terminology: ${term}`),
    ...audienceSignals.offers.slice(0, 3).map((offer) => `Offer: ${offer}`),
    ...context.executiveMemory.businessKnowledge.businessConstraints
      .slice(0, 3)
      .map((rule) => `Constraint: ${rule}`),
  ]);

  const uniquePositioning = uniqueStrings([
    ...profileDifferentiators,
    expertise,
    positioning,
    context.identityMemory.aboutYou,
    ...terminology.slice(0, 4),
  ]).slice(0, 8);

  const competitiveAdvantage = uniqueStrings([
    hiddenProblem.foundationalInsight,
    ...executiveBrainSignals,
    context.executiveMemory.patternKnowledge.mostCommonRecommendation
      ? `Proven approach: ${context.executiveMemory.patternKnowledge.mostCommonRecommendation}`
      : null,
  ]).slice(0, 6);

  const differentiationStatement =
    uniquePositioning.length > 0
      ? `This business is uniquely positioned through ${uniquePositioning.slice(0, 3).join(", ")} to address: ${hiddenProblem.hiddenMarketProblem}`
      : `Apply business identity and executive brain context to address: ${hiddenProblem.hiddenMarketProblem}`;

  return {
    uniquePositioning,
    competitiveAdvantage,
    executiveBrainSignals,
    differentiationStatement,
    recommendationsMustReflect: uniqueStrings([
      ...uniquePositioning.slice(0, 4),
      hiddenProblem.foundationalInsight,
      "Recommendations must not apply equally to every competitor in this market.",
    ]),
  };
}

export function buildContrarianThinkingAssessment(
  hiddenProblem: HiddenProblemAssessment,
  marketUnderstanding: MarketUnderstandingAssessment,
): ContrarianThinkingAssessment {
  return {
    conventionalAssumption: hiddenProblem.surfaceInterpretation,
    assumptionChallenge: hiddenProblem.foundationalInsight,
    overlookedOpportunity: hiddenProblem.hiddenMarketProblem,
    surpriseInsight: `What would surprise a strategist: ${hiddenProblem.foundationalInsight}`,
    strategicReframe: `Reframe from "${marketUnderstanding.surfaceTopic}" to "${hiddenProblem.hiddenMarketProblem.slice(0, 120)}"`,
    emergingTrend:
      marketUnderstanding.marketPattern ??
      "Buyer confidence and business-readiness are overtaking curriculum features as decision criteria.",
  };
}

function collectRecentDeliverableUsage(
  context: ExecutiveReasoningSourceContext,
): MarketingDeliverableRecommendation[] {
  const recent: MarketingDeliverableRecommendation[] = [];
  const deployment = context.executiveMemory.patternKnowledge.mostCommonDeploymentType;
  const recommendation =
    context.executiveMemory.patternKnowledge.mostCommonRecommendation;

  const deploymentMap: Record<string, MarketingDeliverableRecommendation> = {
    pdf_guide: "Educational Guide",
    webinar: "Executive Webinar",
    carousel: "Community Campaign",
    checklist: "Diagnostic Checklist",
    framework: "Decision Framework",
    lead_magnet: "Lead Magnet",
    email_sequence: "Multi-step Email Journey",
    landing_page: "Trust-Building Landing Page",
    video_script: "Educational Video",
  };

  if (deployment && deploymentMap[deployment]) {
    recent.push(deploymentMap[deployment]);
  }

  if (recommendation) {
    const normalized = recommendation as MarketingDeliverableRecommendation;
    if (!recent.includes(normalized)) {
      recent.push(normalized);
    }
  }

  for (const asset of context.knowledgeMemory.assets.slice(0, 5)) {
    const assetType = asset.assetType?.toLowerCase() ?? "";
    if (assetType.includes("webinar")) recent.push("Executive Webinar");
    if (assetType.includes("guide")) recent.push("Educational Guide");
    if (assetType.includes("carousel")) recent.push("Community Campaign");
  }

  return [...new Set(recent)];
}

function scoreDeliverableCandidate(input: {
  deliverable: MarketingDeliverableRecommendation;
  platform: string;
  direction: RecommendedDirectionKey;
  stageKey: string;
  priority: OpportunityPriorityKey;
  recentUsage: MarketingDeliverableRecommendation[];
  seed: string;
}): number {
  let score = 0;
  const platformPrefs = PLATFORM_DELIVERABLE_PREFERENCES[input.platform] ?? [];
  const directionPrefs = DIRECTION_DELIVERABLES[input.direction] ?? [];

  if (platformPrefs.includes(input.deliverable)) score += 30;
  if (directionPrefs.includes(input.deliverable)) score += 25;

  if (input.stageKey === "unaware" || input.stageKey === "aware") {
    if (
      ["Educational Guide", "FAQ Resource", "Community Campaign", "Educational Video"].includes(
        input.deliverable,
      )
    ) {
      score += 15;
    }
  }

  if (input.stageKey === "consideration") {
    if (
      ["Decision Framework", "Comparison Resource", "Diagnostic Checklist"].includes(
        input.deliverable,
      )
    ) {
      score += 20;
    }
  }

  if (
    input.stageKey === "decision" ||
    input.stageKey === "high_intent" ||
    input.priority === "immediate_action"
  ) {
    if (
      ["Case Study Collection", "Trust-Building Landing Page", "Interactive Assessment"].includes(
        input.deliverable,
      )
    ) {
      score += 20;
    }
  }

  if (input.recentUsage.includes(input.deliverable)) score -= 25;
  if (
    OVERUSED_DELIVERABLES.includes(input.deliverable) &&
    input.recentUsage.some((item) => OVERUSED_DELIVERABLES.includes(item))
  ) {
    score -= 15;
  }

  score += hashPick(`${input.seed}|${input.deliverable}`, [0, 1, 2, 3, 4, 5]);
  return score;
}

function normalizeStageKey(buyerStage: string | null): string {
  const stage = (buyerStage ?? "aware").toLowerCase();
  if (stage.includes("unaware")) return "unaware";
  if (stage.includes("high_intent") || stage.includes("high intent")) return "high_intent";
  if (stage.includes("decision")) return "decision";
  if (stage.includes("consideration")) return "consideration";
  if (stage.includes("aware")) return "aware";
  return "aware";
}

export function buildAssetStrategyAssessment(input: {
  context: ExecutiveReasoningSourceContext;
  direction: RecommendedDirection;
  priority: PriorityAssessment;
  marketUnderstanding: MarketUnderstandingAssessment;
  buyerPsychology: BuyerPsychologyAssessment;
  differentiation: StrategicDifferentiationAssessment;
}): AssetStrategyAssessment {
  const stageKey = normalizeStageKey(
    input.context.discussionMemory.focus?.latestAnalysis?.buyer_stage ?? null,
  );
  const platform = input.marketUnderstanding.platform ?? "community";
  const recentUsage = collectRecentDeliverableUsage(input.context);
  const seed = [
    input.context.organization.id,
    input.context.discussionMemory.focus?.discussion?.id ?? "",
    input.direction.primary,
    stageKey,
    platform,
  ].join("|");

  const candidates = uniqueStrings([
    ...(PLATFORM_DELIVERABLE_PREFERENCES[platform] ?? []),
    ...(DIRECTION_DELIVERABLES[input.direction.primary] ?? []),
    "Decision Framework",
    "Diagnostic Checklist",
    "Interactive Assessment",
    "Case Study Collection",
    "Educational Workshop",
    "Downloadable Toolkit",
  ]) as MarketingDeliverableRecommendation[];

  const scored = candidates
    .map((deliverable) => ({
      deliverable,
      score: scoreDeliverableCandidate({
        deliverable,
        platform,
        direction: input.direction.primary,
        stageKey,
        priority: input.priority.level,
        recentUsage,
        seed,
      }),
    }))
    .sort((a, b) => b.score - a.score);

  const selected = scored[0]?.deliverable ?? "Decision Framework";
  const alternatives = scored.slice(1, 4).map((entry) => entry.deliverable);
  const diversityAdjustment =
    recentUsage.includes(selected) && scored[1]
      ? `Diversity guardrail shifted away from recently used ${selected} toward ${scored[1].deliverable}.`
      : recentUsage.some((item) => OVERUSED_DELIVERABLES.includes(item))
        ? "Reduced weight on overused webinar/guide/carousel defaults."
        : null;

  const selectionRationale = uniqueStrings([
    `Platform (${platform}) favors ${PLATFORM_DELIVERABLE_PREFERENCES[platform]?.slice(0, 3).join(", ") ?? "community-native formats"}.`,
    `Buyer stage (${stageKey}) and direction (${input.direction.primary}) informed asset selection.`,
    buyPsychologyRationale(input.buyerPsychology),
    input.differentiation.differentiationStatement,
    diversityAdjustment,
  ]);

  return {
    selectedAssetType: diversityAdjustment && scored[1] ? scored[1].deliverable : selected,
    selectionRationale,
    platformInfluence: [
      `Origin platform: ${platform}`,
      `Preferred formats: ${(PLATFORM_DELIVERABLE_PREFERENCES[platform] ?? ["Decision Framework"]).slice(0, 4).join(", ")}`,
    ],
    alternativeAssetsConsidered: alternatives,
    diversityAdjustment,
  };
}

function buyPsychologyRationale(psychology: BuyerPsychologyAssessment): string {
  return `Buyer psychology: core fear (${psychology.coreFear?.slice(0, 80)}), decision trigger (${psychology.decisionTrigger?.slice(0, 80)}).`;
}

export function buildExecutiveRecommendation(input: {
  assetStrategy: AssetStrategyAssessment;
  buyerPsychology: BuyerPsychologyAssessment;
  hiddenProblem: HiddenProblemAssessment;
  differentiation: StrategicDifferentiationAssessment;
  marketUnderstanding: MarketUnderstandingAssessment;
  priority: PriorityAssessment;
}): ExecutiveRecommendation {
  const asset = input.assetStrategy.selectedAssetType;
  const effortMap: Record<string, ExecutiveRecommendation["estimatedEffort"]> = {
    "Community Campaign": "low",
    "FAQ Resource": "low",
    "Diagnostic Checklist": "low",
    "Educational Video": "medium",
    "Decision Framework": "medium",
    "Comparison Resource": "medium",
    "Educational Guide": "medium",
    "Lead Magnet": "medium",
    "Multi-step Email Journey": "medium",
    "Case Study Collection": "high",
    "Authority Whitepaper": "high",
    "Executive Webinar": "high",
    "Educational Workshop": "high",
    "Trust-Building Landing Page": "medium",
    "Interactive Assessment": "medium",
    "Downloadable Toolkit": "medium",
  };

  const reuseMap: Record<string, ExecutiveRecommendation["estimatedReusePotential"]> = {
    "Decision Framework": "high",
    "Diagnostic Checklist": "high",
    "FAQ Resource": "high",
    "Educational Guide": "high",
    "Authority Whitepaper": "high",
    "Case Study Collection": "high",
    "Community Campaign": "medium",
    "Educational Video": "medium",
    "Executive Webinar": "medium",
    "Lead Magnet": "medium",
    "Multi-step Email Journey": "medium",
    "Comparison Resource": "high",
    "Interactive Assessment": "high",
    "Downloadable Toolkit": "high",
    "Educational Workshop": "medium",
    "Trust-Building Landing Page": "medium",
  };

  return {
    whyThisAsset: `${asset} directly addresses ${input.hiddenProblem.foundationalInsight.slice(0, 120)} while leveraging ${input.differentiation.uniquePositioning[0] ?? "executive brain positioning"}.`,
    whyNow: input.priority.rationale[0] ?? `Discussion maturity: ${input.marketUnderstanding.discussionMaturity}.`,
    expectedBusinessOutcome:
      input.priority.level === "immediate_action" || input.priority.level === "high_intent"
        ? "Convert high-intent evaluators into qualified conversations."
        : "Build authority and advance buyer confidence before conversion.",
    targetAudience:
      input.buyerPsychology.desiredTransformation ??
      "Buyers evaluating career and provider options.",
    conversionMechanism:
      input.buyerPsychology.decisionTrigger ??
      "Trust-building education leading to consultation or enrollment.",
    estimatedEffort: effortMap[asset] ?? "medium",
    estimatedReusePotential: reuseMap[asset] ?? "medium",
    strategicRationale: input.assetStrategy.selectionRationale.join(" "),
  };
}

export function buildSuggestedOpportunityTitle(input: {
  hiddenProblem: HiddenProblemAssessment;
  marketUnderstanding: MarketUnderstandingAssessment;
  contrarian: ContrarianThinkingAssessment;
}): string {
  const problem = input.hiddenProblem.hiddenMarketProblem;
  if (problem.length <= 90) {
    return problem.endsWith(".") ? problem.slice(0, -1) : problem;
  }

  const trend = input.contrarian.emergingTrend;
  if (trend && trend.length <= 90) {
    return trend.endsWith(".") ? trend.slice(0, -1) : trend;
  }

  return input.hiddenProblem.foundationalInsight.endsWith(".")
    ? input.hiddenProblem.foundationalInsight.slice(0, -1)
    : input.hiddenProblem.foundationalInsight;
}

export function buildOpportunityQualityScore(input: {
  context: ExecutiveReasoningSourceContext;
  priority: PriorityAssessment;
  hiddenProblem: HiddenProblemAssessment;
  buyerPsychology: BuyerPsychologyAssessment;
  differentiation: StrategicDifferentiationAssessment;
  aiConfidence?: number;
}): OpportunityQualityDimensions {
  const priorityScore =
    input.priority.level === "immediate_action"
      ? 90
      : input.priority.level === "high_intent"
        ? 75
        : input.priority.level === "monitor"
          ? 45
          : 25;

  const evidenceCount = input.context.marketEvidence.length;
  const memoryDepth = input.context.executiveMemory.metadata.discussionCount;
  const learningDepth =
    input.context.executiveLearning.briefingLearning.approved;

  const dimensions: Omit<OpportunityQualityDimensions, "compositeScore"> = {
    businessImpact: Math.min(
      100,
      priorityScore * 0.5 +
        (input.context.identityMemory.isBrainTrained ? 25 : 10) +
        input.hiddenProblem.confidence * 0.25,
    ),
    revenuePotential: Math.min(
      100,
      priorityScore * 0.6 +
        (input.priority.level === "immediate_action" ? 20 : 0) +
        (input.aiConfidence ?? 0) * 0.2,
    ),
    marketFrequency: Math.min(
      100,
      evidenceCount * 12 +
        memoryDepth * 5 +
        (input.context.domainMemory.activeDomainCount ?? 0) * 8,
    ),
    competitiveDifferentiation: Math.min(
      100,
      input.differentiation.uniquePositioning.length * 12 +
        input.differentiation.executiveBrainSignals.length * 8 +
        (input.context.identityMemory.isBrainTrained ? 20 : 5),
    ),
    authorityPositioning: Math.min(
      100,
      (input.context.identityMemory.completenessScore ?? 0) * 0.5 +
        learningDepth * 10 +
        (input.differentiation.competitiveAdvantage.length > 2 ? 20 : 10),
    ),
    contentLeverage: Math.min(
      100,
      evidenceCount * 10 +
        (input.context.executiveMemory.patternKnowledge.mostCommonRecommendation ? 25 : 10),
    ),
    executiveUrgency: priorityScore,
    reusability: Math.min(
      100,
      memoryDepth * 8 +
        learningDepth * 12 +
        (input.context.executiveMemory.metadata.knowledgeAssetCount > 3 ? 20 : 10),
    ),
    buyerIntent: Math.min(100, (input.aiConfidence ?? priorityScore * 0.7)),
    psychologicalImportance: Math.min(
      100,
      input.hiddenProblem.confidence * 0.6 +
        (input.buyerPsychology.coreFear ? 20 : 0) +
        (input.buyerPsychology.emotionalBlocker ? 15 : 0),
    ),
  };

  const compositeScore = Math.round(
    dimensions.businessImpact * 0.12 +
      dimensions.revenuePotential * 0.1 +
      dimensions.marketFrequency * 0.1 +
      dimensions.competitiveDifferentiation * 0.12 +
      dimensions.authorityPositioning * 0.1 +
      dimensions.contentLeverage * 0.08 +
      dimensions.executiveUrgency * 0.12 +
      dimensions.reusability * 0.08 +
      dimensions.buyerIntent * 0.08 +
      dimensions.psychologicalImportance * 0.1,
  );

  return { ...dimensions, compositeScore };
}

export function buildExecutiveIntelligencePipeline(input: {
  context: ExecutiveReasoningSourceContext;
  direction: RecommendedDirection;
  priority: PriorityAssessment;
}): ExecutiveIntelligencePipeline {
  const marketUnderstanding = buildMarketUnderstandingAssessment(input.context);
  const hiddenProblem = buildHiddenProblemAssessment(input.context, marketUnderstanding);
  const buyerPsychology = buildBuyerPsychologyAssessment(input.context, hiddenProblem);
  const strategicDifferentiation = buildStrategicDifferentiationAssessment(
    input.context,
    hiddenProblem,
  );
  const contrarianThinking = buildContrarianThinkingAssessment(
    hiddenProblem,
    marketUnderstanding,
  );
  const assetStrategy = buildAssetStrategyAssessment({
    context: input.context,
    direction: input.direction,
    priority: input.priority,
    marketUnderstanding,
    buyerPsychology,
    differentiation: strategicDifferentiation,
  });
  const executiveRecommendation = buildExecutiveRecommendation({
    assetStrategy,
    buyerPsychology,
    hiddenProblem,
    differentiation: strategicDifferentiation,
    marketUnderstanding,
    priority: input.priority,
  });
  const opportunityQuality = buildOpportunityQualityScore({
    context: input.context,
    priority: input.priority,
    hiddenProblem,
    buyerPsychology,
    differentiation: strategicDifferentiation,
  });
  const suggestedOpportunityTitle = buildSuggestedOpportunityTitle({
    hiddenProblem,
    marketUnderstanding,
    contrarian: contrarianThinking,
  });

  const executiveCognition = buildExecutiveCognitionLayers({
    context: input.context,
    marketUnderstanding,
    hiddenProblem,
    buyerPsychology,
    differentiation: strategicDifferentiation,
    contrarian: contrarianThinking,
    assetStrategy,
    executiveRecommendation,
    suggestedOpportunityTitle,
  });

  const finalAssetStrategy: AssetStrategyAssessment =
    executiveCognition.strategicCritic.assetRevised
      ? {
          ...assetStrategy,
          selectedAssetType: executiveCognition.strategicCritic.finalAssetType,
          selectionRationale: uniqueStrings([
            ...assetStrategy.selectionRationale,
            executiveCognition.strategicCritic.revisedRecommendation,
          ]),
        }
      : assetStrategy;

  const finalRecommendation: ExecutiveRecommendation =
    executiveCognition.strategicCritic.assetRevised
      ? buildExecutiveRecommendation({
          assetStrategy: finalAssetStrategy,
          buyerPsychology,
          hiddenProblem,
          differentiation: strategicDifferentiation,
          marketUnderstanding,
          priority: input.priority,
        })
      : executiveRecommendation;

  const executiveDecisionSynthesis = buildExecutiveDecisionSynthesis({
    context: input.context,
    direction: input.direction,
    priority: input.priority,
    pipeline: {
      pipelineVersion: EXECUTIVE_INTELLIGENCE_VERSION,
      marketUnderstanding,
      hiddenProblem,
      buyerPsychology,
      strategicDifferentiation,
      contrarianThinking,
      assetStrategy: finalAssetStrategy,
      executiveRecommendation: finalRecommendation,
      opportunityQuality,
      suggestedOpportunityTitle,
      executiveCognition,
    },
  });

  const selectedDeliverable =
    executiveDecisionSynthesis.selectedDecision.chosenStrategy;
  const synthesisAssetStrategy: AssetStrategyAssessment = {
    ...finalAssetStrategy,
    selectedAssetType: selectedDeliverable,
    selectionRationale: uniqueStrings([
      ...finalAssetStrategy.selectionRationale,
      executiveDecisionSynthesis.selectedDecision.whyThisStrategy,
    ]),
    alternativeAssetsConsidered: executiveDecisionSynthesis.ranked
      .slice(1, 4)
      .map((entry) => entry.candidate.deliverable),
  };

  const synthesisRecommendation = buildExecutiveRecommendation({
    assetStrategy: synthesisAssetStrategy,
    buyerPsychology,
    hiddenProblem,
    differentiation: strategicDifferentiation,
    marketUnderstanding,
    priority: input.priority,
  });

  const syncedCognition = {
    ...executiveCognition,
    executiveDecisionDocument:
      executiveDecisionSynthesis.selectedDecision.decisionDocument,
    generationObjectives:
      executiveDecisionSynthesis.selectedDecision.generationObjectives,
    strategicCritic: {
      ...executiveCognition.strategicCritic,
      finalAssetType: selectedDeliverable,
      assetRevised:
        selectedDeliverable !== executiveCognition.strategicCritic.finalAssetType,
      strategistWouldApprove: true,
      critiqueNotes: uniqueStrings([
        ...executiveCognition.strategicCritic.critiqueNotes,
        `Decision synthesis selected ${selectedDeliverable} from ${executiveDecisionSynthesis.candidatesGenerated} candidates.`,
      ]),
    },
  };

  return {
    pipelineVersion: EXECUTIVE_INTELLIGENCE_VERSION,
    marketUnderstanding,
    hiddenProblem,
    buyerPsychology,
    strategicDifferentiation,
    contrarianThinking,
    assetStrategy: synthesisAssetStrategy,
    executiveRecommendation: synthesisRecommendation,
    opportunityQuality,
    suggestedOpportunityTitle,
    executiveCognition: syncedCognition,
    executiveDecisionSynthesis,
  };
}

export function computeCompositeOpportunityScoreFromAnalysis(input: {
  reasoning: ExecutiveIntelligencePipeline | null | undefined;
  aiConfidence: number;
}): number {
  if (!input.reasoning?.opportunityQuality) {
    return input.aiConfidence;
  }

  const composite = input.reasoning.opportunityQuality.compositeScore;
  return Math.round(composite * 0.65 + input.aiConfidence * 0.35);
}

export function buildSampleExecutiveIntelligencePipeline(): ExecutiveIntelligencePipeline {
  return {
    pipelineVersion: EXECUTIVE_INTELLIGENCE_VERSION,
    marketUnderstanding: {
      marketPattern: "Buyers prioritize business launch confidence over course length",
      industryContext: "PMU education market",
      discussionMaturity: "developing",
      platform: "facebook",
      surfaceTopic: "training program adequacy",
    },
    hiddenProblem: {
      hiddenMarketProblem:
        "Students fear technical competence alone will not create a successful business.",
      surfaceInterpretation: "People debate training duration.",
      foundationalInsight: "Business launch confidence is the real purchase driver.",
      confidence: 75,
    },
    buyerPsychology: {
      coreFear: "Making an expensive mistake.",
      desiredTransformation: "Confidence in a viable career path.",
      emotionalBlocker: "Distrust of short-course providers.",
      decisionTrigger: "Evidence of graduate business success.",
      trustRequirement: "Clinical credibility and mentorship.",
      perceivedRisk: "Unprepared for real client work.",
      hiddenMotivation: "Professional identity transformation.",
      missingConfidence: "Business launch readiness.",
      urgencySource: "Active evaluation window.",
      primarySuccessMetric: "Reduced uncertainty.",
    },
    strategicDifferentiation: {
      uniquePositioning: ["Paramedical expertise", "Long-term mentorship"],
      competitiveAdvantage: ["Clinical credibility", "Institution-level education"],
      executiveBrainSignals: ["Expertise: PMU and paramedical"],
      differentiationStatement:
        "Uniquely positioned through clinical credibility to address business launch confidence.",
      recommendationsMustReflect: ["Clinical credibility", "Long-term support"],
    },
    contrarianThinking: {
      conventionalAssumption: "Longer courses are better.",
      assumptionChallenge: "Course duration is not the real purchase driver.",
      overlookedOpportunity: "Business launch confidence gap in the market.",
      surpriseInsight: "Students buy confidence, not curriculum length.",
      strategicReframe: "Reframe from duration debate to business readiness.",
      emergingTrend: "Support and mentorship overtaking curriculum features.",
    },
    assetStrategy: {
      selectedAssetType: "Decision Framework",
      selectionRationale: ["Platform favors frameworks", "Consideration stage"],
      platformInfluence: ["Origin platform: facebook"],
      alternativeAssetsConsidered: ["Diagnostic Checklist", "Comparison Resource"],
      diversityAdjustment: null,
    },
    executiveRecommendation: {
      whyThisAsset: "Decision Framework addresses confidence gap directly.",
      whyNow: "High-intent evaluation signals present.",
      expectedBusinessOutcome: "Advance buyer confidence before conversion.",
      targetAudience: "Career changers evaluating providers.",
      conversionMechanism: "Trust-building education to consultation.",
      estimatedEffort: "medium",
      estimatedReusePotential: "high",
      strategicRationale: "Platform and psychology-informed selection.",
    },
    opportunityQuality: {
      businessImpact: 72,
      revenuePotential: 68,
      marketFrequency: 55,
      competitiveDifferentiation: 70,
      authorityPositioning: 65,
      contentLeverage: 60,
      executiveUrgency: 75,
      reusability: 58,
      buyerIntent: 62,
      psychologicalImportance: 78,
      compositeScore: 68,
    },
    suggestedOpportunityTitle:
      "PMU Students Increasingly Question Whether Training Prepares Them For Real Business",
    executiveCognition: {
      cognitionVersion: "executive_cognition_v1",
      executiveReflection: {
        whatSurprised: "Students buy confidence, not curriculum length.",
        whatMattersMost: "Business launch confidence is the real purchase driver.",
        realBusinessProblem:
          "Students fear technical competence alone will not create a successful business.",
        marketMisunderstanding: "People debate training duration.",
        conventionalAssumption: "Longer courses are better.",
        assumptionIsTrue: false,
        indirectConcern: "Distrust of short-course providers.",
        strategistNotice: "Course duration is not the real purchase driver.",
        longTermOpportunity: "Business launch confidence gap in the market.",
        reusableAssetOpportunity: "Clinical credibility",
      },
      executiveMemoryComparison: {
        historicalDataAvailable: false,
        recurringObjections: [],
        recurringMisconceptions: [],
        repeatedBuyingSignals: [],
        repeatedEmotionalPatterns: [],
        repeatedContentOpportunities: [],
        repeatedPositioningOpportunities: [],
        previousSimilarDiscussions: 0,
        previousApprovedDecisions: 0,
      },
      marketPatternClassification: {
        primaryPattern: "curriculum_opportunity",
        secondaryPatterns: ["emerging_opportunity"],
        analystSummary: "Market analyst classification: curriculum opportunity",
      },
      strategicCritic: {
        isGeneric: false,
        wouldAnotherBusinessReceiveSame: false,
        isDifferentiated: true,
        leveragesExecutiveBrain: true,
        strategistWouldApprove: true,
        critiqueNotes: ["Strategic critic approves final recommendation."],
        revisedRecommendation: null,
        assetRevised: false,
        finalAssetType: "Decision Framework",
      },
      generationObjectives: {
        businessObjective: "Advance buyer confidence before conversion.",
        psychologicalObjective: "Confidence in a viable career path.",
        positioningObjective: "Uniquely positioned through clinical credibility.",
        conversationObjective: "Address curriculum opportunity while reframing beyond surface discussion.",
        callToActionObjective: "Evidence of graduate business success.",
      },
      reusabilityAssessment: {
        evergreenPotential: "high",
        reuseFormats: ["evergreen lead magnet", "email nurture asset"],
        longTermLeverage: "Asset can be repurposed across channels for 6-12 months.",
        curriculumImprovement: "Insights may inform curriculum positioning.",
        salesEnablementPotential: "Strong candidate for sales conversation support.",
      },
      executiveDecisionDocument: {
        hiddenMarketProblem:
          "Students fear technical competence alone will not create a successful business.",
        strategicInsight: "Course duration is not the real purchase driver.",
        businessOpportunity:
          "PMU Students Increasingly Question Whether Training Prepares Them For Real Business",
        competitiveAdvantage: "Clinical credibility; Institution-level education",
        buyerPsychologySummary:
          "Making an expensive mistake. | Confidence in a viable career path. | Distrust of short-course providers.",
        businessObjective: "Advance buyer confidence before conversion.",
        recommendedAssetType: "Decision Framework",
        assetSelectionReason: "Decision Framework addresses confidence gap directly.",
        positioningStrategy: "Uniquely positioned through clinical credibility.",
        successMetric: "Reduced uncertainty.",
        marketPattern: "Market analyst classification: curriculum opportunity",
        generationObjectives: {
          businessObjective: "Advance buyer confidence before conversion.",
          psychologicalObjective: "Confidence in a viable career path.",
          positioningObjective: "Uniquely positioned through clinical credibility.",
          conversationObjective: "Address curriculum opportunity.",
          callToActionObjective: "Evidence of graduate business success.",
        },
        reusability: {
          evergreenPotential: "high",
          reuseFormats: ["evergreen lead magnet"],
          longTermLeverage: "6-12 month reuse potential.",
          curriculumImprovement: "May inform curriculum positioning.",
          salesEnablementPotential: "Sales conversation support.",
        },
      },
    },
    executiveDecisionSynthesis: buildSampleExecutiveDecisionSynthesis(),
  };
}

export function formatExecutiveIntelligenceForPrompt(
  pipeline: ExecutiveIntelligencePipeline,
): string {
  const sections = [
    "ATHENA EXECUTIVE INTELLIGENCE (MANDATORY REASONING — DO NOT SKIP):",
    "",
    "Complete this reasoning sequence before generating output.",
    "",
    "1. MARKET UNDERSTANDING:",
    `- Surface topic: ${pipeline.marketUnderstanding.surfaceTopic ?? "Unknown"}`,
    `- Industry context: ${pipeline.marketUnderstanding.industryContext ?? "Not available"}`,
    `- Market pattern: ${pipeline.marketUnderstanding.marketPattern ?? "Emerging buyer confidence shift"}`,
    `- Platform: ${pipeline.marketUnderstanding.platform ?? "community"}`,
    `- Discussion maturity: ${pipeline.marketUnderstanding.discussionMaturity}`,
    "",
    "2. HIDDEN MARKET PROBLEM:",
    `- Hidden problem: ${pipeline.hiddenProblem.hiddenMarketProblem}`,
    `- Surface interpretation (do NOT stop here): ${pipeline.hiddenProblem.surfaceInterpretation}`,
    `- Foundational insight: ${pipeline.hiddenProblem.foundationalInsight}`,
    "",
    "3. BUYER PSYCHOLOGY:",
    `- Core fear: ${pipeline.buyerPsychology.coreFear ?? "Unknown"}`,
    `- Desired transformation: ${pipeline.buyerPsychology.desiredTransformation ?? "Unknown"}`,
    `- Emotional blocker: ${pipeline.buyerPsychology.emotionalBlocker ?? "Unknown"}`,
    `- Decision trigger: ${pipeline.buyerPsychology.decisionTrigger ?? "Unknown"}`,
    `- Trust requirement: ${pipeline.buyerPsychology.trustRequirement ?? "Unknown"}`,
    `- Perceived risk: ${pipeline.buyerPsychology.perceivedRisk ?? "Unknown"}`,
    `- Hidden motivation: ${pipeline.buyerPsychology.hiddenMotivation ?? "Unknown"}`,
    "",
    "4. STRATEGIC DIFFERENTIATION:",
    `- Differentiation: ${pipeline.strategicDifferentiation.differentiationStatement}`,
    `- Unique positioning: ${pipeline.strategicDifferentiation.uniquePositioning.join("; ") || "Use executive brain identity"}`,
    `- Recommendations must reflect: ${pipeline.strategicDifferentiation.recommendationsMustReflect.join("; ")}`,
    "",
    "5. CONTRARIAN EXECUTIVE THINKING:",
    `- Conventional assumption: ${pipeline.contrarianThinking.conventionalAssumption}`,
    `- Challenge: ${pipeline.contrarianThinking.assumptionChallenge}`,
    `- Overlooked opportunity: ${pipeline.contrarianThinking.overlookedOpportunity}`,
    `- Strategic reframe: ${pipeline.contrarianThinking.strategicReframe}`,
    "",
    "6. ASSET STRATEGY:",
    `- Selected asset: ${pipeline.assetStrategy.selectedAssetType}`,
    `- Rationale: ${pipeline.assetStrategy.selectionRationale.join(" ")}`,
    pipeline.assetStrategy.diversityAdjustment
      ? `- Diversity: ${pipeline.assetStrategy.diversityAdjustment}`
      : "",
    "",
    "7. EXECUTIVE RECOMMENDATION:",
    `- Why this asset: ${pipeline.executiveRecommendation.whyThisAsset}`,
    `- Why now: ${pipeline.executiveRecommendation.whyNow}`,
    `- Expected outcome: ${pipeline.executiveRecommendation.expectedBusinessOutcome}`,
    `- Target audience: ${pipeline.executiveRecommendation.targetAudience}`,
    `- Conversion mechanism: ${pipeline.executiveRecommendation.conversionMechanism}`,
    `- Estimated effort: ${pipeline.executiveRecommendation.estimatedEffort}`,
    `- Reuse potential: ${pipeline.executiveRecommendation.estimatedReusePotential}`,
    "",
    "8. OPPORTUNITY QUALITY (multi-dimensional):",
    `- Composite score: ${pipeline.opportunityQuality.compositeScore}`,
    `- Business impact: ${pipeline.opportunityQuality.businessImpact}`,
    `- Psychological importance: ${pipeline.opportunityQuality.psychologicalImportance}`,
    `- Competitive differentiation: ${pipeline.opportunityQuality.competitiveDifferentiation}`,
    "",
    "9. SUGGESTED OPPORTUNITY TITLE (market pattern, not individual CRM label):",
    pipeline.suggestedOpportunityTitle,
    "",
    formatExecutiveCognitionForPrompt(pipeline.executiveCognition),
    "",
    formatExecutiveDecisionSynthesisForPrompt(pipeline.executiveDecisionSynthesis),
    "",
    "INSTRUCTIONS:",
    "Ground every output in the Executive Decision Synthesis — not raw discussion text alone.",
    "All workflows must express the SAME selected executive decision.",
    "Determine business, psychological, positioning, conversation, and CTA objectives BEFORE generating copy.",
    "Opportunity titles must describe market patterns, not individual buyers.",
    "Do not default to webinar, PDF guide, or carousel unless strategic critic approved them.",
    "Challenge conventional assumptions using executive reflection and contrarian insights.",
  ];

  return sections.filter(Boolean).join("\n").trim();
}
