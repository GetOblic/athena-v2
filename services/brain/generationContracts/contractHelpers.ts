import type {
  BuildGenerationContractParams,
  ForbiddenBehaviors,
  GenerationContract,
  OutputRequirements,
  RequiredSections,
} from "@/services/brain/generationContracts/generationContractTypes";
import { GENERATION_CONTRACT_VERSION } from "@/services/brain/generationContracts/generationContractTypes";

const SHARED_FORBIDDEN: ForbiddenBehaviors = {
  behaviors: [
    "Do not hallucinate evidence not present in Brain Context or Executive Reasoning.",
    "Do not ignore Executive Reasoning priorities or recommended direction.",
    "Do not produce generic recommendations disconnected from organizational evidence.",
    "Do not contradict validated executive decisions or business constraints.",
    "Do not invent credentials, guarantees, income promises, or unsupported claims.",
    "Do not omit required output sections defined by this contract.",
    "Do not duplicate sections or confuse output types.",
    "Do not mention Athena unless the source context supports it.",
  ],
};

const DEPLOYMENT_SECTIONS = [
  "COMMUNITY_REPLY",
  "PRIVATE_MESSAGE",
  "SOCIAL_POST",
  "FOLLOW_UP",
  "CALL_TO_ACTION",
];

export function buildDiscussionAnalysisContract(
  input: BuildGenerationContractParams,
): GenerationContract {
  const { brainContext, executiveReasoning } = input;

  const requiredSections: RequiredSections = {
    sections: [
      "summary",
      "sentiment",
      "intent",
      "buyer_stage",
      "pain_points",
      "opportunity_detected",
      "opportunity_title",
      "opportunity_reason",
      "recommended_action",
      "suggested_cta",
      "risk_level",
      "confidence",
    ],
    outputFormat: "json",
  };

  const outputRequirements: OutputRequirements = {
    requiredFields: requiredSections.sections,
    deploymentSections: DEPLOYMENT_SECTIONS,
    jsonOnly: true,
    noMarkdown: true,
  };

  return buildBaseContract(input, {
    summary:
      "Analyze a community discussion and produce strategic intelligence plus deployment-ready copy.",
    audience: "Institutional operator responding in community channels",
    requiredSections,
    outputRequirements,
    mandatorySections: [
      ...requiredSections.sections,
      "suggested_cta with deployment asset structure",
    ],
    validationRules: [
      "recommended_action must remain strategic guidance",
      "suggested_cta must contain paste-ready deployment assets",
      "confidence must be integer 0-100",
    ],
  });
}

export function buildOpportunityContract(
  input: BuildGenerationContractParams,
): GenerationContract {
  return buildExecutiveBriefingContract({
    ...input,
    workflowType: "opportunity",
  });
}

export function buildExecutiveBriefingContract(
  input: BuildGenerationContractParams,
): GenerationContract {
  const requiredSections: RequiredSections = {
    sections: [
      "summary",
      "pain_points",
      "buyer_stage",
      "recommended_response",
      "cta",
      "confidence",
    ],
    outputFormat: "json",
  };

  const outputRequirements: OutputRequirements = {
    requiredFields: requiredSections.sections,
    deploymentSections: [
      "COMMUNITY_REPLY",
      "PRIVATE_MESSAGE",
      "SOCIAL_POST",
      "FOLLOW_UP",
    ],
    jsonOnly: true,
    noMarkdown: true,
  };

  return buildBaseContract(input, {
    summary:
      "Produce an executive briefing with copy-paste deployment assets for an opportunity.",
    audience: "Executive operator preparing outreach and community response",
    requiredSections,
    outputRequirements,
    mandatorySections: [
      ...requiredSections.sections,
      "recommended_response deployment block",
    ],
    validationRules: [
      "recommended_response must contain actual copy, not strategy language",
      "cta must be exact paste-ready text",
      "confidence must be integer 0-100",
    ],
  });
}

