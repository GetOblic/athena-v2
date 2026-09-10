/**
 * Read-time Prospect library enrichment: status from durable job + validated
 * Current Version completeness, Prospect Completeness from the shared algorithm,
 * current-version generated_at, and batched GetOblic relationship status.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { readProspectLibraryGeneratedAt } from "@/lib/prospects/prospectLibraryFreshness";
import {
  isCompleteProspectDeploymentAssetSet,
  extractProspectDeploymentAssetKeys,
} from "@/lib/prospectDeploymentAssetContract";
import {
  getActiveGenerationJobForDiscussion,
  getLatestGenerationJobForDiscussion,
} from "@/services/generationJobs/generationJobService";
import {
  formatProspectOpportunityScore,
  resolveProspectDisplayStatus,
  resolveProspectOpportunityScore,
  type ProspectDisplayStatus,
} from "@/services/prospects/prospectDisplay";
import { computeProspectIntelligenceCompleteness } from "@/services/prospects/prospectIntelligenceCompleteness";
import {
  normalizeProspectLifecycleStatus,
  type ProspectLifecycleStatus,
} from "@/services/prospects/prospectLifecycle";
import {
  getProspects,
  type Prospect,
} from "@/services/prospects/prospectService";
import {
  getGetOblicProspectLinkPresence,
  type GetOblicProspectLinkPresence,
} from "@/services/getoblicDirectory/getoblicDirectoryService";
import type { ActiveGetOblicRelationshipStatus } from "@/services/getoblicDirectory/getoblicDirectoryTypes";

export type ProspectLibraryRow = Prospect & {
  /** Intelligence readiness (Queued / Ready / …). */
  display_status: ProspectDisplayStatus;
  /** Client-managed lifecycle for Status column/filter. */
  display_lifecycle_status: ProspectLifecycleStatus;
  display_opportunity_score: number | null;
  display_opportunity_score_label: string;
  display_completeness_score: number;
  display_intelligence_generated_at: string | null;
  getoblic_relationship_status: ActiveGetOblicRelationshipStatus | null;
};

function isCompleteCurrentVersionRow(row: {
  blueprint_id?: string | null;
  intelligence?: {
    analysis?: { suggested_cta?: string | null } | null;
    blueprint?: { id?: string | null } | null;
  } | null;
}): boolean {
  const blueprintId =
    row.blueprint_id ?? row.intelligence?.blueprint?.id ?? null;
  if (!blueprintId) return false;
  const cta = row.intelligence?.analysis?.suggested_cta ?? "";
  return isCompleteProspectDeploymentAssetSet(
    extractProspectDeploymentAssetKeys(cta),
  );
}

export function excludeReleasedOnlyGetOblicProspectsFromLibrary<
  T extends { id: string },
>(
  prospects: readonly T[],
  presence: {
    historyProspectIds: ReadonlySet<string>;
    activeProspectIds: ReadonlySet<string>;
  },
): T[] {
  return prospects.filter((prospect) => {
    if (!presence.historyProspectIds.has(prospect.id)) {
      return true;
    }
    return presence.activeProspectIds.has(prospect.id);
  });
}

export function buildProspectLibraryCompleteness(input: {
  prospect: Prospect;
  hasCurrentVersion: boolean;
  getoblicRelationshipStatus: ActiveGetOblicRelationshipStatus | null;
}): number {
  return computeProspectIntelligenceCompleteness({
    prospect: input.prospect,
    hasCurrentExecutiveVersion: input.hasCurrentVersion,
    hasActiveGetOblicListingLink: input.getoblicRelationshipStatus != null,
  }).score;
}

/**
 * /prospects library loader. Leaves shared getProspects() unchanged so
 * Estimate, Ads, and Social Planner selectors keep all-org semantics.
 */
