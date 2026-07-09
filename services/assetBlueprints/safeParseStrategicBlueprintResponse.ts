import { logRegenerationDiagnostic } from "@/lib/regenerationDiagnostics";

export type SafeParseStrategicBlueprintResult =
  | {
      ok: true;
      data: Record<string, unknown>;
      method: "direct" | "fenced" | "balanced" | "repaired";
    }
  | {
      ok: false;
      error: string;
      rawText: string;
    };

const EXPECTED_FIELD_KEYS = [
  "asset_title",
  "assetTitle",
  "asset_type",
  "assetType",
  "business_goal",
  "businessGoal",
  "target_audience",
  "targetAudience",
  "priority",
  "estimated_reuse",
  "estimatedReuse",
  "image_prompt",
  "imagePrompt",
  "pdf_prompt",
  "pdfPrompt",
  "social_prompt",
  "socialPrompt",
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

function tryParseCandidate(
  candidate: string,
  method: "direct" | "fenced" | "balanced" | "repaired",
): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(candidate) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    logRegenerationDiagnostic(`BLUEPRINT_PARSE_SUCCESS`, { method });
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function hasExpectedFields(parsed: Record<string, unknown>): boolean {
  return EXPECTED_FIELD_KEYS.some((key) => {
    const value = parsed[key];
    if (value == null) {
      return false;
    }
    if (typeof value === "string") {
      return value.trim().length > 0;
    }
    if (typeof value === "number") {
      return true;
    }
    return false;
  });
}

function logParseFailure(error: string, rawText: string): void {
  logRegenerationDiagnostic("BLUEPRINT_PARSE_FAILED", {
    error,
    responseCharCount: rawText.length,
    ...(process.env.NODE_ENV === "development"
      ? { rawPreview: rawText.slice(0, 400) }
      : {}),
  });
}

export function safeParseStrategicBlueprintResponse(
  raw: string,
): SafeParseStrategicBlueprintResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    logParseFailure("Empty blueprint response", raw);
    return { ok: false, error: "Empty blueprint response", rawText: raw };
  }

  logRegenerationDiagnostic("BLUEPRINT_PARSE_ATTEMPT_DIRECT", {
    responseCharCount: trimmed.length,
  });
  const direct = tryParseCandidate(trimmed, "direct");
  if (direct && hasExpectedFields(direct)) {
    return { ok: true, data: direct, method: "direct" };
  }

  const fenced = extractFencedJson(trimmed);
  if (fenced) {
    logRegenerationDiagnostic("BLUEPRINT_PARSE_ATTEMPT_FENCED", {
      responseCharCount: fenced.length,
    });
    const fencedParsed = tryParseCandidate(fenced, "fenced");
    if (fencedParsed && hasExpectedFields(fencedParsed)) {
      return { ok: true, data: fencedParsed, method: "fenced" };
    }
  }

  const stripped = stripMarkdownFences(trimmed);
  if (stripped !== trimmed) {
    const strippedParsed = tryParseCandidate(stripped, "fenced");
    if (strippedParsed && hasExpectedFields(strippedParsed)) {
      return { ok: true, data: strippedParsed, method: "fenced" };
    }
  }

  const balanced = extractBalancedJsonObject(trimmed);
  if (balanced) {
    logRegenerationDiagnostic("BLUEPRINT_PARSE_ATTEMPT_BALANCED", {
      responseCharCount: balanced.length,
    });
    const balancedParsed = tryParseCandidate(balanced, "balanced");
    if (balancedParsed && hasExpectedFields(balancedParsed)) {
      return { ok: true, data: balancedParsed, method: "balanced" };
    }
  }

  logRegenerationDiagnostic("BLUEPRINT_PARSE_ATTEMPT_REPAIRED", {
    responseCharCount: trimmed.length,
  });
  const repairCandidates = [
    repairCommonJsonIssues(trimmed),
    balanced ? repairCommonJsonIssues(balanced) : null,
    fenced ? repairCommonJsonIssues(fenced) : null,
    stripped ? repairCommonJsonIssues(stripped) : null,
  ].filter(Boolean) as string[];

  for (const candidate of repairCandidates) {
    const repairedParsed = tryParseCandidate(candidate, "repaired");
    if (repairedParsed && hasExpectedFields(repairedParsed)) {
      return { ok: true, data: repairedParsed, method: "repaired" };
    }
  }

  const message = "Strategic Blueprint response could not be parsed as valid JSON";
  logParseFailure(message, raw);
  return { ok: false, error: message, rawText: raw };
}

export class BlueprintParseError extends Error {
  readonly code = "BLUEPRINT_PARSE_FAILED";

  constructor(message: string) {
    super(message);
    this.name = "BlueprintParseError";
  }
}

export function parseStrategicBlueprintResponseOrThrow(
  raw: string,
): Record<string, unknown> {
  const result = safeParseStrategicBlueprintResponse(raw);
  if (!result.ok) {
    throw new BlueprintParseError(result.error);
  }
  return result.data;
}
