/**
 * Shared Prospect CSV row preparation for preview and final import.
 * Classification mirrors importProspectsFromRows decision order exactly.
 * Preview must never write; import reuses the same classification before persist.
 */

import type {
  ProspectCsvParsedRecord,
  ProspectCsvRow,
} from "@/services/prospects/prospectCsv";
import { toProspectCsvParsedRecords } from "@/services/prospects/prospectCsv";
import type { Prospect } from "@/services/prospects/prospectService";
import {
  normalizeWebsiteUrl,
  resolveProspectBusinessName,
} from "@/services/prospects/prospectUtils";

export type ProspectImportRowStatus =
  | "ready"
  | "duplicate"
  | "warning"
  | "invalid";

export type PreparedProspectImportRow = {
  /** Physical CSV source line where the data record begins. */
  rowNumber: number;
  row: ProspectCsvRow;
  businessName: string | null;
  websiteInput: string | null;
  normalizedWebsite: string | null;
  decisionMaker: string | null;
  industry: string | null;
  city: string | null;
  email: string | null;
  /** Website Athena will persist (null when missing or invalid). */
  websiteToPersist: string | null;
  invalidWebsite: boolean;
  withoutWebsite: boolean;
  status: ProspectImportRowStatus;
  warnings: string[];
  reason: string | null;
  /** True when this row would be persisted by final import. */
  importable: boolean;
  duplicateSource: "database" | "file" | null;
};

export type PreparedProspectImportBatch = {
  totalRows: number;
  importableRows: number;
  duplicateRows: number;
  invalidRows: number;
  invalidWebsiteRows: number;
  withoutWebsiteRows: number;
  rows: PreparedProspectImportRow[];
};

export type ProspectImportPreviewRow = {
  rowNumber: number;
  businessName: string | null;
  websiteInput: string | null;
  normalizedWebsite: string | null;
  decisionMaker: string | null;
  industry: string | null;
  city: string | null;
  email: string | null;
  status: ProspectImportRowStatus;
  warnings: string[];
  reason: string | null;
};

export type ProspectImportPreviewPayload = {
  totalRows: number;
  importableRows: number;
  duplicateRows: number;
  invalidRows: number;
  invalidWebsiteRows: number;
  withoutWebsiteRows: number;
  recognizedColumns: string[];
  ignoredColumns: string[];
  displayedRows: number;
  totalPreparedRows: number;
  showingSubset: boolean;
  rows: ProspectImportPreviewRow[];
};

export type FindProspectDuplicateFn = (
  organizationId: string,
  website: string | null,
  businessName: string,
  city: string | null,
) => Promise<Prospect | null>;

export const PROSPECT_IMPORT_PREVIEW_ROW_LIMIT = 20;

function buildDuplicateIdentityKey(input: {
  normalizedWebsite: string | null;
  invalidWebsite: boolean;
  businessName: string;
  city: string | null;
}): string {
  const website =
    input.invalidWebsite || !input.normalizedWebsite
      ? null
      : input.normalizedWebsite.toLowerCase();

  if (website) {
    return `website:${website}`;
  }

  const name = input.businessName.trim().toLowerCase();
  const city = String(input.city ?? "")
    .trim()
    .toLowerCase();
  return `namecity:${name}|${city}`;
}

export async function findExistingProspectDuplicate(
  organizationId: string,
  website: string | null,
  businessName: string,
  city: string | null,
): Promise<Prospect | null> {
  // Lazy import keeps pure preview tests free of supabaseAdmin env requirements.
  const {
    findProspectByNameAndCity,
    findProspectByWebsite,
  } = await import("@/services/prospects/prospectService");

  if (website) {
    return findProspectByWebsite(organizationId, website);
  }
  return findProspectByNameAndCity(organizationId, businessName, city);
}

function resolveRecords(input: {
  records?: ProspectCsvParsedRecord[];
  rows?: ProspectCsvRow[];
}): ProspectCsvParsedRecord[] {
  if (input.records) return input.records;
  if (input.rows) return toProspectCsvParsedRecords(input.rows);
  return [];
}

/**
 * Classify every CSV data row exactly as final import would decide:
 * invalid → skip; duplicate (DB or earlier file row) → skip;
 * otherwise importable (ready or warning for invalid website).
 */
