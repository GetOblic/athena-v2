/**
 * Prospect Intelligence — first-class intelligence source.
 * Executive generation reuses the Discussion pipeline via linked_discussion_id.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeProspectLifecycleStatus } from "@/services/prospects/prospectLifecycle";
import {
  buildProspectAnalysisBody,
  normalizeWebsiteUrl,
} from "@/services/prospects/prospectUtils";

export { buildProspectAnalysisBody, normalizeWebsiteUrl };
export {
  PROSPECT_INTELLIGENCE_PLATFORM,
  isProspectIntelligenceBridge,
  excludeProspectIntelligenceBridges,
} from "@/services/prospects/prospectBridgeMarker";

export {
  PROSPECT_DISPLAY_STATUSES as PROSPECT_STATUSES,
  type ProspectDisplayStatus as ProspectStatus,
} from "@/services/prospects/prospectStatus";

export type Prospect = {
  id: string;
  created_at: string;
  updated_at: string;
  organization_id: string;
  user_id: string | null;
  community_id: string | null;
  linked_discussion_id: string | null;
  business_name: string;
  website: string | null;
  linkedin: string | null;
  facebook: string | null;
  instagram: string | null;
  industry: string | null;
  category: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  address: string | null;
  company_size: string | null;
  revenue: string | null;
  employee_count: string | null;
  technologies: string | null;
  pain_points: string | null;
  decision_maker: string | null;
  first_name: string | null;
  last_name: string | null;
  external_contact_id: string | null;
  timezone: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  google_business_url: string | null;
  notes: string | null;
  additional_context: string | null;
  source: string;
  status: string;
  lifecycle_status: string;
  ads_content: string | null;
  opportunity_score: number | null;
  priority: number;
  website_intelligence: Record<string, unknown> | null;
  raw_json: Record<string, unknown> | null;
  last_activity: string | null;
  import_batch_id: string | null;
};

export type CreateProspectInput = {
  organization_id: string;
  user_id?: string | null;
  community_id?: string | null;
  business_name: string;
  website?: string | null;
  linkedin?: string | null;
  facebook?: string | null;
  instagram?: string | null;
  industry?: string | null;
  category?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  address?: string | null;
  company_size?: string | null;
  revenue?: string | null;
  employee_count?: string | null;
  technologies?: string | null;
  pain_points?: string | null;
  decision_maker?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  external_contact_id?: string | null;
  timezone?: string | null;
  job_title?: string | null;
  email?: string | null;
  phone?: string | null;
  google_business_url?: string | null;
  notes?: string | null;
  additional_context?: string | null;
  ads_content?: string | null;
  source?: string;
  status?: string;
  lifecycle_status?: string;
  import_batch_id?: string | null;
  raw_json?: Record<string, unknown> | null;
};

export type UpdateProspectInput = Partial<
  Omit<
    CreateProspectInput,
    "organization_id" | "user_id" | "import_batch_id" | "source"
  >
> & {
  linked_discussion_id?: string | null;
  opportunity_score?: number;
  priority?: number;
  website_intelligence?: Record<string, unknown> | null;
  last_activity?: string | null;
  lifecycle_status?: string;
  ads_content?: string | null;
};

function normalizeOptional(value?: string | null): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function mapProspectRow(data: Prospect): Prospect {
  return {
    ...data,
    lifecycle_status: normalizeProspectLifecycleStatus(data.lifecycle_status),
    ads_content: data.ads_content ?? null,
    first_name: data.first_name ?? null,
    last_name: data.last_name ?? null,
    external_contact_id: data.external_contact_id ?? null,
    timezone: data.timezone ?? null,
  };
}

export async function getProspects(
  organizationId: string,
): Promise<Prospect[]> {
  const { data, error } = await supabaseAdmin
    .from("prospects")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching prospects:", error);
    return [];
  }

  return ((data ?? []) as Prospect[]).map(mapProspectRow);
}

export async function getProspectById(
  id: string,
  organizationId: string,
): Promise<Prospect | null> {
  const { data, error } = await supabaseAdmin
    .from("prospects")
    .select("*")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching prospect:", error);
    return null;
  }

  return data ? mapProspectRow(data as Prospect) : null;
}

export async function findProspectByWebsite(
  organizationId: string,
  website: string,
): Promise<Prospect | null> {
  const normalized = normalizeWebsiteUrl(website);
  if (!normalized) return null;

  const { data, error } = await supabaseAdmin
    .from("prospects")
    .select("*")
    .eq("organization_id", organizationId)
    .ilike("website", normalized)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error finding prospect by website:", error);
    return null;
  }

  return data ? mapProspectRow(data as Prospect) : null;
}

export async function findProspectByNameAndCity(
  organizationId: string,
  businessName: string,
  city?: string | null,
): Promise<Prospect | null> {
  const name = businessName.trim();
  if (!name) return null;
  const cityValue = (city ?? "").trim().toLowerCase();

  const { data, error } = await supabaseAdmin
    .from("prospects")
    .select("*")
    .eq("organization_id", organizationId)
    .is("website", null)
    .ilike("business_name", name)
    .limit(20);

  if (error) {
    console.error("Error finding prospect by name and city:", error);
    return null;
  }

  const match = (data as Prospect[] | null)?.find((row) => {
    const rowCity = String(row.city ?? "")
      .trim()
      .toLowerCase();
    return rowCity === cityValue;
  });

  return match ? mapProspectRow(match) : null;
}

export async function getProspectByLinkedDiscussionId(
  discussionId: string,
  organizationId: string,
): Promise<Prospect | null> {
  const { data, error } = await supabaseAdmin
    .from("prospects")
    .select("*")
    .eq("linked_discussion_id", discussionId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching prospect by linked discussion:", error);
    return null;
  }

  return data ? mapProspectRow(data as Prospect) : null;
}

export async function createProspect(
  input: CreateProspectInput,
): Promise<Prospect | null> {
  const businessName = input.business_name.trim();
  if (!businessName) {
    throw new Error("Business Name is required.");
  }

  const website = normalizeWebsiteUrl(input.website);

  const { data, error } = await supabaseAdmin
    .from("prospects")
    .insert({
      organization_id: input.organization_id,
      user_id: input.user_id ?? null,
      community_id: input.community_id ?? null,
      business_name: businessName,
      website,
      linkedin: normalizeOptional(input.linkedin),
      facebook: normalizeOptional(input.facebook),
      instagram: normalizeOptional(input.instagram),
      industry: normalizeOptional(input.industry),
      category: normalizeOptional(input.category),
      country: normalizeOptional(input.country),
      state: normalizeOptional(input.state),
      city: normalizeOptional(input.city),
      address: normalizeOptional(input.address),
      company_size: normalizeOptional(input.company_size),
      revenue: normalizeOptional(input.revenue),
      employee_count: normalizeOptional(input.employee_count),
      technologies: normalizeOptional(input.technologies),
      pain_points: normalizeOptional(input.pain_points),
      decision_maker: normalizeOptional(input.decision_maker),
      first_name: normalizeOptional(input.first_name),
      last_name: normalizeOptional(input.last_name),
      external_contact_id: normalizeOptional(input.external_contact_id),
      timezone: normalizeOptional(input.timezone),
      job_title: normalizeOptional(input.job_title),
      email: normalizeOptional(input.email),
      phone: normalizeOptional(input.phone),
      google_business_url: normalizeOptional(input.google_business_url),
      notes: normalizeOptional(input.notes),
      additional_context: normalizeOptional(input.additional_context),
      ads_content: normalizeOptional(input.ads_content),
      source: input.source ?? "manual",
      status: input.status ?? "Queued",
      lifecycle_status: normalizeProspectLifecycleStatus(input.lifecycle_status),
      import_batch_id: input.import_batch_id ?? null,
      raw_json: input.raw_json ?? null,
      last_activity: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    console.error("Error creating prospect:", error);
    throw error;
  }

  return mapProspectRow(data as Prospect);
}

export async function updateProspect(
  id: string,
  organizationId: string,
  input: UpdateProspectInput,
): Promise<Prospect | null> {
  const existing = await getProspectById(id, organizationId);
  if (!existing) return null;

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.business_name !== undefined) {
    const name = input.business_name.trim();
    if (!name) throw new Error("Business Name is required.");
    payload.business_name = name;
  }
  if (input.website !== undefined) {
    payload.website = normalizeWebsiteUrl(input.website);
  }
  if (input.linkedin !== undefined) {
    payload.linkedin = normalizeOptional(input.linkedin);
  }
  if (input.facebook !== undefined) {
    payload.facebook = normalizeOptional(input.facebook);
  }
  if (input.instagram !== undefined) {
    payload.instagram = normalizeOptional(input.instagram);
  }
  if (input.industry !== undefined) {
    payload.industry = normalizeOptional(input.industry);
  }
  if (input.category !== undefined) {
    payload.category = normalizeOptional(input.category);
  }
  if (input.country !== undefined) {
    payload.country = normalizeOptional(input.country);
  }
  if (input.state !== undefined) {
    payload.state = normalizeOptional(input.state);
  }
  if (input.city !== undefined) {
    payload.city = normalizeOptional(input.city);
  }
  if (input.address !== undefined) {
    payload.address = normalizeOptional(input.address);
  }
  if (input.company_size !== undefined) {
    payload.company_size = normalizeOptional(input.company_size);
  }
  if (input.revenue !== undefined) {
    payload.revenue = normalizeOptional(input.revenue);
  }
  if (input.employee_count !== undefined) {
    payload.employee_count = normalizeOptional(input.employee_count);
  }
  if (input.technologies !== undefined) {
    payload.technologies = normalizeOptional(input.technologies);
  }
  if (input.pain_points !== undefined) {
    payload.pain_points = normalizeOptional(input.pain_points);
  }
  if (input.decision_maker !== undefined) {
    payload.decision_maker = normalizeOptional(input.decision_maker);
  }
  if (input.first_name !== undefined) {
    payload.first_name = normalizeOptional(input.first_name);
  }
  if (input.last_name !== undefined) {
    payload.last_name = normalizeOptional(input.last_name);
  }
  if (input.external_contact_id !== undefined) {
    payload.external_contact_id = normalizeOptional(input.external_contact_id);
  }
  if (input.timezone !== undefined) {
    payload.timezone = normalizeOptional(input.timezone);
  }
  if (input.job_title !== undefined) {
    payload.job_title = normalizeOptional(input.job_title);
  }
  if (input.email !== undefined) {
    payload.email = normalizeOptional(input.email);
  }
  if (input.phone !== undefined) {
    payload.phone = normalizeOptional(input.phone);
  }
  if (input.google_business_url !== undefined) {
    payload.google_business_url = normalizeOptional(input.google_business_url);
  }
  if (input.notes !== undefined) {
    payload.notes = normalizeOptional(input.notes);
  }
  if (input.additional_context !== undefined) {
    payload.additional_context = normalizeOptional(input.additional_context);
  }
  if (input.ads_content !== undefined) {
    payload.ads_content = normalizeOptional(input.ads_content);
  }
  if (input.lifecycle_status !== undefined) {
    payload.lifecycle_status = normalizeProspectLifecycleStatus(
      input.lifecycle_status,
    );
  }
  if (input.community_id !== undefined) {
    payload.community_id = input.community_id;
  }
  if (input.status !== undefined) payload.status = input.status;
  if (input.linked_discussion_id !== undefined) {
    payload.linked_discussion_id = input.linked_discussion_id;
  }
  if (input.opportunity_score !== undefined) {
    payload.opportunity_score = input.opportunity_score;
  }
  if (input.priority !== undefined) payload.priority = input.priority;
  if (input.website_intelligence !== undefined) {
    payload.website_intelligence = input.website_intelligence;
  }
  if (input.last_activity !== undefined) {
    payload.last_activity = input.last_activity;
  }
  if (input.raw_json !== undefined) payload.raw_json = input.raw_json;

  const { data, error } = await supabaseAdmin
    .from("prospects")
    .update(payload)
    .eq("id", id)
    .eq("organization_id", organizationId)
    .select("*")
    .single();

  if (error) {
    console.error("Error updating prospect:", error);
    return null;
  }

  return mapProspectRow(data as Prospect);
}

/**
 * Delete a Prospect owned by the organization.
 * Also removes the temporary Discussion compatibility bridge (and its cascaded
 * generation jobs / executive versions) via the existing deleteDiscussion path.
 */
export async function deleteProspect(
  id: string,
  organizationId: string,
): Promise<boolean> {
  const existing = await getProspectById(id, organizationId);
  if (!existing) {
    return false;
  }

  const bridgeDiscussionId = existing.linked_discussion_id;

  const { error } = await supabaseAdmin
    .from("prospects")
    .delete()
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (error) {
    console.error("Error deleting prospect:", error);
    return false;
  }

  if (bridgeDiscussionId) {
    const { deleteDiscussion } = await import(
      "@/services/discussionService"
    );
    await deleteDiscussion(bridgeDiscussionId, organizationId);
  }

  return true;
}
