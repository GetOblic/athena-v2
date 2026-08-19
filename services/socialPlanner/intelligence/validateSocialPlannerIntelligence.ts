/**
 * Deterministic runtime validation for Social Planner Generation Context (L3).
 */

import { validateSocialCalendarContext } from "@/services/socialPlanner/calendar/validateSocialCalendarContext";
import { TREND_SOCIAL_PROMPT_CONFIG_KEY } from "@/services/superAdmin/strategicBlueprintInstructionConstants";
import {
  SOCIAL_PLANNER_INTELLIGENCE_ITEM_CAPS,
  SOCIAL_PLANNER_INTELLIGENCE_LIMITS,
  SOCIAL_PLANNER_INTELLIGENCE_SECTION_CHAR_CAPS,
  SOCIAL_PLANNER_TREND_SOCIAL_INSTRUCTION_MAX_CHARS,
} from "@/services/socialPlanner/intelligence/socialPlannerIntelligenceBudgets";
import {
  SOCIAL_PLANNER_ADS_REFERENCE_ROLE,
  SOCIAL_PLANNER_INTELLIGENCE_COMPOSER_VERSION,
  SOCIAL_PLANNER_INTELLIGENCE_SCHEMA_VERSION,
  SocialPlannerIntelligenceError,
  type SocialPlannerGenerationContextV1,
} from "@/services/socialPlanner/intelligence/socialPlannerIntelligenceTypes";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new SocialPlannerIntelligenceError("INVALID_CONTEXT", message);
  }
}

function jsonChars(value: unknown): number {
  return JSON.stringify(value).length;
}

