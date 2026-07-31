/**
 * Canonical Persona Analysis Asset contract (V15).
 *
 * The 14 strategic headings below are Persona Analysis Assets.
 * Persona publishable Deployment Assets reuse the Prospect 26-key catalog
 * (see lib/personaIntelligenceAssetCatalog.ts) and are validated with the
 * Prospect deployment contract for the deployment package only.
 *
 * Assets are one labeled suggested_cta string — not per-asset rows.
 * Mutually exclusive with Prospect for Analysis keys: never accept Prospect
 * keys as Persona Analysis completeness.
 */

import {
  PERSONA_ANALYSIS_ASSET_META,
} from "@/services/ai/prompts/personaDeploymentAssetsConstraints";

/** Required Analysis keys — all 14 must be non-empty for V15 Ready / publication. */
export const REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS = [
  "PERSONA_EXECUTIVE_PROFILE",
  "MESSAGING_FRAMEWORK",
  "VALUE_PROPOSITION",
  "OBJECTION_HANDLING",
  "LANGUAGE_AND_TONE_GUIDE",
  "OFFER_POSITIONING",
  "CHANNEL_STRATEGY",
  "CAMPAIGN_CONCEPTS",
  "CONTENT_THEMES",
  "ADVERTISEMENT_CONCEPTS",
  "LANDING_PAGE_DIRECTION",
  "VISUAL_AND_IMAGE_PROMPT_DIRECTION",
  "CUSTOMER_EXPERIENCE_GUIDANCE",
  "VALIDATION_AND_LEARNING_PLAN",
] as const;

/**
 * @deprecated Use REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS. Kept as an alias so
 * older imports resolve to the Analysis catalog (not Prospect Deployment keys).
 */
export const REQUIRED_PERSONA_DEPLOYMENT_ASSET_KEYS =
  REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS;

export type RequiredPersonaAnalysisAssetKey =
  (typeof REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS)[number];

/** @deprecated Use RequiredPersonaAnalysisAssetKey */
export type RequiredPersonaDeploymentAssetKey = RequiredPersonaAnalysisAssetKey;

const HEADING_SOURCE_KEYS = [...REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS] as const;

// After the colon, consume only same-line whitespace so the newline that
// anchors the next heading remains available for `(?:^|\\n)`.
const SECTION_HEADING_PATTERN = new RegExp(
  `(?:^|\\n)(${HEADING_SOURCE_KEYS.join("|")}):[ \\t]*`,
  "g",
);

const OBJECT_SHAPE_KEYS = [...REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS] as const;

export type PersonaDeploymentAssetParseResult = {
  suggestedCta: string;
  recommendedResponse: string;
  cta: string;
  rawCharacterCount: number;
  unwrappedCharacterCount: number;
  parsedKeys: RequiredPersonaAnalysisAssetKey[];
  missingKeys: RequiredPersonaAnalysisAssetKey[];
  isComplete: boolean;
  isValid: boolean;
  failureReason: string | null;
};

export type PersonaDeploymentAssetDiagnostics = {
  rawCharacterCount: number;
  unwrappedCharacterCount: number;
  parsedAssetCount: number;
  parsedCanonicalKeys: RequiredPersonaAnalysisAssetKey[];
  missingCanonicalKeys: RequiredPersonaAnalysisAssetKey[];
  validationResult: "complete" | "incomplete" | "invalid";
  failureReason: string | null;
};

