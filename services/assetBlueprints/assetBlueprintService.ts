import { generateReview } from "@/services/aiService";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  ASSET_BLUEPRINT_PROMPT_VERSION,
  buildAssetBlueprintFromAnalysisPrompt,
  buildAssetBlueprintPrompt,
} from "@/services/assetBlueprints/prompts/assetBlueprintPrompt";
import { assembleStrategicBlueprintPrompt } from "@/services/brain/generationContractService";
import type { GenerationBundle } from "@/services/brain/generationContracts/generationContractTypes";
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
  asset_objective?: string;
  business_objective?: string;
  buyer_stage?: string;
  primary_pain_point?: string;
  core_message?: string;
  desired_transformation?: string;
  executive_rationale?: string;
  supporting_evidence?: string[];
  sophistication_level?: string;
  strategic_angle?: string;
  production_specs?: Record<string, unknown>;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => String(entry ?? "").trim())
    .filter(Boolean);
}

function normalizeParsedAssetBlueprint(
  parsed: Record<string, unknown>,
): ParsedAssetBlueprint {
  const assetObjective = String(
    parsed.asset_objective ?? parsed.core_message ?? "",
  );
  const businessObjective = String(
    parsed.business_objective ?? parsed.business_goal ?? "",
  );
  const executiveRationale = String(parsed.executive_rationale ?? "");
  const supportingEvidence = asStringArray(parsed.supporting_evidence);
  const sophisticationLevel = String(parsed.sophistication_level ?? "");
  const strategicAngle = String(parsed.strategic_angle ?? "");
  const buyerStage = String(parsed.buyer_stage ?? "");
  const primaryPainPoint = String(parsed.primary_pain_point ?? "");

  const businessGoal =
    String(parsed.business_goal ?? "").trim() ||
    [assetObjective, businessObjective].filter(Boolean).join("\n\n");

  const targetAudience =
    String(parsed.target_audience ?? "").trim() ||
    [buyerStage, sophisticationLevel].filter(Boolean).join(" — ");

  const notesParts = [
    executiveRationale ? `Executive rationale: ${executiveRationale}` : "",
    strategicAngle ? `Strategic angle: ${strategicAngle}` : "",
    primaryPainPoint ? `Primary pain point: ${primaryPainPoint}` : "",
    supportingEvidence.length
      ? `Supporting evidence: ${supportingEvidence.join("; ")}`
      : "",
    String(parsed.notes ?? ""),
  ].filter(Boolean);

  return {
    asset_title: String(parsed.asset_title ?? "Strategic Asset"),
    asset_type: String(parsed.asset_type ?? "pdf_guide"),
    business_goal: businessGoal,
    target_audience: targetAudience,
    priority: String(parsed.priority ?? "medium"),
    estimated_reuse: Math.max(1, Math.min(5, Number(parsed.estimated_reuse ?? 3))),
    image_prompt: String(parsed.image_prompt ?? ""),
    pdf_prompt: String(parsed.pdf_prompt ?? ""),
    social_prompt: String(parsed.social_prompt ?? ""),
    notes: notesParts.join("\n\n"),
    asset_objective: assetObjective || undefined,
    business_objective: businessObjective || undefined,
    buyer_stage: buyerStage || undefined,
    primary_pain_point: primaryPainPoint || undefined,
    core_message: String(parsed.core_message ?? "") || undefined,
    desired_transformation: String(parsed.desired_transformation ?? "") || undefined,
    executive_rationale: executiveRationale || undefined,
    supporting_evidence: supportingEvidence.length ? supportingEvidence : undefined,
    sophistication_level: sophisticationLevel || undefined,
    strategic_angle: strategicAngle || undefined,
    production_specs:
      parsed.production_specs && typeof parsed.production_specs === "object"
        ? (parsed.production_specs as Record<string, unknown>)
        : undefined,
  };
}

function parseJsonResponse(rawText: string): ParsedAssetBlueprint {
  const cleaned = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
  return normalizeParsedAssetBlueprint(parsed);
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

export function selectCanonicalBlueprint(
  blueprints: AthenaAssetBlueprint[],
): AthenaAssetBlueprint | null {
  return pickBestBlueprint(blueprints);
}

export async function getAssetBlueprintsByOpportunityId(
  opportunityId: string,
  organizationId: string,
): Promise<AthenaAssetBlueprint[]> {
  const { data, error } = await supabaseAdmin
    .from("athena_asset_blueprints")
    .select("*")
    .eq("opportunity_id", opportunityId)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching asset blueprints by opportunity:", error);
    return [];
  }

  return data ?? [];
}

