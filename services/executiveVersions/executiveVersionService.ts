import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getAssetBlueprintById,
  getDisplayAssetBlueprintByDiscussionId,
} from "@/services/assetBlueprints/assetBlueprintService";
import { getLatestDiscussionAnalysis } from "@/services/discussionAnalysisService";
import { getDiscussionById } from "@/services/discussionService";
import { getOpportunityByDiscussionId } from "@/services/opportunityService";
import { getLatestReviewByOpportunityId } from "@/services/reviewService";
import { buildExecutiveVersionGenerationMetadata } from "@/services/executiveVersions/executiveVersionMetadata";
import {
  shouldPatchIncompleteCurrentVersion,
  withResolvedVersionIntelligence,
} from "@/services/executiveVersions/executiveVersionDisplay";
import { resolveExecutiveVersionGeneratedAt } from "@/services/executiveVersions/executiveVersionSelection";
import {
  EXECUTIVE_INTELLIGENCE_PIPELINE_VERSION,
  type ExecutiveIntelligencePayload,
  type ExecutiveIntelligenceVersion,
  type ExecutiveVersionSummary,
} from "@/services/executiveVersions/executiveVersionTypes";
import {
  logPersonaDeploymentAssetStability,
  IncompletePersonaPublicationError,
} from "@/lib/personaDeploymentAssetContract";
import { requirePersonaCompleteness } from "@/lib/personaIntelligenceAssetCatalog";
import {
  logProspectDeploymentAssetStability,
  validateProspectDeploymentAssetPayload,
  IncompleteProspectPublicationError,
} from "@/lib/prospectDeploymentAssetContract";
import { isPersonaIntelligenceBridge } from "@/services/personas/personaBridgeMarker";
import { isProspectIntelligenceBridge } from "@/services/prospects/prospectBridgeMarker";

function assertProspectPublicationCandidate(input: {
  intelligence: ExecutiveIntelligencePayload;
  blueprintId?: string | null;
  discussionId: string;
  organizationId: string;
  regenerationRunId?: string | null;
}): void {
  const blueprintId =
    input.blueprintId ?? input.intelligence.blueprint?.id ?? null;
  if (!blueprintId) {
    throw new IncompleteProspectPublicationError(
      "Prospect publication needs a linked Strategic Blueprint.",
    );
  }

  const validation = validateProspectDeploymentAssetPayload(
    input.intelligence.analysis.suggested_cta,
  );
  if (!validation.isComplete) {
    logProspectDeploymentAssetStability("publication_rejected_incomplete_cta", {
      discussionId: input.discussionId,
      organizationId: input.organizationId,
      regenerationRunId: input.regenerationRunId ?? null,
      parsedAssetCount: validation.parsedKeys.length,
      missingCanonicalKeys: validation.missingKeys,
      failureReason: validation.failureReason,
    });
    throw new IncompleteProspectPublicationError(
      "Prospect publication needs a complete Deployment Asset set.",
    );
  }
}

function assertPersonaPublicationCandidate(input: {
  intelligence: ExecutiveIntelligencePayload;
  blueprintId?: string | null;
  discussionId: string;
  organizationId: string;
  regenerationRunId?: string | null;
}): void {
  const blueprintId =
    input.blueprintId ?? input.intelligence.blueprint?.id ?? null;

  try {
    requirePersonaCompleteness({
      suggestedCta: input.intelligence.analysis.suggested_cta,
      blueprintId,
    });
  } catch (error) {
    if (error instanceof IncompletePersonaPublicationError) {
      const validationMessage = error.message;
      if (validationMessage.includes("Deployment Asset")) {
        logPersonaDeploymentAssetStability(
          "publication_rejected_incomplete_cta",
          {
            discussionId: input.discussionId,
            organizationId: input.organizationId,
            regenerationRunId: input.regenerationRunId ?? null,
          },
        );
      }
    }
    throw error;
  }
}

