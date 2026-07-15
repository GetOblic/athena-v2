/**
 * Deterministic repair for Prospect LinkedIn Deployment Assets that exceed
 * PROSPECT_LINKEDIN_ASSET_MAX_CHARS. Does not call the model and does not
 * alter any other Deployment Asset body.
 */

import {
  extractProspectDeploymentAssetSections,
  findProspectLinkedInLengthViolations,
  logProspectDeploymentAssetStability,
  unwrapProspectDeploymentAssetResponse,
  validateProspectDeploymentAssetPayload,
  type ProspectDeploymentAssetParseResult,
} from "@/lib/prospectDeploymentAssetContract";
import {
  PROSPECT_LINKEDIN_ASSET_MAX_CHARS,
  PROSPECT_LINKEDIN_LENGTH_LIMITED_KEYS,
  type ProspectLinkedInLengthLimitedKey,
} from "@/services/ai/prompts/linkedinProspectAssetConstraints";

export type ProspectLinkedInRepairRecord = {
  key: ProspectLinkedInLengthLimitedKey;
  originalCharacterCount: number;
  repairedCharacterCount: number;
};

export type ProspectLinkedInRepairResult = {
  suggestedCta: string;
  repairs: ProspectLinkedInRepairRecord[];
};

const LIMITED_KEY_SET = new Set<string>(PROSPECT_LINKEDIN_LENGTH_LIMITED_KEYS);

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/** Truncate to maxLen without splitting a UTF-16 surrogate pair. */
export function sliceToCodePointBoundary(value: string, maxLen: number): string {
  if (maxLen <= 0) return "";
  if (value.length <= maxLen) return value;
  let end = maxLen;
  if (
    end < value.length &&
    isHighSurrogate(value.charCodeAt(end - 1)) &&
    isLowSurrogate(value.charCodeAt(end))
  ) {
    end -= 1;
  }
  return value.slice(0, end);
}

/**
 * Shorten one LinkedIn asset body to ≤ PROSPECT_LINKEDIN_ASSET_MAX_CHARS.
 * Values already within limit are returned trimmed and otherwise unchanged.
 */
export function shortenProspectLinkedInAssetBody(
  body: string,
  maxChars: number = PROSPECT_LINKEDIN_ASSET_MAX_CHARS,
): string {
  const trimmed = body.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }

  let cut = sliceToCodePointBoundary(trimmed, maxChars);

  const lastSpace = cut.lastIndexOf(" ");
  const lastNewline = cut.lastIndexOf("\n");
  const breakAt = Math.max(lastSpace, lastNewline);
  const minBreak = Math.floor(maxChars * 0.55);
  if (breakAt >= minBreak) {
    cut = cut.slice(0, breakAt);
  }

  cut = cut.replace(/[\s,;:\-–—/\\]+$/u, "").trim();

  if (!cut) {
    cut = sliceToCodePointBoundary(trimmed, maxChars).trim();
  }

  while (cut.length > maxChars) {
    cut = sliceToCodePointBoundary(cut, cut.length - 1)
      .replace(/[\s,;:\-–—/\\]+$/u, "")
      .trim();
  }

  return cut;
}

type SectionSpan = {
  key: string;
  content: string;
  contentStart: number;
  contentEnd: number;
};

function extractLimitedLinkedInSpans(value: string): SectionSpan[] {
  const headingPattern =
    /(?:^|\n)(LINKEDIN_CONNECTION|LINKEDIN_FOLLOW_UP):\s*/g;
  const matches = [...value.matchAll(headingPattern)];
  const spans: SectionSpan[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const key = match[1];
    if (seen.has(key)) continue;

    const contentStart = (match.index ?? 0) + match[0].length;
    let contentEnd = value.length;

    // Prefer the next LinkedIn limited heading when present; otherwise the next
    // labeled asset heading so optional/required siblings stay untouched.
    for (let j = index + 1; j < matches.length; j += 1) {
      contentEnd = matches[j].index ?? value.length;
      break;
    }

    if (contentEnd === value.length) {
      const rest = value.slice(contentStart);
      const nextHeading = rest.search(/\n[A-Z][A-Z0-9_]+:\s*/);
      if (nextHeading >= 0) {
        contentEnd = contentStart + nextHeading;
      }
    }

    const rawContent = value.slice(contentStart, contentEnd);
    const content = rawContent.trim();
    if (!content) continue;

    seen.add(key);
    spans.push({ key, content, contentStart, contentEnd });
  }

  return spans;
}

/**
 * Repair only over-limit LINKEDIN_CONNECTION / LINKEDIN_FOLLOW_UP bodies.
 * Characters outside those content spans remain unchanged.
 */
