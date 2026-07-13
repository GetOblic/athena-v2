/**
 * Prospect import + enqueue into the shared durable generation pipeline.
 * Never waits for generation to finish.
 *
 * Temporary compatibility bridge:
 * each Prospect links to a Discussion with platform = prospect_intelligence.
 * That Discussion feeds Generation Jobs → Athena Worker → Executive Pipeline → Versions.
 * Homepage scrape runs inside the worker before the pipeline (not in CSV HTTP).
 */

import { randomUUID } from "crypto";
import {
  createDiscussion,
  updateDiscussion,
} from "@/services/discussionService";
import { enqueueDiscussionGenerationJob } from "@/services/generationJobs/generationJobRunner";
import {
  findExistingProspectDuplicate,
  prepareProspectImportRows,
  type FindProspectDuplicateFn,
} from "@/services/prospects/prospectImportPreparation";
import {
  buildProspectAnalysisBody,
  createProspect,
  getProspectByLinkedDiscussionId,
  normalizeWebsiteUrl,
  PROSPECT_INTELLIGENCE_PLATFORM,
  type CreateProspectInput,
  type Prospect,
  updateProspect,
} from "@/services/prospects/prospectService";
import {
  parseProspectCsv,
  toProspectCsvParsedRecords,
  type ProspectCsvParsedRecord,
  type ProspectCsvRow,
} from "@/services/prospects/prospectCsv";
import { resolveProspectBusinessName } from "@/services/prospects/prospectUtils";
import { scrapeHomepageIntelligence } from "@/services/prospects/prospectWebsiteIntelligence";

export type ProspectImportRow = ProspectCsvRow;
export { parseProspectCsv };

export type ProspectImportInvalidRow = {
  rowNumber: number;
  reason: string;
};

export type ProspectImportSummary = {
  imported: number;
  duplicates: number;
  invalidWebsites: number;
  invalidRows: number;
  queued: number;
  withoutWebsite: number;
  prospectIds: string[];
  batchId: string;
  invalidRowDetails: ProspectImportInvalidRow[];
};

const CSV_PERSIST_CHUNK_SIZE = 50;

function mapRowToInput(
  row: ProspectImportRow,
  organizationId: string,
  userId: string | null,
  source: string,
  batchId: string,
  businessName: string,
): CreateProspectInput {
  return {
    organization_id: organizationId,
    user_id: userId,
    business_name: businessName,
    website: row.website,
    linkedin: row.linkedin,
    facebook: row.facebook,
    instagram: row.instagram,
    industry: row.industry,
    category: row.category,
    country: row.country,
    state: row.state,
    city: row.city,
    address: row.address,
    company_size: row.company_size,
    revenue: row.revenue,
    employee_count: row.employee_count,
    technologies: row.technologies,
    pain_points: row.pain_points,
    decision_maker: row.decision_maker,
    job_title: row.job_title,
    email: row.email,
    phone: row.phone,
    google_business_url: row.google_business_url,
    notes: row.notes,
    additional_context: row.additional_context,
    ads_content: row.ads_content,
    source: row.source?.trim() || source,
    status: "Queued",
    import_batch_id: batchId,
  };
}

/**
 * Ensure the Prospect has a linked Discussion bridge and a queued generation job.
 * Does NOT scrape in the HTTP request path — scrape happens in the worker.
 */
