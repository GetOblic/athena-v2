"use client";

import { useDiscussionRegeneration } from "@/components/discussions/DiscussionRegenerationProvider";

type PartialRefreshActionsProps = {
  discussionId: string;
  /** When set, Prospect refresh uses the prospect API instead of discussion API. */
  prospectId?: string | null;
};

function ButtonSpinner() {
  return (
    <span
      className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white"
      aria-hidden="true"
    />
  );
}

const buttonClassName =
  "inline-flex items-center justify-center rounded-full bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

export function PartialRefreshActions({
  discussionId,
  prospectId = null,
}: PartialRefreshActionsProps) {
  const {
    isGenerating,
    activeTriggerType,
    error,
    duplicateNotice,
    startPartialRefresh,
  } = useDiscussionRegeneration();

  const deploymentBusy =
    isGenerating && activeTriggerType === "deployment_assets_refresh";
  const strategicBusy =
    isGenerating && activeTriggerType === "strategic_assets_refresh";
  const anyBusy = isGenerating;

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          onClick={() =>
            void startPartialRefresh("deployment_assets", {
              discussionId,
              prospectId,
            })
          }
          disabled={anyBusy}
          className={buttonClassName}
        >
          {deploymentBusy ? <ButtonSpinner /> : null}
          {deploymentBusy
            ? "Refreshing Deployment Assets…"
            : "Refresh Deployment Assets"}
        </button>
        <button
          type="button"
          onClick={() =>
            void startPartialRefresh("strategic_assets", {
              discussionId,
              prospectId,
            })
          }
          disabled={anyBusy}
          className={buttonClassName}
        >
          {strategicBusy ? <ButtonSpinner /> : null}
          {strategicBusy
            ? "Refreshing Strategic Assets…"
            : "Refresh Strategic Assets"}
        </button>
      </div>
      {duplicateNotice && !isGenerating ? (
        <div className="text-sm leading-6 text-amber-200/90 sm:text-right">
          {duplicateNotice}
        </div>
      ) : null}
      {error ? (
        <div className="text-sm text-red-300 sm:text-right">{error}</div>
      ) : null}
    </div>
  );
}
