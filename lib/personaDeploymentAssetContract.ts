/**
 * Canonical Persona Deployment Asset contract.
 * Shared by generation validation, publication, status, and display.
 *
 * Assets are one labeled suggested_cta string — not per-asset rows.
 * Mutually exclusive with Prospect: never accept Prospect keys as Persona completeness.
 */

import {
  PERSONA_DEPLOYMENT_ASSET_META,
} from "@/services/ai/prompts/personaDeploymentAssetsConstraints";

/** Required Stage 4 keys — all 14 must be non-empty for Ready / publication. */
export const REQUIRED_PERSONA_DEPLOYMENT_ASSET_KEYS = [
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

export type RequiredPersonaDeploymentAssetKey =
  (typeof REQUIRED_PERSONA_DEPLOYMENT_ASSET_KEYS)[number];

const HEADING_SOURCE_KEYS = [...REQUIRED_PERSONA_DEPLOYMENT_ASSET_KEYS] as const;

// After the colon, consume only same-line whitespace so the newline that
// anchors the next heading remains available for `(?:^|\\n)`.
const SECTION_HEADING_PATTERN = new RegExp(
  `(?:^|\\n)(${HEADING_SOURCE_KEYS.join("|")}):[ \\t]*`,
  "g",
);

const OBJECT_SHAPE_KEYS = [...REQUIRED_PERSONA_DEPLOYMENT_ASSET_KEYS] as const;

export type PersonaDeploymentAssetParseResult = {
  suggestedCta: string;
  recommendedResponse: string;
  cta: string;
  rawCharacterCount: number;
  unwrappedCharacterCount: number;
  parsedKeys: RequiredPersonaDeploymentAssetKey[];
  missingKeys: RequiredPersonaDeploymentAssetKey[];
  isComplete: boolean;
  isValid: boolean;
  failureReason: string | null;
};

export type PersonaDeploymentAssetDiagnostics = {
  rawCharacterCount: number;
  unwrappedCharacterCount: number;
  parsedAssetCount: number;
  parsedCanonicalKeys: RequiredPersonaDeploymentAssetKey[];
  missingCanonicalKeys: RequiredPersonaDeploymentAssetKey[];
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
): RequiredPersonaDeploymentAssetKey | null {
  if (
    (REQUIRED_PERSONA_DEPLOYMENT_ASSET_KEYS as readonly string[]).includes(
      label,
    )
  ) {
    return label as RequiredPersonaDeploymentAssetKey;
  }
  return null;
}

export type PersonaDeploymentAssetSection = {
  key: RequiredPersonaDeploymentAssetKey;
  content: string;
};

/**
 * Extract canonical sections from actual section headings only (anchored).
 * Order-independent; duplicates collapse to first occurrence with content.
 */
export function extractPersonaDeploymentAssetSections(
  value?: string | null,
): PersonaDeploymentAssetSection[] {
  if (!value?.trim()) {
    return [];
  }

  SECTION_HEADING_PATTERN.lastIndex = 0;
  const matches = [...value.matchAll(SECTION_HEADING_PATTERN)];
  const seen = new Set<RequiredPersonaDeploymentAssetKey>();
  const sections: PersonaDeploymentAssetSection[] = [];

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

export function extractPersonaDeploymentAssetKeys(
  value?: string | null,
): RequiredPersonaDeploymentAssetKey[] {
  return extractPersonaDeploymentAssetSections(value).map(
    (section) => section.key,
  );
}

export function missingPersonaDeploymentAssetKeys(
  parsedKeys: readonly string[],
): RequiredPersonaDeploymentAssetKey[] {
  const present = new Set(parsedKeys);
  return REQUIRED_PERSONA_DEPLOYMENT_ASSET_KEYS.filter(
    (key) => !present.has(key),
  );
}

export function isCompletePersonaDeploymentAssetSet(
  parsedKeys: readonly string[],
): boolean {
  return missingPersonaDeploymentAssetKeys(parsedKeys).length === 0;
}

function composeLabeledCtaFromObject(
  parsed: Record<string, unknown>,
): string | null {
  for (const key of OBJECT_SHAPE_KEYS) {
    const value = String(parsed[key] ?? "").trim();
    if (value && looksLikeSectionHeadingBlock(value)) {
      const keys = extractPersonaDeploymentAssetKeys(value);
      if (keys.length > 0) {
        return value;
      }
    }
  }

  const parts: string[] = [];
  for (const key of REQUIRED_PERSONA_DEPLOYMENT_ASSET_KEYS) {
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
 * Unwrap model response into a labeled suggested_cta payload.
 * Rejects unlabeled prose / bare JSON without canonical Persona sections.
 */
export function unwrapPersonaDeploymentAssetResponse(
  rawText: string,
): PersonaDeploymentAssetParseResult {
  const rawCharacterCount = rawText.length;
  const unwrapped = stripJsonFence(rawText).trim();
  const unwrappedCharacterCount = unwrapped.length;

  const empty = (
    failureReason: string,
    suggestedCta = "",
  ): PersonaDeploymentAssetParseResult => {
    const parsedKeys = extractPersonaDeploymentAssetKeys(suggestedCta);
    const missingKeys = missingPersonaDeploymentAssetKeys(parsedKeys);
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

function finalizeParseResult(
  suggestedCta: string,
  recommendedResponse: string,
  cta: string,
  rawCharacterCount: number,
  unwrappedCharacterCount: number,
): PersonaDeploymentAssetParseResult {
  const parsedKeys = extractPersonaDeploymentAssetKeys(suggestedCta);
  const missingKeys = missingPersonaDeploymentAssetKeys(parsedKeys);
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

export function validatePersonaDeploymentAssetPayload(
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
      missingKeys: [...REQUIRED_PERSONA_DEPLOYMENT_ASSET_KEYS],
      isComplete: false,
      isValid: false,
      failureReason: "empty_suggested_cta",
    };
  }

  return finalizeParseResult(text, text, "", text.length, text.length);
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

export function personaDeploymentAssetTitle(
  key: RequiredPersonaDeploymentAssetKey,
): string {
  return (
    PERSONA_DEPLOYMENT_ASSET_META[key]?.title ?? key.replace(/_/g, " ")
  );
}

/** Count recognized required keys in a CTA string (for completeness comparisons). */
export function countPersonaDeploymentAssetKeys(
  value?: string | null,
): number {
  return extractPersonaDeploymentAssetKeys(value).length;
}

/**
 * Whether live CTA is a strict upgrade over snapshot CTA for the same run.
 * Never treats a smaller set as an upgrade.
 */
export function isStrictlyMoreCompletePersonaCta(
  snapshotCta?: string | null,
  liveCta?: string | null,
): boolean {
  const snapshotKeys = extractPersonaDeploymentAssetKeys(snapshotCta);
  const liveKeys = extractPersonaDeploymentAssetKeys(liveCta);
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

/**
 * Publication completeness assertion for Persona Executive Versions.
 * Requires Strategic Blueprint + complete 14-key Persona Deployment Asset set.
 */
export function requirePersonaCompleteness(input: {
  suggestedCta?: string | null;
  blueprintId?: string | null;
}): void {
  if (!input.blueprintId) {
    throw new IncompletePersonaPublicationError(
      "Persona publication needs a linked Strategic Blueprint.",
    );
  }

  const validation = validatePersonaDeploymentAssetPayload(input.suggestedCta);
  if (!validation.isComplete) {
    const missing =
      validation.missingKeys.length > 0
        ? ` Missing: ${validation.missingKeys.join(", ")}.`
        : "";
    throw new IncompletePersonaPublicationError(
      `Persona publication needs a complete Deployment Asset set.${missing}`,
    );
  }
}
