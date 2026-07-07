import {
  classifyDiscussionQueue,
  getDiscussionQueueOrder,
  getDiscussionQueueTitle,
  type DiscussionQueueKey,
} from "@/lib/discussionStatus";
import {
  normalizeBriefingStatus,
  type BriefingStatusKey,
} from "@/lib/briefingStatus";
import {
  getOpportunityStatusSectionTitle,
  normalizeOpportunityStatus,
  OPPORTUNITY_STATUS_ORDER,
  type OpportunityStatusKey,
} from "@/lib/opportunityStatus";
import type { Discussion } from "@/services/discussionService";
import { getDiscussions } from "@/services/discussionService";
import { getAnalyzedDiscussionIds } from "@/services/discussionAnalysisService";
import type { Opportunity } from "@/services/opportunityService";
import { getOpportunities } from "@/services/opportunityService";
import type { AthenaReview } from "@/services/reviewService";
import { getReviews } from "@/services/reviewService";

export type DiscussionQueueSection = {
  key: DiscussionQueueKey;
  title: string;
  items: Discussion[];
};

export type OpportunityQueueSection = {
  key: OpportunityStatusKey;
  title: string;
  items: Opportunity[];
};

export type BriefingQueueSection = {
  key: BriefingStatusKey;
  title: string;
  items: AthenaReview[];
};

const BRIEFING_QUEUE_ORDER: BriefingStatusKey[] = [
  "needs_revision",
  "draft",
  "approved",
  "rejected",
];

const BRIEFING_QUEUE_TITLES: Record<BriefingStatusKey, string> = {
  needs_revision: "Needs Revision",
  draft: "Draft",
  approved: "Approved",
  rejected: "Rejected",
};

const URGENCY_RANK: Record<string, number> = {
  critical: 5,
  urgent: 4,
  high: 3,
  medium: 2,
  moderate: 2,
  low: 1,
};

function sortDiscussions(a: Discussion, b: Discussion): number {
  if (b.opportunity_score !== a.opportunity_score) {
    return b.opportunity_score - a.opportunity_score;
  }

  const aActivity = a.last_activity ?? a.created_at;
  const bActivity = b.last_activity ?? b.created_at;

  return new Date(bActivity).getTime() - new Date(aActivity).getTime();
}

function getUrgencyRank(value?: string | null): number {
  if (!value) {
    return 0;
  }

  return URGENCY_RANK[value.trim().toLowerCase()] ?? 0;
}

function buildLatestConfidenceByOpportunityId(
  reviews: AthenaReview[],
): Map<string, number> {
  const confidenceByOpportunity = new Map<string, number>();

  for (const review of reviews) {
    if (!review.opportunity_id) {
      continue;
    }

    if (confidenceByOpportunity.has(review.opportunity_id)) {
      continue;
    }

    confidenceByOpportunity.set(review.opportunity_id, review.confidence ?? 0);
  }

  return confidenceByOpportunity;
}

function sortOpportunities(
  a: Opportunity,
  b: Opportunity,
  confidenceByOpportunity: Map<string, number>,
): number {
  if (b.score !== a.score) {
    return b.score - a.score;
  }

  const urgencyDiff =
    getUrgencyRank(b.urgency) - getUrgencyRank(a.urgency);
  if (urgencyDiff !== 0) {
    return urgencyDiff;
  }

  const confidenceDiff =
    (confidenceByOpportunity.get(b.id) ?? 0) -
    (confidenceByOpportunity.get(a.id) ?? 0);
  if (confidenceDiff !== 0) {
    return confidenceDiff;
  }

  return (
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

function sortBriefings(a: AthenaReview, b: AthenaReview): number {
  if (b.confidence !== a.confidence) {
    return b.confidence - a.confidence;
  }

  const aTimestamp = a.updated_at ?? a.created_at;
  const bTimestamp = b.updated_at ?? b.created_at;

  return new Date(bTimestamp).getTime() - new Date(aTimestamp).getTime();
}

function groupByKey<T, K extends string>(
  items: T[],
  getKey: (item: T) => K,
): Map<K, T[]> {
  const grouped = new Map<K, T[]>();

  for (const item of items) {
    const key = getKey(item);
    const bucket = grouped.get(key);

    if (bucket) {
      bucket.push(item);
    } else {
      grouped.set(key, [item]);
    }
  }

  return grouped;
}

export async function getDiscussionQueues(): Promise<DiscussionQueueSection[]> {
  const [discussions, analyzedDiscussionIds] = await Promise.all([
    getDiscussions(),
    getAnalyzedDiscussionIds(),
  ]);

  const grouped: Record<DiscussionQueueKey, Discussion[]> = {
    new: [],
    in_review: [],
    processed: [],
  };

  for (const discussion of discussions) {
    const hasAnalysis = analyzedDiscussionIds.has(discussion.id);
    const queueKey = classifyDiscussionQueue(hasAnalysis, discussion.status);
    grouped[queueKey].push(discussion);
  }

  return getDiscussionQueueOrder().map((key) => ({
    key,
    title: getDiscussionQueueTitle(key),
    items: grouped[key].sort(sortDiscussions),
  }));
}

export async function getOpportunityQueues(): Promise<OpportunityQueueSection[]> {
  const [opportunities, reviews] = await Promise.all([
    getOpportunities(),
    getReviews(),
  ]);

  const confidenceByOpportunity =
    buildLatestConfidenceByOpportunityId(reviews);
  const grouped = groupByKey(opportunities, (opportunity) =>
    normalizeOpportunityStatus(opportunity.status),
  );

  return OPPORTUNITY_STATUS_ORDER.map((key) => ({
    key,
    title: getOpportunityStatusSectionTitle(key),
    items: (grouped.get(key) ?? []).sort((a, b) =>
      sortOpportunities(a, b, confidenceByOpportunity),
    ),
  }));
}

export async function getBriefingQueues(): Promise<BriefingQueueSection[]> {
  const briefings = await getReviews();
  const grouped = groupByKey(briefings, (briefing) =>
    normalizeBriefingStatus(briefing.status),
  );

  return BRIEFING_QUEUE_ORDER.map((key) => ({
    key,
    title: BRIEFING_QUEUE_TITLES[key],
    items: (grouped.get(key) ?? []).sort(sortBriefings),
  }));
}
