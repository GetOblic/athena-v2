/**
 * Dedicated Free Convert create / bind / first-generate boundary.
 * Reserves before persist. Reuses the existing Prospect + intelligence
 * pipeline. Does not invent a Free prospect type or outreach generator.
 */

import { randomUUID } from "crypto";
import { FreeConvertGenerationError } from "@/lib/organization/freeConvertGeneration";
import { mapGoogleBusinessToFreeProspectRow } from "@/lib/prospects/freeGoogleProspectMapping";
import {
  convertGetOblicDirectoryListing,
  type GetOblicConvertInput,
} from "@/services/getoblicDirectory/getoblicDirectoryConvertService";
import { sanitizeGoogleBusinessPayload } from "@/services/googleBusiness/googleBusinessMakeService";
import {
  bindFreeConvertProspect,
  releaseFreeConvertIfReserved,
  reserveFreeConvert,
} from "@/services/organization/freeConvertAuthority";
import {
  ensureProspectGenerationQueued,
} from "@/services/prospects/prospectImporter";
import {
  findExistingProspectDuplicate,
} from "@/services/prospects/prospectImportPreparation";
import {
  createProspect,
  updateProspect,
  type Prospect,
} from "@/services/prospects/prospectService";
import {
  normalizeWebsiteUrl,
  resolveProspectBusinessName,
  resolveProspectDecisionMaker,
} from "@/services/prospects/prospectUtils";
import type { ProspectImportRow } from "@/services/prospects/prospectImporter";

function hasResearchWebsite(website: string | null | undefined): boolean {
  return Boolean(normalizeWebsiteUrl(website ?? ""));
}

export type PersistFreeConvertProspectResult = {
  prospect: Prospect;
  duplicate: boolean;
  invalidWebsite: boolean;
  queued: boolean;
  withoutWebsite: boolean;
  jobId?: string;
};

async function markProspectEnqueueFailed(input: {
  prospectId: string;
  organizationId: string;
}): Promise<void> {
  await updateProspect(input.prospectId, input.organizationId, {
    status: "Processing Failed",
    last_activity: new Date().toISOString(),
  });
}

async function persistFreeConvertProspect(input: {
  organizationId: string;
  userId: string | null;
  row: ProspectImportRow;
  rawJson?: Record<string, unknown> | null;
}): Promise<PersistFreeConvertProspectResult> {
  const businessName = resolveProspectBusinessName({
    ...input.row,
    decision_maker: resolveProspectDecisionMaker(input.row),
  });
  if (!businessName) {
    throw new Error(
      "Business Name is required when no website or contact name is available.",
    );
  }

  const websiteRaw = String(input.row.website ?? "").trim();
  const normalizedWebsite = websiteRaw ? normalizeWebsiteUrl(websiteRaw) : null;
  const invalidWebsite = Boolean(websiteRaw) && !normalizedWebsite;

  const existing = await findExistingProspectDuplicate(
    input.organizationId,
    invalidWebsite ? null : normalizedWebsite,
    businessName,
    input.row.city ?? null,
  );
  if (existing) {
    return {
      prospect: existing,
      duplicate: true,
      invalidWebsite: false,
      queued: false,
      withoutWebsite: !existing.website,
    };
  }

  const reservation = await reserveFreeConvert(input.organizationId);
  if (reservation.prospectId) {
    throw new FreeConvertGenerationError("FREE_CONVERT_RETRY_ONLY");
  }

  const rawJson = input.rawJson
    ? {
        ...input.rawJson,
        ...(invalidWebsite ? { invalid_website_input: websiteRaw } : {}),
      }
    : invalidWebsite
      ? { invalid_website_input: websiteRaw }
      : null;

  let created: Prospect;
  try {
    const persisted = await createProspect({
      organization_id: input.organizationId,
      user_id: input.userId,
      business_name: businessName,
      website: invalidWebsite ? null : normalizedWebsite,
      linkedin: input.row.linkedin,
      facebook: input.row.facebook,
      instagram: input.row.instagram,
      industry: input.row.industry,
      category: input.row.category,
      country: input.row.country,
      state: input.row.state,
      city: input.row.city,
      address: input.row.address,
      company_size: input.row.company_size,
      revenue: input.row.revenue,
      employee_count: input.row.employee_count,
      technologies: input.row.technologies,
      pain_points: input.row.pain_points,
      decision_maker: resolveProspectDecisionMaker(input.row),
      first_name: input.row.first_name,
      last_name: input.row.last_name,
      external_contact_id: input.row.external_contact_id,
      timezone: input.row.timezone,
      job_title: input.row.job_title,
      email: input.row.email,
      phone: input.row.phone,
      whatsapp_number: input.row.whatsapp_number,
      getoblic_type: input.row.getoblic_type,
      google_business_url: input.row.google_business_url,
      notes: input.row.notes,
      additional_context: input.row.additional_context,
      ads_content: input.row.ads_content,
      source: input.row.source?.trim() || "manual",
      status: invalidWebsite || !normalizedWebsite ? "Saved" : "Queued",
      import_batch_id: randomUUID(),
      raw_json: rawJson,
    });
    if (!persisted) {
      throw new Error("Failed to create prospect.");
    }
    created = persisted;
  } catch (error) {
    await releaseFreeConvertIfReserved({
      organizationId: input.organizationId,
      reservationToken: reservation.reservationToken,
    });
    throw error;
  }

  try {
    await bindFreeConvertProspect({
      organizationId: input.organizationId,
      reservationToken: reservation.reservationToken,
      prospectId: created.id,
    });
  } catch (error) {
    await markProspectEnqueueFailed({
      prospectId: created.id,
      organizationId: input.organizationId,
    });
    await releaseFreeConvertIfReserved({
      organizationId: input.organizationId,
      prospectId: created.id,
      reservationToken: reservation.reservationToken,
    });
    throw error;
  }

  if (!hasResearchWebsite(created.website)) {
    return {
      prospect: created,
      duplicate: false,
      invalidWebsite,
      queued: false,
      withoutWebsite: true,
    };
  }

  try {
    const queued = await ensureProspectGenerationQueued(created, {
      requestedBy: input.userId,
    });
    return {
      prospect: queued.prospect,
      duplicate: false,
      invalidWebsite,
      queued: queued.queued,
      withoutWebsite: false,
      jobId: queued.jobId,
    };
  } catch (error) {
    await markProspectEnqueueFailed({
      prospectId: created.id,
      organizationId: input.organizationId,
    });
    await releaseFreeConvertIfReserved({
      organizationId: input.organizationId,
      prospectId: created.id,
      reservationToken: reservation.reservationToken,
    });
    throw error;
  }
}

