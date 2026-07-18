/**
 * Think Differently Deployment Asset divergence contract.
 *
 * Prevents publishing a new Executive Version when almost all Deployment Asset
 * cards are exact duplicates of the prior package — the production failure mode
 * observed when consecutive TD runs produced 25/26 identical cards despite
 * distinct Strategic Blueprints and fresh LLM responses.
 *
 * Standard generation never uses this module.
 */

import { parseLabeledDeploymentAssets } from "@/lib/deploymentAssets";
import { canonicalDeploymentAssetType } from "@/services/assetInteractions/assetInteractionKeys";

/** Core outreach assets that must change with an alternative strategic direction. */
export const THINK_DIFFERENTLY_CORE_DEPLOYMENT_ASSET_KEYS = [
  "email_outreach",
  "linkedin_connection",
  "personalized_value_proposition",
  "recommended_cta",
  "follow_up_sequence",
  "personalized_video_script",
] as const;

/**
 * Factual / corpus cards that may legitimately remain stable across strategies.
 * Excluded from the substantive duplicate-ratio denominator.
 */
export const THINK_DIFFERENTLY_FACTUAL_DEPLOYMENT_ASSET_KEYS = [
  "knowledge_base_enhancement",
] as const;

/**
 * Reject when more than this fraction of substantive cards are exact duplicates
 * of the previous package.
 */
export const THINK_DIFFERENTLY_MAX_DUPLICATE_RATIO = 0.8;

/** Initial generation + bounded repair attempts. */
export const THINK_DIFFERENTLY_DEPLOYMENT_ASSET_MAX_ATTEMPTS = 3;

export const THINK_DIFFERENTLY_DEPLOYMENT_ASSETS_ADDENDUM_MARKER =
  "=== ATHENA THINK DIFFERENTLY — DEPLOYMENT ASSETS ===";

export const THINK_DIFFERENTLY_DEPLOYMENT_ASSETS_ADDENDUM = `${THINK_DIFFERENTLY_DEPLOYMENT_ASSETS_ADDENDUM_MARKER}

Prior Deployment Assets are intentionally omitted from source intelligence for this request.

Produce a materially distinct execution package that operationalizes the authoritative Strategic Blueprint above. Do not reuse prior asset structure, hooks, CTA, sequence, value proposition, or outreach framing unless that reuse is strategically required by the new direction.

Every core outreach asset must express the alternative strategic thesis — not a paraphrase of a previous package.`;

const FACTUAL_KEY_SET = new Set<string>(
  THINK_DIFFERENTLY_FACTUAL_DEPLOYMENT_ASSET_KEYS,
);

export type ThinkDifferentlyDeploymentAssetDivergenceResult = {
  accepted: boolean;
  comparedCount: number;
  duplicateCount: number;
  duplicateRatio: number;
  duplicateKeys: string[];
  coreDuplicateKeys: string[];
  reason: string | null;
};

function cardsByKey(suggestedCta: string | null | undefined): Map<string, string> {
  const cards = parseLabeledDeploymentAssets(suggestedCta ?? "");
  const map = new Map<string, string>();
  for (const card of cards) {
    if (!card.assetKey?.trim()) continue;
    const key = canonicalDeploymentAssetType(card.assetKey);
    const content = card.content.trim();
    if (!key || !content) continue;
    map.set(key, content);
  }
  return map;
}

/**
 * Deterministic post-generation comparison for Think Differently only.
 *
 * Rules:
 * 1. Exclude factual cards (e.g. knowledge_base_enhancement) from the ratio.
 * 2. Reject when duplicateRatio > 0.8 among substantive compared cards.
 * 3. Reject when any core outreach asset is an exact duplicate.
 * 4. If there is no prior package to compare, accept.
 */