function mapVersionRow(row: Record<string, unknown>): ExecutiveIntelligenceVersion {
  return {
    id: row.id as string,
    discussion_id: row.discussion_id as string,
    organization_id: row.organization_id as string,
    user_id: (row.user_id as string | null) ?? null,
    version_number: row.version_number as number,
    is_current: Boolean(row.is_current),
    generated_at: row.generated_at as string,
    generation_duration_ms: (row.generation_duration_ms as number | null) ?? null,
    models_used: (row.models_used as string | null) ?? null,
    routing_profile: (row.routing_profile as string | null) ?? null,
    reasoning_profile: (row.reasoning_profile as string | null) ?? null,
    reasoning_effort:
      (row.reasoning_effort as ExecutiveIntelligenceVersion["reasoning_effort"]) ??
      null,
    pipeline_version:
      (row.pipeline_version as string) ?? EXECUTIVE_INTELLIGENCE_PIPELINE_VERSION,
    regeneration_run_id: (row.regeneration_run_id as string | null) ?? null,
    analysis_id: (row.analysis_id as string | null) ?? null,
    opportunity_id: (row.opportunity_id as string | null) ?? null,
    review_id: (row.review_id as string | null) ?? null,
    blueprint_id: (row.blueprint_id as string | null) ?? null,
    intelligence: row.intelligence as ExecutiveIntelligencePayload,
    created_at: row.created_at as string,
  };
}

export async function loadLiveExecutiveIntelligence(
  discussionId: string,
  organizationId: string,
): Promise<ExecutiveIntelligencePayload | null> {
  const analysis = await getLatestDiscussionAnalysis(discussionId, organizationId);
  if (!analysis) {
    return null;
  }

  const opportunity = await getOpportunityByDiscussionId(
    discussionId,
    organizationId,
  );
  const briefing = opportunity
    ? await getLatestReviewByOpportunityId(opportunity.id, organizationId)
    : null;
  const blueprint = await getDisplayAssetBlueprintByDiscussionId(
    discussionId,
    organizationId,
  );

  return {
    analysis,
    opportunity,
    briefing,
    blueprint,
  };
}

async function getNextVersionNumber(
  discussionId: string,
  organizationId: string,
): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("athena_executive_intelligence_versions")
    .select("version_number")
    .eq("discussion_id", discussionId)
    .eq("organization_id", organizationId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Failed to resolve next executive version number:", error);
    throw error;
  }

  return (data?.version_number ?? 0) + 1;
}

async function clearCurrentFlag(
  discussionId: string,
  organizationId: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("athena_executive_intelligence_versions")
    .update({ is_current: false })
    .eq("discussion_id", discussionId)
    .eq("organization_id", organizationId)
    .eq("is_current", true);

  if (error) {
    console.error("Failed to clear current executive version flag:", error);
    throw error;
  }
}

async function insertExecutiveVersion(input: {
  discussionId: string;
  organizationId: string;
  userId?: string | null;
  intelligence: ExecutiveIntelligencePayload;
  markCurrent: boolean;
  regenerationRunId?: string | null;
  generationDurationMs?: number | null;
  analysisId?: string | null;
  opportunityId?: string | null;
  reviewId?: string | null;
  blueprintId?: string | null;
  generatedAt?: string;
  /** Explicit Think Differently marker embedded in the intelligence snapshot. */
  generationMode?: ExecutiveIntelligencePayload["generationMode"];
}): Promise<ExecutiveIntelligenceVersion> {
  const metadata = buildExecutiveVersionGenerationMetadata();
  const versionNumber = await getNextVersionNumber(
    input.discussionId,
    input.organizationId,
  );

  if (input.markCurrent) {
    await clearCurrentFlag(input.discussionId, input.organizationId);
  }

  const intelligenceSnapshot: ExecutiveIntelligencePayload = {
    ...input.intelligence,
    ...(input.generationMode === "think_differently"
      ? { generationMode: "think_differently" as const }
      : {}),
  };
  // Standard publication must not carry a Think Differently marker.
  if (input.generationMode !== "think_differently") {
    delete intelligenceSnapshot.generationMode;
  }

  const { data, error } = await supabaseAdmin
    .from("athena_executive_intelligence_versions")
    .insert({
      discussion_id: input.discussionId,
      organization_id: input.organizationId,
      user_id: input.userId ?? input.intelligence.analysis.user_id ?? null,
      version_number: versionNumber,
      is_current: input.markCurrent,
      generated_at: resolveExecutiveVersionGeneratedAt({
        generatedAt: input.generatedAt,
        generationMode: input.generationMode,
        analysisCreatedAt: input.intelligence.analysis.created_at,
        nowIso: new Date().toISOString(),
      }),
      generation_duration_ms: input.generationDurationMs ?? null,
      models_used: metadata.models_used,
      routing_profile: metadata.routing_profile,
      reasoning_profile: metadata.reasoning_profile,
      reasoning_effort: metadata.reasoning_effort,
      pipeline_version: EXECUTIVE_INTELLIGENCE_PIPELINE_VERSION,
      regeneration_run_id: input.regenerationRunId ?? null,
      analysis_id:
        input.analysisId ?? input.intelligence.analysis.id ?? null,
      opportunity_id:
        input.opportunityId ?? input.intelligence.opportunity?.id ?? null,
      review_id: input.reviewId ?? input.intelligence.briefing?.id ?? null,
      blueprint_id:
        input.blueprintId ?? input.intelligence.blueprint?.id ?? null,
      intelligence: intelligenceSnapshot,
    })
    .select("*")
    .single();

  if (error) {
    console.error("Failed to insert executive intelligence version:", error);
    throw error;
  }

  return mapVersionRow(data);
}

