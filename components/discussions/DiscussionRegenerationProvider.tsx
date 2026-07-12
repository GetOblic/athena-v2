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
  readRegenerationSession,
  REGENERATION_POLL_INTERVAL_MS,
  REGENERATION_POLL_TIMEOUT_MS,
  REGENERATION_SUCCESS_BUTTON_MS,
  type RegenerationStatusSnapshot,
  writeRegenerationSession,
} from "@/lib/discussionRegenerationStatus";

type AnalyzeResponse = {
  success?: boolean;
  queued?: boolean;
  partial?: boolean;
  warning?: string;
  message?: string;
  error?: string;
};

type DiscussionRegenerationContextValue = {
  isGenerating: boolean;
  isCompleted: boolean;
  duplicateNotice: string | null;
  error: string | null;
  startedAtMs: number | null;
  resumed: boolean;
  startRegeneration: () => Promise<void>;
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
    setIsCompleted(true);
    setDuplicateNotice(null);
    setResumed(false);
    setStartedAtMs(null);

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
        }
      };

      const pollOnce = async () => {
        if (cancelled) {
          return;
        }

        if (Date.now() - queuedAtMs >= REGENERATION_POLL_TIMEOUT_MS) {
          finish();
          setIsGenerating(false);
          clearRegenerationSession(discussionId);
          return;
        }

        const current = await fetchRegenerationStatus(discussionId);

        if (cancelled) {
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

        pollTimerId = window.setTimeout(() => {
          void pollOnce();
        }, REGENERATION_POLL_INTERVAL_MS);
      };

      pollTimerId = window.setTimeout(() => {
        void pollOnce();
      }, REGENERATION_POLL_INTERVAL_MS);

      pollCleanupRef.current = finish;
    },
    [discussionId, markCompleted, stopPolling],
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
          "Regeneration failed because the server returned an unexpected response.",
        );
      }

      if (!data.success) {
        throw new Error(
          data.error || "Regeneration failed. Please check logs.",
        );
      }

      const queuedAtMs = Date.now();
      const alreadyInProgress = Boolean(
        data.message?.toLowerCase().includes("already in progress"),
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
