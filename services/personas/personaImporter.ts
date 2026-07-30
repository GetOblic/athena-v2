/**
 * Persona import — persist only (Stage 2).
 * Never creates bridge Discussions or enqueues generation.
 */

import { randomUUID } from "crypto";
import {
  findExistingPersonaDuplicate,
  preparePersonaImportRows,
  type FindPersonaDuplicateFn,
} from "@/services/personas/personaImportPreparation";
import {
  createPersona,
  type CreatePersonaInput,
  type Persona,
} from "@/services/personas/personaService";
import {
  toPersonaCsvParsedRecords,
  type PersonaCsvParsedRecord,
  type PersonaCsvRow,
} from "@/services/personas/personaCsv";
import { normalizeOptionalText } from "@/services/personas/personaUtils";

export type PersonaImportRow = PersonaCsvRow;

export type PersonaImportInvalidRow = {
  rowNumber: number;
  reason: string;
};

export type PersonaImportSummary = {
  imported: number;
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

/** Manual Persona create — synchronous persist only. */
export async function importPersonaManual(input: {
  organizationId: string;
  userId: string | null;
  row: PersonaImportRow;
}): Promise<{
  persona: Persona;
  duplicate: boolean;
  invalidReferenceWebsite: boolean;
}> {
  const mapped = mapRowToInput(
    input.row,
    input.organizationId,
    input.userId,
    "manual",
    randomUUID(),
  );

  // Soft-normalize Reference Website through createPersona / preparePersonaCreateRow.
  // Duplicate checks use the same rules as CSV import when identity keys exist.
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
      };
    }
  }

  const created = await createPersona(mapped);
  return {
    persona: created,
    duplicate: false,
    invalidReferenceWebsite,
  };
}

export async function importPersonasFromRows(input: {
  organizationId: string;
  userId: string | null;
  records?: PersonaCsvParsedRecord[];
  rows?: PersonaImportRow[];
  source?: string;
  findDuplicate?: FindPersonaDuplicateFn;
  createPersona?: typeof createPersona;
}): Promise<PersonaImportSummary> {
  const batchId = randomUUID();
  const persist = input.createPersona ?? createPersona;
  const records =
    input.records ?? toPersonaCsvParsedRecords(input.rows ?? []);

  const prepared = await preparePersonaImportRows({
    organizationId: input.organizationId,
    records,
    findDuplicate: input.findDuplicate,
  });

  const summary: PersonaImportSummary = {
    imported: 0,
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

      if (summary.imported % CSV_PERSIST_CHUNK_SIZE === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } catch (error) {
      summary.failed += 1;
      if (summary.invalidRowDetails.length < 25) {
        summary.invalidRowDetails.push({
          rowNumber: item.rowNumber,
          reason:
            error instanceof Error
              ? "Row could not be imported."
              : "Row could not be imported.",
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