export async function loadProspectsForLibrary(
  organizationId: string,
): Promise<ProspectLibraryRow[]> {
  const prospects = await getProspects(organizationId);
  const presence = await getGetOblicProspectLinkPresence(
    organizationId,
    prospects.map((prospect) => prospect.id),
  );
  return enrichProspectsForLibrary(
    excludeReleasedOnlyGetOblicProspectsFromLibrary(prospects, presence),
    organizationId,
    presence,
  );
}

export async function enrichProspectsForLibrary(
  prospects: Prospect[],
  organizationId: string,
  presence?: Pick<GetOblicProspectLinkPresence, "activeStatusByProspectId">,
): Promise<ProspectLibraryRow[]> {
  if (prospects.length === 0) return [];

  const discussionIds = prospects
    .map((prospect) => prospect.linked_discussion_id)
    .filter((id): id is string => Boolean(id));

  const opportunityScoreByDiscussion = new Map<string, number>();
  const hasCurrentVersionByDiscussion = new Map<string, boolean>();
  const hasCompleteCurrentVersionByDiscussion = new Map<string, boolean>();
  const generatedAtByDiscussion = new Map<string, string>();

  if (discussionIds.length > 0) {
    const [{ data: opportunities }, { data: versions }] = await Promise.all([
      supabaseAdmin
        .from("opportunities")
        .select("discussion_id, score")
        .eq("organization_id", organizationId)
        .in("discussion_id", discussionIds),
      supabaseAdmin
        .from("athena_executive_intelligence_versions")
        .select(
          "discussion_id, is_current, blueprint_id, intelligence, generated_at",
        )
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
      if (!row.discussion_id || !row.is_current) continue;
      hasCurrentVersionByDiscussion.set(row.discussion_id, true);
      hasCompleteCurrentVersionByDiscussion.set(
        row.discussion_id,
        isCompleteCurrentVersionRow(row),
      );
      const generatedAt = readProspectLibraryGeneratedAt(
        (row as { generated_at?: unknown }).generated_at,
      );
      if (generatedAt) {
        generatedAtByDiscussion.set(row.discussion_id, generatedAt);
      }
    }
  }

  const enriched = await Promise.all(
    prospects.map(async (prospect) => {
      const discussionId = prospect.linked_discussion_id;
      const [activeJob, latestJob] = discussionId
        ? await Promise.all([
            getActiveGenerationJobForDiscussion(discussionId, organizationId),
            getLatestGenerationJobForDiscussion(discussionId, organizationId),
          ])
        : [null, null];

      const hasCurrentVersion = discussionId
        ? Boolean(hasCurrentVersionByDiscussion.get(discussionId))
        : false;
      const hasCompleteCurrentVersion = discussionId
        ? Boolean(hasCompleteCurrentVersionByDiscussion.get(discussionId))
        : false;
      const getoblic_relationship_status =
        presence?.activeStatusByProspectId.get(prospect.id) ?? null;

      const hasTerminalJobFailure = Boolean(
        !activeJob &&
          latestJob?.status === "failed" &&
          !hasCompleteCurrentVersion,
      );

      const display_status = resolveProspectDisplayStatus({
        prospectStatus: prospect.status,
        jobStatus: activeJob?.status ?? null,
        jobStage: activeJob?.current_stage ?? null,
        hasCurrentVersion,
        hasCompleteCurrentVersion,
        hasTerminalJobFailure,
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
        display_lifecycle_status: normalizeProspectLifecycleStatus(
          prospect.lifecycle_status,
        ),
        display_opportunity_score,
        display_opportunity_score_label: formatProspectOpportunityScore(
          display_opportunity_score,
        ),
        display_completeness_score: buildProspectLibraryCompleteness({
          prospect,
          hasCurrentVersion,
          getoblicRelationshipStatus: getoblic_relationship_status,
        }),
        display_intelligence_generated_at: discussionId
          ? generatedAtByDiscussion.get(discussionId) ?? null
          : null,
        getoblic_relationship_status,
      };
    }),
  );

  return enriched;
}