async function updateAssetBlueprint(
  id: string,
  organizationId: string,
  input: {
    parsed: ParsedAssetBlueprint;
    rawBlueprint: string;
    source: string;
    opportunityId?: string | null;
    briefingId?: string | null;
  },
): Promise<AthenaAssetBlueprint | null> {
  const { data, error } = await supabaseAdmin
    .from("athena_asset_blueprints")
    .update({
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
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("organization_id", organizationId)
    .select("*")
    .single();

  if (error) {
    console.error("Error updating asset blueprint:", error);
    return null;
  }

  return data;
}

async function insertAssetBlueprint(input: {
  organizationId: string;
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
      organization_id: input.organizationId,
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

async function findExistingBlueprints(input: {
  organizationId: string;
  briefingId?: string | null;
  opportunityId?: string | null;
  discussionId: string;
}): Promise<AthenaAssetBlueprint[]> {
  const rows: AthenaAssetBlueprint[] = [];
  const seen = new Set<string>();

  const addRows = (nextRows: AthenaAssetBlueprint[]) => {
    for (const row of nextRows) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        rows.push(row);
      }
    }
  };

  if (input.briefingId) {
    addRows(
      await getAssetBlueprintsByBriefingId(
        input.briefingId,
        input.organizationId,
      ),
    );
  }

  if (input.opportunityId) {
    addRows(
      await getAssetBlueprintsByOpportunityId(
        input.opportunityId,
        input.organizationId,
      ),
    );
  }

  addRows(
    await getAssetBlueprintsByDiscussionId(
      input.discussionId,
      input.organizationId,
    ),
  );

  return rows;
}

async function upsertAssetBlueprint(input: {
  organizationId: string;
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
      `Skipping asset blueprint save for discussion ${input.discussionId}: no prompts generated`,
    );
    return null;
  }

  const existingRows = await findExistingBlueprints({
    organizationId: input.organizationId,
    briefingId: input.briefingId,
    opportunityId: input.opportunityId,
    discussionId: input.discussionId,
  });
  const existing = selectCanonicalBlueprint(existingRows);

  if (existing) {
    return updateAssetBlueprint(existing.id, input.organizationId, {
      parsed: input.parsed,
      rawBlueprint: input.rawBlueprint,
      source: input.source,
      opportunityId: input.opportunityId,
      briefingId: input.briefingId,
    });
  }

  return insertAssetBlueprint(input);
}

export async function getCanonicalBlueprintCount(
  organizationId: string,
): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("athena_asset_blueprints")
    .select("id, briefing_id, opportunity_id, discussion_id, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error counting canonical blueprints:", error);
    return 0;
  }

  const seen = new Set<string>();

  for (const blueprint of data ?? []) {
    const key =
      blueprint.briefing_id ??
      blueprint.opportunity_id ??
      (blueprint.discussion_id
        ? `discussion:${blueprint.discussion_id}`
        : blueprint.id);
    seen.add(key);
  }

  return seen.size;
}

const LEGACY_PRODUCTION_SPECS_PROMPT =
  "Legacy fallback mode: produce production-ready asset specifications using available business context only.";

