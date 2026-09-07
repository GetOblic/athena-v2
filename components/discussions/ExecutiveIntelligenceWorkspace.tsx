"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AthenaRecommendationRibbon } from "@/components/discussions/AthenaRecommendationRibbon";
import { useDiscussionRegeneration } from "@/components/discussions/DiscussionRegenerationProvider";
import { ExecutiveIntelligenceCard } from "@/components/discussions/ExecutiveIntelligenceCard";
import { RegenerationMetadata } from "@/components/discussions/RegenerationMetadata";
import { DeploymentAssets } from "@/components/deployment/DeploymentAssets";
import { StrategicAssetBlueprint } from "@/components/assetBlueprints/StrategicAssetBlueprint";
import { PersonaDiscussProvider } from "@/components/personas/personaDiscussContext";
import { ProspectConversationPanel } from "@/components/prospects/ProspectConversationPanel";
import {
  ProspectIntelligenceSections,
  type ProspectWorkspaceMessages,
} from "@/components/prospects/ProspectIntelligenceSections";
import {
  groupProspectOutreachAssets,
} from "@/lib/prospects/prospectOutreachAssetGroups";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
import { ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS } from "@/components/ui/athenaExecutiveCard";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import type { AssetUsageTag } from "@/services/assetInteractions/assetUsageTags";
import { isAssetUsageTag } from "@/services/assetInteractions/assetUsageTags";
import type {
  ExecutiveIntelligencePayload,
  ExecutiveIntelligenceVersion,
  ExecutiveVersionSummary,
} from "@/services/executiveVersions/executiveVersionTypes";
import { isThinkDifferentlyExecutiveVersion } from "@/services/executiveVersions/executiveVersionTypes";
import { normalizeAnalysisForDisplay } from "@/services/executiveVersions/analysisNormalization";
import {
  archivedVersionExpandedCopy,
  buildExecutiveVersionCacheKey,
  buildSelectedExecutiveVersionViewModel,
  currentVersionExpandedCopy,
  resolveExecutiveVersionDisplayTimestamp,
  resolvePendingCurrentAutoSelect,
} from "@/services/executiveVersions/executiveVersionSelection";
import type { AiWorkspacePreferences } from "@/services/assetContinuation/destinationRegistry";
import type { BlueprintBrandDirectionInput } from "@/services/identity/blueprintBrandDirection";
import type {
  PersonaConversationAssetReference,
  PersonaConversationVersionState,
} from "@/services/personaConversation/personaConversationTypes";
import type {
  ProspectConversationAssetReference,
  ProspectConversationVersionState,
} from "@/services/prospectConversation/prospectConversationTypes";
import type { DiscussionExecutiveChrome } from "@/lib/discussionExecutiveChrome";
import {
  fillChromeTemplate,
  presentAnalysisStatus,
} from "@/lib/discussionExecutiveChrome";
import type { DeploymentAssetsChrome } from "@/components/deployment/DeploymentAssets";
import type { ProspectConversationChrome } from "@/components/prospects/ProspectConversationPanel";
import {
  groupAudienceAnalysisAssets,
  type AudienceAnalysisTitleKey,
} from "@/lib/personas/audienceAnalysisSections";

export type ExecutiveVersionLabelChrome = {
  currentExecutiveVersion?: string;
  archivedExecutiveVersion?: string;
};

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
  /** When sourceKind is persona, this is the Persona id for copy Done scope. */
  personaId?: string | null;
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
  sourceKind?: "discussion" | "prospect" | "persona";
  /** Current organization brand for Image/PDF prompt display/copy overlay. */
  brandDirection?: BlueprintBrandDirectionInput | null;
  /** Org Continue destinations for Deployment Assets / Blueprint cards. */
  continuationPreferences?: AiWorkspacePreferences | null;
  /** Optional Discussion-detail presentation chrome. English defaults remain. */
  chrome?: DiscussionExecutiveChrome | null;
  /** UX formatting locale from the server. Does not resolve language. */
  locale?: string | null;
  /** Optional Prospect conversation chrome. English defaults remain. */
  conversationChrome?:
    | ProspectConversationChrome
    | ExecutiveVersionLabelChrome
    | null;
  /** Optional shared Copy / Discuss / prompt-block chrome. English defaults remain. */
  assetChrome?: DeploymentAssetsChrome | null;
  /** Persona-only business-facing titles for the 14 analysis keys. */
  personaSectionTitles?: Partial<Record<AudienceAnalysisTitleKey, string>> | null;
  /** Prospect-only presentation dictionary. Unused for other source kinds. */
  tenantMessages?: ProspectWorkspaceMessages | null;
};

