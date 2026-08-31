"use client";

import type { ComponentProps } from "react";
import { useDiscussionRegeneration } from "@/components/discussions/DiscussionRegenerationProvider";
import { PersonaAppendInteraction } from "@/components/personas/PersonaAppendInteraction";

/** Append Interaction wired to Discussion regeneration progress when a bridge exists. */
export function PersonaAppendInteractionTracked(props: {
  personaId: string;
  discussionId: string;
  initialNotes: string | null;
  chrome?: ComponentProps<typeof PersonaAppendInteraction>["chrome"];
}) {
  const { trackQueuedGeneration, isGenerating } = useDiscussionRegeneration();

  return (
    <PersonaAppendInteraction
      personaId={props.personaId}
      discussionId={props.discussionId}
      initialNotes={props.initialNotes}
      isGenerating={isGenerating}
      onQueued={trackQueuedGeneration}
      chrome={props.chrome}
    />
  );
}
