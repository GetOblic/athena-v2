"use client";

import { useEffect, useState } from "react";
import { REGENERATION_LONG_RUNNING_MS } from "@/lib/discussionRegenerationStatus";
import { isProspectImportTrigger } from "@/services/prospects/prospectWebsiteLearningPolicy";

type GenerationPhase = {
  id: string;
  label: string;
  state: "complete" | "active" | "pending";
};

type ExecutiveGenerationPanelProps = {
  startedAtMs: number;
  resumed?: boolean;
  duplicateNotice?: string | null;
  /** Prospect pages use Prospect-appropriate stage labels. */
  sourceKind?: "discussion" | "prospect";
  /** Optional durable job stage from status polling. */
  jobStage?: string | null;
  /** Durable job trigger — drives import vs refresh Prospect stages. */
  jobTriggerType?: string | null;
  /** Soft ceiling reached; job may still be active in the background. */
  pastSafetyCeiling?: boolean;
};

function discussionLabels(): string[] {
  return [
    "Understanding discussion",
    "Building executive intelligence",
    "Creating deployment assets",
    "Preparing strategic blueprint",
  ];
}

function prospectImportLabels(): string[] {
  return [
    "Learning from website",
    "Building executive intelligence",
    "Creating deployment assets",
    "Preparing strategic blueprint",
    "Publishing executive version",
  ];
}

function prospectRefreshLabels(): string[] {
  return [
    "Building executive intelligence",
    "Creating deployment assets",
    "Preparing strategic blueprint",
    "Publishing executive version",
  ];
}

function phaseIndexFromJobStage(
  jobStage: string | null | undefined,
  sourceKind: "discussion" | "prospect",
  jobTriggerType?: string | null,
): number | null {
  if (!jobStage) return null;
  const stage = jobStage.toLowerCase();
  if (sourceKind === "prospect") {
    const isImport = isProspectImportTrigger(jobTriggerType);
    if (stage.includes("website") || stage.includes("scrape")) {
      return isImport ? 0 : 0; // refresh should not land here; treat as building EI
    }
    if (stage.includes("discussion_analysis") || stage.includes("analysis") || stage.includes("preparing")) {
      return isImport ? 1 : 0;
    }
    if (stage.includes("deployment")) return isImport ? 2 : 1;
    if (stage.includes("blueprint") || stage.includes("strategic")) {
      return isImport ? 3 : 2;
    }
    if (stage.includes("executive_version") || stage.includes("publish")) {
      return isImport ? 4 : 3;
    }
    return null;
  }

  if (stage.includes("discussion_analysis") || stage.includes("analysis")) {
    return 0;
  }
  if (stage.includes("briefing") || stage.includes("opportunity")) return 1;
  if (stage.includes("deployment")) return 2;
  if (stage.includes("blueprint") || stage.includes("strategic")) return 3;
  return null;
}

function buildPhases(
  elapsedMs: number,
  sourceKind: "discussion" | "prospect",
  jobStage?: string | null,
  jobTriggerType?: string | null,
): GenerationPhase[] {
  const labels =
    sourceKind === "prospect"
      ? isProspectImportTrigger(jobTriggerType)
        ? prospectImportLabels()
        : prospectRefreshLabels()
      : discussionLabels();
  const fromStage = phaseIndexFromJobStage(
    jobStage,
    sourceKind,
    jobTriggerType,
  );

  // Prospects: prefer durable job stage only — do not simulate via elapsed time.
  const phaseIndex =
    fromStage ??
    (sourceKind === "prospect"
      ? 0
      : elapsedMs >= 45_000
        ? 3
        : elapsedMs >= 20_000
          ? 2
          : elapsedMs >= 8_000
            ? 1
            : 0);

  return labels.map((label, index) => ({
    id: label,
    label,
    state:
      index < phaseIndex
        ? "complete"
        : index === phaseIndex
          ? "active"
          : "pending",
  }));
}

