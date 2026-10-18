"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ProspectInitialResearchStatusView } from "@/components/prospects/ProspectInitialResearchStatusView";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import {
  describeProspectInitialResearch,
  INITIAL_RESEARCH_PROGRESS_POLL_MS,
  presentProspectInitialResearch,
  prospectProgressIsLive,
  readDiscussionGenerationObservation,
  readInitialResearchStatusPayload,
  reduceProspectObservation,
  shouldReadProspectGeneration,
  shouldRefreshProspectProgress,
  type GenerationObservation,
  type ProspectInitialResearchCopy,
  type ProspectObservationState,
} from "@/lib/websiteLearning/initialResearchProgress";

export function ProspectInitialResearchStatus(props: {
  prospectId: string;
  discussionId: string | null;
  displayStatus: string;
  hasCurrentVersion: boolean;
  existingLabel: string;
  failedLabel: string;
  initial: ProspectObservationState;
  copy: ProspectInitialResearchCopy;
}) {
  const router = useRouter();
  const [syncedKey, setSyncedKey] = useState(observationKey(props.initial));
  const [state, setState] = useState(props.initial);
  const serverKind = presentProspectInitialResearch({
    displayStatus: props.displayStatus,
    hasCurrentVersion: props.hasCurrentVersion,
    research: props.initial.research,
    generation: props.initial.generation,
  }).kind;
  const refreshedKind = useRef<string | null>(null);

  const nextKey = observationKey(props.initial);
  if (nextKey !== syncedKey) {
    setSyncedKey(nextKey);
    setState((current) =>
      reduceProspectObservation({
        previous: current,
        research: props.initial.research,
        generation: props.initial.generation,
        generationRead: true,
      }),
    );
  }

  const described = describeProspectInitialResearch({
    displayStatus: props.displayStatus,
    hasCurrentVersion: props.hasCurrentVersion,
    research: state.research,
    generation: state.generation,
    existingLabel: props.existingLabel,
    failedLabel: props.failedLabel,
    copy: props.copy,
  });
  const live = prospectProgressIsLive(described.view.kind);

  useEffect(() => {
    if (!live) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const response = await fetch(
          `/api/prospects/${props.prospectId}/deep-scrape/status`,
          { method: "GET", cache: "no-store" },
        );
        const payload = await parseJsonResponse<{
          ok?: boolean;
          initialResearch?: unknown;
        }>(response);
        if (cancelled || !response.ok || !payload.ok) return;
        const research = readInitialResearchStatusPayload(payload.initialResearch);
        if (!research) {
          setState((current) =>
            reduceProspectObservation({
              previous: current,
              research: null,
              generation: null,
              generationRead: false,
            }),
          );
          return;
        }

        let generation: GenerationObservation | null = null;
        let generationRead = false;
        const currentKind = presentProspectInitialResearch({
          displayStatus: props.displayStatus,
          hasCurrentVersion: props.hasCurrentVersion,
          research,
          generation: null,
        }).kind;
        if (
          shouldReadProspectGeneration({
            discussionId: props.discussionId,
            research,
            currentKind,
          })
        ) {
          const generationResponse = await fetch(
            `/api/discussions/${props.discussionId}/status`,
            { method: "GET", cache: "no-store" },
          );
          const generationPayload = await parseJsonResponse<unknown>(
            generationResponse,
          );
          if (cancelled) return;
          if (generationResponse.ok) {
            generation = readDiscussionGenerationObservation(generationPayload);
            generationRead = generation != null;
          }
        }

        if (cancelled) return;
        setState((current) =>
          reduceProspectObservation({
            previous: current,
            research,
            generation,
            generationRead,
          }),
        );
      } catch {
        // Keep the last accepted status. Polling must not start research or generation.
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
  }, [
    live,
    props.discussionId,
    props.displayStatus,
    props.hasCurrentVersion,
    props.prospectId,
  ]);

  const generationSettled =
    props.initial.generation?.inFlight === true &&
    state.generation != null &&
    state.generation.inFlight === false &&
    (state.generation.status === "completed" ||
      state.generation.status === "failed");

  useEffect(() => {
    if (generationSettled) {
      if (refreshedKind.current === "generation_settled") return;
      refreshedKind.current = "generation_settled";
      router.refresh();
      return;
    }
    const kind = described.view.kind;
    if (!shouldRefreshProspectProgress(kind) || kind === serverKind) return;
    if (refreshedKind.current === kind) return;
    refreshedKind.current = kind;
    router.refresh();
  }, [described.view.kind, generationSettled, router, serverKind]);

  return (
    <ProspectInitialResearchStatusView
      label={described.label}
      notice={described.notice}
      statusToken={described.statusToken}
    />
  );
}

function observationKey(state: ProspectObservationState): string {
  return [
    state.research.updatedAt ?? "",
    state.research.status ?? "",
    state.generation?.status ?? "",
    state.generation?.inFlight ? "1" : "0",
    state.generation?.evidenceFree ? "1" : "0",
  ].join(":");
}
