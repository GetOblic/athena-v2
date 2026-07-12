/**
 * Read-path helpers for Executive Version intelligence display.
 * Pure logic — no DB access. Restores Deployment Assets / Strategic Blueprint
 * when immutable snapshots were published before those stages finished.
 */

import type { AthenaAssetBlueprint } from "@/services/assetBlueprints/assetBlueprintService";
import type { DiscussionAnalysis } from "@/services/discussionAnalysisService";
import type {
  ExecutiveIntelligencePayload,
  ExecutiveIntelligenceVersion,
} from "@/services/executiveVersions/executiveVersionTypes";

function hasSuggestedCta(analysis: DiscussionAnalysis | null | undefined): boolean {
  return Boolean(analysis?.suggested_cta?.trim());
}

function hasBlueprint(
  blueprint: AthenaAssetBlueprint | null | undefined,
): boolean {
  return Boolean(blueprint?.id);
}

function blueprintMatchesVersion(
  blueprint: AthenaAssetBlueprint,
  version: ExecutiveIntelligenceVersion,
): boolean {
  // Tenant isolation is enforced by getAssetBlueprintById(organizationId).
  // Also reject discussion mismatches so historical versions cannot bind
  // an unrelated discussion's blueprint if IDs were ever crossed.
  if (
    blueprint.discussion_id &&
    blueprint.discussion_id !== version.discussion_id
  ) {
    return false;
  }
  return true;
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
 * Blueprint preference:
 * 1. Snapshot intelligence.blueprint
 * 2. Row fetched by version.blueprint_id (tenant + discussion checked)
 * 3. Live blueprint — Current version only
 *
 * Deployment assets (suggested_cta) preference:
 * 1. Snapshot analysis.suggested_cta when non-empty
 * 2. Live analysis.suggested_cta — Current version only
 */
export function resolveVersionIntelligenceForDisplay(
  input: VersionIntelligenceResolutionInput,
): ExecutiveIntelligencePayload {
  const { version, blueprintById, liveIntelligence } = input;
  const snapshot = version.intelligence;
  const isCurrent = version.is_current;

  let blueprint = snapshot.blueprint;
  if (
    !hasBlueprint(blueprint) &&
    blueprintById &&
    blueprintMatchesVersion(blueprintById, version)
  ) {
    blueprint = blueprintById;
  }

  if (
    !hasBlueprint(blueprint) &&
    isCurrent &&
    liveIntelligence?.blueprint &&
    blueprintMatchesVersion(liveIntelligence.blueprint, version)
  ) {
    blueprint = liveIntelligence.blueprint;
  }

  let analysis = snapshot.analysis;
  if (
    !hasSuggestedCta(analysis) &&
    isCurrent &&
    hasSuggestedCta(liveIntelligence?.analysis)
  ) {
    analysis = {
      ...analysis,
      suggested_cta: liveIntelligence!.analysis.suggested_cta,
    };
  }

  return {
    analysis,
    opportunity: snapshot.opportunity,
    briefing: snapshot.briefing,
    blueprint,
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
}): boolean {
  const { current, live } = input;
  if (!current.is_current) return false;
  if (current.analysis_id && current.analysis_id !== live.analysis.id) {
    return false;
  }

  const snapshotMissingBlueprint = !hasBlueprint(current.intelligence.blueprint);
  const liveHasBlueprint = hasBlueprint(live.blueprint);
  const snapshotMissingCta = !hasSuggestedCta(current.intelligence.analysis);
  const liveHasCta = hasSuggestedCta(live.analysis);

  return (
    (snapshotMissingBlueprint && liveHasBlueprint) ||
    (snapshotMissingCta && liveHasCta)
  );
}
