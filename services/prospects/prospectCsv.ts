/**
 * Pure CSV helpers for Prospect Intelligence imports.
 * Document-level parser supports quoted multiline fields and physical source row numbers.
 */

export type ProspectCsvRow = {
  business_name?: string | null;
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
  job_title?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp_number?: string | null;
  google_business_url?: string | null;
  notes?: string | null;
  additional_context?: string | null;
  ads_content?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  external_contact_id?: string | null;
  timezone?: string | null;
  source?: string | null;
};

/** Parsed data record with the physical CSV line where the record begins. */
export type ProspectCsvParsedRecord = {
  sourceRowNumber: number;
  fields: ProspectCsvRow;
};

export const PROSPECT_CSV_FIELD_ALIASES: Record<
  string,
  keyof ProspectCsvRow
> = {
  business_name: "business_name",
  business: "business_name",
  company: "business_name",
  company_name: "business_name",
  name: "business_name",
  website: "website",
  url: "website",
  linkedin: "linkedin",
  linkedin_url: "linkedin",
  facebook: "facebook",
  facebook_url: "facebook",
  instagram: "instagram",
  instagram_url: "instagram",
  industry: "industry",
  category: "category",
  country: "country",
  state: "state",
  city: "city",
  address: "address",
  street_address: "address",
  street: "address",
  company_size: "company_size",
  size: "company_size",
  revenue: "revenue",
  employee_count: "employee_count",
  employees: "employee_count",
  technologies: "technologies",
  technology: "technologies",
  tech_stack: "technologies",
  pain_points: "pain_points",
  pain_point: "pain_points",
  decision_maker: "decision_maker",
  contact: "decision_maker",
  contact_name: "decision_maker",
  first_name: "first_name",
  firstname: "first_name",
  contact_first_name: "first_name",
  last_name: "last_name",
  lastname: "last_name",
  contact_last_name: "last_name",
  external_contact_id: "external_contact_id",
  contact_id: "external_contact_id",
  contactid: "external_contact_id",
  crm_contact_id: "external_contact_id",
  crm_id: "external_contact_id",
  external_id: "external_contact_id",
  timezone: "timezone",
  time_zone: "timezone",
  tz: "timezone",
  job_title: "job_title",
  title: "job_title",
  email: "email",
  phone: "phone",
  whatsapp_number: "whatsapp_number",
  whatsapp: "whatsapp_number",
  whatsapp_phone: "whatsapp_number",
  whatsapp_mobile: "whatsapp_number",
  whatsapp_contact: "whatsapp_number",
  whatsapp_no: "whatsapp_number",
  whatsapp_num: "whatsapp_number",
  wa_number: "whatsapp_number",
  google_business_url: "google_business_url",
  google_business: "google_business_url",
  gbp: "google_business_url",
  google_url: "google_business_url",
  google_url_: "google_business_url",
  google_business_profile: "google_business_url",
  notes: "notes",
  additional_context: "additional_context",
  context: "additional_context",
  ads_content: "ads_content",
  ad_content: "ads_content",
  advertising_content: "ads_content",
  google_ads: "ads_content",
  meta_ads: "ads_content",
  ads: "ads_content",
  source: "source",
};

/** Shared preview + final import ceiling. Never silently truncate. */
export const PROSPECT_CSV_MAX_DATA_ROWS = 500;

export type ProspectCsvDocument = {
  originalHeaders: string[];
  normalizedHeaders: string[];
  recognizedColumns: Array<keyof ProspectCsvRow>;
  ignoredColumns: string[];
  /** Data records with physical source line numbers. */
  records: ProspectCsvParsedRecord[];
  /** Compatibility view of record fields only. */
  rows: ProspectCsvRow[];
  parseFailure: boolean;
  parseFailureReason: string | null;
  /** True when the file looks like semicolon-delimited / unusable headers. */
  delimiterFailure: boolean;
  delimiterFailureReason: string | null;
};

type RawCsvRecord = {
  sourceRowNumber: number;
  cells: string[];
};

function normalizeHeaderToken(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, "_");
}

