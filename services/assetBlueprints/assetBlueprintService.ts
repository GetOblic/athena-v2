import { generateReview } from "@/services/aiService";
import {
  appendBlueprintDebugMarker,
  hasBlueprintDebugMarker,
  logRegenerationDiagnostic,
  RegenerationBlueprintError,
} from "@/lib/regenerationDiagnostics";
import {
  ATHENA_DEFAULT_LLM_TEMPERATURE,
  ATHENA_REVIEW_SYSTEM_PROMPT,
  isAthenaDebugPromptsEnabled,
  logAthenaPromptDebug,
} from "@/lib/athenaDebugPrompts";
import {
  normalizeStrategicBlueprintArtifact,
  strategicBlueprintReviewText,
  validateStrategicBlueprintArtifact,
  type StrategicBlueprintArtifact,
} from "@/services/assetBlueprints/strategicBlueprintArtifactContract";
import { runSimplifiedQualityGateLoop, validateArtifactOutput } from "@/services/brain/reasoningPipeline/simplifiedQualityGate";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  ASSET_BLUEPRINT_PROMPT_VERSION,
  buildAssetBlueprintFromAnalysisPrompt,
  buildAssetBlueprintPrompt,
  getAssetBlueprintOutputSchemaForDebug,
} from "@/services/assetBlueprints/prompts/assetBlueprintPrompt";
import { assembleStrategicBlueprintPrompt } from "@/services/brain/generationContractService";
import type { GenerationBundle } from "@/services/brain/generationContracts/generationContractTypes";
import type { ExecutiveMarketingStrategy } from "@/services/brain/executiveCoherence/executiveCoherenceTypes";
import { applyMarketingStrategyRefresh } from "@/services/brain/executiveCoherence/executiveMarketingStrategyBuilder";
import type { DiscussionAnalysis } from "@/services/discussionAnalysisService";
import type { Discussion } from "@/services/discussionService";
import type { Opportunity } from "@/services/opportunityService";
import type { AthenaReview } from "@/services/reviewService";

export type { StrategicBlueprintArtifact } from "@/services/assetBlueprints/strategicBlueprintArtifactContract";

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

type ParsedAssetBlueprint = StrategicBlueprintArtifact;

function normalizeParsedAssetBlueprint(
  parsed: Record<string, unknown>,
): ParsedAssetBlueprint {
  return normalizeStrategicBlueprintArtifact(parsed);
}

function extractStoredMarketingStrategy(
  rawJson: Record<string, unknown> | null,
): ExecutiveMarketingStrategy | null {
  const stored = rawJson?.executive_marketing_strategy;
  if (!stored || typeof stored !== "object") {
    return null;
  }

  return stored as ExecutiveMarketingStrategy;
}

function applyBlueprintRefreshToBundle(
  bundle: GenerationBundle,
  previousMarketingStrategy: ExecutiveMarketingStrategy,
): GenerationBundle {
  const refreshedMarketingStrategy = applyMarketingStrategyRefresh({
    candidate: bundle.executiveStrategy.marketingStrategy,
    previous: previousMarketingStrategy,
    understanding: bundle.executiveUnderstanding,
  });

  return {
    ...bundle,
    executiveStrategy: {
      ...bundle.executiveStrategy,
      marketingStrategy: refreshedMarketingStrategy,
    },
  };
}

async function resolveBlueprintGenerationBundle(input: {
  generationBundle?: GenerationBundle;
  organizationId: string;
  discussionId: string;
  opportunityId?: string | null;
  briefingId?: string | null;
}): Promise<GenerationBundle | undefined> {
  if (!input.generationBundle) {
    return undefined;
  }

  const existingRows = await findExistingBlueprints({
    organizationId: input.organizationId,
    briefingId: input.briefingId,
    opportunityId: input.opportunityId,
    discussionId: input.discussionId,
  });
  const existing = selectCanonicalBlueprint(existingRows);
  const previousMarketingStrategy = extractStoredMarketingStrategy(
    existing?.raw_json ?? null,
  );

  if (!previousMarketingStrategy) {
    return input.generationBundle;
  }

  return applyBlueprintRefreshToBundle(
    input.generationBundle,
    previousMarketingStrategy,
  );
}

function parseJsonResponse(rawText: string): ParsedAssetBlueprint {
  const cleaned = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    return normalizeParsedAssetBlueprint(parsed);
  } catch (error) {
    console.error("Blueprint JSON parse failed:", error);
    return normalizeParsedAssetBlueprint({
      asset_title: "Strategic Asset",
      notes: cleaned.slice(0, 2000),
    });
  }
}