/**
 * If this discussion has live intelligence but no versions yet,
 * persist the live state as the Original Version (Current).
 * Never overwrites existing versions.
 */
export async function ensureCurrentLiveIntelligenceIsVersioned(
  discussionId: string,
  organizationId: string,
): Promise<ExecutiveIntelligenceVersion | null> {
  const existing = await listExecutiveVersionSummaries(
    discussionId,
    organizationId,
  );
  if (existing.length > 0) {
    return null;
  }

  const intelligence = await loadLiveExecutiveIntelligence(
    discussionId,
    organizationId,
  );
  if (!intelligence) {
    return null;
  }

  return insertExecutiveVersion({
    discussionId,
    organizationId,
    userId: intelligence.analysis.user_id,
    intelligence,
    markCurrent: true,
    analysisId: intelligence.analysis.id,
    opportunityId: intelligence.opportunity?.id ?? null,
    reviewId: intelligence.briefing?.id ?? null,
    blueprintId: intelligence.blueprint?.id ?? null,
    generationDurationMs: intelligence.analysis.generation_time_ms,
    generatedAt: intelligence.analysis.created_at,
  });
}

/**
 * Publish a brand-new immutable Executive Intelligence Version from live records
 * after a successful regeneration. Marks it Current; previous versions stay archived.
 */
