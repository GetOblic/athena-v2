import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type ProductionIntelligence = {
  id: string;
  organization_id: string | null;
  community_id: string | null;
  source_intelligence_id: string | null;

  created_at: string;
  updated_at: string;

  status: string;

  content_theme: string | null;
  target_audience: string | null;
  buyer_stage: string | null;
  core_pain_point: string | null;
  strategic_reason: string | null;

  recommended_assets: Record<string, unknown> | null;

  priority: number | null;
  confidence: number | null;

  strategy_prompt_version: string | null;
  content_prompt_version: string | null;
  model: string | null;
  generation_time_ms: number | null;

  raw_json: Record<string, unknown> | null;
};

export async function getLatestProductionIntelligenceByCommunityId(
  communityId: string,
  organizationId: string,
): Promise<ProductionIntelligence | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_production_intelligence")
    .select("*")
    .eq("community_id", communityId)
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

export async function createProductionIntelligence(
  input: Partial<ProductionIntelligence> & { organization_id: string },
): Promise<ProductionIntelligence | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_production_intelligence")
    .insert(input)
    .select("*")
    .single();

  if (error) {
    console.error(error);
    return null;
  }

  return data;
}
