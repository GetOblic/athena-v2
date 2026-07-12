import {
  formatProspectOpportunityScore,
  resolveProspectDisplayStatus,
  resolveProspectOpportunityScore,
} from "@/services/prospects/prospectDisplay";
import type { Prospect } from "@/services/prospects/prospectService";
import type { ProspectDisplayStatus } from "@/services/prospects/prospectStatus";

export type PublicProspect = Omit<Prospect, "linked_discussion_id"> & {
  display_status: ProspectDisplayStatus;
  display_opportunity_score: number | null;
  display_opportunity_score_label: string;
};

export function toPublicProspect(
  prospect: Prospect,
  job?: { status?: string | null; current_stage?: string | null } | null,
  options?: {
    hasCurrentVersion?: boolean;
    canonicalScore?: number | null;
  },
): PublicProspect {
  const rest = { ...prospect };
  delete (rest as { linked_discussion_id?: string | null }).linked_discussion_id;

  const display_opportunity_score = resolveProspectOpportunityScore({
    canonicalScore: options?.canonicalScore,
    denormalizedScore: prospect.opportunity_score,
  });

  return {
    ...rest,
    display_status: resolveProspectDisplayStatus({
      prospectStatus: prospect.status,
      jobStatus: job?.status ?? null,
      jobStage: job?.current_stage ?? null,
      hasCurrentVersion: options?.hasCurrentVersion,
    }),
    display_opportunity_score,
    display_opportunity_score_label: formatProspectOpportunityScore(
      display_opportunity_score,
    ),
  };
}
