/**
 * Persona import + enqueue into the shared durable generation pipeline.
 * Never waits for generation to finish.
 *
 * Compatibility bridge:
 * each Persona links to a Discussion with platform = persona_intelligence.
 * That Discussion feeds Generation Jobs → Athena Worker → shared analysis pipeline.
 */

import { randomUUID } from "crypto";
import {
  createDiscussion,
  getDiscussionById,
  updateDiscussion,
} from "@/services/discussionService";
import { enqueueDiscussionGenerationJob } from "@/services/generationJobs/generationJobRunner";
import {
  findExistingPersonaDuplicate,
  preparePersonaImportRows,
  type FindPersonaDuplicateFn,
} from "@/services/personas/personaImportPreparation";
import {
  isTrustedPersonaBridgeFor,
  PERSONA_INTELLIGENCE_PLATFORM,
} from "@/services/personas/personaBridgeMarker";
import { buildPersonaAnalysisBody } from "@/services/personas/personaPipelineBody";
import {
  createPersona,
  getPersonaById,
  getPersonaByLinkedDiscussionId,
  type CreatePersonaInput,
  type Persona,
  updatePersona,
} from "@/services/personas/personaService";
import {
  toPersonaCsvParsedRecords,
  type PersonaCsvParsedRecord,
  type PersonaCsvRow,
} from "@/services/personas/personaCsv";
import {
  normalizeOptionalText,
  resolvePersonaDisplayLabel,
} from "@/services/personas/personaUtils";

export type PersonaImportRow = PersonaCsvRow;

export type PersonaImportInvalidRow = {
  rowNumber: number;
  reason: string;
};

export type PersonaImportSummary = {
  imported: number;
  queued: number;
  queueFailed: number;
  warnings: number;
  duplicates: number;
  invalidRows: number;
  failed: number;
  personaIds: string[];
  batchId: string;
  invalidRowDetails: PersonaImportInvalidRow[];
};

const CSV_PERSIST_CHUNK_SIZE = 50;

function mapRowToInput(
  row: PersonaImportRow,
  organizationId: string,
  userId: string | null,
  source: string,
  batchId: string,
): CreatePersonaInput {
  return {
    organization_id: organizationId,
    user_id: userId,
    persona_name: row.persona_name,
    short_description: row.short_description,
    category: row.category,
    gender_identity: row.gender_identity,
    age_range: row.age_range,
    birth_year_approx: row.birth_year_approx,
    generation: row.generation,
    cultural_background: row.cultural_background,
    country: row.country,
    state: row.state,
    city: row.city,
    location_summary: row.location_summary,
    languages: row.languages,
    relationship_status: row.relationship_status,
    household: row.household,
    income_range: row.income_range,
    purchasing_power: row.purchasing_power,
    education: row.education,
    occupation: row.occupation,
    seniority: row.seniority,
    industry_context: row.industry_context,
    lifestyle: row.lifestyle,
    interests: row.interests,
    digital_behavior: row.digital_behavior,
    brands_influences: row.brands_influences,
    values_text: row.values_text,
    aesthetic_preferences: row.aesthetic_preferences,
    preferred_imagery: row.preferred_imagery,
    goals: row.goals,
    needs: row.needs,
    pain_points: row.pain_points,
    fears: row.fears,
    motivations: row.motivations,
    objections: row.objections,
    buying_triggers: row.buying_triggers,
    decision_criteria: row.decision_criteria,
    purchase_behavior: row.purchase_behavior,
    typical_concerns: row.typical_concerns,
    communication_style: row.communication_style,
    preferred_channels: row.preferred_channels,
    reference_website: row.reference_website,
    notes: row.notes,
    additional_context: row.additional_context,
    ads_content: row.ads_content,
    source: normalizeOptionalText(row.source) ?? source,
    status: "Queued",
    import_batch_id: batchId,
  };
}

function bridgeMarkerRawJson(personaId: string): Record<string, unknown> {
  return {
    intelligence_source: "persona",
    persona_id: personaId,
  };
}

/**
 * Ensure the Persona has a trusted linked Discussion bridge.
 * Idempotent: reuses a valid linked bridge; creates/relinks when missing or invalid.
 */
