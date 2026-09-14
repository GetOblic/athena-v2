/**
 * Org-scoped Social Planner primary-target resolution.
 * Fail closed. Never fetch a Persona by id alone.
 */

import {
  formatSocialPlannerTargetSummary,
  normalizeSocialPlannerPersonaId,
  type SocialPlannerTargetAudienceView,
} from "@/lib/socialPlanner/socialPlannerTargetPresentation";
import { formatPersonaLocation } from "@/services/personas/personaDisplay";
import type { Persona } from "@/services/personas/personaService";
import { resolvePersonaDisplayLabel } from "@/services/personas/personaUtils";
import { optionalTruncatedText } from "@/services/socialPlanner/intelligence/socialPlannerIntelligenceBudgets";
import type {
  SocialPlannerGenerationContextV1,
  SocialPlannerPersonaIntelligence,
  SocialPlannerPersonaPortfolio,
  SocialPlannerPrimaryTargetAudience,
} from "@/services/socialPlanner/intelligence/socialPlannerIntelligenceTypes";
import { summarizePersona } from "@/services/socialPlanner/intelligence/socialPlannerIntelligenceSources";

export const SOCIAL_PLANNER_TARGET_PERSONA_PROVENANCE_KEY =
  "targetPersonaId" as const;

export function readSocialPlannerTargetPersonaId(
  provenance: unknown,
): string | null {
  if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) {
    return null;
  }
  return normalizeSocialPlannerPersonaId(
    (provenance as Record<string, unknown>)[
      SOCIAL_PLANNER_TARGET_PERSONA_PROVENANCE_KEY
    ],
  );
}

export function socialPlannerTargetPersonaProvenance(
  targetPersonaId: string | null | undefined,
): Record<string, unknown> {
  const id = normalizeSocialPlannerPersonaId(targetPersonaId);
  return id
    ? { [SOCIAL_PLANNER_TARGET_PERSONA_PROVENANCE_KEY]: id }
    : {};
}

export function mergeSocialCalendarTargetPersonaProvenance(
  frozen: Record<string, unknown>,
  existing: unknown,
): Record<string, unknown> {
  const targetPersonaId = readSocialPlannerTargetPersonaId(existing);
  if (!targetPersonaId) return frozen;
  return {
    ...frozen,
    [SOCIAL_PLANNER_TARGET_PERSONA_PROVENANCE_KEY]: targetPersonaId,
  };
}

export function composeSocialPlannerPrimaryTargetAudience(
  persona: Persona,
): SocialPlannerPrimaryTargetAudience {
  return {
    name: resolvePersonaDisplayLabel(persona),
    shortDescription: optionalTruncatedText(persona.short_description),
    category: optionalTruncatedText(persona.category),
    occupation: optionalTruncatedText(persona.occupation),
    seniority: optionalTruncatedText(persona.seniority),
    industryContext: optionalTruncatedText(persona.industry_context),
    city: optionalTruncatedText(persona.city),
    state: optionalTruncatedText(persona.state),
    country: optionalTruncatedText(persona.country),
    locationSummary:
      optionalTruncatedText(persona.location_summary) ||
      formatPersonaLocation(persona),
    goals: optionalTruncatedText(persona.goals),
    needs: optionalTruncatedText(persona.needs),
    valuesText: optionalTruncatedText(persona.values_text),
    motivations: optionalTruncatedText(persona.motivations),
    interests: optionalTruncatedText(persona.interests),
    painPoints: optionalTruncatedText(persona.pain_points),
    objections: optionalTruncatedText(persona.objections),
    fears: optionalTruncatedText(persona.fears),
    communicationStyle: optionalTruncatedText(persona.communication_style),
    preferredChannels: optionalTruncatedText(persona.preferred_channels),
    buyingTriggers: optionalTruncatedText(persona.buying_triggers),
    decisionCriteria: optionalTruncatedText(persona.decision_criteria),
    purchaseBehavior: optionalTruncatedText(persona.purchase_behavior),
  };
}

export function socialPlannerHasPrimaryTargetAudience(
  context: Pick<SocialPlannerGenerationContextV1, "primaryTargetAudience">,
): boolean {
  return Boolean(context.primaryTargetAudience);
}

