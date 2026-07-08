import type { RecommendedDirectionKey } from "@/services/brain/executiveReasoningTypes";
import type { ExecutiveUnderstanding } from "@/services/brain/executiveUnderstanding/executiveUnderstandingTypes";

export const STRATEGIC_BLUEPRINT_SPECS_VERSION = "strategic_blueprint_specs_v1";

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

export type StrategicBlueprintProductionContext = {
  version: string;
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
  production: BlueprintProductionSpecification;
  generationInstructions: BlueprintGenerationInstructions;
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

export function resolveStrategicAngle(
  understanding: ExecutiveUnderstanding,
): string {
  const direction = understanding.strategicUnderstanding.recommendedDirection;
  const angles = STRATEGIC_ANGLES[direction] ?? STRATEGIC_ANGLES.consultative;
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
): StrategicBlueprintProductionContext {
  const strategicAngle = resolveStrategicAngle(understanding);
  const sophisticationLevel = resolveSophisticationLevel({
    buyerStage: understanding.marketUnderstanding.buyerStage,
    priorityLevel: understanding.priorityUnderstanding.level,
  });
  const preferredAssetType =
    ANGLE_PREFERRED_TYPES[strategicAngle] ?? "pdf_guide";
  const primaryPainPoint =
    understanding.marketUnderstanding.painPoints[0] ?? null;
  const coreMessage =
    understanding.strategicUnderstanding.primaryExecutiveObjective;
  const desiredTransformation = [
    `Move the audience from ${understanding.marketUnderstanding.buyerStage ?? "current stage"} toward a confident next step.`,
    understanding.strategicUnderstanding.recommendedDeploymentDirection,
  ].join(" ");
  const executiveRationale =
    understanding.strategicUnderstanding.rationale.join(" ") ||
    understanding.strategicUnderstanding.recommendedExecutiveAction;
  const supportingEvidence = understanding.supportingEvidence.entries.map(
    (entry) => `${entry.label}: ${entry.detail}`,
  );

  const variationSeed = [
    understanding.metadata.organizationId,
    understanding.metadata.discussionId ?? "",
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
    ctaObjective:
      understanding.strategicUnderstanding.recommendedExecutiveAction,
    distributionChannel: resolveDistributionChannel(understanding),
    reuseStrategy: `Repurpose across ${resolveDistributionChannel(understanding)} Estimated reuse: adapt core asset into social, email, and community formats.`,
  };

  const generationInstructions = buildGenerationInstructions({
    understanding,
    strategicAngle,
    sophisticationLevel,
    preferredAssetType,
  });

  return {
    version: STRATEGIC_BLUEPRINT_SPECS_VERSION,
    assetObjective: coreMessage,
    targetAudience: buildTargetAudienceLabel(understanding, sophisticationLevel),
    businessObjective:
      understanding.opportunityUnderstanding.businessOpportunity ??
      understanding.executiveSummary.primaryObjective,
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
    production,
    generationInstructions,
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
    "These specifications are deterministic and must be followed exactly.",
    "Do not produce generic marketing advice. Produce executable asset specifications.",
    "",
    "ASSET STRATEGY:",
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
    `- Applied asset standard: ${context.preferredAssetType.replace(/_/g, " ")} (auto-selected)`,
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
    "Align fully with Executive Understanding above. Do not contradict strategic direction.",
    "Materially differentiate this blueprint from generic templates using the strategic angle.",
  ];

  return sections.join("\n").trim();
}
