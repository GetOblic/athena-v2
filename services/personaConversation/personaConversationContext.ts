/**
 * Read-only server context assembler for Persona Ask Athena.
 * Defaults to Current Executive Version. Does not enqueue jobs or mutate data.
 */

import {
  buildDiscussionDeploymentAssets,
  buildPersonaAnalysisAssets,
} from "@/lib/deploymentAssets";
import {
  getCurrentExecutiveVersion,
  getExecutiveVersionById,
} from "@/services/executiveVersions/executiveVersionService";
import type { ExecutiveIntelligencePayload } from "@/services/executiveVersions/executiveVersionTypes";
import { getAthenaIdentityByUserId } from "@/services/identity/identityService";
import {
  PERSONA_CONVERSATION_LIMITS,
  PersonaConversationError,
  type PersonaConversationAssembledContext,
  type PersonaConversationContextSection,
  type PersonaConversationVersionState,
} from "@/services/personaConversation/personaConversationTypes";
import { formatPersonaReferenceWebsiteResearchEvidence } from "@/services/personas/personaPipelineBody";
import type { Persona } from "@/services/personas/personaService";
import { resolvePersonaDisplayLabel } from "@/services/personas/personaUtils";

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[truncated]`;
}

function pushSection(
  sections: PersonaConversationContextSection[],
  section: PersonaConversationContextSection,
): void {
  const content = section.content.trim();
  if (!content) return;
  sections.push({ ...section, content });
}

function formatPersonaStructuredProfile(persona: Persona): string {
  const lines = [
    `persona_label: ${resolvePersonaDisplayLabel(persona)}`,
    `persona_name: ${persona.persona_name ?? ""}`,
    `short_description: ${persona.short_description ?? ""}`,
    `category: ${persona.category ?? ""}`,
    `gender_identity: ${persona.gender_identity ?? ""}`,
    `age_range: ${persona.age_range ?? ""}`,
    `generation: ${persona.generation ?? ""}`,
    `cultural_background: ${persona.cultural_background ?? ""}`,
    `country: ${persona.country ?? ""}`,
    `state: ${persona.state ?? ""}`,
    `city: ${persona.city ?? ""}`,
    `location_summary: ${persona.location_summary ?? ""}`,
    `languages: ${persona.languages ?? ""}`,
    `occupation: ${persona.occupation ?? ""}`,
    `seniority: ${persona.seniority ?? ""}`,
    `industry_context: ${persona.industry_context ?? ""}`,
    `lifestyle: ${persona.lifestyle ?? ""}`,
    `interests: ${persona.interests ?? ""}`,
    `goals: ${persona.goals ?? ""}`,
    `needs: ${persona.needs ?? ""}`,
    `pain_points: ${persona.pain_points ?? ""}`,
    `fears: ${persona.fears ?? ""}`,
    `motivations: ${persona.motivations ?? ""}`,
    `objections: ${persona.objections ?? ""}`,
    `buying_triggers: ${persona.buying_triggers ?? ""}`,
    `decision_criteria: ${persona.decision_criteria ?? ""}`,
    `purchase_behavior: ${persona.purchase_behavior ?? ""}`,
    `typical_concerns: ${persona.typical_concerns ?? ""}`,
    `communication_style: ${persona.communication_style ?? ""}`,
    `preferred_channels: ${persona.preferred_channels ?? ""}`,
    `reference_website: ${persona.reference_website ?? ""}`,
  ];
  return lines.filter((line) => !line.endsWith(": ")).join("\n");
}

function formatBlueprint(payload: ExecutiveIntelligencePayload): string {
  const blueprint = payload.blueprint;
  if (!blueprint) return "";
  return [
    `asset_title: ${blueprint.asset_title ?? ""}`,
    `asset_type: ${blueprint.asset_type ?? ""}`,
    `business_goal: ${blueprint.business_goal ?? ""}`,
    `target_audience: ${blueprint.target_audience ?? ""}`,
    `priority: ${blueprint.priority ?? ""}`,
    `image_prompt:\n${blueprint.image_prompt ?? ""}`,
    `pdf_prompt:\n${blueprint.pdf_prompt ?? ""}`,
    `social_prompt:\n${blueprint.social_prompt ?? ""}`,
    `notes:\n${blueprint.notes ?? ""}`,
  ].join("\n\n");
}

function formatAssetList(
  assets: ReturnType<typeof buildDiscussionDeploymentAssets>,
): string {
  if (assets.length === 0) return "";
  return assets
    .map((asset) => {
      const key = asset.assetKey ?? asset.title;
      return `[${key}] ${asset.title}\nObjective: ${asset.objective}\n\n${asset.content}`;
    })
    .join("\n\n---\n\n");
}

function formatDeploymentAssets(payload: ExecutiveIntelligencePayload): string {
  return formatAssetList(
    buildDiscussionDeploymentAssets(payload.analysis ?? null, {
      personaMode: true,
    }),
  );
}

function formatAnalysisAssets(payload: ExecutiveIntelligencePayload): string {
  return formatAssetList(
    buildPersonaAnalysisAssets(payload.analysis?.suggested_cta ?? null),
  );
}

function formatAnalysis(payload: ExecutiveIntelligencePayload): string {
  const analysis = payload.analysis;
  if (!analysis) return "";
  return [
    `summary: ${analysis.summary ?? ""}`,
    `pain_points: ${analysis.pain_points ?? ""}`,
    `opportunity_title: ${analysis.opportunity_title ?? ""}`,
    `opportunity_reason: ${analysis.opportunity_reason ?? ""}`,
    `recommended_action: ${analysis.recommended_action ?? ""}`,
    `confidence: ${analysis.confidence ?? ""}`,
  ]
    .filter((line) => !line.endsWith(": "))
    .join("\n");
}

export async function assemblePersonaConversationContext(input: {
  organizationId: string;
  userId: string;
  persona: Persona;
  executiveVersionId: string | null;
}): Promise<PersonaConversationAssembledContext> {
  const { organizationId, userId, persona } = input;
  const sections: PersonaConversationContextSection[] = [];
  const missingNotes: string[] = [];

  pushSection(sections, {
    type: "PERSONA_STRUCTURED_PROFILE",
    trust: "confirmed_fact",
    label: "Persona structured profile (user-provided)",
    content: formatPersonaStructuredProfile(persona),
  });

  if (persona.additional_context?.trim()) {
    pushSection(sections, {
      type: "PERSONA_ADDITIONAL_CONTEXT",
      trust: "user_observation",
      label: "Additional Context — primary user understanding",
      content: truncate(
        persona.additional_context.trim(),
        PERSONA_CONVERSATION_LIMITS.maxWebsiteContextChars,
      ),
    });
  }

  if (persona.notes?.trim()) {
    pushSection(sections, {
      type: "PERSONA_NOTES",
      trust: "user_observation",
      label: "Notes — including appended real-world interactions",
      content: truncate(
        persona.notes.trim(),
        PERSONA_CONVERSATION_LIMITS.maxWebsiteContextChars,
      ),
    });
  }

  if (persona.ads_content?.trim()) {
    pushSection(sections, {
      type: "PERSONA_ADS_CONTENT",
      trust: "untrusted_source_material",
      label: "Ads Content — observed or proposed creative",
      content: truncate(
        persona.ads_content.trim(),
        PERSONA_CONVERSATION_LIMITS.maxWebsiteContextChars,
      ),
    });
  }

  const research = formatPersonaReferenceWebsiteResearchEvidence(
    persona.reference_website,
    persona.reference_website_intelligence,
  );
  if (research) {
    pushSection(sections, {
      type: "REFERENCE_WEBSITE_RESEARCH_UNTRUSTED",
      trust: "untrusted_source_material",
      label: "Reference Website research — external contextual evidence",
      content: truncate(
        research,
        PERSONA_CONVERSATION_LIMITS.maxWebsiteContextChars,
      ),
    });
  } else {
    missingNotes.push("Reference Website research is not available.");
  }

  try {
    const identity = await getAthenaIdentityByUserId(userId, organizationId);
    if (identity?.about_you?.trim()) {
      pushSection(sections, {
        type: "ORGANIZATION_VOICE",
        trust: "confirmed_fact",
        label: "Organization voice (style guidance only)",
        content: truncate(
          identity.about_you.trim(),
          PERSONA_CONVERSATION_LIMITS.maxKnowledgeContextChars,
        ),
      });
    }
    if (identity?.greeting_name || identity?.website) {
      pushSection(sections, {
        type: "ORGANIZATION_IDENTITY",
        trust: "confirmed_fact",
        label: "Organization identity",
        content: [
          identity.greeting_name
            ? `greeting_name: ${identity.greeting_name}`
            : "",
          identity.website ? `organization_website: ${identity.website}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      });
    }
  } catch {
    missingNotes.push("Organization identity could not be loaded.");
  }

  let versionState: PersonaConversationVersionState = "none";
  let versionLabel: string | null = null;
  let executiveVersionId: string | null = null;
  let intelligence: ExecutiveIntelligencePayload | null = null;

  const discussionId = persona.linked_discussion_id?.trim() || null;
  const requestedVersionId = input.executiveVersionId?.trim() || null;

  if (requestedVersionId) {
    if (!discussionId) {
      throw new PersonaConversationError(
        "VERSION_NOT_FOUND",
        "Executive Version requires a linked discussion for this Persona.",
        404,
      );
    }
    const version = await getExecutiveVersionById(
      requestedVersionId,
      discussionId,
      organizationId,
    );
    if (!version) {
      throw new PersonaConversationError(
        "VERSION_NOT_FOUND",
        "Executive Version not found for this Persona.",
        404,
      );
    }
    executiveVersionId = version.id;
    versionState = version.is_current ? "current" : "archived";
    versionLabel = version.is_current
      ? "Current Executive Version"
      : `Archived Executive Version — ${version.generated_at || version.created_at}`;
    intelligence = version.intelligence ?? null;
  } else if (discussionId) {
    // Default grounding: Current Executive Version only (not archived, not stale live).
    const current = await getCurrentExecutiveVersion(
      discussionId,
      organizationId,
    );
    if (current) {
      executiveVersionId = current.id;
      versionState = "current";
      versionLabel = "Current Executive Version";
      intelligence = current.intelligence ?? null;
    } else {
      missingNotes.push(
        "Generate Persona intelligence before asking Athena detailed strategic questions.",
      );
    }
  } else {
    missingNotes.push(
      "No Current Executive Version — answering from Persona source profile only.",
    );
  }

  if (executiveVersionId) {
    pushSection(sections, {
      type: "EXECUTIVE_VERSION_METADATA",
      trust: "metadata",
      label: "Executive Version metadata",
      content: [
        `executive_version_id: ${executiveVersionId}`,
        `version_state: ${versionState}`,
        `version_label: ${versionLabel ?? ""}`,
      ].join("\n"),
    });
  }

  if (intelligence) {
    const analysisText = formatAnalysis(intelligence);
    if (analysisText) {
      pushSection(sections, {
        type: "DISCUSSION_ANALYSIS",
        trust: "athena_analysis",
        label: "Persona analysis (selected Executive Version)",
        content: analysisText,
      });
    }

    const blueprintText = formatBlueprint(intelligence);
    if (blueprintText) {
      pushSection(sections, {
        type: "STRATEGIC_BLUEPRINT",
        trust: "athena_analysis",
        label: "Current Persona Strategic Blueprint",
        content: blueprintText,
      });
    } else {
      missingNotes.push("Persona Strategic Blueprint is missing.");
    }

    const deploymentText = formatDeploymentAssets(intelligence);
    if (deploymentText) {
      pushSection(sections, {
        type: "DEPLOYMENT_ASSETS",
        trust: "athena_analysis",
        label: "Current Persona Deployment Assets (publish-ready)",
        content: deploymentText,
      });
    } else {
      missingNotes.push(
        "Persona Deployment Assets (publish-ready) are missing.",
      );
    }

    const analysisAssetsText = formatAnalysisAssets(intelligence);
    if (analysisAssetsText) {
      pushSection(sections, {
        type: "ANALYSIS_ASSETS",
        trust: "athena_analysis",
        label: "Current Persona Analysis Assets (strategic)",
        content: analysisAssetsText,
      });
    } else {
      missingNotes.push("Persona Analysis Assets are missing.");
    }
  }

  return {
    personaId: persona.id,
    organizationId,
    executiveVersionId,
    versionState,
    versionLabel,
    sections,
    missingNotes,
  };
}
