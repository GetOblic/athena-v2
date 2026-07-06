import { createClient } from "@/utils/supabase/server";

export type KnowledgeAssetInput = {
  title: string;
  category: string;
  asset_type: string;
  summary?: string | null;
  content: string;
  community_id?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  rating?: number | null;
  notes?: string | null;
  tags?: string[];
};

export async function createKnowledgeAsset(input: KnowledgeAssetInput) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("knowledge_assets")
    .insert({
      title: input.title,
      category: input.category,
      asset_type: input.asset_type,
      summary: input.summary ?? null,
      content: input.content,
      community_id: input.community_id ?? null,
      source_type: input.source_type ?? null,
      source_id: input.source_id ?? null,
      rating: input.rating ?? null,
      notes: input.notes ?? null,
      tags: input.tags ?? [],
      created_by: "Laurent",
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create knowledge asset: ${error.message}`);
  }

  return data;
}

export async function getKnowledgeAssets() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("knowledge_assets")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch knowledge assets: ${error.message}`);
  }

  return data ?? [];
}

export async function getKnowledgeAssetsByCommunity(communityId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("knowledge_assets")
    .select("*")
    .eq("community_id", communityId)
    .eq("status", "active")
    .order("rating", { ascending: false, nullsFirst: false })
    .order("times_used", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch community knowledge assets: ${error.message}`);
  }

  return data ?? [];
}
