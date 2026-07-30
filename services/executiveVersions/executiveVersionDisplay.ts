/**
 * Read-path helpers for Executive Version intelligence display.
 * Pure logic — no DB writes.
 *
 * Deployment Assets and Strategic Asset Blueprint are distinct surfaces.
 * Blueprint prompts never replace Deployment Assets.
 *
 * V2 Discussion Deployment Assets are rendered from analysis.suggested_cta via
 * buildDiscussionDeploymentAssets → DeploymentAssets. When suggested_cta was
 * persisted empty, recover from historical alternate storage formats already
 * present on the version/live records.
 */

import type { AthenaAssetBlueprint } from "@/services/assetBlueprints/assetBlueprintService";
import type { DiscussionAnalysis } from "@/services/discussionAnalysisService";
import type { AthenaReview } from "@/services/reviewService";
import type {
  ExecutiveIntelligencePayload,
  ExecutiveIntelligenceVersion,
} from "@/services/executiveVersions/executiveVersionTypes";
import {
  extractPersonaDeploymentAssetKeys,
  isCompletePersonaDeploymentAssetSet,
  isStrictlyMoreCompletePersonaCta,
} from "@/lib/personaDeploymentAssetContract";
import {
  extractProspectDeploymentAssetKeys,
  isCompleteProspectDeploymentAssetSet,
  isStrictlyMoreCompleteProspectCta,
} from "@/lib/prospectDeploymentAssetContract";

function hasSuggestedCta(analysis: DiscussionAnalysis | null | undefined): boolean {
  return Boolean(analysis?.suggested_cta?.trim());
}

function hasBlueprint(
  blueprint: AthenaAssetBlueprint | null | undefined,
): boolean {
  return Boolean(blueprint?.id);
}

function hasBriefingDeploymentAssets(
  briefing: AthenaReview | null | undefined,
): boolean {
  return Boolean(
    briefing?.recommended_response?.trim() || briefing?.cta?.trim(),
  );
}

function blueprintMatchesVersion(
  blueprint: AthenaAssetBlueprint,
  version: ExecutiveIntelligenceVersion,
): boolean {
  if (
    blueprint.discussion_id &&
    blueprint.discussion_id !== version.discussion_id
  ) {
    return false;
  }
  return true;
}

