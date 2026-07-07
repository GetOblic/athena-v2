import type { Discussion } from "@/services/discussionService";

export type DiscussionQueueKey = "new" | "in_review" | "processed";

export type DiscussionLifecycleKey =
  | "new"
  | "reviewing"
  | "monitoring"
  | "completed";

export type DiscussionLifecyclePresentation = {
  key: DiscussionLifecycleKey;
  label: string;
  colorClass: string;
};

const LIFECYCLE_PRESENTATIONS: Record<
  DiscussionLifecycleKey,
  Omit<DiscussionLifecyclePresentation, "key">
> = {
  new: {
    label: "New",
    colorClass: "text-[var(--athena-warning)]",
  },
  reviewing: {
    label: "Reviewing",
    colorClass: "text-cyan-400",
  },
  monitoring: {
    label: "Monitoring",
    colorClass: "text-purple-400",
  },
  completed: {
    label: "Completed",
    colorClass: "text-[var(--athena-success)]",
  },
};

const QUEUE_TITLES: Record<DiscussionQueueKey, string> = {
  new: "New",
  in_review: "In Review",
  processed: "Processed",
};

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

export function isDiscussionAwaitingReview(status?: string | null): boolean {
  const token = normalizeToken(status ?? "");
  return (
    token === "needsreview" ||
    token === "needseview" ||
    token === "reviewing" ||
    token === "inreview"
  );
}

export function classifyDiscussionQueue(
  hasAnalysis: boolean,
  status?: string | null,
): DiscussionQueueKey {
  if (!hasAnalysis) {
    return "new";
  }

  if (isDiscussionAwaitingReview(status)) {
    return "in_review";
  }

  return "processed";
}

export function getDiscussionLifecycle(
  discussion: Discussion,
  hasAnalysis: boolean,
): DiscussionLifecyclePresentation {
  if (!hasAnalysis) {
    return { key: "new", ...LIFECYCLE_PRESENTATIONS.new };
  }

  if (isDiscussionAwaitingReview(discussion.status)) {
    return { key: "reviewing", ...LIFECYCLE_PRESENTATIONS.reviewing };
  }

  const token = normalizeToken(discussion.status);

  if (token === "completed" || token === "done") {
    return { key: "completed", ...LIFECYCLE_PRESENTATIONS.completed };
  }

  return { key: "monitoring", ...LIFECYCLE_PRESENTATIONS.monitoring };
}

export function formatDiscussionLifecycle(
  discussion: Discussion,
  hasAnalysis: boolean,
): string {
  return getDiscussionLifecycle(discussion, hasAnalysis).label;
}

export function getDiscussionQueueTitle(key: DiscussionQueueKey): string {
  return QUEUE_TITLES[key];
}

export function getDiscussionQueueOrder(): DiscussionQueueKey[] {
  return ["new", "in_review", "processed"];
}