export async function createFreeConvertManualProspect(input: {
  organizationId: string;
  userId: string | null;
  row: ProspectImportRow;
}): Promise<PersistFreeConvertProspectResult> {
  return persistFreeConvertProspect(input);
}

export async function persistFreeConvertFromGetOblic(
  input: GetOblicConvertInput,
) {
  const reservation = await reserveFreeConvert(input.organizationId);
  if (reservation.prospectId) {
    throw new FreeConvertGenerationError("FREE_CONVERT_RETRY_ONLY");
  }

  try {
    const result = await convertGetOblicDirectoryListing(input);
    if (result.outcome === "created" && result.prospect_id) {
      await bindFreeConvertProspect({
        organizationId: input.organizationId,
        reservationToken: reservation.reservationToken,
        prospectId: result.prospect_id,
      });
      return result;
    }

    await releaseFreeConvertIfReserved({
      organizationId: input.organizationId,
      reservationToken: reservation.reservationToken,
    });
    return result;
  } catch (error) {
    await releaseFreeConvertIfReserved({
      organizationId: input.organizationId,
      reservationToken: reservation.reservationToken,
    });
    throw error;
  }
}

export async function persistFreeConvertFromGoogleBusiness(input: {
  organizationId: string;
  userId: string | null;
  payload: unknown;
}): Promise<PersistFreeConvertProspectResult> {
  const payload = sanitizeGoogleBusinessPayload(input.payload);
  const mapped = mapGoogleBusinessToFreeProspectRow(payload);
  return persistFreeConvertProspect({
    organizationId: input.organizationId,
    userId: input.userId,
    row: mapped.row,
    rawJson: mapped.rawJson,
  });
}

export async function enqueueFreeConvertProspectGeneration(input: {
  organizationId: string;
  userId: string | null;
  prospect: Prospect;
  triggerType?: "discussion_import" | "manual_refresh";
}): Promise<{ prospect: Prospect; queued: boolean; jobId?: string }> {
  if (!hasResearchWebsite(input.prospect.website)) {
    throw new FreeConvertGenerationError("FREE_CONVERT_WEBSITE_REQUIRED");
  }

  return ensureProspectGenerationQueued(input.prospect, {
    requestedBy: input.userId,
    triggerType: input.triggerType ?? "manual_refresh",
  });
}