export function evaluateThinkDifferentlyDeploymentAssetDivergence(input: {
  previousSuggestedCta?: string | null;
  nextSuggestedCta?: string | null;
}): ThinkDifferentlyDeploymentAssetDivergenceResult {
  const previous = cardsByKey(input.previousSuggestedCta);
  const next = cardsByKey(input.nextSuggestedCta);

  if (previous.size === 0) {
    return {
      accepted: true,
      comparedCount: 0,
      duplicateCount: 0,
      duplicateRatio: 0,
      duplicateKeys: [],
      coreDuplicateKeys: [],
      reason: null,
    };
  }

  const substantiveKeys = [...next.keys()].filter(
    (key) => previous.has(key) && !FACTUAL_KEY_SET.has(key),
  );

  const duplicateKeys = substantiveKeys.filter(
    (key) => previous.get(key) === next.get(key),
  );
  const comparedCount = substantiveKeys.length;
  const duplicateCount = duplicateKeys.length;
  const duplicateRatio =
    comparedCount === 0 ? 0 : duplicateCount / comparedCount;

  const coreDuplicateKeys = THINK_DIFFERENTLY_CORE_DEPLOYMENT_ASSET_KEYS.filter(
    (key) =>
      previous.has(key) &&
      next.has(key) &&
      previous.get(key) === next.get(key),
  );

  const ratioRejected = duplicateRatio > THINK_DIFFERENTLY_MAX_DUPLICATE_RATIO;
  const coreRejected = coreDuplicateKeys.length > 0;
  const accepted = !ratioRejected && !coreRejected;

  let reason: string | null = null;
  if (!accepted) {
    const parts: string[] = [];
    if (ratioRejected) {
      parts.push(
        `${duplicateCount}/${comparedCount} substantive Deployment Asset cards are exact duplicates of the prior package (threshold ${(THINK_DIFFERENTLY_MAX_DUPLICATE_RATIO * 100).toFixed(0)}%).`,
      );
    }
    if (coreRejected) {
      parts.push(
        `Core assets unchanged: ${coreDuplicateKeys.join(", ")}.`,
      );
    }
    reason = parts.join(" ");
  }

  return {
    accepted,
    comparedCount,
    duplicateCount,
    duplicateRatio,
    duplicateKeys,
    coreDuplicateKeys: [...coreDuplicateKeys],
    reason,
  };
}

/**
 * Strip prior Deployment Asset fields from prompt context so Think Differently
 * cannot refine/copy the previous package from SOURCE INTELLIGENCE.
 */
export function stripPriorDeploymentAssetsFromPromptContext<T extends {
  analysis: Record<string, unknown>;
  opportunity?: Record<string, unknown> | null;
  briefing?: Record<string, unknown> | null;
}>(input: T): T {
  const analysisRaw = (input.analysis.raw_json ?? null) as
    | Record<string, unknown>
    | null;
  const { deployment_assets: _ignoredDa, ...restRaw } = analysisRaw ?? {};

  const analysis = {
    ...input.analysis,
    suggested_cta: null,
    raw_json: analysisRaw
      ? {
          ...restRaw,
        }
      : input.analysis.raw_json,
  };

  const opportunity = input.opportunity
    ? {
        ...input.opportunity,
        suggested_cta: null,
      }
    : input.opportunity;

  const briefing = input.briefing
    ? {
        ...input.briefing,
        recommended_response: null,
        cta: null,
        raw_json: (() => {
          const raw = (input.briefing!.raw_json ?? null) as
            | Record<string, unknown>
            | null;
          if (!raw) return input.briefing!.raw_json;
          const { deployment_assets: _ignored, ...rest } = raw;
          return rest;
        })(),
      }
    : input.briefing;

  return {
    ...input,
    analysis,
    opportunity,
    briefing,
  };
}

export function appendThinkDifferentlyDeploymentAssetsAddendum(
  prompt: string,
): string {
  if (!prompt.trim()) {
    throw new Error(
      "Cannot append Think Differently Deployment Assets addendum to an empty prompt.",
    );
  }
  if (prompt.includes(THINK_DIFFERENTLY_DEPLOYMENT_ASSETS_ADDENDUM_MARKER)) {
    throw new Error(
      "Prompt already contains Think Differently Deployment Assets addendum.",
    );
  }
  return `${prompt.trimEnd()}\n\n${THINK_DIFFERENTLY_DEPLOYMENT_ASSETS_ADDENDUM}\n`;
}

export function appendThinkDifferentlyDeploymentAssetRepairInstruction(
  prompt: string,
  duplicateKeys: string[],
): string {
  const keys =
    duplicateKeys.length > 0
      ? duplicateKeys.join(", ")
      : THINK_DIFFERENTLY_CORE_DEPLOYMENT_ASSET_KEYS.join(", ");

  const block = `=== ATHENA THINK DIFFERENTLY — DIVERGENCE REPAIR ===
The previous attempt reused these Deployment Asset cards unchanged from the prior package: ${keys}.

Regenerate those cards so they operationalize the authoritative Strategic Blueprint. Do not paraphrase the prior package. Core outreach assets must change with the alternative strategic thesis. Retain the required output contract and section labels exactly.`;

  return `${prompt.trimEnd()}\n\n${block}\n`;
}
