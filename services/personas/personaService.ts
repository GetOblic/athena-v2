/**
 * Persona Intelligence — first-class archetype intelligence source.
 * Stage 3: organization-scoped CRUD plus bridge Discussion linkage.
 */

export { PERSONA_INTELLIGENCE_PLATFORM } from "@/services/personas/personaBridgeMarker";
export {
  isPersonaIntelligenceBridge,
  excludePersonaIntelligenceBridges,
} from "@/services/personas/personaBridgeMarker";
export { buildPersonaAnalysisBody } from "@/services/personas/personaPipelineBody";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  assertPersonaLifecycleStatus,
  normalizePersonaLifecycleStatus,
} from "@/services/personas/personaLifecycle";
import {
  preparePersonaCreateRow,
  type CreatePersonaInput,
  type UpdatePersonaInput,
} from "@/services/personas/personaNormalization";
import {
  mergePersonaRawJson,
  normalizeOptionalText,
  normalizePersonaReferenceWebsite,
  PERSONA_DESCRIPTIVE_TEXT_FIELDS,
} from "@/services/personas/personaUtils";

export type { CreatePersonaInput, UpdatePersonaInput, PreparedPersonaCreateRow } from "@/services/personas/personaNormalization";
export { preparePersonaCreateRow } from "@/services/personas/personaNormalization";

export type Persona = {
  id: string;
  created_at: string;
  updated_at: string;
  organization_id: string;
  user_id: string | null;
  community_id: string | null;
  linked_discussion_id: string | null;
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
  reference_website_intelligence: Record<string, unknown> | null;
  last_activity: string | null;
  import_batch_id: string | null;
  last_deep_scrape_at: string | null;
  last_deep_scrape_pages: number | null;
};

function mapPersonaRow(data: Persona): Persona {
  return {
    ...data,
    lifecycle_status: normalizePersonaLifecycleStatus(data.lifecycle_status),
    persona_name: data.persona_name ?? null,
    short_description: data.short_description ?? null,
    additional_context: data.additional_context ?? null,
    notes: data.notes ?? null,
    ads_content: data.ads_content ?? null,
    reference_website: data.reference_website ?? null,
    profile_json: data.profile_json ?? null,
    raw_json: data.raw_json ?? null,
    reference_website_intelligence:
      data.reference_website_intelligence ?? null,
    opportunity_score: data.opportunity_score ?? null,
    last_deep_scrape_at: data.last_deep_scrape_at ?? null,
    last_deep_scrape_pages: data.last_deep_scrape_pages ?? null,
  };
}

export async function getPersonas(organizationId: string): Promise<Persona[]> {
  const { data, error } = await supabaseAdmin
    .from("personas")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching personas:", error);
    // Stage 2: never silently degrade load failures into an empty library.
    throw new Error("Failed to load Personas for this organization.");
  }

  return ((data ?? []) as Persona[]).map(mapPersonaRow);
}

export async function findPersonaByReferenceWebsite(
  organizationId: string,
  referenceWebsite: string,
): Promise<Persona | null> {
  const normalized = normalizePersonaReferenceWebsite(referenceWebsite)
    .referenceWebsite;
  if (!normalized) return null;

  const { data, error } = await supabaseAdmin
    .from("personas")
    .select("*")
    .eq("organization_id", organizationId)
    .ilike("reference_website", normalized)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error finding persona by reference website:", error);
    return null;
  }

  return data ? mapPersonaRow(data as Persona) : null;
}

export async function findPersonaByNameAndCity(
  organizationId: string,
  personaName: string,
  city?: string | null,
): Promise<Persona | null> {
  const name = personaName.trim();
  if (!name) return null;
  const cityValue = (city ?? "").trim().toLowerCase();

  const { data, error } = await supabaseAdmin
    .from("personas")
    .select("*")
    .eq("organization_id", organizationId)
    .is("reference_website", null)
    .ilike("persona_name", name)
    .limit(20);

  if (error) {
    console.error("Error finding persona by name and city:", error);
    return null;
  }

  const match = (data as Persona[] | null)?.find((row) => {
    const rowCity = String(row.city ?? "")
      .trim()
      .toLowerCase();
    return rowCity === cityValue;
  });

  return match ? mapPersonaRow(match) : null;
}

export async function getPersonaByLinkedDiscussionId(
  discussionId: string,
  organizationId: string,
): Promise<Persona | null> {
  const { data, error } = await supabaseAdmin
    .from("personas")
    .select("*")
    .eq("linked_discussion_id", discussionId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching persona by linked discussion:", error);
    return null;
  }

  return data ? mapPersonaRow(data as Persona) : null;
}