export async function ensureProspectGenerationQueued(
  prospect: Prospect,
  options?: {
    requestedBy?: string | null;
    /**
     * Import/append keep discussion_import / discussion_update semantics.
     * Explicit Refresh Intelligence must use manual_refresh so the worker
     * runs with explicitRegeneration and publishes a new Current Version.
     */
    triggerType?: "discussion_import" | "manual_refresh" | "discussion_update";
  },
): Promise<{ prospect: Prospect; queued: boolean; jobId?: string }> {
  let current = prospect;
  const bridgeBody = buildProspectAnalysisBody(current);
  let discussionId = current.linked_discussion_id;

  if (!discussionId) {
    const discussion = await createDiscussion({
      organization_id: current.organization_id,
      community_id: current.community_id,
      user_id: current.user_id,
      platform: PROSPECT_INTELLIGENCE_PLATFORM,
      title: current.business_name,
      author: current.decision_maker,
      url: current.website,
      body: bridgeBody,
      status: "New",
      raw_json: {
        intelligence_source: "prospect",
        prospect_id: current.id,
      },
    });

    if (!discussion) {
      await updateProspect(current.id, current.organization_id, {
        status: "Processing Failed",
      });
      throw new Error("Failed to create Prospect Intelligence bridge discussion.");
    }

    discussionId = discussion.id;
    current =
      (await updateProspect(current.id, current.organization_id, {
        linked_discussion_id: discussionId,
        status: "Queued",
      })) ?? current;
  } else {
    await updateDiscussion(discussionId, current.organization_id, {
      title: current.business_name,
      author: current.decision_maker,
      url: current.website,
      body: bridgeBody,
    });
  }

  const enqueue = await enqueueDiscussionGenerationJob({
    organizationId: current.organization_id,
    discussionId,
    triggerType: options?.triggerType ?? "discussion_import",
    requestedBy: options?.requestedBy ?? current.user_id,
    allowExisting: true,
    requestFollowUpIfActive: true,
  });

  const queued = Boolean(enqueue.accepted || enqueue.alreadyActive);
  current =
    (await updateProspect(current.id, current.organization_id, {
      status: queued ? "Queued" : current.status,
      last_activity: new Date().toISOString(),
    })) ?? current;

  return {
    prospect: current,
    queued,
    jobId: enqueue.job.id,
  };
}

/**
 * Worker pre-step: homepage scrape + bridge body refresh before canonical pipeline.
 * Isolated Prospect compatibility seam — keep out of Discussion-only paths.
 */
export async function prepareProspectBridgeBeforeGeneration(
  discussionId: string,
  organizationId: string,
): Promise<void> {
  const prospect = await getProspectByLinkedDiscussionId(
    discussionId,
    organizationId,
  );
  if (!prospect) return;

  let current = prospect;

  if (current.website) {
    await updateProspect(current.id, organizationId, {
      status: "Learning from Website",
    });

    const intelligence = await scrapeHomepageIntelligence(current.website);
    current =
      (await updateProspect(current.id, organizationId, {
        website_intelligence: intelligence,
        status: "Generating Executive Intelligence",
        last_activity: new Date().toISOString(),
      })) ?? current;
  } else {
    current =
      (await updateProspect(current.id, organizationId, {
        status: "Generating Executive Intelligence",
        last_activity: new Date().toISOString(),
      })) ?? current;
  }

  if (!current.linked_discussion_id) return;

  await updateDiscussion(current.linked_discussion_id, organizationId, {
    title: current.business_name,
    author: current.decision_maker,
    url: current.website,
    body: buildProspectAnalysisBody(current),
  });
}

export async function markProspectGenerationReady(
  discussionId: string,
  organizationId: string,
  opportunityScore?: number | null,
): Promise<void> {
  const prospect = await getProspectByLinkedDiscussionId(
    discussionId,
    organizationId,
  );
  if (!prospect) return;

  await updateProspect(prospect.id, organizationId, {
    status: "Ready",
    opportunity_score:
      typeof opportunityScore === "number"
        ? Math.max(0, Math.min(100, Math.round(opportunityScore)))
        : undefined,
    last_activity: new Date().toISOString(),
  });
}

export async function markProspectGenerationFailed(
  discussionId: string,
  organizationId: string,
): Promise<void> {
  const prospect = await getProspectByLinkedDiscussionId(
    discussionId,
    organizationId,
  );
  if (!prospect) return;

  await updateProspect(prospect.id, organizationId, {
    status: "Processing Failed",
    last_activity: new Date().toISOString(),
  });
}

