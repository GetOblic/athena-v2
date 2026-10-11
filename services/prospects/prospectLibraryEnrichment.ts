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
  getGenerationJobStateForDiscussions,
  type GenerationJobDiscussionState,
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
  excludeActivelyConvertedProspects,
  listActiveConvertedProspectIdsForOrganization,
} from "@/services/prospects/prospectActiveConversionVisibility";
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

/** Same bound Home uses for current-version reads. */
export const PROSPECT_LIBRARY_VERSION_CHUNK = 100;

/**
 * Columns the library reads from the current executive version.
 * `suggested_cta` and `intelligence_blueprint_id` are PostgREST JSON-path
 * aliases. Each alias is the extracted scalar, not an intelligence object.
 */
export const PROSPECT_LIBRARY_VERSION_COLUMNS =
  "discussion_id, is_current, blueprint_id, generated_at, suggested_cta:intelligence->analysis->suggested_cta, intelligence_blueprint_id:intelligence->blueprint->id";

type ProspectLibraryVersionRow = {
  discussion_id?: string | null;
  is_current?: boolean | null;
  blueprint_id?: string | null;
  generated_at?: unknown;
  suggested_cta?: unknown;
  intelligence_blueprint_id?: unknown;
  intelligence?: unknown;
  analysis?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readSuggestedCta(row: ProspectLibraryVersionRow): string {
  if ("suggested_cta" in row) {
    return typeof row.suggested_cta === "string" ? row.suggested_cta : "";
  }
  const analysis = asRecord(row.analysis);
  if (typeof analysis?.suggested_cta === "string") {
    return analysis.suggested_cta;
  }
  const intelligence = asRecord(row.intelligence);
  const nested = asRecord(intelligence?.analysis);
  if (typeof nested?.suggested_cta === "string") {
    return nested.suggested_cta;
  }
  return "";
}

function readBlueprintId(row: ProspectLibraryVersionRow): string | null {
  if (typeof row.blueprint_id === "string") {
    return row.blueprint_id ? row.blueprint_id : null;
  }
  if ("intelligence_blueprint_id" in row) {
    return typeof row.intelligence_blueprint_id === "string" &&
      row.intelligence_blueprint_id
      ? row.intelligence_blueprint_id
      : null;
  }
  const intelligence = asRecord(row.intelligence);
  const nestedId = asRecord(intelligence?.blueprint)?.id;
  if (typeof nestedId === "string" && nestedId) return nestedId;
  return null;
}

function isCompleteCurrentVersionRow(row: ProspectLibraryVersionRow): boolean {
  if (!readBlueprintId(row)) return false;
  return isCompleteProspectDeploymentAssetSet(
    extractProspectDeploymentAssetKeys(readSuggestedCta(row)),
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
  const [prospects, activeConvertedProspectIds] = await Promise.all([
    getProspects(organizationId),
    listActiveConvertedProspectIdsForOrganization(organizationId),
  ]);
  const visibleProspects = excludeActivelyConvertedProspects(
    prospects,
    activeConvertedProspectIds,
  );
  const presence = await getGetOblicProspectLinkPresence(
    organizationId,
    visibleProspects.map((prospect) => prospect.id),
  );
  return enrichProspectsForLibrary(
    excludeReleasedOnlyGetOblicProspectsFromLibrary(visibleProspects, presence),
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
  const uniqueDiscussionIds = [...new Set(discussionIds)];

  const opportunityScoreByDiscussion = new Map<string, number>();
  const hasCurrentVersionByDiscussion = new Map<string, boolean>();
  const hasCompleteCurrentVersionByDiscussion = new Map<string, boolean>();
  const generatedAtByDiscussion = new Map<string, string>();
  let jobStateByDiscussion = new Map<string, GenerationJobDiscussionState>();

  if (uniqueDiscussionIds.length > 0) {
    const opportunitiesPromise = supabaseAdmin
      .from("opportunities")
      .select("discussion_id, score")
      .eq("organization_id", organizationId)
      .in("discussion_id", uniqueDiscussionIds);

    const versionsPromise = (async (): Promise<ProspectLibraryVersionRow[]> => {
      const accumulated: ProspectLibraryVersionRow[] = [];
      for (
        let index = 0;
        index < uniqueDiscussionIds.length;
        index += PROSPECT_LIBRARY_VERSION_CHUNK
      ) {
        const chunk = uniqueDiscussionIds.slice(
          index,
          index + PROSPECT_LIBRARY_VERSION_CHUNK,
        );
        const { data, error } = await supabaseAdmin
          .from("athena_executive_intelligence_versions")
          .select(PROSPECT_LIBRARY_VERSION_COLUMNS)
          .eq("organization_id", organizationId)
          .in("discussion_id", chunk)
          .eq("is_current", true);
        // Match the single-query fallback: one failed batch drops every version row.
        if (error != null || data == null) {
          return [];
        }
        for (const row of data as ProspectLibraryVersionRow[]) {
          accumulated.push(row);
        }
      }
      return accumulated;
    })();

    const [{ data: opportunities }, versionRows] = await Promise.all([
      opportunitiesPromise,
      versionsPromise,
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

    for (const row of versionRows) {
      if (!row.discussion_id || !row.is_current) continue;
      hasCurrentVersionByDiscussion.set(row.discussion_id, true);
      hasCompleteCurrentVersionByDiscussion.set(
        row.discussion_id,
        isCompleteCurrentVersionRow(row),
      );
      const generatedAt = readProspectLibraryGeneratedAt(row.generated_at);
      if (generatedAt) {
        generatedAtByDiscussion.set(row.discussion_id, generatedAt);
      }
    }

    jobStateByDiscussion = await getGenerationJobStateForDiscussions(
      organizationId,
      uniqueDiscussionIds,
    );
  }

  const enriched = prospects.map((prospect) => {
    const discussionId = prospect.linked_discussion_id;
    const jobState = discussionId
      ? jobStateByDiscussion.get(discussionId)
      : undefined;
    const activeJob = jobState?.active ?? null;
    const latestJob = jobState?.latest ?? null;

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
  });

  return enriched;
}
