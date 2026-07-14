/**
 * Canonical Prospect Deployment Asset contract.
 * Shared by generation validation, publication, status, and display.
 *
 * Assets are one labeled suggested_cta string — not per-asset rows.
 */

import {
  PROSPECT_DEPLOYMENT_ASSET_KEYS,
  PROSPECT_DEPLOYMENT_ASSET_META,
} from "@/services/ai/prompts/prospectDeploymentAssetsConstraints";

/** Required MVP keys (excludes backward-compatible aliases). */
export const REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS = [
  "PERSONALIZED_OUTREACH_EMAIL",
  "FOLLOW_UP_EMAIL",
  "LINKEDIN_CONNECTION",
  "LINKEDIN_FOLLOW_UP",
  "COLD_CALL_OPENING",
  "DISCOVERY_QUESTIONS",
  "PERSONALIZED_VALUE_PROPOSITION",
  "OBJECTION_ANTICIPATION",
  "MEETING_PREPARATION",
  "RECOMMENDED_CTA",
  "FOLLOW_UP_SEQUENCE",
  "PERSONALIZED_VIDEO_SCRIPT",
  "NEWSLETTER_IDEA",
  "BLOG_POST_IDEA",
] as const;

export type RequiredProspectDeploymentAssetKey =
  (typeof REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS)[number];

const ALIAS_TO_CANONICAL: Record<string, RequiredProspectDeploymentAssetKey> = {
  COLD_EMAIL: "PERSONALIZED_OUTREACH_EMAIL",
  OBJECTION_HANDLING: "OBJECTION_ANTICIPATION",
};

/** Longer keys first so FOLLOW_UP_EMAIL wins over FOLLOW_UP. */
const HEADING_SOURCE_KEYS = [
  ...REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS,
  "COLD_EMAIL",
  "OBJECTION_HANDLING",
] as const;

const SECTION_HEADING_PATTERN = new RegExp(
  `(?:^|\\n)(${HEADING_SOURCE_KEYS.join("|")}):\\s*`,
  "g",
);

const OBJECT_SHAPE_KEYS = [
  ...REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS,
  "WHATSAPP_OUTREACH",
  "KNOWLEDGE_BASE_ENHANCEMENT",
  "SUBSTACK_POST",
  "REDDIT_POST",
  "SOCIAL_VOICE_POST",
  "COLD_EMAIL",
  "OBJECTION_HANDLING",
  "COMMUNITY_REPLY",
  "PRIVATE_MESSAGE",
  "SOCIAL_POST",
  "CALL_TO_ACTION",
  "FOLLOW_UP",
] as const;

export type ProspectDeploymentAssetParseResult = {
  suggestedCta: string;
  recommendedResponse: string;
  cta: string;
  rawCharacterCount: number;
  unwrappedCharacterCount: number;
  parsedKeys: RequiredProspectDeploymentAssetKey[];
  missingKeys: RequiredProspectDeploymentAssetKey[];
  isComplete: boolean;
  isValid: boolean;
  failureReason: string | null;
};

export type ProspectDeploymentAssetDiagnostics = {
  rawCharacterCount: number;
  unwrappedCharacterCount: number;
  parsedAssetCount: number;
  parsedCanonicalKeys: RequiredProspectDeploymentAssetKey[];
  missingCanonicalKeys: RequiredProspectDeploymentAssetKey[];
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
): RequiredProspectDeploymentAssetKey | null {
  if (
    (REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS as readonly string[]).includes(
      label,
    )
  ) {
    return label as RequiredProspectDeploymentAssetKey;
  }
  return ALIAS_TO_CANONICAL[label] ?? null;
}

/**
 * Extract canonical keys from actual section headings only (anchored).
 * Order-independent; duplicates collapse to first occurrence with content.
 */
export function extractProspectDeploymentAssetKeys(
  value?: string | null,
): RequiredProspectDeploymentAssetKey[] {
  if (!value?.trim()) {
    return [];
  }

  SECTION_HEADING_PATTERN.lastIndex = 0;
  const matches = [...value.matchAll(SECTION_HEADING_PATTERN)];
  const seen = new Set<RequiredProspectDeploymentAssetKey>();
  const keys: RequiredProspectDeploymentAssetKey[] = [];

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
    keys.push(canonical);
  }

  return keys;
}

export function missingProspectDeploymentAssetKeys(
  parsedKeys: readonly string[],
): RequiredProspectDeploymentAssetKey[] {
  const present = new Set(parsedKeys);
  return REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS.filter(
    (key) => !present.has(key),
  );
}

export function isCompleteProspectDeploymentAssetSet(
  parsedKeys: readonly string[],
): boolean {
  return missingProspectDeploymentAssetKeys(parsedKeys).length === 0;
}

