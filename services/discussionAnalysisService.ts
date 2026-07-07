import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type DiscussionAnalysis = {
  id: string;

  created_at: string;
  updated_at: string;

  discussion_id: string;
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
): Promise<DiscussionAnalysis | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_discussion_analysis")
    .select("*")
    .eq("discussion_id", discussionId)
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

  return data;
}

export async function getRecentDiscussionAnalysesByCommunityId(
  communityId: string,
  limit = 100,
): Promise<DiscussionAnalysis[]> {
  const { data, error } = await supabaseAdmin
    .from("athena_discussion_analysis")
    .select("*")
    .eq("community_id", communityId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error(error);
    return [];
  }

  return data ?? [];
}
