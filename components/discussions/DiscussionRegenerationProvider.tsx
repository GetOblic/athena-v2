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
import {
  clearRegenerationSession,
  fetchRegenerationStatus,
  isFullPipelineRegenerationComplete,
  isTerminalFailedRegeneration,
  nextRegenerationPollIntervalMs,
  readRegenerationSession,
  REGENERATION_FAILED_PRESERVE_NOTICE,
  REGENERATION_POLL_SAFETY_CEILING_MS,
  REGENERATION_STILL_RUNNING_NOTICE,
  REGENERATION_SUCCESS_BUTTON_MS,
  type RegenerationStatusSnapshot,
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
};

type DiscussionRegenerationContextValue = {
  isGenerating: boolean;
  isCompleted: boolean;
  duplicateNotice: string | null;
  error: string | null;
  startedAtMs: number | null;
  resumed: boolean;
  jobStage: string | null;
  jobTriggerType: string | null;
  pastSafetyCeiling: boolean;
  sourceKind: "discussion" | "prospect";
  startRegeneration: () => Promise<void>;
  /** Track an already-queued durable job using the same polling UX as Refresh. */
  trackQueuedGeneration: (
    baseline: Pick<
      RegenerationStatusSnapshot,
      "latestAnalysisUpdatedAt" | "blueprintUpdatedAt"
    >,
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
  sourceKind?: "discussion" | "prospect";
};

export function DiscussionRegenerationProvider({
  discussionId,
  initialSnapshot,
  children,
  sourceKind = "discussion",
}: DiscussionRegenerationProviderProps) {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [duplicateNotice, setDuplicateNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [jobStage, setJobStage] = useState<string | null>(
    initialSnapshot.jobStage ?? null,
  );
  const [jobTriggerType, setJobTriggerType] = useState<string | null>(
    initialSnapshot.jobTriggerType ?? null,
  );
  const [pastSafetyCeiling, setPastSafetyCeiling] = useState(false);

  const pollCleanupRef = useRef<(() => void) | null>(null);
  const completionToastShownRef = useRef(false);
  const successButtonTimerRef = useRef<number | null>(null);
  const baselineRef = useRef(initialSnapshot);
  const pollInFlightRef = useRef(false);

  const stopPolling = useCallback(() => {
    pollCleanupRef.current?.();
    pollCleanupRef.current = null;
    pollInFlightRef.current = false;
  }, []);

  const scrollToUpdatedAnalysis = useCallback(() => {
    const target = document.getElementById("executive-intelligence");
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    setShowToast(false);
  }, []);

  const markCompleted = useCallback(() => {
    stopPolling();
    clearRegenerationSession(discussionId);
    setIsGenerating(false);
    setIsCompleted(true);
    setDuplicateNotice(null);
    setResumed(false);
    setStartedAtMs(null);
    setPastSafetyCeiling(false);
    setError(null);

    if (!completionToastShownRef.current) {
      completionToastShownRef.current = true;
      setShowToast(true);
    }

    router.refresh();

    if (successButtonTimerRef.current !== null) {
      window.clearTimeout(successButtonTimerRef.current);
    }

    successButtonTimerRef.current = window.setTimeout(() => {
      setIsCompleted(false);
      successButtonTimerRef.current = null;
    }, REGENERATION_SUCCESS_BUTTON_MS);
  }, [discussionId, router, stopPolling]);

  const markFailed = useCallback(
    (message: string) => {
      stopPolling();
      clearRegenerationSession(discussionId);
      setIsGenerating(false);
      setIsCompleted(false);
      setDuplicateNotice(null);
      setResumed(false);
      setStartedAtMs(null);
      setPastSafetyCeiling(false);
      setError(message);
      router.refresh();
    },
    [discussionId, router, stopPolling],
  );

  const startPolling = useCallback(
    (
      baseline: Pick<
        RegenerationStatusSnapshot,
        | "latestAnalysisUpdatedAt"
        | "blueprintUpdatedAt"
      >,
      queuedAtMs: number,
    ) => {
      stopPolling();

      let cancelled = false;
      let pollTimerId: number | null = null;

      const finish = () => {
        cancelled = true;
        if (pollTimerId !== null) {
          window.clearTimeout(pollTimerId);
          pollTimerId = null;
        }
      };

      const scheduleNext = () => {
        if (cancelled) return;
        const elapsedMs = Date.now() - queuedAtMs;
        const pastCeiling = elapsedMs >= REGENERATION_POLL_SAFETY_CEILING_MS;
        if (pastCeiling) {
          setPastSafetyCeiling(true);
        }
        const delay = nextRegenerationPollIntervalMs({
          elapsedMs,
          documentHidden:
            typeof document !== "undefined" ? document.hidden : false,
          pastSafetyCeiling: pastCeiling,
        });
        pollTimerId = window.setTimeout(() => {
          void pollOnce();
        }, delay);
      };

      const pollOnce = async () => {
        if (cancelled || pollInFlightRef.current) {
          return;
        }

        pollInFlightRef.current = true;
        try {
          const current = await fetchRegenerationStatus(discussionId);

          if (cancelled) {
            return;
          }

          // Auth loss / network: keep trying while the session may still be valid.
          if (!current) {
            scheduleNext();
            return;
          }

          if (current.jobStatus === "auth_lost") {
            finish();
            markFailed("Session expired. Sign in again to check generation status.");
            return;
          }

          if (current.jobStage) {
            setJobStage(current.jobStage);
          }
          if (current.jobTriggerType) {
            setJobTriggerType(current.jobTriggerType);
          }

          if (isTerminalFailedRegeneration(current)) {
            finish();
            markFailed(REGENERATION_FAILED_PRESERVE_NOTICE);
            return;
          }

          if (
            isFullPipelineRegenerationComplete(baseline, current, queuedAtMs)
          ) {
            finish();
            markCompleted();
            return;
          }

          // Durable job still active — never hide the banner on elapsed time alone.
          scheduleNext();
        } finally {
          pollInFlightRef.current = false;
        }
      };

      const onVisibility = () => {
        if (cancelled || typeof document === "undefined") return;
        if (!document.hidden) {
          if (pollTimerId !== null) {
            window.clearTimeout(pollTimerId);
            pollTimerId = null;
          }
          void pollOnce();
        }
      };

      if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", onVisibility);
      }

      // Immediate first poll, then cadence.
      void pollOnce();

      pollCleanupRef.current = () => {
        finish();
        if (typeof document !== "undefined") {
          document.removeEventListener("visibilitychange", onVisibility);
        }
      };
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
      options?: { resumed?: boolean; duplicateNotice?: string | null },
    ) => {
      completionToastShownRef.current = false;
      setError(null);
      setShowToast(false);
      setIsCompleted(false);
      setIsGenerating(true);
      setResumed(Boolean(options?.resumed));
      setDuplicateNotice(options?.duplicateNotice ?? null);
      setStartedAtMs(queuedAtMs);
      setPastSafetyCeiling(
        Date.now() - queuedAtMs >= REGENERATION_POLL_SAFETY_CEILING_MS,
      );

      writeRegenerationSession({
        discussionId,
        startedAtMs: queuedAtMs,
        baseline,
      });

      startPolling(baseline, queuedAtMs);
    },
    [discussionId, startPolling],
  );

  const resumeIfNeeded = useCallback(async () => {
    const session = readRegenerationSession(discussionId);
    const status = await fetchRegenerationStatus(discussionId);

    if (status?.jobTriggerType) {
      setJobTriggerType(status.jobTriggerType);
    }
    if (status?.jobStage) {
      setJobStage(status.jobStage);
    }

    if (session) {
      if (status && isTerminalFailedRegeneration(status)) {
        clearRegenerationSession(discussionId);
        setError(REGENERATION_FAILED_PRESERVE_NOTICE);
        return;
      }

      if (
        status &&
        isFullPipelineRegenerationComplete(
          session.baseline,
          status,
          session.startedAtMs,
        )
      ) {
        clearRegenerationSession(discussionId);
        return;
      }

      if (
        status?.regenerationInFlight ||
        Date.now() - session.startedAtMs < REGENERATION_POLL_SAFETY_CEILING_MS
      ) {
        beginGeneration(session.baseline, session.startedAtMs, {
          resumed: true,
        });
        return;
      }

      // Past ceiling without an active job — clear stale session.
      clearRegenerationSession(discussionId);
      return;
    }

    if (status?.regenerationInFlight) {
      beginGeneration(
        {
          latestAnalysisUpdatedAt: status.latestAnalysisUpdatedAt,
          blueprintUpdatedAt: status.blueprintUpdatedAt,
        },
        Date.now(),
        { resumed: true },
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
    setPastSafetyCeiling(false);
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
      const alreadyInProgress = Boolean(
        data.message?.toLowerCase().includes("already in progress") ||
          data.accepted === false,
      );

      if (alreadyInProgress) {
        const session = readRegenerationSession(discussionId);
        const current = await fetchRegenerationStatus(discussionId);

        beginGeneration(
          session?.baseline ?? current ?? baseline,
          session?.startedAtMs ?? queuedAtMs,
          {
            duplicateNotice: "Generation already in progress.",
            resumed: true,
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
    ) => {
      beginGeneration(baseline, Date.now());
    },
    [beginGeneration],
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
        jobStage,
        jobTriggerType,
        pastSafetyCeiling,
        sourceKind,
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
  const {
    isGenerating,
    startedAtMs,
    resumed,
    duplicateNotice,
    sourceKind,
    jobStage,
    jobTriggerType,
    pastSafetyCeiling,
    error,
  } = useDiscussionRegeneration();

  if ((!isGenerating || startedAtMs === null) && !error) {
    return null;
  }

  if (!isGenerating || startedAtMs === null) {
    if (!error) return null;
    return (
      <div className="rounded-[24px] border border-amber-400/25 bg-amber-400/[0.06] p-6 text-sm leading-6 text-amber-100/90">
        {error}
      </div>
    );
  }

  return (
    <ExecutiveGenerationPanel
      startedAtMs={startedAtMs}
      resumed={resumed}
      duplicateNotice={
        pastSafetyCeiling
          ? REGENERATION_STILL_RUNNING_NOTICE
          : duplicateNotice
      }
      sourceKind={sourceKind}
      jobStage={jobStage}
      jobTriggerType={jobTriggerType}
      pastSafetyCeiling={pastSafetyCeiling}
    />
  );
}
