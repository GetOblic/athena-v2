import { getDiscussionAgePresentation } from "@/lib/discussionAge";
import type { Discussion } from "@/services/discussionService";

type DiscussionAgeBadgeProps = {
  discussion: Discussion;
  className?: string;
  label?: string;
};

export function DiscussionAgeBadge({
  discussion,
  className = "",
  label,
}: DiscussionAgeBadgeProps) {
  const presentation = getDiscussionAgePresentation(discussion);

  return (
    <span className={`font-semibold ${presentation.colorClass} ${className}`}>
      {label ?? presentation.label}
    </span>
  );
}
