import { getDiscussionLifecycle } from "@/lib/discussionStatus";
import type { Discussion } from "@/services/discussionService";

type DiscussionLifecycleBadgeProps = {
  discussion: Discussion;
  hasAnalysis: boolean;
  className?: string;
  label?: string;
};

export function DiscussionLifecycleBadge({
  discussion,
  hasAnalysis,
  className = "",
  label,
}: DiscussionLifecycleBadgeProps) {
  const presentation = getDiscussionLifecycle(discussion, hasAnalysis);

  return (
    <span className={`font-semibold ${presentation.colorClass} ${className}`}>
      {label ?? presentation.label}
    </span>
  );
}
