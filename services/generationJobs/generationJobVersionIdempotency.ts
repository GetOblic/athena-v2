import {
  getExecutiveVersionById,
} from "@/services/executiveVersions/executiveVersionService";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { ExecutiveIntelligenceVersion } from "@/services/executiveVersions/executiveVersionTypes";

/**
 * Find an executive version already published for a regeneration run.
 * Used so a job retry after publish does not create a second version.
 */
export async function getExecutiveVersionByRegenerationRunId(
  discussionId: string,
  organizationId: string,
  regenerationRunId: string,
): Promise<ExecutiveIntelligenceVersion | null> {
  if (!regenerationRunId.trim()) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("athena_executive_intelligence_versions")
    .select("*")
    .eq("discussion_id", discussionId)
    .eq("organization_id", organizationId)
    .eq("regeneration_run_id", regenerationRunId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[ATHENA_JOB] Failed to load version by regeneration run:", {
      discussionId,
      regenerationRunId,
      error: error.message,
    });
    return null;
  }

  if (!data) {
    return null;
  }

  return getExecutiveVersionById(data.id, discussionId, organizationId);
}

export async function resolvePublishedVersionForJob(input: {
  discussionId: string;
  organizationId: string;
  regenerationRunId: string | null;
  publishedVersionId: string | null;
  executiveVersionId: string | null;
}): Promise<ExecutiveIntelligenceVersion | null> {
  if (input.publishedVersionId) {
    return getExecutiveVersionById(
      input.publishedVersionId,
      input.discussionId,
      input.organizationId,
    );
  }

  if (input.executiveVersionId) {
    return getExecutiveVersionById(
      input.executiveVersionId,
      input.discussionId,
      input.organizationId,
    );
  }

  if (input.regenerationRunId) {
    return getExecutiveVersionByRegenerationRunId(
      input.discussionId,
      input.organizationId,
      input.regenerationRunId,
    );
  }

  return null;
}
