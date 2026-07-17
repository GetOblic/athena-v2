"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AthenaRecommendationRibbon } from "@/components/discussions/AthenaRecommendationRibbon";
import { useDiscussionRegeneration } from "@/components/discussions/DiscussionRegenerationProvider";
import { ExecutiveIntelligenceCard } from "@/components/discussions/ExecutiveIntelligenceCard";
import { RegenerationMetadata } from "@/components/discussions/RegenerationMetadata";
import { DeploymentAssets } from "@/components/deployment/DeploymentAssets";
import { StrategicAssetBlueprint } from "@/components/assetBlueprints/StrategicAssetBlueprint";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import { ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS } from "@/components/ui/athenaExecutiveCard";
import { buildDiscussionDeploymentAssets } from "@/lib/deploymentAssets";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import type { AssetUsageTag } from "@/services/assetInteractions/assetUsageTags";
import { isAssetUsageTag } from "@/services/assetInteractions/assetUsageTags";
import type {
  ExecutiveIntelligencePayload,
  ExecutiveIntelligenceVersion,
  ExecutiveVersionSummary,
} from "@/services/executiveVersions/executiveVersionTypes";
import { normalizeAnalysisForDisplay } from "@/services/executiveVersions/analysisNormalization";
import type { AiWorkspacePreferences } from "@/services/assetContinuation/destinationRegistry";
import type { BlueprintBrandDirectionInput } from "@/services/identity/blueprintBrandDirection";

/**
 * Persists across navigation so a regeneration that finishes after leaving
 * the page can still auto-select the new Current Version on return.
 * Cleared only after a successful auto-select (or abandoned generation).
 */
type PendingCurrentAutoSelect = {
  baselineCurrentVersionId: string;
  completed: boolean;
};

function pendingAutoSelectKey(discussionId: string): string {
  return `athena-regeneration-autoselect-current:${discussionId}`;
}

function readPendingAutoSelect(
  discussionId: string,
): PendingCurrentAutoSelect | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(
      pendingAutoSelectKey(discussionId),
    );
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as PendingCurrentAutoSelect;
    if (typeof parsed.baselineCurrentVersionId !== "string") {
      return null;
    }

    return {
      baselineCurrentVersionId: parsed.baselineCurrentVersionId,
      completed: Boolean(parsed.completed),
    };
  } catch {
    return null;
  }
}

function writePendingAutoSelect(
  discussionId: string,
  pending: PendingCurrentAutoSelect,
): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    pendingAutoSelectKey(discussionId),
    JSON.stringify(pending),
  );
}

function clearPendingAutoSelect(discussionId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(pendingAutoSelectKey(discussionId));
}

type ExecutiveIntelligenceWorkspaceProps = {
  discussionId: string;
  /** When sourceKind is prospect, this is the Prospect id for copy Done scope. */
  prospectId?: string | null;
  versions: ExecutiveIntelligenceVersion[];
  /** Fallback when no versions exist yet (should be rare after lazy backfill). */
  fallbackIntelligence: ExecutiveIntelligencePayload | null;
  /** Left column: original discussion + thread updates. */
  originalDiscussionSection: ReactNode;
  /** Rendered between blueprint and the bottom grid (e.g. append update form). */
  afterBlueprint?: ReactNode;
  /** Rendered after the bottom grid (e.g. prospect lifecycle footer). */
  afterDetailedReasoning?: ReactNode;
  /** Isolated source wording. Defaults to discussion labels. */
  sourceKind?: "discussion" | "prospect";
  /** Current organization brand for Image/PDF prompt display/copy overlay. */
  brandDirection?: BlueprintBrandDirectionInput | null;
  /** Org Continue destinations for Deployment Assets / Blueprint cards. */
  continuationPreferences?: AiWorkspacePreferences | null;
};

