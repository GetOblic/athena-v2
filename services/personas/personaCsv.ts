/**
 * Pure CSV helpers for Persona Intelligence imports.
 * Document-level parser supports quoted multiline fields and physical source row numbers.
 */

export type PersonaCsvRow = {
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
  source?: string | null;
};

export type PersonaCsvParsedRecord = {
  sourceRowNumber: number;
  fields: PersonaCsvRow;
};

export const PERSONA_CSV_FIELD_ALIASES: Record<string, keyof PersonaCsvRow> = {
  persona_name: "persona_name",
  name: "persona_name",
  persona: "persona_name",
  short_description: "short_description",
  description: "short_description",
  category: "category",
  gender_identity: "gender_identity",
  gender: "gender_identity",
  age_range: "age_range",
  age: "age_range",
  birth_year_approx: "birth_year_approx",
  birth_year: "birth_year_approx",
  birthyear: "birth_year_approx",
  generation: "generation",
  cultural_background: "cultural_background",
  country: "country",
  state: "state",
  city: "city",
  location_summary: "location_summary",
  languages: "languages",
  language: "languages",
  relationship_status: "relationship_status",
  household: "household",
  income_range: "income_range",
  income: "income_range",
  purchasing_power: "purchasing_power",
  assets: "purchasing_power",
  education: "education",
  occupation: "occupation",
  seniority: "seniority",
  professional_seniority: "seniority",
  industry_context: "industry_context",
  lifestyle: "lifestyle",
  interests: "interests",
  digital_behavior: "digital_behavior",
  brands_influences: "brands_influences",
  brands: "brands_influences",
  values_text: "values_text",
  values: "values_text",
  aesthetic_preferences: "aesthetic_preferences",
  preferred_imagery: "preferred_imagery",
  goals: "goals",
  needs: "needs",
  pain_points: "pain_points",
  painpoint: "pain_points",
  painpoints: "pain_points",
  fears: "fears",
  motivations: "motivations",
  objections: "objections",
  buying_triggers: "buying_triggers",
  decision_criteria: "decision_criteria",
  purchase_behavior: "purchase_behavior",
  typical_concerns: "typical_concerns",
  communication_style: "communication_style",
  preferred_channels: "preferred_channels",
  channels: "preferred_channels",
  reference_website: "reference_website",
  website: "reference_website",
  url: "reference_website",
  reference_url: "reference_website",
  research_website: "reference_website",
  notes: "notes",
  internal_notes: "notes",
  additional_context: "additional_context",
  context: "additional_context",
  ads_content: "ads_content",
  ads: "ads_content",
  ad_content: "ads_content",
  meta_ads: "ads_content",
  google_ads: "ads_content",
  source: "source",
};

export const PERSONA_CSV_MAX_DATA_ROWS = 500;

export type PersonaCsvDocument = {
  originalHeaders: string[];
  normalizedHeaders: string[];
  recognizedColumns: Array<keyof PersonaCsvRow>;
  ignoredColumns: string[];
  records: PersonaCsvParsedRecord[];
  rows: PersonaCsvRow[];
  parseFailure: boolean;
  parseFailureReason: string | null;
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
  overrides: Partial<PersonaCsvDocument> = {},
): PersonaCsvDocument {
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

    if (!inQuotes && (char === "\n" || char === "\r")) {
      pushCell();
      finishRecord();
      i = advanceNewline(i);
      lineNumber += 1;
      recordStartLine = lineNumber;
      continue;
    }

    if (inQuotes && (char === "\n" || char === "\r")) {
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
    (header) => Boolean(PERSONA_CSV_FIELD_ALIASES[header]),
  );

  if (recognized.length === 0) {
    return {
      failure: true,
      reason:
        "No recognized Persona columns were found. Download the Athena CSV template or rename headers to match supported field names.",
    };
  }

  return { failure: false, reason: null };
}

function mapCellsToFields(
  cells: string[],
  normalizedHeaders: string[],
): PersonaCsvRow {
  const row: PersonaCsvRow = {};
  normalizedHeaders.forEach((header, index) => {
    const key = PERSONA_CSV_FIELD_ALIASES[header];
    if (!key) return;
    const raw = cells[index];
    row[key] = raw == null || raw.trim() === "" ? null : raw.trim();
  });
  return row;
}

export function personaCsvDataRowLimitMessage(count: number): string {
  return `This CSV contains ${count} data rows. Athena currently supports a maximum of ${PERSONA_CSV_MAX_DATA_ROWS} Personas per import. Split the file into smaller batches.`;
}

export function validatePersonaCsvDataRowLimit(
  dataRowCount: number,
): { ok: true } | { ok: false; message: string } {
  if (dataRowCount > PERSONA_CSV_MAX_DATA_ROWS) {
    return {
      ok: false,
      message: personaCsvDataRowLimitMessage(dataRowCount),
    };
  }
  return { ok: true };
}

export function parsePersonaCsvDocument(text: string): PersonaCsvDocument {
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

  const recognizedSet = new Set<keyof PersonaCsvRow>();
  const ignoredColumns: string[] = [];

  normalizedHeaders.forEach((header, index) => {
    const key = PERSONA_CSV_FIELD_ALIASES[header];
    if (key) {
      recognizedSet.add(key);
    } else if (originalHeaders[index]?.trim()) {
      ignoredColumns.push(originalHeaders[index].trim());
    }
  });

  const records: PersonaCsvParsedRecord[] = raw.records
    .slice(1)
    .map((record) => ({
      sourceRowNumber: record.sourceRowNumber,
      fields: mapCellsToFields(record.cells, normalizedHeaders),
    }));

  const rows = records.map((record) => record.fields);

  return {
    originalHeaders,
    normalizedHeaders,
    recognizedColumns: Array.from(recognizedSet),
    ignoredColumns,
    records,
    rows,
    parseFailure: false,
    parseFailureReason: null,
    delimiterFailure: delimiter.failure,
    delimiterFailureReason: delimiter.reason,
  };
}

export function parsePersonaCsv(text: string): PersonaCsvRow[] {
  return parsePersonaCsvDocument(text).rows;
}

export function toPersonaCsvParsedRecords(
  rows: PersonaCsvRow[],
  headerRowNumber = 1,
): PersonaCsvParsedRecord[] {
  return rows.map((fields, index) => ({
    sourceRowNumber: headerRowNumber + 1 + index,
    fields,
  }));
}