export function repairProspectLinkedInLengthViolationsInLabeledCta(
  labeledCta: string,
): ProspectLinkedInRepairResult {
  const violations = findProspectLinkedInLengthViolations(labeledCta);
  if (violations.length === 0) {
    return { suggestedCta: labeledCta, repairs: [] };
  }

  const violationKeys = new Set(violations.map((item) => item.key));
  const spans = extractLimitedLinkedInSpans(labeledCta).filter((span) =>
    violationKeys.has(span.key as ProspectLinkedInLengthLimitedKey),
  );

  const ordered = [...spans].sort((a, b) => b.contentStart - a.contentStart);
  let next = labeledCta;
  const repairs: ProspectLinkedInRepairRecord[] = [];

  for (const span of ordered) {
    if (!LIMITED_KEY_SET.has(span.key)) continue;
    if (span.content.length <= PROSPECT_LINKEDIN_ASSET_MAX_CHARS) continue;

    const repairedBody = shortenProspectLinkedInAssetBody(span.content);
    if (
      !repairedBody ||
      repairedBody.length > PROSPECT_LINKEDIN_ASSET_MAX_CHARS
    ) {
      continue;
    }

    const originalSlice = labeledCta.slice(span.contentStart, span.contentEnd);
    const leading = originalSlice.match(/^\s*/)?.[0] ?? "";
    const trailing = originalSlice.match(/\s*$/)?.[0] ?? "";
    const replacement = `${leading}${repairedBody}${trailing}`;

    next =
      next.slice(0, span.contentStart) +
      replacement +
      next.slice(span.contentEnd);

    repairs.push({
      key: span.key as ProspectLinkedInLengthLimitedKey,
      originalCharacterCount: span.content.length,
      repairedCharacterCount: repairedBody.length,
    });
  }

  return { suggestedCta: next, repairs };
}

export type FinalizeProspectDeploymentAssetsInput = {
  rawText: string;
  discussionId?: string | null;
  organizationId?: string | null;
  regenerationRunId?: string | null;
  sourceType?: "prospect";
};

/**
 * Parse → structure validate → LinkedIn-length repair → revalidate.
 * LinkedIn over-limit alone is repaired; other contract failures are unchanged.
 */
export function finalizeProspectDeploymentAssetsWithLinkedInRepair(
  input: FinalizeProspectDeploymentAssetsInput,
): ProspectDeploymentAssetParseResult {
  const unwrapped = unwrapProspectDeploymentAssetResponse(input.rawText);

  if (
    unwrapped.isComplete ||
    unwrapped.failureReason !== "linkedin_asset_exceeds_200_characters"
  ) {
    return unwrapped;
  }

  if (unwrapped.missingKeys.length > 0 || unwrapped.parsedKeys.length === 0) {
    return unwrapped;
  }

  const repaired = repairProspectLinkedInLengthViolationsInLabeledCta(
    unwrapped.suggestedCta,
  );

  if (repaired.repairs.length === 0) {
    return unwrapped;
  }

  let recommendedResponse = unwrapped.recommendedResponse;
  if (recommendedResponse === unwrapped.suggestedCta) {
    recommendedResponse = repaired.suggestedCta;
  } else if (
    findProspectLinkedInLengthViolations(recommendedResponse).length > 0
  ) {
    recommendedResponse = repairProspectLinkedInLengthViolationsInLabeledCta(
      recommendedResponse,
    ).suggestedCta;
  }

  const revalidated = validateProspectDeploymentAssetPayload(
    repaired.suggestedCta,
  );

  for (const repair of repaired.repairs) {
    logProspectDeploymentAssetStability("linkedin_asset_length_repaired", {
      sourceType: input.sourceType ?? "prospect",
      discussionId: input.discussionId ?? null,
      organizationId: input.organizationId ?? null,
      regenerationRunId: input.regenerationRunId ?? null,
      assetKey: repair.key,
      originalCharacterCount: repair.originalCharacterCount,
      repairedCharacterCount: repair.repairedCharacterCount,
      validationResult: revalidated.isComplete ? "complete" : "failed",
      failureReason: revalidated.failureReason,
    });
  }

  if (!revalidated.isComplete) {
    return {
      ...revalidated,
      suggestedCta: repaired.suggestedCta,
      recommendedResponse,
      cta: unwrapped.cta,
      rawCharacterCount: unwrapped.rawCharacterCount,
      unwrappedCharacterCount: unwrapped.unwrappedCharacterCount,
      failureReason:
        revalidated.failureReason ?? "linkedin_asset_exceeds_200_characters",
    };
  }

  return {
    ...revalidated,
    suggestedCta: repaired.suggestedCta,
    recommendedResponse,
    cta: unwrapped.cta,
    rawCharacterCount: unwrapped.rawCharacterCount,
    unwrappedCharacterCount: unwrapped.unwrappedCharacterCount,
  };
}

/** Terminal content-contract failure after LinkedIn repair cannot satisfy ≤200. */
export class ProspectLinkedInLengthContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProspectLinkedInLengthContractError";
  }
}

export function repairedLinkedInAssetsAreNonEmpty(labeledCta: string): boolean {
  const sections = extractProspectDeploymentAssetSections(labeledCta);
  for (const key of PROSPECT_LINKEDIN_LENGTH_LIMITED_KEYS) {
    const section = sections.find((item) => item.key === key);
    if (!section || !section.content.trim()) {
      return false;
    }
  }
  return true;
}
