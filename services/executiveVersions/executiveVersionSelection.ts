/**
 * Production view-model helpers for ExecutiveIntelligenceWorkspace.
 * Used by Prospect and Discussion routes that import that workspace.
 * No I/O — selection, display timestamps, and version-bound render props only.
 */

import { buildDiscussionDeploymentAssets } from "@/lib/deploymentAssets";
import type { AthenaAssetBlueprint } from "@/services/assetBlueprints/assetBlueprintService";
import type {
  ExecutiveIntelligencePayload,
  ExecutiveIntelligenceVersion,
} from "@/services/executiveVersions/executiveVersionTypes";

type DeploymentAssetView = {
  assetKey?: string;
  title: string;
  objective: string;
  content: string;
};

export type WorkspaceVersionSelectionInput = {
  versions: ExecutiveIntelligenceVersion[];
  selectedVersionId: string | null;
  /** Used only when no versions exist yet (pre-versioning edge case). */
  fallbackIntelligence: ExecutiveIntelligencePayload | null;
};

export type WorkspaceVersionSelection = {
  selectedVersion: ExecutiveIntelligenceVersion | null;
  intelligence: ExecutiveIntelligencePayload | null;
  /** True only when versions are empty and fallbackIntelligence was used. */
  usedFallback: boolean;
  /**
   * True when selectedVersionId was set but no matching version exists.
   * Callers must not silently substitute Current in this case.
   */
  selectionMissing: boolean;
};

/**
 * Resolve which Executive Version drives Blueprint + Deployment Assets.
 *
 * Snapshot precedence for a matched version:
 * - The version's frozen intelligence is authoritative.
 * - fallbackIntelligence is never applied once versions exist.
 * - Current is never substituted when a specific version id is selected.
 */
export function resolveWorkspaceVersionSelection(
  input: WorkspaceVersionSelectionInput,
): WorkspaceVersionSelection {
  const sorted = [...input.versions].sort(
    (a, b) => b.version_number - a.version_number,
  );
  const currentVersion =
    sorted.find((version) => version.is_current) ?? sorted[0] ?? null;

  if (sorted.length === 0) {
    return {
      selectedVersion: null,
      intelligence: input.fallbackIntelligence,
      usedFallback: Boolean(input.fallbackIntelligence),
      selectionMissing: false,
    };
  }

  if (input.selectedVersionId) {
    const match =
      sorted.find((version) => version.id === input.selectedVersionId) ?? null;
    if (!match) {
      return {
        selectedVersion: null,
        intelligence: null,
        usedFallback: false,
        selectionMissing: true,
      };
    }

    return {
      selectedVersion: match,
      intelligence: match.intelligence ?? null,
      usedFallback: false,
      selectionMissing: false,
    };
  }

  return {
    selectedVersion: currentVersion,
    intelligence: currentVersion?.intelligence ?? null,
    usedFallback: false,
    selectionMissing: false,
  };
}

/**
 * Cache / remount key for version-bound UI and asset-interaction fetches.
 * Must include executiveVersionId so historical and Current never share state.
 */
export function buildExecutiveVersionCacheKey(input: {
  sourceType: "discussion" | "prospect";
  sourceId: string;
  executiveVersionId: string | null;
}): string {
  return [
    input.sourceType,
    input.sourceId,
    input.executiveVersionId ?? "no-version",
  ].join(":");
}

/**
 * Publication timestamp for a newly inserted Executive Version.
 * Think Differently reuses analysis.created_at — never use that as generated_at.
 */
export function resolveExecutiveVersionGeneratedAt(input: {
  generatedAt?: string | null;
  generationMode?: string | null;
  analysisCreatedAt?: string | null;
  nowIso: string;
}): string {
  const explicit = input.generatedAt?.trim();
  if (explicit) {
    return explicit;
  }

  if (input.generationMode === "think_differently") {
    return input.nowIso;
  }

  const analysisCreatedAt = input.analysisCreatedAt?.trim();
  if (analysisCreatedAt) {
    return analysisCreatedAt;
  }

  return input.nowIso;
}

/**
 * Display timestamp for an Executive Version card / metadata.
 *
 * Precedence:
 * 1. generated_at when it is not a legacy reused-analysis stamp
 * 2. created_at for legacy rows where generated_at predates created_at
 * 3. never analysis.created_at
 *
 * Does not mutate stored rows.
 */
