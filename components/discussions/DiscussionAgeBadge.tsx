import { getDiscussionAgePresentation } from "@/lib/discussionAge";
import type { Discussion } from "@/services/discussionService";

type DiscussionAgeBadgeProps = {
  discussion: Discussion;
  className?: string;
};

export function DiscussionAgeBadge({
  discussion,
  className = "",
}: DiscussionAgeBadgeProps) {
  const presentation = getDiscussionAgePresentation(discussion);

  return (
    <span className={`font-semibold ${presentation.colorClass} ${className}`}>
      {presentation.label}
    </span>
  );
}