export async function createAssetBlueprintForBriefing(input: {
  discussion: Discussion;
  opportunity: Opportunity;
  briefing: AthenaReview;
  brainContextPrompt?: string;
  generationBundle?: GenerationBundle;
}): Promise<AthenaAssetBlueprint | null> {
  const prompt = input.generationBundle
    ? assembleStrategicBlueprintPrompt({
        bundle: input.generationBundle,
        discussion: input.discussion as unknown as Record<string, unknown>,
        opportunity: input.opportunity as unknown as Record<string, unknown>,
        briefing: input.briefing as unknown as Record<string, unknown>,
      })
    : buildAssetBlueprintPrompt({
        executiveContextPrompt: input.brainContextPrompt ?? "",
        productionSpecsPrompt: LEGACY_PRODUCTION_SPECS_PROMPT,
        discussion: input.discussion as unknown as Record<string, unknown>,
        opportunity: input.opportunity as unknown as Record<string, unknown>,
        briefing: input.briefing as unknown as Record<string, unknown>,
      });

  const rawBlueprint = await generateReview(prompt);
  const parsed = parseJsonResponse(rawBlueprint);

  return upsertAssetBlueprint({
    organizationId: input.discussion.organization_id ?? "",
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
  brainContextPrompt?: string;
  generationBundle?: GenerationBundle;
}): Promise<AthenaAssetBlueprint | null> {
  const prompt = input.generationBundle
    ? assembleStrategicBlueprintPrompt({
        bundle: input.generationBundle,
        discussion: input.discussion as unknown as Record<string, unknown>,
        analysis: input.analysis as unknown as Record<string, unknown>,
      })
    : buildAssetBlueprintFromAnalysisPrompt({
        executiveContextPrompt: input.brainContextPrompt ?? "",
        productionSpecsPrompt: LEGACY_PRODUCTION_SPECS_PROMPT,
        discussion: input.discussion as unknown as Record<string, unknown>,
        analysis: input.analysis as unknown as Record<string, unknown>,
      });

  const rawBlueprint = await generateReview(prompt);
  const parsed = parseJsonResponse(rawBlueprint);

  return upsertAssetBlueprint({
    organizationId: input.discussion.organization_id ?? "",
    userId: input.discussion.user_id ?? null,
    discussionId: input.discussion.id,
    parsed,
    rawBlueprint,
    source: "discussion_analysis",
  });
}

export async function getAssetBlueprintsByBriefingId(
  briefingId: string,
  organizationId: string,
): Promise<AthenaAssetBlueprint[]> {
  const { data, error } = await supabaseAdmin
    .from("athena_asset_blueprints")
    .select("*")
    .eq("briefing_id", briefingId)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching asset blueprints:", error);
    return [];
  }

  return data ?? [];
}

export async function getAssetBlueprintsByDiscussionId(
  discussionId: string,
  organizationId: string,
): Promise<AthenaAssetBlueprint[]> {
  const { data, error } = await supabaseAdmin
    .from("athena_asset_blueprints")
    .select("*")
    .eq("discussion_id", discussionId)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching asset blueprints by discussion:", error);
    return [];
  }

  return data ?? [];
}

export async function getLatestAssetBlueprintByBriefingId(
  briefingId: string,
  organizationId: string,
): Promise<AthenaAssetBlueprint | null> {
  const blueprints = await getAssetBlueprintsByBriefingId(
    briefingId,
    organizationId,
  );
  return blueprints[0] ?? null;
}

export async function getDisplayAssetBlueprintByBriefingId(
  briefingId: string,
  organizationId: string,
): Promise<AthenaAssetBlueprint | null> {
  const blueprints = await getAssetBlueprintsByBriefingId(
    briefingId,
    organizationId,
  );
  return pickBestBlueprint(blueprints);
}

export async function getLatestAssetBlueprintByDiscussionId(
  discussionId: string,
  organizationId: string,
): Promise<AthenaAssetBlueprint | null> {
  const blueprints = await getAssetBlueprintsByDiscussionId(
    discussionId,
    organizationId,
  );
  return blueprints[0] ?? null;
}

export async function getDisplayAssetBlueprintByDiscussionId(
  discussionId: string,
  organizationId: string,
): Promise<AthenaAssetBlueprint | null> {
  const blueprints = await getAssetBlueprintsByDiscussionId(
    discussionId,
    organizationId,
  );
  return pickBestBlueprint(blueprints);
}

export async function getDisplayAssetBlueprintForBriefing(input: {
  briefingId: string;
  organizationId: string;
  discussionId?: string | null;
}): Promise<AthenaAssetBlueprint | null> {
  const byBriefing = await getDisplayAssetBlueprintByBriefingId(
    input.briefingId,
    input.organizationId,
  );

  if (byBriefing) {
    return byBriefing;
  }

  if (input.discussionId) {
    return getDisplayAssetBlueprintByDiscussionId(
      input.discussionId,
      input.organizationId,
    );
  }

  return null;
}
