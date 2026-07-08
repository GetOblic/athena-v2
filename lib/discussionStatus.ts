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

export const DISCUSSION_STATUS_OPTIONS = [
  "New",
  "Reviewing",
  "Monitoring",
  "Completed",
] as const;

export type DiscussionStatusOption = (typeof DISCUSSION_STATUS_OPTIONS)[number];

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

export function normalizeDiscussionLifecycleKey(
  status?: string | null,
): DiscussionLifecycleKey | null {
  const token = normalizeToken(status ?? "");

  if (!token) {
    return null;
  }

  if (token === "new") {
    return "new";
  }

  if (
    token === "reviewing" ||
    token === "needsreview" ||
    token === "needseview" ||
    token === "inreview"
  ) {
    return "reviewing";
  }

  if (token === "monitoring") {
    return "monitoring";
  }

  if (token === "completed" || token === "done") {
    return "completed";
  }

  return null;
}

export function isDiscussionAwaitingReview(status?: string | null): boolean {
  return normalizeDiscussionLifecycleKey(status) === "reviewing";
}

export function classifyDiscussionQueue(
  hasAnalysis: boolean,
  status?: string | null,
): DiscussionQueueKey {
  const lifecycle = normalizeDiscussionLifecycleKey(status);

  if (!hasAnalysis || lifecycle === "new") {
    return "new";
  }

  if (lifecycle === "reviewing") {
    return "in_review";
  }

  return "processed";
}

export function getDiscussionLifecycle(
  discussion: Discussion,
  hasAnalysis: boolean,
): DiscussionLifecyclePresentation {
  const explicit = normalizeDiscussionLifecycleKey(discussion.status);

  if (explicit) {
    return { key: explicit, ...LIFECYCLE_PRESENTATIONS[explicit] };
  }

  if (!hasAnalysis) {
    return { key: "new", ...LIFECYCLE_PRESENTATIONS.new };
  }

  if (isDiscussionAwaitingReview(discussion.status)) {
    return { key: "reviewing", ...LIFECYCLE_PRESENTATIONS.reviewing };
  }

  return { key: "monitoring", ...LIFECYCLE_PRESENTATIONS.monitoring };
}

export function formatDiscussionLifecycle(
  discussion: Discussion,
  hasAnalysis: boolean,
): string {
  return getDiscussionLifecycle(discussion, hasAnalysis).label;
}

export function getDiscussionLifecycleColor(
  discussion: Discussion,
  hasAnalysis: boolean,
): string {
  return getDiscussionLifecycle(discussion, hasAnalysis).colorClass;
}

export function getDiscussionQueueTitle(key: DiscussionQueueKey): string {
  return QUEUE_TITLES[key];
}

export function getDiscussionQueueOrder(): DiscussionQueueKey[] {
  return ["new", "in_review", "processed"];
}

export function getDiscussionActionLabel(
  queueKey: DiscussionQueueKey,
): string {
  return queueKey === "new" ? "Analyze" : "Open";
}
