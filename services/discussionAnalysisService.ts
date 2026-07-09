import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logRegenerationDiagnostic } from "@/lib/regenerationDiagnostics";
import { getDiscussionIdsByCommunityId } from "@/services/discussionService";

export type DiscussionAnalysis = {
  id: string;

  created_at: string;
  updated_at: string;

  discussion_id: string;
  organization_id?: string | null;
  user_id: string | null;
  community_id: string | null;

  status: string;

  summary: string | null;
  sentiment: string | null;
  intent: string | null;
  buyer_stage: string | null;
  pain_points: string | null;

  opportunity_detected: boolean;
  opportunity_title: string | null;
  opportunity_reason: string | null;

  recommended_action: string | null;
  suggested_cta: string | null;

  risk_level: string | null;

  confidence: number;

  strategy_key: string;

  strategy_prompt_version: string | null;
  analysis_prompt_version: string | null;

  model: string | null;
  generation_time_ms: number | null;

  raw_json: Record<string, unknown> | null;
};

export async function getLatestDiscussionAnalysis(
  discussionId: string,
  organizationId: string,
): Promise<DiscussionAnalysis | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_discussion_analysis")
    .select("*")
    .eq("discussion_id", discussionId)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(error);
    return null;
  }

  return data;
}

export async function createDiscussionAnalysis(
  analysis: Partial<DiscussionAnalysis>,
): Promise<DiscussionAnalysis> {
  const { data, error } = await supabaseAdmin
    .from("athena_discussion_analysis")
    .insert(analysis)
    .select()
    .single();

  if (error) {
    throw error;
  }

  logRegenerationDiagnostic("ANALYSIS_ROW_INSERTED", {
    analysisId: data.id,
    discussionId: data.discussion_id,
    organizationId: data.organization_id,
    createdAt: data.created_at,
    analysisPromptVersion: data.analysis_prompt_version,
    model: data.model,
    hasSuggestedCta: Boolean(data.suggested_cta?.trim()),
  });

  return data;
}

export async function getRecentDiscussionAnalysesByCommunityId(
  communityId: string,
  organizationId: string,
  limit = 100,
): Promise<DiscussionAnalysis[]> {
  const discussionIds = await getDiscussionIdsByCommunityId(
    communityId,
    organizationId,
  );

  if (discussionIds.length === 0) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from("athena_discussion_analysis")
    .select("*")
    .in("discussion_id", discussionIds)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error(error);
    return [];
  }

  return data ?? [];
}

export async function getAnalyzedDiscussionIds(
  organizationId: string,
): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from("athena_discussion_analysis")
    .select("discussion_id")
    .eq("organization_id", organizationId);

  if (error) {
    console.error("Error fetching analyzed discussion ids:", error);
    return new Set();
  }

  return new Set((data ?? []).map((row) => row.discussion_id));
}