export async function publishExecutiveIntelligenceVersion(input: {
  discussionId: string;
  organizationId: string;
  regenerationRunId?: string | null;
  generationDurationMs?: number | null;
  analysisId?: string | null;
  opportunityId?: string | null;
  reviewId?: string | null;
  blueprintId?: string | null;
  requireProspectCompleteness?: boolean;
  /** Persona bridges: require Blueprint + complete 14-key Persona DA set. */
  requirePersonaCompleteness?: boolean;
  /**
   * When true, always insert a new Current version even if analysis_id matches.
   * Required for Think Differently (same upstream analysis, new blueprint + assets).
   */
  forceNewVersion?: boolean;
  /** Persisted on the version intelligence snapshot for Think Differently tagging. */
  generationMode?: ExecutiveIntelligencePayload["generationMode"];
  /**
   * Optional publication/completion time for this specific generation run.
   * Think Differently must pass this explicitly. When omitted, insert uses
   * resolveExecutiveVersionGeneratedAt (analysis.created_at for Standard;
   * now for Think Differently mode as a safety net).
   */
  generatedAt?: string;
}): Promise<ExecutiveIntelligenceVersion | null> {
  const intelligence = await loadLiveExecutiveIntelligence(
    input.discussionId,
    input.organizationId,
  );

  if (!intelligence) {
    return null;
  }

  if (input.requireProspectCompleteness) {
    assertProspectPublicationCandidate({
      intelligence,
      blueprintId: input.blueprintId,
      discussionId: input.discussionId,
      organizationId: input.organizationId,
      regenerationRunId: input.regenerationRunId,
    });
  }

  if (input.requirePersonaCompleteness) {
    assertPersonaPublicationCandidate({
      intelligence,
      blueprintId: input.blueprintId,
      discussionId: input.discussionId,
      organizationId: input.organizationId,
      regenerationRunId: input.regenerationRunId,
    });
  }

  // Avoid duplicate Current when the live analysis was already published
  // (e.g. ensure step just created Version 1 and no new analysis ran).
  const current = await getCurrentExecutiveVersion(
    input.discussionId,
    input.organizationId,
  );
  if (
    !input.forceNewVersion &&
    current &&
    current.analysis_id &&
    current.analysis_id === intelligence.analysis.id
  ) {
    // Mid-pipeline ensure can publish an incomplete snapshot (analysis before
    // deployment assets / blueprint). Patch that incomplete Current in place
    // so the immutable row matches the finished live intelligence.
    if (
      shouldPatchIncompleteCurrentVersion({
        current,
        live: intelligence,
        regenerationRunId: input.regenerationRunId,
      })
    ) {
      return patchIncompleteCurrentExecutiveVersion({
        current,
        intelligence,
        blueprintId: input.blueprintId ?? intelligence.blueprint?.id ?? null,
        regenerationRunId: input.regenerationRunId,
        generationDurationMs: input.generationDurationMs,
      });
    }

    // Same analysis already Current and not an upgrade — refuse to leave
    // incomplete Prospect/Persona Current when completeness is required.
    if (input.requireProspectCompleteness) {
      assertProspectPublicationCandidate({
        intelligence: current.intelligence,
        blueprintId: current.blueprint_id,
        discussionId: input.discussionId,
        organizationId: input.organizationId,
        regenerationRunId: input.regenerationRunId,
      });
    }
    if (input.requirePersonaCompleteness) {
      assertPersonaPublicationCandidate({
        intelligence: current.intelligence,
        blueprintId: current.blueprint_id,
        discussionId: input.discussionId,
        organizationId: input.organizationId,
        regenerationRunId: input.regenerationRunId,
      });
    }

    return current;
  }

  // Pass through an explicit publication timestamp when provided (Think Differently).
  // Otherwise insertExecutiveVersion keeps prior Standard / lazy-backfill semantics
  // via resolveExecutiveVersionGeneratedAt (analysis.created_at, then now).
  return insertExecutiveVersion({
    discussionId: input.discussionId,
    organizationId: input.organizationId,
    userId: intelligence.analysis.user_id,
    intelligence,
    markCurrent: true,
    regenerationRunId: input.regenerationRunId,
    generationDurationMs: input.generationDurationMs,
    analysisId: input.analysisId ?? intelligence.analysis.id,
    opportunityId: input.opportunityId ?? intelligence.opportunity?.id ?? null,
    reviewId: input.reviewId ?? intelligence.briefing?.id ?? null,
    blueprintId: input.blueprintId ?? intelligence.blueprint?.id ?? null,
    generationMode: input.generationMode,
    generatedAt: input.generatedAt,
  });
}

/**
 * Complete an incomplete Current version snapshot without creating a new
 * version number. Only used when analysis_id matches and asset fields were
 * missing at first publish.
 */
async function patchIncompleteCurrentExecutiveVersion(input: {
  current: ExecutiveIntelligenceVersion;
  intelligence: ExecutiveIntelligencePayload;
  blueprintId?: string | null;
  regenerationRunId?: string | null;
  generationDurationMs?: number | null;
}): Promise<ExecutiveIntelligenceVersion> {
  const blueprintId =
    input.blueprintId ??
    input.intelligence.blueprint?.id ??
    input.current.blueprint_id ??
    null;

  const { data, error } = await supabaseAdmin
    .from("athena_executive_intelligence_versions")
    .update({
      intelligence: input.intelligence,
      blueprint_id: blueprintId,
      opportunity_id:
        input.intelligence.opportunity?.id ?? input.current.opportunity_id,
      review_id: input.intelligence.briefing?.id ?? input.current.review_id,
      regeneration_run_id:
        input.regenerationRunId ?? input.current.regeneration_run_id,
      generation_duration_ms:
        input.generationDurationMs ?? input.current.generation_duration_ms,
    })
    .eq("id", input.current.id)
    .eq("organization_id", input.current.organization_id)
    .eq("discussion_id", input.current.discussion_id)
    .eq("is_current", true)
    .select("*")
    .single();

  if (error) {
    console.error(
      "Failed to patch incomplete current executive version:",
      error,
    );
    throw error;
  }

  return mapVersionRow(data);
}

