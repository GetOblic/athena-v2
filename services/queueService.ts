import {
  classifyOpportunityPriority,
  getOpportunityPriorityPresentation,
  OPPORTUNITY_PRIORITY_ORDER,
  sortOpportunitiesByPriority,
  type OpportunityPriorityKey,
} from "@/lib/opportunityPriority";
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
import type { Discussion } from "@/services/discussionService";
import { getDiscussions } from "@/services/discussionService";
import { getAnalyzedDiscussionIds } from "@/services/discussionAnalysisService";
import type { Opportunity } from "@/services/opportunityService";
import { getCanonicalOpportunities } from "@/services/opportunityService";
import type { AthenaReview } from "@/services/reviewService";
import { getCanonicalReviews } from "@/services/reviewService";
import { PROSPECT_INTELLIGENCE_PLATFORM } from "@/services/prospects/prospectService";

export type DiscussionQueueSection = {
  key: DiscussionQueueKey;
  title: string;
  items: Discussion[];
};

export type OpportunityWorkQueueSection = {
  key: OpportunityPriorityKey;
  title: string;
  description: string;
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

function sortDiscussions(a: Discussion, b: Discussion): number {
  if (b.opportunity_score !== a.opportunity_score) {
    return b.opportunity_score - a.opportunity_score;
  }

  const aActivity = a.last_activity ?? a.created_at;
  const bActivity = b.last_activity ?? b.created_at;

  return new Date(bActivity).getTime() - new Date(aActivity).getTime();
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

export async function getDiscussionQueues(
  organizationId: string,
): Promise<DiscussionQueueSection[]> {
  const [discussions, analyzedDiscussionIds] = await Promise.all([
    getDiscussions(organizationId),
    getAnalyzedDiscussionIds(organizationId),
  ]);

  const grouped: Record<DiscussionQueueKey, Discussion[]> = {
    new: [],
    in_review: [],
    processed: [],
  };

  for (const discussion of discussions) {
    if (discussion.platform === PROSPECT_INTELLIGENCE_PLATFORM) {
      continue;
    }
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

export async function getOpportunityWorkQueues(
  organizationId: string,
): Promise<OpportunityWorkQueueSection[]> {
  const opportunities = await getCanonicalOpportunities(organizationId);
  const grouped = groupByKey(opportunities, classifyOpportunityPriority);

  return OPPORTUNITY_PRIORITY_ORDER.map((key) => {
    const presentation = getOpportunityPriorityPresentation(key);
    return {
      key,
      title: presentation.title,
      description: presentation.description,
      items: (grouped.get(key) ?? []).sort(sortOpportunitiesByPriority),
    };
  });
}

/** @deprecated Use getOpportunityWorkQueues for operator-facing queues */
export async function getOpportunityQueues(
  organizationId: string,
): Promise<OpportunityWorkQueueSection[]> {
  return getOpportunityWorkQueues(organizationId);
}

export async function getBriefingQueues(
  organizationId: string,
): Promise<BriefingQueueSection[]> {
  const briefings = await getCanonicalReviews(organizationId);
  const grouped = groupByKey(briefings, (briefing) =>
    normalizeBriefingStatus(briefing.status),
  );

  return BRIEFING_QUEUE_ORDER.map((key) => ({
    key,
    title: BRIEFING_QUEUE_TITLES[key],
    items: (grouped.get(key) ?? []).sort(sortBriefings),
  }));
}
