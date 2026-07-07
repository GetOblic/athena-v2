import { generateReview } from "@/services/aiService";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  ASSET_BLUEPRINT_PROMPT_VERSION,
  buildAssetBlueprintFromAnalysisPrompt,
  buildAssetBlueprintPrompt,
} from "@/services/assetBlueprints/prompts/assetBlueprintPrompt";
import type { DiscussionAnalysis } from "@/services/discussionAnalysisService";
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

export function blueprintHasPrompts(
  blueprint: Pick<
    AthenaAssetBlueprint,
    "image_prompt" | "pdf_prompt" | "social_prompt" | "notes"
  >,
): boolean {
  return Boolean(
    blueprint.image_prompt?.trim() ||
      blueprint.pdf_prompt?.trim() ||
      blueprint.social_prompt?.trim() ||
      blueprint.notes?.trim(),
  );
}

function pickBestBlueprint(
  blueprints: AthenaAssetBlueprint[],
): AthenaAssetBlueprint | null {
  if (blueprints.length === 0) {
    return null;
  }

  return blueprints.find(blueprintHasPrompts) ?? blueprints[0];
}

async function insertAssetBlueprint(input: {
  userId: string | null;
  discussionId: string;
  opportunityId?: string | null;
  briefingId?: string | null;
  parsed: ParsedAssetBlueprint;
  rawBlueprint: string;
  source: string;
}): Promise<AthenaAssetBlueprint | null> {
  if (!blueprintHasPrompts(input.parsed)) {
    console.warn(
      `Skipping asset blueprint insert for discussion ${input.discussionId}: no prompts generated`,
    );
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("athena_asset_blueprints")
    .insert({
      user_id: input.userId,
      discussion_id: input.discussionId,
      opportunity_id: input.opportunityId ?? null,
      briefing_id: input.briefingId ?? null,
      asset_title: input.parsed.asset_title,
      asset_type: input.parsed.asset_type,
      business_goal: input.parsed.business_goal,
      target_audience: input.parsed.target_audience,
      priority: input.parsed.priority,
      estimated_reuse: input.parsed.estimated_reuse,
      image_prompt: input.parsed.image_prompt,
      pdf_prompt: input.parsed.pdf_prompt,
      social_prompt: input.parsed.social_prompt,
      notes: input.parsed.notes,
      status: "ready",
      raw_json: {
        prompt_version: ASSET_BLUEPRINT_PROMPT_VERSION,
        source: input.source,
        parsed: input.parsed,
        raw_ai_response: input.rawBlueprint,
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

  return insertAssetBlueprint({
    userId: input.discussion.user_id ?? null,
    discussionId: input.discussion.id,
    opportunityId: input.opportunity.id,
    briefingId: input.briefing.id,
    parsed,
    rawBlueprint,
    source: "briefing",
  });
}

export async function createAssetBlueprintForDiscussionAnalysis(input: {
  discussion: Discussion;
  analysis: DiscussionAnalysis;
  brainContextPrompt: string;
}): Promise<AthenaAssetBlueprint | null> {
  const prompt = buildAssetBlueprintFromAnalysisPrompt({
    brainContextPrompt: input.brainContextPrompt,
    discussion: input.discussion as unknown as Record<string, unknown>,
    analysis: input.analysis as unknown as Record<string, unknown>,
  });

  const rawBlueprint = await generateReview(prompt);
  const parsed = parseJsonResponse(rawBlueprint);

  return insertAssetBlueprint({
    userId: input.discussion.user_id ?? null,
    discussionId: input.discussion.id,
    parsed,
    rawBlueprint,
    source: "discussion_analysis",
  });
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

export async function getAssetBlueprintsByDiscussionId(
  discussionId: string,
): Promise<AthenaAssetBlueprint[]> {
  const { data, error } = await supabaseAdmin
    .from("athena_asset_blueprints")
    .select("*")
    .eq("discussion_id", discussionId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching asset blueprints by discussion:", error);
    return [];
  }

  return data ?? [];
}

export async function getLatestAssetBlueprintByBriefingId(
  briefingId: string,
): Promise<AthenaAssetBlueprint | null> {
  const blueprints = await getAssetBlueprintsByBriefingId(briefingId);
  return blueprints[0] ?? null;
}

export async function getDisplayAssetBlueprintByBriefingId(
  briefingId: string,
): Promise<AthenaAssetBlueprint | null> {
  const blueprints = await getAssetBlueprintsByBriefingId(briefingId);
  return pickBestBlueprint(blueprints);
}

export async function getLatestAssetBlueprintByDiscussionId(
  discussionId: string,
): Promise<AthenaAssetBlueprint | null> {
  const blueprints = await getAssetBlueprintsByDiscussionId(discussionId);
  return blueprints[0] ?? null;
}

export async function getDisplayAssetBlueprintByDiscussionId(
  discussionId: string,
): Promise<AthenaAssetBlueprint | null> {
  const blueprints = await getAssetBlueprintsByDiscussionId(discussionId);
  return pickBestBlueprint(blueprints);
}

export async function getDisplayAssetBlueprintForBriefing(input: {
  briefingId: string;
  discussionId?: string | null;
}): Promise<AthenaAssetBlueprint | null> {
  const byBriefing = await getDisplayAssetBlueprintByBriefingId(input.briefingId);

  if (byBriefing) {
    return byBriefing;
  }

  if (input.discussionId) {
    return getDisplayAssetBlueprintByDiscussionId(input.discussionId);
  }

  return null;
}
