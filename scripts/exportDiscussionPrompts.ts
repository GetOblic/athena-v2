/**
 * Read-only export of exact LLM prompts for one discussion regeneration.
 * Run: npx tsx scripts/exportDiscussionPrompts.ts
 * Does not call the LLM — only assembles prompts and prints payload shape.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function loadEnvLocal() {
  try {
    const envPath = join(process.cwd(), ".env.local");
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env.local optional — caller may export vars manually.
  }
}

const SYSTEM_PROMPT =
  "You are Athena, an institutional intelligence analyst. Produce concise, professional business intelligence.";

const DEFAULT_ORG = "a0000000-0000-4000-8000-000000000001";

function buildOpenRouterPayload(label: string, userPrompt: string) {
  return {
    label,
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    requestBody: {
      model: process.env.OPENROUTER_MODEL ?? "(OPENROUTER_MODEL not set)",
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    },
    userPromptCharCount: userPrompt.length,
  };
}

async function main() {
  loadEnvLocal();

  const { buildAnalysisThreadBody } = await import("@/lib/discussionContent");
  const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
  const { buildDiscussionAnalysisPrompt } = await import(
    "@/services/ai/prompts/discussionAnalysisPrompt"
  );
  const { resolveGenerationBundle } = await import(
    "@/services/brain/generationContractService"
  );
  const {
    assembleDiscussionAnalysisPrompt,
    assembleExecutiveBriefingPrompt,
    assembleStrategicBlueprintPrompt,
  } = await import("@/services/brain/generationContracts/generationPromptAssembly");
  const { getDiscussionUpdatesByDiscussionId } = await import(
    "@/services/discussionUpdateService"
  );
  const { getDiscussionById } = await import("@/services/discussionService");

  const { data: discussions } = await supabaseAdmin
    .from("discussions")
    .select("id, organization_id, title")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (!discussions?.[0]) {
    throw new Error("No discussions found for export.");
  }

  const discussionId = discussions[0].id;
  const organizationId = discussions[0].organization_id ?? DEFAULT_ORG;
  const discussion = await getDiscussionById(discussionId, organizationId);

  if (!discussion) {
    throw new Error(`Discussion not found: ${discussionId}`);
  }

  const threadUpdates = await getDiscussionUpdatesByDiscussionId(
    discussionId,
    organizationId,
  );
  const analysisDiscussion = {
    ...discussion,
    body: buildAnalysisThreadBody(discussion, threadUpdates),
  };

  const exportDoc = {
    meta: {
      discussionId,
      organizationId,
      discussionTitle: discussion.title,
      exportedAt: new Date().toISOString(),
      workflow: "processDiscussionEndToEnd (services/workflows/discussionWorkflow.ts)",
      note: "Quality gate may retry each call up to 2 times with refinement suffix appended to context.",
    },
    transport: {
      entry: "generateReview(prompt) — services/aiService.ts",
      http: "callOpenRouter(messages) — lib/openrouter.ts",
      method: "POST",
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
    },
    assemblyChain: {
      "1_discussion_analysis": {
        trigger: "Always (first LLM call in regeneration)",
        assembler: "assembleDiscussionAnalysisPrompt",
        file: "services/brain/generationContracts/generationPromptAssembly.ts",
        steps: [
          "buildExecutiveContext(bundle)",
          "  → formatReasoningPipelineForPrompt (services/brain/reasoningPipeline/reasoningPipelinePromptFormatting.ts)",
          "  → assembleExecutiveGenerationContextBlock (services/brain/generationContracts/contractPromptFormatting.ts)",
          "buildDiscussionAnalysisPrompt(discussion, executiveContextBlock)",
          "  → services/ai/prompts/discussionAnalysisPrompt.ts",
        ],
      },
      "2_executive_briefing": {
        trigger: "Only if opportunity_detected=true after call 1",
        assembler: "assembleExecutiveBriefingPrompt",
        file: "services/brain/generationContracts/generationPromptAssembly.ts",
        steps: [
          "buildOpportunityReviewPrompt(opportunity) — services/ai/prompts/opportunityReviewPrompt.ts",
          "Append === ATHENA EXECUTIVE GENERATION CONTEXT === + buildExecutiveContext(bundle)",
        ],
      },
      "3_strategic_blueprint": {
        trigger: "Always after analysis; uses opportunity+briefing path when opportunity detected",
        assembler: "assembleStrategicBlueprintPrompt",
        file: "services/brain/generationContracts/generationPromptAssembly.ts",
        steps: [
          "buildExecutiveContext(bundle)",
          "buildStrategicBlueprintProductionContext + formatStrategicBlueprintProductionSpecsForPrompt",
          "resolveAssetStandard + formatExecutiveAssetStandardForPrompt",
          "buildAssetBlueprintFromAnalysisPrompt OR buildAssetBlueprintPrompt — services/assetBlueprints/prompts/assetBlueprintPrompt.ts",
        ],
      },
    },
    llmCalls: [] as ReturnType<typeof buildOpenRouterPayload>[],
  };

  const analysisBundle = await resolveGenerationBundle({
    workflowType: "discussion_analysis",
    organizationId,
    discussionId,
  });

  if (analysisBundle) {
    const prompt = assembleDiscussionAnalysisPrompt({
      bundle: analysisBundle,
      discussion: analysisDiscussion,
    });
    exportDoc.llmCalls.push(buildOpenRouterPayload("1_discussion_analysis", prompt));
  } else {
    const prompt = buildDiscussionAnalysisPrompt(analysisDiscussion, "");
    exportDoc.llmCalls.push(
      buildOpenRouterPayload("1_discussion_analysis_legacy", prompt),
    );
  }

  const briefingBundle = await resolveGenerationBundle({
    workflowType: "executive_briefing",
    organizationId,
    discussionId,
  });

  if (briefingBundle) {
    const opportunityPreview = {
      id: "00000000-0000-4000-8000-000000000099",
      organization_id: organizationId,
      discussion_id: discussionId,
      title: discussion.title,
      reason: "Prompt export — uses live opportunity fields at runtime",
      score: 75,
      status: "draft",
    };
    const prompt = assembleExecutiveBriefingPrompt({
      bundle: briefingBundle,
      opportunity: opportunityPreview as never,
    });
    exportDoc.llmCalls.push(buildOpenRouterPayload("2_executive_briefing", prompt));
  }

  const blueprintBundle = await resolveGenerationBundle({
    workflowType: "strategic_blueprint",
    organizationId,
    discussionId,
  });

  if (blueprintBundle) {
    const prompt = assembleStrategicBlueprintPrompt({
      bundle: blueprintBundle,
      discussion: analysisDiscussion as unknown as Record<string, unknown>,
      analysis: { summary: "[prior analysis record inserted at runtime]" },
    });
    exportDoc.llmCalls.push(
      buildOpenRouterPayload("3_strategic_blueprint_no_opportunity_path", prompt),
    );
  }

  const outPath = join(process.cwd(), "tmp-discussion-prompt-export.json");
  writeFileSync(outPath, JSON.stringify(exportDoc, null, 2));

  console.log(`Exported ${exportDoc.llmCalls.length} LLM payload(s) for discussion ${discussionId}`);
  console.log(`Title: ${discussion.title}`);
  console.log(`Written to: ${outPath}`);
  for (const call of exportDoc.llmCalls) {
    console.log(`- ${call.label}: ${call.userPromptCharCount} user chars`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
