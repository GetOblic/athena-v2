/**
 * Shared Persona CSV row preparation for preview and final import.
 * Classification mirrors importPersonasFromRows decision order exactly.
 */

import type {
  PersonaCsvParsedRecord,
  PersonaCsvRow,
} from "@/services/personas/personaCsv";
import { toPersonaCsvParsedRecords } from "@/services/personas/personaCsv";
import type { Persona } from "@/services/personas/personaService";
import {
  hasMeaningfulPersonaContent,
  normalizeOptionalText,
  normalizePersonaReferenceWebsite,
  resolvePersonaDisplayLabel,
} from "@/services/personas/personaUtils";

export type PersonaImportRowStatus =
  | "ready"
  | "duplicate"
  | "warning"
  | "invalid";

export type PreparedPersonaImportRow = {
  rowNumber: number;
  row: PersonaCsvRow;
  personaName: string | null;
  displayLabel: string;
  referenceWebsiteInput: string | null;
  normalizedReferenceWebsite: string | null;
  invalidReferenceWebsite: boolean;
  city: string | null;
  category: string | null;
  status: PersonaImportRowStatus;
  warnings: string[];
  reason: string | null;
  importable: boolean;
  duplicateSource: "database" | "file" | null;
};

export type PreparedPersonaImportBatch = {
  totalRows: number;
  importableRows: number;
  duplicateRows: number;
  invalidRows: number;
  warningRows: number;
  rows: PreparedPersonaImportRow[];
};

export type PersonaImportPreviewRow = {
  rowNumber: number;
  personaName: string | null;
  displayLabel: string;
  referenceWebsiteInput: string | null;
  normalizedReferenceWebsite: string | null;
  city: string | null;
  category: string | null;
  status: PersonaImportRowStatus;
  warnings: string[];
  reason: string | null;
};

export type PersonaImportPreviewPayload = {
  totalRows: number;
  importableRows: number;
  duplicateRows: number;
  invalidRows: number;
  warningRows: number;
  recognizedColumns: string[];
  ignoredColumns: string[];
  displayedRows: number;
  totalPreparedRows: number;
  showingSubset: boolean;
  rows: PersonaImportPreviewRow[];
};

export type FindPersonaDuplicateFn = (
  organizationId: string,
  referenceWebsite: string | null,
  personaName: string | null,
  city: string | null,
) => Promise<Persona | null>;

export const PERSONA_IMPORT_PREVIEW_ROW_LIMIT = 20;

function buildDuplicateIdentityKey(input: {
  normalizedReferenceWebsite: string | null;
  invalidReferenceWebsite: boolean;
  personaName: string | null;
  city: string | null;
}): string | null {
  const website =
    input.invalidReferenceWebsite || !input.normalizedReferenceWebsite
      ? null
      : input.normalizedReferenceWebsite.toLowerCase();

  if (website) {
    return `website:${website}`;
  }

  const name = String(input.personaName ?? "")
    .trim()
    .toLowerCase();
  if (!name) {
    return null;
  }

  const city = String(input.city ?? "")
    .trim()
    .toLowerCase();
  return `namecity:${name}|${city}`;
}

