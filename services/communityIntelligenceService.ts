import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type CommunityIntelligence = {
  id: string;
  community_id: string | null;

  created_at: string;
  updated_at: string;

  status: string;

  executive_summary: string | null;
  market_trends: string | null;
  recurring_pain_points: string | null;
  recurring_objections: string | null;
  recurring_questions: string | null;
  buyer_stage_distribution: string | null;
  high_value_opportunities: string | null;
  recommended_campaigns: string | null;
  recommended_content: string | null;
  recommended_lead_magnets: string | null;
  recommended_webinars: string | null;
  strategic_recommendations: string | null;

  confidence: number | null;

  strategy_prompt_version: string | null;
  analysis_prompt_version: string | null;
  model: string | null;
  generation_time_ms: number | null;

  raw_json: Record<string, unknown> | null;
};

export async function getLatestCommunityIntelligenceByCommunityId(
  communityId: string,
): Promise<CommunityIntelligence | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_community_intelligence")
    .select("*")
    .eq("community_id", communityId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(error);
    return null;
  }

  return data;
}

export async function createCommunityIntelligence(
  input: Partial<CommunityIntelligence>,
): Promise<CommunityIntelligence | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_community_intelligence")
    .insert(input)
    .select("*")
    .single();

  if (error) {
    console.error(error);
    return null;
  }

  return data;
}