export async function ensurePersonaBridgeDiscussion(
  persona: Persona,
): Promise<{ persona: Persona; discussionId: string }> {
  let current = persona;
  const title = resolvePersonaDisplayLabel(current);
  const bridgeBody = buildPersonaAnalysisBody(current);
  let discussionId = current.linked_discussion_id;

  if (discussionId) {
    const existing = await getDiscussionById(
      discussionId,
      current.organization_id,
    );
    const trusted = isTrustedPersonaBridgeFor(
      existing,
      current.id,
      current.organization_id,
    );
    if (!trusted) {
      discussionId = null;
    }
  }

  if (!discussionId) {
    const discussion = await createDiscussion({
      organization_id: current.organization_id,
      community_id: current.community_id,
      user_id: current.user_id,
      platform: PERSONA_INTELLIGENCE_PLATFORM,
      title,
      author: null,
      url: current.reference_website,
      body: bridgeBody,
      status: "New",
      raw_json: bridgeMarkerRawJson(current.id),
    });

    if (!discussion) {
      await updatePersona(current.id, current.organization_id, {
        status: "Processing Failed",
      });
      throw new Error("Failed to create Persona Intelligence bridge discussion.");
    }

    discussionId = discussion.id;
    current =
      (await updatePersona(current.id, current.organization_id, {
        linked_discussion_id: discussionId,
      })) ?? current;
  } else {
    await updateDiscussion(discussionId, current.organization_id, {
      title,
      url: current.reference_website,
      body: bridgeBody,
      platform: PERSONA_INTELLIGENCE_PLATFORM,
    });
  }

  return { persona: current, discussionId };
}

/**
 * Worker / pre-generation: reload Persona fields into the bridge body.
 */
export async function preparePersonaBridgeBeforeGeneration(
  discussionId: string,
  organizationId: string,
): Promise<void> {
  const persona = await getPersonaByLinkedDiscussionId(
    discussionId,
    organizationId,
  );
  if (!persona) return;

  let current =
    (await getPersonaById(persona.id, organizationId)) ?? persona;

  current =
    (await updatePersona(current.id, organizationId, {
      status: "Generating Executive Intelligence",
      last_activity: new Date().toISOString(),
    })) ?? current;

  const ensured = await ensurePersonaBridgeDiscussion(current);
  if (!ensured.discussionId) return;

  await updateDiscussion(ensured.discussionId, organizationId, {
    title: resolvePersonaDisplayLabel(ensured.persona),
    url: ensured.persona.reference_website,
    body: buildPersonaAnalysisBody(ensured.persona),
    platform: PERSONA_INTELLIGENCE_PLATFORM,
  });
}

/**
 * Ensure the Persona has a linked Discussion bridge and a queued generation job.
 */
export async function ensurePersonaGenerationQueued(
  persona: Persona,
  options?: {
    requestedBy?: string | null;
    /**
     * Existing trigger types only.
     * Deep-scrape follow-on reuses prospect_deep_scrape (no persona_deep_scrape trigger).
     */
    triggerType?:
      | "discussion_import"
      | "manual_refresh"
      | "discussion_update"
      | "prospect_deep_scrape";
    /** Optional job progress intent (e.g. Think Differently). */
    progress?: Record<string, unknown> | null;
  },
): Promise<{ persona: Persona; queued: boolean; jobId?: string }> {
  const ensured = await ensurePersonaBridgeDiscussion(persona);
  let current = ensured.persona;
  const discussionId = ensured.discussionId;

  const enqueue = await enqueueDiscussionGenerationJob({
    organizationId: current.organization_id,
    discussionId,
    triggerType: options?.triggerType ?? "discussion_import",
    requestedBy: options?.requestedBy ?? current.user_id,
    allowExisting: true,
    requestFollowUpIfActive: true,
    progress: options?.progress ?? null,
  });

  const queued = Boolean(enqueue.accepted || enqueue.alreadyActive);
  current =
    (await updatePersona(current.id, current.organization_id, {
      status: queued ? "Queued" : current.status,
      last_activity: new Date().toISOString(),
    })) ?? current;

  return {
    persona: current,
    queued,
    jobId: enqueue.job.id,
  };
}

/**
 * Stage 4 terminal: complete Persona publication succeeded.
 * Ready means Current Executive Version + Blueprint + 14 Deployment Assets.
 */
export async function markPersonaGenerationReady(
  discussionId: string,
  organizationId: string,
  opportunityScore?: number | null,
): Promise<void> {
  const persona = await getPersonaByLinkedDiscussionId(
    discussionId,
    organizationId,
  );
  if (!persona) return;

  await updatePersona(persona.id, organizationId, {
    status: "Ready",
    opportunity_score:
      typeof opportunityScore === "number"
        ? Math.max(0, Math.min(100, Math.round(opportunityScore)))
        : undefined,
    last_activity: new Date().toISOString(),
  });
}

export async function markPersonaGenerationFailed(
  discussionId: string,
  organizationId: string,
): Promise<void> {
  const persona = await getPersonaByLinkedDiscussionId(
    discussionId,
    organizationId,
  );
  if (!persona) return;

  await updatePersona(persona.id, organizationId, {
    status: "Processing Failed",
    last_activity: new Date().toISOString(),
  });
}

