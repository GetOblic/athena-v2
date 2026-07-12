/**
 * Read-time Prospect library enrichment: status from durable job + Current Version,
 * Opportunity Score from canonical opportunity when available.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveGenerationJobForDiscussion } from "@/services/generationJobs/generationJobService";
import {
  formatProspectOpportunityScore,
  resolveProspectDisplayStatus,
  resolveProspectOpportunityScore,
  type ProspectDisplayStatus,
} from "@/services/prospects/prospectDisplay";
import type { Prospect } from "@/services/prospects/prospectService";

export type ProspectLibraryRow = Prospect & {
  display_status: ProspectDisplayStatus;
  display_opportunity_score: number | null;
  display_opportunity_score_label: string;
};

export async function enrichProspectsForLibrary(
  prospects: Prospect[],
  organizationId: string,
): Promise<ProspectLibraryRow[]> {
  if (prospects.length === 0) return [];

  const discussionIds = prospects
    .map((prospect) => prospect.linked_discussion_id)
    .filter((id): id is string => Boolean(id));

  const opportunityScoreByDiscussion = new Map<string, number>();
  const hasCurrentVersionByDiscussion = new Map<string, boolean>();

  if (discussionIds.length > 0) {
    const [{ data: opportunities }, { data: versions }] = await Promise.all([
      supabaseAdmin
        .from("opportunities")
        .select("discussion_id, score")
        .eq("organization_id", organizationId)
        .in("discussion_id", discussionIds),
      supabaseAdmin
        .from("athena_executive_intelligence_versions")
        .select("discussion_id, is_current")
        .eq("organization_id", organizationId)
        .in("discussion_id", discussionIds)
        .eq("is_current", true),
    ]);

    for (const row of opportunities ?? []) {
      if (!row.discussion_id) continue;
      const score = Number(row.score);
      if (Number.isFinite(score) && score > 0) {
        const existing = opportunityScoreByDiscussion.get(row.discussion_id) ?? 0;
        if (score > existing) {
          opportunityScoreByDiscussion.set(row.discussion_id, score);
        }
      }
    }

    for (const row of versions ?? []) {
      if (row.discussion_id && row.is_current) {
        hasCurrentVersionByDiscussion.set(row.discussion_id, true);
      }
    }
  }

  const enriched = await Promise.all(
    prospects.map(async (prospect) => {
      const discussionId = prospect.linked_discussion_id;
      const activeJob = discussionId
        ? await getActiveGenerationJobForDiscussion(discussionId, organizationId)
        : null;

      const hasCurrentVersion = discussionId
        ? Boolean(hasCurrentVersionByDiscussion.get(discussionId))
        : false;

      const display_status = resolveProspectDisplayStatus({
        prospectStatus: prospect.status,
        jobStatus: activeJob?.status ?? null,
        jobStage: activeJob?.current_stage ?? null,
        hasCurrentVersion,
      });

      const display_opportunity_score = resolveProspectOpportunityScore({
        canonicalScore: discussionId
          ? opportunityScoreByDiscussion.get(discussionId) ?? null
          : null,
        denormalizedScore: prospect.opportunity_score,
      });

      return {
        ...prospect,
        display_status,
        display_opportunity_score,
        display_opportunity_score_label: formatProspectOpportunityScore(
          display_opportunity_score,
        ),
      };
    }),
  );

  return enriched;
}
