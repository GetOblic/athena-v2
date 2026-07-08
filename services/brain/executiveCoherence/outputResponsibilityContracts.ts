import type { GenerationWorkflowType } from "@/services/brain/generationContracts/generationContractTypes";
import type {
  OutputArtifactType,
  OutputResponsibility,
  OutputResponsibilityVerb,
} from "@/services/brain/executiveCoherence/executiveCoherenceTypes";

const OUTPUT_RESPONSIBILITIES: Record<OutputArtifactType, OutputResponsibility> =
  {
    discussion_analysis: {
      artifactType: "discussion_analysis",
      purpose: "Understand what happened in the discussion.",
      verb: "Understand",
      mustFocus: [
        "What happened in the discussion",
        "What users are saying",
        "Evidence and signals",
        "Reasoning and patterns",
        "Buyer stage and intent indicators",
      ],
      mustAvoid: [
        "Marketing copy or paste-ready customer messages",
        "Executive briefing language",
        "Content blueprint specifications",
        "Duplicating deployment asset structure in analytical fields",
      ],
      forbiddenOverlapWith: ["deployment_asset", "executive_briefing"],
      fieldResponsibilities: {
        summary: "Understand",
        sentiment: "Understand",
        intent: "Understand",
        buyer_stage: "Understand",
        pain_points: "Understand",
        opportunity_detected: "Understand",
        opportunity_title: "Understand",
        opportunity_reason: "Understand",
        recommended_action: "Understand",
        suggested_cta: "Execute",
        risk_level: "Understand",
        confidence: "Understand",
      },
    },
    opportunity: {
      artifactType: "opportunity",
      purpose: "Recommend action on a detected opportunity.",
      verb: "Recommend",
      mustFocus: [
        "Why this opportunity matters",
        "Business impact",
        "Urgency",
        "Suggested next action",
        "Alignment with executive strategy",
      ],
      mustAvoid: [
        "Customer-facing copy",
        "Full executive briefings",
        "Content design specifications",
        "Deployment-ready messages",
      ],
      forbiddenOverlapWith: ["executive_briefing", "deployment_asset"],
    },
    executive_briefing: {
      artifactType: "executive_briefing",
      purpose: "Advise leadership on implications and recommendations.",
      verb: "Advise",
      mustFocus: [
        "Executive implications",
        "Risks and trends",
        "Strategic recommendations",
        "Leadership-ready summary",
      ],
      mustAvoid: [
        "Paste-ready deployment copy in advisory fields",
        "Discussion analysis repetition",
        "Content blueprint structure",
        "Community reply tone in summary fields",
      ],
      forbiddenOverlapWith: ["discussion_analysis", "strategic_blueprint"],
      fieldResponsibilities: {
        summary: "Advise",
        pain_points: "Advise",
        buyer_stage: "Advise",
        recommended_response: "Execute",
        cta: "Execute",
        confidence: "Advise",
      },
    },
    strategic_blueprint: {
      artifactType: "strategic_blueprint",
      purpose: "Design a content asset specification.",
      verb: "Design",
      mustFocus: [
        "Content format and objectives",
        "Messaging architecture",
        "Structure and educational sequence",
        "CTA philosophy",
        "Production specifications for downstream AI tools",
      ],
      mustAvoid: [
        "Finished marketing copy",
        "Executive briefing prose",
        "Discussion analysis summaries",
        "Paste-ready community replies as the primary output",
      ],
      forbiddenOverlapWith: ["deployment_asset", "executive_briefing"],
    },
    deployment_asset: {
      artifactType: "deployment_asset",
      purpose: "Produce final copy ready for deployment.",
      verb: "Execute",
      mustFocus: [
        "Community replies",
        "Emails and messages",
        "Social posts and carousel copy",
        "Scripts and lead magnets",
        "Production-ready paste-ready content",
      ],
      mustAvoid: [
        "Executive reasoning or analysis",
        "Strategic rationale essays",
        "Blueprint specifications",
        "Leadership advisory language",
      ],
      forbiddenOverlapWith: [
        "discussion_analysis",
        "executive_briefing",
        "strategic_blueprint",
      ],
    },
  };

export function getOutputResponsibility(
  artifactType: OutputArtifactType,
): OutputResponsibility {
  return OUTPUT_RESPONSIBILITIES[artifactType];
}

export function getOutputResponsibilityForWorkflow(
  workflowType: GenerationWorkflowType,
): OutputResponsibility {
  return getOutputResponsibility(workflowType);
}

export function formatOutputResponsibilityForPrompt(
  workflowType: GenerationWorkflowType,
): string {
  const responsibility = getOutputResponsibilityForWorkflow(workflowType);

  const sections = [
    "OUTPUT RESPONSIBILITY CONTRACT:",
    "",
    `This deliverable's job is to ${responsibility.purpose.toLowerCase()}`,
    `Primary verb: ${responsibility.verb}`,
    "",
    "YOU MUST FOCUS ON:",
    ...responsibility.mustFocus.map((item) => `- ${item}`),
    "",
    "YOU MUST AVOID:",
    ...responsibility.mustAvoid.map((item) => `- ${item}`),
    "",
    "DIVERSITY RULE:",
    "Express the shared Executive Strategy through this deliverable's unique lens.",
    `Do not produce output that resembles: ${responsibility.forbiddenOverlapWith.join(", ")}.`,
    "This is not a rewrite of another deliverable. It is a specialized expression of the same strategy.",
  ];

  if (responsibility.fieldResponsibilities) {
    sections.push(
      "",
      "FIELD RESPONSIBILITIES:",
      ...Object.entries(responsibility.fieldResponsibilities).map(
        ([field, verb]) => `- ${field}: ${verb}`,
      ),
    );
  }

  return sections.join("\n").trim();
}

export function listAllOutputResponsibilities(): OutputResponsibility[] {
  return Object.values(OUTPUT_RESPONSIBILITIES);
}

export function getResponsibilityVerb(
  workflowType: GenerationWorkflowType,
): OutputResponsibilityVerb {
  return getOutputResponsibilityForWorkflow(workflowType).verb;
}
