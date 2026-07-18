/**
 * Pure client/server helpers for Executive Version selection and render binding.
 * No I/O — keeps historical browsing free of Current/live fallbacks.
 */

import type {
  ExecutiveIntelligencePayload,
  ExecutiveIntelligenceVersion,
} from "@/services/executiveVersions/executiveVersionTypes";

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