function buildContextFingerprint(additionalContext: string | null): string | null {
  const normalized = String(additionalContext ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (normalized.length < 40) return null;
  return normalized.slice(0, 240);
}

export async function findExistingPersonaDuplicate(
  organizationId: string,
  referenceWebsite: string | null,
  personaName: string | null,
  city: string | null,
): Promise<Persona | null> {
  const {
    findPersonaByNameAndCity,
    findPersonaByReferenceWebsite,
  } = await import("@/services/personas/personaService");

  if (referenceWebsite) {
    return findPersonaByReferenceWebsite(organizationId, referenceWebsite);
  }

  const name = String(personaName ?? "").trim();
  if (!name) return null;

  return findPersonaByNameAndCity(organizationId, name, city);
}

function resolveRecords(input: {
  records?: PersonaCsvParsedRecord[];
  rows?: PersonaCsvRow[];
}): PersonaCsvParsedRecord[] {
  if (input.records) return input.records;
  if (input.rows) return toPersonaCsvParsedRecords(input.rows);
  return [];
}

/**
 * Classify every CSV data row exactly as final import would decide.
 */
export async function preparePersonaImportRows(input: {
  organizationId: string;
  records?: PersonaCsvParsedRecord[];
  rows?: PersonaCsvRow[];
  findDuplicate?: FindPersonaDuplicateFn;
}): Promise<PreparedPersonaImportBatch> {
  const findDuplicate = input.findDuplicate ?? findExistingPersonaDuplicate;
  const records = resolveRecords(input);
  const prepared: PreparedPersonaImportRow[] = [];
  const seenIdentities = new Set<string>();
  const seenContextFingerprints = new Set<string>();

  let importableRows = 0;
  let duplicateRows = 0;
  let invalidRows = 0;
  let warningRows = 0;

  for (const record of records) {
    const row = record.fields;
    const rowNumber = record.sourceRowNumber;
    const website = normalizePersonaReferenceWebsite(row.reference_website);
    const referenceWebsiteInput =
      normalizeOptionalText(row.reference_website) ?? null;
    const invalidReferenceWebsite = Boolean(
      website.invalidReferenceWebsiteInput,
    );
    const personaName = normalizeOptionalText(row.persona_name);
    const city = normalizeOptionalText(row.city);
    const category = normalizeOptionalText(row.category);
    const warnings: string[] = [];

    const displayLabel = resolvePersonaDisplayLabel({
      persona_name: personaName,
      short_description: row.short_description,
      reference_website: website.referenceWebsite,
      additional_context: row.additional_context,
    });

    const base = {
      rowNumber,
      row,
      personaName,
      displayLabel,
      referenceWebsiteInput,
      normalizedReferenceWebsite: website.referenceWebsite,
      invalidReferenceWebsite,
      city,
      category,
    };

    if (
      !hasMeaningfulPersonaContent({
        ...row,
        reference_website: website.referenceWebsite,
        invalid_reference_website_input: website.invalidReferenceWebsiteInput,
      })
    ) {
      invalidRows += 1;
      prepared.push({
        ...base,
        status: "invalid",
        warnings,
        reason: "Blank row",
        importable: false,
        duplicateSource: null,
      });
      continue;
    }

    if (invalidReferenceWebsite) {
      warnings.push(
        "Reference Website could not be normalized; original value will be retained",
      );
    }

    const duplicateKey = buildDuplicateIdentityKey({
      normalizedReferenceWebsite: website.referenceWebsite,
      invalidReferenceWebsite,
      personaName,
      city,
    });

    if (duplicateKey && seenIdentities.has(duplicateKey)) {
      duplicateRows += 1;
      prepared.push({
        ...base,
        status: "duplicate",
        warnings,
        reason: website.referenceWebsite
          ? "Duplicate Reference Website"
          : "Duplicate Persona Name and City",
        importable: false,
        duplicateSource: "file",
      });
      continue;
    }

    if (duplicateKey) {
      const existing = await findDuplicate(
        input.organizationId,
        invalidReferenceWebsite ? null : website.referenceWebsite,
        personaName,
        city,
      );

      if (existing) {
        duplicateRows += 1;
        seenIdentities.add(duplicateKey);
        prepared.push({
          ...base,
          status: "duplicate",
          warnings,
          reason: website.referenceWebsite
            ? "Duplicate Reference Website"
            : "Duplicate Persona Name and City",
          importable: false,
          duplicateSource: "database",
        });
        continue;
      }
    }

    const contextOnly =
      !personaName &&
      !website.referenceWebsite &&
      !invalidReferenceWebsite &&
      Boolean(normalizeOptionalText(row.additional_context));

    if (contextOnly) {
      const fingerprint = buildContextFingerprint(
        normalizeOptionalText(row.additional_context),
      );
      if (fingerprint && seenContextFingerprints.has(fingerprint)) {
        warnings.push(
          "Possible context-only duplicate; import remains allowed",
        );
      } else if (fingerprint) {
        seenContextFingerprints.add(fingerprint);
      }
    }

    if (duplicateKey) {
      seenIdentities.add(duplicateKey);
    }

    importableRows += 1;
    const hasWarning = warnings.length > 0;
    if (hasWarning) warningRows += 1;

    prepared.push({
      ...base,
      status: hasWarning ? "warning" : "ready",
      warnings,
      reason: null,
      importable: true,
      duplicateSource: null,
    });
  }

  return {
    totalRows: records.length,
    importableRows,
    duplicateRows,
    invalidRows,
    warningRows,
    rows: prepared,
  };
}

export function buildPersonaImportPreviewPayload(input: {
  batch: PreparedPersonaImportBatch;
  recognizedColumns: string[];
  ignoredColumns: string[];
  rowLimit?: number;
}): PersonaImportPreviewPayload {
  const limit = input.rowLimit ?? PERSONA_IMPORT_PREVIEW_ROW_LIMIT;
  const displayRows = input.batch.rows.slice(0, limit);

  return {
    totalRows: input.batch.totalRows,
    importableRows: input.batch.importableRows,
    duplicateRows: input.batch.duplicateRows,
    invalidRows: input.batch.invalidRows,
    warningRows: input.batch.warningRows,
    recognizedColumns: input.recognizedColumns,
    ignoredColumns: input.ignoredColumns,
    displayedRows: displayRows.length,
    totalPreparedRows: input.batch.rows.length,
    showingSubset: input.batch.rows.length > displayRows.length,
    rows: displayRows.map((row) => ({
      rowNumber: row.rowNumber,
      personaName: row.personaName,
      displayLabel: row.displayLabel,
      referenceWebsiteInput: row.referenceWebsiteInput,
      normalizedReferenceWebsite: row.normalizedReferenceWebsite,
      city: row.city,
      category: row.category,
      status: row.status,
      warnings: row.warnings,
      reason: row.reason,
    })),
  };
}
