"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { ExecutiveGenerationPanel } from "@/components/discussions/ExecutiveGenerationPanel";
import { RegenerationCompleteToast } from "@/components/discussions/RegenerationCompleteToast";
import type { ContinuityTrackState } from "@/lib/generationContinuity";
import {
  buildContinuityFromTrackOptions,
  clearRegenerationSession,
  evaluateRegenerationPoll,
  fetchRegenerationStatus,
  readRegenerationSession,
  REGENERATION_POLL_INTERVAL_MS,
  REGENERATION_SUCCESS_BUTTON_MS,
  type RegenerationStatusSnapshot,
  type TrackQueuedGenerationOptions,
  writeRegenerationSession,
} from "@/lib/discussionRegenerationStatus";

type AnalyzeResponse = {
  success?: boolean;
  accepted?: boolean;
  queued?: boolean;
  partial?: boolean;
  warning?: string;
  message?: string;
  error?: string | { code?: string; message?: string };
  jobId?: string;
  followUpRequested?: boolean;
  existingJobId?: string;
  parentJobId?: string | null;
};

type DiscussionRegenerationContextValue = {
  isGenerating: boolean;
  isCompleted: boolean;
  duplicateNotice: string | null;
  error: string | null;
  startedAtMs: number | null;
  resumed: boolean;
  startRegeneration: () => Promise<void>;
  /** Track an already-queued durable job using the same polling UX as Refresh. */
  trackQueuedGeneration: (
    baseline: Pick<
      RegenerationStatusSnapshot,
      "latestAnalysisUpdatedAt" | "blueprintUpdatedAt"
    >,
    options?: TrackQueuedGenerationOptions,
  ) => void;
  scrollToUpdatedAnalysis: () => void;
};

const DiscussionRegenerationContext =
  createContext<DiscussionRegenerationContextValue | null>(null);

export function useDiscussionRegeneration(): DiscussionRegenerationContextValue {
  const context = useContext(DiscussionRegenerationContext);

  if (!context) {
    throw new Error(
      "useDiscussionRegeneration must be used within DiscussionRegenerationProvider",
    );
  }

  return context;
}

type DiscussionRegenerationProviderProps = {
  discussionId: string;
  initialSnapshot: RegenerationStatusSnapshot;
  children: ReactNode;
};