export function validateSocialPlannerIntelligence(
  context: SocialPlannerGenerationContextV1,
): SocialPlannerGenerationContextV1 {
  assert(
    context.schemaVersion === SOCIAL_PLANNER_INTELLIGENCE_SCHEMA_VERSION,
    "Social Planner intelligence schemaVersion must be social_planner_generation_context_v1.",
  );
  assert(
    typeof context.organization.id === "string" &&
      context.organization.id.trim().length > 0,
    "Social Planner intelligence requires organization.id.",
  );
  assert(
    context.provenance.organizationId === context.organization.id,
    "Provenance organizationId must match organization.id.",
  );
  assert(
    context.provenance.schemaVersion === SOCIAL_PLANNER_INTELLIGENCE_SCHEMA_VERSION,
    "Provenance schemaVersion is invalid.",
  );
  assert(
    context.provenance.composerVersion === SOCIAL_PLANNER_INTELLIGENCE_COMPOSER_VERSION,
    "Provenance composerVersion is invalid.",
  );

  try {
    validateSocialCalendarContext(context.calendarContext);
  } catch (error) {
    throw new SocialPlannerIntelligenceError(
      "INVALID_CALENDAR_CONTEXT",
      error instanceof Error
        ? error.message
        : "Social Calendar context is invalid.",
    );
  }

  assert(
    context.calendarContext.opportunities.every(
      (opportunity) => opportunity.selectionStatus === "candidate",
    ),
    "Calendar holiday opportunities must remain candidates.",
  );

  assert(
    context.personas.personas.length <= SOCIAL_PLANNER_INTELLIGENCE_ITEM_CAPS.personas,
    "Persona portfolio exceeds the bounded maximum.",
  );
  assert(
    context.prospects.prospects.length <= SOCIAL_PLANNER_INTELLIGENCE_ITEM_CAPS.prospects,
    "Prospect portfolio exceeds the bounded maximum.",
  );
  assert(
    context.discussions.length <= SOCIAL_PLANNER_INTELLIGENCE_ITEM_CAPS.discussions,
    "Discussion intelligence exceeds the bounded maximum.",
  );
  assert(
    context.opportunities.length <= SOCIAL_PLANNER_INTELLIGENCE_ITEM_CAPS.opportunities,
    "Opportunity intelligence exceeds the bounded maximum.",
  );
  assert(
    context.seoIntelligence.length <= SOCIAL_PLANNER_INTELLIGENCE_ITEM_CAPS.seoReports,
    "SEO intelligence exceeds the bounded maximum.",
  );
  assert(
    context.ads.length <= SOCIAL_PLANNER_INTELLIGENCE_ITEM_CAPS.adsCampaigns,
    "Ads references exceed the bounded maximum.",
  );
  assert(
    context.strategicAssetBlueprints.length <=
      SOCIAL_PLANNER_INTELLIGENCE_ITEM_CAPS.blueprints,
    "Blueprint intelligence exceeds the bounded maximum.",
  );

  assert(
    jsonChars(context.organization) <=
      SOCIAL_PLANNER_INTELLIGENCE_SECTION_CHAR_CAPS.organization,
    "Organization facts exceed the section budget.",
  );
  assert(
    jsonChars(context.brain) <= SOCIAL_PLANNER_INTELLIGENCE_SECTION_CHAR_CAPS.brain,
    "Brain intelligence exceeds the section budget.",
  );
  assert(
    jsonChars(context.identityExecutiveIntelligence) <=
      SOCIAL_PLANNER_INTELLIGENCE_SECTION_CHAR_CAPS.identityExecutiveIntelligence,
    "Identity Executive Intelligence exceeds the section budget.",
  );
  assert(
    jsonChars(context.websiteIntelligence) <=
      SOCIAL_PLANNER_INTELLIGENCE_SECTION_CHAR_CAPS.websiteIntelligence,
    "Website Intelligence exceeds the section budget.",
  );
  assert(
    jsonChars(context.seoIntelligence) <=
      SOCIAL_PLANNER_INTELLIGENCE_SECTION_CHAR_CAPS.seoIntelligence,
    "SEO intelligence exceeds the section budget.",
  );
  assert(
    jsonChars(context.discussions) <=
      SOCIAL_PLANNER_INTELLIGENCE_SECTION_CHAR_CAPS.discussions,
    "Discussion intelligence exceeds the section budget.",
  );
  assert(
    jsonChars(context.personas) <=
      SOCIAL_PLANNER_INTELLIGENCE_SECTION_CHAR_CAPS.personas,
    "Persona portfolio exceeds the section budget.",
  );
  assert(
    jsonChars(context.prospects) <=
      SOCIAL_PLANNER_INTELLIGENCE_SECTION_CHAR_CAPS.prospects,
    "Prospect portfolio exceeds the section budget.",
  );
  assert(
    jsonChars(context.opportunities) <=
      SOCIAL_PLANNER_INTELLIGENCE_SECTION_CHAR_CAPS.opportunities,
    "Opportunity intelligence exceeds the section budget.",
  );
  assert(
    jsonChars(context.ads) <= SOCIAL_PLANNER_INTELLIGENCE_SECTION_CHAR_CAPS.ads,
    "Ads references exceed the section budget.",
  );
  assert(
    jsonChars(context.strategicAssetBlueprints) <=
      SOCIAL_PLANNER_INTELLIGENCE_SECTION_CHAR_CAPS.strategicAssetBlueprints,
    "Blueprint intelligence exceeds the section budget.",
  );
  assert(
    context.trendSocialPrompt.instructionText.length <=
      SOCIAL_PLANNER_TREND_SOCIAL_INSTRUCTION_MAX_CHARS,
    "Trend Social instruction exceeds the configured context bound.",
  );
  assert(
    context.composedText.length <=
      SOCIAL_PLANNER_INTELLIGENCE_LIMITS.composedTextMaxChars,
    "Composed Social Planner context exceeds the total budget.",
  );

  const structuredChars = jsonChars({
    ...context,
    composedText: "",
  });
  assert(
    structuredChars <= SOCIAL_PLANNER_INTELLIGENCE_LIMITS.structuredMaxChars,
    "Structured Social Planner context exceeds the total budget.",
  );

  assert(
    context.trendSocialPrompt.key === TREND_SOCIAL_PROMPT_CONFIG_KEY,
    "Trend Social configuration key is invalid.",
  );
  if (context.trendSocialPrompt.configured) {
    assert(
      Boolean(context.trendSocialPrompt.revisionId) &&
        context.trendSocialPrompt.instructionText.trim().length > 0,
      "Configured Trend Social Prompt must include revision identity and instruction text.",
    );
  } else {
    assert(
      context.trendSocialPrompt.revisionId == null &&
        context.trendSocialPrompt.instructionText === "",
      "Unconfigured Trend Social Prompt must not invent instruction text or a revision.",
    );
  }
  assert(
    context.provenance.trendSocialPrompt.key === TREND_SOCIAL_PROMPT_CONFIG_KEY,
    "Trend Social provenance key is invalid.",
  );
  assert(
    context.provenance.trendSocialPrompt.configured ===
      context.trendSocialPrompt.configured,
    "Trend Social provenance must match the instruction state.",
  );
  assert(
    context.provenance.trendSocialPrompt.revisionId ===
      context.trendSocialPrompt.revisionId,
    "Trend Social provenance revision must match the instruction state.",
  );

  assert(
    context.ads.every((campaign) => campaign.role === SOCIAL_PLANNER_ADS_REFERENCE_ROLE),
    "Ads context must remain existing campaign reference, not repeat instructions.",
  );

  const personaIds = new Set(context.personas.personas.map((persona) => persona.id));
  const prospectIds = new Set(context.prospects.prospects.map((prospect) => prospect.id));
  assert(
    context.provenance.personaIds.every((id) => personaIds.has(id)),
    "Persona provenance leaked an id that is not in the included portfolio.",
  );
  assert(
    context.provenance.prospectIds.every((id) => prospectIds.has(id)),
    "Prospect provenance leaked an id that is not in the included portfolio.",
  );
  assert(
    context.organization.id === context.provenance.organizationId,
    "Organization identity is inconsistent.",
  );

  return context;
}
