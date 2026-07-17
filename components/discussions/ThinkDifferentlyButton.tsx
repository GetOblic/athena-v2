"use client";

import { useDiscussionRegeneration } from "@/components/discussions/DiscussionRegenerationProvider";

type ThinkDifferentlyButtonProps = {
  compact?: boolean;
};

/** Athena success-green secondary action — same language as Continue. */
const THINK_DIFFERENTLY_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-full border border-[var(--athena-success)]/30 bg-[var(--athena-success)]/15 text-sm font-semibold text-[var(--athena-success)] transition hover:border-[var(--athena-success)]/45 hover:bg-[var(--athena-success)]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--athena-success)]/50 disabled:cursor-not-allowed disabled:opacity-50";

function ButtonSpinner() {
  return (
    <span
      className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--athena-success)]/30 border-t-[var(--athena-success)]"
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
      className={`${THINK_DIFFERENTLY_BUTTON_CLASS} ${compact ? "px-6 py-3" : "w-full px-6 py-4"}`}
    >
      {thinking && !completedThink ? <ButtonSpinner /> : null}
      {buttonLabel}
    </button>
  );
}