function PhaseIcon({ state }: { state: GenerationPhase["state"] }) {
  if (state === "complete") {
    return <span className="text-emerald-400">✓</span>;
  }

  if (state === "active") {
    return (
      <span
        className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--athena-orange)]/30 border-t-[var(--athena-orange)]"
        aria-hidden="true"
      />
    );
  }

  return <span className="text-white/25">⏳</span>;
}

export function ExecutiveGenerationPanel({
  startedAtMs,
  resumed = false,
  duplicateNotice = null,
  sourceKind = "discussion",
  jobStage = null,
  jobTriggerType = null,
  pastSafetyCeiling = false,
}: ExecutiveGenerationPanelProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1_000);

    return () => window.clearInterval(timerId);
  }, []);

  const elapsedMs = Math.max(0, nowMs - startedAtMs);
  const phases = buildPhases(elapsedMs, sourceKind, jobStage, jobTriggerType);
  const isLongRunning =
    pastSafetyCeiling || elapsedMs >= REGENERATION_LONG_RUNNING_MS;
  const isProspect = sourceKind === "prospect";
  const isImport = isProspect && isProspectImportTrigger(jobTriggerType);

  return (
    <div className="rounded-[24px] border border-[var(--athena-orange)]/20 bg-[var(--athena-orange)]/[0.06] p-6 sm:p-7">
      <div className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--athena-orange)]">
        Executive Generation
      </div>

      <h3 className="mt-3 text-lg font-semibold text-white">
        {resumed
          ? "Executive Intelligence is currently being regenerated."
          : "Executive Intelligence is being regenerated."}
      </h3>

      {resumed && (
        <p className="mt-2 text-sm leading-6 text-white/55">
          The previous analysis remains available while Athena prepares the
          updated version.
        </p>
      )}

      {duplicateNotice && (
        <p className="mt-3 text-sm leading-6 text-amber-200/90">
          {duplicateNotice}
        </p>
      )}

      <ul className="mt-6 space-y-3">
        {phases.map((phase) => (
          <li
            key={phase.id}
            className={`flex items-center gap-3 text-sm ${
              phase.state === "active"
                ? "font-medium text-white"
                : phase.state === "complete"
                  ? "text-white/70"
                  : "text-white/40"
            }`}
          >
            <span className="flex h-4 w-4 items-center justify-center">
              <PhaseIcon state={phase.state} />
            </span>
            <span>{phase.label}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6 border-t border-white/10 pt-5 text-sm leading-6 text-white/55">
        {pastSafetyCeiling ? (
          <>
            <p className="font-medium text-white/75">
              Generation is still running in the background.
            </p>
            <p className="mt-2">
              Refresh this page to check its latest status. Athena will not
              interrupt the durable job.
            </p>
          </>
        ) : isLongRunning ? (
          <>
            <p className="font-medium text-white/75">
              Athena is still generating a new executive analysis.
            </p>
            <p className="mt-2">
              {isProspect
                ? isImport
                  ? "Multi-page website learning and executive generation can take longer. You may safely leave this page. Generation will continue automatically."
                  : "Intelligence regeneration reuses stored website knowledge and can take longer. You may safely leave this page. Generation will continue automatically."
                : "Complex discussions occasionally require additional reasoning. You may safely leave this page. Generation will continue automatically."}
            </p>
          </>
        ) : (
          <>
            <p>
              <span className="text-white/70">Estimated time:</span>{" "}
              {isProspect
                ? isImport
                  ? "45–120 seconds"
                  : "30–90 seconds"
                : "30–90 seconds"}
            </p>
            <p className="mt-2">
              You may continue browsing Athena while generation completes.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/** Exported for behavioral tests. */
export function resolveProspectGenerationPhaseLabels(
  jobTriggerType?: string | null,
): string[] {
  return isProspectImportTrigger(jobTriggerType)
    ? prospectImportLabels()
    : prospectRefreshLabels();
}

export function resolveProspectGenerationPhaseIndex(
  jobStage: string | null | undefined,
  jobTriggerType?: string | null,
): number {
  return (
    phaseIndexFromJobStage(jobStage, "prospect", jobTriggerType) ?? 0
  );
}
