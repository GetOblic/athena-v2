/**
 * Strict discussion/prospect analysis field normalization.
 * Recovers JSON-in-string summary without mutating historical EV rows.
 */

export type NormalizedAnalysisFields = {
  summary: string;
  sentiment: string;
  intent: string;
  buyer_stage: string;
  pain_points: string;
  opportunity_detected: boolean;
  opportunity_title: string;
  opportunity_reason: string;
  recommended_action: string;
  suggested_cta: string;
  risk_level: string;
  confidence: number;
  /** True when defaults indicate parse/fallback failure, not genuine low confidence. */
  isParserFallback: boolean;
  repairedFields: string[];
};

const SENTIMENTS = new Set([
  "positive",
  "neutral",
  "negative",
  "mixed",
]);

function looksLikeJsonDump(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function stripJsonFence(rawText: string): string {
  return rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function asProse(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
      .join("; ");
  }
  return "";
}

function tryParseObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(stripJsonFence(text)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function unwrapNestedSummary(
  summary: string,
  repaired: string[],
): { summary: string; nested: Record<string, unknown> | null } {
  if (!summary || !looksLikeJsonDump(summary)) {
    return { summary, nested: null };
  }
  const nested = tryParseObject(summary);
  if (!nested) {
    return {
      summary:
        "Athena could not produce a clean executive summary for this analysis.",
      nested: null,
    };
  }
  repaired.push("summary");
  const recovered =
    asProse(nested.summary) ||
    asProse(nested.executive_summary) ||
    asProse(nested.opportunity_reason) ||
    asProse(nested.recommended_action);
  return {
    summary:
      recovered ||
      "Athena could not produce a clean executive summary for this analysis.",
    nested,
  };
}

export function normalizeAnalysisFields(input: {
  summary?: unknown;
  sentiment?: unknown;
  intent?: unknown;
  buyer_stage?: unknown;
  pain_points?: unknown;
  opportunity_detected?: unknown;
  opportunity_title?: unknown;
  opportunity_reason?: unknown;
  recommended_action?: unknown;
  suggested_cta?: unknown;
  risk_level?: unknown;
  confidence?: unknown;
  isParserFallback?: boolean;
}): NormalizedAnalysisFields {
  const repairedFields: string[] = [];
  let summary = asProse(input.summary);
  const unwrapped = unwrapNestedSummary(summary, repairedFields);
  summary = unwrapped.summary;
  const nested = unwrapped.nested;

  const painSource = input.pain_points ?? nested?.pain_points;
  let pain_points = asProse(painSource);
  if (typeof input.pain_points === "string" && looksLikeJsonDump(input.pain_points)) {
    const nestedPain = tryParseObject(input.pain_points);
    if (nestedPain) {
      pain_points = asProse(nestedPain.pain_points) || asProse(nestedPain.summary);
      repairedFields.push("pain_points");
    }
  }

  let recommended_action = asProse(
    input.recommended_action ?? nested?.recommended_action,
  );
  if (
    typeof input.recommended_action === "string" &&
    looksLikeJsonDump(input.recommended_action)
  ) {
    const nestedAction = tryParseObject(input.recommended_action);
    if (nestedAction) {
      recommended_action =
        asProse(nestedAction.recommended_action) || asProse(nestedAction.summary);
      repairedFields.push("recommended_action");
    }
  }

  const confidenceRaw = Number(input.confidence ?? nested?.confidence ?? 0);
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.max(0, Math.min(100, confidenceRaw))
    : 0;

  let sentiment = asProse(input.sentiment ?? nested?.sentiment) || "neutral";
  if (!SENTIMENTS.has(sentiment.toLowerCase())) {
    sentiment = "neutral";
    repairedFields.push("sentiment");
  } else {
    sentiment = sentiment.toLowerCase();
  }

  return {
    summary,
    sentiment,
    intent: asProse(input.intent ?? nested?.intent) || "none",
    buyer_stage: asProse(input.buyer_stage ?? nested?.buyer_stage) || "unaware",
    pain_points,
    opportunity_detected: Boolean(
      input.opportunity_detected ?? nested?.opportunity_detected ?? false,
    ),
    opportunity_title: asProse(
      input.opportunity_title ?? nested?.opportunity_title,
    ),
    opportunity_reason: asProse(
      input.opportunity_reason ?? nested?.opportunity_reason,
    ),
    recommended_action,
    suggested_cta: asProse(input.suggested_cta ?? nested?.suggested_cta),
    risk_level: asProse(input.risk_level ?? nested?.risk_level) || "low",
    confidence,
    isParserFallback: Boolean(input.isParserFallback),
    repairedFields: [...new Set(repairedFields)],
  };
}

/**
 * Display-time recovery for already-published malformed EVs.
 * Never shows raw JSON in "What matters in 30 seconds".
 */
export function normalizeAnalysisSummaryForDisplay(
  summary: string | null | undefined,
): string {
  const normalized = normalizeAnalysisFields({ summary: summary ?? "" });
  return (
    normalized.summary ||
    "Athena could not produce a clean executive summary for this analysis."
  );
}

export function normalizeAnalysisForDisplay(analysis: {
  summary?: string | null;
  pain_points?: string | null;
  recommended_action?: string | null;
  confidence?: number | null;
  sentiment?: string | null;
  intent?: string | null;
  buyer_stage?: string | null;
  risk_level?: string | null;
  opportunity_title?: string | null;
  opportunity_reason?: string | null;
  [key: string]: unknown;
}): {
  summary: string;
  pain_points: string;
  recommended_action: string;
  confidence: number;
  sentiment: string;
  intent: string;
  buyer_stage: string;
  risk_level: string;
  opportunity_title: string;
  opportunity_reason: string;
} {
  const normalized = normalizeAnalysisFields(analysis);
  return {
    summary: normalized.summary,
    pain_points: normalized.pain_points,
    recommended_action: normalized.recommended_action,
    confidence: normalized.confidence,
    sentiment: normalized.sentiment,
    intent: normalized.intent,
    buyer_stage: normalized.buyer_stage,
    risk_level: normalized.risk_level,
    opportunity_title: normalized.opportunity_title,
    opportunity_reason: normalized.opportunity_reason,
  };
}

/**
 * Pre-publication contract. Distinguishes parser fallback from genuine low confidence.
 */
export function assertAnalysisPublicationContract(
  analysis: NormalizedAnalysisFields,
): { ok: true } | { ok: false; code: "MALFORMED_ANALYSIS_CONTRACT"; reason: string } {
  if (analysis.isParserFallback) {
    return {
      ok: false,
      code: "MALFORMED_ANALYSIS_CONTRACT",
      reason: "parser_fallback",
    };
  }
  if (!analysis.summary.trim()) {
    return {
      ok: false,
      code: "MALFORMED_ANALYSIS_CONTRACT",
      reason: "missing_summary",
    };
  }
  if (looksLikeJsonDump(analysis.summary)) {
    return {
      ok: false,
      code: "MALFORMED_ANALYSIS_CONTRACT",
      reason: "summary_is_json",
    };
  }
  if (!Number.isFinite(analysis.confidence)) {
    return {
      ok: false,
      code: "MALFORMED_ANALYSIS_CONTRACT",
      reason: "invalid_confidence",
    };
  }
  // Defaulted empty shell: confidence 0 + empty pain/action + generic sentiment.
  if (
    analysis.confidence === 0 &&
    !analysis.pain_points.trim() &&
    !analysis.recommended_action.trim() &&
    analysis.intent === "none" &&
    analysis.buyer_stage === "unaware"
  ) {
    return {
      ok: false,
      code: "MALFORMED_ANALYSIS_CONTRACT",
      reason: "default_fallback_shell",
    };
  }
  return { ok: true };
}