export async function listExecutiveVersionSummaries(
  discussionId: string,
  organizationId: string,
): Promise<ExecutiveVersionSummary[]> {
  const { data, error } = await supabaseAdmin
    .from("athena_executive_intelligence_versions")
    .select(
      "id, version_number, is_current, generated_at, models_used, routing_profile, generation_duration_ms",
    )
    .eq("discussion_id", discussionId)
    .eq("organization_id", organizationId)
    .order("version_number", { ascending: false });

  if (error) {
    console.error("Failed to list executive versions:", error);
    return [];
  }

  return (data ?? []) as ExecutiveVersionSummary[];
}

export async function listExecutiveVersions(
  discussionId: string,
  organizationId: string,
): Promise<ExecutiveIntelligenceVersion[]> {
  const { data, error } = await supabaseAdmin
    .from("athena_executive_intelligence_versions")
    .select("*")
    .eq("discussion_id", discussionId)
    .eq("organization_id", organizationId)
    .order("version_number", { ascending: false });

  if (error) {
    console.error("Failed to list executive intelligence versions:", error);
    return [];
  }

  return (data ?? []).map((row) => mapVersionRow(row));
}

export async function getCurrentExecutiveVersion(
  discussionId: string,
  organizationId: string,
): Promise<ExecutiveIntelligenceVersion | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_executive_intelligence_versions")
    .select("*")
    .eq("discussion_id", discussionId)
    .eq("organization_id", organizationId)
    .eq("is_current", true)
    .maybeSingle();

  if (error) {
    console.error("Failed to load current executive version:", error);
    return null;
  }

  return data ? mapVersionRow(data) : null;
}

export async function getExecutiveVersionById(
  versionId: string,
  discussionId: string,
  organizationId: string,
): Promise<ExecutiveIntelligenceVersion | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_executive_intelligence_versions")
    .select("*")
    .eq("id", versionId)
    .eq("discussion_id", discussionId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("Failed to load executive version:", error);
    return null;
  }

  return data ? mapVersionRow(data) : null;
}

export async function getExecutiveVersionsForDiscussionPage(
  discussionId: string,
  organizationId: string,
): Promise<{
  versions: ExecutiveIntelligenceVersion[];
  current: ExecutiveIntelligenceVersion | null;
}> {
  // Lazy backfill for genuine Discussions only. Prospect/Persona page loads are
  // read-only — publication is owned exclusively by the generation worker.
  const discussion = await getDiscussionById(discussionId, organizationId);
  if (
    !isProspectIntelligenceBridge(discussion) &&
    !isPersonaIntelligenceBridge(discussion)
  ) {
    await ensureCurrentLiveIntelligenceIsVersioned(discussionId, organizationId);
  }

  const versions = await listExecutiveVersions(discussionId, organizationId);
  const liveIntelligence = await loadLiveExecutiveIntelligence(
    discussionId,
    organizationId,
  );

  const resolvedVersions = await Promise.all(
    versions.map(async (version) => {
      const blueprintById = version.blueprint_id
        ? await getAssetBlueprintById(version.blueprint_id, organizationId)
        : null;

      return withResolvedVersionIntelligence({
        version,
        blueprintById,
        // Live overlay is only consumed for is_current inside the resolver.
        liveIntelligence,
      });
    }),
  );

  const current =
    resolvedVersions.find((version) => version.is_current) ??
    resolvedVersions[0] ??
    null;

  return { versions: resolvedVersions, current };
}