export function DiscussionRegenerationProvider({
  discussionId,
  initialSnapshot,
  children,
}: DiscussionRegenerationProviderProps) {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [duplicateNotice, setDuplicateNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);

  const pollCleanupRef = useRef<(() => void) | null>(null);
  const completionToastShownRef = useRef(false);
  const successButtonTimerRef = useRef<number | null>(null);
  const baselineRef = useRef(initialSnapshot);
  const continuityRef = useRef<ContinuityTrackState | null>(null);

  const stopPolling = useCallback(() => {
    pollCleanupRef.current?.();
    pollCleanupRef.current = null;
  }, []);

  const scrollToUpdatedAnalysis = useCallback(() => {
    const target = document.getElementById("executive-intelligence");
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    setShowToast(false);
  }, []);

  const markFailed = useCallback(
    (message: string) => {
      stopPolling();
      clearRegenerationSession(discussionId);
      continuityRef.current = null;
      setIsGenerating(false);
      setIsCompleted(false);
      setResumed(false);
      setStartedAtMs(null);
      setError(message);
      console.log("[ATHENA_REFRESH] logical_refresh_failed", {
        discussionId,
        message,
      });
    },
    [discussionId, stopPolling],
  );

  const markCompleted = useCallback(() => {
    stopPolling();
    clearRegenerationSession(discussionId);
    continuityRef.current = null;
    setIsGenerating(false);
    setIsCompleted(true);
    setDuplicateNotice(null);
    setResumed(false);
    setStartedAtMs(null);
    setError(null);

    if (!completionToastShownRef.current) {
      completionToastShownRef.current = true;
      setShowToast(true);
    }

    console.log("[ATHENA_REFRESH] logical_refresh_completed", {
      discussionId,
    });

    router.refresh();

    if (successButtonTimerRef.current !== null) {
      window.clearTimeout(successButtonTimerRef.current);
    }

    successButtonTimerRef.current = window.setTimeout(() => {
      setIsCompleted(false);
      successButtonTimerRef.current = null;
    }, REGENERATION_SUCCESS_BUTTON_MS);
  }, [discussionId, router, stopPolling]);

  const startPolling = useCallback(
    (
      baseline: Pick<
        RegenerationStatusSnapshot,
        | "latestAnalysisUpdatedAt"
        | "blueprintUpdatedAt"
      >,
      queuedAtMs: number,
      continuity: ContinuityTrackState | null,
    ) => {
      stopPolling();
      continuityRef.current = continuity;

      let cancelled = false;
      let pollTimerId: number | null = null;

      const finish = () => {
        cancelled = true;
        if (pollTimerId !== null) {
          window.clearTimeout(pollTimerId);
        }
      };

      const persistSession = (nextContinuity: ContinuityTrackState | null) => {
        continuityRef.current = nextContinuity;
        writeRegenerationSession({
          discussionId,
          startedAtMs: queuedAtMs,
          baseline,
          continuity: nextContinuity,
        });
      };

      const pollOnce = async () => {
        if (cancelled) {
          return;
        }

        const current = await fetchRegenerationStatus(discussionId);

        if (cancelled) {
          return;
        }

        if (!current) {
          pollTimerId = window.setTimeout(() => {
            void pollOnce();
          }, REGENERATION_POLL_INTERVAL_MS);
          return;
        }

        const evaluation = evaluateRegenerationPoll({
          baseline,
          current,
          queuedAtMs,
          continuity: continuityRef.current,
        });

        if (evaluation.note === "follow_up_materialized") {
          console.log("[ATHENA_REFRESH] follow_up_materialized", {
            discussionId,
            followUpJobId: current.jobId,
            parentJobId: continuityRef.current?.parentJobId ?? null,
          });
        }

        persistSession(evaluation.continuity);

        if (evaluation.decision === "timeout") {
          finish();
          setIsGenerating(false);
          clearRegenerationSession(discussionId);
          continuityRef.current = null;
          return;
        }

        if (evaluation.decision === "fail") {
          finish();
          markFailed(evaluation.error || "Generation failed.");
          return;
        }

        if (evaluation.decision === "complete") {
          finish();
          markCompleted();
          return;
        }

        pollTimerId = window.setTimeout(() => {
          void pollOnce();
        }, REGENERATION_POLL_INTERVAL_MS);
      };

      pollTimerId = window.setTimeout(() => {
        void pollOnce();
      }, REGENERATION_POLL_INTERVAL_MS);

      pollCleanupRef.current = finish;
    },
    [discussionId, markCompleted, markFailed, stopPolling],
  );

  const beginGeneration = useCallback(
    (
      baseline: Pick<
        RegenerationStatusSnapshot,
        | "latestAnalysisUpdatedAt"
        | "blueprintUpdatedAt"
      >,
      queuedAtMs: number,
      options?: {
        resumed?: boolean;
        duplicateNotice?: string | null;
        continuity?: ContinuityTrackState | null;
      },
    ) => {
      completionToastShownRef.current = false;
      setError(null);
      setShowToast(false);
      setIsCompleted(false);
      setIsGenerating(true);
      setResumed(Boolean(options?.resumed));
      setDuplicateNotice(options?.duplicateNotice ?? null);
      setStartedAtMs(queuedAtMs);

      const continuity = options?.continuity ?? null;
      continuityRef.current = continuity;

      writeRegenerationSession({
        discussionId,
        startedAtMs: queuedAtMs,
        baseline,
        continuity,
      });

      startPolling(baseline, queuedAtMs, continuity);
    },
    [discussionId, startPolling],
  );

  const resumeIfNeeded = useCallback(async () => {
    const session = readRegenerationSession(discussionId);
    const status = await fetchRegenerationStatus(discussionId);

    if (session) {
      const evaluation = status
        ? evaluateRegenerationPoll({
            baseline: session.baseline,
            current: status,
            queuedAtMs: session.startedAtMs,
            continuity: session.continuity ?? null,
          })
        : null;

      if (evaluation?.decision === "complete") {
        clearRegenerationSession(discussionId);
        return;
      }

      if (evaluation?.decision === "fail") {
        clearRegenerationSession(discussionId);
        setError(evaluation.error || "Generation failed.");
        return;
      }

      beginGeneration(session.baseline, session.startedAtMs, {
        resumed: true,
        continuity: session.continuity ?? evaluation?.continuity ?? null,
      });
      return;
    }

    // Revisit: resume visibility of an active job or pending follow-up chain.
    // Does not enqueue.
    if (status?.regenerationInFlight || status?.pendingGenerationFollowUp) {
      const continuity =
        status.pendingGenerationFollowUp
          ? buildContinuityFromTrackOptions({
              followUpRequested: true,
              parentJobId: status.jobId ?? status.latestJobId ?? null,
              baselineCurrentVersionId: status.currentVersionId ?? null,
            })
          : null;

      beginGeneration(
        {
          latestAnalysisUpdatedAt: status.latestAnalysisUpdatedAt,
          blueprintUpdatedAt: status.blueprintUpdatedAt,
        },
        Date.now(),
        { resumed: true, continuity },
      );
    }
  }, [beginGeneration, discussionId]);

  useEffect(() => {
    baselineRef.current = initialSnapshot;
  }, [initialSnapshot]);

  useEffect(() => {
    void resumeIfNeeded();

    return () => {
      stopPolling();
      if (successButtonTimerRef.current !== null) {
        window.clearTimeout(successButtonTimerRef.current);
      }
    };
  }, [resumeIfNeeded, stopPolling]);

  const startRegeneration = useCallback(async () => {
    if (isGenerating) {
      setDuplicateNotice("Generation already in progress.");
      return;
    }

    stopPolling();
    setError(null);
    setDuplicateNotice(null);
    setIsCompleted(false);
    setShowToast(false);
    setIsGenerating(true);
    completionToastShownRef.current = false;

    try {
      const baseline =
        (await fetchRegenerationStatus(discussionId)) ?? baselineRef.current;

      const response = await fetch(`/api/discussions/${discussionId}/analyze`, {
        method: "POST",
      });

      const text = await response.text();
      let data: AnalyzeResponse;

      try {
        data = JSON.parse(text) as AnalyzeResponse;
      } catch {
        throw new Error(
          "Athena received an unexpected server response while queuing regeneration.",
        );
      }

      if (!data.success) {
        const message =
          typeof data.error === "string"
            ? data.error
            : data.error?.message || "Regeneration failed. Please check logs.";
        throw new Error(message);
      }

      const queuedAtMs = Date.now();
      const followUpRequested = Boolean(data.followUpRequested);
      const alreadyInProgress = Boolean(
        data.message?.toLowerCase().includes("already in progress") ||
          data.accepted === false ||
          followUpRequested,
      );

      if (alreadyInProgress) {
        const session = readRegenerationSession(discussionId);
        const current = await fetchRegenerationStatus(discussionId);
        const continuity = followUpRequested
          ? buildContinuityFromTrackOptions({
              followUpRequested: true,
              parentJobId:
                data.parentJobId ??
                data.existingJobId ??
                data.jobId ??
                null,
              baselineCurrentVersionId: current?.currentVersionId ?? null,
            })
          : (session?.continuity ?? null);

        beginGeneration(
          session?.baseline ?? current ?? baseline,
          session?.startedAtMs ?? queuedAtMs,
          {
            duplicateNotice: followUpRequested
              ? "Generation already in progress. Tracking follow-up."
              : "Generation already in progress.",
            resumed: true,
            continuity,
          },
        );
        return;
      }

      beginGeneration(baseline, queuedAtMs);
    } catch (err) {
      setIsGenerating(false);
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, [beginGeneration, discussionId, isGenerating, stopPolling]);

  const trackQueuedGeneration = useCallback(
    (
      baseline: Pick<
        RegenerationStatusSnapshot,
        "latestAnalysisUpdatedAt" | "blueprintUpdatedAt"
      >,
      options?: TrackQueuedGenerationOptions,
    ) => {
      const continuity = buildContinuityFromTrackOptions(options);
      if (options?.followUpRequested) {
        console.log("[ATHENA_REFRESH] tracking_coalesced_chain", {
          discussionId,
          parentJobId: options.parentJobId ?? options.jobId ?? null,
        });
      }
      beginGeneration(baseline, Date.now(), { continuity });
    },
    [beginGeneration, discussionId],
  );

  return (
    <DiscussionRegenerationContext.Provider
      value={{
        isGenerating,
        isCompleted,
        duplicateNotice,
        error,
        startedAtMs,
        resumed,
        startRegeneration,
        trackQueuedGeneration,
        scrollToUpdatedAnalysis,
      }}
    >
      {children}

      <RegenerationCompleteToast
        visible={showToast}
        onViewAnalysis={scrollToUpdatedAnalysis}
        onDismiss={() => setShowToast(false)}
      />
    </DiscussionRegenerationContext.Provider>
  );
}

export function DiscussionRegenerationProgress() {
  const { isGenerating, startedAtMs, resumed, duplicateNotice } =
    useDiscussionRegeneration();

  if (!isGenerating || startedAtMs === null) {
    return null;
  }

  return (
    <ExecutiveGenerationPanel
      startedAtMs={startedAtMs}
      resumed={resumed}
      duplicateNotice={duplicateNotice}
    />
  );
}