export function authorizedSocialPlannerTargetPersonaId(
  context: Pick<
    SocialPlannerGenerationContextV1,
    "primaryTargetAudience" | "authorizedTargetPersonaId" | "personas"
  >,
): string | null {
  if (!context.primaryTargetAudience) return null;
  const explicit = normalizeSocialPlannerPersonaId(
    context.authorizedTargetPersonaId,
  );
  if (
    explicit &&
    context.personas.personas.some((persona) => persona.id === explicit)
  ) {
    return explicit;
  }
  const name = context.primaryTargetAudience.name.trim();
  if (!name) return null;
  const matches = context.personas.personas.filter(
    (persona) => persona.name === name,
  );
  return matches.length === 1 ? matches[0].id : null;
}

export function resolveSocialPlannerCompletionTargetPersonaId(
  persistedProvenance: unknown,
  context: Pick<
    SocialPlannerGenerationContextV1,
    "primaryTargetAudience" | "authorizedTargetPersonaId" | "personas"
  >,
): string | null {
  return (
    readSocialPlannerTargetPersonaId(persistedProvenance) ??
    authorizedSocialPlannerTargetPersonaId(context) ??
    null
  );
}

export function buildSocialPlannerTargetAudienceView(
  persona: Persona,
): SocialPlannerTargetAudienceView {
  const location = formatPersonaLocation(persona);
  const profile =
    persona.short_description?.trim() ||
    persona.occupation?.trim() ||
    persona.category?.trim() ||
    null;
  return {
    personaId: persona.id,
    name: resolvePersonaDisplayLabel(persona),
    summary: formatSocialPlannerTargetSummary(location, profile),
  };
}

export async function resolveSocialPlannerTargetPersona(input: {
  personaId: unknown;
  organizationId: string;
  loadPersonaById?: (
    personaId: string,
    organizationId: string,
  ) => Promise<Persona | null>;
}): Promise<Persona | null> {
  const personaId = normalizeSocialPlannerPersonaId(input.personaId);
  const organizationId = input.organizationId?.trim();
  if (!personaId || !organizationId) return null;

  const persona = input.loadPersonaById
    ? await input.loadPersonaById(personaId, organizationId)
    : await (
        await import("@/services/personas/personaService")
      ).getPersonaById(personaId, organizationId);
  if (!persona) return null;
  if (persona.organization_id !== organizationId) return null;
  if (persona.id !== personaId) return null;
  return persona;
}

export async function resolveSocialPlannerTargetAudienceView(
  personaId: unknown,
  organizationId: string,
): Promise<SocialPlannerTargetAudienceView | null> {
  const persona = await resolveSocialPlannerTargetPersona({
    personaId,
    organizationId,
  });
  return persona ? buildSocialPlannerTargetAudienceView(persona) : null;
}

export function resolvePrimaryTargetFromLoadedPersonas(input: {
  targetPersonaId: string | null | undefined;
  organizationId: string;
  personas: Persona[];
}): Persona | null {
  const personaId = normalizeSocialPlannerPersonaId(input.targetPersonaId);
  if (!personaId) return null;
  const persona = input.personas.find((row) => row.id === personaId);
  if (!persona) return null;
  if (persona.organization_id !== input.organizationId) return null;
  return persona;
}

export function ensurePrimaryTargetInPersonaPortfolio(
  portfolio: SocialPlannerPersonaPortfolio,
  persona: Persona,
): SocialPlannerPersonaPortfolio {
  const existing = portfolio.personas.some((row) => row.id === persona.id);
  const summaries: SocialPlannerPersonaIntelligence[] = existing
    ? portfolio.personas
    : [summarizePersona(persona), ...portfolio.personas];

  return {
    ...portfolio,
    includedCount: summaries.length,
    distinctCategories: uniquePresent(
      summaries.map((row) => row.category),
    ),
    distinctOccupations: uniquePresent(
      summaries.map((row) => row.occupation),
    ),
    distinctAudienceGeographies: uniquePresent(
      summaries.map((row) => row.audienceGeography),
    ),
    personas: summaries,
  };
}

function uniquePresent(values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(
      values.filter((value): value is string => Boolean(value?.trim())),
    ),
  ];
}
