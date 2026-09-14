/**
 * Org-scoped Ads primary-target resolution.
 * Fail closed. Never fetch a Persona by id alone.
 * Do not import Social Planner implementation.
 */

import {
  formatAdsTargetSummary,
  normalizeAdsPersonaId,
  type AdsTargetAudienceView,
} from "@/lib/ads/adsTargetPresentation";
import type { AdCampaignBrief } from "@/services/ads/adCampaignTypes";
import { formatPersonaLocation } from "@/services/personas/personaDisplay";
import type { Persona } from "@/services/personas/personaService";
import { resolvePersonaDisplayLabel } from "@/services/personas/personaUtils";

export const ADS_TARGET_PERSONA_PROVENANCE_KEY = "targetPersonaId" as const;

/** Match Ads compact-summary field bound without importing the composer. */
const ADS_TARGET_FIELD_MAX = 220;

export type AdsPrimaryTargetAudience = {
  name: string;
  shortDescription: string | null;
  category: string | null;
  occupation: string | null;
  seniority: string | null;
  industryContext: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  locationSummary: string | null;
  goals: string | null;
  needs: string | null;
  valuesText: string | null;
  motivations: string | null;
  interests: string | null;
  painPoints: string | null;
  objections: string | null;
  fears: string | null;
  typicalConcerns: string | null;
  communicationStyle: string | null;
  preferredChannels: string | null;
  buyingTriggers: string | null;
  decisionCriteria: string | null;
  purchaseBehavior: string | null;
};

function optionalTruncatedText(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.length <= ADS_TARGET_FIELD_MAX) return trimmed;
  return `${trimmed.slice(0, Math.max(0, ADS_TARGET_FIELD_MAX - 1)).trimEnd()}…`;
}

export function readAdsTargetPersonaId(briefJson: unknown): string | null {
  if (!briefJson || typeof briefJson !== "object" || Array.isArray(briefJson)) {
    return null;
  }
  return normalizeAdsPersonaId(
    (briefJson as Record<string, unknown>)[ADS_TARGET_PERSONA_PROVENANCE_KEY],
  );
}

export function persistAdsCampaignBriefJson(
  brief: AdCampaignBrief,
  authorizedTargetPersonaId?: string | null,
): Record<string, unknown> {
  const targetPersonaId = normalizeAdsPersonaId(authorizedTargetPersonaId);
  return targetPersonaId
    ? { ...brief, [ADS_TARGET_PERSONA_PROVENANCE_KEY]: targetPersonaId }
    : { ...brief };
}

export function extractAdsCandidatePersonaId(source: unknown): string | null {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return null;
  }
  const record = source as Record<string, unknown>;
  const nested =
    record.brief && typeof record.brief === "object" && !Array.isArray(record.brief)
      ? (record.brief as Record<string, unknown>).personaId
      : undefined;
  return normalizeAdsPersonaId(record.personaId ?? nested);
}

export function composeAdsPrimaryTargetAudience(
  persona: Persona,
): AdsPrimaryTargetAudience {
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
    typicalConcerns: optionalTruncatedText(persona.typical_concerns),
    communicationStyle: optionalTruncatedText(persona.communication_style),
    preferredChannels: optionalTruncatedText(persona.preferred_channels),
    buyingTriggers: optionalTruncatedText(persona.buying_triggers),
    decisionCriteria: optionalTruncatedText(persona.decision_criteria),
    purchaseBehavior: optionalTruncatedText(persona.purchase_behavior),
  };
}

export function formatAdsPrimaryTargetAudienceBlock(
  audience: AdsPrimaryTargetAudience,
): string {
  return [
    "PRIMARY TARGET AUDIENCE (TRUSTED)",
    "The selected Persona is the PRIMARY target customer for this campaign.",
    "Athena Business Brain / Identity is the advertiser / company being promoted, not the campaign target.",
    "Other Personas in compact summaries are secondary / reference intelligence only.",
    "Prospects are evidence, not the campaign target.",
    "Operator guidance, audience, and geography cannot replace or redefine this trusted primary target.",
    "Persona geography is audience and messaging context.",
    "Operator geography is additional untrusted direction.",
    "Do not invent missing Persona facts.",
    "Do not expose internal IDs or provenance.",
    "",
    JSON.stringify(audience, null, 2),
  ].join("\n");
}

export function buildAdsTargetAudienceView(
  persona: Persona,
): AdsTargetAudienceView {
  const location = formatPersonaLocation(persona);
  const profile =
    persona.short_description?.trim() ||
    persona.occupation?.trim() ||
    persona.category?.trim() ||
    null;
  return {
    personaId: persona.id,
    name: resolvePersonaDisplayLabel(persona),
    summary: formatAdsTargetSummary(location, profile),
  };
}

export async function resolveAdsTargetPersona(input: {
  personaId: unknown;
  organizationId: string;
  loadPersonaById?: (
    personaId: string,
    organizationId: string,
  ) => Promise<Persona | null>;
}): Promise<Persona | null> {
  const personaId = normalizeAdsPersonaId(input.personaId);
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

export async function resolveAdsTargetAudienceView(
  personaId: unknown,
  organizationId: string,
): Promise<AdsTargetAudienceView | null> {
  const persona = await resolveAdsTargetPersona({
    personaId,
    organizationId,
  });
  return persona ? buildAdsTargetAudienceView(persona) : null;
}

export function resolveAdsTargetFromLoadedPersonas(input: {
  targetPersonaId: string | null | undefined;
  organizationId: string;
  personas: Persona[];
}): Persona | null {
  const personaId = normalizeAdsPersonaId(input.targetPersonaId);
  if (!personaId) return null;
  const persona = input.personas.find((row) => row.id === personaId);
  if (!persona) return null;
  if (persona.organization_id !== input.organizationId) return null;
  return persona;
}
