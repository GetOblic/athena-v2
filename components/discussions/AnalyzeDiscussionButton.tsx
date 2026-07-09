"use client";

import { useDiscussionRegeneration } from "@/components/discussions/DiscussionRegenerationProvider";

type AnalyzeDiscussionButtonProps = {
  discussionId: string;
  label?: string;
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

export function AnalyzeDiscussionButton({
  discussionId: _discussionId,
  label = "Generate Fresh Intelligence",
  compact = false,
}: AnalyzeDiscussionButtonProps) {
  const {
    isGenerating,
    isCompleted,
    duplicateNotice,
    error,
    startRegeneration,
  } = useDiscussionRegeneration();

  const buttonLabel = isCompleted
    ? "✓ Fresh Intelligence Generated"
    : isGenerating
      ? "Generating Executive Intelligence..."
      : label;

  return (
    <div>
      {!compact && (
        <p className="mb-4 text-sm leading-6 text-white/40">
          Regenerates analysis, opportunity detection, executive briefing,
          deployment assets, and strategic asset blueprint for this discussion.
        </p>
      )}

      <button
        type="button"
        onClick={() => void startRegeneration()}
        disabled={isGenerating}
        className={
          compact
            ? "inline-flex items-center justify-center rounded-full border border-[var(--athena-orange)]/40 bg-[var(--athena-orange)]/10 px-5 py-3 text-sm font-semibold text-[var(--athena-orange)] transition hover:bg-[var(--athena-orange)]/20 disabled:cursor-not-allowed disabled:opacity-50"
            : "inline-flex w-full items-center justify-center rounded-full bg-[var(--athena-orange)] px-6 py-4 text-sm font-semibold text-white shadow-xl shadow-orange-500/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        }
      >
        {isGenerating && !isCompleted ? <ButtonSpinner /> : null}
        {buttonLabel}
      </button>

      {duplicateNotice && !isGenerating && (
        <div className="mt-3 text-sm leading-6 text-amber-200/90">
          {duplicateNotice}
        </div>
      )}

      {error && <div className="mt-3 text-sm text-red-400">{error}</div>}
    </div>
  );
}
