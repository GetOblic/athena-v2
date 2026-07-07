import { generateReview } from "@/services/aiService";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  ASSET_BLUEPRINT_PROMPT_VERSION,
  buildAssetBlueprintPrompt,
} from "@/services/assetBlueprints/prompts/assetBlueprintPrompt";
import type { Discussion } from "@/services/discussionService";
import type { Opportunity } from "@/services/opportunityService";
import type { AthenaReview } from "@/services/reviewService";

export type AthenaAssetBlueprint = {
  id: string;
  user_id: string | null;
  discussion_id: string | null;
  opportunity_id: string | null;
  briefing_id: string | null;
  asset_title: string;
  asset_type: string;
  business_goal: string | null;
  target_audience: string | null;
  priority: string | null;
  estimated_reuse: number | null;
  image_prompt: string | null;
  pdf_prompt: string | null;
  social_prompt: string | null;
  notes: string | null;
  status: string;
  raw_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type ParsedAssetBlueprint = {
  asset_title: string;
  asset_type: string;
  business_goal: string;
  target_audience: string;
  priority: string;
  estimated_reuse: number;
  image_prompt: string;
  pdf_prompt: string;
  social_prompt: string;
  notes: string;
};

function parseJsonResponse(rawText: string): ParsedAssetBlueprint {
  const cleaned = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned);

  return {
    asset_title: String(parsed.asset_title ?? "Strategic Asset"),
    asset_type: String(parsed.asset_type ?? "pdf_guide"),
    business_goal: String(parsed.business_goal ?? ""),
    target_audience: String(parsed.target_audience ?? ""),
    priority: String(parsed.priority ?? "medium"),
    estimated_reuse: Math.max(1, Math.min(5, Number(parsed.estimated_reuse ?? 3))),
    image_prompt: String(parsed.image_prompt ?? ""),
    pdf_prompt: String(parsed.pdf_prompt ?? ""),
    social_prompt: String(parsed.social_prompt ?? ""),
    notes: String(parsed.notes ?? ""),
  };
}

export async function createAssetBlueprintForBriefing(input: {
  discussion: Discussion;
  opportunity: Opportunity;
  briefing: AthenaReview;
  brainContextPrompt: string;
}): Promise<AthenaAssetBlueprint | null> {
  const prompt = buildAssetBlueprintPrompt({
    brainContextPrompt: input.brainContextPrompt,
    discussion: input.discussion as unknown as Record<string, unknown>,
    opportunity: input.opportunity as unknown as Record<string, unknown>,
    briefing: input.briefing as unknown as Record<string, unknown>,
  });

  const rawBlueprint = await generateReview(prompt);
  const parsed = parseJsonResponse(rawBlueprint);

  const { data, error } = await supabaseAdmin
    .from("athena_asset_blueprints")
    .insert({
      user_id: input.discussion.user_id ?? null,
      discussion_id: input.discussion.id,
      opportunity_id: input.opportunity.id,
      briefing_id: input.briefing.id,

      asset_title: parsed.asset_title,
      asset_type: parsed.asset_type,
      business_goal: parsed.business_goal,
      target_audience: parsed.target_audience,
      priority: parsed.priority,
      estimated_reuse: parsed.estimated_reuse,
      image_prompt: parsed.image_prompt,
      pdf_prompt: parsed.pdf_prompt,
      social_prompt: parsed.social_prompt,
      notes: parsed.notes,

      status: "ready",

      raw_json: {
        prompt_version: ASSET_BLUEPRINT_PROMPT_VERSION,
        parsed,
        raw_ai_response: rawBlueprint,
      },
    })
    .select("*")
    .single();

  if (error) {
    console.error("Error creating asset blueprint:", error);
    return null;
  }

  return data;
}

export async function getAssetBlueprintsByBriefingId(
  briefingId: string,
): Promise<AthenaAssetBlueprint[]> {
  const { data, error } = await supabaseAdmin
    .from("athena_asset_blueprints")
    .select("*")
    .eq("briefing_id", briefingId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching asset blueprints:", error);
    return [];
  }

  return data ?? [];
}