export async function getPersonaById(
  id: string,
  organizationId: string,
): Promise<Persona | null> {
  const { data, error } = await supabaseAdmin
    .from("personas")
    .select("*")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching persona:", error);
    return null;
  }

  return data ? mapPersonaRow(data as Persona) : null;
}

export async function createPersona(
  input: CreatePersonaInput,
): Promise<Persona> {
  const row = preparePersonaCreateRow(input);

  const { data, error } = await supabaseAdmin
    .from("personas")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    console.error("Error creating persona:", error);
    throw error;
  }

  return mapPersonaRow(data as Persona);
}

export async function updatePersona(
  id: string,
  organizationId: string,
  input: UpdatePersonaInput,
): Promise<Persona | null> {
  const existing = await getPersonaById(id, organizationId);
  if (!existing) return null;

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  for (const field of PERSONA_DESCRIPTIVE_TEXT_FIELDS) {
    if (field === "reference_website") continue;
    if (input[field] !== undefined) {
      payload[field] = normalizeOptionalText(input[field]);
    }
  }

  if (input.reference_website !== undefined) {
    const website = normalizePersonaReferenceWebsite(input.reference_website);
    payload.reference_website = website.referenceWebsite;

    const baseRaw =
      input.raw_json !== undefined
        ? input.raw_json
        : (existing.raw_json ?? null);
    if (website.invalidReferenceWebsiteInput) {
      payload.raw_json = mergePersonaRawJson(baseRaw, {
        invalid_reference_website_input: website.invalidReferenceWebsiteInput,
      });
    } else if (input.raw_json !== undefined) {
      const cleared = mergePersonaRawJson(input.raw_json, null);
      if (
        cleared &&
        "invalid_reference_website_input" in cleared &&
        website.referenceWebsite
      ) {
        delete cleared.invalid_reference_website_input;
      }
      payload.raw_json =
        cleared && Object.keys(cleared).length > 0 ? cleared : null;
    } else if (website.referenceWebsite && existing.raw_json) {
      const cleared = { ...existing.raw_json };
      delete cleared.invalid_reference_website_input;
      payload.raw_json = Object.keys(cleared).length > 0 ? cleared : null;
    }
  } else if (input.raw_json !== undefined) {
    payload.raw_json = mergePersonaRawJson(input.raw_json, null);
  }

  if (input.lifecycle_status !== undefined) {
    payload.lifecycle_status = assertPersonaLifecycleStatus(
      input.lifecycle_status,
    );
  }
  if (input.community_id !== undefined) {
    payload.community_id = input.community_id;
  }
  if (input.status !== undefined) {
    payload.status = normalizeOptionalText(input.status) ?? existing.status;
  }
  if (input.linked_discussion_id !== undefined) {
    payload.linked_discussion_id = input.linked_discussion_id;
  }
  if (input.opportunity_score !== undefined) {
    payload.opportunity_score =
      typeof input.opportunity_score === "number" &&
      Number.isFinite(input.opportunity_score)
        ? Math.round(input.opportunity_score)
        : null;
  }
  if (input.priority !== undefined) {
    payload.priority =
      typeof input.priority === "number" && Number.isFinite(input.priority)
        ? Math.round(input.priority)
        : existing.priority;
  }
  if (input.profile_json !== undefined) {
    payload.profile_json =
      input.profile_json &&
      typeof input.profile_json === "object" &&
      !Array.isArray(input.profile_json)
        ? input.profile_json
        : null;
  }
  if (input.reference_website_intelligence !== undefined) {
    payload.reference_website_intelligence =
      input.reference_website_intelligence;
  }
  if (input.last_activity !== undefined) {
    payload.last_activity = input.last_activity;
  }
  if (input.last_deep_scrape_at !== undefined) {
    payload.last_deep_scrape_at = input.last_deep_scrape_at;
  }
  if (input.last_deep_scrape_pages !== undefined) {
    payload.last_deep_scrape_pages = input.last_deep_scrape_pages;
  }

  const { data, error } = await supabaseAdmin
    .from("personas")
    .update(payload)
    .eq("id", id)
    .eq("organization_id", organizationId)
    .select("*")
    .single();

  if (error) {
    console.error("Error updating persona:", error);
    return null;
  }

  return mapPersonaRow(data as Persona);
}

/**
 * Delete a Persona owned by the organization.
 * Stage 1: row delete only (no bridge Discussion cleanup).
 */
export async function deletePersona(
  id: string,
  organizationId: string,
): Promise<boolean> {
  const existing = await getPersonaById(id, organizationId);
  if (!existing) {
    return false;
  }

  const { error } = await supabaseAdmin
    .from("personas")
    .delete()
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (error) {
    console.error("Error deleting persona:", error);
    return false;
  }

  return true;
}
