import {
  normalizeBriefingStatus,
  type BriefingStatusKey,
} from "@/lib/briefingStatus";
import {
  normalizeOpportunityStatus,
  OPPORTUNITY_STATUS_ORDER,
} from "@/lib/opportunityStatus";
import type { Opportunity } from "@/services/opportunityService";
import type { AthenaReview } from "@/services/reviewService";

const BRIEFING_STATUS_PRIORITY: BriefingStatusKey[] = [
  "approved",
  "needs_revision",
  "rejected",
  "draft",
];

function getOpportunityStatusRank(status?: string | null): number {
  const key = normalizeOpportunityStatus(status);
  const index = OPPORTUNITY_STATUS_ORDER.indexOf(key);
  return index === -1 ? 0 : index;
}

function getBriefingStatusPriority(status?: string | null): number {
  const key = normalizeBriefingStatus(status);
  const index = BRIEFING_STATUS_PRIORITY.indexOf(key);
  return index === -1 ? BRIEFING_STATUS_PRIORITY.length : index;
}

function getRecordTimestamp(value: { updated_at?: string; created_at: string }) {
  return new Date(value.updated_at ?? value.created_at).getTime();
}

export function selectCanonicalOpportunity(
  opportunities: Opportunity[],
): Opportunity | null {
  if (opportunities.length === 0) {
    return null;
  }

  if (opportunities.length === 1) {
    return opportunities[0];
  }

  return [...opportunities].sort((a, b) => {
    const statusDiff =
      getOpportunityStatusRank(b.status) - getOpportunityStatusRank(a.status);
    if (statusDiff !== 0) {
      return statusDiff;
    }

    if (b.score !== a.score) {
      return b.score - a.score;
    }

    return getRecordTimestamp(b) - getRecordTimestamp(a);
  })[0];
}

export function selectCanonicalBriefing(
  reviews: AthenaReview[],
): AthenaReview | null {
  if (reviews.length === 0) {
    return null;
  }

  if (reviews.length === 1) {
    return reviews[0];
  }

  return [...reviews].sort((a, b) => {
    const statusDiff =
      getBriefingStatusPriority(a.status) -
      getBriefingStatusPriority(b.status);
    if (statusDiff !== 0) {
      return statusDiff;
    }

    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence;
    }

    return getRecordTimestamp(b) - getRecordTimestamp(a);
  })[0];
}

export function dedupeOpportunitiesByDiscussion(
  opportunities: Opportunity[],
): Opportunity[] {
  const withoutDiscussion: Opportunity[] = [];
  const byDiscussion = new Map<string, Opportunity[]>();

  for (const opportunity of opportunities) {
    if (!opportunity.discussion_id) {
      withoutDiscussion.push(opportunity);
      continue;
    }

    const bucket = byDiscussion.get(opportunity.discussion_id) ?? [];
    bucket.push(opportunity);
    byDiscussion.set(opportunity.discussion_id, bucket);
  }

  const canonical: Opportunity[] = [...withoutDiscussion];

  for (const group of byDiscussion.values()) {
    const selected = selectCanonicalOpportunity(group);
    if (selected) {
      canonical.push(selected);
    }
  }

  return canonical;
}

export function dedupeBriefingsByOpportunity(
  reviews: AthenaReview[],
): AthenaReview[] {
  const byKey = new Map<string, AthenaReview[]>();

  for (const review of reviews) {
    const key =
      review.opportunity_id ??
      (review.discussion_id ? `discussion:${review.discussion_id}` : review.id);
    const bucket = byKey.get(key) ?? [];
    bucket.push(review);
    byKey.set(key, bucket);
  }

  const canonical: AthenaReview[] = [];

  for (const group of byKey.values()) {
    const selected = selectCanonicalBriefing(group);
    if (selected) {
      canonical.push(selected);
    }
  }

  return canonical;
}
