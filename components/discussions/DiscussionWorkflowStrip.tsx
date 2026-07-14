import type { DiscussionWorkflowStep } from "@/lib/discussionWorkflow";
import { ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS } from "@/components/ui/athenaExecutiveCard";

type DiscussionWorkflowStripProps = {
  steps: DiscussionWorkflowStep[];
};

export function DiscussionWorkflowStrip({
  steps,
}: DiscussionWorkflowStripProps) {
  return (
    <div
      className={`mt-8 rounded-[24px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-card)] p-6`}
    >
      <div className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-white/35">
        Workflow Progress
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {steps.map((step, index) => (
          <div key={step.key} className="flex items-center gap-3">
            <div
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                step.complete
                  ? "bg-[var(--athena-success)]/15 text-[var(--athena-success)]"
                  : step.current
                    ? "bg-[var(--athena-orange)]/15 text-[var(--athena-orange)]"
                    : "bg-white/5 text-white/40"
              }`}
            >
              <span className="mr-2">{step.complete ? "✓" : "○"}</span>
              {step.label}
            </div>
            {index < steps.length - 1 ? (
              <span className="text-white/20">→</span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