function formatVersionGeneratedAt(value: string, includeTime: boolean): string {
  const date = new Date(value);
  if (includeTime) {
    return date.toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function versionTitle(
  summary: ExecutiveVersionSummary,
  oldestVersionNumber: number,
): string {
  if (summary.is_current) {
    return "Current Version";
  }
  if (summary.version_number === oldestVersionNumber) {
    return "Original Version";
  }
  return `Version ${summary.version_number}`;
}

export function ExecutiveIntelligenceWorkspace({
  discussionId,
  prospectId = null,
  versions,
  fallbackIntelligence,
  originalDiscussionSection,
  afterBlueprint,
  afterDetailedReasoning,
  sourceKind = "discussion",
  brandDirection = null,
  continuationPreferences = null,
}: ExecutiveIntelligenceWorkspaceProps) {
  const { isGenerating, isCompleted } = useDiscussionRegeneration();
  const isProspect = sourceKind === "prospect";
  const sourceContextTitle = isProspect
    ? "Source Context"
    : "Original Discussion";
  const copySourceType = isProspect ? "prospect" : "discussion";
  const copySourceId =
    isProspect && prospectId?.trim() ? prospectId.trim() : discussionId;

  const sortedVersions = useMemo(
    () =>
      [...versions].sort((a, b) => b.version_number - a.version_number),
    [versions],
  );

  const currentVersion =
    sortedVersions.find((version) => version.is_current) ??
    sortedVersions[0] ??
    null;

  const oldestVersionNumber = useMemo(() => {
    if (sortedVersions.length === 0) {
      return 1;
    }
    return Math.min(...sortedVersions.map((version) => version.version_number));
  }, [sortedVersions]);

  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    currentVersion?.id ?? null,
  );
  const [expandedVersionIds, setExpandedVersionIds] = useState<Set<string>>(
    () => new Set(currentVersion ? [currentVersion.id] : []),
  );

  // Capture Current Version id when regeneration starts (survives navigation).
  useEffect(() => {
    if (!isGenerating) {
      return;
    }

    const existing = readPendingAutoSelect(discussionId);
    if (existing) {
      return;
    }

    writePendingAutoSelect(discussionId, {
      baselineCurrentVersionId: currentVersion?.id ?? "",
      completed: false,
    });
  }, [isGenerating, discussionId, currentVersion?.id]);

  // Mark the pending auto-select as ready only from the regeneration completion signal.
  useEffect(() => {
    if (!isCompleted) {
      return;
    }

    const existing = readPendingAutoSelect(discussionId);
    if (!existing || existing.completed) {
      return;
    }

    writePendingAutoSelect(discussionId, {
      ...existing,
      completed: true,
    });
  }, [isCompleted, discussionId]);

  // Clear abandoned runs (timeout / failure) so ordinary browsing never auto-jumps.
  useEffect(() => {
    if (isGenerating || isCompleted) {
      return;
    }

    const existing = readPendingAutoSelect(discussionId);
    if (existing && !existing.completed) {
      clearPendingAutoSelect(discussionId);
    }
  }, [isGenerating, isCompleted, discussionId]);

  // Auto-select only when a completed regeneration published a new Current Version.
  useEffect(() => {
    if (isGenerating) {
      return;
    }

    const pending = readPendingAutoSelect(discussionId);
    if (!pending?.completed) {
      return;
    }

    if (!currentVersion) {
      return;
    }

    if (currentVersion.id === pending.baselineCurrentVersionId) {
      // Completion signaled, but refreshed Current Version has not arrived yet.
      return;
    }

    setSelectedVersionId(currentVersion.id);
    setExpandedVersionIds((previous) => {
      const next = new Set(previous);
      next.add(currentVersion.id);
      return next;
    });
    clearPendingAutoSelect(discussionId);
  }, [
    isGenerating,
    isCompleted,
    currentVersion,
    discussionId,
    versions,
  ]);

  const selectedVersion =
    sortedVersions.find((version) => version.id === selectedVersionId) ??
    currentVersion;

  const executiveVersionIdForCopy = selectedVersion?.id ?? null;
  const [doneByAssetType, setDoneByAssetType] = useState<
    Record<string, boolean>
  >({});
  const [tagsByAssetType, setTagsByAssetType] = useState<
    Record<string, AssetUsageTag[]>
  >({});

  useEffect(() => {
    let cancelled = false;

    async function loadInteractionState() {
      setDoneByAssetType({});
      setTagsByAssetType({});
      const params = new URLSearchParams({
        sourceType: copySourceType,
        sourceId: copySourceId,
      });
      if (executiveVersionIdForCopy) {
        params.set("executiveVersionId", executiveVersionIdForCopy);
      }

      try {
        const response = await fetch(`/api/asset-interactions?${params}`);
        const payload = await parseJsonResponse<{
          interactions?: Record<
            string,
            { done?: boolean; tags?: string[] }
          >;
        }>(response);
        if (cancelled || !response.ok) {
          return;
        }

        const nextDone: Record<string, boolean> = {};
        const nextTags: Record<string, AssetUsageTag[]> = {};
        for (const [assetType, interaction] of Object.entries(
          payload.interactions ?? {},
        )) {
          if (interaction?.done) {
            nextDone[assetType] = true;
          }
          const tags = (interaction?.tags ?? []).filter(isAssetUsageTag);
          if (tags.length > 0) {
            nextTags[assetType] = tags;
          }
        }
        setDoneByAssetType(nextDone);
        setTagsByAssetType(nextTags);
      } catch (error) {
        console.error("[ASSET_COPY] load_done_state_failed", error);
      }
    }

    void loadInteractionState();
    return () => {
      cancelled = true;
    };
  }, [copySourceType, copySourceId, executiveVersionIdForCopy]);

  const copyContext = useMemo(
    () => ({
      sourceType: copySourceType as "discussion" | "prospect",
      sourceId: copySourceId,
      executiveVersionId: executiveVersionIdForCopy,
    }),
    [copySourceType, copySourceId, executiveVersionIdForCopy],
  );

  const intelligence: ExecutiveIntelligencePayload | null =
    selectedVersion?.intelligence ?? fallbackIntelligence;

  if (!intelligence) {
    return (
      <>
        <div
          className={`mt-8 rounded-[28px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-card)] p-8`}
        >
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
            Executive Intelligence
          </div>
          <p className="mt-4 text-white/50">
            Run Athena analysis to unlock executive intelligence for this
            discussion.
          </p>
        </div>
        {afterBlueprint}
        <div className="mt-8 grid gap-8 lg:grid-cols-3">
          <AthenaCollapsibleSection
            title={sourceContextTitle}
            defaultOpen={false}
            className="lg:col-span-2"
          >
            {originalDiscussionSection}
          </AthenaCollapsibleSection>
          <AthenaCollapsibleSection
            title="Detailed Athena Reasoning"
            defaultOpen={false}
          >
            <div className="space-y-7">
              <div className="text-white/50">
                No generated Athena analysis has been saved for this discussion
                yet. Use Generate Intelligence in the page header to generate.
              </div>
            </div>
          </AthenaCollapsibleSection>
        </div>
        {afterDetailedReasoning}
      </>
    );
  }

  const analysisDisplay = normalizeAnalysisForDisplay(intelligence.analysis);

  const deploymentAssets = buildDiscussionDeploymentAssets(
    {
      ...intelligence.analysis,
      ...analysisDisplay,
    },
    { prospectMode: isProspect },
  );

  function toggleExpanded(versionId: string) {
    setExpandedVersionIds((previous) => {
      const next = new Set(previous);
      if (next.has(versionId)) {
        next.delete(versionId);
      } else {
        next.add(versionId);
      }
      return next;
    });
  }

  function selectVersion(versionId: string) {
    setSelectedVersionId(versionId);
    setExpandedVersionIds((previous) => new Set(previous).add(versionId));
  }

  function onViewVersion(versionId: string) {
    const isSelected = selectedVersionId === versionId;
    const isExpanded = expandedVersionIds.has(versionId);

    if (isSelected && isExpanded) {
      toggleExpanded(versionId);
      return;
    }

    selectVersion(versionId);
  }

  return (
    <>
      {sortedVersions.length > 0 && (
        <AthenaCollapsibleSection
          title="Executive Versions"
          defaultOpen={Boolean(selectedVersion && !selectedVersion.is_current)}
          className="mt-8"
        >
          <p className="mb-8 max-w-2xl text-sm leading-6 text-white/45">
            Browse Athena&apos;s complete strategic understanding over time.
            Opening a previous version is view-only and never regenerates
            intelligence.
          </p>

          <div className="space-y-0">
            {sortedVersions.map((version, index) => {
              const expanded = expandedVersionIds.has(version.id);
              const selected = selectedVersion?.id === version.id;
              const title = versionTitle(version, oldestVersionNumber);

              return (
                <div key={version.id}>
                  {index > 0 && (
                    <div className="border-t border-white/10" />
                  )}
                  <div
                    className={`py-5 ${selected ? "bg-white/[0.02]" : ""}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-lg font-semibold text-white">
                            {title}
                          </h3>
                          {version.is_current ? (
                            <span className="rounded-full border border-[var(--athena-orange)]/30 bg-[var(--athena-orange)]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--athena-orange)]">
                              Current ✓
                            </span>
                          ) : (
                            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-white/40">
                              Archived
                            </span>
                          )}
                        </div>

                        <div className="mt-3 space-y-1 text-sm text-white/45">
                          <div>
                            <span className="text-white/30">Generated </span>
                            <span className="text-white/65">
                              {formatVersionGeneratedAt(
                                version.generated_at,
                                version.is_current,
                              )}
                            </span>
                          </div>
                          {version.models_used && (
                            <div className="text-white/55">
                              {version.models_used}
                            </div>
                          )}
                          {version.routing_profile && (
                            <div className="text-white/40">
                              {version.routing_profile}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => onViewVersion(version.id)}
                          className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-white/70 transition hover:bg-white/[0.06] hover:text-white"
                          aria-expanded={expanded}
                        >
                          {expanded && selected ? "▲ Hide" : "▼ View"}
                        </button>
                        {selected && (
                          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--athena-orange)]">
                            Viewing
                          </span>
                        )}
                      </div>
                    </div>

                    {expanded && (
                      <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/50">
                        {version.is_current
                          ? "This is Athena's current executive intelligence for this discussion."
                          : "Previous intelligence — preserved permanently. Viewing does not change Current or trigger learning."}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </AthenaCollapsibleSection>
      )}

      {!selectedVersion?.is_current && selectedVersion && (
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-sm text-white/55">
          Viewing archived executive intelligence from{" "}
          {formatVersionGeneratedAt(selectedVersion.generated_at, true)}.
          Athena&apos;s Current Version is unchanged.
        </div>
      )}

      <div className="mt-8">
        <AthenaRecommendationRibbon analysis={intelligence.analysis} />
        <RegenerationMetadata analysis={intelligence.analysis} />
      </div>

      <div id="executive-intelligence" className="mt-6 scroll-mt-24">
        <ExecutiveIntelligenceCard
          analysis={intelligence.analysis}
          sourceKind={sourceKind}
        />
      </div>

      {deploymentAssets.length > 0 && (
        <AthenaCollapsibleSection
          title="Deployment Assets"
          defaultOpen={false}
          className="mt-8"
        >
          <DeploymentAssets
            assets={deploymentAssets}
            copyContext={copyContext}
            doneByAssetType={doneByAssetType}
            tagsByAssetType={tagsByAssetType}
            continuationPreferences={continuationPreferences}
          />
        </AthenaCollapsibleSection>
      )}

      {intelligence.blueprint && (
        <AthenaCollapsibleSection
          title="Strategic Asset Blueprint"
          defaultOpen={false}
          className="mt-8"
        >
          <StrategicAssetBlueprint
            blueprint={intelligence.blueprint}
            copyContext={copyContext}
            doneByAssetType={doneByAssetType}
            tagsByAssetType={tagsByAssetType}
            brandDirection={brandDirection}
            continuationPreferences={continuationPreferences}
          />
        </AthenaCollapsibleSection>
      )}

      {afterBlueprint}

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <AthenaCollapsibleSection
          title={sourceContextTitle}
          defaultOpen={false}
          className="lg:col-span-2"
        >
          {originalDiscussionSection}
        </AthenaCollapsibleSection>
        <AthenaCollapsibleSection
          title="Detailed Athena Reasoning"
          defaultOpen={false}
          headerAside={
            <div className="text-sm text-white/40">
              Analysis Status:{" "}
              <span className="text-[var(--athena-orange)]">
                {intelligence.analysis.status}
              </span>
            </div>
          }
        >
          <div className="space-y-7">
            <DetailField
              label={isProspect ? "Prospect Assessment" : "Summary"}
              value={analysisDisplay.summary}
            />
            <DetailField
              label="Sentiment"
              value={analysisDisplay.sentiment}
            />
            <DetailField label="Intent" value={analysisDisplay.intent} />
            <DetailField
              label="Buyer Stage"
              value={analysisDisplay.buyer_stage}
            />
            <DetailField
              label="Pain Points"
              value={analysisDisplay.pain_points}
            />
            <DetailField
              label={isProspect ? "Prospect Opportunity" : "Opportunity"}
              value={
                intelligence.analysis.opportunity_detected ? "Yes" : "No"
              }
            />
            {isProspect && (
              <DetailField
                label="Opportunity Score"
                value={
                  typeof intelligence.opportunity?.score === "number" &&
                  intelligence.opportunity.score > 0
                    ? String(Math.round(intelligence.opportunity.score))
                    : "—"
                }
              />
            )}
            <DetailField
              label={
                isProspect ? "Prospect Opportunity Title" : "Opportunity Title"
              }
              value={analysisDisplay.opportunity_title}
            />
            <DetailField
              label={
                isProspect
                  ? "Prospect Opportunity Reason"
                  : "Opportunity Reason"
              }
              value={analysisDisplay.opportunity_reason}
            />
            <DetailField
              label={
                isProspect ? "Outreach Strategy" : "Strategic Recommendation"
              }
              sublabel="Recommended Action"
              value={analysisDisplay.recommended_action}
              helper="Guidance for internal decision-making."
            />
            <DetailField
              label="Risk Level"
              value={analysisDisplay.risk_level}
            />
            <DetailField
              label="Confidence"
              value={`${analysisDisplay.confidence}%`}
            />
          </div>
        </AthenaCollapsibleSection>
      </div>

      {afterDetailedReasoning}
    </>
  );
}

function DetailField({
  label,
  value,
  helper,
  sublabel,
}: {
  label: string;
  value?: string | null;
  helper?: string;
  sublabel?: string;
}) {
  return (
    <div>
      <div className="text-sm text-white/40">
        {label}
        {sublabel && (
          <span className="ml-2 text-xs text-white/30">({sublabel})</span>
        )}
      </div>
      {helper && (
        <div className="mt-1 text-xs leading-5 text-white/30">{helper}</div>
      )}
      <div className="mt-2 text-base leading-7 text-white/80">
        {value || "—"}
      </div>
    </div>
  );
}
