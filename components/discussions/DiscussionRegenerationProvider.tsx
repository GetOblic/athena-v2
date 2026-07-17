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
import { useBackgroundActionCompletionSound } from "@/lib/completionSound/useBackgroundActionCompletionSound";
import {
  clearRegenerationSession,
  fetchRegenerationStatus,
  isFullPipelineRegenerationComplete,
  readRegenerationSession,
  REGENERATION_POLL_INTERVAL_MS,
  REGENERATION_POLL_TIMEOUT_MS,
  REGENERATION_SLOW_POLL_INTERVAL_MS,
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
  stillRunningAfterTimeout: boolean;
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
  const [stillRunningAfterTimeout, setStillRunningAfterTimeout] =
    useState(false);

  const pollCleanupRef = useRef<(() => void) | null>(null);
  const completionToastShownRef = useRef(false);
  const successButtonTimerRef = useRef<number | null>(null);
  const baselineRef = useRef(initialSnapshot);
  const completionSound = useBackgroundActionCompletionSound();

  const stopPolling = useCallback(() => {
    pollCleanupRef.current?.();
    pollCleanupRef.current = null;
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
    setStillRunningAfterTimeout(false);
    setIsCompleted(true);
    setDuplicateNotice(null);
    setResumed(false);
    setStartedAtMs(null);

    // Active→success chime (observer ignores repeats / idle→completed).
    completionSound.observe("completed");

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
  }, [completionSound, discussionId, router, stopPolling]);

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
      let slowMode = false;

      const finish = () => {
        cancelled = true;
        if (pollTimerId !== null) {
          window.clearTimeout(pollTimerId);
        }
      };

      const pollOnce = async () => {
        if (cancelled) {
          return;
        }

        const elapsed = Date.now() - queuedAtMs;
        if (!slowMode && elapsed >= REGENERATION_POLL_TIMEOUT_MS) {
          // Stop aggressive polling — do NOT mark success. Keep monitoring slowly.
          slowMode = true;
          setStillRunningAfterTimeout(true);
        }

        const current = await fetchRegenerationStatus(discussionId);

        if (cancelled) {
          return;
        }

        if (current?.jobStatus === "failed") {
          finish();
          clearRegenerationSession(discussionId);
          setIsGenerating(false);
          setStillRunningAfterTimeout(false);
          setError("Generation failed. Athena could not complete this run.");
          completionSound.observe("failed");
          router.refresh();
          return;
        }

        if (
          current &&
          isFullPipelineRegenerationComplete(baseline, current, queuedAtMs)
        ) {
          finish();
          markCompleted();
          return;
        }

        const interval = slowMode
          ? REGENERATION_SLOW_POLL_INTERVAL_MS
          : REGENERATION_POLL_INTERVAL_MS;

        pollTimerId = window.setTimeout(() => {
          void pollOnce();
        }, interval);
      };

      pollTimerId = window.setTimeout(() => {
        void pollOnce();
      }, REGENERATION_POLL_INTERVAL_MS);

      pollCleanupRef.current = finish;
    },
    [completionSound, discussionId, markCompleted, router, stopPolling],
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
      setStillRunningAfterTimeout(false);
      setResumed(Boolean(options?.resumed));
      setDuplicateNotice(options?.duplicateNotice ?? null);
      setStartedAtMs(queuedAtMs);
      completionSound.observe("processing");

      writeRegenerationSession({
        discussionId,
        startedAtMs: queuedAtMs,
        baseline,
      });

      startPolling(baseline, queuedAtMs);
    },
    [completionSound, discussionId, startPolling],
  );

  const resumeIfNeeded = useCallback(async () => {
    const session = readRegenerationSession(discussionId);
    const status = await fetchRegenerationStatus(discussionId);

    if (session) {
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

      beginGeneration(session.baseline, session.startedAtMs, { resumed: true });
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
        stillRunningAfterTimeout,
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
    stillRunningAfterTimeout,
  } = useDiscussionRegeneration();

  if (!isGenerating || startedAtMs === null) {
    return null;
  }

  return (
    <ExecutiveGenerationPanel
      startedAtMs={startedAtMs}
      resumed={resumed}
      duplicateNotice={duplicateNotice}
      stillRunningAfterTimeout={stillRunningAfterTimeout}
    />
  );
}