export async function importProspectManual(input: {
  organizationId: string;
  userId: string | null;
  row: ProspectImportRow;
}): Promise<{
  prospect: Prospect;
  duplicate: boolean;
  invalidWebsite: boolean;
  queued: boolean;
  withoutWebsite: boolean;
  jobId?: string;
}> {
  const businessName = resolveProspectBusinessName(input.row);
  if (!businessName) {
    throw new Error(
      "Business Name is required when no website or contact name is available.",
    );
  }

  const websiteRaw = String(input.row.website ?? "").trim();
  const normalizedWebsite = websiteRaw
    ? normalizeWebsiteUrl(websiteRaw)
    : null;
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

  const created = await createProspect({
    ...mapRowToInput(
      input.row,
      input.organizationId,
      input.userId,
      "manual",
      randomUUID(),
      businessName,
    ),
    website: invalidWebsite ? null : normalizedWebsite,
    raw_json: invalidWebsite
      ? { invalid_website_input: websiteRaw }
      : null,
  });

  if (!created) {
    throw new Error("Failed to create prospect.");
  }

  const queued = await ensureProspectGenerationQueued(created, {
    requestedBy: input.userId,
  });

  return {
    prospect: queued.prospect,
    duplicate: false,
    invalidWebsite,
    queued: queued.queued,
    withoutWebsite: !created.website,
    jobId: queued.jobId,
  };
}

export async function importProspectsFromRows(input: {
  organizationId: string;
  userId: string | null;
  records?: ProspectCsvParsedRecord[];
  /** Compatibility input when callers only have field maps. */
  rows?: ProspectImportRow[];
  source?: string;
  findDuplicate?: FindProspectDuplicateFn;
  createProspect?: typeof createProspect;
  ensureQueued?: typeof ensureProspectGenerationQueued;
}): Promise<ProspectImportSummary> {
  const batchId = randomUUID();
  const persist = input.createProspect ?? createProspect;
  const enqueue = input.ensureQueued ?? ensureProspectGenerationQueued;
  const records =
    input.records ??
    toProspectCsvParsedRecords(input.rows ?? []);

  const prepared = await prepareProspectImportRows({
    organizationId: input.organizationId,
    records,
    findDuplicate: input.findDuplicate,
  });

  const summary: ProspectImportSummary = {
    imported: 0,
    duplicates: prepared.duplicateRows,
    invalidWebsites: prepared.invalidWebsiteRows,
    invalidRows: prepared.invalidRows,
    queued: 0,
    withoutWebsite: 0,
    prospectIds: [],
    batchId,
    invalidRowDetails: prepared.rows
      .filter((row) => row.status === "invalid")
      .slice(0, 25)
      .map((row) => ({
        rowNumber: row.rowNumber,
        reason: row.reason ?? "Invalid row.",
      })),
  };

  for (const item of prepared.rows) {
    if (!item.importable || !item.businessName) {
      continue;
    }

    try {
      const mapped = mapRowToInput(
        item.row,
        input.organizationId,
        input.userId,
        input.source ?? "csv",
        batchId,
        item.businessName,
      );
      mapped.website = item.websiteToPersist;
      if (item.invalidWebsite && item.websiteInput) {
        mapped.raw_json = { invalid_website_input: item.websiteInput };
      }

      const created = await persist(mapped);
      if (!created) {
        summary.invalidRows += 1;
        if (summary.invalidRowDetails.length < 25) {
          summary.invalidRowDetails.push({
            rowNumber: item.rowNumber,
            reason: "Could not create Prospect record.",
          });
        }
        continue;
      }

      summary.imported += 1;
      summary.prospectIds.push(created.id);
      if (!created.website) summary.withoutWebsite += 1;

      // Persist + enqueue only — no homepage scrape in the HTTP path.
      const queued = await enqueue(created, {
        requestedBy: input.userId,
      });
      if (queued.queued) {
        summary.queued += 1;
      } else {
        summary.invalidRows += 1;
        if (summary.invalidRowDetails.length < 25) {
          summary.invalidRowDetails.push({
            rowNumber: item.rowNumber,
            reason: "Prospect created but generation job was not queued.",
          });
        }
      }

      // Soft yield between chunks to reduce request pressure.
      if (summary.imported % CSV_PERSIST_CHUNK_SIZE === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } catch (error) {
      summary.invalidRows += 1;
      if (summary.invalidRowDetails.length < 25) {
        summary.invalidRowDetails.push({
          rowNumber: item.rowNumber,
          reason: "Row could not be imported.",
        });
      }
      console.error("[PROSPECT_IMPORT] row_failed", {
        rowNumber: item.rowNumber,
        businessName: item.businessName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return summary;
}