function composeLabeledCtaFromObject(
  parsed: Record<string, unknown>,
): string | null {
  for (const key of OBJECT_SHAPE_KEYS) {
    const value = String(parsed[key] ?? "").trim();
    if (value && looksLikeSectionHeadingBlock(value)) {
      const keys = extractProspectDeploymentAssetKeys(value);
      if (keys.length > 0) {
        return value;
      }
    }
  }

  const parts: string[] = [];
  for (const key of REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS) {
    const direct = String(parsed[key] ?? "").trim();
    if (direct) {
      parts.push(`${key}:\n${direct}`);
      continue;
    }
    // Nested alias keys
    if (key === "PERSONALIZED_OUTREACH_EMAIL") {
      const alias = String(parsed.COLD_EMAIL ?? "").trim();
      if (alias) parts.push(`${key}:\n${alias}`);
    }
    if (key === "OBJECTION_ANTICIPATION") {
      const alias = String(parsed.OBJECTION_HANDLING ?? "").trim();
      if (alias) parts.push(`${key}:\n${alias}`);
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
 * Rejects unlabeled prose / bare JSON without canonical sections.
 */
export function unwrapProspectDeploymentAssetResponse(
  rawText: string,
): ProspectDeploymentAssetParseResult {
  const rawCharacterCount = rawText.length;
  const unwrapped = stripJsonFence(rawText).trim();
  const unwrappedCharacterCount = unwrapped.length;

  const empty = (
    failureReason: string,
    suggestedCta = "",
  ): ProspectDeploymentAssetParseResult => {
    const parsedKeys = extractProspectDeploymentAssetKeys(suggestedCta);
    const missingKeys = missingProspectDeploymentAssetKeys(parsedKeys);
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
      // suggested_cta may itself be double-encoded JSON
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
): ProspectDeploymentAssetParseResult {
  const parsedKeys = extractProspectDeploymentAssetKeys(suggestedCta);
  const missingKeys = missingProspectDeploymentAssetKeys(parsedKeys);
  const isComplete = missingKeys.length === 0;

  let failureReason: string | null = null;
  if (parsedKeys.length === 0) {
    failureReason = "zero_canonical_headings";
  } else if (!isComplete) {
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

export function validateProspectDeploymentAssetPayload(
  suggestedCta?: string | null,
): ProspectDeploymentAssetParseResult {
  const text = suggestedCta?.trim() ?? "";
  if (!text) {
    return {
      suggestedCta: "",
      recommendedResponse: "",
      cta: "",
      rawCharacterCount: 0,
      unwrappedCharacterCount: 0,
      parsedKeys: [],
      missingKeys: [...REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS],
      isComplete: false,
      isValid: false,
      failureReason: "empty_suggested_cta",
    };
  }

  return finalizeParseResult(
    text,
    text,
    "",
    text.length,
    text.length,
  );
}

export function toProspectDeploymentAssetDiagnostics(
  result: ProspectDeploymentAssetParseResult,
): ProspectDeploymentAssetDiagnostics {
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

export function logProspectDeploymentAssetStability(
  event: string,
  fields: Record<string, unknown>,
): void {
  console.log(
    JSON.stringify({
      prefix: "[ATHENA_PROSPECT_STABILITY]",
      event,
      ...fields,
    }),
  );
}

export function prospectDeploymentAssetTitle(
  key: RequiredProspectDeploymentAssetKey,
): string {
  return (
    PROSPECT_DEPLOYMENT_ASSET_META[key]?.title ??
    key.replace(/_/g, " ")
  );
}

/** Count recognized required keys in a CTA string (for completeness comparisons). */
export function countProspectDeploymentAssetKeys(
  value?: string | null,
): number {
  return extractProspectDeploymentAssetKeys(value).length;
}

/**
 * Whether live CTA is a strict upgrade over snapshot CTA for the same run.
 * Never treats a smaller set as an upgrade.
 */
export function isStrictlyMoreCompleteProspectCta(
  snapshotCta?: string | null,
  liveCta?: string | null,
): boolean {
  const snapshotKeys = extractProspectDeploymentAssetKeys(snapshotCta);
  const liveKeys = extractProspectDeploymentAssetKeys(liveCta);
  if (liveKeys.length <= snapshotKeys.length) {
    return false;
  }
  const snapshotSet = new Set(snapshotKeys);
  return liveKeys.some((key) => !snapshotSet.has(key)) || liveKeys.length > snapshotKeys.length;
}

export class IncompleteProspectDeploymentAssetsError extends Error {
  readonly diagnostics: ProspectDeploymentAssetDiagnostics;

  constructor(
    message: string,
    diagnostics: ProspectDeploymentAssetDiagnostics,
  ) {
    super(message);
    this.name = "IncompleteProspectDeploymentAssetsError";
    this.diagnostics = diagnostics;
  }
}

export class IncompleteProspectPublicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IncompleteProspectPublicationError";
  }
}