export async function prepareProspectImportRows(input: {
  organizationId: string;
  records?: ProspectCsvParsedRecord[];
  /** @deprecated Prefer `records` with parser source row numbers. */
  rows?: ProspectCsvRow[];
  findDuplicate?: FindProspectDuplicateFn;
}): Promise<PreparedProspectImportBatch> {
  const findDuplicate =
    input.findDuplicate ?? findExistingProspectDuplicate;
  const records = resolveRecords(input);
  const prepared: PreparedProspectImportRow[] = [];
  const seenIdentities = new Set<string>();

  let importableRows = 0;
  let duplicateRows = 0;
  let invalidRows = 0;
  let invalidWebsiteRows = 0;
  let withoutWebsiteRows = 0;

  for (const record of records) {
    const row = record.fields;
    const rowNumber = record.sourceRowNumber;
    const websiteInput = String(row.website ?? "").trim() || null;
    const normalizedWebsite = websiteInput
      ? normalizeWebsiteUrl(websiteInput)
      : null;
    const invalidWebsite = Boolean(websiteInput) && !normalizedWebsite;
    const businessName = resolveProspectBusinessName(row);
    const city = row.city ?? null;
    const warnings: string[] = [];

    const base = {
      rowNumber,
      row,
      businessName,
      websiteInput,
      normalizedWebsite,
      decisionMaker: row.decision_maker?.trim() || null,
      industry: row.industry?.trim() || null,
      city: city?.trim() || null,
      email: row.email?.trim() || null,
      websiteToPersist: invalidWebsite ? null : normalizedWebsite,
      invalidWebsite,
      withoutWebsite: !normalizedWebsite || invalidWebsite,
    };

    if (!businessName) {
      invalidRows += 1;
      prepared.push({
        ...base,
        status: "invalid",
        warnings,
        reason: "Missing Business Name and no usable fallback identifier.",
        importable: false,
        duplicateSource: null,
      });
      continue;
    }

    if (invalidWebsite) {
      invalidWebsiteRows += 1;
      warnings.push(
        "Website is invalid and will be stored empty; Prospect will still be created.",
      );
    }

    const duplicateKey = buildDuplicateIdentityKey({
      normalizedWebsite,
      invalidWebsite,
      businessName,
      city,
    });

    if (seenIdentities.has(duplicateKey)) {
      duplicateRows += 1;
      prepared.push({
        ...base,
        status: "duplicate",
        warnings,
        reason: "Duplicate of an earlier row in this CSV file.",
        importable: false,
        duplicateSource: "file",
      });
      continue;
    }

    const existing = await findDuplicate(
      input.organizationId,
      invalidWebsite ? null : normalizedWebsite,
      businessName,
      city,
    );

    if (existing) {
      duplicateRows += 1;
      seenIdentities.add(duplicateKey);
      prepared.push({
        ...base,
        status: "duplicate",
        warnings,
        reason: "Duplicate of an existing Prospect in this organization.",
        importable: false,
        duplicateSource: "database",
      });
      continue;
    }

    seenIdentities.add(duplicateKey);
    importableRows += 1;
    if (base.withoutWebsite) {
      withoutWebsiteRows += 1;
      if (!invalidWebsite && !websiteInput) {
        warnings.push(
          "No website provided; Prospect will be created without homepage learning.",
        );
      }
    }

    prepared.push({
      ...base,
      status:
        invalidWebsite || (!websiteInput && warnings.length > 0)
          ? "warning"
          : "ready",
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
    invalidWebsiteRows,
    withoutWebsiteRows,
    rows: prepared,
  };
}

/** Shape prepared classification for the preview API (bounded row details). */
export function buildProspectImportPreviewPayload(input: {
  batch: PreparedProspectImportBatch;
  recognizedColumns: string[];
  ignoredColumns: string[];
  rowLimit?: number;
}): ProspectImportPreviewPayload {
  const limit = input.rowLimit ?? PROSPECT_IMPORT_PREVIEW_ROW_LIMIT;
  const displayRows = input.batch.rows.slice(0, limit);

  return {
    totalRows: input.batch.totalRows,
    importableRows: input.batch.importableRows,
    duplicateRows: input.batch.duplicateRows,
    invalidRows: input.batch.invalidRows,
    invalidWebsiteRows: input.batch.invalidWebsiteRows,
    withoutWebsiteRows: input.batch.withoutWebsiteRows,
    recognizedColumns: input.recognizedColumns,
    ignoredColumns: input.ignoredColumns,
    displayedRows: displayRows.length,
    totalPreparedRows: input.batch.rows.length,
    showingSubset: input.batch.rows.length > displayRows.length,
    rows: displayRows.map((row) => ({
      rowNumber: row.rowNumber,
      businessName: row.businessName,
      websiteInput: row.websiteInput,
      normalizedWebsite: row.normalizedWebsite,
      decisionMaker: row.decisionMaker,
      industry: row.industry,
      city: row.city,
      email: row.email,
      status: row.status,
      warnings: row.warnings,
      reason: row.reason,
    })),
  };
}