export function resolveExecutiveVersionDisplayTimestamp(
  version: Pick<ExecutiveIntelligenceVersion, "generated_at" | "created_at">,
): string {
  const generatedAt = version.generated_at?.trim() ?? "";
  const createdAt = version.created_at?.trim() ?? "";

  if (!generatedAt && createdAt) {
    return createdAt;
  }
  if (!createdAt) {
    return generatedAt;
  }

  const generatedMs = Date.parse(generatedAt);
  const createdMs = Date.parse(createdAt);
  if (!Number.isFinite(generatedMs) && Number.isFinite(createdMs)) {
    return createdAt;
  }
  if (!Number.isFinite(createdMs)) {
    return generatedAt;
  }

  // Legacy Think Differently rows stamped analysis.created_at before EV insert.
  if (generatedMs < createdMs) {
    return createdAt;
  }

  return generatedAt;
}

export type SelectedExecutiveVersionViewModel = {
  executiveVersionId: string | null;
  versionNumber: number | null;
  isCurrent: boolean;
  isHistorical: boolean;
  selectionMissing: boolean;
  usedFallback: boolean;
  generationMode: string | null;
  displayGeneratedAt: string | null;
  blueprintId: string | null;
  blueprint: AthenaAssetBlueprint | null;
  intelligence: ExecutiveIntelligencePayload | null;
  analysis: ExecutiveIntelligencePayload["analysis"] | null;
  /** Frozen Deployment Assets parsed from the selected version only. */
  deploymentAssets: DeploymentAssetView[];
  version: ExecutiveIntelligenceVersion | null;
};

/**
 * Single shared view model for selector, metadata, Blueprint, and Deployment Assets.
 * Prospect and Discussion workspaces must render version-bound surfaces from this only.
 */
export function buildSelectedExecutiveVersionViewModel(input: {
  versions: ExecutiveIntelligenceVersion[];
  selectedVersionId: string | null;
  fallbackIntelligence: ExecutiveIntelligencePayload | null;
  sourceKind?: "discussion" | "prospect";
}): SelectedExecutiveVersionViewModel {
  const selection = resolveWorkspaceVersionSelection({
    versions: input.versions,
    selectedVersionId: input.selectedVersionId,
    fallbackIntelligence: input.fallbackIntelligence,
  });

  const version = selection.selectedVersion;
  const intelligence = selection.intelligence;
  const prospectMode = input.sourceKind === "prospect";

  const deploymentAssets = intelligence?.analysis
    ? buildDiscussionDeploymentAssets(intelligence.analysis, { prospectMode })
    : [];

  return {
    executiveVersionId: version?.id ?? null,
    versionNumber: version?.version_number ?? null,
    isCurrent: Boolean(version?.is_current),
    isHistorical: Boolean(version && !version.is_current),
    selectionMissing: selection.selectionMissing,
    usedFallback: selection.usedFallback,
    generationMode:
      typeof intelligence?.generationMode === "string"
        ? intelligence.generationMode
        : null,
    displayGeneratedAt: version
      ? resolveExecutiveVersionDisplayTimestamp(version)
      : null,
    blueprintId: version?.blueprint_id ?? intelligence?.blueprint?.id ?? null,
    blueprint: intelligence?.blueprint ?? null,
    intelligence,
    analysis: intelligence?.analysis ?? null,
    deploymentAssets,
    version,
  };
}

/** Source-specific copy for the expanded Current Version card. */
export function currentVersionExpandedCopy(
  sourceKind: "discussion" | "prospect",
): string {
  return sourceKind === "prospect"
    ? "This is Athena's current executive intelligence for this prospect."
    : "This is Athena's current executive intelligence for this discussion.";
}

export function archivedVersionExpandedCopy(): string {
  return "Previous intelligence — preserved permanently. Viewing does not change Current or trigger learning.";
}

/**
 * Pure auto-select decision used by the workspace effect.
 * Returns the Current version id to select, or null when no jump should occur.
 */
export function resolvePendingCurrentAutoSelect(input: {
  isGenerating: boolean;
  pending: { baselineCurrentVersionId: string; completed: boolean } | null;
  currentVersionId: string | null;
}): string | null {
  if (input.isGenerating) {
    return null;
  }
  if (!input.pending?.completed) {
    return null;
  }
  if (!input.currentVersionId) {
    return null;
  }
  if (input.currentVersionId === input.pending.baselineCurrentVersionId) {
    return null;
  }
  return input.currentVersionId;
}
