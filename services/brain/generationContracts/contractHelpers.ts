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
    "Do not write CRM-style opportunity titles describing individual buyers.",
    "Do not stop at surface discussion interpretation — apply hidden market problem reasoning.",
    "Do not recommend webinar, PDF guide, or carousel by default without strategic justification.",
    "Do not independently select executive initiatives — inherit Executive Initiative Selection.",
    "Do not treat content format as strategy — initiative selection precedes asset implementation.",
    "Do not use generic AI filler: comprehensive guide, ultimate guide, valuable insights, hope this helps, reach out if you have questions, comment below, join our webinar.",
    "Do not produce deployment copy that could apply to any business without discussion-specific insight.",
    "Do not write LinkedIn-style educational filler without commercial leverage or non-obvious insight.",
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
      "opportunity_title must describe a market pattern, not an individual buyer or CRM-style persona",
      "opportunity_title must reflect the hidden market problem from executive cognition",
      "opportunity_reason must reference buyer psychology and executive reflection, not surface summary only",
      "deployment assets must optimize for business, psychological, positioning, conversation, and CTA objectives",
      "community reply must sound natural in real community threads — not promotional or generic",
      "private message must reference the person's specific concern — not automated outreach",
      "follow-up must ask one qualifying question — not did this help or just checking in",
      "social post must lead with market insight or tension — not generic educational filler",
      "do not generate copy before internal objectives are determined from the Executive Initiative Selection",
      "all downstream outputs must express the same executive initiative — do not independently choose strategy",
      "do not default to generic webinar, PDF guide, or carousel recommendations unless initiative implementation requires them",
      "opportunity_title must reflect the selected executive initiative, not a content format",
      "each deployment asset must include discussion-specific non-obvious insight",
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
      "community reply must establish authority through useful insight — not generic encouragement",
      "private message must be short, warm, and reference exact concern",
      "follow-up must create momentum with one qualifying question",
      "social post must use belief-shift or myth-teardown framing when appropriate",
      "deployment copy must pass non-generic self-check before return",
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
      "asset_objective",
      "business_objective",
      "target_audience",
      "buyer_stage",
      "primary_pain_point",
      "core_message",
      "desired_transformation",
      "executive_rationale",
      "supporting_evidence",
      "sophistication_level",
      "strategic_angle",
      "production_specs",
      "business_goal",
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
      "Create a production-ready strategic asset blueprint with executable AI generation prompts aligned to Executive Understanding.",
    audience: "Senior marketing operator producing reusable strategic assets",
    requiredSections,
    outputRequirements,
    mandatorySections: [
      ...requiredSections.sections,
      "production_specs with output format and distribution channel",
      "paste-ready image_prompt, pdf_prompt, and social_prompt",
    ],
    validationRules: [
      "estimated_reuse must be integer 1-5",
      "prompts must be executable production specifications, not generic descriptions",
      "asset must align with Executive Initiative Selection and strategic direction",
      "blueprint must describe executive initiative and business strategy before production specifications",
      "sophistication_level must match buyer stage",
      "supporting_evidence must not hallucinate unavailable proof",
      "image_prompt, pdf_prompt, and social_prompt must not duplicate each other",
      "asset_title must be commercially sharp and discussion-specific — not generic webinar or guide title",
      "why_this_asset must reject at least one obvious generic alternative",
      "image_prompt must include composition, palette, metaphor, and avoid list",
      "pdf_prompt must include page structure and conversion CTA — not generic guide",
      "social_prompt must be campaign-specific with hook and structure — not generic carousel outline",
      "notes must document rejected generic option and commercial strength",
    ],
    forbiddenBehaviors: {
      behaviors: [
        ...SHARED_FORBIDDEN.behaviors,
        "Do not output generic recommendations like 'create a comprehensive guide' without structure.",
        "Do not repeat identical wording across image_prompt, pdf_prompt, and social_prompt.",
        "Do not ignore the provided strategic angle or sophistication level.",
        "Do not describe content abstractly when production instructions are required.",
        "Do not default asset_title to webinar, guide, or checklist without commercial justification in why_this_asset.",
      ],
    },
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
    forbiddenBehaviors?: ForbiddenBehaviors;
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
    forbiddenBehaviors: config.forbiddenBehaviors ?? SHARED_FORBIDDEN,
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
