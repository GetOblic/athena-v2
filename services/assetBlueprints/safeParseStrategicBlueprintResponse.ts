import { logRegenerationEvent } from "@/lib/regenerationDiagnostics";

export type SafeParseStrategicBlueprintResult =
  | {
      ok: true;
      data: Record<string, unknown>;
    }
  | {
      ok: false;
      error: string;
      rawText: string;
    };

const CANONICAL_FIELD_ALIASES: Record<string, string> = {
  assetTitle: "asset_title",
  assetType: "asset_type",
  businessGoal: "business_goal",
  targetAudience: "target_audience",
  estimatedReuse: "estimated_reuse",
  imagePrompt: "image_prompt",
  pdfPrompt: "pdf_prompt",
  socialPrompt: "social_prompt",
};

const REQUIRED_STRING_FIELDS = [
  "asset_title",
  "asset_type",
  "business_goal",
  "target_audience",
  "priority",
  "estimated_reuse",
  "image_prompt",
  "pdf_prompt",
  "social_prompt",
  "notes",
] as const;

function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function normalizeSmartQuotes(text: string): string {
  return text
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
}

function repairCommonJsonIssues(text: string): string {
  return normalizeSmartQuotes(text)
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
}

function extractFencedJson(text: string): string | null {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return match?.[1]?.trim() ?? null;
}

function extractBalancedJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

function tryParseCandidate(candidate: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(candidate) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function coerceToString(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry ?? "").trim()).filter(Boolean).join("; ");
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value).trim();
}

export function normalizeStrategicBlueprintKeys(
  parsed: Record<string, unknown>,
): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...parsed };

  for (const [alias, canonical] of Object.entries(CANONICAL_FIELD_ALIASES)) {
    if (normalized[canonical] == null && normalized[alias] != null) {
      normalized[canonical] = normalized[alias];
    }
  }

  for (const field of REQUIRED_STRING_FIELDS) {
    normalized[field] = coerceToString(normalized[field]);
  }

  return normalized;
}

function hasRequiredStringFields(parsed: Record<string, unknown>): boolean {
  return REQUIRED_STRING_FIELDS.some((field) => {
    const value = parsed[field];
    return typeof value === "string" && value.trim().length > 0;
  });
}

function logParseFailure(error: string, rawText: string): void {
  logRegenerationEvent("BLUEPRINT_PARSE_FAILED_PRESERVED_PREVIOUS", {
    error,
    responseCharCount: rawText.length,
    ...(process.env.NODE_ENV === "development"
      ? { rawPreview: rawText.slice(0, 400) }
      : {}),
  });
}

export function safeParseStrategicBlueprint(
  raw: string,
): SafeParseStrategicBlueprintResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    const error = "Empty blueprint response";
    logParseFailure(error, raw);
    return { ok: false, error, rawText: raw };
  }

  const candidates = [
    trimmed,
    stripMarkdownFences(trimmed),
    extractFencedJson(trimmed),
    extractBalancedJsonObject(trimmed),
    repairCommonJsonIssues(trimmed),
    extractBalancedJsonObject(trimmed)
      ? repairCommonJsonIssues(extractBalancedJsonObject(trimmed)!)
      : null,
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const parsed = tryParseCandidate(candidate);
    if (!parsed) {
      continue;
    }

    const normalized = normalizeStrategicBlueprintKeys(parsed);
    if (hasRequiredStringFields(normalized)) {
      return { ok: true, data: normalized };
    }
  }

  const message = "Strategic Blueprint response could not be parsed";
  logParseFailure(message, raw);
  return { ok: false, error: message, rawText: raw };
}

/** @deprecated Use safeParseStrategicBlueprint */
export const safeParseStrategicBlueprintResponse = safeParseStrategicBlueprint;
