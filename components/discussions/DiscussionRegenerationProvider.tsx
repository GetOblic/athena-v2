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
import { BACKGROUND_ACTION_ACTIVE_STATUSES } from "@/lib/completionSound/backgroundActionCompletion";
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
import type { DiscussionExecutiveChrome } from "@/lib/discussionExecutiveChrome";

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

export type ActiveGenerationKind =
  | "generate_intelligence"
  | "think_differently";

type DiscussionRegenerationContextValue = {
  isGenerating: boolean;
  isCompleted: boolean;
  activeGenerationKind: ActiveGenerationKind | null;
  duplicateNotice: string | null;
  error: string | null;
  startedAtMs: number | null;
  resumed: boolean;
  stillRunningAfterTimeout: boolean;
  startRegeneration: () => Promise<void>;
  startThinkDifferently: () => Promise<void>;
  /** Track an already-queued durable job using the same polling UX as Generate Intelligence. */
  trackQueuedGeneration: (
    baseline: Pick<
      RegenerationStatusSnapshot,
      "latestAnalysisUpdatedAt" | "blueprintUpdatedAt"
    >,
    kind?: ActiveGenerationKind,
  ) => void;
  scrollToUpdatedAnalysis: () => void;
  chrome: DiscussionExecutiveChrome | null;
};

const DiscussionRegenerationContext =
  createContext<DiscussionRegenerationContextValue | null>(null);

const noopAsync = async () => {};
const noop = () => {};

/** Safe no-discussion context. Does not poll, queue, or fabricate a discussion. */
const IDLE_DISCUSSION_REGENERATION: DiscussionRegenerationContextValue = {
  isGenerating: false,
  isCompleted: false,
  activeGenerationKind: null,
  duplicateNotice: null,
  error: null,
  startedAtMs: null,
  resumed: false,
  stillRunningAfterTimeout: false,
  startRegeneration: noopAsync,
  startThinkDifferently: noopAsync,
  trackQueuedGeneration: noop,
  scrollToUpdatedAnalysis: noop,
  chrome: null,
};

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
  discussionId?: string | null;
  initialSnapshot: RegenerationStatusSnapshot;
  children: ReactNode;
  chrome?: DiscussionExecutiveChrome | null;
};

export function DiscussionRegenerationProvider({
  discussionId,
  initialSnapshot,
  children,
  chrome = null,
}: DiscussionRegenerationProviderProps) {
  if (!discussionId) {
    return (
      <DiscussionRegenerationContext.Provider
        value={
          chrome
            ? { ...IDLE_DISCUSSION_REGENERATION, chrome }
            : IDLE_DISCUSSION_REGENERATION
        }
      >
        {children}
      </DiscussionRegenerationContext.Provider>
    );
  }

  return (
    <DiscussionRegenerationSessionProvider
      discussionId={discussionId}
      initialSnapshot={initialSnapshot}
      chrome={chrome}
    >
      {children}
    </DiscussionRegenerationSessionProvider>
  );
}

