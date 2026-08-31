"use client";

import { useEffect, useState } from "react";
import { REGENERATION_LONG_RUNNING_MS } from "@/lib/discussionRegenerationStatus";
import { ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS } from "@/components/ui/athenaExecutiveCard";
import type { DiscussionExecutiveChrome } from "@/lib/discussionExecutiveChrome";

type GenerationPhase = {
  id: string;
  label: string;
  state: "complete" | "active" | "pending";
};

type ExecutiveGenerationPanelProps = {
  startedAtMs: number;
  resumed?: boolean;
  duplicateNotice?: string | null;
  stillRunningAfterTimeout?: boolean;
  chrome?: DiscussionExecutiveChrome | null;
};

function buildPhases(
  elapsedMs: number,
  chrome?: DiscussionExecutiveChrome | null,
): GenerationPhase[] {
  const phaseIndex =
    elapsedMs >= 45_000 ? 3 : elapsedMs >= 20_000 ? 2 : elapsedMs >= 8_000 ? 1 : 0;

  const labels = [
    chrome?.phaseUnderstanding ?? "Understanding discussion",
    chrome?.phaseBuilding ?? "Building executive intelligence",
    chrome?.phaseCreatingAssets ?? "Creating deployment assets",
    chrome?.phasePreparingBlueprint ?? "Preparing strategic blueprint",
  ];

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
  stillRunningAfterTimeout = false,
  chrome = null,
}: ExecutiveGenerationPanelProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1_000);

    return () => window.clearInterval(timerId);
  }, []);

  const elapsedMs = Math.max(0, nowMs - startedAtMs);
  const phases = buildPhases(elapsedMs, chrome);
  const isLongRunning =
    elapsedMs >= REGENERATION_LONG_RUNNING_MS || stillRunningAfterTimeout;

  return (
    <div
      className={`rounded-[24px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-orange)]/[0.06] p-6 sm:p-7`}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--athena-orange)]">
        {chrome?.generationEyebrow ?? "Executive Generation"}
      </div>

      <h3 className="mt-3 text-lg font-semibold text-white">
        {resumed
          ? (chrome?.generatingResumed ??
            "Executive Intelligence is currently being regenerated.")
          : (chrome?.generating ??
            "Executive Intelligence is being regenerated.")}
      </h3>

      {resumed && (
        <p className="mt-2 text-sm leading-6 text-white/55">
          {chrome?.generatingResumedHelp ??
            "The previous analysis remains available while Athena prepares the updated version."}
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
        {stillRunningAfterTimeout ? (
          <>
            <p className="font-medium text-white/75">
              {chrome?.stillRunning ?? "Generation is still running."}
            </p>
            <p className="mt-2">
              {chrome?.stillRunningHelp ??
                "Athena is waiting for the durable job to finish publishing the Current Version. This page will update automatically when ready."}
            </p>
          </>
        ) : isLongRunning ? (
          <>
            <p className="font-medium text-white/75">
              {chrome?.stillGenerating ??
                "Athena is still generating a new executive analysis."}
            </p>
            <p className="mt-2">
              {chrome?.stillGeneratingHelp ??
                "Complex discussions occasionally require additional reasoning. You may safely leave this page. Generation will continue automatically."}
            </p>
          </>
        ) : (
          <>
            <p>
              <span className="text-white/70">
                {chrome?.estimatedTimeLabel ?? "Estimated time:"}
              </span>{" "}
              {chrome?.estimatedDuration ?? "30–90 seconds"}
            </p>
            <p className="mt-2">
              {chrome?.continueBrowsing ??
                "You may continue browsing Athena while generation completes."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
