"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { IdentityInitialResearchStatusView } from "@/components/identity/IdentityInitialResearchStatusView";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import {
  describeIdentityInitialResearch,
  identityProgressIsLive,
  INITIAL_RESEARCH_PROGRESS_POLL_MS,
  readInitialResearchStatusPayload,
  reduceIdentityObservation,
  shouldRefreshIdentityProgress,
  type BrainStatusLabels,
  type IdentityInitialResearchCopy,
  type IdentityObservationState,
} from "@/lib/websiteLearning/initialResearchProgress";

export function IdentityInitialResearchStatus(props: {
  initial: IdentityObservationState;
  labels: BrainStatusLabels;
  copy: IdentityInitialResearchCopy;
}) {
  const router = useRouter();
  const [syncedKey, setSyncedKey] = useState(observationKey(props.initial));
  const [state, setState] = useState(props.initial);
  const serverKind = describeIdentityInitialResearch({
    brainStatus: props.initial.brainStatus,
    research: props.initial.research,
    labels: props.labels,
    copy: props.copy,
  }).view.kind;
  const refreshedKind = useRef<string | null>(null);

  const nextKey = observationKey(props.initial);
  if (nextKey !== syncedKey) {
    setSyncedKey(nextKey);
    setState((current) => reduceIdentityObservation({
      previous: current,
      brainStatus: props.initial.brainStatus,
      research: props.initial.research,
    }));
  }

  const described = describeIdentityInitialResearch({
    brainStatus: state.brainStatus,
    research: state.research,
    labels: props.labels,
    copy: props.copy,
  });
  const live = identityProgressIsLive(described.view.kind);

  useEffect(() => {
    if (!live) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const response = await fetch("/api/identity/deep-scrape/status", {
          method: "GET",
          cache: "no-store",
        });
        const payload = await parseJsonResponse<{
          ok?: boolean;
          brainStatus?: unknown;
          initialResearch?: unknown;
        }>(response);
        if (cancelled || !response.ok || !payload.ok) return;
        const research = readInitialResearchStatusPayload(payload.initialResearch);
        setState((current) =>
          reduceIdentityObservation({
            previous: current,
            brainStatus:
              typeof payload.brainStatus === "string" ? payload.brainStatus : null,
            research,
          }),
        );
      } catch {
        // Keep the last accepted status. A failed poll is not a failure of training.
      }
    };

    const initialTimer = setTimeout(() => {
      void tick();
    }, 0);
    const timer = setInterval(() => {
      void tick();
    }, INITIAL_RESEARCH_PROGRESS_POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(initialTimer);
      clearInterval(timer);
    };
  }, [live]);

  useEffect(() => {
    const kind = described.view.kind;
    if (!shouldRefreshIdentityProgress(kind) || kind === serverKind) return;
    if (refreshedKind.current === kind) return;
    refreshedKind.current = kind;
    router.refresh();
  }, [described.view.kind, router, serverKind]);

  return (
    <IdentityInitialResearchStatusView
      label={described.label}
      notice={described.notice}
      retryLabel={described.retryLabel}
    />
  );
}

function observationKey(state: IdentityObservationState): string {
  return `${state.research.updatedAt ?? ""}:${state.research.status ?? ""}:${state.brainStatus}`;
}
