"use client";

import { useDiscussionRegeneration } from "@/components/discussions/DiscussionRegenerationProvider";

type ThinkDifferentlyButtonProps = {
  compact?: boolean;
};

function ButtonSpinner() {
  return (
    <span
      className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white"
      aria-hidden="true"
    />
  );
}

export function ThinkDifferentlyButton({
  compact = false,
}: ThinkDifferentlyButtonProps) {
  const {
    isGenerating,
    isCompleted,
    activeGenerationKind,
    startThinkDifferently,
  } = useDiscussionRegeneration();

  const thinking = isGenerating && activeGenerationKind === "think_differently";
  const completedThink =
    isCompleted && activeGenerationKind === "think_differently";

  const buttonLabel = completedThink
    ? "✓ Thought Differently"
    : thinking
      ? "Thinking Differently…"
      : "Think Differently";

  return (
    <button
      type="button"
      onClick={() => void startThinkDifferently()}
      disabled={isGenerating}
      className={
        compact
          ? "inline-flex items-center justify-center rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white/90 transition hover:border-[var(--athena-orange)]/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          : "inline-flex w-full items-center justify-center rounded-full border border-white/15 px-6 py-4 text-sm font-semibold text-white/90 transition hover:border-[var(--athena-orange)]/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
      }
    >
      {thinking && !completedThink ? <ButtonSpinner /> : null}
      {buttonLabel}
    </button>
  );
}
