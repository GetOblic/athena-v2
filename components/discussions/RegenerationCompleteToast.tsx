"use client";

type RegenerationCompleteToastProps = {
  visible: boolean;
  onViewAnalysis: () => void;
  onDismiss: () => void;
};

export function RegenerationCompleteToast({
  visible,
  onViewAnalysis,
  onDismiss,
}: RegenerationCompleteToastProps) {
  if (!visible) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 sm:justify-end sm:px-8">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto w-full max-w-md rounded-[20px] border border-emerald-500/25 bg-[#10131a]/95 p-5 shadow-2xl shadow-black/40 backdrop-blur"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 text-lg text-emerald-400">✓</div>
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold text-white">
              Executive Intelligence Ready
            </div>
            <p className="mt-1 text-sm leading-6 text-white/60">
              Your discussion has been regenerated using the latest market
              reasoning.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onViewAnalysis}
                className="rounded-full bg-[var(--athena-orange)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              >
                View Updated Analysis
              </button>
              <button
                type="button"
                onClick={onDismiss}
                className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/70 transition hover:border-white/25 hover:text-white"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