function emptyDocument(
  overrides: Partial<ProspectCsvDocument> = {},
): ProspectCsvDocument {
  return {
    originalHeaders: [],
    normalizedHeaders: [],
    recognizedColumns: [],
    ignoredColumns: [],
    records: [],
    rows: [],
    parseFailure: false,
    parseFailureReason: null,
    delimiterFailure: false,
    delimiterFailureReason: null,
    ...overrides,
  };
}

/**
 * Document-level CSV record parser.
 * Supports commas in quotes, escaped quotes, CRLF/LF, and quoted multiline fields.
 */
function parseCsvRawRecords(text: string): {
  records: RawCsvRecord[];
  parseFailure: boolean;
  parseFailureReason: string | null;
} {
  const source = text.replace(/^\uFEFF/, "");
  const records: RawCsvRecord[] = [];
  let cells: string[] = [];
  let current = "";
  let inQuotes = false;
  let lineNumber = 1;
  let recordStartLine = 1;
  let sawRecordContent = false;

  const pushCell = () => {
    cells.push(current);
    current = "";
  };

  const finishRecord = () => {
    const hasContent = cells.some((cell) => cell.trim().length > 0);
    if (hasContent) {
      records.push({
        sourceRowNumber: recordStartLine,
        cells,
      });
    }
    cells = [];
    current = "";
    sawRecordContent = false;
  };

  const advanceNewline = (index: number): number => {
    const char = source[index];
    if (char === "\r" && source[index + 1] === "\n") {
      return index + 2;
    }
    return index + 1;
  };

  let i = 0;
  while (i < source.length) {
    const char = source[i];
    const next = source[i + 1];

    if (char === '"') {
      sawRecordContent = true;
      if (inQuotes && next === '"') {
        current += '"';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
      i += 1;
      continue;
    }

    if (
      !inQuotes &&
      (char === "\n" || char === "\r")
    ) {
      pushCell();
      finishRecord();
      i = advanceNewline(i);
      lineNumber += 1;
      recordStartLine = lineNumber;
      continue;
    }

    if (inQuotes && (char === "\n" || char === "\r")) {
      // Preserve a single LF for CRLF or LF inside quoted fields.
      current += "\n";
      i = advanceNewline(i);
      lineNumber += 1;
      continue;
    }

    if (char === "," && !inQuotes) {
      sawRecordContent = true;
      pushCell();
      i += 1;
      continue;
    }

    sawRecordContent = true;
    current += char;
    i += 1;
  }

  if (inQuotes) {
    return {
      records: [],
      parseFailure: true,
      parseFailureReason:
        "CSV contains an unclosed quoted field. Close every quoted value and try again.",
    };
  }

  if (sawRecordContent || cells.length > 0 || current.length > 0) {
    pushCell();
    finishRecord();
  }

  return {
    records,
    parseFailure: false,
    parseFailureReason: null,
  };
}

function detectDelimiterFailure(originalHeaders: string[]): {
  failure: boolean;
  reason: string | null;
} {
  if (originalHeaders.length === 0) {
    return {
      failure: true,
      reason: "CSV header row is missing.",
    };
  }

  if (
    originalHeaders.length === 1 &&
    /;/.test(originalHeaders[0]) &&
    !/,/.test(originalHeaders[0])
  ) {
    return {
      failure: true,
      reason:
        "This file looks semicolon-delimited. Athena expects a comma-separated CSV. Export again as CSV (comma) or use the Athena template.",
    };
  }

  const normalized = originalHeaders.map(normalizeHeaderToken);
  const recognized = normalized.filter(
    (header) => Boolean(PROSPECT_CSV_FIELD_ALIASES[header]),
  );

  if (recognized.length === 0) {
    return {
      failure: true,
      reason:
        "No recognized Prospect columns were found. Download the Athena CSV template or rename headers to match supported field names.",
    };
  }

  return { failure: false, reason: null };
}

function mapCellsToFields(
  cells: string[],
  normalizedHeaders: string[],
): ProspectCsvRow {
  const row: ProspectCsvRow = {};
  normalizedHeaders.forEach((header, index) => {
    const key = PROSPECT_CSV_FIELD_ALIASES[header];
    if (!key) return;
    const raw = cells[index];
    row[key] = raw == null || raw.trim() === "" ? null : raw.trim();
  });
  return row;
}

export function prospectCsvDataRowLimitMessage(count: number): string {
  return `This CSV contains ${count} data rows. Athena currently supports a maximum of ${PROSPECT_CSV_MAX_DATA_ROWS} Prospects per import. Split the file into smaller batches.`;
}

/** Shared limit check for preview and final import routes. */
export function validateProspectCsvDataRowLimit(
  dataRowCount: number,
): { ok: true } | { ok: false; message: string } {
  if (dataRowCount > PROSPECT_CSV_MAX_DATA_ROWS) {
    return {
      ok: false,
      message: prospectCsvDataRowLimitMessage(dataRowCount),
    };
  }
  return { ok: true };
}

/**
 * Rich CSV parse with header diagnostics, multiline quoted fields,
 * and physical source row numbers for preview and import.
 */
export function parseProspectCsvDocument(text: string): ProspectCsvDocument {
  const raw = parseCsvRawRecords(text);

  if (raw.parseFailure) {
    return emptyDocument({
      parseFailure: true,
      parseFailureReason: raw.parseFailureReason,
    });
  }

  if (raw.records.length === 0) {
    return emptyDocument({
      delimiterFailure: true,
      delimiterFailureReason: "CSV contained no header or data rows.",
    });
  }

  const headerRecord = raw.records[0];
  const originalHeaders = headerRecord.cells.map((header) => header.trim());
  const normalizedHeaders = originalHeaders.map(normalizeHeaderToken);
  const delimiter = detectDelimiterFailure(originalHeaders);

  const recognizedSet = new Set<keyof ProspectCsvRow>();
  const ignoredColumns: string[] = [];

  normalizedHeaders.forEach((header, index) => {
    const key = PROSPECT_CSV_FIELD_ALIASES[header];
    if (key) {
      recognizedSet.add(key);
    } else if (originalHeaders[index]?.trim()) {
      ignoredColumns.push(originalHeaders[index].trim());
    }
  });

  const records: ProspectCsvParsedRecord[] = raw.records
    .slice(1)
    .map((record) => ({
      sourceRowNumber: record.sourceRowNumber,
      fields: mapCellsToFields(record.cells, normalizedHeaders),
    }));

  const rows = records.map((record) => record.fields);

  const hasUsableSignal = rows.some((row) => {
    return Boolean(
      String(row.business_name ?? "").trim() ||
        String(row.website ?? "").trim() ||
        String(row.decision_maker ?? "").trim() ||
        String(row.email ?? "").trim() ||
        String(row.phone ?? "").trim(),
    );
  });

  let delimiterFailure = delimiter.failure;
  let delimiterFailureReason = delimiter.reason;
  if (
    !delimiterFailure &&
    rows.length > 0 &&
    recognizedSet.size > 0 &&
    !hasUsableSignal
  ) {
    delimiterFailure = true;
    delimiterFailureReason =
      "No usable Business Name, Website, or contact fields were found in the data rows.";
  }

  return {
    originalHeaders,
    normalizedHeaders,
    recognizedColumns: Array.from(recognizedSet),
    ignoredColumns,
    records,
    rows,
    parseFailure: false,
    parseFailureReason: null,
    delimiterFailure,
    delimiterFailureReason,
  };
}

/** Compatibility wrapper — returns mapped data row fields only. */
export function parseProspectCsv(text: string): ProspectCsvRow[] {
  return parseProspectCsvDocument(text).rows;
}

/** Normalize legacy row arrays into parsed records with synthetic line numbers. */
export function toProspectCsvParsedRecords(
  rows: ProspectCsvRow[],
  headerRowNumber = 1,
): ProspectCsvParsedRecord[] {
  return rows.map((fields, index) => ({
    sourceRowNumber: headerRowNumber + 1 + index,
    fields,
  }));
}
