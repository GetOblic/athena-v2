/**
 * Pure Persona create/update normalization (no DB imports).
 */

import {
  assertPersonaLifecycleStatus,
} from "@/services/personas/personaLifecycle";
import {
  hasMeaningfulPersonaContent,
  mergePersonaRawJson,
  normalizeOptionalText,
  normalizePersonaReferenceWebsite,
  PERSONA_DESCRIPTIVE_TEXT_FIELDS,
  type PersonaDescriptiveTextField,
} from "@/services/personas/personaUtils";

export type CreatePersonaInput = {
  organization_id: string;
  user_id?: string | null;
  community_id?: string | null;
  persona_name?: string | null;
  short_description?: string | null;
  category?: string | null;
  gender_identity?: string | null;
  age_range?: string | null;
  birth_year_approx?: string | null;
  generation?: string | null;
  cultural_background?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  location_summary?: string | null;
  languages?: string | null;
  relationship_status?: string | null;
  household?: string | null;
  income_range?: string | null;
  purchasing_power?: string | null;
  education?: string | null;
  occupation?: string | null;
  seniority?: string | null;
  industry_context?: string | null;
  lifestyle?: string | null;
  interests?: string | null;
  digital_behavior?: string | null;
  brands_influences?: string | null;
  values_text?: string | null;
  aesthetic_preferences?: string | null;
  preferred_imagery?: string | null;
  goals?: string | null;
  needs?: string | null;
  pain_points?: string | null;
  fears?: string | null;
  motivations?: string | null;
  objections?: string | null;
  buying_triggers?: string | null;
  decision_criteria?: string | null;
  purchase_behavior?: string | null;
  typical_concerns?: string | null;
  communication_style?: string | null;
  preferred_channels?: string | null;
  reference_website?: string | null;
  notes?: string | null;
  additional_context?: string | null;
  ads_content?: string | null;
  source?: string;
  status?: string;
  lifecycle_status?: string;
  opportunity_score?: number | null;
  priority?: number;
  profile_json?: Record<string, unknown> | null;
  raw_json?: Record<string, unknown> | null;
  import_batch_id?: string | null;
};

/** Explicit update allowlist — never includes ownership / identity identifiers. */
export type UpdatePersonaInput = Partial<
  Omit<
    CreatePersonaInput,
    "organization_id" | "user_id" | "import_batch_id" | "source"
  >
> & {
  linked_discussion_id?: string | null;
  opportunity_score?: number | null;
  priority?: number;
  reference_website_intelligence?: Record<string, unknown> | null;
  last_activity?: string | null;
  last_deep_scrape_at?: string | null;
  last_deep_scrape_pages?: number | null;
};

export type PreparedPersonaCreateRow = {
  organization_id: string;
  user_id: string | null;
  community_id: string | null;
  persona_name: string | null;
  short_description: string | null;
  category: string | null;
  gender_identity: string | null;
  age_range: string | null;
  birth_year_approx: string | null;
  generation: string | null;
  cultural_background: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  location_summary: string | null;
  languages: string | null;
  relationship_status: string | null;
  household: string | null;
  income_range: string | null;
  purchasing_power: string | null;
  education: string | null;
  occupation: string | null;
  seniority: string | null;
  industry_context: string | null;
  lifestyle: string | null;
  interests: string | null;
  digital_behavior: string | null;
  brands_influences: string | null;
  values_text: string | null;
  aesthetic_preferences: string | null;
  preferred_imagery: string | null;
  goals: string | null;
  needs: string | null;
  pain_points: string | null;
  fears: string | null;
  motivations: string | null;
  objections: string | null;
  buying_triggers: string | null;
  decision_criteria: string | null;
  purchase_behavior: string | null;
  typical_concerns: string | null;
  communication_style: string | null;
  preferred_channels: string | null;
  reference_website: string | null;
  notes: string | null;
  additional_context: string | null;
  ads_content: string | null;
  source: string;
  status: string;
  lifecycle_status: string;
  opportunity_score: number | null;
  priority: number;
  profile_json: Record<string, unknown> | null;
  raw_json: Record<string, unknown> | null;
  import_batch_id: string | null;
  last_activity: string;
};

function normalizeDescriptiveFields(
  input: Partial<Record<PersonaDescriptiveTextField, string | null | undefined>>,
): Record<PersonaDescriptiveTextField, string | null> {
  const out = {} as Record<PersonaDescriptiveTextField, string | null>;
  for (const field of PERSONA_DESCRIPTIVE_TEXT_FIELDS) {
    if (field === "reference_website") continue;
    out[field] = normalizeOptionalText(input[field]);
  }
  out.reference_website = null;
  return out;
}

/**
 * Pure create preparation: normalize strings, soft Reference Website handling,
 * anti-blank enforcement, operational defaults.
 */
export function preparePersonaCreateRow(
  input: CreatePersonaInput,
): PreparedPersonaCreateRow {
  const organizationId = String(input.organization_id ?? "").trim();
  if (!organizationId) {
    throw new Error("organization_id is required.");
  }

  const descriptive = normalizeDescriptiveFields(input);
  const website = normalizePersonaReferenceWebsite(input.reference_website);
  descriptive.reference_website = website.referenceWebsite;

  let rawJson = mergePersonaRawJson(input.raw_json ?? null, null);
  if (website.invalidReferenceWebsiteInput) {
    rawJson = mergePersonaRawJson(rawJson, {
      invalid_reference_website_input: website.invalidReferenceWebsiteInput,
    });
  }

  const profileJson =
    input.profile_json &&
    typeof input.profile_json === "object" &&
    !Array.isArray(input.profile_json)
      ? { ...input.profile_json }
      : null;

  if (
    !hasMeaningfulPersonaContent({
      ...descriptive,
      profile_json: profileJson,
      raw_json: rawJson,
      invalid_reference_website_input: website.invalidReferenceWebsiteInput,
    })
  ) {
    throw new Error(
      "Persona creation requires at least one descriptive field with usable content.",
    );
  }

  const lifecycle =
    input.lifecycle_status != null &&
    String(input.lifecycle_status).trim().length > 0
      ? assertPersonaLifecycleStatus(input.lifecycle_status)
      : "New";

  return {
    organization_id: organizationId,
    user_id: input.user_id ?? null,
    community_id: input.community_id ?? null,
    ...descriptive,
    source: normalizeOptionalText(input.source) ?? "manual",
    status: normalizeOptionalText(input.status) ?? "Queued",
    lifecycle_status: lifecycle,
    opportunity_score:
      typeof input.opportunity_score === "number" &&
      Number.isFinite(input.opportunity_score)
        ? Math.round(input.opportunity_score)
        : null,
    priority:
      typeof input.priority === "number" && Number.isFinite(input.priority)
        ? Math.round(input.priority)
        : 1,
    profile_json: profileJson,
    raw_json: rawJson,
    import_batch_id: input.import_batch_id ?? null,
    last_activity: new Date().toISOString(),
  };
}
