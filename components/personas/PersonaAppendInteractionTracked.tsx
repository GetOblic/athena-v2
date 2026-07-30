"use client";

import { useDiscussionRegeneration } from "@/components/discussions/DiscussionRegenerationProvider";
import { PersonaAppendInteraction } from "@/components/personas/PersonaAppendInteraction";

/** Append Interaction wired to Discussion regeneration progress when a bridge exists. */
export function PersonaAppendInteractionTracked(props: {
  personaId: string;
  discussionId: string;
  initialNotes: string | null;
}) {
  const { trackQueuedGeneration, isGenerating } = useDiscussionRegeneration();

  return (
    <PersonaAppendInteraction
      personaId={props.personaId}
      discussionId={props.discussionId}
      initialNotes={props.initialNotes}
      isGenerating={isGenerating}
      onQueued={trackQueuedGeneration}
    />
  );
}
