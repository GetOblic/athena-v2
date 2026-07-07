import type { Discussion } from "@/services/discussionService";

export type DiscussionAgeKey = "fresh" | "active" | "cooling" | "dormant";

export type DiscussionAgePresentation = {
  key: DiscussionAgeKey;
  label: string;
  colorClass: string;
};

const AGE_PRESENTATIONS: Record<
  DiscussionAgeKey,
  Omit<DiscussionAgePresentation, "key">
> = {
  fresh: {
    label: "Fresh",
    colorClass: "text-emerald-400",
  },
  active: {
    label: "Active",
    colorClass: "text-[var(--athena-success)]",
  },
  cooling: {
    label: "Cooling",
    colorClass: "text-[var(--athena-warning)]",
  },
  dormant: {
    label: "Dormant",
    colorClass: "text-white/45",
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function getDiscussionLastActivityTimestamp(
  discussion: Discussion,
): number {
  const value = discussion.last_activity ?? discussion.updated_at ?? discussion.created_at;
  return new Date(value).getTime();
}

export function getDiscussionAgeKey(discussion: Discussion): DiscussionAgeKey {
  const ageMs = Date.now() - getDiscussionLastActivityTimestamp(discussion);
  const ageDays = ageMs / DAY_MS;

  if (ageDays <= 3) {
    return "fresh";
  }

  if (ageDays <= 14) {
    return "active";
  }

  if (ageDays <= 30) {
    return "cooling";
  }

  return "dormant";
}

export function getDiscussionAgePresentation(
  discussion: Discussion,
): DiscussionAgePresentation {
  const key = getDiscussionAgeKey(discussion);
  return {
    key,
    ...AGE_PRESENTATIONS[key],
  };
}