function stripJsonFence(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function looksLikeLabeledDeploymentAssets(text: string): boolean {
  return /(?:^|\n)[A-Z][A-Z0-9_]+:\s*/.test(text);
}

/**
 * Known object-key shapes observed in deployment_assets.raw_ai_response when
 * the model returns Discussion-style JSON instead of { suggested_cta, ... }.
 * Order matters: longer Prospect keys first so they win over FOLLOW_UP.
 */
const RAW_JSON_ASSET_OBJECT_KEYS = [
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
  "WHATSAPP_OUTREACH",
  "KNOWLEDGE_BASE_ENHANCEMENT",
  "HIDDEN_GEMS",
  "SUBSTACK_POST",
  "SUBSTACK_NOTE",
  "REDDIT_POST",
  "SKOOL_POST",
  "SKOOL_COURSE_IDEA",
  "SOCIAL_VOICE_POST",
  "SHORT_VIDEO_PROMPT",
  "VISUAL_MESSAGE_PROMPT",
  "LOCAL_OUTREACH_IMAGE_PROMPT",
  "COLD_EMAIL",
  "OBJECTION_HANDLING",
  "COMMUNITY_REPLY",
  "PRIVATE_MESSAGE",
  "SOCIAL_POST",
  "CALL_TO_ACTION",
  "FOLLOW_UP",
] as const;

/**
 * Convert alternate deployment-asset JSON shapes into the labeled
 * suggested_cta string expected by buildDiscussionDeploymentAssets.
 *
 * Proven production Prospect shape stores assets under Discussion keys with
 * Prospect labels nested inside CALL_TO_ACTION (suggested_cta empty).
 */
export function composeSuggestedCtaFromRawAssetObject(
  parsed: Record<string, unknown>,
): string | null {
  // Prefer any string field that already embeds labeled asset blocks.
  for (const key of RAW_JSON_ASSET_OBJECT_KEYS) {
    const value = String(parsed[key] ?? "").trim();
    if (
      value &&
      looksLikeLabeledDeploymentAssets(value) &&
      /(?:^|\n)(PERSONALIZED_|LINKEDIN_|FOLLOW_UP_EMAIL|DISCOVERY_|OBJECTION_|MEETING_|RECOMMENDED_|COLD_|COMMUNITY_REPLY|PRIVATE_MESSAGE|SOCIAL_POST)/.test(
        value,
      )
    ) {
      return value;
    }
  }

  const parts: string[] = [];
  for (const key of RAW_JSON_ASSET_OBJECT_KEYS) {
    const value = String(parsed[key] ?? "").trim();
    if (value) {
      parts.push(`${key}:\n${value}`);
    }
  }

  return parts.length > 0 ? parts.join("\n\n") : null;
}

/**
 * Compose the labeled Deployment Assets string V2 expects in suggested_cta
 * from briefing fields written by the deployment-assets persist path.
 */
export function composeSuggestedCtaFromBriefing(
  briefing: Pick<AthenaReview, "recommended_response" | "cta"> | null | undefined,
): string | null {
  const response = briefing?.recommended_response?.trim() ?? "";
  const cta = briefing?.cta?.trim() ?? "";

  if (!response && !cta) {
    return null;
  }

  if (response && cta && !/(?:^|\n)CALL_TO_ACTION:\s*/i.test(response)) {
    return `${response}\n\nCALL_TO_ACTION:\n${cta}`;
  }

  return response || `CALL_TO_ACTION:\n${cta}`;
}

/**
 * Recover Deployment Assets text from analysis.raw_json.deployment_assets
 * when suggested_cta was persisted empty (known alternate response shape).
 */
export function extractSuggestedCtaFromAnalysisRawJson(
  rawJson: Record<string, unknown> | null | undefined,
): string | null {
  const deployment = rawJson?.deployment_assets;
  if (!deployment || typeof deployment !== "object") {
    return null;
  }

  const rawAi = (deployment as Record<string, unknown>).raw_ai_response;
  if (typeof rawAi !== "string" || !rawAi.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(stripJsonFence(rawAi)) as Record<string, unknown>;
    const suggested = String(parsed.suggested_cta ?? "").trim();
    if (suggested) {
      return suggested;
    }

    const fromBriefingShape = composeSuggestedCtaFromBriefing({
      recommended_response: String(parsed.recommended_response ?? "") || null,
      cta: String(parsed.cta ?? "") || null,
    });
    if (fromBriefingShape) {
      return fromBriefingShape;
    }

    const fromObjectKeys = composeSuggestedCtaFromRawAssetObject(parsed);
    if (fromObjectKeys) {
      return fromObjectKeys;
    }
  } catch {
    const trimmed = rawAi.trim();
    // Accept Discussion or Prospect labeled asset blocks stored as plain text.
    if (looksLikeLabeledDeploymentAssets(trimmed)) {
      return trimmed;
    }
  }

  return null;
}

/**
 * Resolve the Deployment Assets source string for display.
 * Does not treat Strategic Blueprint presence as Deployment Assets.
 */
export function resolveDeploymentAssetsSuggestedCta(input: {
  analysis: DiscussionAnalysis;
  briefing: AthenaReview | null;
  liveAnalysis?: DiscussionAnalysis | null;
  liveBriefing?: AthenaReview | null;
  isCurrent: boolean;
}): string | null {
  const { analysis, briefing, liveAnalysis, liveBriefing, isCurrent } = input;

  if (analysis.suggested_cta?.trim()) {
    return analysis.suggested_cta;
  }

  const fromSnapshotRaw = extractSuggestedCtaFromAnalysisRawJson(analysis.raw_json);
  if (fromSnapshotRaw) {
    return fromSnapshotRaw;
  }

  const fromSnapshotBriefing = composeSuggestedCtaFromBriefing(briefing);
  if (fromSnapshotBriefing) {
    return fromSnapshotBriefing;
  }

  if (!isCurrent) {
    return null;
  }

  if (liveAnalysis?.suggested_cta?.trim()) {
    return liveAnalysis.suggested_cta;
  }

  const fromLiveRaw = extractSuggestedCtaFromAnalysisRawJson(
    liveAnalysis?.raw_json,
  );
  if (fromLiveRaw) {
    return fromLiveRaw;
  }

  return composeSuggestedCtaFromBriefing(liveBriefing ?? null);
}

export type VersionIntelligenceResolutionInput = {
  version: ExecutiveIntelligenceVersion;
  /** Blueprint loaded by version.blueprint_id (tenant-scoped). */
  blueprintById: AthenaAssetBlueprint | null;
  /**
   * Live discussion intelligence. Used ONLY when version.is_current
   * to fill gaps; never applied to historical/Original versions.
   */
  liveIntelligence: ExecutiveIntelligencePayload | null;
};

/**
 * Resolve display intelligence for a version without mutating stored history.
 *
 * Blueprint preference (Strategic Asset Blueprint only):
 * 1. Snapshot intelligence.blueprint
 * 2. Row fetched by version.blueprint_id
 * 3. Live blueprint — Current version only
 *
 * Deployment Assets preference:
 * 1. Snapshot analysis.suggested_cta
 * 2. Snapshot analysis.raw_json.deployment_assets recovery
 * 3. Snapshot briefing.recommended_response (+ cta)
 * 4. Live equivalents — Current version only
 */
export function resolveVersionIntelligenceForDisplay(
  input: VersionIntelligenceResolutionInput,
): ExecutiveIntelligencePayload {
  const { version, blueprintById, liveIntelligence } = input;
  const snapshot = version.intelligence;
  const isCurrent = version.is_current;

  // Frozen snapshot blueprint is authoritative when present.
  let blueprint = snapshot.blueprint;
  // Reference hydration: never the live "newest" row.
  // - When blueprint_id is set, only that exact row may fill a missing snapshot.
  // - When blueprint_id is null, Current may still accept an explicitly loaded row
  //   (incomplete-publish recovery); historical must not.
  if (
    !hasBlueprint(blueprint) &&
    blueprintById &&
    blueprintMatchesVersion(blueprintById, version) &&
    (version.blueprint_id
      ? blueprintById.id === version.blueprint_id
      : isCurrent)
  ) {
    blueprint = blueprintById;
  }

  // Live newest blueprint fills gaps for Current only — never historical.
  if (
    !hasBlueprint(blueprint) &&
    isCurrent &&
    liveIntelligence?.blueprint &&
    blueprintMatchesVersion(liveIntelligence.blueprint, version)
  ) {
    blueprint = liveIntelligence.blueprint;
  }

  let briefing = snapshot.briefing;
  if (
    isCurrent &&
    !hasBriefingDeploymentAssets(briefing) &&
    hasBriefingDeploymentAssets(liveIntelligence?.briefing)
  ) {
    briefing = liveIntelligence!.briefing;
  }

  let analysis = snapshot.analysis;
  // For Current, prefer live analysis.raw_json when snapshot CTA is empty so
  // recovery can read deployment_assets even if the version JSON froze early.
  if (
    isCurrent &&
    !hasSuggestedCta(analysis) &&
    liveIntelligence?.analysis &&
    liveIntelligence.analysis.id === analysis.id
  ) {
    analysis = {
      ...analysis,
      raw_json: liveIntelligence.analysis.raw_json ?? analysis.raw_json,
    };
  }

  const resolvedCta = resolveDeploymentAssetsSuggestedCta({
    analysis,
    briefing,
    liveAnalysis: liveIntelligence?.analysis ?? null,
    liveBriefing: liveIntelligence?.briefing ?? null,
    isCurrent,
  });

  if (resolvedCta && resolvedCta !== (analysis.suggested_cta ?? "")) {
    analysis = {
      ...analysis,
      suggested_cta: resolvedCta,
    };
  }

  return {
    analysis,
    opportunity: snapshot.opportunity,
    briefing,
    blueprint,
    ...(snapshot.generationMode === "think_differently"
      ? { generationMode: "think_differently" as const }
      : {}),
  };
}

/**
 * Apply resolved intelligence onto a version object for page rendering.
 * Does not write to the database.
 */
export function withResolvedVersionIntelligence(
  input: VersionIntelligenceResolutionInput,
): ExecutiveIntelligenceVersion {
  const intelligence = resolveVersionIntelligenceForDisplay(input);
  return {
    ...input.version,
    intelligence,
    blueprint_id: input.version.blueprint_id ?? intelligence.blueprint?.id ?? null,
  };
}

/** Detect incomplete Current publish that should be patched on write. */
export function shouldPatchIncompleteCurrentVersion(input: {
  current: ExecutiveIntelligenceVersion;
  live: ExecutiveIntelligencePayload;
  regenerationRunId?: string | null;
}): boolean {
  const { current, live } = input;
  if (!current.is_current) return false;
  if (current.analysis_id && current.analysis_id !== live.analysis.id) {
    return false;
  }

  // Never patch Historical / Original (non-current) — guarded above.
  // Same-run upgrade only when regeneration ids match or current has none.
  if (
    input.regenerationRunId &&
    current.regeneration_run_id &&
    current.regeneration_run_id !== input.regenerationRunId
  ) {
    return false;
  }

  const snapshotMissingBlueprint = !hasBlueprint(current.intelligence.blueprint);
  const liveHasBlueprint = hasBlueprint(live.blueprint);

  const snapshotCta =
    current.intelligence.analysis?.suggested_cta ??
    resolveDeploymentAssetsSuggestedCta({
      analysis: current.intelligence.analysis,
      briefing: current.intelligence.briefing,
      isCurrent: true,
    });
  const liveCta = resolveDeploymentAssetsSuggestedCta({
    analysis: live.analysis,
    briefing: live.briefing,
    isCurrent: true,
  });

  const snapshotKeys = extractProspectDeploymentAssetKeys(snapshotCta);
  const liveKeys = extractProspectDeploymentAssetKeys(liveCta);
  const snapshotComplete = isCompleteProspectDeploymentAssetSet(snapshotKeys);
  const liveComplete = isCompleteProspectDeploymentAssetSet(liveKeys);

  const personaSnapshotKeys = extractPersonaDeploymentAssetKeys(snapshotCta);
  const personaLiveKeys = extractPersonaDeploymentAssetKeys(liveCta);
  const personaSnapshotComplete =
    isCompletePersonaDeploymentAssetSet(personaSnapshotKeys);
  const personaLiveComplete =
    isCompletePersonaDeploymentAssetSet(personaLiveKeys);

  // Never replace a complete Prospect or Persona snapshot with a smaller set.
  if (snapshotComplete && liveKeys.length < snapshotKeys.length) {
    return false;
  }
  if (
    personaSnapshotComplete &&
    personaLiveKeys.length < personaSnapshotKeys.length
  ) {
    return false;
  }

  const snapshotMissingCta = !hasSuggestedCta(current.intelligence.analysis);
  const liveHasAnyCta = Boolean(liveCta?.trim());

  const ctaUpgrade =
    (snapshotMissingCta && liveHasAnyCta) ||
    isStrictlyMoreCompleteProspectCta(snapshotCta, liveCta) ||
    isStrictlyMoreCompletePersonaCta(snapshotCta, liveCta) ||
    (!snapshotComplete && liveComplete) ||
    (!personaSnapshotComplete && personaLiveComplete);

  return (
    (snapshotMissingBlueprint && liveHasBlueprint) || ctaUpgrade
  );
}