/** Manual Persona create — persist then enqueue generation. */
export async function importPersonaManual(input: {
  organizationId: string;
  userId: string | null;
  row: PersonaImportRow;
}): Promise<{
  persona: Persona;
  duplicate: boolean;
  invalidReferenceWebsite: boolean;
  queued: boolean;
  jobId?: string;
  queueError?: string | null;
}> {
  const mapped = mapRowToInput(
    input.row,
    input.organizationId,
    input.userId,
    "manual",
    randomUUID(),
  );

  const { normalizePersonaReferenceWebsite } = await import(
    "@/services/personas/personaUtils"
  );
  const website = normalizePersonaReferenceWebsite(input.row.reference_website);
  const invalidReferenceWebsite = Boolean(
    website.invalidReferenceWebsiteInput,
  );
  const personaName = normalizeOptionalText(input.row.persona_name);

  if (website.referenceWebsite || personaName) {
    const existing = await findExistingPersonaDuplicate(
      input.organizationId,
      invalidReferenceWebsite ? null : website.referenceWebsite,
      personaName,
      input.row.city ?? null,
    );
    if (existing) {
      return {
        persona: existing,
        duplicate: true,
        invalidReferenceWebsite: false,
        queued: false,
      };
    }
  }

  const created = await createPersona(mapped);

  try {
    const queued = await ensurePersonaGenerationQueued(created, {
      requestedBy: input.userId,
      triggerType: "discussion_import",
    });
    return {
      persona: queued.persona,
      duplicate: false,
      invalidReferenceWebsite,
      queued: queued.queued,
      jobId: queued.jobId,
      queueError: queued.queued
        ? null
        : "Persona created but intelligence generation was not queued.",
    };
  } catch (error) {
    return {
      persona: created,
      duplicate: false,
      invalidReferenceWebsite,
      queued: false,
      queueError:
        error instanceof Error
          ? error.message
          : "Persona created but intelligence generation was not queued.",
    };
  }
}

export async function importPersonasFromRows(input: {
  organizationId: string;
  userId: string | null;
  records?: PersonaCsvParsedRecord[];
  rows?: PersonaImportRow[];
  source?: string;
  findDuplicate?: FindPersonaDuplicateFn;
  createPersona?: typeof createPersona;
  ensureQueued?: typeof ensurePersonaGenerationQueued;
}): Promise<PersonaImportSummary> {
  const batchId = randomUUID();
  const persist = input.createPersona ?? createPersona;
  const enqueue = input.ensureQueued ?? ensurePersonaGenerationQueued;
  const records =
    input.records ?? toPersonaCsvParsedRecords(input.rows ?? []);

  const prepared = await preparePersonaImportRows({
    organizationId: input.organizationId,
    records,
    findDuplicate: input.findDuplicate,
  });

  const summary: PersonaImportSummary = {
    imported: 0,
    queued: 0,
    queueFailed: 0,
    warnings: prepared.warningRows,
    duplicates: prepared.duplicateRows,
    invalidRows: prepared.invalidRows,
    failed: 0,
    personaIds: [],
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
    if (!item.importable) {
      continue;
    }

    try {
      const mapped = mapRowToInput(
        item.row,
        input.organizationId,
        input.userId,
        input.source ?? "csv",
        batchId,
      );

      const created = await persist(mapped);
      summary.imported += 1;
      summary.personaIds.push(created.id);

      try {
        const queued = await enqueue(created, {
          requestedBy: input.userId,
          triggerType: "discussion_import",
        });
        if (queued.queued) {
          summary.queued += 1;
        } else {
          summary.queueFailed += 1;
          if (summary.invalidRowDetails.length < 25) {
            summary.invalidRowDetails.push({
              rowNumber: item.rowNumber,
              reason:
                "Persona created but generation job was not queued.",
            });
          }
        }
      } catch (queueError) {
        summary.queueFailed += 1;
        if (summary.invalidRowDetails.length < 25) {
          summary.invalidRowDetails.push({
            rowNumber: item.rowNumber,
            reason:
              "Persona created but generation job was not queued.",
          });
        }
        console.error("[PERSONA_IMPORT] queue_failed", {
          rowNumber: item.rowNumber,
          personaId: created.id,
          error:
            queueError instanceof Error
              ? queueError.message
              : String(queueError),
        });
      }

      if (summary.imported % CSV_PERSIST_CHUNK_SIZE === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } catch (error) {
      summary.failed += 1;
      if (summary.invalidRowDetails.length < 25) {
        summary.invalidRowDetails.push({
          rowNumber: item.rowNumber,
          reason: "Row could not be imported.",
        });
      }
      console.error("[PERSONA_IMPORT] row_failed", {
        rowNumber: item.rowNumber,
        personaName: item.personaName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return summary;
}