function stripJsonFence(rawText: string): string {
  return rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function looksLikeSectionHeadingBlock(text: string): boolean {
  SECTION_HEADING_PATTERN.lastIndex = 0;
  return SECTION_HEADING_PATTERN.test(text);
}

function canonicalizeKey(
  label: string,
): RequiredPersonaAnalysisAssetKey | null {
  if (
    (REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS as readonly string[]).includes(label)
  ) {
    return label as RequiredPersonaAnalysisAssetKey;
  }
  return null;
}

export type PersonaAnalysisAssetSection = {
  key: RequiredPersonaAnalysisAssetKey;
  content: string;
};

/** @deprecated Use PersonaAnalysisAssetSection */
export type PersonaDeploymentAssetSection = PersonaAnalysisAssetSection;

/**
 * Extract canonical Analysis sections from actual section headings only.
 * Order-independent; duplicates collapse to first occurrence with content.
 * Does not treat OBJECTION_HANDLING as Prospect OBJECTION_ANTICIPATION.
 */
export function extractPersonaAnalysisAssetSections(
  value?: string | null,
): PersonaAnalysisAssetSection[] {
  if (!value?.trim()) {
    return [];
  }

  SECTION_HEADING_PATTERN.lastIndex = 0;
  const matches = [...value.matchAll(SECTION_HEADING_PATTERN)];
  const seen = new Set<RequiredPersonaAnalysisAssetKey>();
  const sections: PersonaAnalysisAssetSection[] = [];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const label = match[1];
    const canonical = canonicalizeKey(label);
    if (!canonical || seen.has(canonical)) {
      continue;
    }

    const start = (match.index ?? 0) + match[0].length;
    const next = matches[index + 1];
    const end = next?.index ?? value.length;
    const content = value.slice(start, end).trim();
    if (!content) {
      continue;
    }

    seen.add(canonical);
    sections.push({ key: canonical, content });
  }

  return sections;
}

/** @deprecated Use extractPersonaAnalysisAssetSections */
export function extractPersonaDeploymentAssetSections(
  value?: string | null,
): PersonaAnalysisAssetSection[] {
  return extractPersonaAnalysisAssetSections(value);
}

export function extractPersonaAnalysisAssetKeys(
  value?: string | null,
): RequiredPersonaAnalysisAssetKey[] {
  return extractPersonaAnalysisAssetSections(value).map(
    (section) => section.key,
  );
}

/** @deprecated Use extractPersonaAnalysisAssetKeys */
export function extractPersonaDeploymentAssetKeys(
  value?: string | null,
): RequiredPersonaAnalysisAssetKey[] {
  return extractPersonaAnalysisAssetKeys(value);
}

export function missingPersonaAnalysisAssetKeys(
  parsedKeys: readonly string[],
): RequiredPersonaAnalysisAssetKey[] {
  const present = new Set(parsedKeys);
  return REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS.filter(
    (key) => !present.has(key),
  );
}

/** @deprecated Use missingPersonaAnalysisAssetKeys */
export function missingPersonaDeploymentAssetKeys(
  parsedKeys: readonly string[],
): RequiredPersonaAnalysisAssetKey[] {
  return missingPersonaAnalysisAssetKeys(parsedKeys);
}

export function isCompletePersonaAnalysisAssetSet(
  parsedKeys: readonly string[],
): boolean {
  return missingPersonaAnalysisAssetKeys(parsedKeys).length === 0;
}

/** @deprecated Use isCompletePersonaAnalysisAssetSet */
export function isCompletePersonaDeploymentAssetSet(
  parsedKeys: readonly string[],
): boolean {
  return isCompletePersonaAnalysisAssetSet(parsedKeys);
}

function composeLabeledCtaFromObject(
  parsed: Record<string, unknown>,
): string | null {
  for (const key of OBJECT_SHAPE_KEYS) {
    const value = String(parsed[key] ?? "").trim();
    if (value && looksLikeSectionHeadingBlock(value)) {
      const keys = extractPersonaAnalysisAssetKeys(value);
      if (keys.length > 0) {
        return value;
      }
    }
  }

  const parts: string[] = [];
  for (const key of REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS) {
    const direct = String(parsed[key] ?? "").trim();
    if (direct) {
      parts.push(`${key}:\n${direct}`);
    }
  }

  if (parts.length === 0) {
    return null;
  }

  return parts.join("\n\n");
}

function tryParseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    if (typeof parsed === "string") {
      const inner = parsed.trim();
      if (!inner) return null;
      try {
        const nested = JSON.parse(stripJsonFence(inner)) as unknown;
        if (nested && typeof nested === "object" && !Array.isArray(nested)) {
          return nested as Record<string, unknown>;
        }
      } catch {
        return null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Unwrap model response into a labeled Analysis Asset suggested_cta payload.
 * Rejects unlabeled prose / bare JSON without canonical Persona Analysis sections.
 */
export function unwrapPersonaAnalysisAssetResponse(
  rawText: string,
): PersonaDeploymentAssetParseResult {
  const rawCharacterCount = rawText.length;
  const unwrapped = stripJsonFence(rawText).trim();
  const unwrappedCharacterCount = unwrapped.length;

  const empty = (
    failureReason: string,
    suggestedCta = "",
  ): PersonaDeploymentAssetParseResult => {
    const parsedKeys = extractPersonaAnalysisAssetKeys(suggestedCta);
    const missingKeys = missingPersonaAnalysisAssetKeys(parsedKeys);
    const isComplete = missingKeys.length === 0 && parsedKeys.length > 0;
    return {
      suggestedCta,
      recommendedResponse: suggestedCta,
      cta: "",
      rawCharacterCount,
      unwrappedCharacterCount,
      parsedKeys,
      missingKeys,
      isComplete,
      isValid: isComplete,
      failureReason: isComplete ? null : failureReason,
    };
  };

  if (!unwrapped) {
    return empty("empty_response");
  }

  const asObject = tryParseJsonObject(unwrapped);
  if (asObject) {
    const fromSuggested = String(asObject.suggested_cta ?? "").trim();
    if (fromSuggested) {
      const nestedObject = tryParseJsonObject(stripJsonFence(fromSuggested));
      if (nestedObject) {
        const nestedLabeled =
          String(nestedObject.suggested_cta ?? "").trim() ||
          composeLabeledCtaFromObject(nestedObject);
        if (nestedLabeled) {
          return finalizeParseResult(
            nestedLabeled,
            String(asObject.recommended_response ?? nestedLabeled).trim() ||
              nestedLabeled,
            String(asObject.cta ?? "").trim(),
            rawCharacterCount,
            unwrappedCharacterCount,
          );
        }
      }

      return finalizeParseResult(
        fromSuggested,
        String(asObject.recommended_response ?? fromSuggested).trim() ||
          fromSuggested,
        String(asObject.cta ?? "").trim(),
        rawCharacterCount,
        unwrappedCharacterCount,
      );
    }

    const fromObject = composeLabeledCtaFromObject(asObject);
    if (fromObject) {
      return finalizeParseResult(
        fromObject,
        String(asObject.recommended_response ?? fromObject).trim() || fromObject,
        String(asObject.cta ?? "").trim(),
        rawCharacterCount,
        unwrappedCharacterCount,
      );
    }

    return empty("json_without_canonical_headings");
  }

  if (looksLikeSectionHeadingBlock(unwrapped)) {
    return finalizeParseResult(
      unwrapped,
      unwrapped,
      "",
      rawCharacterCount,
      unwrappedCharacterCount,
    );
  }

  return empty("unlabeled_or_malformed_output");
}

/** @deprecated Use unwrapPersonaAnalysisAssetResponse */
export function unwrapPersonaDeploymentAssetResponse(
  rawText: string,
): PersonaDeploymentAssetParseResult {
  return unwrapPersonaAnalysisAssetResponse(rawText);
}

function finalizeParseResult(
  suggestedCta: string,
  recommendedResponse: string,
  cta: string,
  rawCharacterCount: number,
  unwrappedCharacterCount: number,
): PersonaDeploymentAssetParseResult {
  const parsedKeys = extractPersonaAnalysisAssetKeys(suggestedCta);
  const missingKeys = missingPersonaAnalysisAssetKeys(parsedKeys);
  const isComplete = missingKeys.length === 0;

  let failureReason: string | null = null;
  if (parsedKeys.length === 0) {
    failureReason = "zero_canonical_headings";
  } else if (missingKeys.length > 0) {
    failureReason = "incomplete_canonical_set";
  }

  return {
    suggestedCta,
    recommendedResponse,
    cta,
    rawCharacterCount,
    unwrappedCharacterCount,
    parsedKeys,
    missingKeys,
    isComplete,
    isValid: isComplete,
    failureReason,
  };
}

export function validatePersonaAnalysisAssetPayload(
  suggestedCta?: string | null,
): PersonaDeploymentAssetParseResult {
  const text = suggestedCta?.trim() ?? "";
  if (!text) {
    return {
      suggestedCta: "",
      recommendedResponse: "",
      cta: "",
      rawCharacterCount: 0,
      unwrappedCharacterCount: 0,
      parsedKeys: [],
      missingKeys: [...REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS],
      isComplete: false,
      isValid: false,
      failureReason: "empty_suggested_cta",
    };
  }

  return finalizeParseResult(text, text, "", text.length, text.length);
}

/** @deprecated Use validatePersonaAnalysisAssetPayload */
export function validatePersonaDeploymentAssetPayload(
  suggestedCta?: string | null,
): PersonaDeploymentAssetParseResult {
  return validatePersonaAnalysisAssetPayload(suggestedCta);
}

export function toPersonaDeploymentAssetDiagnostics(
  result: PersonaDeploymentAssetParseResult,
): PersonaDeploymentAssetDiagnostics {
  return {
    rawCharacterCount: result.rawCharacterCount,
    unwrappedCharacterCount: result.unwrappedCharacterCount,
    parsedAssetCount: result.parsedKeys.length,
    parsedCanonicalKeys: result.parsedKeys,
    missingCanonicalKeys: result.missingKeys,
    validationResult: result.isComplete
      ? "complete"
      : result.parsedKeys.length === 0
        ? "invalid"
        : "incomplete",
    failureReason: result.failureReason,
  };
}

export function logPersonaDeploymentAssetStability(
  event: string,
  fields: Record<string, unknown>,
): void {
  console.log(
    JSON.stringify({
      prefix: "[ATHENA_PERSONA_STABILITY]",
      event,
      ...fields,
    }),
  );
}

export function personaAnalysisAssetTitle(
  key: RequiredPersonaAnalysisAssetKey,
): string {
  return PERSONA_ANALYSIS_ASSET_META[key]?.title ?? key.replace(/_/g, " ");
}

/** @deprecated Use personaAnalysisAssetTitle */
export function personaDeploymentAssetTitle(
  key: RequiredPersonaAnalysisAssetKey,
): string {
  return personaAnalysisAssetTitle(key);
}

/** Count recognized Analysis keys in a CTA string (for completeness comparisons). */
export function countPersonaAnalysisAssetKeys(value?: string | null): number {
  return extractPersonaAnalysisAssetKeys(value).length;
}

/** @deprecated Use countPersonaAnalysisAssetKeys */
export function countPersonaDeploymentAssetKeys(
  value?: string | null,
): number {
  return countPersonaAnalysisAssetKeys(value);
}

/**
 * Whether live CTA is a strict upgrade over snapshot CTA for Analysis keys.
 * Never treats a smaller Analysis set as an upgrade.
 * V15 dual-package upgrades are handled in personaIntelligenceAssetCatalog /
 * executiveVersionDisplay.
 */
export function isStrictlyMoreCompletePersonaCta(
  snapshotCta?: string | null,
  liveCta?: string | null,
): boolean {
  const snapshotKeys = extractPersonaAnalysisAssetKeys(snapshotCta);
  const liveKeys = extractPersonaAnalysisAssetKeys(liveCta);
  if (liveKeys.length <= snapshotKeys.length) {
    return false;
  }
  const snapshotSet = new Set(snapshotKeys);
  return (
    liveKeys.some((key) => !snapshotSet.has(key)) ||
    liveKeys.length > snapshotKeys.length
  );
}

export class IncompletePersonaDeploymentAssetsError extends Error {
  readonly diagnostics: PersonaDeploymentAssetDiagnostics;

  constructor(
    message: string,
    diagnostics: PersonaDeploymentAssetDiagnostics,
  ) {
    super(message);
    this.name = "IncompletePersonaDeploymentAssetsError";
    this.diagnostics = diagnostics;
  }
}

export class IncompletePersonaPublicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IncompletePersonaPublicationError";
  }
}