export function buildDeploymentAssetContract(
  input: BuildGenerationContractParams,
): GenerationContract {
  const requiredSections: RequiredSections = {
    sections: DEPLOYMENT_SECTIONS,
    outputFormat: "structured_text",
  };

  const outputRequirements: OutputRequirements = {
    requiredFields: DEPLOYMENT_SECTIONS,
    deploymentSections: DEPLOYMENT_SECTIONS,
    jsonOnly: false,
    noMarkdown: true,
  };

  return buildBaseContract(input, {
    summary:
      "Generate deployment-ready community, private, social, follow-up, and CTA assets.",
    audience: "Operator deploying responses across channels",
    requiredSections,
    outputRequirements,
    mandatorySections: DEPLOYMENT_SECTIONS,
    validationRules: [
      "Each deployment section must contain paste-ready copy",
      "No meta-instructions inside deployment fields",
    ],
  });
}

export function buildStrategicBlueprintContract(
  input: BuildGenerationContractParams,
): GenerationContract {
  const requiredSections: RequiredSections = {
    sections: [
      "asset_title",
      "asset_type",
      "business_goal",
      "target_audience",
      "priority",
      "estimated_reuse",
      "image_prompt",
      "pdf_prompt",
      "social_prompt",
      "notes",
    ],
    outputFormat: "json",
  };

  const outputRequirements: OutputRequirements = {
    requiredFields: requiredSections.sections,
    jsonOnly: true,
    noMarkdown: true,
  };

  return buildBaseContract(input, {
    summary:
      "Create a strategic asset blueprint with reusable generation prompts aligned to executive reasoning.",
    audience: "Operator creating reusable strategic assets",
    requiredSections,
    outputRequirements,
    mandatorySections: requiredSections.sections,
    validationRules: [
      "estimated_reuse must be integer 1-5",
      "prompts must be contextual and identity-aligned",
    ],
  });
}

function buildBaseContract(
  input: BuildGenerationContractParams,
  config: {
    summary: string;
    audience: string;
    requiredSections: RequiredSections;
    outputRequirements: OutputRequirements;
    mandatorySections: string[];
    validationRules: string[];
  },
): GenerationContract {
  const { workflowType, organizationId, brainContext, executiveReasoning } =
    input;

  const terminology = brainContext.executiveMemory.terminologyKnowledge
    .slice(0, 5)
    .map((entry) => entry.term);

  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      organizationId,
      workflowType,
      contractVersion: GENERATION_CONTRACT_VERSION,
      reasoningVersion: executiveReasoning.metadata.reasoningVersion,
      memoryVersion: executiveReasoning.metadata.memoryVersion,
      learningVersion: executiveReasoning.metadata.learningVersion,
      scope: brainContext.scope,
    },
    purpose: {
      workflowType,
      summary: config.summary,
      audience: config.audience,
    },
    requiredSections: config.requiredSections,
    evidenceRequirements: {
      minimumEvidenceCount: workflowType === "strategic_blueprint" ? 0 : 1,
      requireExecutiveReasoning: true,
      requireBusinessContext: true,
      requireMarketEvidence: workflowType !== "strategic_blueprint",
      requiredTerminology: terminology,
    },
    outputRequirements: config.outputRequirements,
    qualityRequirements: {
      minimumCompletenessScore: brainContext.identityMemory.completenessScore,
      requireReasoningAttached: true,
      requireOrganizationMatch: true,
      mandatorySections: config.mandatorySections,
    },
    toneRequirements: {
      voice: brainContext.identityMemory.greetingName,
      positioning: brainContext.identityMemory.aboutYou,
      recommendedDirection: executiveReasoning.recommendedDirection.primary,
      nonSalesy: true,
      noOverpromise: true,
    },
    forbiddenBehaviors: SHARED_FORBIDDEN,
    validationRules: {
      rules: config.validationRules,
      requiredChecks: [
        "organization_id_matches",
        "executive_reasoning_attached",
        "required_sections_defined",
        "workflow_type_matches",
      ],
    },
  };
}