function DiscussionRegenerationSessionProvider({
  discussionId,
  initialSnapshot,
  children,
  chrome = null,
}: {
  discussionId: string;
  initialSnapshot: RegenerationStatusSnapshot;
  children: ReactNode;
  chrome?: DiscussionExecutiveChrome | null;
}) {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [activeGenerationKind, setActiveGenerationKind] =
    useState<ActiveGenerationKind | null>(null);
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
  const activeKindRef = useRef<ActiveGenerationKind | null>(null);
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

    // Toast + chime are sibling effects of this confirmed-success event only.
    // Re-arm active status if the observer lost it (e.g. provider remount after
    // enqueue refresh) so the chime cannot be skipped while the toast still shows.
    if (!completionToastShownRef.current) {
      completionToastShownRef.current = true;
      const previous = completionSound.getPreviousStatus();
      if (
        !previous ||
        !BACKGROUND_ACTION_ACTIVE_STATUSES.has(previous)
      ) {
        completionSound.observe("processing");
      }
      completionSound.observe("completed");
      setShowToast(true);
    }

    router.refresh();

    if (successButtonTimerRef.current !== null) {
      window.clearTimeout(successButtonTimerRef.current);
    }

    successButtonTimerRef.current = window.setTimeout(() => {
      setIsCompleted(false);
      setActiveGenerationKind(null);
      activeKindRef.current = null;
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
          setActiveGenerationKind(null);
          activeKindRef.current = null;
          setError(
            chrome?.generationFailed ??
              "Generation failed. Athena could not complete this run.",
          );
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
    [chrome, completionSound, discussionId, markCompleted, router, stopPolling],
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
        kind?: ActiveGenerationKind;
      },
    ) => {
      const kind = options?.kind ?? "generate_intelligence";
      completionToastShownRef.current = false;
      setError(null);
      setShowToast(false);
      setIsCompleted(false);
      setIsGenerating(true);
      setActiveGenerationKind(kind);
      activeKindRef.current = kind;
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

  const queueGeneration = useCallback(
    async (endpoint: string, kind: ActiveGenerationKind) => {
      if (isGenerating) {
        setDuplicateNotice(
          chrome?.generationInProgress ?? "Generation already in progress.",
        );
        return;
      }

      // Unlock audio during the initiating click, before any await.
      completionSound.unlock();

      stopPolling();
      setError(null);
      setDuplicateNotice(null);
      setIsCompleted(false);
      setShowToast(false);
      setIsGenerating(true);
      setActiveGenerationKind(kind);
      activeKindRef.current = kind;
      completionToastShownRef.current = false;

      try {
        const baseline =
          (await fetchRegenerationStatus(discussionId)) ?? baselineRef.current;

        const response = await fetch(endpoint, {
          method: "POST",
        });

        const text = await response.text();
        let data: AnalyzeResponse;

        try {
          data = JSON.parse(text) as AnalyzeResponse;
        } catch {
          throw new Error(
            chrome?.generationUnexpected ??
              "Athena received an unexpected server response while queuing generation.",
          );
        }

        if (!data.success) {
          const message =
            typeof data.error === "string"
              ? data.error
              : data.error?.message ||
                chrome?.generationFailedLogs ||
                "Generation failed. Please check logs.";
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
              duplicateNotice:
                chrome?.generationInProgress ??
                "Generation already in progress.",
              resumed: true,
              kind,
            },
          );
          return;
        }

        beginGeneration(baseline, queuedAtMs, { kind });
      } catch (err) {
        setIsGenerating(false);
        setActiveGenerationKind(null);
        activeKindRef.current = null;
        setError(
          err instanceof Error
            ? err.message
            : chrome?.generationUnknown ?? "Unknown error",
        );
      }
    },
    [beginGeneration, chrome, completionSound, discussionId, isGenerating, stopPolling],
  );

  const startRegeneration = useCallback(async () => {
    await queueGeneration(
      `/api/discussions/${discussionId}/analyze`,
      "generate_intelligence",
    );
  }, [discussionId, queueGeneration]);

  const startThinkDifferently = useCallback(async () => {
    await queueGeneration(
      `/api/discussions/${discussionId}/think-differently`,
      "think_differently",
    );
  }, [discussionId, queueGeneration]);

  const trackQueuedGeneration = useCallback(
    (
      baseline: Pick<
        RegenerationStatusSnapshot,
        "latestAnalysisUpdatedAt" | "blueprintUpdatedAt"
      >,
      kind: ActiveGenerationKind = "generate_intelligence",
    ) => {
      beginGeneration(baseline, Date.now(), { kind });
    },
    [beginGeneration],
  );

  return (
    <DiscussionRegenerationContext.Provider
      value={{
        isGenerating,
        isCompleted,
        activeGenerationKind,
        duplicateNotice,
        error,
        startedAtMs,
        resumed,
        stillRunningAfterTimeout,
        startRegeneration,
        startThinkDifferently,
        trackQueuedGeneration,
        scrollToUpdatedAnalysis,
        chrome,
      }}
    >
      {children}

      <RegenerationCompleteToast
        visible={showToast}
        onViewAnalysis={scrollToUpdatedAnalysis}
        onDismiss={() => setShowToast(false)}
        title={chrome?.toastTitle}
        body={chrome?.toastBody}
        viewLabel={chrome?.toastView}
        dismissLabel={chrome?.toastDismiss}
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
    chrome,
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
      chrome={chrome}
    />
  );
}