async function findPreservedBlueprint(input: {
  organizationId: string;
  briefingId?: string | null;
  opportunityId?: string | null;
  discussionId: string;
}): Promise<AthenaAssetBlueprint | null> {
  const existingRows = await findExistingBlueprints(input);
  const existing = selectCanonicalBlueprint(existingRows);
  if (existing && blueprintHasPrompts(existing)) {
    return existing;
  }
  return null;
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

function blueprintRecencyMs(blueprint: AthenaAssetBlueprint): number {
  const updated = Date.parse(blueprint.updated_at ?? "");
  const created = Date.parse(blueprint.created_at ?? "");
  return Math.max(
    Number.isNaN(updated) ? 0 : updated,
    Number.isNaN(created) ? 0 : created,
  );
}

function sortBlueprintsByRecency(
  blueprints: AthenaAssetBlueprint[],
): AthenaAssetBlueprint[] {
  return [...blueprints].sort(
    (left, right) => blueprintRecencyMs(right) - blueprintRecencyMs(left),
  );
}

function pickBestBlueprint(
  blueprints: AthenaAssetBlueprint[],
): AthenaAssetBlueprint | null {
  if (blueprints.length === 0) {
    return null;
  }

  const sorted = sortBlueprintsByRecency(blueprints);
  return sorted.find(blueprintHasPrompts) ?? sorted[0];
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
    executiveMarketingStrategy?: ExecutiveMarketingStrategy | null;
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
        executive_marketing_strategy: input.executiveMarketingStrategy ?? null,
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
  executiveMarketingStrategy?: ExecutiveMarketingStrategy | null;
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
        executive_marketing_strategy: input.executiveMarketingStrategy ?? null,
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
  executiveMarketingStrategy?: ExecutiveMarketingStrategy | null;
}): Promise<AthenaAssetBlueprint | null> {
  const parsedWithDebugMarker: ParsedAssetBlueprint = {
    ...input.parsed,
    notes: appendBlueprintDebugMarker(input.parsed.notes),
  };

  if (!blueprintHasPrompts(parsedWithDebugMarker)) {
    console.warn(
      `Skipping asset blueprint save for discussion ${input.discussionId}: no prompts generated`,
    );
    logRegenerationDiagnostic("BLUEPRINT_SAVE_SKIPPED", {
      discussionId: input.discussionId,
      reason: "no_prompts_generated",
      assetTitle: parsedWithDebugMarker.asset_title,
    });
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
    const updated = await updateAssetBlueprint(existing.id, input.organizationId, {
      parsed: parsedWithDebugMarker,
      rawBlueprint: input.rawBlueprint,
      source: input.source,
      opportunityId: input.opportunityId,
      briefingId: input.briefingId,
      executiveMarketingStrategy: input.executiveMarketingStrategy,
    });

    logRegenerationDiagnostic("BLUEPRINT_ROW_UPDATED", {
      blueprintId: updated?.id ?? existing.id,
      discussionId: input.discussionId,
      previousBlueprintId: existing.id,
      operation: "update",
      assetTitle: parsedWithDebugMarker.asset_title,
      createdAt: updated?.created_at ?? existing.created_at,
      updatedAt: updated?.updated_at ?? null,
      hasDebugMarker: hasBlueprintDebugMarker(updated?.notes),
      fallbackUsed: false,
    });

    return updated;
  }

  const inserted = await insertAssetBlueprint({
    ...input,
    parsed: parsedWithDebugMarker,
  });

  logRegenerationDiagnostic("BLUEPRINT_ROW_INSERTED", {
    blueprintId: inserted?.id ?? null,
    discussionId: input.discussionId,
    operation: "insert",
    assetTitle: parsedWithDebugMarker.asset_title,
    createdAt: inserted?.created_at ?? null,
    hasDebugMarker: hasBlueprintDebugMarker(inserted?.notes),
    fallbackUsed: false,
  });

  return inserted;
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


function blueprintReviewText(parsed: ParsedAssetBlueprint): string {
  return strategicBlueprintReviewText(parsed);
}

function enrichBlueprintFromDecision(
  parsed: ParsedAssetBlueprint,
  bundle: GenerationBundle,
): ParsedAssetBlueprint {
  const decision = bundle.reasoningPipeline.decision;
  const notesParts = [
    parsed.notes,
    decision.whyThisAsset ? `Why this asset: ${decision.whyThisAsset}` : "",
    decision.rationale ? `Evidence basis: ${decision.rationale}` : "",
  ].filter(Boolean);

  return {
    ...parsed,
    asset_type: parsed.asset_type || decision.recommendedAssetType,
    business_goal: parsed.business_goal || decision.intendedOutcome,
    target_audience: parsed.target_audience || decision.targetAudience,
    notes: notesParts.join("\n\n"),
    executive_rationale: parsed.executive_rationale || decision.whyThisBeatsAlternatives,
  };
}

function blueprintGenerationContractForDebug(
  bundle?: GenerationBundle,
): Record<string, unknown> | undefined {
  if (!bundle?.generationContract) {
    return undefined;
  }

  return bundle.generationContract as unknown as Record<string, unknown>;
}

async function generateBlueprintReview(input: {
  stage: string;
  userPrompt: string;
  generationBundle?: GenerationBundle;
}): Promise<string> {
  logRegenerationDiagnostic("BLUEPRINT_LLM_CALL_START", {
    stage: input.stage,
    promptSource:
      "services/brain/generationContracts/generationPromptAssembly.ts::assembleStrategicBlueprintPrompt → services/assetBlueprints/prompts/assetBlueprintPrompt.ts",
    model: process.env.OPENROUTER_MODEL ?? "(OPENROUTER_MODEL not set)",
  });

  if (isAthenaDebugPromptsEnabled()) {
    logAthenaPromptDebug({
      stage: input.stage,
      temperature: ATHENA_DEFAULT_LLM_TEMPERATURE,
      max_tokens: null,
      systemPrompt: ATHENA_REVIEW_SYSTEM_PROMPT,
      userPrompt: input.userPrompt,
      outputSchema: getAssetBlueprintOutputSchemaForDebug(),
      jsonContract: blueprintGenerationContractForDebug(input.generationBundle),
    });
  }

  const content = await generateReview(input.userPrompt, {
    stage: input.stage,
    promptSource:
      "services/assetBlueprints/prompts/assetBlueprintPrompt.ts via assembleStrategicBlueprintPrompt",
  });

  logRegenerationDiagnostic("BLUEPRINT_LLM_CALL_COMPLETED", {
    stage: input.stage,
    responseCharCount: content.length,
  });

  return content;
}

async function generateBlueprintWithQualityGate(input: {
  stagePrefix: string;
  effectiveBundle: GenerationBundle;
  buildPrompt: (refinementSuffix: string) => string;
}): Promise<{ parsed: ParsedAssetBlueprint; rawBlueprint: string }> {
  let attempt = 0;

  const gated = await runSimplifiedQualityGateLoop({
    generate: async (refinementSuffix) => {
      attempt += 1;
      const prompt = input.buildPrompt(refinementSuffix);
      return generateBlueprintReview({
        stage: `${input.stagePrefix}.quality_gate.attempt_${attempt}`,
        userPrompt: prompt,
        generationBundle: input.effectiveBundle,
      });
    },
    parse: parseJsonResponse,
    validate: (parsed, text) => {
      const validation = validateStrategicBlueprintArtifact(
        parsed as unknown as Record<string, unknown>,
      );
      if (!validation.valid) {
        return validation;
      }
      return validateArtifactOutput({
        text,
        businessDecision: input.effectiveBundle.reasoningPipeline.decision,
      });
    },
    toReviewText: blueprintReviewText,
  });

  return {
    parsed: enrichBlueprintFromDecision(gated.parsed, input.effectiveBundle),
    rawBlueprint: gated.raw,
  };
}

async function runBlueprintFallbackGeneration(input: {
  stage: string;
  discussionId: string;
  path: "briefing" | "analysis";
  effectiveBundle: GenerationBundle;
  buildPrompt: () => string;
}): Promise<{ parsed: ParsedAssetBlueprint; rawBlueprint: string }> {
  logRegenerationDiagnostic("BLUEPRINT_LLM_FALLBACK_STARTED", {
    discussionId: input.discussionId,
    path: input.path,
    stage: input.stage,
  });

  try {
    const prompt = input.buildPrompt();
    const rawBlueprint = await generateBlueprintReview({
      stage: input.stage,
      userPrompt: prompt,
      generationBundle: input.effectiveBundle,
    });
    const parsed = parseJsonResponse(rawBlueprint);

    logRegenerationDiagnostic("BLUEPRINT_LLM_FALLBACK_COMPLETED", {
      discussionId: input.discussionId,
      path: input.path,
      assetTitle: parsed.asset_title,
    });

    return { parsed, rawBlueprint };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Blueprint fallback generation failed";
    throw new RegenerationBlueprintError(message);
  }
}

async function saveRegeneratedBlueprint(input: {
  organizationId: string;
  userId: string | null;
  discussionId: string;
  opportunityId?: string | null;
  briefingId?: string | null;
  parsed: ParsedAssetBlueprint;
  rawBlueprint: string;
  source: string;
  executiveMarketingStrategy?: ExecutiveMarketingStrategy | null;
}): Promise<AthenaAssetBlueprint> {
  const saved = await upsertAssetBlueprint(input);

  if (!saved) {
    throw new RegenerationBlueprintError(
      "Strategic blueprint save failed: generated output had no executable prompts.",
    );
  }

  if (!hasBlueprintDebugMarker(saved.notes)) {
    throw new RegenerationBlueprintError(
      "Strategic blueprint save failed: debug marker missing from regenerated notes.",
      saved.id,
    );
  }

  return saved;
}

export async function createAssetBlueprintForBriefing(input: {
  discussion: Discussion;
  opportunity: Opportunity;
  briefing: AthenaReview;
  brainContextPrompt?: string;
  generationBundle?: GenerationBundle;
}): Promise<AthenaAssetBlueprint> {
  const organizationId = input.discussion.organization_id ?? "";
  const effectiveBundle = await resolveBlueprintGenerationBundle({
    generationBundle: input.generationBundle,
    organizationId,
    discussionId: input.discussion.id,
    opportunityId: input.opportunity.id,
    briefingId: input.briefing.id,
  });

  let parsed: ParsedAssetBlueprint;
  let rawBlueprint: string;

  if (effectiveBundle) {
    try {
      const gated = await generateBlueprintWithQualityGate({
        stagePrefix: "strategic_blueprint.briefing",
        effectiveBundle,
        buildPrompt: (refinementSuffix) =>
          assembleStrategicBlueprintPrompt({
            bundle: effectiveBundle,
            discussion: input.discussion as unknown as Record<string, unknown>,
            opportunity: input.opportunity as unknown as Record<string, unknown>,
            briefing: input.briefing as unknown as Record<string, unknown>,
            qualityRefinementSuffix: refinementSuffix,
          }),
      });
      parsed = gated.parsed;
      rawBlueprint = gated.rawBlueprint;
    } catch (error) {
      console.error("Blueprint generation with quality gate failed:", error);
      const recovered = await runBlueprintFallbackGeneration({
        stage: "strategic_blueprint.briefing.fallback_single_generation",
        discussionId: input.discussion.id,
        path: "briefing",
        effectiveBundle,
        buildPrompt: () =>
          assembleStrategicBlueprintPrompt({
            bundle: effectiveBundle,
            discussion: input.discussion as unknown as Record<string, unknown>,
            opportunity: input.opportunity as unknown as Record<string, unknown>,
            briefing: input.briefing as unknown as Record<string, unknown>,
          }),
      });
      parsed = recovered.parsed;
      rawBlueprint = recovered.rawBlueprint;
    }
  } else {
    try {
      const prompt = buildAssetBlueprintPrompt({
        executiveContextPrompt: input.brainContextPrompt ?? "",
        productionSpecsPrompt: LEGACY_PRODUCTION_SPECS_PROMPT,
        discussion: input.discussion as unknown as Record<string, unknown>,
        opportunity: input.opportunity as unknown as Record<string, unknown>,
        briefing: input.briefing as unknown as Record<string, unknown>,
      });
      rawBlueprint = await generateBlueprintReview({
        stage: "strategic_blueprint.briefing.legacy",
        userPrompt: prompt,
      });
      parsed = parseJsonResponse(rawBlueprint);
    } catch (error) {
      throw new RegenerationBlueprintError(
        error instanceof Error
          ? error.message
          : "Legacy strategic blueprint generation failed",
      );
    }
  }

  const saved = await saveRegeneratedBlueprint({
    organizationId,
    userId: input.discussion.user_id ?? null,
    discussionId: input.discussion.id,
    opportunityId: input.opportunity.id,
    briefingId: input.briefing.id,
    parsed,
    rawBlueprint,
    source: "briefing",
    executiveMarketingStrategy:
      effectiveBundle?.executiveStrategy.marketingStrategy ?? null,
  });

  logRegenerationDiagnostic("STRATEGIC_BLUEPRINT_ID_SAVED", {
    discussionId: input.discussion.id,
    path: "briefing",
    blueprintId: saved.id,
    blueprintTitle: saved.asset_title,
    fallbackUsed: false,
  });

  return saved;
}

export async function createAssetBlueprintForDiscussionAnalysis(input: {
  discussion: Discussion;
  analysis: DiscussionAnalysis;
  brainContextPrompt?: string;
  generationBundle?: GenerationBundle;
}): Promise<AthenaAssetBlueprint> {
  const organizationId = input.discussion.organization_id ?? "";
  const effectiveBundle = await resolveBlueprintGenerationBundle({
    generationBundle: input.generationBundle,
    organizationId,
    discussionId: input.discussion.id,
  });

  let parsed: ParsedAssetBlueprint;
  let rawBlueprint: string;

  if (effectiveBundle) {
    try {
      const gated = await generateBlueprintWithQualityGate({
        stagePrefix: "strategic_blueprint.analysis",
        effectiveBundle,
        buildPrompt: (refinementSuffix) =>
          assembleStrategicBlueprintPrompt({
            bundle: effectiveBundle,
            discussion: input.discussion as unknown as Record<string, unknown>,
            analysis: input.analysis as unknown as Record<string, unknown>,
            qualityRefinementSuffix: refinementSuffix,
          }),
      });
      parsed = gated.parsed;
      rawBlueprint = gated.rawBlueprint;
    } catch (error) {
      console.error("Blueprint generation with quality gate failed:", error);
      const recovered = await runBlueprintFallbackGeneration({
        stage: "strategic_blueprint.analysis.fallback_single_generation",
        discussionId: input.discussion.id,
        path: "analysis",
        effectiveBundle,
        buildPrompt: () =>
          assembleStrategicBlueprintPrompt({
            bundle: effectiveBundle,
            discussion: input.discussion as unknown as Record<string, unknown>,
            analysis: input.analysis as unknown as Record<string, unknown>,
          }),
      });
      parsed = recovered.parsed;
      rawBlueprint = recovered.rawBlueprint;
    }
  } else {
    try {
      const prompt = buildAssetBlueprintFromAnalysisPrompt({
        executiveContextPrompt: input.brainContextPrompt ?? "",
        productionSpecsPrompt: LEGACY_PRODUCTION_SPECS_PROMPT,
        discussion: input.discussion as unknown as Record<string, unknown>,
        analysis: input.analysis as unknown as Record<string, unknown>,
      });
      rawBlueprint = await generateBlueprintReview({
        stage: "strategic_blueprint.analysis.legacy",
        userPrompt: prompt,
      });
      parsed = parseJsonResponse(rawBlueprint);
    } catch (error) {
      throw new RegenerationBlueprintError(
        error instanceof Error
          ? error.message
          : "Legacy strategic blueprint generation failed",
      );
    }
  }

  const saved = await saveRegeneratedBlueprint({
    organizationId,
    userId: input.discussion.user_id ?? null,
    discussionId: input.discussion.id,
    parsed,
    rawBlueprint,
    source: "discussion_analysis",
    executiveMarketingStrategy:
      effectiveBundle?.executiveStrategy.marketingStrategy ?? null,
  });

  logRegenerationDiagnostic("STRATEGIC_BLUEPRINT_ID_SAVED", {
    discussionId: input.discussion.id,
    path: "analysis",
    blueprintId: saved.id,
    blueprintTitle: saved.asset_title,
    fallbackUsed: false,
  });

  return saved;
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
  const selected = pickBestBlueprint(blueprints);
  const newest = sortBlueprintsByRecency(blueprints)[0] ?? null;

  logRegenerationDiagnostic("BLUEPRINT_DISPLAY_SELECTION", {
    context: "discussion_page",
    discussionId,
    organizationId,
    totalRows: blueprints.length,
    selectedBlueprintId: selected?.id ?? null,
    selectedCreatedAt: selected?.created_at ?? null,
    selectedUpdatedAt: selected?.updated_at ?? null,
    selectedAssetTitle: selected?.asset_title ?? null,
    newestBlueprintId: newest?.id ?? null,
    newestUpdatedAt: newest?.updated_at ?? null,
    isNewestRow: Boolean(selected && newest && selected.id === newest.id),
    selectionUsesPromptPriority: Boolean(
      selected && newest && selected.id !== newest.id,
    ),
    hasDebugMarker: hasBlueprintDebugMarker(selected?.notes),
    fallbackUsed: Boolean(
      selected && !hasBlueprintDebugMarker(selected.notes),
    ),
  });

  return selected;
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