function formatVersionGeneratedAt(
  value: string,
  includeTime: boolean,
  locale?: string | null,
): string {
  const date = new Date(value);
  if (locale) {
    if (includeTime) {
      return new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
    }
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(date);
  }

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
  chrome?: DiscussionExecutiveChrome | null,
): string {
  if (summary.is_current) {
    return chrome?.currentVersion ?? "Current Version";
  }
  if (summary.version_number === oldestVersionNumber) {
    return chrome?.originalVersion ?? "Original Version";
  }
  if (chrome) {
    return fillChromeTemplate(chrome.versionNumber, {
      n: summary.version_number,
    });
  }
  return `Version ${summary.version_number}`;
}

export function ExecutiveIntelligenceWorkspace({
  discussionId,
  prospectId = null,
  personaId = null,
  versions,
  fallbackIntelligence,
  originalDiscussionSection,
  afterBlueprint,
  afterDetailedReasoning,
  sourceKind = "discussion",
  brandDirection = null,
  continuationPreferences = null,
  chrome = null,
  locale = null,
  conversationChrome = null,
  assetChrome = null,
  personaSectionTitles = null,
  tenantMessages = null,
}: ExecutiveIntelligenceWorkspaceProps) {
  const { isGenerating, isCompleted } = useDiscussionRegeneration();
  const isProspect = sourceKind === "prospect";
  const isPersona = sourceKind === "persona";
  const sourceContextTitle =
    chrome?.originalDiscussion ??
    (isProspect || isPersona ? "Source Context" : "Original Discussion");
  // Copy/Done tracking stays on discussion|prospect only (no Persona asset-interaction source).
  const copySourceType: "discussion" | "prospect" = isProspect
    ? "prospect"
    : "discussion";
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
  const [conversationOpen, setConversationOpen] = useState(false);
  const [conversationAssetReference, setConversationAssetReference] =
    useState<ProspectConversationAssetReference | null>(null);
  const [personaConversationOpen, setPersonaConversationOpen] = useState(true);
  const [personaConversationAssetReference, setPersonaConversationAssetReference] =
    useState<PersonaConversationAssetReference | null>(null);

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
  // Do not depend on the versions array identity — that re-fired on refresh and
  // could reset an intentional historical selection when pending was stale.
  useEffect(() => {
    const pending = readPendingAutoSelect(discussionId);
    const nextCurrentId = resolvePendingCurrentAutoSelect({
      isGenerating,
      pending,
      currentVersionId: currentVersion?.id ?? null,
    });
    if (!nextCurrentId) {
      return;
    }

    setSelectedVersionId(nextCurrentId);
    setExpandedVersionIds((previous) => {
      const next = new Set(previous);
      next.add(nextCurrentId);
      return next;
    });
    clearPendingAutoSelect(discussionId);
  }, [isGenerating, isCompleted, currentVersion, discussionId]);

  // Single shared view model: selector, metadata, Blueprint, and Deployment Assets.
  const viewModel = useMemo(
    () =>
      buildSelectedExecutiveVersionViewModel({
        versions: sortedVersions,
        selectedVersionId,
        fallbackIntelligence,
        sourceKind,
      }),
    [sortedVersions, selectedVersionId, fallbackIntelligence, sourceKind],
  );

  const selectedVersion = viewModel.version;
  const executiveVersionIdForCopy = viewModel.executiveVersionId;
  const versionCacheKey = buildExecutiveVersionCacheKey({
    sourceType: isPersona ? "persona" : copySourceType,
    sourceId:
      isPersona && personaId?.trim() ? personaId.trim() : copySourceId,
    executiveVersionId: executiveVersionIdForCopy,
  });
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
  }, [copySourceType, copySourceId, executiveVersionIdForCopy, versionCacheKey]);

  const copyContext = useMemo(
    () => ({
      sourceType: copySourceType as "discussion" | "prospect",
      sourceId: copySourceId,
      executiveVersionId: executiveVersionIdForCopy,
    }),
    [copySourceType, copySourceId, executiveVersionIdForCopy],
  );

  const intelligence = viewModel.intelligence;

  const conversationVersionState: ProspectConversationVersionState =
    viewModel.executiveVersionId == null
      ? "none"
      : viewModel.isCurrent
        ? "current"
        : "archived";

  const personaConversationVersionState: PersonaConversationVersionState =
    viewModel.executiveVersionId == null
      ? "none"
      : viewModel.isCurrent
        ? "current"
        : "archived";

  const personaConversationVersionLabel =
    viewModel.executiveVersionId == null
      ? null
      : viewModel.isCurrent
        ? (conversationChrome?.currentExecutiveVersion ??
          "Current Executive Version")
        : viewModel.displayGeneratedAt
          ? `${conversationChrome?.archivedExecutiveVersion ?? "Archived Executive Version"} — ${formatVersionGeneratedAt(viewModel.displayGeneratedAt, true, locale)}`
          : (conversationChrome?.archivedExecutiveVersion ??
            "Archived Executive Version");

  function handleDiscussWithAthena(payload: {
    executiveVersionId: string;
    assetKind: "deployment" | "blueprint";
    assetKey: string;
  }) {
    // Identifiers only — never pass asset body. Changing target does not clear messages.
    if (isPersona) {
      setPersonaConversationAssetReference({
        kind: payload.assetKind,
        key: payload.assetKey,
      });
      setPersonaConversationOpen(true);
      if (typeof window !== "undefined") {
        window.setTimeout(() => {
          document
            .getElementById("persona-conversation")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
          document.getElementById("persona-conversation-input")?.focus();
        }, 0);
      }
      return;
    }

    setConversationAssetReference({
      kind: payload.assetKind,
      key: payload.assetKey,
    });
    setConversationOpen(true);
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        document
          .getElementById("prospect-conversation")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
        document.getElementById("prospect-conversation-input")?.focus();
      }, 0);
    }
  }

  const prospectConversationSlot =
    isProspect && prospectId?.trim() ? (
      <ProspectConversationPanel
        prospectId={prospectId.trim()}
        executiveVersionId={viewModel.executiveVersionId}
        versionState={conversationVersionState}
        versionLabel={
          viewModel.executiveVersionId == null
            ? null
            : viewModel.isCurrent
              ? (conversationChrome?.currentExecutiveVersion ??
                "Current Executive Version")
              : viewModel.displayGeneratedAt
                ? `${conversationChrome?.archivedExecutiveVersion ?? "Archived Executive Version"} — ${formatVersionGeneratedAt(viewModel.displayGeneratedAt, true, locale)}`
                : (conversationChrome?.archivedExecutiveVersion ??
                  "Archived Executive Version")
        }
        assetReference={conversationAssetReference}
        onAssetReferenceChange={setConversationAssetReference}
        open={conversationOpen}
        onOpenChange={setConversationOpen}
        chrome={conversationChrome as ProspectConversationChrome | null}
      />
    ) : null;

  function wrapWithPersonaDiscuss(node: ReactNode) {
    if (!isPersona) {
      return node;
    }
    return (
      <PersonaDiscussProvider
        value={{
          assetReference: personaConversationAssetReference,
          onAssetReferenceChange: setPersonaConversationAssetReference,
          open: personaConversationOpen,
          onOpenChange: setPersonaConversationOpen,
          executiveVersionId: viewModel.executiveVersionId,
          versionState: personaConversationVersionState,
          versionLabel: personaConversationVersionLabel,
        }}
      >
        {node}
      </PersonaDiscussProvider>
    );
  }

  if (!intelligence || !viewModel.analysis) {
    if (isProspect) {
      return wrapWithPersonaDiscuss(
        <>
          {prospectConversationSlot}
          {afterBlueprint}
          <div className="mt-8 grid gap-8 lg:grid-cols-1">
            <AthenaCollapsibleSection
              title={sourceContextTitle}
              defaultOpen={false}
            >
              {originalDiscussionSection}
            </AthenaCollapsibleSection>
          </div>
          {afterDetailedReasoning}
        </>,
      );
    }
    return wrapWithPersonaDiscuss(
      <>
        <div
          className={`mt-8 rounded-[28px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-card)] p-8`}
        >
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
            {chrome?.heading ?? "Executive Intelligence"}
          </div>
          <p className="mt-4 text-white/50">
            {viewModel.selectionMissing
              ? (chrome?.selectionMissing ??
                "The selected Executive Version is unavailable. Choose Current Version or another archived version.")
              : (chrome?.emptyDiscussion ??
                (isProspect
                  ? "Run Athena analysis to unlock executive intelligence for this prospect."
                  : isPersona
                    ? "Run Athena analysis to unlock executive intelligence for this persona."
                    : "Run Athena analysis to unlock executive intelligence for this discussion."))}
          </p>
        </div>
        {prospectConversationSlot}
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
            title={chrome?.detailedReasoning ?? "Detailed Athena Reasoning"}
            defaultOpen={false}
          >
            <div className="space-y-7">
              <div className="text-white/50">
                {viewModel.selectionMissing
                  ? (chrome?.historicalUnavailable ??
                    "Historical snapshot content is unavailable for this selection.")
                  : (chrome?.reasoningEmpty ??
                    (isProspect
                      ? "No generated Athena analysis has been saved for this prospect yet. Use Generate Intelligence in the page header to generate."
                      : isPersona
                        ? "No generated Athena analysis has been saved for this persona yet. Use Generate Intelligence in the page header to generate."
                        : "No generated Athena analysis has been saved for this discussion yet. Use Generate Intelligence in the page header to generate."))}
              </div>
            </div>
          </AthenaCollapsibleSection>
        </div>
        {afterDetailedReasoning}
      </>,
    );
  }

  const analysisDisplay = normalizeAnalysisForDisplay(viewModel.analysis);
  const deploymentAssets = viewModel.deploymentAssets;

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
    // Explicit user selection wins over any pending post-regen auto-select.
    clearPendingAutoSelect(discussionId);
    setSelectedVersionId(versionId);
    setExpandedVersionIds((previous) => new Set(previous).add(versionId));
    // Version switch starts a separate conversation scope — clear asset target only.
    setConversationAssetReference(null);
    setPersonaConversationAssetReference(null);
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

  return wrapWithPersonaDiscuss(
    <>
      {!isPersona && !isProspect && sortedVersions.length > 0 && (
        <AthenaCollapsibleSection
          title={chrome?.versionsTitle ?? "Executive Versions"}
          defaultOpen={Boolean(selectedVersion && !selectedVersion.is_current)}
          className="mt-8"
        >
          <p className="mb-8 max-w-2xl text-sm leading-6 text-white/45">
            {chrome?.versionsHelp ??
              "Browse Athena's complete strategic understanding over time. Opening a previous version is view-only and never regenerates intelligence."}
          </p>

          <div className="space-y-0">
            {sortedVersions.map((version, index) => {
              const expanded = expandedVersionIds.has(version.id);
              const selected = selectedVersion?.id === version.id;
                  const title = versionTitle(version, oldestVersionNumber, chrome);

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
                              {chrome?.currentBadge ?? "Current ✓"}
                            </span>
                          ) : (
                            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-white/40">
                              {chrome?.archivedBadge ?? "Archived"}
                            </span>
                          )}
                          {isThinkDifferentlyExecutiveVersion(version) ? (
                            <span className="rounded-full border border-[var(--athena-success)]/30 bg-[var(--athena-success)]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--athena-success)]">
                              Think Differently
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-3 space-y-1 text-sm text-white/45">
                          <div>
                            <span className="text-white/30">
                              {chrome?.generatedPrefix ?? "Generated "}
                            </span>
                            <span className="text-white/65">
                              {formatVersionGeneratedAt(
                                resolveExecutiveVersionDisplayTimestamp(version),
                                true,
                                locale,
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
                          {expanded && selected
                            ? (chrome?.hide ?? "▲ Hide")
                            : (chrome?.view ?? "▼ View")}
                        </button>
                        {selected && (
                          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--athena-orange)]">
                            {chrome?.viewing ?? "Viewing"}
                          </span>
                        )}
                      </div>
                    </div>

                    {expanded && (
                      <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/50">
                        {version.is_current
                          ? (chrome?.currentVersionExpanded ??
                            currentVersionExpandedCopy(sourceKind))
                          : (chrome?.archivedVersionExpanded ??
                            archivedVersionExpandedCopy())}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </AthenaCollapsibleSection>
      )}

      <div
        key={`selected-executive-version-${viewModel.executiveVersionId ?? "none"}`}
      >
        {viewModel.isHistorical && viewModel.displayGeneratedAt && (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-sm text-white/55">
            {chrome
              ? fillChromeTemplate(chrome.viewingArchived, {
                  when: formatVersionGeneratedAt(
                    viewModel.displayGeneratedAt,
                    true,
                    locale,
                  ),
                })
              : `Viewing archived executive intelligence from ${formatVersionGeneratedAt(viewModel.displayGeneratedAt, true)}. Athena's Current Version is unchanged.`}
          </div>
        )}

        {!isProspect ? (
          <div className="mt-8">
            <AthenaRecommendationRibbon
              analysis={viewModel.analysis}
              recommendationLabel={chrome?.recommendation}
              timingLabel={chrome?.responseTiming}
              chrome={chrome}
            />
            <RegenerationMetadata
              analysis={viewModel.analysis}
              generatedAt={viewModel.displayGeneratedAt}
              chrome={chrome}
              locale={locale}
            />
          </div>
        ) : null}

        {!isProspect ? (
          <div id="executive-intelligence" className="mt-6 scroll-mt-24">
            <ExecutiveIntelligenceCard
              analysis={viewModel.analysis}
              sourceKind={sourceKind}
              chrome={chrome}
            />
          </div>
        ) : null}

        {!isPersona && !isProspect && deploymentAssets.length > 0 ? (
          <AthenaCollapsibleSection
            key={`deployment-assets-section-${viewModel.executiveVersionId ?? "none"}`}
            title={chrome?.deploymentAssetsTitle ?? "Deployment Assets"}
            defaultOpen={false}
            className="mt-8"
          >
            <DeploymentAssets
              key={`deployment-assets-${viewModel.executiveVersionId ?? "none"}`}
              executiveVersionId={viewModel.executiveVersionId}
              assets={deploymentAssets}
              copyContext={copyContext}
              doneByAssetType={doneByAssetType}
              tagsByAssetType={tagsByAssetType}
              continuationPreferences={continuationPreferences}
              onDiscussWithAthena={
                isProspect ? handleDiscussWithAthena : undefined
              }
              chrome={assetChrome}
            />
          </AthenaCollapsibleSection>
        ) : !isPersona && !isProspect && viewModel.isHistorical ? (
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-sm text-white/55">
            {chrome?.deploymentAssetsUnavailable ??
              "Deployment Assets are unavailable in this archived Executive Version snapshot."}
          </div>
        ) : null}

        {isProspect && tenantMessages && viewModel.analysis ? (
          <div id="executive-intelligence" className="scroll-mt-24">
            <ProspectIntelligenceSections
              analysis={viewModel.analysis}
              opportunity={intelligence.opportunity}
              assets={deploymentAssets}
              messages={tenantMessages}
            />
          </div>
        ) : null}

        {isProspect
          ? (() => {
              const grouped = groupProspectOutreachAssets(deploymentAssets);
              return (
                <>
                  {grouped.outreach.length > 0 ? (
                    <AthenaCollapsibleSection
                      key={`outreach-drafts-${viewModel.executiveVersionId ?? "none"}`}
                      title={
                        tenantMessages?.prospects.convert.outreachDrafts ??
                        chrome?.deploymentAssetsTitle ??
                        "Outreach drafts"
                      }
                      defaultOpen
                      className="mt-8"
                    >
                      <DeploymentAssets
                        executiveVersionId={viewModel.executiveVersionId}
                        assets={grouped.outreach}
                        copyContext={copyContext}
                        doneByAssetType={doneByAssetType}
                        tagsByAssetType={tagsByAssetType}
                        continuationPreferences={continuationPreferences}
                        onDiscussWithAthena={handleDiscussWithAthena}
                        chrome={{
                          ...assetChrome,
                          heading:
                            tenantMessages?.prospects.convert.outreachDrafts ??
                            "Outreach drafts",
                        }}
                      />
                    </AthenaCollapsibleSection>
                  ) : null}
                  {grouped.other.length > 0 ? (
                    <AthenaCollapsibleSection
                      key={`other-drafts-${viewModel.executiveVersionId ?? "none"}`}
                      title={
                        tenantMessages?.prospects.convert.otherDrafts ??
                        "Other drafts"
                      }
                      defaultOpen={false}
                      className="mt-8"
                    >
                      <DeploymentAssets
                        executiveVersionId={viewModel.executiveVersionId}
                        assets={grouped.other}
                        copyContext={copyContext}
                        doneByAssetType={doneByAssetType}
                        tagsByAssetType={tagsByAssetType}
                        continuationPreferences={continuationPreferences}
                        onDiscussWithAthena={handleDiscussWithAthena}
                        chrome={{
                          ...assetChrome,
                          heading:
                            tenantMessages?.prospects.convert.otherDrafts ??
                            "Other drafts",
                        }}
                      />
                    </AthenaCollapsibleSection>
                  ) : null}
                </>
              );
            })()
          : null}

        {isPersona
          ? groupAudienceAnalysisAssets(viewModel.personaAnalysisAssets).map(
              ({ def, asset }) => (
                <AthenaCollapsibleSection
                  key={`persona-analysis-${def.id}-${viewModel.executiveVersionId ?? "none"}`}
                  title={
                    personaSectionTitles?.[def.titleKey] ??
                    chrome?.analysisAssetsTitle ??
                    asset.title
                  }
                  defaultOpen={def.defaultOpen}
                  className="mt-8"
                >
                  <DeploymentAssets
                    executiveVersionId={viewModel.executiveVersionId}
                    assets={[asset]}
                    copyContext={copyContext}
                    doneByAssetType={doneByAssetType}
                    tagsByAssetType={tagsByAssetType}
                    continuationPreferences={continuationPreferences}
                    onDiscussWithAthena={handleDiscussWithAthena}
                    chrome={assetChrome}
                  />
                </AthenaCollapsibleSection>
              ),
            )
          : null}

        {isPersona && deploymentAssets.length > 0 ? (
          <AthenaCollapsibleSection
            key={`deployment-assets-section-${viewModel.executiveVersionId ?? "none"}`}
            title={
              chrome?.deploymentAssetsTitle ?? "Outreach drafts"
            }
            defaultOpen={false}
            className="mt-8"
          >
            <DeploymentAssets
              key={`deployment-assets-${viewModel.executiveVersionId ?? "none"}`}
              executiveVersionId={viewModel.executiveVersionId}
              assets={deploymentAssets}
              copyContext={copyContext}
              doneByAssetType={doneByAssetType}
              tagsByAssetType={tagsByAssetType}
              continuationPreferences={continuationPreferences}
              onDiscussWithAthena={handleDiscussWithAthena}
              chrome={assetChrome}
            />
          </AthenaCollapsibleSection>
        ) : isPersona &&
          (viewModel.isHistorical ||
            viewModel.personaAnalysisAssets.length > 0) ? (
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-sm text-white/55">
            {chrome?.deploymentAssetsUnavailable ??
              "Outreach drafts are unavailable in this intelligence snapshot."}
          </div>
        ) : null}

        {viewModel.blueprint && !isProspect ? (
          isPersona ? (
            <AthenaCollapsibleSection
              title={
                chrome?.strategicBlueprintTitle ?? "Persona Strategic Blueprint"
              }
              defaultOpen={false}
              className="mt-8"
            >
              <StrategicAssetBlueprint
                blueprint={viewModel.blueprint}
                copyContext={copyContext}
                doneByAssetType={doneByAssetType}
                tagsByAssetType={tagsByAssetType}
                brandDirection={brandDirection}
                continuationPreferences={continuationPreferences}
                onDiscussWithAthena={handleDiscussWithAthena}
                chrome={assetChrome}
              />
            </AthenaCollapsibleSection>
          ) : (
            <AthenaCollapsibleSection
              title={
                chrome?.strategicBlueprintTitle ?? "Strategic Asset Blueprint"
              }
              defaultOpen={false}
              className="mt-8"
            >
              <StrategicAssetBlueprint
                blueprint={viewModel.blueprint}
                copyContext={copyContext}
                doneByAssetType={doneByAssetType}
                tagsByAssetType={tagsByAssetType}
                brandDirection={brandDirection}
                continuationPreferences={continuationPreferences}
                onDiscussWithAthena={
                  isProspect ? handleDiscussWithAthena : undefined
                }
                chrome={assetChrome}
              />
            </AthenaCollapsibleSection>
          )
        ) : !isProspect && viewModel.isHistorical ? (
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-sm text-white/55">
            {chrome?.blueprintUnavailable ??
              "Strategic Asset Blueprint is unavailable in this archived Executive Version snapshot."}
          </div>
        ) : null}

        {isPersona && sortedVersions.length > 0 ? (
          <AthenaCollapsibleSection
            title={chrome?.versionsTitle ?? "Previous intelligence"}
            defaultOpen={Boolean(selectedVersion && !selectedVersion.is_current)}
            className="mt-8"
          >
            <p className="mb-8 max-w-2xl text-sm leading-6 text-white/45">
              {chrome?.versionsHelp ??
                "Browse Athena's complete strategic understanding over time. Opening a previous version is view-only and never regenerates intelligence."}
            </p>
            <div className="space-y-0">
              {sortedVersions.map((version, index) => {
                const expanded = expandedVersionIds.has(version.id);
                const selected = selectedVersion?.id === version.id;
                const title = versionTitle(version, oldestVersionNumber, chrome);
                return (
                  <div key={version.id}>
                    {index > 0 && <div className="border-t border-white/10" />}
                    <div className={`py-5 ${selected ? "bg-white/[0.02]" : ""}`}>
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-3">
                            <h3 className="text-lg font-semibold text-white">
                              {title}
                            </h3>
                            {version.is_current ? (
                              <span className="rounded-full border border-[var(--athena-orange)]/30 bg-[var(--athena-orange)]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--athena-orange)]">
                                {chrome?.currentBadge ?? "Current ✓"}
                              </span>
                            ) : (
                              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-white/40">
                                {chrome?.archivedBadge ?? "Archived"}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onViewVersion(version.id)}
                          className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-white/70 transition hover:bg-white/[0.06] hover:text-white"
                          aria-expanded={expanded}
                        >
                          {expanded && selected
                            ? (chrome?.hide ?? "▲ Hide")
                            : (chrome?.view ?? "▼ View")}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </AthenaCollapsibleSection>
        ) : null}
      </div>

      {prospectConversationSlot}
      {afterBlueprint}

      {isProspect && sortedVersions.length > 0 ? (
        <AthenaCollapsibleSection
          title={chrome?.versionsTitle ?? "Previous intelligence"}
          defaultOpen={Boolean(selectedVersion && !selectedVersion.is_current)}
          className="mt-8"
        >
          <p className="mb-8 max-w-2xl text-sm leading-6 text-white/45">
            {chrome?.versionsHelp ??
              "Browse Athena's complete strategic understanding over time. Opening a previous version is view-only and never regenerates intelligence."}
          </p>
          <div className="space-y-0">
            {sortedVersions.map((version, index) => {
              const expanded = expandedVersionIds.has(version.id);
              const selected = selectedVersion?.id === version.id;
              const title = versionTitle(version, oldestVersionNumber, chrome);
              return (
                <div key={version.id}>
                  {index > 0 && <div className="border-t border-white/10" />}
                  <div className={`py-5 ${selected ? "bg-white/[0.02]" : ""}`}>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-lg font-semibold text-white">
                            {title}
                          </h3>
                          {version.is_current ? (
                            <span className="rounded-full border border-[var(--athena-orange)]/30 bg-[var(--athena-orange)]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--athena-orange)]">
                              {chrome?.currentBadge ?? "Current ✓"}
                            </span>
                          ) : (
                            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-white/40">
                              {chrome?.archivedBadge ?? "Archived"}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onViewVersion(version.id)}
                        className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-white/70 transition hover:bg-white/[0.06] hover:text-white"
                        aria-expanded={expanded}
                      >
                        {expanded && selected
                          ? (chrome?.hide ?? "▲ Hide")
                          : (chrome?.view ?? "▼ View")}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </AthenaCollapsibleSection>
      ) : null}

      {isProspect && viewModel.blueprint ? (
        <AthenaCollapsibleSection
          title={
            tenantMessages?.prospects.convert.blueprint ??
            chrome?.strategicBlueprintTitle ??
            "Blueprint"
          }
          defaultOpen={false}
          className="mt-8"
        >
          <StrategicAssetBlueprint
            blueprint={viewModel.blueprint}
            copyContext={copyContext}
            doneByAssetType={doneByAssetType}
            tagsByAssetType={tagsByAssetType}
            brandDirection={brandDirection}
            continuationPreferences={continuationPreferences}
            onDiscussWithAthena={handleDiscussWithAthena}
            chrome={assetChrome}
          />
        </AthenaCollapsibleSection>
      ) : null}

      {isProspect ? (
        <AthenaCollapsibleSection
          title={
            tenantMessages?.prospects.convert.sourceContext ??
            sourceContextTitle
          }
          defaultOpen={false}
          className="mt-8"
        >
          {originalDiscussionSection}
        </AthenaCollapsibleSection>
      ) : null}

      {isProspect ? (
        <AthenaCollapsibleSection
          title={tenantMessages?.prospects.convert.advanced ?? "Advanced"}
          defaultOpen={false}
          className="mt-8"
        >
          <div className="space-y-7">
            <p className="text-sm leading-6 text-white/40">
              {tenantMessages?.prospects.convert.opportunityScoreHelp}
            </p>
            <DetailField
              label={chrome?.opportunityScore ?? "Opportunity Score"}
              value={
                typeof intelligence.opportunity?.score === "number" &&
                intelligence.opportunity.score > 0
                  ? String(Math.round(intelligence.opportunity.score))
                  : "—"
              }
            />
            <RegenerationMetadata
              analysis={viewModel.analysis}
              generatedAt={viewModel.displayGeneratedAt}
              chrome={chrome}
              locale={locale}
            />
          </div>
        </AthenaCollapsibleSection>
      ) : null}

      {!isProspect ? (
      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <AthenaCollapsibleSection
          title={sourceContextTitle}
          defaultOpen={false}
          className="lg:col-span-2"
        >
          {originalDiscussionSection}
        </AthenaCollapsibleSection>
        <AthenaCollapsibleSection
          title={chrome?.detailedReasoning ?? "Detailed Athena Reasoning"}
          defaultOpen={false}
          headerAside={
            <div className="text-sm text-white/40">
              {chrome?.analysisStatusLabel ?? "Analysis Status:"}{" "}
              <span className="text-[var(--athena-orange)]">
                {presentAnalysisStatus(intelligence.analysis.status, chrome)}
              </span>
            </div>
          }
        >
          <div className="space-y-7">
            <DetailField
              label={
                chrome?.summary ??
                (isProspect
                  ? "Prospect Assessment"
                  : isPersona
                    ? "Persona Assessment"
                    : "Summary")
              }
              value={analysisDisplay.summary}
            />
            <DetailField
              label={chrome?.sentiment ?? "Sentiment"}
              value={analysisDisplay.sentiment}
            />
            <DetailField
              label={chrome?.intent ?? "Intent"}
              value={analysisDisplay.intent}
            />
            <DetailField
              label={chrome?.buyerStage ?? "Buyer Stage"}
              value={analysisDisplay.buyer_stage}
            />
            <DetailField
              label={chrome?.painPoints ?? "Pain Points"}
              value={analysisDisplay.pain_points}
            />
            <DetailField
              label={
                chrome?.opportunity ??
                (isProspect
                  ? "Prospect Opportunity"
                  : isPersona
                    ? "Persona Opportunity"
                    : "Opportunity")
              }
              value={
                intelligence.analysis.opportunity_detected
                  ? (chrome?.opportunityYes ?? "Yes")
                  : (chrome?.opportunityNo ?? "No")
              }
            />
            {isProspect && (
              <DetailField
                label={chrome?.opportunityScore ?? "Opportunity Score"}
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
                chrome?.opportunityTitle ??
                (isProspect
                  ? "Prospect Opportunity Title"
                  : isPersona
                    ? "Persona Opportunity Title"
                    : "Opportunity Title")
              }
              value={analysisDisplay.opportunity_title}
            />
            <DetailField
              label={
                chrome?.opportunityReason ??
                (isProspect
                  ? "Prospect Opportunity Reason"
                  : isPersona
                    ? "Persona Opportunity Reason"
                    : "Opportunity Reason")
              }
              value={analysisDisplay.opportunity_reason}
            />
            <DetailField
              label={
                chrome?.strategicRecommendation ??
                (isProspect
                  ? "Outreach Strategy"
                  : isPersona
                    ? "Engagement Strategy"
                    : "Strategic Recommendation")
              }
              sublabel={chrome?.recommendedAction ?? "Recommended Action"}
              value={analysisDisplay.recommended_action}
              helper={
                chrome?.recommendationHelper ??
                "Guidance for internal decision-making."
              }
            />
            <DetailField
              label={chrome?.riskLevel ?? "Risk Level"}
              value={analysisDisplay.risk_level}
            />
            <DetailField
              label={chrome?.confidence ?? "Confidence"}
              value={`${analysisDisplay.confidence}%`}
            />
          </div>
        </AthenaCollapsibleSection>
      </div>
      ) : null}

      {afterDetailedReasoning}
    </>,
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
